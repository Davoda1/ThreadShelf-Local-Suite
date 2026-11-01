'use strict';

// Playwright-only instrumentation. Real browser audio nodes remain unmodified.
function installTtsQa({defaults,voices,audio}) {
 const clone=value=>JSON.parse(JSON.stringify(value));
 const listeners=new Set(),jobs=new Map(),calls=[],events=[],nodes=[],contexts=[],sources=[],media=[],players=[];
 let Player;
 Object.defineProperty(window,'ThreadShelfTtsPlayer',{configurable:true,get:()=>Player,set(Base){Player=class extends Base{constructor(...args){super(...args);players.push(this);}};}});
 let settings=clone(defaults),entries=[],mode='auto',sequence=0,desktop,saveHeld=false;
 const heldSaves=[];
 const emit=event=>{events.push({...clone(event),at:performance.now()});for(const listener of listeners)listener(clone(event));};
 const originalAudio=window.Audio;
 window.Audio=function(...args){const value=new originalAudio(...args);media.push(value);return value;};
 window.Audio.prototype=originalAudio.prototype;
 const NativeContext=window.AudioContext||window.webkitAudioContext;
 if(NativeContext){
  class ObservedContext extends NativeContext {
   constructor(...args){super(...args);contexts.push(this);}
   createAnalyser(){const node=super.createAnalyser();nodes.push({type:'analyser',node,context:this});return node;}
   createGain(){const node=super.createGain();nodes.push({type:'gain',node,context:this});return node;}
   createBufferSource(){const node=super.createBufferSource(),record={node,context:this,starts:[],stops:[]};sources.push(record);const start=node.start.bind(node),stop=node.stop.bind(node);node.start=(...args)=>{record.starts.push({at:performance.now(),contextTime:this.currentTime,args});return start(...args);};node.stop=(...args)=>{record.stops.push({at:performance.now(),contextTime:this.currentTime,args});return stop(...args);};return node;}
  }
  window.AudioContext=ObservedContext;
  if(window.webkitAudioContext)window.webkitAudioContext=ObservedContext;
 }
 const onTtsEvent=callback=>{listeners.add(callback);return()=>listeners.delete(callback);};
 const finish=id=>{
  const job=jobs.get(id);if(!job||job.settled)return;
  job.settled=true;
  if(job.streamed&&job.clipCount===0)sendAudio(id,audio.tone,0);
  if(job.purpose==='conversation'&&job.settings.cacheEnabled)entries.push({key:'qa-'+id,sourceId:job.args.sourceId,messageId:job.args.messageId,provider:job.settings.provider,voice:job.settings.voice,bytes:100,createdAt:Date.now(),pinned:false});
  emit({requestId:id,purpose:job.purpose,state:'ready',complete:true,cached:false});
  job.resolve(job.streamed?{requestId:id,complete:true,streamed:true,clipCount:job.clipCount,audioBase64:audio.tone,mime:'audio/wav',cacheKey:job.purpose==='conversation'&&job.settings.cacheEnabled?'qa-'+id:null,cached:false,stored:job.purpose==='conversation'&&job.settings.cacheEnabled}:{requestId:id,complete:true,audioBase64:audio.tone,mime:'audio/wav',cached:false,cacheKey:null});
 };
 function sendAudio(id,data=audio.tone,index){const job=jobs.get(id);if(!job)return;const clipIndex=index===undefined?job.clipCount:index;job.clipCount=Math.max(job.clipCount,clipIndex+1);emit({requestId:id,purpose:job.purpose,state:'audio',complete:false,clipIndex,section:1,sections:1,mime:'audio/wav',audioBase64:data});}
 const invoke=async(action,args={})=>{
  calls.push({action,args:clone(args),at:performance.now()});
  if(action==='tts.settings.get')return clone(settings);
  if(action==='tts.settings.save'){
   const persist=()=>{const patch=args.settings||{};if(patch.provider&&patch.provider!==settings.provider)settings={...settings,...settings.providerProfiles[patch.provider],provider:patch.provider};settings={...settings,...clone(patch)};return clone(settings);};
   if(saveHeld)return new Promise(resolve=>heldSaves.push(()=>resolve(persist())));
   return persist();
  }
  if(action==='tts.credentials.status')return{providers:{}};
  if(action==='tts.credentials.set'||action==='tts.credentials.unlock'||action==='tts.credentials.forget')return{provider:args.provider,available:false,saved:false,locked:false};
  if(action==='tts.providers.discover')return{models:[],voices:voices[args.provider]||[],warnings:[]};
  if(action==='tts.cache.list')return{entries:clone(entries),totalBytes:entries.reduce((n,e)=>n+e.bytes,0)};
  if(action==='tts.cache.preview')return{token:'qa-delete',count:entries.length,bytes:entries.length*100,protectedCount:0};
  if(action==='tts.cache.delete'){const count=entries.length;entries=[];return{count,bytes:count*100};}
  if(action==='tts.cache.pin'){const entry=entries.find(e=>e.key===args.key);if(entry)entry.pinned=!!args.pinned;return{ok:true};}
  if(action==='tts.playback')return{protected:!!args.active};
  if(action==='tts.cancel'){
   let cancelled=false;for(const job of jobs.values()){if((!args.requestId||job.id===args.requestId)&&!job.settled){job.settled=true;job.cancelled=true;job.reject(new DOMException('Speech cancelled','AbortError'));cancelled=true;}}
   return{cancelled};
  }
  if(action==='tts.synthesize'||action==='tts.preview'){
   const purpose=action==='tts.preview'?'preview':'conversation';let snapshot=purpose==='preview'?{...clone(settings),...clone(args.settings||{})}:clone(settings);
   if(purpose==='preview'&&typeof window.__qaNormalize==='function')snapshot=await window.__qaNormalize(args.settings||{},settings);
   if(purpose==='conversation'&&!snapshot.enabled)throw Error('TTS disabled');
   const id=args.requestId||'qa-'+(++sequence);
   return new Promise((resolve,reject)=>{
    const job={id,args:clone(args),settings:snapshot,purpose,resolve,reject,settled:false,clipCount:0,streamed:snapshot.streamingEnabled!==false};jobs.set(id,job);
    if(mode==='manual')return;
    setTimeout(()=>{if(job.settled)return;if(job.streamed)sendAudio(id,mode==='silence'?audio.silence:audio.tone);if(mode!=='hold')setTimeout(()=>finish(id),50);},25);
   });
  }
  throw Error('Unexpected QA TTS action '+action);
 };
 const bridge={invoke,onTtsEvent,onEvent:onTtsEvent};
 Object.defineProperty(window,'__THREADSHELF_TTS_PREVIEW',{configurable:true,get:()=>bridge,set:()=>{}});
 Object.defineProperty(window,'desktop',{configurable:true,get:()=>desktop,set(value){desktop={...value,onTtsEvent,invoke:(action,args)=>action.startsWith('tts.')?invoke(action,args):value.invoke(action,args)};}});
 window.__ttsQA={calls,events,media,contexts,nodes,sources,players,jobs,bridge,voices,
  mode(value){mode=value;},settings:()=>clone(settings),entries:()=>clone(entries),
  holdSaves(value=true){saveHeld=value;},releaseSaves(){saveHeld=false;for(const apply of heldSaves.splice(0))apply();},
  jobIds:()=>[...jobs.keys()],finish,sendAudio,emit,
  fail(id,message='Synthetic network interruption'){const job=jobs.get(id);if(job&&!job.settled){job.settled=true;job.reject(new Error(message));}},
  resetLog(){calls.length=0;events.length=0;},
  readings(){return nodes.filter(r=>r.type==='analyser').map(({node,context})=>{const samples=new Float32Array(node.fftSize);node.getFloatTimeDomainData(samples);const rawRms=Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length);return{rms:context.state==='running'?rawRms:0,rawRms,state:context.state,time:context.currentTime};});},
  gains:()=>nodes.filter(r=>r.type==='gain').map(r=>r.node.gain.value),
  audio
 };
}

function wav({seconds=8,amplitude=.2,frequency=440,rate=24000}={}){
 const n=Math.floor(seconds*rate),b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(amplitude*Math.sin(2*Math.PI*frequency*i/rate)*32767),44+2*i);
 return b;
}
module.exports={installTtsQa,wav};
