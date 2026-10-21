import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ZipWriter,Uint8ArrayReader,Uint8ArrayWriter} from '@zip.js/zip.js';
import {normalizeConversations,ADAPTER_VERSION,SUPPORTED_ADAPTER_VERSIONS} from '../src/core/adapters.mjs';
import {ingestExports} from '../src/core/ingest.mjs';
import {chatgpt} from './fixtures/provider-fixtures.mjs';
const one=value=>normalizeConversations(value,{sourceId:'regression'}).conversations[0];
const conversation=(id)=>({id,messages:[{id:id+'u',role:'user',content:'Question'},{id:id+'a',role:'assistant',content:'Answer'}]});
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-adapter-v2-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function zip(filename,members){const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,zip64:true});for(const [name,value]of members)await writer.add(name,new Uint8ArrayReader(Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value))),{useWebWorkers:false});await fs.writeFile(filename,await writer.close());}

test('new producer version explicitly supports old snapshot readers; established IDs do not change',()=>{
  assert.equal(ADAPTER_VERSION,'2.0.0');assert.deepEqual(SUPPORTED_ADAPTER_VERSIONS,['1.0.0','2.0.0']);
  // Captured from the exact revision 3 adapter on this public synthetic fixture.
  const current=one(chatgpt);assert.equal(current.id,'openai:dce321825af59386f2ca5bfe1e447b5f');
  assert.deepEqual(current.records.map(r=>r.id.split(':segment:')[1]),['3d78af555ac24013ab4ffcd6','76d35470c52428b639f757d1','9a9ba0d7dc747ca022ba3ed2','681da1990bbf04c74db96b92','80c7a0c95df5ef9817c84ad5']);
  assert.deepEqual(current.records.map(r=>r.objectId.split(':object:')[1]),['f64551fcd6f07823cb87971c','628b49d96dcde97a430dd4f5','82f3e9c695dc6b8d1b11818d','f55ff16f66f43360266b95db','1c8a07b6f2cbbde6fd7ffeba']);assert.ok(current.records.every(r=>r.objectId===r.logicalId));
});

test('JSON-LD WebPage cannot hide a valid static conversation',async t=>{
  const dir=await temp(t),filename=path.join(dir,'static.html');
  await fs.writeFile(filename,'<script type="application/ld+json">{"@type":"WebPage","name":"unrelated"}</script><section class="conversation" data-conversation-id="static"><h2>Title</h2><div class="message user" data-message-id="u">Question</div><div class="message assistant" data-message-id="a" data-parent-message-id="u"><img alt="diagram" width="16" height="8" data-size-bytes="0">Answer</div></section>');
  const result=await ingestExports([filename]);assert.equal(result.conversations.length,1);const c=result.conversations[0];assert.equal(c.format,'static-html');assert.deepEqual(c.records.map(r=>r.category),['user','response']);assert.equal(c.records[1].attachments[0].sizeBytes,0);assert.equal(c.records[1].attachments[0].width,16);assert.equal(c.records[1].relationship.parentObjectId,c.records[0].objectId);assert.ok(result.diagnostics.some(d=>d.code==='html-unrelated-json'));
});

test('unrelated backupVersion and similarly named chunk preserve ordinary ZIP conversations',async t=>{
  const dir=await temp(t),filename=path.join(dir,'ordinary.zip');
  await zip(filename,[['manifest.json',{backupVersion:4,kind:'unrelated application'}],['db/chunk-0.json',conversation('chunk-conversation')],['conversation.json',conversation('regular-conversation')]]);
  const result=await ingestExports([filename]);assert.equal(result.files[0].status,'imported');assert.deepEqual(new Set(result.conversations.map(c=>c.originalId)),new Set(['chunk-conversation','regular-conversation']));assert.ok(result.conversations.every(c=>c.provider!=='venice'));
});

