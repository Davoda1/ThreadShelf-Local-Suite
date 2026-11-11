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
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25));
  await page.locator('#welcome-demo').click();await page.locator('#thread-view:not([hidden])').waitFor();
  const fixtures=[['html',html],['unknown',html],['',html],['python',html],['text',html],['xml',html],['html','<mark>fragment</mark>'],['html',html+html],['svg','<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle r="10" cx="15" cy="15"/></svg>']];
  await page.evaluate(async fixtures=>{window.previewTestCleanup?.();const host=document.getElementById('thread-content');host.innerHTML=TSAContent.renderThread({turns:fixtures.map(([tag,source])=>({ai:'```'+tag+'\n'+source+'\n```'}))}).html;window.previewTestCleanup=TSAContent.bind(host,{imageMode:'click',htmlPreviewExternal:false,copy:text=>window.lastCopied=text});await window.previewTestCleanup.ready;},fixtures);
  assert.equal(await page.locator('[data-toggle-html]').count(),3);assert.equal(await page.locator('[data-svg-toggle]').count(),1);
  const sourceSpacing=()=>page.locator('.tsa-code-block').evaluateAll(blocks=>blocks.map(block=>{const pre=block.querySelector('pre'),style=getComputedStyle(pre);return {padding:style.padding,margin:style.margin,radius:getComputedStyle(block).borderRadius};}));
  const originalSpacing=await sourceSpacing();
  const previews=()=>application.evaluate(({webContents})=>webContents.getAllWebContents().filter(w=>/\.preview\.invalid\//.test(w.getURL())).map(w=>w.id));
  assert.deepEqual(await previews(),[]);
  await page.locator('[data-toggle-html]').first().click();
  await assertPoll(async()=>assert.equal((await previews()).length,1));
  const boundary=await application.evaluate(async({webContents})=>{const wc=webContents.getAllWebContents().find(w=>/\.preview\.invalid\//.test(w.getURL()));return {prefs:wc.getLastWebPreferences(),value:await wc.executeJavaScript('({text:document.getElementById("value").textContent,boundary:window.boundary})')};});
  assert.equal(boundary.prefs.sandbox,true);assert.equal(boundary.prefs.contextIsolation,true);assert.equal(boundary.prefs.nodeIntegration,false);assert.equal(boundary.value.text,'JavaScript ran');assert.deepEqual(boundary.value.boundary,{require:'undefined',process:'undefined',alternative:'undefined',desktop:'undefined'});
  const layout=await page.locator('.tsa-html-preview:not([hidden])').evaluate(node=>{const rect=node.getBoundingClientRect(),parent=node.parentElement,box=parent.getBoundingClientRect(),style=getComputedStyle(node),toolbar=parent.querySelector('.tsa-code-toolbar').getBoundingClientRect();return {width:rect.width,height:rect.height,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,box:{left:box.left+parent.clientLeft,right:box.left+parent.clientLeft+parent.clientWidth,bottom:box.top+parent.clientTop+parent.clientHeight},toolbarBottom:toolbar.bottom,background:style.backgroundColor,margin:style.margin,padding:style.padding};});
  assert.ok(Math.abs(layout.width/layout.height-16/9)<0.002,JSON.stringify(layout));
  assert.equal(layout.background,'rgba(0, 0, 0, 0)');
  assert.equal(layout.margin,'0px');assert.equal(layout.padding,'0px');
  assert.ok(Math.abs(layout.left-layout.box.left)<1&&Math.abs(layout.right-layout.box.right)<1&&Math.abs(layout.bottom-layout.box.bottom)<1&&Math.abs(layout.top-layout.toolbarBottom)<1,JSON.stringify(layout));
  const nativeStatus=()=>application.evaluate(({webContents,BrowserWindow})=>{const wc=webContents.getAllWebContents().find(w=>/\.preview\.invalid\//.test(w.getURL())),owner=BrowserWindow.getAllWindows()[0],clip=owner.contentView.children.find(v=>v.children.some(child=>child.webContents?.id===wc.id)),view=clip?.children.find(child=>child.webContents?.id===wc.id);const zoom=owner.webContents.getZoomFactor(),css=value=>value&&Object.fromEntries(Object.entries(value).map(([key,v])=>[key,v/zoom]));return {visible:clip?.getVisible(),bounds:css(clip?.getBounds()),viewport:css(view?.getBounds())};});
  const native=await nativeStatus();
  assert.equal(native.visible,true,JSON.stringify(native));
  assert.ok(Math.abs(native.bounds.x+native.viewport.x-layout.left)<=1&&Math.abs(native.bounds.y+native.viewport.y-layout.top)<=1,JSON.stringify({native,layout}));
  assert.ok(Math.abs(native.viewport.width-layout.width)<=1&&Math.abs(native.viewport.height-layout.height)<=1,JSON.stringify(native));
  assert.ok(native.bounds.x>=layout.left-1&&native.bounds.x+native.bounds.width<=layout.right+1,JSON.stringify(native));
  assert.ok(native.bounds.y>=layout.top-1&&native.bounds.y+native.bounds.height<=layout.bottom+1,JSON.stringify(native));

  const scrollPath=await page.evaluate(()=>{const host=document.getElementById('reader-scroll'),node=document.querySelector('.tsa-html-preview:not([hidden])');return {start:host.scrollTop,end:Math.min(host.scrollHeight-host.clientHeight,node.getBoundingClientRect().bottom+host.scrollTop-host.getBoundingClientRect().top+60)};});
  const positions=Array.from({length:17},(_,i)=>scrollPath.start+(scrollPath.end-scrollPath.start)*i/16),scrolling={samples:positions.length*2-1,visible:0,hidden:0};
  for(const top of [...positions,...positions.slice(0,-1).reverse()]){
   await page.evaluate(async top=>{document.getElementById('reader-scroll').scrollTop=top;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);},top);
   const clip=await page.locator('.tsa-html-preview:not([hidden])').evaluate(node=>{const r=node.getBoundingClientRect(),h=document.getElementById('reader-scroll'),b=h.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,minX:Math.max(r.left,b.left+h.clientLeft),maxX:Math.min(r.right,b.left+h.clientLeft+h.clientWidth),minY:Math.max(r.top,b.top+h.clientTop),maxY:Math.min(r.bottom,b.top+h.clientTop+h.clientHeight)};});
   const native=await nativeStatus();
   if(clip.maxY-clip.minY<1){assert.equal(native.visible,false,JSON.stringify({top,native,clip}));scrolling.hidden++;continue;}
   assert.equal(native.visible,true,JSON.stringify({top,native,clip}));scrolling.visible++;
   assert.ok(Math.abs(native.bounds.x+native.viewport.x-clip.left)<=1&&Math.abs(native.bounds.y+native.viewport.y-clip.top)<=1,JSON.stringify({top,native,clip}));
   assert.ok(native.bounds.x>=clip.minX-1&&native.bounds.x+native.bounds.width<=clip.maxX+1&&native.bounds.y>=clip.minY-1&&native.bounds.y+native.bounds.height<=clip.maxY+1,JSON.stringify({top,native,clip}));
  }
  assert.ok(scrolling.visible>10&&scrolling.hidden>0,JSON.stringify({scrollPath,scrolling}));

  await page.locator('.tsa-code-block [data-copy-code]').first().click();assert.equal(await page.evaluate(()=>lastCopied),html);
  await page.locator('[data-toggle-html]').first().click();await assertPoll(async()=>assert.deepEqual(await previews(),[]));
  assert.deepEqual(await sourceSpacing(),originalSpacing);
  assert.equal(await page.locator('.tsa-code-block').first().evaluate(block=>parseFloat(getComputedStyle(block.querySelector('pre')).paddingLeft)>0&&parseFloat(getComputedStyle(block).borderBottomLeftRadius)>0),true);
  const errorCodeStyle=await page.locator('.tsa-html-preview').first().evaluate(node=>{node.dataset.previewError='true';node.hidden=false;node.textContent='Preview unavailable.';const block=node.parentElement,result={radius:parseFloat(getComputedStyle(block).borderBottomLeftRadius),codeVisible:!block.querySelector('pre').hidden};node.hidden=true;node.textContent='';delete node.dataset.previewError;return result;});
  assert.ok(errorCodeStyle.radius>0&&errorCodeStyle.codeVisible,JSON.stringify(errorCodeStyle));

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
  const report={passed:true,productionApplication:true,sandbox:true,chromiumSandboxEnabled:!restrictedSandbox,singleInstanceLockUnmodified:!restrictedLock,applicationZoom:1.25,aspectRatio:'16:9',transparentPlaceholder:true,contained:true,flushInterior:true,initialPlacementWithoutExtraScroll:true,initialPlacement:true,fullWidth16by9:true,scrollContained:true,transparentLoading:true,htmlOnlySpacing:true,errorCodeRestored:true,scrolling,eligibleSwitches:3,svgUnchanged:true,embeddedJavascript:true,noApplicationBridge:true,copyUnchanged:true,codeTeardown:true,settingsTeardown:true,externalDisabled:true,privateAndFileBlocked:true,pageErrors:0};if(process.env.HTML_PREVIEW_REPORT){await fs.mkdir(path.dirname(process.env.HTML_PREVIEW_REPORT),{recursive:true});await fs.writeFile(process.env.HTML_PREVIEW_REPORT,JSON.stringify(report,null,2)+'\n');}else console.log(JSON.stringify(report,null,2));
 }finally{if(application)await application.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
async function assertPoll(check){let last;for(let i=0;i<100;i++){try{return await check();}catch(error){last=error;}await new Promise(r=>setTimeout(r,50));}throw last;}
