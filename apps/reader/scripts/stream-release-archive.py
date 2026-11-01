#!/usr/bin/env python3
"""Bounded-memory release ZIP creation with complete-entry and final-file checks."""
import argparse, gzip, hashlib, json, os, stat, tarfile, tempfile, time, zipfile
from pathlib import Path, PurePosixPath

BLOCK=1024*1024

def digest(path):
    value=hashlib.sha256();size=0
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(BLOCK),b''):value.update(block);size+=len(block)
    return size,value.hexdigest()

def safe_relative(value,allow_empty=False):
    if allow_empty and value=='':return
    parsed=PurePosixPath(value)
    if not isinstance(value,str) or not value or value=='.' or '\x00' in value or parsed.is_absolute() or '..' in parsed.parts or '\\' in value or parsed.as_posix()!=value:
        raise ValueError('Unsafe or noncanonical archive path')

def checked_file(source,relative):
    safe_relative(relative)
    path=source/relative
    if any((source/Path(*PurePosixPath(relative).parts[:i])).is_symlink() for i in range(1,len(PurePosixPath(relative).parts))):raise ValueError('Archive source has a symlink parent')
    if path.is_symlink() or not path.is_file():raise ValueError(f'Archive entry must be a regular file: {relative}')
    return path

def snapshot_inputs(source, prefix, files, strip_setuid=False):
    """Freeze expected bytes and modes before any output is created."""
    safe_relative(prefix,True)
    expected={}
    for relative in files:
        path=checked_file(source,relative)
        name=(PurePosixPath(prefix)/relative).as_posix() if prefix else relative
        if name in expected:raise ValueError('Duplicate archive entry')
        before=path.stat();size,sha=digest(path);after=path.stat()
        if (before.st_size,before.st_mtime_ns,stat.S_IMODE(before.st_mode)) != (after.st_size,after.st_mtime_ns,stat.S_IMODE(after.st_mode)) or size!=before.st_size:
            raise ValueError(f'Input changed during snapshot: {relative}')
        mode=stat.S_IMODE(before.st_mode)
        if strip_setuid:mode &= ~0o6000
        expected[name]=(size,sha,mode)
    return expected

