// Browser-safe, session-only cache simulation for the self-contained preview.
// All bytes come from existing bundled synthetic PNGs; this module never fetches.
export function createPreviewResources(conversations) {
  const example = conversations.find(row => row.id === 'preview-rendering-4');
  const raster = [...(example?.turns.map(turn => turn.ai || '').join('\n') || '').matchAll(/data:image\/png;base64,[A-Za-z0-9+/]+={0,2}/g)].map(match => match[0]);
  const assets = new Map([
    ['https://preview-images.invalid/portrait.png', raster[0]],
    ['https://preview-images.invalid/landscape.png', raster[1]],
    ['https://preview-images.invalid/square.png', raster[2]],
  ].filter(([, value]) => value));
  const maxBytes = 256 * 1024 * 1024, maxImageBytes = 16 * 1024 * 1024;
  const entries = new Map(), contexts = new Map(), pending = new Map();
  let enabled = false, epoch = 0;
  const clone = value => structuredClone(value);
  const byteLength = value => { const data = value.slice(value.indexOf(',') + 1); return data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0); };
  const ownerFor = ref => {
    const row = conversations.find(item => item.id === (ref.id || ref.conversationId) || ref.conversationKey && item.conversationKey === ref.conversationKey);
    if (!row) throw Error('Synthetic conversation not found.');
    const mode = ref.mode === 'server' ? 'server' : 'local';
    const source = mode === 'server' ? 'Synthetic preview server' : 'Synthetic preview archive';
    return { key: JSON.stringify([mode, mode === 'server' ? String(ref.serverUrl || '') : '', row.id]), title: row.title, mode, source, id: row.id };
  };
  const remember = (owner, url, dataUrl) => {
    let entry = entries.get(owner.key);
    if (!entry) { entry = { ...owner, images: new Map() }; entries.set(owner.key, entry); }
    entry.images.set(url, dataUrl);
  };
  // Disabled caching keeps pre-existing resources readable in the real app.
  // These two labelled examples make deletion and clearing reviewable offline.
  if (conversations[0] && assets.size) remember(ownerFor({ mode: 'local', id: conversations[0].id }), 'https://preview-images.invalid/portrait.png', raster[0]);
  if (conversations[1] && raster[1]) remember(ownerFor({ mode: 'server', id: conversations[1].id, serverUrl: 'https://preview-server.invalid/' }), 'https://preview-images.invalid/landscape.png', raster[1]);
  const status = () => {
    const images = [...entries.values()].flatMap(entry => [...entry.images.values()]);
    return { enabled, itemCount: images.length, byteSize: images.reduce((sum, value) => sum + byteLength(value), 0), maxBytes, maxImageBytes, limitReached: false, notice: '', preview: true };
  };
  const list = () => ({ ...status(), conversations: [...entries.values()].map(entry => ({ key: entry.key, title: entry.title, mode: entry.mode, source: entry.source, itemCount: entry.images.size, byteSize: [...entry.images.values()].reduce((sum, value) => sum + byteLength(value), 0) })) });
  const cancelled = () => new DOMException('Synthetic image request cancelled.', 'AbortError');
  return {
    status,
    list,
    settings({ enabled: value }) { if (typeof value !== 'boolean') throw Error('Choose whether caching is enabled.'); enabled = value; return status(); },
    clear(args) {
      if (args.all === true) entries.clear();
      else if (typeof args.conversationKey === 'string') entries.delete(args.conversationKey);
      else throw Error('Choose cached resources to remove.');
      // Clearing the simulation also invalidates work that could restore a row.
      epoch++; for (const request of pending.values()) request.cancelled = true;
      return status();
    },
    context(ref) {
      const contextToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      contexts.set(contextToken, ownerFor(clone(ref)));
      return { contextToken };
    },
    async load({ url, contextToken, requestId }) {
      const owner = contexts.get(contextToken), dataUrl = assets.get(url);
      if (!owner || !dataUrl || typeof requestId !== 'string' || !requestId) throw Error('Only bundled synthetic preview images are available.');
      if (pending.has(requestId)) throw Error('Synthetic request is already active.');
      const request = { cancelled: false, epoch }; pending.set(requestId, request);
      try {
        await new Promise(resolve => setTimeout(resolve, 40));
        if (request.cancelled || request.epoch !== epoch) throw cancelled();
        const cached = entries.get(owner.key)?.images.get(url);
        if (cached) return { dataUrl: cached, cached: true, stored: false, preview: true };
        const stored = enabled && status().byteSize + byteLength(dataUrl) <= maxBytes;
        if (stored) remember(owner, url, dataUrl);
        return { dataUrl, cached: false, stored, preview: true };
      } finally { pending.delete(requestId); }
    },
    cancel({ requestId }) { if (pending.has(requestId)) pending.get(requestId).cancelled = true; return { ok: true }; },
  };
}
