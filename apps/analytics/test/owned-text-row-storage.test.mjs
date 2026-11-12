import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {randomBytes} from 'node:crypto';
import {OwnedStorage} from '../src/core/owned-storage.mjs';
import {indexedOwnedDescriptor} from '../src/core/owned-index.mjs';
import {normalizeConversations,prepareConversationDocument} from '../src/core/adapters.mjs';
import {encodeRecordPayload,parseRecordPayload} from '../src/core/sqlite-capture.mjs';
import {mixedDocuments,claude} from './fixtures/provider-fixtures.mjs';

const sourceId='d'.repeat(64),source={id:sourceId,kind:'files',paths:['/unavailable/original.json'],snapshotId:'original-snapshot',capturedAt:'2026-01-01T00:00:00Z'};
const metadata={version:2,normalizedSchemaVersion:2,adapterVersion:'2.0.0',contentVersion:'1.0.0',producer:{applicationVersion:'1.4.5',adapterVersion:'2.0.0',contentVersion:'1.0.0'},extensionCapture:{keep:'exact'},source,diagnostics:[]};
const document=text=>({provider:'openai',conversationKey:'kept',title:'Retained public conversation',turns:[{source_message_id:'p',user:text,createdAt:'2026-01-01'},{source_message_id:'a',ai:'Retained response'}]});
const normalized=text=>normalizeConversations(document(text),{sourceId,collectionId:'original-collection'}).conversations;
async function temporary(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-public-rows-')),writers=new Set();let storage;
 const cleanup=async beforeRemove=>{
  for(const writer of writers)await writer.abort();writers.clear();
  await storage?.close();
  await beforeRemove?.();
  await fs.rm(root,{recursive:true,force:true});
 };
 // after hooks run in registration order. Windows requires all SQLite handles
 // to be closed before removal; Linux permits unlinking an open database.
 t.after(()=>cleanup());storage=await new OwnedStorage(root).init({writer:true});
 const beginSnapshot=storage.beginSnapshot.bind(storage);
 storage.beginSnapshot=async(...args)=>{const writer=await beginSnapshot(...args);writers.add(writer);return writer;};
 return{root,storage,cleanup};
}
async function capture(storage,conversations,extra={}){const writer=await storage.beginSnapshot(sourceId);try{for(const c of conversations)await writer.addConversation(c,{reconcile:false});return await writer.publish({...metadata,...extra});}catch(error){await writer.abort();throw error;}}

test('public legacy full-text gzip migrates offline without resetting identities, settings or baseline bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-public-legacy-'));let storage;t.after(async()=>{await storage?.close();await fs.rm(root,{recursive:true,force:true});});
 const text='😀'.repeat(4500)+' original-only-after-excerpt \ud800\n```rust\nfn preserved() {}\n```',conversations=normalized(text),settings={language:'hu',extensionSetting:{keep:17}},state={sources:[source],annotations:{aliases:{[conversations[0].id]:'Alias'},groups:{kept:[conversations[0].id]}},extensionState:{keep:23}};
 const packed=gzipSync(JSON.stringify({...metadata,adapterVersion:'1.0.0',conversations}));await fs.mkdir(path.join(root,'snapshots'));await fs.writeFile(path.join(root,'analytics-owner.json'),JSON.stringify({owner:'threadshelf-local-analytics:1',version:1}));await fs.writeFile(path.join(root,'settings.json'),JSON.stringify(settings));await fs.writeFile(path.join(root,'state.json'),JSON.stringify(state));const filename=path.join(root,'snapshots',sourceId+'.json.gz');await fs.writeFile(filename,packed);
 storage=await new OwnedStorage(root).init({writer:true,recover:true});const previous=await storage.pointer(sourceId),reader=await storage.openSnapshot(sourceId);const c=[...reader.iterateConversations({includeBodies:true})][0];
 assert.equal(c.id,conversations[0].id);assert.equal(c.records[0].id,conversations[0].records[0].id);assert.equal(c.records[0].text,text);assert.equal(reader.bodyText(c.id,c.records[0].id),text);assert.equal(reader.descriptor().textRetained,true);assert.equal(reader.reference.id,previous.active.id);assert.deepEqual(reader.metadata.producer,metadata.producer);assert.deepEqual(reader.metadata.extensionCapture,metadata.extensionCapture);assert.equal([...reader.iterateConversations()][0].records[0].text,undefined);reader.close();
 assert.deepEqual(await storage.readJSON('settings.json'),settings);assert.deepEqual(await storage.readJSON('state.json'),state);assert.deepEqual(await fs.readFile(filename),packed);assert.equal(await fs.stat(path.join(root,'analytics-v2/statistics-storage.json')).then(()=>true,()=>false),false);
});