def snapshot_hash(expected):
    return hashlib.sha256(json.dumps(expected,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def make_zip(source,destination,prefix,files):
    safe_relative(prefix,True)
    source=source.resolve();destination=destination.resolve()
    destination.parent.mkdir(parents=True,exist_ok=True)
    frozen=snapshot_inputs(source,prefix,files)
    expected={}
    handle,tmp=tempfile.mkstemp(prefix='.release-zip-',suffix='.tmp',dir=destination.parent)
    os.close(handle);temporary=Path(tmp)
    try:
        with temporary.open('wb') as output:
            with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
                for relative in files:
                    parsed=PurePosixPath(relative)
                    if parsed.is_absolute() or '..' in parsed.parts or '\\' in relative:raise ValueError('Unsafe source ZIP entry')
                    path=checked_file(source,relative)
                    name=(PurePosixPath(prefix)/parsed).as_posix() if prefix else relative
                    if name in expected:raise ValueError('Duplicate ZIP entry')
                    metadata=path.stat();info=zipfile.ZipInfo(name,time.localtime(metadata.st_mtime)[:6]);info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=(stat.S_IFREG|stat.S_IMODE(metadata.st_mode))<<16
                    info.file_size=metadata.st_size;value=hashlib.sha256();size=0
                    with path.open('rb') as inp,archive.open(info,'w',force_zip64=metadata.st_size>=2**31) as entry:
                        for block in iter(lambda:inp.read(BLOCK),b''):entry.write(block);value.update(block);size+=len(block)
                    if size!=metadata.st_size:raise ValueError(f'File changed while archiving: {relative}')
                    if (size,value.hexdigest(),stat.S_IMODE(metadata.st_mode))!=frozen[name]:raise ValueError(f'Input differs from frozen snapshot: {relative}')
                    expected[name]=(size,value.hexdigest(),info.external_attr)
            output.flush();os.fsync(output.fileno())
        with zipfile.ZipFile(temporary) as archive:
            if len(archive.infolist())!=len(expected) or set(archive.namelist())!=set(expected):raise ValueError('Incomplete ZIP central directory')
            for entry in archive.infolist():
                value=hashlib.sha256();size=0
                with archive.open(entry) as content:
                    for block in iter(lambda:content.read(BLOCK),b''):value.update(block);size+=len(block)
                if (size,value.hexdigest(),entry.external_attr)!=expected[entry.filename]:raise ValueError(f'ZIP content mismatch: {entry.filename}')
        complete=digest(temporary)
        # Keep the verified temporary until destination bytes are independently
        # verified; this also handles managed filesystems whose rename is a copy.
        with temporary.open('rb') as inp,destination.open('wb') as output:
            for block in iter(lambda:inp.read(BLOCK),b''):output.write(block)
            output.flush();os.fsync(output.fileno())
        if digest(destination)!=complete:raise ValueError('Final ZIP file differs from its verified complete output')
        print(json.dumps({'file':destination.name,'entries':len(expected),'bytes':complete[0],'sha256':complete[1],'inputSnapshotSha256':snapshot_hash(frozen),'inputSnapshotBeforeWrite':True,'entrySHA256AndCRCVerified':True,'entryModesVerified':True,'boundedMemory':True}))
    finally:
        temporary.unlink(missing_ok=True)


class HashReader:
    def __init__(self,stream):self.stream=stream;self.value=hashlib.sha256();self.size=0
    def read(self,size=-1):
        block=self.stream.read(size);self.value.update(block);self.size+=len(block);return block

def make_tar(source,destination,prefix,files,strip_setuid=False):
    safe_relative(prefix,True)
    source=source.resolve();destination=destination.resolve();destination.parent.mkdir(parents=True,exist_ok=True)
    frozen=snapshot_inputs(source,prefix,files,strip_setuid)
    expected={};handle,tmp=tempfile.mkstemp(prefix='.release-tar-',suffix='.tmp',dir=destination.parent);os.close(handle);temporary=Path(tmp)
    try:
        with temporary.open('wb') as raw:
            with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=6) as gz:
                with tarfile.open(fileobj=gz,mode='w|',format=tarfile.PAX_FORMAT,dereference=True) as archive:
                    for relative in files:
                        parsed=PurePosixPath(relative)
                        if parsed.is_absolute() or '..' in parsed.parts or '\\' in relative:raise ValueError('Unsafe source TAR entry')
                        path=checked_file(source,relative)
                        name=(PurePosixPath(prefix)/parsed).as_posix() if prefix else relative
                        if name in expected:raise ValueError('Duplicate TAR entry')
                        info=archive.gettarinfo(str(path),name);info.mode=stat.S_IMODE(info.mode);info.uid=info.gid=0;info.uname=info.gname='root'
                        if strip_setuid:info.mode &= ~0o6000
                        with path.open('rb') as content:
                            reader=HashReader(content);archive.addfile(info,reader)
                            if reader.size!=info.size or content.read(1):raise ValueError(f'File changed while archiving: {relative}')
                        expected[name]=(reader.size,reader.value.hexdigest(),info.mode)
                        if expected[name]!=frozen[name]:raise ValueError(f'Input differs from frozen snapshot: {relative}')
            raw.flush();os.fsync(raw.fileno())
        seen=set()
        with tarfile.open(temporary,'r|gz') as archive:
            for entry in archive:
                if not entry.isfile() or entry.name not in expected or entry.name in seen:raise ValueError('Invalid TAR member set/type')
                reader=HashReader(archive.extractfile(entry))
                while reader.read(BLOCK):pass
                if (reader.size,reader.value.hexdigest(),entry.mode)!=expected[entry.name] or entry.uid!=0 or entry.gid!=0:raise ValueError(f'TAR content/mode mismatch: {entry.name}')
                seen.add(entry.name)
        if seen!=set(expected):raise ValueError('Incomplete TAR member set')
        complete=digest(temporary)
        with temporary.open('rb') as inp,destination.open('wb') as output:
            for block in iter(lambda:inp.read(BLOCK),b''):output.write(block)
            output.flush();os.fsync(output.fileno())
        if digest(destination)!=complete:raise ValueError('Final TAR differs from verified complete output')
        print(json.dumps({'file':destination.name,'entries':len(expected),'bytes':complete[0],'sha256':complete[1],'inputSnapshotSha256':snapshot_hash(frozen),'inputSnapshotBeforeWrite':True,'entrySHA256AndModesVerified':True,'rootOwned':True,'boundedMemory':True}),flush=True)
    finally:temporary.unlink(missing_ok=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--manifest',type=Path,required=True);args=parser.parse_args()
    value=json.loads(args.manifest.read_text())
    if value.get('format')=='tar.gz':make_tar(Path(value['source']),Path(value['destination']),value['prefix'],value['files'],value.get('stripSetuid',False))
    else:make_zip(Path(value['source']),Path(value['destination']),value['prefix'],value['files'])
