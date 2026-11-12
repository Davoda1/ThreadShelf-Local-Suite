import test from 'node:test';
import assert from 'node:assert/strict';
import transfer from '../src/desktop/serialized-transfer.cjs';

const {createTransferStore,CHUNK_CHARS,MAX_PAYLOAD_CHARS,TRANSFER_MARKER}=transfer;
const errorCode=code=>error=>error.code===code;
const readAll=(store,descriptor)=>Array.from({length:descriptor.count},(_,index)=>store.read({id:descriptor.id,index})).join('');

test('an eight MiB Unicode snapshot crosses bounded chunks without losing content or metadata',()=>{
 const source={conversations:[{id:'synthetic',statistics:'a'.repeat(CHUNK_CHARS-65)+'😀é漢'.repeat(1_900_000)}],__updateRevision:73};
 const serialized=JSON.stringify(source),store=createTransferStore(),descriptor=store.encode(serialized,{revision:73,isData:true});
 assert(serialized.length>=8*1024*1024);
 assert.equal(descriptor.__analyticsTransfer,TRANSFER_MARKER);assert.match(descriptor.id,/^[a-f0-9]{32}$/);assert.equal(descriptor.length,serialized.length);assert.equal(descriptor.revision,73);assert.equal(descriptor.isData,true);assert(descriptor.count>1);assert(Object.isFrozen(descriptor));
 source.conversations[0].statistics='changed after publication';
 const chunks=[];for(let index=0;index<descriptor.count;index++){const chunk=store.read({id:descriptor.id,index});assert(chunk.length>0&&chunk.length<=CHUNK_CHARS);assert(!/[\uD800-\uDBFF]$/.test(chunk));chunks.push(chunk);}
 const restored=chunks.join('');assert.equal(restored,serialized);assert.equal(JSON.parse(restored).__updateRevision,73);
 assert.deepEqual(store.release({id:descriptor.id}),{released:true});assert.deepEqual(store.stats(),{transfers:0,characters:0});
 assert.throws(()=>store.read({id:descriptor.id,index:0}),errorCode('TRANSFER_UNAVAILABLE'));
});

test('small serialized snapshots stay inline and do not reserve transfer memory',()=>{
 const store=createTransferStore();for(const value of ['',JSON.stringify({sources:[],conversations:[]}), 'x'.repeat(CHUNK_CHARS)])assert.equal(store.encode(value),value);
 assert.deepEqual(store.stats(),{transfers:0,characters:0});assert.throws(()=>store.encode({value:true}),TypeError);
});

test('chunk reads reject invalid identities and order without consuming the next valid chunk',()=>{
 const store=createTransferStore({chunkChars:4,maxChars:100}),descriptor=store.encode('0123456789',{revision:9,isData:true});
 for(const value of [null,{}, {id:'../source',index:0},{id:descriptor.id,index:-1},{id:descriptor.id,index:0.5},{id:descriptor.id,index:'0'}])assert.throws(()=>store.read(value),errorCode('TRANSFER_REQUEST_INVALID'));
 assert.throws(()=>store.read({id:'0'.repeat(32),index:0}),errorCode('TRANSFER_UNAVAILABLE'));
 assert.throws(()=>store.read({id:descriptor.id,index:1}),errorCode('TRANSFER_ORDER_INVALID'));
 assert.equal(store.read({id:descriptor.id,index:0}),'0123');assert.throws(()=>store.read({id:descriptor.id,index:0}),errorCode('TRANSFER_ORDER_INVALID'));
 assert.equal(store.read({id:descriptor.id,index:1}),'4567');assert.equal(store.read({id:descriptor.id,index:2}),'89');assert.throws(()=>store.read({id:descriptor.id,index:3}),errorCode('TRANSFER_ORDER_INVALID'));
 assert.throws(()=>store.release({id:'../source'}),errorCode('TRANSFER_REQUEST_INVALID'));assert.deepEqual(store.release({id:descriptor.id}),{released:true});assert.deepEqual(store.release({id:descriptor.id}),{released:false});
});

