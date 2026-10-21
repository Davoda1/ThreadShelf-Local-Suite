import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {dictionaries,translator} from '../src/ui/i18n.mjs';
import {UI_PALETTES,CODE_THEMES} from '../src/ui/themes.mjs';
import {syntheticConversations} from '../src/ui/demo.mjs';
import {buildReport} from '../src/core/metrics.mjs';
import {compactReport} from '../src/ui/worker-payload.mjs';
test('Analytics dictionaries contain every literal UI translation in all five locales',async()=>{
 const source=await fs.readFile(new URL('../src/ui/app.js',import.meta.url),'utf8'),keys=Object.keys(dictionaries.en);
 assert.deepEqual(Object.keys(dictionaries).sort(),['de','en','fr','hu','ja']);
 for(const locale of Object.keys(dictionaries)){assert.deepEqual(Object.keys(dictionaries[locale]),keys);for(const key of keys){assert.equal(typeof translator(locale)(key),'string');assert.notEqual(translator(locale)(key),'');}}
 for(const match of source.matchAll(/\bt\('([^']+)'\)/g))assert.ok(keys.includes(match[1]),match[1]);
});
test('Static appearance catalogs keep 17 interface and 10 independent code themes with light/dark palettes',()=>{
 assert.equal(UI_PALETTES.length,17);assert.equal(CODE_THEMES.length,10);
 for(const theme of [...UI_PALETTES,...CODE_THEMES]){assert.ok(theme.tokens.light);assert.ok(theme.tokens.dark);}
 assert.equal(UI_PALETTES.find(t=>t.id==='oled').tokens.dark.bg,'#000000');
});
test('Preview synthetic mixed collection totals add only compatible record units',()=>{
 const convs=syntheticConversations(),mixed=convs.filter(c=>c.collectionIds.includes('mixed-workshop'));
 assert.ok(new Set(mixed.map(c=>c.provider)).size>4);
 const report=buildReport(mixed,{range:'all',branch:'selected'}),sum=[...new Set(mixed.map(c=>c.provider))].reduce((total,provider)=>total+buildReport(mixed,{range:'all',branch:'selected',providers:[provider==='unknown'?'Unknown platform':provider]}).summary.records,0);
 assert.equal(sum,report.summary.records);assert.equal(convs.length,43);assert.ok(report.summary.undatedRecords>0);
});
test('Compact GUI report retains exact numerical tables and keeps evidence references in worker only',()=>{
 const original=buildReport(syntheticConversations(),{range:'all',branch:'selected'}),small=compactReport(original);
 assert.deepEqual(small.summary.conversations,original.summary.conversations);assert.equal(small.evidenceCount,original.evidence.length);assert.deepEqual(small.evidence,[]);
 for(const key of Object.keys(original.tables)){assert.equal(small.tables[key].length,original.tables[key].length);for(let i=0;i<original.tables[key].length;i++){for(const [field,value] of Object.entries(original.tables[key][i]))if(field!=='evidenceIds')assert.deepEqual(small.tables[key][i][field],value);assert.ok(!Object.hasOwn(small.tables[key][i],'evidenceIds'));}}
 assert.ok(JSON.stringify(small).length<JSON.stringify(original).length/2);
 assert.ok(original.tables.models[0].evidenceIds.length>0,'Original report still supplies exact drilldown identities');
});
