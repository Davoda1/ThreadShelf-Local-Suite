import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DEFAULTS,LAYOUT_DEFAULTS,validateSettings,validateLayoutSettings} from '../src/core/state.mjs';
import {ApplicationService} from '../src/core/service.mjs';

const choices=['server-wider','equal','local-wider'];
const envelope=data=>JSON.stringify({schemaVersion:1,data})+'\n';

test('source switch width defaults to equal and validates only the three offered choices',()=>{
 assert.equal(LAYOUT_DEFAULTS.sourceSwitchWidth,'equal');
 assert.equal(validateLayoutSettings({}).sourceSwitchWidth,'equal');
 for(const sourceSwitchWidth of choices)assert.equal(validateSettings({sourceSwitchWidth}).sourceSwitchWidth,sourceSwitchWidth);
 for(const invalid of ['',null,false,1,{},'server','local','Equal','equal;display:none'])assert.throws(()=>validateSettings({sourceSwitchWidth:invalid}),/Invalid setting: sourceSwitchWidth/);
});

test('legacy interface preferences gain equal source widths without changing saved files or other preferences',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-width-legacy-'));let service;
 try{
  const oldInterface=envelope({searchPanelExpanded:true}),oldSettings=envelope({...DEFAULTS,language:'hu',theme:'dark'});
  await fs.writeFile(path.join(dataDir,'interface.json'),oldInterface);await fs.writeFile(path.join(dataDir,'settings.json'),oldSettings);
  service=await new ApplicationService({dataDir}).init();const boot=await service.handle('bootstrap');
  assert.equal(boot.settings.sourceSwitchWidth,'equal');assert.equal(boot.settings.searchPanelExpanded,true);assert.equal(boot.settings.language,'hu');assert.equal(boot.settings.theme,'dark');
  assert.equal(await fs.readFile(path.join(dataDir,'interface.json'),'utf8'),oldInterface);assert.equal(await fs.readFile(path.join(dataDir,'settings.json'),'utf8'),oldSettings);
 }finally{await service?.shutdown();await fs.rm(dataDir,{recursive:true,force:true});}
});

test('all width preferences persist across actual service restarts and invalid saves preserve the previous choice',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-width-save-'));let service;
 try{
  service=await new ApplicationService({dataDir}).init();
  await service.handle('settings.save',{values:{language:'de',theme:'dark',uiPalette:'modern-oled',codeTheme:'nord',searchPanelExpanded:true}});
  const storedCore=await fs.readFile(path.join(dataDir,'settings.json'),'utf8'),storedAppearance=await fs.readFile(path.join(dataDir,'appearance.json'),'utf8'),storedInterface=await fs.readFile(path.join(dataDir,'interface.json'),'utf8');
  for(const sourceSwitchWidth of choices){
   const saved=await service.handle('settings.save',{values:{sourceSwitchWidth}});assert.equal(saved.sourceSwitchWidth,sourceSwitchWidth);
   const bytes=await fs.readFile(path.join(dataDir,'layout.json'),'utf8'),parsed=JSON.parse(bytes);
   assert.deepEqual(parsed.data,{sourceSwitchWidth});
   await assert.rejects(service.handle('settings.save',{values:{sourceSwitchWidth:'unsupported'}}),/Invalid setting: sourceSwitchWidth/);
   assert.equal(await fs.readFile(path.join(dataDir,'layout.json'),'utf8'),bytes);
   await service.shutdown();service=await new ApplicationService({dataDir}).init();
   const boot=await service.handle('bootstrap');assert.equal(boot.settings.sourceSwitchWidth,sourceSwitchWidth);assert.equal(boot.settings.searchPanelExpanded,true);assert.equal(boot.settings.uiPalette,'modern-oled');assert.equal(boot.settings.codeTheme,'nord');
  }
  assert.equal(await fs.readFile(path.join(dataDir,'settings.json'),'utf8'),storedCore);assert.equal(await fs.readFile(path.join(dataDir,'appearance.json'),'utf8'),storedAppearance);assert.equal(await fs.readFile(path.join(dataDir,'interface.json'),'utf8'),storedInterface);
 }finally{await service?.shutdown();await fs.rm(dataDir,{recursive:true,force:true});}
});

test('invalid stored width retains established recovery behavior and preserves the corrupt file',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-width-invalid-'));let service;
 try{
  const invalid=envelope({sourceSwitchWidth:'unsupported'});await fs.writeFile(path.join(dataDir,'layout.json'),invalid);
  service=new ApplicationService({dataDir});await assert.rejects(service.init(),/Cannot read layout\.json/);
  assert.equal(await fs.readFile(path.join(dataDir,'layout.json'),'utf8'),invalid);
 }finally{await service?.shutdown().catch(()=>{});await fs.rm(dataDir,{recursive:true,force:true});}
});
