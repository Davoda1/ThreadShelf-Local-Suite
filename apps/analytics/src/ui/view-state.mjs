/** Same-context UI continuity. No source data, persistence, or event dispatch. */
const SCROLL_PANES = '#workspace-scroll,.navigation,.table-wrap,.annual-calendar-scroll,.dialog-body,.evidence-body,.code-block pre';
const DRAFT_CONTROLS = 'form input,form select,form textarea,[data-quick="search"]';
const IDENTITY_ATTRIBUTES = ['id','name','type','data-action','data-workspace','data-table','data-row-id','data-row-index','data-calendar-date','data-calendar-year','data-quick','data-table-search','data-sort-key','data-sort-order','data-compare-select','data-annotation-id','data-source','data-conversation','data-side','data-kind','data-view','data-page'];
const element = node => node?.nodeType === 1;
const attribute = (node, name) => element(node) ? node.getAttribute(name) : null;
const children = node => Array.from(node?.children || []);
const contains = (root, node) => root === node || !!root?.contains?.(node);
const query = (root, selector) => [...(element(root) && root.matches(selector) ? [root] : []), ...Array.from(root?.querySelectorAll?.(selector) || [])];

function ancestor(node, root, name) {
  for (let current = node; current && contains(root, current); current = current.parentElement) {
    if (attribute(current, name) !== null) return current;
    if (current === root) break;
  }
  return null;
}
function pathFrom(node, scope) {
  const path = [];
  for (let current = node; current !== scope; current = current.parentNode) {
    if (!current?.parentNode) return null;
    const index = children(current.parentNode).indexOf(current);
    if (index < 0) return null;
    path.unshift(index);
  }
  return path;
}
function atPath(scope, path) {
  let node = scope;
  for (const index of path || []) node = children(node)[index];
  return node || null;
}
function contextNodes(root, value) {
  return query(root, '[data-view-context]').filter(node => attribute(node, 'data-view-context') === value);
}
function keyNodes(scope, value) {
  return query(scope, '[data-view-key]').filter(node => attribute(node, 'data-view-key') === value && ancestor(node, scope, 'data-view-context') === (attribute(scope, 'data-view-context') !== null ? scope : null));
}
function semanticAttributes(node) {
  const values = {};
  for (const name of IDENTITY_ATTRIBUTES) {
    const value = attribute(node, name);
    if (value !== null) values[name] = value;
  }
  if (node.tagName === 'INPUT' && ['checkbox','radio'].includes(node.type)) {
    const value = attribute(node, 'value');
    if (value !== null) values.value = value;
  }
  return values;
}
function matchesDescriptor(node, descriptor) {
  return element(node) && node.tagName === descriptor.tag && Object.entries(descriptor.attributes || {}).every(([name, value]) => attribute(node, name) === value) && (!descriptor.formId || node.form?.id === descriptor.formId);
}

/** A plain descriptor survives node replacement; contexts prevent cross-view reuse. */
export function describeViewNode(node, root) {
  if (!element(node) || !contains(root, node)) return null;
  const contextRoot = ancestor(node, root, 'data-view-context');
  const context = attribute(contextRoot, 'data-view-context');
  const scope = contextRoot || root;
  const keyed = ancestor(node, scope, 'data-view-key');
  const key = attribute(keyed, 'data-view-key');
  const boundary = keyed || scope;
  const path = pathFrom(node, boundary);
  if (!path) return null;
  return {context, contextIndex: contextRoot ? contextNodes(root, context).indexOf(contextRoot) : 0,
    key, keyIndex: keyed ? keyNodes(scope, key).indexOf(keyed) : 0,
    tag: node.tagName, attributes: semanticAttributes(node), formId: node.form?.id || null, path};
}

