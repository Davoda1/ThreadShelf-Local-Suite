'use strict';
// These rules apply only to renderer image traffic; server API calls use their
// existing read-only client and retain its separate request boundaries.
const REMOTE = /^(?:https?|wss?|ftp):/i;
const remoteImage = details => details.resourceType === 'image' && /^https?:/i.test(details.url);
function allowRendererRequest(details) {
  if (!REMOTE.test(details.url)) return true;
  if (!remoteImage(details)) return false;
  try { const url = new URL(details.url); return !url.username && !url.password; } catch { return false; }
}
function filtered(headers, blocked) {
  return Object.fromEntries(Object.entries(headers || {}).filter(([name]) => !blocked.has(name.toLowerCase())));
}
const requestSecrets = new Set(['cookie', 'authorization', 'proxy-authorization', 'referer']);
const responseCookies = new Set(['set-cookie', 'set-cookie2']);
function imageRequestHeaders(details) {
  return remoteImage(details) ? filtered(details.requestHeaders, requestSecrets) : details.requestHeaders;
}
function imageResponseHeaders(details) {
  return remoteImage(details) ? filtered(details.responseHeaders, responseCookies) : details.responseHeaders;
}
module.exports = {allowRendererRequest, imageRequestHeaders, imageResponseHeaders};
