import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { OwnedStorage,historyPolicy } from './owned-storage.mjs';
import { SourceAccess, assertOutputOutsideSource } from './source-access.mjs';
import {prepareReportOutput} from './report-output.mjs';
import {validateEvidenceExportContext} from './evidence-export-context.mjs';
import { EMPTY_DISCOVERY, standardReaderProfile, discoveryPathKey, detectStandardReader } from './reader-discovery.mjs';

export const DEFAULT_SETTINGS=Object.freeze({language:'en',uiPalette:'default',codeTheme:'default',appearance:'system',timezone:'local',reducedMotion:false,reducedTransparency:false,highContrast:false,autoRefreshMinutes:0,lastSourceDirectory:'',lastDestinationDirectory:'',window:{width:1180,height:800},history:{enabled:false,maxCaptures:3,maxBytes:134217728}});
const sourceHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const analyticalLimit=value=>{
  if(!value||!['nodes','depth'].includes(value.kind)||!Number.isSafeInteger(value.observed)||value.observed<0||!Number.isSafeInteger(value.maximum)||value.maximum<(value.kind==='nodes'?1:0)||value.observed<=value.maximum)return null;
  return{kind:value.kind,observed:value.observed,maximum:value.maximum,scope:value.scope==='input'?'input':'document',...(Number.isSafeInteger(value.documentIndex)&&value.documentIndex>=0?{documentIndex:value.documentIndex}:{})};
};
export const sanitizeError=e=>{const limit=analyticalLimit(e?.limit);return{code:e?.code||'ANALYTICS_ERROR',message:String(e?.message||e).slice(0,1200),...(limit?{limit}:{})};};
export class AnalyticsService extends EventEmitter{
  constructor(dataDir,{discoveryOptions={},backendAnalysis=false}={}){super();this.backendAnalysis=backendAnalysis===true;this.analysisQueue=new Map();this.workerFinishes=new Set();this.lifecycleTasks=new Set();this.exportPreparations=new Set();this.reportIds=[];this.reportKinds=new Map();this.reportPins=new Map();this.displayLaunch=Promise.resolve();this.storage=new OwnedStorage(dataDir);this.settings={...DEFAULT_SETTINGS};this.state={sources:[],savedViews:[],explorationPresets:[],annotations:{aliases:{},exclusions:[],groups:[]},readerDiscovery:{dismissedPaths:[],dismissedSourceIds:[]}};this.datasets=new Map();this.job={running:false};this.workers=new Set();this.discovery={...EMPTY_DISCOVERY};this.discoveryOptions=discoveryOptions;this.closing=false;this.registrationBusy=false;}
  async init(){await this.storage.init({recover:true,writer:true});if(this.backendAnalysis)await this.clearAnalysisSessions();this.settings={...DEFAULT_SETTINGS,...await this.storage.readJSON('settings.json',{})};this.state={...this.state,...await this.storage.readJSON('state.json',{})};const policy=this.state.readerDiscovery||{};this.state.readerDiscovery={...policy,dismissedPaths:(Array.isArray(policy.dismissedPaths)?policy.dismissedPaths:[]).filter(p=>typeof p==='string'&&p.length<4096).slice(-200),dismissedSourceIds:(Array.isArray(policy.dismissedSourceIds)?policy.dismissedSourceIds:[]).filter(id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id)).slice(-200)};const loaded=await this.callWorker({kind:'load',sources:this.state.sources});for(const data of loaded.datasets||[]){this.datasets.set(data.source.id,data);if(this.backendAnalysis){const source=this.state.sources.find(s=>s.id===data.source.id);if(source)source.textRecaptureRequired=data.textRetained!==true;}if(data.captureRecovery){const source=this.state.sources.find(s=>s.id===data.source.id);if(source){source.status='stale';source.stale=true;source.captureRecovery=data.captureRecovery;source.snapshotId=data.source.snapshotId;source.capturedAt=data.source.capturedAt;}}}for(const error of loaded.errors||[]){const source=this.state.sources.find(s=>s.id===error.id);if(source){source.status=error.status;source.conversationCount=0;source.cacheError=error.message;}}this.storageBreakdown=await this.storage.usage();this.storageSize=this.storageBreakdown.totalBytes;return this;}
  datasetDescriptor(){const sourceSnapshots=[...this.datasets.values()].map(data=>({sourceId:data.source.id,snapshotId:data.source.snapshotId||null,captureId:data.captureRef?.id||null,fingerprint:data.captureRef?.fingerprint||null,conversationCount:data.counts?.conversations??data.source.conversationCount??0,recordCount:data.counts?.records??0})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId));return{revision:sourceHash(sourceSnapshots),conversationCount:sourceSnapshots.reduce((n,s)=>n+s.conversationCount,0),recordCount:sourceSnapshots.reduce((n,s)=>n+s.recordCount,0),sourceSnapshots};}
  payload(){const value={runtime:{platform:process.platform,arch:process.arch,node:process.versions.node,electron:process.versions.electron||null,chrome:process.versions.chrome||null},settings:this.settings,sources:this.state.sources,savedViews:this.state.savedViews,explorationPresets:this.state.explorationPresets,annotations:this.state.annotations,conversations:[...this.datasets.values()].flatMap(d=>d.conversations||[]),diagnostics:[...this.datasets.values()].flatMap(d=>d.diagnostics||[]),discovery:this.discovery,job:this.job,registrationBusy:this.registrationBusy,discoveryBusy:!!this.discoveryTask,storageBytes:this.storageSize||0,storageUsage:this.storageBreakdown||null};if(this.backendAnalysis){delete value.conversations;value.backendAnalysis=true;value.dataset=this.datasetDescriptor();value.analysisProgress=this.analysisProgress||null;}return value;}
  broadcast({dataChanged=false}={}){const data=this.payload();if(!dataChanged){delete data.conversations;delete data.diagnostics;delete data.dataset;}this.emit('update',data);}
  callWorker(request,{progress,cleanup:cleanupOwnedResources}={}){if(this.closing)return Promise.reject(Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'}));return new Promise((resolve,reject)=>{
    const pinOwnerToken=randomUUID(),worker=new Worker(new URL('../desktop/worker.mjs',import.meta.url),{workerData:{...request,dataDir:this.storage.root,backendAnalysis:this.backendAnalysis,pinOwnerToken},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:2048}});this.workers.add(worker);let done=false;
    const finish=(error,result)=>{if(done)return;done=true;this.workers.delete(worker);if(this.displayWorker===worker)this.displayWorker=null;const cleanup=(async()=>{await worker.terminate().catch(()=>{});await this.storage.releasePins(pinOwnerToken).catch(cleanupError=>{this.maintenanceError=sanitizeError(cleanupError);});await Promise.resolve(cleanupOwnedResources?.()).catch(cleanupError=>{this.maintenanceError=sanitizeError(cleanupError);});if(error){const details=sanitizeError(error);reject(Object.assign(new Error(details.message),details));}else resolve(result);})();this.workerFinishes.add(cleanup);cleanup.finally(()=>this.workerFinishes.delete(cleanup)).catch(()=>{});};
    worker.on('message',msg=>{if(msg.type==='progress')progress?.(msg.value);else if(msg.type==='result')finish(null,msg.value);else if(msg.type==='error')finish(msg.error);});worker.on('error',e=>finish(sanitizeError(e)));worker.on('exit',code=>{if(!done)finish(worker.analyticsCancelled?{code:'ABORT_ERR',message:'Analysis cancelled.'}:{code:'JOB_INTERRUPTED',message:'Analytics worker stopped before publication.'});});
    if(['analyze','index'].includes(request.kind)){this.activeWorker=worker;}if(['calculate','compare'].includes(request.kind)){this.displayWorker=worker;worker.analyticsRequestId=request.value?.requestId;}
  });}
  async persistState(){await this.storage.writeJSON('state.json',this.state);}
  readerEquivalent(readerSourceId,profileRoot){return this.state.sources.find(source=>source.kind==='reader'&&(source.readerSourceId===readerSourceId||discoveryPathKey(path.basename(source.path)==='local-storage-v2'?path.dirname(source.path):source.path)===discoveryPathKey(profileRoot)));}
  async readerDiscoveryPathKeys(profileRoot){
    const keys=[discoveryPathKey(profileRoot)],candidate=standardReaderProfile(this.discoveryOptions);
    // Windows APPDATA can use an 8.3 alias while SourceAccess records the real
    // profile path. Remember both spellings before removal, so later automatic
    // discovery can honor the decision without opening Reader files.
    if(candidate){const canonical=await fs.realpath(candidate).catch(()=>null);if(canonical&&discoveryPathKey(canonical)===keys[0])keys.push(discoveryPathKey(candidate));}
    return [...new Set(keys)];
  }
  async unsuppressReader(readerSourceId,profileRoot){const keys=await this.readerDiscoveryPathKeys(profileRoot),policy=this.state.readerDiscovery;policy.dismissedSourceIds=policy.dismissedSourceIds.filter(id=>id!==readerSourceId);policy.dismissedPaths=policy.dismissedPaths.filter(p=>!keys.includes(p));}
  startReaderDiscovery(){
    if(this.closing||this.discoveryTask||this.discoveryTimer)return;
    this.discoveryTimer=setImmediate(()=>{this.discoveryTimer=null;if(!this.closing)this.discoverReader({automatic:true}).catch(()=>{});});
  }
  discoverReader({automatic=false}={}){
    if(this.discoveryTask)return this.discoveryTask;
    this.discoveryTask=this.performReaderDiscovery({automatic}).catch(error=>{if(!this.closing){this.discovery={...this.discovery,status:'unavailable',error:sanitizeError(error)};this.broadcast();}return this.discovery;}).finally(()=>{this.discoveryTask=null;if(!this.closing)this.broadcast();});return this.discoveryTask;
  }
  async performReaderDiscovery({automatic}){
    const candidate=standardReaderProfile(this.discoveryOptions),policy=this.state.readerDiscovery;
    if(this.closing)return this.discovery;
    if(automatic&&candidate&&policy.dismissedPaths.includes(discoveryPathKey(candidate))){this.discovery={...EMPTY_DISCOVERY,status:'suppressed',path:candidate,automatic:true,checkedAt:new Date().toISOString()};this.broadcast();return this.discovery;}
    if(this.job.running||this.registrationBusy){if(automatic)this.discoveryDeferred=true;this.discovery={...EMPTY_DISCOVERY,status:'busy',path:candidate,automatic,checkedAt:new Date().toISOString(),error:{code:'JOB_BUSY',message:'Another analysis is running. Reader detection will be available after it finishes.'}};this.broadcast();return this.discovery;}
    this.discovery={...EMPTY_DISCOVERY,status:'checking',path:candidate,automatic};this.broadcast();
    const probe=this.discoveryOptions.probe||((profileRoot)=>this.callWorker({kind:'observe',source:{path:profileRoot}}));
    const detected=await detectStandardReader({...this.discoveryOptions,analyticsRoot:this.storage.root,probe});
    if(this.closing)return this.discovery;
    this.discovery={...detected,automatic};
    if(!detected.available){this.broadcast();return this.discovery;}
    const equivalent=this.readerEquivalent(detected.readerSourceId,detected.path);
    if(equivalent){this.discovery={...this.discovery,status:'registered',sourceId:equivalent.id,captureStatus:equivalent.status};this.broadcast();return this.discovery;}
    if(automatic&&policy.dismissedSourceIds.includes(detected.readerSourceId)){this.discovery={...this.discovery,status:'suppressed'};this.broadcast();return this.discovery;}
    if(this.job.running||this.registrationBusy){if(automatic)this.discoveryDeferred=true;this.discovery={...this.discovery,status:'busy',error:{code:'JOB_BUSY',message:'Another analysis is running. Retry Reader detection after it finishes.'}};this.broadcast();return this.discovery;}
    await this.unsuppressReader(detected.readerSourceId,detected.path);await this.persistState();
    try{const source=await this.registerSource('reader',[detected.path],{automatic});this.discovery={...this.discovery,status:source.status==='unavailable'?'unavailable':'registered',sourceId:source.id,captureStatus:source.status,...(source.status==='unavailable'?{error:this.job.error||null}:{error:null})};}
    catch(error){this.discovery={...this.discovery,status:error.code==='JOB_BUSY'?'busy':'unavailable',error:sanitizeError(error)};}
    this.broadcast();return this.discovery;
  }
  ownedTask(operation){const task=operation();this.lifecycleTasks.add(task);task.finally(()=>this.lifecycleTasks.delete(task)).catch(()=>{});return task;}
  registerSource(kind,selection,options={}){return this.ownedTask(()=>this.performRegisterSource(kind,selection,options));}
  async performRegisterSource(kind,selection,{automatic=false}={}){
    if(this.job.running||this.registrationBusy||this.closing)throw Object.assign(new Error('An analysis job is already running.'),{code:'JOB_BUSY'});
    if(!['reader','files','directory'].includes(kind))throw new Error('Unsupported source type.');
    let paths=(Array.isArray(selection)?selection:[selection]).map(p=>path.resolve(p));if(!paths.length)throw new Error('Select a source.');
    this.registrationBusy=true;try{
    let readerSourceId=null;if(kind==='reader'){if(paths.length!==1)throw new Error('Select one Reader profile directory.');const reader=await SourceAccess.open(paths[0]);paths=[reader.profileRoot];readerSourceId=reader.sourceId;}
    for(const p of paths){const s=await fs.lstat(p);if(s.isSymbolicLink())throw new Error('Source links are not accepted.');if(p===this.storage.root||p.startsWith(this.storage.root+path.sep)||this.storage.root.startsWith(p+path.sep))throw new Error('Source and Analytics storage overlap.');}
    await assertOutputOutsideSource(this.storage.root,paths);
    const id=sourceHash({kind,paths});let source=kind==='reader'?this.readerEquivalent(readerSourceId,paths[0]):this.state.sources.find(s=>s.id===id);
    if(!source){source={id,kind,paths,path:paths[0],name:path.basename(paths[0]),status:'registered',conversationCount:0,...(kind==='reader'?{readerSourceId,discoveredAutomatically:automatic}:{})};this.state.sources.push(source);}
    if(kind==='reader'){source.readerSourceId=readerSourceId;source.path=paths[0];source.paths=paths;await this.unsuppressReader(readerSourceId,paths[0]);}await this.persistState();
    this.settings.lastSourceDirectory=kind==='files'?path.dirname(paths[0]):paths[0];await this.storage.writeJSON('settings.json',this.settings);await this.refresh(source.id);return source;
    }finally{this.registrationBusy=false;this.broadcast();}
  }
  refresh(id,options={}){return this.ownedTask(()=>this.performRefresh(id,options));}
  async performRefresh(id,{rebuild=false}={}){
    if(this.job.running)throw Object.assign(new Error('An analysis job is already running.'),{code:'JOB_BUSY'});
    const source=this.state.sources.find(s=>s.id===id);if(!source)throw new Error('Unknown Analytics source.');
    this.job={running:true,kind:'analyze',sourceId:id,phase:'capture',completed:0,total:0,startedAt:new Date().toISOString()};source.status='refreshing';this.broadcast();
    try{await assertOutputOutsideSource(this.storage.root,source.kind==='reader'?[source.path]:source.paths);const result=await this.callWorker({kind:'analyze',source,rebuild,history:this.settings.history},{progress:value=>{this.job={...this.job,...value,running:true};this.broadcast();}});this.datasets.set(id,result);Object.assign(source,result.source,{status:result.source.stale?'stale':result.source.complete===false?'partial':'ready'});delete source.statisticsRecaptureRequired;delete source.lastError;delete source.lastFailureAt;delete source.lastFailure;this.storageBreakdown=await this.storage.usage();this.storageSize=this.storageBreakdown.totalBytes;await this.persistState();this.job={running:false,sourceId:id,status:result.unchanged?'unchanged':'complete'};}
    catch(e){source.status=e.name==='AbortError'||e.code==='ABORT_ERR'?'cancelled':'unavailable';source.stale=!!this.datasets.get(id);source.lastError=sanitizeError(e);source.lastFailureAt=new Date().toISOString();source.lastFailure={kind:'analyze',phase:this.job.phase||'capture',completed:this.job.completed||0,total:this.job.total||0,startedAt:this.job.startedAt,failedAt:source.lastFailureAt};this.job={running:false,sourceId:id,status:source.status,error:source.lastError,...source.lastFailure};await this.persistState();}
    finally{this.activeWorker=null;this.broadcast({dataChanged:true});if(this.discoveryDeferred){this.discoveryDeferred=false;this.startReaderDiscovery();}}
    return this.payload();
  }
  cancel(){this.activeWorker?.postMessage({type:'cancel'});return{requested:!!this.activeWorker};}
  async updateSettings(patch){
    const next={...this.settings};const bool=['reducedMotion','reducedTransparency','highContrast'];for(const key of bool)if(key in patch)next[key]=!!patch[key];
    const enums={language:['en','hu','de','fr','ja'],appearance:['system','light','dark']};for(const [key,values] of Object.entries(enums))if(values.includes(patch[key]))next[key]=patch[key];
    for(const key of ['uiPalette','codeTheme','timezone'])if(typeof patch[key]==='string'&&patch[key].length<100)next[key]=patch[key];
    if(Number.isFinite(patch.autoRefreshMinutes))next.autoRefreshMinutes=Math.max(0,Math.min(1440,Math.round(patch.autoRefreshMinutes)));
    if(patch.history&&typeof patch.history==='object')next.history=historyPolicy({...DEFAULT_SETTINGS.history,...this.settings.history,...patch.history});
    if(patch.window&&typeof patch.window==='object')next.window={...next.window,...patch.window,width:Math.max(680,Math.min(10000,Number(patch.window.width)||1180)),height:Math.max(540,Math.min(10000,Number(patch.window.height)||800)),...(Number.isFinite(patch.window.x)?{x:patch.window.x,y:patch.window.y}:{}),maximized:!!patch.window.maximized};
    this.settings=next;await this.storage.writeJSON('settings.json',next);this.broadcast();return next;
  }
  async saveView(view){
    if(!view||typeof view.name!=='string'||!view.name.trim()||view.name.length>200||!view.filters||typeof view.filters!=='object'||JSON.stringify(view).length>2*1024**2)throw new Error('Invalid analytical view.');
    const id=view.id||sourceHash({name:view.name,time:Date.now()}),old=this.state.savedViews.find(v=>v.id===id)||{};
    const clean=JSON.parse(JSON.stringify({...old,...view,id,name:view.name.trim(),filters:{...old.filters,...view.filters}}));const i=this.state.savedViews.findIndex(v=>v.id===id);if(i>=0)this.state.savedViews[i]=clean;else this.state.savedViews.push(clean);await this.persistState();this.broadcast();return clean;
  }
  async saveExploration(config){if(!config||typeof config!=='object'||typeof config.name!=='string'||!config.name.trim()||config.name.length>200||JSON.stringify(config).length>2*1024**2)throw new Error('Invalid exploration preset.');const presets=this.state.explorationPresets||[],id=config.id||sourceHash({name:config.name,time:Date.now()}),old=presets.find(p=>p.id===id)||{},clean=JSON.parse(JSON.stringify({...old,...config,id,name:config.name.trim(),schemaVersion:config.schemaVersion||old.schemaVersion||1}));const i=presets.findIndex(p=>p.id===id);if(i<0)presets.push(clean);else presets[i]=clean;this.state.explorationPresets=presets;await this.persistState();this.broadcast();return clean;}
  async saveAnnotations(data){if(!data||typeof data!=='object'||JSON.stringify(data).length>2*1024**2)throw new Error('Invalid Analytics annotations.');this.state.annotations=JSON.parse(JSON.stringify({...this.state.annotations,...data}));await this.persistState();this.broadcast();return this.state.annotations;}
  rebuildIndexes(id){return this.ownedTask(()=>this.performRebuildIndexes(id));}
  async performRebuildIndexes(id){
    if(this.job.running||this.registrationBusy)throw Object.assign(new Error('An analysis job is already running.'),{code:'JOB_BUSY'});const source=this.state.sources.find(s=>s.id===id);if(!source)throw new Error('Unknown Analytics source.');
    this.job={running:true,kind:'index',sourceId:id,phase:'index',completed:0,total:0};this.broadcast();try{const result=await this.callWorker({kind:'index',source},{progress:value=>{this.job={...this.job,...value,running:true};this.broadcast();}});this.datasets.set(id,result);this.job={running:false,status:'complete',ownedCaptureOnly:true};this.storageBreakdown=await this.storage.usage();this.storageSize=this.storageBreakdown.totalBytes;}catch(e){this.job={running:false,sourceId:id,kind:'index',phase:this.job.phase||'index',completed:this.job.completed||0,total:this.job.total||0,status:e.code==='ABORT_ERR'?'cancelled':'index-failed',error:sanitizeError(e),previousCaptureRetained:true};}finally{this.activeWorker=null;this.broadcast({dataChanged:true});}return this.payload();
  }
  async captureHistory(id){if(!this.state.sources.some(s=>s.id===id))throw new Error('Unknown source.');return this.storage.listHistory(id);}
  captureEvidence(sourceId,captureId,query={},filters={}){return this.ownedTask(()=>this.performCaptureEvidence(sourceId,captureId,query,filters));}
  async performCaptureEvidence(sourceId,captureId,query={},filters={}){
    const invalid=message=>Object.assign(new Error(message),{code:'INVALID_CAPTURE_EVIDENCE'});
    if(typeof sourceId!=='string'||!/^[a-f0-9]{64}$/.test(sourceId)||!this.state.sources.some(s=>s.id===sourceId))throw invalid('Unknown retained capture source identity.');
    if(typeof captureId!=='string'||!/^[a-f0-9]{64}$/.test(captureId))throw invalid('Invalid retained capture identity.');
    if(!query||typeof query!=='object'||Array.isArray(query))throw invalid('Invalid retained evidence selection.');
    const allowed=new Set(['ids','recordIds','conversationIds','category','offset','limit',...(this.backendAnalysis?['reportId']:[])]);if(Object.keys(query).some(k=>!allowed.has(k)))throw invalid('Unsupported retained evidence selector.');
    if(query.ids!==undefined&&query.recordIds!==undefined)throw invalid('Use one retained record identity selector.');
    for(const key of ['ids','recordIds','conversationIds'])if(query[key]!==undefined&&(!Array.isArray(query[key])||query[key].length>10000||query[key].some(id=>typeof id!=='string'||!id.length||id.length>4096)))throw invalid('Invalid or oversized retained identity selection.');
    if(query.category!==undefined&&!['user','response','thinking','recap','commentary','tool_call','tool_output','system','other','redacted'].includes(query.category))throw invalid('Invalid retained evidence category.');
    if(query.offset!==undefined&&(!Number.isSafeInteger(query.offset)||query.offset<0))throw invalid('Invalid retained evidence page offset.');
    if(query.limit!==undefined&&(!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>100))throw invalid('Retained evidence pages contain at most 100 observations.');
    if(!filters||typeof filters!=='object'||Array.isArray(filters)||JSON.stringify(filters).length>256*1024)throw invalid('Invalid or oversized applied retained evidence filters.');
    if(query.reportId!==undefined&&(typeof query.reportId!=='string'||!/^[a-f0-9]{32}$/.test(query.reportId)))throw invalid('Invalid retained evidence query handle.');const request={kind:'history-evidence',sourceId,captureId,query:{...query,offset:query.offset??0,limit:query.limit??100},filters,annotations:this.state.annotations};return this.backendAnalysis?this.runHistoricalJob(request,[captureId],query.reportId):this.callWorker(request);
  }
  compareCaptureHistory(id,leftId,rightId,filters={}){return this.ownedTask(()=>this.performCompareCaptureHistory(id,leftId,rightId,filters));}
  async performCompareCaptureHistory(id,leftId,rightId,filters={}){if(!this.state.sources.some(s=>s.id===id))throw new Error('Unknown source.');const request={kind:'history-diff',sourceId:id,leftId,rightId,filters,annotations:this.state.annotations};return this.backendAnalysis?this.runHistoricalJob(request,[leftId,rightId]):this.callWorker(request);}
  async pinHistoricalCaptures(sourceId,ids){const pins=[];try{const pointer=await this.storage.pointer(sourceId),refs=[pointer?.active,...(pointer?.history||[])];for(const id of new Set(ids)){const reference=refs.find(ref=>ref?.id===id);if(!reference)throw new Error('Capture was not retained. History cannot reconstruct missing captures.');pins.push(await this.storage.pinReference(reference));}return pins;}catch(error){for(const release of pins)await release();throw error;}}
  async runHistoricalJob(request,ids,reuseId){
    const operation=async()=>{if(reuseId&&this.reportPins.has(reuseId))return this.callWorker(request);let pins=await this.pinHistoricalCaptures(request.sourceId,ids),retained=false;try{const result=await this.callWorker(request);if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});if(result.queryHandle&&!this.reportPins.has(result.queryHandle)){const published=await this.pinHistoricalCaptures(request.sourceId,ids);for(const release of pins)await release();pins=published;await this.retainReport(result.queryHandle,request.kind,pins);retained=true;}return result;}finally{if(!retained)for(const release of pins)await release();}};return reuseId?this.queueAnalysis(reuseId,operation):operation();
  }
  async removeCaptureHistory(id,captureId=null){if(this.job.running||this.registrationBusy)throw new Error('Cancel the current job first.');if(!this.state.sources.some(s=>s.id===id))throw new Error('Unknown source.');await this.storage.removeHistory(id,captureId);await this.storage.collectUnreferenced({mutable:true});await this.storageUsage();return this.captureHistory(id);}
  async storageUsage(){this.storageBreakdown=await this.storage.usage();this.storageSize=this.storageBreakdown.totalBytes;this.broadcast();return this.storageBreakdown;}
  async removeSource(id){if(this.job.running||this.registrationBusy)throw new Error('Cancel the current job first.');const source=this.state.sources.find(s=>s.id===id);if(!source)throw new Error('Unknown source.');await this.storage.removeSnapshot(id);this.datasets.delete(id);this.state.sources=this.state.sources.filter(s=>s.id!==id);if(this.job.sourceId===id)this.job={running:false};if(source.kind==='reader'){const root=path.basename(source.path)==='local-storage-v2'?path.dirname(source.path):source.path,keys=await this.readerDiscoveryPathKeys(root);const policy=this.state.readerDiscovery;policy.dismissedPaths=[...new Set([...policy.dismissedPaths,...keys])].slice(-200);if(source.readerSourceId)policy.dismissedSourceIds=[...new Set([...policy.dismissedSourceIds,source.readerSourceId])].slice(-200);if(this.discovery.sourceId===id)this.discovery={...this.discovery,status:'suppressed',sourceId:null,captureStatus:null};}await this.persistState();await this.storage.collectUnreferenced({mutable:true});this.storageBreakdown=await this.storage.usage();this.storageSize=this.storageBreakdown.totalBytes;this.broadcast({dataChanged:true});}
  async clearCache(){if(this.job.running||this.registrationBusy)throw new Error('Cancel the current job first.');for(const source of this.state.sources){await this.storage.removeSnapshot(source.id);source.status='registered';source.conversationCount=0;}this.datasets.clear();await this.persistState();await this.storage.collectUnreferenced({mutable:true});this.storageBreakdown=await this.storage.usage();this.storageSize=this.storageBreakdown.totalBytes;this.broadcast({dataChanged:true});return{analyticsOnly:true,rollbackBaselinePreserved:true};}
  exportReport(destination,selection){return this.ownedTask(()=>this.performExportReport(destination,selection));}
  async performExportReport(destination,selection){
    if(!['csv','json','html'].includes(selection?.format))throw new Error('Unsupported report format.');selection={...selection,exactTable:false};if(selection.includeEvidence===true&&selection.evidenceContext){selection.evidenceContext=validateEvidenceExportContext(selection.evidenceContext);if(!Array.isArray(selection.evidenceIds)||selection.evidenceIds.length>10000||selection.evidenceIds.some(id=>typeof id!=='string'||!id.length||id.length>4096))throw Object.assign(new Error('Invalid shown evidence identity selection.'),{code:'INVALID_EVIDENCE_CONTEXT'});const expected=selection.evidenceContext.kind==='capture'?'history-evidence':'history-diff';if(this.reportKinds.get(selection.evidenceContext.reportId)!==expected)throw Object.assign(new Error('The shown retained evidence is no longer available. Open it again before exporting.'),{code:'INVALID_EVIDENCE_CONTEXT'});if(selection.evidenceContext.kind==='capture'&&!this.state.sources.some(source=>source.id===selection.evidenceContext.sourceId))throw new Error('Unknown retained evidence source.');}else delete selection.evidenceContext;
    const sourcePaths=this.state.sources.flatMap(s=>s.kind==='reader'?[s.path]:s.paths);
    const perform=async()=>{await assertOutputOutsideSource(destination,sourcePaths);return this.backendAnalysis?this.runReportExport({kind:'report',sources:this.analysisSources(),selection,destination,annotations:this.state.annotations,datasetRevision:this.datasetDescriptor().revision},sourcePaths):this.callWorker({kind:'report',sources:this.state.sources,selection,destination,annotations:this.state.annotations});};const ownedIds=[selection.reportId,selection.evidenceContext?.reportId].filter(Boolean),result=this.backendAnalysis&&ownedIds.length?await this.queueAnalysisGroup(ownedIds,perform):await perform();this.settings.lastDestinationDirectory=path.dirname(destination);await this.storage.writeJSON('settings.json',this.settings);return result;
  }
  async clearAnalysisSessions(){
    // Derived calculation sessions are disposable. The exclusive main writer
    // lease is already held, so no previous desktop process can own these.
    const directory=await this.storage.assertOwned('analytics-v2/analyses'),opened=await fs.opendir(directory);
    try{for await(const entry of opened)if(entry.isDirectory()&&/^[a-f0-9]{32}$/.test(entry.name))await this.storage.ownedRemove('analytics-v2/analyses/'+entry.name,{recursive:true});}
    finally{await opened.close().catch(()=>{});}
  }
  analysisRequest(value={}){if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});if(!this.backendAnalysis)throw Object.assign(new Error('Native analysis is unavailable in this compatibility API.'),{code:'BACKEND_ANALYSIS_REQUIRED'});if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>2*1024**2)throw new Error('Invalid analytical request.');return value;}
  analysisSources(){return this.state.sources.filter(source=>this.datasets.has(source.id)).map(source=>({...source,captureRef:this.datasets.get(source.id).captureRef}));}
  async runDisplayAnalysis(kind,value){
    value=this.analysisRequest(value);
    const launched=this.displayLaunch.then(async()=>{
      if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});
      await this.cancelAnalysis({});
      const sources=this.analysisSources(),revision=this.datasetDescriptor().revision,pins=[];
      try{
        for(const source of sources)if(source.captureRef)pins.push(await this.storage.pinReference(source.captureRef));
        if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});
        this.analysisProgress={running:true,requestId:value.requestId,phase:'selection',completed:0,total:0,startedAt:new Date().toISOString()};this.broadcast();
        const task=this.callWorker({kind,sources,value,annotations:this.state.annotations,datasetRevision:revision},{progress:progress=>{if(this.analysisProgress?.requestId===value.requestId){this.analysisProgress={...this.analysisProgress,...progress,running:true};this.broadcast();}}}).finally(async()=>{
          if(this.analysisProgress?.requestId===value.requestId){this.analysisProgress={...this.analysisProgress,running:false};this.broadcast();}
        });
        return{task,revision,pins};
      }catch(error){for(const release of pins)await release();throw error;}
    });
    this.displayLaunch=launched.then(()=>{},()=>{});
    const{task,revision,pins}=await launched;let retained=false;try{const result=await task;if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});await this.retainReport(result.reportId,kind,pins);retained=true;return{...result,datasetRevision:revision};}finally{if(!retained)for(const release of pins)await release();}
  }
  calculate(value={}){return this.ownedTask(()=>this.runDisplayAnalysis('calculate',value));}
  compare(value={}){return this.ownedTask(()=>this.runDisplayAnalysis('compare',value));}
  async cancelAnalysis(value={}){const worker=this.displayWorker;if(!worker||value.requestId!==undefined&&value.requestId!==worker.analyticsRequestId)return{requested:false};worker.analyticsCancelled=true;worker.postMessage({type:'cancel'});await worker.terminate().catch(()=>{});if(this.displayWorker===worker)this.displayWorker=null;return{requested:true};}
  async retainReport(id,kind='calculate',pins=[]){
    if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))return;
    if(pins.length)this.reportPins.set(id,[...(this.reportPins.get(id)||[]),...pins]);
    this.reportIds=this.reportIds.filter(value=>value!==id);this.reportIds.push(id);this.reportKinds.set(id,kind);
    const sameKind=this.reportIds.filter(value=>this.reportKinds.get(value)===kind);
    while(sameKind.length>2)await this.releaseReport({reportId:sameKind.shift()}).catch(()=>{});
  }
  async releaseReport(value){value=this.analysisRequest(value);this.reportIds=this.reportIds.filter(id=>id!==value.reportId);this.reportKinds.delete(value.reportId);return this.queueAnalysis(value.reportId,async()=>{try{return await this.callWorker({kind:'release-report',value});}finally{await this.releaseReportPins(value.reportId);}});}
  async releaseReportPins(id){const pins=this.reportPins.get(id)||[];this.reportPins.delete(id);for(const release of pins)await release();}
  queueAnalysis(key,operation){if(typeof key!=='string'||!/^[a-f0-9]{32}$/.test(key))return Promise.reject(new Error('Invalid analysis session identity.'));const previous=this.analysisQueue.get(key)||Promise.resolve(),result=previous.catch(()=>{}).then(()=>{if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});return operation();});this.analysisQueue.set(key,result);result.finally(()=>{if(this.analysisQueue.get(key)===result)this.analysisQueue.delete(key);}).catch(()=>{});return result;}
  queueAnalysisGroup(ids,operation){const keys=[...new Set(ids)].sort();if(keys.some(key=>typeof key!=='string'||!/^[a-f0-9]{32}$/.test(key)))return Promise.reject(new Error('Invalid analysis session identity.'));const previous=keys.map(key=>this.analysisQueue.get(key)||Promise.resolve()),result=Promise.all(previous.map(task=>task.catch(()=>{}))).then(()=>{if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});return operation();});for(const key of keys)this.analysisQueue.set(key,result);result.finally(()=>{for(const key of keys)if(this.analysisQueue.get(key)===result)this.analysisQueue.delete(key);}).catch(()=>{});return result;}
  tablePage(value){value=this.analysisRequest(value);return this.queueAnalysis(value.reportId,()=>this.callWorker({kind:'table-page',value}));}
  chartData(value){value=this.analysisRequest(value);return this.queueAnalysis(value.reportId,()=>this.callWorker({kind:'chart-data',value}));}
  evidence(value){value=this.analysisRequest(value);return this.queueAnalysis(value.reportId,()=>this.callWorker({kind:'evidence-page',value}));}
  filterOptions(value){value=this.analysisRequest(value);return this.callWorker({kind:'filter-options',sources:this.analysisSources(),value});}
  conversationPage(value){value=this.analysisRequest(value);return this.callWorker({kind:'conversation-page',sources:this.analysisSources(),value});}
  conversationMetadata(value){value=this.analysisRequest(value);return this.callWorker({kind:'conversation-metadata',sources:this.analysisSources(),value});}
  historyDiffPage(value){value=this.analysisRequest(value);return this.queueAnalysis(value.reportId,()=>this.callWorker({kind:'history-diff-page',value}));}
  async runReportExport(request,sourcePaths){
    if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});
    let output,work,pins=[],cleaned=false,finishPreparation;const preparation=new Promise(resolve=>{finishPreparation=resolve;});this.exportPreparations.add(preparation);
    const prepared=()=>{finishPreparation();this.exportPreparations.delete(preparation);};
    const cleanup=async()=>{if(cleaned)return;cleaned=true;try{await output?.cleanup();}finally{try{if(work)await this.storage.removeWork(work.name);}finally{for(const release of pins)await release();pins=[];}}};
    try{
      for(const source of request.sources||[])if(source.captureRef)pins.push(await this.storage.pinReference(source.captureRef));
      output=await prepareReportOutput(request.destination,sourcePaths);if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});
      work=await this.storage.newWork();if(this.closing)throw Object.assign(new Error('Analytics is closing.'),{code:'ABORT_ERR'});
      const task=this.callWorker({...request,reportOutput:output.context,exportWorkDirectory:work.path},{cleanup});prepared();return await task;
    }catch(error){await cleanup().catch(cleanupError=>{this.maintenanceError=sanitizeError(cleanupError);});throw error;}
    finally{prepared();}
  }
  async exportTable(destination,value){value=this.analysisRequest(value);const sourcePaths=this.state.sources.flatMap(s=>s.kind==='reader'?[s.path]:s.paths);await assertOutputOutsideSource(destination,sourcePaths);return this.queueAnalysis(value.reportId,()=>this.runReportExport({kind:'export-table',sources:this.analysisSources(),value,destination,selection:{...value,format:'tsv',exactTable:true,includeEvidence:false,includeLabels:true},annotations:this.state.annotations,datasetRevision:this.datasetDescriptor().revision},sourcePaths));}
  async observe(){if(this.job.running)return;for(const source of this.state.sources.filter(s=>s.kind==='reader'&&this.datasets.has(s.id))){if(this.job.running)return;const identity=source.observedIdentity;try{const value=await this.callWorker({kind:'observe',source});if(this.job.running||!this.state.sources.includes(source)||source.observedIdentity!==identity)return;source.stale=value.identity!==source.observedIdentity;if(!source.stale&&value.publicationIdentity)source.publicationIdentity=value.publicationIdentity;source.status=source.stale?'stale':source.complete===false?'partial':'ready';}catch{if(this.job.running||!this.state.sources.includes(source)||source.observedIdentity!==identity)return;source.status='unavailable';source.stale=true;}}this.broadcast();}
  close(){if(!this.closeTask)this.closeTask=this.performClose();return this.closeTask;}
  async performClose(){
    this.closing=true;await this.displayLaunch.catch(()=>{});await Promise.allSettled([...this.exportPreparations]);if(this.discoveryTimer){clearImmediate(this.discoveryTimer);this.discoveryTimer=null;}this.activeWorker?.postMessage({type:'cancel'});
    try{
      for(const worker of this.workers)await worker.terminate().catch(()=>{});
      await Promise.allSettled([...this.workerFinishes]);await Promise.allSettled([...this.analysisQueue.values()]);await Promise.allSettled([...this.lifecycleTasks]);await this.discoveryTask?.catch(()=>{});
      if(this.backendAnalysis){for(const id of this.reportPins.keys())await this.releaseReportPins(id);await this.clearAnalysisSessions();const directory=await this.storage.assertOwned('analytics-v2/work'),opened=await fs.opendir(directory);try{for await(const entry of opened)if(entry.isDirectory()&&/^job-[a-f0-9-]{36}$/.test(entry.name))await this.storage.removeWork(entry.name);}finally{await opened.close().catch(()=>{});}}
    }finally{await this.storage.close();}
  }
}
