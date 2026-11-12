import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {AnalyticsService} from '../src/core/application-service.mjs';
import {OwnedStorage} from '../src/core/owned-storage.mjs';
import {normalizeConversations} from '../src/core/adapters.mjs';

const sourceId='e'.repeat(64),history={enabled:true,maxCaptures:3,maxBytes:128*1024**2};
const source={id:sourceId,kind:'files',paths:['/unavailable/original.json'],snapshotId:'original',capturedAt:'2026-01-01T00:00:00Z'};
const conversations=body=>normalizeConversations({provider:'openai',conversationKey:'public-storage-contract',turns:[{source_message_id:'prompt',user:body,createdAt:'2026-01-01'}]},{sourceId,collectionId:'kept'}).conversations;
const capture=(body,snapshotId='original')=>({version:2,normalizedSchemaVersion:2,adapterVersion:'2.0.0',contentVersion:'1.0.0',source:{...source,snapshotId},conversations:conversations(body),diagnostics:[]});
async function fixture(t){const value={root:await fs.mkdtemp(path.join(os.tmpdir(),'analytics-public-contract-')),app:null,storage:null};t.after(async()=>{await value.app?.close();await value.storage?.close();await fs.rm(value.root,{recursive:true,force:true});});return value;}
function publicResponse(value){assert.equal(value.rollbackBaselinePreserved,true);assert.equal(Object.hasOwn(value,'statisticsOnly'),false);assert.equal(Object.hasOwn(value,'textRetained'),false);}

test('fresh public native service storage usage preserves the established rollback gate without claiming text',async t=>{
 const f=await fixture(t);f.app=await new AnalyticsService(f.root,{backendAnalysis:true}).init();const usage=await f.app.storageUsage();
 assert.equal(usage.rollbackBaselinePreserved,true);publicResponse(usage);assert.equal(usage.legacyBytes>0,true);assert.equal(usage.captureBytes,0);assert.equal(f.app.payload().dataset.recordCount,0);publicResponse(f.app.payload().storageUsage);
});

test('public storage metadata matches preserved legacy bytes and complete bodies through migration, history cleanup and collection',async t=>{
 const f=await fixture(t),originalBody='Original body '.repeat(800)+' ORIGINAL_BODY_TAIL',currentBody='Current body '.repeat(800)+' CURRENT_BODY_TAIL',original=capture(originalBody),baseline={
  'analytics-owner.json':Buffer.from(JSON.stringify({owner:'threadshelf-local-analytics:1',version:1})),
  'settings.json':Buffer.from(JSON.stringify({language:'hu',history})),
  'state.json':Buffer.from(JSON.stringify({sources:[source],annotations:{aliases:{[original.conversations[0].id]:'Preserved alias'}}})),
  [`snapshots/${sourceId}.json.gz`]:gzipSync(JSON.stringify(original))
 };
 await fs.mkdir(path.join(f.root,'snapshots'));for(const[file,bytes]of Object.entries(baseline))await fs.writeFile(path.join(f.root,file),bytes);
 const storage=f.storage=await new OwnedStorage(f.root).init({writer:true,recover:true});let reader=await storage.openSnapshot(sourceId);const originalId=reader.reference.id,cid=original.conversations[0].id,rid=original.conversations[0].records[0].id;assert.equal(reader.bodyText(cid,rid),originalBody);assert.equal(reader.descriptor().textRetained,true);reader.close();
 await storage.saveSnapshot(sourceId,capture(currentBody,'current'),{history});reader=await storage.openSnapshot(sourceId);assert.equal(reader.bodyText(cid,rid),currentBody);reader.close();const listed=await storage.listHistory(sourceId);assert(listed.history.some(ref=>ref.id===originalId));
 reader=await storage.openHistorical(sourceId,originalId);assert.equal(reader.bodyText(cid,rid),originalBody);reader.close();const removed=await storage.removeHistory(sourceId),collected=await storage.collectUnreferenced({mutable:true}),usage=await storage.usage();
 assert.equal(removed.removed,true);assert.equal((await storage.listHistory(sourceId)).history.length,0);assert.equal(usage.legacyBytes>0,true);assert.equal(usage.captureBytes>0,true);assert.equal(Number.isSafeInteger(collected.removedBytes),true);
 reader=await storage.openSnapshot(sourceId);assert.equal(reader.bodyText(cid,rid),currentBody);assert.equal(reader.descriptor().textRetained,true);reader.close();for(const[file,bytes]of Object.entries(baseline))assert.deepEqual(await fs.readFile(path.join(f.root,file)),bytes,file+' baseline changed');
 for(const[name,value]of Object.entries({listHistory:listed,removeHistory:removed,usage,collectUnreferenced:collected}))await t.test(name,()=>publicResponse(value));
});
