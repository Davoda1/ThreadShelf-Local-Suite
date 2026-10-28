#!/usr/bin/env python3
"""Stream pinned source tarballs into independent ZIP source-collection parts.

Does not execute source, hooks or patches. All input members are inspected and
recorded before a part is accepted. Patches are verified separately after the
complete assembly inventory exists. A failed part is discarded and its database
transaction rolled back; earlier accepted parts are never overwritten.
"""
import argparse,gzip,hashlib,io,json,os,posixpath,re,shutil,sqlite3,tarfile,time,urllib.request,urllib.parse,zipfile
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parent
class SourceError(ValueError): pass
def safe_rel(s):
 if not s or re.match(r'^[A-Za-z]:',s) or s.startswith('/') or '\\' in s or '\0' in s or any(x=='..' for x in s.split('/')): raise SourceError('Unsafe source path '+repr(s))
 s=posixpath.normpath(s)
 if s in ('','.'): raise SourceError('Empty source path')
 return s
class Tee:
 def __init__(self,source,dest,storage,max_bytes,reserve):
  self.source=source; self.dest=dest; self.storage=storage; self.max_bytes=max_bytes; self.reserve=reserve; self.size=0; self.hash=hashlib.sha256(); self.next_report=64*1024**2
 def read(self,n=-1):
  if n<0: n=1024**2
  b=self.source.read(n)
  if b:
   if self.size+len(b)>self.max_bytes: raise SourceError('Archive exceeds size limit')
   if shutil.disk_usage(self.storage).free-len(b)<self.reserve: raise SourceError('Free-space reserve reached')
   self.dest.write(b); self.hash.update(b); self.size+=len(b)
   if self.size>=self.next_report:
    print(json.dumps({'compressed_bytes':self.size,'free_bytes':shutil.disk_usage(self.storage).free}),flush=True); self.next_report+=64*1024**2
  return b
 def readable(self): return True
class Inventory:
 def __init__(self,file):
  self.db=sqlite3.connect(file); self.db.execute('PRAGMA journal_mode=DELETE'); self.db.execute('PRAGMA synchronous=FULL')
  self.db.execute('CREATE TABLE IF NOT EXISTS entries(path TEXT PRIMARY KEY,kind TEXT NOT NULL,link TEXT,mode INTEGER NOT NULL,size INTEGER NOT NULL,sha256 TEXT,source TEXT NOT NULL)')
  self.db.execute('CREATE TABLE IF NOT EXISTS archives(name TEXT PRIMARY KEY,part TEXT NOT NULL,record TEXT NOT NULL)'); self.db.commit()
 def add(self,path,kind,link,mode,size,digest,source):
  path=safe_rel(path)
  parts=path.split('/')
  for n in range(1,len(parts)):
   parent='/'.join(parts[:n]); row=self.db.execute('SELECT kind FROM entries WHERE path=?',(parent,)).fetchone()
   if row and row[0]!='dir': raise SourceError('Non-directory ancestor '+parent)
   if not row: self.db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?,?)',(parent,'dir',None,0,0,None,'implicit'))
  prior=self.db.execute('SELECT kind FROM entries WHERE path=?',(path,)).fetchone()
  if prior:
   if kind=='dir' and prior[0]=='dir': return
   raise SourceError('Overlapping source path '+path)
  if kind=='symlink':
   if not link or posixpath.isabs(link) or '\\' in link or '\0' in link: raise SourceError('Unsafe symlink '+path)
   dest=posixpath.normpath(posixpath.join(posixpath.dirname(path),link))
   if dest=='..' or dest.startswith('../') or dest.startswith('/'): raise SourceError('Escaping symlink '+path)
  self.db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?,?)',(path,kind,link,mode,size,digest,source))
 def close(self): self.db.close()
def safe_output(root,path):
 target=root/safe_rel(path)
 if not target.resolve().is_relative_to(root.resolve()): raise SourceError('Sparse output escapes root')
 current=target
 while current!=root:
  if current.is_symlink(): raise SourceError('Sparse output symlink')
  current=current.parent
 return target
