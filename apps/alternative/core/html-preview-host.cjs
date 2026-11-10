const { randomUUID } = require('node:crypto');
const path = require('node:path');
const dns = require('node:dns/promises');
const net = require('node:net');
const { publicAddress, publicUrl, fetchPublicHttps, previewCsp } = require('./html-preview-network.cjs');
const SECURITY_HEADERS = { 'permissions-policy': 'camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), display-capture=(), fullscreen=(), usb=(), serial=(), hid=(), payment=(), autoplay=(), browsing-topics=()', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
function bounds(input, maximum) {
  if (!input || !['x','y','width','height'].every(k => Number.isFinite(input[k]))) throw new Error('Invalid preview bounds.');
  const b = Object.fromEntries(Object.entries(input).filter(([key]) => ['x','y','width','height'].includes(key)).map(([key,value]) => [key,Math.round(value)]));
  if (b.x < 0 || b.y < 0 || b.width < 1 || b.height < 1 || b.width > maximum.width || b.height > maximum.height || b.x + b.width > maximum.width + 1 || b.y + b.height > maximum.height + 1) throw new Error('Preview bounds exceed the application view.');
  return b;
}
function createHtmlPreviewHost({ getWindow, getExternalEnabled = () => true, openExternal, onEvent = () => {}, electron = require('electron') }) {
  const entries = new Map(); let serial = Promise.resolve(), disposed = false, generation=0; const versions=new Map();
  const notify = (id, state, message) => onEvent({ id, state, ...(message ? { message } : {}) });
  function close(id, invalidate=true) {
    if(invalidate)versions.set(id,(versions.get(id)||0)+1);
    const entry = entries.get(id); if (!entry) return;
    entries.delete(id); entry.abort.abort();
    try { getWindow()?.contentView.removeChildView(entry.view); } catch {}
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close({ waitForBeforeUnload: false });
    try { entry.session.protocol.unhandle('https'); } catch {}
    void entry.session.closeAllConnections().catch(() => {});
    void entry.session.clearStorageData().catch(() => {});
    notify(id, 'closed');
  }
  function closeAll() { generation++; for (const id of [...entries.keys()]) close(id); }
  async function clickedLink(event, value) {
    const entry = [...entries.values()].find(item => item.view.webContents === event.sender);
    if (!entry || !event.senderFrame || event.senderFrame !== entry.view.webContents.mainFrame || !entry.external || typeof value !== 'string') return;
    const url = publicUrl(value); if (!url) return;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    try {
      const addresses = net.isIP(host) ? [{address:host}] : await dns.lookup(host, {all:true,verbatim:true});
      if (!addresses.length || addresses.some(item => !publicAddress(item.address)) || !entries.has(entry.id)) return;
      await openExternal?.(url.href);
    } catch { /* Invalid/unavailable links remain inside the preview. */ }
  }
  electron.ipcMain.on('html-preview:link', clickedLink);
  async function open(args, stamp) {
    const current=()=>!disposed&&generation===stamp.generation&&versions.get(args.id)===stamp.version;
    if(!current())return {cancelled:true};
    if (disposed || typeof args?.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(args.id) || typeof args?.source !== 'string') throw new Error('Invalid HTML preview request.');
    const { validHtmlPreview } = require('./html-preview-validation.cjs');
    if (!validHtmlPreview(args.source, args.language)) throw new Error('This code block is not a complete valid HTML page.');
    const owner = getWindow(); if (!owner || owner.isDestroyed()) throw new Error('The application window is unavailable.');
    const currentBounds = bounds(args.bounds, owner.getContentBounds());
    if(!current())return {cancelled:true};
    close(args.id,false); if (entries.size >= 4) throw new Error('Close another HTML preview before opening this one.');
    const id = args.id, external = (await getExternalEnabled()) === true && args.external !== false;
    const ses = electron.session.fromPartition('html-preview-' + randomUUID(), { cache: false });
    // Every real HTTPS transfer is handled below by a public-IP-pinned native request.
    // This proxy deliberately makes all Chromium-network fallbacks fail closed.
    await ses.setProxy({ mode:'fixed_servers', proxyRules:'http=127.0.0.1:9;https=127.0.0.1:9', proxyBypassRules:'<-loopback>' });
    if(!current())return {cancelled:true};
    ses.setPermissionRequestHandler((_wc,_p,callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.setDevicePermissionHandler(() => false);
    ses.setSpellCheckerEnabled(false);
    ses.on('will-download', event => event.preventDefault());
    const abort = new AbortController();
    const documentUrl = `https://${randomUUID()}.preview.invalid/document.html`;
    const blocked = () => new Response('Resource blocked by HTML preview policy.', { status:403, headers:{'content-type':'text/plain',...SECURITY_HEADERS} });
    let activeRequests=0,totalRequests=0,totalBytes=0;
    ses.protocol.handle('https', async request => {
      if (abort.signal.aborted) return blocked();
      if (request.url === documentUrl && request.method === 'GET') return new Response(args.source, { headers:{...SECURITY_HEADERS,'content-type':'text/html; charset=utf-8','content-security-policy':previewCsp(external)} });
      if (!external || activeRequests>=8 || totalRequests>=128 || totalBytes>=128*1024*1024) return blocked();
      activeRequests++;totalRequests++;
      try { return await fetchPublicHttps(request, {signal:abort.signal,onBytes:bytes=>{totalBytes+=bytes;return totalBytes<=128*1024*1024;}}); } catch { return blocked(); } finally { activeRequests--; }
    });
    ses.webRequest.onBeforeRequest((details, callback) => {
      const initial = details.url === documentUrl && details.resourceType === 'mainFrame';
      const embedded = ['image','font','media'].includes(details.resourceType) && /^(?:data|blob):/.test(details.url);
      callback({ cancel: !(initial || embedded || external && details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame' && details.resourceType !== 'webSocket' && publicUrl(details.url)) });
    });
    const view = new electron.WebContentsView({webPreferences:{session:ses,preload:path.join(__dirname,'html-preview-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,plugins:false,spellcheck:false,devTools:false,disableDialogs:true,autoplayPolicy:'user-gesture-required',navigateOnDragDrop:false,safeDialogs:true}});
    const entry = { id, view, session:ses, abort, external, documentUrl }; entries.set(id,entry);
    const wc = view.webContents;
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    wc.setWindowOpenHandler(() => ({action:'deny'}));
    wc.on('will-navigate', event => event.preventDefault());
    wc.on('will-frame-navigate', event => event.preventDefault());
    wc.on('will-attach-webview', event => event.preventDefault());
    wc.on('will-prevent-unload', event => event.preventDefault());
    wc.on('unresponsive', () => { notify(id,'error','The HTML preview stopped responding and was closed.'); close(id); });
    wc.on('render-process-gone', () => { if(entries.has(id)){notify(id,'error','The HTML preview was closed.');close(id);} });
    wc.on('did-fail-load', (_e,code) => { if(code !== -3 && entries.has(id))notify(id,'error','The HTML preview could not be loaded.'); });
    view.setBounds(currentBounds); view.setVisible(args.visible !== false);
    owner.contentView.addChildView(view);
    void wc.loadURL(documentUrl).catch(() => {});
    return { id, external };
  }
  return {
    invoke(action,args={}) {
      if(action === 'html.preview.close'){close(args.id);return {ok:true};}
      if(action === 'html.preview.closeAll'){closeAll();return {ok:true};}
      if(action === 'html.preview.update') {
        const entry=entries.get(args.id); if(!entry)return {ok:false};
        const owner=getWindow(); if(!owner||owner.isDestroyed()){close(args.id);return {ok:false};}
        if(args.visible === false){entry.view.setVisible(false);return {ok:true};}
        entry.view.setBounds(bounds(args.bounds,owner.getContentBounds()));entry.view.setVisible(true);return {ok:true};
      }
      if(action === 'html.preview.open'){const stamp={generation,version:(versions.get(args.id)||0)+1};versions.set(args.id,stamp.version);const task=serial.then(()=>open(args,stamp));serial=task.catch(()=>{});return task;}
      throw new Error('Unknown HTML preview action.');
    },
    closeAll,
    dispose(){disposed=true;closeAll();electron.ipcMain.removeListener('html-preview:link',clickedLink);},
    // Test inspection is main-process-only and is never exposed through IPC.
    entries,
  };
}
module.exports = { createHtmlPreviewHost, bounds };
