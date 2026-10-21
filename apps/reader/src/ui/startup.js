// Built as a tiny classic script in <head>: applies saved colors before first
// paint, independently of the larger renderer module and archive bootstrap.
import { startupAppearance } from '../core/startup-appearance.mjs';
import { applyAppearance } from './appearance.js';
import { showStartupLoader } from './startup-loader.js';

const settings = startupAppearance(window.desktop?.startupAppearance);
applyAppearance(settings);
// Follow System appearance even while the larger module is still loading.
// Module execution precedes DOMContentLoaded; its regular settings-aware
// listener then owns future changes, without this startup snapshot competing.
const colorScheme = matchMedia('(prefers-color-scheme: dark)');
const updateStartupAppearance = () => applyAppearance(settings);
colorScheme.addEventListener('change', updateStartupAppearance);
document.addEventListener('DOMContentLoaded', () => {
  colorScheme.removeEventListener('change', updateStartupAppearance);
}, { once: true });
const host = document.getElementById('app');
if (host?.querySelector('.startup-loader')) showStartupLoader(host, settings.language);
else {
  const observer = new MutationObserver(() => {
    const host = document.getElementById('app');
    // Wait for the existing markup rather than inserting into an element that
    // the HTML parser may still be populating.
    if (host?.querySelector('.startup-loader')) { showStartupLoader(host, settings.language); observer.disconnect(); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
