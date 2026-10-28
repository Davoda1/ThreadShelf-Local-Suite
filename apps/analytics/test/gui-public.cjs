/* Public manual captures of the exact compiled renderer and its synthetic demo.
 * Run after build + scripts/preview.mjs; no Reader profile is accessed.
 * ANALYTICS_BROWSER_PATH may select an installed Chromium executable.
 * ANALYTICS_PLAYWRIGHT may select an installed Playwright package.
 */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.ANALYTICS_PLAYWRIGHT||'playwright');
const project=path.resolve(__dirname,'..');const expectedVersion=require('../package.json').version;
const preview=path.resolve(process.argv[2]||path.join(project,`release/ThreadShelf-Local-Analytics-${expectedVersion}-Preview.html`));
const out=path.resolve(process.argv[3]||path.join(project,'.verification/screenshots'));
const facts={application:'ThreadShelf Local Analytics',version:expectedVersion,syntheticOnly:true,renderer:'Exact production renderer in Chromium; browser preview bridge',screenshots:[],layouts:[],pageErrors:[],networkRequests:[]};
(async()=>{let browser;try{
 await fs.mkdir(out,{recursive:true});
 browser=await chromium.launch({headless:true,...(process.env.ANALYTICS_BROWSER_PATH?{executablePath:process.env.ANALYTICS_BROWSER_PATH}:{}),...(process.getuid?.()===0?{args:['--no-sandbox']}: {})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC',locale:'en-US',colorScheme:'light'}),page=await context.newPage();
 page.on('pageerror',e=>facts.pageErrors.push(e.message));
 page.on('request',r=>{if(!/^(file:|data:|blob:)/.test(r.url()))facts.networkRequests.push(r.url().split('?')[0]);});
 await page.goto(pathToFileURL(preview).href);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#analytics-boot')&&document.querySelector('.shell')&&!/Loading|Calculating/.test(document.querySelector('.footer')?.textContent||''),null,{timeout:60000});
 await ready();assert.match(await page.locator('.topbar').innerText(),new RegExp('\\b'+expectedVersion.replaceAll('.', '\\.')+'\\b'));
 async function appearance(mode){await page.locator('[data-action="settings"]').click();for(const [key,value]of Object.entries({appearance:mode,uiPalette:'default',timezone:'UTC',language:'en'}))await page.locator('.dialog #appearance-form [name="'+key+'"]').selectOption(value);await page.locator('.dialog #appearance-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('.dialog #appearance-form'));await ready();await page.locator('.toast').evaluateAll(ns=>ns.forEach(n=>n.remove()));}
 async function workspace(name){await page.locator('[data-workspace="'+name+'"]').click();await ready();await page.locator('.content').evaluate(n=>n.scrollTop=0);}
 async function capture(name){await page.mouse.move(2,2);await page.evaluate(()=>document.activeElement?.blur());await page.waitForTimeout(150);const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,bodyWidth:document.body.scrollWidth,bodyHeight:document.body.scrollHeight,documentScroll:document.documentElement.scrollTop,htmlOverflow:getComputedStyle(document.documentElement).overflow}));facts.layouts.push({name,...geometry});assert(geometry.bodyWidth<=geometry.width+1);assert(geometry.bodyHeight<=geometry.height+1);assert.equal(geometry.htmlOverflow,"hidden");assert.equal(geometry.documentScroll,0);await page.screenshot({path:path.join(out,name+'.png')});facts.screenshots.push(name+'.png');}
 for(const mode of ['light','dark']){
  await appearance(mode);await workspace('overview');await capture('analytics-overview-'+mode);
  await page.locator('.stat[data-category="response"]').first().click();await page.waitForSelector('.evidence-panel .evidence-card');await capture('analytics-evidence-'+mode);await page.locator('[data-action="close-evidence"]').click();
  await workspace('explorer');await page.locator('[data-action="explorer-subview"][data-subview="distributions"]').click();await ready();await capture('analytics-explorer-'+mode);
  await page.locator('[data-action="explorer-subview"][data-subview="relationships"]').click();await ready();await page.locator('[data-explorer-chart-select]').selectOption('13-prompt-reply');await ready();await capture('analytics-relationships-'+mode);
  await workspace('settings');await capture('analytics-settings-'+mode);
  await page.locator('[data-action="settings"]').click();await capture('analytics-appearance-'+mode);await page.locator('.dialog #appearance-form button[type="submit"]').click();await ready();
 }
 await page.setViewportSize({width:680,height:540});await workspace('overview');await capture('analytics-compact-dark');
 assert.deepEqual(facts.pageErrors,[]);assert.deepEqual(facts.networkRequests,[]);facts.result='PASS';facts.browser=browser.version();
}catch(e){facts.result='FAIL';facts.failure=e.stack;process.exitCode=1;console.error(e);}finally{await browser?.close();await fs.writeFile(path.join(out,'capture-report.json'),JSON.stringify(facts,null,2)+'\n');console.log(JSON.stringify({result:facts.result,screenshots:facts.screenshots.length,pageErrors:facts.pageErrors}));}})();
