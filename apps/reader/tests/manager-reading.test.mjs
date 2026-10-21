import test from 'node:test';
import assert from 'node:assert/strict';
import {localReadingKey,reconcileLocalReading,replaceLocalReading,localReadingOnly} from '../src/core/manager-reading.mjs';

const row=(id,collection='Renamed')=>({id,collection,sourceFile:'original.json',conversationKey:'source-'+id,title:'Conversation '+id});
const oldKey=id=>JSON.stringify({mode:'local',serverUrl:'',id,collection:'Old',sourceFile:'original.json',conversationKey:'source-'+id});
const serverKey=JSON.stringify({mode:'server',serverUrl:'http://127.0.0.1:3000/',id:'same',collection:'Old',sourceFile:'original.json',conversationKey:'same'});
const anchor=(id,updatedAt=10,turnIndex=7)=>({turnIndex,role:'assistant',offset:.23,updatedAt,title:'Old title',ref:{mode:'local',id,collection:'Old'}});
function reading(){return {positions:{[oldKey('a')]:anchor('a'),[serverKey]:{turnIndex:91,role:'user',offset:.41,updatedAt:99,ref:{mode:'server',serverUrl:'http://127.0.0.1:3000/',id:'same'}}},bookmarks:[{key:oldKey('a'),...anchor('a')},{key:serverKey,turnIndex:91,role:'user',updatedAt:99}],recent:[{key:serverKey,turnIndex:91,role:'user',updatedAt:99},{key:oldKey('a'),...anchor('a')}],customMarker:'preserved'};}
function serverPart(v){return {position:v.positions[serverKey],bookmarks:v.bookmarks.filter(x=>x.key===serverKey),recent:v.recent.filter(x=>x.key===serverKey)};}

test('migrating and renaming Local reading keys keeps sparse anchors and Server entries exact',()=>{
 const before=reading(),original=structuredClone(before),result=reconcileLocalReading(before,{},id=>row(id));
 assert.deepEqual(before,original,'reconciliation must not mutate its input');
 assert.equal(result.positions[oldKey('a')],undefined);
 assert.equal(result.positions[localReadingKey('a')].turnIndex,7);
 assert.equal(result.positions[localReadingKey('a')].offset,.23);
 assert.equal(result.positions[localReadingKey('a')].ref.collection,'Renamed');
 assert.equal(result.bookmarks[0].ref.id,'a');
 assert.deepEqual(serverPart(result),serverPart(before));
 assert.deepEqual(reconcileLocalReading(result,{},id=>row(id)),result,'migration is idempotent');
});

test('coalescing duplicates keeps latest position, unions message bookmarks, and remaps recent identities once',()=>{
 const value=reading(),key=oldKey('b');value.positions[key]=anchor('b',50,13);
 value.bookmarks.push({key,...anchor('b',50,7)},{key,...anchor('b',50,13)});value.recent.push({key,...anchor('b',50,13)});
 const merged=reconcileLocalReading(value,{removedIds:['b'],remap:{b:'a'}},id=>row(id));
 assert.equal(merged.positions[localReadingKey('a')].turnIndex,13);
 assert.equal(merged.positions[localReadingKey('a')].ref.id,'a');
 assert.equal(merged.bookmarks.filter(x=>x.key===localReadingKey('a')).length,2);
 assert.equal(merged.bookmarks.find(x=>x.key===localReadingKey('a')&&x.turnIndex===7).updatedAt,50);
 assert.equal(merged.recent.filter(x=>x.key===localReadingKey('a')).length,1);
 assert.deepEqual(serverPart(merged),serverPart(value));
});

test('copy bookmarks is opt-in; deleting and clearing Local data remove only intended reading references',()=>{
 const value=reading(),lookup=id=>row(id);
 const ordinaryCopy=reconcileLocalReading(value,{copies:{a:['b','c']}},lookup);
 assert.equal(ordinaryCopy.bookmarks.some(x=>x.key===localReadingKey('b')),false);
 const copy=reconcileLocalReading(value,{copies:{a:['b','c']},copyBookmarks:true},lookup);
 for(const id of ['b','c']){assert.equal(copy.bookmarks.find(x=>x.key===localReadingKey(id)).ref.id,id);assert.equal(copy.positions[localReadingKey(id)],undefined);}
 const removed=reconcileLocalReading(copy,{removedIds:['b']},lookup);
 assert.equal(removed.bookmarks.some(x=>x.key===localReadingKey('b')),false);
 assert.equal(removed.bookmarks.some(x=>x.key===localReadingKey('c')),true);
 const cleared=reconcileLocalReading(removed,{clearLocal:true},lookup);
 assert.deepEqual(serverPart(cleared),serverPart(value));assert.deepEqual(Object.keys(cleared.positions),[serverKey]);assert.equal(cleared.bookmarks.length,1);assert.equal(cleared.recent.length,1);
});

test('Local backup extraction and restore cannot import or replace another Server namespace',()=>{
 const current=reading(),backup=reading();backup.positions[oldKey('a')].turnIndex=42;
 backup.positions[serverKey].turnIndex=999;
 const exported=localReadingOnly(backup);assert.equal(exported.positions[serverKey],undefined);assert.ok(exported.bookmarks.every(x=>x.key!==serverKey));
 const restored=replaceLocalReading(current,backup,id=>row(id,'Restored'));
 assert.equal(restored.positions[localReadingKey('a')].turnIndex,42);
 assert.deepEqual(serverPart(restored),serverPart(current));
});
