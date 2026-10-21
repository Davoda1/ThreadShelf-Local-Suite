import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import {renderSafeMarkdown,safeMarkdownHTML,validatedExternalUrl,safeHighlightedHtml} from '../src/core/safe-markdown.mjs';
import {highlighter,normalizeCodeLanguage} from '../src/ui/highlight.js';

const nodes=html=>{const result=[];const visit=node=>{result.push(node);for(const child of node.childNodes||[])visit(child);};visit(parseFragment(html));return result;};
const attributes=html=>nodes(html).flatMap(n=>(n.attrs||[]).map(a=>({tag:n.tagName,...a})));

test('allowlisted Markdown supports headings, emphasis, lists, quotations, tables and code forms',()=>{
  const text='# Heading\n\nA **strong** and *emphasized* paragraph with `inline`.\n\n1. Ordered\n2. List\n\n- Unordered\n- List\n\n> Quotation\n\n| Name | Count |\n| :--- | ---: |\n| Example | 2 |\n\n~~~javascript\nconst x = 1;\n~~~\n\n    indented\n';
  const rendered=renderSafeMarkdown(text);
  const tags=new Set(nodes(rendered.html).map(n=>n.tagName));
  for(const tag of ['h1','p','strong','em','ol','ul','li','blockquote','table','thead','th','td','pre','code'])assert(tags.has(tag),tag);
  assert.equal(rendered.source,text);assert.equal(rendered.blocks.length,2);assert.equal(rendered.truncated,false);
  assert.equal(rendered.blocks[0],'const x = 1;\n');assert.equal(rendered.blocks[1],'    indented\n');
  assert(!attributes(rendered.html).some(a=>a.name==='href'||a.name==='src'||a.name==='data-action'));
});

test('copy payloads preserve original source, CRLF, final newline and unclosed fenced code',()=>{
  const text='Before\r\n\r\n```text\r\none\r\n two\r\n```\r\n\r\n~~~python\r\nprint(1)\r\n';
  const rendered=renderSafeMarkdown(text,{controls:true});
  assert.equal(rendered.source,text);assert.deepEqual(rendered.blocks,['one\r\n two\r\n','print(1)\r\n']);
  assert.deepEqual(attributes(rendered.html).filter(a=>a.name==='data-md-index').map(a=>a.value),['0','1']);
  const second=renderSafeMarkdown(text);assert.deepEqual(second.blocks,rendered.blocks);
  assert.deepEqual(renderSafeMarkdown('> ```text\r\n> code\r\n>   more\r\n> ```\r\n').blocks,['code\r\n  more\r\n']);
  assert.deepEqual(renderSafeMarkdown('- ```text\r\n  code\r\n  more\r\n  ```\r\n').blocks,['code\r\nmore\r\n']);
  assert.deepEqual(renderSafeMarkdown('\tcode\r\n\t more\r\n').blocks,['\tcode\r\n\t more\r\n']);
  const long='```text\n'+'a'.repeat(1024)+'\n```\n\nFollowing paragraph';
  const excerpt=renderSafeMarkdown(long,{maxCharacters:512});assert.equal(excerpt.truncated,true);assert.equal(excerpt.blocks[0],'a'.repeat(1024)+'\n');
});

