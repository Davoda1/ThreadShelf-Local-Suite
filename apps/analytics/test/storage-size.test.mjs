import test from 'node:test';
import assert from 'node:assert/strict';
import {formatStorageSize} from '../src/ui/storage-size.mjs';

test('storage keeps exact bytes and adds the requested binary-scaled example',()=>{
 assert.equal(formatStorageSize(56_334_035,{locale:'en-US'}),'56,334,035 Bytes (53.72MiB)');
 assert.equal(formatStorageSize(0,{locale:'en-US'}),'0 Bytes (0.00KiB)');
 assert.equal(formatStorageSize(1024,{locale:'en-US'}),'1,024 Bytes (1.00KiB)');
});
test('decimal MB/GB threshold boundaries select binary KiB, MiB and GiB',()=>{
 const cases=[[9_999_999,'9,999,999 Bytes (9,765.62KiB)'],[10_000_000,'10,000,000 Bytes (9.54MiB)'],[2_000_000_000,'2,000,000,000 Bytes (1,907.35MiB)'],[2_000_000_001,'2,000,000,001 Bytes (1.86GiB)']];
 for(const [bytes,expected]of cases)assert.equal(formatStorageSize(bytes,{locale:'en-US'}),expected);
});
test('storage localizes exact counts and two decimal digits while keeping units adjacent',()=>{
 assert.equal(formatStorageSize(56_334_035,{locale:'de-DE',bytesLabel:'Bytes'}),'56.334.035 Bytes (53,72MiB)');
 assert.equal(formatStorageSize(56_334_035,{locale:'hu-HU',bytesLabel:'Bájt'}),'56\u00a0334\u00a0035 Bájt (53,72MiB)');
 assert.equal(formatStorageSize(56_334_035,{locale:'fr-FR',bytesLabel:'Octets'}),'56\u202f334\u202f035 Octets (53,72MiB)');
 assert.equal(formatStorageSize(56_334_035,{locale:'ja-JP',bytesLabel:'バイト'}),'56,334,035 バイト (53.72MiB)');
});
test('missing or invalid storage remains unavailable rather than a fabricated size',()=>{
 for(const bytes of [undefined,null,NaN,Infinity,-1,'56334035'])assert.equal(formatStorageSize(bytes,{unavailableLabel:'Nicht verfügbar'}),'Nicht verfügbar');
});
