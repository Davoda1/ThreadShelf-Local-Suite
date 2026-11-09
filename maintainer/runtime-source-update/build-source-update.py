#!/usr/bin/env python3
"""Build the hash-pinned runtime source update (Python 3.10+).
Copyright (c) 2026 davoda1. MIT. Downloads source/build inputs only.
"""
from __future__ import annotations
import argparse, binascii, concurrent.futures, hashlib, io, json, os, re, shutil, struct, sys, tarfile, tempfile, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent

class StoredGzip:
    """Deterministic RFC 1952 stream using uncompressed RFC 1951 blocks.

    Payloads already contain compressed source archives. Fixed 65,535-byte
    blocks avoid differing zlib encoders changing the release asset digest.
    """
    BLOCK=65535
    def __init__(self,raw):
        self.raw=raw;self.pending=bytearray();self.crc=0;self.size=0;self.closed=False
        self.raw.write(bytes.fromhex('1f8b08000000000000ff'))
    def __enter__(self):return self
    def __exit__(self,typ,value,traceback):self.close()
    def block(self,data,final):
        size=len(data)
        self.raw.write(bytes([1 if final else 0])+struct.pack('<HH',size,size^0xffff))
        self.raw.write(data)
    def write(self,data):
        if self.closed:raise ValueError('Write to closed gzip stream')
        self.crc=binascii.crc32(data,self.crc);self.size=(self.size+len(data))&0xffffffff
        self.pending.extend(data)
        while len(self.pending)>=self.BLOCK:
            self.block(self.pending[:self.BLOCK],False);del self.pending[:self.BLOCK]
        return len(data)
    def close(self):
        if self.closed:return
        self.block(self.pending,True);self.pending.clear()
        self.raw.write(struct.pack('<II',self.crc&0xffffffff,self.size));self.closed=True

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def verify(path,row):
    if path.is_symlink() or not path.is_file() or path.stat().st_size!=row['size'] or digest(path)!=row['sha256']:raise ValueError('Missing or changed source input: '+row['file'])

def filename(name):
    if not isinstance(name,str) or not name or name in ('.','..') or any(c in name for c in '/\\:\0\r\n'): raise ValueError('Unsafe source filename')
    return name

def obtain(row,cache):
    path=cache/filename(row['file'])
    if path.exists():verify(path,row);return path
    print('Downloading '+row['file'],file=sys.stderr)
    if not row['url'].startswith(('https://codeload.github.com/','https://dev-cdn-experimental.electronjs.org/pgo/')):raise ValueError('Unexpected source host')
    fd,temporary=tempfile.mkstemp(prefix='.source-input-',dir=cache);temp=Path(temporary)
    try:
        with os.fdopen(fd,'wb') as out,urllib.request.urlopen(row['url'],timeout=180) as src:shutil.copyfileobj(src,out,1024*1024)
        verify(temp,row);temp.replace(path);return path
    finally:temp.unlink(missing_ok=True)

def build(out,version,cache,record=False):
    m=json.loads((ROOT/'manifest.json').read_text())
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',version) or version!=m['suite_version'] or m['schema_version']!=1:raise ValueError('Source update version mismatch')
    cache.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
    local={}
    for row in m['payloads']:
        rel=row['file']
        if not isinstance(rel,str) or rel.startswith('/') or any(c in rel for c in '\\:\0\r\n') or any(x in ('..','.','') for x in rel.split('/')) or rel in local:raise ValueError('Unsafe or repeated source payload')
        p=ROOT/rel
        if not p.resolve().is_relative_to(ROOT.resolve()):raise ValueError('Source payload escapes collection')
        verify(p,row);local[rel]=p
    names=[filename(row['file']) for row in m['downloads']]
    if len(names)!=len(set(names)):raise ValueError('Repeated source download')
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        paths=list(pool.map(lambda r:obtain(r,cache),m['downloads']))
    local.update({'inputs/'+r['file']:p for r,p in zip(m['downloads'],paths)})
    for name in ('manifest.json','update-runtime-sources.py','assemble-base-sources.py','README.md'):local[name]=ROOT/name
    name=f'ThreadShelf-Local-Suite-{version}-Runtime-Source-Update.tar.gz';target=out/name
    with target.open('wb') as raw,StoredGzip(raw) as gz,tarfile.open(fileobj=gz,mode='w|',format=tarfile.PAX_FORMAT) as archive:
        for rel,p in sorted(local.items()):
            if p.is_symlink() or not p.is_file() or any(x in ('..','') for x in rel.split('/')):raise ValueError('Unsafe source payload')
            info=tarfile.TarInfo('runtime-source-update/'+rel);info.size=p.stat().st_size;info.mode=0o644;info.mtime=0
            with p.open('rb') as src:archive.addfile(info,src)
    receipt={'schema':'threadshelf-runtime-source-update-v1','version':version,'electron':m['electron_version'],'file_name':name,'bytes':target.stat().st_size,'sha256':digest(target),'manifest_sha256':digest(ROOT/'manifest.json'),'verified':True}
    integrity=ROOT/'asset-integrity.json'
    if record:integrity.write_text(json.dumps(receipt,indent=2)+'\n')
    elif json.loads(integrity.read_text())!=receipt:raise ValueError('Source update bytes differ from locally validated artifact')
    return receipt

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True,type=Path);p.add_argument('--version',required=True);p.add_argument('--cache-dir',type=Path);p.add_argument('--record-integrity',action='store_true');a=p.parse_args()
    if a.cache_dir:result=build(a.out,a.version,a.cache_dir,a.record_integrity)
    else:
        with tempfile.TemporaryDirectory(prefix='threadshelf-source-download-') as temp:result=build(a.out,a.version,Path(temp),a.record_integrity)
    print(json.dumps(result))
if __name__=='__main__':main()
