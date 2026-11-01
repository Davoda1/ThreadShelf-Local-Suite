import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const rawSource=fs.readFileSync(new URL('../src/ui/tts.js',import.meta.url),'utf8');
const controllerScript=value=>value.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const source=controllerScript(rawSource);
const Player=class{setVolume(){}setRate(){}dispose(){}snapshot(){return {ended:true};}};
const Controller=vm.runInNewContext(source+'\nTtsController;',{crypto:webcrypto,TextEncoder,setTimeout,clearTimeout,ThreadShelfTtsPlayer:Player,document:{createTextNode:text=>({textContent:text})}});
const proof={version:1,sha256:'a'.repeat(64)};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
for(const [label,newline]of [['LF','\n'],['CRLF','\r\n']])test(`controller test harness loads ${label} source checkouts`,()=>{
  const checkedOutSource=rawSource.replace(/\r?\n/g,newline);
  const CheckoutController=vm.runInNewContext(controllerScript(checkedOutSource)+'\nTtsController;');
  const controller=new CheckoutController({invoke:async()=>{},getContext:()=>({})});
  assert.equal(controller.config.enabled,false);
  assert.equal(controller.config.provider,'pocket');
});
function message(id,text='Spoken text.',code=''){
  const node={dataset:{messageId:id,role:'assistant',turnIndex:'0'},sourceText:text+code,text,code,getBoundingClientRect:()=>({height:100,top:0,bottom:100})};
  node.querySelector=selector=>selector==='[data-tts-read]'?{}:{cloneNode:()=>{
    let included=true;
    return {get textContent(){return node.text+(included?node.code:'');},querySelectorAll:selector=>selector==='pre,.mermaid-block,.rich-original-source'&&node.code?[{replaceWith:()=>included=false}]:[]};
  }};
  return node;
}
function fixture(messages=[]){
  const context={sourceId:'source'},calls=[];
  const controller=new Controller({invoke:async(action,args)=>{calls.push({action,args});return {};},getContext:()=>context});
  controller.config.enabled=true;
  controller.host={classList:{remove(){}},contains:node=>messages.includes(node),querySelectorAll:()=>messages,getBoundingClientRect:()=>({top:0,bottom:600})};
  controller.scheduleAvailability=()=>{};controller.syncMessages=()=>{};controller.syncPill=()=>{};controller.syncMessageState=()=>{};controller.makePill=()=>{};
  return {controller,context,calls};
}

test('latest speaker selection wins when message fingerprints finish out of order',async()=>{
  const a=message('A'),b=message('B'),{controller}=fixture([a,b]),first=deferred(),second=deferred(),starts=[];
  controller.messageFingerprint=node=>node===a?first.promise:second.promise;
  controller.start=async request=>starts.push(request.messageId);
  const older=controller.startMessage(a),newer=controller.startMessage(b);
  second.resolve(proof);await newer;first.resolve(proof);await older;
  assert.deepEqual(starts,['B']);
});

test('message selection is abandoned after source, content, settings, or stop changes during hashing',async t=>{
  for(const change of ['source','raw content','rendered content','settings','stop','detach'])await t.test(change,async()=>{
    const node=message('message'),{controller,context}=fixture([node]),pending=deferred(),starts=[];
    controller.messageFingerprint=()=>pending.promise;controller.start=async request=>starts.push(request);
    const selecting=controller.startMessage(node);
    if(change==='source')context.sourceId='different';
    if(change==='raw content')node.sourceText+=' changed';
    if(change==='rendered content')node.text+=' changed';
    if(change==='settings')controller.setConfig({...controller.config,preferApiCache:false});
    if(change==='stop')controller.stop();
    if(change==='detach')controller.host=null;
    pending.resolve(proof);await selecting;
    assert.equal(starts.length,0);
  });
});

test('full-message proof includes raw source and rendered labels independently of speech filters',async()=>{
  const node=message('message','Prose.',' Code.'),{controller}=fixture([node]);
  const initial=await controller.messageFingerprint(node);
  controller.config.readCode=true;controller.config.readCitations=true;
  assert.deepEqual(await controller.messageFingerprint(node),initial);
  node.sourceText+=' hidden edit';
  const rawEdit=await controller.messageFingerprint(node);assert.notEqual(rawEdit.sha256,initial.sha256);
  node.text+=' changed label';
  assert.notEqual((await controller.messageFingerprint(node)).sha256,rawEdit.sha256);
});

