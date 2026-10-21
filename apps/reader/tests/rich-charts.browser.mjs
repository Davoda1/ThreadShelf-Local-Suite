#!/usr/bin/env node
// Synthetic chart-only DOM/accessibility/layout checks. No private inputs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.READER_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:680,height:540}}),page=await context.newPage();
const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.origin!=='http://charts.test'){requests.push(u.href);return route.abort();}
 if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/src/reader/rich-charts.css"><style>body{margin:16px;font:14px sans-serif;--border-color:#555;--text-primary:#222;--text-secondary:#444}.dark{background:#17191b;--text-primary:#ddd;--text-secondary:#bbb;--border-color:#666}</style></head><body><main></main></body></html>'});
 const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep))return route.abort();
 return route.fulfill({contentType:f.endsWith('.css')?'text/css':'text/javascript',body:await fs.readFile(f)});
});
try{
 await page.goto('http://charts.test/');
 const checks=await page.evaluate(async()=>{
  const {renderChart}=await import('/src/reader/rich-charts.js');
  const samples=[];
  for(const type of ['bar','line','area','pie','doughnut']){
   const c={schema:'threadshelf-chart',version:1,type,title:`Synthetic ${type}`,categories:['First item','Second item','Third item'],series:[{label:'Measured',values:['pie','doughnut'].includes(type)?[0,3,7]:[-2.25,0,7.125],unit:'V'}]};
   if(type==='bar')c.orientation='horizontal';
   if(type==='line'){delete c.series[0].unit;c.yAxis={unit:'kg'};}
   samples.push(c);
  }
  samples.push({schema:'threadshelf-chart',version:1,type:'scatter',title:'Synthetic scatter',xAxis:{label:'Time',unit:'s'},yAxis:{label:'Voltage',unit:'V'},series:[{label:'Trial',points:[{x:-1,y:2.5,label:'Point A'},{x:3,y:-4.125,label:'Point B'}]}]});
  samples.push({chartType:'bar',meta:{title:'<img src="https://evil.test/x" onerror="window.bad=true">',description:'<script>window.bad=true</script>',footer:'Preserved footer'},xKey:'Name',series:[{dataKey:'v',label:'Value',valueSuffix:'%'}],yAxisMin:0,yAxisMax:100,data:[{Name:'<svg onload="window.bad=true">',v:52.3},{Name:'B',v:70.5}]});
  samples.push({chartType:'future',meta:{title:'Unrecognized synthetic'},xKey:'x',series:[{dataKey:'v'}],data:[{x:'A',v:2}],callback:'window.bad=true'});
  const before=JSON.stringify(samples);for(const c of samples)document.querySelector('main').append(renderChart(c,{document,t:s=>s==='Exact values'?'Exact table (test)':s}));
  const charts=[...document.querySelectorAll('.rich-chart')];
  const marks=[...document.querySelectorAll('.rich-chart-mark')];
  return {types:charts.map(c=>c.dataset.chartType||'fallback'),tables:document.querySelectorAll('table').length,headings:[...document.querySelectorAll('figcaption')].map(n=>n.textContent),rows:[...document.querySelectorAll('tbody')].map(t=>t.textContent),focusable:charts.filter(c=>!c.classList.contains('rich-chart-fallback')).every(c=>c.querySelector('.rich-chart-viewport')?.getAttribute('tabindex')==='0'&&c.querySelectorAll('.rich-chart-viewport [tabindex="0"]').length===0&&c.querySelector('[data-chart-item][tabindex="-1"]'))&&marks.every(m=>m.getAttribute('tabindex')==='-1'&&m.getAttribute('aria-label')&&!m.querySelector('title')),translated:[...document.querySelectorAll('.rich-chart-data summary')].every(n=>n.textContent==='Exact table (test)'),mutated:before!==JSON.stringify(samples),unsafe:!!window.bad||!!document.querySelector('img,script'),invalidCoords:[...document.querySelectorAll('svg *')].some(n=>[...n.attributes].some(a=>/NaN|Infinity/.test(a.value))),bodyOverflow:document.documentElement.scrollWidth>innerWidth,fallback:document.querySelector('.rich-chart-fallback pre').textContent,axisUnits:[...document.querySelectorAll('[data-chart-type=\"line\"] .rich-chart-mark')].every(n=>n.getAttribute('aria-label').endsWith(' kg')&&!n.querySelector('title'))};
 });
 assert.deepEqual(checks.types,['bar','line','area','pie','doughnut','scatter','bar','fallback']);
 assert.equal(checks.tables,7);assert.ok(checks.focusable);assert.ok(checks.translated);assert.equal(checks.mutated,false);assert.equal(checks.unsafe,false);assert.equal(checks.invalidCoords,false);assert.equal(checks.bodyOverflow,false);assert.match(checks.rows[0],/-2\.25 V/);assert.match(checks.rows[1],/-2\.25 kg/);assert.equal(checks.axisUnits,true);assert.match(checks.rows[5],/-4\.125 V/);assert.match(checks.rows[6],/52\.3%/);assert.match(checks.fallback,/"callback": "window.bad=true"/);
 await page.locator('.rich-chart-data summary').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.rich-chart-data').first().getAttribute('open'),'');
 // One viewport Tab entry plus programmatic per-item navigation avoids a
 // thousand Tab stops while exposing exact values through trusted hit targets.
 const viewport=page.locator('.rich-chart-viewport').first();await viewport.focus();
 await page.locator('.rich-chart-tooltip').waitFor({state:'visible'});
 assert.match(await page.locator('.rich-chart-tooltip').innerText(),/First item[\s\S]*Measured[\s\S]*-2\.25 V/);
 await page.keyboard.press('ArrowRight');
 assert.equal(await page.evaluate(()=>document.activeElement?.matches('.rich-chart-hit[tabindex="-1"][data-chart-item="1"]')),true);
 assert.match(await page.locator('.rich-chart-tooltip').innerText(),/Second item[\s\S]*Measured[\s\S]*0 V/);
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.matches('.rich-chart-data summary')),true);
 await page.locator('.rich-chart-hit').first().hover();
 await page.locator('.rich-chart-tooltip').waitFor({state:'visible'});
 assert.match(await page.locator('.rich-chart-tooltip').innerText(),/First item[\s\S]*Measured[\s\S]*-2\.25 V/);
 assert.equal(await page.locator('.rich-chart').first().locator('.rich-chart-mark.is-active').count(),1);
 assert.equal(await page.locator('.rich-chart-tooltip .rich-chart-swatch.rich-chart-color-0').count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.rich-chart-tooltip').count(),0);
 await page.locator('.rich-chart-mark').first().focus();assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('rich-chart-mark')),true);
 for(const [width,height]of [[680,540],[700,1200],[1500,540]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:680,height:540});await page.evaluate(()=>document.body.classList.add('dark','reader-high-contrast'));
 if(process.env.READER_CHART_SCREENSHOT)await page.screenshot({path:process.env.READER_CHART_SCREENSHOT,fullPage:true});
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,...checks,externalRequests:requests.length,pageErrors:errors.length,viewports:3,viewportTabEntryAndProgrammaticItemNavigation:true,customPointerAndKeyboardTooltips:true,zeroValueReachable:true,escapeDismissal:true},null,2));
}finally{await browser.close();}
