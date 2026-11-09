import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument } from '../src/core/importers.mjs';
import { createRichContextResolver } from '../src/reader/rich-context.js';
import { prepareRichMarkdown } from '../src/reader/rich-parser.js';

test('native Grok import retains source bytes and exact per-response card bindings', () => {
  for (const key of ['_id', 'response_id', 'responseId']) {
    const marker = '<grok:render card_id="source-a" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">0</argument></grok:render>';
    const raw = {conversations:[{conversation:{id:'synthetic-grok',title:'Preserved sources'},responses:[
      {response:{[key]:'reply-a',sender:'assistant',message:marker,card_attachments_json:JSON.stringify([{id:'source-a',cardType:'citation_card',url:'https://example.com/a',title:'Árvíztűrő 日本語'}])}},
      {response:{[key]:'reply-b',sender:'assistant',message:marker,card_attachments_json:JSON.stringify([{id:'source-a',cardType:'citation_card',url:'https://example.com/b'}])}}
    ]}]};
    const exact = JSON.stringify(raw);
    const [thread] = normalizeDocument(raw, 'grok.json');
    assert.equal(JSON.stringify(raw), exact);
    assert.deepEqual(thread.raw, raw.conversations[0]);
    assert.equal(thread.turns[0].ai, marker);
    assert.equal(thread.turns[0].source_message_id, 'reply-a');
    const context = createRichContextResolver(thread);
    assert.equal(context(thread.turns[0]).grokCards['source-a'].url, 'https://example.com/a');
    assert.equal(context(thread.turns[1]).grokCards['source-a'].url, 'https://example.com/b');
    const parsed = prepareRichMarkdown(thread.turns[0].ai);
    assert.equal(parsed.records.size, 1);
    assert.equal([...parsed.records.values()][0].source, marker);
  }
});
