#!/usr/bin/env node
// Production Electron/main/preload/worker/renderer acceptance for 1.0.0 Revision 7 (R6 behavior gates retained).
// Required: READER_ELECTRON, READER_UPGRADE_APP_ROOT, READER_UPGRADE_LABEL (R4/R5/R6), READER_R6_REPORT.
// Optional: READER_APP_ROOT, READER_R6_PACKAGED=1, READER_R6_NATIVE_SHA256,
// THREADSHELF_PLAYWRIGHT_MODULE, READER_R6_SCREENSHOTS.
// The external debugger harness bypasses only the host's unavailable singleton
// socket/debugger inheritance and injects controlled IPC results/delays/failures.
// Native executable and production application bytes are never modified.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=path.resolve(process.env.READER_APP_ROOT||root);
assert.ok(process.env.READER_ELECTRON&&process.env.READER_UPGRADE_APP_ROOT&&process.env.READER_UPGRADE_LABEL&&process.env.READER_R6_REPORT);
const upgradeRoot=path.resolve(process.env.READER_UPGRADE_APP_ROOT);
const upgradeLabel=process.env.READER_UPGRADE_LABEL;
assert.ok(['R4','R5','R6'].includes(upgradeLabel),'Upgrade baseline must explicitly be R4, R5 or R6');
const upgradeRevision=Number(upgradeLabel.slice(1));
const baselineReadme=await fs.readFile(path.join(upgradeRoot,'README.md'),'utf8');
assert.ok(baselineReadme.includes(`Download Revision ${upgradeRevision} `),'Baseline README must identify the requested prior revision');
const reportPath=path.resolve(process.env.READER_R6_REPORT);
await fs.mkdir(path.dirname(reportPath),{recursive:true});
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'ThreadShelf R6 upgrade '));
const profile=path.join(scratch,'profile');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const digest=value=>createHash('sha256').update(value).digest('hex');
const checks=[],audits=[],videos=[],layouts=[],overlays=[];
const upgrade={label:upgradeLabel,revision:upgradeRevision,appRoot:upgradeRoot,files:{}};
for(const file of ['src/core/service.mjs','src/core/state.mjs','src/core/reader-appearance.mjs'])upgrade.files[file]=digest(await fs.readFile(path.join(upgradeRoot,file)));
let active,server;
const singletonLine=(await fs.readFile(path.join(appRoot,'src/desktop/main.cjs'),'utf8')).split('\n').findIndex(line=>line.startsWith('if(!app.requestSingleInstanceLock())'));
assert.ok(singletonLine>=0,'Production singleton entry point exists');

