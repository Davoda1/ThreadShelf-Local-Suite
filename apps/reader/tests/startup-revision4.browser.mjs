#!/usr/bin/env node
// Real production Electron main, sandboxed preload and archive worker. The test
// harness delays the heavy renderer file and then the bootstrap IPC independently
// so the initial appearance can be inspected before either is available.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {ApplicationService} from '../src/core/service.mjs';
import {DEFAULTS} from '../src/core/state.mjs';
import {UI_PALETTES} from '../src/core/themes.mjs';

const require=createRequire(import.meta.url);
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),appRoot=path.resolve(process.env.READER_APP_ROOT||root);
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.0.0-revision-4/startup'));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-startup-r4-'));
await fs.mkdir(evidence,{recursive:true});
const seedDir=path.join(temp,'seed'),seed=await new ApplicationService({dataDir:seedDir}).init();
await seed.store.upsert({collection:'Startup fixture',provider:'openai',sourceFile:'startup.json',conversationKey:'startup',title:'Preserved startup fixture',turns:[{user:'A preserved question',turn_index:0},{ai:'A preserved answer.',turn_index:1}]});
await seed.shutdown();

const labels={en:'Loading…',hu:'Betöltés…',de:'Wird geladen…',fr:'Chargement…'};
const scenarios=UI_PALETTES.flatMap((palette,i)=>['light','dark'].map(theme=>({name:palette.id+'-'+theme,palette:palette.id,theme,language:['en','hu','de','fr'][i%4],width:i%2?1280:680,height:i%2?800:540})));
scenarios.push(
 {name:'system-dark',palette:'modern-oled',theme:'system',native:'dark',width:680,height:540,flipSystem:true},
 {name:'system-light',palette:'modern',theme:'system',native:'light',width:1920,height:540},
 {name:'animations-disabled',palette:'modern',theme:'dark',animations:false,width:680,height:540},
 {name:'reduced-motion',palette:'forest',theme:'light',reducedMotion:true,width:680,height:540},
 {name:'forced-colors',palette:'modern',theme:'dark',forcedColors:true,width:680,height:540},
 {name:'high-contrast',palette:'modern',theme:'light',highContrast:true,width:680,height:540},
 {name:'backup-recovery',palette:'ember',theme:'dark',language:'hu',backup:true,width:680,height:540},
 {name:'bootstrap-retry',palette:'amethyst',theme:'dark',language:'fr',retry:true,width:680,height:540},
 {name:'corrupt-preferences',palette:'default',theme:'system',native:'light',corrupt:true,width:680,height:540},
);
const results=[],pageErrors=[],consoleErrors=[],captures=[];
let application,page,currentName;
function hexToRgb(hex){const n=Number.parseInt(hex.slice(1),16);return `rgb(${n>>16}, ${(n>>8)&255}, ${n&255})`;}
function expectedColors(palette,theme){const tokens=UI_PALETTES.find(p=>p.id===palette).tokens[theme];return {bg:tokens.bg||(theme==='dark'?'#171c24':'#f5f6f8'),accent:tokens.accent||(theme==='dark'?'#8ac8b7':'#396a63')};}
function envelope(data){return JSON.stringify({schemaVersion:1,data},null,2)+'\n';}
async function close(){if(application){await application.evaluate(()=>{global.startupQA.releaseFile();global.startupQA.releaseBootstrap();}).catch(()=>{});await application.close();application=null;page=null;}}
async function capture(name){const file=path.join(evidence,`Startup-${name}.png`);const png=await application.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));await fs.writeFile(file,Buffer.from(png,'base64')); captures.push(path.basename(file));}
async function snapshot(){return page.evaluate(()=>{
 const loader=document.querySelector('.startup-loader'),wrap=document.querySelector('.app-loading'),dots=[...document.querySelectorAll('.startup-dot')],orbits=[...document.querySelectorAll('.startup-orbit')];
 const css=getComputedStyle(document.documentElement),rect=loader?.getBoundingClientRect();
 return {theme:document.documentElement.dataset.theme,palette:document.documentElement.dataset.uiPalette,codeTheme:document.documentElement.dataset.codeTheme,language:document.documentElement.lang,contrast:document.documentElement.dataset.contrast,motion:document.documentElement.dataset.animations,
  role:loader?.getAttribute('role'),label:loader?.getAttribute('aria-label'),busy:document.querySelector('#app')?.getAttribute('aria-busy'),visibleText:wrap?.innerText,bodyBackground:getComputedStyle(document.body).backgroundColor,bg:css.getPropertyValue('--bg').trim(),accent:css.getPropertyValue('--accent').trim(),
  dimensions:{width:innerWidth,height:innerHeight,bodyW:document.body.scrollWidth,bodyH:document.body.scrollHeight,docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight,loader:rect?.toJSON()},
  dots:dots.map(dot=>{const s=getComputedStyle(dot);return {rect:dot.getBoundingClientRect().toJSON(),color:s.backgroundColor,opacity:s.opacity,visibility:s.visibility,display:s.display};}),
  orbits:orbits.map(orbit=>{const s=getComputedStyle(orbit);return {animation:s.animationName,duration:s.animationDuration,transform:s.transform,opacity:s.opacity};}),
  globals:{require:typeof require,process:typeof process,startupKeys:Object.keys(window.desktop.startupAppearance).sort(),frozen:Object.isFrozen(window.desktop.startupAppearance)},
  shell:!!document.querySelector('.shell'),media:{reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,forced:matchMedia('(forced-colors:active)').matches}
 };});}
