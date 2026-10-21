#!/usr/bin/env node
// Uses the production main/preload and the actual OS clipboard. No clipboard API is mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const {_electron}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf-clipboard-'));
const env={...process.env,THREADSHELF_READER_TEST_DATA:path.join(temporary,'profile')};
delete env.ELECTRON_RUN_AS_NODE;
const version=JSON.parse(await fs.readFile(path.join(appRoot,'package.json'),'utf8')).version;
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs','evidence',`v${version}`));
let launchRoot=appRoot;
if(process.env.READER_TEST_SOCKETLESS==='1'){
  launchRoot=path.join(temporary,'runner');await fs.mkdir(launchRoot);
  await fs.writeFile(path.join(launchRoot,'package.json'),JSON.stringify({name:'threadshelf-clipboard-test',version,main:'main.cjs'}));
  // Test runner only: this environment cannot create Electron's Unix-domain instance lock.
  await fs.writeFile(path.join(launchRoot,'main.cjs'),`const {app}=require('electron');app.requestSingleInstanceLock=()=>true;require(${JSON.stringify(path.join(appRoot,'src/desktop/main.cjs'))});`);
}
let application,page;
const passed=[];
try{
  application=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',launchRoot],env,timeout:45000});
  page=await application.firstWindow();
  await page.waitForFunction(()=>!!window.desktop?.capabilities?.clipboardWrite);
  await application.evaluate(({clipboard})=>{globalThis.clipboardBeforeTest=clipboard.readText();});
  assert.deepEqual(await page.evaluate(()=>({require:typeof require,frozen:Object.isFrozen(desktop),capabilityFrozen:Object.isFrozen(desktop.capabilities)})),{require:'undefined',frozen:true,capabilityFrozen:true});
  const preferences=await application.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration};});
  assert.deepEqual(preferences,{sandbox:true,contextIsolation:true,nodeIntegration:false});
  passed.push('Production preload remains immutable, sandboxed and context isolated without renderer Node access');
  const original='First line\nÁrvíztűrő tükörfúrógép · Grüße · français · 日本語 · 😀\n\tconst html = "<b>& original</b>";\n';
  assert.deepEqual(await page.evaluate(text=>desktop.invoke('clipboard.write',{text}),original),{ok:true});
  assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),original);
  passed.push('Trusted sandboxed production renderer writes exact Unicode, tabs and newlines to the OS clipboard');

  for(const args of [undefined,null,{}, {text:null},{text:42},{text:['not','text']}]){
    const error=await page.evaluate(async args=>{try{await desktop.invoke('clipboard.write',args);return null;}catch(e){return e.message;}},args);
    assert.match(error,/Clipboard text must be a string/);
    assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),original);
  }
  for(const [kind,expected] of [['bytes',/exceeds 16 MiB/],['nul',/NUL character/]]){
    const error=await page.evaluate(async kind=>{const text=kind==='bytes'?'😀'.repeat(4*1024*1024+1):'before\0after';try{await desktop.invoke('clipboard.write',{text});return null;}catch(e){return e.message;}},kind);
    assert.match(error,expected);
    assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),original);
  }
  passed.push('Invalid payloads, UTF-8 byte overflow and NUL text are rejected without changing the clipboard');

  const readError=await page.evaluate(async()=>{try{await desktop.invoke('clipboard.read');return null;}catch(e){return e.message;}});
  assert.match(readError,/Unknown action/);
  passed.push('Preload exposes no clipboard read action');

  const untrusted=await application.evaluate(async({BrowserWindow},{preload})=>{
    const extra=new BrowserWindow({show:false,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    try{
      await extra.loadURL('data:text/html,<title>Untrusted clipboard fixture</title>');
      return await extra.webContents.executeJavaScript(`(async()=>{try{await desktop.invoke('clipboard.write',{text:'untrusted write'});return null;}catch(e){return e.message;}})()`);
    }finally{extra.destroy();}
  },{preload:path.join(appRoot,'src/desktop/preload.cjs')});
  assert.match(untrusted,/Untrusted application request/);
  assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),original);
  passed.push('Another window with the real preload cannot use the main window clipboard permission');

  await page.evaluate(()=>desktop.invoke('clipboard.write',{text:''}));
  assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),'');
  passed.push('Empty plain text is a valid clipboard write');
  await fs.mkdir(evidence,{recursive:true});
  await fs.writeFile(path.join(evidence,'clipboard-results.json'),JSON.stringify({version,platform:process.platform,testedAt:new Date().toISOString(),clipboard:'Electron OS clipboard, unmocked',passed},null,2)+'\n');
  console.log(JSON.stringify({version,passed},null,2));
}finally{
  if(application){
    await application.evaluate(({clipboard})=>{if(typeof globalThis.clipboardBeforeTest==='string')clipboard.writeText(globalThis.clipboardBeforeTest);}).catch(()=>{});
    await application.close().catch(()=>{});
  }
  await fs.rm(temporary,{recursive:true,force:true});
}