async function launch(holiday=false){
  const binary=await fs.realpath(process.env.READER_ELECTRON);
  if(process.env.READER_R6_NATIVE_SHA256)assert.equal(digest(await fs.readFile(binary)),process.env.READER_R6_NATIVE_SHA256);
  const env={...process.env,THREADSHELF_READER_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const child=spawn(process.env.READER_ELECTRON,['--inspect-brk=0','--remote-debugging-port=0','--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.READER_R6_PACKAGED==='1'?[]:[appRoot])],{env,stdio:['ignore','pipe','pipe']});
  let output='',seq=0,exit=null,ws,browser,patched=false,inspectorError,spawnError;
  const pending=new Map(),pageErrors=[],consoleErrors=[],requests=[];
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('exit',(code,signal)=>exit={code,signal});child.on('error',e=>spawnError=e);
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const endpoint=async regex=>{for(let i=0;i<450;i++){const m=output.match(regex);if(m)return m[1];if(spawnError)throw spawnError;if(exit)throw Error('Electron exited '+JSON.stringify(exit)+'\n'+output);await delay(100);}throw Error('Debugger endpoint unavailable\n'+output);};
  ws=new WebSocket(await endpoint(/Debugger listening on (ws:\/\/[^\s]+)/));
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{void(async()=>{
    const message=JSON.parse(event.data);
    if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}return;}
    if(message.method==='NodeWorker.attachedToWorker')await send('NodeWorker.sendMessageToWorker',{sessionId:message.params.sessionId,message:JSON.stringify({id:1,method:'Runtime.runIfWaitingForDebugger'})});
    if(message.method==='Debugger.paused'){
      if(!patched&&message.params.hitBreakpoints?.length){
        const expression=`app.requestSingleInstanceLock=()=>true;
          process.execArgv=process.execArgv.filter(arg=>!arg.startsWith('--inspect-brk'));
          global.__r6Test={holiday:${holiday},failSettings:false,delayThread:0,failThread:false,threadPending:false};
          global.__r6Register=ipcMain.handle.bind(ipcMain);
          ipcMain.handle=(channel,handler)=>global.__r6Register(channel,async(event,action,args)=>{
            if(action==='settings.save'&&global.__r6Test.failSettings)throw new Error('Synthetic Revision 6 settings failure');
            if(action==='thread'&&global.__r6Test.delayThread){
              const ms=global.__r6Test.delayThread,fail=global.__r6Test.failThread;
              global.__r6Test.delayThread=0;global.__r6Test.threadPending=true;
              await new Promise(resolve=>setTimeout(resolve,ms));global.__r6Test.threadPending=false;
              if(fail)throw new Error('Synthetic stale conversation failure');
            }
            const result=await handler(event,action,args);
            if(action==='bootstrap'){
              global.__r6Test.nativeHoliday=result.holidayStatus;
              return {...result,holidayStatus:{isHoliday:global.__r6Test.holiday}};
            }
            return result;
          });true`;
        const r=await send('Debugger.evaluateOnCallFrame',{callFrameId:message.params.callFrames[0].callFrameId,expression,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));patched=true;
      }
      await send('Debugger.resume');
    }
  })().catch(error=>inspectorError=error);});
  await send('Debugger.enable');await send('NodeWorker.enable',{waitForDebuggerOnStart:false});
  await send('Debugger.setBreakpointByUrl',{urlRegex:'/src/desktop/main\\.cjs$',lineNumber:singletonLine});await send('Runtime.runIfWaitingForDebugger');
  browser=await chromium.connectOverCDP(await endpoint(/DevTools listening on (ws:\/\/[^\s]+)/));
  const context=browser.contexts()[0],page=context.pages()[0]||await context.waitForEvent('page');
  page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push({url:request.url(),type:request.resourceType()});});
  await page.locator('.conversation-row').first().waitFor({timeout:45000});assert.ok(patched);if(inspectorError)throw inspectorError;
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
  const metadata=JSON.parse(await evaluate('JSON.stringify({execPath:process.execPath,appPath:process.mainModule.require("electron").app.getAppPath(),resourcesPath:process.resourcesPath,argv:process.argv,versions:process.versions})'));
  assert.equal(await fs.realpath(metadata.execPath),binary);assert.equal(await fs.realpath(metadata.appPath),await fs.realpath(appRoot));
  if(process.env.READER_R6_PACKAGED==='1')assert.ok(metadata.argv.slice(1).every(arg=>arg.startsWith('--')),'Packaged native launch has no development app argument');
  const resize=async(width,height)=>{await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].setSize(${width},${height})`);await delay(150);};
  const close=async()=>{await evaluate('process.mainModule.require("electron").app.quit()').catch(()=>{});ws.close();for(let i=0;i<50&&!exit;i++)await delay(100);if(!exit)child.kill();await browser.close();audits.push({metadata,holidayOverride:holiday,pageErrors,consoleErrors,rendererHTTPRequests:requests});await fs.writeFile(path.join(scratch,`launch-${audits.length}.log`),output);assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(requests,[]);};
  return {page,evaluate,resize,close};
}
const invoke=(action,args={})=>active.page.evaluate(({action,args})=>window.desktop.invoke(action,args),{action,args});
async function bootstrap(){return invoke('bootstrap');}
async function settings(){await active.page.locator('[data-action="settings"]').click();await active.page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();await active.page.locator('#prefWaveVideoWelcome').waitFor({state:'attached'});}
async function save(){await active.page.locator('#settingsForm button[type="submit"]').click();await active.page.locator('#settingsForm').waitFor({state:'detached'});}
async function cancel(){await active.page.locator('.modal-header [data-action="modal-close"]').click();await active.page.locator('#settingsForm').waitFor({state:'detached'});}
async function noVideo(){await active.page.waitForFunction(()=>!document.querySelector('.threadshelf-wave-video')&&!document.querySelector('.wave-thread-background-enabled'));}
async function videoReady(kind){
  await active.page.waitForFunction(kind=>{const v=document.querySelector('.threadshelf-wave-video');return v?.dataset.waveTheme===kind&&v.readyState>=2&&v.videoWidth===1920&&v.videoHeight===1080&&v.currentTime>.12&&!v.paused&&!v.error;},kind,{timeout:30000});
  const value=await active.page.locator('.threadshelf-wave-video').evaluate(v=>{
    const header=document.querySelector('#threadHeader'),pane=document.querySelector('.content-pane');
    const conversation=!!header?.getClientRects().length,professional=document.documentElement.dataset.uiPalette==='professional';
    const rect=n=>n.getBoundingClientRect().toJSON();
    return {theme:v.dataset.waveTheme,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,muted:v.muted,loop:v.loop,frames:v.getVideoPlaybackQuality?.().totalVideoFrames,source:v.currentSrc.split('/').at(-1),count:document.querySelectorAll('.threadshelf-wave-video').length,conversation,professional,parent:v.parentElement===pane?'content-pane':v.parentElement?.id,parentMarker:!!pane?.classList.contains('wave-thread-background-enabled'),headerCoverage:conversation&&professional?{video:rect(v),header:rect(header),reader:rect(document.querySelector('#readerHost')),videoZ:getComputedStyle(v).zIndex,headerZ:getComputedStyle(header).zIndex}:null};
  });
  assert.equal(value.muted,true);assert.equal(value.loop,true);assert.equal(value.count,1,'Only one decorative video/decoder exists');
  if(value.conversation&&value.professional){
    assert.equal(value.parent,'content-pane');assert.equal(value.parentMarker,true);
    const {video,header,reader,videoZ,headerZ}=value.headerCoverage;
    for(const [name,target] of [['header',header],['reader',reader]])assert.ok(video.left<=target.left+1&&video.right>=target.right-1&&video.top<=target.top+1&&video.bottom>=target.bottom-1,`Professional video covers ${name}`);
    assert.ok(Number(headerZ)>Number(videoZ),'Header controls render above the video');
  }else{assert.equal(value.parent,'readerHost');assert.equal(value.parentMarker,false);}
  videos.push(value);return value;
}
async function open(title){await active.page.locator('.conversation-row').filter({hasText:title}).first().click();await active.page.locator('.message').first().waitFor();await active.page.waitForFunction(title=>document.querySelector('#threadHeader h1')?.textContent===title,title);}
async function closeThread(){await active.page.locator('[data-action="close-thread"]').click();await active.page.locator('#readerHost .welcome').waitFor();assert.equal(await active.page.locator('.message').count(),0);assert.equal(await active.page.locator('#threadHeader').isVisible(),false);assert.equal(await active.page.locator('#conversationNavigator').isVisible(),false);assert.equal(await active.page.locator('#readerSearch').isVisible(),false);assert.equal(await active.page.locator('#readerHost .welcome h1').evaluate(n=>n===document.activeElement),true);await active.page.waitForFunction(()=>!document.querySelector('.content-pane.professional-thread-overlay'));}
async function snapshot(dir){const map={};async function walk(where,rel=''){for(const e of await fs.readdir(where,{withFileTypes:true})){const n=path.join(rel,e.name),full=path.join(where,e.name);if(e.isDirectory())await walk(full,n);else map[n]=digest(await fs.readFile(full));}}await walk(dir);return map;}
async function layout(label){
  const value=await active.page.evaluate(()=>{const rect=n=>n?.getBoundingClientRect().toJSON();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,header:rect(document.querySelector('#threadHeader')),title:rect(document.querySelector('#threadHeader h1')),close:rect(document.querySelector('[data-action="close-thread"]')),welcome:rect(document.querySelector('#readerHost .welcome'))};});
  assert.ok(value.scrollWidth<=value.width+1,`${label} no horizontal global overflow`);assert.ok(value.scrollHeight<=value.height+1,`${label} no vertical global overflow`);
  if(value.close){assert.ok(value.close.left>=value.header.left&&value.close.right<=value.header.right+1&&value.close.top>=value.header.top&&value.close.bottom<=value.header.bottom+1,`${label} close fits header`);assert.ok(value.title.right<=value.close.left+1,`${label} close does not overlap title`);assert.ok(value.close.width>=30&&value.close.height>=30);}
  layouts.push({label,...value});return value;
}
async function screenshot(name){if(process.env.READER_R6_SCREENSHOTS){await fs.mkdir(process.env.READER_R6_SCREENSHOTS,{recursive:true});await active.page.screenshot({path:path.join(process.env.READER_R6_SCREENSHOTS,name+'.png')});}}
async function overlayGeometry(label,{initial=false}={}){
  await active.page.waitForFunction(()=>{const pane=document.querySelector('.content-pane');return pane?.classList.contains('professional-thread-overlay')&&parseFloat(getComputedStyle(pane).getPropertyValue('--professional-thread-overlay-height'))>0;});
  await active.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const value=await active.page.evaluate(()=>{
    const pane=document.querySelector('.content-pane'),host=document.querySelector('#readerHost'),content=document.querySelector('#conversationContent');
    const rect=n=>n.getBoundingClientRect().toJSON(),visible=['#operationBanner','#threadHeader','#readerSearch'].map(s=>document.querySelector(s)).filter(n=>n?.getClientRects().length);
    const styles=getComputedStyle(content);
    return {height:parseFloat(getComputedStyle(pane).getPropertyValue('--professional-thread-overlay-height')),sum:visible.reduce((sum,n)=>sum+n.getBoundingClientRect().height,0),chromeBottom:Math.max(...visible.map(n=>n.getBoundingClientRect().bottom)),pane:rect(pane),host:rect(host),first:rect(document.querySelector('.message')),margin:parseFloat(getComputedStyle(host).marginTop),padding:parseFloat(styles.paddingTop),scrollPadding:parseFloat(styles.scrollPaddingTop),basePadding:innerWidth<=850?14:22,scrollTop:content.scrollTop,headerZ:getComputedStyle(document.querySelector('#threadHeader')).zIndex,hostZ:getComputedStyle(host).zIndex};
  });
  assert.ok(Math.abs(value.height-value.sum)<2,`${label}: overlay inset matches all visible chrome`);
  assert.ok(Math.abs(value.margin+value.height)<2,`${label}: reader overlaps header by measured inset`);
  assert.ok(Math.abs(value.padding-value.height-value.basePadding)<2,`${label}: initial content has base padding plus inset`);
  assert.ok(Math.abs(value.scrollPadding-value.height)<2,`${label}: browser navigation reserves chrome inset`);
  assert.ok(value.host.top<value.chromeBottom-value.height/2,`${label}: reader physically extends beneath header`);
  assert.ok(Number(value.headerZ)>Number(value.hostZ),`${label}: header controls remain above reader`);
  if(initial){assert.ok(value.scrollTop<2,`${label}: starts at beginning`);assert.ok(value.first.top>=value.chromeBottom+value.basePadding-2,`${label}: initial first message is below chrome`);}
  overlays.push({label,...value});return value;
}
async function targetClearance(label,selector){
  try{await active.page.waitForFunction(selector=>{
    const node=document.querySelector(selector);if(!node)return false;
    const chrome=['#operationBanner','#threadHeader','#readerSearch'].map(s=>document.querySelector(s)).filter(n=>n?.getClientRects().length),bottom=Math.max(...chrome.map(n=>n.getBoundingClientRect().bottom)),r=node.getBoundingClientRect(),host=document.querySelector('#readerHost').getBoundingClientRect();
    return r.top>=bottom-1&&r.bottom<=host.bottom+1;
  },selector,{timeout:10000});}catch(error){
    const failure=await active.page.evaluate(selector=>({target:document.querySelector(selector)?.getBoundingClientRect().toJSON(),chrome:['#operationBanner','#threadHeader','#readerSearch'].map(s=>{const n=document.querySelector(s);return {selector:s,visible:!!n?.getClientRects().length,rect:n?.getBoundingClientRect().toJSON()};}),host:document.querySelector('#readerHost')?.getBoundingClientRect().toJSON(),scrollTop:document.querySelector('#conversationContent')?.scrollTop,scrollPadding:getComputedStyle(document.querySelector('#conversationContent')).scrollPaddingTop,current:document.querySelector(selector)?.outerHTML,trace:window.__r6ScrollTrace}),selector);
    overlays.push({label,failed:true,...failure});await screenshot('navigation-clearance-failure');throw new Error(`${label}: ${JSON.stringify(failure)}`,{cause:error});
  }
  overlays.push({label,target:await active.page.locator(selector).first().evaluate(n=>n.getBoundingClientRect().toJSON())});
}
async function actualMessageBehindHeader(){
  await settings();await active.page.locator('#prefWaveVideoBackground').uncheck();await save();await noVideo();
  await active.page.locator('[data-action="read-start"]').click();await overlayGeometry('wave-off initial overlay',{initial:true});
  const clip=await active.page.locator('#threadHeader').evaluate(n=>{const r=n.getBoundingClientRect();return {x:Math.ceil(r.x+12),y:Math.ceil(r.y+12),width:Math.floor(r.width-24),height:Math.floor(r.height-24)};});
  // Hide only foreground chrome for an objective pixel comparison. All message
  // text, card backgrounds and header materials remain the production styles.
  const mask=await active.page.addStyleTag({content:'#threadHeader > *{visibility:hidden!important}'});
  let before,after,under;
  try{
    before=await active.page.screenshot({clip});
    await active.page.locator('#conversationContent').evaluate(content=>{
      content.dispatchEvent(new WheelEvent('wheel',{deltaY:600}));
      const message=content.querySelector('.message.assistant'),header=document.querySelector('#threadHeader').getBoundingClientRect();
      content.scrollTo({top:content.scrollTop+message.getBoundingClientRect().top-header.top-12,behavior:'instant'});
    });
    await delay(250);
    under=await active.page.evaluate(()=>{const header=document.querySelector('#threadHeader').getBoundingClientRect();return [...document.querySelectorAll('.message')].map(n=>({turn:n.dataset.turnIndex,text:n.sourceText,rect:n.getBoundingClientRect().toJSON()})).filter(n=>n.rect.top<header.bottom&&n.rect.bottom>header.top);});
    assert.ok(under.some(n=>n.text?.includes('Retained response')),'An actual retained message occupies the header backdrop with waves off');
    after=await active.page.screenshot({clip});
  }finally{await mask.evaluate(n=>n.remove());}
  const pixels=await active.page.evaluate(async({before,after})=>{
    const images=[];for(const b64 of [before,after]){const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);images.push(ctx.getImageData(0,0,image.width,image.height).data);}
    let total=0,changed=0,count=0;for(let i=0;i<images[0].length;i+=4)for(let c=0;c<3;c++){const delta=Math.abs(images[0][i+c]-images[1][i+c]);total+=delta;if(delta>1)changed++;count++;}return {mean:total/count,changed:changed/count};
  },{before:before.toString('base64'),after:after.toString('base64')});
  overlays.push({label:'actual retained message visible beneath header with wave off',pixels,under,clip});
  assert.ok(pixels.mean>.3&&pixels.changed>.01,`Scrolled production message changes real header pixels: ${JSON.stringify(pixels)}`);
  if(process.env.READER_R6_SCREENSHOTS){await fs.mkdir(process.env.READER_R6_SCREENSHOTS,{recursive:true});await fs.writeFile(path.join(process.env.READER_R6_SCREENSHOTS,'overlay-empty-header-wave-off.png'),before);await fs.writeFile(path.join(process.env.READER_R6_SCREENSHOTS,'overlay-message-header-wave-off.png'),after);}
  await screenshot('overlay-message-behind-header-wave-off');
  await active.page.locator('[data-action="read-start"]').click();await overlayGeometry('read-start clears overlaid chrome',{initial:true});
  await settings();await active.page.locator('#prefUiPalette').selectOption('platinum');await active.page.waitForFunction(()=>!document.querySelector('.professional-thread-overlay'));await cancel();await overlayGeometry('cancel restores Professional overlay',{initial:true});
  if(process.env.READER_R6_SCROLL_TRACE==='1')await active.page.evaluate(()=>{
    const content=document.querySelector('#conversationContent'),trace=window.__r6ScrollTrace=[];
    const record=value=>{trace.push({time:performance.now(),scrollTop:content.scrollTop,scrollPadding:getComputedStyle(content).scrollPaddingTop,...value});if(trace.length>200)trace.shift();};
    for(const method of ['scrollIntoView','scrollTo']){const original=Element.prototype[method];Element.prototype[method]=function(...args){if(this===content||content.contains(this))record({method,node:this.id||this.className,args,stack:new Error().stack});return original.apply(this,args);};}
    content.addEventListener('scroll',()=>record({event:'scroll'}),{passive:true});
    document.querySelector('#readerFindInput').addEventListener('input',()=>record({event:'input'}));record({event:'trace-start'});
  });
  await active.page.locator('[data-action="find-open"]').click();await active.page.locator('#readerFindInput').fill('Paragraph 12');await targetClearance('find result below header and search','.highlight.current');await overlayGeometry('search increases overlay inset');
  await active.page.locator('[data-action="find-close"]').click();
  await active.page.locator('[data-action="bookmarks-dialog"]').click();await active.page.locator('[data-action="reading-open"]').first().click();await active.page.locator('.message').first().waitFor();await targetClearance('bookmark target below header','.message[data-turn-index="0"] .message-header');
  await active.page.locator('[data-action="read-start"]').click();await overlayGeometry('bookmark return then read-start',{initial:true});
  await settings();await active.page.locator('#prefWaveVideoBackground').check();await save();
}

const fixture={collection:`${upgradeLabel} retained archive`,provider:'openai',sourceFile:`${upgradeLabel.toLowerCase()}-synthetic.json`,conversationKey:'retained',title:'Retained conversation — Árvíztűrő 日本語 — long title for responsive controls',turns:[
  {user:'Opening question with quartz keyword and original source text.',turn_index:0},
  {thinking:'A retained Thinking section with quartz and **formatting**, whose text stays sharp above its translucent surface.',turn_index:1},
  {ai:'## Retained response\n\n```javascript\nconst answer = 42;\n```\n\n'+Array.from({length:24},(_,i)=>`Paragraph ${i+1}: quartz evidence is kept in the original archive. This is synthetic reading-position content with enough length to exercise scrolling.`).join('\n\n'),turn_index:2},
  ...Array.from({length:12},(_,i)=>({[i%2?'ai':'user']:`Retained turn ${i+3}. `+'Synthetic archive verification text. '.repeat(20),turn_index:i+3}))]};
const second={...fixture,conversationKey:'second',title:'Second retained conversation',turns:[{user:'Second question',turn_index:0},{ai:'Second response',turn_index:1}]};
let seeded,archiveBefore,readingBefore,threadBefore,readerPreferenceBefore;
try{
  const {ApplicationService:Previous}=await import(pathToFileURL(path.join(upgradeRoot,'src/core/service.mjs')));
  const previous=await new Previous({dataDir:profile}).init();
  seeded=previous.store.upsert(fixture).summary;previous.store.upsert(second);
  await previous.handle('settings.save',{values:{uiPalette:'platinum',theme:'dark',codeTheme:'monokai',waveVideoBackground:true,promptExpandStyle:'header-action',compact:false,language:'en',animations:true,...(upgradeRevision>=5?{waveVideoWelcome:false,holidayVideoWelcome:true}:{})}});
  const key=JSON.stringify({mode:'local',id:seeded.id});
  await previous.handle('reading.save',{key,bookmark:{turnIndex:0,role:'user',title:fixture.title,ref:{mode:'local',id:seeded.id}}});
  threadBefore=previous.store.thread({id:seeded.id});readingBefore=(await previous.handle('bootstrap')).reading;
  await previous.shutdown();archiveBefore=await snapshot(path.join(profile,'local-storage-v2'));readerPreferenceBefore=await fs.readFile(path.join(profile,'reader-appearance.json'),'utf8');
  active=await launch(false);
  const initial=await bootstrap();assert.equal(initial.version,'1.0.0');assert.equal(initial.settings.uiPalette,'platinum');assert.equal(initial.settings.codeTheme,'monokai');assert.equal(initial.settings.waveVideoBackground,true);assert.equal(initial.settings.promptExpandStyle,'header-action');assert.equal(initial.settings.waveVideoWelcome,false);assert.equal(initial.settings.holidayVideoWelcome,upgradeRevision>=5);assert.deepEqual(initial.reading,readingBefore);assert.deepEqual(await invoke('thread',{mode:'local',id:seeded.id}),threadBefore);assert.equal(await fs.readFile(path.join(profile,'reader-appearance.json'),'utf8'),readerPreferenceBefore);await noVideo();checks.push(`actual ${upgradeLabel} profile upgrades in place; data, bookmarks and existing preferences retained; ${upgradeRevision===4?'R5 options default off':`non-default ${upgradeLabel} holiday selection retained`}`);

  await settings();const palette=await active.page.locator('#prefUiPalette option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,text:n.textContent})));const p=palette.findIndex(x=>x.value==='platinum');assert.equal(palette[p+1].value,'professional');assert.equal(palette[p+1].text,'Professional');assert.equal(await active.page.locator('#welcomeVideoOptions').isVisible(),true);assert.equal(await active.page.locator('#holidayVideoOption').isVisible(),false);
  await active.page.locator('#prefUiPalette').selectOption('professional');await active.page.locator('#prefWaveVideoWelcome').check();await videoReady('dark');assert.equal(await active.page.locator('#holidayVideoOption').isVisible(),true);await active.page.locator('#prefHolidayVideoWelcome').check();await videoReady('dark');await cancel();await noVideo();assert.equal(await active.page.evaluate(()=>document.documentElement.dataset.uiPalette),'platinum');assert.equal((await bootstrap()).settings.waveVideoWelcome,false);
  await settings();await active.page.locator('#prefUiPalette').selectOption('professional');await active.page.locator('#prefWaveVideoWelcome').check();await active.page.locator('#prefHolidayVideoWelcome').check();await save();await videoReady('dark');assert.equal((await bootstrap()).settings.holidayVideoWelcome,true);await screenshot('welcome-professional-dark');checks.push('Professional follows Platinum; dependent toggles preview, cancel and save correctly');

  await open(fixture.title);await videoReady('dark');const appearance=await active.page.evaluate(()=>{const h=document.querySelector('#threadHeader'),thinking=document.querySelector('.message.thinking');return {header:getComputedStyle(h).backdropFilter,headerBefore:getComputedStyle(h,'::before').backdropFilter,thinking:getComputedStyle(thinking,'::before').backdropFilter,text:getComputedStyle(thinking).filter,code:getComputedStyle(document.documentElement).getPropertyValue('--code-bg'),palette:document.documentElement.dataset.uiPalette};});assert.equal(appearance.palette,'professional');assert.equal(appearance.header,'none');assert.ok(appearance.headerBefore.includes('12px'),'Professional header uses 12px backdrop blur');assert.ok(appearance.thinking.includes('2px'));assert.equal(appearance.text,'none');assert.equal((await bootstrap()).settings.codeTheme,'monokai');await layout('Professional dark desktop');await screenshot('reader-professional-dark');await actualMessageBehindHeader();
  await active.page.locator('[data-action="find-open"]').click();await active.page.locator('#readerFindInput').fill('quartz');await active.page.waitForFunction(()=>document.querySelector('#findCount').textContent.length>0);await closeThread();assert.equal(await active.page.locator('#readerFindInput').inputValue(),'');assert.equal(await active.page.locator('#findCount').textContent(),'');await videoReady('dark');checks.push('Professional header uses 12px glass over real scrolling messages with waves off; Thinking uses 2px blur; navigation clears overlay and close returns to welcome');

  await open(fixture.title);await active.page.locator('#conversationContent').evaluate(el=>{el.dispatchEvent(new WheelEvent('wheel',{deltaY:900}));el.scrollTo({top:900,behavior:'instant'});});await delay(700);const scrollBefore=await active.page.locator('#conversationContent').evaluate(el=>el.scrollTop);assert.ok(scrollBefore>500);await closeThread();await active.page.waitForFunction(async key=>!!(await window.desktop.invoke('bootstrap')).reading.positions[key],key);const stored=(await bootstrap()).reading.positions[key];assert.ok(stored);await open(fixture.title);await delay(300);const scrollAfter=await active.page.locator('#conversationContent').evaluate(el=>el.scrollTop);assert.ok(Math.abs(scrollAfter-scrollBefore)<60,`Saved position restored: ${scrollBefore} -> ${scrollAfter}`);
  const anchor=await active.page.evaluate(stored=>{const node=[...document.querySelectorAll('.message')].find(n=>Number(n.dataset.turnIndex)===stored.turnIndex&&n.dataset.role===stored.role),r=node.getBoundingClientRect(),header=document.querySelector('#threadHeader').getBoundingClientRect();return {point:r.top+r.height*stored.offset,visibleLine:header.bottom+16};},stored);
  assert.ok(Math.abs(anchor.point-anchor.visibleLine)<3,'Resumed saved anchor is at visible reading line below overlay');overlays.push({label:'reopened anchor remains below header',...anchor});
  await active.page.evaluate(()=>{document.querySelector('#conversationContent').scrollTo({top:0,behavior:'instant'});document.querySelector('[data-action="resume"]').click();});
  await active.page.waitForFunction(top=>Math.abs(document.querySelector('#conversationContent').scrollTop-top)<60,scrollBefore);await overlayGeometry('Resume control restores unobscured anchor');assert.deepEqual((await bootstrap()).reading.bookmarks,readingBefore.bookmarks);checks.push('close persists the reading anchor; reopening resumes it and preserves bookmarks');

  for(const fail of [false,true]){await active.evaluate(`Object.assign(global.__r6Test,{delayThread:1000,failThread:${fail}})`);await active.page.locator('.conversation-row').filter({hasText:second.title}).click();await delay(100);await closeThread();await delay(1200);assert.equal(await active.page.locator('.message').count(),0);assert.equal(await active.page.locator('#threadHeader').isVisible(),false);assert.equal(await active.page.locator('#toastRoot').innerText(),'');await videoReady('dark');if(!fail)await open(fixture.title);}
  checks.push('close invalidates delayed conversation success and failure without reopening or stale error');

  await active.close();active=await launch(true);await videoReady('holiday');assert.equal((await bootstrap()).settings.uiPalette,'professional');await screenshot('welcome-holiday-dark');await open(fixture.title);await videoReady('dark');await closeThread();await videoReady('holiday');
  await settings();await active.page.locator('#prefTheme').selectOption('light');await save();await videoReady('holiday');await open(fixture.title);await videoReady('light');await closeThread();await videoReady('holiday');checks.push('restart retains settings; holiday loop plays only on welcome in either theme; conversations retain normal day/dark waves');

  await settings();await active.page.locator('#prefWaveVideoWelcome').uncheck();await noVideo();assert.equal(await active.page.locator('#holidayVideoOption').isVisible(),false);assert.equal(await active.page.locator('#prefHolidayVideoWelcome').isChecked(),true);await save();await noVideo();await open(fixture.title);await videoReady('light');await closeThread();await noVideo();
  await settings();await active.page.locator('#prefWaveVideoWelcome').check();await active.page.locator('#prefWaveVideoBackground').uncheck();await noVideo();assert.equal(await active.page.locator('#welcomeVideoOptions').isVisible(),false);await save();await noVideo();await open(fixture.title);await noVideo();await closeThread();await noVideo();await settings();await active.page.locator('#prefWaveVideoBackground').check();assert.equal(await active.page.locator('#prefWaveVideoWelcome').isChecked(),true);assert.equal(await active.page.locator('#prefHolidayVideoWelcome').isChecked(),true);await save();await videoReady('holiday');checks.push('holiday setting cannot independently enable video; both master and welcome switches gate playback; hidden selections persist');

  await active.page.emulateMedia({reducedMotion:'reduce'});await noVideo();await active.page.emulateMedia({reducedMotion:'no-preference'});await videoReady('holiday');await settings();await active.page.locator('#prefAnimations').uncheck();await noVideo();await cancel();await videoReady('holiday');
  await settings();await active.page.locator('#prefWaveVideoWelcome').uncheck();await noVideo();await active.evaluate('global.__r6Test.failSettings=true');await active.page.locator('#settingsForm button[type="submit"]').click();await active.page.locator('.toast.error').waitFor();await videoReady('holiday');assert.equal((await bootstrap()).settings.waveVideoWelcome,true);await active.evaluate('global.__r6Test.failSettings=false');await cancel();checks.push('reduced motion and animation suppression work; failed settings saves restore committed media appearance');

  await settings();await active.page.locator('#prefHolidayVideoWelcome').uncheck();await active.page.locator('#prefTheme').selectOption('system');await save();await active.page.emulateMedia({colorScheme:'dark'});await videoReady('dark');await active.page.emulateMedia({colorScheme:'light'});await videoReady('light');checks.push('System color mode follows OS changes on welcome when holiday option is off');

  await active.resize(680,540);
  for(const language of ['en','hu','de','fr','ja']){
    await settings();await active.page.locator('#prefLanguage').selectOption(language);await active.page.locator('#prefFont').selectOption('xl');await save();await layout(`welcome ${language} xl 680x540`);await open(fixture.title);await active.page.locator('[data-action="read-start"]').click();await overlayGeometry(`initial ${language} xl 680x540`,{initial:true});await layout(`reader ${language} xl 680x540`);if(language==='ja'){await screenshot('reader-minimum-ja-xl');await active.page.locator('[data-action="find-open"]').click();await active.page.locator('#readerFindInput').fill('Paragraph 12');await targetClearance('Japanese XL find target below chrome','.highlight.current');await overlayGeometry('Japanese XL search inset');await screenshot('reader-minimum-ja-xl-search');await active.page.locator('[data-action="find-close"]').click();}await settings();assert.equal(await active.page.locator('#welcomeVideoOptions').isVisible(),true);assert.equal(await active.page.locator('#holidayVideoOption').isVisible(),true);await layout(`settings ${language} xl 680x540`);if(language==='ja')await screenshot('settings-minimum-ja-xl');await cancel();await closeThread();
  }
  await settings();await active.page.locator('#prefLanguage').selectOption('en');await active.page.locator('#prefFont').selectOption('normal');await save();await open(fixture.title);for(const [w,h] of [[1600,600],[680,1000],[1440,1000]]){await active.resize(w,h);await layout(`reader ${w}x${h}`);}await closeThread();checks.push('all five locales at minimum size with XL text; short/wide and tall layouts have no global overflow or close/title overlap');

  const remote={...second,collection:'Remote synthetic',sourceFile:'/synthetic/remote.json',conversationKey:'remote',title:'Server conversation',provider:'openai'};
  server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');let value;if(u.pathname==='/api/collections')value={collections:['Remote synthetic']};else if(u.pathname==='/api/files')value={files:[{...remote,turns:undefined,turnCount:2}]};else if(u.pathname==='/api/thread')value=remote;else if(u.pathname==='/api/health')value={ok:true};else{res.statusCode=404;value={error:'Unknown synthetic endpoint'};}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await settings();await active.page.locator('#prefHolidayVideoWelcome').check();await active.page.locator('[data-action="settings-tab"][data-tab="sources"]').click();await active.page.locator('#prefServer').fill(`http://127.0.0.1:${server.address().port}/`);await save();await active.page.locator('[data-action="mode-server"]').click();await active.page.locator('.conversation-row').filter({hasText:remote.title}).waitFor();await videoReady('holiday');await open(remote.title);await videoReady('light');await closeThread();await videoReady('holiday');await active.page.locator('[data-action="mode-local"]').click();await active.page.locator('.conversation-row').filter({hasText:fixture.title}).waitFor();await videoReady('holiday');checks.push('real ThreadShelf-shaped HTTP fixture exercises Server welcome, conversation, close and return to Local');

  assert.deepEqual(await invoke('thread',{mode:'local',id:seeded.id}),threadBefore);assert.deepEqual((await bootstrap()).reading.bookmarks,readingBefore.bookmarks);await active.close();active=null;assert.deepEqual(await snapshot(path.join(profile,'local-storage-v2')),archiveBefore);checks.push('retained archive files remain byte-identical after complete upgrade/UI/server workflow');
  assert.equal(checks.length,12);assert.equal(videos.length,24);assert.equal(layouts.length,19);assert.equal(audits.length,2);assert.equal(Object.keys(archiveBefore).length,9);
  await fs.writeFile(reportPath,JSON.stringify({version:'1.0.0',revision:7,passed:true,diagnosticScrollTrace:process.env.READER_R6_SCROLL_TRACE==='1',upgrade,checks,videos,layouts,overlays,audits,archiveFilesUnchanged:Object.keys(archiveBefore).length,fixture:`Synthetic ${upgradeLabel}-generated archive; controlled local ThreadShelf HTTP response shape; holiday forced through external test harness only`,nativeWindowsExecuted:false},null,2)+'\n');
  console.log(JSON.stringify({passed:true,groups:checks.length,report:reportPath}));
}catch(error){await fs.writeFile(reportPath,JSON.stringify({version:'1.0.0',revision:7,passed:false,diagnosticScrollTrace:process.env.READER_R6_SCROLL_TRACE==='1',upgrade,error:error.stack,checks,videos,layouts,overlays,audits,scratch},null,2)+'\n');throw error;}
finally{if(active)await active.close().catch(()=>{});if(server)await new Promise(resolve=>server.close(resolve));}
