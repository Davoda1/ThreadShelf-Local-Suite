#!/usr/bin/env node
// Capture the production renderer with its bundled synthetic preview data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const input=path.resolve(process.argv[2]||path.join(root,'release',`ThreadShelf-Local-Analytics-${pkg.version}-Preview.html`));
const output=path.resolve(process.argv[3]||path.join(root,'docs/screenshots'));
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.THREADSHELF_CHROMIUM?{executablePath:process.env.THREADSHELF_CHROMIUM}:{}),args:['--no-sandbox']});
const errors=[],requests=[],captures=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC',colorScheme:'light'});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url());});
 await page.goto(pathToFileURL(input).href);
 await page.locator('.stat').first().waitFor();
 const shot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.locator('.toast').waitFor({state:'detached',timeout:8000});await page.waitForTimeout(150);await page.screenshot({path:path.join(output,name+'.png')});captures.push(name+'.png');};
 const navigate=async name=>{await page.locator(`[data-action="navigate"][data-workspace="${name}"]`).click();await page.locator('#workspace-scroll').evaluate(el=>el.scrollTop=0);};
 for(const theme of ['light','dark']){
  await page.locator('[data-action="settings"]').click();
  await page.locator('.dialog select[name="appearance"]').selectOption(theme);
  await page.locator('.dialog select[name="timezone"]').selectOption('UTC');
  await page.locator('.dialog button[type="submit"]').click();
  await page.locator('.dialog').waitFor({state:'detached'});
  await navigate('overview');
  await shot('analytics-overview-'+theme);
  await navigate('explorer');
  await page.locator('[data-action="explorer-subview"][data-subview="distributions"]').click();
  await shot('analytics-explorer-'+theme);
  await page.locator('[data-action="explorer-subview"][data-subview="relationships"]').click();
  await shot('analytics-relationships-'+theme);
  await navigate('overview');
  await page.locator('.stat[data-category="response"]').click();
  await page.locator('.evidence-card').first().waitFor();
  await shot('analytics-evidence-'+theme);
  await page.locator('[data-action="close-evidence"]').click();
  await navigate('settings');
  await shot('analytics-settings-'+theme);
  await page.locator('[data-action="settings"]').click();
  await shot('analytics-appearance-'+theme);
  await page.locator('.dialog [data-action="close-dialog"]').first().click();
 }
 await navigate('overview');
 await page.setViewportSize({width:680,height:540});
 await shot('analytics-compact-dark');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const report={application:pkg.productName,version:pkg.version,method:'Production renderer and calculation worker with bundled synthetic preview bridge; native dialogs and external archives are not exercised.',runtime:{chromium:browser.version()},viewport:{width:1440,height:1000},compactViewport:{width:680,height:540},timezone:'UTC',captures,pageErrors:errors,externalRequests:requests};
 await fs.writeFile(path.join(output,'capture.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
