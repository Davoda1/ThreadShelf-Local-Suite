import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {captureReader} from '../src/core/reader-capture.mjs';
import {ingestExports} from '../src/core/ingest.mjs';
import {OwnedStorage} from '../src/core/owned-storage.mjs';
import {fixture} from './helpers/reader-fixture.mjs';
const sourceId=createHash('sha256').update('bounded-import-sink-fixture').digest('hex');
const raw=id=>({id,title:id,messages:[{role:'user',content:'one prompt'},{role:'assistant',content:'one answer'}]});

test('Reader sink resets provisional output on retry and retains no transformed archive array',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-reader-sink-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const f=await fixture(root,{profile:'zip6'});let output=[],resets=0;
 const result=await captureReader(f.source,{workspace:path.join(root,'owned-work'),collectConversations:false,onAttempt:()=>{output=[];resets++;},transformConversation:(document,{index})=>{output.push({id:document.id,index});return{mustNotAccumulate:true};},fault:async stage=>{if(stage==='before-validate'&&resets===1)await f.republishGeneration();}});
 assert.equal(result.attempts,2);assert.equal(resets,2);assert.deepEqual(result.conversations,[]);assert.equal(output.length,1);assert.equal(output[0].index,0);
});

test('direct export consumer streams normalized documents into transaction-scoped row storage',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-direct-sink-'));let storage,writer;t.after(async()=>{await writer?.abort();await storage?.close();await fs.rm(root,{recursive:true,force:true});});const filename=path.join(root,'source.json');await fs.writeFile(filename,JSON.stringify(Array.from({length:24},(_,i)=>raw('conversation-'+i))));
 storage=await new OwnedStorage(path.join(root,'owned')).init({recover:true,writer:true});writer=await storage.beginSnapshot(sourceId);const workspace=(await storage.newWork()).path;
 const result=await ingestExports([filename],{sourceId,workspace,limits:{streamingThreshold:1},consumer:{onConversation:c=>writer.addConversation(c),onDiagnostics:values=>writer.addDiagnostics(values),beginUnit:()=>writer.beginUnit(),commitUnit:unit=>writer.commitUnit(unit),rollbackUnit:unit=>writer.rollbackUnit(unit)}});
 assert.deepEqual(result.conversations,[]);assert.equal(result.conversationCount,24);assert.equal(writer.conversationCount,24);assert.equal(writer.recordCount,48);assert.equal(result.files[0].status,'imported');
 assert(![...writer.db.prepare('SELECT json FROM records').iterate()].some(row=>JSON.stringify(row).includes('one prompt')));
});

test('a direct source mutation rolls back its streamed records before publication',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-direct-rollback-'));let storage,writer;t.after(async()=>{await writer?.abort();await storage?.close();await fs.rm(root,{recursive:true,force:true});});const filename=path.join(root,'source.json');await fs.writeFile(filename,JSON.stringify([raw('one'),raw('two')]));
 storage=await new OwnedStorage(path.join(root,'owned')).init({recover:true,writer:true});writer=await storage.beginSnapshot(sourceId);const workspace=(await storage.newWork()).path;let changed=false;
 const result=await ingestExports([filename],{sourceId,workspace,limits:{streamingThreshold:1},consumer:{onConversation:async c=>{await writer.addConversation(c);if(!changed){changed=true;await fs.appendFile(filename,'\n');}},onDiagnostics:values=>writer.addDiagnostics(values),beginUnit:()=>writer.beginUnit(),commitUnit:unit=>writer.commitUnit(unit),rollbackUnit:unit=>writer.rollbackUnit(unit)}});
 assert.equal(result.files[0].status,'error');assert.equal(writer.conversationCount,0);assert.equal(writer.recordCount,0);assert.equal(await storage.pointer(sourceId),null);
});

test('single-pass array consumer rolls back a late malformed JSON tail',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-array-tail-'));let storage,writer;t.after(async()=>{await writer?.abort();await storage?.close();await fs.rm(root,{recursive:true,force:true});});
 const filename=path.join(root,'source.json');await fs.writeFile(filename,'['+JSON.stringify(raw('valid-one'))+','+JSON.stringify(raw('valid-two'))+',BROKEN]');storage=await new OwnedStorage(path.join(root,'owned')).init({recover:true,writer:true});writer=await storage.beginSnapshot(sourceId);const workspace=(await storage.newWork()).path;
 const result=await ingestExports([filename],{sourceId,workspace,limits:{streamingThreshold:1},consumer:{onConversation:c=>writer.addConversation(c),onDiagnostics:d=>writer.addDiagnostics(d),beginUnit:()=>writer.beginUnit(),commitUnit:u=>writer.commitUnit(u),rollbackUnit:u=>writer.rollbackUnit(u)}});
 assert.equal(result.files[0].status,'error');assert.equal(writer.conversationCount,0);assert.equal(writer.recordCount,0);
});

test('single-pass array fallback preserves normalized-turn conversation semantics',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-array-turns-'));let storage,writer;t.after(async()=>{await writer?.abort();await storage?.close();await fs.rm(root,{recursive:true,force:true});});const filename=path.join(root,'source.json');await fs.writeFile(filename,JSON.stringify([{user:'first question',ai:'first answer'},{user:'second question',ai:'second answer'}]));
 const expected=await ingestExports([filename],{sourceId,limits:{streamingThreshold:1}});storage=await new OwnedStorage(path.join(root,'owned')).init({recover:true,writer:true});writer=await storage.beginSnapshot(sourceId);const workspace=(await storage.newWork()).path;
 const actual=await ingestExports([filename],{sourceId,workspace,limits:{streamingThreshold:1},consumer:{onConversation:c=>writer.addConversation(c),onDiagnostics:d=>writer.addDiagnostics(d),beginUnit:()=>writer.beginUnit(),commitUnit:u=>writer.commitUnit(u),rollbackUnit:u=>writer.rollbackUnit(u)}});
 assert.equal(actual.conversationCount,expected.conversations.length);assert.equal(writer.conversationCount,1);assert.equal(writer.recordCount,4);assert.deepEqual([...writer.db.prepare('SELECT id FROM records ORDER BY ordinal').iterate()].map(r=>r.id),expected.conversations[0].records.map(r=>r.id));
});

