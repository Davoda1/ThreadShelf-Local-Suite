// UI preview only. No provider calls, model execution, credentials or disk I/O.
export function createTtsPreview() {
  const profiles = {
    pocket: {voice:'alba',model:'pocket-english-2026-10',endpoint:'',instructions:'',timeoutSeconds:180,responseFormat:'wav'},
    kokoro: {voice:'am_michael',model:'kokoro-v1.0-fp32',endpoint:'',instructions:'',timeoutSeconds:180,responseFormat:'wav'},
    selfhosted: {voice:'',model:'',endpoint:'http://127.0.0.1:8000/v1/audio/speech',instructions:'',timeoutSeconds:180,responseFormat:'wav'},
    elevenlabs: {voice:'',model:'eleven_multilingual_v2',endpoint:'https://api.elevenlabs.io',instructions:'',timeoutSeconds:180,responseFormat:'mp3'},
    openrouter: {voice:'',model:'',endpoint:'https://openrouter.ai/api/v1/audio/speech',instructions:'',timeoutSeconds:180,responseFormat:'mp3'},
    'openai-realtime': {voice:'marin',model:'gpt-realtime-2.1-mini',endpoint:'wss://api.openai.com/v1/realtime',instructions:'',timeoutSeconds:180,responseFormat:'wav'}
  };
  const clone = value => structuredClone(value);
  let settings = {schemaVersion:1,enabled:false,includeThinking:false,showPillSettings:false,showPillSpeed:false,showPillVolume:false,streamingEnabled:true,volume:1,provider:'pocket',...profiles.pocket,cacheEnabled:false,preferApiCache:true,cacheMaxBytes:2147483648,cacheMaxAgeDays:0,sessionCacheMaxMiB:64,readCode:false,readCitations:false,playbackRate:1,providerProfiles:clone(profiles)};
  const fields = ['voice','model','endpoint','instructions','timeoutSeconds','responseFormat'];
  const cache = new Map(), sessions = new Map(), plans = new Map(), listeners = new Set();
  const sessionMaxEntries=3;
  let sessionMaxBytes=64*1024*1024;
  const trimSessions=()=>{while(sessions.size>sessionMaxEntries||[...sessions.values()].reduce((n,entry)=>n+entry.bytes,0)>sessionMaxBytes)sessions.delete(sessions.keys().next().value);};
  let sequence = 0, current = null, activeKey = null, delivered = null, revision = 0, expiryTimer = null;
  const makeWav = (seconds,start=0) => {
    const rate=24000,frames=rate*seconds,buffer=new ArrayBuffer(44+frames*2),view=new DataView(buffer);
    const word=(offset,text)=>Array.from(text).forEach((letter,index)=>view.setUint8(offset+index,letter.charCodeAt(0)));
    word(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,frames*2,true);
    for(let i=0;i<frames;i++){const t=start+i/rate,fade=Math.min(1,t*8,(8-t)*8);view.setInt16(44+i*2,Math.round(Math.sin(t*220*Math.PI*2)*250*fade),true);}
    let binary='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {base64:btoa(binary),bytes:bytes.length};
  };
  const wav=makeWav(8),chunks=Array.from({length:4},(_,i)=>makeWav(2,i*2));
  const onTtsEvent=callback=>{listeners.add(callback);return()=>listeners.delete(callback);};
  const emit=event=>{for(const callback of listeners)try{callback(clone(event));}catch{}};
  const validDisk=(entry,chosen=settings)=>!!entry?.complete&&chosen.cacheEnabled&&(!chosen.cacheMaxAgeDays||entry.pinned||Date.now()-Date.parse(entry.createdAt)<chosen.cacheMaxAgeDays*86400000);
  const availabilityChanged=()=>{emit({state:'availability-changed',revision:++revision});clearTimeout(expiryTimer);if(!settings.cacheEnabled||!settings.cacheMaxAgeDays)return;const now=Date.now(),future=[...cache.values()].filter(entry=>!entry.pinned).map(entry=>Date.parse(entry.createdAt)+settings.cacheMaxAgeDays*86400000).filter(deadline=>deadline>now);if(future.length){expiryTimer=setTimeout(availabilityChanged,Math.min(2147483647,Math.max(1,Math.min(...future)-now+1)));expiryTimer.unref?.();}};
  const normalizedText=value=>String(value||'').replace(/\r\n?/g,'\n').normalize('NFC').trim();
  const messageFingerprintFor=args=>args.messageFingerprint?.version===1&&/^[a-f0-9]{64}$/.test(args.messageFingerprint.sha256||'')?{version:1,sha256:args.messageFingerprint.sha256}:null;
  const contentIdentityFor=args=>JSON.stringify([String(args.sourceId||''),String(args.messageId||''),normalizedText(args.text)]);
  const fingerprintFor=(args,chosen)=>JSON.stringify([String(args.sourceId||''),String(args.messageId||''),normalizedText(args.text),chosen.provider,chosen.voice,chosen.model,chosen.endpoint,chosen.instructions,chosen.responseFormat,!!chosen.readCode,!!chosen.readCitations]);
  const recordingFor=entry=>({provider:entry.provider,model:entry.model,voice:entry.voice});
  const selectRecording=(args,chosen=settings)=>{
    const fingerprint=fingerprintFor(args,chosen),contentIdentity=contentIdentityFor(args),messageFingerprint=messageFingerprintFor(args),candidates=new Map();
    const sameMessage=entry=>entry.sourceId===String(args.sourceId||'')&&entry.messageId===String(args.messageId||'')&&(entry.messageFingerprint&&messageFingerprint?entry.messageFingerprint.sha256===messageFingerprint.sha256:entry.contentIdentity===contentIdentity);
    const add=(entry,source)=>{if(!entry?.complete||!sameMessage(entry)&&entry.fingerprint!==fingerprint)return;const previous=candidates.get(entry.key);if(!previous||source==='disk'&&entry.pinned)candidates.set(entry.key,{entry,source});};
    for(const entry of sessions.values())add(entry,'session');
    for(const entry of cache.values())if(validDisk(entry,chosen))add(entry,'disk');
    const ranked=[...candidates.values()].map(candidate=>({...candidate,reason:sameMessage(candidate.entry)&&candidate.entry.pinned?'pinned':sameMessage(candidate.entry)&&chosen.preferApiCache&&!['pocket','kokoro'].includes(candidate.entry.provider)?'api':candidate.entry.fingerprint===fingerprint?'exact':null})).filter(candidate=>candidate.reason);
    const priority={pinned:0,api:1,exact:2};
    ranked.sort((a,b)=>priority[a.reason]-priority[b.reason]||Date.parse(b.entry.lastUsedAt)-Date.parse(a.entry.lastUsedAt)||Date.parse(b.entry.createdAt)-Date.parse(a.entry.createdAt)||a.entry.key.localeCompare(b.entry.key));
    return ranked[0]||null;
  };
  const cancel=requestId=>{if(requestId&&current?.requestId!==requestId&&delivered?.requestId!==requestId)return{cancelled:false};const job=current;current=null;if(job){job.cancelled=true;job.abort?.();}activeKey=null;return{cancelled:!!job};};
  const delay=(job,ms)=>new Promise((resolve,reject)=>{if(job.cancelled){reject(new Error('Speech request cancelled.'));return;}const timer=setTimeout(()=>{job.abort=null;job.cancelled?reject(new Error('Speech request cancelled.')):resolve();},ms);job.abort=()=>{clearTimeout(timer);job.abort=null;reject(new Error('Speech request cancelled.'));};});
  const state=()=>({...clone(settings),credentialStatus:Object.fromEntries(Object.keys(profiles).map(id=>[id,false]))});
  // The persistent preview banner and license panel already identify test-tone
  // playback and session-only simulation. Keep the actual settings layout intact.
  const matching = (filter,entries=cache.values()) => [...entries].filter(entry => !filter.scope||filter.scope==='all'||filter.scope==='conversation'&&entry.sourceId===filter.sourceId||filter.scope==='provider'&&entry.provider===filter.provider||filter.scope==='older'&&Date.now()-Date.parse(entry.createdAt)>(filter.olderThanDays||30)*86400000||filter.scope==='selected'&&(filter.keys||[]).includes(entry.key)||filter.scope==='incomplete'&&!entry.complete);
  return {
    onTtsEvent,
    onEvent:onTtsEvent,
    async invoke(action,args={}) {
      switch(action) {
        case 'tts.settings.get': return state();
        case 'tts.settings.save': {
          const previousSettings=clone(settings),patch=clone(args.settings||{}),previous=settings.provider,next=patch.provider||previous;
          if('preferApiCache' in patch&&typeof patch.preferApiCache!=='boolean')throw Error('Invalid API cache preference.');
          if('sessionCacheMaxMiB' in patch&&![32,64,128,256].includes(patch.sessionCacheMaxMiB))throw Error('Choose a session RAM limit of 32, 64, 128 or 256 MB.');
          settings.providerProfiles[previous]=Object.fromEntries(fields.map(field=>[field,settings[field]]));
          if(patch.providerProfiles)Object.assign(settings.providerProfiles,patch.providerProfiles);
          const target=clone(settings.providerProfiles[next]||profiles[next]);
          for(const field of fields)if(field in patch&&(next===previous||patch[field]!==settings[field]))target[field]=patch[field];
          delete patch.warning;delete patch.credentialStatus;delete patch.providerProfiles;
          settings={...settings,...patch,...target};settings.providerProfiles[next]=clone(target);sessionMaxBytes=settings.sessionCacheMaxMiB*1024*1024;trimSessions();
          const synthesisFields=['enabled','includeThinking','provider','voice','model','endpoint','instructions','responseFormat','cacheEnabled','readCode','readCitations'];
          if(synthesisFields.some(key=>previousSettings[key]!==settings[key])){if(current?.purpose!=='preview')cancel();delivered=null;}else if(previousSettings.preferApiCache!==settings.preferApiCache&&current?.purpose==='conversation')cancel();availabilityChanged();return state();
        }
        case 'tts.preview': case 'tts.synthesize': {
          const preview=action==='tts.preview',chosen=preview?{...clone(settings),...clone(args.settings||{})}:clone(settings),purpose=preview?'preview':'conversation';
          if(!preview&&!chosen.enabled)throw Error('Enable Text-to-Speech in settings first.');
          if(!preview&&args.thinking&&!chosen.includeThinking)throw Error('Text-to-Speech for thinking bubbles is disabled.');
          cancel();delivered=null;const job={requestId:args.requestId,purpose,cancelled:false,abort:null};current=job;
          const fingerprint=fingerprintFor(args,chosen),contentIdentity=contentIdentityFor(args),hit=preview?null:selectRecording(args,chosen);
          if(!normalizedText(args.text)&&!hit){current=null;throw Error('This message has no readable text with the selected speech settings.');}
          const cached=!!hit,cacheSource=hit?.source||null,cacheReason=hit?.reason,recording=recordingFor(hit?.entry||chosen);
          const exact=[...cache.values(),...sessions.values()].find(entry=>entry.fingerprint===fingerprint);
          const key=hit?.entry.key||exact?.key||(++sequence).toString(16).padStart(64,'0');
          const cachedMetadata=cached?{cacheReason,recording}:{recording};
          try {
            emit({requestId:job.requestId,purpose,state:'generating',section:1,sections:1});
            if(chosen.streamingEnabled){for(let i=0;i<chunks.length;i++){await delay(job,cached?20:i?200:180);if(current!==job||job.cancelled)throw Error('Speech request cancelled.');emit({requestId:job.requestId,purpose,state:'audio',complete:false,...cachedMetadata,clipIndex:i,section:1,sections:1,mime:'audio/wav',audioBase64:chunks[i].base64,streamingMode:'preview-test-tone'});}}
            else await delay(job,cached?60:400);
            if(current!==job||job.cancelled)throw Error('Speech request cancelled.');
            const now=new Date().toISOString();
            const retained=hit?{...hit.entry,lastUsedAt:now}:{key,fingerprint,contentIdentity,...(messageFingerprintFor(args)?{messageFingerprint:messageFingerprintFor(args)}:{}),...recording,sourceId:String(args.sourceId||''),messageId:String(args.messageId||''),bytes:wav.bytes,mime:'audio/wav',createdAt:now,lastUsedAt:now,pinned:false,complete:true};
            if(!preview&&chosen.cacheEnabled){const existing=cache.get(key);if(!existing?.pinned&&!validDisk(existing,chosen))cache.set(key,{...retained});else if(existing&&cached)existing.lastUsedAt=now;}
            if(!preview){sessions.delete(key);sessions.set(key,{...retained});trimSessions();}
            const cacheKey=preview?null:key;activeKey=preview?null:key;delivered=preview?null:{requestId:job.requestId,key:cacheKey,sessionKey:key};
            if(!preview)availabilityChanged();
            emit({requestId:job.requestId,purpose,state:'ready',complete:true,cached,cacheSource,...cachedMetadata,clipCount:chosen.streamingEnabled?chunks.length:0});
            return {requestId:job.requestId,audioBase64:wav.base64,mime:'audio/wav',complete:true,cacheKey,cached,cacheSource,...cachedMetadata,sessionRetained:!preview&&sessions.has(key),stored:!preview&&validDisk(cache.get(key),chosen),...(chosen.streamingEnabled?{streamed:true,clipCount:chunks.length}:{}),preview:true};
          }finally{if(current===job)current=null;}
        }
        case 'tts.availability': {if(!Array.isArray(args.messages)||args.messages.length>64||new TextEncoder().encode(JSON.stringify(args)).length>512*1024)throw Error('Invalid availability batch.');return {revision,items:args.messages.map(message=>({id:message.id,available:!!(settings.enabled&&(!message.thinking||settings.includeThinking)&&selectRecording(message))}))};}
        case 'tts.cancel': return cancel(args.requestId);
        case 'tts.playback': if(delivered?.requestId!==args.requestId||args.cacheKey!=null&&delivered?.key!==args.cacheKey)return{protected:false};if(args.active)activeKey=delivered.sessionKey;else if(activeKey===delivered.sessionKey)activeKey=null;return {protected:args.active===true};
        case 'tts.cache.list': return {entries:clone([...cache.values()]),totalCount:cache.size,totalBytes:[...cache.values()].reduce((n,entry)=>n+entry.bytes,0),session:{count:sessions.size,totalBytes:[...sessions.values()].reduce((n,entry)=>n+entry.bytes,0),maxEntries:sessionMaxEntries,maxBytes:sessionMaxBytes}};
        case 'tts.cache.pin': {const entry=cache.get(args.key);if(!entry)throw Error('This sample clip no longer exists.');entry.pinned=!!args.pinned;const memory=sessions.get(entry.key);if(memory)memory.pinned=entry.pinned;availabilityChanged();return {key:entry.key,pinned:entry.pinned};}
        case 'tts.cache.preview': {
          const filter=args.filter||{},matches=matching(filter),entries=matches.filter(entry=>entry.key!==activeKey&&(!entry.pinned||filter.includePinned===true)),token=String(++sequence);
          const sessionMatches=matching(filter,sessions.values()),sessionEntries=sessionMatches.filter(entry=>entry.key!==activeKey&&(!cache.get(entry.key)?.pinned||filter.includePinned===true));
          plans.set(token,{keys:entries.map(entry=>entry.key),sessionEntries,includePinned:filter.includePinned===true});return {token,count:entries.length,bytes:entries.reduce((n,entry)=>n+entry.bytes,0),protectedCount:matches.length-entries.length,sessionCount:sessionEntries.length,sessionBytes:sessionEntries.reduce((n,entry)=>n+entry.bytes,0),sessionProtectedCount:sessionMatches.length-sessionEntries.length};
        }
        case 'tts.cache.delete': {
          const plan=plans.get(args.token);if(!plan)throw Error('Preview the deletion again.');plans.delete(args.token);let count=0,bytes=0,protectedCount=0,sessionCount=0,sessionBytes=0,sessionProtectedCount=0;
          for(const expected of plan.sessionEntries){const entry=sessions.get(expected.key);if(!entry)continue;if(entry!==expected||entry.key===activeKey||cache.get(entry.key)?.pinned&&!plan.includePinned){sessionProtectedCount++;continue;}sessionCount++;sessionBytes+=entry.bytes;sessions.delete(entry.key);}
          for(const key of plan.keys){const entry=cache.get(key);if(!entry)continue;if(key===activeKey||entry.pinned&&!plan.includePinned){protectedCount++;continue;}count++;bytes+=entry.bytes;cache.delete(key);}if(count||sessionCount)availabilityChanged();return {count,bytes,protectedCount,sessionCount,sessionBytes,sessionProtectedCount};
        }
        case 'tts.credentials.status': return {providers:Object.fromEntries(Object.entries(settings.providerProfiles).map(([provider,profile])=>[provider,{provider,endpoint:profile.endpoint,available:false,saved:false,locked:false}]))};
        case 'tts.credentials.forget': return {provider:args.provider,endpoint:settings.providerProfiles[args.provider]?.endpoint||'',available:false,saved:false,locked:false};
        case 'tts.credentials.set': case 'tts.credentials.unlock': throw Error('API keys are not needed or retained in this offline preview. Configure them in the desktop application.');
        case 'tts.providers.discover': throw Error('Provider discovery is available in the desktop application. This preview makes no network requests.');
        default: throw Error('This TTS action is not available in the offline preview.');
      }
    }
  };
}
