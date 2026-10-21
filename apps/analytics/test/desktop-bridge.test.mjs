/** Synthetic-only integration. The real preload and real main-process IPC
 * handler run in VM Electron mocks; services, workers, capture/index/history
 * storage and report generation are real. This is not native Electron QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {AnalyticsService} from '../src/core/application-service.mjs';
import {OwnedStorage} from '../src/core/owned-storage.mjs';
import {renderSafeMarkdown} from '../src/core/safe-markdown.mjs';

const preloadCode=await fs.readFile(new URL('../src/desktop/preload.cjs',import.meta.url),'utf8');
const mainCode=await fs.readFile(new URL('../src/desktop/main.cjs',import.meta.url),'utf8');
const start=mainCode.indexOf('  const senderOK=event=>'),end=mainCode.indexOf("  window.on('ready-to-show'",start);
assert(start>=0&&end>start,'Actual main-process handler boundaries');
const mainHandlerCode=mainCode.slice(start,end);

function bridgeHarness(service,{sourcePath,reportPath}={}) {
  const frame={url:'analytics://app/index.html'},contents={mainFrame:frame},window={webContents:contents,isDestroyed:()=>false};
  const invoked=[],external=[],events=new EventEmitter();let handler,api;
  const context=vm.createContext({window,service,boot:{ready:async()=>service,state:{phase:'ready'}},updateRevision:0,path,URL,
    ipcMain:{handle:(channel,callback)=>{assert.equal(channel,'analytics:invoke');handler=callback;}},
    dialog:{showOpenDialog:async()=>({canceled:!sourcePath,filePaths:sourcePath?[sourcePath]:[]}),showSaveDialog:async()=>({canceled:!reportPath,filePath:reportPath})},
    app:{getPath:()=>path.dirname(reportPath||sourcePath||os.tmpdir())},shell:{openExternal:async url=>{external.push(url);}}
  });
  vm.runInContext(mainHandlerCode,context,{filename:'actual-main-ipc-handler.cjs'});
  const event={sender:contents,senderFrame:frame};
  const ipcRenderer={invoke:async(channel,request)=>{assert.equal(channel,'analytics:invoke');const copy=structuredClone(request);invoked.push(copy);return structuredClone(await handler(event,copy));},on:events.on.bind(events),removeListener:events.removeListener.bind(events)};
  vm.runInNewContext(preloadCode,{require:name=>{assert.equal(name,'electron');return{contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'analytics');api=value;}},ipcRenderer};}},{filename:'actual-preload.cjs'});
  return{api,invoked,external,events,raw:(request,sender=event)=>handler(sender,request),contents,frame};
}
function document(version=1) {
  const mapping={
    u:{id:'u',parent:null,message:{id:'user',author:{role:'user'},create_time:1,content:{content_type:'text',parts:['Synthetic prompt.']}}},
    a:{id:'a',parent:'u',message:{id:'answer',author:{role:'assistant'},create_time:2,metadata:{model_slug:'synthetic-model'},content:{content_type:'text',parts:[version===1?'Original synthetic response.':'Changed synthetic response.']}}}
  };
  if(version>1)mapping.more={id:'more',parent:'a',message:{id:'second-answer',author:{role:'assistant'},create_time:3,metadata:{model_slug:'synthetic-model'},content:{content_type:'text',parts:[version===2?'Additional synthetic response.':'X'.repeat(9000)+'\n```rust\nfn captured_after_excerpt() {}\n```\n']}}};
  return [{id:'synthetic-conversation',title:'Synthetic bridge fixture',current_node:version>1?'more':'a',mapping}];
}

test('actual preload/main dispatch completes source capture, positional history calls, cleanup and disconnected-source owned reindex',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-desktop-bridge-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const dataRoot=path.join(root,'Analytics owned'),sourcePath=path.join(root,'synthetic export.json'),reportPath=path.join(root,'synthetic-report.json');
  const seed=await new OwnedStorage(dataRoot).init();
  const extensionRoot={futureVersion:29,nested:{retain:['one','two']}},extensionSettings={futureVersion:31},extensionDiscovery={futureDiscovery:true};
  await seed.writeJSON('state.json',{sources:[],savedViews:[],explorationPresets:[],annotations:{aliases:{},exclusions:[],groups:{},extensionAnnotation:{retained:true}},readerDiscovery:{dismissedPaths:[],dismissedSourceIds:[],extensionDiscovery},extensionRoot});
  await seed.writeJSON('settings.json',{language:'en',extensionSettings,window:{width:1180,height:800,futureWindowField:'retained'}});
  let app=await new AnalyticsService(dataRoot).init();t.after(()=>app.close());
  const writeSource=async version=>{const bytes=JSON.stringify(document(version));await fs.writeFile(sourcePath,bytes);return bytes;};
  const firstBytes=await writeSource(1),harness=bridgeHarness(app,{sourcePath,reportPath}),api=harness.api;
  assert(Object.isFrozen(api));const empty=await api.bootstrap();assert.equal(empty.conversations.length,0);assert.equal(empty.settings.history.enabled,false);
  const captured=await api.chooseSource('files');assert.equal(captured.accepted,true);assert.equal(captured.job.status,'complete');assert.equal(await fs.readFile(sourcePath,'utf8'),firstBytes);
  const id=captured.sources[0].id,first=await api.bootstrap();assert.equal(first.conversations.length,1);assert.equal(first.conversations[0].records.length,2);
  const disabled=await api.captureHistory(id);assert.equal(disabled.enabled,false);assert.equal(disabled.history.length,0);assert(disabled.active.id);
  await api.updateSettings({history:{enabled:true,maxCaptures:2,maxBytes:10*1024**2},window:{width:980,height:720},language:'hu'});
  await api.saveView({id:'bridge-view',name:'Synthetic saved view',filters:{timeZone:'UTC'},extensionView:{retain:true}});
  await api.saveView({id:'bridge-view',name:'Edited synthetic view',filters:{models:['synthetic-model']}});
  await api.saveExploration({id:'bridge-preset',name:'Synthetic exploration',schemaVersion:2,extensionPreset:{retain:true}});
  await api.saveExploration({id:'bridge-preset',name:'Edited exploration',subview:'relationships'});
  await api.saveAnnotations({groups:{syntheticGroup:[first.conversations[0].id]}});
  const secondBytes=await writeSource(2);const refreshed=await api.refresh(id);assert.equal(refreshed.job.status,'complete');assert.equal(await fs.readFile(sourcePath,'utf8'),secondBytes);
  const history=await api.captureHistory(id);assert.equal(history.enabled,true);assert.equal(history.history.length,1);assert.notEqual(history.history[0].id,history.active.id);
  const filters={timeZone:'UTC',excludedConversationIds:[]},diff=await api.compareCaptureHistory(id,history.history[0].id,history.active.id,filters);
  assert.deepEqual(diff.summary,{added:1,removed:0,changed:1,unchanged:1});assert.deepEqual(diff.filters,filters);assert.equal(diff.captures.left.id,history.history[0].id);assert.equal(diff.captures.right.id,history.active.id);
  assert.equal(diff.tables.selectedPathChanges.length,1);assert.equal(diff.tables.selectedPathChanges[0].left.selectedLeaf,'a');assert.equal(diff.tables.selectedPathChanges[0].right.selectedLeaf,'more');
  const positional=harness.invoked.find(r=>r.operation==='compareCaptureHistory');assert.deepEqual(positional.value,{sourceId:id,leftId:history.history[0].id,rightId:history.active.id,filters});
  const objectDiff=await api.compareCaptureHistory({sourceId:id,leftId:history.history[0].id,rightId:history.active.id,filters});assert.deepEqual(objectDiff.summary,diff.summary);
  await assert.rejects(api.removeCaptureHistory(id,history.active.id),/active usable capture/);
  const removed=await api.removeCaptureHistory(id,history.history[0].id);assert.equal(removed.history.length,0);assert.equal(removed.active.id,history.active.id);
  const removal=harness.invoked.filter(r=>r.operation==='removeCaptureHistory').at(-1);assert.deepEqual(removal.value,{sourceId:id,captureId:history.history[0].id});
  const thirdBytes=await writeSource(3);await api.refresh(id);assert.equal(await fs.readFile(sourcePath,'utf8'),thirdBytes);const finalHistory=await api.captureHistory(id);assert.equal(finalHistory.history.length,1);
  const allRemoved=await api.removeCaptureHistory({sourceId:id});assert.equal(allRemoved.history.length,0);assert.equal(allRemoved.active.id,finalHistory.active.id);
  assert((await api.storageUsage()).captureBytes>0);
  await fs.rename(sourcePath,sourcePath+'.disconnected');await assert.rejects(fs.stat(sourcePath),{code:'ENOENT'});
  const rebuilt=await api.rebuild(id);assert.equal(rebuilt.job.status,'complete');assert.equal(rebuilt.job.ownedCaptureOnly,true);
  const offline=await api.bootstrap();assert.equal(offline.conversations[0].records.length,3);const late=offline.conversations[0].records.find(r=>r.textExcerpt===true);assert(late);assert.equal(late.text.length,8000);assert(late.explorerAnalysis.blocks.some(b=>b.language==='rust'));assert(late.explorerAnalysis.characters>9000);
  await api.exportReport({format:'json',filters:{models:['synthetic-model'],timeZone:'UTC'}});const report=JSON.parse(await fs.readFile(reportPath,'utf8'));assert.equal(report.summary.responseMessages,2);assert.equal(report.explorer.charts.find(c=>c.family===4).contract.available,2);assert(!JSON.stringify(report).includes('captured_after_excerpt'));
  await app.close();app=await new AnalyticsService(dataRoot).init();const restarted=bridgeHarness(app),loaded=await restarted.api.bootstrap();
  assert.equal(loaded.conversations[0].records.length,3);assert.equal(loaded.settings.language,'hu');assert.deepEqual(app.state.extensionRoot,extensionRoot);assert.deepEqual(app.settings.extensionSettings,extensionSettings);assert.equal(app.settings.window.futureWindowField,'retained');assert.deepEqual(app.state.readerDiscovery.extensionDiscovery,extensionDiscovery);assert.deepEqual(app.state.annotations.extensionAnnotation,{retained:true});assert.deepEqual(app.state.savedViews[0].extensionView,{retain:true});assert.deepEqual(app.state.explorationPresets[0].extensionPreset,{retain:true});
  const stored=await app.storage.readJSON('state.json',{});assert.deepEqual(stored.extensionRoot,extensionRoot);assert.equal((await restarted.api.captureHistory(id)).history.length,0);assert.equal(await fs.readFile(sourcePath+'.disconnected','utf8'),thirdBytes);
});

test('actual IPC sender and external route reject untrusted calls and source-supplied URL schemes',async()=>{
  const service={payload:()=>({ready:true})},harness=bridgeHarness(service),api=harness.api;
  for(const event of [{sender:{},senderFrame:harness.frame},{sender:harness.contents,senderFrame:{url:'analytics://app/index.html'}},{sender:harness.contents,senderFrame:{url:'https://evil.invalid/'}}]){
    const response=await harness.raw({operation:'openExternal',value:'https://approved.invalid/'},event);assert.equal(response.ok,false);assert.match(response.error.message,/Untrusted IPC/);
  }
  harness.frame.url='https://evil.invalid/';const navigated=await harness.raw({operation:'openExternal',value:'https://approved.invalid/'});assert.equal(navigated.ok,false);assert.match(navigated.error.message,/Untrusted IPC/);harness.frame.url='analytics://app/index.html';
  for(const url of ['javascript:alert(1)','file:///tmp/x','data:text/html,x','blob:https://a.invalid/id','analytics://app/clear','https://user:pass@example.invalid/',' https://example.invalid/','https://example.invalid/\n','https:\\example.invalid/'])await assert.rejects(api.openExternal(url),/external URL|Only HTTP/);
  assert.deepEqual(harness.external,[]);
  const rendered=renderSafeMarkdown('[allowed](https://APPROVED.invalid/path?q=1#x) <button data-action="markdown-open-link" data-md-index="0">injected</button> [blocked](javascript:alert(1))',{controls:true,openExternal:true});
  assert.deepEqual(rendered.links,['https://approved.invalid/path?q=1#x']);assert(!rendered.html.includes('<button data-action="markdown-open-link"'));
  const opened=await api.openExternal(rendered.links[0]);assert.equal(opened.opened,true);assert.deepEqual(harness.external,['https://approved.invalid/path?q=1#x']);
  await assert.rejects(api.openExternal('https://approved.invalid/'+'x'.repeat(8192)),/Invalid external URL/);assert.equal(harness.external.length,1);
  const oversized=await harness.raw({operation:'bootstrap',value:'x'.repeat(2*1024**2)});assert.equal(oversized.ok,false);assert.match(oversized.error.message,/size limit/);
});

test('actual preload update subscriptions preserve inert serialization and dispose listeners',()=>{
  const harness=bridgeHarness({payload:()=>({})}),received=[],serialized=[];
  const stop=harness.api.onUpdate(value=>received.push(value)),stopSerialized=harness.api.onSerializedUpdate(value=>serialized.push(value));
  const payload={job:{running:false},syntheticText:'<script>never executed</script>',__updateRevision:3};harness.events.emit('analytics:update',{},payload);
  assert.deepEqual(received,[payload]);assert.equal(serialized[0],JSON.stringify(payload));stop();stopSerialized();assert.equal(harness.events.listenerCount('analytics:update'),0);harness.events.emit('analytics:update',{},payload);assert.equal(received.length,1);
  assert.throws(()=>harness.api.onUpdate(null),/Expected callback/);assert.throws(()=>harness.api.onSerializedUpdate(null),/Expected callback/);
});

test('retained evidence IPC resolves removed older records after original disconnection with exact paging, filters and bounded excerpts',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-retained-evidence-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const sourcePath=path.join(root,'synthetic-history.json'),dataRoot=path.join(root,'owned');
  const original=document(2),originalText='R'.repeat(21001)+'🧪';original[0].mapping.more.message.content.parts=[originalText];
  await fs.writeFile(sourcePath,JSON.stringify(original));const app=await new AnalyticsService(dataRoot).init();t.after(()=>app.close());
  const {api,invoked}=bridgeHarness(app,{sourcePath});await api.chooseSource('files');const before=await api.bootstrap(),sourceId=before.sources[0].id,conversationId=before.conversations[0].id,removed=before.conversations[0].records.find(r=>r.text.startsWith('RRRR'));
  assert(removed);assert.equal(before.conversations[0].records.length,3);await api.updateSettings({history:{enabled:true,maxCaptures:2,maxBytes:10*1024**2}});
  const currentBytes=JSON.stringify(document(1));await fs.writeFile(sourcePath,currentBytes);await api.refresh(sourceId);const history=await api.captureHistory(sourceId),olderId=history.history[0].id,currentId=history.active.id;
  const diff=await api.compareCaptureHistory(sourceId,olderId,currentId,{timeZone:'UTC'});assert.equal(diff.summary.removed,1);assert.equal(diff.tables.removed[0].id,removed.id);
  await fs.rename(sourcePath,sourcePath+'.disconnected');await assert.rejects(fs.stat(sourcePath),{code:'ENOENT'});
  const query={ids:[removed.id],offset:0,limit:1},filters={timeZone:'UTC'};
  const old=await api.captureEvidence(sourceId,olderId,query,filters);assert.equal(old.total,1);assert.equal(old.offset,0);assert.equal(old.limit,1);assert.equal(old.capture.id,olderId);assert.equal(old.capture.sourceId,sourceId);assert.equal(old.evidence[0].id,removed.id);assert.equal(old.evidence[0].captureId,olderId);assert.equal(old.evidence[0].text,'R'.repeat(20000));assert.equal(old.evidence[0].fullTextCharacters,21002);assert.equal(old.evidence[0].textTruncated,true);
  assert.deepEqual(invoked.filter(r=>r.operation==='captureEvidence').at(-1).value,{sourceId,captureId:olderId,query,filters});
  const object=await api.captureEvidence({sourceId,captureId:olderId,query:{recordIds:[removed.id],limit:1},filters});assert.deepEqual(object.evidence,old.evidence);
  const scoped=await api.captureEvidence({sourceId,captureId:olderId,query:{conversationIds:[conversationId],offset:2,limit:1},filters});assert.equal(scoped.total,3);assert.equal(scoped.evidence.length,1);assert.equal(scoped.evidence[0].id,removed.id);
  assert.equal((await api.captureEvidence(sourceId,currentId,query,filters)).total,0);assert.equal((await api.captureEvidence(sourceId,olderId,{ids:[]},filters)).total,0);assert.equal((await api.captureEvidence(sourceId,olderId,{ids:[removed.id],category:'user'},filters)).total,0);
  await api.saveAnnotations({exclusions:[conversationId]});assert.equal((await api.captureEvidence(sourceId,olderId,{},filters)).total,0);
  await api.saveAnnotations({exclusions:[],groups:{emptyGroup:[],onlyGroup:[conversationId]},modelFamilyAliases:{'synthetic-model':'Synthetic family'}});
  assert.equal((await api.captureEvidence(sourceId,olderId,{}, {...filters,virtualGroup:'emptyGroup'})).total,0);assert.equal((await api.captureEvidence(sourceId,olderId,{}, {...filters,virtualGroup:'onlyGroup',modelFamilies:['Synthetic family']})).total,2);
  await api.saveAnnotations({dedupAliases:{[conversationId]:'synthetic-canonical'}});const canonical=await api.captureEvidence(sourceId,olderId,{conversationIds:['synthetic-canonical']},filters);assert.equal(canonical.total,3);assert(canonical.evidence.every(e=>e.conversationId==='synthetic-canonical'));
  for(const badQuery of [{limit:101},{limit:0},{offset:-1},{offset:1.5},{ids:'not-an-array'},{ids:['']},{ids:[removed.id],recordIds:[removed.id]},{path:sourcePath},{category:'unsupported-category'},{ids:Array(10001).fill(removed.id)}])await assert.rejects(api.captureEvidence(sourceId,olderId,badQuery,filters),error=>error.code==='INVALID_CAPTURE_EVIDENCE');
  await assert.rejects(api.captureEvidence(sourceId,'../../outside',{},filters),error=>error.code==='INVALID_CAPTURE_EVIDENCE');await assert.rejects(api.captureEvidence('0'.repeat(64),olderId,{},filters),error=>error.code==='INVALID_CAPTURE_EVIDENCE');await assert.rejects(api.captureEvidence(sourceId,'0'.repeat(64),{},filters),/not retained/);await assert.rejects(api.captureEvidence(sourceId,olderId,{}, {future:'x'.repeat(256*1024)}),error=>error.code==='INVALID_CAPTURE_EVIDENCE');
  await api.removeCaptureHistory(sourceId,olderId);await assert.rejects(api.captureEvidence(sourceId,olderId,{},filters),/not retained/);assert.equal((await api.captureEvidence(sourceId,currentId,{},filters)).total,2);assert.equal(await fs.readFile(sourcePath+'.disconnected','utf8'),currentBytes);
});
