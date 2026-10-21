// Reader-owned synthetic regression for component indentation and opaque markers.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'reader-rich-layout-'));
await build({stdin:{contents:'import {ConversationRenderer} from "./src/reader/renderer.js"; window.ConversationRenderer=ConversationRenderer;',resolveDir:root},outfile:path.join(tmp,'renderer.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
const browser=await chromium.launch({headless:true,...(process.env.READER_CHROMIUM ? {executablePath:process.env.READER_CHROMIUM} : {}),args:['--no-sandbox']});
try {
  const page=await browser.newPage(); await page.setContent('<div id="host"></div>'); await page.addScriptTag({path:path.join(tmp,'renderer.js')});
  const source=`<box border padding={2}>
  <grid columns={4}>
    {#each [{s:"A",t:"First"},{s:"B",t:"Second"},{s:"C",t:"Third"},{s:"D",t:"Fourth"}] as item,i}
      <grid-item>
        <box>
          <box height="70px"><title>{item.s}</title></box>
          <caption>{item.t}</caption>
          {#if i < 3}<icon name="arrow-right"/>{/if}
        </box>
      </grid-item>
    {/each}
  </grid>
  <box>
    <title>Saved heading</title>
    Prose with **<Entity value="Inline identity"/>** after a block.
  </box>
</box>`;
  const result=await page.evaluate(source=>{
    const host=document.getElementById('host'), renderer=new ConversationRenderer(host);
    const article=renderer.createMessageElement({message_id:'fixture',role:'assistant',content:source});host.replaceChildren(article);
    return {grid:host.querySelectorAll('.rich-grid-item').length,icons:host.querySelectorAll('.rich-icon').length,entity:host.querySelector('.rich-entity')?.textContent,emphasis:host.querySelector('strong .rich-entity')?.textContent,markers:/TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(host.innerHTML),code:host.querySelectorAll('pre').length,source:article.sourceText};
  },source);
  assert.deepEqual(result,{grid:4,icons:3,entity:'Inline identity',emphasis:'Inline identity',markers:false,code:0,source});
  // Standalone Markdown code remains original source, and typed labels do not
  // get interpreted as another Markdown or component document.
  const inert=await page.evaluate(()=>{
    const renderer=new ConversationRenderer(document.getElementById('host'));
    const src='<box>{#each [{s:"<Entity value=\\"not real\\"/> **not bold**"}] as item}<text>{item.s}</text>{/each}</box>\n\n    <Entity value="code"/>';
    const html=renderer.processMessageContent(src); const t=document.createElement('template');t.innerHTML=html;
    return {entities:t.content.querySelectorAll('.rich-entity').length,bold:t.content.querySelectorAll('strong').length,code:t.content.querySelector('code')?.textContent,markers:/TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(html),text:t.content.textContent};
  });
  assert.equal(inert.entities,0);assert.equal(inert.bold,0);assert.equal(inert.markers,false);assert.equal(inert.code,'<Entity value="code"/>');assert.match(inert.text,/\*\*not bold\*\*/);
  const blockCode=await page.evaluate(()=>{
    const renderer=new ConversationRenderer(document.getElementById('host'));
    const cases=['<box><text>CODE BOX</text></box>','<text>CODE TEXT</text>','<AsyncImage query="Saved image query"/>','{#each [{s:"A"}] as item}<text>{item.s}</text>{/each}','{missing.local.value}'];
    return cases.map(saved=>{
      const source='<box>\n  Code example:\n\n      '+saved+'\n</box>';
      const html=renderer.processMessageContent(source);const t=document.createElement('template');t.innerHTML=html;
      const code=t.content.querySelector('code');
      return {saved,code:code?.textContent,copy:code?.dataset.originalCode,components:t.content.querySelectorAll('.rich-component').length,images:t.content.querySelectorAll('.rich-image-unavailable').length,markers:/TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(html)};
    });
  });
  for(const result of blockCode){assert.equal(result.code,result.saved);assert.equal(result.copy,result.saved);assert.equal(result.components,1);assert.equal(result.images,0);assert.equal(result.markers,false);}
  const nestedCode=await page.evaluate(()=>{
    const renderer=new ConversationRenderer(document.getElementById('host'));
    const cases=['1 === 1','1 === 2'].map(condition=>{
      const saved='{#if '+condition+'}<text>CODE NESTED IF</text>{/if}';
      return {saved,source:'<box>\n  {#each [1] as item}\n    Code example:\n\n        '+saved+'\n  {/each}\n</box>'};
    });
    for (const saved of ['{missing.local.value}','{#each [{s:"A"}] as item}<text>{item.s}</text>{/each}']) cases.push({saved,source:'<box>\n  {#if 1 === 1}\n    Code example:\n\n        '+saved+'\n  {/if}\n</box>'});
    return cases.map(({saved,source})=>{
      const html=renderer.processMessageContent(source),t=document.createElement('template');t.innerHTML=html;const code=t.content.querySelector('code');
      return {saved,code:code?.textContent,copy:code?.dataset.originalCode,components:t.content.querySelectorAll('.rich-component').length,markers:/TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(html)};
    });
  });
  for(const result of nestedCode){assert.equal(result.code,result.saved);assert.equal(result.copy,result.saved);assert.equal(result.components,1);assert.equal(result.markers,false);}
  console.log(JSON.stringify({passed:['indented finite-grid expands four cards and three icons','structural prose preserves inline Entity and Markdown emphasis after a block','zero opaque placeholders in DOM or code copy records','original message source unchanged','code and bound strings remain inert','block components and template directives in genuine indented child code remain exact code including Copy','nested each/if code retains true and false condition source without evaluation']},null,2));
}finally{await browser.close();await rm(tmp,{recursive:true,force:true});}
