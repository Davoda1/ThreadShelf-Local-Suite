'use strict';
// Optional browser acceptance: install Playwright and run node test/tts-ui.cjs.
// CHROMIUM_PATH / CHROMIUM_ARGS may select an existing Chromium installation.
// Tests use generated PCM and an isolated provider stub; no API keys or network.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium,_electron}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {installTtsQa,wav}=require('./tts-ui-bridge.cjs');
const {DEFAULTS,POCKET_VOICES,KOKORO_VOICES,REALTIME_VOICES,normalize}=require('../tts/settings.cjs');
const root=path.resolve(__dirname,'..'),out=process.env.TTS_QA_OUTPUT||path.join(os.tmpdir(),'threadshelf-alternative-tts-qa-'+process.pid);
const report={passed:false,checks:[],layouts:[],errors:[],requests:[],buildFingerprint:{}};
const specs={
 reader:{settings:'[data-action="settings"]',tts:'[data-tab="textToSpeech"]',tab:key=>`[data-tts-tab="${key}"]`,pill:'.tts-pill',play:'[data-tts-control="play"]',stop:'[data-tts-control="stop"]',close:'[data-tts-control="close"]',bubble:'[data-tts-read]',testStart:'[data-tts-action="test"]',testPlay:'[data-tts-action="test-play"]',testStop:'[data-tts-action="test-stop"]',testText:'#tts-testText',meter:'#ttsTestMeter',level:'#ttsTestLevel',closeSettings:'#settingsForm [data-action="modal-close"]'},
 alternative:{settings:'#settings-button',tts:'#tts-tab',tab:key=>`[data-tts-section="${key}"]`,pill:'#tts-pill',play:'#tts-play',stop:'#tts-stop',close:'#tts-close',bubble:'.tts-speak',testStart:'#tts-test-start',testPlay:'#tts-test-play',testStop:'#tts-test-stop',testText:'#tts-test-text',meter:'#tts-test-meter',closeSettings:'#settings-dialog .dialog-footer [data-close]'}
};
const files=['renderer/tts-audio.js','renderer/tts.js','renderer/tts.css','renderer/app.js','renderer/index.html'];
async function fingerprint(){for(const name of files)report.buildFingerprint[name]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex');}
async function setRange(page,selector,value){await page.locator(selector).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function waitSignal(page,positive=true){await page.waitForFunction(yes=>{const readings=window.__ttsQA.readings();return readings.length>0&&(yes?readings.some(r=>r.rms>.005):readings.every(r=>r.rms<.001));},positive,{timeout:5000});}
async function waitPlayback(page,playing=true){await page.waitForFunction(yes=>{const player=__ttsQA.players.filter(p=>!p.disposed).at(-1);return player&&(yes?player.snapshot().playing&&player.snapshot().currentTime>.02:player.snapshot().paused);},playing);}
async function pointerToggle(page,selector,expectedPaused,index=0){
 const button=page.locator(selector),box=await button.boundingBox();assert(box);
 const positions=[[.5,.5],[.27,.5],[.73,.5],[.12,.15]],point=positions[index%positions.length];
 await page.mouse.move(box.x+box.width*point[0],box.y+box.height*point[1]);await page.mouse.down();
 await page.evaluate(()=>{for(const audio of window.__ttsQA.media)audio.dispatchEvent(new Event('timeupdate'));});
 // A full animation update occurs while the actual pointer is down.
 await page.waitForTimeout(60);await page.mouse.up();
 await page.waitForFunction(({selector,paused})=>{const label=(document.querySelector(selector)?.getAttribute('aria-label')||'').toLowerCase();return paused?/play|resume/.test(label)&&!label.includes('pause'):/pause/.test(label);},{selector,paused:expectedPaused});
 await waitPlayback(page,!expectedPaused);
 if(expectedPaused){const at=await page.evaluate(()=>__ttsQA.players.filter(p=>!p.disposed).at(-1).snapshot().currentTime);await page.waitForTimeout(65);const after=await page.evaluate(()=>__ttsQA.players.filter(p=>!p.disposed).at(-1).snapshot().currentTime);assert(Math.abs(after-at)<.001,'Pause label changed but media time advanced');}
}
(async()=>{
 await fs.mkdir(out,{recursive:true});await fingerprint();
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'alternative-tts-browser-'));
 let browser,electron;
 if(process.env.TTS_ELECTRON_BROWSER==='1'){
  const wrapper=path.join(profile,'browser.cjs');
  await fs.writeFile(wrapper,"const {app,BrowserWindow}=require('electron');app.setPath('userData',"+JSON.stringify(path.join(profile,'profile'))+");app.whenReady().then(()=>{const w=new BrowserWindow({show:true,width:1280,height:850,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,sandbox:true}});w.loadURL('about:blank');});");
  electron=await _electron.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--headless','--ozone-platform=headless','--autoplay-policy=no-user-gesture-required',wrapper]});
  await electron.firstWindow();browser=electron.context();
 }else browser=await chromium.launchPersistentContext(profile,{viewport:{width:1280,height:850},colorScheme:'light',headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:process.env.CHROMIUM_ARGS?JSON.parse(process.env.CHROMIUM_ARGS):['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{for(const kind of ['alternative']){
  const s=specs[kind],context=browser;await context.setOffline(true);
  await context.addInitScript(installTtsQa,{defaults:{...DEFAULTS,streamingEnabled:true,volume:1,showPillVolume:false},voices:{pocket:POCKET_VOICES,kokoro:KOKORO_VOICES,'openai-realtime':REALTIME_VOICES},audio:{tone:wav({seconds:24}).toString('base64'),quiet:wav({seconds:24,amplitude:.05}).toString('base64'),silence:wav({seconds:24,amplitude:0}).toString('base64')}});
  const page=context.pages()[0]||await context.newPage();await page.setViewportSize({width:1280,height:850});await page.exposeFunction('__qaNormalize',(patch,saved)=>normalize(patch,saved));page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push({kind,message:e.message}));page.on('request',request=>{if(/^https?:|^wss?:/.test(request.url()))report.requests.push({kind,url:request.url()});});
  await page.goto(pathToFileURL(path.join(root,'renderer/index.html')).href);await page.waitForSelector(kind==='reader'?'.message':'#thread-content .tsa-message');
  const settings=async()=>{await page.click(s.settings);await page.click(s.tts);await page.waitForSelector('#tts-enabled',{state:'attached'});};
  const tab=key=>page.click(s.tab(key));
  const save=async()=>{if(kind==='reader'){await page.click('#settingsForm button[type="submit"]');await page.waitForSelector('#settingsForm',{state:'detached'});}else{await page.click(s.closeSettings);await page.waitForTimeout(250);}};
  assert.equal(await page.locator(s.bubble).count(),0);await settings();
  for(const section of ['playback','providers','test','cache'])assert.equal(await page.locator(s.tab(section)).count(),1);
  await page.locator(s.tab('playback')).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator(s.tab('providers')).getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await page.locator(s.tab('cache')).getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator(s.tab('playback')).getAttribute('aria-selected'),'true');
  assert.equal(await page.locator((kind==='reader'?'[data-tts-tab]':'[data-tts-section]')+'[tabindex="0"]').count(),1);
  report.checks.push(kind+': all four TTS settings sections exist with default master OFF');
  await tab('cache');assert.equal(await page.locator('#tts-preferApiCache').isChecked(),true);
  await page.uncheck('#tts-preferApiCache');await page.waitForFunction(()=>__ttsQA.settings().preferApiCache===false);
  await save();await settings();await tab('cache');assert.equal(await page.locator('#tts-preferApiCache').isChecked(),false);
  await page.check('#tts-preferApiCache');await page.waitForFunction(()=>__ttsQA.settings().preferApiCache===true);await tab('playback');
  report.checks.push('alternative: Prefer API recordings defaults on, autosaves off and on, and survives closing/reopening Settings');

  const memoryLimit=page.locator('#tts-sessionCacheMaxMiB');assert.equal(await memoryLimit.inputValue(),'1');assert.equal(await memoryLimit.getAttribute('aria-valuetext'),'64 MB');
  await memoryLimit.focus();await page.keyboard.press('Home');
  for(const [index,limit]of[32,64,128,256].entries()){if(index)await page.keyboard.press('ArrowRight');assert.equal(await memoryLimit.inputValue(),String(index));assert.equal(await memoryLimit.getAttribute('aria-valuetext'),limit+' MB');await page.waitForFunction(value=>__ttsQA.settings().sessionCacheMaxMiB===value,limit);}
  await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>__ttsQA.settings().sessionCacheMaxMiB===64);
  report.checks.push('alternative: four native RAM detents announce and autosave 32/64/128/256 MB, default 64');
  if(kind==='alternative')await page.evaluate(()=>__ttsQA.holdSaves());
  await tab('providers');await page.selectOption('#tts-provider','kokoro');await page.selectOption('#tts-voice','bf_emma');
  await tab('test');await page.fill(s.testText,'A draft voice can be tested without enabling conversation speech.');
  const before=await page.evaluate(()=>({settings:__ttsQA.settings(),cache:__ttsQA.entries()}));
  await page.evaluate(()=>{__ttsQA.resetLog();__ttsQA.mode('hold');});await page.click(s.testStart);
  await page.waitForFunction(()=>__ttsQA.calls.some(c=>c.action==='tts.preview'));
  const preview=await page.evaluate(()=>__ttsQA.calls.find(c=>c.action==='tts.preview'));
  assert.equal(preview.args.settings.enabled,false);assert.equal(preview.args.settings.provider,'kokoro');assert.equal(preview.args.settings.voice,'bf_emma');assert.match(preview.args.text,/draft voice/);
  await waitSignal(page);assert.equal(await page.locator(s.pill).isVisible().catch(()=>false),false);
  assert.equal(await page.evaluate(()=>__ttsQA.events.some(e=>e.state==='ready')),false);
  assert.deepEqual(await page.evaluate(()=>__ttsQA.entries()),before.cache);
  assert.deepEqual(await page.evaluate(()=>__ttsQA.settings()),before.settings);
  assert.equal(await page.evaluate(()=>__ttsQA.calls.filter(c=>c.action==='tts.synthesize').length),0);
  report.checks.push(kind+': draft Kokoro/Emma test works with master OFF, emits actual analysed audio before completion, no main pill or cache');
  if(kind==='alternative')await page.evaluate(()=>__ttsQA.releaseSaves());
  await page.waitForFunction(selector=>{const rms=Math.max(...__ttsQA.readings().map(x=>x.rms));return rms>.02&&Math.abs(Number(document.querySelector(selector).getAttribute('aria-valuenow'))-20*Math.log10(rms))<2;},s.meter);
  // The wait above samples the meter and audio analyser together; comparing
  // separate browser round trips races the real audio clock.
  assert(await page.locator(s.meter).isVisible());
  await page.click(s.testPlay);await waitSignal(page,false);
  await page.click(s.testPlay);await waitSignal(page,true);
  await page.click(s.testStop);await waitSignal(page,false);
  const silentMeter=await page.locator(s.meter).evaluate(el=>({rms:el.dataset.rms,value:el.value,db:el.getAttribute('aria-valuenow')}));if(kind==='reader')assert.equal(Number(silentMeter.rms),0);else assert.equal(Number(silentMeter.db),-60);
  assert.equal(await page.evaluate(id=>__ttsQA.jobs.get(id)?.cancelled,preview.args.requestId),true);
  await page.evaluate(id=>__ttsQA.sendAudio(id),preview.args.requestId);await page.waitForTimeout(120);await waitSignal(page,false);
  report.checks.push(kind+': test pause/resume/stop changes the real audio signal; cancelled late audio cannot restart it');
  // Verify silence is a real zero level rather than a cosmetic animation.
  await page.evaluate(()=>__ttsQA.mode('manual'));await page.click(s.testStart);
  await page.waitForFunction(id=>__ttsQA.jobIds().at(-1)!==id,preview.args.requestId);
  const silenceId=await page.evaluate(()=>__ttsQA.jobIds().at(-1));await page.evaluate(id=>__ttsQA.sendAudio(id,__ttsQA.audio.silence),silenceId);await page.waitForTimeout(200);
  await waitSignal(page,false);await page.click(s.testStop);
  report.checks.push(kind+': real silent PCM produces a zero analyser reading');
  await page.evaluate(()=>__ttsQA.mode('manual'));await page.click(s.testStart);
  await page.waitForFunction(previous=>__ttsQA.jobIds().at(-1)!==previous,silenceId);
  const pausedBeforeAudio=await page.evaluate(()=>__ttsQA.jobIds().at(-1));await page.click(s.testPlay);
  assert.equal(await page.evaluate(()=>TSATTS.previewSnapshot().paused),true);
  await page.evaluate(id=>__ttsQA.sendAudio(id),pausedBeforeAudio);await page.waitForFunction(()=>TSATTS.previewSnapshot()?.hasAudio);
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>TSATTS.previewSnapshot().paused),true);await waitSignal(page,false);
  await page.click(s.testPlay);await waitSignal(page,true);await page.click(s.testStop);
  report.checks.push('alternative: pause before the first streamed chunk preserves silence until explicit resume');
  await page.evaluate(()=>__ttsQA.mode('auto'));await page.click(s.testStart);await waitSignal(page,true);await page.waitForFunction(()=>TSATTS.previewSnapshot()?.complete);
  await page.click(s.testPlay);await setRange(page,'#tts-test-seek',1000);await page.click(s.testPlay);await waitPlayback(page);assert((await page.evaluate(()=>TSATTS.previewSnapshot().currentTime))<1);
  await page.click('#reading-tab');await waitSignal(page,false);assert.equal(await page.evaluate(()=>TSATTS.previewSnapshot()),null);await page.click('#tts-tab');
  report.checks.push('alternative: seeking to the end then Play restarts in one click; leaving Text-to-Speech stops and disposes the test player');

  await tab('playback');await setRange(page,'#tts-volume',25);await page.check('#tts-enabled');await page.check('#tts-showPillVolume');await save();
  await page.evaluate(()=>{__ttsQA.mode('hold');__ttsQA.resetLog();});await page.locator(s.bubble).first().click();await page.waitForSelector(s.pill,{state:'visible'});await waitPlayback(page);
  const gains=await page.evaluate(()=>__ttsQA.gains());assert(gains.some(value=>Math.abs(value-.25)<.001),JSON.stringify(gains));
  assert.equal(await page.evaluate(()=>__ttsQA.events.filter(e=>e.state==='ready').length),0);
  report.checks.push(kind+': conversation streaming starts before request completion and applies saved 25% volume');
  for(let i=0;i<24;i++)await pointerToggle(page,s.play,i%2===0,i);
  await waitPlayback(page);report.checks.push(kind+': 24 real pointer pause/resume toggles survive animation/time updates at SVG center and button edges, with actual media time freezing on every pause');
  const countBeforeVolume=await page.evaluate(()=>__ttsQA.calls.filter(c=>c.action==='tts.synthesize').length);
  const volumeSelector=kind==='reader'?'.tts-pill-volume input':'#tts-pill-volume';
  await setRange(page,volumeSelector,0);await page.waitForFunction(()=>__ttsQA.players.filter(p=>!p.disposed).at(-1)?.snapshot().volume===0);await setRange(page,volumeSelector,100);await page.waitForFunction(()=>__ttsQA.players.filter(p=>!p.disposed).at(-1)?.snapshot().volume===1);
  assert.equal(await page.evaluate(()=>__ttsQA.calls.filter(c=>c.action==='tts.synthesize').length),countBeforeVolume);
  report.checks.push(kind+': pill volume applies mute/full level to the actual audio player without another synthesis request');
  await page.evaluate(()=>__ttsQA.emit({requestId:__ttsQA.jobIds().at(-1),purpose:'conversation',state:'ready',recording:{provider:'elevenlabs',voice:'saved-voice',model:'saved-model'},cacheReason:'pinned'}));
  await page.waitForFunction(()=>document.getElementById('tts-pill-subtitle').textContent==='ElevenLabs · saved-voice');
  report.checks.push('alternative: playback labels use the actual reused recording provider and voice');
  const conversationId=await page.evaluate(()=>__ttsQA.jobIds().at(-1));await page.evaluate(id=>__ttsQA.finish(id),conversationId);await page.waitForFunction(()=>__ttsQA.players.filter(p=>!p.disposed).at(-1)?.snapshot().complete);
  assert(Math.abs((await page.evaluate(()=>__ttsQA.players.filter(p=>!p.disposed).at(-1).snapshot().duration))-24)<.01);
  report.checks.push(kind+': final replay audio is not appended a second time after streamed chunks');
  for(const theme of ['light','dark'])for(const size of [{width:1280,height:850},{width:680,height:540}]){
   await page.setViewportSize(size);if(kind==='alternative'&&size.width===680&&!await page.locator('#app').evaluate(el=>el.classList.contains('shelf-hidden')))await page.click('#hide-library');
   await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
   const bounds=await page.locator(s.pill).boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1);
   const style=await page.locator(s.pill).evaluate(el=>({blur:getComputedStyle(el).backdropFilter,bg:getComputedStyle(el).backgroundColor}));assert.equal(style.blur,'blur(5px)');
   await page.screenshot({path:path.join(out,`${kind}-pill-${theme}-${size.width}.png`)});report.layouts.push({kind,theme,...size,bounds,style});
  }
  await page.click(s.close);await waitSignal(page,false);await settings();
  for(const theme of ['light','dark'])for(const size of [{width:1280,height:850},{width:680,height:540}]){
   await page.setViewportSize(size);await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
   for(const section of ['playback','providers','test','cache']){
    await tab(section);
    const pane=page.locator('#tts-page-'+section),nav=page.locator('.tts-section-tabs'),before=await nav.boundingBox();
    await pane.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(30);
    const geometry=await page.evaluate(section=>{
     const nav=document.querySelector('.tts-section-tabs'),pane=document.getElementById('tts-page-'+section),body=document.querySelector('#settings-dialog>.settings-body');
     const n=nav.getBoundingClientRect(),p=pane.getBoundingClientRect(),footer=document.querySelector('#settings-dialog>.dialog-footer').getBoundingClientRect();
     return {navTop:n.top,navBottom:n.bottom,paneTop:p.top,paneBottom:p.bottom,bodyScroll:body.scrollTop,footerBottom:footer.bottom,globalX:document.documentElement.scrollWidth>innerWidth,globalY:document.documentElement.scrollHeight>innerHeight,overflow:document.getElementById('settings-dialog').scrollWidth>document.getElementById('settings-dialog').clientWidth+1,navOwnsPixels:[n.top+2,n.top+n.height/2,n.bottom-2].every(y=>nav.contains(document.elementFromPoint(n.left+n.width/2,y)))};
    },section);
    assert(Math.abs(geometry.navTop-before.y)<1,'TTS navigation must remain fixed while content scrolls');
    assert(geometry.paneTop>=geometry.navBottom-1,'Content viewport must start below the tabs');assert.equal(geometry.navOwnsPixels,true,'Scrolled settings content must not paint behind navigation');
    assert.equal(geometry.bodyScroll,0);assert.equal(geometry.globalX,false);assert.equal(geometry.globalY,false);assert.equal(geometry.overflow,false);assert(geometry.footerBottom<=size.height+1);
    report.layouts.push({kind,section,theme,...size,...geometry});
    await pane.evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,`${kind}-tab-${section}-${theme}-${size.width}.png`)});
   }
  }
  report.checks.push('alternative: four TTS panes scroll independently below fixed navigation in light/dark at 1280×850 and 680×540');
  await page.click(s.closeSettings);
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);report.passed=true;
 }finally{await fs.writeFile(path.join(out,'ui-report.json'),JSON.stringify(report,null,2));if(electron)await electron.close();else await browser.close();await fs.rm(profile,{recursive:true,force:true});}
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
