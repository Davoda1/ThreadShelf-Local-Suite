import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ThreadShelfClient,ServerSearchPager,remoteId} from '../src/core/server.mjs';
import {ApplicationService} from '../src/core/service.mjs';

async function backend(t,{extension=false,lengths=[60,64,13],capabilityStatus=404}={}){
  const state={calls:[],extension,capabilityStatus,failFile:null,waitFile:null,waiting:null,release:null,expire:false};
  const files=lengths.map((length,index)=>({collection:index===2?'personal':'work',sourceFile:index===1?'/second/same.json':'/first/same.json',conversationKey:`key-${index}`,title:`Synthetic thread ${index}`,provider:index===1?'anthropic':'openai',turnCount:length}));
  const threads=files.map((f,fi)=>({...f,turns:Array.from({length:f.turnCount},(_,i)=>({[i%3===1?'ai':i%3===2?'thinking':'user']:`Cobalt search result ${fi}-${i}`,turn_index:i*3,createdAt:'2026-01-01T00:00:00.000Z'}))}));
  const rows=threads.flatMap((thread,fi)=>thread.turns.map((turn,index)=>({id:`chunk-${fi}-${index}`,document:turn.user??turn.ai??turn.thinking,distance:(fi*1000+index)/1000,metadata:{...files[fi],role:turn.user?'user':turn.ai?'ai':'thinking',turnIndex:String(turn.turn_index)}})));
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');state.calls.push(url);res.setHeader('Content-Type','application/json');
    if(url.pathname==='/api/reader/capabilities'){
      if(!state.extension){res.statusCode=state.capabilityStatus;res.setHeader('Content-Type','text/html');res.end('<!doctype html><p>Cannot GET endpoint</p>');return;}
      res.end(JSON.stringify({readerSearch:{version:1,path:'/api/reader/search',cursor:true,maxPageSize:50,modes:['keyword','semantic'],providerFilter:true}}));return;
    }
    if(url.pathname==='/api/files'){const c=url.searchParams.get('collection');res.end(JSON.stringify({files:files.filter(f=>c==='all'||f.collection===c)}));return;}
    if(url.pathname==='/api/thread'){
      const fi=files.findIndex(f=>f.sourceFile===url.searchParams.get('sourceFile')&&f.collection===url.searchParams.get('collection')&&f.conversationKey===url.searchParams.get('conversationKey'));
      if(state.waitFile===fi){state.waiting?.();await new Promise(resolve=>{state.release=resolve;});}
      if(state.failFile===fi){res.statusCode=503;res.end(JSON.stringify({error:'Synthetic unavailable thread'}));return;}
      res.end(JSON.stringify(threads[fi]));return;
    }
    if(url.pathname==='/api/search'||url.pathname==='/api/reader/search'){
      const n=Number(url.searchParams.get('n'));if(!Number.isSafeInteger(n)||n<1||n>50){res.statusCode=400;res.end(JSON.stringify({error:'Invalid n: maximum 50'}));return;}
      if(state.expire&&url.searchParams.get('cursor')){res.statusCode=410;res.end(JSON.stringify({error:'Search cursor expired'}));return;}
      const collection=url.searchParams.get('collection'),role=url.searchParams.get('roles'),provider=url.searchParams.get('provider');
      const selected=rows.filter(r=>(collection==='all'||r.metadata.collection===collection)&&(!role||r.metadata.role===role)&&(!provider||r.metadata.provider===provider));
      if(url.pathname==='/api/search'){res.end(JSON.stringify({results:selected.slice(0,n)}));return;}
      const cursor=url.searchParams.get('cursor'),offset=cursor?Number(cursor.split(':')[1]):0,results=selected.slice(offset,offset+n),hasMore=offset+n<selected.length;
      res.end(JSON.stringify({results,total:selected.length,hasMore,nextCursor:hasMore?`fixture:${offset+n}`:null}));return;
    }
    res.statusCode=404;res.end(JSON.stringify({error:'Not found'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{state.release?.();server.closeAllConnections();server.close(resolve);}));
  const url=`http://127.0.0.1:${server.address().port}/`;
  return {url,state,files,threads,client:new ThreadShelfClient(url)};
}
const params={q:'cobalt',collection:'all',searchMode:'keyword',page:1,pageSize:50};

test('stock server text search retrieves all 137 matching messages over real pages, including identical timestamps',async t=>{
  const {client,state,url}=await backend(t),pager=new ServerSearchPager();
  const first=await pager.search(client,params);
  assert.equal(first.results.length,50);assert.equal(first.total,51);assert.equal(first.totalKnown,false);assert.equal(first.hasMore,true);assert.equal(first.searchInfo.resultUnit,'messages');assert.equal(first.searchInfo.engine,'live-text');
  const second=await pager.search(client,{...params,page:2,searchSession:first.searchSession});
  const third=await pager.search(client,{...params,page:3,searchSession:first.searchSession});
  assert.equal(second.results.length,50);assert.equal(third.results.length,37);assert.equal(third.hasMore,false);assert.equal(third.totalKnown,true);assert.equal(third.total,137);assert.equal(third.searchInfo.exhaustive,true);
  const all=[...first.results,...second.results,...third.results];assert.equal(new Set(all.map(r=>r.passageId)).size,137);
  assert.ok(all.some(r=>r.text.includes('1-63')));assert.ok(all.some(r=>r.text.includes('2-12')));
  assert.ok(all.every(r=>r.sourceIdentity.serverUrl===url&&Number.isSafeInteger(r.turnIndex)));
  assert.equal(all[1].role,'assistant');assert.equal(all[1].turnIndex,3);
  assert.ok(state.calls.every(u=>!u.searchParams.has('offset')));assert.ok(!state.calls.some(u=>u.pathname==='/api/search'));
  const calls=state.calls.length,back=await pager.search(client,{...params,page:1,searchSession:first.searchSession});assert.equal(state.calls.length,calls);assert.equal(back.total,137);assert.equal(back.totalKnown,true);assert.deepEqual(back.results,first.results);
});

test('lookahead across source boundaries is never lost and duplicate filenames retain complete identities',async t=>{
  const {client,url,files}=await backend(t,{lengths:[50,51,0]}),pager=new ServerSearchPager();
  const first=await pager.search(client,params),second=await pager.search(client,{...params,page:2,searchSession:first.searchSession}),third=await pager.search(client,{...params,page:3,searchSession:first.searchSession});
  assert.equal(second.results[0].text,'Cobalt search result 1-0');assert.equal(third.results[0].text,'Cobalt search result 1-50');
  assert.equal(second.results[0].id,remoteId(url,files[1]));assert.notEqual(first.results[0].id,second.results[0].id);assert.equal(third.total,101);
});

test('role and provider filters apply while scanning all messages with the original indices',async t=>{
  const {client,state}=await backend(t),pager=new ServerSearchPager();
  const result=await pager.search(client,{...params,role:'assistant',provider:'anthropic',collection:'work'});
  assert.equal(result.total,21);assert.equal(result.totalKnown,true);assert.ok(result.results.every(r=>r.role==='assistant'&&r.provider==='anthropic'&&r.collection==='work'&&r.turnIndex%9===3));
  assert.equal(state.calls.filter(u=>u.pathname==='/api/thread').length,1);
});

test('only bounded page excerpts are retained and an evicted earlier page is re-read correctly',async t=>{
  const {client}=await backend(t,{lengths:[140,0,0]}),pager=new ServerSearchPager();let result=await pager.search(client,{...params,pageSize:5});
  for(let page=2;page<=12;page++)result=await pager.search(client,{...params,page,pageSize:5,searchSession:result.searchSession});
  const session=pager.sessions.get(result.searchSession);assert.equal(session.pages.size,8);assert.ok(!session.pages.has(1));
  const first=await pager.search(client,{...params,pageSize:5,searchSession:result.searchSession});assert.equal(first.results[0].text,'Cobalt search result 0-0');assert.equal(first.results.length,5);assert.ok(session.pages.size<=8);
  const resumed=await pager.search(client,{...params,page:13,pageSize:5,searchSession:result.searchSession});assert.equal(resumed.results[0].text,'Cobalt search result 0-60');
});

test('a failed later thread does not silently truncate the result total and retry does not skip a page',async t=>{
  const {client,state}=await backend(t,{lengths:[51,50,0]}),pager=new ServerSearchPager();const first=await pager.search(client,params);state.failFile=1;
  await assert.rejects(pager.search(client,{...params,page:2,searchSession:first.searchSession}),/Synthetic unavailable/);
  state.failFile=null;const second=await pager.search(client,{...params,page:2,searchSession:first.searchSession});assert.equal(second.results.length,50);assert.equal(second.results[0].text,'Cobalt search result 0-50');assert.equal(second.results.at(-1).text,'Cobalt search result 1-48');assert.equal(second.hasMore,true);
});

test('cancellation during a page read rewinds its cursor; retry resumes without losing the first match',async t=>{
  const {client,state,url}=await backend(t,{lengths:[51,50,0]}),pager=new ServerSearchPager(),first=await pager.search(client,params);state.waitFile=1;
  const reached=new Promise(resolve=>{state.waiting=resolve;}),controller=new AbortController();
  const pending=pager.search(new ThreadShelfClient(url,{signal:controller.signal}),{...params,page:2,searchSession:first.searchSession});
  await reached;controller.abort();await assert.rejects(pending,/abort/i);state.waitFile=null;state.release();
  const retried=await pager.search(client,{...params,page:2,searchSession:first.searchSession});assert.equal(retried.results[0].text,'Cobalt search result 0-50');assert.equal(new Set(retried.results.map(r=>r.passageId)).size,50);
});

test('only an actual unsupported-endpoint 404 permits fallback; server and authentication errors propagate',async t=>{
  for(const status of [401,403,500]){const {client,state}=await backend(t,{capabilityStatus:status});await assert.rejects(new ServerSearchPager().search(client,params),error=>error.status===status);assert.equal(state.calls.length,1);}
});

test('legacy Meaning remains the real server-ranked top50 and explains that further pagination requires server support',async t=>{
  const {client,state}=await backend(t),pager=new ServerSearchPager();const first=await pager.search(client,{...params,searchMode:'semantic',pageSize:25}),second=await pager.search(client,{...params,searchMode:'semantic',pageSize:25,page:2,searchSession:first.searchSession});
  assert.equal(first.results.length,25);assert.equal(second.results.length,25);assert.equal(second.hasMore,false);assert.equal(second.total,50);assert.equal(second.searchInfo.exhaustive,false);assert.equal(second.searchInfo.paginationRequiresUpdate,true);assert.equal(second.searchInfo.engine,'server-ranked');
  assert.equal(state.calls.filter(u=>u.pathname==='/api/search').length,1);assert.ok(!state.calls.some(u=>u.pathname==='/api/thread'));assert.equal(state.calls.find(u=>u.pathname==='/api/search').searchParams.get('n'),'50');
});

test('the optional extension pages both text and semantic results past50, aggregating only valid max50 requests',async t=>{
  for(const searchMode of ['keyword','semantic']){
    const {client,state}=await backend(t,{extension:true}),pager=new ServerSearchPager();const first=await pager.search(client,{...params,searchMode,pageSize:100}),second=await pager.search(client,{...params,searchMode,pageSize:100,page:2,searchSession:first.searchSession});
    assert.equal(first.results.length,100);assert.equal(first.total,137);assert.equal(first.totalKnown,true);assert.equal(first.hasMore,true);assert.equal(second.results.length,37);assert.equal(second.hasMore,false);assert.equal(second.searchInfo.engine,'server-paged');assert.equal(second.searchInfo.paginationRequiresUpdate,false);
    assert.equal(new Set([...first.results,...second.results].map(r=>r.passageId)).size,137);const calls=state.calls.filter(u=>u.pathname==='/api/reader/search');assert.deepEqual(calls.map(u=>u.searchParams.get('n')),['50','50','50']);assert.ok(calls.slice(1).every(u=>u.searchParams.has('cursor')));assert.ok(!state.calls.some(u=>u.pathname==='/api/thread'||u.pathname==='/api/search'));
  }
});

test('an expired extension cursor gives an actionable retry instead of duplicate top50 results',async t=>{
  const {client,state}=await backend(t,{extension:true}),pager=new ServerSearchPager(),first=await pager.search(client,params);state.expire=true;
  await assert.rejects(pager.search(client,{...params,page:2,searchSession:first.searchSession}),/expired.*first page/);assert.ok(!pager.sessions.has(first.searchSession));
  const restarted=await pager.search(client,{...params,page:2,searchSession:first.searchSession});assert.equal(restarted.page,1);assert.equal(restarted.sessionRestarted,true);assert.equal(restarted.results.length,50);
});

test('sessions are bound to source, query, filters, and page size; evicted sessions explicitly restart',async t=>{
  const {client}=await backend(t),pager=new ServerSearchPager();const first=await pager.search(client,params);
  await assert.rejects(pager.search(client,{...params,q:'other',searchSession:first.searchSession}),/search changed/);
  await assert.rejects(pager.search(client,{...params,pageSize:25,searchSession:first.searchSession}),/search changed/);
  for(let i=0;i<5;i++)await pager.search(client,{...params,q:`cobalt ${i}`});assert.equal(pager.sessions.size,4);
  const retry=await pager.search(client,{...params,page:2,searchSession:first.searchSession});assert.equal(retry.page,1);assert.equal(retry.sessionRestarted,true);
});

test('ApplicationService server paging never imports conversations or writes search hits into the Local archive',async t=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-live-server-search-')),service=await new ApplicationService({dataDir}).init();
  t.after(async()=>{await service.shutdown();await fs.rm(dataDir,{recursive:true,force:true});});const {url}=await backend(t);
  const first=await service.handle('search',{...params,mode:'server',serverUrl:url});const second=await service.handle('search',{...params,mode:'server',serverUrl:url,page:2,searchSession:first.searchSession});
  assert.equal(second.results.length,50);assert.equal((await service.handle('files',{mode:'local'})).total,0);assert.deepEqual((await service.handle('collections',{mode:'local'})).collections,[]);
  assert.ok(!(await fs.readdir(dataDir)).some(name=>/server.*search|search.*server/.test(name)));
});

test('a direct request past the known final page returns that final page without replaying the first search',async t=>{
  for(const extension of [false,true]){
    const {client,state}=await backend(t,{extension}),pager=new ServerSearchPager();let result=await pager.search(client,params);
    for(let page=2;page<=3;page++)result=await pager.search(client,{...params,page,searchSession:result.searchSession});
    const count=state.calls.length,last=await pager.search(client,{...params,page:99,searchSession:result.searchSession});assert.equal(last.page,3);assert.equal(last.total,137);assert.equal(last.results.length,37);assert.equal(last.hasMore,false);assert.equal(state.calls.length,count);
  }
});
