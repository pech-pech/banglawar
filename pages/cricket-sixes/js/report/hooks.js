// Wires the report into the app: called from js/ui/app.js (render, dispatch, over panel). Everything is try/catch'd; the app never depends on it.
import { createLog } from './log.js';
import { buildSummary, buildFull } from './report.js';
import { BUILD, FLAG_DEFAULTS } from './build.js';
import { FLAGS } from '../data/flags.js';
import { gearButton, openSettings, stampOf } from './settings.js';
import { drawFeel } from './feel.js';
import { saveOf } from './z.js';

const GEAR_STAGES = { hub: 1, semi: 1, final: 1, break: 1, done: 1 }; // never on bowl or chase: a tap mid-over cannot open it by mistake
const BALL_MS = 400; // over-panel autoplay speed (js/ui/over-panel.js)

export function attachReport(el, store) {
  const noop = { rendered() {}, dispatched() {}, panelOpen() {}, panelDone() {} };
  try {
    let storage = null; try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
    const vp = () => 'screen ' + window.innerWidth + 'x' + window.innerHeight + ' at ' + (window.devicePixelRatio || 1) + 'x pixels, ' + (window.innerHeight >= window.innerWidth ? 'upright' : 'sideways');
    const log = createLog({ storage, now: () => Date.now(), build: BUILD, env: vp });
    const env = () => ({ build: BUILD, now: Date.now(), vp: vp(), errors: log.data().errors.n, lastError: log.data().errors.last.slice(-1)[0] || '', flags: { ...FLAGS }, save: saveOf(store.get()) });
    let shownKey = '', stage = null, stageT = Date.now(), shownT = Date.now(), panelT = 0, lastGloss = '', resultT = 0;
    const flush = () => { try { if (stage) log.screen(stage, Date.now() - stageT); stageT = Date.now(); } catch (e) { /* ignore */ } };
    const rep = {
      stamp: () => 'Build ' + BUILD + ' | ' + stampOf(Date.now()) + ' local | ' + vp(),
      summary: () => buildSummary(log.data(), env()), full: () => buildFull(log.data(), env()),
      count: () => log.data().matches.length, flush,
      clear: () => { log.clear(); }, // no half-match record: counting restarts at the next new match
    };
    if (store.get() && store.get().stage === 'bowl') log.matchStart(store.get());
    window.addEventListener('error', (e) => log.error(e.message));
    window.addEventListener('unhandledrejection', (e) => log.error(e.reason));
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else { stageT = Date.now(); shownT = Date.now(); } });
    document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-gloss]'); if (t) lastGloss = t.getAttribute('data-gloss') || ''; }, true);
    // Why? and glossary opens, seen as sheets added to the body (no change to the views).
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!n.classList) continue;
        if (n.classList.contains('gloss-root')) { const hl = n.querySelector('.is-hl'); log.gloss((hl && hl.getAttribute('data-id')) || lastGloss || 'full list (' + stage + ')'); lastGloss = ''; }
        else if (n.classList.contains('c-sheet')) {
          const t = (n.querySelector('.c-sheet__title') || {}).textContent || '';
          if (/^Why/i.test(t)) log.why(); else if (t !== 'Settings') { log.gloss(lastGloss || 'cricket words'); lastGloss = ''; }
        }
      }
    }).observe(document.body, { childList: true });

    return {
      rendered(s) {
        try {
          if (s.stage !== stage) { flush(); stage = s.stage; stageT = Date.now(); log.stage(stage); if (stage === 'done') resultT = Date.now(); }
          const key = s.stage + '|' + (s.last ? s.last.over : 0); if (key !== shownKey) { shownKey = key; shownT = Date.now(); } // think time runs from the first draw of a call screen
          const strip = GEAR_STAGES[s.stage] ? el.querySelector('.strip, .c-strip') : null;
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
          if (cmd === 'NewMatch') { if (resultT && before && before.stage === 'done') log.retry(Date.now() - resultT); log.matchStart(after); }
          else if (cmd === 'BowlOver' && after !== before) log.over(before, after, { th: Date.now() - shownT });
        } catch (e) { log.error(e); }
      },
      panelOpen() { panelT = Date.now(); },
      /** balls = balls in the over just shown. Closed before the last ball landed = skipped (X or Escape). */
      panelDone(balls) {
        try { const took = Date.now() - panelT, full = balls * BALL_MS; log.panel(took - full, took < full - 50); } catch (e) { log.error(e); }
      },
    };
  } catch (e) { try { console.warn('report off:', e); } catch (_) { /* ignore */ } return noop; }
}