def is_metadata(path):
 name=PurePosixPath(path).name
 return name in ('.gitmodules','DEPS','README.chromium') or name.upper().startswith(('LICENSE','COPYING','NOTICE','COPYRIGHT'))
def stream_archive(row,zf,inventory,required,sparse,written,storage,max_bytes,reserve):
 name=row['archive']; member_name='archives/'+safe_rel(name)
 if inventory.db.execute('SELECT 1 FROM archives WHERE name=?',(name,)).fetchone(): raise SourceError('Archive already accepted '+name)
 u=urllib.parse.urlsplit(row['archive_url'])
 if u.scheme!='https' or u.username or u.password: raise SourceError('Credential-free HTTPS required')
 if row.get('local_file'):
  source=Path(row['local_file']).open('rb'); length=Path(row['local_file']).stat().st_size
 else:
  request=urllib.request.Request(row['archive_url'],headers={'User-Agent':'ThreadShelf-Local-Suite-source-companion/1.3.0'})
  source=urllib.request.urlopen(request,timeout=90); length=source.headers.get('Content-Length'); length=int(length) if length else None
 prefix=row.get('archive_prefix',''); path=safe_rel(row['path']); count=regular=unpacked=0; touched=[]
 started=time.time(); print(json.dumps({'start':path,'url':row['archive_url'],'part':Path(zf.filename).name}),flush=True)
 try:
  with zf.open(member_name,'w',force_zip64=True) as destination:
   tee=Tee(source,destination,storage,max_bytes,reserve)
   with gzip.GzipFile(fileobj=tee,mode='rb') as uncompressed:
    with tarfile.open(fileobj=uncompressed,mode='r|') as archive:
     for member in archive:
      raw=member.name
      while raw.startswith('./'): raw=raw[2:]
      if prefix:
       if raw.rstrip('/')==prefix.rstrip('/'):
        if not member.isdir(): raise SourceError('Non-directory repository wrapper')
        continue
       if not raw.startswith(prefix): raise SourceError('Unexpected archive prefix '+raw)
       raw=raw[len(prefix):]
      if not raw or raw=='.': continue
      target=safe_rel(path+'/'+safe_rel(raw)); count+=1
      if member.isdir(): inventory.add(target,'dir',None,member.mode,0,None,name); continue
      if member.issym(): inventory.add(target,'symlink',member.linkname,member.mode,0,None,name); continue
      if not member.isfile(): raise SourceError('Unsupported source member '+target)
      digest=hashlib.sha256(); file_size=0; output=None; metadata_output=None
      if target in required:
       file=safe_output(sparse,target)
       if file.exists() or file.is_symlink(): raise SourceError('Sparse source collision '+target)
       file.parent.mkdir(parents=True,exist_ok=True); output=file.open('xb'); written.append(file); touched.append(target)
      if is_metadata(target):
       if member.size>10*1024**2: raise SourceError('Unexpectedly large source metadata')
       meta=safe_output(ROOT/'retained-metadata',target); meta.parent.mkdir(parents=True,exist_ok=True)
       if meta.exists(): raise SourceError('Metadata collision '+target)
       metadata_output=meta.open('xb'); written.append(meta)
      try:
       with archive.extractfile(member) as content:
        for block in iter(lambda:content.read(1024**2),b''):
         digest.update(block); file_size+=len(block)
         if output: output.write(block)
         if metadata_output: metadata_output.write(block)
      finally:
       if metadata_output: metadata_output.close()
       if output: output.close(); file.chmod(0o755 if member.mode&0o111 else 0o644)
      if file_size!=member.size: raise SourceError('Truncated member '+target)
      inventory.add(target,'file',None,member.mode,file_size,digest.hexdigest(),name); regular+=1; unpacked+=file_size
     # tarfile buffers beyond its end marker; inspect buffered bytes too.
     for tail in iter(lambda:archive.fileobj.read(1024**2),b''):
      if any(tail): raise SourceError('Nonzero buffered data after tar end')
    # Validate the gzip CRC and reject hidden non-padding bytes after the tar end.
    for tail in iter(lambda:uncompressed.read(1024**2),b''):
     if any(tail): raise SourceError('Nonzero data after tar end')
   if length is not None and tee.size!=length: raise SourceError('Truncated HTTP archive')
   sha=tee.hash.hexdigest()
   if row.get('expected_sha256') and sha!=row['expected_sha256']: raise SourceError('Pinned source digest mismatch')
  record={**{k:v for k,v in row.items() if k!='local_file'},'size':tee.size,'sha256':sha,'member_count':count,'regular_files':regular,'unpacked_member_bytes':unpacked,'patch_paths_retained':touched,'elapsed_seconds':round(time.time()-started,3)}
  inventory.db.execute('INSERT INTO archives VALUES(?,?,?)',(name,Path(zf.filename).name,json.dumps(record)))
  print(json.dumps({'complete':path,'size':tee.size,'sha256':sha,'members':count,'patch_paths':len(touched)}),flush=True)
  return record
 finally: source.close()
