// Dedicated isolated-world observer. No contextBridge API is exposed to the page.
const { ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', event => {
    if (!event.isTrusted || event.button !== 0) return;
    const link = event.composedPath().find(node => node?.tagName === 'A');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#')) return;
    event.preventDefault();
    if (!link.hasAttribute('download')) ipcRenderer.send('html-preview:link', link.href);
  }, true);
  document.addEventListener('submit', event => event.preventDefault(), true);
  document.addEventListener('dragstart', event => event.preventDefault(), true);
}, { once: true });
