import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {isTrustedFileURL,isTrustedMainFrame}=createRequire(import.meta.url)('../src/desktop/trusted-entry.cjs');
const expected='file:///C:/Users/RUNNER~1/AppData/Local/Temp/Package%20A/resources/app/dist/index.html';
const options={windows:true,allowFragment:true};
test('Reader native Windows entry accepts equivalent Chromium percent-encoding without case/path relaxation',()=>{
  for(const actual of [expected,expected.replace('RUNNER~1','RUNNER%7E1'),expected.replace('RUNNER~1','RUNNER%7e1').replace('Package%20A','Package%20%41')])assert.equal(isTrustedFileURL(actual,expected,options),true,actual);
  assert.equal(isTrustedFileURL(expected.replace('/C:/','/c:/'),expected,options),false);
  assert.equal(isTrustedFileURL(expected.replace('Package%20A','Package%20a'),expected,options),false);
  assert.equal(isTrustedFileURL(expected.replace('/dist/','/renderer/'),expected,options),false);
});
test('Reader rejects foreign URLs, hosts, queries and encoded path separators; only existing fragment support is retained',()=>{
  for(const actual of ['https://example.test/index.html','data:text/html,example','about:blank',expected.replace('file:///','file://server/'),expected+'?x=1',expected+'?',expected.replace('/resources/','%2Fresources/'),expected.replace('/resources/','%2fresources/'),expected.replace('/resources/','%5Cresources/'),expected.replace('/resources/','%5cresources/'),expected.replace('index.html','different.html'),expected.replace('index.html','index%00.html'),null,{},'not a URL'])assert.equal(isTrustedFileURL(actual,expected,options),false,String(actual));
  assert.equal(isTrustedFileURL(expected+'#reader-anchor',expected,options),true);
  assert.equal(isTrustedFileURL(expected+'#',expected,options),true);
  assert.equal(isTrustedFileURL(expected+'#?query-in-fragment',expected,options),true);
  assert.equal(isTrustedFileURL(expected+'#search?needle=yes',expected,options),true);
  assert.equal(isTrustedFileURL(expected+'?x=1#reader-anchor',expected,options),false);
});
test('Reader IPC requires the exact owning WebContents and actual main frame even with equivalent entry encoding',()=>{
  const mainFrame={url:expected.replace('RUNNER~1','RUNNER%7E1')},webContents={mainFrame},event={sender:webContents,senderFrame:mainFrame};
  assert.equal(isTrustedMainFrame(event,webContents,expected,options),true);
  assert.equal(isTrustedMainFrame({...event,sender:{}},webContents,expected,options),false);
  assert.equal(isTrustedMainFrame({...event,senderFrame:{...mainFrame}},webContents,expected,options),false);
  assert.equal(isTrustedMainFrame({...event,senderFrame:null},webContents,expected,options),false);
  assert.equal(isTrustedMainFrame(event,null,expected,options),false);
  assert.equal(isTrustedMainFrame(null,webContents,expected,options),false);
  mainFrame.url='https://example.test/index.html';assert.equal(isTrustedMainFrame(event,webContents,expected,options),false);
});
test('Reader POSIX file entries preserve case, literal percent signs and existing fragments',()=>{
  const target='file:///opt/Package%20A~1/100%25/resources/app/dist/index.html',posix={windows:false,allowFragment:true};
  assert.equal(isTrustedFileURL(target.replace('A~1','%41%7E1')+'#section',target,posix),true);
  assert.equal(isTrustedFileURL(target.replace('A~1','a~1'),target,posix),false);
  assert.equal(isTrustedFileURL(target.replace('100%25','100%2525'),target,posix),false);
  assert.equal(isTrustedFileURL(target.replace('/resources/','%5Cresources/'),target,posix),false);
});
