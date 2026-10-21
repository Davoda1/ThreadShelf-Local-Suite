#!/usr/bin/env node
// R9: compare Platinum Plus with Professional in the real offline app preview.
// Only header/settings opacity and blur may differ. Native persistence is tested separately.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {releaseFilename} from '../scripts/release-filenames.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const preview=process.env.READER_PREVIEW_FILE||path.join(root,'release',releaseFilename('ThreadShelf-Local-Reader-1.0.0-Preview.html'));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'../qa/platinum-plus'));
await fs.mkdir(evidence,{recursive:true});
assert.ok(process.env.READER_ELECTRON,'Use the release Electron runtime');
const {_electron}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf-r9-plus-'));
const main=path.join(scratch,'main.cjs');
await fs.writeFile(main,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(scratch,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1440,height:1000,useContentSize:true,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadURL('about:blank')});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:process.env.READER_ELECTRON,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',main],env,timeout:45000});
const runtime=await app.evaluate(()=>({electron:process.versions.electron,chromium:process.versions.chrome,node:process.versions.node}));
const page=await app.firstWindow(),session=await page.context().newCDPSession(page);
const checks=[],parity=[],pixels=[],layouts=[],errors=[],consoleErrors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
await page.route(/^https?:/,route=>{requests.push(route.request().url());return route.abort();});
const action=name=>page.locator(`[data-action="${name}"]`);
const settle=()=>page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
async function settings(){await action('settings').click();await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();await page.locator('#prefUiPalette').waitFor();}
async function save(){await page.locator('#settingsForm button[type="submit"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});await settle();}
async function cancel(){await page.locator('.modal-header [data-action="modal-close"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});await settle();}
const properties=['display','position','z-index','isolation','opacity','transform','filter','backdrop-filter','backface-visibility','contain','will-change','overflow','color','background-color','background-image','box-shadow','border-color','border-width','border-radius','width','height','padding','margin','gap','font-family','font-size','font-weight','line-height','pointer-events','content'];
const readerSelectors=['.app-header','.sidebar','.content-pane','#threadHeader','#threadHeader h1','#threadHeader [data-action="close-thread"]','#readerHost','.conversation-content','.message.user','.message.assistant','.message.thinking','.message.thinking .message-content','.statusbar'];
const modalSelectors=['.modal-overlay','.modal','.modal-header','#settingsForm','.settings-nav','.settings-panel','.modal-footer','#prefUiPalette','#prefTheme'];
async function snapshot(selectors){return page.evaluate(({selectors,properties})=>{
 const style=(node,pseudo)=>{const c=getComputedStyle(node,pseudo);return Object.fromEntries(properties.map(p=>[p,c.getPropertyValue(p)]));};
 return Object.fromEntries(selectors.map(selector=>{const n=document.querySelector(selector);assertNode(n,selector);const r=n.getBoundingClientRect();return [selector,{rect:{x:r.x,y:r.y,width:r.width,height:r.height},style:style(n),before:style(n,'::before'),after:style(n,'::after')}];}));
 function assertNode(n,s){if(!n)throw Error('Missing '+s);}
 },{selectors,properties});}
function equalExceptSurfaces(a,b,scope){
 const left=structuredClone(a),right=structuredClone(b);
 for(const selector of scope)for(const layer of ['style','before','after'])for(const prop of ['backdrop-filter','filter']){
  const previous=left[selector][layer][prop],current=right[selector][layer][prop];
  if(previous!==current){assert.equal(current,'none',`${selector} ${layer} ${prop} removes blur only`);assert.ok(/blur\(/.test(previous),`Only blur differs: ${previous}`);left[selector][layer][prop]=current;}
 }
 for(const selector of scope.filter(s=>s!=='.modal-overlay'))for(const layer of ['style','before'])for(const prop of ['background-color','background-image']){
  const current=right[selector][layer][prop];if(prop==='background-color')assert.ok(/^rgb\([^/]+\)$/.test(current),`${selector} ${layer} is opaque: ${current}`);else assert.equal(current,'none',`${selector} ${layer} has no translucent gradient`);left[selector][layer][prop]=current;
 }
 assert.deepEqual(right,left,'All compared properties except scoped opacity/blur match Professional');
}
async function layout(label){const value=await page.evaluate(()=>{
 const h=document.querySelector('#threadHeader'),r=h.getBoundingClientRect(),title=h.querySelector('h1').getBoundingClientRect(),close=h.querySelector('[data-action="close-thread"]').getBoundingClientRect();
 return {overflowX:document.documentElement.scrollWidth>innerWidth,overflowY:document.documentElement.scrollHeight>innerHeight,closeFits:close.right<=r.right+.1&&title.right<=close.left+1,viewport:[innerWidth,innerHeight]};
 });assert.equal(value.overflowX,false,label);assert.equal(value.overflowY,false,label);assert.equal(value.closeFits,true,label);layouts.push({label,...value});}
async function configure(palette,mode,waves=false,language='en',font='normal'){
 await settings();await page.selectOption('#prefUiPalette',palette);await page.selectOption('#prefTheme',mode);await page.locator('#prefWaveVideoBackground').setChecked(waves);await page.selectOption('#prefLanguage',language);await page.selectOption('#prefFont',font);await page.locator('#prefAnimations').check();await save();
 if(waves)await page.waitForFunction(()=>{const v=document.querySelector('.threadshelf-wave-video');return v&&v.readyState>=2&&v.videoWidth===1920&&!v.error;});
 else await page.waitForFunction(()=>!document.querySelector('.threadshelf-wave-video'));
 await page.mouse.move(1,1);await settle();
}
async function overlay(label){const v=await page.evaluate(()=>{
 const pane=document.querySelector('.content-pane'),h=document.querySelector('#threadHeader'),c=document.querySelector('.conversation-content'),first=c.querySelector('.message');
 return {active:pane.classList.contains('professional-thread-overlay'),inset:parseFloat(getComputedStyle(pane).getPropertyValue('--professional-thread-overlay-height')),header:h.getBoundingClientRect().toJSON(),content:c.getBoundingClientRect().toJSON(),first:first.getBoundingClientRect().toJSON(),padding:parseFloat(getComputedStyle(c).paddingTop),scrollPadding:parseFloat(getComputedStyle(c).scrollPaddingTop)};
 });assert.equal(v.active,true,label);assert.ok(v.content.top<=v.header.top+1,label);assert.ok(v.first.top>=v.header.bottom+10,label);assert.ok(v.padding>=v.inset+10&&v.scrollPadding>=v.inset-1,label);return v;}
async function pixelDelta(a,b){return page.evaluate(async({a,b})=>{
 const images=[];for(const base64 of[a,b]){const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);images.push(ctx.getImageData(0,0,c.width,c.height).data);}
 let sum=0,changed=0,count=0;for(let i=0;i<images[0].length;i+=4)for(let j=0;j<3;j++){const d=Math.abs(images[0][i+j]-images[1][i+j]);sum+=d;if(d>1)changed++;count++;}return{mean:sum/count,changed:changed/count};
 },{a:a.toString('base64'),b:b.toString('base64')});}
async function headerPixels(mode,waves=false){
 await action('read-start').click();await settle();
 await page.locator('.message.assistant').first().evaluate(n=>{const c=document.querySelector('.conversation-content'),h=document.querySelector('#threadHeader');c.dispatchEvent(new WheelEvent('wheel',{deltaY:600}));c.scrollTop+=n.getBoundingClientRect().top-h.getBoundingClientRect().top+40;});await settle();
 if(waves)await page.locator('.threadshelf-wave-video').evaluate(v=>v.pause());
 const clip=await page.locator('#threadHeader').evaluate(n=>{const r=n.getBoundingClientRect();return{x:Math.ceil(r.x+20),y:Math.ceil(r.y+15),width:Math.floor(r.width-40),height:Math.floor(r.height-30)};});
 const before=await page.locator('#threadHeader').boundingBox();const mask=await page.addStyleTag({content:'#threadHeader > *{visibility:hidden!important}'});
 try{
  const visible=await page.screenshot({clip});const hide=await page.addStyleTag({content:'.conversation-content > .message{visibility:hidden!important}'});await settle();const hidden=await page.screenshot({clip});await hide.evaluate(n=>n.remove());await settle();
  const contribution=await pixelDelta(visible,hidden);assert.equal(contribution.mean,0,'Opaque header fully occludes actual messages');assert.equal(contribution.changed,0);
  const transparent=await page.addStyleTag({content:'#threadHeader,#threadHeader::before{background:transparent!important}'});await settle();const exposed=await page.screenshot({clip});const controlHide=await page.addStyleTag({content:'.conversation-content > .message{visibility:hidden!important}'});await settle();const exposedHidden=await page.screenshot({clip});await controlHide.evaluate(n=>n.remove());await transparent.evaluate(n=>n.remove());await settle();
  const sensitivity=await pixelDelta(exposed,exposedHidden);assert.ok(sensitivity.mean>.3&&sensitivity.changed>.01,'Control detects real content when opacity is removed');pixels.push({surface:'header',mode,waves,contribution,sensitivity});
 }finally{await mask.evaluate(n=>n.remove());}
 await page.screenshot({path:path.join(evidence,`platinum-plus-${mode}-${waves?'waves-':''}scrolled.png`)});
 const c=await page.locator('.conversation-content').boundingBox();await page.mouse.move(c.x+c.width*.6,c.y+c.height*.8);for(let i=0;i<5;i++)await page.mouse.wheel(0,84);await settle();assert.deepEqual(await page.locator('#threadHeader').boundingBox(),before,'Header remains fixed during wheel scrolling');
 if(waves)await page.locator('.threadshelf-wave-video').evaluate(v=>v.play());
}
async function settingsPixels(mode,waves=false){
 if(waves)await page.locator('.threadshelf-wave-video').evaluate(v=>v.pause());
 const clip=await page.locator('.modal').evaluate(n=>{const r=n.getBoundingClientRect();return{x:Math.ceil(r.x+20),y:Math.ceil(r.y+20),width:Math.floor(r.width-40),height:Math.floor(r.height-40)};});
 const plane=await page.locator('.modal-overlay').evaluateHandle(n=>{const p=document.createElement('div');p.dataset.opacityProbe='';p.style.cssText='position:absolute;inset:0;z-index:-1;pointer-events:none;background:#ff0000';n.prepend(p);return p;});
 try{
  await settle();const red=await page.screenshot({clip});await plane.evaluate(n=>n.style.background='#0000ff');await settle();const blue=await page.screenshot({clip});const contribution=await pixelDelta(red,blue);assert.equal(contribution.mean,0,'Opaque Settings window fully occludes contrasting background');assert.equal(contribution.changed,0);
  const transparent=await page.addStyleTag({content:'.modal:has(#settingsForm),.modal:has(#settingsForm)::before{background:transparent!important}'});await settle();const controlBlue=await page.screenshot({clip});await plane.evaluate(n=>n.style.background='#ff0000');await settle();const controlRed=await page.screenshot({clip});await transparent.evaluate(n=>n.remove());await settle();const sensitivity=await pixelDelta(controlRed,controlBlue);assert.ok(sensitivity.mean>5&&sensitivity.changed>.1,'Control detects background when opacity is removed');pixels.push({surface:'settings',mode,waves,contribution,sensitivity});
 }finally{await plane.evaluate(n=>n.remove());}
 if(waves)await page.locator('.threadshelf-wave-video').evaluate(v=>v.play());
}

try{
 await page.goto(pathToFileURL(preview).href);await page.locator('.message.thinking').first().waitFor();await settle();
 await settings();const catalog=await page.locator('#prefUiPalette option').evaluateAll(nodes=>nodes.map(n=>({id:n.value,name:n.textContent})));const at=catalog.findIndex(n=>n.id==='platinum');assert.deepEqual(catalog.slice(at,at+3).map(n=>n.id),['platinum','platinum-plus','professional']);assert.equal(catalog[at+1].name,'Platinum Plus');assert.equal(catalog.length,19);await cancel();checks.push('19-palette catalog: Platinum, Platinum Plus, Professional');
 for(const viewport of[{width:1440,height:1000},{width:680,height:540}])for(const mode of['light','dark']){
  await page.setViewportSize(viewport);await configure('professional',mode);await action('read-start').click();await settle();const readerOriginal=await snapshot(readerSelectors);await settings();await page.mouse.move(1,1);await settle();const modalOriginal=await snapshot(modalSelectors);await cancel();
  await configure('platinum-plus',mode);await action('read-start').click();await settle();const readerPlus=await snapshot(readerSelectors);equalExceptSurfaces(readerOriginal,readerPlus,['#threadHeader']);assert.equal(readerOriginal['#threadHeader'].before['backdrop-filter'],'blur(12px)');assert.equal(readerPlus['#threadHeader'].before['backdrop-filter'],'none');assert.equal(readerPlus['.message.thinking'].before['backdrop-filter'],'blur(2px)');await overlay(`${mode}/${viewport.width}`);await layout(`reader ${mode} ${viewport.width}x${viewport.height}`);
  await settings();await page.mouse.move(1,1);await settle();const modalPlus=await snapshot(modalSelectors);equalExceptSurfaces(modalOriginal,modalPlus,['.modal','.modal-overlay']);assert.equal(modalPlus['.modal'].before['backdrop-filter'],'none');assert.equal(modalPlus['.modal-overlay'].style['backdrop-filter'],'none');assert.equal(modalOriginal['.modal'].before['backdrop-filter'],'blur(24px) saturate(1.12)');assert.equal(modalOriginal['.modal-overlay'].style['backdrop-filter'],'blur(20px)');
  const remainingBlur=await page.locator('.modal-overlay').evaluate(root=>[root,...root.querySelectorAll('*')].flatMap(n=>['', '::before','::after'].map(p=>({tag:n.tagName,id:n.id,pseudo:p,filter:getComputedStyle(n,p||null).filter,backdrop:getComputedStyle(n,p||null).backdropFilter}))).filter(v=>/blur\(/.test(v.filter+' '+v.backdrop)));assert.deepEqual(remainingBlur,[],'Settings subtree contains no residual blur layer');
  await layout(`settings ${mode} ${viewport.width}x${viewport.height}`);await page.screenshot({path:path.join(evidence,`platinum-plus-${mode}-settings-${viewport.width}.png`)});if(viewport.width===1440)await settingsPixels(mode);await cancel();
  await action('about').click();assert.equal(await page.locator('.modal').evaluate(n=>getComputedStyle(n,'::before').backdropFilter),'blur(24px) saturate(1.12)','Other dialogs retain Professional materials');assert.equal(await page.locator('.modal-overlay').evaluate(n=>getComputedStyle(n).backdropFilter),'blur(20px)');await page.locator('.modal-header [data-action="modal-close"]').click();await settle();
  if(viewport.width===1440)await headerPixels(mode);
  await configure('platinum-plus',mode,true);const wave=await page.locator('.threadshelf-wave-video').evaluate(v=>({parent:v.parentElement.className,count:document.querySelectorAll('.threadshelf-wave-video').length,width:v.videoWidth,height:v.videoHeight,theme:v.dataset.waveTheme}));assert.ok(wave.parent.includes('content-pane'));assert.equal(wave.count,1);assert.equal(wave.theme,mode);assert.equal(await page.locator('.message.thinking').first().evaluate(n=>getComputedStyle(n,'::before').backdropFilter),'blur(2px)');
  if(viewport.width===1440){await headerPixels(mode,true);await settings();await settingsPixels(mode,true);await cancel();}
  parity.push({mode,viewport,readerSelectors:readerSelectors.length,settingsSelectors:modalSelectors.length,properties:properties.length,headerTint:readerPlus['#threadHeader'].before['background-color'],settingsTint:modalPlus['.modal'].before['background-image'],wave});
 }
 checks.push('Four light/dark × wide/minimum comparisons match Professional except header/settings opacity and blur; Thinking and other dialogs retain blur');
 await page.setViewportSize({width:680,height:540});for(const language of['en','hu','de','fr','ja']){await configure('platinum-plus','dark',false,language,'xl');await action('read-start').click();await settle();await layout(`minimum XL ${language}`);await settings();await layout(`settings minimum XL ${language}`);assert.equal(await page.locator('#prefUiPalette').inputValue(),'platinum-plus');await cancel();}checks.push('All five locales at minimum size with XL text preserve layout and selected palette');
 await page.setViewportSize({width:1440,height:1000});await configure('platinum-plus','dark',false,'en','normal');await settings();await page.locator('#prefContrast').check();await save();assert.equal(await page.locator('#threadHeader').evaluate(n=>getComputedStyle(n,'::before').content),'none');await settings();await page.locator('#prefContrast').uncheck();await save();
 for(const feature of['forced-colors','prefers-reduced-transparency']){await session.send('Emulation.setEmulatedMedia',{features:[{name:feature,value:feature==='forced-colors'?'active':'reduce'}]});await settle();assert.equal(await page.locator('#threadHeader').evaluate(n=>getComputedStyle(n,'::before').content),'none');await session.send('Emulation.setEmulatedMedia',{features:[]});await settle();}checks.push('High contrast, forced colors and reduced transparency keep opaque accessibility fallback');
 await settings();await page.selectOption('#prefUiPalette','professional');await cancel();assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiPalette),'platinum-plus');assert.equal(await page.locator('#threadHeader').evaluate(n=>getComputedStyle(n,'::before').backdropFilter),'none');checks.push('Live preview/cancel restores persisted Platinum Plus and its opaque unblurred surfaces');
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(requests,[]);
 await fs.writeFile(path.join(evidence,'platinum-plus.json'),JSON.stringify({passed:true,version:'1.0.0',revision:9,previewSha256:createHash('sha256').update(await fs.readFile(preview)).digest('hex'),runtime,checks,parity,pixels,layouts,errors,consoleErrors,requests,limits:'Electron software ANGLE; focused preview test. Native persistence/restart and archive preservation are tested separately.'},null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,parity:parity.length,layouts:layouts.length}));
}catch(error){await fs.writeFile(path.join(evidence,'platinum-plus.json'),JSON.stringify({passed:false,error:error.stack,runtime,checks,parity,pixels,layouts,errors,consoleErrors,requests},null,2)+'\n');throw error;}finally{await app.close();}
