import { createStore } from './store/store.js';
import { mount } from './ui/app.js';
import { createSave } from './platform/save.js';
import { openSaveSheet } from './ui/save-sheet.js';
import { FLAGS } from './data/flags.js';
import { applyTheme, themeOf } from './ui/theme.js';
import { setTickDims } from './report/tick-pref.js';
import { devVal } from './core/wheelmatch.js';
import { installStepUpWatcher, makeOpenByName } from './ui/stepup-sheet.js';
import { overlayOpen } from './ui/inert.js';
import './install.js'; // S0 lead call 3a: T5 / T6 listener and command modules (empty today)

const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const q = new URLSearchParams(location.search).get('seed');
const save = createSave();

/** The store's NewGame as a plain function, for migrating a step-0 save. null when the store has no NewGame yet. */
const newGame = (seed) => { const t = createStore(null); t.dispatch('NewGame', { seed: String(seed) }); return t.get(); };

/** r9 features (M 18:37): on unless the save says features:false. data/flags.js stays all-false for tests; the app sets them here. */
const FEATURE_FLAGS = ['matchday', 'settled', 'roar', 'activities', 'freePick'];
const applyFeatures = (s) => { const on = !s || s.features !== false; FEATURE_FLAGS.forEach((k) => { FLAGS[k] = on; }); };
const applyWheel = (s) => { FLAGS.wheelMeta = !s || s.wheelFeatures !== false; }; // wheel meta: on unless the save says wheelFeatures:false
// Before the load: migration and NewGame read the flags (free-pick start, v6 notice).

// 1. Load (and migrate) the save; a missing or unreadable save starts a new game.
// Flags on first (the default): a new game or a migration reads them; a stored features:false is applied right after the load.
applyFeatures(null); applyWheel(null);
FLAGS.wheelMatch = true; // 2026-11-15: new games start in Wheel match mode (old saves without matchMode stay Classic)
const loaded = save.load({ newGame });
const store = createStore(loaded.state || null);
try { window.__csLoadedFrom = loaded.from; } catch (e) { /* report only: migrated-save flag */ }
if (!loaded.state) {
  const seed = q || rand();
  store.dispatch('NewGame', { seed });
  if (!store.get()) store.dispatch('NewMatch', { seed }); // store without NewGame: step-0 match
}
// 2. Reseed: ?seed fixes the rolls (empty salt); otherwise every load re-rolls them.
store.dispatch('Reseed', { salt: q ? '' : rand() });

applyFeatures(store.get());
let lastFeatures = store.get() && store.get().features;
store.subscribe((s) => { if (s && s.features !== lastFeatures) { lastFeatures = s.features; applyFeatures(s); } });
applyWheel(store.get());
let lastWheel = store.get() && store.get().wheelFeatures;
store.subscribe((s) => { if (s && s.wheelFeatures !== lastWheel) { lastWheel = s.wheelFeatures; applyWheel(s); } });

// 2b. Look: applied before the first render, and live whenever SetTheme changes it.
applyTheme(themeOf(store.get()));
const feedTick = (s) => { try { setTickDims(devVal(s, 'tickW'), devVal(s, 'tickL')); } catch (e) { /* defaults */ } }; // Bold tick size: Dev tickW / tickL (defaults when Dev is off)
feedTick(store.get()); store.subscribe(feedTick);
store.subscribe((s) => applyTheme(themeOf(s)));

// 3. Autosave after each accepted command (the store only notifies when a command changed the state).
let saved = save.save(store.get());
store.subscribe((s) => { saved = save.save(s); });

window.__store = store;
import('./ui/dev-badge.js').then((m) => m.mountDevBadge(store)).catch(() => {}); // G2: DEV badge on wheel screens while Dev is on
window.__save = save;
const ui = mount(document.getElementById('app'), store);
// T5: auto-open the coach step-up sheet. mount() returns dispatch, so open through a hidden data-act="sheet:stepup" click inside #app.
{
  installStepUpWatcher({ store, openByName: (ui && typeof ui.openByName === 'function') ? ui.openByName : makeOpenByName(document.getElementById('app')), overlayOpen, wheelOverlay: () => !!document.querySelector('.wh-ov'), netsScene: () => !!document.querySelector('.ns-scene') });
}

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
