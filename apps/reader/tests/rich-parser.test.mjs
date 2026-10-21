// Reader-owned synthetic edge cases. The optional external evidence run below
// reads private fixtures in place; those files must never enter release archives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRichMarkdown, parseRichSpan, parseLiteral, RICH_LIMITS, safeRichUrl } from '../src/reader/rich-parser.js';
const all = node => [node, ...(node.children || []).flatMap(all)];
const fragments = source => [...prepareRichMarkdown(source).records.values()];

test('literal grammar supports finite JSON plus quoted/unquoted data keys; never expressions', () => {
  const value = parseLiteral(`[{s:"A",t:'First',n:-1.25e2,ok:true,x:null,}, {s:"B"}]`);
  assert.equal(Object.getPrototypeOf(value[0]), null); assert.equal(value[0].n, -125);
  assert.equal(parseLiteral('"\\u20ac\\n"'), '€\n');
  for (const s of ['window', 'new Date()', '(()=>1)()', '[...window]', '{x:NaN}', '{x:Infinity}', '1+2', '{x:1,x:2}', '{__proto__:{x:1}}', '{"constructor":3}', '{x:{prototype:4}}', '[1] trailing', '1e999', '01', '"x\\q"']) assert.throws(() => parseLiteral(s), SyntaxError, s);
});

test('observed components, attributes and bare align enum validate without HTML repair', () => {
  const source = '<box border clip radius="lg" padding={3} width="100%" minWidth="180px" background="surface-secondary"><row align=start justify="between" gap={2}><text weight="medium" tabularNums>**Saved**</text><box flex={160} height="17px" background="#4788C7"/><Entity category="software" value="Example" disambig="Saved identity"/><Link url="https://example.org/" title="Saved source"/></row></box>';
  const node = parseRichSpan(source);
  assert.equal(node.attrs.border, true); assert.equal(all(node).filter(n => n.tag === 'Entity').length, 1);
  assert.equal(all(node).find(n => n.tag === 'text').children[0].text, '**Saved**');
  for (const s of ['<Box/>', '<Company/>', '<box style="color:red"/>', '<box onclick="bad()"/>', '<box background="url(https://x)"/>', '<box width="calc(2px)"/>', '<box width="-2px"/>', '<box width="101%"/>', '<box align=center/>', '<row align=end/>', '<box {...data}/>', '<box gap={99}/>', '<box><row></box></row>', '<box flex="1 0 auto"/>', '<Cite refs={[]}/>', '<Cite refs={[""]}/>', '<Cite ref="a" refs={["b"]}/>', '<box bad={1}/>']) assert.throws(() => parseRichSpan(s), SyntaxError, s);
});

test('finite loops/conditions use own local properties, preserve order, and bind inert primitive text', () => {
  const literal = '<Chart content={window.desktop}/> **unsafe** {#each xs as x}';
  const source = `<grid columns={4}>{#each [{s:"A",t:"First"},{s:"B",t:${JSON.stringify(literal)}},{s:"C",t:"Third"},{s:"D",t:"Fourth"}] as item,i}<grid-item><title>{item.s}</title><caption>{item.t}</caption>{#if i < 3}<icon name="arrow-right"/>{/if}</grid-item>{/each}</grid>`;
  const node = parseRichSpan(source), nodes = all(node);
  assert.deepEqual(nodes.filter(n => n.tag === 'title').map(n => n.children[0].text), ['A','B','C','D']);
  assert.equal(nodes.filter(n => n.tag === 'icon').length, 3);
  assert.equal(nodes.filter(n => n.tag === 'Chart').length, 0);
  assert.equal(nodes.filter(n => n.kind === 'literal')[3].text, literal);
  for (const s of ['<box>{window.desktop}</box>', '<box>{#each [[1,2]] as item}{item.length}{/each}</box>', '<box>{item.constructor}</box>', '<box>{#each window as x}{x}{/each}</box>', '<box>{#each [1] as x}{x.toString()}{/each}</box>', '<box>{#if i = 3}bad{/if}</box>', '<box>{#if 1 < "2"}bad{/if}</box>', '<box>{#each [1] as x}{x=2}{/each}</box>', '<box>{#each [1] as x}{#if x < 2 || window}bad{/if}{/each}</box>', '<box>{#each [{a:1}] as x}{x.missing}{/each}</box>']) assert.throws(() => parseRichSpan(s), SyntaxError, s);
});

