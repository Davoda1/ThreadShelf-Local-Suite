'use strict';
// Synthetic fixtures for the production chat renderer and its unchanged CSP.
// Run with PLAYWRIGHT_PATH and optional CHROMIUM_PATH or ELECTRON_PATH.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" rx="16" fill="#187a70"/><text x="18" y="70" fill="white">SVG café ✓</text></svg>';
const base64=text=>Buffer.from(text,'utf8').toString('base64');
const fixtures=[
 ['svg',svg,true],['xml',svg,true],['',svg,true],['SVG',svg,true],
 ['xml','<!-- before -->\n'+svg+'\n<!-- after -->',true],
 ['svg','<svg width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',true],
 ['',base64(svg),true],['svg','data:image/svg+xml;base64,'+base64(svg),true],
 ['xml',base64('<!-- Unicode ✓ -->\n'+svg+'\n<!-- end -->').match(/.{1,60}/g).join('\n'),true],
 ['html',svg,false],['text',svg,false],['javascript',svg,false],['xml extra',svg,false],
 ['svg','<html>'+svg+'</html>',false],['xml',svg+svg,false],['',svg+'extra',false],
 ['svg',svg+'<p/>',false],['svg','<svg><broken></svg>',false],['svg','not-base64',false],
 ['xml',base64('<html>'+svg+'</html>'),false],['svg','data:text/html;base64,'+base64(svg),false],
 ['svg','<?xml version="1.0"?>'+svg,false],['svg','<!DOCTYPE svg>'+svg,false],
 ['svg','<!-- broken -- comment -->'+svg,false],['xml','<svg xmlns="https://example.invalid/not-svg"></svg>',false],
 ['svg','<svg xmlns="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg"></svg>',false],
 ['svg','<svg><g xmlns="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg"/></svg>',false],
 ['svg','<svg xmlns:p="urn:a" xmlns:p="urn:b"></svg>',false],
 ['svg',Buffer.from([0xff,0xfe,0xfd]).toString('base64'),false],
 ['svg','PHN2Zy8+====',false],
 ['svg','<!DOCTYPE svg [<!ENTITY x "text">]><svg>&x;</svg>',false],
 ['xml','<svg><?example instruction?></svg>',false],
];

async function launch(){
 if(!process.env.ELECTRON_PATH)return playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'threadshelf-svg-preview-'));
 const main=path.join(temporary,'main.cjs');
 fs.writeFileSync(main,"const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1100,height:850,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.loadURL('about:blank')});app.on('window-all-closed',()=>app.quit());");
 const flags=process.env.ELECTRON_HEADLESS==='1'?['--ozone-platform=headless','--ozone-override-screen-size=1920,1080','--disable-gpu']:[];
 let electron;
 try{
  electron=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:['--no-sandbox',...flags,main],env:{...process.env,XDG_CONFIG_HOME:path.join(temporary,'config'),XDG_CACHE_HOME:path.join(temporary,'cache')},timeout:30000});
  const page=await electron.firstWindow();
  return {newPage:async()=>page,close:async()=>{await electron.close();fs.rmSync(temporary,{recursive:true,force:true});}};
 }catch(error){if(electron)await electron.close();fs.rmSync(temporary,{recursive:true,force:true});throw error;}
}

