import { createStore } from './store/store.js';
import { mount } from './ui/app.js';
import { createSave } from './platform/save.js';
import { openSaveSheet } from './ui/save-sheet.js';
import { applyTheme, themeOf } from './ui/theme.js';

const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const q = new URLSearchParams(location.search).get('seed');
const save = createSave();

/** The store's NewGame as a plain function, for migrating a step-0 save. null when the store has no NewGame yet. */
const newGame = (seed) => { const t = createStore(null); t.dispatch('NewGame', { seed: String(seed) }); return t.get(); };

// 1. Load (and migrate) the save; a missing or unreadable save starts a new game.
const loaded = save.load({ newGame });
const store = createStore(loaded.state || null);
if (!loaded.state) {
  const seed = q || rand();
  store.dispatch('NewGame', { seed });
  if (!store.get()) store.dispatch('NewMatch', { seed }); // store without NewGame: step-0 match
}
// 2. Reseed: ?seed fixes the rolls (empty salt); otherwise every load re-rolls them.
store.dispatch('Reseed', { salt: q ? '' : rand() });

// 2b. Look: applied before the first render, and live whenever SetTheme changes it.
applyTheme(themeOf(store.get()));
store.subscribe((s) => applyTheme(themeOf(s)));

// 3. Autosave after each accepted command (the store only notifies when a command changed the state).
let saved = save.save(store.get());
store.subscribe((s) => { saved = save.save(s); });

window.__store = store;
window.__save = save;
mount(document.getElementById('app'), store);

// 4. Save sheet: any element with data-act="sheet:save" opens it.
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('[data-act="sheet:save"]');
  if (!t) return;
  e.stopPropagation();
  openSaveSheet({
    saved,
    getText: () => save.exportText(store.get()),
    check: (text) => save.importText(text, { newGame }),
    onImport: (text) => { const r = save.importText(text, { newGame }); if (r.ok && save.save(r.state)) location.reload(); },
    onNewGame: () => { save.clear(); location.reload(); },
  });
}, true);
