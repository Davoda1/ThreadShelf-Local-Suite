import {writeSync} from 'node:fs';
import {ApplicationService} from '../src/core/service.mjs';
const [dataDir,boundary]=process.argv.slice(2);
const service=await new ApplicationService({dataDir}).init();
service.storage.fault=name=>{if(name===boundary){writeSync(2,`READER_CONVERSION_CRASH_BOUNDARY:${name}\n`);process.kill(process.pid,'SIGKILL');}};
await service.handle('storage.convert',{profile:'zip6'});
throw new Error('Requested conversion termination boundary was not reached.');
