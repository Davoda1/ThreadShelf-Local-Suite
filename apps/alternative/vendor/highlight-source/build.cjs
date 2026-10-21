/* Deterministic offline CommonJS-to-IIFE wrapper. Uses only Node built-ins. */
'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=__dirname;
const files=['lib/core.js','lib/index.js',...fs.readdirSync(path.join(root,'lib/languages')).filter(name=>name.endsWith('.js')).sort().map(name=>'lib/languages/'+name),'fish.js','adapter.js'];
const modules=files.map(name=>JSON.stringify(name)+':function(module,exports,require){\n'+fs.readFileSync(path.join(root,name),'utf8')+'\n}').join(',\n');
const banner='/* highlight.js 11.12.0 — BSD-3-Clause. See vendor/licenses/highlight.js-LICENSE.txt.\n * Reader aliases/Fish: MIT, Copyright (c) 2026 davoda1.\n * Offline source and rebuild: vendor/highlight-source/build.cjs. */\n';
const runtime="(function(){'use strict';const modules={\n"+modules+"\n};const cache=Object.create(null);function load(id){if(cache[id])return cache[id].exports;if(!Object.hasOwn(modules,id))throw new Error('Unknown bundled highlight module: '+id);const module={exports:{}};cache[id]=module;modules[id](module,module.exports,function(request){if(!request.startsWith('.'))throw new Error('External highlight dependency blocked');const parts=id.split('/');parts.pop();for(const part of request.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}let next=parts.join('/');if(!next.endsWith('.js'))next+='.js';return load(next);});return module.exports;}load('adapter.js');})();\n";
const output=path.resolve(root,'../highlight.bundle.js');fs.writeFileSync(output,banner+runtime);console.log(output);
