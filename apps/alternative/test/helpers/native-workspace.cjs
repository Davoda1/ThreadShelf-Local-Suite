'use strict';
// Native UI harnesses must observe the completed application startup contract.
// A created BrowserWindow can still contain its initial blank document.
const assert=require('node:assert/strict');
async function waitForWorkspace(page){
 await page.waitForFunction(()=>{
  if(document.documentElement.dataset.boot==='error')throw Error(document.getElementById('startup-detail')?.textContent||'Application startup failed');
  return document.documentElement.dataset.boot==='ready'&&document.getElementById('app')?.inert===false&&typeof window.TSADemo?.create==='function'&&typeof window.TSAContent?.renderThread==='function'&&typeof window.TSAFlush==='function';
 });
 await page.evaluate(()=>document.fonts.ready);
}
async function flushPreferences(page,expected){
 // A completed persistence queue resolves undefined; false denotes a protected,
 // non-writable profile. The saved snapshot below is the success assertion.
 assert.notEqual(await page.evaluate(()=>window.TSAFlush()),false,'The application profile must be writable');
 const saved=await page.evaluate(()=>window.alternative.loadState());
 for(const [key,value] of Object.entries(expected))assert.deepEqual(saved[key],value,'Persisted Reading preference: '+key);
}
async function setNativeViewport(application,page,{width,height}){
 const actual=await application.evaluate(({BrowserWindow},{width,height})=>{const owner=BrowserWindow.getAllWindows()[0];owner.setContentSize(width,height);const [actualWidth,actualHeight]=owner.getContentSize();return {width:actualWidth,height:actualHeight};},{width,height});
 assert.equal(actual.width,width,'Native content width must exercise the requested CSS breakpoint');
 assert.ok(actual.height>=540,'The native host must provide the supported minimum content height');
 // Device-metrics emulation alone can claim a viewport larger than the real
 // Windows client area. Match it to the native surface used by the HTML guard.
 await page.setViewportSize(actual);
 assert.deepEqual(await page.evaluate(()=>({width:innerWidth,height:innerHeight})),actual,'DOM viewport must match the native client area');
 return actual;
}
async function waitForPreview(application,block){
 await block.locator('.tsa-html-preview').waitFor({state:'visible'});
 await block.page().waitForFunction(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))));
 await block.locator('.tsa-html-preview').evaluate(node=>{if(node.dataset.previewError)throw Error('HTML preview failed: '+node.textContent);});
 let last;
 for(let i=0;i<200;i++){
  try{
   await block.locator('.tsa-html-preview').evaluate(node=>{if(node.dataset.previewError)throw Error('HTML preview failed: '+node.textContent);});
   const content=await application.evaluate(async({webContents})=>{const previews=webContents.getAllWebContents().filter(w=>/\.preview\.invalid\//.test(w.getURL()));if(previews.length!==1)return {count:previews.length};const wc=previews[0];return {count:1,loading:wc.isLoadingMainFrame(),text:await wc.executeJavaScript('document.getElementById("ready")?.textContent')};});
   assert.equal(content.count,1,'Exactly one native HTML preview must exist');assert.equal(content.loading,false,'Native HTML document must finish loading');assert.equal(content.text,'Native rendered HTML');
   assert.equal(await block.locator('pre').isVisible(),false,'Successful preview must hide the Code presentation');
   return;
  }catch(error){last=error;}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw last;
}
module.exports={waitForWorkspace,flushPreferences,setNativeViewport,waitForPreview};
