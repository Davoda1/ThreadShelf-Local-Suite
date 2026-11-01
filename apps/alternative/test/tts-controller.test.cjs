'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');

function fixture({deferHashes=false}={}) {
  const calls=[],hashes=[],players=[],nodes=new Map(),failures=new Map(),overrides=new Map(),buttons=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',value:'selected',dataset:{},classList:{toggle(){},remove(){}},querySelector:selector=>node(id+selector),querySelectorAll:()=>[],setAttribute(){}});
    return nodes.get(id);
  };
  node('thread-content').querySelectorAll=()=>buttons;
  node('thread-content').querySelector=selector=>buttons.find(button=>selector.includes('"'+button.dataset.ttsIndex+'"'));
  class Player {
    constructor(){this.state={hasAudio:false,playing:false,paused:true,complete:false};players.push(this);}
    snapshot(){return {...this.state};}
    async play(){this.state.playing=true;this.state.paused=false;}
    pause(){this.state.playing=false;this.state.paused=true;}
    dispose(){this.disposed=true;this.pause();}
    async append(){this.state.hasAudio=true;}
    async finish(){this.state.complete=true;}
    setRate(){} setVolume(){}
  }
  const invoke=async(action,args={})=>{
    calls.push({action,args});if(failures.has(action))throw failures.get(action);if(overrides.has(action))return overrides.get(action)(args);
    if(action==='tts.settings.save')return args.settings;
    if(action==='tts.cache.list')return {entries:[],totalBytes:0};
    if(action==='tts.synthesize')return {requestId:args.requestId,complete:true,audioBase64:'dG9uZQ==',mime:'audio/wav',cacheKey:'sample'};
    if(action==='tts.availability')return {revision:1,items:args.messages.map(message=>({id:message.id,available:true}))};
    return {};
  };
  const sandbox={TextEncoder,Uint8Array,structuredClone,Map,Set,WeakMap,Promise,setTimeout:()=>1,clearTimeout(){},document:{getElementById:node,querySelectorAll:()=>[]},crypto:{randomUUID:crypto.randomUUID,subtle:{digest:async(_algorithm,bytes)=>{
    const value=crypto.createHash('sha256').update(bytes).digest();
    if(!deferHashes)return value;
    return new Promise(resolve=>hashes.push({text:new TextDecoder().decode(bytes),complete:()=>resolve(value)}));
  }}},window:{ThreadShelfTtsPlayer:Player,__THREADSHELF_TTS_PREVIEW:{invoke}}};
  const source=fs.readFileSync(path.join(__dirname,'../renderer/tts.js'),'utf8');
  const hooks=`
    window.controller={speak,changed,messageProof,refreshAvailability,showError,clearError,refreshCache,flush,
      setup(messages,patch={}){available=true;settings={...settings,enabled:true,...patch};context={sourceId:'sample-source',messages};},
      setContext(next){context=next;},session:()=>session,settings:()=>settings,
      failSave(error){saveError=error;showError(error,'settings');},
      context:()=>context};
    // Isolate controller decisions from DOM layout and audio decoding.
    speechText=(message,readOptions=settings)=>message.spoken??(readOptions.readCode?message.content:message.content.replace(/CODE/g,''));
    currentDraft=()=>structuredClone(settings);updateControls=()=>{};updateTestControls=()=>{};updateKeyStatus=()=>{};
    attach=next=>{context=next||context;};scheduleAvailability=()=>{};renderCachePage=()=>{};closeDelete=()=>{};
  `;
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,hooks+'})();'),sandbox);
  const controller=sandbox.window.controller;
  return {controller,calls,hashes,players,node,failures,overrides,buttons};
}

test('message hashing cannot let an earlier speaker click replace the latest selection',async()=>{
  const {controller,calls,hashes,players}=fixture({deferHashes:true});
  controller.setup([{id:'a',content:'First message'},{id:'b',content:'Second message'}]);
  const first=controller.speak(0),second=controller.speak(1);
  assert.equal(hashes.length,2);hashes[1].complete();await second;hashes[0].complete();await first;
  assert.deepEqual(calls.filter(call=>call.action==='tts.synthesize').map(call=>call.args.messageId),['b']);
  assert.equal(controller.session().messageId,'b');assert.equal(players[0].disposed,true);
});

