'use strict';
// Actual reading-pane geometry gate. All raster fixtures are generated in memory.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),appPath=path.resolve(process.env.TSA_APP_PATH||root);
const report={product:'ThreadShelf Local Alternative',version:'1.1.0',target:process.env.TSA_SIZING_TARGET||'source',runtime:process.env.ELECTRON_PATH?'native-linux-electron':'browser',checks:[],layouts:[],errors:[],requests:[],passed:false};
let browser,context,electron,temporary,page;
async function settings(){await page.click('#reading-settings');await page.waitForSelector('#settings-dialog[open]');}
async function done(){await page.locator('#settings-dialog .dialog-footer [data-close]').click();}
async function shot(name){if(process.env.SIZING_SCREENSHOTS){await fs.mkdir(process.env.SIZING_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SIZING_SCREENSHOTS,name+'.png')});}}
async function viewport(width,height){if(electron){await electron.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].setContentSize(v.width,v.height),{width,height});await page.waitForFunction(v=>innerWidth===v.width&&innerHeight===v.height,{width,height});}else await page.setViewportSize({width,height});}
async function geometry(label){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const sample=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},globalOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,readerOverflow:document.getElementById('reader-scroll').scrollWidth>document.getElementById('reader-scroll').clientWidth,images:[...document.querySelectorAll('#thread-content .tsa-image-slot')].map(slot=>{const image=slot.querySelector('img'),box=image.getBoundingClientRect(),frame=slot.getBoundingClientRect();return{alt:image.alt,state:slot.dataset.imageState,size:slot.dataset.imageSize,design:slot.dataset.imageDesign,width:box.width,height:box.height,frameWidth:frame.width,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,centerOffset:(box.left+box.width/2)-(frame.left+frame.width/2),objectFit:getComputedStyle(image).objectFit};}),tables:[...document.querySelectorAll('#thread-content .tsa-table-scroll')].map(t=>({width:t.clientWidth,scrollWidth:t.scrollWidth})),narrowBoxWidth:document.querySelector('#thread-content .rich-box[style*="180px"]')?.getBoundingClientRect().width}));
  assert.equal(sample.globalOverflow,false,label+' global overflow');assert.equal(sample.readerOverflow,false,label+' reader horizontal overflow');
  assert.equal(sample.images.length,9);
  for(const image of sample.images){
    assert.equal(image.state,'loaded',label+' '+image.alt);assert.ok(image.width>0&&image.height>0,label+' positive size '+image.alt);
    const ratio=image.naturalWidth/image.naturalHeight,cap=image.size==='compact'?Math.min(sample.viewport.height*.45,320):Math.min(sample.viewport.height*.7,720);
    assert.ok(image.width<=image.frameWidth+1,label+' available width '+image.alt);
    assert.ok(image.height<=cap+1,label+' height cap '+image.alt);
    assert.ok(Math.abs(image.width-image.height*ratio)<1.2,label+' aspect ratio '+image.alt);
    assert.ok(Math.abs(image.width-Math.min(image.frameWidth,cap*ratio))<1.2,label+' fills suitable space '+image.alt);
    assert.ok(Math.abs(image.centerOffset)<1,label+' centered '+image.alt);
    assert.equal(image.objectFit,'contain');if(image.size==='compact')assert.ok(image.frameWidth<=321,label+' compact width '+image.alt);
  }
  for(const table of sample.tables)assert.ok(table.scrollWidth<=table.width+1,label+' image does not force table scrolling');
  const byName=Object.fromEntries(sample.images.map(image=>[image.alt,image]));
  for(const name of ['Small landscape','Portrait','Wide panorama','Square','Emphasized standalone'])assert.equal(byName[name].size,'wide',name+' standalone');
  for(const name of ['Inline image','Table image','Narrow rich image'])assert.equal(byName[name].size,'compact',name+' compact');
  assert.equal(byName['Emphasized standalone'].design,'compact','fallback classification remains unchanged');
  assert.ok(byName['Small landscape'].width>64,label+' small image enlarged');
  assert.ok(byName['Large landscape'].width<4000,label+' large image reduced');
  assert.ok(byName['Narrow rich image'].width<=181,label+' declared rich width retained');
  report.layouts.push({label,...sample});return byName;
}
(async()=>{
 try{
  if(process.env.ELECTRON_PATH){
   temporary=await fs.mkdtemp(path.join(os.tmpdir(),'tsa-image-sizing-'));
   const wrapper=path.join(temporary,'main.cjs');
   await fs.writeFile(wrapper,`const e=require('electron');${process.env.TSA_TEST_NO_UNIX_SOCKETS==='1'?'e.app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(appPath,'main.cjs'))});`);
   electron=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:['--no-sandbox',wrapper],env:{...process.env,XDG_CONFIG_HOME:path.join(temporary,'config'),XDG_CACHE_HOME:path.join(temporary,'cache')},timeout:30000});page=await electron.firstWindow();
  }else{
   browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});context=await browser.newContext({viewport:{width:1360,height:880},colorScheme:'light'});page=await context.newPage();
  }
  page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
  if(!electron)await page.goto(pathToFileURL(path.join(appPath,'renderer/index.html')).href);
  await page.waitForSelector('#app[data-ready="true"]');if(electron){await page.click('#welcome-demo');await page.waitForSelector('#thread-content .tsa-message');}
  await viewport(1360,880);
  await page.evaluate(()=>{
   const raster=(w,h,title)=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d');c.fillStyle='#17635f';c.fillRect(0,0,w,h);c.fillStyle='#b9dfd2';c.fillRect(w*.08,h*.08,w*.84,h*.84);c.fillStyle='#17635f';c.fillRect(w*.17,h*.22,w*.22,h*.56);c.fillStyle='#347f76';c.beginPath();c.arc(w*.67,h*.5,Math.min(w,h)*.2,0,Math.PI*2);c.fill();return canvas.toDataURL('image/png');};
   const landscape=raster(64,40),large=raster(4000,2500),portrait=raster(80,240),panorama=raster(300,50),square=raster(32,32);
   const text=[`![Small landscape](${landscape})`,`![Large landscape](${large})`,`![Portrait](${portrait})`,`![Wide panorama](${panorama})`,`![Square](${square})`,`**![Emphasized standalone](${landscape})**`,`Text before ![Inline image](${landscape}) and text after.`,`| Picture | Description |\n| --- | --- |\n| ![Table image](${large}) | A table cell remains bounded. |`,`<row gap={2}><box width="180px">![Narrow rich image](${landscape})</box><box flex="1">The narrow image column keeps its declared size beside this paragraph.</box></row>`].join('\n\n');
   const node=document.getElementById('thread-content');window.sizingFixture={turns:[{ai:text}]};node.innerHTML=TSAContent.renderThread(sizingFixture).html;window.sizingCleanup=TSAContent.bind(node,{imageMode:'click'});document.getElementById('thread-title').textContent='Responsive image sizing';document.getElementById('reader-scroll').scrollTop=0;
  });
  await page.waitForFunction(()=>document.querySelectorAll('#thread-content .tsa-image-slot[data-image-state="loaded"]').length===9);
  const comfortable=await geometry('desktop-comfortable-light');await shot('sizing-desktop-light');
  await settings();await page.selectOption('#line-width','compact');await done();const compact=await geometry('desktop-compact');
  assert.ok(compact['Small landscape'].width<comfortable['Small landscape'].width,'reading width changes recompute images');
  await settings();await page.selectOption('#line-width','wide');await done();const wide=await geometry('desktop-wide');
  assert.ok(wide['Small landscape'].width>compact['Small landscape'].width,'wide mode enlarges same loaded image');
  await page.click('#focus-mode');const focused=await geometry('desktop-focus');assert.ok(focused['Small landscape'].width>wide['Small landscape'].width,'focus layout enlarges same loaded image');
  report.checks.push('Small raster images enlarge and large images shrink to the actual reading width; width settings and Focus resize existing images.');
  await page.click('#focus-mode');await viewport(680,540);const minimum=await geometry('minimum-680x540-light');
  assert.ok(minimum.Portrait.height<comfortable.Portrait.height,'portrait responds to viewport height');
  if(!await page.locator('#app').evaluate(el=>el.classList.contains('shelf-hidden')))await page.click('#hide-library');
  await geometry('minimum-680x540-shelf-hidden');await shot('sizing-minimum-light');
  await settings();await page.click('#theme-choices [data-theme="dark"]');await done();await geometry('minimum-680x540-dark');await shot('sizing-minimum-dark');
  await viewport(1360,880);await geometry('desktop-dark');
  report.checks.push('Standalone landscape, portrait, panorama and square images preserve aspect ratio, remain centered, and obey viewport height bounds in light/dark and at 680×540.');
  report.checks.push('Inline, table and explicit 180px rich-column images remain compact without forcing horizontal scrolling.');
  report.checks.push('Emphasis around a standalone image does not shrink loaded sizing; the separate failed-image design classification is retained.');
  const final=await page.evaluate(()=>({count:document.querySelectorAll('#thread-content img.tsa-image-content').length,sources:[...document.querySelectorAll('#thread-content img.tsa-image-content')].every(i=>i.getAttribute('src').startsWith('data:image/png;base64,'))}));
  assert.equal(final.count,9);assert.equal(final.sources,true);assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);report.passed=true;
 }finally{
  if(electron)await electron.close();if(browser)await browser.close();if(temporary)await fs.rm(temporary,{recursive:true,force:true});
 }
})().catch(error=>{report.failure=error.message;console.error(error);process.exitCode=1;}).finally(async()=>{
 const out=process.env.SIZING_REPORT||path.join(root,'docs/image-sizing.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,layouts:report.layouts.length,errors:report.errors,failure:report.failure},null,2));
});