test('raw HTML, SVG, MathML, events and injected app commands remain text',()=>{
  const payload='<script>alert(1)</script>\n<svg onload="alert(2)"><a href="javascript:alert(3)">x</a></svg>\n<math><mtext><img src="https://track.invalid/pixel"></mtext></math>\n<button data-action="clear-cache" data-md-index="0" id="secret" name="secret" onclick="alert(4)">delete</button>\n<style>@import "https://track.invalid/font";</style>\n<iframe src="https://track.invalid/embed"></iframe>\n<form><input autofocus></form>';
  const html=safeMarkdownHTML(payload,{controls:true});
  const forbidden=new Set(['script','svg','math','img','button','style','iframe','form','input']);
  assert(!nodes(html).some(n=>forbidden.has(n.tagName)));
  assert(!attributes(html).some(a=>/^(?:on|id$|name$|src$|href$|style$|data-)/.test(a.name)));
  assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('links remain inert; unsafe schemes, credentials and URL controls cannot become actions',()=>{
  const text='[good](https://example.invalid/a?q=one#x) ![image](https://track.invalid/a.png) [bad](javascript:alert(1)) [local](file:///tmp/x) [data](data:text/html,x) [app](analytics:clear) [blob](blob:https://example.invalid/0)';
  const rendered=renderSafeMarkdown(text,{controls:true,openExternal:true});
  assert.deepEqual(rendered.links,['https://example.invalid/a?q=one#x']);
  assert(!nodes(rendered.html).some(n=>n.tagName==='a'||n.tagName==='img'));
  const actions=attributes(rendered.html).filter(a=>a.name==='data-action').map(a=>a.value);
  assert.deepEqual(actions,['markdown-copy-link','markdown-open-link']);
  assert(rendered.html.includes('Image omitted: image'));
  for(const value of ['javascript:alert(1)','data:text/html,x','file:///tmp/a','blob:https://a/1','mailto:user@a','https://user:pass@a/',' https://a/','https://a/\n','https:\\a/','//a/','https://a/\u0000'])assert.equal(validatedExternalUrl(value),null,value);
  assert.equal(validatedExternalUrl('HTTPS://EXAMPLE.invalid/a'),'https://example.invalid/a');
});

test('link labels and language metadata cannot inject command attributes',()=>{
  const text='[<button data-action="clear-cache">x</button>](https://example.invalid/)\n\n```html\" data-action=\"delete-source\n<img src=x onerror=alert(1)>\n```';
  const html=safeMarkdownHTML(text,{controls:true});
  const actions=attributes(html).filter(a=>a.name==='data-action').map(a=>a.value);
  assert.deepEqual(actions,['markdown-copy-link','markdown-copy-code']);
  assert(!attributes(html).some(a=>a.name==='src'||a.name==='onerror'));
});

test('highlighted HTML is re-allowlisted and all installed grammars remain usable',()=>{
  const source='const value = "<img src=x>";';
  const html=safeHighlightedHtml(highlighter.highlight(source,{language:'javascript'}).value,source);
  assert(nodes(html).some(n=>n.tagName==='span'));assert(!nodes(html).some(n=>n.tagName==='img'));
  for(const bad of ['<img src=x>','<span class="hljs-string" data-action="clear-cache">x</span>','<span onclick="alert(1)">x</span>','<span class="hljs-string">x','<script>alert(1)</script>'])assert.equal(safeHighlightedHtml(bad,source),'const value = &quot;&lt;img src=x&gt;&quot;;');
  for(const declared of ['c','cpp','csharp','rust','python','zsh','bash','sh','json','java','javascript','html','css','fish','shell','powershell','pascal','purebasic','fortran','cobol','lisp','scheme','ada','haskell','julia']){
    const language=normalizeCodeLanguage(declared);assert(highlighter.getLanguage(language),declared);
    assert.equal(renderSafeMarkdown('```'+declared+'\nexample\n```',{highlight:(code,lang)=>highlighter.highlight(code,{language:normalizeCodeLanguage(lang),ignoreIllegals:true}).value}).blocks[0],'example\n');
  }
});

test('large and deeply nested input has a bounded display while keeping source unchanged',()=>{
  const source='x'.repeat(500_000)+'\nlast original line';
  const rendered=renderSafeMarkdown(source,{maxCharacters:2048,maxTokens:100,maxDepth:8});
  assert.equal(rendered.source,source);assert.equal(rendered.renderedCharacters,2048);assert.equal(rendered.truncated,true);assert(rendered.html.length<5000);
  const nested=renderSafeMarkdown('> '.repeat(100)+'deep\n',{maxDepth:8});assert(nested.truncated);assert(nested.html.length<10_000);
  const malformed=renderSafeMarkdown('```js\n<svg onload=alert(1)>\n');assert(!nodes(malformed.html).some(n=>n.tagName==='svg'));
});
