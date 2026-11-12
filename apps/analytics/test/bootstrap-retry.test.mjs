import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {mergeAnalyticsUpdate} from '../src/ui/update-order.mjs';

const source=await fs.readFile(new URL('../src/ui/app.js',import.meta.url),'utf8'),start=source.indexOf('async function bootstrap(){'),end=source.indexOf('\nbootstrap();',start);
assert(start>=0&&end>start,'Actual renderer bootstrap function boundaries');
function harness(){
 const payload={__updateRevision:5,backendAnalysis:true,settings:{language:'en',timezone:'local'},dataset:{revision:'same-capture',conversationCount:2,recordCount:4,sourceSnapshots:[]}};
 const context=vm.createContext({worker:{},bridge:{bootstrapSerialized:async()=>JSON.stringify(payload)},state:{settings:{language:'en'},sources:[]},filters:{},report:null,computing:false,bootstrapPending:false,bootstrapReady:false,payloadVersions:{metadata:-1,data:-1},pendingUpdates:[],calculations:0,failures:[],showBootLoading:()=>{},t:key=>key,startWorker:()=>true,finishBoot:()=>{}});
 context.calculate=()=>{context.calculations++;context.computing=true;};context.ingest=value=>{const update=mergeAnalyticsUpdate(context.state,value,context.payloadVersions);context.state=update.state;context.payloadVersions=update.versions;if(update.dataChanged)context.calculate();};context.bootFailure=error=>context.failures.push(error);
 vm.runInContext(source.slice(start,end),context);return context;
}
test('Retry recalculates an already loaded unchanged capture after its initial report failed',async()=>{
 const value=harness();await vm.runInContext('bootstrap()',value);assert.equal(value.calculations,1);assert.equal(value.state.dataset.revision,'same-capture');
 value.computing=false;value.report=null;value.bootstrapReady=false;value.state.analysisError={code:'ERR_SQLITE_ERROR',message:'database or disk is full'};
 await vm.runInContext('bootstrap()',value);assert.equal(value.calculations,2);assert.equal(value.computing,true);assert.equal(value.state.dataset.revision,'same-capture');assert.equal(value.failures.length,0);
});
test('initial bootstrap and queued newer capture start only the required latest calculation',async()=>{
 const value=harness();value.pendingUpdates=[{__updateRevision:6,dataset:{revision:'newer-capture',conversationCount:3,recordCount:6,sourceSnapshots:[]}}];await vm.runInContext('bootstrap()',value);assert.equal(value.calculations,2);assert.equal(value.state.dataset.revision,'newer-capture');assert.equal(value.failures.length,0);
});
