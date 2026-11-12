/** Disk-resident analytical populations and immutable result sessions. MIT davoda1. */
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {applyFilters} from './metrics.mjs';
import {canonicalPromptKey} from './prompt-key.mjs';

const parse=JSON.parse,stringify=JSON.stringify;
export const ANALYSIS_STATEMENT_CACHE_LIMITS=Object.freeze({entries:128,sqlBytes:2*1024*1024});
const changesSchema=sql=>/^\s*(?:CREATE|ALTER|DROP|REINDEX|VACUUM|ATTACH|DETACH|PRAGMA)\b/i.test(sql);
const noRecords=c=>{const{records,...metadata}=c;return metadata;};
const selectedRecord=(row,c)=>{const record=parse(row.json);return{...record,contentAnalysis:record.contentAnalysis||record.content,category:row.category??record.category,model:row.model??record.model,provider:row.provider??record.provider,conversationId:c.id,title:c.title||'Untitled conversation',sourceId:row.source_id??record.sourceId,snapshotId:row.snapshot_id??record.snapshotId??null,format:row.format??record.format,collectionIds:c.selectedCollectionIds||[],weight:row.weight??c.weight??1};};
export const annotatedFilters=(filters={},annotations={})=>{const value={...filters,aliases:filters.aliases||annotations.dedupAliases||{},displayAliases:filters.displayAliases||annotations.aliases||{},excludedConversationIds:filters.excludedConversationIds||annotations.exclusions||[],modelFamilyAliases:filters.modelFamilyAliases||annotations.modelFamilyAliases||{}};if(value.virtualGroup&&annotations.groups?.[value.virtualGroup])value.conversationIds=annotations.groups[value.virtualGroup];return value;};
export function createAnalysisDatabase(filename){
 const db=new DatabaseSync(filename);db.exec(`PRAGMA journal_mode=DELETE;PRAGMA temp_store=FILE;PRAGMA cache_size=-32768;PRAGMA synchronous=FULL;PRAGMA busy_timeout=30000;
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS original_conversations(cid TEXT PRIMARY KEY,ordinal INTEGER NOT NULL UNIQUE,json TEXT NOT NULL,source_key TEXT NOT NULL,original_id TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS original_records(cid TEXT NOT NULL,ordinal INTEGER NOT NULL,id TEXT,json TEXT NOT NULL,PRIMARY KEY(cid,ordinal));
 CREATE INDEX IF NOT EXISTS original_record_id ON original_records(id);
 CREATE TABLE IF NOT EXISTS selected_conversations(cid TEXT PRIMARY KEY,ordinal INTEGER NOT NULL UNIQUE,json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS selected_records(rid INTEGER PRIMARY KEY,cid TEXT NOT NULL,ordinal INTEGER NOT NULL,id TEXT NOT NULL,category TEXT,model TEXT,provider TEXT,source_id TEXT,snapshot_id TEXT,format TEXT,weight REAL NOT NULL,timestamp REAL,day TEXT,observed INTEGER,characters REAL,words REAL,object_id TEXT,logical_id TEXT,prompt_key TEXT,json TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS selected_record_id ON selected_records(id);CREATE INDEX IF NOT EXISTS selected_record_cid ON selected_records(cid,ordinal);
 CREATE INDEX IF NOT EXISTS selected_record_category ON selected_records(category);CREATE INDEX IF NOT EXISTS selected_record_model ON selected_records(model);CREATE INDEX IF NOT EXISTS selected_record_day ON selected_records(day);CREATE INDEX IF NOT EXISTS selected_record_day_model ON selected_records(day,model);CREATE INDEX IF NOT EXISTS selected_record_length ON selected_records(characters);
 CREATE TABLE IF NOT EXISTS decisions(ordinal INTEGER PRIMARY KEY,json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS legacy_original_context(cid TEXT PRIMARY KEY,json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS result_rows(scope TEXT NOT NULL,ordinal INTEGER NOT NULL,json TEXT NOT NULL,PRIMARY KEY(scope,ordinal));
 CREATE TABLE IF NOT EXISTS result_manifests(scope TEXT PRIMARY KEY,json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS contributors(evidence_key TEXT NOT NULL,record_id TEXT NOT NULL,PRIMARY KEY(evidence_key,record_id));
 CREATE TABLE IF NOT EXISTS evidence_queries(evidence_key TEXT NOT NULL,ordinal INTEGER NOT NULL,sql TEXT NOT NULL,params TEXT NOT NULL,PRIMARY KEY(evidence_key,ordinal));
 `);return db;
}
export class DiskAnalysisContext{
 constructor(db,{filters={},annotations={},options={},signal,onProgress,directory,sideContexts={},persistMetadata=true}={}){
  this.db=db;this.annotations=annotations;this.options=options;this.signal=signal;this.onProgress=onProgress;this.directory=directory;this.sideContexts=sideContexts;this.manifests=new Map();this.ordinals=new Map();this.statementCache=new Map();this.statementCacheBytes=0;
  const clocks=new Map();db.function('analysis_iso_week',{deterministic:true},day=>{if(!day)return null;const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));const start=new Date(Date.UTC(date.getUTCFullYear(),0,1));return date.getUTCFullYear()+'-W'+String(Math.ceil(((date-start)/86400000+1)/7)).padStart(2,'0');});db.function('analysis_hour',{deterministic:true},(timestamp,zone)=>{if(timestamp==null)return null;let f=clocks.get(zone);if(!f){if(clocks.size>=128)clocks.delete(clocks.keys().next().value);f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,hour:'2-digit',hourCycle:'h23'});clocks.set(zone,f);}return Number(f.formatToParts(timestamp).find(p=>p.type==='hour').value);});db.function('analysis_hostname',{deterministic:true},url=>{try{return new URL(url).hostname;}catch{return null;}});db.function('analysis_platform',{deterministic:true},value=>!value||/^(unknown|unavailable)$/i.test(value)?'Unknown platform':String(value));
  const empty=applyFilters([],filters,options);this.filters=empty.filters;this.dateRange=empty.dateRange;this.warnings=empty.warnings;this.unsupportedFilterKeys=empty.unsupportedFilterKeys;this.filterStatus=empty.filterStatus;
  if(persistMetadata){this.putMetadata('filters',this.filters);this.putMetadata('dateRange',this.dateRange);}
 }
 check(){this.signal?.throwIfAborted();}
 putMetadata(key,value){this.exec('INSERT OR REPLACE INTO metadata VALUES(?,?)',[key,stringify(value)]);}
 metadata(key,fallback=null){const row=this.get('SELECT json FROM metadata WHERE key=?',[key]);return row?parse(row.json):fallback;}
 rows(sql,params=[]){this.check();return this.db.prepare(sql).iterate(...params);}
 all(sql,params=[]){return [...this.rows(sql,params)];}
 clearStatementCache(){for(const value of this.statementCache.values())value.statement.close();this.statementCache.clear();this.statementCacheBytes=0;}
 statement(sql){
  // Only synchronous get/run use this cache. Iterators keep independent
  // statements so nested record scans never reuse a busy cursor.
  if(changesSchema(sql)){this.clearStatementCache();return{statement:this.db.prepare(sql),ephemeral:true};}
  const found=this.statementCache.get(sql);if(found){this.statementCache.delete(sql);this.statementCache.set(sql,found);return found;}
  const bytes=Buffer.byteLength(sql);if(bytes>ANALYSIS_STATEMENT_CACHE_LIMITS.sqlBytes)return{statement:this.db.prepare(sql),ephemeral:true};
  while(this.statementCache.size>=ANALYSIS_STATEMENT_CACHE_LIMITS.entries||this.statementCacheBytes+bytes>ANALYSIS_STATEMENT_CACHE_LIMITS.sqlBytes){const key=this.statementCache.keys().next().value,value=this.statementCache.get(key);value.statement.close();this.statementCache.delete(key);this.statementCacheBytes-=value.bytes;}
  const value={statement:this.db.prepare(sql),bytes};this.statementCache.set(sql,value);this.statementCacheBytes+=bytes;return value;
 }
 get(sql,params=[]){this.check();const value=this.statement(sql);try{return value.statement.get(...params);}finally{if(value.ephemeral)value.statement.close();}}
 exec(sql,params=[]){this.check();const value=this.statement(sql);try{return value.statement.run(...params);}finally{if(value.ephemeral)value.statement.close();}}
 side(name){return this.sideContexts[name]||null;}
 *conversations({selected=true}={}){
  const table=selected?'selected_conversations':'original_conversations',records=selected?'selected_records':'original_records';
  for(const row of this.rows(`SELECT cid,json FROM ${table} ORDER BY ordinal`)){
   this.check();const c=parse(row.json),items=[];for(const r of this.rows(`SELECT * FROM ${records} WHERE cid=? ORDER BY ordinal`,[row.cid]))items.push(selected?selectedRecord(r,c):parse(r.json));yield{...c,records:items};
  }
 }
 originalConversation(cid){const row=this.get('SELECT json FROM original_conversations WHERE cid=?',[cid]);if(!row)return null;const records=[];for(const r of this.rows('SELECT json FROM original_records WHERE cid=? ORDER BY ordinal',[cid]))records.push(parse(r.json));return{...parse(row.json),records};}
 selectedConversation(cid){const row=this.get('SELECT json FROM selected_conversations WHERE cid=?',[cid]);if(!row)return null;const records=[];const c=parse(row.json);for(const r of this.rows('SELECT * FROM selected_records WHERE cid=? ORDER BY ordinal',[cid]))records.push(selectedRecord(r,c));return{...c,records};}
 registerChart(manifest){const scope=manifest.id;this.manifests.set(scope,{...manifest,resource:'chart'});this.exec('INSERT OR REPLACE INTO result_manifests VALUES(?,?)',[scope,stringify({...manifest,resource:'chart'})]);return manifest;}
 registerTable(name,manifest={}){const scope=`table:${name}`,value={...manifest,id:name,resource:'table'};this.manifests.set(scope,value);this.exec('INSERT OR REPLACE INTO result_manifests VALUES(?,?)',[scope,stringify(value)]);return value;}
 addRow(scope,value,evidence=null){
  this.check();const ordinal=this.ordinals.get(scope)??Number(this.get('SELECT COALESCE(MAX(ordinal)+1,0) AS n FROM result_rows WHERE scope=?',[scope]).n);this.ordinals.set(scope,ordinal+1);
  const key=`${scope}:e${ordinal}`,{_ids,evidenceIds,evidenceKey,rowId,...publicValue}=value;
  const row={...publicValue,rowId:`${scope}:r${ordinal}`,evidenceKey:key};this.exec('INSERT INTO result_rows VALUES(?,?,?)',[scope,ordinal,stringify(row)]);
  this.addEvidence(key,evidence??_ids??evidenceIds);return row;
 }
 addEvidence(key,evidence){
  if(!evidence)return;
  if(evidence.sql){if(typeof evidence.sql!=='string'||!Array.isArray(evidence.params||[]))throw new TypeError('Invalid analytical evidence query.');const n=Number(this.get('SELECT COUNT(*) AS n FROM evidence_queries WHERE evidence_key=?',[key]).n);this.exec('INSERT INTO evidence_queries VALUES(?,?,?,?)',[key,n,evidence.sql,stringify(evidence.params||[])]);return;}
  const insert=this.db.prepare('INSERT OR IGNORE INTO contributors VALUES(?,?)');for(const id of typeof evidence==='string'?[evidence]:evidence){this.check();if(typeof id==='string'&&id)insert.run(key,id);}
 }
 count(scope){return Number(this.get('SELECT COUNT(*) AS n FROM result_rows WHERE scope=?',[scope]).n);}
 manifest(scope){const row=this.get('SELECT json FROM result_manifests WHERE scope=?',[scope]);return row?parse(row.json):null;}
 evidenceSQL(key){
  const pieces=['SELECT record_id AS id FROM contributors WHERE evidence_key=?'],params=[key];for(const query of this.rows('SELECT sql,params FROM evidence_queries WHERE evidence_key=? ORDER BY ordinal',[key])){pieces.push(`SELECT id FROM (${query.sql})`);params.push(...parse(query.params));}return{sql:pieces.join(' UNION '),params};
 }
 close(){for(const side of Object.values(this.sideContexts))side?.close();this.clearStatementCache();this.db.close();}
}

