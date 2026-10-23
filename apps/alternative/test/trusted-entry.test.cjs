'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isTrustedFileURL,isTrustedMainFrame}=require('../core/trusted-entry.cjs');
const expected='file:///C:/Users/RUNNER~1/AppData/Local/Temp/Package%20A/resources/app/renderer/index.html';
const options={windows:true};
test('Alternative native Windows entry accepts equivalent Chromium percent-encoding without case/path relaxation',()=>{
  for(const actual of [expected,expected.replace('RUNNER~1','RUNNER%7E1'),expected.replace('RUNNER~1','RUNNER%7e1').replace('Package%20A','Package%20%41')])assert.equal(isTrustedFileURL(actual,expected,options),true,actual);
  assert.equal(isTrustedFileURL(expected.replace('/C:/','/c:/'),expected,options),false);
  assert.equal(isTrustedFileURL(expected.replace('Package%20A','Package%20a'),expected,options),false);
  assert.equal(isTrustedFileURL(expected.replace('/renderer/','/other/'),expected,options),false);
});
test('Alternative rejects foreign URLs, hosts, query/fragment suffixes and encoded separators',()=>{
  for(const actual of ['https://example.test/index.html','data:text/html,example','about:blank',expected.replace('file:///','file://server/'),expected+'?x=1',expected+'?',expected+'#section',expected+'#',expected.replace('/resources/','%2Fresources/'),expected.replace('/resources/','%2fresources/'),expected.replace('/resources/','%5Cresources/'),expected.replace('/resources/','%5cresources/'),expected.replace('index.html','different.html'),expected.replace('index.html','index%00.html'),null,{},'not a URL'])assert.equal(isTrustedFileURL(actual,expected,options),false,String(actual));
});
test('Alternative IPC requires the exact owning WebContents and actual main frame even with equivalent entry encoding',()=>{
  const mainFrame={url:expected.replace('RUNNER~1','RUNNER%7E1')},webContents={mainFrame},event={sender:webContents,senderFrame:mainFrame};
  assert.equal(isTrustedMainFrame(event,webContents,expected,options),true);
  assert.equal(isTrustedMainFrame({...event,sender:{}},webContents,expected,options),false);
  assert.equal(isTrustedMainFrame({...event,senderFrame:{...mainFrame}},webContents,expected,options),false);
  assert.equal(isTrustedMainFrame({...event,senderFrame:null},webContents,expected,options),false);
  assert.equal(isTrustedMainFrame(event,null,expected,options),false);
  assert.equal(isTrustedMainFrame(null,webContents,expected,options),false);
  mainFrame.url='https://example.test/index.html';assert.equal(isTrustedMainFrame(event,webContents,expected,options),false);
});
test('Alternative POSIX file entries preserve case and literal percent signs without accepting fragments',()=>{
  const target='file:///opt/Package%20A~1/100%25/resources/app/renderer/index.html',posix={windows:false};
  assert.equal(isTrustedFileURL(target.replace('A~1','%41%7E1'),target,posix),true);
  assert.equal(isTrustedFileURL(target.replace('A~1','a~1'),target,posix),false);
  assert.equal(isTrustedFileURL(target.replace('100%25','100%2525'),target,posix),false);
  assert.equal(isTrustedFileURL(target+'#section',target,posix),false);
  assert.equal(isTrustedFileURL(target.replace('/resources/','%5Cresources/'),target,posix),false);
});
