import test from 'node:test';
import assert from 'node:assert/strict';
import { createThoughtsViewCache, summarizeVisibleTurns, isHiddenViewEntry, visibleSnippet, isChatGPTSummary } from '../src/ui/thoughts-view-state.mjs';
const empty=JSON.stringify({content_type:'thoughts',source_analysis_msg_id:'synthetic-only',thoughts:[{content:'',chunks:[],summary:'Searched the web',finished:true}]});
const thread={turns:[{user:'Question',turn_index:4},{ai:empty,turn_index:8},{ai:'Actual answer',turn_index:12},{thinking:'Useful reasoning',turn_index:15}]};

test('view summaries remove only status turns by stable identity without modifying source',()=>{
 const snapshot=JSON.stringify(thread),summary=summarizeVisibleTurns(thread);
 assert.equal(summary.count,3);assert.deepEqual([...summary.hidden],['8:assistant']);
 assert.equal(isHiddenViewEntry({turnIndex:8,role:'ai'},summary),true);
 assert.equal(isHiddenViewEntry({turnIndex:8,role:'assistant'},summary),true);
 assert.equal(isHiddenViewEntry({turnIndex:8},summary),true);
 assert.equal(isHiddenViewEntry({turnIndex:8,role:'user'},summary),false);
 assert.equal(isHiddenViewEntry({turnIndex:12,role:'assistant'},summary),false);
 assert.equal(isHiddenViewEntry({turnIndex:15,role:'thinking'},summary),false);
 assert.equal(JSON.stringify(thread),snapshot);
 assert.equal(isChatGPTSummary({provider:'openai'}),true);assert.equal(isChatGPTSummary({provider:'anthropic'}),false);
});

test('truncated JSON excerpts are not shown before their original turn is verified',()=>{
 const snippet={role:'assistant',text:'{"content_type":"thoughts","source_analysis_msg_id":"synthetic-only","thoughts":[…'};
 assert.equal(visibleSnippet(snippet,null),'');
 assert.equal(visibleSnippet({...snippet,role:'user'},null),snippet.text);
 assert.equal(visibleSnippet({role:'assistant',text:'Ordinary prose'},null),'Ordinary prose');
 assert.equal(visibleSnippet({turnIndex:8,role:'ai',text:empty},summarizeVisibleTurns(thread)),'');
});

test('source reads are bounded, deduplicated and cache only compact visibility metadata',async()=>{
 let active=0,peak=0,calls=0;const releases=[];
 const cache=createThoughtsViewCache(async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(done=>releases.push(done));active--;return thread;},{concurrency:2,maxEntries:3});
 const tasks=Array.from({length:7},(_,i)=>cache.resolve('key'+i,{id:i}));
 assert.equal(cache.resolve('key0',{id:0}),tasks[0]);
 await new Promise(setImmediate);assert.equal(calls,2);
 while(releases.length||calls<7){for(const release of releases.splice(0))release();await new Promise(setImmediate);}
 const values=await Promise.all(tasks);assert.equal(peak,2);assert.equal(calls,7);
 assert.equal(values.every(value=>value.count===3),true);assert.equal(cache.get('key0'),undefined);assert.equal(cache.get('key6').count,3);
 assert.deepEqual(Object.keys(cache.get('key6')).sort(),['count','hidden','visible']);
});

test('source invalidation discards queued and stale async results without writing state',async()=>{
 let release,calls=0;const cache=createThoughtsViewCache(async()=>{calls++;await new Promise(done=>release=done);return thread;},{concurrency:1});
 const first=cache.resolve('old',{id:'old'}),queued=cache.resolve('queued',{id:'queued'});await new Promise(setImmediate);
 cache.clear();assert.equal(await queued,null);release();assert.equal(await first,null);assert.equal(cache.get('old'),undefined);assert.equal(calls,1);
 const failing=createThoughtsViewCache(async()=>{throw new Error('offline');});assert.equal(await failing.resolve('offline',{}),null);
});
