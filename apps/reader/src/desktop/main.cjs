const {app,BrowserWindow,ipcMain,dialog,shell,screen,Menu,session,clipboard,nativeTheme}=require('electron');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Worker}=require('node:worker_threads');
const {pathToFileURL}=require('node:url');
const {isTrustedMainFrame}=require('./trusted-entry.cjs');

app.setName('ThreadShelf Local Reader');
const dataDir=process.env.THREADSHELF_READER_TEST_DATA || path.join(process.platform==='win32'?(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming')):(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config')),'ThreadShelf Local Reader');
for(const directory of [dataDir,...['chromium','logs','crash-reports'].map(name=>path.join(dataDir,name))])fs.mkdirSync(directory,{recursive:true,mode:0o700});
app.setPath('userData',dataDir);
app.setPath('sessionData',path.join(dataDir,'chromium'));
app.setPath('logs',path.join(dataDir,'logs'));
app.setPath('crashDumps',path.join(dataDir,'crash-reports'));
const root=path.resolve(__dirname,'../..');
const page=path.join(root,'dist','index.html');
const pageUrl=pathToFileURL(page).href;
let win,worker,sequence=0,quitting=false,workerFailure=null;
let startupHoliday=Promise.resolve({isHoliday:false});
const pending=new Map();const selectedPaths=new Set();const selectedBackups=new Set();
function failWorker(error){workerFailure=error;for(const p of pending.values())p.reject(error);pending.clear();}
function request(action,args={}){return new Promise((resolve,reject)=>{if(!worker||workerFailure){reject(workerFailure||new Error('The archive worker is not available.'));return;}const id=++sequence;pending.set(id,{resolve,reject});try{worker.postMessage({id,action,args});}catch(error){pending.delete(id);reject(error);}});}
const dialogLabels={
  en:{importTitle:'Import AI exports',exports:'AI exports',all:'All files',markdown:'Markdown',json:'JSON'},
  hu:{importTitle:'AI-exportok importálása',exports:'AI-exportok',all:'Minden fájl',markdown:'Markdown',json:'JSON'},
  de:{importTitle:'KI-Exporte importieren',exports:'KI-Exporte',all:'Alle Dateien',markdown:'Markdown',json:'JSON'},
  ja:{importTitle:'AIエクスポートをインポート',exports:'AIエクスポート',all:'すべてのファイル',markdown:'Markdown',json:'JSON'},
  fr:{importTitle:'Importer des exports IA',exports:'Exports IA',all:'Tous les fichiers',markdown:'Markdown',json:'JSON'},
};
function bounds(){
  let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(dataDir,'window.json'),'utf8'));}catch{}
  const displays=screen.getAllDisplays();const available=displays.find(d=>saved.x<d.workArea.x+d.workArea.width&&saved.x+(saved.width||0)>d.workArea.x&&saved.y<d.workArea.y+d.workArea.height&&saved.y+(saved.height||0)>d.workArea.y)||screen.getPrimaryDisplay();
  const a=available.workArea;const width=Math.max(680,Math.min(Number(saved.width)||1320,a.width));const height=Math.max(540,Math.min(Number(saved.height)||880,a.height));
  return {width,height,x:Math.max(a.x,Math.min(Number.isFinite(saved.x)?saved.x:a.x+Math.round((a.width-width)/2),a.x+a.width-width)),y:Math.max(a.y,Math.min(Number.isFinite(saved.y)?saved.y:a.y+Math.round((a.height-height)/2),a.y+a.height-height)),maximized:!!saved.maximized,fullscreen:!!saved.fullscreen};
}
function saveWindow(){
  if(!win||win.isDestroyed())return;const b=win.getNormalBounds();const value={...b,maximized:win.isMaximized(),fullscreen:win.isFullScreen()};
  try{fs.mkdirSync(dataDir,{recursive:true,mode:0o700});const temp=path.join(dataDir,'window.json.tmp');fs.writeFileSync(temp,JSON.stringify(value)+'\n',{mode:0o600});fs.renameSync(temp,path.join(dataDir,'window.json'));}catch(e){console.error('Window state:',e.message);}
}
function external(value){let u;try{u=new URL(value);}catch{throw new Error('Invalid link.');}if(!['http:','https:','mailto:'].includes(u.protocol)||u.username||u.password)throw new Error('This link type is not allowed.');return shell.openExternal(u.href);}
function markdown(thread){
  const title=String(thread.title||'Conversation');return '# '+title+'\n\n'+thread.turns.map(t=>{const role=Object.hasOwn(t,'user')?'User':Object.hasOwn(t,'thinking')?'Thinking':t.source_role==='tool'?'Tool':t.source_role==='system'?'System':'Assistant';return '## '+role+(t.model?' · '+t.model:'')+'\n\n'+String(t.user??t.thinking??t.ai??'');}).join('\n\n---\n\n')+'\n';
}
async function invoke(action,args){
  if(typeof action==='string'&&action.startsWith('resources.')){
    const {validateResourceRequest}=await import('../core/resource-requests.mjs');
    validateResourceRequest(action,args);
    return request(action,args);
  }
  if(action==='bootstrap'){
    const [result,holiday]=await Promise.all([request(action,args),startupHoliday]);
    // Only the decorative decision crosses IPC; native country/date diagnostics stay in main.
    return {...result,holidayStatus:{isHoliday:holiday.isHoliday===true}};
  }
  if(action==='app.about')return {name:app.getName(),version:app.getVersion(),electron:process.versions.electron,node:process.versions.node,platform:process.platform,dataDir};
  if(action==='clipboard.write'){
    if(typeof args?.text!=='string')throw new Error('Clipboard text must be a string.');
    if(Buffer.byteLength(args.text,'utf8')>16*1024*1024)throw new Error('Clipboard text exceeds 16 MiB. Export the conversation instead.');
    // Windows plain-text clipboard strings are NUL-terminated; reject rather than silently lose text.
    if(args.text.includes('\0'))throw new Error('Clipboard text contains a NUL character. Export the conversation instead.');
    clipboard.writeText(args.text,'clipboard');return {ok:true};
  }
  if(action==='app.openData'){const error=await shell.openPath(dataDir);if(error)throw new Error(error);return {ok:true};}
  if(action==='app.openServerSupport'){const directory=path.join(root,'server-support');if(!fs.existsSync(directory))throw new Error('Server setup files are missing. Extract the complete application package.');const error=await shell.openPath(directory);if(error)throw new Error(error);return {ok:true};}
  if(action==='external.open'){await external(args.url);return {ok:true};}
  if(action==='import.pick'){
    const {settings}=await request('bootstrap');const {resolveImportDirectory}=await import('../core/state.mjs');const fallback=await resolveImportDirectory(settings);
    const labels=dialogLabels[settings.language]||dialogLabels.en;
    const result=await dialog.showOpenDialog(win,{title:labels.importTitle,defaultPath:fallback.path,properties:args.kind==='folder'?['openDirectory']:['openFile','multiSelections'],filters:args.kind==='folder'?undefined:[{name:labels.exports,extensions:['json','zip','html','htm']},{name:labels.all,extensions:['*']}]});
    if(result.canceled)return {paths:[],notice:fallback.notice};
    for(const p of result.filePaths)selectedPaths.add(p);
    const lastDirectory=args.kind==='folder'?result.filePaths[0]:path.dirname(result.filePaths[0]);await request('settings.save',{values:{lastDirectory}});
    return {paths:result.filePaths,notice:fallback.notice};
  }
  if(action==='import.paths'&&(!Array.isArray(args.paths)||args.paths.some(p=>!selectedPaths.has(p))))throw new Error('Select import paths using the file picker first.');
  if(action==='manager.backup'){
    const {settings}=await request('bootstrap');
    const titles={en:'Save Local archive backup',hu:'Helyi archívum biztonsági mentése',de:'Lokale Archivsicherung speichern',fr:'Enregistrer une sauvegarde locale',ja:'ローカルアーカイブのバックアップを保存'};
    const result=await dialog.showSaveDialog(win,{title:titles[settings.language]||titles.en,defaultPath:'ThreadShelf-Local-Backup-'+new Date().toISOString().slice(0,10)+'.zip',filters:[{name:settings.language==='ja'?'ThreadShelfバックアップ（ZIP64）':'ThreadShelf backup (ZIP64)',extensions:['zip']}]});
    if(result.canceled||!result.filePath)return {cancelled:true};
    const relative=path.relative(dataDir,result.filePath);
    if(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw new Error('Save an external backup outside the application data folder.');
    return request('manager.backup',{path:result.filePath,includeIndex:args.includeIndex===true});
  }
  if(action==='manager.restore.pick'){
    const {settings}=await request('bootstrap');
    const titles={en:'Select Local archive backup',hu:'Helyi biztonsági mentés kiválasztása',de:'Lokale Archivsicherung auswählen',fr:'Choisir une sauvegarde locale',ja:'ローカルアーカイブのバックアップを選択'};
    const result=await dialog.showOpenDialog(win,{title:titles[settings.language]||titles.en,properties:['openFile'],filters:[{name:settings.language==='ja'?'ThreadShelfバックアップ（ZIP64）':'ThreadShelf backup (ZIP64)',extensions:['zip']}]});
    if(result.canceled||!result.filePaths.length)return {cancelled:true};
    const filename=result.filePaths[0];const preview=await request('manager.restore.preview',{path:filename});selectedBackups.clear();selectedBackups.add(filename);return preview;
  }
  if(action==='manager.restore'){
    if(typeof args.path!=='string'||!selectedBackups.has(args.path))throw new Error('Select and validate a backup using the file picker first.');
    const result=await request('manager.restore',{path:args.path});selectedBackups.delete(args.path);return result;
  }
  if(action==='export.conversation'){
    if(!args.thread||!Array.isArray(args.thread.turns)||!['md','json'].includes(args.format))throw new Error('Invalid conversation export.');
    const base=String(args.thread.title||'Conversation').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,140)||'Conversation';
    const {settings}=await request('bootstrap');const labels=dialogLabels[settings.language]||dialogLabels.en;
    const output=await dialog.showSaveDialog(win,{defaultPath:base+'.'+args.format,filters:[{name:args.format==='md'?labels.markdown:labels.json,extensions:[args.format]}]});
    if(output.canceled||!output.filePath)return {cancelled:true};
    await fsp.writeFile(output.filePath,args.format==='md'?markdown(args.thread):JSON.stringify(args.thread,null,2)+'\n');return {saved:true,path:output.filePath};
  }
  if(action==='activity.export'){
    const {settings}=await request('bootstrap');
    const titles={en:'Export Local activity',hu:'Helyi aktivitás exportálása',de:'Lokale Aktivität exportieren',fr:'Exporter l’activité locale',ja:'ローカルアクティビティをエクスポート'};
    const output=await dialog.showSaveDialog(win,{title:titles[settings.language]||titles.en,defaultPath:'ThreadShelf-Activity-'+new Date().toISOString().slice(0,10)+'.csv',filters:[{name:'CSV',extensions:['csv']}]});
    if(output.canceled||!output.filePath)return {cancelled:true};
    const {csv}=await request('activity.csv',args);await fsp.writeFile(output.filePath,csv,'utf8');return {saved:true,path:output.filePath};
  }
  const allowed=new Set(['bootstrap','settings.save','collections','files','thread','search','import.paths','operation.cancel','server.collections','server.import','reading.save','semantic.setup','semantic.index','search.status','search.prepare','ollama.models','ollama.test','ollama.start','ollama.pull','ollama.delete','storage.convert','manager.status','manager.files','manager.preview','manager.mutate','manager.maintenance','activity.query','activity.rebuild','activity.csv','activity.cancel','server.insights','server.insights.cancel']);
  if(!allowed.has(action))throw new Error('Unknown application action.');
  return request(action,args);
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.whenReady().then(async()=>{
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});Menu.setApplicationMenu(null);
  // The offline country/civil-date policy is evaluated exactly once per GUI process.
  // The Reader applies this only to an explicitly enabled welcome-page video.
  startupHoliday=import('./holiday/src/startup-holiday.mjs').then(({loadStartupHolidayStatus})=>loadStartupHolidayStatus(app)).catch(()=>({isHoliday:false}));
  worker=new Worker(path.join(__dirname,'worker.mjs'),{workerData:{dataDir}});
  worker.on('message',message=>{if(message.type==='progress'){if(win&&!win.isDestroyed())win.webContents.send('reader:progress',message.value);return;}if(message.type==='fatal'){const error=new Error(message.error);console.error('Archive startup:',message.error);failWorker(error);return;}const task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(new Error(message.error)):task.resolve(message.value);}});
  worker.on('error',failWorker);
  worker.on('exit',()=>failWorker(new Error('The archive worker stopped. Restart the application.')));
  const [{readStartupAppearance},{startupBackground}]=await Promise.all([import('./startup-appearance.mjs'),import('../core/startup-appearance.mjs')]);
  const appearance=await readStartupAppearance(dataDir);
  const b=bounds();win=new BrowserWindow({...b,minWidth:680,minHeight:540,show:false,title:'ThreadShelf Local Reader',backgroundColor:startupBackground(appearance,nativeTheme.shouldUseDarkColors),icon:path.join(root,'build',process.platform==='win32'?'icon.ico':'icons/256x256.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),additionalArguments:['--threadshelf-startup='+encodeURIComponent(JSON.stringify(appearance))],contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
  session.defaultSession.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
  win.webContents.setWindowOpenHandler(({url})=>{void external(url).catch(()=>{});return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(url!==pageUrl){event.preventDefault();void external(url).catch(()=>{});}});
  ipcMain.handle('reader:invoke',(event,action,args={})=>{if(!isTrustedMainFrame(event,win.webContents,pageUrl,{allowFragment:true}))throw new Error('Untrusted application request.');return invoke(action,args);});
  win.on('ready-to-show',()=>{if(b.maximized)win.maximize();if(b.fullscreen)win.setFullScreen(true);win.show();});
  win.on('close',saveWindow);
  await win.loadFile(page);
  if(process.env.THREADSHELF_READER_SMOKE==='1'){
    const result=await request('bootstrap');console.log('READER_SMOKE '+JSON.stringify({version:result.version,dataDir,node:process.versions.node,electron:process.versions.electron}));
  }
}).catch(e=>{console.error(e);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(quitting||!worker)return;event.preventDefault();quitting=true;saveWindow();request('shutdown').catch(error=>console.error('Archive shutdown:',error.message)).finally(async()=>{await worker.terminate().catch(()=>{});app.quit();});});
}
