/*! Sliders-horizontal settings icon: Lucide 0.468.0.
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/
import './tts.css';
import './tts-audio.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const clone=value=>JSON.parse(JSON.stringify(value));
const setText=(node,text)=>{if(node&&node.textContent!==String(text))node.textContent=String(text);};
const PROVIDERS=[['pocket','Pocket TTS · built-in CPU'],['kokoro','Kokoro · built-in CPU'],['selfhosted','Local or remote server'],['elevenlabs','ElevenLabs'],['openai-realtime','OpenAI'],['openrouter','OpenRouter']];
const PROFILES={
 pocket:{voice:'alba',model:'pocket-english-2026-10',endpoint:'',instructions:'',timeoutSeconds:180,responseFormat:'wav'},
 kokoro:{voice:'am_michael',model:'kokoro-v1.0-fp32',endpoint:'',instructions:'',timeoutSeconds:180,responseFormat:'wav'},
 selfhosted:{voice:'',model:'',endpoint:'http://127.0.0.1:8000/v1/audio/speech',instructions:'',timeoutSeconds:180,responseFormat:'wav'},
 elevenlabs:{voice:'',model:'eleven_multilingual_v2',endpoint:'https://api.elevenlabs.io',instructions:'',timeoutSeconds:180,responseFormat:'mp3'},
 openrouter:{voice:'',model:'',endpoint:'https://openrouter.ai/api/v1/audio/speech',instructions:'',timeoutSeconds:180,responseFormat:'mp3'},
 'openai-realtime':{voice:'marin',model:'gpt-realtime-2.1-mini',endpoint:'wss://api.openai.com/v1/realtime',instructions:'',timeoutSeconds:180,responseFormat:'wav'}
};
const PROFILE_FIELDS=Object.keys(PROFILES.pocket);
const synthesisIdentity=settings=>JSON.stringify(['provider','voice','model','endpoint','instructions','responseFormat','readCode','readCitations'].map(key=>settings[key]));
const SESSION_MEMORY_LIMITS=[32,64,128,256];
const BOOLEANS=['enabled','includeThinking','showPillSettings','showPillSpeed','showPillVolume','streamingEnabled','cacheEnabled','preferApiCache','readCode','readCitations'];
const DEFAULTS={enabled:false,includeThinking:false,showPillSettings:false,showPillSpeed:false,showPillVolume:false,streamingEnabled:true,volume:1,provider:'pocket',...PROFILES.pocket,cacheEnabled:false,preferApiCache:true,cacheMaxBytes:2147483648,cacheMaxAgeDays:0,sessionCacheMaxMiB:64,readCode:false,readCitations:false,playbackRate:1,providerProfiles:clone(PROFILES)};
const POCKET=['alba','marius','javert','anna','charles','vera'].map(id=>[id,id[0].toUpperCase()+id.slice(1)]);
const KOKORO=['af_heart','af_alloy','af_aoede','af_bella','af_jessica','af_kore','af_nicole','af_nova','af_river','af_sarah','af_sky','am_adam','am_echo','am_eric','am_fenrir','am_liam','am_michael','am_onyx','am_puck','am_santa','bf_alice','bf_emma','bf_isabella','bf_lily','bm_daniel','bm_fable','bm_george','bm_lewis'].map(id=>[id,id.slice(3,4).toUpperCase()+id.slice(4)+' · '+(id[0]==='a'?'US':'UK')+' '+(id[1]==='f'?'female':'male')]);
const REALTIME=['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar'].map(id=>[id,id[0].toUpperCase()+id.slice(1)]);
// The speaker glyph inherits the application color.
export const speakerSVG='<svg viewBox="0 0 75 75" aria-hidden="true"><path d="M39.389,13.769 L22.235,28.606 L6,28.606 L6,47.699 L21.989,47.699 L39.389,62.75 L39.389,13.769z" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M48,27.6a19.5,19.5 0 0 1 0,21.4M55.1,20.5a30,30 0 0 1 0,35.6M61.6,14a38.8,38.8 0 0 1 0,48.6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';
const glyphs={play:'<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',pause:'<path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor" stroke="none"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',replay:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',volume:'<path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',settings:'<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>'};
const svg=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphs[name]||''}</svg>`;
const select=(id,items,value)=>`<span class="select-wrap"><select id="${id}">${items.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(label)}</option>`).join('')}</select><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></span>`;
const field=(id,label,body,help='')=>`<div class="field"><label for="${id}">${esc(label)}</label>${body}${help?`<span class="fine">${esc(help)}</span>`:''}</div>`;
const toggle=(name,label,help,value)=>`<label class="welcome-video-setting tts-toggle" for="tts-${name}"><span class="welcome-video-copy"><span id="tts-${name}-label">${esc(label)}</span><span id="tts-${name}-help" class="fine">${esc(help)}</span></span><span class="wave-background-switch-wrap"><input id="tts-${name}" data-tts-setting="${name}" class="wave-background-switch" type="checkbox" role="switch" aria-labelledby="tts-${name}-label" aria-describedby="tts-${name}-help" ${value?'checked':''}><span class="wave-background-switch-track" aria-hidden="true"><span class="wave-background-switch-thumb"></span></span></span></label>`;
const bytes=value=>{const n=Number(value)||0;return n>=1073741824?(n/1073741824).toFixed(2)+' GiB':n>=1048576?(n/1048576).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' bytes';};
const time=value=>{const n=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
const normalizeMessageText=value=>String(value??'').replace(/\r\n?/g,'\n').normalize('NFC').trim();
const canonicalMessageText=message=>{const rendered=normalizeMessageText(speechText(message,{readCode:true,readCitations:true})),source=typeof message.sourceText==='string'?normalizeMessageText(message.sourceText):rendered;return source||rendered?JSON.stringify([source,rendered]):'';};
const sourceLabel=value=>{try{const ref=JSON.parse(value);return [(ref.mode==='server'?'Server':'Local'),ref.collection,ref.sourceFile||ref.conversationKey||ref.id].filter(Boolean).join(' · ');}catch{return String(value||'Voice test');}};

/** View-only extraction. The original Markdown, search marks and stored turns stay untouched. */
export function speechText(message,settings){
 const source=message.querySelector('.message-content');if(!source)return '';
 const content=source.cloneNode(true);
 for(const node of $$('.chatgpt-math-inline,.chatgpt-math-display,mjx-container',content))node.replaceWith(document.createTextNode(' Equation. '));
 for(const node of $$('script,style,button,svg,canvas,video,audio,iframe,[aria-hidden="true"],.mermaid-diagram,.rich-chart-tooltip,.rich-chart-controls,.rich-image-actions,.markdown-image-controls',content))node.remove();
 if(!settings.readCode)for(const node of $$('pre,.mermaid-block,.rich-original-source',content))node.replaceWith(document.createTextNode(' '));
 if(!settings.readCitations)for(const node of $$('.ts-file-citation,.rich-citation,.citation,.citation-marker,.rich-sources,.source-citations',content))node.replaceWith(document.createTextNode(' '));
 for(const image of $$('img',content))image.replaceWith(document.createTextNode(image.alt?' '+image.alt+' ':''));
 for(const node of $$('br',content))node.replaceWith(document.createTextNode('\n'));
 for(const node of $$('p,div,li,tr,blockquote,h1,h2,h3,h4,h5,h6,pre',content))node.append(document.createTextNode('\n'));
 for(const node of $$('td,th',content))node.append(document.createTextNode('; '));
 return (content.textContent||'').normalize('NFC').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

export class TtsController {
 constructor({invoke,getContext,settingsIcon,onSettings,onTtsEvent,onError=()=>{}}){
  Object.assign(this,{invoke,getContext,settingsIcon,onSettings,onError});this.config=clone(DEFAULTS);this.serial=0;this.requestId=null;this.active=null;this.audioURLs=[];this.audio=null;this.clipIndex=0;this.host=null;this.entries=[];this.cachePage=0;this.cacheSessionCount=0;this.selected=new Set();this.availability=new WeakMap();this.messageFingerprints=new WeakMap();this.availabilitySerial=0;this.availabilityRevision=0;this.availabilityTimer=null;this.testSession=null;this.discovery={};this.unsubscribeTts=onTtsEvent?.(event=>this.receiveTtsEvent(event));
 }
 async init(){this.config={...clone(DEFAULTS),...await this.invoke('tts.settings.get')};return this.config;}
 attach(host){
  this.detach();this.host=host;this.abort=new AbortController();
  this.observer=new MutationObserver(records=>{let changed=false;for(const record of records){const content=record.target.closest?.('.message-content')||record.target.parentElement?.closest('.message-content');if(content){const message=content.closest('.message');if(message)this.availability.delete(message);changed=true;}if([...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.matches('.message')||node.querySelector('.message'))))changed=true;}if(changed)this.syncMessages();});this.observer.observe(host,{childList:true,characterData:true,subtree:true});
  host.addEventListener('click',event=>{const button=event.target.closest('[data-tts-read]');if(button){event.preventDefault();void this.startMessage(button.closest('.message')).catch(this.onError);}else this.scheduleAvailability();}, {signal:this.abort.signal});
  host.addEventListener('scroll',()=>this.scheduleAvailability(),{capture:true,passive:true,signal:this.abort.signal});window.addEventListener('resize',()=>this.scheduleAvailability(),{signal:this.abort.signal});
  this.syncMessages();
 }
 detach(){clearTimeout(this.availabilityTimer);this.availabilitySerial++;this.availability=new WeakMap();this.stop(true);this.disposeTest();this.observer?.disconnect();this.abort?.abort();this.host=null;}
 setConfig(config){
  this.serial++;this.availability=new WeakMap();this.availabilitySerial++;const previous=this.config;this.config={...clone(DEFAULTS),...config};
  const selectionChanged=['preferApiCache','cacheEnabled'].some(key=>previous[key]!==this.config[key]);
  if(!this.config.enabled||this.active?.thinking&&!this.config.includeThinking||this.active&&this.active.synthesisIdentity!==synthesisIdentity(this.config)||selectionChanged&&this.active?.receiving)this.stop(true);
  else if(selectionChanged&&this.active)this.active.reselectionNeeded=true;
  this.active?.player.setVolume(this.config.volume);this.active?.player.setRate(this.config.playbackRate);this.syncMessages();this.syncPill();
 }
 syncMessages(){
  if(!this.host)return;
  const current=this.getContext();if(this.active&&this.active.messageId!=='tts-preview'&&current.sourceId!==this.active.sourceId)this.stop(true);
  for(const message of $$('.message',this.host)){
   const eligible=this.config.enabled&&['user','assistant','thinking','system','tool'].includes(message.dataset.role)&&(message.dataset.role!=='thinking'||this.config.includeThinking);
   const footer=$(':scope > .tts-message-footer',message);
   if(!eligible){footer?.remove();message.classList.remove('tts-speaking');continue;}
   if(!footer){const row=document.createElement('div');row.className='tts-message-footer';const button=document.createElement('button');button.type='button';button.className='tts-message-button';button.dataset.ttsRead='1';button.title='Read this message aloud';button.setAttribute('aria-label','Read this message aloud');button.innerHTML=speakerSVG;row.append(button);message.append(row);}
   this.syncMessageState(message,current);
  }
  this.scheduleAvailability();
 }
 syncMessageState(message,current=this.getContext()){
  const button=$('[data-tts-read]',message);if(!button)return;const isActive=!!(this.active&&!this.active.partial&&this.active.sourceId===current.sourceId&&this.active.messageId===message.dataset.messageId),available=this.availability.get(message)===true;
  message.classList.toggle('tts-speaking',isActive);button.classList.toggle('tts-available',available);button.dataset.ttsAvailable=String(available);button.setAttribute('aria-pressed',String(isActive));button.title=isActive?'Show speech playback':available?'Play saved or retained audio':'Generate speech for this message';button.setAttribute('aria-label',button.title);
 }
 scheduleAvailability(clear=false){
  clearTimeout(this.availabilityTimer);const serial=++this.availabilitySerial;
  if(clear){this.availability=new WeakMap();for(const message of this.host?$$('.message',this.host):[])this.syncMessageState(message);}
  if(!this.host||!this.config.enabled)return;this.availabilityTimer=setTimeout(()=>{void this.refreshAvailability(serial).catch(()=>{if(serial!==this.availabilitySerial)return;this.availability=new WeakMap();for(const message of this.host?$$('.message',this.host):[])this.syncMessageState(message);});},60);
 }
 messageFingerprint(message,fullText=canonicalMessageText(message)){
  const previous=this.messageFingerprints.get(message);if(previous?.fullText===fullText)return previous.promise;
  const promise=crypto.subtle.digest('SHA-256',new TextEncoder().encode(fullText)).then(buffer=>({version:1,sha256:[...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}));
  this.messageFingerprints.set(message,{fullText,promise});return promise;
 }
 async refreshAvailability(serial){
  const host=this.host,context={...this.getContext()};if(!host||!this.config.enabled||serial!==this.availabilitySerial)return;
  const current=()=>serial===this.availabilitySerial&&host===this.host&&context.sourceId===this.getContext().sourceId&&this.config.enabled;
  const bounds=host.getBoundingClientRect(),encoder=new TextEncoder(),batches=[];let batch=[],size=24,id=0;
  for(const message of $$('.message',host)){
   if(!$('[data-tts-read]',message))continue;const rect=message.getBoundingClientRect();if(!rect.height||rect.bottom<bounds.top-300||rect.top>bounds.bottom+300)continue;
   const text=speechText(message,this.config),fullText=canonicalMessageText(message);if(!fullText||text.length>100000||encoder.encode(text).length>256*1024){this.availability.delete(message);this.syncMessageState(message,context);continue;}
   const messageFingerprint=await this.messageFingerprint(message,fullText);if(!current())return;
   if(!host.contains(message)||message.dataset.messageId==null||canonicalMessageText(message)!==fullText||speechText(message,this.config)!==text)continue;
   const item={id:String(id++),text,messageFingerprint,sourceId:context.sourceId,messageId:message.dataset.messageId,thinking:message.dataset.role==='thinking'},cost=encoder.encode(JSON.stringify(item)).length+1;
   if(cost>450*1024){this.availability.delete(message);this.syncMessageState(message,context);continue;}if(batch.length&&(batch.length===64||size+cost>450*1024)){batches.push(batch);batch=[];size=24;}batch.push({message,item,fullText});size+=cost;
  }
  if(batch.length)batches.push(batch);const results=[];let revision=null;
  for(const entries of batches){const result=await this.invoke('tts.availability',{messages:entries.map(entry=>entry.item)});if(!current())return;if(result.revision<this.availabilityRevision)return;if(revision!==null&&revision!==result.revision){this.scheduleAvailability(true);return;}revision=result.revision;const matches=new Map((result.items||[]).map(item=>[String(item.id),item.available===true]));for(const entry of entries)results.push({...entry,available:matches.get(entry.item.id)===true});}
  for(const {message,item,fullText,available}of results){if(!host.contains(message)||message.dataset.messageId!==item.messageId||speechText(message,this.config)!==item.text||canonicalMessageText(message)!==fullText)continue;this.availability.set(message,available);this.syncMessageState(message,context);}
 }
 async startMessage(message){
  const serial=++this.serial;if(!message||!this.config.enabled)return;
  const host=this.host,context={...this.getContext()},messageId=message.dataset.messageId,thinking=message.dataset.role==='thinking';
  if(thinking&&!this.config.includeThinking)return;
  const text=speechText(message,this.config),fullText=canonicalMessageText(message);if(!fullText)throw new Error('This message has no readable text with the selected speech settings.');
  const identity=synthesisIdentity(this.config),messageFingerprint=await this.messageFingerprint(message,fullText);
  if(serial!==this.serial||host!==this.host||!host?.contains(message)||!this.config.enabled||thinking&&!this.config.includeThinking||context.sourceId!==this.getContext().sourceId||message.dataset.messageId!==messageId||identity!==synthesisIdentity(this.config)||canonicalMessageText(message)!==fullText||speechText(message,this.config)!==text)return;
  if(this.active?.messageId===messageId&&this.active.sourceId===context.sourceId&&this.active.request.text===text&&this.active.request.messageFingerprint?.sha256===messageFingerprint.sha256&&this.active.synthesisIdentity===identity&&!this.active.reselectionNeeded&&!this.active.partial&&!this.active.player.failed){this.pill?.querySelector('[data-tts-control="play"]')?.focus();return;}
  const role=({thinking:'Reasoning',user:'User',assistant:'Assistant',system:'System',tool:'Tool'})[message.dataset.role]||'Message';
  await this.start({text,messageFingerprint,sourceId:context.sourceId,messageId,thinking,label:role+' · '+(Number(message.dataset.turnIndex)+1)});
 }
 createSession({requestId,purpose,settings,request,label}){
  const session={requestId,purpose,request,label,recording:{provider:settings.provider,voice:settings.voice,model:settings.model},synthesisIdentity:synthesisIdentity(settings),receiving:true,complete:false,stopped:false,partial:false,streamCount:0,seen:new Set(),cacheKey:null,cached:false,error:'',cancelled:false,released:false};
  session.player=new globalThis.ThreadShelfTtsPlayer({rate:settings.playbackRate,volume:settings.volume,meter:purpose==='preview',onState:state=>{if(!this.isSessionCurrent(session))return;if(state.ended&&!session.released&&session.complete){session.released=true;this.protectPlayback(false);}purpose==='preview'?this.syncTest():this.syncPill();},onLevel:level=>{if(this.testSession===session)this.updateMeter(level);},onError:error=>this.sessionError(session,error)});
  return session;
 }
 isSessionCurrent(session){return session.purpose==='preview'?this.testSession===session:this.active===session;}
 receiveTtsEvent(event){
  if(event?.state==='availability-changed'){this.availabilityRevision=Math.max(this.availabilityRevision,Number(event.revision)||0);if(this.active?.complete)this.active.reselectionNeeded=true;this.scheduleAvailability(true);return;}
  const session=event?.purpose==='preview'?this.testSession:event?.purpose==='conversation'?this.active:null;
  if(!session||session.requestId!==event.requestId||session.cancelled||!session.receiving)return;
  if(event.recording){session.recording={...event.recording};if(session.purpose==='conversation')this.syncPill();}
  if(event.state==='audio'){
   if(session.seen.has(event.clipIndex))return;session.seen.add(event.clipIndex);session.streamCount++;
   void session.player.append({audioBase64:event.audioBase64,mime:event.mime}).catch(error=>this.sessionError(session,error));
  }else if(event.state==='generating'||event.state==='started'){session.streamingMode=event.streamingMode;session.purpose==='preview'?this.syncTest():this.syncPill();}
 }
 async completeSession(session,result){
  if(!this.isSessionCurrent(session)||session.cancelled||session.error)return;
  if(result.recording)session.recording={...result.recording};
  if(result?.complete!==true)throw new Error('Audio generation did not finish. Play again to generate the complete recording.');
  if(!session.streamCount){const clips=Array.isArray(result.audioClips)&&result.audioClips.length?result.audioClips:result.audioBase64?[result]:[];if(!clips.length)throw new Error('The speech provider returned no playable audio.');for(const clip of clips)await session.player.append(clip);}
  await session.player.finish();if(!this.isSessionCurrent(session)||session.cancelled||session.error)return;
  session.receiving=false;session.complete=true;session.cacheKey=result.cacheKey;session.cached=!!result.cached;session.cacheSource=result.cacheSource||null;
  if(session.purpose==='conversation'){this.protectPlayback(!session.player.snapshot().ended);this.syncPill();this.scheduleAvailability(true);}else this.syncTest();
 }
 sessionError(session,error){
  if(!this.isSessionCurrent(session)||session.cancelled||session.error&&!session.receiving)return;session.partial=session.partial||!session.complete;session.error=error?.message||String(error);session.receiving=false;if(session.partial)session.player.dispose();else session.player.pause();
  void this.invoke('tts.cancel',{requestId:session.requestId}).catch(()=>{});
  if(session.purpose==='preview')this.syncTest();else{this.syncMessages();this.syncPill();this.onError(error);}
 }
 async start({text,messageFingerprint,sourceId,messageId,thinking=false,label='Message'}){
  this.stop(true);this.disposeTest();if(!this.config.enabled)throw new Error('Enable Text-to-Speech and save the settings first.');
  const requestId=crypto.randomUUID(),request={text,messageFingerprint,sourceId,messageId,thinking,label};
  const session=this.createSession({requestId,purpose:'conversation',settings:this.config,request,label});Object.assign(session,{sourceId,messageId,thinking});this.active=session;this.requestId=requestId;this.playbackRequestId=requestId;
  this.makePill();this.syncMessages();
  try{const playing=session.player.play();await playing;if(!this.isSessionCurrent(session)||session.cancelled)return;const result=await this.invoke('tts.synthesize',{requestId,text,messageFingerprint,sourceId,messageId,thinking});await this.completeSession(session,result);}catch(error){this.sessionError(session,error);}
 }
 async togglePlayback(session){
  if(!session)return;if(session.partial||session.player.failed){if(session.purpose==='preview')return this.startTest();return this.start(session.request);}const state=session.player.snapshot();
  if(!state.hasAudio&&!session.receiving){if(session.purpose==='preview')return this.startTest();return this.start(session.request);}
  session.error='';session.stopped=false;
  if(state.playing||state.buffering){session.player.pause();}else{if(session.purpose==='conversation'){session.released=false;this.protectPlayback(true);}await session.player.play();}
 }
 async replaySession(session){
  if(!session)return;if(session.partial||session.player.failed||!session.player.snapshot().hasAudio){if(session.purpose==='preview')return this.startTest();return this.start(session.request);}
  session.error='';session.stopped=false;if(session.purpose==='conversation'){session.released=false;this.protectPlayback(true);}await session.player.replay();
 }
 haltSession(session){
  if(session?.purpose==='conversation')this.serial++;if(!session)return;session.partial=session.partial||!session.complete;session.cancelled=true;session.receiving=false;session.stopped=true;if(session.partial)session.player.dispose();else session.player.stop();void this.invoke('tts.cancel',{requestId:session.requestId}).catch(()=>{});
  if(session.purpose==='conversation'){this.requestId=null;this.protectPlayback(false);this.syncMessages();this.syncPill();}else this.syncTest();
 }
 playbackStatus(session){
  if(!session)return 'Ready to test the current selection.';const state=session.player.snapshot();
  if(session.error)return session.error;if(session.stopped)return session.partial?'Stopped · audio incomplete':'Stopped';if(state.ended)return session.partial?'Audio incomplete':'Finished';if(state.paused)return 'Paused';if(state.buffering)return state.hasAudio?'Buffering audio…':'Preparing audio…';if(state.playing)return session.receiving?'Playing · generating audio':session.cached?(session.cacheSource==='session'?'Playing session audio':'Playing cached audio'):session.partial?'Audio incomplete':'Playing';return session.receiving?'Preparing audio…':'Ready';
 }
 makePill(){
  if(!this.host)return;this.pill?.remove();this.pill=document.createElement('section');this.pill.className='tts-pill';this.pill.setAttribute('aria-label','TTS bar');
  const control=(name,label)=>`<button type="button" data-tts-control="${name}" title="${label}" aria-label="${label}">${name==='play'?`<span data-play-glyph>${svg('play')}</span><span data-pause-glyph hidden>${svg('pause')}</span>`:svg(name)}</button>`;
  this.pill.innerHTML=`<div class="tts-pill-controls">${control('play','Pause speech')}${control('stop','Stop speech')}${control('replay','Replay speech')}</div><div class="tts-pill-main"><div class="tts-pill-caption"><span class="tts-pill-label"></span><span class="tts-pill-time">0:00</span></div><div class="tts-indeterminate tts-pill-indeterminate" role="progressbar" aria-label="Generating speech" aria-busy="true" hidden></div><input type="range" class="tts-pill-progress" min="0" max="1000" step="1" value="0" aria-label="Speech position"><span class="tts-pill-status" role="status" aria-live="polite"></span></div><label class="tts-pill-rate" title="Playback speed"><span class="sr-only">Playback speed</span><select aria-label="Playback speed">${[0.5,0.75,1,1.25,1.5,1.75,2].map(value=>`<option value="${value}">${value}×</option>`).join('')}</select></label><div class="tts-pill-volume">${control('volume','Speech volume')}<div class="tts-volume-inline" id="ttsVolumeInline" hidden><input id="ttsPillVolume" type="range" min="0" max="100" step="1" value="100" aria-label="Speech volume"><output class="sr-only" id="ttsPillVolumeValue" for="ttsPillVolume">100%</output></div></div>${control('settings','Text-to-Speech settings')}${control('close','Close speech playback')}`;
  this.pill.addEventListener('click',event=>{const control=event.target.closest('button[data-tts-control]');if(!control||control.disabled)return;const action=control.dataset.ttsControl;if(action==='stop')this.halt();else if(action==='close')this.stop(true);else if(action==='settings')this.onSettings();else if(action==='play')void this.togglePlayback(this.active).catch(this.onError);else if(action==='replay')void this.replaySession(this.active).catch(this.onError);else if(action==='volume'){const slider=$('.tts-volume-inline',this.pill);slider.hidden=!slider.hidden;control.setAttribute('aria-expanded',String(!slider.hidden));}});
  $('.tts-pill-progress',this.pill).addEventListener('input',event=>this.seekSession(this.active,event.target.value));
  $('.tts-pill-rate select',this.pill).addEventListener('change',event=>{const value=Number(event.target.value);this.active?.player.setRate(value);this.config.playbackRate=value;void this.invoke('tts.settings.save',{settings:{playbackRate:value}}).catch(this.onError);});
  $('#ttsPillVolume',this.pill).addEventListener('input',event=>{const value=Number(event.target.value)/100;this.active?.player.setVolume(value);this.config.volume=value;$('#ttsPillVolumeValue',this.pill).textContent=Math.round(value*100)+'%';this.styleRange(event.target);});
  $('#ttsPillVolume',this.pill).addEventListener('change',()=>{void this.invoke('tts.settings.save',{settings:{volume:this.config.volume}}).catch(this.onError);});
  this.pill.addEventListener('keydown',event=>{if(event.key==='Escape'){$('.tts-volume-inline',this.pill).hidden=true;$('[data-tts-control=volume]',this.pill).setAttribute('aria-expanded','false');event.stopPropagation();}});
  $('[data-tts-control=volume]',this.pill).setAttribute('aria-expanded','false');$('[data-tts-control=volume]',this.pill).setAttribute('aria-controls','ttsVolumeInline');
  this.host.append(this.pill);this.host.classList.add('tts-player-visible');this.syncPill();
 }
 syncTransport(root,session,selector){
  const state=session?.player.snapshot(),playing=!!(state?.playing||state?.buffering);const button=$(selector,root);if(!button)return;
  $('[data-play-glyph]',button).hidden=playing;$('[data-pause-glyph]',button).hidden=!playing;button.disabled=!session;button.title=session?.partial?'Generate full audio':session?.player.failed?'Retry audio generation':playing?'Pause playback':state?.ended?'Play again':'Resume playback';button.setAttribute('aria-label',button.title);
 }
 styleRange(input){if(!input)return;const min=Number(input.min)||0,max=Number(input.max)||1,value=Number(input.value)||0;input.style.setProperty('--tts-range-fill',Math.max(0,Math.min(100,(value-min)/(max-min)*100))+'%');}
 durationPending(session,state){return !!session&&!session.partial&&(session.receiving||!state?.complete&&!session.player.failed);}
 seekSession(session,value){if(!session?.complete||session.partial||session.receiving)return;const state=session.player.snapshot();if(state.complete&&!session.player.failed)session.player.seek(Math.max(0,Math.min(1000,Number(value)||0))/1000*state.duration);}
 syncProgress(input,indicator,session,state){
  if(!input)return;const pending=this.durationPending(session,state);input.hidden=pending;input.disabled=pending||!session?.complete||!!session?.partial||!state?.hasAudio||!!session?.player.failed;indicator.hidden=!pending;
  // Received chunks do not reveal the final length. Keep an indeterminate track until generation settles.
  if(!pending){input.value=session?.partial?0:state?.ended?1000:state?.duration?Math.round(state.currentTime/state.duration*1000):0;this.styleRange(input);}
 }
 syncPill(){
  if(!this.pill||!this.active)return;const session=this.active,state=session.player.snapshot();
  setText($('.tts-pill-label',this.pill),session.label);const recording=session.recording||{};$('.tts-pill-label',this.pill).title=[session.label,PROVIDERS.find(([id])=>id===recording.provider)?.[1]||recording.provider,recording.voice].filter(Boolean).join(' · ');setText($('.tts-pill-status',this.pill),this.playbackStatus(session));setText($('.tts-pill-time',this.pill),time(state.currentTime)+' / '+(session.partial||this.durationPending(session,state)?'…':time(state.duration)));
  this.syncTransport(this.pill,session,'[data-tts-control=play]');const replay=$('[data-tts-control=replay]',this.pill);replay.disabled=!session.partial&&(session.player.failed||!state.hasAudio&&session.receiving);replay.title=session.partial?'Generate full audio':'Replay speech';replay.setAttribute('aria-label',replay.title);
  this.syncProgress($('.tts-pill-progress',this.pill),$('.tts-pill-indeterminate',this.pill),session,state);
  $('.tts-pill-rate',this.pill).hidden=!this.config.showPillSpeed;$('.tts-pill-rate select',this.pill).value=String(state.rate);$('.tts-pill-volume',this.pill).hidden=!this.config.showPillVolume;const volume=$('#ttsPillVolume',this.pill);if(document.activeElement!==volume)volume.value=String(Math.round(state.volume*100));setText($('#ttsPillVolumeValue',this.pill),Math.round(state.volume*100)+'%');this.styleRange(volume);
  $('[data-tts-control=settings]',this.pill).hidden=!this.config.showPillSettings;this.pill.classList.toggle('tts-loading',session.receiving&&!state.hasAudio);
 }
 protectPlayback(active){const session=this.active;if(session?.complete)void this.invoke('tts.playback',{requestId:session.requestId,cacheKey:session.cacheKey||null,active}).catch(()=>{});}
 halt(){this.haltSession(this.active);}
 stop(hide=true){
  this.serial++;const session=this.active;this.protectPlayback(false);this.active=null;this.requestId=null;this.playbackRequestId=null;if(session){session.cancelled=true;void this.invoke('tts.cancel',{requestId:session.requestId}).catch(()=>{});session.player.dispose();}
  if(hide){this.pill?.remove();this.pill=null;this.host?.classList.remove('tts-player-visible');}for(const node of this.host?$$('.message',this.host):[])this.syncMessageState(node);this.scheduleAvailability();
 }
 async startTest(){
  if(!this.formRoot?.isConnected)return;const settings=this.collectSettings(),text=$('#tts-testText',this.formRoot).value.trim();if(!text)throw new Error('Enter a short passage to test.');
  this.stop(true);this.disposeTest();const requestId=crypto.randomUUID(),provider=settings.provider,key=this.pendingKeys[provider];
  const session=this.createSession({requestId,purpose:'preview',settings,request:{text,settings},label:'Audio test'});this.testSession=session;this.syncTest();
  try{const playing=session.player.play();await playing;const result=await this.invoke('tts.preview',{requestId,text,settings,...(key?{apiKey:key.apiKey}:{})});await this.completeSession(session,result);}catch(error){this.sessionError(session,error);}
 }
 disposeTest(){const session=this.testSession;this.testSession=null;if(session){session.cancelled=true;void this.invoke('tts.cancel',{requestId:session.requestId}).catch(()=>{});session.player.dispose();}this.updateMeter({rms:0,db:-Infinity,peak:0});this.syncTest();}
 updateMeter({rms=0,db=-Infinity,peak=0}={}){const root=this.formRoot;if(!root?.isConnected)return;const meter=$('#ttsTestMeter',root);if(!meter)return;meter.value=Math.max(0,Math.min(1,rms));meter.dataset.rms=String(rms);meter.dataset.peak=String(peak);meter.setAttribute('aria-valuetext',Number.isFinite(db)?db.toFixed(1)+' dBFS':'Silent');setText($('#ttsTestLevel',root),Number.isFinite(db)?Math.round(db)+' dBFS':'−∞ dBFS');}
 syncTest(){
  const root=this.formRoot;if(!root?.isConnected)return;const session=this.testSession,state=session?.player.snapshot();setText($('#ttsTestStatus',root),this.playbackStatus(session));this.syncTransport(root,session,'[data-tts-action=test-play]');for(const action of ['test-stop','test-replay']){const button=$(`[data-tts-action=${action}]`,root);if(button){button.disabled=!session||action==='test-replay'&&!session.partial&&(!state.hasAudio||session.player.failed);if(action==='test-replay'){button.title=session?.partial?'Generate full test audio':'Replay test audio';button.setAttribute('aria-label',button.title);}}}
  this.syncProgress($('#ttsTestSeek',root),$('#ttsTestIndeterminate',root),session,state);setText($('#ttsTestTime',root),time(state?.currentTime)+' / '+(session?.partial||this.durationPending(session,state)?'…':time(state?.duration)));
 }
 memoryLimitHTML(value){
  const index=SESSION_MEMORY_LIMITS.indexOf(value),selected=index<0?1:index;
  return field('tts-sessionCacheMaxMiB','Temporary audio memory limit',`<div class="tts-memory-control" style="--tts-memory-position:${selected/3*100}%" data-memory-mib="${SESSION_MEMORY_LIMITS[selected]}"><div class="tts-memory-rail" aria-hidden="true">${SESSION_MEMORY_LIMITS.map((limit,i)=>`<span class="tts-memory-stop" style="left:${i/3*100}%"></span><span class="tts-memory-label" style="left:${i/3*100}%">${limit} MB</span>`).join('')}<span class="tts-memory-marker"></span></div><input id="tts-sessionCacheMaxMiB" type="range" min="0" max="3" step="1" value="${selected}" aria-valuetext="${SESSION_MEMORY_LIMITS[selected]} MB" aria-describedby="ttsSessionMemoryHelp"><output class="sr-only" id="tts-session-memory-value" for="tts-sessionCacheMaxMiB">${SESSION_MEMORY_LIMITS[selected]} MB</output></div><span class="fine" id="ttsSessionMemoryHelp">Keeps up to the last three recordings for this session; cleared on exit.</span>`);
 }
 syncMemoryLimit(input){if(!input)return;const index=Math.max(0,Math.min(3,Math.round(Number(input.value)||0))),value=SESSION_MEMORY_LIMITS[index],control=input.closest('.tts-memory-control');input.value=String(index);input.setAttribute('aria-valuetext',value+' MB');control.style.setProperty('--tts-memory-position',index/3*100+'%');control.dataset.memoryMib=String(value);setText($('#tts-session-memory-value',control),value+' MB');}
 settingsHTML(){
  const s=this.config;
  const playback=`<div class="tts-toggle-grid">${toggle('enabled','Enable Text-to-Speech','Show message speaker buttons.',s.enabled)}${toggle('includeThinking','Read thinking bubbles','Include visible reasoning messages.',s.includeThinking)}${toggle('streamingEnabled','Stream audio','Start listening as audio arrives.',s.streamingEnabled)}${toggle('showPillSettings','Show TTS bar settings','Open this tab from playback.',s.showPillSettings)}${toggle('showPillSpeed','Show TTS bar speed','Adjust speed during playback.',s.showPillSpeed)}${toggle('showPillVolume','Show TTS bar volume','Adjust volume during playback.',s.showPillVolume)}${toggle('readCode','Read code blocks','Inline code labels are always read.',s.readCode)}${toggle('readCitations','Read citation labels','Include file and source names.',s.readCitations)}</div><div class="field-row tts-playback-fields">${field('tts-playbackRate','Playback speed',select('tts-playbackRate',[.5,.75,1,1.25,1.5,1.75,2].map(v=>[v,v+'×']),s.playbackRate))}${field('tts-volume','Master volume',`<div class="tts-volume-setting"><input id="tts-volume" type="range" min="0" max="100" step="1" value="${Math.round(s.volume*100)}"><output id="ttsVolumeValue" for="tts-volume">${Math.round(s.volume*100)}%</output></div>`)}</div><p class="fine">Streaming begins with the first playable audio. Providers that require complete sections are checked before those sections play.</p>${this.memoryLimitHTML(s.sessionCacheMaxMiB)}`;
  const providers=`${field('tts-provider','Provider',select('tts-provider',PROVIDERS,s.provider))}<div id="ttsProviderFields"></div><p id="ttsProviderStatus" class="fine" role="status"></p>`;
  const test=`<p class="fine">Test the current provider, voice and key without saving. This works with Text-to-Speech disabled and never uses the audio cache.</p><p id="ttsTestSelection" class="fine tts-test-selection"></p>${field('tts-testText','Test passage',`<textarea class="tts-scrollbar" id="tts-testText" rows="3" maxlength="4000">A clear voice makes a long conversation easier to follow. Pause for a moment, then continue at a comfortable pace.</textarea>`)}<div class="tts-test-seek"><div id="ttsTestIndeterminate" class="tts-indeterminate" role="progressbar" aria-label="Generating test audio" aria-busy="true" hidden></div><input id="ttsTestSeek" type="range" min="0" max="1000" step="1" value="0" disabled aria-label="Test audio position"><output id="ttsTestTime">0:00 / 0:00</output></div><p class="fine">The level meter measures the audio output. Remote providers may charge for each new test; replay uses the current test audio.</p>`;
  const cache=`${toggle('cacheEnabled','Save generated audio','Reuse matching audio on later playback.',s.cacheEnabled)}${toggle('preferApiCache','Prefer API recordings','Reuse API audio for the unchanged full message, including after voice or reading-filter changes.',s.preferApiCache)}<p class="fine">Pinned recordings always take priority for the unchanged full message. Reused audio keeps its recorded code and citation choices; new settings never overwrite a pin.</p><div class="field-row">${field('tts-cacheMaxMiB','Maximum size (MiB)',`<input id="tts-cacheMaxMiB" type="number" min="16" max="102400" step="1" value="${Math.round(s.cacheMaxBytes/1048576)}">`)}${field('tts-cacheMaxAgeDays','Expiry (days)',`<input id="tts-cacheMaxAgeDays" type="number" min="0" max="3650" step="1" value="${s.cacheMaxAgeDays}">`,'0 keeps clips until the size limit or deletion.')}</div><div class="manager-stats tts-cache-stats"><div><dt>Saved clips</dt><dd id="ttsCacheCount">—</dd></div><div><dt>Disk space</dt><dd id="ttsCacheBytes">—</dd></div></div><p id="ttsSessionSummary" class="fine" hidden></p><p id="ttsCacheSummary" class="fine" role="status"></p><div class="manager-files tts-cache-list tts-scrollbar" id="ttsCacheList"></div><div class="manager-pagination tts-cache-pagination" id="ttsCachePagination" hidden><span id="ttsCachePageLabel" role="status"></span><div><button type="button" class="secondary" data-tts-action="cache-prev">Previous</button><button type="button" class="secondary" data-tts-action="cache-next">Next</button></div></div><div class="field-row" id="ttsCacheDeletion">${field('tts-cacheScope','Delete scope',select('tts-cacheScope',[['selected','Selected clips'],['conversation','Current conversation'],['provider','Selected provider'],['older','Older clips'],['incomplete','Incomplete files'],['all','All unpinned audio']],'selected'))}<div id="ttsCacheOlderField" hidden>${field('tts-cacheOlder','Older than (days)',`<input id="tts-cacheOlder" type="number" min="1" max="3650" value="30">`)}</div></div><div class="manager-toolbar"><button type="button" class="secondary" data-tts-action="cache-refresh">Refresh</button><button type="button" class="secondary" data-tts-action="cache-preview">Review deletion</button></div><div id="ttsCacheDelete" class="manager-dialog" hidden></div><p class="fine">Pinned and playing clips are protected. Turning the cache off keeps existing files until you delete them.</p>`;
  const testControl=(action,label,glyph)=>`<button type="button" class="icon-button" data-tts-action="${action}" title="${label}" aria-label="${label}" disabled>${glyph==='play'?`<span data-play-glyph>${svg('play')}</span><span data-pause-glyph hidden>${svg('pause')}</span>`:svg(glyph)}</button>`;
  return `<div class="tts-settings"><header class="tts-settings-heading"><h3>Text-to-Speech</h3></header><div class="manager-tabs tts-subtabs" role="tablist" aria-label="Text-to-Speech settings">${[['playback','Playback'],['providers','Providers & voices'],['test','Audio test'],['cache','Audio cache']].map(([key,label])=>`<button type="button" id="ttsTab-${key}" data-tts-tab="${key}" role="tab" aria-selected="${key==='playback'}" aria-pressed="${key==='playback'}" aria-controls="ttsPanel-${key}" tabindex="${key==='playback'?'0':'-1'}">${label}</button>`).join('')}</div><div class="tts-subpanels tts-scrollbar">${[['playback',playback],['providers',providers],['test',test],['cache',cache]].map(([key,content])=>`<section id="ttsPanel-${key}" data-tts-panel="${key}" role="tabpanel" aria-labelledby="ttsTab-${key}" ${key==='playback'?'':'hidden'}>${content}</section>`).join('')}</div><div class="tts-test-toolbar" hidden><div class="tts-test-controls"><button type="button" class="secondary" data-tts-action="test">Test audio</button>${testControl('test-play','Pause test audio','play')}${testControl('test-stop','Stop test audio','stop')}${testControl('test-replay','Replay test audio','replay')}<div class="tts-test-meter"><meter id="ttsTestMeter" min="0" max="1" value="0" aria-label="Test audio output level"></meter><output id="ttsTestLevel">−∞ dBFS</output></div></div><p id="ttsTestStatus" class="fine" role="status">Ready to test the current selection.</p></div><p id="ttsSettingsStatus" class="fine tts-settings-feedback" role="status">${esc(s.warning||'')}</p></div>`;
 }
 selectSubtab(tab,{focus=false}={}){
  const root=this.formRoot;if(!root)return;this.subtab=tab;for(const panel of $$('[data-tts-panel]',root))panel.hidden=panel.dataset.ttsPanel!==tab;for(const button of $$('[data-tts-tab]',root)){const selected=button.dataset.ttsTab===tab;button.setAttribute('aria-selected',String(selected));button.setAttribute('aria-pressed',String(selected));button.tabIndex=selected?0:-1;}
  $('.tts-subpanels',root).scrollTop=0;$('.tts-test-toolbar',root).hidden=!['providers','test'].includes(tab);if(tab==='cache')void this.loadCache().catch(error=>this.formStatus(error.message,true));if(tab==='test')this.syncTestSelection();if(focus)$(`[data-tts-tab=${tab}]`,root)?.focus();
 }
 syncTestSelection(){const root=this.formRoot;if(!root||!this.draft)return;this.captureProvider();const profile=this.draft;setText($('#ttsTestSelection',root),(PROVIDERS.find(([id])=>id===profile.provider)?.[1]||profile.provider)+' · '+(profile.voice||'Choose a voice')+' · '+profile.model);}
 bindSettings(root){
  this.formAbort?.abort();this.formAbort=new AbortController();this.formRoot=root;this.draft=clone(this.config);this.pendingKeys={};this.selected.clear();this.cachePage=0;this.renderProvider();this.selectSubtab('playback');void this.invoke('tts.credentials.status').then(result=>{this.credentials=result.providers||{};if(root===this.formRoot&&root.isConnected)this.renderCredentialStatus();}).catch(()=>{});
  root.addEventListener('change',event=>{
   if(event.target.id==='tts-provider'){this.disposeTest();this.captureProvider();this.draft.provider=event.target.value;Object.assign(this.draft,this.draft.providerProfiles?.[this.draft.provider]||PROFILES[this.draft.provider]);this.renderProvider();}
   else if(['tts-model','tts-voice','tts-endpoint','tts-apiKey','tts-testText','tts-streamingEnabled'].includes(event.target.id)){this.disposeTest();if(event.target.id==='tts-model')this.updateDiscoveredVoices({selectDefault:true});}
   if(event.target.dataset.ttsCacheKey){event.target.checked?this.selected.add(event.target.dataset.ttsCacheKey):this.selected.delete(event.target.dataset.ttsCacheKey);this.syncCacheSummary();$('#ttsCacheDelete',root).hidden=true;}
   if(event.target.id==='tts-cacheScope'){$('#ttsCacheOlderField',root).hidden=event.target.value!=='older';$('#ttsCacheDelete',root).hidden=true;}
   if(event.target.id==='tts-playbackRate')this.testSession?.player.setRate(Number(event.target.value));
  },{signal:this.formAbort.signal});
  root.addEventListener('input',event=>{if(event.target.id==='tts-sessionCacheMaxMiB')this.syncMemoryLimit(event.target);if(event.target.id==='tts-endpoint'){this.disposeTest();delete this.pendingKeys[this.draft.provider];const key=$('#tts-apiKey',root);if(key){key.value='';delete key.dataset.dirty;key.placeholder='Enter a key for this endpoint';}const passphrase=$('#tts-keyPassphrase',root);if(passphrase)passphrase.value='';}if(event.target.id==='tts-apiKey')event.target.dataset.dirty='true';if(event.target.id==='tts-volume'){const value=Number(event.target.value)/100;setText($('#ttsVolumeValue',root),Math.round(value*100)+'%');this.testSession?.player.setVolume(value);this.styleRange(event.target);}}, {signal:this.formAbort.signal});
  root.addEventListener('click',event=>{const tab=event.target.closest('[data-tts-tab]');if(tab){event.preventDefault();this.selectSubtab(tab.dataset.ttsTab);return;}const button=event.target.closest('[data-tts-action]');if(!button||button.disabled)return;event.preventDefault();void this.settingsAction(button).catch(error=>this.formStatus(error.message,true));},{signal:this.formAbort.signal});
  root.addEventListener('keydown',event=>{const tab=event.target.closest('[data-tts-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=['playback','providers','test','cache'],index=tabs.indexOf(tab.dataset.ttsTab);this.selectSubtab(tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length],{focus:true});},{signal:this.formAbort.signal});
  $('#ttsTestSeek',root).addEventListener('input',event=>this.seekSession(this.testSession,event.target.value),{signal:this.formAbort.signal});this.styleRange($('#tts-volume',root));this.syncTest();
 }
 captureProvider(){
  if(!this.formRoot)return;const provider=this.draft.provider;for(const key of PROFILE_FIELDS){const input=$('#tts-'+key,this.formRoot);if(input)this.draft[key]=key==='timeoutSeconds'?Number(input.value):input.value.trim();}
  this.draft.providerProfiles??=clone(PROFILES);this.draft.providerProfiles[provider]=Object.fromEntries(PROFILE_FIELDS.map(key=>[key,this.draft[key]]));
  const key=$('#tts-apiKey',this.formRoot);if(key&&(key.value||key.dataset.dirty==='true'||Object.prototype.hasOwnProperty.call(this.pendingKeys,provider)))this.pendingKeys[provider]={apiKey:key.value.trim(),endpoint:this.draft.endpoint,remember:!!$('#tts-rememberKey',this.formRoot)?.checked,passphrase:$('#tts-keyPassphrase',this.formRoot)?.value||''};
 }
 renderProvider(){
  const root=this.formRoot,s=this.draft,id=s.provider,local=['pocket','kokoro'].includes(id),realtime=id==='openai-realtime',voices=id==='pocket'?POCKET:id==='kokoro'?KOKORO:realtime?REALTIME:null;
  const models=realtime?[['gpt-realtime-2.1-mini','gpt-realtime-2.1-mini'],['gpt-realtime-2.1','gpt-realtime-2.1']]:[];
  const endpoint=field('tts-endpoint','Endpoint',`<input id="tts-endpoint" type="text" value="${esc(s.endpoint)}" spellcheck="false" ${id==='selfhosted'?'':'readonly'}>`,id==='selfhosted'?'Localhost, a LAN address or a remote server; include the speech API path.':'');
  const model=field('tts-model','Model',local?`<input id="tts-model" value="${esc(s.model)}" readonly>`:`<input id="tts-model" value="${esc(s.model)}" list="ttsModels" spellcheck="false"><datalist id="ttsModels">${models.map(([id])=>`<option value="${esc(id)}"></option>`).join('')}</datalist>`);
  const voice=field('tts-voice','Voice',voices?select('tts-voice',voices,s.voice):`<input id="tts-voice" value="${esc(s.voice)}" list="ttsVoices" spellcheck="false"><datalist id="ttsVoices"></datalist>`);
  const keyStorage=`<details class="tts-provider-details"><summary>Saved key and encryption</summary><label class="check-field"><input id="tts-rememberKey" type="checkbox" ${this.pendingKeys[id]?.remember?'checked':''}><span>Remember this key encrypted</span></label>${field('tts-keyPassphrase','Encryption passphrase',`<input id="tts-keyPassphrase" type="password" autocomplete="off" value="${esc(this.pendingKeys[id]?.passphrase||'')}" placeholder="Required for saving or unlocking">`,'At least 8 characters. The passphrase is never saved.')}<p id="ttsCredentialStatus" class="fine" role="status"></p><div class="button-row"><button type="button" class="secondary" data-tts-action="clear-key">Forget session key</button><button type="button" class="secondary" data-tts-action="unlock-key">Unlock saved key</button><button type="button" class="secondary" data-tts-action="forget-key">Remove saved key</button></div><div id="ttsKeyDelete" hidden class="manager-dialog"></div></details>`;
  $('#ttsProviderFields',root).innerHTML=`${local?`<p class="fine">${id==='pocket'?'English · six bundled voices':'English · 28 voices · full-precision model'} · CPU · ready offline.</p>`:id==='selfhosted'?endpoint:''}<div class="field-row">${model}${voice}</div>${local?'':`${field('tts-apiKey',id==='selfhosted'?'API key (optional)':'API key',`<input id="tts-apiKey" ${Object.prototype.hasOwnProperty.call(this.pendingKeys,id)?'data-dirty="true"':''} type="password" autocomplete="off" spellcheck="false" value="${esc(this.pendingKeys[id]?.apiKey||'')}" placeholder="${this.config.credentialStatus?.[id]?'Session key available':'Enter a key for this provider'}">`,'Used by Test immediately; stored for the session only when you Save.')}<div class="button-row"><button type="button" class="secondary" data-tts-action="discover">Find models and voices</button></div>${keyStorage}<details class="tts-provider-details"><summary>Request options</summary>${id==='selfhosted'?'':endpoint}<div class="field-row">${field('tts-timeoutSeconds','Timeout (seconds)',`<input id="tts-timeoutSeconds" type="number" min="1" max="1800" value="${s.timeoutSeconds}">`)}${realtime?'':field('tts-responseFormat','Audio format',select('tts-responseFormat',id==='selfhosted'?[['wav','WAV'],['mp3','MP3'],['pcm','PCM (streaming)']]:[['mp3','MP3'],['pcm','PCM (streaming)']],s.responseFormat),'PCM streams as generated when supported; compressed formats play in short completed sections.')}</div>${realtime?field('tts-instructions','Speaking instructions',`<textarea class="tts-scrollbar" id="tts-instructions" rows="3" maxlength="4000">${esc(s.instructions)}</textarea>`,'Each returned transcript is checked before its section plays. No microphone is used.') : ''}</details>`}`;
  setText($('#ttsProviderStatus',root),'');this.renderCredentialStatus();this.updateDiscoveredVoices();
 }
 updateDiscoveredVoices({selectDefault=false}={}){
  const root=this.formRoot;if(!root||!this.draft)return;const result=this.discovery[this.draft.provider];if(!result)return;const model=$('#tts-model',root)?.value;
  const selected=(result.models||[]).find(row=>(typeof row==='string'?row:row.id)===model),voices=this.draft.provider==='openrouter'?(selected?.voices||[]):selected?.voices||result.voices||[];
  const list=$('#ttsVoices',root);if(list)list.innerHTML=voices.map(item=>`<option value="${esc(typeof item==='string'?item:item.id)}">${esc(item.name||'')}</option>`).join('');
  const voice=$('#tts-voice',root),ids=voices.map(item=>typeof item==='string'?item:item.id);if(selectDefault&&voice&&ids.length&&!ids.includes(voice.value))voice.value=ids[0];
  const formats=selected?.formats?.filter(value=>this.draft.provider==='selfhosted'||value!=='wav'),format=$('#tts-responseFormat',root);if(format&&Array.isArray(formats)&&formats.length){const previous=format.value;format.replaceChildren(...formats.map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value==='pcm'?'PCM (streaming)':value.toUpperCase();return option;}));format.value=formats.includes(previous)?previous:formats[0];}
  if(this.draft.provider==='openrouter')setText($('#ttsProviderStatus',root),selected?`${voices.length} voices available for the selected model.`:'Choose a discovered model, or enter a supported model and voice ID.');
 }
 renderCredentialStatus(){const node=this.formRoot&&$('#ttsCredentialStatus',this.formRoot);if(!node)return;const status=this.credentials?.[this.draft.provider];node.textContent=status?.saved?(status.locked?'Encrypted key saved; unlock it for this session.':'Encrypted key saved and available this session.'):status?.available?'Session key available.':'No saved key. A key entered here is applied when you Save.';}
 async refreshCredentials(){const value=await this.invoke('tts.credentials.status');this.credentials=value.providers||{};this.renderCredentialStatus();}
 collectSettings(){
  this.captureProvider();const result=clone(this.draft);for(const name of BOOLEANS)result[name]=$('#tts-'+name,this.formRoot).checked;
  result.cacheMaxBytes=Number($('#tts-cacheMaxMiB',this.formRoot).value)*1048576;result.cacheMaxAgeDays=Number($('#tts-cacheMaxAgeDays',this.formRoot).value);result.playbackRate=Number($('#tts-playbackRate',this.formRoot).value);result.volume=Number($('#tts-volume',this.formRoot).value)/100;result.sessionCacheMaxMiB=SESSION_MEMORY_LIMITS[Number($('#tts-sessionCacheMaxMiB',this.formRoot).value)]??64;delete result.credentialStatus;delete result.warning;return result;
 }
 cancelSettings(){this.disposeTest();this.formAbort?.abort();this.pendingKeys={};this.draft=null;this.formRoot=null;this.deleteToken=null;}
 prepareSettingsChange(settings){
  this.serial++;const fields=['enabled','includeThinking','provider','voice','model','endpoint','instructions','responseFormat','cacheEnabled','preferApiCache','readCode','readCitations'];
  if(this.active?.receiving&&fields.some(key=>key in settings&&settings[key]!==this.config[key]))this.stop(true);
 }
 async restoreSettings(settings){this.prepareSettingsChange(settings);const config=await this.invoke('tts.settings.save',{settings});this.setConfig(config);return config;}
 async saveSettings(){
  if(!this.formRoot?.isConnected)return;
  const settings=this.collectSettings(),previous=clone(this.config),keys=clone(this.pendingKeys);for(const credentials of Object.values(keys))if(credentials.remember&&credentials.passphrase.length<8)throw new Error('Use at least 8 characters for the key encryption passphrase.');
  let saved=false;this.prepareSettingsChange(settings);
  try{const config=await this.invoke('tts.settings.save',{settings});saved=true;for(const [provider,credentials]of Object.entries(keys))await this.invoke('tts.credentials.set',{provider,...credentials});this.setConfig(config);this.pendingKeys={};return config;}
  catch(error){if(saved){try{await this.restoreSettings(previous);}catch(rollback){throw new Error(error.message+' The previous speech preferences could not be restored: '+rollback.message);}}throw error;}
 }

 formStatus(message,error=false){const node=this.formRoot&&$('#ttsSettingsStatus',this.formRoot);if(node){node.textContent=message;node.className='tts-settings-feedback '+(error?'inline-error':'fine');}}
 async settingsAction(button){
  const root=this.formRoot;if(!root?.isConnected)return;this.captureProvider();const profile=clone(this.draft),action=button.dataset.ttsAction;
  if(action==='discover'){
   this.captureProvider();button.disabled=true;const provider=profile.provider;const target=$('#ttsProviderStatus',root);target.textContent='Checking provider…';
   try{const result=await this.invoke('tts.providers.discover',{provider,endpoint:profile.endpoint,model:profile.model,...(this.pendingKeys[provider]?{apiKey:this.pendingKeys[provider].apiKey}:{})});if(!this.draft||this.draft.provider!==provider||!target.isConnected)return;this.discovery[provider]=result;for(const [name,items]of [['Models',result.models],['Voices',result.voices]]){const list=$('#tts'+name,root);if(list)list.innerHTML=(items||[]).map(item=>`<option value="${esc(typeof item==='string'?item:item.id)}">${esc(item.name||'')}</option>`).join('');}target.textContent=[`${result.models?.length||0} models · ${result.voices?.length||0} voices`,...(result.warnings||[])].join('. ');this.updateDiscoveredVoices();}catch(error){target.textContent=error.message;throw error;}finally{button.disabled=false;}
  }else if(action==='clear-key'){const provider=profile.provider;await this.invoke('tts.credentials.set',{provider,apiKey:'',endpoint:profile.endpoint});delete this.pendingKeys[provider];$('#tts-apiKey',root).value='';delete $('#tts-apiKey',root).dataset.dirty;await this.refreshCredentials();this.formStatus('Session key forgotten.');
  }else if(action==='unlock-key'){const passphrase=$('#tts-keyPassphrase',root).value;await this.invoke('tts.credentials.unlock',{provider:profile.provider,endpoint:profile.endpoint,passphrase});$('#tts-keyPassphrase',root).value='';delete this.pendingKeys[profile.provider];$('#tts-apiKey',root).value='';delete $('#tts-apiKey',root).dataset.dirty;await this.refreshCredentials();this.formStatus('Saved key unlocked for this session.');
  }else if(action==='forget-key'){const panel=$('#ttsKeyDelete',root);panel.hidden=false;panel.innerHTML='<p>Remove this provider’s encrypted saved key and its session key?</p><div class="button-row"><button type="button" class="danger" data-tts-action="forget-key-confirm">Remove key</button><button type="button" class="secondary" data-tts-action="forget-key-cancel">Cancel</button></div>';
  }else if(action==='forget-key-cancel'){$('#ttsKeyDelete',root).hidden=true;
  }else if(action==='forget-key-confirm'){await this.invoke('tts.credentials.forget',{provider:profile.provider,endpoint:profile.endpoint});delete this.pendingKeys[profile.provider];$('#tts-apiKey',root).value='';delete $('#tts-apiKey',root).dataset.dirty;$('#tts-keyPassphrase',root).value='';$('#ttsKeyDelete',root).hidden=true;await this.refreshCredentials();this.formStatus('Saved key removed.');
  }else if(action==='test'){await this.startTest();
  }else if(action==='test-play'){await this.togglePlayback(this.testSession);
  }else if(action==='test-stop'){this.haltSession(this.testSession);
  }else if(action==='test-replay'){await this.replaySession(this.testSession);
  }else if(action==='cache-prev'||action==='cache-next'){this.cachePage+=action==='cache-next'?1:-1;this.renderCachePage();$('#ttsCacheList',root).scrollTop=0;}else if(action==='cache-refresh')await this.loadCache();
  else if(action==='cache-pin'){await this.invoke('tts.cache.pin',{key:button.dataset.key,pinned:button.dataset.pinned!=='true'});await this.loadCache();}
  else if(action==='cache-preview'){
   const scope=$('#tts-cacheScope',root).value;const filter={scope,includePinned:false};if(scope==='conversation'){filter.sourceId=this.getContext().sourceId;if(!filter.sourceId)throw new Error('Open a conversation before selecting this scope.');}if(scope==='provider')filter.provider=$('#tts-provider',root).value;if(scope==='older')filter.olderThanDays=Number($('#tts-cacheOlder',root).value);if(scope==='selected')filter.keys=[...this.selected];
   const result=await this.invoke('tts.cache.preview',{filter});this.deleteToken=result.token;const panel=$('#ttsCacheDelete',root);panel.hidden=false;panel.innerHTML=`<h3 id="ttsCacheConfirmTitle" tabindex="-1">Delete audio?</h3><p>Delete <strong>${result.count}</strong> saved audio files (${bytes(result.bytes)}) and clear <strong>${result.sessionCount||0}</strong> temporary recordings (${bytes(result.sessionBytes||0)})?</p><p>${result.protectedCount||0} saved files and ${result.sessionProtectedCount||0} temporary recordings are protected and will be kept.</p><div class="manager-toolbar"><button type="button" class="danger" data-tts-action="cache-delete" ${result.count||result.sessionCount?'':'disabled'}>Delete reviewed audio</button><button type="button" class="secondary" data-tts-action="cache-cancel">Cancel</button></div>`;panel.scrollIntoView({block:'nearest'});$('#ttsCacheConfirmTitle',panel)?.focus({preventScroll:true});
  }else if(action==='cache-delete'){button.disabled=true;await this.invoke('tts.cache.delete',{token:this.deleteToken});this.deleteToken=null;await this.loadCache();this.formStatus('');}
  else if(action==='cache-cancel'){$('#ttsCacheDelete',root).hidden=true;this.deleteToken=null;$('[data-tts-action=cache-preview]',root)?.focus({preventScroll:true});}
 }
 async loadCache(){
  const root=this.formRoot;if(!root?.isConnected)return;const result=await this.invoke('tts.cache.list');if(root!==this.formRoot||!root.isConnected)return;this.entries=result.entries||[];const known=new Set(this.entries.map(entry=>entry.key));for(const key of this.selected)if(!known.has(key))this.selected.delete(key);
  setText($('#ttsCacheCount',root),this.entries.length);setText($('#ttsCacheBytes',root),bytes(result.totalBytes));setText($('#ttsCacheSummary',root),this.entries.length?'Select audio files to review before deletion.':result.session?.count?'Choose a scope to clear temporary audio.':'No saved audio.');
  const session=result.session||{count:0,totalBytes:0,maxEntries:3,maxBytes:67108864};const sessionSummary=$('#ttsSessionSummary',root);sessionSummary.hidden=!session.count;setText(sessionSummary,`${session.count} / ${session.maxEntries} temporary recordings · ${bytes(session.totalBytes)}. Cleared when the application closes.`);
  this.cacheSessionCount=session.count;this.renderCachePage();
  $('#ttsCacheList',root).hidden=!this.entries.length;$('#ttsCacheDeletion',root).hidden=!this.entries.length&&!session.count;$('[data-tts-action=cache-preview]',root).hidden=!this.entries.length&&!session.count;if(!this.entries.length&&session.count&&$('#tts-cacheScope',root).value==='selected')$('#tts-cacheScope',root).value='all';
  $('#ttsCacheDelete',root).hidden=true;this.scheduleAvailability(true);
 }
 syncCacheSummary(){const root=this.formRoot;if(!root)return;setText($('#ttsCacheSummary',root),this.selected.size?`${this.selected.size} selected across all pages.`:this.entries.length?'Select audio files to review before deletion.':this.cacheSessionCount?'Choose a scope to clear temporary audio.':'No saved audio.');}
 renderCachePage(){
  const root=this.formRoot;if(!root?.isConnected)return;const pages=Math.max(1,Math.ceil(this.entries.length/15));this.cachePage=Math.max(0,Math.min(this.cachePage,pages-1));const start=this.cachePage*15,page=this.entries.slice(start,start+15);
  $('#ttsCacheList',root).innerHTML=this.entries.length?page.map(entry=>`<div class="tts-cache-entry manager-file"><label><input type="checkbox" data-tts-cache-key="${esc(entry.key)}" ${this.selected.has(entry.key)?'checked':''} ${entry.pinned?'disabled':''}><span><strong>${esc(entry.orphan?'Incomplete cache file':entry.voice||entry.provider)}</strong><small>${esc(PROVIDERS.find(([id])=>id===entry.provider)?.[1]||entry.provider)} · ${bytes(entry.bytes)}</small><small title="${esc(entry.sourceId)}">${esc(entry.orphan?entry.key.slice(0,16)+'…':sourceLabel(entry.sourceId))}</small><small>${esc(entry.messageId||'Audio')} · ${esc(new Date(entry.createdAt).toLocaleDateString())}</small></span></label><button type="button" class="secondary" data-tts-action="cache-pin" ${entry.orphan?'disabled title="Incomplete files cannot be pinned"':''} data-key="${esc(entry.key)}" data-pinned="${!!entry.pinned}" aria-pressed="${!!entry.pinned}">${entry.pinned?'Unpin':'Pin'}</button></div>`).join(''):'';
  $('#ttsCachePagination',root).hidden=pages<=1;setText($('#ttsCachePageLabel',root),`Page ${this.cachePage+1} of ${pages} · ${start+1}–${start+page.length} of ${this.entries.length}`);$('[data-tts-action=cache-prev]',root).disabled=this.cachePage===0;$('[data-tts-action=cache-next]',root).disabled=this.cachePage>=pages-1;this.syncCacheSummary();
 }
}
