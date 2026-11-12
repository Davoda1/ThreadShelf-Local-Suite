import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeAnalyticsUpdate,needsDataResync} from '../src/ui/update-order.mjs';
const source={id:'source',status:'ready',conversationCount:1,snapshotId:'new'};
const initial=()=>({settings:{language:'en'},sources:[],conversations:[],diagnostics:[],job:{running:false}});
const conversation={id:'conversation',sourceId:'source',snapshotId:'new',records:[{id:'record'}]};

test('delayed captured conversations survive newer status updates without regressing metadata',()=>{
 let value=mergeAnalyticsUpdate(initial(),{__updateRevision:11,sources:[source],job:{running:false,status:'complete'},registrationBusy:false,settings:{language:'hu'}},{metadata:0,data:0});
 assert.equal(needsDataResync(value.state),true);
 value=mergeAnalyticsUpdate(value.state,{__updateRevision:10,conversations:[conversation],diagnostics:[{code:'captured'}],sources:[{...source,status:'refreshing'}],job:{running:true},registrationBusy:true,settings:{language:'en'}},value.versions);
 assert.deepEqual(value.state.conversations,[conversation]);assert.equal(value.state.sources[0].status,'ready');assert.equal(value.state.settings.language,'hu');assert.equal(value.state.job.running,false);assert.equal(value.state.registrationBusy,false);assert.equal(value.dataChanged,true);assert.equal(needsDataResync(value.state),false);
});
test('newer data removals win over delayed older data and duplicate publications',()=>{
 const full=mergeAnalyticsUpdate(initial(),{__updateRevision:10,conversations:[conversation],sources:[source]});
 const cleared=mergeAnalyticsUpdate(full.state,{__updateRevision:12,conversations:[],sources:[]},full.versions);
 for(const payload of [{__updateRevision:10,conversations:[conversation]},{__updateRevision:12,conversations:[conversation]}]){const stale=mergeAnalyticsUpdate(cleared.state,payload,cleared.versions);assert.equal(stale.changed,false);assert.deepEqual(stale.state.conversations,[]);}
});
test('serialized bootstrap fills a missing snapshot and legacy unversioned preview updates remain usable',()=>{
 let value=mergeAnalyticsUpdate(initial(),{__updateRevision:4,sources:[source],job:{running:false,status:'complete'}});
 assert.equal(needsDataResync(value.state),true);
 value=mergeAnalyticsUpdate(value.state,{__updateRevision:4,sources:[source],conversations:[conversation]},value.versions);assert.equal(value.dataChanged,true);assert.equal(needsDataResync(value.state),false);
 const preview=mergeAnalyticsUpdate(value.state,{conversations:[],sources:[],settings:{language:'de'}},value.versions);assert.equal(preview.state.settings.language,'de');assert.deepEqual(preview.state.conversations,[]);
});
test('in-progress captures wait for publication; replaced and removed source snapshots request recovery',()=>{
 assert.equal(needsDataResync({...initial(),sources:[source],job:{running:true}}),false);
 assert.equal(needsDataResync({...initial(),sources:[source],registrationBusy:true}),false);
 assert.equal(needsDataResync({...initial(),sources:[source],conversations:[{...conversation,snapshotId:'old'}]}),true);
 assert.equal(needsDataResync({...initial(),sources:[],conversations:[conversation]}),true);
 assert.equal(needsDataResync({...initial(),sources:[{...source,status:'registered',conversationCount:0}],conversations:[conversation]}),true);
 assert.equal(needsDataResync({...initial(),sources:[{...source,conversationCount:0}]}),false);
});

test('native dataset descriptors survive delayed publication without requiring conversation records',()=>{
 const descriptor={revision:'captured-native',conversationCount:2000,recordCount:9000,sourceSnapshots:[{sourceId:source.id,snapshotId:source.snapshotId}]};
 let value=mergeAnalyticsUpdate({...initial(),backendAnalysis:true},{__updateRevision:11,sources:[source],job:{running:false,status:'complete'}});
 assert.equal(needsDataResync(value.state),true);
 value=mergeAnalyticsUpdate(value.state,{__updateRevision:10,dataset:descriptor,sources:[{...source,status:'refreshing'}]},value.versions);
 assert.equal(value.dataChanged,true);assert.equal(value.state.sources[0].status,'ready');assert.equal(value.state.dataset.recordCount,9000);assert.deepEqual(value.state.conversations,[]);assert.equal(needsDataResync(value.state),false);
 const unchanged=mergeAnalyticsUpdate(value.state,{__updateRevision:12,dataset:descriptor},value.versions);assert.equal(unchanged.changed,true);assert.equal(unchanged.dataChanged,false);assert.equal(unchanged.versions.data,12);
 assert.equal(needsDataResync({...value.state,sources:[]}),true);assert.equal(needsDataResync({...value.state,dataset:{...descriptor,sourceSnapshots:[{sourceId:source.id,snapshotId:'old'}]}}),true);
});
