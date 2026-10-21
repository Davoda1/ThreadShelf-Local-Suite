#!/usr/bin/env node
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectBootShell } from '../src/ui/boot-screen.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const dist=path.join(root,'dist');
await rm(dist,{recursive:true,force:true}); await mkdir(dist,{recursive:true});
try { await access(path.join(root,'public')); await cp(path.join(root,'public'),dist,{recursive:true}); } catch(e) { if(e.code!=='ENOENT') throw e; }
await mkdir(path.join(dist,'assets'),{recursive:true});await cp(path.join(root,'build/icon.svg'),path.join(dist,'assets/icon.svg'));
const common={absWorkingDir:root,bundle:true,target:'chrome144',sourcemap:false,minify:false,metafile:true,legalComments:'linked',logLevel:'info'};
const result=await build({...common,entryPoints:['src/ui/app.js'],outfile:'dist/ui.js',format:'esm',splitting:false,loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'}});
const worker=await build({...common,entryPoints:['src/ui/analytics-worker.js'],outfile:'dist/analytics-worker.js',format:'iife'});
let html=await readFile(path.join(root,'index.html'),'utf8');
html=html.replaceAll('dist/ui.js','./ui.js').replaceAll('dist/ui.css','./ui.css').replace(/(?:\.\/|\/)src\/ui\/app\.js/g,'./ui.js');
if(!html.includes('worker-src'))html=html.replace("connect-src 'none';","connect-src 'none'; worker-src 'self' blob:;");
html=injectBootShell(html);
await writeFile(path.join(dist,'index.html'),html);
const pkg=JSON.parse(await readFile(path.join(root,'package.json')));
await writeFile(path.join(dist,'build-meta.json'),JSON.stringify({version:pkg.version,node:process.version,outputs:[...Object.keys(result.metafile.outputs),...Object.keys(worker.metafile.outputs)]},null,2)+'\n');
console.log('Analytics renderer and browser calculation worker built in dist/.');
