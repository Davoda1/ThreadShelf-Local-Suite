'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {waitForWorkspace,flushPreferences,setNativeViewport,waitForPreview}=require('./helpers/native-workspace.cjs');
const execute=(fn,context)=>vm.runInNewContext('('+fn.toString()+')()',context);
function documentFor(phase,inert){return {documentElement:{dataset:{boot:phase}},getElementById:id=>id==='app'?{inert}:id==='startup-detail'?{textContent:'Synthetic startup rejection'}:null,fonts:{ready:Promise.resolve()}};}

test('native harness readiness rejects the initial blank document and inert startup shell',async()=>{
 const observations=[];let fontsRead=false;
 const page={
  async waitForFunction(check){
   for(const [document,window] of [
    [documentFor(undefined,true),{}],
    [documentFor('loading',true),{TSADemo:{create(){}},TSAContent:{renderThread(){}},TSAFlush(){}}],
    [documentFor('ready',true),{TSADemo:{create(){}},TSAContent:{renderThread(){}},TSAFlush(){}}],
    [documentFor('ready',false),{TSADemo:{create(){}},TSAContent:{renderThread(){}},TSAFlush(){}}],
   ])observations.push(!!execute(check,{document,window}));
   assert.equal(observations.at(-1),true);
  },
  async evaluate(check){assert.deepEqual(observations,[false,false,false,true]);await execute(check,{document:documentFor('ready',false)});fontsRead=true;},
 };
 await waitForWorkspace(page);assert.equal(fontsRead,true);
});

test('native harness startup errors remain explicit failures',async()=>{
 let evaluated=false;
 await assert.rejects(waitForWorkspace({async waitForFunction(check){execute(check,{document:documentFor('error',true),window:{}});},async evaluate(){evaluated=true;}}),/Synthetic startup rejection/);
 assert.equal(evaluated,false);
});

test('native layout checks wait for the application preference queue before reading the saved snapshot',async()=>{
 let finishWrite,read=false;
 const pending=new Promise(resolve=>{finishWrite=resolve;});
 const page={async evaluate(check){return execute(check,{window:{TSAFlush:()=>pending,alternative:{loadState(){read=true;return {theme:'dark',codeWrap:true,htmlPreviewExternal:false};}}}});}};
 const checked=flushPreferences(page,{theme:'dark',codeWrap:true,htmlPreviewExternal:false});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(read,false);
 finishWrite(undefined);await checked;assert.equal(read,true);
});

test('native layout checks reject unsuccessful writes and mismatched saved preferences',async()=>{
 await assert.rejects(flushPreferences({async evaluate(){return false;}},{theme:'dark'}),/application profile must be writable/);
 let call=0;await assert.rejects(flushPreferences({async evaluate(){return ++call===1?true:{htmlPreviewExternal:true};}},{htmlPreviewExternal:false}),/Persisted Reading preference: htmlPreviewExternal/);
});

function viewportFixture(actual){
 const calls=[];let viewport;
 const owner={setContentSize(width,height){calls.push({native:{width,height}});},getContentSize(){return [actual.width,actual.height];}};
 return {calls,app:{async evaluate(check,arg){return check({BrowserWindow:{getAllWindows:()=>[owner]}},arg);}},page:{async setViewportSize(value){calls.push({dom:value});viewport=value;},async evaluate(){return viewport;}}};
}
test('native layout emulation matches the actual client area when the OS constrains its height',async()=>{
 const f=viewportFixture({width:1100,height:700});const result=await setNativeViewport(f.app,f.page,{width:1100,height:780});
 assert.deepEqual(result,{width:1100,height:700});assert.deepEqual(f.calls,[{native:{width:1100,height:780}},{dom:{width:1100,height:700}}]);
});
test('native layout checks cannot silently miss their width breakpoint or supported minimum height',async()=>{
 for(const actual of [{width:1000,height:780},{width:1100,height:500}]){
  const f=viewportFixture(actual);await assert.rejects(setNativeViewport(f.app,f.page,{width:1100,height:780}),/Native content width|native host/);assert.equal(f.calls.length,1);
 }
});

test('an HTML failure placeholder cannot be accepted as a ready native rendering',async()=>{
 const node={dataset:{previewError:'true'},textContent:'Synthetic native preview failure'};
 const block={page:()=>({async waitForFunction(){}}),locator:()=>({async waitFor(){},async evaluate(check){return check(node);}})};
 await assert.rejects(waitForPreview({},block),/HTML preview failed: Synthetic native preview failure/);
});
