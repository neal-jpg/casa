(function () {
  'use strict';
  const valid = value => ['light', 'dark', 'system'].includes(value);
  const storageKey = 'casa.theme';
  const system = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let preference = 'system';
  let revision = 0;
  let control;
  let saveStatus = '';
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4"/>';
  const moon = '<path d="M20.4 13.1A8.5 8.5 0 0 1 10.9 3.6a8.5 8.5 0 1 0 9.5 9.5Z"/>';
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (valid(saved)) preference = saved;
  } catch (_) { /* The server preference also works when browser storage is unavailable. */ }

  function apply() {
    const resolved = preference === 'system' ? (system && system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', resolved);
    if (control) {
      const action = resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      control.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${resolved === 'dark' ? sun : moon}</svg>`;
      control.setAttribute('aria-label', action);
      control.setAttribute('aria-pressed', String(resolved === 'dark'));
      control.title = [action, preference === 'system' ? 'Currently follows your system' : '', saveStatus].filter(Boolean).join(' · ');
    }
    return resolved;
  }

  async function setPreference(value) {
    if (!valid(value)) return;
    preference = value;
    revision += 1;
    saveStatus = '';
    apply();
    try { window.localStorage.setItem(storageKey, value); } catch (_) { /* Non-financial preference only. */ }
    try {
      const response = await fetch('/api/preferences', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ theme: value })
      });
      if (!response.ok) throw new Error('Preference could not be saved');
      saveStatus = 'Theme saved';
    } catch (_) {
      saveStatus = 'Applied on this screen; could not save preference';
    }
    apply();
  }

  apply();
  const toolbar = document.querySelector('.topbar-controls');
  if (toolbar) {
    const wrapper = document.createElement('div');
    wrapper.className = 'theme-control';
    wrapper.innerHTML = '<button class="icon-button theme-toggle" id="theme-toggle" type="button" aria-label="Switch to dark mode"></button>';
    const refresh = document.getElementById('refresh-button');
    toolbar.insertBefore(wrapper, refresh && refresh.parentNode === toolbar ? refresh : null);
    control = wrapper.querySelector('button');
    apply();
    control.addEventListener('click', () => { void setPreference(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); });
  }

  const onSystemChange = () => { if (preference === 'system') apply(); };
  if (system && system.addEventListener) system.addEventListener('change', onSystemChange);
  else if (system && system.addListener) system.addListener(onSystemChange);

  const initialRevision = revision;
  const ready = fetch('/api/preferences', { credentials: 'same-origin' })
    .then(response => response.ok ? response.json() : null)
    .then(saved => {
      if (revision !== initialRevision || !saved || !valid(saved.theme)) return;
      preference = saved.theme;
      try { window.localStorage.setItem(storageKey, preference); } catch (_) { /* Server remains authoritative. */ }
      apply();
    }).catch(() => {});

  window.CasaTheme = Object.freeze({
    getPreference: () => preference,
    getResolvedTheme: () => document.documentElement.dataset.theme,
    setPreference, ready
  });
})();
