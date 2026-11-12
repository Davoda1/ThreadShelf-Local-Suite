#!/usr/bin/env python3
"""Regression checks for offline source-update boundaries; no network access."""
import gzip
import io
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

HERE=Path(__file__).resolve().parent

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

up=module('source_update','update-runtime-sources.py')
build=module('source_update_builder','build-source-update.py')

def state(data,mode=0o100644):
    return {'size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'mode':mode}

def row(path,before,after,old=None):
    return {'path':path,'before_path':old or path,'before':state(before) if before is not None else None,'after':state(after) if after is not None else None}

class SourceUpdateTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve()
    def tearDown(self):self.tmp.cleanup()
    def write(self,name,data):
        p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);return p
    def test_change_add_delete_and_rename_preserve_exact_bytes(self):
        self.write('src/change',b'old');self.write('src/remove',b'remove');self.write('src/old-name',b'rename')
        changes=[row('src/change',b'old',b'new'),row('src/add',None,b'added'),row('src/remove',b'remove',None),row('src/new-name',b'rename',b'renamed',old='src/old-name')]
        blobs={hashlib.sha256(x).hexdigest():x for x in [b'new',b'added',b'renamed']}
        up.apply_changes({'changes':changes},self.root,blobs)
        self.assertEqual((self.root/'src/change').read_bytes(),b'new');self.assertEqual((self.root/'src/add').read_bytes(),b'added');self.assertEqual((self.root/'src/new-name').read_bytes(),b'renamed')
        self.assertFalse((self.root/'src/remove').exists());self.assertFalse((self.root/'src/old-name').exists())
    def test_entire_original_set_is_checked_before_any_write(self):
        first=self.write('src/a',b'old');self.write('src/b',b'changed')
        changes=[row('src/a',b'old',b'new'),row('src/b',b'expected',b'new')]
        with self.assertRaisesRegex(ValueError,'Original source differs'):up.apply_changes({'changes':changes},self.root,{state(b'new')['sha256']:b'new'})
        self.assertEqual(first.read_bytes(),b'old')
    def test_duplicate_targets_and_changed_blobs_are_rejected_before_write(self):
        target=self.write('src/a',b'old');change=row('src/a',b'old',b'new')
        with self.assertRaisesRegex(ValueError,'Repeated delta'):up.apply_changes({'changes':[change,change]},self.root,{state(b'new')['sha256']:b'new'})
        with self.assertRaisesRegex(ValueError,'source blob'):up.apply_changes({'changes':[change]},self.root,{state(b'new')['sha256']:b'bad'})
        self.assertEqual(target.read_bytes(),b'old')
    def test_rename_collision_and_path_escape_are_rejected(self):
        self.write('src/a',b'old');target=self.write('src/b',b'existing')
        with self.assertRaisesRegex(ValueError,'Rename target'):up.apply_changes({'changes':[row('src/b',b'old',b'new','src/a')]},self.root,{state(b'new')['sha256']:b'new'})
        with self.assertRaises(up.base.SourceError):up.apply_changes({'changes':[row('../escape',None,b'new')]},self.root,{state(b'new')['sha256']:b'new'})
        self.assertEqual(target.read_bytes(),b'existing')
    def test_symlink_ancestor_is_rejected(self):
        outside=self.root/'outside';outside.mkdir()
        try:(self.root/'src').symlink_to(outside,target_is_directory=True)
        except OSError:self.skipTest('Host has no symlink support')
        with self.assertRaises(up.base.SourceError):up.apply_changes({'changes':[row('src/a',None,b'new')]},self.root,{state(b'new')['sha256']:b'new'})
        self.assertEqual(list(outside.iterdir()),[])
    def test_source_report_must_record_unpatched_assembly(self):
        self.write('SOURCE-ASSEMBLY.json',json.dumps({'manifest_sha256':'base','status':'verified','patches':[]}).encode())
        with mock.patch.object(up,'load',return_value={'base':{'manifest_sha256':'base'}}),mock.patch.object(up,'read_blobs',return_value={}),mock.patch.object(up,'verify_inputs'):
            with self.assertRaisesRegex(ValueError,'WITHOUT'):up.run(self.root)
    def test_delta_cannot_be_discarded_by_replacement_archive(self):
        self.write('SOURCE-ASSEMBLY.json',json.dumps({'manifest_sha256':'base','status':'assembled-unpatched','patches':[]}).encode())
        for name in ['src/electron','src/third_party/electron_node']:(self.root/name).mkdir(parents=True)
        manifest={'base':{'manifest_sha256':'base'},'replacement_archives':[{'path':'src/electron'},{'path':'src/third_party/electron_node'}],'changes':[{'path':'src/electron/DEPS','before_path':'src/electron/DEPS'}],'profiles':[]}
        with mock.patch.object(up,'load',return_value=manifest),mock.patch.object(up,'read_blobs',return_value={}),mock.patch.object(up,'verify_inputs'):
            with self.assertRaisesRegex(ValueError,'overlaps replacement'):up.run(self.root)
    def test_download_filename_rejects_traversal_and_drive_paths(self):
        for value in ['../outside','/outside','C:outside','a\\b','.','..','a/b','']:
            with self.subTest(value=value),self.assertRaises(ValueError):build.filename(value)
    def test_gzip_bytes_ignore_write_chunking_and_cover_block_boundaries(self):
        for size in [0,1,65534,65535,65536,2*65535,200000]:
            data=bytes((index%251 for index in range(size)));a=io.BytesIO();b=io.BytesIO()
            with build.StoredGzip(a) as output:output.write(data)
            with build.StoredGzip(b) as output:
                for pos in range(0,len(data),7919):output.write(data[pos:pos+7919])
            self.assertEqual(a.getvalue(),b.getvalue());self.assertEqual(gzip.decompress(a.getvalue()),data)
            self.assertEqual(a.getvalue()[:10],bytes.fromhex('1f8b08000000000000ff'))
    def test_v8_profile_installs_exact_bytes_at_release_gn_fixed_name(self):
        payload=b'exact pinned V8 optimization profile'
        name='electron-v8-x64-1793902192-4ac6f9f542.profile'
        source=self.root/'update';(source/'inputs').mkdir(parents=True)
        (source/'inputs'/name).write_bytes(payload)
        destination=self.root/'tree'
        with mock.patch.object(up,'ROOT',source):up.install_profile({'file':name},destination)
        for target in (name,'electron-v8-builtins.profile'):
            self.assertEqual((destination/'src/electron/build/pgo_profiles'/target).read_bytes(),payload)
        self.assertEqual(up.profile_targets({'file':'electron-linux-x64-1-abcd.profdata'}),('electron-linux-x64-1-abcd.profdata',))
        with self.assertRaises(up.base.SourceError):up.profile_targets({'file':'../outside.profile'})
    def test_builder_is_deterministic_and_rejects_changed_inputs(self):
        source=self.root/'source';source.mkdir();out=self.root/'out';cache=self.root/'cache'
        for name in ['update-runtime-sources.py','assemble-base-sources.py','README.md']:(source/name).write_text(name+'\n')
        payload=b'fixture';(source/'changed-files.tar.gz').write_bytes(payload)
        m={'schema_version':1,'suite_version':'1.4.3','electron_version':'45.2.3','payloads':[{'file':'changed-files.tar.gz','size':len(payload),'sha256':state(payload)['sha256']}],'downloads':[]}
        (source/'manifest.json').write_text(json.dumps(m))
        with mock.patch.object(build,'ROOT',source):
            first=build.build(out,'1.4.3',cache,True);second=build.build(out,'1.4.3',cache)
            self.assertEqual(first,second)
            (source/'changed-files.tar.gz').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'changed source input'):build.build(out,'1.4.3',cache)

if __name__=='__main__':unittest.main(verbosity=2)
