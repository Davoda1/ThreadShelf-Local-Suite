import { parentPort, workerData } from 'node:worker_threads';
import { ApplicationService } from '../core/service.mjs';

let service;
const ready=new ApplicationService({dataDir:workerData.dataDir,onProgress:value=>parentPort.postMessage({type:'progress',value})}).init().then(v=>{service=v;return v;});
parentPort.on('message',async ({id,action,args})=>{
  try {await ready;const value=await service.handle(action,args);parentPort.postMessage({id,value});}
  catch(error){parentPort.postMessage({id,error:error.message,name:error.name});}
});
ready.catch(error=>parentPort.postMessage({type:'fatal',error:error.message}));