test('named OpenRouter turns retain the platform and recorded turn association',()=>{
  const c=one({provider:'openrouter',conversations:[{id:'router',platform:'openrouter',turns:[{id:'turn-one',user:'Question',thinking:'Summary',ai:'Answer',model:'vendor/model'}]}]});
  assert.equal(c.provider,'openrouter');assert.equal(c.format,'openrouter-turns');assert.deepEqual(c.records.map(r=>r.category),['user','thinking','response']);assert.equal(c.records[0].turnId,c.records[2].turnId);assert.equal(c.records[2].relationship.kind,'recorded-named-turn');assert.notEqual(c.records[0].logicalId,c.records[2].logicalId);
  const audit=c.identityAudit.find(a=>a.kind==='preserved-legacy-container-anchor');assert.equal(audit.segmentId,c.records[2].id);assert.equal(c.records[2].logicalId,c.records[2].objectId);assert.equal(audit.priorSourcePath,'/turns/0/content');assert.equal(c.records[1].logicalId,c.records[2].logicalId);
  assert.equal(c.records[2].id.split(':segment:')[1],'847c056abbd5452e2f351a5c');assert.equal(c.records[1].id.split(':segment:')[1],'b6f66faa417e5948d4113218');
});

test('LM Studio outer dates inherit only when version date is absent',()=>{
  const c=one({id:'lm',createdAt:100,messages:[{createdAt:0,currentlySelected:0,versions:[{role:'user',content:'Question'}]},{createdAt:100,currentlySelected:0,versions:[{role:'assistant',createdAt:200,content:'Answer'}]},{currentlySelected:0,versions:[{role:'assistant',content:'Undated'}]}]});
  assert.equal(c.records[0].timestamp,0);assert.equal(c.records[0].timeProvenance,'/messages/0/createdAt');assert.equal(c.records[1].timestamp,200);assert.equal(c.records[2].timestamp,null);
});

test('explicit Meta envelope provenance survives Claude-compatible shape',()=>{
  const c=one({_meta_ai_archive:{format:'meta-ai-to-threadshelf'},conversations:[{uuid:'meta',chat_messages:[{uuid:'u',sender:'human',text:'Question'},{uuid:'a',sender:'assistant',text:'Answer',model:'Meta AI'}]}]});
  assert.equal(c.provider,'meta');assert.equal(c.records[1].model,'unknown');assert.equal(c.format,'meta-converted-transcript');
  assert.equal(c.id,'anthropic:72ae5d4403f901d55baed5258c7470aa');assert.deepEqual(c.records.map(r=>r.id.split(':segment:')[1]),['bf1f4cefff1387f2e58fb7b4','884d83edcf1670b1f16f0369']);
});

test('OpenRouter envelope formerly normalized named fields preserve their existing nullable IDs',()=>{
  const c=one({provider:'openrouter',conversations:[{id:'router',turns:[{id:'turn-one',user:'Question',ai:'Answer'}]}]});
  assert.deepEqual(c.records.map(r=>r.id.split(':segment:')[1]),['d46e96b20672844a907bb931','cefe17fb6b782b0d08765b3f']);assert.ok(c.records.every(r=>r.logicalId===null));assert.ok(c.records.every(r=>r.relationship.kind==='recorded-named-turn'));
});

test('streamed root/wrapper indexes and nested source locations equal whole-document parsing',async t=>{
  const dir=await temp(t);
  for(const [name,data]of [['root',[conversation('a'),{unknown:true},conversation('b')]],['wrapper',{conversations:[conversation('a'),{unknown:true},conversation('b')]}]]){
    const filename=path.join(dir,name+'.json');await fs.writeFile(filename,JSON.stringify(data));
    const whole=await ingestExports([filename],{sourceId:'same',limits:{streamingThreshold:100000}}),stream=await ingestExports([filename],{sourceId:'same',limits:{streamingThreshold:1}});
    assert.deepEqual(stream.conversations.map(c=>[c.id,c.rawPath,c.records.map(r=>r.sourceLocation)]),whole.conversations.map(c=>[c.id,c.rawPath,c.records.map(r=>r.sourceLocation)]));
    assert.equal(stream.conversations[1].rawPath,name==='wrapper'?'/conversations/2':'/2');
  }
});

