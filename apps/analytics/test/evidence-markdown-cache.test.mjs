import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createEvidenceMarkdownCache} from '../src/ui/evidence-markdown-cache.mjs';
import {renderSafeMarkdown} from '../src/core/safe-markdown.mjs';
import {highlighter,normalizeCodeLanguage} from '../src/ui/highlight.js';

const source=await fs.readFile(new URL('../src/ui/app.js',import.meta.url),'utf8');
const start=source.indexOf('function excerptHtml('),end=source.indexOf('\nfunction restoreScroll(',start);
assert(start>=0&&end>start,'Actual evidence renderer function boundaries');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function harness(){
 let current=null;
 const context=vm.createContext({document:{querySelector:()=>current,createElement:()=>({dataset:{},setAttribute(){},remove(){current=null;}}),body:{append:panel=>{current=panel;}}},captureViewState:()=>null,restoreViewState:()=>{},markdownResults:createEvidenceMarkdownCache(),renderSafeMarkdown,highlighter,normalizeCodeLanguage,
  esc:escape,attr:escape,t:key=>key,fmt:String,label:String,dateFmt:()=>'',translatedCategory:String,bridge:{openExternal:async()=>{}},state:{annotations:{}},evidenceOpen:true,evidenceTitle:'Synthetic evidence',evidenceGeneration:1,evidenceLoading:false,evidenceOffset:0,evidencePageInfo:{nextOffset:2},evidenceTotal:200,
  action:(name,label,extra='')=>`<button data-action="${escape(name)}" ${extra}>${escape(label)}</button>`,evidence:[]});
 vm.runInContext(source.slice(start,end),context);return{context,get panel(){return current;}};
}
test('bounded public evidence renders retained Markdown and code without loading archived markup or links',()=>{
 const h=harness(),code='print("Synthetic 🧪")\n',body='## Retained body\n\n```python\n'+code+'```\n\n[Documentation](https://example.org/doc)\n\n![remote](https://example.org/pixel)\n\n<img src=x onerror=alert(1)>';
 h.context.evidence=[{id:'record-1',text:body,title:'Synthetic',category:'response',model:'synthetic-model',provider:'OpenAI',conversationId:'conversation-1',textTruncated:true,fullTextCharacters:9001},{id:'record-2',text:null,conversationId:'conversation-1'}];
 vm.runInContext('renderEvidence()',h.context);const html=h.panel.innerHTML;
 assert.match(html,/<h2>Retained body<\/h2>/);assert.match(html,/hljs-/);assert.match(html,/markdown-copy-code/);assert.match(html,/markdown-copy-link/);assert.match(html,/markdown-open-link/);assert.match(html,/data-offset="2"/);assert.match(html,/1–2 \/ 200/);assert.match(html,/9001/);
 assert.doesNotMatch(html,/<img|<script|\shref=|onerror="/i);assert.equal(h.context.markdownResults.size,1);const rendered=h.context.markdownResults.get('record-1');assert.equal(rendered.blocks[0],code);assert.equal(rendered.links[0],'https://example.org/doc');
 h.context.evidence=[{id:'record-3',text:'Next page body',conversationId:'conversation-1'}];h.context.evidenceOffset=2;h.context.evidencePageInfo={previousOffset:0,nextOffset:3};vm.runInContext('renderEvidence()',h.context);
 assert.equal(h.context.markdownResults.size,1);assert.equal(h.context.markdownResults.get('record-1'),undefined);assert(h.context.markdownResults.get('record-3'));assert.match(h.panel.innerHTML,/3–3 \/ 200/);assert.match(h.panel.innerHTML,/data-offset="3"/);
 h.context.evidenceOpen=false;vm.runInContext('renderEvidence()',h.context);assert.equal(h.context.markdownResults.size,0);assert.equal(h.panel,null);
});
test('Markdown control cache cannot accumulate bodies across pages or exceed the evidence page limit',()=>{
 const cache=createEvidenceMarkdownCache(2);cache.set('one',{blocks:['old code']});cache.set('two',{links:['second link']});cache.set('three',{blocks:['current code']});assert.equal(cache.size,2);assert.equal(cache.get('one'),undefined);assert.deepEqual(cache.get('three'),{blocks:['current code']});cache.clear();assert.equal(cache.size,0);for(const value of [0,101,1.5])assert.throws(()=>createEvidenceMarkdownCache(value),TypeError);
});
