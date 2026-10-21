#!/usr/bin/env node
// Linux package-entry integration test, included in source only.
// Usage: node tests/package-symlink.browser.mjs ENTRY EXPECTED_LINK EVIDENCE_JSON
// Run on a Linux graphical display (or Xvfb). Supply Playwright through
// THREADSHELF_PLAYWRIGHT_MODULE or a locally installed playwright dependency.
// ENTRY must be an extracted TAR root entry or an isolated DEB usr/bin entry.
// Uses the shipped executable and its normal packaged resources/app discovery.
// In this isolated root/container test, --no-sandbox is needed and Unix singleton
// sockets are unavailable. A Node inspector breakpoint replaces only the main
// process requestSingleInstanceLock method with a true return in memory. It also
// clears the debugger break flag from reported execArgv and resumes debugger-
// created worker pauses. No shipped file, app path or resource path is changed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {exportedFixtures,genuiMessage} from './fixtures/chart-compatibility.mjs';
const require=createRequire(import.meta.url);
const {chromium}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');

const [entry, expectedLink, evidencePath] = process.argv.slice(2);
assert.ok(entry && expectedLink && evidencePath, 'Usage: node harness.mjs entry expected-link evidence-json');
assert.ok((await fs.lstat(entry)).isSymbolicLink());
assert.equal(await fs.readlink(entry), expectedLink);
const executable=await fs.realpath(entry), runtimeRoot=path.dirname(executable), appRoot=path.join(runtimeRoot,'resources','app');
assert.equal((await fs.readFile(executable)).subarray(0,4).toString('hex'),'7f454c46');
const mainFile=path.join(appRoot,'src/desktop/main.cjs'), mainText=await fs.readFile(mainFile,'utf8');
const singletonLine=mainText.split('\n').findIndex(line=>line.startsWith('if(!app.requestSingleInstanceLock())'));
assert.ok(singletonLine>=0);
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf symlink profile '));
// Deliberately synthetic: this is package correspondence QA, not recovered user data.
const fixturePath=path.join(profile,'synthetic-rich-package-qa.json');
const fixtureLoop=`<box>
  <grid columns={4}>
    {#each [{s:"A",t:"First"},{s:"B",t:"Second"},{s:"C",t:"Third"},{s:"D",t:"Fourth"}] as item,i}
      <grid-item>
        <box align="center" gap={2}>
          <box height="70px" align="center" justify="center">
            <title>{item.s}</title>
          </box>
          <caption>{item.t}</caption>
          {#if i < 3}
            <icon name="arrow-right" color="tertiary"/>
          {/if}
        </box>
      </grid-item>
    {/each}
  </grid>
</box>
`;
const fixtureContent='Before **packaged rendering**.\n\n<box><title>Native package chart</title><text>Offline exact values</text><Chart content={{"chartType":"bar","meta":{"title":"Package QA values"},"xKey":"label","series":[{"dataKey":"value","label":"Synthetic series","valueSuffix":" ms"}],"data":[{"label":"Alpha","value":12},{"label":"Beta","value":-4}],"yAxisMin":-5,"yAxisMax":15}} /></box>\n\nAfter packaged rendering.'+'\n\n'+fixtureLoop+'\n\n<box><text>Before code block</text></box>\n\n    <box><title>Native inert example</title></box>\n\n<box><text>After code block</text></box>\n\n<box>\n  Code example:\n\n      <box><text>CODE BOX</text></box>\n</box>'+'\n\n'+exportedFixtures.map(f=>'### '+f.id+' '+f.title+'\n\n'+genuiMessage(f.payload)).join('\n\n')+'\n\nTS32-NATIVE-UI-END';
await fs.writeFile(fixturePath,JSON.stringify({id:'synthetic-native-rich-package',title:'Synthetic rich package QA',messages:[{role:'user',content:'Verify the offline packaged renderer.'},{role:'assistant',content:fixtureContent}]}));
await fs.mkdir(path.dirname(evidencePath),{recursive:true});
const screenshotBase=process.env.READER_SCREENSHOT_DIR?path.join(path.resolve(process.env.READER_SCREENSHOT_DIR),path.basename(evidencePath)):evidencePath;
await fs.mkdir(path.dirname(screenshotBase),{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fingerprint(root){
 const entries=[];
 async function walk(directory){
  for(const item of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const filename=path.join(directory,item.name),relative=path.relative(root,filename);
   if(item.isDirectory())await walk(filename);
   else if(item.isSymbolicLink())entries.push([relative,'link',await fs.readlink(filename)]);
   else if(item.isFile())entries.push([relative,'file',createHash('sha256').update(await fs.readFile(filename)).digest('hex')]);
  }
 }
 await walk(root);
 return {files:entries.length,sha256:createHash('sha256').update(JSON.stringify(entries)).digest('hex')};
}
const before=await fingerprint(appRoot);
const results=[],logs=[];
async function runPass(configure){
 const env={...process.env,THREADSHELF_READER_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=spawn(entry,['--inspect-brk=0','--remote-debugging-port=0','--no-sandbox','--disable-gpu'],{env,cwd:os.tmpdir(),stdio:['ignore','pipe','pipe']});
 let output='',ws,browser,seq=0,patched=false,exit=null,spawnError=null;
 const pending=new Map(),pageErrors=[],consoleErrors=[],externalRequests=[];
 child.stderr.on('data',b=>{output+=b;});child.stdout.on('data',b=>{output+=b;});child.on('error',e=>{spawnError=e;});child.on('exit',(code,signal)=>{exit={code,signal};});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const waitEndpoint=async expression=>{for(let i=0;i<300;i++){const match=output.match(expression);if(match)return match[1];if(spawnError)throw spawnError;if(exit)throw Error('App exited: '+JSON.stringify(exit));await delay(100);}throw Error('Timed out waiting for debugger endpoint');};
 try{
  const endpoint=await waitEndpoint(/Debugger listening on (ws:\/\/[^\s]+)/);
  ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let inspectorError=null;
  ws.addEventListener('message',event=>{void(async()=>{
   const message=JSON.parse(event.data);
   if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}return;}
   if(message.method==='NodeWorker.attachedToWorker')await send('NodeWorker.sendMessageToWorker',{sessionId:message.params.sessionId,message:JSON.stringify({id:1,method:'Runtime.runIfWaitingForDebugger'})});
   if(message.method==='Debugger.paused'){
    if(!patched&&message.params.hitBreakpoints?.length){
     const change=await send('Debugger.evaluateOnCallFrame',{callFrameId:message.params.callFrames[0].callFrameId,expression:'app.requestSingleInstanceLock=()=>true; process.execArgv=process.execArgv.filter(arg=>!arg.startsWith("--inspect-brk")); true',returnByValue:true});
     assert.ok(!change.exceptionDetails,JSON.stringify(change));patched=true;
    }
    await send('Debugger.resume');
   }
  })().catch(error=>{inspectorError=error;});});
  await send('Debugger.enable');await send('NodeWorker.enable',{waitForDebuggerOnStart:false});
  await send('Debugger.setBreakpointByUrl',{urlRegex:'/src/desktop/main\\.cjs$',lineNumber:singletonLine});
  await send('Runtime.runIfWaitingForDebugger');
  const chrome=await waitEndpoint(/DevTools listening on (ws:\/\/[^\s]+)/);
  browser=await chromium.connectOverCDP(chrome,{timeout:15000});
  const context=browser.contexts()[0];
  const page=context.pages()[0]||await context.waitForEvent('page');
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url()))externalRequests.push(request.url());});
  await page.locator('.shell').waitFor({timeout:25000});
  assert.ok(patched);if(inspectorError)throw inspectorError;
  const about=await page.evaluate(()=>window.desktop.invoke('app.about'));
  assert.equal(about.version,'3.2.0');assert.equal(about.platform,'linux');
  const metadataResponse=await send('Runtime.evaluate',{expression:'JSON.stringify({execPath:process.execPath,resourcesPath:process.resourcesPath,appPath:process.mainModule.require("electron").app.getAppPath(),argv:process.argv})',returnByValue:true});
  assert.ok(!metadataResponse.exceptionDetails,JSON.stringify(metadataResponse));
  const metadata=JSON.parse(metadataResponse.result.value);
  assert.equal(await fs.realpath(metadata.execPath),executable);
  assert.equal(await fs.realpath(metadata.appPath),await fs.realpath(appRoot));
  assert.equal(await fs.realpath(metadata.resourcesPath),await fs.realpath(path.join(runtimeRoot,'resources')));
  assert.ok(metadata.argv.slice(1).every(arg=>arg.startsWith('--')),'No alternative app entry path was passed');
  await page.locator('[data-action="settings"]').click();
  const catalogs=await page.evaluate(()=>({ui:[...document.querySelectorAll('#prefUiPalette option')].map(o=>o.value),code:[...document.querySelectorAll('#prefCodeTheme option')].map(o=>o.value),languages:[...document.querySelectorAll('#prefLanguage option')].map(o=>o.value)}));
  assert.equal(catalogs.ui.length,18);assert.equal(catalogs.code.length,10);assert.deepEqual(catalogs.languages,['en','hu','de','fr','ja']);
  if(configure){
   await page.locator('#prefLanguage').selectOption('ja');
   await page.locator('#prefTheme').selectOption('dark');
   await page.locator('#prefUiPalette').selectOption('harbor-haze');
   await page.locator('#prefCodeTheme').selectOption('ayu');
   await page.locator('#settingsForm button[type="submit"]').click();
   await page.waitForFunction(()=>document.documentElement.lang==='ja'&&document.documentElement.dataset.uiPalette==='harbor-haze');
  }else{
   assert.equal(await page.locator('#prefLanguage').inputValue(),'ja');
   assert.equal(await page.locator('#prefUiPalette').inputValue(),'harbor-haze');
   assert.equal(await page.locator('#prefCodeTheme').inputValue(),'ayu');
   assert.equal(await page.locator('#modalTitle').textContent(),'設定');
   await page.screenshot({path:screenshotBase.replace(/\.json$/,'.png')});
  }
  const settings=(await page.evaluate(()=>window.desktop.invoke('bootstrap'))).settings;
  assert.equal(settings.language,'ja');assert.equal(settings.uiPalette,'harbor-haze');assert.equal(settings.codeTheme,'ayu');
  if(configure){
   await send('Runtime.evaluate',{expression:`global.packageQaOriginalDialog=process.mainModule.require("electron").dialog.showOpenDialog; process.mainModule.require("electron").dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(fixturePath)}]})`});
   const picked=await page.evaluate(()=>window.desktop.invoke('import.pick',{kind:'files'}));
   assert.deepEqual(picked.paths,[fixturePath]);
   await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").dialog.showOpenDialog=global.packageQaOriginalDialog; delete global.packageQaOriginalDialog'});
   const imported=await page.evaluate(file=>window.desktop.invoke('import.paths',{paths:[file],collection:'Package QA'}),fixturePath);
   assert.equal(imported.imported,1);assert.deepEqual(imported.errors,[]);
  }
  await page.reload();await page.locator('.shell').waitFor();
  await page.locator('.conversation-row').filter({hasText:'Synthetic rich package QA'}).click();
  await page.locator('.rich-chart svg').first().waitFor();
  assert.equal(await page.locator('#conversationContent .message').count(),2);
  assert.equal(await page.locator('.rich-chart').count(),1+exportedFixtures.length);
  assert.equal(await page.locator('.rich-chart-fallback').count(),0);
  assert.ok((await page.locator('#conversationContent').innerText()).includes('TS32-NATIVE-UI-END'));
  assert.equal(await page.locator('.rich-grid-item').count(),4);
  assert.equal(await page.locator('.rich-icon').count(),3);
  assert.equal(await page.locator('.message-content pre code').filter({hasText:'Native inert example'}).count(),1);
  assert.equal(await page.locator('.rich-title').filter({hasText:'Native inert example'}).count(),0);
  assert.equal(await page.locator('.rich-box pre code').filter({hasText:'CODE BOX'}).count(),1);
  assert.equal(await page.locator('.rich-text').filter({hasText:'CODE BOX'}).count(),0);
  assert.doesNotMatch(await page.locator('#conversationContent').innerText(),/TSRICH(?:CHILD)?[a-f0-9]{32}END/);
  await page.locator('.rich-chart-data summary').first().click();
  const cells=await page.locator('.rich-chart-data').first().locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
  assert.deepEqual(cells,[['Alpha','12 ms'],['Beta','-4 ms']]);
  const summary=(await page.evaluate(()=>window.desktop.invoke('files',{mode:'local'}))).files[0];
  const storedBefore=await page.evaluate(id=>window.desktop.invoke('thread',{id}),summary.id);
  await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").clipboard.writeText("package-qa-sentinel")',awaitPromise:true});
  await page.locator('.message.assistant .message-copy-button').click();
  let copied;
  for(let i=0;i<40;i++){
   copied=(await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").clipboard.readText()',returnByValue:true,awaitPromise:true})).result.value;
   if(copied===fixtureContent)break;await delay(25);
  }
  assert.equal(copied,fixtureContent,'Packaged native Copy retains exact rich source');
  await page.locator('.rich-chart-mark').first().focus();
  assert.equal(await page.locator('.rich-chart-mark').first().evaluate(element=>element===document.activeElement),true);
  const customHover=[];
  const inspectWidget=async(id,index,expected,{keyboard=false,guide=false}={})=>{
   const chart=page.locator('.rich-chart').nth(1+exportedFixtures.findIndex(f=>f.id===id));
   const target=chart.locator(`.rich-chart-hit[data-chart-item="${index}"], .rich-chart-mark[data-chart-item="${index}"]`).last();
   await target.scrollIntoViewIfNeeded();
   await page.mouse.move(1,1);
   if(keyboard)await target.focus();else await target.hover();
   const tooltip=page.locator('.rich-chart-tooltip').filter({visible:true});
   await tooltip.waitFor({state:'visible'});
   const text=await tooltip.innerText();
   for(const value of expected)assert.ok(text.includes(value),`${id} native custom tooltip contains ${value}: ${text}`);
   assert.ok(await chart.locator('.rich-chart-mark.is-active').count()>0,`${id} active native marks`);
   assert.ok(await tooltip.locator('.rich-chart-swatch').count()>0,`${id} series-color swatches`);
   if(guide){
    const crosshair=chart.locator('.rich-chart-crosshair');
    assert.equal(await crosshair.getAttribute('visibility'),'visible');
    const position=await chart.evaluate((element,itemIndex)=>{
     const svg=element.querySelector('svg'),line=element.querySelector('.rich-chart-crosshair');
     const point=svg.createSVGPoint();point.x=Number(line.getAttribute('x1'));point.y=Number(line.getAttribute('y1'));
     const screen=point.matrixTransform(svg.getScreenCTM());
     const selected=element.querySelector(`.rich-chart-mark.is-active`);
     const mark=svg.createSVGPoint();mark.x=Number(selected.getAttribute('cx'));mark.y=Number(selected.getAttribute('cy'));
     const markScreen=mark.matrixTransform(svg.getScreenCTM());
     return {crosshairX:screen.x,pointX:markScreen.x,index:itemIndex};
    },index);
    assert.ok(Math.abs(position.crosshairX-position.pointX)<1,`${id} native guide aligns after conversation scrolling`);
   }
   const bounds=await tooltip.boundingBox(),viewport=page.viewportSize()||await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,`${id} tooltip within native viewport`);
   if(!configure)await page.screenshot({path:screenshotBase.replace(/\.json$/,`-${id}-${index}-tooltip.png`)});
   customHover.push({id,index,keyboard,text,crosshair:guide});
   await page.keyboard.press('Escape');
   await tooltip.waitFor({state:'hidden'});
   await delay(60);
   assert.equal(await page.locator('.rich-chart-tooltip').filter({visible:true}).count(),0,'Escape remains dismissed on stationary target');
  };
  await inspectWidget('C02',1,['Beta','Score','70.5%']);
  await inspectWidget('C04',1,['Beta','Coverage','71%']);
  await inspectWidget('C05',1,['Second','Series A','0','Series B','1'],{guide:true});
  await inspectWidget('C05',2,['Third','Series A','3.125','Series B','2'],{guide:true});
  await inspectWidget('C09',1,['Probe A','2','3.125'],{guide:true});
  await inspectWidget('C07',0,['Alpha','Items','6','60%'],{keyboard:true});
  const storedAfter=await page.evaluate(id=>window.desktop.invoke('thread',{id}),summary.id);
  assert.deepEqual(storedAfter,storedBefore,'Rendering/copy/keyboard interaction must not mutate archived content');
  await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").BrowserWindow.getAllWindows()[0].setSize(680,540)'});
  await delay(150);
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight}));
  assert.ok(layout.documentWidth<=layout.width&&layout.documentHeight<=layout.height,'No application-wide overflow at the minimum window');
  if(!configure)await page.screenshot({path:screenshotBase.replace(/\.json$/,'-rich.png')});
  assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(externalRequests,[]);
  results.push({pass:configure?'configure':'restart-persistence',about,metadata,catalogs,rich:{fixture:'chat-derived synthetic GenUI content, not a complete account export',charts:1+exportedFixtures.length,finiteLoopCards:4,conditionalArrows:3,noLeakedPlaceholders:true,topLevelAndNestedIndentedCodeRemainInert:true,messageCount:2,exactValues:cells,customHover,nativeCopyUnchanged:true,keyboardChartFocus:true,archiveUnchanged:true,minimumWindow:layout},pageErrors,consoleErrors,externalRequests});
  await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").app.quit()'});
 }finally{
  if(ws)ws.close();for(let i=0;i<30&&!exit;i++)await delay(100);
  if(!exit)child.kill();if(browser)await browser.close();logs.push(output);
 }
}
try{
 await runPass(true);await runPass(false);
 const after=await fingerprint(appRoot);assert.deepEqual(after,before,'Packaged app files changed during QA');
 const result={status:'passed',entry,symlinkTarget:await fs.readlink(entry),executable,appRoot,relocatedPathContainsSpaces:entry.includes(' '),profile,productionAppBefore:before,productionAppAfter:after,productionAppFilesUnmodified:true,instrumentation:'Node inspector test-only singleton return; resume debugger-created worker pauses; one synthetic native dialog selection feeds the normal import.pick capability and the original dialog is restored. Shipped executable and resources/app unchanged; no alternate main, resource directory or app argument. Root Electron needs --no-sandbox in this isolated test environment.',results};
 await fs.writeFile(evidencePath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await fs.writeFile(evidencePath.replace(/\.json$/,'.log'),logs.join('\nNEXT LAUNCH\n'));}