test('row capture reconciles mixed-provider bodies before projection, including conflict rebases and activity merges',async t=>{
 const{storage}=await temporary(t),docs=mixedDocuments();docs.push(structuredClone(docs[0]));const changed=structuredClone(claude);changed.chat_messages[1].content[2].input.expression='2+2';docs.push(changed);const repeated=structuredClone(docs[8]);repeated.prompt='Later activity';repeated.time='2026-09-25';docs.push(repeated);
 const writer=await storage.beginSnapshot(sourceId);for(let i=0;i<docs.length;i++)for(const c of prepareConversationDocument(docs[i],{sourceId,collectionId:'set',rawPath:`/${i}`}).conversations)await writer.addConversation(c);await writer.publish(metadata);
 const expected=normalizeConversations(docs,{sourceId,collectionId:'set'}).conversations,reader=await storage.openSnapshot(sourceId);t.after(()=>reader.close());const actual=[...reader.iterateConversations({includeBodies:true})];const identities=values=>values.map(c=>({id:c.id,rawHash:c.rawHash,collections:c.collectionIds,records:c.records.map(r=>({id:r.id,objectId:r.objectId,logicalId:r.logicalId,text:r.text,event:r.event}))}));assert.deepEqual(identities(actual),identities(expected));assert.equal(reader.counts.bodies,reader.counts.records);for(const{record}of reader.iterateRecords())assert.equal(record.text,undefined);
});

test('body previews preserve source excerpt flags, exact Unicode strings and independent record lookup',async t=>{
 const{storage}=await temporary(t),conversations=normalized('A😀B\ud800');const r=conversations[0].records[0];r.textExcerpt='original excerpt string';r.textTruncated=true;await capture(storage,conversations);const reader=await storage.openSnapshot(sourceId);t.after(()=>reader.close());assert.equal(reader.bodyText(conversations[0].id,r.id),'A😀B\ud800');assert.equal(reader.bodyText(conversations[0].id,r.id,{limit:2}),'A');const body=reader.bodyRecord(conversations[0].id,r.id,{limit:8});assert.equal(body.textExcerpt,'original');assert.equal(body.textTruncated,true);assert.equal(reader.bodyRecord(conversations[0].id,r.id,{includeText:false}).text,undefined);assert.equal(reader.bodyText(conversations[0].id,'missing'),null);
 assert.equal(parseRecordPayload(encodeRecordPayload({text:'x'.repeat(10000)+'\ud800'})).text,'x'.repeat(10000)+'\ud800');assert.throws(()=>parseRecordPayload(Uint8Array.from([65,78,76,1,0])),{code:'CAPTURE_PAYLOAD_INVALID'});
});

test('public row index rebuild uses retained original bodies offline and preserves capture identity and producer',async t=>{
 const{storage}=await temporary(t),text='z'.repeat(9000)+'\n```rust\nfn after_excerpt() {}\n```';await capture(storage,normalized(text));let reader=await storage.openSnapshot(sourceId);const ref=reader.reference,conversation=[...reader.iterateConversations()][0];reader.close();const result=await indexedOwnedDescriptor(storage,sourceId,{rebuild:true});assert.equal(result.indexRebuilt,true);assert.equal(result.indexManifest.fullOwnedText,true);assert.equal(result.captureRef.id,ref.id);assert.deepEqual(result.producer,metadata.producer);reader=await storage.openSnapshot(sourceId);t.after(()=>reader.close());assert.equal(reader.bodyText(conversation.id,conversation.records[0].id),text);assert(reader.conversation(conversation.id).records[0].explorerAnalysis.blocks.some(b=>b.language==='rust'));
});

test('retained historical bodies remain pinned to their immutable capture after refresh',async t=>{
 const{storage}=await temporary(t),first=await capture(storage,normalized('Original historical wording'));const pinned=await storage.openReference(first.captureRef);await capture(storage,normalized('New current wording'),{source:{...source,snapshotId:'new-snapshot'}});await storage.collectUnreferenced();const c=[...pinned.iterateConversations()][0];assert.equal(pinned.bodyText(c.id,c.records[0].id),'Original historical wording');pinned.close();const current=await storage.openSnapshot(sourceId);t.after(()=>current.close());assert.equal(current.bodyText(c.id,c.records[0].id),'New current wording');
});

