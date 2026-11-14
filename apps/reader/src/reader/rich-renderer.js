import { renderChart } from './rich-charts.js';
import { renderGrokNode } from './grok-renderer.js';
import { safeRichUrl, markdownProtectedRanges, prepareRichMarkdown, evaluateLocalWidget, parseLocalWidgetSource } from './rich-parser.js';
import { dismissChartInteractions } from './rich-chart-interactions.js';

const SVG = 'http://www.w3.org/2000/svg';
// App-owned, simple line icons. Exported names never become markup or URLs.
const ICONS = Object.freeze({
  'arrow-right': ['M4 12h16', 'm13 5 7 7-7 7'],
  'arrow-down': ['M12 4v16', 'm5 13 7 7 7-7'],
  'trending-up': ['m3 17 6-6 4 4 8-10', 'M15 5h6v6'],
  'trending-down': ['m3 7 6 6 4-4 8 10', 'M15 19h6v-6'],
  swords: ['m3 3 5 1 11 11-4 4L4 8z', 'm14 17 3-3', 'm17 20 3-3', 'm19 19 2 2', 'm21 3-5 1-5 5', 'm9 11-4 4 4 4 4-4', 'm7 14 3 3', 'm4 17 3 3', 'm5 19-2 2'],
  'arrow-down-up': ['M7 3v18', 'm3 17 4 4 4-4', 'M17 21V3', 'm13 7 4-4 4 4'],
  'check-circle': ['M22 11v1a10 10 0 1 1-5.9-9.1', 'm8 11 3 3L22 3'],
  'check-circle-2': ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'm7 12 3 3 7-7'],
  'alert-circle': ['M12 8v5', 'M12 16h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  'alert-triangle': ['M12 3 2 21h20z', 'M12 9v5', 'M12 17h.01'],
  copy: ['M8 8h13v13H8z', 'M16 8V3H3v13h5'],
  'hard-drive': ['M5 3h14l3 12v6H2v-6z', 'M2 15h20', 'M6 18h.01', 'M10 18h.01'],
  'file-archive': ['M14 2H4v20h16V8z', 'M14 2v6h6', 'M9 3v2m2 0v2M9 7v2m2 0v2', 'M9 14h3v4H9z'],
  'folder-search': ['M20 9V5h-9L9 3H3v17h7', 'M21 15a5 5 0 1 1-10 0 5 5 0 1 1 10 0', 'm20 19 3 3'],
  'rotate-ccw': ['M3 10a9 9 0 1 1 1 8', 'M3 3v7h7'],
  minus: ['M5 12h14'],
  plus: ['M5 12h14', 'M12 5v14'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 17v4h16v-4'],
  'file-text': ['M14 2H5v20h14V7z', 'M14 2v6h5', 'M8 12h8', 'M8 16h8'],
  'file-code': ['M14 2H5v20h14V7z', 'M14 2v6h5', 'm10 12-3 3 3 3', 'm14 12 3 3-3 3'],
  server: ['M3 3h18v7H3z', 'M3 14h18v7H3z', 'M6 6h.01', 'M6 17h.01'],
  database: ['M20 6a8 3 0 1 1-16 0 8 3 0 1 1 16 0', 'M4 6v12c0 4 16 4 16 0V6', 'M4 12c0 4 16 4 16 0'],
  sparkles: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z', 'M20 2v4', 'M18 4h4'],
  archive: ['M3 3h18v5H3z', 'M5 8v13h14V8', 'M9 12h6'],
  'badge-check': ['m12 2 3 2 3.5.5.5 3.5 3 4-3 4-.5 3.5-3.5.5-3 2-3-2-3.5-.5L5 16l-3-4 3-4 .5-3.5L9 4z', 'm8 12 3 3 5-6'],
  'file-search': ['M14 2H4v20h12', 'M14 2v6h6v4', 'M20 8l-6-6', 'M20 16a4 4 0 1 1-8 0 4 4 0 1 1 8 0', 'm19 19 3 3'],
  'layout-dashboard': ['M3 3h7v10H3z', 'M14 3h7v6h-7z', 'M3 17h7v4H3z', 'M14 13h7v8h-7z'],
  'panels-top-left': ['M3 3h18v18H3z', 'M3 8h18', 'M9 8v13', 'M6 5.5h.01', 'M9 5.5h.01'],
  type: ['M4 6V3h16v3', 'M12 3v18', 'M8 21h8'],
});
function el(document, tag, className, text) {
  const e = document.createElement(tag); if (className) e.className = className;
  if (text !== undefined) e.textContent = text; return e;
}
function dedent(source) {
  const lines = source.replace(/^\n/, '').split('\n');
  const amounts = lines.filter(line => line.trim()).map(line => line.match(/^ */)[0].length);
  const indent = amounts.length ? Math.min(...amounts) : 0;
  return lines.map(line => line.slice(Math.min(indent, line.match(/^ */)[0].length))).join('\n');
}
function randomMarker() {
  const words = new Uint32Array(4); globalThis.crypto.getRandomValues(words);
  return `TSRICHCHILD${Array.from(words, x => x.toString(16).padStart(8, '0')).join('')}END`;
}
function iconNode(name, options) {
  const { document } = options;
  if (!Object.hasOwn(ICONS, name)) {
    const fallback = el(document, 'span', 'rich-icon-fallback', '◇');
    fallback.title = `${options.t('Unknown icon')}: ${name}`; return fallback;
  }
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('rich-icon'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', d);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.append(path);
  }
  return svg;
}
function applyProperties(element, tag, a) {
  if (a.border) element.classList.add('rich-border');
  if (a.clip) element.classList.add('rich-clip');
  if (a.tabularNums) element.classList.add('rich-tabular');
  if (a.inline) element.classList.add('rich-inline');
  if (a.gap !== undefined) element.style.gap = typeof a.gap === 'number' ? `${a.gap * .25}rem` : a.gap;
  if (a.padding !== undefined) element.style.padding = typeof a.padding === 'number' ? `${a.padding * .25}rem` : a.padding;
  for (const key of ['width', 'height', 'minWidth', 'maxWidth']) if (a[key] !== undefined) element.style[key] = key === 'minWidth' ? `min(${a[key]}, 100%)` : a[key];
  if (tag === 'box' && a.size) { element.style.width = a.size; element.style.height = a.size; }
  if (a.flex !== undefined) { element.style.flex = `${Number(a.flex)} 1 0px`; element.classList.add('rich-flex-item'); }
  if (a.radius) element.classList.add(`rich-radius-${a.radius}`);
  if (a.direction) element.classList.add(`rich-direction-${a.direction}`);
  if (a.align) element.classList.add(`rich-align-${a.align}`);
  if (a.justify) element.classList.add(`rich-justify-${a.justify}`);
  if (a.textAlign) element.style.textAlign = a.textAlign;
  if (a.wrap) element.style.flexWrap = a.wrap;
  if (a.weight) element.classList.add(`rich-weight-${a.weight}`);
  if (a.color) element.classList.add(`rich-color-${a.color}`);
  if (a.size && tag !== 'box') element.classList.add(`rich-size-${a.size}`);
  if (a.background) {
    if (a.background[0] === '#' || a.background.startsWith('rgba(')) { element.style.backgroundColor = a.background; element.classList.add('rich-explicit-color'); }
    else element.classList.add(`rich-${a.background}`);
  }
  if (a.columns) element.style.setProperty('--rich-columns', String(a.columns));
}
function staticSvgNode(node, options) {
  const { document, t } = options;
  const element = document.createElementNS(SVG, node.tag);
  const names = { strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', fillOpacity: 'fill-opacity', strokeOpacity: 'stroke-opacity' };
  for (const [key, value] of Object.entries(node.attrs)) element.setAttribute(names[key] || key, value);
  if (node.tag === 'svg') {
    element.classList.add('rich-static-svg'); element.setAttribute('role', 'img');
    element.setAttribute('aria-label', t('Archived illustration')); element.setAttribute('focusable', 'false');
  }
  for (const child of node.children) element.append(staticSvgNode(child, options));
  return element;
}
function markProgressFill(element, node) {
  // Recognize the bounded, empty percentage-fill pattern from saved layouts.
  // Card surfaces are otherwise left untouched, including explicit swatches.
  const a = node.attrs, meaningful = node.children.filter(c => c.kind !== 'markdown' || c.text.trim());
  // Small explicit-height rows of empty weighted boxes are layout segments,
  // not cards. Keep every segment in one row even at the minimum window size.
  if (node.tag === 'row' && /^\d+(?:\.\d+)?px$/.test(a.height || '') && parseFloat(a.height) > 0 && parseFloat(a.height) <= 32 && meaningful.length > 1 && meaningful.every(child => child.tag === 'box' && Number(child.attrs?.flex) > 0 && !child.children.some(c => c.kind !== 'markdown' || c.text.trim()))) {
    element.classList.add('rich-segment-track');
  }
  // A saved allocation bar uses positive flex weights instead of percentages.
  // Keep its children out of the responsive card minimum-width rule, which
  // otherwise enlarges a small segment and changes the represented ratio.
  if (node.tag === 'box' && a.direction === 'row' && /^\d+(?:\.\d+)?px$/.test(a.height || '') && parseFloat(a.height) > 0 && parseFloat(a.height) <= 32 && a.clip && a.radius === 'full' && /^surface-(?:secondary|tertiary)$/.test(a.background || '') && !a.gap && !a.padding && meaningful.length === 2 && meaningful.every(child => child.tag === 'box' && Number(child.attrs?.flex) > 0 && child.attrs.background && Object.keys(child.attrs).every(key => ['flex', 'background'].includes(key)) && !child.children.some(c => c.kind !== 'markdown' || c.text.trim()))) {
    const segments = [...element.querySelectorAll(':scope > .rich-box')];
    if (segments.length === meaningful.length) {
      element.classList.add('rich-allocation-track');
      segments.forEach((segment, i) => {
        segment.classList.add('rich-allocation-segment');
        const paint = meaningful[i].attrs.background;
        if (paint[0] === '#') segment.style.setProperty('--rich-allocation-paint', paint);
      });
    }
    return;
  }
  if (node.tag !== 'box' || a.width !== '100%' || !/^\d+(?:\.\d+)?px$/.test(a.height || '') || parseFloat(a.height) > 32 || !a.clip || a.radius !== 'full' || !/^surface-(?:secondary|tertiary)$/.test(a.background || '') || meaningful.length !== 1) return;
  const child = meaningful[0], fill = child.attrs;
  if (child.tag !== 'box' || !/^\d+(?:\.\d+)?%$/.test(fill?.width || '') || ![a.height, '100%'].includes(fill.height) || child.children.some(c => c.kind !== 'markdown' || c.text.trim())) return;
  const fillElement = element.querySelector(':scope > .rich-box'); if (!fillElement) return;
  element.classList.add('rich-progress-track'); fillElement.classList.add('rich-progress-fill');
  if (/^surface-(?:secondary|tertiary)$/.test(fill.background || '')) fillElement.classList.add('rich-progress-neutral-fill');
}
function referenceNode(attrs, options) {
  const { document, context, t } = options;
  const span = el(document, 'span', 'rich-citation'); const ids = attrs.refs || [attrs.ref];
  const references = context.references, missingIds = [];
  ids.forEach(id => {
    const record = references instanceof Map ? references.get(id)
      : references && Object.hasOwn(references, id) ? references[id] : null;
    let url = record && safeRichUrl(record.url);
    if (options.referenceBudget && url) { options.referenceBudget.remaining -= (String(record.title || url).length + url.length + id.length) * 3; if (options.referenceBudget.remaining < 0) url = null; }
    if (url) {
      // A short host label keeps references from taking over the paragraph.
      // The complete archived title and identity remain available to assistive
      // technology and in the tooltip. No remote favicon request is made.
      const host = new URL(url).hostname.replace(/^www\./, '');
      const a = el(document, 'a', 'rich-citation-link', host || record.title || id); a.href = url;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.title = `${record.title || url}\n${id}`; a.setAttribute('aria-label', `${record.title || url} (${id})`); span.append(a);
    } else missingIds.push(id);
  });
  if (missingIds.length) {
    // List-only search results have no reference binding. Never guess a source
    // from an entry's order/title. Preserve all exact IDs without displaying
    // a long, implementation-specific identifier in the reading paragraph.
    const label = t('Source unavailable');
    const missing = el(document, 'span', 'rich-citation-unresolved', label + (missingIds.length > 1 ? ` +${missingIds.length - 1}` : ''));
    missing.title = `${label}: ${missingIds.join(', ')}`; missing.setAttribute('aria-label', missing.title); span.append(missing);
  }
  return span;
}
function originalDetails(node, options) {
  const details = el(options.document, 'details', 'rich-archive-source');
  details.append(el(options.document, 'summary', '', options.t('Original content')));
  details.append(el(options.document, 'pre', '', node.source || ''));
  return details;
}
function nativeCitationNode(node, options) {
  const {document, context, t} = options;
  const span = el(document, 'span', 'rich-native-citation');
  if (node.family === 'cite') span.append(referenceNode({refs:node.refs},options));
  else {
    for (const id of node.refs) {
      const record = context.references instanceof Map ? context.references.get(id) : context.references && Object.hasOwn(context.references,id) ? context.references[id] : null;
      let url = record && safeRichUrl(record.url), filename = record?.filename || record?.title;
      if(options.referenceBudget){options.referenceBudget.remaining-=(String(filename||'').length+String(url||'').length+id.length)*3;if(options.referenceBudget.remaining<0){url=null;filename=null;}}
      const chip = el(document, url ? 'a' : 'span', 'rich-citation rich-file-reference', filename || t('File reference'));
      chip.prepend(iconNode('file-text',options));
      chip.title = [filename || t('File unavailable'),id,...node.lines].join(' · '); chip.setAttribute('aria-label',chip.title);
      if (url) { chip.href=url;chip.target='_blank';chip.rel='noopener noreferrer'; }
      if (node.lines.length) chip.append(document.createTextNode(` (${node.lines.join(', ')})`));
      span.append(chip);
    }
  }
  // Exact IDs, line ranges and original marker remain inspectable even if the
  // imported archive contains neither the attachment nor a source binding.
  const original=el(document,'span','rich-citation-inspect');original.append(iconNode('alert-circle',options));original.title=node.source;original.setAttribute('aria-label',`${t('Original content')}: ${node.source}`);original.tabIndex=0;span.append(original);
  return span;
}
const WIDGET_LABELS = Object.freeze({
  i:'Archived images',image_group:'Archived images',image:'Archived image',images:'Archived images',
  navlist:'Archived source list',entity:'Archived entity',video:'Archived video',audio:'Archived audio',
  forecast:'Archived weather',weather:'Archived weather',finance:'Archived market data',
  schedule:'Archived schedule',standings:'Archived standings',sports:'Archived sports data',
  product_entity:'Archived product',product_query:'Archived products',businesses_map:'Archived locations',
  map_widget:'Archived locations',visualization:'Archived visualization',chart:'Archived chart',
  charts_widget_v2:'Archived chart',suggest_automation:'Archived suggestion',
});
function archivedWidgetNode(node, options) {
  const {document,t,context}=options;
  const figure=el(document,'aside','rich-passive rich-archived-widget');
  const heading=el(document,'div','rich-passive-label');
  heading.append(iconNode(['i','image','images','image_group'].includes(node.family)?'panels-top-left':'archive',options),document.createTextNode(t(Object.hasOwn(WIDGET_LABELS,node.family) ? WIDGET_LABELS[node.family] : 'Archived ChatGPT content')));figure.append(heading);
  figure.dataset.archiveFamily=node.family;
  const image=['i','image','images','image_group'].includes(node.family);
  const parts=Array.isArray(node.data)?node.data:[];
  if (node.family==='navlist' && parts.every(v=>typeof v==='string')) {
    if(parts[0])figure.append(el(document,'p','',parts[0]));
    const list=el(document,'ul');
    for(const part of parts.slice(1,65)) {
      const split=part.indexOf(';'),id=split<0?part:part.slice(0,split),title=split<0?part:part.slice(split+1);
      const row=el(document,'li','',title);row.append(document.createTextNode(' '),referenceNode({ref:id},options));list.append(row);
    }
    figure.append(list);
  } else {
    if(image)figure.append(el(document,'p','',t('Image assets are unavailable unless they were included in the archive.')));
    else figure.append(el(document,'p','',t('Saved content is available below. Live actions and interactive state are not replayed.')));
    if(node.data && typeof node.data==='object' && !Array.isArray(node.data)) {
      for(const key of ['title','label','name','description','text','body']) if(typeof node.data[key]==='string' && node.data[key].length<=32768) figure.append(el(document,key==='title'?'strong':'p','',node.data[key]));
    }
    const ids=parts.filter(v=>typeof v==='string' && /^turn\d+[a-z]+\d+$/.test(v)).slice(0,64);
    if(ids.length)figure.append(referenceNode({refs:ids},options));
  }
  figure.append(originalDetails(node,options));
  return figure;
}
function imagePlaceholderDesign(attrs, ancestors = []) {
  // Source-sized thumbnails stay compact even if a row wraps on a narrow
  // screen. An explicit full-width slot remains a landscape at every size.
  // A cap takes precedence over width="100%"; no query text is classified.
  const compact = value => value?.endsWith('px') && parseFloat(value) <= 320;
  if (compact(attrs.width) || compact(attrs.maxWidth)) return 'corner-aperture';
  if (attrs.width === '100%') return 'soft-horizon';
  return ancestors.some(node => node.tag === 'row' || node.attrs?.direction === 'row') ? 'corner-aperture' : 'soft-horizon';
}
function placeholderSvg(document, className, viewBox, parts) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add(className); svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of parts) {
    const part = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
    svg.append(part);
  }
  return svg;
}
function unavailableImageNode(tag, attrs, options) {
  const { document, t } = options;
  const area = el(document, 'div', 'rich-image-unavailable');
  const label = t('Image unavailable offline');
  const queries = tag === 'AsyncImageGroup' ? attrs.query || [] : attrs.query ? [attrs.query] : [];
  const description = queries.join(' · ');
  const width = attrs.width || attrs.maxWidth;
  // The export stores a query, not the selected image or its URL. Keep its
  // declared slot beside the accompanying prose, including full-width images;
  // never execute the query or substitute an unrelated photograph.
  if (tag === 'AsyncImageGroup') {
    // This is one honest group placeholder. Search-query count does not tell
    // us how many images ChatGPT selected, so never manufacture image tiles.
    area.classList.add('rich-image-group-unavailable');
    if (attrs.layout) area.dataset.imageLayout = attrs.layout;
    const slot = el(document, 'div', 'rich-image-group-slot');
    if (attrs.aspectRatio) slot.style.aspectRatio = attrs.aspectRatio.replace(':', ' / ');
    slot.append(iconNode('panels-top-left', options), el(document, 'strong', '', t('Archived image group')));
    slot.append(el(document, 'span', '', t('Selected image assets were not included in the archive.')));
    if (attrs.layout) slot.append(el(document, 'span', 'rich-image-group-layout', t('Carousel layout')));
    area.append(slot);
    if (description) {
      const details = el(document, 'details', 'rich-image-group-queries');
      details.append(el(document, 'summary', '', t('Saved image queries')));
      const list = el(document, 'ul');
      for (const query of queries) list.append(el(document, 'li', '', query));
      details.append(list); area.append(details);
    }
    return area;
  }
  if (tag === 'AsyncImage') {
    const design = imagePlaceholderDesign(attrs, options.imageAncestors);
    const wide = design === 'soft-horizon';
    const slotWidth = width || (wide ? undefined : '172px');
    const slotRatio = attrs.aspectRatio || (wide ? undefined : '5:4');
    area.classList.add('rich-image-placeholder', `rich-image-${design}`);
    area.dataset.placeholderDesign = design;
    if (slotWidth) area.style.width = `min(${slotWidth}, 100%)`;
    if (attrs.maxWidth) area.style.maxWidth = `min(${attrs.maxWidth}, 100%)`;
    if (slotRatio) area.style.aspectRatio = slotRatio.replace(':', ' / ');
    // Without both dimensions, retain in-flow content for intrinsic sizing.
    // Absolutely positioned artwork alone would collapse a ratio-only row.
    if (!slotRatio || !slotWidth) area.classList.add('rich-image-natural');
    area.setAttribute('role', 'img'); area.setAttribute('aria-label', [label, description].filter(Boolean).join(': '));
    area.title = [label, description].filter(Boolean).join(': ');
    if (wide) {
      // Terrain stretches with the archived slot; its glyph, sun and caption
      // keep their intended pixel size. These app-owned paths contain no URLs.
      const terrain = placeholderSvg(document, 'rich-image-horizon', '0 0 100 100', [
        ['path', { class: 'rich-image-horizon-back', d: 'M0 80 Q24 45 48 81 T100 70 V100H0Z' }],
        ['path', { class: 'rich-image-horizon-front', d: 'M0 94 Q28 69 53 91 T100 86 V100H0Z' }],
      ]);
      terrain.setAttribute('preserveAspectRatio', 'none'); area.append(terrain);
      area.append(placeholderSvg(document, 'rich-image-horizon-sun', '0 0 24 24', [['circle', { cx: '12', cy: '12', r: '12' }]]));
      area.append(placeholderSvg(document, 'rich-image-placeholder-icon', '0 0 32 32', [
        ['rect', { x: '3.5', y: '4.5', width: '25', height: '23', rx: '3' }],
        ['circle', { cx: '11', cy: '12', r: '2' }],
        ['path', { d: 'm4 23 7-7 5 5 5-7 7 8' }],
      ]));
    } else {
      area.append(placeholderSvg(document, 'rich-image-placeholder-icon', '0 0 50 41', [
        ['path', { class: 'rich-image-aperture-corners', d: 'M11 2H3v8M39 2h8v8M3 31v8h8M47 31v8h-8' }],
        ['path', { d: 'm11 30 10-13 8 10 5-6 6 9' }],
        ['circle', { cx: '35', cy: '12', r: '3' }],
      ]));
    }
  }
  area.append(el(document, 'span', 'rich-offline-label', tag === 'AsyncImage' ? t('Image unavailable') : label));
  if (description) area.append(el(document, 'span', 'rich-image-description', description));
  return area;
}

