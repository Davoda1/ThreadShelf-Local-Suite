import { STARTUP_LABELS } from '../core/startup-appearance.mjs';

export function showStartupLoader(host, language = 'en') {
  if (!host) return;
  host.setAttribute('aria-busy', 'true');
  let loader = host.querySelector('.startup-loader');
  if (!loader) {
    const container = document.createElement('div');
    container.className = 'app-loading';
    loader = document.createElement('div');
    loader.className = 'startup-loader';
    loader.setAttribute('role', 'status');
    for (let index = 0; index < 5; index++) {
      const orbit = document.createElement('span'), dot = document.createElement('span');
      orbit.className = 'startup-orbit';
      orbit.setAttribute('aria-hidden', 'true');
      dot.className = 'startup-dot';
      orbit.append(dot); loader.append(orbit);
    }
    container.append(loader); host.replaceChildren(container);
  }
  loader.setAttribute('aria-label', STARTUP_LABELS[language] || STARTUP_LABELS.en);
}
