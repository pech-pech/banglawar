// Wheel match mode rows for the Settings sheet (2026-11-15 wheel match, SPEC s14 + 06-DEV-SPEED). js/report/settings.js mounts them:
//   mountWheelMatchSettings(root, {mode, live, dev}, dispatch) with root = the .st-body element.
// Row 1 (top): "Match mode" Wheel / Classic (SetMatchMode {mode}); greyed with "Applies next match" while a match runs.
// Row 2 (bottom): "Dev" On / Off, a plain switch, default off (SetDev {patch:{on}}). On: the Wheel speed section shows: match wheel speed slider
// (matchW0 12-90, live "36 /s" readout, "default 36" note, amber "tweaked" chip, Reset = DevReset {}, Reset all = DevReset {all:true}) and an
// Advanced fold with matchJ, matchD, otherMult, then the DEV_GROUPS folds (tick lead, pulse, tick size). Reset all = every DEV_RANGE key. Sliders dispatch SetDev {patch:{key:value}} when let go; the readout follows the thumb live.
// Pure string builders are exported for the DOM-less tests (T-dev-14). Styles live here (one <style>, injected once) so no shared css changes.
import { esc } from './dom.js';
import { DEV_DEFAULTS, DEV_RANGE, DEV_ORDER, DEV_POWERS } from '../data/wheelmatch.js';
import { devClamp } from '../core/wheelmatch.js';

/** Every Dev slider key (DEV_RANGE order, minus the power test rows DEV_POWERS, which have their own switch rows): Reset all and the tests loop
 *  it, so a new slider key is never missed. */
export const DEV_KEYS = Object.keys(DEV_RANGE).filter((k) => !(k in DEV_POWERS));
// Add a row: DEV_DEFAULTS + DEV_RANGE (data/wheelmatch.js), then a label here (DEV_LABEL), its readout (DEC + UNIT) and its place (DEV_GROUPS).
export const DEV_LABEL = { matchW0: 'Match wheel speed', matchJ: 'Wobble (match wheel)', matchD: 'Glide after STOP', otherMult: 'Other wheels',
  matchLeadMin: 'Tick lead, slow end', matchLeadMax: 'Tick lead, fast end', matchCycle: 'Pulse cycle length', tickW: 'Tick width', tickL: 'Tick length' };
const DEC = { matchW0: 0, matchJ: 1, matchD: 1, otherMult: 2, matchLeadMin: 0, matchLeadMax: 0, matchCycle: 1, tickW: 0, tickL: 0 };
/** Readout unit after the number ('' = bare number); otherMult reads "x1.00". */
const UNIT = { matchW0: ' /s', matchD: ' s', matchLeadMin: ' deg', matchLeadMax: ' deg', matchCycle: ' s', tickW: ' px', tickL: ' px' };
/** Folds after Advanced: one <details> each, rows in order. A new Dev group is one entry here (rows default to sliderHtml). */
export const DEV_GROUPS = [
  { id: 'lead', title: 'Tick lead (match wheel)', note: 'How far ahead of the pointer the landing tick sits: slow end at the slow point, fast end at full speed. Slow end stays at or below fast end.', keys: ['matchLeadMin', 'matchLeadMax'] },
  { id: 'pulse', title: 'Pulse (match wheel)', note: 'One speed cycle. The slow point and the STOP glow move with it.', keys: ['matchCycle'] },
  { id: 'tick', title: 'Tick size (Bold tick)', note: 'Only with Tick set to Bold.', keys: ['tickW', 'tickL'] },
];
/** Readout words for a dev value: "36 /s", "1.2", "2.0 s", "x1.00", "60 deg", "5 px". Pure. @param {string} key @param {number} v */
export function devFmt(key, v) {
  if (POW_KEYS.includes(key)) return powFmt(key, v); // Dev power test rows: Auto / Off / On, Auto / rank n
  const n = Number(v).toFixed(DEC[key] ?? 1);
  return key === 'otherMult' ? 'x' + n : n + (UNIT[key] || '');
}
/** SetDev patch for one slider let go: DEV_ORDER pairs push the partner so lo <= hi (moving lo above hi raises hi; moving hi below lo lowers lo).
 * d = the clamped current dev. Pure. @param {any} d @param {string} key @param {number} v */
export function devPatch(d, key, v) {
  /** @type {Record<string, number>} */ const patch = { [key]: v };
  for (const [lo, hi] of DEV_ORDER) {
    if (key === lo && v > d[hi]) patch[hi] = v;
    if (key === hi && v < d[lo]) patch[lo] = v;
  }
  return patch;
}
const same = (key, v) => Math.abs(Number(v) - DEV_DEFAULTS[key]) < 1e-9;

