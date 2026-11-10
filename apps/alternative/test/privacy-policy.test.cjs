const test=require('node:test');
const assert=require('node:assert/strict');
const {enforcePrivacy}=require('../core/privacy-policy.cjs');
test('privacy policy prevents dependency activation and inherited environment opt-ins',()=>{
 let starts=0,uploads=0;
 const reporter={start(){starts++;},setUploadToServer(){uploads++;}};
 const processObject={env:{ORT_DISABLE_TELEMETRY:'0',HF_HUB_DISABLE_TELEMETRY:'0',DO_NOT_TRACK:'0'},crashReporter:reporter};
 enforcePrivacy(reporter,processObject);enforcePrivacy(reporter,processObject);
 reporter.start({uploadToServer:true});reporter.setUploadToServer(true);
 assert.equal(starts,0);assert.equal(uploads,0);
 for(const name of ['start','setUploadToServer']){
  assert.equal(Reflect.set(reporter,name,()=>{}),false);
  assert.equal(Reflect.defineProperty(reporter,name,{value:()=>{}}),false);
  assert.equal(Reflect.deleteProperty(reporter,name),false);
 }
 assert.deepEqual(Object.values(processObject.env),['1','1','1']);
});
