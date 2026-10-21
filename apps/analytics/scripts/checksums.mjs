#!/usr/bin/env node
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {releaseArtifactNames} from './release-filenames.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));const out=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'release');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
const names=releaseArtifactNames(pkg.version);const check=names.pop();
const lines=[];for(const name of names){const bytes=await fs.readFile(path.join(out,name));lines.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);}
await fs.writeFile(path.join(out,check),lines.join('\n')+'\n');console.log(check);
