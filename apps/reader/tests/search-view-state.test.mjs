import test from 'node:test';
import assert from 'node:assert/strict';
import {searchPreferences,appendSearchResults,searchProgressPercent,SEARCH_PERIODS} from '../src/ui/search-state.mjs';
test('search preferences keep Local and Server scopes separate and reject unsupported stored values',()=>{
 const settings={searchMode:'fuzzy',searchPreferences:{local:{mode:'hybrid',provider:'openai',role:'user',period:'3months'},server:{mode:'semantic',provider:'',role:''}}};
 assert.deepEqual(searchPreferences(settings,'local'),{mode:'hybrid',provider:'openai',role:'user',period:'3months'});
 assert.deepEqual(searchPreferences(settings,'server'),{mode:'semantic',provider:'',role:''});
 assert.equal(searchPreferences({searchMode:'fuzzy'},'server').mode,'keyword');
 assert.equal(searchPreferences({searchPreferences:{local:{period:'tomorrow'}}},'local').period,'all');
 assert.equal(SEARCH_PERIODS.length,8);
});
test('partial batches keep existing order, deduplicate retries, and retain distinct passages in one turn',()=>{
 const first=[{passageId:'a',conversationId:'c',turnIndex:1,score:1},{passageId:'b',conversationId:'c',turnIndex:1,score:2}];
 const next=appendSearchResults(first,[{passageId:'b',score:9},{passageId:'c',score:10}]);
 assert.deepEqual(next.map(x=>x.passageId),['a','b','c']);assert.equal(next[1].score,2);assert.equal(first.length,2);
 assert.equal(appendSearchResults([{id:'c',turnIndex:1,role:'ai'}],[{id:'c',turnIndex:1,role:'ai'},{id:'c',turnIndex:2,role:'ai'}]).length,2);
});
test('estimated progress is omitted without a denominator and cannot claim completion during ranking',()=>{
 for(const progress of [null,{}, {current:1,total:0},{current:NaN,total:3}])assert.equal(searchProgressPercent(progress),null);
 assert.equal(searchProgressPercent({fraction:.6,current:1,total:10}),60);assert.equal(searchProgressPercent({current:1,total:4}),25);assert.equal(searchProgressPercent({current:4,total:4}),99);assert.equal(searchProgressPercent({current:8,total:4}),99);
});
