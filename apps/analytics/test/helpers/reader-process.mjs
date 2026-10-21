/** Separate-process test harness; runs the unmodified reference Reader service. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [reference,dataDir,tempRoot]=process.argv.slice(2);
const { ApplicationService }=await import(pathToFileURL(path.join(reference,'src/core/service.mjs')).href);
let reader;
async function open(){reader=await new ApplicationService({dataDir,storageOptions:{tempRoot}}).init();await reader.ensureLocal();}
await open();process.send({ready:true});
let queue=Promise.resolve();process.on('message',message=>{queue=queue.then(async()=>{try{
  let result;
  switch(message.command){
    case 'upsert':result=await reader.commitMutation(reader.store.prepareUpsert(message.document));break;
    case 'query':result={collections:reader.store.collections({includeEmpty:true}),threads:reader.store.files({pageSize:500}).files.map(row=>reader.store.thread({id:row.id}))};break;
    case 'checkpoint':await reader.checkpoint(true);result={ok:true};break;
    case 'convert':result=await reader.handle('storage.convert',{profile:message.profile});break;
    case 'manage':result=await reader.handle('manager.mutate',message.args);break;
    case 'backup':result=await reader.handle('manager.backup',{path:message.path});break;
    case 'restore':await reader.handle('manager.restore.preview',{path:message.path});result=await reader.handle('manager.restore',{path:message.path});break;
    case 'restart':await reader.shutdown();await open();result={ok:true};break;
    case 'shutdown':await reader.shutdown();process.send({id:message.id,result:{ok:true}},()=>process.exit(0));return;
    default:throw new Error('Unsupported Reader test command.');
  }process.send({id:message.id,result});
}catch(error){process.send({id:message.id,error:{message:error.message,stack:error.stack}});}});});