test('multipart Venice consumer joins exact records and retains each physical media inventory row on disk',async t=>{
 const {ZipWriter,Uint8ArrayWriter,Uint8ArrayReader}=await import('@zip.js/zip.js');const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-venice-sink-'));let storage,writer;t.after(async()=>{await writer?.abort();await storage?.close();await fs.rm(root,{recursive:true,force:true});});
 const zip=async(filename,members)=>{const archive=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});for(const[name,value]of members)await archive.add(name,new Uint8ArrayReader(Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value))),{useWebWorkers:false});await fs.writeFile(filename,await archive.close());};
 const manifest={backupVersion:4,encrypted:false,chunkCount:2,databaseVersion:3,ownerId:'synthetic-account'},chunk=(tableName,rows)=>({formatName:'dexie',formatVersion:1,data:{databaseVersion:3,data:[{tableName,inbound:true,rows}]}}),a=path.join(root,'a.zip'),b=path.join(root,'b.zip');
 await zip(a,[['manifest.json',manifest],['db/chunk-0.json',chunk('conversations',[{id:'venice-one',title:'Venice one',ownerId:'synthetic-account'}])],['media/shared.png',Buffer.from('one')]]);await zip(b,[['db/chunk-1.json',chunk('messages',[{id:'message-one',conversationId:'venice-one',role:'user',content:'PRIVATE_VENICE_BODY',createdAtUnixTimestamp:1767225600}])],['media/shared.png',Buffer.from('two')]]);
 const expected=await ingestExports([a,b],{sourceId});storage=await new OwnedStorage(path.join(root,'owned')).init({recover:true,writer:true});writer=await storage.beginSnapshot(sourceId);const workspace=(await storage.newWork()).path,media=[];
 const actual=await ingestExports([a,b],{sourceId,workspace,consumer:{onConversation:c=>writer.addConversation(c),onDiagnostics:d=>writer.addDiagnostics(d),onAuxiliary:(namespace,key,value)=>{if(namespace==='venice-media')media.push({key,value});writer.addAuxiliary(namespace,key,value);},beginUnit:()=>writer.beginUnit(),commitUnit:u=>writer.commitUnit(u),rollbackUnit:u=>writer.rollbackUnit(u)}});
 assert.equal(actual.conversationCount,1);assert.equal(writer.recordCount,1);assert.equal(actual.files.filter(file=>file.status==='imported').length,2);assert.equal(media.length,2);assert.equal(new Set(media.map(row=>row.key)).size,2);assert.deepEqual(new Set(media.map(row=>row.value.sourcePart)),new Set([a,b]));assert.deepEqual([...writer.db.prepare('SELECT id FROM records ORDER BY ordinal').iterate()].map(row=>row.id),expected.conversations[0].records.map(row=>row.id));const conversation=JSON.parse(writer.db.prepare('SELECT json FROM conversations').get().json);assert.equal(conversation.containerMetadata.mediaMemberCount,1);assert.equal(conversation.containerMetadata.physicalMediaMemberCount,2);assert(!JSON.stringify(conversation).includes('PRIVATE_VENICE_BODY'));
});

test('streamed consumer detects same-size source edits even when handle and path timestamps stay unchanged',async t=>{
 const {writeFileSync}=await import('node:fs');const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-consumer-content-guard-'));let storage,writer;const filename=path.join(root,'source.json'),original=JSON.stringify([raw('source-one')]),changed=original.replace('one prompt','new prompt');assert.equal(changed.length,original.length);await fs.writeFile(filename,original);storage=await new OwnedStorage(path.join(root,'owned')).init({recover:true,writer:true});writer=await storage.beginSnapshot(sourceId);const workspace=(await storage.newWork()).path,stat=await fs.lstat(filename),open=fs.open,lstat=fs.lstat;let mutated=false;
 fs.lstat=async(file,...args)=>path.resolve(String(file))===filename?stat:lstat(file,...args);fs.open=async(...args)=>{const handle=await open(...args);if(path.basename(String(args[0]))!==path.basename(filename))return handle;return new Proxy(handle,{get(target,key){if(key==='stat')return async()=>stat;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});};
 try{const result=await ingestExports([filename],{sourceId,workspace,limits:{streamingThreshold:1},consumer:{onConversation:async c=>{await writer.addConversation(c);if(!mutated){mutated=true;writeFileSync(filename,changed);}},onDiagnostics:d=>writer.addDiagnostics(d),beginUnit:()=>writer.beginUnit(),commitUnit:u=>writer.commitUnit(u),rollbackUnit:u=>writer.rollbackUnit(u)}});assert(mutated);assert.equal(result.files[0].status,'error');assert.match(result.files[0].error,/changed/);assert.equal(writer.conversationCount,0);assert.equal(writer.recordCount,0);assert.equal(writer.db.prepare('SELECT COUNT(*) n FROM record_bodies').get().n,0);}finally{fs.open=open;fs.lstat=lstat;await writer?.abort();await storage?.close();await fs.rm(root,{recursive:true,force:true});}
});
