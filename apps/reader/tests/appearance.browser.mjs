#!/usr/bin/env node
// Actual application preferences and rendered colors; isolated synthetic profiles only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {UI_PALETTES,CODE_THEMES} from '../src/core/themes.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const currentBaseline=process.env.READER_APPEARANCE_CURRENT==='1';
const legacyRoot=currentBaseline?appRoot:process.env.READER_LEGACY_ROOT||path.join(path.dirname(root.replace(/[\\/]$/,'')),'baseline','ThreadShelf-Local-Reader-2.0.0-Source');
const require=createRequire(import.meta.url),{_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-appearance-111-')),dataDir=path.join(temp,'profile');
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v1.2.0/appearance'));await fs.mkdir(evidence,{recursive:true});
const source='// A readable local archive — Árvíztűrő 🧪\nconst greeting = "Bonjour, 你好";\nfunction score(value) {\n  return value === 42 ? true : false;\n}';
const thread={collection:'Theme fixture',provider:'openai',sourceFile:'synthetic-themes.json',conversationKey:'themes',title:'Independent interface and code colors',turns:[{user:'Keep the syntax colors independent of the surrounding interface.',turn_index:0},{ai:'## A small example\n\n```javascript\n'+source+'\n```\n\nInline `score(42)` remains readable.',turn_index:3}]};
let LegacyService;try{assert.equal(JSON.parse(await fs.readFile(path.join(legacyRoot,'package.json'),'utf8')).version,currentBaseline?'3.0.0':'2.0.0');LegacyService=(await import(pathToFileURL(path.join(legacyRoot,'src/core/service.mjs')))).ApplicationService;}catch(error){throw new Error('The read-only released 2.0.0 source is required for actual default-color comparison. Set READER_LEGACY_ROOT. '+error.message);}
const seed=await new LegacyService({dataDir}).init();await seed.handle('settings.save',{values:{theme:'light',language:'en',animations:false,fontSize:'normal',highContrast:false,serverUrl:'http://localhost:3000/',searchPanelExpanded:false}});const summary=(await seed.store.upsert(thread)).summary;await seed.handle('shutdown');
const env={...process.env,THREADSHELF_READER_TEST_DATA:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const pageErrors=[],records=[],passed=[],baseline={};
async function launch(applicationRoot,label){
 const harness=path.join(temp,label);await fs.mkdir(harness,{recursive:true});await fs.writeFile(path.join(harness,'package.json'),JSON.stringify({name:'reader-appearance-test',version:'3.0.0',main:'main.cjs'}));
 await fs.writeFile(path.join(harness,'main.cjs'),`const {app}=require('electron');${process.env.READER_TEST_SOCKETLESS==='1'?'app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(applicationRoot,'src/desktop/main.cjs'))});`);
 app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',harness],env,timeout:45000});page=await app.firstWindow();page.on('pageerror',error=>pageErrors.push(error.message));await page.locator('.conversation-row').waitFor();await page.locator('.conversation-row').first().click();await page.locator('.language-javascript .hljs-keyword').first().waitFor();
}
async function close(){await app?.close();app=null;}
async function saveAppearance(values,legacy=false){
 await page.locator('[data-action="settings"]').click();await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();
 for(const [key,id] of [['theme','prefTheme'],['uiPalette','prefUiPalette'],['codeTheme','prefCodeTheme']])if(values[key]!==undefined)await page.selectOption('#'+id,values[key]);
 if(values.highContrast!==undefined)await page.locator('#prefContrast').setChecked(values.highContrast);
 await page.locator('#settingsForm button[type="submit"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});await page.locator('.language-javascript .hljs-keyword').first().waitFor();
 if(!legacy)await page.waitForFunction(values=>Object.entries(values).every(([key,value])=>key==='theme'?(value==='system'||document.documentElement.dataset.theme===value):key==='highContrast'?document.documentElement.dataset.contrast===(value?'high':'normal'):document.documentElement.dataset[key]===value),values);
}
async function signature(){return page.evaluate(()=>{
 const root=document.documentElement,code=document.querySelector('pre code.language-javascript'),pre=code.closest('pre'),css=e=>getComputedStyle(e),tokens={};for(const token of ['keyword','string','comment','number','literal','title']){const n=code.querySelector('.hljs-'+token);if(n)tokens[token]=css(n).color;}
 return {ui:{background:css(document.body).backgroundColor,panel:css(document.querySelector('.sidebar')).backgroundColor,text:css(document.body).color,accent:css(root).getPropertyValue('--accent').trim()},code:{preBackground:css(pre).backgroundColor,background:css(code).backgroundColor,text:css(code).color,tokens,inlineBackground:css(document.querySelector('.message-content p code')).backgroundColor,inlineText:css(document.querySelector('.message-content p code')).color},html:code.innerHTML,original:code.dataset.originalCode,attrs:{mode:root.dataset.theme,uiPalette:root.dataset.uiPalette,codeTheme:root.dataset.codeTheme}};
});}
async function copyAndRead(){await app.evaluate(({clipboard})=>clipboard.writeText('theme-copy sentinel'));await page.locator('.message-content pre .code-copy-button').click();for(let i=0;i<60;i++){if(await app.evaluate(({clipboard})=>clipboard.readText())===source)return;await page.waitForTimeout(25);}assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),source);}
function colorValue(color){const m=String(color).match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);return m?m.slice(1,4).map(Number):null;}
function luminance(rgb){const c=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrast(a,b){a=colorValue(a);b=colorValue(b);if(!a||!b)return null;const x=luminance(a),y=luminance(b);return Math.round((Math.max(x,y)+.05)/(Math.min(x,y)+.05)*100)/100;}
try{
 await launch(legacyRoot,'legacy');
 for(const mode of ['light','dark']){await saveAppearance({theme:mode},true);baseline[mode]=await signature();}
 await saveAppearance({theme:'light'},true);await close();
 const legacyAppearance=JSON.parse(await fs.readFile(path.join(dataDir,'appearance.json'),'utf8'));assert.equal(legacyAppearance.data.uiPalette,'default');assert.equal(legacyAppearance.data.codeTheme,'default');
 await launch(appRoot,'current');const boot=await page.evaluate(()=>window.desktop.invoke('bootstrap'));assert.equal(boot.settings.uiPalette,'default');assert.equal(boot.settings.codeTheme,'default');assert.equal(boot.settings.serverUrl,'http://localhost:3000/');assert.equal(boot.settings.searchPanelExpanded,false);assert.equal(boot.settings.theme,'light');
 for(const mode of ['light','dark']){await saveAppearance({theme:mode,uiPalette:'default',codeTheme:'default'});const current=await signature();assert.deepEqual(current.code,baseline[mode].code,'Default code appearance matches actual 1.1.1 revision-2 '+mode);assert.deepEqual(current.ui,baseline[mode].ui,'Default UI appearance matches actual 1.1.1 revision-2 '+mode);assert.equal(current.html,baseline[mode].html);assert.equal(current.original,source);}
 passed.push(currentBaseline?'Fresh 2.0.0 profile retains default independent preferences on reopening; default UI/code computed colors match its original light/dark baseline':'Actual 1.1.1 revision-2 profile migrates with its default independent preferences; default UI/code computed colors match both 1.1.1 revision-2 light and dark');
 const codeBaselines={};
 for(const mode of ['light','dark']){
  await saveAppearance({theme:mode,uiPalette:'default',codeTheme:'vscode'});codeBaselines[mode]=(await signature()).code;
  const interfaces=[];
  for(const palette of UI_PALETTES){await saveAppearance({theme:mode,uiPalette:palette.id,codeTheme:'vscode'});const current=await signature();assert.deepEqual(current.code,codeBaselines[mode],`${mode}/${palette.id}: interface palette must not recolor code`);assert.equal(current.original,source);assert.equal(current.html,baseline[mode].html);interfaces.push(JSON.stringify(current.ui));records.push({kind:'ui',mode,id:palette.id,signature:current});await page.screenshot({path:path.join(evidence,`UI-${palette.id}-${mode}.png`)});}
  assert.equal(new Set(interfaces).size,UI_PALETTES.length,'All interface palettes have distinct visible colors');
 }
 passed.push(`${UI_PALETTES.length} interface palettes each render light/dark variants while selected code colors and token markup remain unchanged`);
 for(const mode of ['light','dark']){
  await saveAppearance({theme:mode,uiPalette:'ocean',codeTheme:'default'});const ui=(await signature()).ui,signatures=[];
  for(const theme of CODE_THEMES){await saveAppearance({theme:mode,uiPalette:'ocean',codeTheme:theme.id});const current=await signature();assert.deepEqual(current.ui,ui,`${mode}/${theme.id}: code theme must not recolor interface`);assert.equal(current.html,baseline[mode].html);assert.equal(current.original,source);if(theme.id==='default')assert.deepEqual(current.code,baseline[mode].code,'Default code theme remains independent of Ocean interface colors');await copyAndRead();signatures.push(JSON.stringify(current.code));const background=current.code.background==='rgba(0, 0, 0, 0)'?current.code.preBackground:current.code.background;const ratios=Object.fromEntries(Object.entries({text:current.code.text,...current.code.tokens}).map(([key,value])=>[key,contrast(value,background)]));records.push({kind:'code',mode,id:theme.id,signature:current,contrast:ratios});await page.screenshot({path:path.join(evidence,`Code-${theme.id}-${mode}.png`)});}
  assert.equal(new Set(signatures).size,CODE_THEMES.length,'All eight code themes have distinct visible colors');
 }
 passed.push('Eight code themes each render light/dark variants, preserve the interface/token markup, and copy exact Unicode code through the real OS clipboard');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,540));
 await saveAppearance({theme:'dark',uiPalette:'oled',codeTheme:'vscode'});await page.locator('[data-action="settings"]').click();
 assert.equal(await page.locator('#prefUiPalette option').count(),6);assert.equal(await page.locator('#prefUiPalette').inputValue(),'oled');
 const minimum=await page.locator('.modal').evaluate(m=>{const r=m.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,bodyWidth:document.documentElement.scrollWidth,bodyHeight:document.documentElement.scrollHeight,buttons:[...m.querySelectorAll('.modal-footer button')].map(b=>b.getBoundingClientRect().toJSON())};});
 assert.ok(minimum.left>=0&&minimum.right<=minimum.width&&minimum.top>=0&&minimum.bottom<=minimum.height);assert.ok(minimum.bodyWidth<=minimum.width&&minimum.bodyHeight<=minimum.height);for(const button of minimum.buttons)assert.ok(button.left>=minimum.left&&button.right<=minimum.right&&button.bottom<=minimum.bottom);await page.screenshot({path:path.join(evidence,'OLED-Settings-Minimum.png')});await page.locator('.modal-header [data-action="modal-close"]').click();
 passed.push('OLED is the sixth selectable interface palette and the appearance settings/footer stay bounded at 680×540');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1080,760));
 await saveAppearance({theme:'system',uiPalette:'amethyst',codeTheme:'nord'});for(const scheme of ['dark','light']){await page.emulateMedia({colorScheme:scheme});await page.waitForFunction(s=>document.documentElement.dataset.theme===s,scheme);const current=await signature();assert.equal(current.attrs.uiPalette,'amethyst');assert.equal(current.attrs.codeTheme,'nord');}await page.emulateMedia({colorScheme:null});
 await saveAppearance({theme:'dark',uiPalette:'forest',codeTheme:'solarized',highContrast:true});const high=await signature();assert.ok(contrast(high.code.text,high.code.background==='rgba(0, 0, 0, 0)'?high.code.preBackground:high.code.background)>=7,'High-contrast code foreground');await saveAppearance({theme:'system',uiPalette:'amethyst',codeTheme:'nord',highContrast:false});
 await close();await launch(appRoot,'restart');const persisted=await page.evaluate(()=>window.desktop.invoke('bootstrap'));assert.equal(persisted.settings.theme,'system');assert.equal(persisted.settings.uiPalette,'amethyst');assert.equal(persisted.settings.codeTheme,'nord');const appearance=JSON.parse(await fs.readFile(path.join(dataDir,'appearance.json'),'utf8'));const settings=JSON.parse(await fs.readFile(path.join(dataDir,'settings.json'),'utf8'));assert.ok(JSON.stringify(appearance).includes('amethyst'));assert.ok(JSON.stringify(appearance).includes('nord'));assert.equal(settings.data.uiPalette,undefined);assert.equal(settings.data.codeTheme,undefined);assert.equal(settings.data.serverUrl,'http://localhost:3000/');assert.equal(await page.evaluate(()=>document.querySelector('pre code.language-javascript').dataset.originalCode),source);
 passed.push('System color mode follows OS preference independently; high contrast stays readable; both theme preferences persist in appearance.json without changing legacy settings schema');
 assert.deepEqual(pageErrors,[]);const report={version:'3.0.0',appRoot,legacyRoot,currentBaseline,passed,baseline,records,pageErrors};await fs.writeFile(path.join(evidence,'appearance-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({version:report.version,passed,renderedThemes:records.length,pageErrors},null,2));
}catch(error){await page?.screenshot({path:path.join(evidence,'Appearance-Failure.png')}).catch(()=>{});throw error;}finally{await close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
