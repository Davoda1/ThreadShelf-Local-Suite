// Independent R2 boundary review: only synthetic identities and public examples.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceContexts } from '../src/core/resource-contexts.mjs';
import { RESOURCE_ACTIONS, resourceUrl, validateResourceRequest } from '../src/core/resource-requests.mjs';

const image='https://images.example.test/poster.png';
const thread=(id,content=`![Poster](${image})`,title='Synthetic conversation')=>({id,title,collection:'Synthetic collection',turns:[{ai:content}]});
const ref=id=>({mode:'local',id});

test('resource requests accept only narrow primitive action arguments',()=>{
  const valid={
    'resources.status':{},'resources.list':{},'resources.settings':{enabled:false},
    'resources.context':ref('synthetic-a'),
    'resources.load':{url:image,contextToken:'a'.repeat(64),requestId:'request-1'},
    'resources.cancel':{requestId:'request-1'},'resources.clear':{conversationKey:'b'.repeat(64)},
  };
  for(const action of RESOURCE_ACTIONS){assert.doesNotThrow(()=>validateResourceRequest(action,valid[action]));for(const key of ['body','path','headers','owner','enabledByRenderer'])assert.throws(()=>validateResourceRequest(action,{...valid[action],[key]:'forged'}),action+': '+key);}
  for(const enabled of [1,0,'true',null,[],{}])assert.throws(()=>validateResourceRequest('resources.settings',{enabled}));
  for(const url of ['file:///private/picture.png','javascript:alert(1)','data:image/png;base64,AAAA','https://name:password@images.example.test/a','https://images.example.test/a\n','https://images.example.test/'+('a'.repeat(16384))])assert.throws(()=>validateResourceRequest('resources.load',{...valid['resources.load'],url}));
  for(const contextToken of [null,{},[],1,'a'.repeat(63),'A'.repeat(64)])assert.throws(()=>validateResourceRequest('resources.load',{...valid['resources.load'],contextToken}));
  for(const requestId of [null,{},[],1,'x'.repeat(81),'../outside'])assert.throws(()=>validateResourceRequest('resources.cancel',{requestId}));
  assert.throws(()=>validateResourceRequest('resources.clear',{all:true,conversationKey:'b'.repeat(64)}));
  assert.throws(()=>validateResourceRequest('resources.clear',{all:false}));
  assert.doesNotThrow(()=>validateResourceRequest('resources.clear',{all:true}));
});

test('unknown request bodies are rejected before inspecting their contents',()=>{
  let visited=false;
  const args={};Object.defineProperty(args,'body',{enumerable:true,get(){visited=true;throw new Error('Unknown body must not be traversed');}});
  assert.throws(()=>validateResourceRequest('resources.status',args));assert.equal(visited,false);
  const cyclic={};cyclic.self=cyclic;assert.throws(()=>validateResourceRequest('resources.status',{body:cyclic}));
});

test('URL identity is canonical without credentials or fragments',()=>{
  assert.equal(resourceUrl('HTTPS://IMAGES.EXAMPLE.TEST:443/poster.png#fragment'),image);
  assert.equal(resourceUrl('https://images.example.test/poster.png?size=120#fragment'),image+'?size=120');
});

test('opaque contexts authorize rendered Markdown image destinations only',()=>{
  const contexts=new ResourceContexts();
  const markdown=`[![Poster](${image})](https://links.example.test/page)\n\n![Reference][asset]\n\n[asset]: https://images.example.test/reference\n\n[Ordinary](https://links.example.test/ordinary)\n\n\`![Code](https://images.example.test/code)\`\n\n<img src="https://images.example.test/raw">`;
  contexts.register(thread('a',markdown),ref('a'));
  const {contextToken}=contexts.token(ref('a'));
  assert.match(contextToken,/^[a-f0-9]{64}$/);
  for(const url of [image,'https://images.example.test/reference'])assert.doesNotThrow(()=>contexts.owner(contextToken,url));
  for(const url of ['https://links.example.test/page','https://links.example.test/ordinary','https://images.example.test/code','https://images.example.test/raw','https://images.example.test/forged'])assert.throws(()=>contexts.owner(contextToken,url));
  assert.throws(()=>contexts.owner('0'.repeat(64),image));assert.throws(()=>contexts.token(ref('not-opened')));
  assert.equal(contexts.owner(contextToken,image).source,'local');
  assert.match(contexts.owner(contextToken,image).key,/^[a-f0-9]{64}$/);
});