export function findViewNode(root, descriptor) {
  if (!root || !descriptor) return null;
  const scope = descriptor.context !== null ? contextNodes(root, descriptor.context)[descriptor.contextIndex || 0] : root;
  if (!scope) return null;
  const boundary = descriptor.key !== null ? keyNodes(scope, descriptor.key)[descriptor.keyIndex || 0] : scope;
  if (!boundary) return null;
  const candidate = atPath(boundary, descriptor.path);
  if (matchesDescriptor(candidate, descriptor)) return candidate;
  // Semantic matching survives inserted siblings. Never replace a vanished
  // record/control with another record merely because its index stayed equal.
  if (!Object.keys(descriptor.attributes || {}).length && !descriptor.formId) return null;
  const matches = query(boundary, '*').filter(node => ancestor(node, root, 'data-view-context') === (descriptor.context !== null ? scope : null) && matchesDescriptor(node, descriptor));
  return matches.length === 1 ? matches[0] : null;
}

function caret(node) {
  try {
    return Number.isInteger(node.selectionStart) && Number.isInteger(node.selectionEnd)
      ? {start:node.selectionStart,end:node.selectionEnd,direction:node.selectionDirection || 'none'} : null;
  } catch { return null; }
}
function draft(node) {
  if (node.tagName === 'INPUT' && node.type === 'file') return null;
  if (node.tagName === 'SELECT') return {kind:'select',multiple:!!node.multiple,values:Array.from(node.options || []).filter(option => option.selected).map(option => option.value)};
  if (node.tagName === 'INPUT' && ['checkbox','radio'].includes(node.type)) return {kind:'checked',checked:!!node.checked};
  return {kind:'value',value:node.value ?? ''};
}
function restoreDraft(node, value) {
  if (value.kind === 'checked') node.checked = value.checked;
  else if (value.kind === 'select') {
    const values = new Set(value.values);
    if (value.multiple) for (const option of Array.from(node.options || [])) option.selected = values.has(option.value);
    else if (Array.from(node.options || []).some(option => values.has(option.value))) node.value = value.values[0];
  } else if (!(node.tagName === 'INPUT' && node.type === 'file')) node.value = value.value;
}

export function captureViewState(root, {drafts = true} = {}) {
  const describe = node => describeViewNode(node, root);
  const snapshot = {scroll:[],details:[],drafts:[],focus:null};
  for (const node of query(root, SCROLL_PANES)) snapshot.scroll.push({node:describe(node),top:node.scrollTop,left:node.scrollLeft});
  for (const node of query(root, 'details')) snapshot.details.push({node:describe(node),open:!!node.open});
  if (drafts) for (const node of query(root, DRAFT_CONTROLS)) {
    const value = draft(node);
    if (value) snapshot.drafts.push({node:describe(node),value});
  }
  const document = root?.ownerDocument || (root?.nodeType === 9 ? root : null), active = document?.activeElement;
  if (active && active !== document.body && active !== document.documentElement && contains(root, active)) snapshot.focus = {node:describe(active),caret:caret(active)};
  return snapshot;
}

export function restoreViewState(root, snapshot, {drafts = true} = {}) {
  if (!snapshot) return;
  for (const item of snapshot.details || []) {
    const node = findViewNode(root, item.node);
    if (node) node.open = item.open;
  }
  if (drafts) for (const item of snapshot.drafts || []) {
    const node = findViewNode(root, item.node);
    if (node) restoreDraft(node, item.value);
  }
  const focused = snapshot.focus && findViewNode(root, snapshot.focus.node);
  if (focused && !focused.disabled && typeof focused.focus === 'function') {
    focused.focus({preventScroll:true});
    const selection = snapshot.focus.caret;
    if (selection && typeof focused.setSelectionRange === 'function') {
      try { focused.setSelectionRange(selection.start,selection.end,selection.direction); } catch { /* Non-text controls do not expose a caret. */ }
    }
  }
  for (const item of snapshot.scroll || []) {
    const node = findViewNode(root, item.node);
    if (!node) continue;
    node.scrollTop = Number.isFinite(item.top) ? Math.max(0,item.top) : 0;
    node.scrollLeft = Number.isFinite(item.left) ? item.left : 0;
  }
}