// ---- Dev power test (M 2026-11-18 Dev 5/6): Aim Guide / Aim Zone / Gold Chime as Auto / Off / On switches (words + aria-pressed, 56 px),
// Slow / Steady ranks as sliders (Auto, then 0..max). -1 = Auto = the Workshop rank, no override (core devPowers). Own key list: DEV_KEYS stays
// the plain wheel sliders; Reset all resets these too (powWire + store devReset). Shown inside the Dev section, so only while Dev is on.
export const POW_SWITCHES = ['powGuide', 'powZone', 'powChime'];
export const POW_SLIDERS = ['powSlow', 'powSteady'];
export const POW_KEYS = [...POW_SWITCHES, ...POW_SLIDERS];
export const POW_LABEL = { powGuide: 'Aim Guide', powZone: 'Aim Zone', powChime: 'Gold Chime', powSlow: 'Slow Spin rank', powSteady: 'Steady Axle rank' };
Object.assign(DEV_LABEL, { powSlow: POW_LABEL.powSlow, powSteady: POW_LABEL.powSteady }); // sliderHtml reads DEV_LABEL
/** Power row readout: -1 "Auto"; switch 0 "Off" / 1 "On"; slider "rank n". Pure. @param {string} key @param {number} v */
export function powFmt(key, v) {
  const n = Math.round(Number(v));
  return n < 0 ? 'Auto' : POW_SWITCHES.includes(key) ? (n > 0 ? 'On' : 'Off') : 'rank ' + n;
}
/** One power switch row: name, readout, tweaked chip, Auto / Off / On segmented buttons (56 px). Pure. @param {string} key @param {number} v */
export function powSwitchHtml(key, v) {
  const opt = (/** @type {number} */ val, /** @type {string} */ word) => '<button type="button" class="c-seg__opt wms-opt' + (v === val ? ' is-selected' : '') + '" data-wm-pow="' + key + '" data-wm-pv="' + val + '" aria-pressed="' + (v === val) + '"><b>' + word + '</b></button>';
  return '<div class="wms-row wms-pow" data-wm-row="' + key + '" role="group" aria-label="' + esc(POW_LABEL[key]) + '"><div class="wms-head"><span class="wms-pl">' + esc(POW_LABEL[key]) + '</span>' +
    '<output class="wms-val" data-wm-val="' + key + '">' + esc(powFmt(key, v)) + '</output><span class="wms-chip" data-wm-chip="' + key + '"' + (same(key, v) ? ' hidden' : '') + '>tweaked</span></div>' +
    '<div class="c-seg wms-seg">' + opt(-1, 'Auto') + opt(0, 'Off') + opt(1, 'On') + '</div></div>';
}
/** The Power test block (inside the Dev section). dev = saved s.dev (clamped here). Pure. @param {any} dev */
export function powSectionHtml(dev) {
  const d = /** @type {any} */ (devClamp(dev || {}));
  return '<div class="wms-pows" data-wm-pows><b class="wms-title">Power test</b><p class="wms-note">Try a Control power without buying. Auto = your Workshop rank. Dev only: Workshop and save untouched.</p>' +
    POW_SWITCHES.map((k) => powSwitchHtml(k, d[k])).join('') + POW_SLIDERS.map((k) => sliderHtml(k, d[k])).join('') + '</div>';
}
export const POW_CSS = ['.wms-pows{display:flex;flex-direction:column;gap:6px;margin-top:8px}', '.wms-pl{flex:1 1 auto;min-width:0;font-weight:700;font-size:15px}'].join('\n');
/** Wire the power switches (SetDev {patch}) and repaint every power row on Reset all. get/set = the mount's local dev copy. */
function powWire(/** @type {HTMLElement} */ sec, /** @type {() => any} */ get, /** @type {(d:any) => void} */ set, /** @type {(cmd:string, payload:any)=>void} */ dispatch) {
  const paint = (/** @type {string} */ k, /** @type {number} */ v) => {
    sec.querySelectorAll('[data-wm-pow="' + k + '"]').forEach((b) => { const on = Number(b.getAttribute('data-wm-pv')) === v; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-selected', on); });
    const o = sec.querySelector('[data-wm-val="' + k + '"]'), c = /** @type {HTMLElement|null} */ (sec.querySelector('[data-wm-chip="' + k + '"]')), r = /** @type {HTMLInputElement|null} */ (sec.querySelector('[data-wm-key="' + k + '"]'));
    if (o) o.textContent = devFmt(k, v); if (c) c.hidden = same(k, v); if (r) { r.value = String(v); r.setAttribute('aria-valuetext', devFmt(k, v)); }
  };
  sec.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target), b = t.closest('[data-wm-pow]');
    if (b) { const k = /** @type {string} */ (b.getAttribute('data-wm-pow')), v = Number(b.getAttribute('data-wm-pv')); dispatch('SetDev', { patch: { [k]: v } }); set(devClamp({ ...get(), [k]: v })); paint(k, get()[k]); return; }
    if (t.closest('[data-wm-reset="all"]')) { let d = get(); for (const k of POW_KEYS) { d = { ...d, [k]: DEV_DEFAULTS[k] }; paint(k, DEV_DEFAULTS[k]); } set(d); }
  });
}

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
/** Row renderers by key; a key without one is a slider. Another row kind (a switch, a debug line) registers here. */
export const DEV_ROW = {};
/** One Dev row by key. Pure. @param {string} key @param {any} v */
export const devRowFor = (key, v) => (DEV_ROW[key] ? DEV_ROW[key](key, v) : sliderHtml(key, v));
/** One DEV_GROUPS fold (56 px summary, a note in words, its rows). Pure. @param {{id:string,title:string,note?:string,keys:string[]}} g @param {any} d clamped dev */
export function devGroupHtml(g, d) {
  return '<details class="wms-adv" data-wm-group="' + esc(g.id) + '"><summary>' + esc(g.title) + '</summary>' + (g.note ? '<p class="wms-note">' + esc(g.note) + '</p>' : '') +
    g.keys.map((k) => devRowFor(k, d[k])).join('') + '</details>';
}
/** The Wheel speed section (shown only while Dev is on). dev = the saved s.dev (clamped here). Pure. */
export function devSectionHtml(dev, on) {
  const d = devClamp(dev || {});
  return '<div class="wms-sec" data-wm-sec' + (on ? '' : ' hidden') + '><b class="wms-title">Wheel speed</b>' + sliderHtml('matchW0', d.matchW0) +
    '<div class="wms-two"><button type="button" class="c-btn wms-btn" data-wm-reset="one" aria-label="Reset match wheel speed">Reset</button><button type="button" class="c-btn wms-btn" data-wm-reset="all" aria-label="Reset all Dev values">Reset all</button></div>' +
    '<details class="wms-adv"><summary>Advanced</summary>' + sliderHtml('matchJ', d.matchJ) + sliderHtml('matchD', d.matchD) + sliderHtml('otherMult', d.otherMult) + '</details>' +
    DEV_GROUPS.map((g) => devGroupHtml(g, d)).join('') + '</div>';
}

