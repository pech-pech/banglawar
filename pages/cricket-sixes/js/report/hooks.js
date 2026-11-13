// Wires the report into the app: called from js/ui/app.js (render, dispatch, over panel). Everything is try/catch'd; the app never depends on it.
import { createLog } from './log.js';
import { buildSummary, buildFull } from './report.js';
import { BUILD, FLAG_DEFAULTS } from './build.js';
import { FLAGS } from '../data/flags.js';
import { gearButton, openSettings, stampOf } from './settings.js';
import { drawFeel } from './feel.js';
import { saveOf } from './z.js';

const RESUME = { bowl: 1, break: 1, chase: 1 };
const GEAR_STAGES = { hub: 1, semi: 1, final: 1, break: 1, done: 1, train: 1, week: 1, end: 1, runend: 1, squad: 1, plan: 1 }; // never on bowl or chase: a tap mid-over cannot open it by mistake
const TAP_MS = 1500; // a glossary sheet counts only within this long of a real tap on a ? or word

export function attachReport(el, store) {
  const noop = { rendered() {}, dispatched() {}, panelOpen() {}, panelDone() {}, error() {} };
  try {
    let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
    const vp = () => 'screen ' + window.innerWidth + 'x' + window.innerHeight + ' at ' + (window.devicePixelRatio || 1) + 'x pixels, ' + (window.innerHeight >= window.innerWidth ? 'upright' : 'sideways');
    const log = createLog({ storage, now: () => Date.now(), build: BUILD, env: vp });
    const env = () => ({ build: BUILD, now: Date.now(), vp: vp(), errors: log.data().errors.n, lastError: log.data().errors.last.slice(-1)[0] || '', flags: { ...FLAGS }, fixedSeed: (() => { try { return new URLSearchParams(location.search).has('seed'); } catch (e) { return false; } })(), save: saveOf(store.get()) });
    let shownKey = '', stage = null, stageT = Date.now(), shownT = Date.now(), lastGloss = '', tapT = 0;
    const flush = () => { try { if (stage) log.screen(stage, Date.now() - stageT); stageT = Date.now(); } catch (e) { /* ignore */ } };
    const rep = {
      stamp: () => 'Build ' + BUILD + ' | ' + stampOf(Date.now()) + ' local | ' + vp(),
      summary: () => buildSummary(log.data(), env()), full: () => buildFull(log.data(), env()),
      count: () => log.data().matches.length, flush,
      clear: () => { log.clear(); }, // no half-match record: counting restarts at the next new match
    };
    if (store.get()) log.stage(store.get().stage); // Z2: a session that closes before any screen change still has an end screen
    if (store.get() && RESUME[store.get().stage]) log.matchStart(store.get(), true); // P0-2: a reload on bowl, break or chase has a match in progress
    window.addEventListener('error', (e) => log.error(e.message));
    window.addEventListener('unhandledrejection', (e) => log.error(e.reason));
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else { stageT = Date.now(); shownT = Date.now(); } });
    const tapped = () => Date.now() - tapT < TAP_MS;
    document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-gloss], .q'); if (t) { lastGloss = (t.getAttribute && t.getAttribute('data-gloss')) || ''; tapT = Date.now(); } }, true);
    // Why? and glossary opens, seen as sheets added to the body (no change to the views).
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!n.classList) continue;
        if (n.classList.contains('gloss-root')) { if (tapped()) { const hl = n.querySelector('.is-hl'); log.gloss((hl && hl.getAttribute('data-id')) || lastGloss || 'full list'); } lastGloss = ''; tapT = 0; } // P0-5: no tap, no count
        else if (n.classList.contains('c-sheet')) {
          const t = (n.querySelector('.c-sheet__title') || {}).textContent || '';
          if (/^Why/i.test(t)) log.why(); else if (tapped()) { log.gloss(lastGloss || 'cricket words'); } // only a tapped "?" / word counts; Book, Table, Team and other sheets do not
          lastGloss = ''; tapT = 0;
        }
      }
    }).observe(document.body, { childList: true });

    return {
      rendered(s) {
        try {
          if (s.stage !== stage) { flush(); stage = s.stage; stageT = Date.now(); log.stage(stage); }
          const key = s.stage + '|' + (s.last ? s.last.over : 0); if (key !== shownKey) { shownKey = key; shownT = Date.now(); } // think time runs from the first draw of a call screen
          const strip = GEAR_STAGES[s.stage] ? (el.querySelector('.strip') || el.querySelector('.c-strip')) : null; // .strip first: a c-strip heading inside a card can come earlier on the page
          if (strip && !strip.querySelector('.st-gear')) {
            const g = gearButton(); g.addEventListener('click', () => openSettings(rep, { get: store.get, set: (t) => store.dispatch('SetTheme', { theme: t }) }));
            strip.insertBefore(g, strip.querySelector('.help-btn'));
          }
          if (s.stage === 'done') { const scr = el.querySelector('.screen'); const m = log.data().matches.slice(-1)[0]; if (scr && m) drawFeel(scr, m, (q, a) => log.feel(q, a)); }
        } catch (e) { log.error(e); }
      },
      /** Called after every command: before/after are the store states around it. */
      dispatched(cmd, payload, before, after) {
        try {
          if (cmd === 'NewMatch' || (cmd === 'StartMatch' && after && after.stage === 'bowl')) log.matchStart(after); // P0-1: the hub sends StartMatch, not NewMatch
          else if (cmd === 'FinishMatch') log.finish(before, after);
          else if (cmd === 'BowlOver' && after !== before) log.over(before, after, { th: Date.now() - shownT });
        } catch (e) { log.error(e); }
      },
      panelOpen() {}, panelDone() {}, // P0-13: the over-panel timer and its ball-speed copy are gone; app.js still calls these
      error(e) { try { log.error(e); } catch (_) { /* ignore */ } },
    };
  } catch (e) { try { console.warn('report off:', e); } catch (_) { /* ignore */ } return noop; }
}
