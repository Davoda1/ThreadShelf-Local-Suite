'use strict';
// Focused renderer gate. Run with Playwright Chromium, or ELECTRON_PATH + xvfb-run.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const report={version:'1.2.0',passed:false,checks:[],requests:[],errors:[]};
(async()=>{
 let browser,electron,temporary,page;
 try{
  if(process.env.ELECTRON_PATH){
   temporary=await fs.mkdtemp(path.join(os.tmpdir(),'tsa-image-renderer-'));
   const main=path.join(temporary,'main.cjs');
   await fs.writeFile(main,"const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1100,height:850,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.loadURL('about:blank')});");
   electron=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:['--no-sandbox',main],env:{...process.env,XDG_CONFIG_HOME:path.join(temporary,'config'),XDG_CACHE_HOME:path.join(temporary,'cache')}});
   page=await electron.firstWindow();
  }else{
   browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1100,height:850}});
  }
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
  const pending=[];
  await page.route('https://images.example.test/**',async route=>{
   if(route.request().url().endsWith('/pending.png')){pending.push(route);return;}
   if(route.request().url().endsWith('/missing.png'))return route.fulfill({status:404,body:'missing'});
   return route.fulfill({status:200,contentType:'image/png',body:Buffer.from(pixel,'base64')});
  });
  await page.setContent('<!doctype html><html data-theme="light"><head></head><body><main id="content" style="max-width:780px;margin:25px"></main></body></html>');
  for(const name of ['vendor/marked.umd.js','vendor/reader-rich.js','renderer/message-visibility.js','renderer/json-response.js','renderer/content.js'])await page.addScriptTag({path:path.join(root,name)});
  for(const name of ['renderer/app.css','renderer/content.css'])await page.addStyleTag({path:path.join(root,name)});
  await page.addStyleTag({content:'html,body{height:auto;overflow:auto}body{min-height:100vh}'});
  await page.evaluate(()=>{window.opened=[];window.copied=[];window.renderImageTest=(source,mode='click')=>{window.cleanup?.();const el=document.getElementById('content');const thread={turns:[{ai:source}]};window.rendered=TSAContent.renderThread(thread);el.innerHTML=rendered.html;window.cleanup=TSAContent.bind(el,{imageMode:mode,openExternal:url=>opened.push(url),copy:value=>copied.push(value)});};});
  const linked='[Before **![A useful image](https://images.example.test/good.png)** after](https://example.test/article)';
  await page.evaluate(source=>renderImageTest(source),linked);
  await page.waitForTimeout(100);
  assert.deepEqual(report.requests,[]);
  assert.equal(await page.locator('a .tsa-image-slot').count(),0);
  assert.equal(await page.locator('a[href="https://example.test/article"]').count(),2);
  assert.equal(await page.locator('.tsa-image-content[src]').count(),0);
  await page.locator('[data-load-image]').focus();await page.keyboard.press('Enter');
  await page.waitForSelector('[data-image-state="loaded"]');
  assert.equal(await page.locator('.tsa-image-content').evaluate(i=>i.naturalWidth),1);
  await page.locator('.tsa-image-content').click({button:'middle'});
  await page.locator('.tsa-image-content').click();
  assert.deepEqual(await page.evaluate(()=>opened),[]);
  await page.locator('a[href="https://example.test/article"]').first().click();
  assert.deepEqual(await page.evaluate(()=>opened),['https://example.test/article']);
  await page.locator('[data-copy-message]').click();assert.equal(await page.evaluate(()=>copied[0]),linked);
  report.checks.push('Click mode makes zero initial requests; Enter loads in renderer; linked image gestures never open browser; adjacent text link and original-copy source preserved.');
  await page.evaluate(()=>renderImageTest('![Broken source](https://images.example.test/missing.png)'));
  await page.locator('[data-load-image]').focus();await page.keyboard.press('Space');
  await page.waitForSelector('[data-image-state="failed"]');
  assert.equal(await page.locator('.tsa-image-failure svg').count(),1);
  assert.equal(await page.locator('.tsa-image-failure').getAttribute('aria-label'),'Image unavailable · Broken source');
  assert.equal(await page.locator('.tsa-image-content').isVisible(),false);
  const light=await page.locator('.tsa-image-failure-art').evaluate(el=>getComputedStyle(el).stroke);
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  const dark=await page.locator('.tsa-image-failure-art').evaluate(el=>getComputedStyle(el).stroke);
  assert.notEqual(light,dark);
  report.checks.push('Space activates load; failed image gets accessible themed SVG and no broken-image glyph.');
  await page.evaluate(()=>renderImageTest('![Automatic](https://images.example.test/auto.png)','auto'));
  await page.waitForSelector('[data-image-state="loaded"]');
  await page.evaluate(()=>renderImageTest('![Pending](https://images.example.test/pending.png)','auto'));
  await page.waitForSelector('[data-image-state="loading"]');
  await page.evaluate(()=>cleanup.configureImages({imageMode:'click'}));
  assert.equal(await page.locator('.tsa-image-slot').getAttribute('data-image-state'),'deferred');
  assert.equal(await page.locator('.tsa-image-content[src]').count(),0);
  for(const route of pending)await route.abort().catch(()=>{});
  report.checks.push('Auto mode loads; switching a pending automatic load to click cancels it and restores the button.');
  const invalid=['javascript:alert(1)','file:///tmp/a.png','data:image/svg+xml;base64,PHN2Zz4=','https://user:secret@images.example.test/a.png','ftp://images.example.test/a.png','https://images.example.test/\\bad.png','data:image/png;base64,a'];
  assert.deepEqual(await page.evaluate(values=>values.map(value=>TSAContent.safeImageSource(value)),invalid),invalid.map(()=>null));
  await page.evaluate(()=>renderImageTest('![No source](sandbox:/missing.png)\n\n<AsyncImage query="unavailable query" width="100%" aspectRatio="16:9" />'));
  assert.equal(await page.locator('[data-image-state="missing"]').count(),1);
  assert.equal(await page.locator('[data-load-image]').count(),0);
  assert.equal(await page.locator('.rich-image-placeholder').count(),1);
  const before=report.requests.length;
  await page.evaluate(data=>renderImageTest('![Embedded](data:image/png;base64,'+data+')'),pixel);
  await page.waitForSelector('[data-image-state="loaded"]');assert.equal(report.requests.length,before);
  await page.evaluate(()=>cleanup());assert.equal(await page.locator('.tsa-image-content').count(),0);
  report.checks.push('Unsafe image sources rejected; existing unavailable/rich placeholders retained; local raster needs no network; disposal releases image resources.');
  assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
 }finally{if(electron)await electron.close();if(browser)await browser.close();if(temporary)await fs.rm(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
