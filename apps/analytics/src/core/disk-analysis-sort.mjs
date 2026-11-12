/** Stable external sorting: bounded chunks/heads and a disk-resident run manifest. */
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
async function* lines(filename){const input=createReadStream(filename,{encoding:'utf8',highWaterMark:65536}),reader=readline.createInterface({input,crlfDelay:Infinity});try{for await(const line of reader)if(line)yield JSON.parse(line);}finally{reader.close();input.destroy();}}
async function writeRun(filename,items,compare){items.sort(compare);const handle=await fs.open(filename,'wx',0o600);try{for(const item of items)await handle.write(JSON.stringify(item)+'\n');}finally{await handle.close();}}
async function mergeRuns(paths,destination,compare,signal){const iterators=paths.map(p=>lines(p)[Symbol.asyncIterator]()),heads=await Promise.all(iterators.map(i=>i.next())),out=await fs.open(destination,'wx',0o600);try{for(;;){signal?.throwIfAborted();let winner=-1;for(let i=0;i<heads.length;i++)if(!heads[i].done&&(winner<0||compare(heads[i].value,heads[winner].value)<0))winner=i;if(winner<0)break;await out.write(JSON.stringify(heads[winner].value)+'\n');heads[winner]=await iterators[winner].next();}}finally{await out.close();await Promise.all(iterators.map(i=>i.return?.()));}}
export async function* externalSorted(ctx,iterable,compare,{maxRows=512,maxBytes=4*1024*1024,fanIn=8}={}){
 const id=randomUUID(),stem=path.join(ctx.directory,'sort-'+id);let batch=[],bytes=0,number=0,sequence=0;
 ctx.db.exec('CREATE TEMP TABLE IF NOT EXISTS analysis_sort_runs(sort_id TEXT,level INTEGER,ordinal INTEGER,filename TEXT,PRIMARY KEY(sort_id,level,ordinal))');
 const insert=ctx.db.prepare('INSERT INTO analysis_sort_runs VALUES(?,?,?,?)'),stable=(a,b)=>compare(a.value,b.value)||a.order-b.order;
 const flush=async()=>{if(!batch.length)return;const file=stem+'-0-'+number;insert.run(id,0,number++,file);await writeRun(file,batch,stable);batch=[];bytes=0;};
 try{
  for(const value of iterable){ctx.check();const item={value,order:sequence++},n=Buffer.byteLength(JSON.stringify(item));if(batch.length&&(batch.length>=maxRows||bytes+n>maxBytes))await flush();batch.push(item);bytes+=n;}await flush();
  let level=0,count=number;
  while(count>1){let next=0;for(let offset=0;offset<count;offset+=fanIn){ctx.check();const paths=[...ctx.db.prepare('SELECT filename FROM analysis_sort_runs WHERE sort_id=? AND level=? ORDER BY ordinal LIMIT ? OFFSET ?').iterate(id,level,fanIn,offset)].map(r=>r.filename),out=stem+'-'+(level+1)+'-'+next;insert.run(id,level+1,next++,out);await mergeRuns(paths,out,stable,ctx.signal);await Promise.all(paths.map(f=>fs.rm(f,{force:true})));}level++;count=next;}
  if(count){const file=ctx.db.prepare('SELECT filename FROM analysis_sort_runs WHERE sort_id=? AND level=? AND ordinal=0').get(id,level).filename;for await(const item of lines(file)){ctx.check();yield item.value;}}
 }finally{for(const row of ctx.db.prepare('SELECT filename FROM analysis_sort_runs WHERE sort_id=?').iterate(id))await fs.rm(row.filename,{force:true});ctx.db.prepare('DELETE FROM analysis_sort_runs WHERE sort_id=?').run(id);}
}
