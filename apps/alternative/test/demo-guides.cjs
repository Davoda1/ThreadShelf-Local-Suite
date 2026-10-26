/* Browser regression for the bundled guides, offline showcases and reserved demo routes. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
let playwright; try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright'); }
const root = path.resolve(__dirname, '..');
const demo = process.env.DEMO_PATH || path.join(root, 'dist/ThreadShelf-Local-Alternative-1.2.0-Demo.html');
const guideOrigin = 'https://guide.threadshelf.invalid';
const guides = ['guide-start-here', 'guide-search-and-read', 'guide-server-and-resources'];
const showcases = ['showcase-observatory', 'showcase-workshop'];
// Hashes of the complete original eight fictional fixtures, serialized by the demo adapter.
const originalHashes = {
  'quiet-library':'f2f2983599b8b5a12735a4f579027d295f4865633f86eb936af0f71af25022f2',
  'local-search':'9daf0b27ce1b8994cc09685d995c0417b17dc66e4323416f4c0bd7d1ea3375e6',
  'reading-ritual':'043437b4c396151b95d8cef01dc4efa5257bda2234ddc3d85d95808ac4c1f864',
  'garden-notes':'05735d7ccccd60ef37311c0c61c3bae5f6e512c1f40601951afd5c756efb2d41',
  'offline-first':'cc7be3da9f5aa95163cf1c0fbd827898cbb8213d1771171ea8a45df0720941ea',
  'markdown-test':'7c789910270df66009711fb1d41e6b540a08c72dba90bf6e045a4de7a85c2bae',
  'color-notes':'b7ecbb7af3cb55161dc658c6cef3a566681cdcca32aeca684cf3b2a49c8f16b8',
  'small-tools':'65a5620e97b246604ab06969408c3fff0e77ce384f590fea46dbb88e8981b6c4'
};
const report = {version:'1.2.0',success:false,checks:[],fixtures:[],routes:[],showcases:[],layouts:[],networkRequests:[],pageErrors:[]};
(async () => {
  const browser = await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
  const check = name => report.checks.push(name);
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
    await context.setOffline(true);
    await context.addInitScript(() => {
      window.__opened = []; window.__copied = [];
      window.open = (...args) => { window.__opened.push(args); return null; };
      Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async text => {window.__copied.push(String(text));}}});
    });
    const page = await context.newPage();
    const observe = p => {
      p.on('request', r => {if (/^(?:https?|wss?):/.test(r.url())) report.networkRequests.push(r.url());});
      p.on('pageerror', e => report.pageErrors.push(e.message));
    };
    observe(page);
    await page.goto(pathToFileURL(demo).href);
    await page.waitForFunction(() => document.documentElement.dataset.boot === 'ready' && document.querySelectorAll('.result-card').length === 13);
    const fixture = await page.evaluate(async () => {
      const adapter = TSADemo.create(), threads = [];
      for (const item of TSADemo.threads) threads.push(await adapter.request('thread', item));
      return {threads, rows:(await adapter.request('browse',{collection:'all',limit:30,sort:'updated'})).items, collections:await adapter.request('collections')};
    });
    const byId = Object.fromEntries(fixture.threads.map(t => [t.id,t]));
    assert.equal(fixture.threads.length,13);
    assert.equal(new Set(fixture.threads.map(t => t.id)).size,13);
    assert.deepEqual(fixture.rows.slice(0,3).map(t => t.id),guides);
    assert.deepEqual(await page.locator('.result-title').allTextContents(),fixture.rows.map(t => t.title));
    assert.equal(await page.locator('#thread-title').textContent(),byId[guides[0]].title);
    for (const [id,hash] of Object.entries(originalHashes)) assert.equal(crypto.createHash('sha256').update(JSON.stringify(byId[id])).digest('hex'),hash,`${id}: original fixture changed`);
    for (const id of guides) {assert.equal(byId[id].provider,'Claude');assert.equal(byId[id].collection,'Getting started');}
    for (const id of showcases) {assert.equal(byId[id].provider,'ChatGPT');assert.equal(byId[id].collection,'Rendering showcase');}
    for (const thread of fixture.threads) {
      assert.ok(thread.messages.some(m => m.role === 'user'));
      assert.ok(thread.messages.some(m => m.role === 'assistant'));
      assert.equal(fixture.rows.find(r => r.id === thread.id).provider,thread.provider);
      report.fixtures.push({id:thread.id,provider:thread.provider,messages:thread.messages.length,originalUnchanged:originalHashes[thread.id]?true:null});
    }
    check('13 distinct fictional chats; the original 8 are byte-identical, three Claude guides lead the default library, and two showcases identify ChatGPT');
    assert.equal(await page.title(),'ThreadShelf Local Alternative');
    assert.doesNotMatch(await page.locator('.library-heading').textContent(),/Revision|1\.2\.0/i);
    await page.locator('#reading-settings').click();
    assert.equal((await page.locator('.about-line strong').textContent()).trim(),'1.2.0');
    await page.locator('#settings-dialog .dialog-footer [data-close]').click();
    check('Window and sidebar omit version; Settings retains 1.2.0');
    const adapterChecks = await page.evaluate(async () => {
      const a=TSADemo.create(), rows=[];
      for (const item of TSADemo.threads) {
        const t=await a.request('thread',item);
        for(const role of ['user','assistant']) {
          const q=t.messages.find(m=>m.role===role).content;
          const hit=await a.request('search',{collection:t.collection,q,role,mode:'keyword',limit:30});
          rows.push({id:t.id,role,matched:hit.items.some(r=>r.id===t.id&&r.role===role),providers:hit.items.map(r=>r.provider)});
        }
      }
      const collections=await a.request('collections'), scopes=[];
      for(const c of collections.collections) scopes.push({name:c.name,total:c.count,items:(await a.request('browse',{collection:c.name,limit:30})).items.map(i=>i.id)});
      return {rows,scopes};
    });
    assert.equal(adapterChecks.rows.length,26);for(const result of adapterChecks.rows)assert.ok(result.matched,`${result.id} ${result.role} search`);
    assert.deepEqual(Object.fromEntries(adapterChecks.scopes.map(c=>[c.name,c.total])),{'Getting started':3,'Rendering showcase':2,'Ideas & research':5,'Build notebook':3});
    for(const scope of adapterChecks.scopes){assert.equal(scope.items.length,scope.total);for(const id of scope.items)assert.equal(byId[id].collection,scope.name);}
    check('Every chat is searchable by both its prompt and response with exact role and collection scope; all provider metadata survives');

    const closePanels = async () => {
      for (const dialog of await page.locator('dialog[open]').all()) await dialog.locator('[data-close]').first().click();
      if(await page.locator('#app').evaluate(el=>el.classList.contains('focus-mode')))await page.keyboard.press('Escape');
      if(await page.locator('#outline-pane').isVisible())await page.locator('#toggle-outline').click();
    };
    const home = async () => {
      await closePanels();
      await page.locator('#home-button').click();
      await page.waitForFunction(t=>document.getElementById('thread-title').textContent===t,byId[guides[0]].title);
      if(await page.locator('#app').evaluate(el=>el.classList.contains('shelf-hidden')))await page.locator('#toggle-library').click();
    };
    const open = async id => {
      await home();
      await page.locator('.result-card').filter({has:page.locator('.result-title',{hasText:byId[id].title})}).first().click();
      await page.waitForFunction(t=>document.getElementById('thread-title').textContent===t,byId[id].title);
      await page.waitForFunction(n=>document.querySelectorAll('#thread-content .tsa-message').length===n,byId[id].messages.length);
    };
    const internal = [];
    for(const id of guides) {
      await open(id);
      assert.match(await page.locator('#thread-kicker').textContent(),/Getting started \/ Claude/);
      assert.ok((await page.locator('#thread-content .tsa-assistant .tsa-role').allTextContents()).every(label=>label==='Claude'));
      assert.equal(await page.locator('#thread-content .tsa-message').count(),byId[id].messages.length);
      const links=await page.locator('#thread-content a[href]').evaluateAll(a=>a.map(e=>e.href));
      for(const href of [...new Set(links.filter(h=>h.startsWith(guideOrigin+'/')))])internal.push({source:id,href});
      assert.ok(links.some(h=>h.startsWith(guideOrigin+'/')));
    }
    assert.ok(internal.length>=10,'Guides should expose useful menu routes');
    const actionSet = new Set();const destinationSet = new Set();
    for(const route of internal) {
      await open(route.source);
      await page.locator('#thread-content a').filter({hasText:''}).evaluateAll((anchors,href)=>{const a=anchors.find(a=>a.href===href);if(!a)throw Error('Guide link missing');a.setAttribute('data-qa-route','');},route.href);
      await page.locator('[data-qa-route]').click();
      const url=new URL(route.href),[,kind,target]=url.pathname.split('/');
      if(kind==='chat') {
        assert.ok(byId[target],route.href);
        await page.waitForFunction(t=>document.getElementById('thread-title').textContent===t,byId[target].title);
        destinationSet.add(target);
      } else {
        actionSet.add(target);
        if(target==='connect'||target==='settings')assert.equal(await page.locator('#'+target+'-dialog').isVisible(),true);
        else if(target==='focus')assert.ok(await page.locator('#app').evaluate(el=>el.classList.contains('focus-mode')));
        else if(target==='outline')assert.equal(await page.locator('#outline-pane').isVisible(),true);
        else {
          await page.waitForFunction(view=>document.querySelector('[data-view="'+view+'"]').getAttribute('aria-current')==='page',target==='search'?'library':target);
          if(target==='search') {assert.equal(await page.locator('#search-input').inputValue(),url.searchParams.get('q')||'');assert.ok(await page.locator('#search-input').evaluate(e=>e===document.activeElement));}
        }
      }
      report.routes.push({source:route.source,path:url.pathname+url.search,ok:true});
    }
    assert.deepEqual([...actionSet].sort(),['connect','focus','library','outline','pins','recent','search','settings']);
    for(const id of [...guides,...showcases])assert.ok(destinationSet.has(id),`Guide menu lacks destination ${id}`);
    assert.deepEqual(await page.evaluate(()=>window.__opened),[]);
    check('Every bundled guide anchor navigates to its exact chat or one of all eight allowed actions without opening a browser or requesting network');
    await open('guide-server-and-resources');
    const github='https://github.com/ChrystianSchutz/ThreadShelf#readme';
    assert.ok(await page.locator('#thread-content a[href="'+github+'"]').count());
    await page.locator('#thread-content a[href="'+github+'"]').first().click();
    assert.deepEqual(await page.evaluate(()=>window.__opened),[[github,'_blank','noopener,noreferrer']]);
    check('The source-resource link targets the correct official ThreadShelf GitHub repository');

    await open(guides[0]);
    const denied=[
      guideOrigin+'/chat/not-a-demo-id',guideOrigin+'/action/settings?unexpected=1',guideOrigin+'/action/search?q=one&q=two',
      guideOrigin+'/action/search?other=one',guideOrigin+'/action/not-an-action',guideOrigin+'/chat/quiet-library?x=1',
      guideOrigin+'/action/settings#fragment','http://guide.threadshelf.invalid/action/settings',
      'https://user:password@guide.threadshelf.invalid/action/settings','https://guide.threadshelf.invalid:444/action/settings',
      'https://guide.threadshelf.invalid./action/settings',guideOrigin+'/action/settings/extra',
      guideOrigin+'/action/search?q='+('a'.repeat(4001))
    ];
    for(const href of denied) {
      const before=await page.locator('#thread-title').textContent();
      await page.evaluate(h=>{document.getElementById('qa-denied')?.remove();const a=document.createElement('a');a.id='qa-denied';a.href=h;a.textContent='QA invalid guide shortcut';document.querySelector('#thread-content .message-content').append(a);},href);
      await page.locator('#qa-denied').click();
      assert.equal(await page.locator('dialog[open]').count(),0);
      assert.equal(await page.locator('#thread-title').textContent(),before);
      assert.match(await page.locator('#toast').textContent(),/not supported|not part of the built-in demo|too long/);
    }
    assert.equal((await page.evaluate(()=>window.__opened)).length,1);
    check('13 malformed or unknown reserved routes stay local and cannot open dialogs, navigate chats or launch an external URL');

    for(const id of showcases) {
      await open(id);
      assert.match(await page.locator('#thread-kicker').textContent(),/Rendering showcase \/ ChatGPT/);
      assert.ok((await page.locator('#thread-content .tsa-assistant .tsa-role').allTextContents()).every(label=>label==='ChatGPT'));
      await page.waitForFunction(()=>[...document.querySelectorAll('.tsa-code-block[data-code-language="mermaid"]')].every(b=>['rendered','repaired','error','original-error'].includes(b.dataset.mermaidState)));
      const features=await page.locator('#thread-content').evaluate(c=>({math:c.querySelectorAll('mjx-container').length,tables:c.querySelectorAll('table').length,charts:c.querySelectorAll('.rich-chart svg').length,images:c.querySelectorAll('.rich-image-placeholder').length,entities:c.querySelectorAll('.rich-entity').length,citations:c.querySelectorAll('.rich-citation-link,.rich-citation-unresolved').length,highlighted:c.querySelectorAll('.tsa-code-block[data-highlight="ready"] .hljs-keyword').length,diagrams:[...c.querySelectorAll('.tsa-code-block[data-code-language="mermaid"]')].map(b=>({state:b.dataset.mermaidState,svg:!!b.querySelector('.tsa-mermaid svg')}))}));
      assert.ok(features.math+features.tables+features.charts+features.images+features.highlighted>3,`${id}: showcase lacks rich features`);
      for(const diagram of features.diagrams)assert.ok(diagram.svg,`${id}: diagram failed (${diagram.state})`);
      if(id==='showcase-observatory'){assert.ok(features.math);assert.ok(features.charts);assert.equal(features.images,2);assert.ok(features.entities);assert.equal(features.citations,2);assert.equal(await page.locator('.rich-citation-link').getAttribute('href'),'https://github.com/ChrystianSchutz/ThreadShelf');}
      if(id==='showcase-workshop'){assert.ok(features.diagrams.length>=2);assert.ok(features.diagrams.some(d=>d.state==='repaired'));}
      const repaired=page.locator('#thread-content .tsa-code-block[data-mermaid-state="repaired"]').first();
      if(await repaired.count()) {
        const original=await repaired.locator('.tsa-diagram-source code').textContent();
        await repaired.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>window.__copied.at(-1)),original);
        const corrected=await repaired.locator('.tsa-repaired-source code').textContent();assert.notEqual(corrected,original);
        await repaired.locator('.tsa-repaired-source summary').click();
        await repaired.locator('[data-copy-repaired]').click();assert.equal(await page.evaluate(()=>window.__copied.at(-1)),corrected);
        await repaired.locator('[data-mermaid-toggle]').click();
        await page.waitForFunction(()=>!!document.querySelector('.tsa-code-block[data-mermaid-state="original-error"]'));
        const originalBlock=page.locator('.tsa-code-block[data-mermaid-state="original-error"]').first();
        await originalBlock.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>window.__copied.at(-1)),original);
        await originalBlock.locator('[data-mermaid-toggle]').click();
        await page.waitForFunction(()=>!!document.querySelector('.tsa-code-block[data-mermaid-state="repaired"] .tsa-mermaid svg'));
      }
      report.showcases.push({id,...features});
    }
    check('Both ChatGPT showcases render their rich content offline; repair previews preserve exact original Copy and provide separate corrected Copy');

    for(const theme of ['light','dark']) {
      await page.setViewportSize({width:680,height:540});
      await page.locator('#reading-settings').click();await page.locator('#theme-choices [data-theme="'+theme+'"]').click();await page.locator('#settings-dialog .dialog-footer [data-close]').click();
      for(const id of [guides[0],...showcases]) {
        await open(id);
        if(await page.locator('#app').evaluate(el=>!el.classList.contains('shelf-hidden')))await page.locator('#hide-library').click();
        const sizes=await page.evaluate(()=>({width:innerWidth,height:innerHeight,rootWidth:document.documentElement.scrollWidth,rootHeight:document.documentElement.scrollHeight,bodyWidth:document.body.scrollWidth,bodyHeight:document.body.scrollHeight,theme:document.documentElement.dataset.theme,toolbar:[...document.querySelectorAll('.reader-toolbar button')].filter(b=>b.getClientRects().length).map(b=>({id:b.id,left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right,top:b.getBoundingClientRect().top,bottom:b.getBoundingClientRect().bottom}))}));
        assert.equal(sizes.theme,theme);assert.ok(sizes.rootWidth<=680&&sizes.bodyWidth<=680&&sizes.rootHeight<=540&&sizes.bodyHeight<=540,`${id}/${theme}: viewport overflow`);
        for(const b of sizes.toolbar)assert.ok(b.left>=-1&&b.right<=681&&b.top>=-1&&b.bottom<=541,`${id}/${theme}: clipped toolbar ${b.id}`);
        report.layouts.push({id,theme,width:680,height:540,globalScroll:false,toolbarClipping:false});
        if(process.env.DEMO_GUIDE_SCREENSHOTS){fs.mkdirSync(process.env.DEMO_GUIDE_SCREENSHOTS,{recursive:true});if(await page.locator('#toast').isVisible())await page.locator('#toast').waitFor({state:'hidden',timeout:6000});await page.locator('#reader-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(process.env.DEMO_GUIDE_SCREENSHOTS,`${id}-${theme}-680.png`)});await page.locator('#thread-content .tsa-assistant .message-content').first().evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(process.env.DEMO_GUIDE_SCREENSHOTS,`${id}-${theme}-680-content.png`)});}
      }
    }
    check('Guide and both showcases fit the 680×540 minimum in light and dark themes without global overflow or clipped toolbar controls');

    const serverContext=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});await serverContext.setOffline(true);
    await serverContext.addInitScript(() => {
      window.__opened=[];
      const row={id:'guide-start-here',conversationKey:'guide-start-here',collection:'Getting started',sourceFile:'untrusted-server.json',title:'Server-owned reserved-link fixture',provider:'Claude'};
      window.alternative={startupTheme:'light',loadState:async()=>({theme:'light',collection:'Getting started'}),saveState:async()=>true,connect:async()=>({collections:[{name:'Getting started',count:1}],total:1,serverUrl:'http://localhost:3000'}),request:async(method)=>method==='thread'?{...row,messages:[{role:'assistant',content:'[Attempt app settings](https://guide.threadshelf.invalid/action/settings)\n\n[Attempt guide](https://guide.threadshelf.invalid/chat/guide-start-here)'}]}:{items:[row],total:1,totalKnown:true,hasMore:false},openExternal:async url=>window.__opened.push(url),copy:async()=>true};
    });
    const serverPage=await serverContext.newPage();observe(serverPage);await serverPage.goto(pathToFileURL(demo).href);await serverPage.waitForSelector('.result-card');await serverPage.locator('.result-card').click();await serverPage.waitForSelector('#thread-content a');
    for(const link of await serverPage.locator('#thread-content a').all()) {await link.click();assert.equal(await serverPage.locator('dialog[open]').count(),0);assert.equal(await serverPage.locator('#thread-title').textContent(),'Server-owned reserved-link fixture');assert.match(await serverPage.locator('#toast').textContent(),/only inside the built-in demo/);}
    assert.deepEqual(await serverPage.evaluate(()=>window.__opened),[]);await serverContext.close();
    check('Server content cannot invoke demo commands even when it spoofs a bundled guide ID, collection and provider');
    assert.deepEqual(report.networkRequests,[]);assert.deepEqual(report.pageErrors,[]);check('All guide, showcase and hostile-route cases work fully offline with zero network requests and zero page errors');
    report.success=true;await context.close();
  } finally {
    await browser.close();
    if(process.env.DEMO_GUIDE_REPORT){fs.mkdirSync(path.dirname(process.env.DEMO_GUIDE_REPORT),{recursive:true});fs.writeFileSync(process.env.DEMO_GUIDE_REPORT,JSON.stringify(report,null,2)+'\n');}
  }
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
