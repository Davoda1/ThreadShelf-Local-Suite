import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {ThreadShelfClient} from '../src/core/server.mjs';

// Stock ThreadShelf's summary endpoint intentionally exposes mixed units.
// Several passages can be indexed for one normalized conversation turn.
function report(collection='all'){
  return {
    collection,
    totals:{collections:1,files:2,chunks:39,conversations:3,turns:12},
    roles:{user:17,thinking:5,ai:17},
    activity:[{month:'2026-01',count:14},{month:'2026-02',count:0},{month:'2026-03',count:9}],
    topModels:[{model:'synthetic-model',count:18}],
    providers:[{provider:'openai',conversations:3,turns:12}],
    longestThreads:[{collection:collection==='all'?'work':collection,sourceFile:'/nested/original.json',conversationKey:'one',title:'Synthetic conversation',provider:'openai',turnCount:6,lastTurnAt:'2026-03-04T15:00:00.000Z'}],
    firstActivity:'2026-01-05T12:00:00.000Z',lastActivity:'2026-03-04T15:00:00.000Z',
  };
}

async function backend(t){
  const state={calls:[],body:report(),status:200,raw:undefined,wait:false,reached:null,release:null};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');state.calls.push({url,method:req.method});
    if(state.wait){state.reached?.();await new Promise(resolve=>{state.release=resolve;});}
    res.statusCode=state.status;res.setHeader('Content-Type',state.raw===undefined?'application/json':'text/html');
    res.end(state.raw??JSON.stringify(state.body));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{state.release?.();server.closeAllConnections();server.close(resolve);}));
  const url=`http://127.0.0.1:${server.address().port}/`;
  return {state,url,client:new ThreadShelfClient(url)};
}

test('Insights fetches exactly the stock summary endpoint and preserves passage and turn units',async t=>{
  const {client,state}=await backend(t);
  const result=await client.insights();assert.deepEqual(result,report());
  assert.equal(result.totals.chunks,39);assert.equal(result.totals.turns,12);
  assert.equal(result.activity.reduce((n,row)=>n+row.count,0),23); // Undated passages are not invented.
  assert.equal(result.providers[0].turns,12);assert.equal(result.topModels[0].count,18);
  assert.equal(state.calls.length,1);assert.equal(state.calls[0].method,'GET');
  assert.equal(state.calls[0].url.pathname,'/api/insights');
  assert.deepEqual([...state.calls[0].url.searchParams],[['collection','all']]);
});

test('selected scope and complete longest-thread identities are preserved; refresh reads current summaries',async t=>{
  const {client,state}=await backend(t);state.body=report('work');
  const first=await client.insights('work');assert.deepEqual(first.longestThreads,state.body.longestThreads);
  state.body.totals.turns=19;const refreshed=await client.insights('work');
  assert.equal(first.totals.turns,12);assert.equal(refreshed.totals.turns,19);
  assert.ok(state.calls.every(({url})=>url.pathname==='/api/insights'&&url.searchParams.get('collection')==='work'));
  assert.equal(state.calls.length,2);
});

test('empty archives are valid and absent optional role aggregates remain unavailable',async t=>{
  const {client,state}=await backend(t);
  state.body={collection:'all',totals:{collections:0,files:0,chunks:0,conversations:0,turns:0},activity:[],topModels:[],providers:[],longestThreads:[],firstActivity:null,lastActivity:null};
  assert.deepEqual(await client.insights(),state.body);
  assert.equal(Object.hasOwn(await client.insights(),'roles'),false);
  state.body.roles=null;assert.equal(Object.hasOwn(await client.insights(),'roles'),false);
});

test('malformed counts, identities, dates and scopes reject rather than display fabricated analytics',async t=>{
  const {client,state}=await backend(t);
  const corruptions=[
    r=>{r.collection='other';},
    r=>{delete r.totals.turns;},
    r=>{r.totals.chunks='39';},
    r=>{r.totals.chunks=-1;},
    r=>{r.totals.chunks=0.5;},
    r=>{r.totals.chunks=Number.MAX_SAFE_INTEGER+1;},
    r=>{r.roles.ai=null;},
    r=>{r.activity[0].month='2026-13';},
    r=>{r.activity[1].month=r.activity[0].month;},
    r=>{r.activity.reverse();},
    r=>{r.topModels[0].count=-1;},
    r=>{r.providers[0].turns='12';},
    r=>{r.longestThreads[0].sourceFile='';},
    r=>{delete r.longestThreads[0].conversationKey;},
    r=>{r.longestThreads[0].collection='other';},
    r=>{r.firstActivity='not a timestamp';},
    r=>{r.firstActivity=null;},
    r=>{r.firstActivity='2027-01-01T00:00:00Z';},
    r=>{delete r.providers;},
  ];
  for(const corrupt of corruptions){state.body=report('work');corrupt(state.body);await assert.rejects(client.insights('work'),/invalid Insights data/);}
  assert.equal(state.calls.length,corruptions.length);assert.ok(state.calls.every(({url})=>url.pathname==='/api/insights'));
});

test('missing endpoint, authentication and server failures stay errors without a scan fallback',async t=>{
  const {client,state}=await backend(t);
  for(const status of [404,401,403,500,503]){
    state.status=status;state.body={error:`Synthetic HTTP ${status}`};
    await assert.rejects(client.insights(),error=>error.status===status&&(status!==404||/does not provide Insights/.test(error.message)));
    state.raw='<html>Server failure</html>';
    await assert.rejects(client.insights(),error=>error.status===status);
    state.raw=undefined;
  }
  state.status=200;state.raw='Invalid JSON';await assert.rejects(client.insights(),/invalid JSON response/);
  assert.equal(state.calls.length,11);assert.ok(state.calls.every(({url})=>url.pathname==='/api/insights'));
});

test('invalid collection selections and already cancelled requests never contact the server',async t=>{
  const {client,state,url}=await backend(t);
  for(const collection of ['',null,42,{},' '.repeat(3),'x'.repeat(1025)])await assert.rejects(client.insights(collection),/valid ThreadShelf collection/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(new ThreadShelfClient(url,{signal:controller.signal}).insights(),/abort/i);
  assert.equal(state.calls.length,0);
});

test('cancelling an in-flight summary request rejects and retry performs one fresh summary fetch',async t=>{
  const {state,url,client}=await backend(t);state.wait=true;
  const reached=new Promise(resolve=>{state.reached=resolve;}),controller=new AbortController();
  const pending=new ThreadShelfClient(url,{signal:controller.signal}).insights();
  await reached;controller.abort();await assert.rejects(pending,/abort/i);
  state.wait=false;state.release();assert.deepEqual(await client.insights(),report());
  assert.equal(state.calls.length,2);assert.ok(state.calls.every(({url})=>url.pathname==='/api/insights'));
});

test('a transport that ignores cancellation cannot publish an obsolete response after its scope was left',async()=>{
  const controller=new AbortController();let release;
  const delayed=new Promise(resolve=>{release=resolve;});
  const client=new ThreadShelfClient('http://localhost/',{signal:controller.signal,fetchImpl:async()=>{await delayed;return new Response(JSON.stringify(report()));}});
  const pending=client.insights();controller.abort();release();await assert.rejects(pending,/abort/i);
});