test('complete topology retains non-message roots, source-selected leaf and aliases',()=>{
  const c=one(chatgpt);assert.equal(c.topology.nodes.length,6);assert.equal(c.topology.nodes.find(n=>n.id==='root').messageObjectId,null);assert.equal(c.topology.sourceSelectedLeaf,'answer');assert.equal(c.topology.complete,true);assert.equal(c.records.find(r=>r.nodeId==='thought').relationship.parentOriginalId,'p1');
});

test('generic verified token flag cannot establish audited token semantics',()=>{
  const r=one({provider:'openrouter',turns:[{id:'a',role:'assistant',content:'Answer',usage:{verified:true,prompt_tokens:0,completion_tokens:3}}]}).records[0];
  assert.equal(r.usage.inputTokens,0);assert.equal(r.usage.verified,false);assert.equal(r.usage.scopeVerified,false);assert.ok(r.usage.fields.every(f=>f.verified===false));
});

test('direct importer instrumented access performs no write attempts and refuses hard-link aliases',async t=>{
  const dir=await temp(t),filename=path.join(dir,'source.json');await fs.writeFile(filename,JSON.stringify(conversation('safe')));await fs.chmod(filename,0o444);
  const calls=[],originalOpen=fs.open,mutations=['writeFile','appendFile','rename','rm','unlink','mkdir','chmod','chown','truncate','link','symlink'],saved=Object.fromEntries(mutations.map(key=>[key,fs[key]]));
  fs.open=async function(file,flags,...args){calls.push({kind:'open',flags});const h=await originalOpen.call(this,file,flags,...args);for(const method of ['write','writeFile','truncate','chmod','chown']){const original=h[method];h[method]=function(...args){calls.push({kind:method});return original.apply(this,args);};}return h;};
  for(const key of mutations)fs[key]=function(...args){calls.push({kind:key});return saved[key].apply(this,args);};
  try{const result=await ingestExports([filename]);assert.equal(result.conversations.length,1);}finally{fs.open=originalOpen;Object.assign(fs,saved);}
  assert.ok(calls.some(c=>c.kind==='open'));assert.ok(calls.every(c=>c.kind==='open'&&typeof c.flags==='number'&&(c.flags&(constants.O_WRONLY|constants.O_RDWR|constants.O_APPEND|constants.O_CREAT|constants.O_TRUNC))===0));
  await fs.link(filename,path.join(dir,'alias.json'));const refused=await ingestExports([filename]);assert.equal(refused.conversations.length,0);assert.match(refused.files[0].error,/Hard-linked/);
});

test('ZIP symlink mode is refused even for parseable conversation bytes',async t=>{
  const dir=await temp(t),filename=path.join(dir,'symlink.zip'),writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});
  await writer.add('conversation.json',new Uint8ArrayReader(Buffer.from(JSON.stringify(conversation('unsafe')))),{useWebWorkers:false,unixMode:0o120777});await fs.writeFile(filename,await writer.close());
  const result=await ingestExports([filename]);assert.equal(result.conversations.length,0);assert.equal(result.files[0].status,'error');assert.match(result.files[0].error,/Symbolic-link ZIP/);
});

test('Gemini retains prompt-only feedback Canvas and unknown cards without invented replies or dates',async t=>{
  const dir=await temp(t),filename=path.join(dir,'gemini.html'),card=(text,meta='')=>'<div class="outer-cell"><div class="header-cell">Gemini</div><div class="content-cell">'+text+'</div>'+meta+'</div>';
  await fs.writeFile(filename,'<html>'+card('Submitted prompt: Only a prompt<br>2026-01-01T12:00:00Z')+card('Gave feedback: Thumbs up<br>2026-01-02T12:00:00Z')+card('Created Gemini Canvas: A canvas<br>2026-01-03T12:00:00Z')+card('Unrecognized activity<br>yesterday')+'</html>');
  const result=await ingestExports([filename]);assert.equal(result.conversations.length,4);const records=result.conversations.flatMap(c=>c.records);assert.equal(records.filter(r=>r.category==='user').length,1);assert.equal(records.filter(r=>r.category==='response').length,0);assert.deepEqual(new Set(records.map(r=>r.activityMetadata.kind)),new Set(['prompt-only','feedback','canvas','unknown']));assert.equal(records.find(r=>r.activityMetadata.kind==='unknown').timestamp,null);assert.ok(records.every(r=>r.logicalId===null&&r.activityMetadata.conversationAssociation==='unavailable'));
});