function assertGeometry(s,label){const d=s.dimensions;assert.ok(d.bodyW<=d.width&&d.docW<=d.width&&d.bodyH<=d.height&&d.docH<=d.height,label+': no global overflow');assert.ok(Math.abs(d.loader.x+d.loader.width/2-d.width/2)<1,label+': centered horizontally');assert.ok(Math.abs(d.loader.y+d.loader.height/2-d.height/2)<1,label+': centered vertically');assert.equal(d.loader.width,d.loader.height);assert.ok(d.loader.width>=32&&d.loader.width<=64);for(const dot of s.dots){assert.ok(dot.rect.width>0&&dot.rect.height>0);assert.notEqual(dot.display,'none');assert.notEqual(dot.visibility,'hidden');assert.ok(Number(dot.opacity)>0);}}
async function run(scenario){
 currentName=scenario.name;const dataDir=path.join(temp,scenario.name);await fs.cp(seedDir,dataDir,{recursive:true});
 const settings={...DEFAULTS,theme:scenario.theme,language:scenario.language||'en',animations:scenario.animations!==false,highContrast:!!scenario.highContrast};
 const appearance={uiPalette:scenario.palette,codeTheme:'nord'};
 for(const [name,value]of [['settings.json',settings],['appearance.json',appearance]]){await fs.writeFile(path.join(dataDir,name),envelope(value));if(scenario.backup){await fs.writeFile(path.join(dataDir,name+'.bak'),envelope(value));await fs.writeFile(path.join(dataDir,name),'{corrupt primary fixture');}if(scenario.corrupt){await fs.writeFile(path.join(dataDir,name),'{corrupt primary fixture');await fs.writeFile(path.join(dataDir,name+'.bak'),'{corrupt backup fixture');}}
 await fs.writeFile(path.join(dataDir,'window.json'),JSON.stringify({width:scenario.width,height:scenario.height,maximized:false,fullscreen:false}));
 const originalBad=scenario.corrupt?await fs.readFile(path.join(dataDir,'settings.json'),'utf8'):null;
 const harness=path.join(temp,scenario.name+'-harness');await fs.mkdir(harness);await fs.writeFile(path.join(harness,'package.json'),JSON.stringify({name:'threadshelf-startup-qa',version:'3.0.0',main:'main.cjs'}));
 await fs.writeFile(path.join(harness,'main.cjs'),`
const {app,ipcMain,session,net,nativeTheme}=require('electron');
${process.env.READER_TEST_SOCKETLESS==='1'?'app.requestSingleInstanceLock=()=>true;':''}
nativeTheme.themeSource=${JSON.stringify(scenario.native||'light')};
global.startupQA={fileRequested:false,bootstrapRequests:0,firstWindow:null,ready:null};
const fileGate=new Promise(resolve=>global.startupQA.releaseFile=resolve),bootstrapGate=new Promise(resolve=>global.startupQA.releaseBootstrap=resolve);
const originalHandle=ipcMain.handle.bind(ipcMain);let failOnce=${scenario.retry===true};
ipcMain.handle=(channel,handler)=>originalHandle(channel,channel==='reader:invoke'?async(event,action,args)=>{if(action==='bootstrap'){global.startupQA.bootstrapRequests++;await bootstrapGate;if(failOnce){failOnce=false;throw new Error('Synthetic bootstrap retry fixture');}}return handler(event,action,args);}:handler);
app.on('browser-window-created',(_event,win)=>{global.startupQA.firstWindow={background:win.getBackgroundColor(),preferences:win.webContents.getLastWebPreferences()};win.once('ready-to-show',()=>{global.startupQA.ready={visible:win.isVisible(),background:win.getBackgroundColor()};});});
app.whenReady().then(()=>session.defaultSession.protocol.handle('file',async request=>{if(new URL(request.url).pathname.endsWith('/app.js')){global.startupQA.fileRequested=true;await fileGate;}const response=await net.fetch(request.url,{bypassCustomProtocolHandlers:true});if(new URL(request.url).pathname.endsWith('.js')){const headers=new Headers(response.headers);headers.set('Content-Type','text/javascript');return new Response(response.body,{status:response.status,headers});}return response;}));
require(${JSON.stringify(path.join(appRoot,'src/desktop/main.cjs'))});
`);
 const env={...process.env,THREADSHELF_READER_TEST_DATA:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 application=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',harness],env,colorScheme:scenario.native||'light',timeout:45000});
 page=await application.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>pageErrors.push({scenario:scenario.name,error:error.message}));page.on('console',message=>{if(message.type()==='error')consoleErrors.push({scenario:scenario.name,error:message.text()});});
 await page.locator('.startup-loader').waitFor({state:'visible'});
 await page.waitForFunction(()=>window.desktop?.startupAppearance&&document.documentElement.dataset.uiPalette);
 if(scenario.reducedMotion)await page.emulateMedia({reducedMotion:'reduce'});
 if(scenario.forcedColors)await page.emulateMedia({forcedColors:'active'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const early=await snapshot(),native=await application.evaluate(({BrowserWindow})=>({fileRequested:global.startupQA.fileRequested,bootstrapRequests:global.startupQA.bootstrapRequests,firstWindow:global.startupQA.firstWindow,ready:global.startupQA.ready,currentBackground:BrowserWindow.getAllWindows()[0].getBackgroundColor(),visible:BrowserWindow.getAllWindows()[0].isVisible()}));
 const expectedTheme=scenario.theme==='system'?(scenario.native||'light'):scenario.theme,colors=expectedColors(scenario.palette,expectedTheme);
 assert.equal(native.fileRequested,true);assert.equal(native.bootstrapRequests,0,'Heavy app must remain unloaded during first appearance checks');assert.equal(early.shell,false);assert.equal(early.theme,expectedTheme);assert.equal(early.palette,scenario.palette);assert.equal(early.language,scenario.corrupt?'en':settings.language);assert.equal(early.label,labels[scenario.corrupt?'en':settings.language]);assert.equal(early.role,'status');assert.equal(early.busy,'true');assert.equal(early.visibleText,'','No visible Loading text');assert.equal(early.dots.length,5);assert.equal(early.orbits.length,5);assert.equal(early.bg,colors.bg);assert.equal(early.accent,colors.accent);if(!scenario.forcedColors){assert.equal(early.bodyBackground,hexToRgb(colors.bg));assert.ok(early.dots.every(dot=>dot.color===hexToRgb(colors.accent)));}assert.equal(native.currentBackground.toLowerCase(),colors.bg);if(native.ready)assert.equal(native.ready.background.toLowerCase(),colors.bg);assert.equal(native.firstWindow.preferences.sandbox,true);assert.equal(native.firstWindow.preferences.contextIsolation,true);assert.equal(native.firstWindow.preferences.nodeIntegration,false);assert.deepEqual(early.globals,{require:'undefined',process:'undefined',startupKeys:['animations','codeTheme','highContrast','language','theme','uiPalette'],frozen:true});assertGeometry(early,scenario.name);
 if(scenario.highContrast)assert.equal(early.contrast,'high');
 if(scenario.reducedMotion||scenario.animations===false){assert.ok(early.orbits.every(orbit=>orbit.animation==='none'));const before=early.dots.map(dot=>dot.rect);await page.waitForTimeout(250);assert.deepEqual((await snapshot()).dots.map(dot=>dot.rect),before,'Reduced motion leaves static visible dots');}else{assert.ok(early.orbits.every(orbit=>orbit.animation!=='none'));await page.waitForTimeout(250);assert.notDeepEqual((await snapshot()).dots.map(dot=>dot.rect),early.dots.map(dot=>dot.rect),'Dots really move');}
 await capture(scenario.name+'-before-bundle');
 let systemFlip;
 if(scenario.flipSystem){await application.evaluate(({nativeTheme})=>nativeTheme.themeSource='light');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');systemFlip=await snapshot();assert.equal(systemFlip.palette,scenario.palette);assert.equal(systemFlip.bg,expectedColors(scenario.palette,'light').bg);await application.evaluate(({nativeTheme})=>nativeTheme.themeSource='dark');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');}
 await application.evaluate(()=>global.startupQA.releaseFile());
 await page.waitForFunction(()=>document.querySelector('.startup-loader'));
 for(let i=0;i<150&&await application.evaluate(()=>global.startupQA.bootstrapRequests)===0;i++)await page.waitForTimeout(20);
 assert.equal(await application.evaluate(()=>global.startupQA.bootstrapRequests),1,'Bootstrap requested only after heavy app load');
 for(let i=0;i<100&&!await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible());i++)await page.waitForTimeout(20);const firstVisible=await application.evaluate(({BrowserWindow})=>({visible:BrowserWindow.getAllWindows()[0].isVisible(),background:BrowserWindow.getAllWindows()[0].getBackgroundColor(),ready:global.startupQA.ready}));assert.equal(firstVisible.visible,true);assert.equal(firstVisible.background.toLowerCase(),colors.bg);assert.equal(firstVisible.ready.background.toLowerCase(),colors.bg);const during=await snapshot();assert.equal(during.theme,early.theme);assert.equal(during.palette,early.palette);assert.equal(during.visibleText,'');assert.equal(during.label,early.label);assert.equal(during.dots.length,5);assertGeometry(during,scenario.name+' during bootstrap');
 const reject=await page.evaluate(async()=>{try{await window.desktop.invoke('startup.readArbitraryFile',{path:'/etc/passwd'});return 'unexpected';}catch(error){return error.message;}});assert.match(reject,/Unknown action/);
 await application.evaluate(()=>global.startupQA.releaseBootstrap());
 let retry;
 if(scenario.retry){await page.locator('[data-action="boot-retry"]').waitFor();assert.match(await page.locator('.welcome').innerText(),/Synthetic bootstrap retry fixture/);assert.equal(await page.locator('.startup-loader').count(),0);await capture(scenario.name+'-error');await page.locator('[data-action="boot-retry"]').click();retry=true;}
 if(scenario.corrupt){await page.locator('[data-action="boot-retry"]').waitFor();assert.match(await page.locator('.welcome').innerText(),/Cannot read settings\.json/);assert.equal(await fs.readFile(path.join(dataDir,'settings.json'),'utf8'),originalBad,'Invalid preferences preserved');await capture(scenario.name+'-error');}
 else{await page.locator('.shell').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===1);assert.equal(await page.locator('.startup-loader').count(),0);assert.match(await page.locator('.conversation-row').innerText(),/Preserved startup fixture/);assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiPalette),scenario.palette);const boot=await page.evaluate(()=>window.desktop.invoke('bootstrap'));assert.equal(boot.settings.uiPalette,scenario.palette);assert.equal(boot.settings.codeTheme,'nord');if(scenario.backup)assert.match(boot.notice,/Recovered saved data from its backup/);if(scenario.retry)assert.ok(await application.evaluate(()=>global.startupQA.bootstrapRequests)>=3);}
 results.push({scenario:scenario.name,checks:['Appearance before heavy bundle','Saved palette and light/dark','Native window background','Five visible colored dots without text','Actual motion/static preference','Accessible localized status','Minimum/wide centered bounds without overflow','Sandboxed narrow immutable snapshot','Unchanged startup through bootstrap','Worker data or recoverable error preserved'],early,during,native,firstVisible,systemFlip,retry});
 console.log('PASS '+scenario.name);await close();
}
try{
 for(const scenario of scenarios.filter(s=>!process.env.READER_STARTUP_ONLY||s.name===process.env.READER_STARTUP_ONLY))await run(scenario);
 assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);
 const report={version:'3.0.0',revision:4,appRoot,scenarios:results.length,checks:results.reduce((n,r)=>n+r.checks.length,0),method:'Real production Electron main, sandboxed preload and archive worker; test-only heavy renderer file gate and bootstrap IPC gate; no production test hooks',singletonOverride:process.env.READER_TEST_SOCKETLESS==='1',results,captures,pageErrors,consoleErrors};
 await fs.writeFile(path.join(evidence,'startup-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined,captures:captures.length},null,2));
}catch(error){if(application&&page)await capture('Failure-'+currentName).catch(()=>{});console.error(JSON.stringify({pageErrors,consoleErrors}));throw error;}finally{await close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
