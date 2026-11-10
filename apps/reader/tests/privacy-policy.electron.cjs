/* Explicit native privacy acceptance: actual Electron reporter, local capture
 * server, attempted activation/tampering, and a deliberately crashed renderer.
 * No production files, real profiles or remote services are used. */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { _electron } = require(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-privacy-'));
  const captured = [];
  const server = http.createServer((request, response) => {
    captured.push({ method: request.method, path: request.url });
    request.resume(); response.writeHead(204).end();
  });
  let app;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const sink = `http://127.0.0.1:${server.address().port}/crash-report`;
    const helper = path.resolve(process.env.THREADSHELF_PRIVACY_HELPER || path.join(__dirname, '../src/desktop/privacy-policy.cjs'));
    const main = path.join(temporary, 'main.cjs');
    await fs.writeFile(main, `
      'use strict';
      const {app,BrowserWindow,crashReporter}=require('electron');
      const fs=require('node:fs/promises');
      const path=require('node:path');
      app.setPath('userData',${JSON.stringify(path.join(temporary, 'profile'))});
      app.setPath('crashDumps',${JSON.stringify(path.join(temporary, 'crashes'))});
      let nativeStarts=0,nativeUploadChanges=0;
      const originalStart=crashReporter.start,originalUpload=crashReporter.setUploadToServer;
      crashReporter.start=function(...args){nativeStarts++;return originalStart.apply(this,args);};
      crashReporter.setUploadToServer=function(...args){nativeUploadChanges++;return originalUpload.apply(this,args);};
      require(${JSON.stringify(helper)}).enforcePrivacy(crashReporter);
      async function files(directory){try{const result=[];for(const e of await fs.readdir(directory,{withFileTypes:true})){const p=path.join(directory,e.name);if(e.isDirectory())result.push(...await files(p));else result.push(p);}return result;}catch(e){if(e.code==='ENOENT')return [];throw e;}}
      app.whenReady().then(async()=>{
        const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
        await w.loadURL('data:text/html,<title>Privacy acceptance</title>');
        globalThis.__runPrivacyProbe=async()=>{
          const guards=[];
          for(const [owner,r] of [['electron',crashReporter],['process',process.crashReporter]]){
            if(!r)continue;
            r.start?.({submitURL:${JSON.stringify(sink)},uploadToServer:true});r.setUploadToServer?.(true);
            for(const name of ['start','setUploadToServer']){
              if(typeof r[name]!=='function')continue;
              const d=Object.getOwnPropertyDescriptor(r,name);
              guards.push({owner,name,functionName:r[name].name,writable:d.writable,configurable:d.configurable,
                reassigned:Reflect.set(r,name,()=>{}),redefined:Reflect.defineProperty(r,name,{value:()=>{}}),deleted:Reflect.deleteProperty(r,name)});
            }
          }
          const before=await files(app.getPath('crashDumps'));
          const gone=new Promise(resolve=>w.webContents.once('render-process-gone',(_event,details)=>resolve(details)));
          w.webContents.forcefullyCrashRenderer();
          const crash=await gone;
          await new Promise(resolve=>setTimeout(resolve,1000));
          return {node:process.versions.node,electron:process.versions.electron,guards,nativeStarts,nativeUploadChanges,
            mainAliasSame:require('electron/main').crashReporter===crashReporter,uploadToServer:crashReporter.getUploadToServer(),
            processReporterPresent:Boolean(process.crashReporter),environment:Object.fromEntries(['ORT_DISABLE_TELEMETRY','HF_HUB_DISABLE_TELEMETRY','DO_NOT_TRACK'].map(k=>[k,process.env[k]])),
            rendererCrashReason:crash.reason,crashFilesBefore:before,crashFilesAfter:await files(app.getPath('crashDumps'))};
        };
      });
    `);
    const env = { ...process.env, ORT_DISABLE_TELEMETRY: '0', HF_HUB_DISABLE_TELEMETRY: '0', DO_NOT_TRACK: '0' };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({chromiumSandbox:true,
      executablePath: process.env.THREADSHELF_ELECTRON || path.join(__dirname, '../node_modules/electron/dist/electron'),
      args: ['--disable-gpu', main], env, timeout: 30000,
    });
    await app.firstWindow();
    const report = await app.evaluate(async () => {
      while (!globalThis.__runPrivacyProbe) await new Promise(resolve => setTimeout(resolve, 10));
      return globalThis.__runPrivacyProbe();
    });
    assert.equal(report.mainAliasSame, true);
    assert.equal(report.uploadToServer, false);
    assert.equal(report.nativeStarts, 0);
    assert.equal(report.nativeUploadChanges, 0);
    assert.ok(report.guards.length >= 2);
    for (const guard of report.guards) {
      assert.equal(guard.functionName, 'reportingDisabled');
      for (const key of ['writable', 'configurable', 'reassigned', 'redefined', 'deleted']) assert.equal(guard[key], false);
    }
    assert.deepEqual(Object.values(report.environment), ['1', '1', '1']);
    assert.equal(report.rendererCrashReason, 'crashed');
    assert.deepEqual(report.crashFilesBefore, []);
    assert.deepEqual(report.crashFilesAfter, []);
    assert.deepEqual(captured, []);
    Object.assign(report, { privacyHelperSHA256:createHash('sha256').update(await fs.readFile(helper)).digest('hex'), passed: true, captureRequests: captured, inheritedReportingPreferencesOverridden: true,
      limits: ['Linux native execution; Windows was not executed.', 'Captures attempted crash-report uploads to the local test sink; not an operating-system network audit.'] });
    if (process.env.THREADSHELF_PRIVACY_REPORT) await fs.writeFile(process.env.THREADSHELF_PRIVACY_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app?.close().catch(() => {});
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
