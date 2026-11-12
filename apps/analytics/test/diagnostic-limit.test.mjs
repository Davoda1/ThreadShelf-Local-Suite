import test from 'node:test';
import assert from 'node:assert/strict';
import {safeDiagnosticLimit} from '../src/ui/diagnostic-limit.mjs';

test('copied complexity diagnostics allow numeric context and exclude arbitrary source content',()=>{
 const value={kind:'nodes',observed:40_000_001,maximum:40_000_000,scope:'document',documentIndex:4153,message:'PRIVATE-SYNTHETIC-MESSAGE',body:'PRIVATE-SYNTHETIC-BODY',apiKey:'PRIVATE-SYNTHETIC-KEY'};
 const result=safeDiagnosticLimit(value);assert.deepEqual(result,{kind:'nodes',observed:40_000_001,maximum:40_000_000,scope:'document',documentIndex:4153});assert(!JSON.stringify(result).includes('PRIVATE-SYNTHETIC'));
 assert.deepEqual(safeDiagnosticLimit({kind:'depth',observed:1,maximum:0,scope:'input'}),{kind:'depth',observed:1,maximum:0,scope:'input'});
 for(const invalid of [null,{...value,kind:'PRIVATE-SYNTHETIC-KEY'},{...value,observed:'40000001'},{...value,maximum:Infinity},{...value,maximum:0},{...value,observed:-1},{...value,scope:'PRIVATE-SYNTHETIC-BODY'}])assert.equal(safeDiagnosticLimit(invalid),null);
 assert.equal(Object.hasOwn(safeDiagnosticLimit({...value,documentIndex:'PRIVATE-SYNTHETIC-MESSAGE'}),'documentIndex'),false);
});
