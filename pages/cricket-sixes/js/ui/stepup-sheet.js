// Step-up card opener (coach weekly, T5). Sheet opener for app.js SHEETS (state:true).
import { pendingStepUps, stepUpHtml, canShowStepUp } from './stepup-card.js';

/** True when a card is queued and no wheel, match overs or nets scene is up. Callers pass their real ui flags. @param {any} state @param {any} [ui] */
export function shouldShowStepUp(state, ui) {
  return canShowStepUp(ui) && pendingStepUps(state).length > 0;
}

export function openStepUp(s, dispatch, open, arg) {
  const q = pendingStepUps(s);
  const want = arg && typeof arg === 'object' ? arg.coachId : arg;
  const e = (want && q.find((x) => x.coachId === want)) || q[0];
  if (!e) return null;
  return import('./sheet.js').then(({ openSheet }) => {
    const close = openSheet('Coach step up', stepUpHtml(e), {});
    const body = document.querySelector('.c-sheet__body');
    if (body) body.addEventListener('click', (ev) => {
      const b = ev.target.closest && ev.target.closest('[data-cw="stepup-ok"]'); if (!b) return;
      dispatch('StepUpSeen', { coachId: b.dataset.coach || e.coachId }); close();
    });
    return close;
  });
}

const LIVE_STAGES = ['bowl', 'chase', 'break'];

/** Ui flags from state plus env probes. wheelOpen: wheel mode screen or a wheel overlay; matchLive: match overs stage; netsScene: env probe. @param {any} state @param {any} [env] */
export function stepUpFlags(state, env) {
  const s = state || {};
  return {
    wheelOpen: !!(env && env.wheelOverlay && env.wheelOverlay()), // mode:'wheel' is the default game mode, so only a real wheel overlay blocks
    matchLive: LIVE_STAGES.includes(s.stage),
    netsScene: !!(env && env.netsScene && env.netsScene()),
  };
}

/** Auto-open the step-up sheet when a card is pending and nothing blocks it. env: { store, openByName(name), overlayOpen(), wheelOverlay?(), netsScene?() }. Returns unsubscribe. When an overlay is up it retries on the next store change. @param {any} env */
export function installStepUpWatcher(env) {
  let opening = false;
  const check = (/** @type {any} */ s) => {
    if (opening || !s) return;
    if (!shouldShowStepUp(s, stepUpFlags(s, env))) return;
    if (env.overlayOpen && env.overlayOpen()) return;
    opening = true;
    try { env.openByName('stepup'); } finally { Promise.resolve().then(() => { opening = false; }); }
  };
  const off = env.store.subscribe(check);
  return typeof off === 'function' ? off : () => {};
}
