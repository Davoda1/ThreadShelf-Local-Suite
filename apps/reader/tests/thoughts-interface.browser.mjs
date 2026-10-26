// Full UI surface regression using an isolated synthetic read-only data bridge.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url)),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'thoughts-interface-v4-'));
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
await build({absWorkingDir:root,entryPoints:['src/ui/app.js'],outdir:tmp,bundle:true,format:'iife',platform:'browser',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'},logLevel:'silent'});
const server=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname,base=path.basename(pathname);let bytes;
 if(pathname==='/') {res.setHeader('Content-Type','text/html');bytes='<link rel="stylesheet" href="/app.css"><main id="app"></main><div id="modalRoot"></div><div id="toastRoot"></div><script src="/app.js"></script>';}
 else {res.setHeader('Content-Type',base.endsWith('.css')?'text/css':'application/javascript');bytes=await fs.readFile(path.join(['app.js','app.css'].includes(base)?tmp:path.join(root,'public'),base));}
 res.end(bytes);
}catch{res.statusCode=404;res.end('');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.READER_CHROMIUM?{executablePath:process.env.READER_CHROMIUM}:{}),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[],externalRequests=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://json-literal.example.test/**',route=>{externalRequests.push(route.request().url());return route.abort();});
 await page.addInitScript(()=>{
  const hidden=JSON.stringify({content_type:'thoughts',source_analysis_msg_id:'synthetic-status',thoughts:[{chunks:[],content:'',summary:'Needle search status',finished:true}]});
  const json=String.raw`{"summary":"Synthetic JSON","large":900719925474099312345,"duplicate":1,"duplicate":2,"literal":"<script>window.jsonExecuted=true</script><box>saved text</box> ![image](https://json-literal.example.test/image.png) $x$"}`;
  const reasoning='{"summary":"Visible synthetic reasoning","complete":true}';
  const thread={id:'synthetic',provider:'openai',collection:'Fixture',sourceFile:'synthetic.json',conversationKey:'synthetic',title:'Synthetic surface check',turnCount:6,turns:[{user:'First prompt',turn_index:4},{ai:hidden,turn_index:8},{ai:'Needle useful response',turn_index:12},{user:'Second prompt',turn_index:16},{ai:json,turn_index:20},{thinking:reasoning,turn_index:24}]};
  const key=JSON.stringify({mode:'local',id:'synthetic'}),reading={positions:{},recent:[],bookmarks:[{key,turnIndex:8,role:'assistant',title:thread.title,text:hidden.slice(0,150)},{key,turnIndex:12,role:'assistant',title:thread.title,text:'Needle useful response'}]};
  const settings={mode:'local',language:'en',theme:'dark',animations:false,searchPanelExpanded:true,searchMode:'keyword',pageSize:25,listMode:'pages',localCollection:'all',serverCollection:'all',serverUrl:'http://synthetic.invalid/'};
  const clone=value=>structuredClone(value);window.fixtureSnapshot=JSON.stringify(thread);window.fixtureSource=thread;window.fixtureReading=reading;window.calls=[];window.fixtureJson=json;window.fixtureReasoning=reasoning;window.copied=[];
  window.desktop={capabilities:{clipboardWrite:true},onProgress:fn=>{window.progress=fn;},onMenu:()=>{},invoke:async(action,args={})=>{
   window.calls.push({action,args:clone(args)});
   if(action==='bootstrap')return {settings:clone(settings),reading:clone(reading),version:'1.2.0',searchStatus:{},holidayStatus:{isHoliday:false}};
   if(action==='settings.save'){Object.assign(settings,args.values);return clone(settings);}
   if(action==='collections')return {collections:[{name:'Fixture',count:1}]};
   if(action==='files')return {files:[{...clone(thread),turns:undefined}],total:1};
   if(action==='thread')return clone(thread);
   if(action==='search')return {results:[{...clone(thread),turns:undefined,conversationId:thread.id,turnIndex:8,role:'ai',text:hidden.slice(0,90)},{...clone(thread),turns:undefined,conversationId:thread.id,turnIndex:12,role:'ai',text:'Needle useful response'}],total:2};
   if(action==='clipboard.write'){window.copied.push(args.text);return {ok:true};}
   if(action==='reading.save')return clone(reading);
   if(action==='operation.cancel')return {ok:true};
   if(action==='search.status')return {};
   throw Error('Unexpected synthetic action '+action);
  }};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.locator('.conversation-row').waitFor();
 assert.equal(await page.locator('.conversation-meta [aria-label]').count(),0,'Unknown ChatGPT stored count is not misrepresented as visible count');
 await page.locator('.conversation-row').click();await page.locator('.message[data-turn-index="12"]').waitFor();
 assert.equal(await page.locator('.message').count(),5);
 assert.equal(await page.locator('.message[data-turn-index="8"]').count(),0);
 assert.match(await page.locator('#threadHeader .thread-meta').innerText(),/5 messages/);
 assert.equal(await page.locator('.conversation-meta [aria-label]').getAttribute('aria-label'),'5 messages');
 const jsonMessage=page.locator('.message[data-turn-index="20"]');
 const displayed=await jsonMessage.locator('pre code.language-json').textContent();
 assert.match(displayed,/^\{\n  "summary": "Synthetic JSON",/);
 assert.match(displayed,/900719925474099312345/);
 assert.equal((displayed.match(/"duplicate":/g)||[]).length,2);
 assert.ok(await jsonMessage.locator('code .hljs-attr').count()>0,'JSON uses syntax highlighting');
 assert.match(displayed,/<script>window.jsonExecuted=true<\/script><box>saved text<\/box> !\[image\]/);
 assert.equal(await jsonMessage.locator('.message-content img,.message-content script,.rich-card,mjx-container,.reader-markdown-image').count(),0,'JSON strings remain literal code');
 assert.equal(await page.evaluate(()=>window.jsonExecuted),undefined);
 await jsonMessage.locator('.code-copy-button').click();
 await page.waitForFunction(()=>window.copied.length===1);
 assert.equal(await page.evaluate(()=>window.copied.at(-1)),displayed,'Code Copy uses formatted display');
 await jsonMessage.locator('[data-copy-message]').click();
 await page.waitForFunction(()=>window.copied.length===2);
 assert.equal(await page.evaluate(()=>window.copied.at(-1)),await page.evaluate(()=>window.fixtureJson),'Message Copy uses exact original source');
 const reasoningCode=await page.locator('.message[data-turn-index="24"] pre code.language-json').textContent();
 assert.match(reasoningCode,/\n  "summary": "Visible synthetic reasoning",/);
 assert.equal(await page.locator('.message[data-turn-index="20"]').evaluate(node=>node.sourceText),await page.evaluate(()=>window.fixtureJson));
 assert.deepEqual(externalRequests,[],'JSON image syntax never requests a resource');
 await page.locator('[data-action="bookmarks-dialog"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.reading-item').length===1);
 assert.match(await page.locator('.reading-item').innerText(),/13/,'Original turn number retained');
 assert.equal(await page.evaluate(()=>window.fixtureReading.bookmarks.length),2,'Stored hidden bookmark remains intact');
 await page.locator('.modal-header [data-action="modal-close"]').click();
 await page.locator('#archiveSearch').fill('Needle');await page.locator('#searchForm').evaluate(form=>form.requestSubmit());
 await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===1&&document.querySelector('.search-excerpt')?.textContent==='Needle useful response'&&!document.querySelector('[data-action="cancel-search"]'));
 assert.equal(await page.locator('#listCount').innerText(),'1');
 assert.equal(await page.locator('.search-excerpt').innerText(),'Needle useful response');
 await page.locator('[data-action="find-open"]').click();await page.locator('#readerFindInput').fill('content_type');
 assert.match(await page.locator('#findCount').innerText(),/0/);
 assert.equal(await page.locator('#conversationContent .highlight').count(),0);
 await page.locator('[data-action="mode-server"]').click();
 await page.locator('.conversation-row').waitFor();
 await page.locator('#archiveSearch').fill('Needle');await page.locator('#searchForm').evaluate(form=>form.requestSubmit());
 await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===1&&document.querySelector('.search-excerpt')?.textContent==='Needle useful response'&&!document.querySelector('[data-action="cancel-search"]'));
 assert.equal(await page.locator('.search-excerpt').innerText(),'Needle useful response');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.fixtureSource)===window.fixtureSnapshot),true);
 assert.equal(await page.locator('body').innerText().then(text=>text.includes('source_analysis_msg_id')),false);
 assert.deepEqual(errors,[]);
 const result={result:'PASS',browser:browser.version(),checks:['header and known sidebar visible counts','unknown ChatGPT count omitted without bulk reads','hidden message and outline absent','old hidden bookmark absent but stored record preserved','local and server search snippets/results filtered using original identities','Find ignores hidden metadata','JSON formatting and syntax highlighting','inert JSON markup/image/math strings','code copy display and message copy original','substantive reasoning JSON remains visible','source unchanged'],pageErrors:errors};
 console.log(JSON.stringify(result));
 if(process.env.READER_THOUGHTS_INTERFACE_EVIDENCE){await fs.mkdir(path.dirname(process.env.READER_THOUGHTS_INTERFACE_EVIDENCE),{recursive:true});await fs.writeFile(process.env.READER_THOUGHTS_INTERFACE_EVIDENCE,JSON.stringify(result,null,2)+'\n');}
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fs.rm(tmp,{recursive:true,force:true});}