test('failed migration publication preserves old full-text gzip and the active pointer',async t=>{
 const{root,storage}=await temporary(t),data={...metadata,conversations:normalized('Keep exact full original')};await storage.saveSnapshot(sourceId,data);const previous=await storage.pointer(sourceId),bytes=await fs.readFile(path.join(root,previous.active.relative)),write=storage.rawWrite.bind(storage);storage.rawWrite=async(relative,value)=>{if(relative===`analytics-v2/captures/${sourceId}.json`)throw Object.assign(new Error('Synthetic disk full'),{code:'ENOSPC'});return write(relative,value);};await assert.rejects(storage.openSnapshot(sourceId),{code:'ENOSPC'});assert.deepEqual(await storage.pointer(sourceId),previous);assert.deepEqual(await fs.readFile(path.join(root,previous.active.relative)),bytes);assert.equal((await storage.loadSnapshot(sourceId)).conversations[0].records[0].text,'Keep exact full original');
});


test('source unit rollback after a real cache spill restores both measurements and original bodies',async t=>{
 const{storage}=await temporary(t),writer=await storage.beginSnapshot(sourceId),first=normalized('Complete prior body')[0];await writer.addConversation(first);const unit=await writer.beginUnit(),other=normalized('Unpublished imported body')[0];other.id+=':unpublished';for(const r of other.records)r.id+=':unpublished';await writer.addConversation(other);writer.addAuxiliary('spill','large',randomBytes(20*1024*1024).toString('base64'));assert((await fs.stat(writer.filename)).size>8*1024*1024);await writer.rollbackUnit(unit);await writer.publish(metadata);const reader=await storage.openSnapshot(sourceId);t.after(()=>reader.close());assert.equal(reader.counts.conversations,1);assert.equal(reader.counts.bodies,first.records.length);assert.equal(reader.bodyText(first.id,first.records[0].id),'Complete prior body');assert.equal(reader.conversation(other.id),null);assert.equal(reader.pageAuxiliary('spill').total,0);
});

test('damaged migrated SQL automatically recovers exact public bodies from the verified gzip fallback',async t=>{
 const{root,storage}=await temporary(t),data={...metadata,conversations:normalized('Original public recovery wording')};await storage.saveSnapshot(sourceId,data);const old=(await storage.pointer(sourceId)).active,gzip=await fs.readFile(path.join(root,old.relative));let reader=await storage.openSnapshot(sourceId);const migrated=reader.reference;reader.close();await fs.writeFile(path.join(root,migrated.relative),'damaged SQL');reader=await storage.openSnapshot(sourceId);t.after(()=>reader.close());const c=[...reader.iterateConversations()][0];assert.equal(reader.reference.id,old.id);assert.equal(reader.bodyText(c.id,c.records[0].id),'Original public recovery wording');assert.equal(reader.metadata.captureRecovery.status,'rebuilt-from-migration-source');assert.deepEqual(await fs.readFile(path.join(root,old.relative)),gzip);
});

test('offline row rebuild repairs stale measurements while redacted records need no body',async t=>{
 const{storage}=await temporary(t),conversations=normalized('Observed original wording'),c=conversations[0],redacted={...c.records[0],id:c.records[0].id+':redacted',category:'redacted',observed:false};delete redacted.text;c.records.push(redacted);const writer=await storage.beginSnapshot(sourceId);await writer.addConversation(c,{reconcile:false});const row=writer.db.prepare('SELECT json FROM records WHERE conversation_id=? AND ordinal=0').get(c.id),damaged=parseRecordPayload(row.json);damaged.explorerAnalysis={...damaged.explorerAnalysis,version:'obsolete-measurement',characters:1};writer.db.prepare('UPDATE records SET json=? WHERE conversation_id=? AND ordinal=0').run(encodeRecordPayload(damaged),c.id);await writer.publish(metadata);const result=await indexedOwnedDescriptor(storage,sourceId,{rebuild:true});assert.equal(result.indexManifest.fullOwnedText,true);const reader=await storage.openSnapshot(sourceId);t.after(()=>reader.close());const restored=reader.conversation(c.id);assert.notEqual(restored.records[0].explorerAnalysis.version,'obsolete-measurement');assert.equal(restored.records[0].explorerAnalysis.characters,'Observed original wording'.length);assert.equal(reader.bodyText(c.id,redacted.id),null);assert.equal(reader.metadata.textRetained,true);assert.equal(reader.counts.missingObservedBodies,0);
});


test('fixture cleanup closes live readers and unpublished writers before removing their files',async t=>{
 const{root,storage,cleanup}=await temporary(t);await capture(storage,normalized('Published body'));const reader=await storage.openSnapshot(sourceId),writer=await storage.beginSnapshot(sourceId);await writer.addConversation(normalized('Unpublished body')[0]);
 await cleanup(()=>{assert.equal(reader.closed,true);assert.equal(writer.closed,true);assert.equal(writer.db,null);assert.equal(storage.captureReaders.size,0);assert.equal(storage.writerLease,null);});
 await assert.rejects(fs.stat(root),{code:'ENOENT'});
});
