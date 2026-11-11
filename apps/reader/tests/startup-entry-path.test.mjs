import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('..',import.meta.url));
const source=fs.readFileSync(path.join(root,'src/desktop/main.cjs'),'utf8');
const {isTrustedFileURL,isTrustedMainFrame}=require('../src/desktop/trusted-entry.cjs');

// Run the production main-process startup with inert OS/Electron boundaries.
// Dynamic imports use deterministic modules; the path construction and native
// window navigation statement execute unchanged. No profile or network I/O.
async function startup(platform,folder){
 const windows=platform==='win32',paths=windows?path.win32:path.posix;
 const appRoot=windows?paths.join('C:\\Users\\Reader',folder):paths.join('/opt',folder);
 const navigations=[],errors=[],ttsPaths=[],geometryRegistrations=[];let ready;
 const display={workArea:{x:0,y:0,width:1600,height:1000}};
 const electron={
  app:{setName(){},setPath(){},requestSingleInstanceLock:()=>true,on(){},whenReady:()=>({then(callback){ready=Promise.resolve().then(callback);return ready;}}),exit:code=>errors.push(code)},
  BrowserWindow:class{constructor(){this.webContents={setWindowOpenHandler(){},on(){}};}on(){}async loadURL(value){navigations.push({method:'loadURL',value});}async loadFile(value){navigations.push({method:'loadFile',value});}},
  ipcMain:{handle(){}},dialog:{},shell:{},screen:{getAllDisplays:()=>[display],getPrimaryDisplay:()=>display},Menu:{setApplicationMenu(){}},session:{defaultSession:{setPermissionRequestHandler(){}}},clipboard:{},nativeTheme:{shouldUseDarkColors:false}
 };
 const processObject={platform,env:{},versions:{}};
 const privacy=require('../src/desktop/privacy-policy.cjs');
 const modules={'../core/onnx-privacy.cjs':{},'./html-preview-host.cjs':{createHtmlPreviewHost:()=>({closeAll(){},dispose(){},invoke:async()=>({}),registerGeometryIpc(channel,guard){geometryRegistrations.push({channel,guard});}})},'../../tts/index.cjs':{createTtsService:options=>{ttsPaths.push(options);return {invoke:async()=>({cancelled:true}),dispose:async()=>{}};}},'./privacy-policy.cjs':{enforcePrivacy:reporter=>privacy.enforcePrivacy(reporter,processObject)},electron,'node:fs':{mkdirSync(){},readFileSync:()=>'{"width":1320,"height":880}'},'node:fs/promises':{},'node:path':paths,'node:os':{homedir:()=>windows?'C:\\Users\\Reader':'/home/reader'},'node:worker_threads':{Worker:class{on(){}}},'node:url':{pathToFileURL:value=>pathToFileURL(value,{windows})},'./trusted-entry.cjs':{isTrustedMainFrame}};
 const testImport=async specifier=>{
  if(specifier.includes('startup-holiday'))return {loadStartupHolidayStatus:async()=>({isHoliday:false})};
  if(specifier==='./startup-appearance.mjs')return {readStartupAppearance:async()=>({})};
  if(specifier==='../core/startup-appearance.mjs')return {startupBackground:()=> '#000000'};
  throw new Error('Unexpected startup import: '+specifier);
 };
 const script=new vm.Script(source.replaceAll('import(','testImport('),{filename:'production-main.cjs'});
 script.runInNewContext({require:name=>{assert.ok(Object.hasOwn(modules,name),'Unexpected startup require: '+name);return modules[name];},__dirname:paths.join(appRoot,'src','desktop'),process:processObject,console:{error:error=>errors.push(String(error)),log(){}},testImport,URL,Buffer,Set,Map});
 await ready;
 assert.equal(processObject.env.ORT_DISABLE_TELEMETRY,'1');
 assert.deepEqual(errors,[]);
 assert.equal(navigations.length,1);
 assert.equal(ttsPaths.length,1);
 assert.equal(geometryRegistrations.length,1);
 assert.equal(geometryRegistrations[0].channel,'reader:html-preview-geometry');
 assert.equal(typeof geometryRegistrations[0].guard,'function');
 assert.equal(ttsPaths[0].assetsDir,paths.join(appRoot,'tts-assets'));
 assert.ok(ttsPaths[0].profileDir.endsWith('ThreadShelf Local Reader'));
 const expected=pathToFileURL(paths.join(appRoot,'dist','index.html'),{windows}).href;
 assert.equal(navigations[0].method,'loadURL','Production startup must pass the canonical URL to Electron, not reformat a native path');
 assert.equal(navigations[0].value,expected);
 assert.equal(isTrustedFileURL(navigations[0].value,expected,{windows}),true);
 return navigations[0].value;
}
for(const platform of ['linux','win32'])for(const folder of ['ThreadShelf Reader','RUNNER~1','Reader 100%','Reader literal %20','Reader #1 Árvíz 日本語']){
 test(`${platform} production entry navigation preserves ${folder}`,async()=>{
  const actual=await startup(platform,folder);
  if(folder.includes('%'))assert.match(actual,/%25/);
  if(folder.includes('#'))assert.match(actual,/%23/);
 });
}
