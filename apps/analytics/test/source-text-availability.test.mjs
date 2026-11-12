import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {translator} from '../src/ui/i18n.mjs';
const source=await fs.readFile(new URL('../src/ui/app.js',import.meta.url),'utf8'),start=source.indexOf('function sourceList(){'),end=source.indexOf('\nfunction appearanceForm(',start);
assert(start>=0&&end>start,'Actual source details function boundaries');
test('a statistics-only prior capture explains missing public text without discarding usable metrics',()=>{
 const item={id:'synthetic-source',name:'Synthetic source',status:'ready',conversationCount:7,textRecaptureRequired:true},state={sources:[item]},context=vm.createContext({state,bridge:{},t:translator('en'),esc:String,attr:String,fmt:String,dateFmt:()=>'',action:(name,title,attributes='')=>`<button data-action="${name}" ${attributes}>${title}</button>`});
 vm.runInContext(source.slice(start,end),context);let html=vm.runInContext('sourceList()',context);assert.match(html,/Owned message text is unavailable; refresh this source to restore text search and evidence\./);assert.match(html,/data-action="refresh-source" data-source="synthetic-source"/);assert.match(html,/<dd>7<\/dd>/);assert.equal(state.sources[0],item);assert.equal(item.status,'ready');delete item.textRecaptureRequired;html=vm.runInContext('sourceList()',context);assert.doesNotMatch(html,/Owned message text is unavailable/);
 for(const language of ['en','hu','de','fr','ja'])assert.notEqual(translator(language)('textRecaptureHelp'),'textRecaptureHelp');
});
