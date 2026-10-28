import path from 'node:path';
import fs from 'node:fs/promises';
import { ResourceCache, RESOURCE_CACHE_LIMITS } from './resource-cache.mjs';
import { RESOURCE_CACHE_DEFAULTS, RESOURCE_CACHE_PREFERENCES_FILE, validateResourceCacheSettings } from './resource-cache-settings.mjs';
import { RESOURCE_ACTIONS, validateResourceRequest } from './resource-requests.mjs';
import { ResourceContexts } from './resource-contexts.mjs';
import { ArchiveStore } from './archive.mjs';
import { SearchService } from './search.mjs';
import { CompressedStorage } from './storage.mjs';
import { importPaths } from './importers.mjs';
import { ThreadShelfClient, ServerSearchPager } from './server.mjs';
import { ActivityService, activityCSV } from './activity.mjs';
import { JsonState, DEFAULTS, INTERFACE_DEFAULTS, APPEARANCE_DEFAULTS, LAYOUT_DEFAULTS, READER_APPEARANCE_DEFAULTS, validateSettings, validateCoreSettings, validateInterfaceSettings, validateAppearanceSettings, validateLayoutSettings, validateReaderAppearanceSettings, validateReading, applyReading, normalizeServerUrl } from './state.mjs';
import { EXTENDED_DEFAULTS, EXTENDED_PREFERENCES_FILE, extendedPreferenceDefaults, validateExtendedPreferences, mergeExtendedPreferences } from './extended-preferences.mjs';
import { REMOTE_IMAGE_DEFAULTS, REMOTE_IMAGES_FILE, validateRemoteImageSettings } from './remote-images.mjs';
import { localIdFor, localReadingKey, reconcileLocalReading, replaceLocalReading, localReadingOnly } from './manager-reading.mjs';

