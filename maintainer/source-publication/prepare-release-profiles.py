#!/usr/bin/env python3
"""Retain exact pinned release build data in a deterministic small gzip tar.

Network bytes are streamed, checked against every upstream SHA256 and size, and
never retained as a second uncompressed copy. No downloaded program is executed.
"""
import argparse,gzip,hashlib,io,json,os,shutil,tarfile,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent
class ProfileError(ValueError):pass
class CheckedWriter:
 def __init__(self,f,path,reserve):self.f=f;self.path=path;self.reserve=reserve
 def write(self,b):
  if shutil.disk_usage(self.path).free-len(b)<self.reserve:raise ProfileError('Storage reserve reached')
  return self.f.write(b)
 def flush(self):return self.f.flush()
class SourceReader:
 def __init__(self,r):self.r=r;self.size=0;self.hash=hashlib.sha256()
 def read(self,n=-1):
  b=self.r.read(n);self.size+=len(b);self.hash.update(b);return b
 def finish(self,row):
  if self.r.read(1) or self.size!=row['bytes'] or self.hash.hexdigest()!=row['expected_sha256']:raise ProfileError('Profile source bytes mismatch '+row['file'])
def build(inputs,out,reserve=500*1024**2):
 if out.exists():raise ProfileError('Refusing to overwrite archive')
 if len(inputs)!=3 or len({x['file'] for x in inputs})!=3:raise ProfileError('Expected three distinct profiles')
 out.parent.mkdir(parents=True,exist_ok=True);records=[]
 try:
  with out.open('xb') as raw:
   with gzip.GzipFile(filename='',mode='wb',fileobj=CheckedWriter(raw,out.parent,reserve),mtime=0,compresslevel=6) as compressed:
    with tarfile.open(fileobj=compressed,mode='w|',format=tarfile.PAX_FORMAT) as archive:
     for row in inputs:
      if not row['url'].startswith('https://dev-cdn-experimental.electronjs.org/pgo/') or '/' in row['file'] or row['bytes']<=0:raise ProfileError('Unreviewed profile source')
      name='electron-v8-builtins.profile' if row['file'].endswith('.profile') else row['file']
      member=tarfile.TarInfo(name);member.size=row['bytes'];member.mode=0o644;member.mtime=0
      print(json.dumps({'start':row['file'],'bytes':row['bytes']}),flush=True)
      with urllib.request.urlopen(row['url'],timeout=90) as response:
       if response.headers.get('Content-Length') and int(response.headers['Content-Length'])!=row['bytes']:raise ProfileError('Profile HTTP length mismatch')
       source=SourceReader(response);archive.addfile(member,source);source.finish(row)
      records.append({**row,'archive_member':name,'size':row['bytes'],'sha256':row['expected_sha256']})
      print(json.dumps({'verified':row['file'],'sha256':row['expected_sha256']}),flush=True)
      if name=='electron-v8-builtins.profile':
       marker=(row['file']+'\n').encode();m=tarfile.TarInfo(name+'.version');m.size=len(marker);m.mode=0o644;m.mtime=0;archive.addfile(m,io.BytesIO(marker));records.append({'archive_member':m.name,'size':m.size,'sha256':hashlib.sha256(marker).hexdigest(),'derivation':'Exact upstream download-profiles.py writes original CDN filename plus newline.'})
  with out.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
  actual=[]
  with tarfile.open(out,'r:gz') as archive:
   for member in archive:
    if not member.isfile():raise ProfileError('Unexpected normalized profile member')
    with archive.extractfile(member) as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    actual.append({'archive_member':member.name,'size':member.size,'sha256':digest})
  if actual!=[{k:r[k] for k in ('archive_member','size','sha256')} for r in records]:raise ProfileError('Profile tar round-trip mismatch')
  record={'path':'src/electron/build/pgo_profiles','archive':out.name,'archive_prefix':'','archive_url':'https://github.com/electron/electron/tree/45d20ec03000aac41e73b2abdb707936b4f98ed0/build/pgo_profiles','repository':'https://github.com/electron/electron.git','revision':'45d20ec03000aac41e73b2abdb707936b4f98ed0','role':'verified-release-optimization-profiles','local_file':str(out.resolve()),'expected_sha256':sha,'size':out.stat().st_size,'source_files':records,'representation':'Deterministic tar.gz of unchanged pinned upstream profile bytes plus the upstream downloader version marker; compiler executables excluded.'}
  return record
 except BaseException:
  out.unlink(missing_ok=True);raise
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--inputs',type=Path,default=ROOT/'release-profile-inputs.json');ap.add_argument('--output',type=Path,required=True);ap.add_argument('--report',type=Path,required=True);args=ap.parse_args()
 record=build(json.loads(args.inputs.read_text()),args.output);args.report.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'archive':record['archive'],'bytes':record['size'],'sha256':record['expected_sha256']}))