test('active reads renew the idle deadline and expired or cleared transfers release memory',()=>{
 let clock=0;const store=createTransferStore({chunkChars:4,maxChars:100,ttlMs:10,now:()=>clock}),descriptor=store.encode('0123456789');
 clock=9;assert.equal(store.read({id:descriptor.id,index:0}),'0123');clock=15;assert.equal(store.read({id:descriptor.id,index:1}),'4567');clock=25;
 assert.throws(()=>store.read({id:descriptor.id,index:2}),errorCode('TRANSFER_UNAVAILABLE'));assert.deepEqual(store.stats(),{transfers:0,characters:0});
 const next=store.encode('another snapshot');store.clear();assert.deepEqual(store.stats(),{transfers:0,characters:0});assert.throws(()=>store.read({id:next.id,index:0}),errorCode('TRANSFER_UNAVAILABLE'));
});

test('retained immutable snapshots are bounded by both transfer count and aggregate characters',()=>{
 const countLimited=createTransferStore({chunkChars:4,maxChars:100,maxTransfers:2}),first=countLimited.encode('first snapshot'),second=countLimited.encode('second snapshot'),third=countLimited.encode('third snapshot');
 assert.throws(()=>countLimited.read({id:first.id,index:0}),errorCode('TRANSFER_UNAVAILABLE'));assert.equal(readAll(countLimited,second),'second snapshot');assert.equal(readAll(countLimited,third),'third snapshot');assert.equal(countLimited.stats().transfers,2);
 const sizeLimited=createTransferStore({chunkChars:4,maxChars:24,maxTransfers:5}),a=sizeLimited.encode('a'.repeat(10)),b=sizeLimited.encode('b'.repeat(10)),c=sizeLimited.encode('c'.repeat(10));
 assert.throws(()=>sizeLimited.read({id:a.id,index:0}),errorCode('TRANSFER_UNAVAILABLE'));assert.equal(readAll(sizeLimited,b),'b'.repeat(10));assert.equal(readAll(sizeLimited,c),'c'.repeat(10));assert.deepEqual(sizeLimited.stats(),{transfers:2,characters:20});
 assert.throws(()=>sizeLimited.encode('x'.repeat(25)),errorCode('TRANSFER_TOO_LARGE'));assert.deepEqual(sizeLimited.stats(),{transfers:2,characters:20});
});

test('new metadata replaces older metadata while preserving an in-flight captured dataset',()=>{
 const store=createTransferStore({chunkChars:4,maxChars:32,maxTransfers:2}),data=store.encode('captured data',{revision:10,isData:true}),older=store.encode('metadata B',{revision:11,isData:false}),newer=store.encode('metadata C',{revision:12,isData:false});
 assert.throws(()=>store.read({id:older.id,index:0}),errorCode('TRANSFER_UNAVAILABLE'));assert.equal(readAll(store,data),'captured data');assert.equal(readAll(store,newer),'metadata C');assert.deepEqual(store.stats(),{transfers:2,characters:23});
 const replacement=store.encode('replacement statistics',{revision:13,isData:true});assert.throws(()=>store.read({id:newer.id,index:0}),errorCode('TRANSFER_UNAVAILABLE'));assert(store.stats().characters<=32);assert.equal(readAll(store,replacement),'replacement statistics');
});

test('per-payload limits match preload capacity and reject before evicting in-flight snapshots',()=>{
 assert.equal(MAX_PAYLOAD_CHARS,536870000);
 const store=createTransferStore({chunkChars:4,maxChars:100,maxPayloadChars:12,maxTransfers:2}),a=store.encode('a'.repeat(10),{isData:true}),b=store.encode('b'.repeat(10),{isData:true});
 assert.throws(()=>store.encode('x'.repeat(13)),errorCode('TRANSFER_TOO_LARGE'));assert.deepEqual(store.stats(),{transfers:2,characters:20});assert.equal(readAll(store,a),'a'.repeat(10));assert.equal(readAll(store,b),'b'.repeat(10));
 assert.throws(()=>createTransferStore({maxPayloadChars:MAX_PAYLOAD_CHARS+1}),TypeError);
});