export class ApplicationService {
  constructor({dataDir,onProgress=()=>{},storageOptions={},resourceCacheOptions={}}) {
    this.dataDir=dataDir; this.onProgress=onProgress; this.storageOptions=storageOptions;
    this.resourceCacheOptions=resourceCacheOptions; this.resourceContexts=new ResourceContexts(); this.resourceLoads=new Map(); this.resourceError=''; this.resourceLimitReached=false;
    this.operation=null; this.inFlight=new Set(); this.searchControllers=new Set(); this.localSearches=new Set();
    this.lifetime=new AbortController(); this.closing=false; this.shutdownTask=null; this.mutationQueue=Promise.resolve();
    this.store=null; this.searcher=null; this.storage=null; this.mountTask=null; this.restoreTask=null; this.storageError='';
    this.lastDurableRevision=0; this.sinceCheckpoint=0; this.pendingRestore=null;
    this.pendingClearPurge=false;
    this.activity=null;this.activityControllers=new Set();this.activityTasks=new Set();this.insightsControllers=new Set();
  }
  async init() {
    this.settings=await new JsonState(this.dataDir,'settings.json',DEFAULTS,v=>({...DEFAULTS,...validateCoreSettings(v)})).init();
    this.extendedSettings=await new JsonState(this.dataDir,EXTENDED_PREFERENCES_FILE,extendedPreferenceDefaults(this.settings.value.searchMode),validateExtendedPreferences).init();
    this.interfaceSettings=await new JsonState(this.dataDir,'interface.json',INTERFACE_DEFAULTS,validateInterfaceSettings).init();
    this.appearanceSettings=await new JsonState(this.dataDir,'appearance.json',APPEARANCE_DEFAULTS,validateAppearanceSettings).init();
    this.layoutSettings=await new JsonState(this.dataDir,'layout.json',LAYOUT_DEFAULTS,validateLayoutSettings).init();
    // Keep all 3.2 preference files byte-compatible with its strict readers.
    this.readerAppearanceSettings=await new JsonState(this.dataDir,'reader-appearance.json',READER_APPEARANCE_DEFAULTS,validateReaderAppearanceSettings).init();
    this.remoteImageSettings=await new JsonState(this.dataDir,REMOTE_IMAGES_FILE,REMOTE_IMAGE_DEFAULTS,validateRemoteImageSettings).init();
    this.resourceSettings=await new JsonState(this.dataDir,RESOURCE_CACHE_PREFERENCES_FILE,RESOURCE_CACHE_DEFAULTS,validateResourceCacheSettings).init();
    this.resourceCache=new ResourceCache({dataDir:this.dataDir,...this.resourceCacheOptions});
    try{await this.resourceCache.init();}catch{this.resourceError='cache-unavailable';}
    this.resourceCache.setEnabled(this.resourceSettings.value.resourceCacheEnabled);
    const readingFiles=await Promise.all(['reading-v2.json','reading-v2.json.bak'].map(async name=>{
      try{await fs.stat(path.join(this.dataDir,name));return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}
    }));
    this.readingFilesMissing=readingFiles.every(present=>!present);
    this.reading=await new JsonState(this.dataDir,'reading-v2.json',{positions:{},bookmarks:[],recent:[]},validateReading).init();
    this.serverSearch=new ServerSearchPager({onProgress:p=>this.progress(p)});
    // A damaged Local archive must not prevent Settings, Server mode or the
    // explicit backup-recovery flow from opening.
    if(this.settings.value.mode==='local')try{await this.ensureLocal();}catch(error){this.storageError=error.message;}
    return this;
  }
  async resourceStatus(includeConversations=false) {
    let data={resourceCount:0,totalBytes:0,maxBytes:RESOURCE_CACHE_LIMITS.totalBytes,conversations:[]};
    try{data=await this.resourceCache.status();}catch{this.resourceError='cache-unavailable';}
    const status={enabled:this.resourceSettings.value.resourceCacheEnabled,itemCount:data.resourceCount,byteSize:data.totalBytes,maxBytes:data.maxBytes,maxImageBytes:RESOURCE_CACHE_LIMITS.imageBytes,limitReached:this.resourceLimitReached,notice:this.resourceError||data.notice||(this.resourceLimitReached?'limit-reached':'')};
    if(includeConversations)status.conversations=(data.conversations||[]).map(row=>({key:row.key,title:row.title,mode:row.source==='server'?'server':'local',source:row.sourceId||row.source,itemCount:row.resourceCount,byteSize:row.bytes}));
    return status;
  }
  async resourceAction(action,args) {
    validateResourceRequest(action,args);
    if(action==='resources.status'||action==='resources.list')return this.resourceStatus(action==='resources.list');
    if(action==='resources.context')return this.resourceContexts.token(args);
    if(action==='resources.cancel'){this.resourceLoads.get(args.requestId)?.abort();return {ok:true};}
    if(action==='resources.settings')return this.serialized(async()=>{
      await this.resourceSettings.update(values=>({...values,resourceCacheEnabled:args.enabled}));
      this.resourceCache.setEnabled(args.enabled);
      return this.resourceStatus();
    });
    if(action==='resources.clear') {
      if(args.conversationKey){const status=await this.resourceCache.status();if(!status.conversations.some(row=>row.key===args.conversationKey))throw new Error('Refresh the resource list before deleting this conversation’s cached images.');}
      await this.resourceCache.clear(args);this.resourceLimitReached=false;this.resourceError='';
      return this.resourceStatus();
    }
    if(action==='resources.load') {
      if(this.resourceError)throw new Error('The resource cache is unavailable. Review Resources Cache in Settings.');
      if(this.resourceLoads.has(args.requestId)||this.resourceLoads.size>=64)throw new Error('Too many pending image requests.');
      const conversation=this.resourceContexts.owner(args.contextToken,args.url),controller=new AbortController();
      this.resourceLoads.set(args.requestId,controller);
      try {
        const result=await this.resourceCache.load({url:args.url,conversation,enabled:this.resourceSettings.value.resourceCacheEnabled,signal:AbortSignal.any([controller.signal,this.lifetime.signal])});
        if(result.warning==='cache-full')this.resourceLimitReached=true;
        // Do not expose cache paths or archived source URLs back across IPC.
        return {dataUrl:result.dataUrl,cached:result.cached,stored:result.stored,bytes:result.bytes,...(result.warning?{warning:result.warning}:{})};
      } finally {this.resourceLoads.delete(args.requestId);}
    }
    throw new Error('Unknown resource action.');
  }
  async ensureLocal() {
    // Handles are assigned while mounting so redo can use them internally, but
    // callers must wait until recovery or restore has completed successfully.
    if(this.restoreTask)try{await this.restoreTask;}catch{/* Remount the surviving durable generation below. */}
    if(this.mountTask)return this.mountTask;
    if(this.store)return this.store;
    if(this.storage?.recoveryMode)throw new Error(this.storageError||'Local storage is awaiting backup recovery.');
    this.mountTask=(async()=>{
      let ownedStorage,ownedStore,ownedSearcher;
      try {
        ownedStorage=new CompressedStorage({dataDir:this.dataDir,onProgress:p=>this.progress(p),...this.storageOptions});
        await ownedStorage.init();this.storage=ownedStorage;
        ownedStore=new ArchiveStore(this.archiveOptions(ownedStorage)).init();this.store=ownedStore;
        ownedSearcher=new SearchService({store:ownedStore,dataDir:this.dataDir,databasePath:ownedStorage.vectorPath,objectsDir:ownedStorage.objectsDir,tempRoot:path.join(ownedStorage.workingDir,'search-work'),compressionProfile:()=>ownedStorage.profile,lazy:true,onProgress:p=>this.progress(p)});this.searcher=ownedSearcher;
        if(this.storage.restoreReadingToken && this.reading.value._localRestoreToken!==this.storage.restoreReadingToken) {
          await this.reading.update(v=>({...replaceLocalReading(v,this.storage.readingSnapshot,id=>this.summary(id)),_localRestoreToken:this.storage.restoreReadingToken}));
        } else if(this.readingFilesMissing&&this.storage.readingSnapshot){
          const snapshot=this.storage.readingSnapshot.schemaVersion?this.storage.readingSnapshot.data:this.storage.readingSnapshot;
          await this.reading.update(v=>({...replaceLocalReading(v,snapshot,id=>this.summary(id)),_localRecovery:{epoch:this.storage.epoch,sequence:this.storage.pointer?.sequence||0}}));
          this.readingFilesMissing=false;this.reading.notice='Recovered Local saved reading from the last compressed snapshot.';
        }
        await this.storage.recover((record,meta)=>this.applyRecord(record,meta));
        this.sinceCheckpoint=this.storage.sequence-(this.storage.pointer?.sequence||0);
        const next=reconcileLocalReading(this.reading.snapshot(),{},id=>this.summary(id));
        if(JSON.stringify(next)!==JSON.stringify(this.reading.value)) await this.reading.update(v=>reconcileLocalReading(v,{},id=>this.summary(id)));
        this.lastDurableRevision=this.store.revision();
        const migrating=this.storage.migrationNeeded;
        if(migrating || !this.storage.pointer || this.sinceCheckpoint>=1000 || this.storage.pendingJournalBytes>=32*1024*1024) await this.checkpoint(true);
        if(migrating||this.storage.migrationNeedsFinalization)await this.storage.finalizeMigration();
        if(this.pendingClearPurge)await this.finishClearPurge();
        this.storageError='';
        return this.store;
      } catch(error) {
        this.storageError=error.message;
        // A failed acquisition must never close resources owned by another
        // lifecycle transition that has completed while this task was waiting.
        await ownedSearcher?.close().catch(()=>{});try{ownedStore?.close();}catch{}
        await ownedStorage?.close().catch(()=>{});
        if(this.searcher===ownedSearcher)this.searcher=null;
        if(this.store===ownedStore)this.store=null;
        if(this.storage===ownedStorage)this.storage=null;
        throw error;
      } finally { this.mountTask=null; }
    })();
    return this.mountTask;
  }
  archiveOptions(storage) {
    return {dataDir:path.dirname(storage.archivePath),contentDir:storage.objectsDir,compression:storage.profile||storage.compression||'7z'};
  }
  summary(id) {
    if(!this.store?.db || typeof id!=='string')return null;
    return this.store.db.prepare('SELECT id,collection,title,source_file AS sourceFile,conversation_key AS conversationKey FROM conversations WHERE id=?').get(id)||null;
  }
  async vectors() {
    await this.ensureLocal();
    await this.storage.ensureVectors?.();
    this.searcher.openDatabase();
  }
  progress(p){this.onProgress({operation:this.operation?.name||'search',...p});}
  client(args={},signal=this.lifetime.signal){return new ThreadShelfClient(args.serverUrl||this.settings.value.serverUrl,{signal});}
  async runOperation(name,fn) {
    if(this.operation)throw new Error('Another import, index or database operation is running. Wait for it to finish or cancel it.');
    const state={name,controller:new AbortController()};this.operation=state;
    try{return await fn(state.controller.signal);}
    finally{if(this.operation===state)this.operation=null;this.onProgress({operation:name,phase:'complete'});}
  }
  serialized(fn) {
    const task=this.mutationQueue.then(fn);
    this.mutationQueue=task.catch(()=>{});
    return task;
  }
  async quiesceSearches() {
    for(const controller of this.searchControllers)if(controller.mode!=='server')controller.abort();
    for(const controller of this.activityControllers)controller.abort();
    await Promise.allSettled([...this.localSearches,...this.activityTasks]);
  }
  async activityReport(args={},rebuild=false,operationSignal) {
    if(args.mode!==undefined&&args.mode!=='local')throw new Error('Activity is available for Local storage. Use Server Insights for a server collection.');
    const controller=new AbortController();this.activityControllers.add(controller);
    const signal=AbortSignal.any([controller.signal,this.lifetime.signal,...(operationSignal?[operationSignal]:[])]);
    let task;
    try {
      if(this.operation&&this.operation.name!=='activity.rebuild')throw new Error('A Local operation is running. Open Activity after it finishes.');
      await this.ensureLocal();signal.throwIfAborted();
      task=this.serialized(async()=>{
        signal.throwIfAborted();
        if(this.operation&&this.operation.name!=='activity.rebuild')throw new Error('A Local operation is running. Open Activity after it finishes.');
        this.activity??=new ActivityService({store:this.store,dataDir:this.dataDir,profile:()=>this.storage.profile,onProgress:p=>this.progress({...p,operation:'activity'})});
        return this.activity[rebuild?'rebuild':'query'](args,{signal});
      });
      this.activityTasks.add(task);return await task;
    } finally {this.activityControllers.delete(controller);if(task)this.activityTasks.delete(task);}
  }
  async closeActivity({discard=false}={}) {
    const activity=this.activity;this.activity=null;
    if(activity)await (discard?activity.discard():activity.close());
    else if(discard)await fs.rm(path.join(this.dataDir,'activity-v1'),{recursive:true,force:true});
  }
  async applyRecord(record,meta={}) {
    if(record?.kind==='archive') {
      const result=this.store.applyMutation(record.mutation);
      const mutation=record.mutation;
      const action=mutation.action||mutation.operation||mutation.args?.action||mutation.args?.operation;
      if(action==='clear')this.pendingClearPurge=true;
      // Reading state can be newer than the compressed archive snapshot.
      // Persist the redo watermark with its effects, so an old copy operation
      // cannot recreate a bookmark the user subsequently removed.
      if(mutation.kind==='manage'){
        const epoch=this.storage.epoch,sequence=meta.sequence;
        const mark=this.reading.value._localRecovery;
        if(!(mark?.epoch===epoch&&Number.isSafeInteger(sequence)&&mark.sequence>=sequence))
          await this.reading.update(v=>({...reconcileLocalReading(v,{
            ...result,clearLocal:action==='clear',copyBookmarks:record.copyBookmarks===true
          },id=>this.summary(id)),_localRecovery:{epoch,sequence}}));
      }
      return result;
    }
    if(record?.kind==='clearIndex') {
      // During redo we already own the storage queue; never reenter it here.
      this.storage.vectorsReady=true;this.searcher.clearIndex();return {ok:true};
    }
    throw new Error('Unsupported committed storage operation. Original data has been preserved.');
  }
  async commitMutation(mutation,{copyBookmarks=false}={}) {
    if(mutation.baseRevision!==this.store.revision())throw new Error('The local archive changed before this operation could be saved. Refresh and retry.');
    if(mutation.kind==='upsert'&&mutation.unchanged)return {status:'skipped',summary:mutation.summary};
    const result=await this.storage.commit({kind:'archive',mutation,copyBookmarks},(record,meta)=>this.applyRecord(record,meta));
    this.activity?.invalidate();
    this.lastDurableRevision=this.store.revision();this.sinceCheckpoint++;
    // Bound replay length without compressing the entire archive for each import.
    if(this.sinceCheckpoint>=1000 || this.storage.pendingJournalBytes>=32*1024*1024)await this.checkpoint(true);
    return result;
  }
  async checkpoint(compact=false,{reclaimLegacy=false}={}) {
    // Preserve an unopened compressed vector snapshot. Only initial migration
    // needs to adopt an existing, consistently copied legacy vector file.
    const legacyVectors=this.storage.migrationNeeded && await fs.stat(this.storage.vectorPath).catch(()=>null);
    const vectorDb=this.searcher?._db || (legacyVectors?this.storage.vectorPath:undefined);
    const options={archiveDb:this.store.db,vectorDb,reading:localReadingOnly(this.reading.snapshot()),reclaimLegacy};
    await (compact?this.storage.compact(options):this.storage.checkpoint(options));
    this.sinceCheckpoint=0;this.lastDurableRevision=this.store.revision();
  }
  async finishClearPurge(){
    await this.closeActivity({discard:true});
    this.storage.vectorsReady=true;this.searcher.clearIndex();
    this.store.db.exec('VACUUM');
    await this.checkpoint(true,{reclaimLegacy:true});this.pendingClearPurge=false;
  }
  async localStatus() {
    if(this.restoreTask||this.mountTask)try{await this.ensureLocal();}catch{/* Settings and Server status remain available when Local recovery fails. */}
    if(this.searcher)return this.searcher.status();
    let state={};
    try{state=JSON.parse(await fs.readFile(path.join(this.dataDir,'search','semantic.json'),'utf8'));}catch{}
    return {...state,ready:Boolean(state.modelReady),busy:null,cacheDir:path.join(this.dataDir,'search','models'),
      indexedPassages:state.indexSummary?.passages||0,indexedChunks:state.indexSummary?.chunks||0,
      needsIndexing:!state.indexSummary,indexedAt:state.indexSummary?.updated||null,unmounted:true,
      modes:['keyword','exact','fuzzy','semantic','hybrid','ollama']};
  }
  handle(action,args={}) {
    if(action==='shutdown')return this.shutdown();
    if(this.closing)return Promise.reject(new Error('The application is closing. New work cannot be started.'));
    const task=this.dispatch(action,args);this.inFlight.add(task);
    return task.finally(()=>this.inFlight.delete(task));
  }
  shutdown() {
    if(this.shutdownTask)return this.shutdownTask;
    this.closing=true;this.lifetime.abort();this.operation?.controller.abort();
    for(const controller of this.resourceLoads.values())controller.abort();
    for(const controller of this.searchControllers)controller.abort();
    for(const controller of this.activityControllers)controller.abort();
    for(const controller of this.insightsControllers)controller.abort();
    this.shutdownTask=(async()=>{
      await Promise.allSettled([...this.inFlight]);await this.mutationQueue;
      this.serverSearch.clear();this.resourceContexts.clear();await this.resourceCache?.close();
      await Promise.allSettled([this.settings.queue,this.interfaceSettings.queue,this.appearanceSettings.queue,this.layoutSettings.queue,this.readerAppearanceSettings.queue,this.extendedSettings.queue,this.remoteImageSettings.queue,this.resourceSettings.queue,this.reading.queue]);
      // Direct ArchiveStore callers (test/embedding integrations) also receive a
      // durable close. Normal GUI mutations have already been committed.
      try{
        if(this.store&&!this.storage.poisoned&&this.store.revision()!==this.lastDurableRevision)await this.checkpoint(false);
      }finally{try{try{await this.closeActivity();}finally{await this.searcher?.close();}}finally{
        try{this.store?.close();}finally{
          await this.pendingRestore?.dispose?.();await this.storage?.close();
        }
      }}
      return {ok:true};
    })();return this.shutdownTask;
  }
  async dispatch(action,args={}) {
    if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Invalid request.');
    if(['collections','files','thread','search'].includes(action)&&args.mode!==undefined&&!['local','server'].includes(args.mode))throw new Error('Choose Local or ThreadShelf Server mode.');
    if(RESOURCE_ACTIONS.includes(action))return this.resourceAction(action,args);
    switch(action) {
      case 'bootstrap': {
        const searchStatus=await this.localStatus();
        return {settings:{...this.settings.snapshot(),...this.interfaceSettings.snapshot(),...this.appearanceSettings.snapshot(),...this.layoutSettings.snapshot(),...this.readerAppearanceSettings.snapshot(),...this.extendedSettings.snapshot(),...this.remoteImageSettings.snapshot()},reading:this.reading.snapshot(),dataDir:this.dataDir,version:'1.3.0',resources:await this.resourceStatus(),searchStatus,notice:[this.settings.notice,this.interfaceSettings.notice,this.appearanceSettings.notice,this.layoutSettings.notice,this.readerAppearanceSettings.notice,this.extendedSettings.notice,this.remoteImageSettings.notice,this.reading.notice,this.storageError].filter(Boolean).join(' ')};
      }
      case 'settings.save': {
        const values=validateSettings(args.values),core=validateCoreSettings(values);
        const ui=Object.fromEntries(Object.entries(values).filter(([key])=>Object.hasOwn(INTERFACE_DEFAULTS,key)));
        const appearance=Object.fromEntries(Object.entries(values).filter(([key])=>Object.hasOwn(APPEARANCE_DEFAULTS,key)));
        const layout=Object.fromEntries(Object.entries(values).filter(([key])=>Object.hasOwn(LAYOUT_DEFAULTS,key)));
        const readerAppearance=Object.fromEntries(Object.entries(values).filter(([key])=>Object.hasOwn(READER_APPEARANCE_DEFAULTS,key)));
        const extended=Object.fromEntries(Object.entries(values).filter(([key])=>Object.hasOwn(EXTENDED_DEFAULTS,key)));
        const remoteImages=Object.fromEntries(Object.entries(values).filter(([key])=>Object.hasOwn(REMOTE_IMAGE_DEFAULTS,key)));
        if(Object.keys(extended).length)await this.extendedSettings.update(s=>mergeExtendedPreferences(s,extended));
        if(Object.keys(core).length)await this.settings.update(s=>({...s,...core}));
        if(Object.keys(ui).length)await this.interfaceSettings.update(s=>({...s,...ui}));
        if(Object.keys(appearance).length)await this.appearanceSettings.update(s=>({...s,...appearance}));
        if(Object.keys(layout).length)await this.layoutSettings.update(s=>({...s,...layout}));
        if(Object.keys(readerAppearance).length)await this.readerAppearanceSettings.update(s=>({...s,...readerAppearance}));
        if(Object.keys(remoteImages).length)await this.remoteImageSettings.update(s=>({...s,...remoteImages}));
        return {...this.settings.snapshot(),...this.interfaceSettings.snapshot(),...this.appearanceSettings.snapshot(),...this.layoutSettings.snapshot(),...this.readerAppearanceSettings.snapshot(),...this.extendedSettings.snapshot(),...this.remoteImageSettings.snapshot()};
      }
      case 'collections':
        if(args.mode==='server')return {collections:await this.client(args).collections()};
        await this.ensureLocal();return {collections:this.store.collections()};
      case 'files': {
        if(args.mode==='server')return this.client(args).files(args);
        if(!String(args.query??args.q??'').trim()){await this.ensureLocal();return this.store.files(args);}
        const controller=new AbortController();controller.mode='local';this.searchControllers.add(controller);
        const signal=AbortSignal.any([controller.signal,this.lifetime.signal]);let task;
        try{await this.ensureLocal();signal.throwIfAborted();
          if(this.operation?.name.startsWith('manager.')||this.operation?.name==='storage.convert')throw new Error('The Local database is being managed. Try the search after the operation finishes.');
          task=this.searcher.files({...args,signal});this.localSearches.add(task);return await task;
        }finally{this.searchControllers.delete(controller);if(task)this.localSearches.delete(task);}
      }
      case 'thread': {
        let thread;
        if(args.mode==='server')thread=await this.client(args).thread(args);
        else {await this.ensureLocal();thread=this.store.thread({id:args.id||args.conversationId});}
        this.resourceContexts.register(thread,args,this.settings.value.serverUrl);
        return thread;
      }
      case 'search': {
        if(typeof args.q!=='string'||args.q.length>8192)throw new Error('Search text must contain at most 8192 characters.');
        const controller=new AbortController();controller.mode=args.mode||'local';this.searchControllers.add(controller);
        const signal=AbortSignal.any([controller.signal,this.lifetime.signal]);
        let task;
        try {
          if(args.mode==='server')return args.page!==undefined||args.pageSize!==undefined||args.searchSession!==undefined?await this.serverSearch.search(this.client(args,signal),args):await this.client(args,signal).search(args);
          if((this.operation?.name.startsWith('manager.')||this.operation?.name==='storage.convert'))throw new Error('The Local database is being managed. Try the search after the operation finishes.');
          await this.ensureLocal();signal.throwIfAborted();const opts={...args,mode:args.searchMode||'keyword',signal};
          if(['semantic','hybrid','ollama'].includes(opts.mode))await this.vectors();
          signal.throwIfAborted();
          if((this.operation?.name.startsWith('manager.')||this.operation?.name==='storage.convert'))throw new Error('The Local database is being managed. Try the search after the operation finishes.');
          task=opts.mode==='ollama'?this.searcher.searchOllama({...opts,url:this.settings.value.ollamaUrl,model:this.settings.value.ollamaModel}):this.searcher.search(opts);
          this.localSearches.add(task);const result=await task;
          if(opts.mode==='ollama')await this.serialized(()=>this.checkpoint(true));
          return result;
        } finally {this.searchControllers.delete(controller);if(task)this.localSearches.delete(task);}
      }
      case 'server.collections':return {collections:await this.client(args).collections()};
      case 'server.insights': {
        const controller=new AbortController();this.insightsControllers.add(controller);
        try{return await this.client(args,AbortSignal.any([controller.signal,this.lifetime.signal])).insights(args.collection||'all');}
        finally{this.insightsControllers.delete(controller);}
      }
      case 'server.insights.cancel':for(const controller of this.insightsControllers)controller.abort();return {ok:true};
      case 'activity.query':return this.activityReport(args);
      case 'activity.rebuild':return this.runOperation('activity.rebuild',signal=>this.activityReport(args,true,signal));
      case 'activity.csv':return {csv:activityCSV(await this.activityReport(args)),filename:'ThreadShelf-Activity-'+new Date().toISOString().slice(0,10)+'.csv'};
      case 'activity.cancel':for(const controller of this.activityControllers)controller.abort();return {ok:true};
      case 'server.import':return this.runOperation('server.import',signal=>this.importServer(args,signal));
      case 'import.paths':return this.runOperation('import.paths',signal=>this.importLocal(args,signal));
      case 'operation.cancel':
        if(args.scope!==undefined&&!['search','operation'].includes(args.scope))throw new Error('Invalid cancellation scope.');
        if(args.scope!=='search')this.operation?.controller.abort();
        if(args.scope!=='operation')for(const controller of this.searchControllers)controller.abort();
        return {ok:true};
      case 'reading.save':return this.saveReading(args);
      case 'semantic.setup':return this.runOperation('semantic.setup',async signal=>{await this.ensureLocal();await this.quiesceSearches();signal.throwIfAborted();await this.searcher.setupSemantic({signal});return {status:await this.searcher.status()};});
      case 'semantic.index':return this.runOperation('semantic.index',async signal=>{await this.vectors();await this.quiesceSearches();await this.searcher.indexSemantic({signal});await this.serialized(()=>this.checkpoint(true));return {status:await this.searcher.status()};});
      case 'search.prepare':return this.runOperation('search.prepare',async signal=>{await this.ensureLocal();await this.quiesceSearches();return {status:await this.searcher.prepareText({signal})};});
      case 'search.status':return this.localStatus();
      case 'ollama.models':await this.vectors();return this.searcher.ollamaModels({url:args.url||this.settings.value.ollamaUrl,signal:this.lifetime.signal});
      case 'ollama.delete':return this.runOperation('ollama.delete',async signal=>{await this.vectors();await this.quiesceSearches();return this.searcher.ollamaDelete({url:args.url||this.settings.value.ollamaUrl,model:args.model,signal});});
      case 'ollama.test':return this.runOperation('ollama.test',async signal=>{await this.ensureLocal();return this.searcher.ollamaTest({url:args.url||this.settings.value.ollamaUrl,model:args.model||this.settings.value.ollamaModel,signal});});
      case 'ollama.start':return this.runOperation('ollama.start',async signal=>{await this.ensureLocal();return this.searcher.ollamaStart({url:args.url||this.settings.value.ollamaUrl,signal});});
      case 'ollama.pull':return this.runOperation('ollama.pull',async signal=>{await this.ensureLocal();return this.searcher.ollamaPull({url:args.url||this.settings.value.ollamaUrl,model:args.model,signal});});
      case 'storage.convert':return this.runOperation('storage.convert',signal=>this.convertStorage(args,signal));
      case 'manager.status':return this.managerStatus();
      case 'manager.files':await this.ensureLocal();return this.store.files({...args,q:args.query??args.q??''});
      case 'manager.preview':await this.ensureLocal();return this.store.previewMutation(args);
      case 'manager.mutate':return this.runOperation('manager.mutate',signal=>this.managerMutate(args,signal));
      case 'manager.maintenance':return this.runOperation('manager.maintenance',signal=>this.maintenance(args,signal));
      case 'manager.backup':return this.runOperation('manager.backup',signal=>this.backup(args,signal));
      case 'manager.restore.preview':return this.runOperation('manager.restore.preview',signal=>this.restorePreview(args,signal));
      case 'manager.restore':return this.runOperation('manager.restore',signal=>this.restore(args,signal));
      default:throw new Error('Unknown application action.');
    }
  }
  async saveReading(args) {
    const id=localIdFor(args.key,args.position||args.bookmark);
    if(id&&this.operation?.name==='manager.restore')return this.reading.snapshot();
    if(id&&(args.position||args.bookmark)) {
      await this.ensureLocal();
      // Ignore a late reader callback after deletion rather than resurrecting it.
      const row=this.summary(id);if(!row)return this.reading.snapshot();
      const ref={mode:'local',serverUrl:'',id:row.id,collection:row.collection,sourceFile:row.sourceFile,conversationKey:row.conversationKey};
      args={...args,key:localReadingKey(id),title:row.title,...(args.position?{position:{...args.position,title:row.title,ref}}:{}),...(args.bookmark?{bookmark:{...args.bookmark,title:row.title,ref}}:{})};
    }
    return this.reading.update(v=>applyReading(v,args));
  }
  async convertStorage({profile},signal) {
    if(!['7z','zip6'].includes(profile))throw new Error('Choose High compression (7z) or Faster compression (ZIP level 6).');
    await this.ensureLocal();await this.quiesceSearches();signal.throwIfAborted();
    return this.serialized(async()=>{
      if(this.storage.profile===profile)return {ok:true,unchanged:true,storage:await this.storage.status()};
      const transition=(async()=>{
        try {
          signal.throwIfAborted();
          await this.pendingRestore?.dispose?.();this.pendingRestore=null;
          await this.closeActivity({discard:true});
          await this.searcher?.close();this.store?.close();this.searcher=null;this.store=null;
          const result=await this.storage.convert(profile,{signal,reading:localReadingOnly(this.reading.snapshot())});
          this.store=new ArchiveStore(this.archiveOptions(this.storage)).init();
          this.searcher=new SearchService({store:this.store,dataDir:this.dataDir,databasePath:this.storage.vectorPath,objectsDir:this.storage.objectsDir,tempRoot:path.join(this.storage.workingDir,'search-work'),compressionProfile:()=>this.storage.profile,lazy:true,onProgress:p=>this.progress(p)});
          this.lastDurableRevision=this.store.revision();this.sinceCheckpoint=0;this.storageError='';
          return {...result,storage:await this.storage.status()};
        } catch(error) {
          // Publication is authoritative even when adoption/cleanup fails. A
          // fresh mount resolves it and replays the surviving committed journal.
          await this.searcher?.close().catch(()=>{});try{this.store?.close();}catch{}
          await this.storage?.close().catch(()=>{});
          this.searcher=null;this.store=null;this.storage=null;
          this.storageError=error.name==='AbortError'?'':error.message;
          throw error;
        }
      })();
      this.restoreTask=transition;
      try{return await transition;}finally{if(this.restoreTask===transition)this.restoreTask=null;}
    });
  }
  async managerStatus() {
    for(;;){
      try{await this.ensureLocal();}catch(error){return {recoveryMode:true,error:error.message,collections:[],storage:{health:'recovery-required'},searchStatus:await this.localStatus()};}
      const owner=this.storage,store=this.store,searcher=this.searcher;
      const current=()=>!this.restoreTask&&!this.mountTask&&this.storage===owner&&this.store===store&&this.searcher===searcher;
      try{
        const storage=await owner.status();
        const cache=store.cacheStats?.();if(cache){storage.cacheBytes=cache.ramBytes;storage.cacheBudgetBytes=cache.ramBudgetBytes;storage.cache=cache;}
        if(!current())continue;
        const searchStatus=await searcher.status();
        if(!current())continue;
        return {revision:store.revision(),collections:store.collections({includeEmpty:true}),storage,searchStatus};
      }catch(error){if(current())throw error;}
      // A restore started during asynchronous size/status reads. Retry against
      // its final generation instead of returning mixed or closed resources.
    }
  }
  async managerMutate(args,signal) {
    await this.ensureLocal();await this.quiesceSearches();signal.throwIfAborted();
    return this.serialized(async()=>{
      signal.throwIfAborted();
      const selectedId=this.settings.value.localCollection==='all'?null:this.store.collections({includeEmpty:true}).find(c=>c.name===this.settings.value.localCollection)?.id;
      const mutation=this.store.prepareMutation({...args,action:args.operation||args.action});
      const result=await this.commitMutation(mutation,{copyBookmarks:args.copyBookmarks===true});
      const operation=args.operation||args.action;
      if(operation==='clear') {
        await this.finishClearPurge();
      }
      const localCollection=selectedId?this.store.collections({includeEmpty:true}).find(c=>c.id===selectedId)?.name||'all':'all';
      if(this.settings.value.localCollection!==localCollection)await this.settings.update(s=>({...s,localCollection}));
      return {...result,localCollection,reading:this.reading.snapshot(),revision:this.store.revision()};
    });
  }
  async maintenance({operation},signal) {
    await this.ensureLocal();await this.quiesceSearches();signal.throwIfAborted();
    return this.serialized(async()=>{
      let result;
      if(operation==='verify') {
        const checks=this.store.db.prepare('PRAGMA integrity_check').all();
        const foreign=this.store.db.prepare('PRAGMA foreign_key_check').all();
        if(checks.some(row=>Object.values(row)[0]!=='ok')||foreign.length)throw new Error('Local database integrity check failed. Preserve the files and restore a verified backup.');
        await this.store.verifyContent?.();
        result=await this.storage.verify();
      } else if(operation==='clearCache') {this.store.clearCache?.();result={ok:true};}
      else if(operation==='compact') {this.store.db.exec('VACUUM');await this.checkpoint(true);result={ok:true};}
      else if(operation==='clearIndex') {
        await this.vectors();result=await this.storage.commit({kind:'clearIndex'},record=>this.applyRecord(record));await this.checkpoint(true);
      } else if(operation==='cleanup') result=await this.storage.cleanTemporary();
      else throw new Error('Unknown database maintenance operation.');
      return {...result,storage:await this.storage.status(),status:await this.searcher.status()};
    });
  }
  async backup({path:destination,includeIndex=false},signal) {
    if(typeof destination!=='string'||!path.isAbsolute(destination))throw new Error('Choose an absolute backup destination.');
    await this.ensureLocal();await this.quiesceSearches();signal.throwIfAborted();
    return this.serialized(async()=>{
      if(includeIndex)await this.vectors();
      const result=await this.storage.backup(destination,{archiveDb:this.store.db,vectorDb:includeIndex?this.searcher.db:undefined,reading:localReadingOnly(this.reading.snapshot()),includeIndex,signal});
      return {...result,saved:true,path:destination};
    });
  }
  async restorePreview({path:filename},signal) {
    if(typeof filename!=='string'||!path.isAbsolute(filename))throw new Error('Choose a backup file.');
    if(!this.storage?.recoveryMode)try{await this.ensureLocal();}catch(error){
      // The recovery session still takes an exclusive profile lease. It never
      // trusts or replaces damaged bytes merely to preview an external backup.
      await this.storage?.close().catch(()=>{});
      this.storage=await new CompressedStorage({dataDir:this.dataDir,onProgress:p=>this.progress(p),...this.storageOptions}).init({recovery:true});
      this.storageError=error.message;
    }
    signal.throwIfAborted();
    await this.pendingRestore?.dispose?.();
    this.pendingRestore=await this.storage.prepareRestore(filename);
    this.pendingRestore.sourcePath=filename;
    let preview;
    try {
      this.pendingRestore.reading=this.validateBackupReading(this.pendingRestore.reading);
      preview=new ArchiveStore({dataDir:path.dirname(this.pendingRestore.archivePath),contentDir:this.pendingRestore.objectsDir||this.storage.objectsDir,compression:this.pendingRestore.profile||this.storage.profile}).init();
      validateReading(replaceLocalReading(this.reading.snapshot(),this.pendingRestore.reading,id=>preview.db.prepare('SELECT id,collection,title,source_file AS sourceFile,conversation_key AS conversationKey FROM conversations WHERE id=?').get(id)));
      const collections=preview.collections({includeEmpty:true});
      return {path:filename,name:path.basename(filename),info:{collections:collections.length,conversations:collections.reduce((sum,c)=>sum+c.count,0),collectionNames:collections.map(c=>c.name)}};
    }catch(error){await this.pendingRestore.dispose?.();this.pendingRestore=null;throw error;}
    finally{preview?.close();}
  }
  async restore({path:filename},signal) {
    if(!this.storage?.recoveryMode)await this.ensureLocal();await this.quiesceSearches();signal.throwIfAborted();
    return this.serialized(async()=>{
      if(!this.pendingRestore||this.pendingRestore.sourcePath!==filename)throw new Error('Select and validate a backup before restoring it.');
      const prepared=this.pendingRestore;this.pendingRestore=null;
      const transition=(async()=>{
      try {
        // Hold JsonState's queue across publication: Server reading can be newer
        // than the preview, and later saves must wait for the consistent result.
        await this.reading.update(async current=>{
          validateReading(replaceLocalReading(current,prepared.reading,()=>null));
          await this.closeActivity({discard:true});
          await this.searcher?.close();this.searcher?.textIndex.discard();this.store?.close();this.searcher=null;this.store=null;
          await this.storage.installRestore(prepared);
          this.store=new ArchiveStore(this.archiveOptions(this.storage)).init();
          this.searcher=new SearchService({store:this.store,dataDir:this.dataDir,databasePath:this.storage.vectorPath,objectsDir:this.storage.objectsDir,tempRoot:path.join(this.storage.workingDir,'search-work'),compressionProfile:()=>this.storage.profile,lazy:true,onProgress:p=>this.progress(p)});
          // A profile's prior index status does not describe a restored archive.
          delete this.searcher.state.indexSummary;this.searcher._saveState();
          return {...replaceLocalReading(current,this.storage.readingSnapshot,id=>this.summary(id)),_localRestoreToken:this.storage.restoreReadingToken};
        });
        this.lastDurableRevision=this.store.revision();this.sinceCheckpoint=0;
        this.storageError='';this.readingFilesMissing=false;
        await this.settings.update(s=>({...s,localCollection:'all'}));
        return {ok:true,localCollection:'all',reading:this.reading.snapshot()};
      } catch(error) {
        // Installation may fail before or after its durable publication. Release
        // this session so the next open can recover whichever state was committed.
        await this.searcher?.close().catch(()=>{});try{this.store?.close();}catch{}
        await this.storage?.close().catch(()=>{});
        this.searcher=null;this.store=null;this.storage=null;this.storageError=error.message;
        throw error;
      } finally {await prepared.dispose?.();}
      })();
      this.restoreTask=transition;
      try{return await transition;}finally{if(this.restoreTask===transition)this.restoreTask=null;}
    });
  }
  validateBackupReading(reading){
    if(reading==null)return {positions:{},bookmarks:[],recent:[]};
    if(Object.hasOwn(reading,'schemaVersion')){
      if(reading.schemaVersion!==1||!reading.data)throw new Error('Unsupported saved reading format in this backup.');
      reading=reading.data;
    }
    validateReading(reading);
    const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
    const validKey=key=>typeof key==='string'&&key.length<=32768&&!key.includes('\0')&&!['__proto__','constructor','prototype'].includes(key);
    const anchor=value=>object(value)&&Number.isSafeInteger(value.turnIndex)&&value.turnIndex>=0&&['user','assistant','ai','thinking','tool','system'].includes(value.role);
    if(Object.entries(reading.positions).some(([key,value])=>!validKey(key)||!anchor(value)||!Number.isFinite(value.offset)||Math.abs(value.offset)>1)
      ||reading.bookmarks.some(value=>!anchor(value)||!validKey(value.key))
      ||reading.recent.some(value=>typeof value==='string'?!validKey(value):!object(value)||!validKey(value.key)))
      throw new Error('The backup has invalid saved reading entries. The current Local archive was preserved.');
    return reading;
  }
  async importLocal({paths,collection},signal) {
    if(!Array.isArray(paths)||!paths.length||paths.length>10000||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw new Error('Select files or a folder using Import.');
    collection=String(collection||'Imported').trim();if(!collection||collection.length>160||collection==='all'||collection.includes('\0'))throw new Error('Choose a collection name up to 160 characters (other than “all”).');
    await this.ensureLocal();const result={imported:0,updated:0,skipped:0,errors:[],cancelled:false};
    try {
      for await(const conversation of importPaths(paths,{signal,onProgress:p=>this.progress(p)})) {
        signal.throwIfAborted();
        if(conversation.error){result.errors.push({sourceFile:conversation.sourceFile,error:String(conversation.error)});continue;}
        try {
          const saved=await this.serialized(()=>this.commitMutation(this.store.prepareUpsert({...conversation,collection})));
          result[saved.status]=(result[saved.status]||0)+1;
        }catch(error){result.errors.push({sourceFile:conversation.sourceFile,error:error.message});if(this.storage.poisoned)throw error;}
        this.progress({phase:'importing',current:result.imported+result.updated+result.skipped,message:conversation.title||''});
      }
    }catch(error){if(signal.aborted||error.name==='AbortError')result.cancelled=true;else result.errors.push({error:error.message});}
    return result;
  }
  async importServer({serverUrl,collections},signal) {
    if(!Array.isArray(collections)||!collections.length||collections.length>1000||collections.some(c=>typeof c!=='string'||!c||c==='all'))throw new Error('Select at least one non-empty collection.');
    await this.ensureLocal();const client=new ThreadShelfClient(serverUrl||this.settings.value.serverUrl,{signal});
    const result={imported:0,updated:0,skipped:0,errors:[],cancelled:false};
    try {
      const available=await client.collections(),names=new Set(available.map(c=>c.name)),selected=[...new Set(collections)];
      if(selected.some(c=>!names.has(c)))throw new Error('A selected collection is empty or no longer available. Refresh the collection list.');
      // Process one selected collection at a time; server source remains read-only.
      for(const collection of selected) {
        const summaries=(await client.allFiles(collection)).filter(f=>f.turnCount>0);
        for(let i=0;i<summaries.length;i++) {
          signal.throwIfAborted();const item=summaries[i];this.progress({phase:'copying',current:i,total:summaries.length,message:item.title});
          try {
            const thread=await client.thread(item);signal.throwIfAborted();
            const saved=await this.serialized(()=>this.commitMutation(this.store.prepareUpsert({...thread,provider:thread.provider||'unknown',raw:{serverUrl:normalizeServerUrl(client.url),summary:item,thread},sourceIdentity:thread.sourceIdentity})));
            result[saved.status]=(result[saved.status]||0)+1;
          }catch(error){if(signal.aborted||this.storage.poisoned)throw error;result.errors.push({sourceFile:item.sourceFile,collection:item.collection,error:error.message});}
        }
      }
      this.progress({phase:'copied',current:result.imported+result.updated+result.skipped});
    }catch(error){if(signal.aborted||error.name==='AbortError')result.cancelled=true;else result.errors.push({error:error.message});}
    return result;
  }
}
