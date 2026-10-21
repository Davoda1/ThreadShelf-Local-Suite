#!/usr/bin/env node
// Real bundled reader CSS compared with the released revision-2 renderer.
// Synthetic IPC/data only; never reads or writes a user's archive.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {UI_PALETTES,CODE_THEMES} from '../src/core/themes.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(import.meta.url);
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf-oled-roles-'));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.0.0-revision-3/oled'));
await fs.mkdir(evidence,{recursive:true});
const current=path.join(temp,'current'),baseline=path.join(temp,'baseline');
await fs.cp(path.join(process.env.READER_APP_ROOT||root,'dist'),current,{recursive:true});
execFileSync('python3',['-c',`import sys,zipfile,pathlib\nwith zipfile.ZipFile(sys.argv[1]) as z:\n for name in z.namelist():\n  if name.startswith('resources/app/dist/') and not name.endswith('/'):\n   out=pathlib.Path(sys.argv[2])/name.removeprefix('resources/app/dist/')\n   out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(z.read(name))`,process.env.READER_OLED_BASELINE||path.join(root,'release-2/ThreadShelf-Local-Reader-3.0.0-Windows-x64-Portable-2.zip'),baseline]);
const settings={language:'en',mode:'local',theme:'light',uiPalette:'oled',codeTheme:'nord',fontSize:'normal',highContrast:false,compact:false,animations:false,listMode:'pages',pageSize:50,sort:'updated',localCollection:'all',serverCollection:'all',serverUrl:'http://127.0.0.1:3000/',serverAddresses:[],searchPanelExpanded:false,searchMode:'keyword'};
const thread={id:'role-fixture',collection:'Synthetic types',title:'Message type color cues',provider:'openai',sourceFile:'/synthetic/types.json',conversationKey:'role-fixture',turnCount:7,turns:[
 {user:'A user message should have a blue indication.',turn_index:0},
 {ai:'Assistant responses use green.\n\n```javascript\n// Original syntax colors remain independent.\nconst answer = "unchanged";\n```',turn_index:1},
 {thinking:'Reasoning retains its amber indication.',turn_index:2},
 {user:'Also distinguish tool results and system messages.',turn_index:3},
 {ai:'A tool result has a purple indication.',source_role:'tool',turn_index:4},
 {ai:'A system message shares the purple type family.',source_role:'system',turn_index:5},
 {ai:'OLED surfaces and controls remain neutral.',turn_index:6}
]};
await fs.writeFile(path.join(temp,'preload.cjs'),`const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{invoke:(a,b)=>ipcRenderer.invoke('call',a,b),onProgress:()=>{},onMenu:()=>{}});`);
function main(config){
 const{app,BrowserWindow,ipcMain}=require('electron');app.setPath('userData',config.profile);
 ipcMain.handle('call',async(_event,action,args={})=>{
  if(action==='bootstrap')return{settings:config.settings,reading:{positions:{},bookmarks:[],recent:[]},dataDir:'Synthetic profile',version:'3.0.0',searchStatus:{}};
  if(action==='collections')return{collections:[{name:config.thread.collection,count:1}]};
  if(action==='files')return{files:[config.thread],total:1,page:1};
  if(action==='thread')return config.thread;
  if(action==='settings.save')return Object.assign(config.settings,args.values);
  if(action==='reading.save')return{positions:{},bookmarks:[],recent:[]};
  return{};
 });
 app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:950,show:true,webPreferences:{preload:config.preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadFile(config.page);});
}
await fs.writeFile(path.join(temp,'main.cjs'),`(${main.toString()})(${JSON.stringify({profile:path.join(temp,'profile'),settings,thread,preload:path.join(temp,'preload.cjs'),page:path.join(baseline,'index.html')})});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(temp,'main.cjs')],env,timeout:45000});
const page=await app.firstWindow(),errors=[],checks=[],records=[];
page.on('pageerror',error=>errors.push(error.message));
const check=(label,fn)=>{fn();checks.push(label);};
async function openThread(){await page.locator('.conversation-row').click();await page.locator('.message.system').waitFor();assert.equal(await page.locator('.message.tool').count(),1);}
async function theme(palette,mode,code='nord',contrast='normal'){await page.evaluate(({palette,mode,code,contrast})=>Object.assign(document.documentElement.dataset,{uiPalette:palette,theme:mode,codeTheme:code,contrast}),{palette,mode,code,contrast});}
async function signature(){return page.evaluate(()=>{
 const css=node=>getComputedStyle(node),rgb=color=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3);};
 const roles={};for(const role of ['user','assistant','thinking','tool','system']){const node=document.querySelector('.message.'+role),s=css(node),label=css(node.querySelector('.message-role'));roles[role]={background:s.backgroundColor,border:s.borderLeftColor,label:label.color,opacity:s.opacity,backgroundRgb:rgb(s.backgroundColor),labelRgb:rgb(label.color),borderRgb:rgb(s.borderLeftColor)};}
 const control=document.querySelector('.header-actions .primary'),code=document.querySelector('pre code'),pre=code.closest('pre');
 return{roles,controls:{bg:css(document.body).backgroundColor,surface:css(document.querySelector('.content-pane')).backgroundColor,button:css(control).backgroundColor,buttonText:css(control).color,sidebar:css(document.querySelector('.sidebar')).backgroundColor},code:{text:css(code).color,bg:css(pre).backgroundColor,border:css(pre).borderColor,keyword:css(code.querySelector('.hljs-keyword')).color,string:css(code.querySelector('.hljs-string')).color,comment:css(code.querySelector('.hljs-comment')).color,html:code.innerHTML,original:code.dataset.originalCode}};
});}
function luminance(rgb){return rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);}
function contrast(fg,bg){const a=luminance(fg),b=luminance(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
function blended(rgb,bg,opacity){return rgb.map((value,index)=>value*opacity+bg[index]*(1-opacity));}
const before={};let minimumContrast=Infinity;
try{
 await openThread();
 for(const mode of ['light','dark']){
  for(const palette of UI_PALETTES){await theme(palette.id,mode);before[palette.id+'-'+mode]=await signature();}
  for(const code of CODE_THEMES){await theme('oled',mode,code.id);before['code-'+code.id+'-'+mode]=(await signature()).code;}
  await theme('oled',mode,'nord','high');before['high-'+mode]=await signature();
  await theme('oled',mode);await page.emulateMedia({forcedColors:'active'});before['forced-'+mode]=await signature();await page.emulateMedia({forcedColors:'none'});
 }
 await app.evaluate(({BrowserWindow},filename)=>BrowserWindow.getAllWindows()[0].loadFile(filename),path.join(current,'index.html'));await openThread();
 for(const mode of ['light','dark']){
  for(const palette of UI_PALETTES){
   await theme(palette.id,mode);const after=await signature();
   if(palette.id!=='oled')check(`${palette.id}/${mode}: all role, control and code colors unchanged`,()=>assert.deepEqual(after,before[palette.id+'-'+mode]));
   else{
    check(`OLED/${mode}: controls and code stay unchanged`,()=>{assert.deepEqual(after.controls,before['oled-'+mode].controls);assert.deepEqual(after.code,before['oled-'+mode].code);});
    check(`OLED/${mode}: role colors and stripes distinguish four type families`,()=>{assert.equal(new Set(Object.values(after.roles).map(role=>role.label)).size,4);assert.equal(after.roles.tool.label,after.roles.system.label);for(const role of Object.values(after.roles))assert.equal(role.label,role.border);});
    for(const[name,role]of Object.entries(after.roles)){
     check(`OLED/${mode}/${name}: neutral surface and readable colored label`,()=>{assert.ok(Math.max(...role.backgroundRgb)-Math.min(...role.backgroundRgb)<=1);const text=blended(role.labelRgb,role.backgroundRgb,Number(role.opacity)),ratio=contrast(text,role.backgroundRgb);minimumContrast=Math.min(minimumContrast,ratio);assert.ok(ratio>=4.5,`${name} contrast ${ratio}`);assert.ok(contrast(blended(role.borderRgb,role.backgroundRgb,Number(role.opacity)),role.backgroundRgb)>=3);if(name!=='thinking')assert.equal(role.background,before['oled-'+mode].roles[name].background);});
    }
    records.push({mode,signature:after});await page.screenshot({path:path.join(evidence,`OLED-${mode}-roles.png`)});
   }
  }
  for(const code of CODE_THEMES){await theme('oled',mode,code.id);check(`OLED/${mode}/${code.id}: code theme colors and exact source unchanged`,()=>{});assert.deepEqual((await signature()).code,before['code-'+code.id+'-'+mode]);}
  await theme('oled',mode,'nord','high');check(`OLED/${mode}: high contrast override unchanged`,()=>{});assert.deepEqual(await signature(),before['high-'+mode]);
  await theme('oled',mode);await page.emulateMedia({forcedColors:'active'});check(`OLED/${mode}: forced colors unchanged`,()=>{});assert.deepEqual(await signature(),before['forced-'+mode]);await page.emulateMedia({forcedColors:'none'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,540));await theme('oled',mode);
  const geometry=await page.evaluate(()=>{const host=document.querySelector('#readerHost').getBoundingClientRect();return{width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,messages:[...document.querySelectorAll('.message')].map(node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right};}),host:{left:host.left,right:host.right}};});
  check(`OLED/${mode}: minimum window preserves all message widths and no global overflow`,()=>{assert.ok(geometry.scrollW<=geometry.width&&geometry.scrollH<=geometry.height);for(const message of geometry.messages)assert.ok(message.left>=geometry.host.left&&message.right<=geometry.host.right);});
  await page.screenshot({path:path.join(evidence,`OLED-${mode}-minimum-top.png`)});await page.locator('.message.system').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`OLED-${mode}-minimum-system.png`)});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,950));
 }
 check('No renderer errors',()=>assert.deepEqual(errors,[]));
 const hashes={};for(const name of ['app.js','app.css','startup.js'])hashes[name]=createHash('sha256').update(await fs.readFile(path.join(current,name))).digest('hex');
 const report={result:'PASS',checks:checks.length,minimumRoleLabelContrast:minimumContrast,rendererHashes:hashes,pageErrors:errors,passed:checks,records};await fs.writeFile(path.join(evidence,'oled-role-results.json'),JSON.stringify(report,null,2)+'\n');await fs.rm(path.join(evidence,'failure.png'),{force:true});console.log(JSON.stringify({result:report.result,checks:report.checks,minimumRoleLabelContrast:minimumContrast,evidence}));
}catch(error){await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});throw error;}
finally{await app.close();await fs.rm(temp,{recursive:true,force:true});}
