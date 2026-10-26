'use strict';
// native integration: real IPC and reload from a special-character POSIX path.
// Synthetic profile only; Windows path semantics are covered by node:test.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const pw=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const report={version:'1.2.0',platform:process.platform,passed:false,checks:[],errors:[],limitations:['Native Windows execution is not claimed.','Root headless launch uses test-only --no-sandbox; optional single-instance stub stays in the temporary wrapper.']};
let temp,electron;
(async()=>{
 assert.equal(process.platform,'linux','This native path test uses POSIX filename semantics.');
 temp=await fs.mkdtemp(path.join(os.tmpdir(),'alternative-path-'));
 const appPath=path.join(temp,"Package A~1 # 100% Árvíz 日本 ' slash\\name");
 const source=path.resolve(process.env.TSA_APP_PATH||root);
 await fs.mkdir(appPath,{recursive:true});
 for(const name of ['package.json','main.cjs','preload.cjs','core','renderer','vendor','assets'])await fs.cp(path.join(source,name),path.join(appPath,name),{recursive:true});
 const wrapper=path.join(temp,'qa-main.cjs');
 await fs.writeFile(wrapper,`const e=require('electron');${process.env.TSA_TEST_NO_UNIX_SOCKETS==='1'?'e.app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(appPath,'main.cjs'))});`);
 electron=await pw._electron.launch({executablePath:process.env.ELECTRON_PATH,args:['--no-sandbox',wrapper],env:{...process.env,XDG_CONFIG_HOME:path.join(temp,'config'),XDG_CACHE_HOME:path.join(temp,'cache')},timeout:30000});
 const page=await electron.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));
 await page.waitForSelector('#app[data-ready="true"]');
 const info=await page.evaluate(()=>alternative.getInfo());assert.equal(info.version,'1.2.0');assert.equal(Object.hasOwn(info,'revision'),false);assert.ok(info.profile.startsWith(temp));
 report.electron=info.electron;report.expectedURL=pathToFileURL(path.join(appPath,'renderer/index.html')).href.replace(pathToFileURL(temp).href,'file:///TEMP');report.actualURL=page.url().replace(pathToFileURL(temp).href,'file:///TEMP');
 report.checks.push('Real sandboxed preload and native IPC accept a path with spaces, tilde, #, %, Unicode, apostrophe and literal POSIX backslash.');
 await page.click('#settings-button');
 await page.click('#theme-choices [data-theme="dark"]');await page.selectOption('#image-mode','auto');
 await page.locator('#settings-dialog .dialog-footer [data-close]').click();
 await page.evaluate(()=>window.TSAFlush());
 const beforeReload=await page.evaluate(()=>alternative.loadState());assert.equal(beforeReload.theme,'dark');assert.equal(beforeReload.imageMode,'auto');
 await page.reload();await page.waitForSelector('#app[data-ready="true"]');
 const saved=await page.evaluate(()=>alternative.loadState());assert.equal(saved.theme,'dark');assert.equal(saved.imageMode,'auto');
 report.checks.push('State save, startup theme and reload IPC remain functional under the same special path.');
 await page.click('#welcome-demo');await page.waitForSelector('#thread-content .tsa-message');
 await page.click('#settings-button');assert.match(await page.locator('.about-line').innerText(),/1\.2\.0\b/);
 assert.equal(await page.title(),'ThreadShelf Local Alternative');
 report.checks.push('Demo and Settings load with identity and unchanged native title.');
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.failure=e.stack;process.exitCode=1;}).finally(async()=>{
 if(electron)await electron.close();if(temp)await fs.rm(temp,{recursive:true,force:true});
 const out=process.env.TSA_PATH_REPORT||path.join(root,'docs/verification/native-path.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
});
