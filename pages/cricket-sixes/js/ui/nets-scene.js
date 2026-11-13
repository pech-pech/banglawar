/* nets-scene: the Nets Day scene (SPEC s3). About 4 s, tap anywhere to skip, 8 lanes, one result line pops per lane.
   playNets({ lines, skipped, week }, { reduced, onDone }) -> { skip, close }.
   lines   = [{ id, name, stat:'bp'|'bs'|'spd'|'bsk', fromRaw, toRaw, word:'Okay'|'Good'|'Great', wheelGain?, breakthrough }]  (core runNets lines)
   skipped = [{ id, name, why }]  players who could not train (no charge): shown as a quiet lane.
   Letters only: `Rafi  Power  C -> C+  Good!`, fill bar 4 ticks per step. The only digit is the wheel's +N.
   Also exports the small helpers the other train views share (STAT, letterBar, lineText). */
import { esc, icoDeco, nameHtml } from './dom.js';
import { stepOfRaw, letterOfRaw, ticksOfRaw } from '../core/letters.js';

/** Stat key (core short key or old long key) -> { k, icon, word, long }. */
const S = {
  bp: { icon: 'batPower', word: 'Power', long: 'Batting Power' }, bs: { icon: 'batSkill', word: 'Technique', long: 'Batting Technique' },
  spd: { icon: 'bowlSpeed', word: 'Pace', long: 'Bowling Pace' }, bsk: { icon: 'bowlSkill', word: 'Craft', long: 'Bowling Craft' },
};
const ALIAS = { batPower: 'bp', batSkill: 'bs', bowlSpeed: 'spd', bowlSkill: 'bsk' };
export const statKey = (k) => (S[k] ? k : ALIAS[k] || 'bp');
export const STAT = (k) => S[statKey(k)];

/** Letter + 4-tick bar for a raw rating. `from` (optional raw) shows the gain ticks in gold (a tick that was empty before). No digits. */
export function letterBar(raw, from) {
  const L = letterOfRaw(raw), t = ticksOfRaw(raw), f = from == null ? null : (stepOfRaw(from) === stepOfRaw(raw) ? ticksOfRaw(from) : -1);
  let ticks = '';
  for (let i = 0; i < 4; i++) ticks += '<i class="t2-tk' + (i <= t ? ' on' : '') + (f != null && f >= 0 && i <= t && i > f ? ' up' : '') + '"></i>';
  return '<span class="t2-lt"><b>' + esc(L) + '</b><span class="t2-ticks" role="img" aria-label="' + esc('Bar ' + (t + 1) + ' of 4 in ' + L) + '">' + ticks + '</span></span>';
}

/** QA3 m5: the tag shows only when the line crosses a whole letter (E+ to D-), not on every step. */
export const bigStep = (l) => !!l && letterOfRaw(l.fromRaw).charAt(0) !== letterOfRaw(l.toRaw).charAt(0);

/** Plain words for one result: `Rafi, Power, C to C+, Good, Breakthrough`. */
export function lineText(l) {
  const a = letterOfRaw(l.fromRaw), b = letterOfRaw(l.toRaw);
  return l.name + ', ' + STAT(l.stat).word + ', ' + (a === b ? a + ', bar fills' : a + ' to ' + b) + ', ' + l.word + (l.wheelGain ? ', wheel plus ' + l.wheelGain : '') + (bigStep(l) ? ', Breakthrough' : '');
}

/** One result line (used by the scene and by the list on the training screen). */
export function lineHtml(l, cls) {
  const st = STAT(l.stat), a = letterOfRaw(l.fromRaw), b = letterOfRaw(l.toRaw), moved = a !== b;
  return '<li class="t2-line ' + (cls || '') + '" aria-label="' + esc(lineText(l)) + '">' +
    '<span class="t2-l1"><b class="t2-nm">' + nameHtml(l.name) + '</b><span class="t2-st">' + icoDeco(st.icon, 20) + '<span>' + esc(st.word) + '</span></span>' +
    '<span class="t2-ch"><span>' + esc(a) + '</span>' + (moved ? '<span class="t2-arr" aria-hidden="true"></span><b class="t2-new">' + esc(b) + '</b>' : '') + '</span>' +
    '</span>' +
    '<span class="t2-l2">' + letterBar(l.toRaw, l.fromRaw) +
    (l.wheelGain ? '<span class="t2-wheel">Wheel +' + esc(l.wheelGain) + '</span>' : '') +
    (bigStep(l) ? '<span class="t2-bt">Breakthrough!</span>' : '') +
    '<span class="t2-wd">' + esc(l.word) + '!</span></span></li>'; // QA3 m7: the word sits at the end of row 2, so row 1 has room for the whole name
}