export const WMS_CSS = [
  '.wms-mode,.wms-sec{display:flex;flex-direction:column;gap:6px}',
  '.wms-mode[hidden],.wms-sec[hidden]{display:none}',
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
  '.wms-range{width:100%;height:56px;margin:0;background:transparent;-webkit-appearance:none;appearance:none;touch-action:pan-y}',
  '.wms-range::-webkit-slider-runnable-track{height:8px;background:var(--outline)}',
  '.wms-range::-moz-range-track{height:8px;background:var(--outline)}',
  '.wms-range::-webkit-slider-thumb{-webkit-appearance:none;width:56px;height:56px;margin-top:-24px;background:var(--gold);border:2px solid var(--outline)}',
  '.wms-range::-moz-range-thumb{width:56px;height:56px;background:var(--gold);border:2px solid var(--outline);border-radius:0}',
  '.wms-ends{display:flex;justify-content:space-between;gap:6px;font-size:13px;line-height:16px}',
  '.wms-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
  '.wms-btn{min-height:56px;width:100%}',
  '.wms-adv summary{min-height:56px;display:flex;align-items:center;font-weight:700;cursor:pointer}',
].join('\n');
function css() {
  if (typeof document === 'undefined' || document.getElementById('wms-css')) return;
  const el = document.createElement('style'); el.id = 'wms-css'; el.textContent = WMS_CSS + '\n' + POW_CSS; document.head.appendChild(el);
}
function make(html) { const w = document.createElement('div'); w.innerHTML = html; return /** @type {HTMLElement} */ (w.firstElementChild); }

/** Mount both rows: Match mode at the top of the sheet body, Dev (and its section) at the bottom. Returns {mode, dev, sec}.
 * @param {HTMLElement} root @param {{mode?:string, live?:boolean, dev?:any}} st @param {(cmd:string, payload:any)=>void} dispatch */
export function mountWheelMatchSettings(root, st, dispatch) {
  css();
  let d = devClamp(st.dev || {});
  const mode = make(matchModeRowHtml(st.mode, !!st.live)), dev = make(devRowHtml(d.on)), sec = make(devSectionHtml(d, d.on));
  root.insertBefore(mode, root.firstChild); root.appendChild(dev); root.appendChild(sec);
  sec.appendChild(make(powSectionHtml(d))); powWire(sec, () => d, (nd) => { d = nd; }, dispatch); // Dev power test rows (hidden with sec)
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
    const patch = devPatch(d, k, Number(r.value)); dispatch('SetDev', { patch }); d = devClamp({ ...d, ...patch }); for (const pk of Object.keys(patch)) show(pk, d[pk]);
  });
  sec.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-wm-reset]'); if (!b) return;
    const all = b.getAttribute('data-wm-reset') === 'all'; dispatch('DevReset', all ? { all: true } : {});
    for (const k of all ? DEV_KEYS : ['matchW0']) { d = { ...d, [k]: DEV_DEFAULTS[k] }; show(k, DEV_DEFAULTS[k]); }
  });
  return { mode, dev, sec };
}
