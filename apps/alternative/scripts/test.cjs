'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const tests=fs.readdirSync(path.join(root,'test')).filter(v=>v.endsWith('.test.cjs')).map(v=>path.join(root,'test',v));
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit'});
process.exit(result.status??1);