test('same-identity refetch keeps live tokens while updating allowed sources',()=>{
  const contexts=new ResourceContexts();contexts.register(thread('a'),ref('a'));
  const {contextToken}=contexts.token(ref('a'));
  contexts.register(thread('a','![New](https://images.example.test/new)','Renamed conversation'),ref('a'));
  assert.equal(contexts.token(ref('a')).contextToken,contextToken);
  assert.equal(contexts.owner(contextToken,'https://images.example.test/new').title,'Renamed conversation');
  assert.throws(()=>contexts.owner(contextToken,image));
});

test('active context lookup participates in bounded LRU eviction',()=>{
  const contexts=new ResourceContexts(2);
  contexts.register(thread('a'),ref('a'));contexts.register(thread('b'),ref('b'));
  const a=contexts.token(ref('a')).contextToken;
  contexts.register(thread('c'),ref('c'));
  assert.equal(contexts.token(ref('a')).contextToken,a);assert.throws(()=>contexts.token(ref('b')));
  contexts.clear();assert.throws(()=>contexts.owner(a,image));
});

test('trusted display metadata is normalized without modifying archive values',()=>{
  const original=thread('a',undefined,'Synthetic\nconversation\tname');original.collection='Synthetic\rcollection';
  const before=structuredClone(original),contexts=new ResourceContexts();contexts.register(original,ref('a'));
  const owner=contexts.owner(contexts.token(ref('a')).contextToken,image);
  assert.doesNotMatch(owner.title,/[\u0000-\u001f\u007f]/);assert.doesNotMatch(owner.sourceId,/[\u0000-\u001f\u007f]/);assert.deepEqual(original,before);
});

test('deep irrelevant metadata cannot break ordinary thread registration',()=>{
  const original=thread('a');let cursor={url:'https://images.example.test/deep'};
  for(let depth=0;depth<20000;depth++)cursor={child:cursor};
  original.metadata=cursor;
  const contexts=new ResourceContexts();assert.doesNotThrow(()=>contexts.register(original,ref('a')));
  const token=contexts.token(ref('a')).contextToken;
  assert.doesNotThrow(()=>contexts.owner(token,image));assert.throws(()=>contexts.owner(token,'https://images.example.test/deep'));
});

test('broad and deep metadata obeys one global traversal admission budget',()=>{
  let inspected=0,cursor={};const inspect=()=>{inspected++;return null};
  for(let depth=0;depth<32;depth++){
    const parent={};
    for(let field=0;field<2000;field++)Object.defineProperty(parent,`irrelevant${field}`,{enumerable:true,get:inspect});
    parent.child=cursor;cursor=parent;
  }
  const original=thread('broad');original.metadata=cursor;
  const contexts=new ResourceContexts();assert.doesNotThrow(()=>contexts.register(original,ref('broad')));
  assert.ok(inspected<=50000,`Visited ${inspected} metadata fields beyond the global budget`);
});

test('local and canonical server identities cannot share an image owner',()=>{
  const contexts=new ResourceContexts();contexts.register(thread('same'),ref('same'));
  const local=contexts.owner(contexts.token(ref('same')).contextToken,image);
  const serverRef={mode:'server',serverUrl:'HTTPS://SERVER.EXAMPLE.TEST:443/base',collection:'Synthetic',sourceFile:'export.json',conversationKey:'same'};
  const serverThread={...thread('same'),collection:'Synthetic',sourceFile:'export.json',conversationKey:'same'};
  contexts.register(serverThread,serverRef);
  const server=contexts.owner(contexts.token({...serverRef,serverUrl:'https://server.example.test/base/'}).contextToken,image);
  assert.notEqual(server.key,local.key);assert.equal(server.source,'server');assert.equal(server.sourceId,'https://server.example.test/base/');
  assert.throws(()=>contexts.token({...serverRef,conversationKey:'different'}));
});