test('unsupported children on terminal components remain exact source', () => {
  for(const source of ['<Entity value="Label">Saved content</Entity>', '<Link url="https://example.org">Saved content</Link>', '<icon name="server">Saved content</icon>']) {assert.throws(()=>parseRichSpan(source)); assert.equal(prepareRichMarkdown(source).content,source);}
});

test('aggregate budgets reject recursive amplification, deep input and excessive literals', () => {
  assert.throws(() => parseLiteral('['.repeat(30) + '1' + ']'.repeat(30)), /nesting/);
  assert.throws(() => parseLiteral(JSON.stringify(Array(RICH_LIMITS.array+1).fill(1))), /array/);
  assert.throws(() => parseLiteral(JSON.stringify('x'.repeat(RICH_LIMITS.string+1))), /string/);
  const values = JSON.stringify(Array(32).fill(1));
  assert.throws(() => parseRichSpan(`<box>{#each ${values} as a}{#each ${values} as b}<text>{b}</text>{/each}{/each}</box>`), /budget/);
  const deep = '<box>'.repeat(30) + 'deep' + '</box>'.repeat(30); assert.equal(fragments(deep).length, 0);
});

test('Markdown tokenizer excludes fenced/inline/indented code, escapes, links and unrelated HTML', () => {
  const entity = '<Entity value="not a component"/>';
  const excluded = ['```jsx\n'+entity+'\n```', '`'+entity+'`', '    '+entity+'\n', '\\'+entity, '[saved '+entity+'](https://example.org/)', '<div>\n'+entity+'\n</div>', '<span>'+entity+'</span>', '<!-- '+entity+' -->'];
  for (const s of excluded) assert.equal(fragments(s).length, 0, s);
  assert.equal(fragments('Before '+entity+' after.').length, 1);
  assert.equal(fragments('<Company> is a prose placeholder.').length, 0);
  assert.equal(fragments('<box>`'+entity+'`\n\n```jsx\n'+entity+'\n```\n</box>').length, 1);
});

test('mathematics are excluded before rich extraction; typed attribute text is not transformed', () => {
  const entity = '<Entity value="in formula"/>';
  for (const s of ['\\('+entity+'\\)', '\\['+entity+'\\]', '$$'+entity+'$$', '$x^2 '+entity+'$', '\\begin{matrix}'+entity+'\\end{matrix}', '[\nx^2 '+entity+'\n]']) assert.equal(fragments(s).length, 0, s);
  assert.equal(parseRichSpan('<Entity value="$x^2$"/>').attrs.value, '$x^2$');
  assert.equal(all(parseRichSpan('<box>\\('+entity+'\\)</box>')).filter(n=>n.tag==='Entity').length, 0);
});

test('rich source indentation around prose and blank lines is not mistaken for top-level code', () => {
  const source = '<box>\n  <row>\n    <box>\n      **Title**\n\n      Paragraph with <Cite ref="turn1view0"/>.\n    </box>\n  </row>\n</box>';
  const node = parseRichSpan(source); assert.equal(all(node).filter(n=>n.tag==='Cite').length, 1);
  assert.equal(fragments(source).length, 1);
});

test('indented template source is protected before loop and binding evaluation', () => {
  const saved='{#each [{s:"A"}] as item}<text>{item.s}</text>{/each}';
  const source='<box>\n  Code example:\n\n      '+saved+'\n</box>';
  const node=parseRichSpan(source);
  assert.equal(all(node).filter(n=>n.kind==='literal'||n.tag==='text').length,0);
  assert.ok(node.children.some(n=>n.kind==='markdown'&&n.text===saved));
  const unresolved='<box>\n  Code example:\n\n      {missing.local.value}\n</box>';
  assert.doesNotThrow(()=>parseRichSpan(unresolved));
  for(const condition of ['1 === 1','1 === 2']) {
    const code='{#if '+condition+'}<text>CODE NESTED IF</text>{/if}';
    const nested='<box>\n  {#each [1] as item}\n    Code example:\n\n        '+code+'\n  {/each}\n</box>';
    const result=parseRichSpan(nested);assert.ok(result.children.some(n=>n.kind==='markdown'&&n.text===code));assert.equal(all(result).filter(n=>n.tag==='text').length,0);
  }
  assert.doesNotThrow(()=>parseRichSpan('<box>\n  {#if 1 === 1}\n    Code example:\n\n        {missing.local.value}\n  {/if}\n</box>'));
});

