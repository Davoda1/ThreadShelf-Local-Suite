// One decorative video per visible reader. The stored preference is independent
// from playback eligibility, so accessibility and visibility changes are safe.
const WAVE_FILES = Object.freeze({
  dark: 'waves/quiet-water-v4-1920x1080-24fps.mp4',
  light: 'waves/05-day-loop.mp4',
  holiday: 'waves/01-multicolour-loop.mp4',
});

export class WaveBackground {
  constructor(container) {
    this.container = container;
    this.settings = {};
    this.active = true;
    this.hasConversation = false;
    this.videoHost = null;
    this.isWelcome = false;
    this.isHoliday = false;
    this.destroyed = false;
    this.playAttempt = 0;
    this.abort = new AbortController();
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const options = { signal: this.abort.signal };
    this.reducedMotion.addEventListener('change', () => this.sync(), options);
    document.addEventListener('visibilitychange', () => this.sync(), options);
    window.addEventListener('pagehide', () => this.release(), options);
    window.addEventListener('pageshow', () => this.sync(), options);
  }

  setSettings(settings) {
    const changed = ['waveVideoBackground', 'waveVideoWelcome', 'holidayVideoWelcome']
      .some(key => (this.settings[key] === true) !== (settings[key] === true));
    this.settings = settings;
    if (changed) this.failedTheme = null;
    this.sync();
  }

  setConversation(available) {
    this.hasConversation = !!available;
    if (this.hasConversation) this.isWelcome = false;
    this.sync();
  }

  setWelcome(available) {
    this.isWelcome = !!available;
    if (this.isWelcome) this.hasConversation = false;
    this.sync();
  }

  setHolidayStatus(status) {
    this.isHoliday = status?.isHoliday === true;
    this.sync();
  }

  setActive(active) {
    this.active = !!active;
    this.sync();
  }

  sourceFor(theme) {
    // The single-file preview supplies the exact packaged MP4 bytes. A Blob URL
    // avoids data-URI media limitations; its lifetime belongs to this instance.
    const embedded = window.__THREADSHELF_WAVES?.[theme];
    if (typeof embedded === 'string' && embedded.startsWith('data:video/mp4;base64,')) {
      const base64 = embedded.slice('data:video/mp4;base64,'.length);
      const parts = [];
      // Base64 chunks must be a multiple of four characters.
      for (let offset = 0; offset < base64.length; offset += 262144) {
        const decoded = atob(base64.slice(offset, offset + 262144));
        const bytes = new Uint8Array(decoded.length);
        for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
        parts.push(bytes);
      }
      this.objectUrl = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
      return this.objectUrl;
    }
    return new URL(WAVE_FILES[theme], document.baseURI).href;
  }

  syncHost() {
    if (!this.video) return false;
    const pane = this.hasConversation && !this.isWelcome
      && ['professional', 'platinum-plus'].includes(document.documentElement.dataset.uiPalette)
      ? this.container.closest?.('.content-pane') : null;
    const host = pane && pane !== this.container ? pane : this.container;
    const moved = this.videoHost !== host;
    if (moved) {
      this.videoHost?.classList.remove('wave-thread-background-enabled');
      // A theme preview moves the existing element, never its source/decoder.
      // Modern Electron preserves media state with moveBefore; older preview
      // browsers fall back to reparenting the same node. Ignore play promises
      // interrupted by that move; sync() renews the tracked play promise
      // without resetting playback time.
      ++this.playAttempt;
      if (this.video.parentNode && this.video.isConnected && host.isConnected
        && typeof host.moveBefore === 'function') host.moveBefore(this.video, host.firstChild);
      else host.prepend(this.video);
      this.videoHost = host;
    }
    if (host !== this.container) host.classList.add('wave-thread-background-enabled');
    return moved;
  }

  sync() {
    if (this.destroyed) return;
    const welcome = this.isWelcome && !this.hasConversation && this.settings.waveVideoWelcome === true;
    const eligible = this.settings.waveVideoBackground === true && (this.hasConversation || welcome)
      && this.active && this.settings.animations !== false && !this.reducedMotion.matches;
    if (!eligible) { this.release(); return; }
    // Fireworks are a welcome-page decoration only. An opened conversation
    // always uses its ordinary light/dark wave loop, even on a holiday.
    const theme = welcome && this.settings.holidayVideoWelcome === true && this.isHoliday
      ? 'holiday' : document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    if (this.video?.dataset.waveTheme !== theme) this.release();
    const moved = this.syncHost();
    if (document.hidden) { ++this.playAttempt; this.video?.pause(); return; }
    if (this.failedTheme === theme) return;
    if (!this.video) {
      const video = document.createElement('video');
      this.video = video;
      video.className = 'threadshelf-wave-video';
      video.dataset.waveTheme = theme;
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      video.tabIndex = -1;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.addEventListener('loadeddata', () => {
        if (this.video === video) video.classList.add('is-ready');
      }, { once: true });
      video.addEventListener('error', () => this.fail(video, theme), { once: true });
      this.syncHost();
      this.container.classList.add('wave-background-enabled');
      try { video.src = this.sourceFor(theme); }
      catch { this.fail(video, theme); return; }
    }
    if (welcome) this.container.classList.add('wave-welcome-enabled');
    else this.container.classList.remove('wave-welcome-enabled');
    const video = this.video;
    if (video.paused || moved) {
      const attempt = ++this.playAttempt;
      try {
        const playing = video.play();
        playing?.catch(() => {
          // An intentional pause/release can reject a pending play promise.
          if (this.video === video && attempt === this.playAttempt && !document.hidden) this.fail(video, theme);
        });
      } catch { this.fail(video, theme); }
    }
  }

  fail(video, theme) {
    if (this.video !== video) return;
    this.failedTheme = theme;
    this.release();
  }

  release() {
    ++this.playAttempt;
    const video = this.video;
    this.video = null;
    this.container.classList.remove('wave-background-enabled');
    this.container.classList.remove('wave-welcome-enabled');
    this.videoHost?.classList.remove('wave-thread-background-enabled');
    this.videoHost = null;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  destroy() {
    this.destroyed = true;
    this.abort.abort();
    this.release();
  }
}
