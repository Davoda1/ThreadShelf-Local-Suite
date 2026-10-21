#!/usr/bin/env node
// Actual bundled UI/Reader with synthetic IPC: layout and keyboard focus only.
// Never opens the user's profile, imports, server, clipboard, or model service.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const require=createRequire(path.join(root,'package.json'));
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const tmp=await mkdtemp(path.join(os.tmpdir(),'threadshelf-ui-111-'));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs','evidence','v1.2.0','ui-layout'));
await mkdir(evidence,{recursive:true});
await writeFile(path.join(tmp,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{invoke:(a,b)=>ipcRenderer.invoke('call',a,b),onProgress:()=>{},onMenu:()=>{}});`);
const mockSettings={language:'en',mode:'local',theme:'light',uiPalette:'default',codeTheme:'default',fontSize:'normal',highContrast:false,compact:true,animations:false,listMode:'pages',pageSize:50,sort:'updated',localCollection:'all',serverCollection:'all',serverUrl:'http://localhost:3000/',serverAddresses:['http://localhost:3000/'],directoryMode:'last',customDirectory:'',searchPanelExpanded:false,searchMode:'keyword',ollamaUrl:'http://127.0.0.1:11434',ollamaModel:''};
const mockThread={id:'synthetic',collection:'openai',provider:'openai',sourceFile:'/exports/long-directory-name/long-conversation-source-file.json',conversationKey:'sample',title:'A complete conversation with a deliberately long title, kept locally and available for careful reading',turns:[{user:'What should we build? Search phrase: C++ code and Mermaid diagrams.',turn_index:0},{thinking:'Consider constraints before coding.',turn_index:1},{ai:'# Keep the conversation\n\n| Item | Value |\n| --- | --- |\n| Reader | Offline |\n\nUse C++ code:\n\n```cpp\n#include <iostream>\nint main() { std::cout << "Ready"; }\n```\n\n'+Array.from({length:12},(_,i)=>`Paragraph ${i+1}: C++ code and Mermaid diagrams stay readable with a large font. The conversation pane scrolls independently of the app header and sidebar.`).join('\n\n'),turn_index:2},{user:'Sounds good. C++ code and Mermaid diagrams.',turn_index:3},{ai:'Everything is ready. C++ code and Mermaid diagrams.',turn_index:4}]};
function mockMain(config){
 const {app,BrowserWindow,ipcMain}=require('electron');app.setPath('userData',config.profile);global.uiSettings=config.settings;global.reading={positions:{},bookmarks:[],recent:[]};const thread=config.thread;
 const files=Array.from({length:18},(_,i)=>({...thread,id:'synthetic-'+i,title:i?`${i+1}. ${thread.title}`:thread.title}));
 const collections=[{name:'openai',count:2560},{name:'Research collection with a deliberately long name',count:512},{name:'empty',count:0}];
 ipcMain.handle('call',async(_e,a,b={})=>{
  if(a==='bootstrap')return {settings:global.uiSettings,reading:global.reading,dataDir:'~/.config/ThreadShelf Local Reader',version:'3.0.0',searchStatus:{modelReady:false,indexedPassages:0}};
  if(a==='settings.save')return global.uiSettings={...global.uiSettings,...b.values};
  if(a==='collections'||a==='server.collections')return {collections};
  if(a==='files')return {files,total:2560,page:1,pageSize:50};
  if(a==='thread')return thread;
  if(a==='search')return {results:files.map(file=>({...file,conversationId:file.id,text:'C++ code and Mermaid diagrams with a deliberately long search excerpt that wraps inside the result row.',turnIndex:0,role:'user'})),total:files.length};
  if(a==='reading.save'){if(b.position){global.reading.positions[b.key]=b.position;global.reading.recent=[{key:b.key,...b.position}];}return global.reading;}
  if(a==='search.status')return {modelReady:false,indexedPassages:0};
  if(a==='ollama.models')return {available:false,installed:false,isLocal:true,models:[],details:[]};
  if(a==='app.about')return {version:'3.0.0',electron:process.versions.electron};
  return {};
 });
 app.whenReady().then(()=>{const w=new BrowserWindow({width:680,height:540,show:true,webPreferences:{preload:config.preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadFile(config.page);});
}
await writeFile(path.join(tmp,'main.cjs'),`(${mockMain.toString()})(${JSON.stringify({profile:path.join(tmp,'profile'),settings:mockSettings,thread:mockThread,preload:path.join(tmp,'preload.cjs'),page:path.join(appRoot,'dist/index.html')})});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(tmp,'main.cjs')],env});
const page=await app.firstWindow(),errors=[],checks=[],metrics=[];
page.on('pageerror',e=>errors.push(e.message));
const shortcut=process.platform==='darwin'?'Meta':'Control';
const closeModal=()=>page.click('.modal-header [data-action="modal-close"]');
const screenshot=label=>page.screenshot({path:path.join(evidence,label.replaceAll('/','-')+'.png')});
let currentLabel='startup';

async function check(label){
 currentLabel=label;
 const bounds=await page.evaluate(()=>{
  const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}};
  const visible=el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[inert]');
  const name=el=>el.id||el.getAttribute('data-action')||el.className||el.tagName;
  const groupSelectors=['.app-header','.thread-tools','.reader-search','.search-meta','.modal-header','.modal-footer','.button-row','.input-actions','.transfer-source','.search-method-choice','.ollama-model-row','.settings-nav'];
  const overlaps=[];
  for(const selector of groupSelectors)for(const group of document.querySelectorAll(selector)){
   if(!visible(group))continue;
   const controls=[...group.querySelectorAll('button,input,select')].filter(el=>visible(el)&&!el.matches('.find-clear,.clear-search'));
   for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
    const a=rect(controls[i]),b=rect(controls[j]);
    if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)overlaps.push(`${selector}: ${name(controls[i])} / ${name(controls[j])}`);
   }
  }
  return {window:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],panels:[...document.querySelectorAll('.settings-panel,.modal-body')].filter(visible).map(e=>({name:name(e),width:e.clientWidth,scrollWidth:e.scrollWidth})),selects:[...document.querySelectorAll('.select-wrap')].filter(visible).map(el=>({name:name(el.querySelector('select')),select:rect(el.querySelector('select')),arrow:rect(el.querySelector('svg'))})),count:rect(document.querySelector('#listCount')),sort:rect(document.querySelector('.list-sort')),headerButtons:[...document.querySelectorAll('.app-header button')].filter(visible).map(el=>({name:name(el),...rect(el)})),modal:document.querySelector('.modal')?rect(document.querySelector('.modal')):null,footer:document.querySelector('.modal-footer')?rect(document.querySelector('.modal-footer')):null,tooltip:document.querySelector('#searchHelpTooltip')&&visible(document.querySelector('#searchHelpTooltip'))?rect(document.querySelector('#searchHelpTooltip')):null,overlaps};
 });
 assert.ok(bounds.page[0]<=bounds.window[0]+1&&bounds.page[1]<=bounds.window[1]+1,label+' whole-window overflow');
 assert.ok(bounds.count.width>0&&bounds.count.right<=bounds.sort.x+1,label+' list count hidden or overlapping sort');
 assert.deepEqual(bounds.overlaps,[],label+' controls overlap');
 assert.ok(bounds.panels.every(p=>p.scrollWidth<=p.width+1),label+' dialog horizontal overflow: '+JSON.stringify(bounds.panels));
 for(const b of bounds.headerButtons)assert.ok(b.x>=0&&b.right<=bounds.window[0]+1&&b.bottom<=bounds.window[1]+1,label+' header control out of view: '+b.name);
 for(const {name,select,arrow} of bounds.selects){assert.ok(arrow.width>0&&arrow.height>0,label+' missing dropdown arrow: '+name);assert.ok(Math.abs(select.y+select.height/2-arrow.y-arrow.height/2)<=1.1,label+' misaligned dropdown arrow: '+name);assert.ok(arrow.x>=select.x&&arrow.right<=select.right,label+' arrow outside select: '+name);}
 for(const key of ['modal','footer','tooltip'])if(bounds[key])assert.ok(bounds[key].x>=0&&bounds[key].y>=0&&bounds[key].right<=bounds.window[0]+1&&bounds[key].bottom<=bounds.window[1]+1,label+' '+key+' outside viewport');
 checks.push({label,visibleSelects:bounds.selects.length,wholeWindowOverflow:false,controlOverlaps:0,alignedArrows:true});
}
async function checkFocus(selector,label,inset=false){
 const field=page.locator(selector).first();
 await field.focus();await page.keyboard.press('ArrowRight');
 const result=await field.evaluate(el=>{
  const style=getComputedStyle(el),b=el.getBoundingClientRect(),outside=Math.max(0,parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset));
  const clipped=[];
  for(let parent=el.parentElement;parent;parent=parent.parentElement){const s=getComputedStyle(parent),p=parent.getBoundingClientRect();for(const [axis,min,max,start,end] of [['X','left','right','left','right'],['Y','top','bottom','top','bottom']])if(/hidden|clip|scroll|auto/.test(s['overflow'+axis])&&(b[min]-outside<p[start]-1||b[max]+outside>p[end]+1))clipped.push(parent.id||parent.className||parent.tagName);}
  return {focused:document.activeElement===el,focusVisible:el.matches(':focus-visible'),outline:style.outlineStyle,width:parseFloat(style.outlineWidth),outside,clipped};
 });
 assert.equal(result.focused,true,label+' focus was lost');
 assert.equal(result.focusVisible,true,label+' keyboard focus is not visible');
 assert.ok(result.width>0&&result.outline!=='none',label+' missing focus ring');
 assert.deepEqual(result.clipped,[],label+' clipped focus ring');
 if(inset)assert.equal(result.outside,0,label+' dense focus paint extends beyond control');
 checks.push({label,keyboardFocusVisible:true,focusRingClipped:false,...(inset?{focusPaintInsideControl:true}:{})});
}
async function checkCustomClear(inputSelector,buttonSelector,label){
 const value=await page.evaluate(({inputSelector,buttonSelector})=>{const input=document.querySelector(inputSelector),button=document.querySelector(buttonSelector),i=input.getBoundingClientRect(),b=button.getBoundingClientRect();return {visible:!button.hidden,inside:b.left>=i.left&&b.right<=i.right&&b.top>=i.top&&b.bottom<=i.bottom,reserved:parseFloat(getComputedStyle(input).paddingRight)>=i.right-b.left};},{inputSelector,buttonSelector});
 assert.equal(value.visible,true,label+' missing custom clear control');assert.equal(value.inside,true,label+' clear control extends outside input');assert.equal(value.reserved,true,label+' input text can run beneath clear control');
 checks.push({label,customClearInsideInput:true,textPaddingReserved:true});
}
async function checkSearchCancel(selector,label){
 const cancel=await page.locator(selector).evaluate(el=>{const style=getComputedStyle(el,'::-webkit-search-cancel-button');return {display:style.display,appearance:style.webkitAppearance};});
 assert.ok(cancel.display==='none'||cancel.appearance==='none',label+' native search cancel is still displayed: '+JSON.stringify(cancel));
 checks.push({label,nativeCancelHidden:true});
}
try{
 const scenarios=[];
 for(const language of ['en','hu','de','fr'])for(const [width,height] of [[680,540],[1280,820]])scenarios.push({language,width,height,fontSize:'normal',highContrast:false,theme:'light',mode:'local'});
 scenarios.push({language:'en',width:664,height:501,fontSize:'xl',highContrast:true,theme:'dark',mode:'server'},{language:'en',width:1280,height:820,fontSize:'xl',highContrast:true,theme:'dark',mode:'server'});
 for(const scenario of scenarios){
  const label=`${scenario.language}-${scenario.width}x${scenario.height}-${scenario.fontSize}${scenario.highContrast?'-contrast':''}`;
  currentLabel=label;
  await app.evaluate(({BrowserWindow},s)=>{Object.assign(global.uiSettings,s,{searchPanelExpanded:false});global.reading={positions:{},bookmarks:[],recent:[]};BrowserWindow.getAllWindows()[0].setContentSize(s.width,s.height);},scenario);
  await page.reload();await page.waitForSelector('.conversation-row');
  assert.equal(await page.locator('.app-header .mode-switch').count(),1);
  assert.equal(await page.locator('html').getAttribute('data-ui-palette'),'default');
  assert.equal(await page.locator('html').getAttribute('data-code-theme'),'default');
  assert.equal(await page.locator('#serverQuickUrl').count(),0);
  assert.equal(await page.locator('#searchToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#collectionSelect option[value="empty"]').count(),0);
  const collapsed=await page.locator('#conversationList').boundingBox();
  await page.locator('.conversation-row').first().click();await page.waitForSelector('.message');
  assert.equal(await page.locator('html').getAttribute('data-contrast'),scenario.highContrast?'high':'normal');
  if(scenario.fontSize==='xl')assert.equal(await page.locator('#readerHost').evaluate(el=>getComputedStyle(el).getPropertyValue('--font-size-multiplier').trim()),'1.3');
  await check(label+'/reader');
  if(scenario.language==='en'&&scenario.width<=680)for(const [selector,name] of [['.header-actions [data-action="settings"]','header'],['.header-source-switch [data-action="mode-local"]','source-switch'],['.thread-tools button','thread-tools'],['.conversation-row','list-row'],['#searchToggle','search-toggle'],['#listSort','list-sort']])await checkFocus(selector,label+'/dense-focus-'+name,true);
  await page.keyboard.press(shortcut+'+k');await page.waitForFunction(()=>document.activeElement.id==='archiveSearch');
  const expanded=await page.locator('#conversationList').boundingBox();
  assert.ok(collapsed.height>expanded.height,label+' collapsed search must free list space');
  await page.locator('#archiveSearch').fill('C++ code and Mermaid diagrams with a very long archive query');
  await page.waitForFunction(()=>document.querySelector('#searchSummary')?.textContent.includes('very long archive query'));
  assert.equal(await page.locator('.search-field .clear-search:visible').count(),1);
  await checkSearchCancel('#archiveSearch',label+'/archive-single-clear');
  await checkCustomClear('#archiveSearch','.search-field .clear-search',label+'/archive-clear-geometry');
  await checkFocus('#archiveSearch',label+'/archive-focus');
  await page.keyboard.press(shortcut+'+f');await page.waitForSelector('#readerFindInput:visible');
  await page.locator('#readerFindInput').fill('C++ code and Mermaid diagrams with a very long conversation query');
  await checkSearchCancel('#readerFindInput',label+'/chat-native-cancel');
  assert.equal(await page.locator('.reader-find-field .find-clear:visible').count(),1);
  await checkCustomClear('#readerFindInput','#readerFindClear',label+'/chat-clear-geometry');
  await checkFocus('#readerFindInput',label+'/chat-focus');
  await check(label+'/long-search');await screenshot(label+'-long-search');
  await page.locator('#readerFindClear').click();assert.equal(await page.locator('#readerFindInput').inputValue(),'');assert.equal(await page.locator('#readerFindClear').isVisible(),false);
  await page.locator('#readerFindInput').fill('C++ code');await check(label+'/chat-matches');
  await page.click('[data-action="find-close"]');
  await page.click('#searchToggle');
  assert.equal(await page.locator('#searchToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.collapsed-search-clear:visible').count(),1);
  await check(label+'/collapsed-query');
  if(scenario.language==='en'&&scenario.width<=680)await checkFocus('.collapsed-search-clear',label+'/dense-focus-collapsed-clear',true);
  await page.locator('.collapsed-search-clear').click();
  await page.waitForFunction(()=>!document.querySelector('#searchSummary').classList.contains('has-query')&&document.querySelector('#archiveSearch').value==='');
  metrics.push({...scenario,collapsedListHeight:collapsed.height,expandedListHeight:expanded.height});
  // Every locale at the minimum size receives the complete settings/dialog sweep.
  if(scenario.width<=680){
   await page.keyboard.press(shortcut+'+k');
   await page.click('[data-action="search-options"]');
   await page.locator('#searchHelpButton').focus();assert.equal(await page.locator('#searchHelpTooltip').isVisible(),true);
   await check(label+'/search-options');await screenshot(label+'-search-options');await closeModal();
   await page.click('[data-action="search-toggle"]');
   await page.click('[data-action="settings"]');
   for(const tab of ['appearance','reading','sources','searchSettings','data']){
    await page.click('[data-action="settings-tab"][data-tab="'+tab+'"]');
    await check(label+'/settings-'+tab);await checkFocus('.settings-nav button[aria-pressed="true"]',label+'/dense-settings-focus-'+tab,true);assert.ok(await page.locator('.modal-footer button[type="submit"]').isVisible());
    if(tab==='sources')await checkFocus('#prefServer',label+'/settings-focus');
    await screenshot(label+'-settings-'+tab);
   }
   await closeModal();
   for(const action of ['import-dialog','transfer-dialog','reading-dialog','export-dialog','about']){
    await page.locator('.app-header [data-action="'+action+'"],.thread-tools [data-action="'+action+'"]').first().click();
    await page.waitForSelector('.modal');
    if(action==='transfer-dialog'){await page.click('[data-action="transfer-load"]');await page.waitForSelector('.transfer-check');assert.equal(await page.locator('.transfer-check').count(),2);}
    await check(label+'/'+action);
    if(scenario.highContrast)await screenshot(label+'-'+action);
    await closeModal();
   }
  }
 }
 assert.deepEqual(errors,[]);
 const result={version:'3.0.0',appRoot,scenarios:scenarios.length,checks,metrics,pageErrors:errors};
 await writeFile(path.join(evidence,'layout-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){await screenshot('failure-'+currentLabel).catch(()=>{});throw error;}
finally{await app.close();await rm(tmp,{recursive:true,force:true});}
