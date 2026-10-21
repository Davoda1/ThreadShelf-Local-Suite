import test from 'node:test';
import assert from 'node:assert/strict';
import { turnToMessage } from '../src/reader/messages.js';
import { setRendererLocale, tr, readerLocaleCoverage } from '../src/reader/locale.js';
import { highlighter as hljs } from '../src/reader/highlight.js';

test('renderer preserves source identity with empty turns and shared thinking/answer indexes', () => {
 const messages = [{user:'First',turn_index:12},{user:'',turn_index:30},{thinking:'Reason',turn_index:44},{ai:'Answer',turn_index:44},{user:'Followup',turn_index:85}].map(turnToMessage);
 assert.deepEqual(messages.map(m=>m.turn_index),[12,30,44,44,85]);
 assert.notEqual(messages[2].message_id,messages[3].message_id);
 assert.equal(messages[2].role,'thinking');assert.equal(messages[3].role,'assistant');
 assert.equal(turnToMessage({ai:'stdout',source_role:'tool',turn_index:0},9).role,'tool');
 assert.equal(turnToMessage({ai:'Instructions',source_role:'system'},9).role,'system');
 assert.equal(turnToMessage({user:'Hello',turn_index:'19'},3).turn_index,19);
 assert.equal(turnToMessage({user:'Hello',turn_index:-2},3).turn_index,3);
});
test('all bundled highlight.js grammars are registered', () => {
 assert.ok(hljs.listLanguages().length > 180);
 for(const language of ['ada','fortran','haskell','elixir','erlang','verilog','vhdl','wasm','x86asm','brainfuck','yaml','typescript','mathematica','julia']) assert.ok(hljs.getLanguage(language),language);
});
test('reader controls have five complete locale sets', () => {
 for(const language of ['en','hu','de','fr','ja']) {
   setRendererLocale(language);
   for(const key of readerLocaleCoverage) assert.ok(tr(key).trim());
   assert.equal(tr('Copy'),{en:'Copy',hu:'Másolás',de:'Kopieren',fr:'Copier',ja:'コピー'}[language]);
 }
 setRendererLocale('en');
});
