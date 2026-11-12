'use strict';
// Native GUI assertions inspect descriptors and explicit bounded fixture pages.
const assert=require('node:assert/strict');
const BOOTSTRAP_BYTES=2*1024*1024;
let requestId=1000000;
function assertNativeBootstrap(value,{empty=false}={}){
 assert.equal(value.backendAnalysis,true,'Native Analytics must use the disk-backed backend');
 assert.equal(Object.hasOwn(value,'conversations'),false,'Native bootstrap must not contain a conversation corpus');
 assert(value.dataset&&/^[a-f0-9]{64}$/.test(value.dataset.revision),'Native dataset has a committed descriptor identity');
 for(const key of ['conversationCount','recordCount'])assert(Number.isSafeInteger(value.dataset[key])&&value.dataset[key]>=0,'Valid native dataset '+key);
 assert(Buffer.byteLength(JSON.stringify(value))<=BOOTSTRAP_BYTES,'Native bootstrap stays within its descriptor byte budget');
 if(empty){assert.equal(value.dataset.conversationCount,0);assert.equal(value.dataset.recordCount,0);}
 return value;
}
async function readNativeBootstrap(page){return assertNativeBootstrap(await page.evaluate(()=>window.analytics.bootstrap()));}
async function smallCapture(page,{conversations=1,records=2}={}){
 assert(conversations<=100&&records<=100,'Only a deliberately small synthetic fixture can be inspected in one page');
 const state=await readNativeBootstrap(page);assert.equal(state.dataset.conversationCount,conversations);assert.equal(state.dataset.recordCount,records);
 await page.waitForFunction(expected=>!document.querySelector('#analytics-boot')&&!document.querySelector('.job[role="status"]')&&Number((document.querySelector('.stat .value')?.textContent||'').replace(/\D/g,''))===expected,conversations);
 const metadata=await page.evaluate(()=>window.analytics.conversationPage({offset:0,limit:100}));
 assert.equal(metadata.total,conversations);assert.equal(metadata.rows.length,conversations);assert(metadata.rows.every(row=>!Object.hasOwn(row,'records')),'Conversation picker is metadata-only');
 const result=await page.evaluate(requestId=>window.analytics.calculate({requestId,filters:{timeZone:'UTC'},options:{previousPeriod:false}}),++requestId);
 try{
  assert.equal(result.report.summary.conversations,conversations);assert.equal(result.report.summary.records,records);
  const evidence=await page.evaluate(reportId=>window.analytics.evidence({reportId,offset:0,limit:100}),result.reportId);
  assert.equal(evidence.total,records);assert.equal(evidence.evidence.length,records);
  assert(Buffer.byteLength(JSON.stringify(evidence))<=1024*1024,'Synthetic native evidence uses a bounded page');
  return{metadata:metadata.rows,evidence:evidence.evidence,identities:metadata.rows.map(c=>[c.id,evidence.evidence.filter(r=>r.conversationId===c.id).map(r=>r.id)])};
 }finally{await page.evaluate(reportId=>window.analytics.releaseReport({reportId}),result.reportId);}
}
module.exports={BOOTSTRAP_BYTES,assertNativeBootstrap,readNativeBootstrap,smallCapture};
