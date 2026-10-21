// Child of storage.test.mjs: terminate without finally/close at a durable boundary.
import { DatabaseSync } from 'node:sqlite';
import { CompressedStorage } from '../src/core/storage.mjs';
const [dataDir,tempRoot,boundary]=process.argv.slice(2);let armed=false;
const storage=await new CompressedStorage({dataDir,tempRoot,fault:name=>{if(armed&&name===boundary)process.kill(process.pid,'SIGKILL');}}).init();
const db=new DatabaseSync(storage.archivePath);db.exec('PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,value TEXT)');
const apply=record=>db.prepare('INSERT OR IGNORE INTO records VALUES(?,?)').run(record.id,record.value);
await storage.recover(apply);if(!storage.pointer)await storage.checkpoint({archiveDb:db});
if(boundary==='record-committed')armed=true;
await storage.commit({id:'killed',value:boundary},apply);
armed=true;await storage.checkpoint({archiveDb:db});
throw new Error('Crash boundary was not reached.');
