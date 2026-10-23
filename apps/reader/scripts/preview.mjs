#!/usr/bin/env node
// Build a single-file offline preview from the exact desktop UI/reader sources.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {releaseFilename,RELEASE_REVISION} from './release-filenames.mjs';
import {richPreview} from './preview-rich.mjs';
import {renderingPreview} from './preview-rendering.mjs';
import {createPreviewResources} from './preview-resources.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const release=path.join(root,'release');await mkdir(release,{recursive:true});
const built=await build({absWorkingDir:root,entryPoints:['src/ui/app.js'],outdir:'preview-bundle',bundle:true,format:'iife',target:'chrome120',minify:true,write:false,legalComments:'inline',loader:{'.svg':'dataurl','.png':'dataurl','.woff':'dataurl','.woff2':'dataurl'},logLevel:'silent'});
const js=built.outputFiles.find(f=>f.path.endsWith('.js'))?.text;
const identityBundle=await build({absWorkingDir:root,entryPoints:['src/core/reading-identity.mjs'],bundle:true,format:'iife',globalName:'PreviewReadingIdentity',target:'chrome120',minify:true,write:false,legalComments:'inline',logLevel:'silent'});
const identityScript=identityBundle.outputFiles[0].text;
const managerReadingBundle=await build({absWorkingDir:root,entryPoints:['src/core/manager-reading.mjs'],bundle:true,format:'iife',globalName:'PreviewManagerReading',target:'chrome120',minify:true,write:false,legalComments:'inline',logLevel:'silent'});
const managerReadingScript=managerReadingBundle.outputFiles[0].text;
const analyticsBundle=await build({absWorkingDir:root,entryPoints:['scripts/preview-activity.mjs'],bundle:true,format:'iife',globalName:'PreviewAnalytics',target:'chrome120',minify:true,write:false,legalComments:'inline',logLevel:'silent'});
const analyticsScript=analyticsBundle.outputFiles[0].text;
const holidayBundle=await build({absWorkingDir:root,entryPoints:['scripts/preview-holiday.mjs'],bundle:true,format:'iife',globalName:'PreviewHoliday',target:'chrome120',minify:true,write:false,legalComments:'inline',logLevel:'silent'});
const holidayScript=holidayBundle.outputFiles[0].text;
const css=built.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
if(!js||!css)throw new Error('UI and CSS bundle must exist for preview.');
const assets={};for(const name of ['mathjax-tex-svg.js','mermaid.min.js'])assets[name]='data:text/javascript;base64,'+(await readFile(path.join(root,'public',name))).toString('base64');
const waves={};for(const [theme,name] of Object.entries({dark:'quiet-water-v4-1920x1080-24fps.mp4',light:'05-day-loop.mp4',holiday:'01-multicolour-loop.mp4'}))waves[theme]='data:video/mp4;base64,'+(await readFile(path.join(root,'public/waves',name))).toString('base64');
const notices=await readFile(path.join(root,'THIRD-PARTY-NOTICES.md'),'utf8');
const license=await readFile(path.join(root,'LICENSE'),'utf8');
const holidayNotices=await readFile(path.join(root,'src/desktop/holiday/assets/data/HOLIDAY-LICENSES.txt'),'utf8');
const rendererLicenses=(await Promise.all(['Mermaid-LICENSE.txt','MathJax-Upstream-LICENSE.txt','highlight.js-LICENSE.txt','marked-LICENSE.md','Ayu-MIT.txt','NotoSansJP-OFL.txt'].map(async name=>`\n\n--- ${name} ---\n${await readFile(path.join(root,'licenses',name),'utf8')}`))).join('');
const icon='data:image/svg+xml;base64,'+(await readFile(path.join(root,'build/icon.svg'))).toString('base64');
const titles=['Reading the complete conversation','Designing a modular controller','Keyboard layout detection','Safer archive imports','Mermaid repair in practice','A small guide to mathematics','The C++ build checklist','Working with saved reading','Making settings accessible','Local search without a model','Color-coded device controls','F13 through F24 on Linux','A portable Windows directory','Understanding a state machine','Collection and source identity','Comparing two display panels','Firmware event timing','Preserving tool output','Thoughts, prompts and answers','A small Rust parser','Normalizing exported records','An offline reading workflow','Planning a multilingual UI','When a server is unavailable','Small-screen navigation','Preserving code block languages','Checking export provenance','Reading in four languages'];
const providers=['openai','anthropic','grok','gemini','venice','meta','openrouter','lm-studio','google-ai-studio'];
const first=[
 {user:'Can you show how a complete AI conversation reads in the desktop app, including code, tables, diagrams and mathematics?\n\nI would also like to return to this point later.',turn_index:2},
 {thinking:'I will organize the answer around the reading experience. The original messages remain available for copying, while Markdown, code, diagrams and equations receive their own presentation. This thinking section starts collapsed when Compact messages is enabled.',turn_index:5},
 {ai:'## A conversation, kept together\n\nThis is a **synthetic example** in an offline preview of ThreadShelf Local Reader. The desktop application imports AI exports into its own local archive and can also read an active ThreadShelf server.\n\n| Reading feature | What to try |\n| --- | --- |\n| Source-preserving copy | Copy any message or code block |\n| Code highlighting | Read the Python example below |\n| Bookmarks | Save a particular message |\n| Conversation outline | Hover over the marks on the right |\n| Search within a conversation | Find the word **archive** |\n\n```python\nfrom pathlib import Path\n\ndef locate_archive(data_directory: Path) -> Path:\n    archive = data_directory / "archive.sqlite"\n    return archive\n```\n\n### A small formula\n\nFor a weighted score, $s = \\alpha x + \\beta y$ combines two signals. A normalized score can be written as:\n\n$$\\operatorname{score}(q,d)=\\frac{q\\cdot d}{\\|q\\|\\,\\|d\\|}$$\n\n### Independent sources\n\n```mermaid\nflowchart TD\n  A[Choose source] --> B[Local archive]\n  A --> C[ThreadShelf server]\n  B --> D[Read conversations]\n  C --> D\n  C --> E[Copy selected collections]\n  E --> B\n```',turn_index:8},
 {user:'How does the reader handle an imperfect Mermaid diagram? Show the repaired version while keeping the original available.',turn_index:13},
 {ai:'The reader tries the original source first. If a deterministic repair succeeds, the diagram has an **Original / Repaired** control. Switching to Original shows the exact original source and its rendering error.\n\n```mermaid\ngraph LR\n  A[Vendor Feeds (nginx, Node.js, PHP, DB)] --> B[Review findings]\n```\n\nCopy message always copies the archived Markdown. A diagram’s Copy button copies its currently displayed source.',turn_index:17},
 {user:'Here is a long checklist to review:\n'+Array.from({length:24},(_,i)=>`${i+1}. Preserve original export details, validate record ${i+1}, and keep the reading layout stable.`).join('\n')+'\n\nThe final checkpoint is searchable even while this prompt is collapsed.',turn_index:22},
 {thinking:'This longer user prompt exceeds fifteen lines in the reading pane. Search reveals hidden matches automatically. A compact prompt can also be expanded manually with its control.',turn_index:26},
 {ai:'The preview contains synthetic records only.\n\n```json\n{"valid": true, "source": "synthetic preview", "records": 24}\n```',source_role:'tool',turn_index:31},
 {ai:'The source identities remain stable through navigation, even when a source contains empty turns or tool responses. Try a bookmark, open another conversation, and return using **Saved reading**.\n\nSettings let you explore **English, Hungarian, German, French and Japanese**, the list’s pages or continuous scroll, text size, Compact messages, and theme. Changes in this preview last for this open session only.',turn_index:35},
];
first[2].ai = first[2].ai.replace('### A small formula', richPreview + '### A small formula');
const conversations=titles.map((title,i)=>({id:`preview-${i+1}`,collection:i<8?'Reader examples':i<16?'Examples':'Programming',title,provider:providers[i%providers.length],sourceFile:`synthetic/${providers[i%providers.length]}/conversation-${i+1}.json`,conversationKey:`preview-conversation-${i+1}`,turnCount:i===0?first.length:4,lastTurnAt:new Date(Date.UTC(2026,8,27-i,12)).toISOString(),turns:i===0?first:[
 {user:`Let us discuss ${title.toLowerCase()}. What are the practical considerations?`,turn_index:3},
 {ai:`## ${title}\n\nA useful approach starts with explicit requirements and a small, reproducible example. Keep the original source records, make configuration choices visible, and test the behavior at a small window size.\n\n- Preserve the original data.\n- Keep related settings together.\n- Report unavailable resources clearly.\n- Confirm that the workflow still works offline.\n\n| Check | Result in this example |\n| --- | --- |\n| Source identity | Preserved |\n| Searchable text | Available |\n| Reading position | Per conversation |`,turn_index:7},
 {user:'What should we verify before considering the work complete?',turn_index:12},
 {ai:'Verify the real workflow, review error handling, and keep a clear record of which platforms were actually tested. This conversation is synthetic preview content; it does not claim that any particular hardware or service was tested.',turn_index:16},
]}));
conversations.splice(conversations.length - 1, 0, renderingPreview);
// The self-contained preview includes the guide/changelog in the self-contained preview.
const guideRecord=conversations.at(-1);
guideRecord.title=`${version} user guide and changelog`;
guideRecord.collection='Reader examples';
guideRecord.turns=[{user:`How do I install, use, build and verify ThreadShelf Local Reader ${version}?`,turn_index:0},{ai:(await readFile(path.join(root,'README.md'),'utf8'))+'\n\n---\n\n'+(await readFile(path.join(root,'CHANGELOG.md'),'utf8')),turn_index:1}];
guideRecord.turnCount=guideRecord.turns.length;
// Deliberately synthetic dates and models provide a representative calendar.
for (const [i,c] of conversations.entries()) {
 const start=Date.UTC(2026,Math.floor(i/4),2+(i%4)*6,7+(i%12));
 c.createdAt=new Date(start).toISOString();
 for (const [j,turn] of c.turns.entries()) {turn.createdAt=new Date(start+j*90*60000).toISOString();if(turn.ai!==undefined||turn.thinking!==undefined)turn.model=['gpt-5','claude-sonnet-4','gemini-2.5-pro'][i%3];}
 c.lastTurnAt=c.turns.at(-1)?.createdAt;c.turnCount=c.turns.length;
 if(i<8){const mapping={};for(const [j,turn] of c.turns.entries()){const id=`node-${j}`;mapping[id]={parent:j?`node-${j-1}`:null,children:j+1<c.turns.length?[`node-${j+1}`]:[],message:{id:`message-${j}`,author:{role:turn.source_role||('user'in turn?'user':'assistant')},create_time:Date.parse(turn.createdAt)/1000,metadata:{model_slug:turn.model},content:{parts:[turn.user??turn.thinking??turn.ai??'']}}};}mapping.alternate={parent:'node-0',children:[],message:{id:'alternate',author:{role:'assistant'},create_time:start/1000+180,metadata:{model_slug:'gpt-5'},content:{parts:['Synthetic alternative branch.']}}};mapping['node-0'].children.push('alternate');c.raw={create_time:start/1000,update_time:Date.parse(c.lastTurnAt)/1000,current_node:`node-${c.turns.length-1}`,mapping};}
 // A few normalized server-style records omit original creation metadata.
 if(i>=8&&i<12)delete c.createdAt;
}
function previewService(data,version,releaseRevision,identity,readingManager,analytics,resourceFactory){
 const state={settings:{remoteImages:'auto',analyticsStyledBars:false,searchPreferences:{local:{mode:'keyword',provider:'',role:'',period:'all'},server:{mode:'keyword',provider:'',role:''}},waveVideoBackground:false,waveVideoWelcome:false,holidayVideoWelcome:false,promptExpandStyle:'outlined-right',mode:'local',searchPanelExpanded:false,sourceSwitchWidth:'equal',language:'en',theme:'system',uiPalette:'default',codeTheme:'default',fontSize:'normal',highContrast:false,compact:true,animations:true,listMode:'pages',pageSize:25,sort:'updated',directoryMode:'last',customDirectory:'',lastDirectory:'',serverUrl:'http://localhost:3000/',serverAddresses:['http://localhost:3000/'],localCollection:'all',serverCollection:'all',searchMode:'keyword',ollamaUrl:'http://127.0.0.1:11434',ollamaModel:''},reading:{positions:{},bookmarks:[],recent:[]}};
 state.storageProfile='7z';
 const progressListeners=new Set();let conversion=null,textPrepared=false;
 const inPeriod=(c,a)=>{if(a.mode==='server'||!a.period||a.period==='all')return true;const end=new Date(),start=new Date(end),created=new Date(c.createdAt);if(a.period==='week')start.setDate(start.getDate()-7);else{const months={month:1,'3months':3,'6months':6,year:12,'2years':24,'5years':60}[a.period];if(!months)return true;const day=start.getDate();start.setDate(1);start.setMonth(start.getMonth()-months);start.setDate(Math.min(day,new Date(start.getFullYear(),start.getMonth()+1,0).getDate()));}return created>=start&&created<=end;};
 const clone=v=>structuredClone(v);
 const resources=resourceFactory(data);
 const localize=(en,hu,de,fr,ja)=>({en,hu,de,fr,ja}[state.settings.language]||en);
 const unavailable=()=>new Error(localize('Offline preview: this action is available in the desktop application. The preview cannot read files, contact servers, download models, or write to disk.','Offline előnézet: ez a művelet az asztali alkalmazásban érhető el. Az előnézet nem olvas fájlokat, nem kapcsolódik kiszolgálókhoz, nem tölt le modelleket és nem ír lemezre.','Offline-Vorschau: Diese Aktion ist in der Desktop-Anwendung verfügbar. Die Vorschau kann keine Dateien lesen, Server kontaktieren, Modelle herunterladen oder Dateien speichern.','Aperçu hors ligne : cette action est disponible dans l’application de bureau. L’aperçu ne peut pas lire de fichiers, contacter des serveurs, télécharger des modèles ou écrire sur le disque.','オフラインプレビュー：この操作はデスクトップアプリで利用できます。プレビューではファイルの読み取り、サーバーへの接続、モデルのダウンロード、ディスクへの書き込みはできません。'));
 const status=()=>({textIndex:{preview:true,ready:textPrepared,bytes:null},semantic:{ready:false,modelReady:false,indexed:0,total:0},modelReady:false,ready:false,indexed:0,totalPassages:data.reduce((n,c)=>n+c.turns.length,0),notice:localize('Model search is available in the desktop application after setup.','A modellalapú keresés beállítás után érhető el az asztali alkalmazásban.','Die Modellsuche ist nach Einrichtung in der Desktop-Anwendung verfügbar.','La recherche par modèle est disponible dans l’application de bureau après configuration.','モデル検索は、デスクトップアプリで設定後に利用できます。')});
 const readingSave=a=>{
  const r=state.reading,scope=a.sourceScope===undefined?null:identity.normalizeReadingSourceScope(a.sourceScope);
  const belongs=(key,entry)=>!scope||identity.matchesReadingSource({...entry,key},scope);
  if(a.clear==='all'||a.clear==='positions'){r.positions=Object.fromEntries(Object.entries(r.positions).filter(([key,entry])=>!belongs(key,entry)));r.recent=r.recent.filter(entry=>!belongs(entry.key,entry));}
  if(a.clear==='all'||a.clear==='bookmarks')r.bookmarks=r.bookmarks.filter(entry=>!belongs(entry.key,entry));
  if(a.clear==='all')return clone(r);
  if(a.clear==='position'){delete r.positions[a.key];r.recent=r.recent.filter(x=>x.key!==a.key)}
  if(a.position){r.positions[a.key]={...a.position,updatedAt:Date.now()};const entry={...a.position,key:a.key,title:a.title||a.position.title||'',updatedAt:Date.now()};r.recent=identity.limitRecentForSource([entry,...r.recent.filter(x=>x.key!==a.key)],identity.readingSourceFor(entry));}
  if(a.bookmark){r.bookmarks=r.bookmarks.filter(b=>!(b.key===a.key&&b.turnIndex===a.bookmark.turnIndex&&b.role===a.bookmark.role));r.bookmarks.push({...a.bookmark,key:a.key,updatedAt:Date.now()})}
  if(a.removeBookmark)r.bookmarks=r.bookmarks.filter(b=>!(b.key===a.key&&b.turnIndex===a.removeBookmark.turnIndex&&b.role===a.removeBookmark.role));return clone(r);
 };
 const summary=c=>({...c,turns:undefined});
 let revision=0, nextIdentity=100;
 const catalog=[...new Set(data.map(c=>c.collection))].map((name,index)=>({id:`preview-collection-${index+1}`,name}));
 for(const c of data)c.collectionId=catalog.find(item=>item.name===c.collection).id;
 const collectionRows=()=>catalog.map(c=>({...c,count:data.filter(row=>row.collectionId===c.id).length,turnCount:data.filter(row=>row.collectionId===c.id).reduce((n,row)=>n+row.turns.length,0)}));
 const matching=(a={})=>data.filter(c=>(!a.collectionId||c.collectionId===a.collectionId)&&(!a.provider||c.provider===a.provider)&&(!a.query||[c.title,c.sourceFile,...c.turns.map(t=>t.user??t.thinking??t.ai??'')].join(' ').toLowerCase().includes(a.query.toLowerCase())));
 const selected=a=>a.operation==='clear'?data.slice():a.operation==='merge'?data.filter(c=>(a.collectionIds||[]).includes(c.collectionId)):a.operation==='deleteCollection'?data.filter(c=>c.collectionId===a.collectionId):a.selection?.allMatching?matching(a.selection):data.filter(c=>(a.ids||[]).includes(c.id));
 const nameCheck=(value,exceptId)=>{const name=String(value||'').trim();if(!name||name.length>200)throw Error('Enter a collection name of 1–200 characters.');if(catalog.some(c=>c.id!==exceptId&&c.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('A collection with that name already exists.');return name;};
 const provenance=c=>JSON.stringify([c.provider,c.sourceFile,c.conversationKey]);
 const identical=(a,b)=>provenance(a)===provenance(b)&&JSON.stringify(a.turns)===JSON.stringify(b.turns);
 const managerPreview=a=>{const rows=selected(a),existing=data.filter(c=>c.collectionId===a.targetId&&!rows.includes(c));let duplicates=0,conflicts=0;for(const row of rows){const same=existing.filter(c=>provenance(c)===provenance(row));if(same.some(c=>identical(c,row)))duplicates++;else{if(same.length)conflicts++;existing.push(row);}}return {count:rows.length,duplicates,conflicts,revision};};
 const managerMutate=a=>{
  if(a.expectedRevision!==undefined&&a.expectedRevision!==revision)throw Error('The preview archive changed. Refresh and review this action again.');
  const result={removedIds:[],remap:{},remappedIds:{},copies:{},clearLocal:a.operation==='clear',copyBookmarks:!!a.copyBookmarks};
  const rows=selected(a);const collection=catalog.find(c=>c.id===a.collectionId);
  if(a.operation==='create')catalog.push({id:`preview-collection-${++nextIdentity}`,name:nameCheck(a.name)});
  else if(a.operation==='rename'){if(!collection)throw Error('Collection not found.');collection.name=nameCheck(a.name,collection.id);for(const c of data)if(c.collectionId===collection.id)c.collection=collection.name;}
  else if(['move','copy','merge','deleteCollection'].includes(a.operation)){
   let target=catalog.find(c=>c.id===a.targetId);
   if(a.targetName){target={id:`preview-collection-${++nextIdentity}`,name:nameCheck(a.targetName)};catalog.push(target);}
   if(['move','copy','merge'].includes(a.operation)&&!target)throw Error('Choose a destination collection.');
   for(const c of rows){
    if(!target){result.removedIds.push(c.id);data.splice(data.indexOf(c),1);continue;}
    if(c.collectionId===target.id)continue;
    const duplicate=data.find(other=>other!==c&&other.collectionId===target.id&&identical(other,c));
    if(duplicate){if(a.operation!=='copy'){result.remap[c.id]=duplicate.id;result.removedIds.push(c.id);data.splice(data.indexOf(c),1);}else result.copies[c.id]=duplicate.id;continue;}
    if(a.operation==='copy'){const copied={...clone(c),id:`preview-copy-${++nextIdentity}`,collectionId:target.id,collection:target.name};data.push(copied);result.copies[c.id]=copied.id;}
    else{c.collectionId=target.id;c.collection=target.name;}
   }
   if(a.operation==='deleteCollection'&&collection)catalog.splice(catalog.indexOf(collection),1);
   if(a.operation==='merge'&&a.removeEmpty)for(const c of catalog.slice())if((a.collectionIds||[]).includes(c.id)&&c.id!==target.id&&!data.some(row=>row.collectionId===c.id))catalog.splice(catalog.indexOf(c),1);
  }else if(['deleteConversations','clear'].includes(a.operation)){for(const c of rows){result.removedIds.push(c.id);data.splice(data.indexOf(c),1);}if(a.operation==='clear')catalog.splice(0);}
  else throw unavailable();
  revision++;result.remappedIds={...result.remap};state.reading=readingManager.reconcileLocalReading(state.reading,result,id=>data.find(c=>c.id===id));return {...result,reading:clone(state.reading),revision};
 };

 window.desktop={onProgress:fn=>{progressListeners.add(fn);return ()=>progressListeners.delete(fn);},onMenu:()=>()=>{},async invoke(action,a={}){
   if(action.startsWith('server.')&&!['server.insights','server.insights.cancel','server.collections'].includes(action))throw unavailable();
   switch(action){
    case 'bootstrap':return clone({holidayStatus:window.__THREADSHELF_HOLIDAY,settings:state.settings,reading:state.reading,resources:resources.status(),dataDir:'Offline preview — in-memory synthetic archive',version,revision:releaseRevision,searchStatus:status(),notice:localize('Offline preview · synthetic conversations only · no file or network access.','Offline előnézet · csak mesterséges példák · nincs fájl- vagy hálózati hozzáférés.','Offline-Vorschau · nur synthetische Gespräche · kein Datei- oder Netzwerkzugriff.','Aperçu hors ligne · conversations synthétiques · aucun accès aux fichiers ou au réseau.','オフラインプレビュー・サンプル会話のみ・ファイルやネットワークにはアクセスしません。')});
    case 'resources.status':return resources.status();
    case 'resources.list':return resources.list();
    case 'resources.settings':return resources.settings(a);
    case 'resources.clear':return resources.clear(a);
    case 'resources.context':return resources.context(a);
    case 'resources.load':return resources.load(a);
    case 'resources.cancel':return resources.cancel(a);
    case 'settings.save':Object.assign(state.settings,a.values);window.dispatchEvent(new Event('preview-settings'));return clone(state.settings);
    case 'server.collections':case 'collections':return {collections:collectionRows().filter(c=>c.count>0)};
    case 'activity.cancel':case 'server.insights.cancel':return {cancelled:true};
    case 'activity.query':case 'activity.rebuild':return analytics.report(data,a,state.storageProfile);
    case 'activity.status':return {preview:true,profile:state.storageProfile,indexedConversations:data.length};
    case 'activity.csv':return {csv:analytics.csv(analytics.report(data,a,state.storageProfile)),filename:'ThreadShelf-Activity-preview.csv'};
    case 'activity.export':{const csv=analytics.csv(analytics.report(data,a,state.storageProfile)),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='ThreadShelf-Activity-preview.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return {saved:true,preview:true};}
    case 'server.insights':return analytics.insights(data,a.collection||'all');
    case 'manager.status':return {collections:collectionRows(),revision,searchStatus:status(),storage:{preview:true,profile:state.storageProfile,compressedBytes:null,temporaryBytes:null,catalogBytes:null,cacheBytes:null,recoveryBytes:null,indexBytes:null,pendingCleanupBytes:0,format:'In-memory synthetic preview'}};
    case 'storage.convert':{
      if(!['7z','zip6'].includes(a.profile))throw Error('Unknown compression profile.');
      if(conversion)throw Error('A preview conversion is already running.');
      const current=conversion={cancelled:false};
      try{for(let step=1;step<=5;step++){await new Promise(resolve=>setTimeout(resolve,400));if(current.cancelled)return {cancelled:true};for(const notify of progressListeners)notify({operation:'storage.convert',phase:'convert',current:step,total:5,cancellable:true});}
      state.storageProfile=a.profile;for(const notify of progressListeners)notify({operation:'storage.convert',phase:'publish',current:5,total:5,cancellable:false});return {ok:true,preview:true};}finally{conversion=null;}
    }
    case 'manager.files':{const files=matching(a).sort((a,b)=>a.title.localeCompare(b.title)),page=Math.max(1,a.page||1),pageSize=a.pageSize||25;return {files:files.slice((page-1)*pageSize,page*pageSize).map(summary),total:files.length,revision};}
    case 'manager.preview':return managerPreview(a);
    case 'manager.mutate':return managerMutate(a);
    case 'manager.maintenance':return {info:localize('Offline preview: the synthetic collection data is held only in memory. Physical storage verification, compression and index maintenance run in the desktop application.','Offline előnézet: a mesterséges gyűjteményadatok csak a memóriában vannak. A fizikai tárhely ellenőrzése, tömörítése és az indexkarbantartás az asztali alkalmazásban történik.','Offline-Vorschau: Synthetische Sammlungen liegen nur im Arbeitsspeicher. Speicherprüfung, Komprimierung und Indexpflege erfolgen in der Desktop-Anwendung.','Aperçu hors ligne : les collections synthétiques sont uniquement en mémoire. La vérification du stockage, la compression et la maintenance des index sont disponibles dans l’application de bureau.','オフラインプレビュー：サンプルのコレクションはメモリ内だけに保持されます。実際のストレージの検証、圧縮、インデックスの保守はデスクトップアプリで行います。')};
    case 'manager.backup':case 'manager.restore.pick':case 'manager.restore':throw unavailable();
    case 'files':{let files=data.filter(c=>(!a.q||inPeriod(c,a))&&(!a.collection||a.collection==='all'||c.collection===a.collection)&&(!a.provider||c.provider===a.provider)&&(!a.q||[c.title,c.sourceFile,...c.turns.map(turn=>turn.user??turn.thinking??turn.ai??'')].join(' ').toLowerCase().includes(a.q.toLowerCase())));if(a.sort==='title')files.sort((a,b)=>a.title.localeCompare(b.title));if(a.sort==='length')files.sort((a,b)=>b.turnCount-a.turnCount);const page=a.page||1,pageSize=a.pageSize||25;return {files:files.slice((page-1)*pageSize,page*pageSize).map(summary),total:files.length,page,pageSize}};
    case 'thread':{const c=data.find(c=>c.id===(a.id||a.conversationId)||c.conversationKey===a.conversationKey);if(!c)throw Error('Synthetic conversation not found.');return clone(c)};
    case 'search':{
      if(['semantic','hybrid','ollama'].includes(a.searchMode))throw unavailable();
      const q=String(a.q||'').toLowerCase().trim(),terms=q.split(/\s+/).filter(Boolean),results=[];
      for(const c of data){if(!inPeriod(c,a))continue;if(a.collection&&a.collection!=='all'&&c.collection!==a.collection)continue;if(a.provider&&a.provider!==c.provider)continue;
       for(const turn of c.turns){const role=turn.user!==undefined?'user':turn.thinking!==undefined?'thinking':turn.source_role||'ai';if(a.role&&a.role!==role)continue;const text=turn.user??turn.thinking??turn.ai??'';const target=(a.searchMode==='titles'?c.title:text).toLowerCase();const hit=a.searchMode==='exact'?target.includes(q):terms.every(t=>target.includes(t));if(hit)results.push({conversationId:c.id,id:c.id,turnIndex:turn.turn_index,role,text,score:1,title:c.title,collection:c.collection,provider:c.provider,sourceFile:c.sourceFile,conversationKey:c.conversationKey})}
      }const page=Math.max(1,Number(a.page)||1),pageSize=Math.max(1,Number(a.pageSize)||25);return {results:results.slice((page-1)*pageSize,page*pageSize),total:results.length,matchedTotal:results.length,page,pageSize,searchSession:'preview-'+revision,totalKnown:true,hasMore:page*pageSize<results.length,notice:localize('Preview search filters the bundled sample text. The desktop application uses its full search engine.','Az előnézet a beágyazott példaszövegben keres. Az asztali alkalmazás a teljes keresőmotort használja.','Die Vorschau durchsucht den eingebetteten Beispieltext. Die Desktop-Anwendung verwendet die vollständige Suchmaschine.','L’aperçu filtre le texte des exemples intégrés. L’application de bureau utilise son moteur de recherche complet.','プレビューでは内蔵サンプルのテキストを絞り込みます。デスクトップアプリでは完全な検索エンジンを使用します。')};
    }
    case 'reading.save':return readingSave(a);
    case 'search.status':return status();
    case 'search.prepare':textPrepared=true;return {status:status(),preview:true};
    case 'ollama.models':return {available:false,installed:false,isLocal:true,models:[],details:[],preview:true};
    case 'ollama.delete':case 'ollama.pull':case 'ollama.start':case 'ollama.test':case 'semantic.setup':case 'semantic.index':throw unavailable();
    case 'app.about':return {version,revision:releaseRevision,electron:'Offline browser preview',chrome:navigator.userAgent,node:'Not used in preview',platform:'Offline preview',arch:'Browser',dataDir:'Session memory only'};
    case 'app.openServerSupport':throw unavailable();
    case 'operation.cancel':if(conversion)conversion.cancelled=true;return {ok:true};
    default:throw unavailable();
   }
 }};
 window.__THREADSHELF_PREVIEW=true;
 window.__previewState=state;
}
const safeScript=s=>s.replace(/<\/script/gi,'<\\/script').replace(/<!--/g,'<\\!--');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prelude=`${identityScript}\n${managerReadingScript}\n${analyticsScript}\n${holidayScript}\nwindow.__THREADSHELF_HOLIDAY=PreviewHoliday.previewHolidayStatus();\nwindow.__READER_ASSETS=${JSON.stringify(assets)};window.__THREADSHELF_WAVES=${JSON.stringify(waves)};(${previewService.toString()})(${JSON.stringify(conversations)},${JSON.stringify(version)},${RELEASE_REVISION},PreviewReadingIdentity,PreviewManagerReading,PreviewAnalytics,(${createPreviewResources.toString()}));`;
const decoration=`(() => {
 const banner=document.getElementById('previewLabel'),license=document.getElementById('previewLicense');
 document.getElementById('previewLicenseOpen').onclick=()=>license.showModal();document.getElementById('previewLicenseClose').onclick=()=>license.close();
 const update=()=>{const locale=window.__previewState.settings.language;banner.textContent=({en:'OFFLINE PREVIEW · Synthetic examples · Session-only cache · No network access',hu:'OFFLINE ELŐNÉZET · Mintaadatok · Gyorsítótár csak erre a munkamenetre · Nincs hálózat',de:'OFFLINE-VORSCHAU · Beispieldaten · Cache nur für diese Sitzung · Kein Netzwerkzugriff',fr:'APERÇU HORS LIGNE · Exemples synthétiques · Cache de session · Aucun accès réseau',ja:'オフラインプレビュー・サンプル・キャッシュはこのセッションのみ・ネットワークなし'}[locale]||'OFFLINE PREVIEW');document.getElementById('previewLicenseOpen').textContent=({en:'Licenses',hu:'Licencek',de:'Lizenzen',fr:'Licences',ja:'ライセンス'}[locale]||'Licenses');document.getElementById('previewLicenseClose').setAttribute('aria-label',({en:'Close',hu:'Bezárás',de:'Schließen',fr:'Fermer',ja:'閉じる'}[locale]||'Close'));};window.addEventListener('preview-settings',update);update();
 let started=false;const observer=new MutationObserver(()=>{if(started)return;const first=document.querySelector('.conversation-row');if(first){started=true;setTimeout(()=>first.click(),100);observer.disconnect()}});observer.observe(document.getElementById('app'),{childList:true,subtree:true});
})();`;
const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>ThreadShelf Local Reader ${version} — Offline Preview</title><link rel="icon" href="${icon}"><style>${css.replace(/<\/style/gi,'<\\/style')}
html,body{height:100%;overflow:hidden}#app{height:calc(100% - 26px)}.preview-banner{height:26px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 12px;background:var(--accent-soft);color:var(--accent-text);font:10px/1.3 ui-sans-serif,system-ui;letter-spacing:.015em;white-space:nowrap;overflow:hidden}.preview-banner>span{overflow:hidden;text-overflow:ellipsis}.preview-banner button{font:inherit;padding:2px 7px;min-height:20px;border:0;flex-shrink:0}.preview-license{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;max-width:min(800px,95vw);max-height:80vh;overflow:auto;padding:24px}.preview-license::backdrop{background:#0008}.preview-license pre{white-space:pre-wrap;font:12px/1.65 ui-monospace,monospace;overflow-wrap:anywhere}.preview-license>button{float:right;border:1px solid var(--border)}
</style></head><body><div class="preview-banner"><span id="previewLabel"></span><button id="previewLicenseOpen" type="button">Licenses</button></div><div id="app" aria-busy="true"></div><div id="modalRoot"></div><div id="toastRoot" aria-live="polite"></div><dialog id="previewLicense" class="preview-license"><button id="previewLicenseClose" type="button" aria-label="Close">×</button><h2>ThreadShelf Local Reader ${version}</h2><p>Offline interactive preview built from the desktop UI and conversation renderer. Synthetic data only. All required rendering assets are embedded. Preview settings, reading data and Database Manager edits remain in memory for this open session. Compression controls simulate a format change for this session only. Resources Cache uses the real management controls with two preloaded synthetic image entries; caching starts disabled. Toggle caching, delete a conversation’s cached images, or clear all entries. Cache bytes and context/load/cancel operations are simulated from bundled PNGs in session memory, with no downloads or disk writes; reload the preview to reset its examples. Activity and Server Insights use the bundled synthetic records; Server mode does not contact a real server. Activity CSV export downloads a browser-generated file. Holiday detection in this browser preview uses its IANA timezone and local date at page startup; the desktop app uses native OS region settings. Storage sizes are unavailable because no physical archive is created; actual compression, file backups and imports require the desktop application.</p><pre>${esc(license+'\n\n'+notices+rendererLicenses+'\n\n'+holidayNotices)}</pre></dialog><script>${safeScript(prelude)}</script><script>${safeScript(decoration)}</script><script>${safeScript(js)}</script></body></html>`;
const output=path.join(release,releaseFilename(`ThreadShelf-Local-Reader-${version}-Preview.html`));await writeFile(output,html);console.log(output);
