#!/usr/bin/env node
// Opt-in native package acceptance for the supplied ThreadShelf Format Testing export.
// Usage: READER_FORMAT_EXPORT=/private/export.json node tests/packaged-format-testing-r4.browser.mjs ENTRY EXPECTED_SYMLINK REPORT_JSON
// ENTRY must be the real extracted Linux TAR or DEB native symlink. A graphical
// display (or Xvfb) and Playwright are required; supply Playwright through
// THREADSHELF_PLAYWRIGHT_MODULE when it is not installed locally.
// READER_SCREENSHOT_DIR may point outside this source tree for private captures.
// Original export bytes are read-only. Reports contain checks, counts and hashes.
// The Node inspector temporarily bypasses only the singleton lock inside the
// isolated test process, because restricted containers may deny Unix sockets.
// No executable, packaged application file, resource path or app entry changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
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
const sourceRoot=fileURLToPath(new URL('..',import.meta.url));
assert.ok(process.env.READER_FORMAT_EXPORT,'Set READER_FORMAT_EXPORT to the private supplied JSON export.');
const fixturePath=path.resolve(process.env.READER_FORMAT_EXPORT);
if(process.env.READER_SCREENSHOT_DIR){const directory=path.resolve(process.env.READER_SCREENSHOT_DIR);assert.ok(directory!==sourceRoot&&!directory.startsWith(sourceRoot+path.sep),'Private screenshots must remain outside the source tree.');}
const sourceDigest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fixtureBytes=await fs.readFile(fixturePath);
const sourceHash=createHash('sha256').update(fixtureBytes).digest('hex');
const {normalizeDocument}=await import(pathToFileURL(path.join(appRoot,'src/core/importers.mjs')));
const expected=normalizeDocument(JSON.parse(fixtureBytes),fixturePath).find(record=>record.title==='ThreadShelf Format Testing');
assert.ok(expected);
const firstSource=expected.turns.find(turn=>turn.ai?.includes('# ThreadShelf Local Reader 3.2.0 — rendering test suite'))?.ai;
const secondSource=expected.turns.find(turn=>turn.ai?.includes('# ThreadShelf Local Reader 3.2.0 — Native UI rendering test'))?.ai;
assert.ok(firstSource&&secondSource);
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
  if(configure){
    await page.locator('[data-action="settings"]').click();
    await page.locator('#prefLanguage').selectOption('en');
    await page.locator('#prefTheme').selectOption('light');
    await page.locator('#prefUiPalette').selectOption('platinum');
    await page.locator('#settingsForm button[type="submit"]').click();
    await send('Runtime.evaluate',{expression:`global.packageQaOriginalDialog=process.mainModule.require("electron").dialog.showOpenDialog; process.mainModule.require("electron").dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(fixturePath)}]})`});
    const picked=await page.evaluate(()=>window.desktop.invoke('import.pick',{kind:'files'}));
    assert.deepEqual(picked.paths,[fixturePath]);
    await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").dialog.showOpenDialog=global.packageQaOriginalDialog; delete global.packageQaOriginalDialog'});
    const imported=await page.evaluate(file=>window.desktop.invoke('import.paths',{paths:[file],collection:'Private packaged acceptance'}),fixturePath);
    assert.equal(imported.imported,1);assert.deepEqual(imported.errors,[]);
  }
  const settings=(await page.evaluate(()=>window.desktop.invoke('bootstrap'))).settings;
  assert.equal(settings.language,'en');assert.equal(settings.uiPalette,'platinum');assert.equal(settings.theme,'light');
  await page.reload();await page.locator('.shell').waitFor();
  await page.locator('.conversation-row').filter({hasText:'ThreadShelf Format Testing'}).click();
  await page.locator('.rich-chart svg').first().waitFor();
  const summary=(await page.evaluate(()=>window.desktop.invoke('files',{mode:'local'}))).files.find(row=>row.title==='ThreadShelf Format Testing');
  const storedBefore=await page.evaluate(id=>window.desktop.invoke('thread',{id}),summary.id);
  assert.equal(sourceDigest(storedBefore.raw),sourceDigest(expected.raw),'Archived raw content is preserved');assert.equal(sourceDigest(storedBefore.turns),sourceDigest(expected.turns),'Archived normalized turns are preserved');
  const messageNodes=page.locator('#conversationContent .message');
  const sources=await messageNodes.evaluateAll(nodes=>nodes.map(node=>node.sourceText));
  const firstIndex=sources.indexOf(firstSource),secondIndex=sources.indexOf(secondSource);
  assert.ok(firstIndex>=0&&secondIndex>=0);
  const firstMessage=messageNodes.nth(firstIndex),secondMessage=messageNodes.nth(secondIndex);
  assert.equal(await firstMessage.locator('.rich-chart:not(.rich-chart-fallback)').count(),9);
  assert.equal(await firstMessage.locator('.rich-chart-fallback').count(),1);
  assert.equal(await secondMessage.locator('.rich-chart:not(.rich-chart-fallback)').count(),7);
  assert.equal(await secondMessage.locator('.rich-chart-fallback').count(),0);
  assert.equal(await secondMessage.locator('svg.rich-static-svg').count(),2);
  assert.equal(await secondMessage.locator('.rich-icon-fallback').count(),0);
  assert.equal(await firstMessage.locator('.rich-icon-fallback').count(),1);
  assert.equal(await secondMessage.locator('pre code').innerText(),'<box><text>THIS MUST REMAIN CODE</text></box>');
  assert.ok((await secondMessage.innerText()).includes('TS32-NATIVE-UI-END'));
  assert.doesNotMatch(await page.locator('#conversationContent').innerText(),/TSRICH(?:CHILD)?[a-f0-9]{32}END/);
  const progress=[];
  for(const [message,height] of [[firstMessage,12],[secondMessage,14]]){
    const bars=await message.locator('.rich-progress-track').evaluateAll(tracks=>tracks.map(track=>{
      const fill=track.querySelector(':scope > .rich-progress-fill'),chart=track.closest('.message').querySelector('.rich-chart:not(.rich-chart-fallback) .rich-chart-color-0');
      return {height:track.getBoundingClientRect().height,fillHeight:fill.getBoundingClientRect().height,width:fill.style.width,fillWidth:fill.getBoundingClientRect().width,trackWidth:track.clientWidth,color:getComputedStyle(fill).backgroundColor,trackColor:getComputedStyle(track).backgroundColor,chartColor:getComputedStyle(chart).fill};
    }));
    assert.deepEqual(bars.map(b=>b.width),['51%','71%','100%']);
    for(const bar of bars){assert.equal(bar.height,height);assert.equal(bar.fillHeight,height);assert.notEqual(bar.color,'rgba(0, 0, 0, 0)');assert.notEqual(bar.color,bar.trackColor);assert.equal(bar.color,bar.chartColor);assert.ok(Math.abs(bar.fillWidth-bar.trackWidth*parseFloat(bar.width)/100)<1.5);}
    progress.push(bars.map(({height,fillHeight,width,color})=>({height,fillHeight,width,color})));
  }
  for(const [message,source] of [[firstMessage,firstSource],[secondMessage,secondSource]]){
    await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").clipboard.writeText("package-qa-sentinel")',awaitPromise:true});
    await message.locator('.message-copy-button').click();let copied;
    for(let i=0;i<40;i++){copied=(await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").clipboard.readText()',returnByValue:true,awaitPromise:true})).result.value;if(copied===source)break;await delay(25);}
    assert.equal(sourceDigest(copied),sourceDigest(source),'Packaged native Copy retains exact original answer source');
  }
  await secondMessage.locator('.rich-progress-track').first().scrollIntoViewIfNeeded();
  if(process.env.READER_SCREENSHOT_DIR)await page.screenshot({path:screenshotBase.replace(/\.json$/,`-${configure?'initial':'restart'}-progress.png`)});
  await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").BrowserWindow.getAllWindows()[0].setSize(680,540)'});await delay(150);
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight}));
  assert.ok(layout.documentWidth<=layout.width&&layout.documentHeight<=layout.height,'No application-wide overflow at minimum window');
  const storedAfter=await page.evaluate(id=>window.desktop.invoke('thread',{id}),summary.id);
  assert.equal(sourceDigest(storedAfter),sourceDigest(storedBefore),'Native rendering and copy do not mutate stored content');
  assert.equal(createHash('sha256').update(await fs.readFile(fixturePath)).digest('hex'),sourceHash);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(externalRequests,[]);
  results.push({pass:configure?'configure-and-import':'restart-persistence',about,metadata,fixture:'private original target conversation; content excluded from evidence',sourceSHA256:sourceHash,charts:[9,7],intentionalFallbackCharts:1,staticSvg:2,iconFallbacks:[1,0],progress,nativeCopyBothAnswersUnchanged:true,archiveRawAndTurnsPreserved:true,minimumWindow:layout,pageErrors,consoleErrors,externalRequests});
  await send('Runtime.evaluate',{expression:'process.mainModule.require("electron").app.quit()'});
 }finally{
  if(ws)ws.close();for(let i=0;i<30&&!exit;i++)await delay(100);
  if(!exit)child.kill();if(browser)await browser.close();logs.push(output);
 }
}
try{
 await runPass(true);await runPass(false);
 const after=await fingerprint(appRoot);assert.deepEqual(after,before,'Packaged app files changed during QA');
 const result={status:'passed',entry,symlinkTarget:await fs.readlink(entry),executable,appRoot,relocatedPathContainsSpaces:entry.includes(' '),profile,productionAppBefore:before,productionAppAfter:after,productionAppFilesUnmodified:true,instrumentation:'Node inspector test-only singleton return; resume debugger-created worker pauses; one test-only native dialog selection for the original supplied export feeds the normal import.pick capability and the original dialog is restored. Shipped executable and resources/app unchanged; no alternate main, resource directory or app argument. Root Electron needs --no-sandbox in this isolated test environment.',results};
 await fs.writeFile(evidencePath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await fs.writeFile(evidencePath.replace(/\.json$/,'.log'),logs.join('\nNEXT LAUNCH\n'));await fs.rm(profile,{recursive:true,force:true});}
