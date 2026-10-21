import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import {highlighter,normalizeCodeLanguage,getCodeLanguageLabel,registeredCodeLanguages,CODE_LANGUAGE_ALIASES} from '../src/reader/highlight.js';
import {namedCodeFixtures} from './fixtures/code-highlighting.mjs';
const textOf=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(textOf).join('');
const scopesOf=(node,result=[])=>{for(const attr of node.attrs||[])if(attr.name==='class')result.push(...attr.value.split(/\s+/));for(const child of node.childNodes||[])scopesOf(child,result);return result};
for(const fixture of namedCodeFixtures)test(`${fixture.fence}: actual tokens and exact source round trip`,()=>{
  const canonical=normalizeCodeLanguage(fixture.fence);assert.equal(canonical,fixture.canonical);
  const html=highlighter.highlight(fixture.source,{language:canonical,ignoreIllegals:true}).value;
  const parsed=parseFragment(html),scopes=scopesOf(parsed);
  for(const scope of fixture.scopes)assert.ok(scopes.includes('hljs-'+scope),`${fixture.fence} is missing ${scope}: ${html}`);
  assert.equal(textOf(parsed),fixture.source,'highlighting must not change original code');
});
test('all 193 upstream grammars remain, plus dedicated Fish',()=>{
  const languages=registeredCodeLanguages();assert.equal(languages.length,194);
  assert.ok(languages.find(l=>l.name==='fish'));
  // Every declared upstream alias and every explicit Reader alias must resolve.
  for(const {name,aliases} of languages){
    assert.ok(highlighter.getLanguage(name));
    for(const alias of aliases)if(name!=='plaintext')assert.notEqual(normalizeCodeLanguage(alias),'plaintext',`${name}: ${alias}`);
  }
  for(const [alias,target] of Object.entries(CODE_LANGUAGE_ALIASES))assert.ok(target==='mermaid'||highlighter.getLanguage(target),alias);
});
test('shell aliases select scripts or prompted sessions intentionally',()=>{
  for(const name of ['shell','posix','posix-sh','posix-shell','sh/posix','POSIX/sh','ksh','ksh93','mksh','ash','dash','zsh','sh']){
    assert.equal(normalizeCodeLanguage(name),'bash',name);
    const html=highlighter.highlight('if [ -n "$x" ]; then echo "$x"; fi',{language:normalizeCodeLanguage(name)}).value;
    assert.match(html,/hljs-keyword/);assert.match(html,/hljs-variable/);
  }
  for(const name of ['console','shellsession','shell-session','terminal'])assert.equal(normalizeCodeLanguage(name),'shell');
  for(const name of ['fish','fishshell','fish-shell'])assert.equal(normalizeCodeLanguage(name),'fish');
  for(const [input,expected] of [['language-C++','cpp'],['{.Python}','python'],['.CS','csharp'],['lang-JS title="app.js"','javascript'],['sh/POSIX','bash']])assert.equal(normalizeCodeLanguage(input),expected);
  assert.equal(getCodeLanguageLabel('bash','zsh'),'Zsh');assert.equal(getCodeLanguageLabel('bash','posix'),'POSIX Shell');
  assert.equal(getCodeLanguageLabel('fish','fish'),'Fish');assert.equal(getCodeLanguageLabel('shell','console'),'Shell Session');
  assert.equal(normalizeCodeLanguage('unknown-language'),'plaintext');
});
test('Fish quoting and command substitution do not inherit Bash semantics',()=>{
  const highlighted=source=>highlighter.highlight(source,{language:'fish',ignoreIllegals:true}).value;
  assert.doesNotMatch(highlighted("echo '$HOME (pwd) $(pwd)'"),/hljs-(variable|subst)/);
  assert.doesNotMatch(highlighted('echo "(pwd)"'),/hljs-subst/);
  assert.match(highlighted('echo "$(pwd)"'),/hljs-subst/);
  assert.match(highlighted('echo (string join "," (string split ":" $PATH))'),/hljs-subst/);
  assert.match(highlighted('echo $argv[1..-1] $$names[2]'),/hljs-variable/);
  assert.doesNotMatch(highlighted('echo `pwd` ${HOME}'),/hljs-(variable|subst)/);
  assert.doesNotMatch(highlighted('echo then fi'),/hljs-keyword/);
  assert.match(highlighted('begin; set -l name "Reader"; end'),/hljs-keyword/);
});