test('malformed components remain local; invalid complete span cannot consume later siblings', () => {
  const bad='<box align="invalid">bad</box>', good='<box>good</box>';
  assert.deepEqual(fragments(bad+'\n\n'+good).map(n=>n.source),[good]);
  const malformed='<box bad=">"><Entity value="nested"/></box>';
  assert.deepEqual(fragments(malformed+'\n\n'+good).map(n=>n.source),[good]);
  assert.equal(fragments('<box bad=">"><Entity value="nested"/>').length,0);
  assert.equal(fragments('<box bad={">"}><box>nested</box>').length,0);
  assert.equal(fragments('<box bad="x"><box>nested</box></box>\n\n'+good).length,1);
});

test('replacement records use fresh unspoofable markers and retain surrounding specifications', () => {
  const source = 'Before\n\n<box>Widget</box>\n\n| Spec | Value |\n|---|---|\n| RAM | 192 |\n\nAfter';
  const a=prepareRichMarkdown(source),b=prepareRichMarkdown(source);
  assert.notEqual([...a.records.keys()][0],[...b.records.keys()][0]);
  assert.match(a.content,/\| RAM \| 192 \|/); assert.match(a.content,/After$/);
  assert.equal(prepareRichMarkdown('TSRICH00000000000000000000000000000000END').records.size,0);
});

test('legacy GenUI wrappers are separate literal adapters, never a fenced JSON heuristic', () => {
  const chart={chart:{content:{chartType:'bar',xKey:'name',data:[{name:'A',value:3}],series:[{dataKey:'value'}]}}};
  const marker='genui'+JSON.stringify(chart)+'';
  assert.equal(fragments(marker)[0].family,'chart');
  assert.equal(fragments('```json\n'+JSON.stringify(chart)+'\n```').length,0);
  assert.equal(fragments('```text\n'+marker+'\n```').length,0);
  assert.equal(fragments('genui{"charts_widget_v2":{"language":"recharts-json","content":{"chartType":"pie"}}}')[0].family,'charts_widget_v2');
  assert.equal(fragments('genui{"suggest_automation":{"label":"Archived suggestion"}}')[0].kind,'passive');
  assert.equal(fragments('genui{"citation":{"ref":"turn1view0"}}')[0].tag,'Cite');
  assert.equal(fragments('genui{"refs":["turn1view0"]}')[0].tag,'Cite');
  assert.equal(fragments('genui{"map_widget":{"points":[{"name":"Place","category":"Saved category","ref":"turn1business0"}]}}')[0].kind,'passive');
  for(const s of ['genui{"chart":{"content":{},"version":9}}','genui{"chart":{"content":window.desktop}}','genui{"suggest_automation":{"label":"Saved","action":"run"}}','genui{"unknown":{"data":[1]}}','[Interactive visualization not included in this export.]','Snapshot: 1 USD = 315.68 HUF — not a live rate.']) assert.equal(prepareRichMarkdown(s).content,s);
});

test('hostile unclosed tag soup fails the linear preflight before Markdown tokenization', () => {
  const source = '<box bad="x">' + '<bad>'.repeat(40000);
  const start = performance.now(), result = prepareRichMarkdown(source);
  assert.equal(result.literalOnly,true);assert.equal(result.content,source);assert.equal(result.records.size,0);
  assert.ok(performance.now()-start < 1000,'Bounded lexical rejection should remain subsecond');
});

test('safe links are explicit and scheme restricted', () => {
  for(const s of ['https://example.org/path?q=a#b','http://example.org','mailto:a@example.org']) assert.equal(safeRichUrl(s),s);
  for(const s of ['javascript:alert(1)','data:image/svg+xml,...','file:///tmp/x','//example.org','https://example.org/ a','javascript&#58;bad','https:\\example.org']) assert.equal(safeRichUrl(s),null,s);
});