(async()=>{
 const browser=await launch();
 try{
  const page=await browser.newPage({viewport:{width:1100,height:850}});await page.setViewportSize({width:1100,height:850});
  const requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^(?:https?|wss?):/i.test(request.url()))requests.push(request.url());});
  await page.route('https://example.invalid/**',route=>route.abort());
  await page.goto(pathToFileURL(path.join(root,'test/empty.html')).href);
  const csp=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
  await page.setContent('<!doctype html><html data-theme="light"><head>'+csp+'</head><body><main id="content" style="max-width:760px;margin:20px auto"></main></body></html>');
  await page.evaluate(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>cspViolations.push(event.violatedDirective));});
  for(const file of ['vendor/marked.umd.js','vendor/highlight.bundle.js','renderer/message-visibility.js','renderer/json-response.js','renderer/file-citations.js','renderer/svg-preview.js','renderer/content.js'])await page.addScriptTag({url:pathToFileURL(path.join(root,file)).href});
  for(const file of ['renderer/app.css','renderer/content.css','renderer/code-themes.css'])await page.addStyleTag({path:path.join(root,file)});
  await page.addStyleTag({content:'html,body{height:auto;overflow:auto}'});
  const rendered=await page.evaluate(async fixtures=>{
   const content=document.getElementById('content');
   content.innerHTML=TSAContent.renderThread({turns:fixtures.map(([language,source])=>({ai:'```'+language+'\n'+source+'\n```'}))}).html;
   window.copied=[];window.cleanup=TSAContent.bind(content,{copy:text=>copied.push(text)});await cleanup.ready;
   return [...content.querySelectorAll('.tsa-code-block')].map(block=>({eligible:!!block.querySelector('[data-svg-toggle]'),source:block.querySelector('pre code').textContent,view:block.dataset.svgView,loaded:!!block.querySelector('.tsa-svg-preview img[src]')}));
  },fixtures);
  assert.equal(rendered.length,fixtures.length);
  const blocks=page.locator('.tsa-code-block');
  for(let i=0;i<fixtures.length;i++){
   const [language,source,eligible]=fixtures[i],block=blocks.nth(i);
   assert.equal(rendered[i].eligible,eligible,'eligibility '+i+' ('+language+')');assert.equal(rendered[i].source,source);
   await block.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>copied.at(-1)),source);
   if(!eligible)continue;
   assert.equal(rendered[i].view,'code');assert.equal(rendered[i].loaded,false);
   const toggle=block.locator('[data-svg-toggle]');assert.equal(await toggle.textContent(),'SVG');
   await toggle.click();await block.locator('.tsa-svg-preview img').evaluate(image=>image.decode());
   assert.equal(await toggle.textContent(),'Code');assert.equal(await toggle.getAttribute('aria-pressed'),'true');
   assert.equal(await block.locator('pre').isVisible(),false);assert.equal(await block.locator('.tsa-svg-preview').isVisible(),true);
   assert.equal(await block.locator('svg,script,iframe,object,embed').count(),0);
   await block.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>copied.at(-1)),source);
   await toggle.click();assert.equal(await block.locator('pre').isVisible(),true);assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await block.locator('pre code').textContent(),source);
  }
  assert.deepEqual(await page.evaluate(()=>cspViolations),[]);
  const hostile='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="60" height="60" onload="parent.SVG_PWNED=1"><script>fetch("https://example.invalid/script-run");parent.SVG_PWNED=2</script><style>@import url(https://example.invalid/style.css);rect{fill:url(https://example.invalid/fill.svg#p)}</style><image href="https://example.invalid/image.png"/><use xlink:href="https://example.invalid/use.svg#p"/><foreignObject width="40" height="40"><body xmlns="http://www.w3.org/1999/xhtml"><img src="https://example.invalid/foreign.png" onerror="parent.SVG_PWNED=3"/></body></foreignObject><rect width="60" height="60" fill="red"/></svg>';
  await page.evaluate(async source=>{cleanup();const el=document.getElementById('content');el.innerHTML=TSAContent.renderThread({turns:[{ai:'```svg\n'+source+'\n```'}]}).html;cleanup=TSAContent.bind(el,{copy:text=>copied.push(text)});await cleanup.ready;},hostile);
  await page.locator('[data-svg-toggle]').click();await page.locator('.tsa-svg-preview img').evaluate(image=>image.decode());
  assert.equal(await page.evaluate(()=>window.SVG_PWNED||0),0);assert.equal(await page.locator('#content svg,#content script,#content iframe,#content object').count(),0);
  await page.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>copied.at(-1)),hostile);
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width:680,height:540});
   const layout=await page.locator('.tsa-svg-preview').evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement.getBoundingClientRect().width,image:el.querySelector('img').getBoundingClientRect().width,scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(layout.width<=layout.parent+1);assert.ok(layout.image<=layout.width);assert.ok(layout.scroll<=layout.viewport);
  }
  await page.locator('.tsa-svg-preview img').evaluate(image=>image.dispatchEvent(new Event('error')));assert.equal(await page.locator('.tsa-svg-error').isVisible(),true);
  await page.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>copied.at(-1)),hostile);
  await page.locator('[data-svg-toggle]').click();assert.equal(await page.locator('pre').isVisible(),true);
  await page.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>copied.at(-1)),hostile);
  await page.evaluate(()=>cleanup());assert.equal(await page.locator('[data-svg-toggle],.tsa-svg-preview').count(),0);assert.equal(await page.locator('pre').isVisible(),true);
  const cspBlocks=await page.evaluate(()=>cspViolations);
  // Ordinary fixtures produced none. Chromium may report enforcement for the
  // two deliberately hostile event attributes while parsing their SVG.
  assert.ok(cspBlocks.length<=2&&cspBlocks.every(value=>value==='script-src-attr'));
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,fixtures:fixtures.length,copyPreservedBothViews:true,initialCode:true,isolatedSvg:true,productionCsp:true,hostileAttributesBlocked:cspBlocks.length,errorFallback:true,layouts:2,cleanup:true,requests,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
