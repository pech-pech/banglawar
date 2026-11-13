// Match day settings rows for the Settings sheet (r9). RPT-TEXT owns js/report/settings.js; it calls
// mountMatchdaySettings(root, {features, auto}, dispatch) with root = the .st-body element.
// Row 1: "New match-day and fan features" On/Off (SetFeatures {on}). Row 2: "Auto match day" (SetAutoMatchday {on}), hidden while features are off.
import { esc } from './dom.js';

function switchHtml(attr, title, sub, on) {
  return '<button type="button" class="c-btn md-switch' + (on ? ' is-on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" ' + attr + '>' +
    '<span class="md-switch__t"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>' +
    '<span class="md-switch__v">' + esc(on ? 'On' : 'Off') + '</span></button>';
}
/** Features row: a 56 px switch with words (On / Off), never colour alone. Pure. */
export function featuresRowHtml(on) {
  return '<div class="md-set md-set--features">' + switchHtml('data-md-features', 'New match-day and fan features', 'Match day screen, crowd, fan activities and free facility. Turn off to play the old way.', on) + '</div>';
}
/** Auto match day row. Pure. */
export function autoMatchdayRowHtml(on) {
  return '<div class="md-set md-set--auto">' + switchHtml('data-md-auto', 'Auto match day', 'Skips the match day screen after your first 3 match days. Your boosts then show as small notes on the plan.', on) + '</div>';
}

/** Wheel upgrades row (Spokes and Workshop): On / Off, SetWheelFeatures {on}. Pure. */
export function wheelRowHtml(on) {
  return '<div class="md-set md-set--wheel">' + switchHtml('data-md-wheel', 'Wheel upgrades', 'Spokes, the Workshop and wheel powers. Turn off to spin the old wheels. Your Spokes are kept.', on) + '</div>';
}

function flip(b, next) {
  b.setAttribute('aria-checked', String(next)); b.classList.toggle('is-on', next);
  b.querySelector('.md-switch__v').textContent = next ? 'On' : 'Off';
}
function make(html) { const w = document.createElement('div'); w.innerHTML = html; return /** @type {HTMLElement} */ (w.firstElementChild); }

/** Add both rows (features above auto) before the first button of the settings body. Returns {features, auto} elements.
 * @param {HTMLElement} root @param {{features?:boolean, auto?:boolean, wheel?:boolean}} st @param {(cmd:string, payload:any)=>void} dispatch */
export function mountMatchdaySettings(root, st, dispatch) {
  const feat = make(featuresRowHtml(st.features !== false)), auto = make(autoMatchdayRowHtml(!!st.auto));
  auto.hidden = st.features === false;
  const first = root.querySelector('.st-act');
  root.insertBefore(feat, first || null); root.insertBefore(auto, first || null);
  feat.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-md-features]'); if (!b) return;
    const next = b.getAttribute('aria-checked') !== 'true';
    dispatch('SetFeatures', { on: next }); flip(b, next); auto.hidden = !next;
  });
  auto.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-md-auto]'); if (!b) return;
    const next = b.getAttribute('aria-checked') !== 'true';
    dispatch('SetAutoMatchday', { on: next }); flip(b, next);
  });
  let wheel = null; // only when the caller passes st.wheel (older callers get the two rows as before)
  if (st.wheel !== undefined) {
    wheel = make(wheelRowHtml(st.wheel !== false)); root.insertBefore(wheel, first || null);
    wheel.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-md-wheel]'); if (!b) return;
      const next = b.getAttribute('aria-checked') !== 'true';
      dispatch('SetWheelFeatures', { on: next }); flip(b, next);
    });
  }
  return { features: feat, auto, wheel };
}
/** Kept for callers that only want the auto row. */
export function mountAutoMatchday(root, on, dispatch) { return mountMatchdaySettings(root, { features: true, auto: on }, dispatch).auto; }
