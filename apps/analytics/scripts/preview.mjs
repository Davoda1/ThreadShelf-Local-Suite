#!/usr/bin/env node
// The offline preview uses the exact renderer and calculation-worker build.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parse} from 'parse5';
import {releaseFilename} from './release-filenames.mjs';
import {injectBootShell} from '../src/ui/boot-screen.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
const out=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'release',releaseFilename(`ThreadShelf-Local-Analytics-${pkg.version}-Preview.html`));
const [html,css,ui,worker,icon]=await Promise.all(['dist/index.html','dist/ui.css','dist/ui.js','dist/analytics-worker.js','build/icon.svg'].map(name=>fs.readFile(path.join(root,name),'utf8')));
const escapeScript=value=>value.replace(/<\/script/gi,'<\\/script');
const safeJSON=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
let preview=injectBootShell(html).replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i,`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'">`);
preview=preview.replace(/<link\b[^>]*rel=["']icon["'][^>]*>/i,`<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}">`);
preview=preview.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/ig,'');
preview=preview.replace('</head>',()=>`<style>${css.replace(/<\/style/gi,'<\\/style')}</style>\n</head>`);
preview=preview.replace(/<script\b[^>]*src=["'][^"']*["'][^>]*>\s*<\/script>/ig,()=>`<script>window.__ANALYTICS_WORKER_SOURCE__=${safeJSON(worker)};</script>\n<script type="module">${escapeScript(ui)}</script>`);
const notices={};
for(const name of ['LICENSE','THIRD-PARTY-NOTICES.md','licenses/highlight.js-LICENSE.txt','licenses/Ayu-MIT.txt','licenses/NotoSansJP-OFL.txt','licenses/marked-LICENSE.md','dist/ui.js.LEGAL.txt','dist/analytics-worker.js.LEGAL.txt']){
 try{notices[name]=await fs.readFile(path.join(root,name),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
}
const bodyEnd=preview.lastIndexOf('</body>');
if(bodyEnd<0)throw Error('Preview template has no closing body.');
preview=preview.slice(0,bodyEnd)+`<script type="application/json" id="analytics-offline-notices">${safeJSON(notices)}</script>\n`+preview.slice(bodyEnd);
function verifyTree(node){
 for(const attribute of node.attrs||[]){
  if(['src','href'].includes(attribute.name)&&['script','link','img','iframe','video','audio','source'].includes(node.tagName)&&!attribute.value.startsWith('data:'))throw Error('Preview has an external asset reference.');
 }
 for(const child of node.childNodes||[])verifyTree(child);
}
verifyTree(parse(preview));
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,preview);console.log(`Created ${path.basename(out)} from the actual Analytics UI and embedded worker.`);
