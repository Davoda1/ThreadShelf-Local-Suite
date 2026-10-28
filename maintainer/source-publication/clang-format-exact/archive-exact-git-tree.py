#!/usr/bin/env python3
"""Archive every pinned Git tree/blob byte after an exact official shallow fetch."""
import gzip,hashlib,io,json,os,pathlib,subprocess,tarfile
R=pathlib.Path(__file__).resolve().parent;S=pathlib.Path('/tmp/threadshelf-source-staging/clang-format-exact');G=S/'repository.git'
REPO='https://chromium.googlesource.com/external/github.com/llvm/llvm-project/clang/tools/clang-format.git';REV='9f796802e5d633c96dbe97e0b6683d5e62594f9f'
env={**os.environ,'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_NO_REPLACE_OBJECTS':'1','GIT_TERMINAL_PROMPT':'0'}
def git(*args):return subprocess.check_output(['git','-C',str(G),'-c','credential.helper=','-c','core.hooksPath=/dev/null',*args],env=env)
def oid(kind,data):return hashlib.sha1(kind.encode()+b' '+str(len(data)).encode()+b'\0'+data).hexdigest()
def desc(name,data):
 p=R/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);return {'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
commit=git('cat-file','commit',REV);assert oid('commit',commit)==REV
root=commit.splitlines()[0].decode().removeprefix('tree ');assert len(root)==40
raw_commit=desc('commit.raw',commit)
objects=[];files=[];dirs=[]
def walk(tree,path=''):
 raw=git('cat-file','tree',tree);assert oid('tree',raw)==tree
 obj={'path':path,'gitTree':tree,'rawObject':desc('git-trees/'+tree+'.raw',raw),'entries':[]};objects.append(obj);i=0
 while i<len(raw):
  space=raw.index(b' ',i);nul=raw.index(b'\0',space);mode=raw[i:space].decode();name=raw[space+1:nul].decode();child=raw[nul+1:nul+21].hex();i=nul+21
  assert '/' not in name and name not in ['.','..'] and '\\' not in name and '\0' not in name
  full=(path+'/' if path else '')+name;obj['entries'].append({'mode':mode,'name':name,'object':child})
  if mode=='40000':dirs.append(full);walk(child,full)
  else:
   assert mode in ['100644','100755','120000'];data=git('cat-file','blob',child);assert oid('blob',data)==child
   files.append({'path':full,'gitMode':mode,'gitBlob':child,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'data':data})
 assert i==len(raw)
walk(root)
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w',format=tarfile.PAX_FORMAT) as t:
 for name in sorted(dirs):
  x=tarfile.TarInfo(name);x.type=tarfile.DIRTYPE;x.mode=0o755;x.mtime=0;t.addfile(x)
 for row in sorted(files,key=lambda x:x['path']):
  x=tarfile.TarInfo(row['path']);x.mode=int(row['gitMode'],8)&0o777;x.mtime=0
  if row['gitMode']=='120000':x.type=tarfile.SYMTYPE;x.linkname=row['data'].decode();t.addfile(x)
  else:x.size=row['bytes'];t.addfile(x,io.BytesIO(row['data']))
archive=S/('clang-format-'+REV+'.tar.gz');archive.write_bytes(gzip.compress(buffer.getvalue(),compresslevel=9,mtime=0));data=archive.read_bytes()
# Independently reopen the actual final archive and compare every material file
# to the pinned object-derived file table; no export-ignore/export-subst rules.
seen={}
with tarfile.open(archive,'r:gz') as t:
 for x in t:
  if x.isdir():continue
  assert x.isfile();content=t.extractfile(x).read();seen[x.name]={'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest(),'gitBlob':oid('blob',content),'mode':x.mode}
for row in files:assert seen.pop(row['path'])=={'bytes':row['bytes'],'sha256':row['sha256'],'gitBlob':row['gitBlob'],'mode':int(row['gitMode'],8)&0o777}
assert not seen
advertisement=git('ls-remote',REPO);assert (REV+'\tHEAD').encode() in advertisement and (REV+'\trefs/heads/main').encode() in advertisement
ad=desc('remote-ref-advertisement.txt',advertisement)
report={'schemaVersion':1,'passed':True,'repository':REPO,'revision':REV,'retrieval_method':'git-smart-http-exact-revision','officialEndpoint':REPO,'refAdvertisement':ad,'rawCommit':raw_commit,'commitGitObjectSha1':REV,'rootTree':root,'treeObjects':objects,'files':[{k:v for k,v in row.items() if k!='data'} for row in sorted(files,key=lambda x:x['path'])],'archive':{'file':str(archive),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'prefix':''},'scope':'Every original Git blob and mode from the exact pinned commit is retained. Commit and all tree/blob object identities were independently recomputed from raw bytes. Gitiles web endpoints returned404 while official Git smartHTTP advertised and supplied this exact commit; no fallback revision or export filtering was used.','fileCount':len(files),'treeCount':len(objects),'regularFileBytes':sum(r['bytes'] for r in files)}
(R/'EXACT-GIT-SOURCE-PROOF.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['passed','revision','rootTree','fileCount','treeCount','regularFileBytes','archive']},indent=2))
