/** Bounded, disposable direct-import inventory. MIT davoda1. */
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {externalSorted} from './disk-analysis-sort.mjs';
export class DiskInputLedger{
 constructor({filename,signal}={}){
  if(typeof filename!=='string'||!path.isAbsolute(filename))throw new TypeError('An absolute private input-ledger filename is required.');
  this.filename=filename;this.signal=signal;this.closed=false;const fd=fsSync.openSync(filename,'wx',0o600);fsSync.closeSync(fd);
  try{this.db=new DatabaseSync(filename);this.db.exec(`PRAGMA journal_mode=DELETE;PRAGMA synchronous=OFF;PRAGMA temp_store=FILE;PRAGMA cache_size=-8192;PRAGMA mmap_size=0;
   CREATE TABLE seen(path TEXT PRIMARY KEY);
   CREATE TABLE scanned(ordinal INTEGER PRIMARY KEY,filename TEXT NOT NULL,stat TEXT NOT NULL);
   CREATE TABLE files(ordinal INTEGER PRIMARY KEY,status TEXT NOT NULL,report TEXT NOT NULL);CREATE INDEX files_status ON files(status,ordinal);
   CREATE TABLE diagnostics(ordinal INTEGER PRIMARY KEY,severity TEXT NOT NULL,code TEXT NOT NULL,value TEXT NOT NULL);
   CREATE TEMP TABLE directory_entries(directory_id TEXT NOT NULL,ordinal INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(directory_id,ordinal));`);
  }catch(error){this.db?.close();fsSync.rmSync(filename,{force:true});throw error;}
  this.context={db:this.db,directory:path.dirname(filename),signal,check:()=>this.check()};
 }
 check(){if(this.closed)throw new Error('Input ledger is closed.');if(this.signal?.aborted)throw new DOMException('Import cancelled.','AbortError');}
 remember(filename){this.check();return this.db.prepare('INSERT OR IGNORE INTO seen VALUES(?)').run(filename).changes===1;}
 async *directoryEntries(directory){
  this.check();const id=randomUUID(),put=this.db.prepare('INSERT INTO directory_entries VALUES(?,?,?)');let at=0,opened;
  try{
   opened=await fs.opendir(directory);for await(const item of opened){this.check();put.run(id,at++,JSON.stringify({name:item.name,isFile:item.isFile(),isDirectory:item.isDirectory(),isSymbolicLink:item.isSymbolicLink()}));}
   const rows=this.db.prepare('SELECT value FROM directory_entries WHERE directory_id=? ORDER BY ordinal'),values=function*(){for(const row of rows.iterate(id))yield JSON.parse(row.value);};
   for await(const item of externalSorted(this.context,values(),(a,b)=>a.name.localeCompare(b.name))){this.check();yield item;}
  }finally{await opened?.close().catch(()=>{});this.db.prepare('DELETE FROM directory_entries WHERE directory_id=?').run(id);}
 }
 addScanned(filename,stat){this.check();const value=typeof stat==='number'?{size:stat}:stat;this.db.prepare('INSERT INTO scanned(filename,stat) VALUES(?,?)').run(filename,JSON.stringify(value));}
 *scanned(){this.check();for(const row of this.db.prepare('SELECT filename,stat FROM scanned ORDER BY ordinal').iterate()){this.check();yield{filename:row.filename,stat:JSON.parse(row.stat)};}}
 putFile(index,report){this.check();if(!Number.isSafeInteger(index)||index<0)throw new TypeError('Invalid source file ordinal.');this.db.prepare('INSERT INTO files VALUES(?,?,?) ON CONFLICT(ordinal) DO UPDATE SET status=excluded.status,report=excluded.report').run(index,String(report.status||''),JSON.stringify(report));}
 *files({status}={}){this.check();const statement=this.db.prepare('SELECT ordinal,report FROM files'+(status===undefined?'':' WHERE status=?')+' ORDER BY ordinal');for(const row of status===undefined?statement.iterate():statement.iterate(status)){this.check();const value=JSON.parse(row.report);Object.defineProperty(value,'index',{value:row.ordinal,enumerable:false});yield value;}}
 countFiles({status}={}){this.check();return Number(status===undefined?this.db.prepare('SELECT COUNT(*) n FROM files').get().n:this.db.prepare('SELECT COUNT(*) n FROM files WHERE status=?').get(status).n);}
 addDiagnostics(items){this.check();const put=this.db.prepare('INSERT INTO diagnostics(severity,code,value) VALUES(?,?,?)');for(const item of items||[]){this.check();put.run(String(item.severity||'info'),String(item.code||''),JSON.stringify(item));}}
 *diagnostics(){this.check();for(const row of this.db.prepare('SELECT value FROM diagnostics ORDER BY ordinal').iterate()){this.check();yield JSON.parse(row.value);}}
 countErrors(){this.check();return Number(this.db.prepare("SELECT COUNT(*) n FROM diagnostics WHERE severity='error' OR code IN ('file-error','parse-error','ingest-error')").get().n);}
 close(){if(this.closed)return;this.db.close();this.closed=true;}
}