test('code-only messages still submit proof for cached playback with code reading disabled',async()=>{
  const node=message('code','','const value = 7;'),{controller,calls}=fixture([node]);
  let request;controller.start=async value=>request=value;
  await controller.startMessage(node);
  assert.equal(request.text,'');assert.equal(request.messageFingerprint.version,1);assert.match(request.messageFingerprint.sha256,/^[a-f0-9]{64}$/);
  controller.invoke=async(action,args)=>{calls.push({action,args});return {revision:0,items:args.messages.map(item=>({id:item.id,available:true}))};};
  await controller.refreshAvailability(controller.availabilitySerial);
  assert.equal(calls[0].action,'tts.availability');assert.equal(calls[0].args.messages[0].text,'');
  assert.equal(calls[0].args.messages[0].messageFingerprint.sha256,request.messageFingerprint.sha256);
  assert.equal(controller.availability.get(node),true);
});

test('completed playback is reselected after cache changes without interrupting its audio',async()=>{
  const node=message('message'),{controller}=fixture([node]);
  const request={text:node.text,messageFingerprint:await controller.messageFingerprint(node)};
  const session=controller.createSession({requestId:'playing',purpose:'conversation',settings:controller.config,request,label:'Assistant'});
  Object.assign(session,{sourceId:'source',messageId:'message',complete:true,receiving:false});controller.active=session;
  let focused=0,starts=0;controller.pill={querySelector:()=>({focus:()=>focused++})};controller.start=async()=>starts++;
  await controller.startMessage(node);assert.equal(focused,1);assert.equal(starts,0);
  controller.receiveTtsEvent({state:'availability-changed',revision:3});
  assert.equal(controller.active,session);await controller.startMessage(node);assert.equal(starts,1);
});

test('API and disk-cache preference changes cancel pending work and preserve completed playback for reselection',()=>{
  for(const key of ['preferApiCache','cacheEnabled'])for(const receiving of [true,false]){
    const {controller}=fixture(),session=controller.createSession({requestId:'playing',purpose:'conversation',settings:controller.config,request:{},label:'Assistant'});
    Object.assign(session,{complete:!receiving,receiving});controller.active=session;
    let stopped=0;controller.stop=()=>{stopped++;controller.active=null;};
    controller.setConfig({...controller.config,[key]:!controller.config[key]});
    assert.equal(stopped,receiving?1:0);if(!receiving){assert.equal(controller.active,session);assert.equal(session.reselectionNeeded,true);}
  }
});

test('superseded audio initialization cannot submit a late synthesis request',async()=>{
  const {controller,calls}=fixture(),starts=[];
  controller.createSession=({requestId,purpose,request})=>{
    const ready=deferred(),session={requestId,purpose,request,player:{play:()=>ready.promise,dispose(){}},receiving:true};
    starts.push({session,ready});return session;
  };
  controller.completeSession=async()=>{};
  const first=controller.start({text:'First',sourceId:'source',messageId:'A'}),second=controller.start({text:'Second',sourceId:'source',messageId:'B'});
  starts[0].ready.resolve();await first;assert.equal(calls.filter(call=>call.action==='tts.synthesize').length,0);
  starts[1].ready.resolve();await second;
  assert.deepEqual(calls.filter(call=>call.action==='tts.synthesize').map(call=>call.args.messageId),['B']);
});


test('saving an API preference cancels pending playback before backend cancellation can surface an error',async()=>{
  const {controller}=fixture();
  const session=controller.createSession({requestId:'pending',purpose:'conversation',settings:controller.config,request:{},label:'Assistant'});
  controller.active=session;controller.formRoot={isConnected:true};controller.pendingKeys={};
  controller.collectSettings=()=>({...controller.config,preferApiCache:false});
  let errors=0,saves=0;controller.onError=()=>errors++;
  controller.invoke=async(action,args)=>{
    if(action==='tts.settings.save'){saves++;assert.equal(controller.active,null);controller.sessionError(session,new Error('Speech request cancelled.'));return args.settings;}
    return {};
  };
  await controller.saveSettings();
  assert.equal(saves,1);assert.equal(errors,0);assert.equal(controller.config.preferApiCache,false);
});
