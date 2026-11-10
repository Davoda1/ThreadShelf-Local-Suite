'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
module.exports=async function(playwright,width=1100,height=780){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tsa-html-preview-electron-'));
 const entry=path.join(directory,'main.cjs');
 await fs.writeFile(entry,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory,'profile'))});app.whenReady().then(()=>{const win=new BrowserWindow({width:${width},height:${height},useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});win.loadURL('about:blank');});app.on('window-all-closed',()=>app.quit());`);
 let application;
 try {application=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:[entry],chromiumSandbox:process.env.TSA_TEST_NO_SANDBOX!=='1',env:{...process.env},timeout:30000});const page=await application.firstWindow();return {newPage:async()=>page,close:async()=>{await application.close();await fs.rm(directory,{recursive:true,force:true});}};}
 catch(e){if(application)await application.close();await fs.rm(directory,{recursive:true,force:true});throw e;}
};