export const skipLine = (n) => '<li class="t2-line t2-line--skip" aria-label="' + esc(n.name + ', cannot gain this week') + '"><span class="t2-l1"><b class="t2-nm">' + nameHtml(n.name) + '</b><span class="t2-wd">' + esc(n.why || "Can't gain") + '</span></span></li>';

export function playNets(o, opts) {
  opts = opts || {};
  const lines = o.lines || [], skipped = o.skipped || [], n = lines.length + skipped.length;
  const reduced = opts.reduced != null ? opts.reduced : typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const app = document.getElementById('app'), wasInert = !!(app && app.inert), opener = document.activeElement;
  const ov = document.createElement('section');
  ov.className = 't2-ov ns-scene'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Nets day');
  const ups = lines.filter((l) => letterOfRaw(l.toRaw) !== letterOfRaw(l.fromRaw)).length;
  const summary = 'Nets done. ' + lines.length + ' trained' + (ups ? ', ' + ups + ' moved up a letter' : '') + (skipped.length ? ', ' + skipped.length + " can't gain" : '') + '.';
  ov.innerHTML = '<div class="t2-strip"><span>' + icoDeco('train', 24) + ' Nets day' + (o.week ? ' <small>Week ' + esc(o.week) + '</small>' : '') + '</span></div>' +
    '<ul class="ns-lanes" aria-label="Nets lanes">' + lines.map((l, i) => '<li class="ns-lane" data-i="' + i + '"><span class="ns-runner" aria-hidden="true">' + icoDeco(STAT(l.stat).icon, 20) + '</span><ul class="ns-res">' + lineHtml(l, 'ns-hide') + '</ul></li>').join('') +
    skipped.map((k) => '<li class="ns-lane ns-lane--skip"><ul class="ns-res">' + skipLine(k) + '</ul></li>').join('') + '</ul>' +
    '<div class="t2-foot"><button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block ns-skip">Tap to skip</button></div>' +
    '<div class="sr-only" role="status" aria-live="polite" id="ns-live"></div>';
  document.body.appendChild(ov); if (app) app.inert = true;
  const btn = ov.querySelector('.ns-skip'), live = ov.querySelector('#ns-live'), laneEls = [...ov.querySelectorAll('.ns-lane')];
  let shown = 0, timer = null, closed = false, finished = false;
  const STEP = Math.max(250, Math.min(480, Math.floor(3200 / Math.max(1, n))));
  function reveal(i) { const l = laneEls[i]; if (!l) return; l.classList.add('is-run'); const li = l.querySelector('.ns-hide'); if (li) li.classList.remove('ns-hide'); l.classList.add('is-done'); }
  function finish() {
    if (finished) return; finished = true; if (timer) clearTimeout(timer);
    for (let i = 0; i < laneEls.length; i++) reveal(i);
    btn.textContent = 'Continue'; btn.setAttribute('data-done', '1'); live.textContent = summary;
  }
  function close() {
    if (closed) return; closed = true; if (timer) clearTimeout(timer);
    document.removeEventListener('keydown', onKey, true); ov.remove(); if (app) app.inert = wasInert;
    if (opener && opener.isConnected && opener.focus) opener.focus();
    if (opts.onDone) opts.onDone();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finished ? close() : finish(); }
    else if (e.key === 'Tab') { e.preventDefault(); btn.focus(); }
  }
  function tick() { if (closed || finished) return; if (shown >= laneEls.length) { finish(); return; } reveal(shown++); timer = setTimeout(tick, STEP); }
  ov.addEventListener('click', () => (finished ? close() : finish())); // a tap anywhere skips; once everything shows, a tap continues
  document.addEventListener('keydown', onKey, true);
  btn.focus();
  if (reduced || !n) finish(); else timer = setTimeout(tick, 250);
  return { skip: finish, close };
}
