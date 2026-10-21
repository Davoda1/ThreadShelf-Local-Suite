#!/usr/bin/env node
// Real Electron integration. Only isolated synthetic profiles/exports are written.
// Set READER_APP_ROOT to a packaged/staged app for the final shipped-runtime check.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import {ApplicationService} from '../src/core/service.mjs';
const require=createRequire(import.meta.url);
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-desktop-111-'));
const dataDir=path.join(temp,'profile'),evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs','evidence','v1.2.0'));
await fs.mkdir(evidence,{recursive:true});
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const serverRequests=[],searchRequests=[],ollamaRequests=[];
let ollamaEnabled=false,pulledModel='';
const remoteSummary={collection:'Server work',sourceFile:'/srv/export.json',conversationKey:'remote-one',title:'Live server conversation',provider:'grok',turnCount:2};
const remoteAnswer='Cobalt signal: conversations stay available when copied to the independent local archive.';
const backend=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');serverRequests.push({path:u.pathname,params:Object.fromEntries(u.searchParams)});let result;
 if(u.pathname==='/api/reader/capabilities'){res.statusCode=404;res.setHeader('Content-Type','text/html');res.end('<!DOCTYPE html><p>Cannot GET /api/reader/capabilities</p>');return;}
 else if(u.pathname==='/api/collections')result={collections:['Empty collection','Server work']};
 else if(u.pathname==='/api/files')result={files:u.searchParams.get('collection')==='Empty collection'?[]:[remoteSummary]};
 else if(u.pathname==='/api/thread')result={...remoteSummary,turns:[{user:'A live server question about portable reading',turn_index:0},{ai:remoteAnswer,turn_index:3}]};
 else if(u.pathname==='/api/search'){
  const request={...Object.fromEntries(u.searchParams)};searchRequests.push(request);const n=Number(request.n);
  // Faithful upstream gate: earlier releases accidentally sent n=100 and received 400.
  if(!Number.isInteger(n)||n<1||n>50){res.statusCode=400;result={error:'n must be an integer between 1 and 50'};}
  else if(!['keyword','semantic'].includes(request.mode)){res.statusCode=400;result={error:'Unsupported server search mode'};}
  else result={results:[{id:'remote-passage-3',document:remoteAnswer,metadata:{collection:'Server work',sourceFile:'/srv/export.json',conversationKey:'remote-one',turnIndex:3,role:'ai',provider:'grok',title:remoteSummary.title},...(request.mode==='semantic'?{distance:0.14}:{score:4.5})}]};
 }else if(['/api/tags','/api/show','/api/embed','/api/embeddings','/api/generate','/api/version','/api/pull'].includes(u.pathname)){
  let bytes='';for await(const chunk of req)bytes+=chunk;let body={};try{body=JSON.parse(bytes||'{}')}catch{};
  ollamaRequests.push({path:u.pathname,body});
  if(!ollamaEnabled){result={error:'No Ollama request should be needed for ordinary local search.'};res.statusCode=503;}
  else if(u.pathname==='/api/tags')result={models:[{name:'embed-mini:latest',digest:'synthetic-embedding-v1'},{name:'chat-only:latest',digest:'synthetic-completion-v1'},...(pulledModel?[{name:pulledModel,digest:'synthetic-pulled-v1'}]:[])]};
  else if(u.pathname==='/api/show')result={capabilities:String(body.name||body.model).includes('chat-only')?['completion']:['embedding'],details:{family:'synthetic'}};
  else if(u.pathname==='/api/embed')result={embeddings:(Array.isArray(body.input)?body.input:[body.input]).map(()=>[1,0.5,0.25])};
  else if(u.pathname==='/api/pull'){pulledModel=String(body.name||body.model||'embeddinggemma');if(!pulledModel.includes(':'))pulledModel+=':latest';res.setHeader('Content-Type','application/x-ndjson');res.end(JSON.stringify({status:'pulling synthetic fixture',completed:1,total:2})+'\n'+JSON.stringify({status:'success'})+'\n');return;}
  else if(u.pathname==='/api/version')result={version:'fixture-only'};
  else {result={error:'Unexpected Ollama endpoint in fixture'};res.statusCode=400;}
 }
 else result={ok:true};
 res.end(JSON.stringify(result));
});
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${backend.address().port}/`;
const SeedService=ApplicationService,profileOrigin='3.0.0 synthetic archive with legacy-shaped reading keys and persisted settings';
const seed=await new SeedService({dataDir}).init();
await seed.handle('settings.save',{values:{pageSize:20,animations:false,theme:'light',fontSize:'normal',directoryMode:'custom',customDirectory:path.join(temp,'missing-folder'),lastDirectory:temp,ollamaUrl:url}});
const rich={collection:'Design notes',provider:'openai',sourceFile:'archive-design.json',conversationKey:'design',title:'A local archive, built for reading',lastTurnAt:'2026-09-27T12:30:00Z',turns:[
 {user:'How should we organize a private archive that stays useful without a server?',turn_index:0},
 {thinking:'Compare durable local storage, explicit server connections, and a shared reading experience.',turn_index:2},
 {ai:'## Keep the archive close\n\nA useful archive should make yesterday’s work easy to find. Keep **conversation data, search indexes, preferences, and reading progress** together.\n\n| Capability | Local | ThreadShelf Server |\n| --- | --- | --- |\n| Read without a connection | Yes | Requires server |\n| Search by meaning | Local model | Server index |\n| Copy selected collections | Destination | Source |\n\n### A small, clear data flow\n\n```mermaid\nflowchart LR\n A[AI exports] --> B[Local archive]\n B --> C[Search and read]\n D[ThreadShelf server] --> C\n D -->|Selected collections| B\n```\n\nThe ranking balances relevance and coverage: \\(s = \\sum_i w_i r_i\\).\n\n```javascript\nconst greeting = "Árvíztűrő 🧪 – 你好";\n// Café and Unicode stay unchanged.\nconst archive = await reader.open();\nconst matches = await archive.search("keyboard layout");\nfor (const match of matches) {\n  console.log(match.title, match.turnIndex);\n}\n```\n\nOriginal messages remain unchanged when a diagram needs a display repair.\n\n```mermaid\ngraph LR\n A[Vendor Feeds (nginx, Node.js, PHP, DB)] --> B[Done]\n```',turn_index:5},
 {user:'What should happen when the server is unavailable?',turn_index:8},
 {ai:'The Local archive remains available. Server mode should report the connection problem clearly and retain the saved address. Previously copied conversations can be opened from Local mode.',turn_index:11}
]};
const main=(await seed.store.upsert(rich)).summary;
for(let i=0;i<24;i++)await seed.store.upsert({collection:i%2?'Research':'Design notes',provider:i%3?'anthropic':'gemini',sourceFile:`note-${i}.json`,conversationKey:`note-${i}`,title:['Keyboard layout experiments','A better reading list','Offline search field notes','A concise export checklist'][i%4]+` · ${String(i+1).padStart(2,'0')}`,lastTurnAt:`2026-09-${String(26-i%20).padStart(2,'0')}T10:00:00Z`,turns:[{user:`Synthetic question ${i}`,turn_index:0},{ai:`Synthetic answer ${i}. Cobalt archive keyword appears here.`,turn_index:4}]});
const legacyRef={mode:'local',serverUrl:'',id:main.id,collection:main.collection,sourceFile:main.sourceFile,conversationKey:main.conversationKey};
const legacyKey=JSON.stringify(legacyRef),localKey=JSON.stringify({mode:'local',id:main.id}),legacyAnchor={turnIndex:5,role:'assistant',offset:.17,expanded:false,title:main.title,ref:legacyRef};
await seed.handle('reading.save',{key:legacyKey,position:legacyAnchor,title:main.title,bookmark:{turnIndex:5,role:'assistant',title:main.title,ref:legacyRef}});
await seed.handle('shutdown');
// The baseline profile must retain appearance and desktop preferences during storage migration.
await fs.writeFile(path.join(dataDir,'window.json'),JSON.stringify({x:45,y:65,width:1080,height:760,maximized:false,fullscreen:false}));
const importPath=path.join(temp,'native.json');await fs.writeFile(importPath,JSON.stringify({title:'Imported through the native picker',id:'native-picker',messages:[{role:'user',content:'Import this conversation'},{role:'assistant',content:'Native file selection works.'}]}));
const env={...process.env,THREADSHELF_READER_TEST_DATA:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let launchRoot=appRoot;
if(process.env.READER_TEST_SOCKETLESS==='1'){
 launchRoot=path.join(temp,'test-harness');await fs.mkdir(launchRoot);
 await fs.writeFile(path.join(launchRoot,'package.json'),JSON.stringify({name:'threadshelf-local-reader-test',version,main:'main.cjs'}));
 await fs.writeFile(path.join(launchRoot,'main.cjs'),`// Test only: this runner cannot create Unix domain sockets. Production code is untouched.\nconst {app}=require('electron');app.requestSingleInstanceLock=()=>true;require(${JSON.stringify(path.join(appRoot,'src/desktop/main.cjs'))});`);
}
let application,page;const failures=[],passed=[],records=[];let realClipboardCopies=0;
async function realCopy(button,expected){await application.evaluate(({clipboard})=>clipboard.writeText('clipboard sentinel: untouched'));await button.click();for(let i=0;i<60;i++){if(await application.evaluate(({clipboard})=>clipboard.readText())===expected){realClipboardCopies++;return;}await page.waitForTimeout(25);}assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),expected,'Actual OS clipboard contents');}
async function launch(){application=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',launchRoot],env,timeout:45000});page=await application.firstWindow();page.on('pageerror',error=>failures.push(error.message));await page.locator('.shell').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length>0);}
async function geometry(label){const value=await page.evaluate(()=>({width:innerWidth,height:innerHeight,body:document.body.scrollHeight,doc:document.documentElement.scrollHeight,bodyWidth:document.body.scrollWidth,docWidth:document.documentElement.scrollWidth,header:document.querySelector('.app-header').getBoundingClientRect().toJSON(),footer:document.querySelector('.statusbar').getBoundingClientRect().toJSON()}));assert.ok(value.body<=value.height&&value.doc<=value.height,`${label}: full-window vertical overflow`);assert.ok(value.bodyWidth<=value.width&&value.docWidth<=value.width,`${label}: full-window horizontal overflow`);assert.ok(value.footer.bottom<=value.height+1,`${label}: status bar outside window`);return value;}
const action=name=>page.locator(`[data-action="${name}"]`);
async function closeModal(){await page.locator('.modal-header [data-action="modal-close"]').click();}
async function openSearch(){await page.keyboard.press(process.platform==='darwin'?'Meta+k':'Control+k');await page.locator('#archiveSearch').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.activeElement.id),'archiveSearch');}
async function search(query){await openSearch();await page.locator('#archiveSearch').fill(query);await page.locator('#searchForm').evaluate(el=>el.requestSubmit());}
async function chooseSearch(method){await action('search-options').click();const values=await page.locator('#searchMethod option').evaluateAll(nodes=>nodes.map(n=>n.value));await page.locator('#searchMethod').selectOption(method);await action('search-apply').click();await page.locator('#searchOptionsForm').waitFor({state:'detached'});return values;}
try{
 await launch();
 assert.equal(await page.evaluate(()=>typeof require),'undefined');assert.equal(await page.evaluate(()=>Object.isFrozen(window.desktop)),true);
 const upgraded=await page.evaluate(()=>window.desktop.invoke('bootstrap'));
 assert.equal(upgraded.settings.uiPalette,'default');assert.equal(upgraded.settings.codeTheme,'default');assert.equal(upgraded.settings.pageSize,20);assert.equal(upgraded.settings.customDirectory,path.join(temp,'missing-folder'));assert.equal(upgraded.reading.bookmarks.length,1);assert.equal(upgraded.reading.bookmarks[0].key,localKey);assert.equal(upgraded.reading.positions[localKey].offset,.17);
 const bounds=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNormalBounds());assert.equal(bounds.width,1080);assert.equal(bounds.height,760);assert.equal(bounds.x,45);assert.equal(bounds.y,65);
 assert.equal(await page.locator('.app-header [data-action="mode-local"]').count(),1);assert.equal(await page.locator('.app-header [data-action="mode-server"]').count(),1);assert.equal(await page.locator('#serverQuickUrl').count(),0);assert.equal(await page.locator('.app-header [data-action="settings"] svg').count(),1);assert.equal(await page.locator('#searchToggle').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#archiveSearchDrawer').getAttribute('inert'),'');
 passed.push('2.0.0 startup preserves archive, normalizes legacy-shaped reading keys, and retains bookmarks, exact offsets, settings and window bounds');
 assert.equal(await page.locator('.conversation-row').count(),20);await action('page-next').click();await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===5);await action('page-prev').click();await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===20);
 passed.push('Isolated Electron preload and 20/5 conversation pagination');
 await page.locator('.conversation-row').first().click();await page.waitForFunction(()=>document.querySelectorAll('#conversationContent .message').length===5);await page.waitForFunction(()=>document.querySelector('.mermaid-block[data-mermaid-state="rendered"]'));
 const math=await page.locator('mjx-container').evaluateAll(nodes=>nodes.map(n=>{const a=n.querySelector('mjx-assistive-mml'),s=a&&getComputedStyle(a);return {svg:n.querySelectorAll(':scope > svg').length,math:!!a?.querySelector('math'),position:s?.position,clip:s?.clip,overflow:s?.overflow,hidden:a?.getAttribute('aria-hidden')};}));assert.ok(math.length>0);for(const m of math){assert.equal(m.svg,1);assert.equal(m.math,true);assert.equal(m.position,'absolute');assert.equal(m.overflow,'hidden');assert.notEqual(m.clip,'auto');assert.notEqual(m.hidden,'true');}
 assert.equal(await page.locator('.message[data-turn-index="5"] .bookmark-message').getAttribute('aria-pressed'),'true');
 await geometry('upgraded default');await page.screenshot({path:path.join(evidence,'Desktop-Light.png')});
 passed.push('Existing bookmarked thread opens with Markdown, Mermaid, math and fixed desktop frame');
 assert.equal(await page.evaluate(()=>window.desktop.capabilities.clipboardWrite),true);
 await application.evaluate(({session})=>{global.deniedPermissions=[];session.defaultSession.setPermissionRequestHandler((_web,permission,callback)=>{global.deniedPermissions.push(permission);callback(false);});});
 const asyncClipboardDenied=await page.evaluate(async()=>{try{await navigator.clipboard.writeText('Permission-denied probe');return false;}catch{return true;}});assert.equal(asyncClipboardDenied,true,'Browser clipboard permission remains denied');
 const jsSource='const greeting = "Árvíztűrő 🧪 – 你好";\n// Café and Unicode stay unchanged.\nconst archive = await reader.open();\nconst matches = await archive.search("keyboard layout");\nfor (const match of matches) {\n  console.log(match.title, match.turnIndex);\n}';
 await realCopy(page.locator('.message-content pre .code-copy-button').first(),jsSource);
 await page.waitForFunction(()=>document.querySelector('.mermaid-block[data-mermaid-state="repaired"]'));
 const repaired=page.locator('.mermaid-block').nth(1);const original='graph LR\n A[Vendor Feeds (nginx, Node.js, PHP, DB)] --> B[Done]';const repair=await repaired.evaluate(el=>el.mermaidRepairSource);assert.notEqual(repair,original);await realCopy(repaired.locator('[data-copy-mermaid]'),repair);await repaired.locator('.mermaid-version-toggle').click();await realCopy(repaired.locator('[data-copy-mermaid]'),original);await repaired.locator('.mermaid-version-toggle').click();
 const normalSource='flowchart LR\n A[AI exports] --> B[Local archive]\n B --> C[Search and read]\n D[ThreadShelf server] --> C\n D -->|Selected collections| B';await realCopy(page.locator('.mermaid-block').first().locator('[data-copy-mermaid]'),normalSource);
 for(const turn of rich.turns){const role=turn.user!==undefined?'user':turn.thinking!==undefined?'thinking':'assistant';await realCopy(page.locator(`.message.${role}[data-turn-index="${turn.turn_index}"] .message-copy-button`),turn.user??turn.thinking??turn.ai);}
 assert.ok((await application.evaluate(()=>global.deniedPermissions)).length>0);passed.push('Trusted native clipboard writes original code, Unicode, all message Markdown, and repaired/original Mermaid while browser clipboard permission stays denied');

 await openSearch();
 const localModes=await chooseSearch('keyword');assert.ok(localModes.includes('keyword'));assert.ok(localModes.includes('semantic'));assert.ok(localModes.includes('ollama'));assert.match(await page.locator('#searchMethodHelp').textContent(),/No AI model/);
 await action('search-options').click();await page.selectOption('#searchMethod','semantic');assert.match(await page.locator('#searchOptionHelp').textContent(),/downloaded embedding model/);assert.match(await page.locator('#searchOptionHelp').textContent(),/Ollama is not involved/);await closeModal();
 await search('Cobalt');await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length>0&&document.querySelector('.search-excerpt')?.textContent.includes('Cobalt'));
 assert.equal(ollamaRequests.length,0);assert.equal(searchRequests.length,0);await page.locator('.conversation-row').first().click();await page.waitForFunction(()=>document.querySelector('.message[data-turn-index="4"]'));
 passed.push('Local keyword search returns exact source turns without Ollama or server search');
 await page.locator('.clear-search[data-action="clear-search"]').click();await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===20);await page.locator('.conversation-row').first().click();
 await action('search-toggle').click();assert.equal(await page.locator('#searchToggle').getAttribute('aria-expanded'),'false');
 await page.waitForFunction(async()=>!(await window.desktop.invoke('bootstrap')).settings.searchPanelExpanded);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===20);assert.equal(await page.locator('#searchToggle').getAttribute('aria-expanded'),'false');
 await openSearch();await page.waitForFunction(async()=>(await window.desktop.invoke('bootstrap')).settings.searchPanelExpanded);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===20);assert.equal(await page.locator('#searchToggle').getAttribute('aria-expanded'),'true');
 await action('search-toggle').click();await page.locator('.conversation-row').first().click();await page.waitForFunction(()=>document.querySelectorAll('#conversationContent .message').length===5);
 passed.push('Collapsed search drawer saves open/closed preference across reload and Ctrl+K opens/focuses it');
 const sizes=[[680,540],[800,600],[1024,768],[1440,900],[1920,1080]];
 for(const [width,height] of sizes){await application.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height});await page.waitForTimeout(120);records.push(await geometry(`${width}x${height}`));const header=page.locator('.app-header');for(const name of ['mode-local','mode-server','settings'])assert.ok(await header.locator(`[data-action="${name}"]`).isVisible());}
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,540));
 await action('settings').click();
 for(const tab of ['appearance','reading','sources','searchSettings','data']){await page.locator(`[data-action="settings-tab"][data-tab="${tab}"]`).click();assert.ok(await page.locator('.modal-footer button[type="submit"]').isVisible());const m=await page.locator('.modal').boundingBox();const viewport=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));assert.ok(m.x>=0&&m.y>=0&&m.x+m.width<=viewport.w+1&&m.y+m.height<=viewport.h+1);}
 await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();await page.locator('#prefLanguage').selectOption('de');await page.locator('#prefTheme').selectOption('dark');await page.locator('#prefUiPalette').selectOption('ocean');await page.locator('#prefCodeTheme').selectOption('vscode');await page.locator('#settingsForm button[type="submit"]').click();await page.waitForFunction(()=>document.documentElement.lang==='de'&&document.documentElement.dataset.theme==='dark');
 await page.screenshot({path:path.join(evidence,'Desktop-Minimum-German.png')});passed.push('Five viewport sizes, bounded settings panels and localized German dark theme');
 await action('settings').click();await page.locator('#prefLanguage').selectOption('en');await page.locator('[data-action="settings-tab"][data-tab="sources"]').click();await page.locator('#prefServer').fill(url);await page.locator('#settingsForm button[type="submit"]').click();await page.waitForFunction(()=>document.documentElement.lang==='en');
 await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1320,880));await page.screenshot({path:path.join(evidence,'Desktop-Dark.png')});
 await action('find-open').click();await page.locator('#readerFindInput').fill('unavailable');await page.waitForFunction(()=>document.querySelectorAll('#conversationContent .highlight').length>0);await realCopy(page.locator('.message.assistant[data-turn-index="11"] .message-copy-button'),rich.turns[4].ai);await action('find-close').click();
 await page.locator('.message.user .bookmark-message').first().click();await page.waitForTimeout(200);await action('reading-dialog').first().click();await page.locator('[data-action="reading-tab"][data-tab="bookmarks"]').click();assert.equal(await page.locator('.reading-item').count(),2);await closeModal();passed.push('In-conversation search and old/new exact-message bookmarks');
 await action('transfer-dialog').first().click();await page.locator('#transferUrl').fill(url);await action('transfer-load').click();await page.locator('.transfer-check').waitFor();assert.equal(await page.locator('.transfer-check').count(),1);assert.ok(!(await page.locator('#transferCollections').textContent()).includes('Empty collection'));await page.locator('.transfer-check').check();await action('transfer-copy').click();await page.waitForFunction(()=>document.querySelector('#modalTitle')?.textContent==='Import complete');await closeModal();
 await page.selectOption('#collectionSelect','Server work');await page.waitForFunction(()=>document.querySelectorAll('.conversation-row').length===1);await page.locator('.conversation-row').click();await page.waitForFunction(()=>document.querySelector('#threadHeader h1')?.textContent==='Live server conversation');passed.push('Selective non-empty server collection copy via desktop controls');
 await action('mode-server').click();await page.waitForFunction(()=>document.querySelector('.conversation-row')?.textContent.includes('Live server conversation'));assert.equal(await page.locator('#serverQuickUrl').count(),0);await page.locator('.conversation-row').click();await page.waitForFunction(()=>document.querySelectorAll('#conversationContent .message').length===2);
 await openSearch();const serverModes=await chooseSearch('keyword');assert.deepEqual(serverModes,['titles','keyword','semantic']);await search('Cobalt');await page.waitForFunction(()=>document.querySelector('.search-excerpt')?.textContent.includes('Cobalt signal'));await page.locator('.conversation-row').first().click();await page.waitForFunction(()=>document.querySelector('.message[data-turn-index="3"]')?.textContent.includes('Cobalt'));
 await chooseSearch('semantic');assert.match(await page.locator('#searchMethodHelp').textContent(),/server.s semantic index/);await search('portable archive');await page.waitForFunction(()=>document.querySelector('.search-excerpt')?.textContent.includes('independent local archive'));assert.equal(searchRequests.some(r=>r.mode==='keyword'),false,'Legacy text search scans live messages beyond the capped endpoint');assert.ok(searchRequests.some(r=>r.mode==='semantic'));assert.ok(searchRequests.every(r=>Number(r.n)>0&&Number(r.n)<=50));assert.equal(ollamaRequests.filter(r=>['/api/embed','/api/embeddings','/api/generate'].includes(r.path)).length,0);
 await page.screenshot({path:path.join(evidence,'Desktop-Server-Search.png')});passed.push('Legacy server text search reads live messages; semantic search retains strict upstream n≤50 and offers extension setup for further results');
 await action('mode-local').click();await page.waitForFunction(()=>document.querySelector('#collectionSelect')?.value==='Server work');
 ollamaEnabled=true;await action('settings').click();await page.locator('[data-action="settings-tab"][data-tab="searchSettings"]').click();await page.waitForFunction(()=>document.querySelector('#ollamaStatus')?.textContent.includes('1 embedding models'));
 const modelNames=await page.locator('#prefOllamaModel option').evaluateAll(nodes=>nodes.map(n=>n.value));assert.ok(modelNames.includes('embed-mini:latest'));assert.ok(!modelNames.includes('chat-only:latest'));assert.equal(await page.locator('#ollamaStart').isDisabled(),true);
 await page.selectOption('#prefOllamaModel','embed-mini:latest');await action('ollama-test').click();await page.waitForFunction(()=>document.querySelector('#ollamaTestStatus')?.textContent.includes('3 dimensions'));
 const probe=ollamaRequests.filter(r=>r.path==='/api/embed');assert.ok(probe.length>0);assert.ok(probe.every(r=>!JSON.stringify(r.body).includes('Cobalt')&&!JSON.stringify(r.body).includes('private archive')));
 await page.locator('#ollamaDownloadModel').fill('embeddinggemma');await action('ollama-pull').click();await page.waitForFunction(()=>document.querySelector('#prefOllamaModel')?.value==='embeddinggemma:latest');assert.ok(ollamaRequests.some(r=>r.path==='/api/pull'));
 await page.screenshot({path:path.join(evidence,'Desktop-Ollama-Settings.png')});await page.locator('#settingsForm button[type="submit"]').click();passed.push('Explicit Ollama detection excludes chat-only models, synthetic embedding test reports dimensions, and requested model pull refreshes the picker');
 await application.evaluate(({dialog},filename)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});},importPath);
 await action('import-dialog').first().click();await page.locator('#importCollection').fill('Native import');await action('pick-import-files').click();await page.waitForFunction(()=>document.querySelector('#modalTitle')?.textContent==='Import complete');await closeModal();
 await page.selectOption('#collectionSelect','Native import');await page.waitForFunction(()=>document.querySelector('.conversation-row')?.textContent.includes('native picker'));passed.push('Native OS picker integration with unavailable custom-folder fallback and independent import collection');
 await application.close();application=null;await launch();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');assert.equal(await page.locator('#collectionSelect').inputValue(),'Native import');const boot=await page.evaluate(()=>window.desktop.invoke('bootstrap'));assert.equal(boot.reading.bookmarks.length,2);assert.ok(boot.reading.bookmarks.some(b=>b.key===localKey&&b.turnIndex===5));assert.equal(boot.settings.serverUrl,url);assert.equal(boot.settings.uiPalette,'ocean');assert.equal(boot.settings.codeTheme,'vscode');assert.equal(await page.evaluate(()=>document.documentElement.dataset.uiPalette),'ocean');assert.equal(await page.evaluate(()=>document.documentElement.dataset.codeTheme),'vscode');passed.push('Restart retains upgraded archive, old/new bookmarks, theme, independent interface/code palettes, collection and server settings');
 assert.deepEqual(failures,[]);const report={version,appRoot,profileOrigin,passed,realClipboardCopies,clipboardPath:'Production sandboxed preload/main bridge to actual Electron OS clipboard; browser permission denied',serverSearchRequests:searchRequests,explicitOllamaSetupRequests:ollamaRequests,geometry:records,pageErrors:failures};await fs.writeFile(path.join(evidence,'desktop-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page?.screenshot({path:path.join(evidence,'Desktop-Failure.png')}).catch(()=>{});console.error(error);throw error;}
finally{await application?.close().catch(()=>{});await new Promise(resolve=>backend.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
