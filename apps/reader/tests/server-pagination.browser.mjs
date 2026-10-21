#!/usr/bin/env node
// Actual main/preload/UI paging against faithful synthetic legacy and extension routes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {ApplicationService} from '../src/core/service.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const {_electron}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-paging-111-2-')),dataDir=path.join(temp,'profile'),evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v1.2.0/server-pagination'));
await fs.mkdir(evidence,{recursive:true});
const summary={collection:'Pagination fixture',sourceFile:'/remote/synthetic.json',conversationKey:'beyond-fifty',provider:'openai',title:'Live archive with 127 matching messages',turnCount:127};
const turns=Array.from({length:127},(_,i)=>({ai:`Needle live message ${String(i+1).padStart(3,'0')}: the original server source can be opened beyond result fifty.`,turn_index:i*7+10}));
const hits=turns.map((turn,i)=>({id:'passage-'+i,document:turn.ai,metadata:{...summary,turnIndex:turn.turn_index,role:'ai'},distance:i/1000}));
const requests=[];let extension=false,failNextPage=false;
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost'),p=Object.fromEntries(u.searchParams);requests.push({path:u.pathname,params:p});res.setHeader('Content-Type','application/json');let result;
 if(u.pathname==='/api/reader/capabilities'){
  if(!extension){res.statusCode=404;res.setHeader('Content-Type','text/html');res.end('<!DOCTYPE html><p>Cannot GET /api/reader/capabilities</p>');return;}
  result={readerSearch:{version:1,path:'/api/reader/search',maxPageSize:50,modes:['keyword','semantic'],cursor:true}};
 }else if(u.pathname==='/api/reader/search'){
  const n=Number(p.n),offset=p.cursor?Number(p.cursor.replace('fixture-cursor-','')):0;
  if(!Number.isSafeInteger(n)||n<1||n>50){res.statusCode=400;result={error:'Invalid n: maximum 50'};}
  else if(failNextPage&&offset){failNextPage=false;res.statusCode=503;result={error:'Synthetic temporary page failure'};}
  else{const selected=hits.slice(offset,offset+n),next=offset+selected.length;result={results:selected,total:hits.length,hasMore:next<hits.length,nextCursor:next<hits.length?'fixture-cursor-'+next:null};}
 }else if(u.pathname==='/api/search'){
  assert.equal(p.mode,'semantic','Text must not reuse the legacy capped search route');assert.ok(Number(p.n)<=50);result={results:hits.slice(0,Number(p.n))};
 }else if(u.pathname==='/api/collections')result={collections:[summary.collection]};
 else if(u.pathname==='/api/files')result={files:[summary]};
 else if(u.pathname==='/api/thread')result={...summary,turns};
 else{res.statusCode=404;result={error:'Unknown fixture endpoint'};}
 res.end(JSON.stringify(result));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const serverUrl=`http://127.0.0.1:${server.address().port}/`;
