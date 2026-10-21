import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFilters,buildReport} from '../src/core/metrics.mjs';
const conversations=[{id:'c',provider:'openai',sourceId:'source',collectionIds:['one'],records:[{id:'r',objectId:'o',logicalId:'l',category:'user',text:'hello',timestamp:0,datePrecision:'millisecond',observed:true,selected:true}]}];
test('unknown saved filter keys are retained and explicitly report a partial selection',()=>{
 const filtered=applyFilters(conversations,{range:'all',extensionFilter:{mode:'future'}});
 assert.deepEqual(filtered.filters.extensionFilter,{mode:'future'});
 assert.equal(filtered.filterStatus,'partial');assert.deepEqual(filtered.unsupportedFilterKeys,['extensionFilter']);
 assert.equal(filtered.warnings[0].code,'unsupported-filter-keys');
 const report=buildReport(conversations,{extensionFilter:'future'},{previousPeriod:false});
 assert.equal(report.warnings[0].code,'unsupported-filter-keys');
});
test('legacy zero epoch original dates and count meanings remain available',()=>{
 const report=buildReport(conversations,{range:'all',timeZone:'UTC'},{previousPeriod:false});
 assert.equal(report.summary.records,1);assert.equal(report.summary.userMessages,1);assert.equal(report.summary.objects,1);assert.equal(report.summary.characters,5);assert.equal(report.summary.datedRecords,1);
 assert.equal(report.application.analyticalSchemaVersion,'1.0.0');assert.equal(report.application.version,'1.0.0');
});