def main():
 ap=argparse.ArgumentParser(description=__doc__); ap.add_argument('--plan',type=Path,required=True); ap.add_argument('--part',required=True); ap.add_argument('--max-part-gib',type=float,default=1.75); ap.add_argument('--reserve-mib',type=float,default=500); args=ap.parse_args()
 output=ROOT/'parts'; output.mkdir(exist_ok=True); sparse=ROOT/'sparse-source'; sparse.mkdir(exist_ok=True)
 if safe_rel(args.part)!=args.part or '/' in args.part: raise SourceError('Part must be one safe filename')
 target=output/args.part
 if target.exists(): raise SourceError('Refusing to overwrite part')
 plan=json.loads(args.plan.read_text()); required=set(json.loads((ROOT/'patch-inputs/REQUIRED-SOURCE-PATHS.json').read_text()))
 inventory=Inventory(ROOT/'assembly-inventory.sqlite'); written=[]; records=[]; max_bytes=int(args.max_part_gib*1024**3); reserve=int(args.reserve_mib*1024**2)
 committed=False
 inventory.db.execute('BEGIN IMMEDIATE')
 try:
  with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_STORED,allowZip64=True) as zf:
   for row in plan:
    remaining=max_bytes-target.stat().st_size
    if remaining<=0: raise SourceError('Part exceeds limit')
    records.append(stream_archive(row,zf,inventory,required,sparse,written,output,remaining,reserve))
   zf.writestr('PART-MANIFEST.json',json.dumps({'status':'source-part-verified-collection-incomplete','part':args.part,'sources':records},indent=2)+'\n')
  # ZIP verifies preserved member CRCs without a second retained copy.
  with zipfile.ZipFile(target) as zf:
   if zf.testzip() is not None: raise SourceError('ZIP CRC mismatch')
  if target.stat().st_size>max_bytes: raise SourceError('Complete ZIP part exceeds limit')
  with target.open('rb') as verified_part: sha=hashlib.file_digest(verified_part,'sha256').hexdigest()
  report={'part':args.part,'bytes':target.stat().st_size,'sha256':sha,'source_count':len(records),'sources':records,'scope':'Every input tar member validated; all regular bytes hashed; source collection still incomplete until final assembly, supplemental and patch gates.'}
  target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
  inventory.db.commit(); committed=True
  print(json.dumps({'part_verified':args.part,'bytes':report['bytes'],'sha256':sha}),flush=True)
 except BaseException:
  if committed: raise
  inventory.db.rollback()
  for file in reversed(written): file.unlink(missing_ok=True)
  target.unlink(missing_ok=True); target.with_suffix('.json').unlink(missing_ok=True)
  raise
 finally: inventory.close()
if __name__=='__main__': main()
