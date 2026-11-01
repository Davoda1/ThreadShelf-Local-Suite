/* Additive speech controls. Existing archive content and reading preferences stay separate. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const providerNames={pocket:'Pocket TTS · built-in CPU',kokoro:'Kokoro · built-in CPU',selfhosted:'Local or remote server',elevenlabs:'ElevenLabs','openai-realtime':'OpenAI',openrouter:'OpenRouter'};
  const voices={"pocket": [{"id": "alba", "name": "Alba"}, {"id": "marius", "name": "Marius"}, {"id": "javert", "name": "Javert"}, {"id": "anna", "name": "Anna"}, {"id": "charles", "name": "Charles"}, {"id": "vera", "name": "Vera"}], "kokoro": [{"id": "af_heart", "name": "Heart \u00b7 American female"}, {"id": "af_alloy", "name": "Alloy \u00b7 American female"}, {"id": "af_aoede", "name": "Aoede \u00b7 American female"}, {"id": "af_bella", "name": "Bella \u00b7 American female"}, {"id": "af_jessica", "name": "Jessica \u00b7 American female"}, {"id": "af_kore", "name": "Kore \u00b7 American female"}, {"id": "af_nicole", "name": "Nicole \u00b7 American female"}, {"id": "af_nova", "name": "Nova \u00b7 American female"}, {"id": "af_river", "name": "River \u00b7 American female"}, {"id": "af_sarah", "name": "Sarah \u00b7 American female"}, {"id": "af_sky", "name": "Sky \u00b7 American female"}, {"id": "am_adam", "name": "Adam \u00b7 American male"}, {"id": "am_echo", "name": "Echo \u00b7 American male"}, {"id": "am_eric", "name": "Eric \u00b7 American male"}, {"id": "am_fenrir", "name": "Fenrir \u00b7 American male"}, {"id": "am_liam", "name": "Liam \u00b7 American male"}, {"id": "am_michael", "name": "Michael \u00b7 American male"}, {"id": "am_onyx", "name": "Onyx \u00b7 American male"}, {"id": "am_puck", "name": "Puck \u00b7 American male"}, {"id": "am_santa", "name": "Santa \u00b7 American male"}, {"id": "bf_alice", "name": "Alice \u00b7 British female"}, {"id": "bf_emma", "name": "Emma \u00b7 British female"}, {"id": "bf_isabella", "name": "Isabella \u00b7 British female"}, {"id": "bf_lily", "name": "Lily \u00b7 British female"}, {"id": "bm_daniel", "name": "Daniel \u00b7 British male"}, {"id": "bm_fable", "name": "Fable \u00b7 British male"}, {"id": "bm_george", "name": "George \u00b7 British male"}, {"id": "bm_lewis", "name": "Lewis \u00b7 British male"}]};
  voices['openai-realtime']=['alloy','ash','ballad','coral','echo','sage','shimmer','verse','marin','cedar'].map(id=>({id,name:id[0].toUpperCase()+id.slice(1)}));
  const profileDefaults={pocket:{voice:'alba',model:'pocket-english-2026-10',endpoint:'',responseFormat:'wav'},kokoro:{voice:'am_michael',model:'kokoro-v1.0-fp32',endpoint:'',responseFormat:'wav'},selfhosted:{voice:'',model:'',endpoint:'http://127.0.0.1:8000/v1/audio/speech',responseFormat:'wav'},elevenlabs:{voice:'',model:'eleven_multilingual_v2',endpoint:'https://api.elevenlabs.io',responseFormat:'mp3'},openrouter:{voice:'',model:'',endpoint:'https://openrouter.ai/api/v1/audio/speech',responseFormat:'mp3'},'openai-realtime':{voice:'marin',model:'gpt-realtime-2.1-mini',endpoint:'wss://api.openai.com/v1/realtime',responseFormat:'wav'}};
  for(const profile of Object.values(profileDefaults))Object.assign(profile,{instructions:'',timeoutSeconds:180});
  let settings={enabled:false,includeThinking:false,showPillSettings:false,showPillSpeed:false,showPillVolume:false,volume:1,streamingEnabled:true,provider:'pocket',...profileDefaults.pocket,cacheEnabled:false,preferApiCache:true,cacheMaxBytes:2147483648,cacheMaxAgeDays:0,sessionCacheMaxMiB:64,readCode:false,readCitations:false,playbackRate:1,providerProfiles:structuredClone(profileDefaults)};
  let options={},initialized=false,available=false,saveTimer,saveQueue=Promise.resolve(),saveError=null,dirty=false,settingsRevision=0,savedSettingsRevision=0,credentialRefreshNeeded=false,keyDraftDirty=false;
  let context={sourceId:'',messages:[]},session=null,generation=0,testSession=null,testGeneration=0,cacheEntries=[],cachePage=0,cacheSession={count:0,totalBytes:0},deleteToken='',selected=new Set(),credentialProfiles={},discovery={},barVolumeOpen=false;
  let availabilityGeneration=0,availabilityRevision=0,availabilityTimer;
  const cachePageSize=15;
  const messageProofs=new WeakMap(),errorsByScope=new Map();
  const memoryLimits=[32,64,128,256];
  const profiles=['voice','model','endpoint','instructions','timeoutSeconds','responseFormat'];
  const invoke=(action,args={})=>available?(window.alternative?.tts?window.alternative.tts(action,args):window.__THREADSHELF_TTS_PREVIEW.invoke(action,args)):Promise.reject(new Error('Text-to-Speech is available in the desktop application.'));
  const icon=(name)=>{
    const filled={play:'M8 5v14l11-7z',pause:'M6 5h4v14H6zM14 5h4v14h-4z',stop:'M6 6h12v12H6z'};
    if(filled[name])return `<svg viewBox="0 0 24 24" aria-hidden="true" class="tts-filled"><path d="${filled[name]}"/></svg>`;
    if(name==='pill-settings')return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-3M14 20H3M14 2v4M8 10v4M18 18v4"/></svg>';
    if(name==='volume')return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
    if(name==='replay')return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 0 6M4 4v6h6"/></svg>';
    return options.icon(name);
  };
  const speaker='<svg viewBox="0 0 75 75" aria-hidden="true" class="tts-speaker-svg"><path d="M39.389,13.769 L22.235,28.606 L6,28.606 L6,47.699 L21.989,47.699 L39.389,62.75 L39.389,13.769z" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M48,27.6a19.5,19.5 0 0 1 0,21.4M55.1,20.5a30,30 0 0 1 0,35.6M61.6,14a38.8,38.8 0 0 1 0,48.6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>';
  const fmtBytes=bytes=>bytes>=1073741824?(bytes/1073741824).toFixed(2)+' GiB':bytes>=1048576?(bytes/1048576).toFixed(1)+' MiB':bytes>=1024?(bytes/1024).toFixed(1)+' KiB':bytes+' B';
  const fmtTime=value=>{const seconds=Math.max(0,Math.floor(Number(value)||0));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};
  function setText(id,value){const element=$(id);if(element&&element.textContent!==String(value))element.textContent=String(value);}
  function paintRange(input) {
    if(!input)return;const min=Number(input.min)||0,max=Number(input.max)||100,value=Number(input.value)||0;
    const fraction=max>min?Math.max(0,Math.min(1,(value-min)/(max-min))):0;input.style.setProperty('--tts-range-fill',(fraction*100)+'%');
  }
  function paintMemoryLimit(value) {
    const limit=memoryLimits.includes(Number(value))?Number(value):64,index=memoryLimits.indexOf(limit),input=$('tts-sessionCacheMaxMiB');
    if(!input)return;input.value=index;input.setAttribute('aria-valuetext',limit+' MB');$('tts-session-memory-value').textContent=limit+' MB';input.closest('.tts-memory-limit').style.setProperty('--tts-memory-position',index/3*100+'%');
  }
  function paintProgress(active,seekId,busyId,timeId) {
    const state=active?.player.snapshot(),known=Boolean(active?.generationComplete&&state?.complete),unknown=Boolean(active&&!known),generating=unknown&&active.accepting&&!active.failed&&!active.stopped,seek=$(seekId),busy=$(busyId);
    busy.hidden=!generating;busy.setAttribute('aria-busy',String(generating));seek.hidden=generating;seek.disabled=!state?.hasAudio||!known||Boolean(active?.failed);
    seek.max=1000;seek.step=1;seek.value=known&&state.duration>0?(state.ended?1000:Math.round(state.currentTime/state.duration*1000)):0;paintRange(seek);
    seek.setAttribute('aria-valuetext',fmtTime(state?.currentTime)+(known?' of '+fmtTime(state.duration):' · final duration unavailable'));
    setText(timeId,fmtTime(state?.currentTime)+' / '+(unknown?'—':fmtTime(state?.duration)));
  }
  function seekToFraction(active,input) {
    const state=active?.player.snapshot();if(active?.generationComplete&&state?.complete)active.player.seek(Number(input.value)/1000*state.duration);
  }
  function needsGeneration(active){return Boolean(active&&!active.generationComplete&&(active.final||active.failed||active.stopped));}
  function restartConversation(active){
    if(session!==active||active.sourceId!==context.sourceId)return;
    const index=context.messages.findIndex(message=>String(message.id)===active.messageId);if(index>=0)return speak(index);
  }
  function renderError(){const text=[...errorsByScope.values()].at(-1)||'',element=$('tts-error');if(element){element.textContent=text;element.hidden=!text;}}
  function showError(error,scope='general'){const text=error?.message||String(error);if(error===saveError)scope='settings';errorsByScope.delete(scope);errorsByScope.set(scope,text);renderError();options.toast?.(text);}
  function clearError(scope){errorsByScope.delete(scope);renderError();}
  function toggle(key,label,help){return `<div class="setting-group setting-toggle"><div><label for="tts-${key}">${label}</label><p>${help}</p></div><input class="tts-toggle" type="checkbox" id="tts-${key}" data-tts-setting="${key}" role="switch"></div>`;}
  function panelMarkup(){return `
    <div id="tts-error" class="form-error" role="alert" hidden></div>
    <nav class="tts-section-tabs" role="tablist" aria-label="Text-to-Speech sections">
      ${[['playback','Playback'],['providers','Providers & voices'],['test','Audio test'],['cache','Audio cache']].map(([id,label])=>`<button type="button" id="tts-section-${id}" data-tts-section="${id}" role="tab" aria-selected="${id==='playback'}" aria-controls="tts-page-${id}" tabindex="${id==='playback'?0:-1}">${label}</button>`).join('')}
    </nav>
    <section id="tts-page-playback" role="tabpanel" aria-labelledby="tts-section-playback">
      ${toggle('enabled','Enable Text-to-Speech','Show a speaker button at the bottom right of readable messages.')}
      <div class="tts-toggle-grid">${toggle('includeThinking','Read thinking / reasoning','Allow speech for reasoning included in an export.')}${toggle('streamingEnabled','Stream speech','Begin listening as speech arrives. PCM may stream continuously; compressed audio can arrive in sections.')}</div>
      <div class="tts-field-pair"><div class="setting-group"><div class="setting-title"><label for="tts-volume">Master volume</label><output id="tts-volume-label">100%</output></div><input id="tts-volume" type="range" min="0" max="100" step="1" value="100" aria-label="Master speech volume"></div><div class="setting-group"><label class="field-label" for="tts-playbackRate">PLAYBACK SPEED</label><select id="tts-playbackRate" data-tts-setting="playbackRate">${[0.5,0.75,1,1.25,1.5,1.75,2].map(n=>`<option value="${n}">${n}×</option>`).join('')}</select></div></div>
      <div class="tts-setting-section"><h3>TTS bar</h3><div class="tts-toggle-grid tts-compact-toggles">${toggle('showPillSpeed','Show speed control','')}${toggle('showPillVolume','Show volume control','')}${toggle('showPillSettings','Show settings button','')}</div></div>
      <details class="tts-details"><summary>Text to read</summary><div class="tts-toggle-grid">${toggle('readCode','Read code blocks','Include fenced and indented code.')}${toggle('readCitations','Read citations','Include readable citation labels.')}</div></details>
      <div class="setting-group tts-memory-setting"><div class="setting-title"><label for="tts-sessionCacheMaxMiB">Temporary audio memory</label><output id="tts-session-memory-value">64 MB</output></div><div class="tts-memory-limit" style="--tts-memory-position:33.333333%"><div class="tts-memory-rail" aria-hidden="true">${memoryLimits.map((value,index)=>`<span class="tts-memory-stop" style="left:${index/3*100}%"><span class="tts-memory-dot"></span><span class="tts-memory-label">${value} MB</span></span>`).join('')}<span class="tts-memory-marker"></span></div><input id="tts-sessionCacheMaxMiB" type="range" min="0" max="3" step="1" value="1" aria-valuetext="64 MB" aria-describedby="tts-session-memory-help"></div><p id="tts-session-memory-help" class="field-help">Keep up to three completed recordings for replay during this session.</p></div>
    </section>
    <section id="tts-page-providers" role="tabpanel" aria-labelledby="tts-section-providers" hidden>
      <div class="setting-group"><label class="field-label" for="tts-provider">SPEECH PROVIDER</label><select id="tts-provider">${Object.entries(providerNames).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select><p class="field-help" id="tts-provider-help"></p></div>
      <div class="setting-group" id="tts-endpoint-group"><label class="field-label" for="tts-endpoint">SPEECH ENDPOINT</label><input id="tts-endpoint" type="url" data-tts-profile="endpoint" spellcheck="false" autocomplete="off"><p class="field-help">Use localhost, a LAN address, or a remote server. The server must already be running.</p></div>
      <div class="setting-group" id="tts-key-group"><label class="field-label" for="tts-api-key">API KEY</label><div class="tts-key-row"><input id="tts-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste API key"><button class="secondary-button" id="tts-set-key" type="button">Use key</button><button class="text-button" id="tts-clear-key" type="button">Clear</button></div><details class="tts-key-options"><summary>Save or unlock a key</summary><label><input type="checkbox" id="tts-remember-key"> Remember key, encrypted</label><div class="tts-key-row" id="tts-passphrase-row" hidden><input id="tts-passphrase" type="password" autocomplete="off" minlength="8" placeholder="Passphrase · at least 8 characters" aria-label="Encryption passphrase"><button class="secondary-button" id="tts-unlock-key" type="button" hidden>Unlock</button></div><div class="tts-button-row"><button class="text-button" id="tts-forget-key" type="button" hidden>Forget saved key</button></div><p class="field-help">The passphrase is never stored. Unlock saved keys after restarting the application.</p></details><p class="field-help" id="tts-key-status">Keys are cleared when the application closes.</p></div>
      <div class="tts-field-pair"><div class="setting-group"><label class="field-label" for="tts-model">MODEL</label><input id="tts-model" data-tts-profile="model" list="tts-models" autocomplete="off" spellcheck="false"><datalist id="tts-models"></datalist></div><div class="setting-group"><label class="field-label" for="tts-voice">VOICE</label><select id="tts-voice"></select><input id="tts-voice-id" data-tts-profile="voice" list="tts-voices" autocomplete="off" spellcheck="false" hidden><datalist id="tts-voices"></datalist></div></div>
      <div class="setting-group tts-discover-row" id="tts-discover-group"><button class="secondary-button" id="tts-discover" type="button">Load models &amp; voices</button><p class="field-help" id="tts-discovery-note">Manual model and voice IDs are also supported.</p></div>
      <div class="tts-audition-row"><button type="button" id="tts-provider-test-start" class="secondary-button">Test voice</button><div id="tts-provider-test-meter" class="tts-level-meter" role="meter" aria-label="Voice test audio level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="-60"><span></span></div><button type="button" id="tts-provider-test-stop" class="text-button" disabled>Stop</button></div><p class="field-help" id="tts-provider-test-status" aria-live="polite">Uses the current choices and the Audio test passage. Test audio is never cached.</p>
      <details class="tts-details" id="tts-provider-options"><summary>Provider options</summary><div class="tts-field-pair"><div class="setting-group"><label class="field-label" for="tts-timeoutSeconds">TIMEOUT · SECONDS</label><input id="tts-timeoutSeconds" type="number" min="1" max="1800" data-tts-profile="timeoutSeconds"></div><div class="setting-group" id="tts-format-group"><label class="field-label" for="tts-responseFormat">AUDIO FORMAT</label><select id="tts-responseFormat" data-tts-profile="responseFormat"><option value="wav">WAV</option><option value="mp3">MP3</option><option value="pcm">PCM</option></select></div></div><div class="setting-group" id="tts-instructions-group"><label class="field-label" for="tts-instructions">VOICE INSTRUCTIONS</label><textarea id="tts-instructions" rows="3" maxlength="4000" data-tts-profile="instructions" placeholder="Optional speaking style"></textarea><p class="field-help">Realtime speech is checked against the requested text before playback.</p></div></details>
    </section>
    <section id="tts-page-test" role="tabpanel" aria-labelledby="tts-section-test" hidden>
      <div class="setting-group"><label class="field-label" for="tts-test-text">TEST PASSAGE</label><textarea id="tts-test-text" rows="4" maxlength="4000">Good conversations deserve a second look. This short voice test includes a natural pause, a question, and a few numbers. How does this voice sound? Today we have twenty-four notes and one hundred ideas to explore.</textarea><p class="field-help">Uses your current provider, voice and unsaved edits. Works with Text-to-Speech off.</p></div>
      <div class="tts-audition-row"><button type="button" class="primary-button" id="tts-test-start">Test voice</button><div id="tts-test-meter" class="tts-level-meter" role="meter" aria-label="Test audio level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="-60"><span></span></div><button type="button" class="icon-button" id="tts-test-play" aria-label="Pause test audio" title="Pause test audio" disabled>${icon('pause')}</button><button type="button" class="icon-button" id="tts-test-stop" aria-label="Stop test audio" title="Stop test audio" disabled>${icon('stop')}</button></div>
      <p id="tts-test-status" class="tts-test-status" role="status" aria-live="polite">Ready to test the selected voice.</p><div class="tts-test-progress"><div class="tts-progress-slot"><div id="tts-test-indeterminate" class="tts-indeterminate" role="progressbar" aria-label="Generating test speech; final duration is not available yet" aria-busy="false" hidden></div><input id="tts-test-seek" type="range" min="0" max="1000" step="1" value="0" disabled aria-label="Test audio position"></div><span id="tts-test-time">0:00 / 0:00</span></div><p id="tts-test-provider" class="field-help"></p><p class="field-help">The level meter shows the audio being played. Test audio is kept only for this test and is never saved to the audio cache.</p>
    </section>
    <section id="tts-page-cache" role="tabpanel" aria-labelledby="tts-section-cache" hidden>
      ${toggle('cacheEnabled','Save generated speech','Turning this off keeps existing files until you delete them.')}
      ${toggle('preferApiCache','Prefer API recordings','Reuse API audio for unchanged messages, even after changing the provider, voice or text filters.')}<p class="field-help">Pinned recordings always take priority for the same unchanged message. Reused audio keeps its original code and citation content. New speech never overwrites pinned recordings.</p>
      <details class="tts-details tts-cache-limits"><summary>Automatic cache limits</summary><div class="tts-field-pair"><div class="setting-group"><label class="field-label" for="tts-cache-size">SIZE LIMIT · GiB</label><input id="tts-cache-size" type="number" min="0.016" max="100" step="0.25"></div><div class="setting-group"><label class="field-label" for="tts-cacheMaxAgeDays">MAXIMUM AGE · DAYS</label><input id="tts-cacheMaxAgeDays" type="number" min="0" max="3650" data-tts-setting="cacheMaxAgeDays"><p class="field-help">0 means no age limit.</p></div></div></details>
      <div class="tts-cache-manager" id="tts-cache-manager"><div class="tts-cache-heading"><div><h3>Saved audio</h3><p id="tts-cache-summary" class="field-help">Open this tab to view saved audio.</p><p id="tts-cache-session" class="field-help" hidden></p></div><button class="text-button" id="tts-cache-refresh" type="button">Refresh</button></div><div id="tts-cache-list" class="tts-cache-list"></div><nav id="tts-cache-pagination" class="tts-cache-pagination" aria-label="Saved audio pages" hidden><button id="tts-cache-prev" class="text-button" type="button">Previous</button><span id="tts-cache-page" aria-live="polite"></span><button id="tts-cache-next" class="text-button" type="button">Next</button></nav><div class="tts-cache-cleanup"><div class="tts-field-pair"><div class="setting-group"><label class="field-label" for="tts-delete-scope">CLEAN UP</label><select id="tts-delete-scope"><option value="selected">Selected clips</option><option value="conversation">This conversation</option><option value="provider">Current provider</option><option value="older">Older clips</option><option value="incomplete">Incomplete clips</option><option value="all">All saved audio</option></select></div><div class="setting-group" id="tts-delete-age-group" hidden><label class="field-label" for="tts-delete-age">OLDER THAN · DAYS</label><input id="tts-delete-age" type="number" min="1" max="3650" value="30"></div></div><div class="tts-cleanup-actions"><label class="tts-cache-option"><input type="checkbox" id="tts-include-pinned"> Include pinned clips</label><button class="secondary-button tts-danger-button" id="tts-delete-preview" type="button">Review deletion…</button></div><p class="field-help">Pinned clips are protected by default. Audio in active playback is always protected.</p><div id="tts-delete-confirm" class="tts-delete-confirm" hidden><p id="tts-delete-summary"></p><div class="tts-button-row"><button class="secondary-button" id="tts-delete-cancel" type="button">Cancel</button><button class="primary-button" id="tts-delete-apply" type="button">Delete these clips</button></div></div></div></div>
    </section>`;}
  function selectTab(name,focus=false){const previous=document.querySelector('[data-settings-tab][aria-selected="true"]')?.dataset.settingsTab;document.querySelectorAll('[data-settings-tab]').forEach(button=>{const active=button.dataset.settingsTab===name;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();});$('reading-settings-panel').hidden=name!=='reading';$('tts-settings-panel').hidden=name!=='tts';$('settings-dialog').classList.toggle('tts-active',name==='tts');if(name!=='tts')stopPreview();if(previous!==name)$('settings-dialog').querySelector('.settings-body').scrollTop=0;}
  function selectSection(name,focus=false) {
    const names=['playback','providers','test','cache'];if(!names.includes(name))return;
    for(const id of names){const active=id===name,button=$('tts-section-'+id);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$('tts-page-'+id).hidden=!active;if(active&&focus)button.focus();}
    $('settings-dialog').querySelector('.settings-body').scrollTop=0;$('tts-page-'+name).scrollTop=0;if(name==='cache'&&available)void refreshCache();
  }
  function renderVoiceChoices() {
    const provider=settings.provider,info=discovery[provider],model=info?.models?.find(entry=>entry.id===settings.model);
    const list=voices[provider]||model?.voices||(info?.selectedModel===settings.model?info.voices:[])||[];const fixed=!!voices[provider];
    $('tts-voices').innerHTML=list.map(voice=>`<option value="${esc(voice.id)}">${esc(voice.name||voice.id)}</option>`).join('');
    if(list.length){const known=list.some(voice=>voice.id===settings.voice);$('tts-voice').hidden=false;$('tts-voice').innerHTML=(!fixed?'<option value="">Choose a voice</option>':'')+list.map(voice=>`<option value="${esc(voice.id)}">${esc(voice.name||voice.id)}</option>`).join('')+(!fixed?'<option value="__manual__">Enter a voice ID…</option>':'');$('tts-voice').value=known?settings.voice:fixed?list[0].id:settings.voice?'__manual__':'';$('tts-voice-id').hidden=fixed||$('tts-voice').value!=='__manual__';}
    else{$('tts-voice').hidden=true;$('tts-voice-id').hidden=false;}
    $('tts-voice-id').value=settings.voice||'';
  }
  function setVolume(value) {
    settings.volume=Math.max(0,Math.min(1,Number(value)||0));$('tts-volume').value=Math.round(settings.volume*100);paintRange($('tts-volume'));$('tts-volume-label').textContent=Math.round(settings.volume*100)+'%';session?.player.setVolume(settings.volume);testSession?.player.setVolume(settings.volume);queueSave();updateControls();
  }
  function updateKeyStatus(){
    const status=credentialProfiles[settings.provider]||{},present=Boolean(settings.credentialStatus?.[settings.provider]||status.available);
    $('tts-key-status').textContent=status.saved?(present?'Saved encrypted key is unlocked for this session.':'Saved encrypted key is locked. Enter your passphrase to unlock it.'):(present?'API key is available for this session.':'No session key set. Keys are cleared when the application closes.');
    $('tts-forget-key').hidden=!status.saved;$('tts-unlock-key').hidden=!status.saved||present;
    $('tts-passphrase-row').hidden=!$('tts-remember-key').checked&&!(status.saved&&!present);
  }
  async function refreshCredentials(){try{const result=await invoke('tts.credentials.status');credentialProfiles=result.providers||{};for(const [id,status]of Object.entries(credentialProfiles)){settings.credentialStatus={...settings.credentialStatus,[id]:!!status.available};}updateKeyStatus();}catch(error){showError(error);}}
  function renderSettings(){
    for(const key of ['enabled','includeThinking','showPillSettings','showPillSpeed','showPillVolume','streamingEnabled','cacheEnabled','preferApiCache','readCode','readCitations'])$('tts-'+key).checked=Boolean(settings[key]);
    for(const key of ['playbackRate','cacheMaxAgeDays'])$('tts-'+key).value=settings[key];
    paintMemoryLimit(settings.sessionCacheMaxMiB);
    $('tts-volume').value=Math.round((settings.volume??1)*100);$('tts-volume-label').textContent=$('tts-volume').value+'%';paintRange($('tts-volume'));
    $('tts-cache-size').value=Number((settings.cacheMaxBytes/1073741824).toFixed(3));$('tts-provider').value=settings.provider;
    const builtin=['pocket','kokoro'].includes(settings.provider),realtime=settings.provider==='openai-realtime';
    $('tts-endpoint-group').hidden=settings.provider!=='selfhosted';$('tts-key-group').hidden=builtin;$('tts-discover-group').hidden=builtin||realtime;$('tts-provider-options').hidden=builtin;
    $('tts-format-group').hidden=realtime;const formats=builtin||realtime?['wav']:settings.provider==='selfhosted'?['wav','mp3','pcm']:['mp3','pcm'];$('tts-responseFormat').innerHTML=formats.map(format=>`<option value="${format}">${format==='pcm'?'PCM · streaming':format.toUpperCase()}</option>`).join('');$('tts-instructions-group').hidden=!realtime;
    $('tts-model').readOnly=builtin;
    for(const key of profiles){const el=$('tts-'+key);if(el)el.value=settings[key]??'';}
    $('tts-models').innerHTML=realtime?['gpt-realtime-2.1-mini','gpt-realtime-2.1'].map(id=>`<option value="${id}"></option>`).join(''):'';
    renderVoiceChoices();
    $('tts-provider-help').textContent=builtin?'Runs on this computer’s CPU using bundled model files. No server or account is needed.':realtime?'Uses the current Realtime API. Text is sent only when you request speech.':settings.provider==='selfhosted'?'Connect an OpenAI-compatible speech endpoint on this computer, your LAN, or a remote server.':'Message text is sent to this provider when you request speech. API usage may be billed.';
    updateKeyStatus();updateControls();
  }
  function queueSave(){settingsRevision++;scheduleAvailability();dirty=true;saveError=null;clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(()=>{}),180);}
  async function flush(){
    clearTimeout(saveTimer);
    if(dirty){const snapshot=structuredClone(settings),revision=settingsRevision;dirty=false;saveQueue=saveQueue.catch(()=>{}).then(async()=>{try{const saved=await invoke('tts.settings.save',{settings:snapshot});savedSettingsRevision=revision;saveError=null;if(revision===settingsRevision){settings=saved;updateKeyStatus();if(credentialRefreshNeeded){credentialRefreshNeeded=false;await refreshCredentials();}}clearError('settings');scheduleAvailability(false);}catch(error){saveError=error;showError(error,'settings');throw error;}});}
    await saveQueue;if(saveError)throw saveError;
  }
  function changed(key,value){if(key==='endpoint'){credentialRefreshNeeded=true;$('tts-api-key').value='';keyDraftDirty=false;}settings[key]=value;if(profiles.includes(key)){settings.providerProfiles[settings.provider]={...settings.providerProfiles[settings.provider],[key]:value};}queueSave();if(!settings.enabled||(session?.thinking&&!settings.includeThinking)||profiles.includes(key)||key==='readCode'||key==='readCitations'||key==='preferApiCache'&&session&&!session.generationComplete)cancel();session?.player.setRate(settings.playbackRate);testSession?.player.setRate(settings.playbackRate);session?.player.setVolume(settings.volume);testSession?.player.setVolume(settings.volume);if(profiles.includes(key))stopPreview();if(key==='model')renderVoiceChoices();updateControls();updateTestControls();attach(context);}
  function setSpeakerAvailability(button,reusable) {
    button.classList.toggle('tts-available',reusable);button.dataset.ttsAvailable=String(reusable);
    const label=reusable?'Play available audio':button.dataset.ttsThinking==='true'?'Read reasoning aloud':'Read this message aloud';button.title=label;button.setAttribute('aria-label',label);
  }
  function scheduleAvailability(clear=true) {
    const run=++availabilityGeneration;clearTimeout(availabilityTimer);
    if(clear&&initialized)document.querySelectorAll('.tts-speak').forEach(button=>setSpeakerAvailability(button,false));
    if(initialized&&available&&settings.enabled)availabilityTimer=setTimeout(()=>void refreshAvailability(run).catch(()=>{}),60);
  }
  async function refreshAvailability(run) {
    if(run!==availabilityGeneration||!settings.enabled||dirty||savedSettingsRevision!==settingsRevision)return;
    const sourceId=context.sourceId,batches=[],guards=new Map();if(typeof sourceId!=='string'||!sourceId.trim()||sourceId.length>8192||sourceId.includes('\0'))return;let batch=[],bytes=0;
    for(const button of $('thread-content').querySelectorAll('[data-tts-index]')){
      const index=Number(button.dataset.ttsIndex),message=context.messages[index];if(!message)continue;
      let rawText;try{rawText=speechText(message);}catch{continue;}if(rawText.length>100000||rawText.includes('\0'))continue;const text=canonicalText(rawText);if(new TextEncoder().encode(text).byteLength>256*1024||String(message.id).length>2048||String(message.id).includes('\0')||!String(message.id).trim())continue;
      const proof=await messageProof(message);if(run!==availabilityGeneration||sourceId!==context.sourceId)return;if(!text&&!proof.fingerprint)continue;
      if(context.messages[index]!==message||canonicalText(speechText(message))!==text||proof.fullText!==null&&fullMessageText(message)!==proof.fullText)continue;
      guards.set(String(index),{message,text,fullText:proof.fullText});
      const item={id:String(index),text,sourceId,messageId:String(message.id),thinking:message.role==='reasoning',...(proof.fingerprint?{messageFingerprint:proof.fingerprint}:{})},size=new TextEncoder().encode(JSON.stringify(item)).byteLength;
      if(size>480*1024)continue;
      if(batch.length&&(batch.length===64||bytes+size>480*1024)){batches.push(batch);batch=[];bytes=0;}
      batch.push(item);bytes+=size;
    }
    if(batch.length)batches.push(batch);
    for(const messages of batches){
      if(run!==availabilityGeneration||sourceId!==context.sourceId)return;
      try{const result=await invoke('tts.availability',{messages});if(run!==availabilityGeneration||sourceId!==context.sourceId||Number(result.revision)<availabilityRevision)return;
        availabilityRevision=Math.max(availabilityRevision,Number(result.revision)||0);
        for(const item of result.items||[]){const index=Number(item.id),guard=guards.get(String(index)),message=context.messages[index],button=$('thread-content').querySelector(`[data-tts-index="${index}"]`);if(!button||!guard)continue;let current=false;try{current=message===guard.message&&canonicalText(speechText(message))===guard.text&&(guard.fullText===null||fullMessageText(message)===guard.fullText);}catch{}setSpeakerAvailability(button,current&&item.available===true);}
      }catch{return;}
    }
  }
  function attach(next){
    context=next||context;if(!initialized)return;scheduleAvailability();const content=$('thread-content');
    content.querySelectorAll('.tts-message-footer').forEach(el=>el.remove());content.querySelectorAll('.tts-speaking').forEach(el=>el.classList.remove('tts-speaking'));if(!settings.enabled)return;
    for(const article of content.querySelectorAll('.tsa-message[data-message-index]')){
      const message=context.messages[Number(article.dataset.messageIndex)];if(!message||!String(message.content||'').trim()||(message.role==='reasoning'&&!settings.includeThinking))continue;
      const footer=document.createElement('div');footer.className='tts-message-footer';const button=document.createElement('button');button.type='button';button.className='icon-button tts-speak';button.dataset.ttsIndex=article.dataset.messageIndex;button.dataset.ttsThinking=String(message.role==='reasoning');setSpeakerAvailability(button,false);button.innerHTML=speaker;footer.append(button);article.append(footer);
      if(session?.messageId===String(message.id)&&session.sourceId===context.sourceId)article.classList.add('tts-speaking');
    }
  }
  function speechText(message,readOptions=settings){
    // Render a detached copy so code/citation filters never mutate the visible message.
    const template=document.createElement('template');template.innerHTML=window.TSAContent.markdown(message.content,message.richContext,message.role);const copy=template.content;
    copy.querySelectorAll('script,style,button,.tsa-code-toolbar,.tsa-image-icon,.tsa-image-note,svg,math,textarea').forEach(el=>el.remove());
    if(!readOptions.readCode)copy.querySelectorAll('pre,.tsa-code-block').forEach(el=>el.remove());
    if(!readOptions.readCitations)copy.querySelectorAll('.tsa-file-citation,.file-citation,.codex-file-citation,.rich-citation,.rich-citation-unresolved,[data-file-citation]').forEach(el=>el.remove());
    for(const br of copy.querySelectorAll('br'))br.replaceWith('\n');
    for(const cell of copy.querySelectorAll('td,th'))cell.append('. ');
    for(const block of copy.querySelectorAll('p,div,li,pre,h1,h2,h3,h4,h5,h6,tr,blockquote'))block.append('\n');
    return (copy.textContent||'').replace(/[^]*/g,'').replace(/\u200b/g,'').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  const canonicalText=value=>String(value??'').replace(/\r\n?/g,'\n').normalize('NFC').trim();
  const fullMessageText=message=>JSON.stringify([canonicalText(message.content),canonicalText(speechText(message,{readCode:true,readCitations:true}))]);
  async function messageProof(message) {
    let fullText;try{fullText=fullMessageText(message);}catch{return {fullText:null};}
    if(!globalThis.crypto?.subtle)return {fullText};
    let cached=messageProofs.get(message);
    if(!cached||cached.fullText!==fullText){
      const promise=crypto.subtle.digest('SHA-256',new TextEncoder().encode(fullText)).then(bytes=>({version:1,sha256:Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')})).catch(()=>undefined);
      cached={fullText,promise};messageProofs.set(message,cached);
    }
    return {fullText,fingerprint:await cached.promise};
  }
  function freshSession(purpose,details={}) {
    const active={requestId:crypto.randomUUID(),purpose,received:new Set(),accepting:true,final:false,generationComplete:false,status:'Preparing speech…',profile:currentDraft(),...details};
    active.player=new window.ThreadShelfTtsPlayer({volume:active.profile.volume,rate:active.profile.playbackRate,meter:purpose==='preview',onState:state=>{
      if((purpose==='preview'?testSession:session)!==active)return;active.state=state;
      if(state.ended&&active.generationComplete&&!active.stopped){active.status='Finished';if(purpose==='conversation')void protectPlayback(false,active);}
      purpose==='preview'?updateTestControls():updateControls();
    },onLevel:level=>{if(testSession===active)updateMeters(level);},onError:error=>{
      if((purpose==='preview'?testSession:session)!==active)return;active.status=error.message;active.failed=true;active.final=true;active.generationComplete=false;active.accepting=false;invoke('tts.cancel',{requestId:active.requestId}).catch(()=>{});purpose==='preview'?updateTestControls():updateControls();
    }});
    return active;
  }
  function currentDraft() {
    const draft=structuredClone(settings);
    for(const key of profiles){const element=key==='voice'?(!$('tts-voice-id').hidden?$('tts-voice-id'):$('tts-voice')):$('tts-'+key);if(element)draft[key]=key==='timeoutSeconds'?Number(element.value):element.value;}
    draft.provider=$('tts-provider')?.value||draft.provider;draft.volume=Number($('tts-volume')?.value??100)/100;draft.playbackRate=Number($('tts-playbackRate')?.value||1);draft.streamingEnabled=$('tts-streamingEnabled')?.checked??true;draft.sessionCacheMaxMiB=memoryLimits[Number($('tts-sessionCacheMaxMiB')?.value)]||64;
    draft.providerProfiles={...draft.providerProfiles,[draft.provider]:Object.fromEntries(profiles.map(key=>[key,draft[key]]))};return draft;
  }
  async function protectPlayback(active,current=session){if(current?.purpose==='conversation'&&current.generationComplete)await invoke('tts.playback',{requestId:current.requestId,cacheKey:current.cacheKey||null,active}).catch(()=>{});}
  function cancel() {
    const old=session;session=null;barVolumeOpen=false;++generation;if(old){old.accepting=false;old.player.dispose();void protectPlayback(false,old);invoke('tts.cancel',{requestId:old.requestId}).catch(()=>{});}
    if(initialized){$('tts-pill').hidden=true;document.querySelectorAll('.tts-speaking').forEach(el=>el.classList.remove('tts-speaking'));}
  }
  function stopPreview(message='Test stopped.') {
    const old=testSession;testSession=null;++testGeneration;if(old){old.accepting=false;old.player.dispose();invoke('tts.cancel',{requestId:old.requestId}).catch(()=>{});}
    if(initialized){updateMeters({rms:0,db:-120,peak:0});updateTestControls(message);}
  }
  function onTtsEvent(event) {
    if(event?.state==='availability-changed'){availabilityRevision=Math.max(availabilityRevision,Number(event.revision)||0);scheduleAvailability();return;}
    const active=event?.purpose==='preview'?testSession:session;if(!active||event.requestId!==active.requestId||!active.accepting)return;
    if(event.streamingMode)active.streamingMode=event.streamingMode;if(event.recording){active.recording={...event.recording};if(active.purpose==='conversation')updateControls();}
    if(event.state==='audio'){
      const index=Number.isInteger(event.clipIndex)?event.clipIndex:active.received.size;if(active.received.has(index))return;active.received.add(index);active.status='Playing';
      active.player.append(event).catch(error=>{if((active.purpose==='preview'?testSession:session)===active){active.status=error.message;active.failed=true;active.final=true;active.generationComplete=false;active.accepting=false;active.purpose==='preview'?updateTestControls():updateControls();}});
    }else if(event.state==='generating'&&!active.player.snapshot().hasAudio){active.status=event.sections>1?`Preparing speech · part ${Number(event.section)||1} of ${event.sections}`:'Preparing speech…';active.purpose==='preview'?updateTestControls():updateControls();}
  }
  async function receiveResult(active,result) {
    if((active.purpose==='preview'?testSession:session)!==active||!active.accepting||result.requestId!==active.requestId)return;
    if(result.recording)active.recording={...result.recording};
    if(result.complete!==true)throw new Error('Speech generation did not complete. Generate it again to retry.');
    // The completed payload is also returned for replay/export consumers. Stream
    // events already queued its audio, so decoding it again would repeat speech.
    if(!active.received.size){const clips=Array.isArray(result.audioClips)&&result.audioClips.length?result.audioClips:result.audioBase64?[{audioBase64:result.audioBase64,mime:result.mime}]:[];for(const clip of clips){if(!active.accepting)return;await active.player.append(clip);}}
    if(!active.accepting)return;active.final=true;active.generationComplete=true;active.cacheKey=result.cacheKey||null;active.status=result.cacheSource==='session'?'Playing session audio':result.cached?'Playing saved audio':'Playing';await active.player.finish();
    if(!active.player.snapshot().hasAudio)throw new Error('The provider returned no playable speech.');
    if(active.purpose==='conversation')scheduleAvailability();
    if(active.purpose==='conversation'&&active.player.snapshot().playing)await protectPlayback(true,active);
    active.purpose==='preview'?updateTestControls():updateControls();
  }
  async function speak(index) {
    if(!settings.enabled)return;const message=context.messages[index];if(!message||(message.role==='reasoning'&&!settings.includeThinking))return;
    const text=speechText(message),proofPromise=messageProof(message);
    stopPreview();cancel();const run=++generation;const active=freshSession('conversation',{sourceId:context.sourceId,messageId:String(message.id),thinking:message.role==='reasoning'});session=active;
    // Prime Web Audio during this button activation, before persistence/network.
    const primed=active.player.play();$('tts-pill').hidden=false;updateControls();attach(context);
    try{await primed;await flush();const proof=await proofPromise;if(run!==generation||session!==active)return;if(!text&&!proof.fingerprint){cancel();options.toast?.('This message has no text to read with the current speech settings.');return;}if(context.sourceId!==active.sourceId||context.messages[index]!==message||String(message.id)!==active.messageId||speechText(message)!==text||proof.fullText!==null&&fullMessageText(message)!==proof.fullText){cancel();return;}await receiveResult(active,await invoke('tts.synthesize',{requestId:active.requestId,text,sourceId:active.sourceId,messageId:active.messageId,thinking:active.thinking,...(proof.fingerprint?{messageFingerprint:proof.fingerprint}:{})}));}
    catch(error){if(session!==active||!active.accepting)return;active.status=error.message||'Speech could not be prepared';active.failed=true;active.final=true;active.generationComplete=false;active.accepting=false;active.player.pause();updateControls();options.toast?.(active.status);}
  }
  async function startPreview() {
    const text=$('tts-test-text').value.trim();if(!text){selectSection('test');$('tts-test-text').focus();return;}
    cancel();stopPreview('Preparing test…');const run=++testGeneration;const active=freshSession('preview');testSession=active;
    const primed=active.player.play();updateTestControls();
    const apiKey=$('tts-api-key').value;const request={requestId:active.requestId,text,settings:active.profile,...(keyDraftDirty||apiKey?{apiKey}:{})};
    try{await primed;if(run!==testGeneration||testSession!==active)return;await receiveResult(active,await invoke('tts.preview',request));}
    catch(error){if(testSession!==active||!active.accepting)return;active.status=error.message||'The voice test could not be prepared';active.failed=true;active.final=true;active.generationComplete=false;active.accepting=false;active.player.dispose();updateMeters({rms:0,db:-120,peak:0});updateTestControls();}
  }
  function setTransportIcon(button,name,label) {
    // Keep the hit target stable between pointerdown and pointerup. Updating a
    // time label must not replace the SVG underneath a mouse press.
    if(button.dataset.transportIcon!==name){button.innerHTML=icon(name);button.dataset.transportIcon=name;}
    button.title=label;button.setAttribute('aria-label',label);
  }
  function playbackLabel(active,state) {
    if(active.failed||active.stopped)return active.status;
    if(state.ended)return 'Finished';if(!state.hasAudio)return state.paused?'Paused · preparing speech':active.status;
    if(state.buffering)return 'Buffering speech…';if(state.paused)return 'Paused';
    return /^Playing (saved|session) audio$/.test(active.status)?active.status:'Playing';
  }
  function updateControls() {
    if(!initialized)return;
    $('tts-pill-settings').hidden=!settings.showPillSettings;$('tts-pill-rate').hidden=!settings.showPillSpeed;$('tts-pill-rate').value=settings.playbackRate;
    if(!settings.showPillVolume)barVolumeOpen=false;const volumeOpen=settings.showPillVolume&&barVolumeOpen;$('tts-volume-toggle').hidden=!settings.showPillVolume;$('tts-volume-toggle').setAttribute('aria-expanded',String(volumeOpen));$('tts-volume-toggle').setAttribute('aria-label',volumeOpen?'Hide volume control':'Show volume control');$('tts-volume-toggle').title=volumeOpen?'Hide volume control':'Show volume control';$('tts-inline-volume').hidden=!volumeOpen;$('tts-pill-volume').value=Math.round(settings.volume*100);$('tts-pill-volume').title='Volume '+Math.round(settings.volume*100)+'%';paintRange($('tts-pill-volume'));
    if(!session)return;const state=session.player.snapshot(),playing=state.playing||state.buffering;
    setText('tts-pill-title',playbackLabel(session,state));$('tts-pill-title').title=$('tts-pill-title').textContent;
    const profile=session.recording||session.profile;$('tts-pill-subtitle').textContent=(providerNames[profile.provider]||profile.provider).replace(' · built-in CPU','')+' · '+(voices[profile.provider]?.find(v=>v.id===profile.voice)?.name||profile.voice||'Default voice');
    const regenerate=needsGeneration(session);setTransportIcon($('tts-play'),playing?'pause':'play',regenerate?'Generate speech again':playing?'Pause speech':'Play speech');$('tts-play').disabled=!regenerate&&((!state.hasAudio&&session.final)||session.failed);$('tts-replay').disabled=!regenerate&&(!state.hasAudio||session.failed);$('tts-replay').title=regenerate?'Generate speech again':'Replay speech from beginning';$('tts-replay').setAttribute('aria-label',$('tts-replay').title);
    paintProgress(session,'tts-seek','tts-indeterminate','tts-time');$('tts-seek').setAttribute('aria-label','Speech position');$('tts-pill').dataset.playbackState=state.buffering?'buffering':state.playing?'playing':state.ended?'ended':'paused';$('tts-pill').setAttribute('aria-busy',String(session.accepting&&!session.stopped&&!session.failed&&!(session.generationComplete&&state.complete)));
  }
  function updateMeters({rms=0,db=-120}={}) {
    const bounded=Math.max(-60,Math.min(0,Number.isFinite(Number(db))?Number(db):-120)),level=rms>0?(bounded+60)/60:0;
    for(const id of ['tts-test-meter','tts-provider-test-meter']){const meter=$(id);if(!meter)continue;meter.querySelector('span').style.transform=`scaleX(${level})`;meter.setAttribute('aria-valuenow',String(Math.round(bounded)));meter.setAttribute('aria-valuetext',rms>0?`${Math.round(bounded)} decibels`:'Silent');}
  }
  function updateTestControls(message) {
    if(!initialized)return;const state=testSession?.player.snapshot();const active=Boolean(testSession&&!testSession.failed);
    $('tts-test-stop').disabled=!testSession;$('tts-provider-test-stop').disabled=!testSession;$('tts-test-play').disabled=!testSession||(!state?.hasAudio&&testSession.final)||testSession.failed;
    const playing=state?.playing||state?.buffering;setTransportIcon($('tts-test-play'),playing?'pause':'play',playing?'Pause test audio':'Resume test audio');
    const status=message||(testSession?playbackLabel(testSession,state):'Ready to test the selected voice.');setText('tts-test-status',status);setText('tts-provider-test-status',status);
    $('tts-test-status').dataset.playbackState=state?.buffering?'buffering':state?.playing?'playing':state?.ended?'ended':active?'paused':'idle';
    paintProgress(testSession,'tts-test-seek','tts-test-indeterminate','tts-test-time');
    const profile=testSession?.profile||settings;$('tts-test-provider').textContent=(providerNames[profile.provider]||profile.provider)+' · '+(voices[profile.provider]?.find(v=>v.id===profile.voice)?.name||profile.voice||'Default voice');
  }
  async function togglePlayback(active) {
    if(active?.purpose==='conversation'&&needsGeneration(active))return restartConversation(active);
    if(!active||active.failed||(!active.player.snapshot().hasAudio&&active.final))return;const state=active.player.snapshot();
    if(state.playing||state.buffering)active.player.pause();else{active.stopped=false;if(active.purpose==='conversation')await protectPlayback(true,active);if((active.purpose==='preview'?testSession:session)!==active)return;await active.player.play();}
    active.purpose==='preview'?updateTestControls():updateControls();
  }
  function stopConversation() {
    const active=session;if(!active)return;
    active.accepting=false;active.stopped=true;active.final=true;active.status=active.generationComplete?'Stopped':'Stopped · incomplete. Generate again to replay.';
    if(active.generationComplete)active.player.stop();else active.player.dispose();
    void protectPlayback(false,active);invoke('tts.cancel',{requestId:active.requestId}).catch(()=>{});updateControls();
  }
  function pillMarkup(){return `<section id="tts-pill" class="tts-pill" aria-label="TTS bar" hidden><div class="tts-pill-main"><button type="button" class="tts-control tts-primary-control" id="tts-play" title="Play speech" aria-label="Play speech">${icon('play')}</button><button type="button" class="tts-control" id="tts-stop" title="Stop speech" aria-label="Stop speech">${icon('stop')}</button><button type="button" class="tts-control" id="tts-replay" title="Replay received audio from beginning" aria-label="Replay received audio from beginning">${icon('replay')}</button><div class="tts-pill-caption"><strong id="tts-pill-title" role="status" aria-live="polite">Preparing speech…</strong><span id="tts-pill-subtitle"></span></div><select id="tts-pill-rate" aria-label="Playback speed" title="Playback speed" hidden>${[0.5,0.75,1,1.25,1.5,1.75,2].map(n=>`<option value="${n}">${n}×</option>`).join('')}</select><button type="button" id="tts-volume-toggle" class="tts-control" aria-label="Show volume control" title="Show volume control" aria-expanded="false" aria-controls="tts-inline-volume" hidden>${icon('volume')}</button><button type="button" class="tts-control" id="tts-pill-settings" title="Text-to-Speech settings" aria-label="Text-to-Speech settings" hidden>${icon('pill-settings')}</button><button type="button" class="tts-control" id="tts-close" title="Stop and close" aria-label="Stop and close speech">${icon('close')}</button></div><div class="tts-pill-timeline"><div class="tts-progress-slot"><div id="tts-indeterminate" class="tts-indeterminate" role="progressbar" aria-label="Generating speech; final duration is not available yet" aria-busy="false" hidden></div><input id="tts-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Speech position" disabled></div><div id="tts-inline-volume" class="tts-volume-inline" hidden><input id="tts-pill-volume" type="range" min="0" max="100" step="1" value="100" aria-label="Speech volume"></div><span id="tts-time">0:00 / 0:00</span></div></section>`;}
  function closeDelete(){deleteToken='';$('tts-delete-confirm').hidden=true;}
  function renderCachePage(resetScroll=false) {
    const list=$('tts-cache-list'),pages=Math.max(1,Math.ceil(cacheEntries.length/cachePageSize)),previous=cachePage;cachePage=Math.max(0,Math.min(cachePage,pages-1));
    list.classList.toggle('is-empty',!cacheEntries.length);
    list.innerHTML=cacheEntries.length?cacheEntries.slice(cachePage*cachePageSize,(cachePage+1)*cachePageSize).map(entry=>`<div class="tts-cache-entry"><label><input type="checkbox" data-cache-select="${esc(entry.key)}"${selected.has(entry.key)?' checked':''}><span><strong>${esc((providerNames[entry.provider]||entry.provider).replace(' · built-in CPU',''))} · ${esc(entry.voice||'Default voice')}</strong><small>${esc(new Date(entry.createdAt).toLocaleDateString())} · ${fmtBytes(entry.bytes)}${entry.complete===false?' · incomplete':''}</small></span></label><button type="button" class="icon-button${entry.pinned?' active':''}" data-cache-pin="${esc(entry.key)}"${entry.orphan?' disabled':''} aria-pressed="${!!entry.pinned}" title="${entry.pinned?'Unpin':'Pin'} saved audio" aria-label="${entry.pinned?'Unpin':'Pin'} saved audio">${icon('pin')}</button></div>`).join(''):'<p class="field-help">No saved audio.</p>';
    $('tts-cache-pagination').hidden=pages<=1;$('tts-cache-page').textContent=`Page ${cachePage+1} of ${pages}`;$('tts-cache-prev').disabled=cachePage===0;$('tts-cache-next').disabled=cachePage>=pages-1;
    if(resetScroll||previous!==cachePage)list.scrollTop=0;
  }
  async function refreshCache(){try{
    const result=await invoke('tts.cache.list');cacheEntries=result.entries||[];cacheSession=result.session||{count:0,totalBytes:0};$('tts-cache-session').hidden=!cacheSession.count;$('tts-cache-session').textContent=cacheSession.count+' temporary recordings · '+fmtBytes(cacheSession.totalBytes||0)+' · kept for this session';
    const keys=new Set(cacheEntries.map(entry=>entry.key));selected=new Set([...selected].filter(key=>keys.has(key)));$('tts-cache-summary').textContent=cacheEntries.length+' clips · '+fmtBytes(result.totalBytes||0);$('tts-cache-manager').querySelector('.tts-cache-cleanup').hidden=!cacheEntries.length&&!cacheSession.count;
    $('tts-delete-scope').querySelector('option[value=selected]').disabled=!cacheEntries.length;if(!cacheEntries.length&&cacheSession.count&&$('tts-delete-scope').value==='selected')$('tts-delete-scope').value='all';renderCachePage();closeDelete();scheduleAvailability();clearError('cache-list');
  }catch(error){showError(error,'cache-list');}}
  function cacheFilter(){const scope=$('tts-delete-scope').value;return {scope,includePinned:$('tts-include-pinned').checked,...(scope==='selected'?{keys:[...selected]}:{}),...(scope==='conversation'?{sourceId:options.getSourceId()}:{}),...(scope==='provider'?{provider:settings.provider}:{}),...(scope==='older'?{olderThanDays:Number($('tts-delete-age').value)}:{})};}
  function bind(){
    document.addEventListener('input',event=>{if(event.target.matches?.('#settings-dialog input[type=range],.tts-pill input[type=range]'))paintRange(event.target);});
    document.querySelectorAll('[data-settings-tab]').forEach(button=>{button.addEventListener('click',()=>selectTab(button.dataset.settingsTab));button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();selectTab(event.key==='Home'?'reading':event.key==='End'?'tts':button.dataset.settingsTab==='reading'?'tts':'reading',true);}});});
    $('reading-settings').addEventListener('click',()=>selectTab('reading'));
    $('tts-settings-panel').addEventListener('change',event=>{const el=event.target;if(el.dataset.ttsSetting){const key=el.dataset.ttsSetting;changed(key,el.type==='checkbox'?el.checked:Number(el.value));}else if(el.dataset.ttsProfile){const key=el.dataset.ttsProfile;changed(key,key==='timeoutSeconds'?Number(el.value):el.value);}});
    $('tts-provider').addEventListener('change',async()=>{const provider=$('tts-provider').value;cancel();stopPreview();settings.providerProfiles[settings.provider]=Object.fromEntries(profiles.map(key=>[key,settings[key]]));settings.provider=provider;Object.assign(settings,profileDefaults[provider],settings.providerProfiles[provider]||{});$('tts-api-key').value='';keyDraftDirty=false;$('tts-passphrase').value='';$('tts-remember-key').checked=false;$('tts-voices').innerHTML='';$('tts-discovery-note').textContent='Manual model and voice IDs are also supported.';renderSettings();queueSave();try{await flush();await refreshCredentials();}catch{}});
    $('tts-voice').addEventListener('change',()=>{if($('tts-voice').value==='__manual__'){$('tts-voice-id').hidden=false;$('tts-voice-id').focus();}else{$('tts-voice-id').hidden=true;changed('voice',$('tts-voice').value);}});
    $('tts-sessionCacheMaxMiB').addEventListener('input',()=>{const limit=memoryLimits[Number($('tts-sessionCacheMaxMiB').value)]||64;paintMemoryLimit(limit);changed('sessionCacheMaxMiB',limit);});
    $('tts-cache-size').addEventListener('change',()=>changed('cacheMaxBytes',Math.round(Number($('tts-cache-size').value)*1073741824)));
    $('tts-api-key').addEventListener('input',()=>{keyDraftDirty=true;});
    $('tts-remember-key').addEventListener('change',updateKeyStatus);
    $('tts-set-key').addEventListener('click',async()=>{try{await flush();await invoke('tts.credentials.set',{provider:settings.provider,apiKey:$('tts-api-key').value,endpoint:settings.endpoint,remember:$('tts-remember-key').checked,...($('tts-remember-key').checked?{passphrase:$('tts-passphrase').value}:{})});$('tts-api-key').value='';keyDraftDirty=false;$('tts-passphrase').value='';await refreshCredentials();}catch(error){showError(error);}});
    $('tts-clear-key').addEventListener('click',async()=>{try{await invoke('tts.credentials.set',{provider:settings.provider,apiKey:'',endpoint:settings.endpoint});$('tts-api-key').value='';keyDraftDirty=false;$('tts-passphrase').value='';await refreshCredentials();}catch(error){showError(error);}});
    $('tts-unlock-key').addEventListener('click',async()=>{try{await flush();await invoke('tts.credentials.unlock',{provider:settings.provider,endpoint:settings.endpoint,passphrase:$('tts-passphrase').value});$('tts-api-key').value='';keyDraftDirty=false;$('tts-passphrase').value='';await refreshCredentials();}catch(error){$('tts-passphrase').value='';showError(error);}});
    $('tts-forget-key').addEventListener('click',async()=>{try{await invoke('tts.credentials.forget',{provider:settings.provider,endpoint:settings.endpoint});$('tts-api-key').value='';keyDraftDirty=false;$('tts-passphrase').value='';$('tts-remember-key').checked=false;await refreshCredentials();}catch(error){showError(error);}});
    $('tts-discover').addEventListener('click',async()=>{const button=$('tts-discover');button.disabled=true;try{const draft=currentDraft(),provider=draft.provider;const apiKey=$('tts-api-key').value;const result=await invoke('tts.providers.discover',{provider,endpoint:draft.endpoint,model:draft.model,...(keyDraftDirty||apiKey?{apiKey}:{})});if(provider!==settings.provider)return;discovery[provider]={...result,selectedModel:draft.model};$('tts-models').innerHTML=(result.models||[]).map(v=>`<option value="${esc(v.id)}">${esc(v.name||v.id)}</option>`).join('');renderVoiceChoices();$('tts-discovery-note').textContent=[`${result.models?.length||0} models · ${result.voices?.length||0} voices`,...(result.warnings||[])].join('. ');}catch(error){showError(error);}finally{button.disabled=false;}});
    $('thread-content').addEventListener('click',event=>{const button=event.target.closest('[data-tts-index]');if(button){event.preventDefault();speak(Number(button.dataset.ttsIndex));}});
    $('tts-play').addEventListener('click',()=>{togglePlayback(session).catch(showError);});
    $('tts-stop').addEventListener('click',stopConversation);
    $('tts-replay').addEventListener('click',async()=>{const active=session;if(needsGeneration(active)){await restartConversation(active);return;}if(!active?.player.snapshot().hasAudio)return;active.stopped=false;await protectPlayback(true,active);if(session===active)await active.player.replay();});
    $('tts-close').addEventListener('click',cancel);$('tts-pill-settings').addEventListener('click',()=>{selectTab('tts');selectSection('playback');options.openSettings();});
    $('tts-pill-rate').addEventListener('change',()=>{changed('playbackRate',Number($('tts-pill-rate').value));$('tts-playbackRate').value=settings.playbackRate;});
    $('tts-volume').addEventListener('input',()=>setVolume(Number($('tts-volume').value)/100));$('tts-pill-volume').addEventListener('input',()=>setVolume(Number($('tts-pill-volume').value)/100));
    $('tts-volume-toggle').addEventListener('click',()=>{barVolumeOpen=!barVolumeOpen;updateControls();if(barVolumeOpen)$('tts-pill-volume').focus();});
    $('tts-pill-volume').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();barVolumeOpen=false;updateControls();$('tts-volume-toggle').focus();}});
    $('tts-seek').addEventListener('input',()=>{seekToFraction(session,$('tts-seek'));});
    $('tts-test-start').addEventListener('click',startPreview);$('tts-provider-test-start').addEventListener('click',startPreview);
    $('tts-test-play').addEventListener('click',()=>togglePlayback(testSession).catch(showError));$('tts-test-stop').addEventListener('click',()=>stopPreview());$('tts-provider-test-stop').addEventListener('click',()=>stopPreview());
    $('tts-test-seek').addEventListener('input',()=>{seekToFraction(testSession,$('tts-test-seek'));});
    document.querySelectorAll('[data-tts-section]').forEach(button=>{button.addEventListener('click',()=>selectSection(button.dataset.ttsSection));button.addEventListener('keydown',event=>{const names=['playback','providers','test','cache'],index=names.indexOf(button.dataset.ttsSection);if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();selectSection(names[event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4],true);}});});
    $('tts-cache-refresh').addEventListener('click',refreshCache);
    $('tts-cache-prev').addEventListener('click',()=>{cachePage--;renderCachePage(true);closeDelete();});$('tts-cache-next').addEventListener('click',()=>{cachePage++;renderCachePage(true);closeDelete();});
    window.addEventListener('focus',()=>scheduleAvailability());document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleAvailability();});
    $('tts-cache-list').addEventListener('change',event=>{const key=event.target.dataset.cacheSelect;if(key===undefined)return;if(cacheEntries.some(entry=>entry.key===key)){event.target.checked?selected.add(key):selected.delete(key);closeDelete();}});
    $('tts-cache-list').addEventListener('click',async event=>{const button=event.target.closest('[data-cache-pin]');if(!button)return;const entry=cacheEntries.find(entry=>entry.key===button.dataset.cachePin);if(!entry)return;try{await invoke('tts.cache.pin',{key:entry.key,pinned:!entry.pinned});clearError('cache-pin');await refreshCache();}catch(error){showError(error,'cache-pin');}});
    $('tts-delete-scope').addEventListener('change',()=>{$('tts-delete-age-group').hidden=$('tts-delete-scope').value!=='older';closeDelete();});$('tts-delete-age').addEventListener('change',closeDelete);$('tts-include-pinned').addEventListener('change',closeDelete);
    $('tts-delete-preview').addEventListener('click',async()=>{try{await flush();const filter=cacheFilter();if(filter.scope==='conversation'&&!filter.sourceId)throw new Error('Open a conversation before selecting this scope.');const result=await invoke('tts.cache.preview',{filter});deleteToken=result.token;$('tts-delete-summary').textContent=`Delete ${result.count} saved clips (${fmtBytes(result.bytes)}) and ${result.sessionCount||0} temporary recordings (${fmtBytes(result.sessionBytes||0)})? Protected: ${result.protectedCount||0} saved clips and ${result.sessionProtectedCount||0} temporary recordings will be kept.`;$('tts-delete-apply').disabled=!(result.count||result.sessionCount);$('tts-delete-confirm').hidden=false;clearError('cache-preview');}catch(error){showError(error,'cache-preview');}});
    $('tts-delete-cancel').addEventListener('click',closeDelete);$('tts-delete-apply').addEventListener('click',async()=>{if(!deleteToken)return;const token=deleteToken;closeDelete();try{await invoke('tts.cache.delete',{token});clearError('cache-delete');await refreshCache();}catch(error){showError(error,'cache-delete');}});
    $('settings-dialog').addEventListener('close',()=>{stopPreview();flush().catch(()=>{});});window.addEventListener('pagehide',()=>{flush().catch(()=>{});cancel();stopPreview();});
  }
  async function init(config){if(initialized)return;options=config;available=typeof window.alternative?.tts==='function'||typeof window.__THREADSHELF_TTS_PREVIEW?.invoke==='function';$('tts-settings-panel').innerHTML=panelMarkup();const host=document.createElement('div');host.className='tts-pill-host';host.innerHTML=pillMarkup();document.querySelector('.reading-workspace').append(host);const resize=()=>{host.style.width=$('reader-scroll').getBoundingClientRect().width+'px';};new ResizeObserver(resize).observe($('reader-scroll'));resize();initialized=true;bind();const eventBridge=window.alternative?.onTtsEvent?window.alternative:window.__THREADSHELF_TTS_PREVIEW;if(typeof eventBridge?.onTtsEvent==='function')eventBridge.onTtsEvent(onTtsEvent);else if(typeof eventBridge?.onEvent==='function')eventBridge.onEvent(onTtsEvent);try{if(available)settings={...settings,...await invoke('tts.settings.get')};else{for(const element of $('tts-settings-panel').querySelectorAll('input,select,textarea,button:not([data-tts-section])'))element.disabled=true;$('tts-error').textContent='Text-to-Speech is available in the desktop application.';$('tts-error').hidden=false;}}catch(error){showError(error);$('tts-enabled').disabled=true;}renderSettings();updateTestControls();document.querySelectorAll('#settings-dialog input[type=range],.tts-pill input[type=range]').forEach(paintRange);if(available)await refreshCredentials();if(settings.warning)showError(new Error(settings.warning));attach(context);}
  window.TSATTS=Object.freeze({init,attach,cancel:()=>{cancel();stopPreview();},flush,playbackSnapshot:()=>session?.player.snapshot()||null,previewSnapshot:()=>testSession?.player.snapshot()||null});
})();
