/** Synthetic published archives matching legacy and current public Reader cleanup contracts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixture, hash } from './reader-fixture.mjs';
import { encodeBuffer, encodeFile, decodeFile } from '../../src/core/codec.mjs';

const stableJSON=value=>Array.isArray(value)?`[${value.map(stableJSON).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`:JSON.stringify(value);
export function contentHash(document,{legacy=false}={}){const value={...document};for(const key of ['collection','collectionId','sourceFile','id','turnCount','importedAt','updatedAt',...legacy?[]:['deduplicationHistory']])delete value[key];return hash(stableJSON(value));}
export const syntheticDocument=(key,extra={})=>({provider:'grok',title:`Synthetic ${key}`,conversationKey:key,turns:[{turn_index:0,user:`Synthetic question ${key}`,ai:`Synthetic answer ${key}`,createdAt:'2026-01-01T00:00:00Z'}],...extra});
export async function fingerprint(root){const result=[];async function walk(directory){for(const item of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,item.name);if(item.isDirectory())await walk(filename);else result.push([path.relative(root,filename),hash(await fs.readFile(filename))]);}}await walk(root);return result.sort((a,b)=>a[0].localeCompare(b[0]));}

export async function currentReaderFixture(directory,{profile='zip6',cleanupColumn=true,documents=[{id:'keep',document:syntheticDocument('keep')}]}={}){
  const f=await fixture(directory,{profile});
  const pack=async value=>{const bytes=Buffer.from(JSON.stringify(value)),encoded=encodeBuffer(bytes,profile),block={bytes:bytes.length,sha256:hash(bytes),packedBytes:encoded.length,packedSha256:hash(encoded),codec:profile};block.file=`${block.sha256}.${block.packedSha256}.${profile==='7z'?'7z':'zip'}`;await fs.writeFile(path.join(f.root,'objects',block.file),encoded);return{bytes:bytes.length,blocks:[block]};};
  const descriptor=async(id,document,{legacy=false,cleanupVersion=1,collectionId='collection-one',collectionName='Mixed collection'}={})=>{
    const contentRef={format:'threadshelf-content-v2',version:1,turnCount:document.turns.length,header:await pack(Object.fromEntries(Object.entries(document).filter(([key])=>key!=='turns'))),groups:[{first:0,count:document.turns.length,blob:await pack(document.turns)}]};
    return{id,collection:{id:collectionId,name:collectionName,create:false},sourceIdentity:JSON.stringify({kind:'native',provider:document.provider,key:document.conversationKey}),nativeIdentity:document.conversationKey,contentHash:contentHash(document,{legacy}),contentRef,cleanupVersion,document:{provider:document.provider,sourceFile:document.sourceFile??'synthetic.json',conversationKey:document.conversationKey,title:document.title,turnCount:document.turns.length,lastTurnAt:document.lastTurnAt,sortTime:0,passageCount:document.turns.length*2}};
  };
  const rewriteCatalog=async edit=>{const local=path.join(directory,'reader-cleanup-catalog.sqlite');await decodeFile(path.join(f.root,'snapshots',f.pointer.file),local,{profile,maxBytes:f.pointer.logicalBytes,expectedBytes:f.pointer.logicalBytes});const db=new DatabaseSync(local);try{await edit(db);}finally{db.close();}const packed=local+'.packed';await encodeFile(local,packed,{profile,maxBytes:1024*1024});await fs.rename(packed,path.join(f.root,'snapshots',f.pointer.file));f.pointer.logicalBytes=(await fs.stat(local)).size;f.pointer.sha256=hash(await fs.readFile(path.join(f.root,'snapshots',f.pointer.file)));await fs.rm(local);await f.republishGeneration();};
  const rows=[];for(const row of documents)rows.push(await descriptor(row.id,row.document,row));
  await rewriteCatalog(db=>{if(cleanupColumn)db.exec('ALTER TABLE conversations ADD COLUMN cleanup_version INTEGER NOT NULL DEFAULT 0');db.exec('DELETE FROM conversations');for(const row of rows){const cols=['id','collection_id','source_identity_json','collection','provider','source_file','conversation_key','title','turn_count','last_turn_at','content_hash','content_ref','created_at','updated_at',...cleanupColumn?['cleanup_version']:[]],values=[row.id,row.collection.id,row.sourceIdentity,row.collection.name,row.document.provider,row.document.sourceFile,row.document.conversationKey,row.document.title,row.document.turnCount,null,row.contentHash,JSON.stringify(row.contentRef),'2026-01-01','2026-01-01',...cleanupColumn?[row.cleanupVersion]:[]];db.prepare(`INSERT INTO conversations (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...values);}});
  let sequence=0;
  const append=async mutation=>f.append({kind:'archive',mutation:{version:1,opId:`reader-cleanup-operation-${++sequence}`,baseRevision:1,at:'2026-01-02',...mutation}});
  const rename=(baseRevision,name='Renamed after cleanup')=>append({kind:'manage',action:'rename',baseRevision,collectionId:'collection-one',name,ids:[],removedCollections:[]});
  return{...f,rows,descriptor,rewriteCatalog,appendMutation:append,rename};
}
