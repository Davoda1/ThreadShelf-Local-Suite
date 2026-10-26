/* ThreadShelf Local Alternative 1.2.0 — isolated archive rendering. */
(function () {
  'use strict';
  const rich = window.TSARich;
  const sources = new Map();
  let sequence = 0;
  let diagramSequence = 0;
  let diagramQueue = Promise.resolve();
  const labels = {user: 'You', assistant: 'Assistant', reasoning: 'Reasoning', system: 'System', tool: 'Tool'};
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  function safeUrl(value, image = false) {
    const text = String(value || '').trim();
    if (text.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(text)) return null;
    try {
      const url = new URL(text);
      if (url.username || url.password) return null;
      if (['http:', 'https:'].includes(url.protocol) || (!image && url.protocol === 'mailto:')) return url.href;
    } catch { /* An archive-local/sandbox URL cannot be resolved by this app. */ }
    return null;
  }
  // Only explicit raster data and HTTP(S) image sources can be mounted. Sources
  // stay inert until bind applies the current image-loading preference.
  const RASTER_DATA = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i;
  function safeImageSource(value) {
    if (typeof value !== 'string' || !value || value.length > 8 * 1024 * 1024) return null;
    if (RASTER_DATA.test(value)) {
      const payload = value.slice(value.indexOf(',') + 1);
      return payload.length % 4 === 0 ? value : null;
    }
    return safeUrl(value, true);
  }
  // A linked image is never an external-browser action. Split only the image
  // out of its link and retain neighboring linked text and inline formatting.
  function unlinkImages(container) {
    const split = node => {
      if (node.nodeType === 1 && node.classList.contains('tsa-image-slot')) return [{node, image:true}];
      if (node.nodeType !== 1 || !node.querySelector('.tsa-image-slot')) return [{node:node.cloneNode(true), image:false}];
      return [...node.childNodes].flatMap(split).map(part => {
        if (part.image) return part;
        const parent = node.cloneNode(false); parent.append(part.node);
        return {node:parent,image:false};
      });
    };
    for (const anchor of [...container.querySelectorAll('a')]) {
      if (!anchor.querySelector('.tsa-image-slot')) continue;
      const fragment = anchor.ownerDocument.createDocumentFragment(); let textLink = null;
      for (const part of [...anchor.childNodes].flatMap(split)) {
        if (part.image) { fragment.append(part.node); textLink = null; }
        else {
          if (!textLink) { textLink=anchor.cloneNode(false); fragment.append(textLink); }
          textLink.append(part.node);
        }
      }
      anchor.replaceWith(fragment);
    }
  }
  function textValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join('\n\n');
    if (typeof value === 'object') {
      if (value.text !== undefined) return textValue(value.text);
      if (value.parts !== undefined) return textValue(value.parts);
      if (value.content !== undefined) return textValue(value.content);
      if (value.type === 'image' || value.content_type === 'image_asset_pointer' || value.image_url || value.asset_pointer) return '[Image attachment — not included in the readable export]';
      if (/audio|video/.test(value.type || value.content_type || '')) return '[Media attachment — not included in the readable export]';
      try { return JSON.stringify(value, null, 2); } catch { return '[Unavailable content]'; }
    }
    return '';
  }
  function rawMessages(thread) {
    const raw = thread.raw || thread;
    const mapping = raw.mapping;
    if (!mapping || typeof mapping !== 'object') return [];
    const branch = [];
    let current = raw.current_node;
    const seen = new Set();
    while (current && mapping[current] && !seen.has(current) && seen.size < 20000) {
      seen.add(current); const node = mapping[current];
      if (node.message) branch.push({...node.message, source_message_id:node.message.id, source_node_id:current});
      current = node.parent;
    }
    if (branch.length) return branch.reverse();
    return Object.entries(mapping).filter(([,node]) => node?.message).map(([id,node]) => ({...node.message, source_message_id:node.message.id, source_node_id:id})).sort((a, b) => (a.create_time || 0) - (b.create_time || 0));
  }
  function normalize(thread = {}) {
    let entries = Array.isArray(thread) ? thread : thread.turns || thread.messages;
    if (!Array.isArray(entries)) entries = rawMessages(thread);
    const resolveContext = rich?.Context?.createRichContextResolver(thread.raw ? thread : {...thread, raw:thread}) || (() => ({}));
    const result = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = typeof entries[index] === 'object' && entries[index] !== null ? entries[index] : {content: entries[index]};
      const fields = ['user', 'thinking', 'ai'].filter(key => entry[key] !== undefined && entry[key] !== null);
      const items = fields.length ? fields.map(key => ({role: key === 'user' ? 'user' : key === 'thinking' ? 'reasoning' : ['tool','system'].includes(entry.source_role) ? entry.source_role : 'assistant', content: entry[key]})) : [{role: entry.role || entry.author?.role || entry.source_role || 'assistant', content: entry.content ?? entry.text ?? ''}];
      for (const item of items) {
        let role = String(item.role).toLowerCase();
        if (['thinking', 'analysis', 'reasoning'].includes(role) || (role === 'assistant' && (entry.channel || entry.metadata?.channel) === 'analysis')) role = 'reasoning';
        if (!Object.hasOwn(labels, role)) role = 'assistant';
        const content = textValue(item.content);
        if (!content.trim() && !entry.model) continue;
        let createdAt = entry.createdAt ?? entry.created_at ?? entry.create_time ?? '';
        if (typeof createdAt === 'number' && createdAt > 0 && createdAt < 1e12) createdAt = createdAt * 1000;
        const turnIndex = Number.isSafeInteger(Number(entry.turnIndex ?? entry.turn_index)) ? Number(entry.turnIndex ?? entry.turn_index) : index;
        result.push({id: `message-${result.length}`, role, content, model: String(entry.model || entry.metadata?.model_slug || ''), createdAt, turnIndex, richContext: resolveContext(entry)});
      }
    }
    return result;
  }
  function codeLanguage(value) {
    return String(value || 'text').trim().split(/\s/)[0].slice(0, 40).replace(/[^a-zA-Z0-9_+#.\/-]/g, '') || 'text';
  }
  const renderer = window.marked ? new window.marked.Renderer() : null;
  if (renderer) {
    renderer.html = token => escape(token.raw || token.text || token);
    renderer.code = token => {
      const rawFence = String(token.lang || '');
      const source = String(token.text || '');
      const parsed = window.TSAHighlight?.render(source, rawFence);
      const language = parsed?.language || codeLanguage(rawFence).toLowerCase();
      const label = parsed?.label || language;
      const reason = parsed?.reason || 'plain';
      const html = parsed?.html ?? escape(source);
      return `<div class="tsa-code-block" data-code-language="${escape(language)}" data-highlight="${escape(reason)}"><div class="tsa-code-toolbar"><span${rawFence ? ` title="Original fence: ${escape(rawFence)}"` : ''}>${escape(label)}</span><button type="button" data-copy-code aria-label="Copy ${escape(label)} code">Copy code</button></div><pre><code class="hljs language-${escape(language)}">${html}</code></pre></div>\n`;
    };
    renderer.link = function (token) {
      const label = this.parser.parseInline(token.tokens || []);
      const url = safeUrl(token.href);
      return url ? `<a href="${escape(url)}" rel="noopener noreferrer" target="_blank"${token.title ? ` title="${escape(token.title)}"` : ''}>${label}</a>` : `<span class="tsa-unavailable-link" title="This saved link cannot be opened here">${label}</span>`;
    };
    renderer.image = token => {
      const url = safeImageSource(token.href);
      const label = token.text || token.title || 'Archived image';
      const host = url && !/^data:/i.test(url) ? new URL(url).hostname : 'embedded image';
      return `<span class="tsa-image-slot" role="group" aria-label="${escape(label)}" data-image-state="${url ? 'deferred' : 'missing'}"><span class="tsa-image-icon" aria-hidden="true">▧</span><span class="tsa-image-label">${escape(label)}</span>${url ? `<button type="button" data-load-image="${escape(url)}" data-image-alt="${escape(label)}" aria-label="Load image · ${escape(label)}" title="Load this image here from ${escape(host)}">Load image · ${escape(host)}</button>` : '<span class="tsa-image-note">Image not available in this export</span>'}</span>`;
    };
  }
  function sanitize(html) {
    const template = document.createElement('template'); template.innerHTML = html;
    const allowed = new Set(['P','BR','HR','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','UL','OL','LI','STRONG','B','EM','I','DEL','S','CODE','PRE','A','TABLE','THEAD','TBODY','TFOOT','TR','TH','TD','SPAN','DIV','SUP','SUB','KBD','BUTTON','INPUT']);
    const attributes = new Set(['class','title','href','target','rel','align','start','colspan','rowspan','type','disabled','checked','role','aria-label','data-code-language','data-highlight','data-copy-code','data-load-image','data-image-alt','data-image-state']);
    for (const element of [...template.content.querySelectorAll('*')]) {
      if (!allowed.has(element.tagName)) { element.replaceWith(document.createTextNode(element.textContent || '')); continue; }
      for (const attr of [...element.attributes]) if (!attributes.has(attr.name) || /^on/i.test(attr.name)) element.removeAttribute(attr.name);
      if (element.tagName === 'A') {
        const url = safeUrl(element.getAttribute('href'));
        if (url) { element.setAttribute('href',url); element.setAttribute('rel','noopener noreferrer'); element.setAttribute('target','_blank'); } else element.removeAttribute('href');
      }
      if (element.hasAttribute('data-load-image') && !safeImageSource(element.getAttribute('data-load-image'))) element.removeAttribute('data-load-image');
      if (element.tagName === 'INPUT') { element.type = 'checkbox'; element.disabled = true; }
    }
    template.content.querySelectorAll('table').forEach(table => { const div = document.createElement('div'); div.className='tsa-table-scroll'; div.tabIndex=0; div.setAttribute('role','region'); div.setAttribute('aria-label','Scrollable table'); table.replaceWith(div); div.append(table); });
    unlinkImages(template.content);
    return template.innerHTML;
  }
  function basicMarkdown(text) {
    if (!renderer) return `<pre class="tsa-plain-fallback">${escape(text)}</pre>`;
    const protectedMath = rich?.Math?.protectMathInMarkdown(text) || {content: text, ids: []};
    try {
      const html = sanitize(window.marked.parse(protectedMath.content,{renderer,gfm:true,breaks:true}));
      return rich?.Math ? rich.Math.restoreMathPlaceholders(html,protectedMath.ids) : html;
    } catch {
      rich?.Math?.discardMathRecords(protectedMath.ids);
      return `<pre class="tsa-plain-fallback">${escape(text)}</pre>`;
    }
  }
  function markdown(text, context = {}, role = '') {
    const value = textValue(text);
    const jsonCode = window.TSAJsonResponse?.formatJsonResponse(value, role);
    if (jsonCode != null) {
      // Keep JSON literal: do not interpret embedded rich tags, math or HTML.
      // The sources map still retains the exact archived message for copying.
      return renderer ? sanitize(renderer.code({text:jsonCode, lang:'json'}))
        : `<pre class="tsa-plain-fallback">${escape(jsonCode)}</pre>`;
    }
    if (value.length > 2 * 1024 * 1024) return `<pre class="tsa-plain-fallback">${escape(value)}</pre>`;
    try {
      if (rich) {
        const prepared = rich.Parser.prepareRichMarkdown(value);
        if (prepared.literalOnly) return `<pre class="tsa-plain-fallback">${escape(value)}</pre>`;
        return rich.Renderer.renderRichHtml(basicMarkdown(prepared.content),prepared.records,{renderMarkdown:basicMarkdown,context});
      }
      return basicMarkdown(value);
    } catch { return basicMarkdown(value); }
  }
  /** Mark literal search matches across inline token spans without flattening
   * syntax markup or joining text across separate semantic blocks. Returned
   * groups contain every DOM segment belonging to one logical search hit. */
  function markMatches(root, query, className = 'tsa-query-hit') {
    const needle = String(query || '').trim();
    if (!root || !needle || needle.length > 1000) return [];
    const doc = root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const groups = [];
    let activeBlock = null, activeGroup = null;
    const blockSelector = 'p,pre,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,summary,.rich-text,.rich-title,.rich-caption';
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent) continue;
      if (node.parentElement?.closest('button,svg,mjx-container,script,style,.chatgpt-math-placeholder')) { activeBlock = null; activeGroup = null; continue; }
      let block = node.parentElement?.closest(blockSelector);
      if (!block || !root.contains(block)) {
        block = node.parentElement;
        // Loose text within inline markup belongs to its nearest non-inline
        // container, so emphasis and links do not split a searchable phrase.
        while (block && block.parentElement && block.parentElement !== root && /^(?:SPAN|A|STRONG|B|EM|I|CODE|DEL|S|SUP|SUB|KBD|MARK)$/.test(block.tagName)) block = block.parentElement;
      }
      block = block || root;
      if (block !== activeBlock || !activeGroup) { activeBlock = block; activeGroup = {text: '', nodes: []}; groups.push(activeGroup); }
      const group = activeGroup;
      group.nodes.push({node, start: group.text.length, end: group.text.length + node.textContent.length});
      group.text += node.textContent;
    }
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = [];
    for (const group of groups) {
      const ranges = [];
      for (const match of group.text.matchAll(pattern)) {
        if (matches.length >= 2000) break;
        const segments = [];
        ranges.push({start: match.index, end: match.index + match[0].length, segments});
        matches.push(segments);
      }
      if (!ranges.length) continue;
      let rangeStart = 0;
      for (const entry of group.nodes) {
        while (rangeStart < ranges.length && ranges[rangeStart].end <= entry.start) rangeStart++;
        if (rangeStart >= ranges.length) break;
        const value = entry.node.textContent;
        const fragment = doc.createDocumentFragment();
        let last = 0, changed = false;
        for (let i = rangeStart; i < ranges.length && ranges[i].start < entry.end; i++) {
          const range = ranges[i];
          const begin = Math.max(0, range.start - entry.start);
          const end = Math.min(value.length, range.end - entry.start);
          if (begin >= end) continue;
          fragment.append(doc.createTextNode(value.slice(last, begin)));
          const mark = doc.createElement('mark'); mark.className = className;
          mark.textContent = value.slice(begin, end); fragment.append(mark);
          range.segments.push(mark); last = end; changed = true;
        }
        if (changed) { fragment.append(doc.createTextNode(value.slice(last))); entry.node.replaceWith(fragment); }
      }
      if (matches.length >= 2000) break;
    }
    return matches.filter(segments => segments.length);
  }
  function highlight(html, query) {
    if (!String(query || '').trim()) return html;
    const template = document.createElement('template'); template.innerHTML = html;
    markMatches(template.content, query);
    return template.innerHTML;
  }
  function words(value) { return (String(value).match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) || []).length; }
  function summary(value, length=90) { const text=value.replace(/[#*_`>]/g,'').replace(/\s+/g,' ').trim(); return text.length>length ? text.slice(0,length-1)+'…' : text; }
  function renderThread(thread,options={}) {
    sources.clear(); rich?.Math?.clearPendingMath();
    const messages=normalize(thread).filter(message=>!window.TSAVisibility?.isHiddenThoughtsMessage(message)); const run=++sequence;
    const providerLabel=({chatgpt:'ChatGPT',openai:'ChatGPT',claude:'Claude',anthropic:'Claude'})[String(thread?.provider||'').toLowerCase()]||'Assistant';
    const metrics={messages:messages.length,user:0,assistant:0,reasoning:0,tool:0,system:0,words:0,characters:0,readingMinutes:0};
    const outline=[];
    const html=messages.map((message,index)=>{
      metrics[message.role]++;metrics.words+=words(message.content);metrics.characters+=message.content.length;
      if(message.role==='user')outline.push({id:message.id,label:summary(message.content)||`Prompt ${outline.length+1}`,index,role:message.role});
      const key=`${run}-${index}`;sources.set(key,message.content);
      const date=new Date(message.createdAt); const time=message.createdAt && Number.isFinite(date.getTime()) ? `<time datetime="${escape(date.toISOString())}" title="${escape(date.toLocaleString())}">${escape(date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}</time>` : '';
      const label=message.role==='assistant'?providerLabel:labels[message.role];
      const header=`<div class="tsa-message-meta"><span class="tsa-role">${label}</span>${message.model ? `<span class="tsa-model">${escape(message.model)}</span>` : ''}${time}<button type="button" class="tsa-copy-message" data-copy-message aria-label="Copy ${label.toLowerCase()} message">Copy</button></div>`;
      const body=`<div class="message-content">${highlight(markdown(message.content,message.richContext,message.role),options.query)}</div>`;
      const fold=['reasoning','tool','system'].includes(message.role);
      return `<article id="${message.id}" class="tsa-message message tsa-${message.role}" data-role="${message.role}" data-message-index="${index}" data-source-key="${key}" tabindex="-1">${header}${fold ? `<details class="tsa-message-details"${message.role==='reasoning'&&options.showReasoning?' open':''}><summary>${message.role==='reasoning'?'Reasoning notes':'Saved '+labels[message.role].toLowerCase()+' message'}<span>${words(message.content).toLocaleString()} words</span></summary>${body}</details>`:body}</article>`;
    }).join('');
    metrics.readingMinutes=metrics.words?Math.max(1,Math.ceil(metrics.words/220)):0;
    return {html:html||'<p class="tsa-empty-thread">This conversation has no readable messages.</p>',outline,metrics,messages};
  }
  function plainText(thread) { return normalize(thread).map(message=>`${labels[message.role]}${message.model?' · '+message.model:''}\n\n${message.content}`).join('\n\n────────────────────\n\n'); }
  async function clipboard(text, custom) {
    if(custom) return custom(text);
    if(navigator.clipboard?.writeText) {try{return await navigator.clipboard.writeText(text);}catch{}}
    const previous=document.activeElement;const textarea=document.createElement('textarea');textarea.value=text;textarea.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(textarea);textarea.select();const ok=document.execCommand('copy');textarea.remove();previous?.focus?.();if(!ok)throw new Error('Copy unavailable');
  }
  function status(button,text) { const before=button.textContent;button.textContent=text;setTimeout(()=>{if(button.isConnected)button.textContent=before;},1400); }
  function sanitizeDiagram(svg) {
    const template=document.createElement('template');template.innerHTML=svg;
    for(const element of template.content.querySelectorAll('script,foreignObject,iframe,object,embed'))element.remove();
    for(const style of template.content.querySelectorAll('style')) { if(/@import|@font-face|\\/i.test(style.textContent)) style.remove(); else style.textContent=style.textContent.replace(/url\s*\([^)]*\)/gi,'none'); }
    for(const element of template.content.querySelectorAll('*'))for(const attr of [...element.attributes])if(/^on/i.test(attr.name)||(/^(href|xlink:href)$/i.test(attr.name)&&!attr.value.startsWith('#')))element.removeAttribute(attr.name);
    return template.innerHTML;
  }
  const mermaidStates = new WeakMap();
  function diagramTheme() {
    const theme = document.documentElement.dataset.theme;
    return theme === 'dark' || (theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function configureDiagrams() {
    if (!window.mermaid?.render) return false;
    window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:diagramTheme()==='dark'?'dark':'default',suppressErrorRendering:true,htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:50000,maxEdges:500,secure:['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','htmlLabels','theme','themeCSS','themeVariables','fontFamily','fontSize']});
    return true;
  }
  function safeDiagramSource(source) {
    // Archive-provided configuration cannot override the reader's security,
    // fonts, theme or renderer. The unmodified source remains separately kept.
    return source.replace(/^\uFEFF/, '').replace(/%%\{[\s\S]*?\}%%/g, '').replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  }
  function diagramState(block) {
    if (mermaidStates.has(block)) return mermaidStates.get(block);
    const code = block.querySelector('pre code'), pre = code?.closest('pre');
    if (!code || !pre) return null;
    const state = {original:code.textContent || '', repaired:'', mode:'original', originalError:'', theme:'', attempts:0, initialized:false};
    const view = document.createElement('div'); view.className = 'tsa-mermaid'; view.hidden = true;
    view.setAttribute('role','img'); view.setAttribute('aria-label','Mermaid diagram');
    const note = document.createElement('p'); note.className = 'tsa-diagram-note'; note.hidden = true;
    const originalDetails = document.createElement('details'); originalDetails.className = 'tsa-diagram-source';
    const summary = document.createElement('summary'); summary.textContent = 'Original diagram source'; originalDetails.append(summary,pre);
    const repairDetails = document.createElement('details'); repairDetails.className = 'tsa-repaired-source'; repairDetails.hidden = true;
    const repairSummary = document.createElement('summary'); repairSummary.textContent = 'Repaired diagram source';
    const repairPre = document.createElement('pre'), repairCode = document.createElement('code'); repairCode.className = 'hljs language-mermaid';
    repairPre.append(repairCode); repairDetails.append(repairSummary,repairPre);
    const toolbar = block.querySelector('.tsa-code-toolbar');
    const badge = document.createElement('span'); badge.className = 'tsa-diagram-badge'; badge.textContent = 'Repaired preview'; badge.hidden = true;
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.dataset.mermaidToggle = '1'; toggle.hidden = true;
    const copyRepair = document.createElement('button'); copyRepair.type = 'button'; copyRepair.dataset.copyRepaired = '1'; copyRepair.textContent = 'Copy repaired'; copyRepair.hidden = true; copyRepair.setAttribute('aria-label','Copy repaired Mermaid source');
    toolbar?.append(badge,toggle,copyRepair);
    block.append(note,view,originalDetails,repairDetails);
    Object.assign(state,{view,note,originalDetails,repairDetails,repairCode,badge,toggle,copyRepair});
    mermaidStates.set(block,state); block.dataset.mermaidState = 'pending';
    return state;
  }
  function updateDiagramControls(block,state) {
    const repaired = !!state.repaired;
    state.toggle.hidden = state.copyRepair.hidden = state.repairDetails.hidden = !repaired;
    state.badge.hidden = !repaired || state.mode !== 'repaired';
    state.toggle.textContent = state.mode === 'repaired' ? 'Show original' : 'Show repaired';
    state.toggle.setAttribute('aria-pressed',String(state.mode === 'repaired'));
    state.toggle.setAttribute('aria-label',state.mode === 'repaired' ? 'Show original Mermaid source and render error' : 'Show repaired Mermaid preview');
    if (repaired) {
      state.repairCode.textContent = state.repaired;
      const copy = block.querySelector('[data-copy-code]');
      if (copy) { copy.textContent = 'Copy original'; copy.setAttribute('aria-label','Copy original Mermaid source'); }
    }
  }
  function diagramFailure(block,state,message,kind='error') {
    state.view.hidden = true; state.note.hidden = false;
    state.note.textContent = message;
    state.originalDetails.open = true;
    block.dataset.mermaidState = kind;
    updateDiagramControls(block,state);
  }
  async function renderDiagramSvg(source) {
    const result = await window.mermaid.render(`tsa-diagram-${++diagramSequence}`,safeDiagramSource(source));
    return sanitizeDiagram(result.svg);
  }
  function displayDiagram(block,state,svg) {
    state.view.innerHTML = svg; state.view.hidden = false; state.note.hidden = true;
    state.theme = diagramTheme(); block.dataset.mermaidTheme = state.theme;
    block.dataset.mermaidState = state.mode === 'repaired' ? 'repaired' : 'rendered';
    updateDiagramControls(block,state);
  }
  async function renderDiagram(block,state,alive) {
    if (!alive() || !block.isConnected) return;
    if (!state.original.trim()) { diagramFailure(block,state,'This diagram has no source.'); return; }
    if (state.original.length > 50000) { diagramFailure(block,state,'Diagram source preserved. This diagram exceeds the preview size limit.','limited'); return; }
    if (state.initialized && state.originalError && state.mode === 'original') {
      diagramFailure(block,state,state.repaired ? 'The original source did not render. Select Show repaired to view the corrected preview.' : 'Diagram source preserved; no supported automatic repair could render this diagram.',state.repaired?'original-error':'error');
      return;
    }
    if (state.repaired && state.mode === 'repaired') {
      try { const svg = await renderDiagramSvg(state.repaired); if (alive() && block.isConnected) displayDiagram(block,state,svg); }
      catch { if (alive()) diagramFailure(block,state,'The repaired diagram could not be displayed. Both source versions remain available.'); }
      return;
    }
    try {
      state.attempts++;
      const svg = await renderDiagramSvg(state.original);
      if (!alive() || !block.isConnected) return;
      state.initialized = true; state.mode = 'original'; displayDiagram(block,state,svg);
    } catch (error) {
      if (!alive() || !block.isConnected) return;
      state.originalError = String(error?.message || error || 'Diagram parse error').replace(/\s+/g,' ').slice(0,600);
      const candidates = (rich?.Repair?.buildMermaidRepairCandidates(safeDiagramSource(state.original)) || []).slice(0,4);
      for (const candidate of candidates) {
        if (candidate.length > 50000) continue;
        try {
          state.attempts++;
          const svg = await renderDiagramSvg(candidate);
          if (!alive() || !block.isConnected) return;
          state.initialized = true; state.repaired = candidate; state.mode = 'repaired';
          displayDiagram(block,state,svg); return;
        } catch { if (!alive() || !block.isConnected) return; }
      }
      state.initialized = true;
      diagramFailure(block,state,'Diagram source preserved; no supported automatic repair could render this diagram.');
    }
  }
  async function diagrams(container,alive) {
    const blocks = [...container.querySelectorAll('.tsa-code-block[data-code-language="mermaid"]')];
    if (!blocks.length) return;
    const available = configureDiagrams();
    for (const block of blocks) {
      if (!alive()) return;
      const state = diagramState(block); if (!state) continue;
      if (!available) { diagramFailure(block,state,'Diagram source preserved. The bundled diagram renderer is unavailable.'); continue; }
      await renderDiagram(block,state,alive);
    }
  }
  const imageControllers = new WeakMap();
  function failedImageArt(document, compact) {
    // Reader's failure designs: corner aperture for inline slots; centered
    // broken-connection artwork for full-width slots. App-owned SVG only.
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox',compact?'0 0 80 68':'204 34 224 50');
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    svg.classList.add('tsa-image-failure-art');
    const parts=compact ? [
      ['path',{class:'tsa-image-accent',d:'M23 7H10v13M57 7h13v13M10 48v13h13M70 48v13H57'}],
      ['path',{d:'m21 47 12-15 10 12 6-7 10 10M27 18h.01'}],
      ['path',{class:'tsa-image-cut-under',d:'m20 55 41-42'}],
      ['path',{class:'tsa-image-accent',d:'m20 55 41-42'}],
    ] : [
      ['rect',{x:208,y:38,width:51,height:42,rx:6}],
      ['circle',{cx:223,cy:50,r:3}],
      ['path',{d:'m1 34 14-12 11 10 10-13 14 18',transform:'translate(208 38)'}],
      ['path',{class:'tsa-image-connection',d:'M269 59h29m46 0h29'}],
      ['path',{class:'tsa-image-accent',d:'m8 4-6 6a8 8 0 0 0 11 11l3-3M18 22l6-6A8 8 0 0 0 13 5l-2 2',transform:'translate(309 45)'}],
      ['path',{class:'tsa-image-cut-under',d:'m0 27 25-28',transform:'translate(309 45)'}],
      ['path',{class:'tsa-image-accent',d:'m0 4-4-4m29 25 4 4',transform:'translate(309 45)'}],
      ['rect',{x:382,y:42,width:42,height:34,rx:5}],
      ['circle',{class:'tsa-image-accent-dot',cx:403,cy:59,r:3}],
    ];
    for(const [tag,attributes] of parts){const part=document.createElementNS(svg.namespaceURI,tag);for(const [name,value] of Object.entries(attributes))part.setAttribute(name,String(value));svg.append(part);}
    return svg;
  }
  function mountImage(wrapper) {
    const button=wrapper.querySelector('[data-load-image]');
    const source=safeImageSource(button?.dataset.loadImage);
    if(!source)return null;
    const doc=wrapper.ownerDocument,alt=button.dataset.imageAlt||'';
    const paragraph=wrapper.closest('p');
    // Formatting around a standalone image is not adjacent prose. Inspect text
    // outside this slot rather than its own hidden label/loading control.
    const beside=node=>node===wrapper?false:node.nodeType===3?Boolean(node.textContent.trim()):[...node.childNodes].some(beside);
    const proseBeside=paragraph&&[...paragraph.childNodes].some(node=>node!==wrapper&&(node.nodeType===3?node.textContent.trim():node.textContent.trim()||node.querySelector?.('.tsa-image-slot')));
    const compact=Boolean(wrapper.closest('td,th,.rich-row')||proseBeside);
    wrapper.dataset.imageDesign=compact?'compact':'wide';
    // Keep the existing fallback design unchanged; this refined context affects only
    // successfully loaded pixels and their responsive size.
    wrapper.dataset.imageSize=wrapper.closest('td,th,.rich-row')||(paragraph&&beside(paragraph))?'compact':'wide';
    const original=[...wrapper.childNodes];
    const image=doc.createElement('img');image.className='tsa-image-content';image.alt=alt;image.decoding='async';image.referrerPolicy='no-referrer';image.draggable=false;image.hidden=true;
    const loading=doc.createElement('span');loading.className='tsa-image-note';loading.textContent='Loading image…';loading.setAttribute('role','status');loading.hidden=true;
    const fallback=doc.createElement('span');fallback.className='tsa-image-failure';fallback.setAttribute('role','img');fallback.setAttribute('aria-label',['Image unavailable',alt].filter(Boolean).join(' · '));fallback.hidden=true;
    const failureCopy=doc.createElement('span');failureCopy.className='tsa-image-failure-copy';
    const failureLabel=doc.createElement('strong');failureLabel.textContent='Image unavailable';
    const failureDetail=doc.createElement('span');failureDetail.textContent='The image could not be loaded.';
    failureCopy.append(failureLabel,failureDetail);fallback.append(failedImageArt(doc,compact),failureCopy);
    wrapper.append(image,loading,fallback);
    let state='deferred',mode='click',manual=false,disposed=false;
    const paint=()=>{
      wrapper.dataset.imageState=state;wrapper.setAttribute('aria-busy',String(state==='loading'));
      wrapper.classList.toggle('tsa-image-loaded',state==='loaded');wrapper.classList.toggle('tsa-image-failed',state==='failed');
      original.forEach(node=>{if(node.nodeType===1)node.hidden=state!=='deferred';});
      image.hidden=state!=='loaded'&&state!=='loading';loading.hidden=state!=='loading';fallback.hidden=state!=='failed';
    };
    const settle=()=>{
      if(disposed||state!=='loading'||image.getAttribute('src')!==source||!image.complete)return;
      state=image.naturalWidth>0&&image.naturalHeight>0?'loaded':'failed';
      // The decoded aspect ratio sizes the display; original pixel dimensions
      // are not a display ceiling. CSS recalculates on reader/window resizing.
      if(state==='loaded')image.style.setProperty('--tsa-image-ratio',String(image.naturalWidth/image.naturalHeight));
      paint();
    };
    const cancel=()=>{image.removeAttribute('src');};
    const start=activated=>{
      if(disposed||state!=='deferred')return;
      manual=activated;state='loading';image.loading=manual||/^data:/i.test(source)?'eager':'lazy';
      image.src=source;paint();if(image.complete)settle();
    };
    image.addEventListener('load',settle);image.addEventListener('error',settle);
    const controller={start,configure(value){
      if(disposed)return;const next=value==='auto'?'auto':'click';
      if(next==='click'&&mode==='auto'&&state==='loading'&&!manual){if(image.complete&&image.naturalWidth>0)settle();else{cancel();state='deferred';}}
      mode=next;
      if(mode==='auto'||/^data:/i.test(source))start(false);paint();
    },destroy(){disposed=true;cancel();image.removeEventListener('load',settle);image.removeEventListener('error',settle);image.remove();loading.remove();fallback.remove();original.forEach(node=>{if(node.nodeType===1)node.hidden=false;});wrapper.classList.remove('tsa-image-loaded','tsa-image-failed');wrapper.dataset.imageState='deferred';wrapper.removeAttribute('aria-busy');imageControllers.delete(wrapper);}};
    imageControllers.set(wrapper,controller);paint();return controller;
  }
  function bind(container,options={}) {
    const controller=new AbortController();let disposed=false;
    const alive=()=>!disposed&&container.isConnected;
    let themeQueued=false;
    const queueDiagrams=()=>{diagramQueue=diagramQueue.catch(()=>{}).then(()=>diagrams(container,alive));return diagramQueue;};
    const localSources=new Map();container.querySelectorAll('[data-source-key]').forEach(element=>{const key=element.dataset.sourceKey;if(sources.has(key))localSources.set(key,sources.get(key));});
    const disposeCharts=rich?.Interactions?.mountChartInteractions(container);
    unlinkImages(container);
    const mountedImages=[...container.querySelectorAll('.tsa-image-slot')].map(mountImage).filter(Boolean);
    const configureImages=(settings={})=>mountedImages.forEach(image=>image.configure(settings.imageMode));
    configureImages(options);
    // Capture before generic link handling, including auxiliary activation and
    // any later app-created wrappers. Image content must never open a browser.
    for (const eventName of ['click','auxclick','contextmenu','dragstart']) container.addEventListener(eventName,event=>{
      const target=event.target instanceof Element?event.target:null;
      const image=target?.closest('.tsa-image-slot');
      if(!image||!container.contains(image))return;
      event.preventDefault();event.stopPropagation();
      if(eventName==='click'&&target.closest('[data-load-image]')) imageControllers.get(image)?.start(true);
    },{signal:controller.signal,capture:true});
    container.addEventListener('click',async event=>{
      const target=event.target instanceof Element?event.target:null;if(!target)return;
      const toggle=target.closest('[data-mermaid-toggle]');
      if(toggle&&container.contains(toggle)){
        event.preventDefault();const block=toggle.closest('.tsa-code-block'),state=mermaidStates.get(block);
        if(state?.repaired){state.mode=state.mode==='repaired'?'original':'repaired';toggle.disabled=true;try{await queueDiagrams();}finally{if(!disposed)toggle.disabled=false;}}return;
      }
      const copy=target.closest('[data-copy-code],[data-copy-message],[data-copy-repaired]');
      if(copy&&container.contains(copy)){
        event.preventDefault();const block=copy.closest('.tsa-code-block'),state=mermaidStates.get(block);
        const text=copy.hasAttribute('data-copy-repaired')?state?.repaired||'':copy.hasAttribute('data-copy-code')?state?.original??block?.querySelector('code')?.textContent??'':localSources.get(copy.closest('[data-source-key]')?.dataset.sourceKey)||'';
        try{await clipboard(text,options.copy);status(copy,'Copied');}catch{status(copy,'Copy failed');}return;
      }
      const link=target.closest('a[href]');if(link&&container.contains(link)){const url=safeUrl(link.getAttribute('href'));event.preventDefault();if(!url)return;if(options.openExternal){try{await options.openExternal(url);}catch{link.title='Could not open this link';}}else window.open(url,'_blank','noopener,noreferrer');}
    },{signal:controller.signal});
    const mathReady=rich?.Math?.renderMathPlaceholders(container)||Promise.resolve();
    const firstDiagrams=queueDiagrams();
    const themeObserver=new MutationObserver(()=>{
      if(disposed||themeQueued)return;themeQueued=true;
      diagramQueue=diagramQueue.catch(()=>{}).then(async()=>{themeQueued=false;if(alive())await diagrams(container,alive);});
    });
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    const dispose=()=>{disposed=true;controller.abort();themeObserver.disconnect();disposeCharts?.();mountedImages.forEach(image=>image.destroy());localSources.clear();};
    dispose.ready=Promise.allSettled([mathReady,firstDiagrams]);
    dispose.configureImages=configureImages;
    return dispose;
  }
  window.TSAContent=Object.freeze({renderThread,normalize,markdown,plainText,bind,safeUrl,safeImageSource,markMatches,escapeHtml:escape});
})();
