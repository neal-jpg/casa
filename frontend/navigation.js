(function () {
  'use strict';
  // Only screen selections live here. Financial records remain in the workbook.
  const session = `casa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const stateKey = 'casaNavigation';
  const entries = [];
  const labels = { overview: 'Overview', transactions: 'Transactions', monthend: 'Month', investments: 'Investments', accounts:'Accounts', goals: 'Goals', forecast: 'Forecast', workbook: 'Workbook', review: 'Review' };
  let position = -1;
  let sequence = 0;
  let restore = null;
  let restoring = false;
  let pending = false;
  const back = document.getElementById('navigation-back');
  const forward = document.getElementById('navigation-forward');
  const current = () => entries[position];
  const owned = value => value && value.session === session;
  const key = snapshot => JSON.stringify(Object.keys(snapshot).sort().map(name => [name, snapshot[name]]));

  function updateButtons() {
    if (back) {
      back.disabled = pending || position <= 0;
      back.title = position > 0 ? `Back to ${labels[entries[position - 1].snapshot.view] || 'previous view'}` : 'No previous view';
    }
    if (forward) {
      forward.disabled = pending || position < 0 || position >= entries.length - 1;
      forward.title = position >= 0 && position < entries.length - 1 ? `Forward to ${labels[entries[position + 1].snapshot.view] || 'next view'}` : 'No next view';
    }
  }

  function writeHistory(method, entry) {
    const previous = window.history.state;
    const state = previous && typeof previous === 'object' ? { ...previous } : {};
    state[stateKey] = { session, id: entry.id };
    window.history[method](state, '', `#${entry.snapshot.view}`);
  }

  function record(value) {
    if (restoring || !value || !labels[value.view]) return;
    const snapshot = Object.fromEntries(Object.entries(value).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)));
    const signature = key(snapshot);
    const previous = current();
    if (previous && previous.key === signature) { updateButtons(); return; }
    const changed = previous ? [...new Set([...Object.keys(previous.snapshot), ...Object.keys(snapshot)])].filter(name => previous.snapshot[name] !== snapshot[name]) : [];
    const searchOnly = changed.length === 1 && changed[0] === 'search';
    // Typing a query is one navigation step, rather than a step per character.
    if (previous && searchOnly && previous.searchEdit && position === entries.length - 1) {
      previous.snapshot = snapshot;
      previous.key = signature;
      writeHistory('replaceState', previous);
      updateButtons();
      return;
    }
    const externalHash = previous && previous.snapshot.view !== snapshot.view && window.location.hash === `#${snapshot.view}` && !owned(window.history.state && window.history.state[stateKey]);
    const entry = { id: ++sequence, snapshot, key: signature, searchEdit: searchOnly };
    entries.splice(position + 1);
    entries.push(entry);
    position = entries.length - 1;
    writeHistory(!previous || externalHash ? 'replaceState' : 'pushState', entry);
    updateButtons();
  }

  function move(delta) {
    if (pending || !restore || position + delta < 0 || position + delta >= entries.length) return;
    pending = true;
    updateButtons();
    window.history.go(delta);
  }

  window.addEventListener('popstate', event => {
    const navigation = event.state && event.state[stateKey];
    pending = false;
    if (!owned(navigation)) { updateButtons(); return; }
    const next = entries.findIndex(entry => entry.id === navigation.id);
    if (next < 0 || !restore) { updateButtons(); return; }
    position = next;
    restoring = true;
    try { restore({ ...current().snapshot }); }
    finally { restoring = false; updateButtons(); }
  });
  if (back) back.addEventListener('click', () => move(-1));
  if (forward) forward.addEventListener('click', () => move(1));
  updateButtons();
  window.CasaNavigation = Object.freeze({
    configure(options) { if (options && typeof options.restore === 'function') restore = options.restore; },
    record,
    back: () => move(-1),
    forward: () => move(1),
    getState: () => ({ canGoBack: position > 0, canGoForward: position >= 0 && position < entries.length - 1, position, length: entries.length })
  });
})();
