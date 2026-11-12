'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');
const {SettingsStore,PROVIDERS,normalize}=require('./settings.cjs');const {AudioCache,SessionAudioCache,digest}=require('./cache.cjs');const {CredentialStore}=require('./credentials.cjs');const {synthesizeRemote,discover,concatWav}=require('./providers.cjs');const {abortError,MAX_AUDIO}=require('./network.cjs');
const ACTIONS=new Set(['tts.settings.get','tts.settings.save','tts.synthesize','tts.preview','tts.availability','tts.cancel','tts.playback','tts.cache.list','tts.cache.preview','tts.cache.delete','tts.cache.pin','tts.providers.discover','tts.credentials.status','tts.credentials.set','tts.credentials.unlock','tts.credentials.forget']);
const {CLIP_MIME,encodeClips,responseAudio}=require('./clips.cjs');
const {RecordingResolver,messageFingerprint,contentKey,synthesisKey}=require('./recordings.cjs');
const LOCAL=['pocket','kokoro'];
function textField(value,name,max,required=true){if(typeof value!=='string'||value.length>max||value.includes('\0')||required&&!value.trim())throw Error(`Invalid TTS ${name}.`);return value;}
function speechText(value,required=true){const text=textField(value,'text',100000,required).replace(/\r\n?/g,'\n').normalize('NFC').trim();if(Buffer.byteLength(text)>256*1024)throw Error('This message is too large to synthesize in one session.');return text;}
function recordingInfo(entry){return {provider:entry.provider,model:entry.model,voice:entry.voice};}
function splitSpeech(text,max=1800){
 const chunks=[];let rest=text;
 while(rest.length>max){let cut=rest.lastIndexOf('\n\n',max);if(cut<max/3){const matches=[...rest.slice(0,max).matchAll(/[.!?。！？](?:\s+|$)/gu)];cut=matches.at(-1)?.index??-1;if(cut>=0)cut+=matches.at(-1)[0].length;}
  if(cut<max/3)cut=rest.lastIndexOf(' ',max);if(cut<max/3){cut=max;if(/[\uD800-\uDBFF]/.test(rest[cut-1]))cut--;}
  const part=rest.slice(0,cut).trim();if(part)chunks.push(part);rest=rest.slice(cut).trimStart();
 }
 if(rest.trim())chunks.push(rest.trim());return chunks;
}
function streamingMode(settings){if(!settings.streamingEnabled)return 'buffered';if(LOCAL.includes(settings.provider))return 'native-pcm';if(settings.provider==='openai-realtime')return 'verified-sections';return settings.responseFormat==='pcm'||settings.provider==='elevenlabs'&&settings.responseFormat==='wav'?'native-pcm':'sections';}
function validateArgs(action,args){if(!ACTIONS.has(action))throw Error('Unknown TTS action.');if(!args||typeof args!=='object'||Array.isArray(args)||Object.getPrototypeOf(args)!==Object.prototype)throw Error('Invalid TTS request.');let size;try{size=Buffer.byteLength(JSON.stringify(args));}catch{throw Error('Invalid TTS request.');}if(size>512*1024)throw Error('The TTS request is too large.');}
function createTtsService({profileDir,assetsDir,onEvent=()=>{},dependencies={}}){
 if(!path.isAbsolute(profileDir)||!path.isAbsolute(assetsDir))throw Error('TTS requires absolute application-controlled paths.');
 const settingsStore=new SettingsStore(profileDir),sessionCache=new SessionAudioCache(),cache=new AudioCache(profileDir,{sessionCache}),credentials=new CredentialStore(profileDir),recordings=new RecordingResolver();const jobs=new Set();let current=null,delivered=null,activeKey='',activeRequestId='',disposed=false,generation=0;
 let availabilityRevision=0,availabilitySettings=null,expiryTimer=null;
 const sessionReady=Promise.all([settingsStore.get(),cache.ready]).then(([settings])=>{availabilitySettings=settings;sessionCache.resize(settings.sessionCacheMaxMiB*1024**2);scheduleExpiry();});
 const emit=value=>{try{onEvent(value);}catch{}};
 function scheduleExpiry(){
  clearTimeout(expiryTimer);expiryTimer=null;const settings=availabilitySettings;if(disposed||!settings?.enabled||!settings.cacheEnabled||!settings.cacheMaxAgeDays)return;
  const now=Date.now();let next=Infinity;for(const entry of cache.entries.values()){const deadline=Date.parse(entry.createdAt)+settings.cacheMaxAgeDays*86400000;if(entry.complete===true&&!entry.pinned&&deadline>now)next=Math.min(next,deadline);}
  if(Number.isFinite(next)){expiryTimer=setTimeout(()=>{expiryTimer=null;if(Date.now()<next){scheduleExpiry();return;}availabilityChanged();},Math.min(2147483647,Math.max(1,next-now)));expiryTimer.unref?.();}
 }
 function availabilityChanged(){if(disposed)return;availabilityRevision++;emit({state:'availability-changed',revision:availabilityRevision});scheduleExpiry();}
 // One read-only policy drives both indicators and playback.
 const selectRecording=(settings,identity,options={})=>recordings.select({settings,identity,cache,sessionCache,...options});
 async function availability(args){
  if(!Array.isArray(args.messages)||args.messages.length>64)throw Error('Check at most 64 speech recordings at a time.');
  const ids=new Set(),messages=args.messages.map(message=>{if(!message||typeof message!=='object'||Array.isArray(message))throw Error('Invalid speech availability message.');const id=textField(message.id,'availability identity',200);if(ids.has(id))throw Error('Duplicate speech availability identity.');ids.add(id);if(message.thinking!==undefined&&typeof message.thinking!=='boolean')throw Error('Invalid thinking bubble flag.');return {id,sourceId:textField(message.sourceId,'conversation identity',8192),messageId:textField(message.messageId,'message identity',2048),thinking:!!message.thinking,text:speechText(message.text,false),messageFingerprint:messageFingerprint(message.messageFingerprint)};});
  const revision=availabilityRevision,settings=await settingsStore.get(),items=[],checked=new Map();
  for(const message of messages){if(disposed)throw Error('Text-to-Speech has shut down.');let available=false;if(settings.enabled&&(message.text||message.messageFingerprint)&&(!message.thinking||settings.includeThinking)){const key=synthesisKey(settings,message)+'\0'+(message.messageFingerprint?.sha256||'');if(!checked.has(key)){checked.set(key,!!await selectRecording(settings,message));}available=checked.get(key);}items.push({id:message.id,available:!!available});}
  if(disposed)throw Error('Text-to-Speech has shut down.');return {revision,items};
 }
 async function getSettings(){const settings=await settingsStore.get(),credentialStatus={};for(const p of PROVIDERS){if(LOCAL.includes(p))continue;credentialStatus[p]=(await credentials.status(p,settings.providerProfiles[p].endpoint)).available;}return {...settings,credentialStatus};}
 function cancel(requestId){if(requestId&&(current?.id||activeRequestId)!==requestId)return {cancelled:false};generation++;if(current)current.controller.abort();current=null;if(activeKey)cache.active.delete(activeKey);activeKey='';activeRequestId='';return {cancelled:true};}
 async function credentialArgs(args){const settings=await settingsStore.get();const provider=args.provider||settings.provider;if(!PROVIDERS.includes(provider)||LOCAL.includes(provider))throw Error('Choose an API provider.');return {...args,provider,endpoint:args.endpoint||settings.providerProfiles[provider].endpoint};}
 async function status(){const settings=await settingsStore.get(),providers={};for(const p of PROVIDERS)if(!LOCAL.includes(p))providers[p]=await credentials.status(p,settings.providerProfiles[p].endpoint);return {providers};}
 async function synthesize(args,preview=false){
  const saved=await settingsStore.get(),settings=preview?normalize(args.settings||{},saved):saved,purpose=preview?'preview':'conversation';
  if(!preview&&!settings.enabled)throw Error('Text-to-Speech is disabled.');if(args.thinking!==undefined&&typeof args.thinking!=='boolean')throw Error('Invalid thinking bubble flag.');if(!preview&&args.thinking&&!settings.includeThinking)throw Error('Speech for thinking bubbles is disabled.');
  if(preview)settings.cacheEnabled=false;
  const requestId=textField(args.requestId,'request identity',200),sourceId=preview?'tts-preview':textField(args.sourceId,'conversation identity',8192),messageId=preview?'tts-preview':textField(args.messageId,'message identity',2048);
  const fullFingerprint=messageFingerprint(args.messageFingerprint),text=speechText(args.text,preview||!fullFingerprint),identity={sourceId,messageId,text,messageFingerprint:fullFingerprint};
  if(preview&&args.apiKey!==undefined)textField(args.apiKey,'API key',8192,false);
  cancel();delivered=null;const ownGeneration=generation,controller=new AbortController();current={id:requestId,controller,thinking:!!args.thinking,purpose};const ensure=()=>{if(disposed||controller.signal.aborted||ownGeneration!==generation)throw abortError();};
  // Playback-only choices (streaming, volume and speed) do not invalidate audio.
  const exactKey=preview?null:synthesisKey(settings,identity);let key=exactKey;
  if(key){activeKey=key;activeRequestId=requestId;cache.active.add(key);}let workDir='',clipCount=0,streamBytes=0;const mode=streamingMode(settings);
  const progress=value=>{ensure();emit({requestId,purpose,streamingMode:mode,complete:false,...value});};
  function publishAudio(clip,context={}){
   ensure();if(!settings.streamingEnabled)return;
   if(!clip||!Buffer.isBuffer(clip.bytes)||!clip.bytes.length||!['audio/wav','audio/mpeg','audio/ogg','audio/mp4'].includes(clip.mime))throw Error('The speech engine returned an invalid streaming audio chunk.');
   streamBytes+=clip.bytes.length;if(streamBytes>MAX_AUDIO+512*1024)throw Error('This reading exceeds the streaming audio limit.');
   progress({state:'audio',clipIndex:clipCount++,audioBase64:clip.bytes.toString('base64'),mime:clip.mime,...context});
  }
  function publishCompleted(bytes,mime,context={}){const response=responseAudio(bytes,mime);for(const clip of response.audioClips||[response])publishAudio({bytes:Buffer.from(clip.audioBase64,'base64'),mime:clip.mime},context);return response;}
  function protectKey(next){if(activeKey)cache.active.delete(activeKey);key=next;activeKey=next;activeRequestId=requestId;cache.active.add(next);}
  function freshStorageKey(){return digest(exactKey+'\0recording\0'+crypto.randomBytes(16).toString('hex'));}
  const pinnedStorageKey=value=>cache.entries.get(value)?.pinned===true;
  try{
   progress({state:'started',streaming:!!settings.streamingEnabled});
   const meta={sourceId,messageId,contentKey:contentKey(identity),synthesisKey:exactKey,...(fullFingerprint?{messageFingerprint:fullFingerprint}:{}),provider:settings.provider,model:settings.model,voice:settings.voice,complete:true};
   if(!preview){
    const hit=await selectRecording(settings,identity,{consume:true});ensure();
    if(hit){
     protectKey(hit.key);
     let stored=hit.cacheSource==='disk';
     if(settings.cacheEnabled&&hit.cacheSource==='session'){
      stored=await cache.available(key,settings.cacheMaxAgeDays);ensure();
      if(!stored){stored=await cache.put(key,hit.bytes,{...hit.meta,mime:hit.mime},settings.cacheMaxBytes,settings.cacheMaxAgeDays,{signal:controller.signal});ensure();}
     }
     const recording=recordingInfo(hit.meta),cacheReason=hit.reason;
     const completed=publishCompleted(hit.bytes,hit.mime,{streamingMode:'cache',recording,cacheReason});
     const retained=sessionCache.peek(key);
     const sessionRetained=retained?.digest===hit.meta.digest&&retained?.byteLength===hit.bytes.length||sessionCache.put(key,hit.bytes,{...hit.meta,mime:hit.mime});
     delivered={requestId,key,complete:true};availabilityChanged();
     progress({state:'ready',complete:true,cached:true,cacheSource:hit.cacheSource,cacheReason,recording,sessionRetained,clipCount,streamingMode:'cache'});
     return {requestId,...completed,...(settings.streamingEnabled?{streamed:true,clipCount}:{}),complete:true,cacheKey:key,cached:true,cacheSource:hit.cacheSource,cacheReason,recording,sessionRetained,stored};
    }
    protectKey(pinnedStorageKey(exactKey)?freshStorageKey():exactKey);
   }
   if(!text)throw Error('This message has no text to synthesize with the current speech settings.');
   workDir=path.join(profileDir,'tts-session',crypto.randomBytes(16).toString('hex'));await fs.mkdir(workDir,{recursive:true,mode:0o700});ensure();
   const apiKey=LOCAL.includes(settings.provider)?'':preview&&args.apiKey!==undefined?args.apiKey:await credentials.get(settings.provider,settings.endpoint);
   // CPU engines retain one model/worker for the utterance. Native PCM output
   // can use larger requests; the fallback exposes short complete sentences.
   const sections=LOCAL.includes(settings.provider)?[text]:splitSpeech(text,settings.streamingEnabled&&['sections','verified-sections'].includes(mode)?320:1800);const parts=[];let total=0,mime='audio/wav';
   for(let i=0;i<sections.length;i++){
    ensure();progress({state:'generating',section:i+1,sections:sections.length});let result;const before=clipCount;
    const onAudio=clip=>publishAudio(clip,{section:clip.section||i+1,sections:clip.sections||sections.length});
    if(LOCAL.includes(settings.provider)){const cpu=dependencies.synthesizeCPU||require('./cpu.cjs').synthesizeCPU;result={bytes:await cpu({provider:settings.provider,voice:settings.voice,text:sections[i],assetsDir,workDir:path.join(workDir,String(i)),signal:controller.signal,streamingEnabled:!!settings.streamingEnabled,onAudio:settings.streamingEnabled?onAudio:undefined}),mime:'audio/wav'};}
    else result=await (dependencies.synthesizeRemote||synthesizeRemote)({settings,text:sections[i],apiKey,signal:controller.signal,streamingEnabled:!!settings.streamingEnabled,onAudio:settings.streamingEnabled?onAudio:undefined});
    ensure();if(!Buffer.isBuffer(result.bytes)||!result.bytes.length)throw Error('The speech engine returned empty audio.');total+=result.bytes.length;if(total>MAX_AUDIO)throw Error('This reading exceeds the 64 MiB audio limit. Use a shorter message.');mime=result.mime;parts.push(result);
    if(settings.streamingEnabled&&before===clipCount)publishAudio(result,{section:i+1,sections:sections.length,streamingMode:mode==='native-pcm'?'sections':mode});
   }
   let audio;if(parts.length===1){audio=parts[0].bytes;mime=parts[0].mime;}else if(parts.every(p=>p.mime==='audio/wav')){try{audio=concatWav(parts.map(p=>p.bytes));mime='audio/wav';}catch{audio=encodeClips(parts);mime=CLIP_MIME;}}else{audio=encodeClips(parts);mime=CLIP_MIME;}ensure();
   const completed=responseAudio(audio,mime);let persisted=false;if(!preview&&settings.cacheEnabled){persisted=await cache.put(key,audio,{...meta,mime},settings.cacheMaxBytes,settings.cacheMaxAgeDays,{signal:controller.signal});ensure();if(!persisted&&pinnedStorageKey(key)){protectKey(freshStorageKey());persisted=await cache.put(key,audio,{...meta,mime},settings.cacheMaxBytes,settings.cacheMaxAgeDays,{signal:controller.signal});ensure();}}
   if(!preview&&pinnedStorageKey(key)&&!persisted)protectKey(freshStorageKey());
   const sessionRetained=!preview&&sessionCache.put(key,audio,{...meta,mime});delivered=preview?null:{requestId,key,complete:true};if(!preview)availabilityChanged();progress({state:'ready',complete:true,cached:false,cacheSource:null,recording:recordingInfo(meta),sessionRetained,clipCount});return {requestId,...completed,...(settings.streamingEnabled?{streamed:true,clipCount}:{}),complete:true,cacheKey:preview?null:key,cached:false,cacheSource:null,recording:recordingInfo(meta),sessionRetained,stored:persisted};
  }catch(error){if(activeRequestId===requestId&&ownGeneration===generation){cache.active.delete(activeKey);activeKey='';activeRequestId='';}if(!preview&&settings.cacheEnabled)availabilityChanged();throw error;}
  finally{if(workDir)await fs.rm(workDir,{recursive:true,force:true}).catch(()=>{});if(current?.controller===controller)current=null;}
 }
 async function invoke(action,args={}){
  if(disposed)throw Error('Text-to-Speech has shut down.');validateArgs(action,args);await sessionReady;if(disposed)throw Error('Text-to-Speech has shut down.');
  if(action==='tts.settings.get')return getSettings();
  if(action==='tts.settings.save'){const old=await settingsStore.get(),saved=await settingsStore.save(args.settings);availabilitySettings=saved;sessionCache.resize(saved.sessionCacheMaxMiB*1024**2);const synthesisFields=['enabled','includeThinking','provider','voice','model','endpoint','instructions','responseFormat','cacheEnabled','readCode','readCitations'];if(synthesisFields.some(k=>old[k]!==saved[k])||old.preferApiCache!==saved.preferApiCache&&current?.purpose==='conversation'){if(current?.purpose!=='preview')cancel();delivered=null;}if([...synthesisFields,'preferApiCache','sessionCacheMaxMiB','cacheMaxBytes','cacheMaxAgeDays'].some(k=>old[k]!==saved[k]))availabilityChanged();return getSettings();}
  if(action==='tts.availability')return availability(args);
  if(action==='tts.cancel'){if(args.requestId!==undefined)textField(args.requestId,'request identity',200);return cancel(args.requestId);}
  if(action==='tts.playback'){textField(args.requestId,'request identity',200);if(args.cacheKey!=null)textField(args.cacheKey,'cache identity',64);if(typeof args.active!=='boolean')throw Error('Invalid playback state.');if(delivered?.requestId!==args.requestId||delivered.complete!==true||args.cacheKey!=null&&delivered.key!==args.cacheKey)return {protected:false};const key=delivered.key;if(args.active){if(current&&current.id!==args.requestId)return {protected:false};if(activeKey)cache.active.delete(activeKey);activeKey=key;activeRequestId=args.requestId;cache.active.add(activeKey);return {protected:true};}if(activeKey===key&&activeRequestId===args.requestId){cache.active.delete(activeKey);activeKey='';activeRequestId='';}return {protected:false};}
  if(action==='tts.synthesize'||action==='tts.preview'){const task=synthesize(args,action==='tts.preview');jobs.add(task);try{return await task;}finally{jobs.delete(task);}}
  if(action==='tts.cache.list')return cache.list();
  if(action==='tts.cache.preview')return cache.preview(args.filter);
  if(action==='tts.cache.delete'){textField(args.token,'deletion preview',100);const result=await cache.remove(args.token);availabilityChanged();return result;}
  if(action==='tts.cache.pin'){textField(args.key,'cache identity',64);const result=await cache.pin(args.key,args.pinned);availabilityChanged();return result;}
  if(action==='tts.credentials.status')return status();
  if(action==='tts.credentials.set')return credentials.set(await credentialArgs(args));
  if(action==='tts.credentials.unlock')return credentials.unlock(await credentialArgs(args));
  if(action==='tts.credentials.forget'){const target=await credentialArgs(args);if(current)cancel();return credentials.forget(target);}
  if(action==='tts.providers.discover'){const config=await settingsStore.get(),provider=args.provider||config.provider;if(!PROVIDERS.includes(provider))throw Error('Unknown TTS provider.');const endpoint=args.endpoint||config.providerProfiles[provider].endpoint;const apiKey=LOCAL.includes(provider)?'':typeof args.apiKey==='string'?args.apiKey:await credentials.get(provider,endpoint);return (dependencies.discover||discover)({provider,endpoint,apiKey,model:args.model||config.providerProfiles[provider].model});}
  throw Error('Unknown TTS action.');
 }
 async function dispose(){disposed=true;clearTimeout(expiryTimer);expiryTimer=null;cancel();delivered=null;sessionCache.clear();credentials.clearSession();await Promise.allSettled([...jobs]);await cache.queue;await credentials.queue;credentials.clearSession();sessionCache.clear();cache.previews.clear();cache.validationMemo.clear();recordings.clear();await settingsStore.queue;}
 return {invoke,dispose};
}
module.exports={createTtsService,splitSpeech,streamingMode,synthesisKey,contentKey,ACTIONS};