test('a cancelled hash and an edited message never dispatch stale speech',async()=>{
  for(const mutation of ['content','message','source','preference']){
    const {controller,calls,hashes}=fixture({deferHashes:true});
    const message={id:'a',content:'First message'};controller.setup([message]);
    const pending=controller.speak(0);
    if(mutation==='content')message.content='Edited message';
    if(mutation==='message')controller.setContext({sourceId:'sample-source',messages:[{...message}]});
    if(mutation==='source')controller.setContext({sourceId:'other-source',messages:[message]});
    if(mutation==='preference')controller.changed('preferApiCache',false);
    hashes[0].complete();await pending;
    assert.equal(calls.filter(call=>call.action==='tts.synthesize').length,0,mutation);
    assert.equal(controller.session(),null,mutation);
  }
});

test('unchanged full-message proof accompanies empty filtered text and changes after raw edits',async()=>{
  const {controller,calls}=fixture();const message={id:'code',content:'CODE',spoken:''};controller.setup([message]);
  await controller.speak(0);
  const request=calls.find(call=>call.action==='tts.synthesize').args;
  assert.equal(request.text,'');assert.equal(request.messageFingerprint.version,1);assert.match(request.messageFingerprint.sha256,/^[a-f0-9]{64}$/);
  const before=await controller.messageProof(message);message.content='CODE changed';const after=await controller.messageProof(message);
  assert.notEqual(after.fingerprint.sha256,before.fingerprint.sha256);
});

test('API preference changes cancel pending generation while leaving completed audio playable',async()=>{
  const {controller,players}=fixture();controller.setup([{id:'a',content:'A message'}]);
  await controller.speak(0);const completed=controller.session();assert.equal(completed.generationComplete,true);
  controller.changed('preferApiCache',false);assert.equal(controller.session(),completed);assert.notEqual(players[0].disposed,true);
  completed.generationComplete=false;controller.changed('preferApiCache',true);assert.equal(controller.session(),null);assert.equal(players[0].disposed,true);
});

test('cache retry clears only its own failure and preserves unresolved settings failures',async()=>{
  const {controller,node,failures}=fixture();controller.setup([]);
  const cacheFailure=new Error('Cache could not be read'),saveFailure=new Error('Settings could not be saved');
  failures.set('tts.cache.list',cacheFailure);await controller.refreshCache();assert.equal(node('tts-error').textContent,cacheFailure.message);
  failures.delete('tts.cache.list');await controller.refreshCache();assert.equal(node('tts-error').hidden,true);
  controller.failSave(saveFailure);failures.set('tts.cache.list',cacheFailure);await controller.refreshCache();
  failures.delete('tts.cache.list');await controller.refreshCache();
  assert.equal(node('tts-error').hidden,false);assert.equal(node('tts-error').textContent,saveFailure.message);
  controller.clearError('settings');assert.equal(node('tts-error').hidden,true);
});

test('availability hashing drops stale content before querying and accepts empty filtered text with proof',async()=>{
  const {controller,calls,hashes,buttons}=fixture({deferHashes:true});
  const message={id:'a',content:'CODE',spoken:''};controller.setup([message]);
  buttons.push({dataset:{ttsIndex:'0'},classList:{toggle(){}},setAttribute(){}});
  const stale=controller.refreshAvailability(0);message.content='Different CODE';hashes[0].complete();await stale;
  assert.equal(calls.filter(call=>call.action==='tts.availability').length,0);
  const current=controller.refreshAvailability(0);hashes[1].complete();await current;
  const request=calls.find(call=>call.action==='tts.availability').args.messages[0];
  assert.equal(request.text,'');assert.match(request.messageFingerprint.sha256,/^[a-f0-9]{64}$/);
  assert.equal(buttons[0].dataset.ttsAvailable,'true');
});

test('availability returned after a message edit cannot mark the new content as reusable',async()=>{
  const {controller,overrides,buttons}=fixture();
  const message={id:'a',content:'Original message'};controller.setup([message]);
  buttons.push({dataset:{ttsIndex:'0'},classList:{toggle(){}},setAttribute(){}});
  overrides.set('tts.availability',async()=>{message.content='Edited while loading';return {revision:1,items:[{id:'0',available:true}]};});
  await controller.refreshAvailability(0);
  assert.equal(buttons[0].dataset.ttsAvailable,'false');
});
