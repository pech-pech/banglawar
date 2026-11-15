// Wheel match mode rows for the Settings sheet (2026-11-15 wheel match, SPEC s14 + 06-DEV-SPEED). js/report/settings.js mounts them:
//   mountWheelMatchSettings(root, {mode, live, dev}, dispatch) with root = the .st-body element.
// Row 1 (top): "Match mode" Wheel / Classic (SetMatchMode {mode}); greyed with "Applies next match" while a match runs.
// Row 2 (bottom): "Dev" On / Off, a plain switch, default off (SetDev {patch:{on}}). On: the Wheel speed section shows: match wheel speed slider
// (matchW0 12-90, live "36 /s" readout, "default 36" note, amber "tweaked" chip, Reset = DevReset {}, Reset all = DevReset {all:true}) and an
// Advanced fold with matchJ, matchD, otherMult. Sliders dispatch SetDev {patch:{key:value}} when let go; the readout follows the thumb live.
// Pure string builders are exported for the DOM-less tests (T-dev-14). Styles live here (one <style>, injected once) so no shared css changes.
import { esc } from './dom.js';
import { DEV_DEFAULTS, DEV_RANGE } from '../data/wheelmatch.js';
import { devClamp } from '../core/wheelmatch.js';

export const DEV_KEYS = ['matchW0', 'matchJ', 'matchD', 'otherMult'];
export const DEV_LABEL = { matchW0: 'Match wheel speed', matchJ: 'Wobble (match wheel)', matchD: 'Glide after STOP', otherMult: 'Other wheels' };
const DEC = { matchW0: 0, matchJ: 1, matchD: 1, otherMult: 2 };
/** Readout words for a dev value: "36 /s", "1.2", "2.0 s", "x1.00". Pure. @param {string} key @param {number} v */
export function devFmt(key, v) {
  const n = Number(v).toFixed(DEC[key] ?? 1);
  return key === 'matchW0' ? n + ' /s' : key === 'matchD' ? n + ' s' : key === 'otherMult' ? 'x' + n : n;
}
const same = (key, v) => Math.abs(Number(v) - DEV_DEFAULTS[key]) < 1e-9;

