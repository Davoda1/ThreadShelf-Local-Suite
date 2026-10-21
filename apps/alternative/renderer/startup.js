/* Synchronous first-paint theme and a guarded transition into the local app shell. */
(function () {
  'use strict';
  const root = document.documentElement;
  let preference = 'system';
  let nativeTheme;
  try {
    const supplied = window.alternative && window.alternative.startupTheme;
    nativeTheme = typeof supplied === 'string' ? supplied : supplied && (supplied.resolvedTheme || supplied.theme);
  } catch (_) {}
  if (nativeTheme !== 'light' && nativeTheme !== 'dark') {
    try {
      const saved = JSON.parse(localStorage.getItem('threadshelf-local-alternative.demo.v1') || 'null');
      if (saved && ['system', 'light', 'dark'].includes(saved.theme)) preference = saved.theme;
    } catch (_) {}
  }
  const resolved = nativeTheme === 'light' || nativeTheme === 'dark' ? nativeTheme : preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  const palette = resolved === 'dark' ? {bg:'#141c1d',text:'#e7eeea',muted:'#a1b2ad',accent:'#74c1b0'} : {bg:'#f3f1eb',text:'#222d2d',muted:'#687570',accent:'#17635f'};
  root.dataset.theme = resolved;
  root.dataset.startupTheme = resolved;
  root.style.colorScheme = resolved;
  root.style.backgroundColor = palette.bg;
  Object.entries(palette).forEach(([key, value]) => root.style.setProperty('--boot-' + key, value));

  let phase = 'loading';
  let failure = null;
  let transition;
  let watchdog;
  const $ = id => document.getElementById(id);

  function updateRecovery() {
    const status = $('startup-status'), detail = $('startup-detail'), screen = $('startup-screen');
    if (status) status.textContent = failure ? 'The workspace could not start' : 'Still preparing your reading space';
    if (detail) detail.textContent = failure || 'Startup is taking longer than expected. You can retry safely.';
    if (screen) screen.setAttribute('aria-busy', failure ? 'false' : 'true');
  }

  function fail(error) {
    if (phase === 'ready') return false;
    clearTimeout(watchdog);
    phase = 'error';
    failure = String(error && error.message || error || 'A required application file could not be loaded.').slice(0, 800);
    root.dataset.boot = 'error';
    const app = $('app');
    if (app) { app.inert = true; app.setAttribute('aria-hidden', 'true'); app.dataset.ready = 'error'; }
    updateRecovery();
    return false;
  }

  function ready() {
    if (phase === 'error') return Promise.resolve(false);
    if (phase === 'ready') return Promise.resolve(true);
    if (transition) return transition;
    clearTimeout(watchdog);
    transition = new Promise(resolve => {
      let swapped = false;
      let fallback;
      const swap = () => {
        if (swapped) return;
        swapped = true;
        clearTimeout(fallback);
        if (phase === 'error') { resolve(false); return; }
        const app = $('app'), screen = $('startup-screen');
        if (!app || !screen) { fail(new Error('The startup screen or workspace markup is missing. Please retry startup.')); resolve(false); return; }
        // Appearance and event handlers are already installed. Reveal both atomically.
        app.inert = false;
        app.removeAttribute('inert');
        app.removeAttribute('aria-hidden');
        app.dataset.ready = 'true';
        screen.setAttribute('aria-busy', 'false');
        screen.setAttribute('aria-hidden', 'true');
        // Application CSS now owns live theme changes, including native form colors.
        root.style.removeProperty('color-scheme');
        root.style.removeProperty('background-color');
        phase = 'ready';
        root.dataset.boot = 'ready';
        resolve(true);
      };
      requestAnimationFrame(() => requestAnimationFrame(swap));
      // A minimized window may throttle animation frames. Local readiness still completes.
      fallback = setTimeout(swap, 1000);
    });
    return transition;
  }

  watchdog = setTimeout(() => {
    if (phase !== 'loading') return;
    phase = 'slow';
    root.dataset.boot = 'slow';
    updateRecovery();
  }, 15000);

  window.addEventListener('error', event => {
    if (phase === 'ready') return;
    const target = event.target;
    if (target && target !== window && (target.tagName === 'SCRIPT' || target.tagName === 'LINK' && target.rel === 'stylesheet')) {
      let filename = 'application file';
      try { filename = new URL(target.src || target.href, location.href).pathname.split('/').pop() || filename; } catch (_) {}
      fail(new Error('A required application file could not load (' + filename + '). Please retry startup.'));
    } else if (event.error || event.message) fail(event.error || new Error(event.message));
  }, true);
  window.addEventListener('unhandledrejection', event => {
    if (phase !== 'ready') fail(event.reason || new Error('Startup was interrupted. Please retry.'));
  });
  document.addEventListener('DOMContentLoaded', () => {
    const retry = $('startup-retry');
    if (retry) retry.addEventListener('click', event => { event.preventDefault(); location.reload(); });
    if (phase === 'error' || phase === 'slow') updateRecovery();
  }, {once:true});
  window.TSABoot = Object.freeze({ready, fail, get state() { return phase; }});
})();
