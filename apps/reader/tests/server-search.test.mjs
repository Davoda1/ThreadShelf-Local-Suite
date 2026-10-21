import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {ThreadShelfClient,remoteId,serverSearchLimit,SERVER_SEARCH_CAPABILITIES} from '../src/core/server.mjs';

// Uses the actual 1.2.0/1.2.3 API constraint; the 1.0.0 client sent n=100
// and fails this fixture with exactly the user's reported maximum-50 error.
async function backend(t){
  const calls=[];
  const summaries=[
    {collection:'work',sourceFile:'/first/same.json',conversationKey:'one',title:'Cobalt in the title',provider:'openai',turnCount:2},
    {collection:'work',sourceFile:'/second/same.json',conversationKey:'one',title:'Different heading',provider:'anthropic',turnCount:3},
    {collection:'other',sourceFile:'/first/same.json',conversationKey:'one',title:'Other collection',provider:'openai',turnCount:2},
  ];
  const rows=Array.from({length:80},(_,index)=>{
    const summary=summaries[index%3];
    return {id:`passage-${index}`,document:`Cobalt body text ${index}`,metadata:{...summary,role:['user','ai','thinking'][index%3],turnIndex:String(index)},distance:index/100};
  });
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url,'http://localhost');calls.push(url);
    response.setHeader('Content-Type','application/json');
    if(url.pathname==='/api/files'){
      const collection=url.searchParams.get('collection');
      response.end(JSON.stringify({files:summaries.filter(s=>collection==='all'||s.collection===collection)}));return;
    }
    if(url.pathname==='/api/search'){
      const n=Number(url.searchParams.get('n'));
      if(!Number.isInteger(n)||n<1||n>50){response.statusCode=400;response.end(JSON.stringify({error:n>50?'Invalid n: maximum 50':'Invalid n: must be integer 1..50',field:'n'}));return;}
      const role=url.searchParams.get('roles');
      if(role&&!['user','ai','thinking'].includes(role)){response.statusCode=400;response.end(JSON.stringify({error:`Invalid roles: unknown role "${role}"`}));return;}
      const collection=url.searchParams.get('collection');
      const hits=rows.filter(r=>(collection==='all'||r.metadata.collection===collection)&&(!role||r.metadata.role===role)).slice(0,n);
      // Single-collection server responses omit collection metadata, while
      // cross-collection responses add it. Test both upstream forms.
      response.end(JSON.stringify({results:hits.map(hit=>collection==='all'?hit:{...hit,metadata:{...hit.metadata,collection:undefined}})}));return;
    }
    response.statusCode=404;response.end(JSON.stringify({error:'Unexpected endpoint'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {url:`http://127.0.0.1:${server.address().port}/`,calls};
}

test('keyword and semantic searches honor actual server maximum despite UI limit 1000',async t=>{
  const {url,calls}=await backend(t),client=new ThreadShelfClient(url);
  for(const searchMode of ['keyword','semantic']){
    const result=await client.search({q:'cobalt',searchMode,limit:1000});
    assert.equal(result.results.length,50);
    assert.equal(result.total,50);
    assert.equal(result.searchInfo.limit,50);
    assert.equal(result.searchInfo.maxResults,50);
    assert.equal(result.searchInfo.mode,searchMode);
    assert.equal(result.searchInfo.exhaustive,false);
    assert.equal(result.searchInfo.resultUnit,'passages');
    assert.equal(result.capabilities.localModelRequired,false);
    assert.match(result.notice,/up to 50.*not an exhaustive total/);
  }
  const searches=calls.filter(u=>u.pathname==='/api/search');
  assert.deepEqual(searches.map(u=>[u.searchParams.get('mode'),u.searchParams.get('n')]),[['keyword','50'],['semantic','50']]);
  assert.ok(calls.every(u=>u.pathname==='/api/search'||u.pathname==='/api/files'));
});

test('all transmitted result limits are finite integers from 1 to 50',async t=>{
  const {url,calls}=await backend(t),client=new ThreadShelfClient(url);
  for(const [limit,expected] of [[undefined,50],[0,1],[-2,1],[1.9,1],[7.8,7],['24',24],[50,50],[1000,50],[NaN,50],[Infinity,50],['invalid',50]]){
    assert.equal(serverSearchLimit(limit),expected);
    const result=await client.search({q:'cobalt',limit});
    assert.equal(result.searchInfo.limit,expected);
    assert.ok(result.results.length<=expected);
  }
  assert.ok(calls.filter(u=>u.pathname==='/api/search').every(u=>{const n=Number(u.searchParams.get('n'));return Number.isInteger(n)&&n>=1&&n<=50;}));
});

test('role aliases filter on server before its bounded result set and retain full identities',async t=>{
  const {url,calls}=await backend(t),client=new ThreadShelfClient(url);
  const result=await client.search({q:'cobalt',collection:'work',role:'assistant',limit:50});
  assert.equal(calls.find(u=>u.pathname==='/api/search').searchParams.get('roles'),'ai');
  assert.ok(result.results.length>0);
  for(const hit of result.results){
    assert.equal(hit.role,'assistant');assert.equal(hit.collection,'work');
    assert.equal(hit.sourceFile,'/second/same.json');assert.equal(hit.conversationKey,'one');
    assert.equal(hit.conversationId,remoteId(url,{collection:'work',sourceFile:'/second/same.json',conversationKey:'one'}));
    assert.deepEqual(hit.sourceIdentity,{kind:'threadshelf',serverUrl:url,collection:'work',sourceFile:'/second/same.json',conversationKey:'one'});
    assert.ok(Number.isSafeInteger(hit.turnIndex));assert.ok(hit.passageId.startsWith(hit.conversationId+':'));
  }
  const zero=await client.search({q:'cobalt',role:'user'});
  assert.equal(zero.results[0].turnIndex,0);
  const ai=await client.search({q:'cobalt',role:'ai'});
  assert.ok(ai.results.every(hit=>hit.role==='assistant'));
  await assert.rejects(client.search({q:'cobalt',role:'tool'}),/role filters/);
});

test('provider post-filter does not overfetch and honestly reports the bounded scope',async t=>{
  const {url,calls}=await backend(t),client=new ThreadShelfClient(url);
  const result=await client.search({q:'cobalt',provider:'anthropic',limit:1000});
  assert.ok(result.results.length>0&&result.results.length<50);
  assert.ok(result.results.every(hit=>hit.provider==='anthropic'));
  assert.equal(result.searchInfo.serverReturnedPassages,50);
  assert.equal(result.searchInfo.returnedPassages,result.results.length);
  assert.equal(result.searchInfo.postFiltered,true);
  assert.match(result.notice,/provider filter.*returned set/);
  assert.equal(calls.filter(u=>u.pathname==='/api/search').length,1);
  assert.equal(calls.find(u=>u.pathname==='/api/search').searchParams.get('n'),'50');
  const all=await client.search({q:'cobalt',provider:'all',role:'all'});
  assert.equal(all.results.length,50);assert.equal(all.searchInfo.postFiltered,false);
});

test('server title filtering uses summaries only and never searches conversation contents',async t=>{
  const {url,calls}=await backend(t),client=new ThreadShelfClient(url);
  const result=await client.files({q:'cobalt',collection:'work'});
  assert.equal(result.total,1);assert.equal(result.files[0].title,'Cobalt in the title');
  assert.ok(calls.every(u=>u.pathname==='/api/files'));
  const noTitleMatch=await client.files({q:'body text'});
  assert.equal(noTitleMatch.total,0);
});

test('empty queries avoid requests; unsupported local modes cannot silently become server keyword search',async t=>{
  const {url,calls}=await backend(t),client=new ThreadShelfClient(url);
  assert.deepEqual((await client.search({q:'  '})).results,[]);
  await assert.rejects(client.search({q:'cobalt',searchMode:'ollama'}),/supports text and semantic/);
  await assert.rejects(client.search({q:'cobalt',searchMode:'titles'}),/conversation filter/);
  await assert.rejects(client.search({q:'x'.repeat(4001)}),/4000/);
  assert.equal(calls.length,0);
  assert.equal(SERVER_SEARCH_CAPABILITIES.keywordMatch,'substring');
});
