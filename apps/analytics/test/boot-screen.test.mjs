import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {parse} from 'parse5';
import {BOOT_CSS,BOOT_MARKUP,injectBootShell} from '../src/ui/boot-screen.mjs';
const {createBootLifecycle}=createRequire(import.meta.url)('../src/desktop/boot-lifecycle.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('owned settings and dataset initialization waits for a visible shell; concurrent callers share it',async()=>{
  let initializeCount=0,release;
  const work=new Promise(resolve=>{release=resolve;}),events=[];
  const lifecycle=createBootLifecycle({initialize:async()=>{initializeCount++;await work;return {dataset:'latest'};},onState:state=>events.push(state.phase)});
  const background=lifecycle.ready(),bootstrap=lifecycle.ready();
  assert.strictEqual(background,bootstrap);await tick();
  assert.equal(initializeCount,0);assert.deepEqual(events,['loading']);
  lifecycle.markShellVisible();await tick();assert.equal(initializeCount,1);
  release();assert.deepEqual(await bootstrap,{dataset:'latest'});
  assert.deepEqual(events,['loading','ready']);assert.equal(lifecycle.state.attempt,1);
  assert.deepEqual(await lifecycle.ready(),{dataset:'latest'});assert.equal(initializeCount,1);
});

test('failed boot stays failed for actions and retries exactly once through a new bootstrap',async()=>{
  let initializeCount=0;const failure=Object.assign(new Error('Owned cache unavailable.'),{code:'CACHE_UNAVAILABLE'}),events=[];
  const lifecycle=createBootLifecycle({initialize:async()=>{if(++initializeCount===1)throw failure;return 'recovered';},onState:state=>events.push(state)});
  lifecycle.markShellVisible();await assert.rejects(lifecycle.ready(),{code:'CACHE_UNAVAILABLE'});
  await assert.rejects(lifecycle.ready(),{code:'CACHE_UNAVAILABLE'});assert.equal(initializeCount,1);
  assert.deepEqual(lifecycle.state,{phase:'error',attempt:1,error:{code:'CACHE_UNAVAILABLE',message:'Owned cache unavailable.'}});
  const firstRetry=lifecycle.ready({retry:true}),secondRetry=lifecycle.ready({retry:true});assert.strictEqual(firstRetry,secondRetry);
  assert.equal(await firstRetry,'recovered');assert.equal(initializeCount,2);assert.equal(lifecycle.state.attempt,2);
  assert.deepEqual(events.map(value=>value.phase),['loading','error','loading','ready']);
});

test('closing before first paint never starts initialization or silently writes default settings',async()=>{
  let initializeCount=0;const lifecycle=createBootLifecycle({initialize:async()=>{initializeCount++;}});
  const bootstrap=lifecycle.ready();lifecycle.close();
  await assert.rejects(bootstrap,{code:'BOOT_CLOSED'});await assert.rejects(lifecycle.ready({retry:true}),{code:'BOOT_CLOSED'});
  assert.equal(initializeCount,0);assert.equal(lifecycle.state.phase,'closed');
});

function descendants(node){return [node,...(node.childNodes||[]).flatMap(descendants)];}
function attribute(node,name){return node.attrs?.find(value=>value.name===name)?.value;}
test('built and standalone boot markup exists without renderer JavaScript and is injected only once',()=>{
  const original='<!doctype html><html lang="en" class="existing"><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module" src="ui.js"></script></body></html>';
  const html=injectBootShell(original);assert.equal(injectBootShell(html),html);
  const nodes=descendants(parse(html)),cover=nodes.filter(node=>attribute(node,'id')==='analytics-boot'),style=nodes.filter(node=>attribute(node,'id')==='analytics-boot-css');
  assert.equal(cover.length,1);assert.equal(style.length,1);assert.equal(attribute(cover[0],'role'),'status');
  const app=nodes.find(node=>attribute(node,'id')==='app');assert.equal(attribute(app,'aria-hidden'),'true');assert.equal(attribute(app,'inert'),'');
  assert.match(attribute(nodes.find(node=>node.tagName==='html'),'class'),/existing analytics-booting/);
  assert.match(html,new RegExp(BOOT_MARKUP.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok(html.indexOf('id="analytics-boot"')<html.indexOf('id="app"'));
  assert.match(BOOT_CSS,/@media\(prefers-color-scheme:dark\)/);assert.match(BOOT_CSS,/background:#fff!important;color:#000!important/);assert.match(BOOT_CSS,/background:#000!important;color:#fff!important/);
  assert.match(BOOT_CSS,/animation:analytics-boot-spin 1s linear infinite/);assert.doesNotMatch(BOOT_CSS,/url\(/);
});
