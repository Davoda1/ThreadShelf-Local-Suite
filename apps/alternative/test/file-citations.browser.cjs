'use strict';
// Focused native/browser acceptance using synthetic data and no network traffic.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),appPath=path.resolve(process.env.TSA_APP_PATH||root);
const report={product:'ThreadShelf Local Alternative',version:'1.3.1',checks:[],layouts:[],requests:[],errors:[],passed:false};
let browser,electron,temporary,page;
const marker=name=>`:codex-file-citation{path="sandbox:/delivery/${name}" purpose="output"}`;
async function check(name,fn){report.checks.push({name,...await fn()});}
async function viewport(width,height){
  if(electron){await electron.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].setContentSize(v.width,v.height),{width,height});await page.waitForFunction(v=>innerWidth===v.width&&innerHeight===v.height,{width,height});}
  else await page.setViewportSize({width,height});
}
(async()=>{
  try{
    if(process.env.ELECTRON_PATH){
      temporary=await fs.mkdtemp(path.join(os.tmpdir(),'tsa-citations-'));
      const wrapper=path.join(temporary,'main.cjs');
      await fs.writeFile(wrapper,`const e=require('electron');${process.env.TSA_TEST_NO_UNIX_SOCKETS==='1'?'e.app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(appPath,'main.cjs'))});`);
      electron=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:['--no-sandbox',wrapper],env:{...process.env,XDG_CONFIG_HOME:path.join(temporary,'config'),XDG_CACHE_HOME:path.join(temporary,'cache')},timeout:30000});
      page=await electron.firstWindow();
    }else{
      browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
      page=await browser.newPage({viewport:{width:1160,height:820},colorScheme:'light'});
    }
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('request',request=>{if(/^https?:/.test(request.url()))report.requests.push(request.url());});
    if(!electron)await page.goto(pathToFileURL(process.env.DEMO_PATH||path.join(appPath,'renderer/index.html')).href);
    await page.waitForSelector('#app[data-ready="true"]');
    if(await page.locator('#welcome-demo').isVisible())await page.click('#welcome-demo');
    await page.waitForSelector('#thread-content .tsa-message');
    await check('Application loads its isolated citation renderer',async()=>{
      assert.equal(await page.evaluate(()=>typeof TSAFileCitations.createFileCitationExtension),'function');
      return {loaded:true};
    });
    await page.evaluate(()=>{
      const old=document.getElementById('thread-content'),node=old.cloneNode(false);old.replaceWith(node);
      window.citationCopies=[];window.citationOpened=[];
      window.mountCitationFixture=async source=>{
        window.citationCleanup?.();
        const thread={turns:[{ai:source}]},before=JSON.stringify(thread);
        const rendered=TSAContent.renderThread(thread,{showReasoning:true});
        node.innerHTML=rendered.html;
        window.citationCleanup=TSAContent.bind(node,{copy:text=>citationCopies.push(text),openExternal:url=>citationOpened.push(url),imageMode:'click'});
        await citationCleanup.ready;
        return {unchanged:JSON.stringify(thread)===before,names:[...node.querySelectorAll('.tsa-file-name')].map(el=>el.textContent)};
      };
    });
    const source='These references are inert: '+['release-notes.txt','project.tar.xz','árvíz 日本語.cpp','unusual.unknownformat'].map(marker).join(' · ');
    await check('Known, unknown and Unicode names become soft chips with safe semantics',async()=>{
      const result=await page.evaluate(text=>mountCitationFixture(text),source);
      assert.equal(result.unchanged,true);assert.deepEqual(result.names,['release-notes.txt','project.tar.xz','árvíz 日本語.cpp','unusual.unknownformat']);
      const semantics=await page.evaluate(()=>[...document.querySelectorAll('#thread-content .tsa-file-citation')].map(el=>({role:el.getAttribute('role'),disabled:el.getAttribute('aria-disabled'),iconHidden:el.querySelector('.tsa-file-icon').getAttribute('aria-hidden'),hasHref:el.hasAttribute('href'),badge:!!el.querySelector('.tsa-file-type')})));
      assert.equal(semantics.length,4);
      for(const item of semantics)assert.deepEqual(item,{role:'link',disabled:'true',iconHidden:'true',hasHref:false,badge:false});
      return {chips:semantics.length,sourceUnchanged:true};
    });
    await check('Mouse activation does nothing; Copy message retains exact marker source',async()=>{
      await page.locator('.tsa-file-name').first().click();
      await page.locator('#thread-content [data-copy-message]').click();
      await page.waitForFunction(()=>citationCopies.length===1);
      assert.deepEqual(await page.evaluate(()=>citationCopies),[source]);
      assert.deepEqual(await page.evaluate(()=>citationOpened),[]);
      return {originalCopied:true,externalOpens:0};
    });
    await check('Code, JSON, math and linked labels retain literal citation syntax',async()=>{
      const raw=marker('literal.pdf');
      const outputs=await page.evaluate(raw=>[
        TSAContent.markdown('`'+raw+'`'),
        TSAContent.markdown('```text\n'+raw+'\n```'),
        TSAContent.markdown('    '+raw),
        TSAContent.markdown(JSON.stringify({file:raw}),{},'assistant'),
        TSAContent.markdown('\\('+raw+'\\)'),
        TSAContent.markdown('['+raw+'](https://example.invalid/)')
      ],raw);
      outputs.forEach(html=>assert.doesNotMatch(html,/tsa-file-citation/));
      return {literalContexts:outputs.length};
    });
    await check('Soft chips wrap inside light/dark reading panes at desktop and minimum size',async()=>{
      await page.evaluate(text=>mountCitationFixture(text),marker('long-'+ 'x'.repeat(240)+'.tar.xz'));
      for(const theme of ['light','dark'])for(const size of [[1160,820],[680,540]]){
        await viewport(...size);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const layout=await page.evaluate(()=>{
          const chip=document.querySelector('.tsa-file-citation'),reader=document.getElementById('reader-scroll'),icon=chip.querySelector('.tsa-file-icon');
          return {theme:document.documentElement.dataset.theme,width:innerWidth,height:innerHeight,documentOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,readerOverflow:reader.scrollWidth>reader.clientWidth,chipWidth:chip.getBoundingClientRect().width,readerWidth:reader.clientWidth,iconWidth:icon.getBoundingClientRect().width,color:getComputedStyle(chip).color,background:getComputedStyle(chip).backgroundColor};
        });
        assert.equal(layout.documentOverflow,false);assert.equal(layout.readerOverflow,false);assert.ok(layout.chipWidth<=layout.readerWidth);assert.ok(layout.iconWidth>5);report.layouts.push(layout);
      }
      assert.notEqual(report.layouts[0].color,report.layouts[2].color);
      assert.notEqual(report.layouts[0].background,report.layouts[2].background);
      return {layouts:report.layouts.length};
    });
    if(process.env.CITATION_SCREENSHOT){await viewport(960,720);await page.evaluate(t=>mountCitationFixture(t),source);await page.screenshot({path:process.env.CITATION_SCREENSHOT});}
    assert.deepEqual(report.requests,[]);assert.deepEqual(report.errors,[]);report.passed=true;
  }finally{
    if(electron)await electron.close();if(browser)await browser.close();
    if(temporary)await fs.rm(temporary,{recursive:true,force:true});
  }
})().catch(error=>{report.failure=error.stack;process.exitCode=1;}).finally(async()=>{
  if(process.env.CITATION_REPORT){await fs.mkdir(path.dirname(process.env.CITATION_REPORT),{recursive:true});await fs.writeFile(process.env.CITATION_REPORT,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
});
