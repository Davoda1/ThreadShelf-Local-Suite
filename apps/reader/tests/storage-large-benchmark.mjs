/** Opt-in real SQLite >4GiB snapshot/recovery benchmark. Needs 10GiB free space. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { CompressedStorage } from '../src/core/storage.mjs';
if(!process.argv.includes('--run')){console.log('Use --run to execute the real >4GiB SQLite snapshot benchmark.');process.exit(0);}
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ts-storage-large-')),dataDir=path.join(root,'profile'),tempRoot=path.join(root,'temp');
let storage,db;const start=performance.now(),report={node:process.version,platform:process.platform,startedAt:new Date().toISOString(),rows:264,blobBytes:16*1024*1024};
const step=(name,at)=>{report[name+'Seconds']=Number(((performance.now()-at)/1000).toFixed(3));console.log(JSON.stringify({step:name,seconds:report[name+'Seconds'],rss:process.memoryUsage().rss}));};
try{
 storage=await new CompressedStorage({dataDir,tempRoot,onProgress:p=>console.log(JSON.stringify({phase:p.phase}))}).init();db=new DatabaseSync(storage.archivePath);db.exec('PRAGMA page_size=65536;PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;CREATE TABLE payload(id INTEGER PRIMARY KEY,data BLOB);CREATE TABLE marker(v TEXT);INSERT INTO marker VALUES(\'before\');');
 let at=performance.now();const insert=db.prepare('INSERT INTO payload(data) VALUES(zeroblob(?))');for(let i=0;i<report.rows;i++){insert.run(report.blobBytes);if(i%64===0)console.log(JSON.stringify({generatedRows:i}));}report.sqliteBytes=(await fs.stat(storage.archivePath)).size;step('generate',at);if(report.sqliteBytes<=2**32)throw new Error('Fixture did not exceed4GiB');
 await storage.recover(()=>{});at=performance.now();await storage.checkpoint({archiveDb:db,reading:{positions:{},bookmarks:[],recent:[]}});step('checkpoint',at);report.snapshotBytes=(await fs.stat(path.join(storage.snapshots,storage.pointer.file))).size;
 await storage.commit({kind:'marker',value:'acknowledged'},r=>db.prepare('UPDATE marker SET v=?').run(r.value));const work=storage.workingDir;db.close();db=null;await storage.close();storage=null;report.tempRemoved=!(await fs.access(work).then(()=>true,()=>false));
 at=performance.now();storage=await new CompressedStorage({dataDir,tempRoot}).init();db=new DatabaseSync(storage.archivePath);await storage.recover(r=>db.prepare('UPDATE marker SET v=?').run(r.value));report.recoveredMarker=db.prepare('SELECT v FROM marker').get().v;report.recoveredRows=db.prepare('SELECT count(*) AS n FROM payload').get().n;report.payloadTotalBytes=Number(db.prepare('SELECT sum(length(data)) AS n FROM payload').get().n);report.integrity=db.prepare('PRAGMA quick_check').get().quick_check;step('reopenRecover',at);
 if(report.recoveredMarker!=='acknowledged'||report.recoveredRows!==report.rows||report.payloadTotalBytes!==report.rows*report.blobBytes||report.integrity!=='ok')throw new Error('Large snapshot roundtrip mismatch');report.maxRSSBytes=process.resourceUsage().maxRSS*1024;report.totalSeconds=Number(((performance.now()-start)/1000).toFixed(3));report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1;}finally{try{db?.close();}catch{}await storage?.close().catch(()=>{});await fs.rm(root,{recursive:true,force:true});report.cleaned=true;const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);if(output){await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report,null,2));}