const seed=await new ApplicationService({dataDir}).init();await seed.handle('settings.save',{values:{mode:'server',serverUrl,listMode:'scroll',pageSize:50,animations:false,language:'en',theme:'dark',searchMode:'keyword',searchPanelExpanded:true}});await seed.handle('shutdown');
const harness=path.join(temp,'harness');await fs.mkdir(harness);await fs.writeFile(path.join(harness,'package.json'),JSON.stringify({name:'server-paging-test',version:'3.0.0',main:'main.cjs'}));await fs.writeFile(path.join(harness,'main.cjs'),`const {app}=require('electron');${process.env.READER_TEST_SOCKETLESS==='1'?'app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(appRoot,'src/desktop/main.cjs'))});`);
const env={...process.env,THREADSHELF_READER_TEST_DATA:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const errors=[],passed=[],counts=[],geometry=[];
const action=name=>page.locator('[data-action="'+name+'"]');
const rows=()=>page.locator('.conversation-row');
async function settled(count){await page.waitForFunction(n=>document.querySelectorAll('.conversation-row').length===n&&!document.querySelector('[data-action="cancel-search"]'),count);assert.equal(await rows().count(),count);}
async function search(q){await page.locator('#archiveSearch').fill(q);await page.locator('#searchForm').evaluate(form=>form.requestSubmit());}
async function choose(mode){await action('search-options').click();await page.selectOption('#searchMethod',mode);await action('search-apply').click();await page.locator('#searchOptionsForm').waitFor({state:'detached'});}
async function preferences(listMode,pageSize=50){await action('settings').click();await page.locator('[data-action="settings-tab"][data-tab="reading"]').click();await page.selectOption('#prefList',listMode);await page.selectOption('#prefPageSize',String(pageSize));await page.locator('#settingsForm button[type="submit"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});}
async function contents(){return page.locator('.conversation-row .search-excerpt').allTextContents();}
async function bounded(label){const result=await page.evaluate(()=>{const f=document.querySelector('#listFooter'),r=f.getBoundingClientRect(),m=document.querySelector('.modal');return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,footer:r.toJSON(),footerWidth:f.clientWidth,footerScrollWidth:f.scrollWidth,actions:[...f.querySelectorAll('button')].map(n=>n.getBoundingClientRect().toJSON()),modal:m?.getBoundingClientRect().toJSON()};});assert.ok(result.pageWidth<=result.width&&result.pageHeight<=result.height,label+' outer frame bounded');assert.ok(result.footerScrollWidth<=result.footerWidth,label+' footer horizontally bounded');for(const button of result.actions)assert.ok(button.left>=result.footer.left&&button.right<=result.footer.right&&button.top>=result.footer.top&&button.bottom<=result.footer.bottom,label+' footer action bounded');if(result.modal)assert.ok(result.modal.left>=0&&result.modal.right<=result.width&&result.modal.top>=0&&result.modal.bottom<=result.height,label+' modal bounded');geometry.push({label,...result});await page.screenshot({path:path.join(evidence,label+'.png')});}
async function noLocalImport(){const local=await page.evaluate(()=>window.desktop.invoke('files',{mode:'local',collection:'all',page:1,pageSize:50}));assert.equal(local.total,0,'Live server search must not import into Local mode');}
try{
 app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',harness],env,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await rows().first().waitFor();
 await search('Needle');await settled(50);assert.equal(await action('load-more').isEnabled(),true);assert.match(await page.locator('#listCount').textContent(),/\+/);counts.push({engine:'legacy-live-text',count:50});
 await action('load-more').click();await settled(100);assert.equal(await action('load-more').isEnabled(),true);counts.push({engine:'legacy-live-text',count:100});
 await action('load-more').click();await settled(127);assert.equal(await action('load-more').isDisabled(),true);assert.equal(new Set(await contents()).size,127);assert.ok((await contents()).at(-1).includes('message 127'));assert.equal(await page.locator('#listCount').textContent(),'127');counts.push({engine:'legacy-live-text',count:127});
 assert.equal(requests.some(r=>r.path==='/api/search'),false);await noLocalImport();
 await rows().nth(119).click();await page.locator('.message[data-turn-index="843"]').waitFor();assert.ok((await page.locator('.message[data-turn-index="843"] .message-content').textContent()).includes('message 120'));assert.equal(await page.evaluate(()=>document.activeElement.dataset.turnIndex),'843');await page.screenshot({path:path.join(evidence,'Legacy-Text-Beyond-50.png')});
 passed.push('Legacy server Text search loads 50, 100, then all 127 unique matching messages, opens result 120 at its exact source turn, and writes no Local conversations');
 await preferences('pages');await settled(50);assert.ok((await contents())[0].includes('message 001'));await action('page-next').click();await settled(50);assert.ok((await contents())[0].includes('message 051'));await action('page-next').click();await settled(27);assert.ok((await contents())[0].includes('message 101'));assert.equal(await action('page-next').isDisabled(),true);await action('page-prev').click();await settled(50);assert.ok((await contents())[0].includes('message 051'));passed.push('Legacy live-text page navigation reaches and returns from the final page without duplicates or a first-50 ceiling');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,540));
 await choose('semantic');await search('Needle meaning');await settled(50);assert.equal(await action('page-next').isDisabled(),true);assert.equal(await action('server-search-setup').count(),1);assert.match(await action('server-search-setup').getAttribute('title'),/50|extension/i);await bounded('Legacy-Meaning-Footer-Minimum');await action('server-search-setup').click();await bounded('Server-Setup-Minimum');assert.match(await page.locator('.modal-body').textContent(),/extension|pagination/i);await action('modal-close').first().click();await page.screenshot({path:path.join(evidence,'Legacy-Meaning-Extension-Notice.png')});passed.push('Legacy Meaning remains explicitly identified as a capped ranked subset and exposes the included server extension setup instead of claiming exhaustiveness');
 for(const language of ['hu','de','fr','en']){await action('settings').click();await page.selectOption('#prefLanguage',language);await page.locator('#settingsForm button[type="submit"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});await settled(50);await bounded('Legacy-Meaning-Footer-Minimum-'+language);await action('server-search-setup').click();await bounded('Server-Setup-Minimum-'+language);await action('modal-close').first().click();}
 extension=true;await preferences('scroll',100);await search('Needle extension');await settled(100);assert.equal(await action('load-more').isEnabled(),true);const first=await contents();assert.equal(new Set(first).size,100);assert.equal(await action('server-search-setup').count(),0);
 failNextPage=true;await action('load-more').click();await action('search-retry').waitFor();await bounded('Server-Retry-Footer-Minimum');assert.deepEqual(await contents(),first,'Failed page retains loaded results');await action('search-retry').click();await settled(127);assert.equal(await action('load-more').isDisabled(),true);assert.equal(new Set(await contents()).size,127);assert.ok((await contents()).at(-1).includes('message 127'));counts.push({engine:'extension-semantic',count:127});await noLocalImport();
 const extensionCalls=requests.filter(r=>r.path==='/api/reader/search');assert.ok(extensionCalls.length>=4);assert.ok(extensionCalls.every(r=>Number(r.params.n)>=1&&Number(r.params.n)<=50));assert.ok(extensionCalls.some(r=>r.params.cursor==='fixture-cursor-50'));assert.ok(extensionCalls.some(r=>r.params.cursor==='fixture-cursor-100'));await page.screenshot({path:path.join(evidence,'Extension-Meaning-Beyond-50.png')});passed.push('Extension Meaning pages 127 ranked results using cursor requests no larger than 50; a 100-row UI page combines server pages and failed Load more retries without loss/duplication');
 await preferences('pages',50);await search('Needle paged extension');await settled(50);await action('page-next').click();await settled(50);assert.ok((await contents())[0].includes('message 051'));await action('page-next').click();await settled(27);assert.equal(await action('page-next').isDisabled(),true);await action('page-prev').click();await settled(50);assert.ok((await contents())[0].includes('message 051'));await noLocalImport();passed.push('Extension page navigation reaches later ranked results and returns to cached pages while Local archive remains empty');
 assert.deepEqual(errors,[]);const report={version:'3.0.0',appRoot,passed,counts,geometry,requests,pageErrors:errors};await fs.writeFile(path.join(evidence,'server-pagination-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed,counts,requests:requests.length,pageErrors:errors},null,2));
}catch(error){await page?.screenshot({path:path.join(evidence,'Server-Pagination-Failure.png')}).catch(()=>{});throw error;}finally{await app?.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
