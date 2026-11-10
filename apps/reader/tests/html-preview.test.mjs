import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { validHtmlPreview } from '../src/reader/html-preview-validation.mjs';
const require=createRequire(import.meta.url);
const {publicAddress,publicUrl,previewCsp,fetchPublicHttps}=require('../src/desktop/html-preview-network.cjs');
const page=body=>`<!DOCTYPE html><html><head><title>Test</title></head><body>${body}</body></html>`;
test('HTML preview strictly classifies complete standalone documents and original language tags',()=>{
  for(const tag of ['','unknown','html','htm','html5','HTML'])assert.equal(validHtmlPreview(page('<p>Hi</p><script>document.body.dataset.ran="yes"</script>'),tag),true,tag);
  for(const tag of ['text','plaintext','xml','svg','xhtml','python','javascript','php','madeup'])assert.equal(validHtmlPreview(page('<p>Hi</p>'),tag),false,tag);
  for(const source of ['<p>Hi</p>', '<!doctype html><p>Hi</p>', '<html><head></head><body>Hi</body></html>',page('<p>Hi</p>')+page('x'),'let x='+JSON.stringify(page('x')),page('<div><span>x</div>'),page('<div>x'),page('<p><div>x</div></p>'),page('<table><div>x</div></table>'),page('<svg><g></svg>')])assert.equal(validHtmlPreview(source,'html'),false,source);
  assert.equal(validHtmlPreview(page('<ul><li>a<li>b</ul>')) ,true);
  assert.equal(validHtmlPreview(page('<p>a<p>b')),true);
  assert.equal(validHtmlPreview('<!doctype html>\n<html><head><title>x</title></head>\n<body>x</body>\n</html>','html'),true);
  assert.equal(validHtmlPreview('\n<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>Pretty printed</title>\n</head>\n<body>\n<p>Content</p>\n</body>\n</html>\n','html'),true);
  assert.equal(validHtmlPreview('<!doctype html><html><head><title>x</title></head><body>x</body>outside</html>','html'),false);
  assert.equal(validHtmlPreview('<!doctype html>\n<html><head><title>x</title></head>\n<body>x</body>\n<!-- after body -->\n</html>\n<!-- after document -->\n','html'),true);
  assert.equal(validHtmlPreview(page('x')+'outside','html'),false);
  assert.equal(validHtmlPreview(page('x')+'<div>outside</div>','html'),false);
  assert.equal(validHtmlPreview(page('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>')),true);
});
test('network policy excludes private and non-HTTPS addresses without broadening old image rules',()=>{
  for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','100.64.0.1','172.31.0.1','192.168.1.1','198.18.0.1','::1','fe80::1','fc00::1','::ffff:8.8.8.8','2:db8::1','20:db8::1','200:db8::1','2001:db8::1','2002:808:808::1'])assert.equal(publicAddress(ip),false,ip);
  for(const ip of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);
  for(const url of ['http://example.com','https://127.1/','https://localhost/','file:///etc/passwd','https://example.local','https://user:pw@example.com','https://example.com:444','wss://example.com'])assert.equal(publicUrl(url),null,url);
  assert.ok(publicUrl('https://example.com/asset.js'));
  assert.match(previewCsp(false),/connect-src 'none'/);assert.doesNotMatch(previewCsp(false),/https:/);assert.match(previewCsp(true),/sandbox allow-scripts/);assert.doesNotMatch(previewCsp(true),/allow-same-origin|unsafe-eval|allow-forms/);
});
function fakeResponse(status=200,headers={'content-type':'text/plain'},body='ok',capture=()=>{}){return (_url,options,callback)=>{capture(options);const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=err=>queueMicrotask(()=>req.emit('error',err));req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers=headers;callback(res);res.emit('data',Buffer.from(body));res.emit('end');});return req;};}
test('DNS is pinned, mixed/private DNS denied, secrets not forwarded, malformed responses reject',async()=>{
  let pinned;const response=await fetchPublicHttps(new Request('https://example.com',{headers:{authorization:'secret',cookie:'secret'}}),{lookup:async()=>[{address:'8.8.8.8',family:4}],requestHttps:fakeResponse(200,{},'ok',options=>pinned=options)});
  assert.equal(await response.text(),'ok');assert.equal(pinned.headers.cookie,undefined);assert.equal(pinned.headers.authorization,undefined);
  await new Promise((resolve,reject)=>pinned.lookup('example.com',{},(err,address)=>{try{assert.equal(address,'8.8.8.8');resolve();}catch(e){reject(e);}}));
  await assert.rejects(fetchPublicHttps(new Request('https://example.com'),{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],requestHttps:()=>assert.fail('must not connect')}));
  await assert.rejects(fetchPublicHttps(new Request('https://example.com'),{lookup:async()=>[{address:'8.8.8.8',family:4}],requestHttps:fakeResponse(600)}));
  await assert.rejects(fetchPublicHttps(new Request('https://example.com'),{lookup:async()=>[{address:'8.8.8.8',family:4}],requestHttps:fakeResponse(302,{location:'https://127.0.0.1/'})}));
  const abort=new AbortController();const stalled=fetchPublicHttps(new Request('https://example.com'),{signal:abort.signal,lookup:()=>new Promise(()=>{})});abort.abort();await assert.rejects(stalled);
});
