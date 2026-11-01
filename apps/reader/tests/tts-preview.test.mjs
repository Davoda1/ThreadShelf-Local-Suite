import test from 'node:test';
import assert from 'node:assert/strict';
const previewModule=import(new URL('../scripts/preview-tts.mjs',import.meta.url));

async function fixture(){
  const {createTtsPreview}=await previewModule;
  const preview=createTtsPreview(),events=[];
  let sequence=0;
  preview.onTtsEvent(event=>events.push(event));
  const message={sourceId:'sample-source',messageId:'sample-message',text:'Synthetic speech sample.'};
  return {
    preview,events,message,
    save:settings=>preview.invoke('tts.settings.save',{settings}),
    synth:overrides=>preview.invoke('tts.synthesize',{...message,...overrides,requestId:'sample-'+(++sequence)}),
    available:async overrides=>(await preview.invoke('tts.availability',{messages:[{...message,...overrides,id:'sample'}]})).items[0].available
  };
}

test('preview reuse follows pinned, preferred API and exact identity with truthful recording metadata',async()=>{
  const {preview,events,save,synth,available}=await fixture();
  assert.equal((await preview.invoke('tts.settings.get')).preferApiCache,true);
  await save({enabled:true,cacheEnabled:true,streamingEnabled:false,provider:'selfhosted',voice:'sample-voice',model:'sample-model'});
  const api=await synth();
  assert.equal(api.cached,false);
  assert.equal(api.cacheReason,undefined);
  assert.deepEqual(api.recording,{provider:'selfhosted',voice:'sample-voice',model:'sample-model'});
  await save({provider:'pocket'});
  assert.equal(await available(),true);
  const reused=await synth();
  assert.equal(reused.cacheKey,api.cacheKey);
  assert.equal(reused.cacheReason,'api');
  assert.deepEqual(reused.recording,api.recording);
  assert.equal(await available({text:'Different spoken text.'}),false);
  assert.equal(await available({sourceId:'another-source'}),false);
  assert.equal(await available({messageId:'another-message'}),false);
  assert.equal(await available({text:'\r\nSynthetic speech sample.\r\n'}),true);
  const before=(await preview.invoke('tts.availability',{messages:[]})).revision;
  await save({preferApiCache:false});
  assert.ok((await preview.invoke('tts.availability',{messages:[]})).revision>before);
  assert.equal(await available(),false);
  const local=await synth();
  assert.equal(local.cached,false);
  assert.equal(local.recording.provider,'pocket');
  assert.notEqual(local.cacheKey,api.cacheKey);
  assert.equal((await synth()).cacheReason,'exact');
  await save({preferApiCache:true,streamingEnabled:true});
  events.length=0;
  const apiAgain=await synth();
  assert.equal(apiAgain.cacheReason,'api');
  assert.deepEqual(apiAgain.recording,api.recording);
  const playbackEvents=events.filter(event=>event.requestId===apiAgain.requestId&&['audio','ready'].includes(event.state));
  assert.equal(playbackEvents.filter(event=>event.state==='audio').length,4);
  assert.equal(playbackEvents.filter(event=>event.state==='ready').length,1);
  for(const event of playbackEvents){assert.equal(event.cacheReason,'api');assert.deepEqual(event.recording,api.recording);}
  await preview.invoke('tts.cache.pin',{key:local.cacheKey,pinned:true});
  const original=(await preview.invoke('tts.cache.list')).entries.find(entry=>entry.key===local.cacheKey);
  await save({provider:'kokoro',preferApiCache:false,streamingEnabled:false});
  const pinned=await synth();
  assert.equal(pinned.cacheReason,'pinned');
  assert.equal(pinned.cacheKey,local.cacheKey);
  assert.equal(pinned.cacheSource,'disk');
  assert.deepEqual(pinned.recording,local.recording);
  const after=(await preview.invoke('tts.cache.list')).entries.find(entry=>entry.key===local.cacheKey);
  for(const field of ['fingerprint','contentIdentity','provider','voice','model','sourceId','messageId','bytes','createdAt','pinned'])assert.equal(after[field],original[field]);
  await assert.rejects(save({preferApiCache:'true'}),/Invalid API cache/);
});

test('preview disk eligibility follows the cache setting and test audio never becomes a conversation recording',async()=>{
  const {preview,message,save,synth,available}=await fixture();
  await save({enabled:true,cacheEnabled:true,streamingEnabled:false,provider:'selfhosted',model:'sample-model',voice:'sample-voice'});
  const api=await synth();
  await save({provider:'pocket',cacheEnabled:false,preferApiCache:false});
  for(let index=0;index<3;index++)await synth({sourceId:'sample-'+index,messageId:'other',text:'Another synthetic sample '+index});
  await save({preferApiCache:true});
  assert.equal(await available(),false,'A disk-only recording is unavailable with persistent caching disabled');
  await save({cacheEnabled:true});
  assert.equal(await available(),true);
  const reused=await synth();
  assert.equal(reused.cacheKey,api.cacheKey);
  assert.equal(reused.cacheSource,'disk');
  assert.equal(reused.cacheReason,'api');
  const cacheBefore=await preview.invoke('tts.cache.list');
  const result=await preview.invoke('tts.preview',{requestId:'audio-test',text:message.text,settings:{provider:'kokoro',model:'kokoro-v1.0-fp32',voice:'am_michael',streamingEnabled:false}});
  assert.equal(result.cached,false);
  assert.equal(result.cacheKey,null);
  assert.equal(result.sessionRetained,false);
  assert.equal(result.stored,false);
  assert.deepEqual(result.recording,{provider:'kokoro',model:'kokoro-v1.0-fp32',voice:'am_michael'});
  assert.deepEqual(await preview.invoke('tts.cache.list'),cacheBefore);
  const another=await fixture();
  assert.equal((await another.preview.invoke('tts.cache.list')).entries.length,0);
});

