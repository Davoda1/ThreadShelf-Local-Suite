'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_PATH||'../../../tools/mermaid-bundle/node_modules/playwright-core');
const root=path.resolve(process.env.TSA_APP_PATH||path.join(__dirname,'..'));
const html='<!doctype html><html><head><title>Preview test</title><style>body{font:16px sans-serif;padding:12px}button{padding:8px}</style></head><body><p id="value">Ready</p><button id="step" onclick="document.getElementById(\'value\').textContent=\'Clicked\'">Change</button><script>document.getElementById("value").textContent="JavaScript ran";window.boundary={require:typeof require,process:typeof process,alternative:typeof alternative,desktop:typeof desktop};fetch("https://127.0.0.1/").then(()=>window.privateResult="BAD",()=>window.privateResult="blocked");</script></body></html>';
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tsa-html-preview-full-'));
 const entry=path.join(directory,'main.cjs');
 const restrictedLock=process.env.TSA_TEST_NO_UNIX_SOCKETS==='1',restrictedSandbox=process.env.TSA_TEST_NO_SANDBOX==='1';
 await fs.writeFile(entry,`const {app}=require('electron');app.setPath('appData',${JSON.stringify(path.join(directory,'profile'))});${restrictedLock?'app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(root,'main.cjs'))});`);
 let application;
 try{
  application=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:[entry],chromiumSandbox:!restrictedSandbox,env:{...process.env},timeout:45000});
  const switches=await application.evaluate(({app})=>({disabled:app.commandLine.hasSwitch('no-sandbox')}));assert.equal(switches.disabled,restrictedSandbox);
  const page=await application.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#welcome-demo').click();await page.locator('#thread-view:not([hidden])').waitFor();
  const fixtures=[['html',html],['unknown',html],['',html],['python',html],['text',html],['xml',html],['html','<mark>fragment</mark>'],['html',html+html],['svg','<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle r="10" cx="15" cy="15"/></svg>']];
  await page.evaluate(async fixtures=>{window.previewTestCleanup?.();const host=document.getElementById('thread-content');host.innerHTML=TSAContent.renderThread({turns:fixtures.map(([tag,source])=>({ai:'```'+tag+'\n'+source+'\n```'}))}).html;window.previewTestCleanup=TSAContent.bind(host,{imageMode:'click',htmlPreviewExternal:false,copy:text=>window.lastCopied=text});await window.previewTestCleanup.ready;},fixtures);
  assert.equal(await page.locator('[data-toggle-html]').count(),3);assert.equal(await page.locator('[data-svg-toggle]').count(),1);
  const previews=()=>application.evaluate(({webContents})=>webContents.getAllWebContents().filter(w=>/\.preview\.invalid\//.test(w.getURL())).map(w=>w.id));
  assert.deepEqual(await previews(),[]);
  await page.locator('[data-toggle-html]').first().click();
  await assertPoll(async()=>assert.equal((await previews()).length,1));
  const boundary=await application.evaluate(async({webContents})=>{const wc=webContents.getAllWebContents().find(w=>/\.preview\.invalid\//.test(w.getURL()));return {prefs:wc.getLastWebPreferences(),value:await wc.executeJavaScript('({text:document.getElementById("value").textContent,boundary:window.boundary})')};});
  assert.equal(boundary.prefs.sandbox,true);assert.equal(boundary.prefs.contextIsolation,true);assert.equal(boundary.prefs.nodeIntegration,false);assert.equal(boundary.value.text,'JavaScript ran');assert.deepEqual(boundary.value.boundary,{require:'undefined',process:'undefined',alternative:'undefined',desktop:'undefined'});
  await page.locator('.tsa-code-block [data-copy-code]').first().click();assert.equal(await page.evaluate(()=>lastCopied),html);
  await page.locator('[data-toggle-html]').first().click();await assertPoll(async()=>assert.deepEqual(await previews(),[]));
  await page.locator('[data-toggle-html]').first().click();await assertPoll(async()=>assert.equal((await previews()).length,1));
  await page.evaluate(async()=>{const state=await alternative.loadState();await alternative.saveState({...state,htmlPreviewExternal:false});});
  await assertPoll(async()=>assert.deepEqual(await previews(),[]));
  assert.equal(await page.locator('[data-toggle-html]').first().textContent(),'Render');
  await page.locator('[data-toggle-html]').first().click();await assertPoll(async()=>assert.equal((await previews()).length,1));
  const network=await application.evaluate(async({webContents})=>{const wc=webContents.getAllWebContents().find(w=>/\.preview\.invalid\//.test(w.getURL()));return wc.executeJavaScript('Promise.all([fetch("https://example.com/").then(()=>false,()=>true),fetch("file:///etc/passwd").then(()=>false,()=>true)]).then(results=>({results,privateResult:window.privateResult,resource:location.href}))');});
  assert.deepEqual(network.results,[true,true]);assert.equal(network.privateResult,'blocked');
  await page.evaluate(()=>window.previewTestCleanup());await assertPoll(async()=>assert.deepEqual(await previews(),[]));
  await page.locator('#settings-button').click();await page.locator('#html-preview-external').waitFor();assert.equal(await page.locator('#html-preview-external').isChecked(),true); // UI state changed only through the test bridge above.
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,productionApplication:true,sandbox:true,chromiumSandboxEnabled:!restrictedSandbox,singleInstanceLockUnmodified:!restrictedLock,eligibleSwitches:3,svgUnchanged:true,embeddedJavascript:true,noApplicationBridge:true,copyUnchanged:true,codeTeardown:true,settingsTeardown:true,externalDisabled:true,privateAndFileBlocked:true,pageErrors:0},null,2));
 }finally{if(application)await application.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
async function assertPoll(check){let last;for(let i=0;i<100;i++){try{return await check();}catch(error){last=error;}await new Promise(r=>setTimeout(r,50));}throw last;}
