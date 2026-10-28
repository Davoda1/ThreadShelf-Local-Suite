import contextlib,hashlib,importlib.util,io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('profiles',Path(__file__).with_name('prepare-release-profiles.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Response(io.BytesIO):
 def __init__(self,b):super().__init__(b);self.headers={'Content-Length':str(len(b))}
class Tests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.payloads={};self.inputs=[]
  for name,b in [('electron-linux-x64-test.profdata',b'linux profile'*100),('electron-win-x64-test.profdata',b'windows profile'*101),('electron-v8-x64-test.profile',b'v8 data'*99)]:
   url='https://dev-cdn-experimental.electronjs.org/pgo/'+name;self.payloads[url]=b;self.inputs.append({'file':name,'url':url,'bytes':len(b),'expected_sha256':hashlib.sha256(b).hexdigest()})
 def tearDown(self):self.temp.cleanup()
 def build(self,rows=None,name='profiles.tar.gz',reserve=0):
  with patch.object(m.urllib.request,'urlopen',side_effect=lambda url,**kw:Response(self.payloads[url])),contextlib.redirect_stdout(io.StringIO()):return m.build(rows or self.inputs,self.root/name,reserve)
 def test_exact_profiles_marker_and_deterministic_archive(self):
  a=self.build();b=self.build(name='again.tar.gz');self.assertEqual(a['expected_sha256'],b['expected_sha256']);self.assertEqual(len(a['source_files']),4);self.assertEqual(a['source_files'][-1]['archive_member'],'electron-v8-builtins.profile.version')
 def test_digest_mismatch_discards_archive(self):
  rows=[dict(x) for x in self.inputs];rows[0]['expected_sha256']='0'*64
  with self.assertRaises(m.ProfileError):self.build(rows)
  self.assertFalse((self.root/'profiles.tar.gz').exists())
 def test_wrong_size_discards_archive(self):
  rows=[dict(x) for x in self.inputs];rows[0]['bytes']+=1
  with self.assertRaises(m.ProfileError):self.build(rows)
  self.assertFalse((self.root/'profiles.tar.gz').exists())
 def test_unreviewed_source_refused(self):
  rows=[dict(x) for x in self.inputs];rows[0]['url']='https://example.test/private'
  with self.assertRaises(m.ProfileError):self.build(rows)
 def test_storage_guard_discards_archive(self):
  with self.assertRaises(m.ProfileError):self.build(reserve=2**64)
  self.assertFalse((self.root/'profiles.tar.gz').exists())
 def test_existing_output_preserved(self):
  f=self.root/'profiles.tar.gz';f.write_bytes(b'user-file')
  with self.assertRaises(m.ProfileError):self.build()
  self.assertEqual(f.read_bytes(),b'user-file')
if __name__=='__main__':unittest.main(verbosity=2)
