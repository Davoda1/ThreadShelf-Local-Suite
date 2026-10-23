'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {allowRendererRequest,imageRequestHeaders,imageResponseHeaders}=require('../core/image-policy.cjs');
test('renderer network allowlist admits only credential-free HTTP(S) images',()=>{
 for(const protocol of ['http:','https:'])assert.equal(allowRendererRequest({url:protocol+'//images.example.test/image.png',resourceType:'image'}),true);
 for(const resourceType of ['script','stylesheet','xhr','webSocket','mainFrame','subFrame','other'])assert.equal(allowRendererRequest({url:'https://images.example.test/a',resourceType}),false);
 for(const url of ['https://user:secret@images.example.test/a','http://user@images.example.test/a','ftp://images.example.test/a','ws://images.example.test/a','https://[invalid'])assert.equal(allowRendererRequest({url,resourceType:'image'}),false);
 for(const url of ['file:///app/renderer/index.html','data:image/png;base64,AAAA'])assert.equal(allowRendererRequest({url,resourceType:'image'}),true);
});
test('remote image headers strip ambient credentials, referrer and response cookies without mutating inputs',()=>{
 const request={url:'https://images.example.test/a',resourceType:'image',requestHeaders:{Cookie:'session=private',AUTHORIZATION:'Bearer private','Proxy-Authorization':'private',ReFeReR:'https://private.example.test/',Accept:'image/png','User-Agent':'Example'}};
 const before=structuredClone(request);assert.deepEqual(imageRequestHeaders(request),{Accept:'image/png','User-Agent':'Example'});assert.deepEqual(request,before);
 const response={url:request.url,resourceType:'image',responseHeaders:{'Set-Cookie':['session=private; Secure'],'SET-COOKIE2':['other=private'],'Content-Type':['image/png'],'Content-Length':['42']}};
 const responseBefore=structuredClone(response);assert.deepEqual(imageResponseHeaders(response),{'Content-Type':['image/png'],'Content-Length':['42']});assert.deepEqual(response,responseBefore);
 assert.equal(imageRequestHeaders({...request,resourceType:'xhr'}),request.requestHeaders);assert.equal(imageResponseHeaders({...response,resourceType:'xhr'}),response.responseHeaders);
});
