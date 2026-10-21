#!/usr/bin/env node
// Exercise queued observer/frame callbacks against the real ReaderView in Chromium.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const bundled=await build({absWorkingDir:root,stdin:{contents:"export {ReaderView} from './src/reader/reader.js';",resolveDir:root},bundle:true,outdir:'lifecycle-test-bundle',format:'iife',globalName:'ReaderLifecycle',write:false,loader:{'.woff2':'dataurl','.woff':'dataurl'},logLevel:'silent'});
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.READER_CHROMIUM,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:680,height:540}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.setContent('<!doctype html><html lang="en"><head></head><body></body></html>');await page.addScriptTag({content:bundled.outputFiles.find(f=>f.path.endsWith('.js'))?.text||bundled.outputFiles[0].text});
 const result=await page.evaluate(()=>{
  const originalFrame=window.requestAnimationFrame,originalCancel=window.cancelAnimationFrame;let pending=null,scheduled=0;
  window.requestAnimationFrame=callback=>{pending=callback;scheduled++;return scheduled;};window.cancelAnimationFrame=()=>{};
  const create=()=>{const container=document.createElement('div');document.body.append(container);const reader=new ReaderLifecycle.ReaderView({container,t:key=>key,settings:{language:'en',theme:'dark',animations:false}});const content=container.querySelector('#conversationContent');content.style.height='200px';const items=[0,1].map(()=>{const item=document.createElement('button'),message=document.createElement('div');message.textContent='A synthetic message';content.append(message);container.querySelector('#navigatorEntries').append(item);return {item,message};});reader.navigatorTargets=items;return {reader,container,items};};
  const live=create();live.reader.scheduleNavigatorTracking();pending();const liveWorks=live.items.some(x=>x.item.classList.contains('active'));live.reader.destroy();live.container.remove();
  const disposed=create();disposed.reader.scheduleNavigatorTracking();const staleCallback=pending;disposed.reader.destroy();const before=scheduled;staleCallback();disposed.reader.scheduleNavigatorTracking();disposed.reader.setSettings({theme:'light'});const noNewWork=scheduled===before;disposed.container.remove();
  const replaced=create();replaced.reader.scheduleNavigatorTracking();const replacedCallback=pending;replaced.container.replaceChildren();replacedCallback();replaced.reader.destroy();replaced.container.remove();
  window.requestAnimationFrame=originalFrame;window.cancelAnimationFrame=originalCancel;return {liveWorks,noNewWork,queuedAfterDestroySafe:true,replacedDomSafe:true,lateThemeCallbackSafe:true};
 });
 assert.equal(result.liveWorks,true);assert.equal(result.noNewWork,true);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,engine:browser.version(),...result,errors},null,2));if(process.env.READER_LIFECYCLE_REPORT)await fs.writeFile(process.env.READER_LIFECYCLE_REPORT,JSON.stringify({passed:true,engine:browser.version(),...result,errors},null,2));
}finally{await browser.close();}
