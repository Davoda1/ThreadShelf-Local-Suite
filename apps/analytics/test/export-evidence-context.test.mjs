import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/ui/app.js',import.meta.url),'utf8'),start=source.indexOf("document.addEventListener('submit',async event=>{"),end=source.indexOf('\nasync function previewExport(',start);
assert(start>=0&&end>start,'Actual export form submit handler boundaries');
function harness(contextValue){
 let submit;const requests=[],filters={models:['current-applied-model'],timeZone:'UTC'},context=vm.createContext({document:{addEventListener:(type,callback)=>{assert.equal(type,'submit');submit=callback;}},FormData:class{constructor(form){this.values=form.values;}get(key){return this.values[key]??null;}has(key){return Object.hasOwn(this.values,key);}},state:{backendAnalysis:true,preview:false,settings:{language:'en',codeTheme:'default'}},mergedFilters:()=>filters,evidence:[{id:'retained-same-id',text:'PRIVATE_SYNTHETIC_BODY'}],evidencePageInfo:{evidenceContext:contextValue},evidenceQuery:{nativeHistory:{sourceId:'incorrect-stale-source',captureId:'incorrect-stale-capture'}},explorerConfig:{},appliedComparison:null,bridge:{exportReport:async args=>{requests.push(structuredClone(args));return{cancelled:false};}},run:fn=>fn(),showToast:()=>{},t:key=>key,closeDialog:()=>{}});
 vm.runInContext(source.slice(start,end),context);return{context,requests,filters,submit:values=>submit({target:{id:'export-form',values},preventDefault(){}})};
}
test('actual export form sends the accepted historical page context only with explicit evidence consent',async()=>{
 for(const evidenceContext of [{kind:'history-diff',reportId:'a'.repeat(32),table:'removed'},{kind:'capture',reportId:'b'.repeat(32),sourceId:'s'.repeat(64),captureId:'c'.repeat(64)}]){
  const h=harness(evidenceContext);await h.submit({format:'json',includeEvidence:'on'});const value=h.requests[0];assert.deepEqual(value.evidenceContext,evidenceContext);assert.deepEqual(value.evidenceIds,['retained-same-id']);assert.deepEqual(value.filters,h.filters);assert.equal(value.includeEvidence,true);assert(!JSON.stringify(value).includes('PRIVATE_SYNTHETIC_BODY'));assert(!JSON.stringify(value.evidenceContext).includes('incorrect-stale'));
  await h.submit({format:'json'});const aggregate=h.requests[1];assert.equal(aggregate.includeEvidence,false);assert.deepEqual(aggregate.evidenceIds,[]);assert.equal(Object.hasOwn(aggregate,'evidenceContext'),false);assert.deepEqual(aggregate.filters,h.filters);
 }
});
test('replacement ordinary pages and the synthetic preview do not reuse an earlier history context',async()=>{
 const h=harness({kind:'history-diff',reportId:'a'.repeat(32),table:'changed'});h.context.evidencePageInfo={};await h.submit({format:'json',includeEvidence:'on'});assert.equal(Object.hasOwn(h.requests[0],'evidenceContext'),false);
 h.context.evidencePageInfo={evidenceContext:{kind:'history-diff',reportId:'a'.repeat(32),table:'removed'}};h.context.state.backendAnalysis=false;h.context.state.preview=true;h.context.state.conversations=[];await h.submit({format:'json',includeEvidence:'on'});assert.equal(Object.hasOwn(h.requests[1],'evidenceContext'),false);
});