test('preview reuse resolves competing API and pinned recordings by most recent use',async()=>{
  const {preview,save,synth}=await fixture();
  await save({enabled:true,cacheEnabled:true,preferApiCache:false,streamingEnabled:false,provider:'selfhosted',model:'first-model',voice:'first-voice'});
  const first=await synth();
  await save({provider:'elevenlabs',model:'second-model',voice:'second-voice'});
  const second=await synth();
  await save({provider:'pocket',preferApiCache:true});
  const newest=await synth();
  assert.equal(newest.cacheReason,'api');
  assert.equal(newest.cacheKey,second.cacheKey);
  await preview.invoke('tts.cache.pin',{key:first.cacheKey,pinned:true});
  const pinned=await synth();
  assert.equal(pinned.cacheReason,'pinned');
  assert.equal(pinned.cacheKey,first.cacheKey);
  await preview.invoke('tts.cache.pin',{key:second.cacheKey,pinned:true});
  assert.equal((await synth()).cacheKey,first.cacheKey);
});

test('preview full-message proof preserves pinned and API audio across reading-filter changes',async()=>{
  const {preview,save,synth,available}=await fixture();
  const messageFingerprint={version:1,sha256:'a'.repeat(64)};
  await save({enabled:true,cacheEnabled:true,streamingEnabled:false,provider:'selfhosted',voice:'saved-voice',model:'saved-model',readCode:true});
  const api=await synth({text:'Prose and code.',messageFingerprint});
  await save({provider:'pocket',readCode:false});
  assert.equal(await available({text:'Prose.',messageFingerprint}),true);
  const reused=await synth({text:'Prose.',messageFingerprint});
  assert.equal(reused.cacheKey,api.cacheKey);assert.equal(reused.cacheReason,'api');assert.deepEqual(reused.recording,api.recording);
  await save({preferApiCache:false});
  assert.equal(await available({text:'Prose.',messageFingerprint}),false);
  await preview.invoke('tts.cache.pin',{key:api.cacheKey,pinned:true});
  assert.equal(await available({text:'',messageFingerprint}),true);
  const pinned=await synth({text:'',messageFingerprint});assert.equal(pinned.cacheReason,'pinned');assert.equal(pinned.cacheKey,api.cacheKey);
  assert.equal(await available({text:'',messageFingerprint,sourceId:'different-source'}),false);
  assert.equal(await available({text:'',messageFingerprint,messageId:'different-message'}),false);
  const edited={version:1,sha256:'b'.repeat(64)};
  assert.equal(await available({text:'',messageFingerprint:edited}),false);
  await assert.rejects(synth({text:'',messageFingerprint:edited}),/no readable text/);
});

test('preview exact speech remains reusable after excluded-content edits without granting pin priority',async()=>{
  const {preview,save,synth,available}=await fixture();
  const original={version:1,sha256:'a'.repeat(64)},edited={version:1,sha256:'b'.repeat(64)};
  await save({enabled:true,cacheEnabled:true,streamingEnabled:false});
  const audio=await synth({messageFingerprint:original});
  await preview.invoke('tts.cache.pin',{key:audio.cacheKey,pinned:true});
  const exact=await synth({messageFingerprint:edited});assert.equal(exact.cacheKey,audio.cacheKey);assert.equal(exact.cacheReason,'exact');
  await save({voice:'anna'});
  assert.equal(await available({messageFingerprint:edited}),false);
  assert.equal(await available({messageFingerprint:original}),true);
});

test('preview API preference changes cancel pending conversation generation',async()=>{
  const {save,synth}=await fixture();
  await save({enabled:true,streamingEnabled:false});
  const pending=synth(),rejection=assert.rejects(pending,/cancelled/);
  await save({preferApiCache:false});await rejection;
});


test('preview keeps completed playback protected when only the API preference changes',async()=>{
  const {preview,save,synth}=await fixture();
  await save({enabled:true,cacheEnabled:true,streamingEnabled:false});
  const audio=await synth();
  await save({preferApiCache:false});
  assert.equal((await preview.invoke('tts.playback',{requestId:audio.requestId,cacheKey:audio.cacheKey,active:true})).protected,true);
  const plan=await preview.invoke('tts.cache.preview',{filter:{scope:'all'}});
  assert.equal(plan.count,0);assert.equal(plan.protectedCount,1);
});
