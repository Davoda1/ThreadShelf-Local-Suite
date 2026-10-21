#!/usr/bin/env node
// Synthetic chat-derived chart contents through actual native import, an
// explicitly supplied unmodified server, and Copy-to-Local. No converter or
// future account-export coverage is claimed. All server data is disposable.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {ApplicationService} from '../src/core/service.mjs';
import {ThreadShelfClient} from '../src/core/server.mjs';
import {turnToMessage} from '../src/reader/messages.js';
import {exportedFixtures,genuiMessage} from './fixtures/chart-compatibility.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const serverRoot=process.env.THREADSHELF_SERVER_SOURCE;
assert.ok(serverRoot,'Set THREADSHELF_SERVER_SOURCE to the unmodified supplied server');
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'chart-route-test-'));
const evidence=process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.2.0-chart-fixes');
const sourceFiles=['src/reader/renderer.js','src/reader/rich-charts.js','src/reader/rich-charts.css','src/reader/rich-chart-interactions.js'];
const fingerprints=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,hash(await fs.readFile(path.join(root,f),'utf8').catch(()=>''))])));
const sourceBefore=await fingerprints();
const source=exportedFixtures.map(f=>`### ${f.id}\n\n${genuiMessage(f.payload)}`).join('\n\n')+'\n\nTS32-NATIVE-UI-END';
const mapping={root:{id:'root',parent:null,children:['user']},user:{id:'user',parent:'root',children:['answer'],message:{id:'synthetic-user',author:{role:'user'},content:{content_type:'text',parts:['Inspect the preserved charts.']},create_time:1770000000}},answer:{id:'answer',parent:'user',children:[],message:{id:'synthetic-answer',author:{role:'assistant'},content:{content_type:'text',parts:[source]},metadata:{model_slug:'synthetic-fixture'},create_time:1770000001}}};
const native=[{id:'synthetic-chart-routes',title:'Synthetic chart route acceptance',current_node:'answer',mapping}];
let service,server,browser;const network=[],errors=[],results=[];
try {
  const ingest=path.join(tmp,'exports');await fs.mkdir(ingest);const fixture=path.join(ingest,'synthetic-native.json');await fs.writeFile(fixture,JSON.stringify(native));
  service=await new ApplicationService({dataDir:path.join(tmp,'Reader profile')}).init();
  const imported=await service.handle('import.paths',{paths:[fixture],collection:'Direct native'});assert.deepEqual(imported.errors,[]);assert.equal(imported.imported,1);
  const summary=(await service.handle('files',{mode:'local',collection:'Direct native'})).files[0];
  const direct=await service.handle('thread',{mode:'local',id:summary.id});
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const url=`http://127.0.0.1:${port}/`;
  const cache=process.env.THREADSHELF_MODEL_CACHE||path.join(serverRoot,'.threadshelf/model-cache');
  await fs.cp(cache,path.join(tmp,'model-cache'),{recursive:true});
  server=spawn(process.env.THREADSHELF_SERVER_NODE||path.join(serverRoot,'.local/node/bin/node'),['--import','tsx','src/server.ts'],{cwd:serverRoot,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',THREADSHELF_DATA_DIR:path.join(tmp,'server'),LANCEDB_PATH:path.join(tmp,'server/lancedb'),UPLOADS_DIR:path.join(tmp,'server/uploads'),COLLECTIONS_PATH:path.join(tmp,'server/collections.json'),GENERATION_CONFIG_PATH:path.join(tmp,'server/generation.json'),MASTER_PROMPTS_PATH:path.join(tmp,'server/prompts.json'),THREADSHELF_MODELS_PATH:path.join(tmp,'server/models'),THREADSHELF_MODEL_CACHE:path.join(tmp,'model-cache'),THREADSHELF_DISABLE_DEFAULT_MODEL_PATHS:'1',ALLOWED_HOSTS:'127.0.0.1,localhost'},stdio:['ignore','pipe','pipe']});
  let serverLog='';server.stdout.on('data',b=>serverLog+=b);server.stderr.on('data',b=>serverLog+=b);
  let healthy=false;for(let i=0;i<200;i++){try{if((await fetch(url+'api/health')).ok){healthy=true;break;}}catch{}if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,250));}assert.ok(healthy,serverLog.slice(-2000));
  const response=await fetch(url+'api/ingest-progress',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({folderPath:ingest,collection:'synthetic-chart-routes',clearFirst:true})});assert.equal(response.ok,true);
  const events=(await response.text()).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));assert.ok(events.some(e=>e.status==='completed'),'Actual server ingestion failed');
  const client=new ThreadShelfClient(url),files=await client.allFiles('synthetic-chart-routes');assert.equal(files.length,1,JSON.stringify(events));
  const remote=await service.handle('thread',{mode:'server',serverUrl:url,...files[0]});
  const copied=await service.handle('server.import',{serverUrl:url,collections:['synthetic-chart-routes']});assert.deepEqual(copied.errors,[]);assert.equal(copied.imported,1);
  const copiedSummary=(await service.handle('files',{mode:'local',collection:'synthetic-chart-routes'})).files[0],local=await service.handle('thread',{mode:'local',id:copiedSummary.id});assert.deepEqual(local.turns,remote.turns);
  const passageHash=hash(service.store.passages()),threadHashes=[direct,local].map(t=>[t.id,hash(t)]);
  const web=path.join(tmp,'web');await fs.cp(path.join(root,'public'),web,{recursive:true});
  await build({stdin:{contents:`import {ReaderView} from ${JSON.stringify(path.join(root,'src/reader/reader.js'))};window.ReaderView=ReaderView;`,resolveDir:root},outfile:path.join(web,'test.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
  await fs.writeFile(path.join(web,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="test.css"><style>html,body{margin:0;height:100%;overflow:hidden}#host{height:100vh}</style><div id="host"></div><script src="test.js"></script>');
  const playwright=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');browser=await playwright.chromium.launch({executablePath:process.env.READER_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1000,height:800}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(/^https?:/.test(r.request().url())){network.push(r.request().url());return r.abort();}return r.continue();});await page.goto(pathToFileURL(path.join(web,'index.html')).href);
  await page.evaluate(()=>{window.reader=new ReaderView({container:document.getElementById('host'),settings:{language:'en',theme:'light',compact:false,animations:false}});});
  for(const [route,thread] of [['direct-native',direct],['actual-server',remote],['copied-local',local]]) {
    const before=hash(thread);await page.evaluate(async t=>{window.current=t;await reader.show(t,{key:t.id});},thread);
    const messages=thread.turns.map(turnToMessage).filter(m=>m.content?.trim());assert.deepEqual(await page.locator('.message').evaluateAll(ns=>ns.map(n=>n.sourceText)),messages.map(m=>m.content));
    assert.ok(messages.some(m=>m.content===source));assert.equal(await page.locator('.rich-chart svg').count(),7);assert.equal(await page.locator('.rich-chart-fallback').count(),0);
    assert.ok((await page.locator('#host').innerText()).includes('TS32-NATIVE-UI-END'));
    const values=await page.locator('.rich-chart').nth(1).locator('tbody tr').evaluateAll(ns=>ns.map(n=>n.textContent));assert.ok(values[1].includes('70.5%'));
    const mark=page.locator('.rich-chart').nth(1).locator('.rich-chart-mark').nth(1);await mark.focus();await page.waitForTimeout(50);
    const tooltip=page.locator('.rich-chart-tooltip:visible');assert.equal(await tooltip.count(),1);assert.match(await tooltip.innerText(),/Beta/);assert.match(await tooltip.innerText(),/70\.5%/);await page.keyboard.press('Escape');
    assert.equal(hash(thread),before);results.push({route,charts:7,sourceExact:true,threadHash:before,customTooltip:true});
  }
  for(const [id,h] of threadHashes)assert.equal(hash(await service.handle('thread',{mode:'local',id})),h);assert.equal(hash(service.store.passages()),passageHash);assert.deepEqual(network,[]);assert.deepEqual(errors,[]);assert.deepEqual(await fingerprints(),sourceBefore);
  const report={syntheticChatDerivedFixtures:true,actualAccountExport:false,converterTested:false,serverVersion:JSON.parse(await fs.readFile(path.join(serverRoot,'package.json'),'utf8')).version,engine:await browser.version(),results,sourceFingerprints:sourceBefore,sourceRawPassageHashesUnchanged:true,externalRendererRequests:0,pageErrors:0};await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'chart-routes.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {
  await browser?.close().catch(()=>{});await service?.shutdown().catch(()=>{});if(server&&server.exitCode===null){const exited=new Promise(r=>server.once('exit',r));server.kill();await Promise.race([exited,new Promise(r=>setTimeout(r,3000))]);}await fs.rm(tmp,{recursive:true,force:true});
}
