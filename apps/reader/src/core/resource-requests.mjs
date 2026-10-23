// Shared, data-only IPC validation. No paths, bytes or storage policy can be
// supplied by the renderer to the resource loader.
export const RESOURCE_ACTIONS = Object.freeze(['resources.status', 'resources.list', 'resources.settings', 'resources.context', 'resources.load', 'resources.cancel', 'resources.clear']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (args, allowed) => {
  if (!object(args) || Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Invalid resource request.');
};
const string = (value, limit, empty = false) => typeof value === 'string' && (empty || value.length > 0) && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
export function resourceUrl(value) {
  if (!string(value, 16384) || /\s/.test(value)) throw new Error('Invalid image source.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid image source.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Invalid image source.');
  url.hash = '';
  return url.href;
}
export function validateResourceRequest(action, args = {}) {
  if (!RESOURCE_ACTIONS.includes(action)) throw new Error('Unknown resource action.');
  if (!object(args) || Object.keys(args).length > 6) throw new Error('Invalid resource request.');
  if (action === 'resources.status' || action === 'resources.list') keys(args, []);
  if (action === 'resources.settings') {
    keys(args, ['enabled']);
    if (typeof args.enabled !== 'boolean') throw new Error('Invalid resource-cache setting.');
  }
  if (action === 'resources.context') {
    keys(args, ['mode', 'id', 'serverUrl', 'collection', 'sourceFile', 'conversationKey']);
    if (args.mode !== undefined && !['local', 'server'].includes(args.mode)) throw new Error('Invalid resource conversation.');
    for (const [key, value] of Object.entries(args)) if (key !== 'mode' && !string(value, key === 'id' ? 2048 : 8192, true)) throw new Error('Invalid resource conversation.');
    if (args.mode === 'server' ? (!string(args.serverUrl, 8192) || !string(args.collection, 8192) || !string(args.sourceFile, 8192)) : !string(args.id, 2048)) throw new Error('Invalid resource conversation.');
  }
  if (action === 'resources.load') {
    keys(args, ['url', 'contextToken', 'requestId']);
    resourceUrl(args.url);
    if (!/^[a-f0-9]{64}$/.test(args.contextToken) || typeof args.contextToken !== 'string') throw new Error('Invalid resource context.');
  }
  if (action === 'resources.load' || action === 'resources.cancel') {
    if (action === 'resources.cancel') keys(args, ['requestId']);
    if (typeof args.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(args.requestId)) throw new Error('Invalid resource request identity.');
  }
  if (action === 'resources.clear') {
    keys(args, ['all', 'conversationKey']);
    if (!(args.all === true && args.conversationKey === undefined) && !(args.all === undefined && typeof args.conversationKey === 'string' && /^[a-f0-9]{64}$/.test(args.conversationKey))) throw new Error('Choose one resource-cache deletion scope.');
  }
  if (Object.values(args).reduce((sum, value) => sum + (typeof value === 'string' ? value.length : 0), 0) > 32768) throw new Error('Invalid resource request.');
  return args;
}