test('co-located Venice profile fields are discarded and media inventory never embeds bytes',async t=>{
  const dir=await temp(t),filename=path.join(dir,'backup.zip'),secret='SYNTHETIC-EXCLUDED-PROFILE-SENTINEL';
  const manifest={backupVersion:4,encrypted:false,chunkCount:1,databaseVersion:3,ownerId:'synthetic',createdAt:'2026-01-01T00:00:00Z',bookmarks:secret,settings:{language:secret}};
  const chunk={formatName:'dexie',formatVersion:1,data:{databaseVersion:3,data:[{tableName:'conversations',inbound:true,rows:[{id:'backup',ownerId:'synthetic'}]},{tableName:'messages',inbound:true,rows:[{id:'u',conversationId:'backup',role:'user',content:'Question'}]},{tableName:'preferences',inbound:true,rows:[{id:'setting',value:secret}]},{tableName:'bookmarks',inbound:true,rows:[{id:'bookmark',value:secret}]}]}};
  await zip(filename,[['manifest.json',manifest],['db/chunk-0.json',chunk],['media/diagram.png',Buffer.from([0xff,0,0x13,0x37])],['settings.json',{secret}],['account.json',{secret}]]);
  const result=await ingestExports([filename]);assert.equal(result.conversations.length,1);assert.equal(result.conversations[0].records.length,1);assert.ok(!JSON.stringify(result).includes(secret));const container=result.conversations[0].containerMetadata;assert.equal(container.mediaMembers.length,1);assert.equal(container.mediaMembers[0].name,'media/diagram.png');assert.equal(container.mediaMembers[0].sizeBytes,4);assert.equal(container.mediaMembers[0].bytesOpened,false);assert.equal(container.mediaBytesEmbedded,false);assert.ok(!('ownerId'in container.manifest));assert.ok(!('bookmarks'in container.manifest));
});

test('direct JSON backup metadata also discards arbitrary manifest and descriptor fields',()=>{
  const secret='SYNTHETIC-EXCLUDED-JSON-SENTINEL';
  const c=one({format:'venice-chat-history',formatVersion:1,owners:[{ownerId:'synthetic',conversations:[{id:'v',messages:[{id:'m',role:'user',content:'Question'}]}]}],veniceBackup:{manifest:{backupVersion:4,encrypted:false,bookmarks:secret,credentials:{secret}},mediaMembers:[{name:'media/file.png',sizeBytes:0,settings:secret},{name:'cookies.json',sizeBytes:1}]}});
  assert.ok(!JSON.stringify(c).includes(secret));assert.equal(c.containerMetadata.mediaMembers.length,1);assert.equal(c.containerMetadata.mediaMembers[0].sizeBytes,0);
});

test('unknown source structures cannot mirror arbitrary profile metadata as analytical text',()=>{
  const secret='SYNTHETIC-EXCLUDED-UNKNOWN-SENTINEL';
  const c=one({id:'unknown-safe',mapping:{n:{parent:null,message:{id:'m',author:{role:'assistant'},content:{content_type:'unknown-widget',settings:{value:secret},bookmarks:[secret]}}}}});
  assert.equal(c.records[0].observed,false);assert.equal(c.records[0].text,'');assert.ok(!JSON.stringify(c).includes(secret));assert.equal(c.records[0].unsupportedStructure,true);
});

test('Gemini JSON feedback keeps source semantics without a manufactured conversation association',()=>{
  const c=one({header:'Gemini',title:'Gave feedback: Source label',time:'2026-01-01',feedback:0});
  assert.equal(c.records[0].activityMetadata.kind,'feedback');assert.equal(c.records[0].activityMetadata.feedback.value,0);assert.equal(c.records[0].activityMetadata.conversationAssociation,'unavailable');assert.equal(c.records[0].datePrecision,'day');assert.equal(c.records[0].logicalId,null);
});
