'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {isTrustedFileURL,isTrustedMainFrame}=require('../core/trusted-entry.cjs');
const entry=(nativePath,windows)=>pathToFileURL(nativePath,{windows}).href;
const mixedName="Árvíztűrő tükörfúrógép ~ # 100% O'Brien + [test]";

for(const windows of [true,false]){
  const platform=windows?'Windows':'POSIX';
  const expected=entry(windows?`C:\\Users\\${mixedName}\\resources\\app\\renderer\\index.html`:`/opt/${mixedName}/resources/app/renderer/index.html`,windows);
  test(`${platform} mixed special-character paths accept only equivalent decoded spelling`,()=>{
    for(const actual of [expected,expected.replaceAll('%7E','~'),expected.replace(/%[0-9A-F]{2}/g,value=>value.toLowerCase()),expected.replace("O'Brien",'O%27Brien'),expected.replace('index.html','%69ndex.html')]){
      assert.equal(isTrustedFileURL(actual,expected,{windows}),true,actual);
    }
    for(const actual of [expected.replace('%23','%2523'),expected.replace('100%25','100%2525'),expected.replace('index.html','Index.html'),expected.replace('index.html','other.html'),expected+'#',expected+'#section',expected+'?',expected+'?query=value']){
      assert.equal(isTrustedFileURL(actual,expected,{windows}),false,actual);
    }
  });
  test(`${platform} literal percent-encoded-looking filename is decoded exactly once`,()=>{
    const target=entry(windows?'C:\\Package%2F%5C%23%25\\renderer\\index.html':'/opt/Package%2F%5C%23%25/renderer/index.html',windows);
    assert.equal(isTrustedFileURL(target,target,{windows}),true);
    assert.equal(isTrustedFileURL(target.replace('%252F','%2F'),target,{windows}),false);
    assert.equal(isTrustedFileURL(target.replace('%255C','%5C'),target,{windows}),false);
    assert.equal(isTrustedFileURL(target.replace('%2523','%23'),target,{windows}),false);
    assert.equal(isTrustedFileURL(target.replace('%2525','%25'),target,{windows}),false);
  });
}

test('Windows UNC entry requires the same host, share and exact path',()=>{
  const expected=entry(`\\\\server\\share\\${mixedName}\\renderer\\index.html`,true),options={windows:true};
  assert.equal(isTrustedFileURL(expected,expected,options),true);
  assert.equal(isTrustedFileURL(expected.replaceAll('%7E','~'),expected,options),true);
  for(const actual of [expected.replace('server','other-server'),expected.replace('/share/','/other-share/'),expected.replace('/share/','/Share/'),expected.replace('/renderer/','%2Frenderer/'),expected.replace('/renderer/','%5Crenderer/')])assert.equal(isTrustedFileURL(actual,expected,options),false,actual);
  assert.equal(isTrustedFileURL(expected,expected,{windows:false}),false);
});

test('malformed escaping and malformed expected paths fail closed on both platforms',()=>{
  for(const windows of [true,false]){
    const target=entry(windows?'C:\\Package\\renderer\\index.html':'/opt/Package/renderer/index.html',windows);
    for(const leaf of ['index%.html','index%GG.html','index%C3.html','index%C0%AF.html','index%ED%A0%80.html','index%00.html']){
      const malformed=target.replace('index.html',leaf);
      assert.equal(isTrustedFileURL(malformed,target,{windows}),false,malformed);
      assert.equal(isTrustedFileURL(target,malformed,{windows}),false,malformed);
    }
  }
});

test('preserves literal backslashes in POSIX filenames without accepting native separators',()=>{
  const target=entry('/opt/Package\\A ~ # 100% ő/renderer/index.html',false),options={windows:false};
  assert.equal(isTrustedFileURL(target,target,options),true);
  assert.equal(isTrustedFileURL(target.replace('%5C','%5c').replace('%7E','~'),target,options),true);
  for(const actual of [target.replace('%5C','/'),target.replace('%5C','%255C'),target.replace('/renderer/','%2Frenderer/'),target.replace('Package%5CA','Package%5Ca')])assert.equal(isTrustedFileURL(actual,target,options),false,actual);
  const windowsTarget=entry('C:\\Package\\A\\renderer\\index.html',true);
  for(const separator of ['%5c','%5C','%2f','%2F'])assert.equal(isTrustedFileURL(windowsTarget.replace('/renderer/',separator+'renderer/'),windowsTarget,{windows:true}),false,separator);
});

test('equivalent special-path encoding still requires the owning main frame',()=>{
  const target=entry(`C:\\Users\\${mixedName}\\renderer\\index.html`,true),options={windows:true};
  const mainFrame={url:target.replaceAll('%7E','~')},webContents={mainFrame},event={sender:webContents,senderFrame:mainFrame};
  assert.equal(isTrustedMainFrame(event,webContents,target,options),true);
  for(const invalid of [{sender:{},senderFrame:mainFrame},{sender:webContents,senderFrame:{url:mainFrame.url}},{sender:webContents,senderFrame:null},{sender:webContents},{senderFrame:mainFrame},null,undefined])assert.equal(isTrustedMainFrame(invalid,webContents,target,options),false);
  mainFrame.url=target+'#section';
  assert.equal(isTrustedMainFrame(event,webContents,target,options),false);
});
