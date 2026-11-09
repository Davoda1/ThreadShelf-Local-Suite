#!/usr/bin/env python3
"""Apply the verified original-source update to an unpatched 1.3.0 source tree.
Copyright (c) 2026 davoda1. MIT. Python 3.10+; Git for --apply-patches.
No downloads, upstream hooks or compilation are performed by this tool.
"""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, os, shutil, tarfile, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('base_sources', ROOT/'assemble-base-sources.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)

def sha(path): return base.digest_file(path)
def load():
    m=json.loads((ROOT/'manifest.json').read_text())
    if m.get('schema_version')!=1 or m.get('electron_version')!='45.2.3': raise ValueError('Unsupported update manifest')
    for row in m['payloads']:
        p=base.safe_target(ROOT, row['file'])
        if not p.is_file() or p.stat().st_size!=row['size'] or sha(p)!=row['sha256']: raise ValueError('Changed update payload: '+row['file'])
    return m

def read_blobs(m):
    expected={x['after']['sha256']:x['after']['size'] for x in m['changes'] if x['after']}
    blobs={}
    with tarfile.open(ROOT/'changed-files.tar.gz','r:gz') as t:
        for member in t:
            name=base.filename(member.name)
            if name in blobs or not member.isfile() or name not in expected or member.size!=expected[name]: raise ValueError('Unexpected source blob')
            data=t.extractfile(member).read()
            if hashlib.sha256(data).hexdigest()!=name: raise ValueError('Changed source blob')
            blobs[name]=data
    if set(blobs)!=set(expected): raise ValueError('Incomplete source blobs')
    return blobs

class Archives:
    def open(self, name): return (ROOT/'inputs'/base.filename(name.split('/')[-1])).open('rb')

def verify_inputs(m):
    for row in m['downloads']:
        p=base.safe_target(ROOT, 'inputs/'+row['file'])
        if not p.is_file() or p.stat().st_size!=row['size'] or sha(p)!=row['sha256']: raise ValueError('Missing/changed source input: '+row['file'])

def apply_changes(m, root, blobs):
    # Check every expected original and every new/renamed target before any write.
    destinations=set(); originals=set()
    for row in m['changes']:
        if row['path'] in destinations or row['before_path'] in originals: raise ValueError('Repeated delta target')
        destinations.add(row['path']); originals.add(row['before_path'])
        if not row['before'] and not row['after']: raise ValueError('Empty source delta')
        if row['after']:
            data=blobs.get(row['after']['sha256'])
            if data is None or len(data)!=row['after']['size'] or hashlib.sha256(data).hexdigest()!=row['after']['sha256']: raise ValueError('Missing or changed source blob')
        old=base.safe_target(root,row['before_path']);new=base.safe_target(root,row['path']);before=row['before']
        if before:
            if not old.is_file() or old.stat().st_size!=before['size'] or sha(old)!=before['sha256']: raise ValueError('Original source differs: '+row['before_path'])
        elif old.exists(): raise ValueError('Expected original source absence: '+row['before_path'])
        if row['path']!=row['before_path'] and new.exists(): raise ValueError('Rename target already exists: '+row['path'])
        for state in (row['before'],row['after']):
            if state and state['mode'] not in (0o100644,0o100755): raise ValueError('Unsupported delta file mode')
    for row in m['changes']:
        old=base.safe_target(root,row['before_path']);new=base.safe_target(root,row['path'])
        if row['before'] and (not row['after'] or old!=new):old.unlink()
        if row['after']:
            new.parent.mkdir(parents=True,exist_ok=True);new.write_bytes(blobs[row['after']['sha256']]);new.chmod(0o755 if row['after']['mode']&0o111 else 0o644)
    for row in m['changes']:
        if row['after'] and sha(base.safe_target(root,row['path']))!=row['after']['sha256']:raise ValueError('Updated source differs')

def run(root, apply_patches=False):
    root=root.resolve();m=load();blobs=read_blobs(m);verify_inputs(m)
    report=base.safe_target(root,'SOURCE-ASSEMBLY.json')
    previous=json.loads(report.read_text())
    if previous.get('manifest_sha256')!=m['base']['manifest_sha256'] or previous.get('status')!='assembled-unpatched' or previous.get('patches'):
        raise ValueError('Use the exact 1.3.0 original source collection assembled WITHOUT --apply-patches')
    if (root/'SOURCE-UPDATE.json').exists():raise ValueError('Source update was already applied')
    replacements=set()
    for row in m['replacement_archives']:
        target=base.safe_target(root,row['path'])
        if row['path'] not in ('src/electron','src/third_party/electron_node') or row['path'] in replacements or not target.is_dir(): raise ValueError('Invalid replacement source root')
        replacements.add(row['path'])
    if replacements != {'src/electron','src/third_party/electron_node'}: raise ValueError('Incomplete replacement source roots')
    for row in m['changes']:
        for name in (row['path'],row['before_path']):
            if any(name==prefix or name.startswith(prefix+'/') for prefix in replacements): raise ValueError('Source delta overlaps replacement archive')
    for row in m['profiles']:
        base.filename(row['file'])
        base.safe_target(root,'src/electron/build/pgo_profiles/'+row['file'])
    with tempfile.TemporaryDirectory(prefix='threadshelf-source-update-') as work:
        inv=base.Inventory(Path(work)/'inventory.sqlite')
        try:
            # Fully inspect replacement archives before updating the destination.
            for row in m['replacement_archives']:base.inspect_archive(Archives(),row,inv)
            inv.check_links()
            apply_changes(m,root,blobs)
            for row in m['replacement_archives']:
                target=base.safe_target(root,row['path'])
                if row['path'] not in ('src/electron','src/third_party/electron_node') or not target.is_dir():raise ValueError('Invalid replacement source root')
                shutil.rmtree(target)
                base.inspect_archive(Archives(),row,inv,root)
            for path,target in inv.db.execute("SELECT path,link FROM entries WHERE kind='symlink' ORDER BY path").fetchall():
                out=base.safe_target(root,path);out.parent.mkdir(parents=True,exist_ok=True);out.symlink_to(target)
            for row in m['profiles']:
                dst=base.safe_target(root,'src/electron/build/pgo_profiles/'+row['file'])
                shutil.copyfile(ROOT/'inputs'/row['file'],dst)
            patches=base.apply_patches(root,inv) if apply_patches else []
        finally:inv.close()
    result={'schema_version':1,'electron_version':m['electron_version'],'chromium_version':m['chromium_version'],'embedded_node_version':m['embedded_node_version'],'update_manifest_sha256':sha(ROOT/'manifest.json'),'changed_files':len(m['changes']),'replacement_archives':len(m['replacement_archives']),'patches':patches,'source_update_complete':True,'runtime_rebuilt':False}
    (root/'SOURCE-UPDATE.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--destination',required=True,type=Path);p.add_argument('--apply-patches',action='store_true');args=p.parse_args()
    print(json.dumps(run(args.destination,args.apply_patches),indent=2))
if __name__=='__main__':main()