// Reuse the archived missing-source artwork for explicit Markdown images whose
// source is unusable. This does not execute archived image queries.
export function createMissingImagePlaceholder(document, { compact = false, alt = '', t = value => value } = {}) {
  return unavailableImageNode('AsyncImage', {
    query: alt, width: compact ? '172px' : '100%', aspectRatio: compact ? '5:4' : '16:9',
  }, { document, t });
}
function replaceMarkers(root, records, options) {
  const { document } = options;
  const walker = document.createTreeWalker(root, 4); const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const textNode of texts) {
    const codeContext = Boolean(textNode.parentElement?.closest('pre,code'));
    const text = textNode.nodeValue || '';
    const found = [];
    for (const [marker, record] of records) { let at = text.indexOf(marker); while (at >= 0) { found.push({ at, marker, record }); at = text.indexOf(marker, at + marker.length); } }
    if (!found.length) continue;
    found.sort((a, b) => a.at - b.at); const fragment = document.createDocumentFragment(); let last = 0;
    for (const item of found) {
      fragment.append(document.createTextNode(text.slice(last, item.at)));
      let node;
      try { node = codeContext ? document.createTextNode(item.record.source ?? item.record.text ?? '') : renderRichNode(item.record, options); }
      catch { node = el(document, item.record.inline ? 'span' : 'pre', 'rich-original-source', item.record.source || ''); }
      fragment.append(node); last = item.at + item.marker.length;
    }
    fragment.append(document.createTextNode(text.slice(last)));
    const parent = textNode.parentElement;
    if (parent?.tagName === 'P' && parent.childNodes.length === 1 && found.length === 1 && !found[0].record.inline && text.trim() === found[0].marker) parent.replaceWith(fragment);
    else textNode.replaceWith(fragment);
    if (codeContext) {
      const code = parent?.closest('code');
      if (code) code.dataset.originalCode = code.textContent || '';
    }
  }
}
function renderChildren(element, children, options) {
  const { document, renderMarkdown } = options;
  let source = ''; const records = new Map();
  const allText = children.filter(c => c.kind === 'markdown' || c.kind === 'literal').map(c => c.text).join('');
  for (const child of children) {
    if (child.kind === 'markdown') source += child.text;
    else {
      let marker = randomMarker(); while (allText.includes(marker) || records.has(marker)) marker = randomMarker();
      records.set(marker, child); source += marker;
    }
  }
  // Dedent the original component body before adding Markdown block boundaries.
  // Otherwise a block placeholder at column zero changes the common indent,
  // making later structural prose/icons appear to be indented Markdown code.
  source = dedent(source);
  const protectedRanges = markdownProtectedRanges(source);
  let separated = '', last = 0, protectedIndex = 0;
  for (const match of source.matchAll(/TSRICHCHILD[a-f0-9]{32}END/g)) {
    const child = records.get(match[0]);
    while (protectedIndex < protectedRanges.length && protectedRanges[protectedIndex][1] <= match.index) protectedIndex++;
    const insideCode = protectedRanges[protectedIndex] && protectedRanges[protectedIndex][0] <= match.index;
    if (child && !child.inline && child.kind !== 'literal' && !insideCode) {
      separated += source.slice(last, match.index) + `\n\n${match[0]}\n\n`;
      last = match.index + match[0].length;
    }
  }
  source = separated + source.slice(last);
  // Native marker text can also appear inside archived layout containers.
  // Literal bindings already have opaque placeholders and cannot be reparsed.
  if (/|<(?:grok[: -]|xaiArtifact|xai:tool_usage_card)|grok_render_citation_card_json=/.test(source)) {
    const nested=prepareRichMarkdown(source);source=nested.content;
    for(const [marker,record] of nested.records)records.set(marker,record);
  }
  const template = document.createElement('template'); template.innerHTML = renderMarkdown(source);
  replaceMarkers(template.content, records, options);
  // Layout containers may hold inline Markdown paragraphs as flex/grid items;
  // unwrap only a sole paragraph for text-like elements, preserving GFM blocks.
  if (['text', 'title', 'caption', 'badge'].includes(element.dataset.richTag) && template.content.childElementCount === 1 && template.content.firstElementChild?.tagName === 'P') {
    template.content.firstElementChild.replaceWith(...template.content.firstElementChild.childNodes);
  }
  element.append(template.content);
}
function pagePreviewNode(node, options) {
  const { document, t, context = {} } = options;
  const pages = context.pages;
  const record = pages instanceof Map ? pages.get(node.pageId)
    : pages && Object.hasOwn(pages, node.pageId) ? pages[node.pageId] : null;
  const url = record && safeRichUrl(record.url);
  const card = el(document, url ? 'a' : 'aside', 'rich-page-preview');
  if (url) { card.href = url; card.target = '_blank'; card.rel = 'noopener noreferrer'; }
  const heading = el(document, 'span', 'rich-page-heading');
  heading.append(iconNode('file-text', options), el(document, 'strong', '', record?.title || t('Page')));
  card.append(heading, el(document, 'span', 'rich-page-status', url ? t('Saved Page link · content is not available offline') : t('Page content and link are unavailable in this archive.')));
  card.title = node.pageId;
  return card;
}
function sliderNode(attrs, options) {
  const { document, t } = options;
  const field = el(document, 'div', 'rich-slider');
  const input = el(document, 'input', 'rich-local-slider');
  input.type = 'range'; input.min = String(attrs.min); input.max = String(attrs.max);
  input.step = String(attrs.step); input.value = String(attrs.value);
  // The value attribute survives renderRichHtml's serialization; the property
  // is kept synchronized again during local updates.
  input.setAttribute('value', String(attrs.value)); input.dataset.richState = attrs.stateKey;
  input.setAttribute('aria-label', t('Archived slider'));
  input.setAttribute('aria-valuetext', String(attrs.marks?.find(mark => mark.value === attrs.value)?.label ?? attrs.value));
  field.append(input);
  if (attrs.marks?.length) {
    const marks = el(document, 'div', 'rich-slider-marks'); marks.setAttribute('aria-hidden', 'true');
    for (const mark of attrs.marks) {
      const item = el(document, 'span', 'rich-slider-mark', String(mark.label));
      item.style.left = `${100 * (mark.value - attrs.min) / (attrs.max - attrs.min)}%`;
      if (mark.value === attrs.value) item.classList.add('is-selected');
      marks.append(item);
    }
    field.append(marks);
  }
  return field;
}
function localWidgetNode(node, options) {
  const wrapper = el(options.document, 'section', 'rich-local-widget');
  // The source is inert data. It is reparsed by the bounded parser only when
  // an app-created slider is changed; no callback from the archive is run.
  wrapper.dataset.richWidgetSource = node.source;
  for (const child of node.children) wrapper.append(renderRichNode(child, options));
  return wrapper;
}
const widgetRoots = new WeakMap();
const widgetStates = new WeakMap();
function updateWidgetTree(current, next) {
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName || current.nodeType === 1 && current.classList.contains('rich-chart')) { current.replaceWith(next); return; }
  if (current.nodeType === 3) { if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue; return; }
  if (current.nodeType !== 1) { current.replaceWith(next); return; }
  const wasOpen = current.tagName === 'DETAILS' && current.open;
  for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  for (const attr of [...next.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  if (current.matches('input.rich-local-slider')) current.value = next.value;
  const previous = [...current.childNodes], upcoming = [...next.childNodes];
  for (let i = 0; i < Math.max(previous.length, upcoming.length); i++) {
    if (!upcoming[i]) previous[i].remove();
    else if (!previous[i]) current.append(upcoming[i]);
    else updateWidgetTree(previous[i], upcoming[i]);
  }
  if (wasOpen) current.open = true;
}
/** A delegated, presentation-only controller. No storage or network is used. */
export function mountLocalWidgetInteractions(root, { renderMarkdown, t = key => key, context = {} } = {}) {
  if (widgetRoots.has(root)) return widgetRoots.get(root);
  function change(event) {
    const input = event.target.closest?.('input.rich-local-slider[data-rich-state]');
    const wrapper = input?.closest('.rich-local-widget[data-rich-widget-source]');
    if (!wrapper || !root.contains(wrapper)) return;
    try {
      let state = widgetStates.get(wrapper);
      if (!state) {
        const node = parseLocalWidgetSource(wrapper.dataset.richWidgetSource);
        state = { node, values: Object.fromEntries(node.states.map(item => [item.name, item.initial])) };
        widgetStates.set(wrapper, state);
      }
      const key = input.dataset.richState, value = Number(input.value);
      if (!Object.hasOwn(state.values, key) || !Number.isFinite(value)) return;
      const values = { ...state.values, [key]: value };
      const children = evaluateLocalWidget(state.node, values);
      const options = { document: wrapper.ownerDocument, renderMarkdown, t, context: typeof context === 'function' ? context(wrapper) : context, referenceBudget: { remaining: 2000000 }, compatBudget: { remaining: 256 }, grokBudget: { remaining: 2000000 } };
      const next = localWidgetNode({ ...state.node, children }, options);
      // Initial content went through HTML serialization and reparsing. Merge
      // app-created adjacent text nodes and discard empty marker splits before
      // matching children, so a harmless empty node cannot replace the slider.
      next.normalize(); wrapper.normalize();
      const positions = [];
      for (let parent = wrapper.parentElement; parent; parent = parent.parentElement) if (parent.scrollTop || parent.scrollLeft) positions.push([parent, parent.scrollTop, parent.scrollLeft]);
      const opened = [...wrapper.querySelectorAll('.rich-chart details')].map(detail => detail.open);
      dismissChartInteractions(wrapper);
      updateWidgetTree(wrapper, next);
      [...wrapper.querySelectorAll('.rich-chart details')].forEach((detail, index) => { detail.open = opened[index] || false; });
      for (const [parent, top, left] of positions) { parent.scrollTop = top; parent.scrollLeft = left; }
      state.values = values;
    } catch {
      // Retain the last complete rendering and original source if a malformed
      // model, budget limit or invalid state prevents the proposed update.
      const previous = widgetStates.get(wrapper)?.values;
      if (previous && Object.hasOwn(previous, input.dataset.richState)) input.value = String(previous[input.dataset.richState]);
      if (!wrapper.querySelector('.rich-widget-status')) {
        const status = el(wrapper.ownerDocument, 'p', 'rich-widget-status', t('This saved widget cannot be updated. Its original content is retained.'));
        status.setAttribute('role', 'status'); wrapper.append(status, originalDetails({ source: wrapper.dataset.richWidgetSource }, { document: wrapper.ownerDocument, t }));
      }
    }
  }
  root.addEventListener('input', change);
  const dispose = () => { root.removeEventListener('input', change); widgetRoots.delete(root); };
  widgetRoots.set(root, dispose); return dispose;
}
export function renderRichNode(node, options) {
  const { document, t } = options;
  if (['grok','native-citation','archived-widget'].includes(node.kind) && options.compatBudget && --options.compatBudget.remaining < 0) return el(document,node.inline?'span':'pre','rich-original-source',node.source||'');
  if (node.kind === 'grok') return renderGrokNode(node, {...options, renderChart});
  if (node.kind === 'literal') return document.createTextNode(node.text);
  if (node.kind === 'native-citation') return nativeCitationNode(node, options);
  if (node.kind === 'archived-widget') return archivedWidgetNode(node, options);
  if (node.kind === 'page-preview') return pagePreviewNode(node, options);
  if (node.kind === 'local-widget') return localWidgetNode(node, options);
  if (node.kind === 'static-svg') return staticSvgNode(node, options);
  if (node.kind === 'passive') {
    const figure = el(document, 'aside', 'rich-passive');
    if (node.family === 'suggest_automation') {
      figure.append(el(document, 'span', 'rich-passive-label', `${t('Archived suggestion')}: `), document.createTextNode(node.text));
    } else {
      figure.append(el(document, 'div', 'rich-passive-label', t('Archived map locations')));
      const list = el(document, 'ul'); for (const point of node.points) list.append(el(document, 'li', '', point.category ? `${point.name} — ${point.category}` : point.name)); figure.append(list);
    }
    return figure;
  }
  const { tag, attrs: a } = node;
  if (tag === 'slider') return sliderNode(a, options);
  if (tag === 'Chart') return renderChart(a.content, { document, t, family: node.family || 'Chart' });
  if (tag === 'Entity') {
    const entity = el(document, 'span', 'rich-entity', a.value);
    entity.title = [a.category, a.disambig].filter(Boolean).join(' — '); return entity;
  }
  if (tag === 'Link') {
    const link = el(document, 'a', 'rich-link', a.title || a.url); link.href = a.url;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  }
  if (tag === 'Cite') return referenceNode(a, options);
  if (tag === 'AsyncImage' || tag === 'AsyncImageGroup') {
    return unavailableImageNode(tag, a, options);
  }
  if (tag === 'icon') {
    const span = el(document, 'span', 'rich-icon-wrap');
    span.setAttribute('role', 'img'); span.setAttribute('aria-label', a.name || t('Unknown icon'));
    applyProperties(span, tag, a); span.append(iconNode(a.name || '', options)); return span;
  }
  const htmlTag = tag === 'divider' ? 'hr' : tag === 'badge' || (node.inline && tag === 'text') ? 'span' : 'div';
  const element = el(document, htmlTag, `rich-component rich-${tag}`); element.dataset.richTag = tag;
  if (node.inline && tag === 'text') element.classList.add('rich-inline-text');
  if (tag === 'title') { element.setAttribute('role', 'heading'); element.setAttribute('aria-level', '4'); }
  applyProperties(element, tag, a);
  if (tag !== 'divider') renderChildren(element, node.children, { ...options, imageAncestors: [...(options.imageAncestors || []), node] });
  markProgressFill(element, node);
  return element;
}
/** All exported HTML was already sanitized. Only app-created DOM is inserted;
 * opaque marker lookup is restricted to records generated for this message. */
export function renderRichHtml(html, records, { renderMarkdown, document = globalThis.document, t = k => k, context = {} } = {}) {
  if (!records?.size) return html;
  const template = document.createElement('template'); template.innerHTML = html;
  const options = { document, renderMarkdown, t, context, grokBudget:{remaining:2000000}, referenceBudget:{remaining:2000000}, compatBudget:{remaining:256} };
  replaceMarkers(template.content, records, options);
  return template.innerHTML;
}
