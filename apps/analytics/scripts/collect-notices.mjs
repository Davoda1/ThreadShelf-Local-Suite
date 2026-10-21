#!/usr/bin/env node
// Preserve installed locked-dependency licenses without including runtime caches.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=path.join(root,'licenses/npm');await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
const manifest=[];
async function visit(directory){
 for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
  const packagePath=path.join(directory,entry.name);
  if(entry.name.startsWith('@')){await visit(packagePath);continue;}
  let pkg;try{pkg=JSON.parse(await fs.readFile(path.join(packagePath,'package.json')));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  const name=pkg.name.replace(/^@/,'').replaceAll('/','--');const dest=path.join(out,`${name}-${pkg.version}`);
  const notices=(await fs.readdir(packagePath)).filter(n=>/^(?:licen[sc]e|copying|notice|copyright)(?:$|[._-])/i.test(n));
  await fs.mkdir(dest,{recursive:true});
  for(const n of notices){if((await fs.stat(path.join(packagePath,n))).isFile())await fs.copyFile(path.join(packagePath,n),path.join(dest,n));}
  const meta={name:pkg.name,version:pkg.version,license:pkg.license??null,repository:pkg.repository??null,retainedNotices:notices};
  await fs.writeFile(path.join(dest,'package-metadata.json'),JSON.stringify(meta,null,2)+'\n');manifest.push(meta);
  try{await fs.access(path.join(packagePath,'node_modules'));await visit(path.join(packagePath,'node_modules'));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
}
await visit(path.join(root,'node_modules'));
manifest.sort((a,b)=>a.name.localeCompare(b.name));
await fs.writeFile(path.join(root,'licenses/BUILD-DEPENDENCIES.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Retained notice texts and version metadata for ${manifest.length} installed dependency packages.`);