/** Canonical identity selection is persisted before any shared record filter. */
export async function prepareDiskSelection(ctx,readers){
 const db=ctx.db,filters=ctx.filters;let ordinal=0,seen=0;const sourceList=[];
 ctx.putMetadata('captureRefs',readers.map(reader=>({reference:reader.reference||null,sourceId:reader.metadata?.source?.id||null})));
 const choose=db.prepare('INSERT INTO original_conversations VALUES(?,?,?,?,?)'),replace=db.prepare('UPDATE original_conversations SET json=?,source_key=?,original_id=? WHERE cid=?');
 const decision=db.prepare('INSERT INTO decisions(json) VALUES(?)');
 db.exec('BEGIN');try{
  for(let sourceIndex=0;sourceIndex<readers.length;sourceIndex++){
   const reader=readers[sourceIndex],sourceKey=String(sourceIndex);sourceList.push(reader.metadata?.source||{});
   for(const original of reader.iterateConversations({includeRecords:false,records:false})){
    ctx.check();const key=filters.aliases?.[original.id]||original.canonicalId||original.id;if(!key){ctx.warnings.push({code:'missing-conversation-id',message:'A conversation without a scoped identity was skipped.'});continue;}
    const prior=ctx.get('SELECT json,source_key,original_id FROM original_conversations WHERE cid=?',[key]),metadata=noRecords(original);
    if(prior){const old=parse(prior.json),members=[...new Set([...(old.collectionIds||[]),...(original.collectionIds||[])])],takeNew=(original.snapshotCapturedAt||0)>(old.snapshotCapturedAt||0),value={...(takeNew?metadata:old),id:key,originalScopedId:takeNew?(metadata.originalScopedId||metadata.id):(old.originalScopedId||prior.original_id),collectionIds:members};replace.run(stringify(value),takeNew?sourceKey:prior.source_key,takeNew?original.id:prior.original_id,key);decision.run(stringify({label:'Explicit conversation identity',conversationId:key,aliasId:original.id,reason:filters.aliases?.[original.id]?'User-saved alias':'Repeated scoped identity',count:1}));}
    else choose.run(key,ordinal++,stringify({...metadata,id:key,originalScopedId:metadata.originalScopedId||metadata.id}),sourceKey,original.id);
   }
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 ctx.sourceScope=sourceList;ctx.putMetadata('sourceScope',sourceList);
 const originalInsert=db.prepare('INSERT INTO original_records VALUES(?,?,?,?)'),selectedInsert=db.prepare('INSERT INTO selected_conversations VALUES(?,?,?)');
 const rowInsert=db.prepare('INSERT INTO selected_records(cid,ordinal,id,category,model,provider,source_id,snapshot_id,format,weight,timestamp,day,observed,characters,words,object_id,logical_id,prompt_key,json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 let total=Number(ctx.get('SELECT COUNT(*) n FROM original_conversations').n);ctx.onProgress?.({phase:'selection',completed:0,total});
 // Capture readers keep records on disk. Reconstruct at most one conversation.
 db.exec('BEGIN');try{for(let sourceIndex=0;sourceIndex<readers.length;sourceIndex++){
  const reader=readers[sourceIndex],sourceKey=String(sourceIndex);
  for(const original of reader.iterateConversations({includeRecords:true,records:true,includeBodies:!!filters.search})){
   ctx.check();const key=filters.aliases?.[original.id]||original.canonicalId||original.id;
   const canonical=ctx.get('SELECT ordinal,json,source_key,original_id FROM original_conversations WHERE cid=?',[key]);if(!canonical)continue;ctx.exec('INSERT OR REPLACE INTO legacy_original_context VALUES(?,?)',[key,stringify({allRetainedSegments:(original.records||[]).length,selectedSegments:(original.records||[]).filter(r=>r.selected!==false).length,retainedAlternatives:(original.records||[]).filter(r=>r.selected===false).length})]);if(canonical.source_key!==sourceKey||canonical.original_id!==original.id)continue;
   const c={...parse(canonical.json),records:original.records||[]};
   if(filters.search&&c.records.some(r=>r.observed!==false&&r.category!=='redacted'&&typeof r.text!=='string'))throw Object.assign(new Error('Refresh this source to restore owned text search and evidence.'),{code:'OWNED_TEXT_UNAVAILABLE'});
   const selected=applyFilters([c],{...filters,aliases:{}},ctx.options),part=selected.conversations[0];
   {
    const selectedIds=new Set(part?.records.map(r=>r.id)||[]);
    let i=0;for(const r of c.records){const persisted={...r};delete persisted.text;if(persisted.textExcerpt===true||typeof persisted.textExcerpt==='string')persisted.textTruncated=true;delete persisted.textExcerpt;if(filters.search)persisted.analysisSearchMatched=selectedIds.has(r.id);originalInsert.run(key,i++,r.id??null,stringify(persisted));}
    for(const d of selected.deduplication)decision.run(stringify(d));
    if(part){selectedInsert.run(key,canonical.ordinal,stringify(noRecords(part)));let j=0;for(const r of part.records){const content=r.content||{},persisted={...r};if(filters.search)persisted.analysisSearchMatched=true;if(persisted.textExcerpt===true||typeof persisted.textExcerpt==='string')persisted.textTruncated=true;for(const field of ['text','textExcerpt','provider','conversationId','title','sourceId','snapshotId','format','collectionIds','weight'])delete persisted[field];if(persisted.contentAnalysis===persisted.content)delete persisted.contentAnalysis;rowInsert.run(key,j++,r.id,r.category,r.model,r.provider,r.sourceId,r.snapshotId,r.format,r.weight||1,r.timestamp??null,r.day??null,content.observed?1:0,content.characters??null,content.words??null,r.objectId??null,r.logicalId??null,r.promptMatchKey||r.promptFingerprint||(typeof r.text==='string'&&r.text?canonicalPromptKey(r.text):null),stringify(persisted));}}
   }
   seen++;ctx.onProgress?.({phase:'selection',completed:seen,total});await new Promise(resolve=>setImmediate(resolve));
  }
 }db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 ctx.putMetadata('warnings',ctx.warnings);ctx.putMetadata('filterStatus',ctx.filterStatus);ctx.putMetadata('unsupportedFilterKeys',ctx.unsupportedFilterKeys);
 return ctx;
}