/** Match mode row: a two-option segmented control (Wheel / Classic), words + aria-pressed, never colour alone. live = a match is running. Pure. */
export function matchModeRowHtml(mode, live) {
  const m = mode === 'wheel' ? 'wheel' : 'classic', dis = live ? ' aria-disabled="true" disabled' : '';
  const opt = (id, big, sub) => '<button type="button" class="c-seg__opt wms-opt' + (m === id ? ' is-selected' : '') + (live ? ' is-disabled' : '') + '" data-wm-mode="' + id + '" aria-pressed="' + (m === id) + '"' + dis + '><b>' + esc(big) + '</b><small>' + esc(sub) + '</small></button>';
  return '<div class="wms-mode' + (live ? ' is-live' : '') + '" role="group" aria-label="Match mode"><span class="st-theme__lbl wms-lbl">Match mode</span>' +
    '<div class="c-seg wms-seg">' + opt('wheel', 'Wheel', 'one spin per over') + opt('classic', 'Classic', 'ball by ball') + '</div>' +
    '<p class="wms-note">' + (live ? 'Applies next match.' : 'Wheel: pick a bowler, spin once per over. Changes start at your next match.') + '</p></div>';
}
/** Dev switch row (plain, at the bottom). Pure. */
export function devRowHtml(on) {
  return '<div class="md-set wms-dev"><button type="button" class="c-btn md-switch' + (on ? ' is-on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-wm-dev>' +
    '<span class="md-switch__t"><b>Dev</b><small>Test tools: wheel speed sliders. Off = normal play.</small></span><span class="md-switch__v">' + (on ? 'On' : 'Off') + '</span></button></div>';
}
/** One slider row: label, readout, default note, tweaked chip, range input (44 px thumb). Pure. */
export function sliderHtml(key, v) {
  const [lo, hi, st] = DEV_RANGE[key], id = 'wms-' + key, tw = !same(key, v);
  return '<div class="wms-row" data-wm-row="' + key + '"><div class="wms-head"><label for="' + id + '">' + esc(DEV_LABEL[key]) + '</label>' +
    '<output class="wms-val" for="' + id + '" data-wm-val="' + key + '">' + esc(devFmt(key, v)) + '</output>' +
    '<span class="wms-chip" data-wm-chip="' + key + '"' + (tw ? '' : ' hidden') + '>tweaked</span></div>' +
    '<input type="range" class="wms-range" id="' + id + '" data-wm-key="' + key + '" min="' + lo + '" max="' + hi + '" step="' + st + '" value="' + v + '" aria-valuetext="' + esc(devFmt(key, v)) + '">' +
    '<div class="wms-ends"><span>' + esc(devFmt(key, lo)) + '</span><span class="wms-def">default ' + esc(devFmt(key, DEV_DEFAULTS[key]).replace(' /s', '')) + '</span><span>' + esc(devFmt(key, hi)) + '</span></div></div>';
}
/** The Wheel speed section (shown only while Dev is on). dev = the saved s.dev (clamped here). Pure. */
export function devSectionHtml(dev, on) {
  const d = devClamp(dev || {});
  return '<div class="wms-sec" data-wm-sec' + (on ? '' : ' hidden') + '><b class="wms-title">Wheel speed</b>' + sliderHtml('matchW0', d.matchW0) +
    '<div class="wms-two"><button type="button" class="c-btn wms-btn" data-wm-reset="one">Reset</button><button type="button" class="c-btn wms-btn" data-wm-reset="all">Reset all</button></div>' +
    '<details class="wms-adv"><summary>Advanced</summary>' + sliderHtml('matchJ', d.matchJ) + sliderHtml('matchD', d.matchD) + sliderHtml('otherMult', d.otherMult) + '</details></div>';
}

export const WMS_CSS = [
  '.wms-mode,.wms-sec{display:flex;flex-direction:column;gap:6px}',
  '.wms-seg .c-seg__opt{flex-direction:column;gap:0;min-height:56px;white-space:normal;line-height:18px}',
  '.wms-seg .c-seg__opt small{font-size:13px;font-weight:400}',
  '.wms-mode.is-live .wms-seg{opacity:.55}',
  '.wms-note{margin:0;font-size:14px;line-height:18px}',
  '.wms-sec{padding:8px 10px;border:2px solid var(--outline);border-radius:var(--c-radius);background:var(--cream)}',
  '.wms-row{display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.wms-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:28px}',
  '.wms-head label{flex:1 1 auto;min-width:0;font-weight:700;font-size:15px}',
  '.wms-val{flex:none;min-width:64px;padding:0 6px;text-align:center;font-weight:700;border:2px solid var(--outline);background:var(--cream);white-space:nowrap}',
  '.wms-chip{flex:none;padding:0 6px;font-size:13px;line-height:20px;background:#f0b429;color:#2a1a00;border:2px solid var(--outline);border-radius:var(--c-radius)}',
  '.wms-range{width:100%;height:44px;margin:0;background:transparent;-webkit-appearance:none;appearance:none;touch-action:pan-y}',
  '.wms-range::-webkit-slider-runnable-track{height:8px;background:var(--outline)}',
  '.wms-range::-moz-range-track{height:8px;background:var(--outline)}',
  '.wms-range::-webkit-slider-thumb{-webkit-appearance:none;width:44px;height:44px;margin-top:-18px;background:var(--gold);border:2px solid var(--outline)}',
  '.wms-range::-moz-range-thumb{width:44px;height:44px;background:var(--gold);border:2px solid var(--outline);border-radius:0}',
  '.wms-ends{display:flex;justify-content:space-between;gap:6px;font-size:13px;line-height:16px}',
  '.wms-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
  '.wms-btn{min-height:44px;width:100%}',
  '.wms-adv summary{min-height:44px;display:flex;align-items:center;font-weight:700;cursor:pointer}',
].join('\n');
function css() {
  if (typeof document === 'undefined' || document.getElementById('wms-css')) return;
  const el = document.createElement('style'); el.id = 'wms-css'; el.textContent = WMS_CSS; document.head.appendChild(el);
}
function make(html) { const w = document.createElement('div'); w.innerHTML = html; return /** @type {HTMLElement} */ (w.firstElementChild); }

/** Mount both rows: Match mode at the top of the sheet body, Dev (and its section) at the bottom. Returns {mode, dev, sec}.
 * @param {HTMLElement} root @param {{mode?:string, live?:boolean, dev?:any}} st @param {(cmd:string, payload:any)=>void} dispatch */
export function mountWheelMatchSettings(root, st, dispatch) {
  css();
  let d = devClamp(st.dev || {});
  const mode = make(matchModeRowHtml(st.mode, !!st.live)), dev = make(devRowHtml(d.on)), sec = make(devSectionHtml(d, d.on));
  root.insertBefore(mode, root.firstChild); root.appendChild(dev); root.appendChild(sec);
  mode.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-wm-mode]'); if (!b || st.live) return;
    const m = b.getAttribute('data-wm-mode'); dispatch('SetMatchMode', { mode: m });
    mode.querySelectorAll('[data-wm-mode]').forEach((o) => { const on = o === b; o.setAttribute('aria-pressed', String(on)); o.classList.toggle('is-selected', on); });
  });
  dev.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-wm-dev]'); if (!b) return;
    const next = b.getAttribute('aria-checked') !== 'true'; dispatch('SetDev', { patch: { on: next } }); d = { ...d, on: next };
    b.setAttribute('aria-checked', String(next)); b.classList.toggle('is-on', next); b.querySelector('.md-switch__v').textContent = next ? 'On' : 'Off'; sec.hidden = !next;
  });
  const show = (key, v) => {
    const o = sec.querySelector('[data-wm-val="' + key + '"]'), c = sec.querySelector('[data-wm-chip="' + key + '"]'), r = /** @type {HTMLInputElement} */ (sec.querySelector('[data-wm-key="' + key + '"]'));
    if (o) o.textContent = devFmt(key, v); if (c) c.hidden = same(key, v); if (r) { r.value = String(v); r.setAttribute('aria-valuetext', devFmt(key, v)); }
  };
  sec.addEventListener('input', (e) => { const r = /** @type {HTMLInputElement} */ (e.target); const k = r.getAttribute && r.getAttribute('data-wm-key'); if (k) show(k, Number(r.value)); });
  sec.addEventListener('change', (e) => {
    const r = /** @type {HTMLInputElement} */ (e.target); const k = r.getAttribute && r.getAttribute('data-wm-key'); if (!k) return;
    const v = Number(r.value); dispatch('SetDev', { patch: { [k]: v } }); d = devClamp({ ...d, [k]: v }); show(k, d[k]);
  });
  sec.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-wm-reset]'); if (!b) return;
    const all = b.getAttribute('data-wm-reset') === 'all'; dispatch('DevReset', all ? { all: true } : {});
    for (const k of all ? DEV_KEYS : ['matchW0']) { d = { ...d, [k]: DEV_DEFAULTS[k] }; show(k, DEV_DEFAULTS[k]); }
  });
  return { mode, dev, sec };
}
