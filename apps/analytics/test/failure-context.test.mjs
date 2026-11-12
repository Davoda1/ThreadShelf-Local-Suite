import test from 'node:test';
import assert from 'node:assert/strict';
import {selectFailure} from '../src/ui/failure-context.mjs';
const failed={id:'failed-A',path:'/Reader A',status:'unavailable',lastError:{code:'SOURCE_INTEGRITY',message:'Invalid source'},lastFailure:{phase:'content'}};
const ready={id:'ready-B',path:'/Reader B',status:'ready'};
test('a previous failed source retains the correct retry target after a different source succeeds',()=>{
 const result=selectFailure({sources:[failed,ready],job:{running:false,status:'complete',sourceId:ready.id}},null);
 assert.equal(result.source.id,failed.id);assert.equal(result.source.path,'/Reader A');assert.equal(result.error.code,'SOURCE_INTEGRITY');assert.equal(result.details.phase,'content');
});
test('active failures use their own source and in-progress or cancelled captures do not appear as failures',()=>{
 const current=selectFailure({sources:[failed,ready],job:{running:false,status:'unavailable',sourceId:ready.id,error:{code:'EACCES',message:'Permission denied'},phase:'catalog'}},null);
 assert.equal(current.source.id,ready.id);assert.equal(current.details.phase,'catalog');
 assert.equal(selectFailure({sources:[{...failed,status:'cancelled'}],job:{running:false,status:'cancelled',error:{code:'ABORT_ERR'}}},null),null);
 assert.equal(selectFailure({sources:[failed],job:{running:true}},null),null);
});
test('startup cache failures remain visible and calculation errors are not falsely assigned to a Reader source',()=>{
 const source={id:'cache',status:'cache-corrupt',cacheError:'Saved capture checksum mismatch'};
 assert.equal(selectFailure({sources:[source]},null).error.code,'CACHE_CORRUPT');assert.equal(selectFailure({sources:[source]},null).details.phase,'load');
 const calculation=selectFailure({sources:[failed,ready]},'Report failed');assert.equal(calculation.source,null);assert.equal(calculation.error.code,'ANALYSIS_FAILED');
});

test('a current startup cache failure takes precedence over an older failed-refresh diagnostic',()=>{
 for(const status of ['cache-corrupt','cache-unavailable','index-invalid']){
  const source={...failed,status,cacheError:'Current retained-capture loading failure'},result=selectFailure({sources:[source],job:{running:false}},null);
  assert.equal(result.source.id,failed.id);assert.equal(result.error.code,status.toUpperCase().replaceAll('-','_'));assert.equal(result.error.message,source.cacheError);assert.deepEqual(result.details,{kind:'load',phase:'load'});
 }
});
