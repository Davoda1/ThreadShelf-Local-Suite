'use strict';
// Run the existing isolated renderer fixtures in the actual dependency-rebuild
// Electron runtime. This harness never changes shipped application files.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
module.exports = async function electronPage(playwright, width, height) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tsa-renderer-rebuild-'));
  const wrapper = path.join(temporary, 'main.cjs');
  await fs.writeFile(wrapper, `const {app,BrowserWindow}=require('electron');
app.whenReady().then(()=>{const win=new BrowserWindow({width:${width},height:${height},useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});win.loadURL('about:blank');});
app.on('window-all-closed',()=>app.quit());`);
  let electron;
  try {
    electron = await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,
      args:['--no-sandbox',...(process.env.READER_HEADLESS==='1'?['--ozone-platform=headless','--ozone-override-screen-size=1920,1080']:[]),wrapper],
      env:{...process.env,XDG_CONFIG_HOME:path.join(temporary,'config'),XDG_CACHE_HOME:path.join(temporary,'cache')}, timeout:30000});
    const page = await electron.firstWindow();
    return {newPage:async()=>page, close:async()=>{await electron.close();await fs.rm(temporary,{recursive:true,force:true});}};
  } catch (error) {
    if(electron)await electron.close();
    await fs.rm(temporary,{recursive:true,force:true});
    throw error;
  }
};
