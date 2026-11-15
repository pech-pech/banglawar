/* wheelmatch-view: Wheel match mode (2026-11-15 SPEC s1-4, 8, 9, 13; build CONTRACT UI). One spin = one whole over.
   render(el, vm, dispatch, open), vm = selectors.wheelMatchVM(s) (+ vm.info from app.js: chips, crease, bowler types; all optional).
   Screens (view state only, never saved): pick (bowler rows / bat info) -> wheel ready (SPIN) -> spin (STOP live from 1 s, glow 3.2-3.8 s,
   coast at 6 s) -> glide to the stored landing over D -> 0.40 s beat -> ball row (BALL_SPEED) -> NEXT. Auto over / Auto rest of innings:
   WheelOver {auto:true} paced 0.6 / 0.9 s, no ball row, pinned Stop auto. Reduced motion: no spin, tick or glow; "Show result".
   The landing tick is core landingPos(phys, {t, phi, e: 0}) every frame (the same function the store lands with). The STOP glow reads time only.
   dispatch('WheelOver', p) returns app.js's hold handle {wheel, balls, score, over, stage, nextLabel, ..., release()} or null when rejected. */
import { WHEEL_MATCH, BALL_SPEED, AUTO_PACE } from '../data/wheelmatch.js';
import { landingPos, rimAt, stopBucket } from '../core/wheelmatch.js';
import { stopExtra, TIMING_LINE } from '../core/training.js';
import { ballGlyph, ballWord, overTotals } from './over-panel.js';
import { chipRowHtml, roarChipHtml } from './matchday-view.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TAU = Math.PI * 2;
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

// ---------- pure helpers (test/wheelmatch-ui.test.mjs) ----------

/** Seconds a ball takes in the ball row (05-MOTION Q1a, BALL_SPEED). Overs before fastFrom: full. From fastFrom: dot/1/2 plain, 4/6/W full.
 *  The last two overs of an innings (over >= overs - 1) keep full timing. Pure. */
export function ballDelay(o, over, overs = 10, B = BALL_SPEED) {
  if (!(over >= B.fastFrom) || over >= overs - 1) return B.full;
  return o === 'W' || o === 4 || o === 6 || o === '4' || o === '6' ? B.full : B.plain;
}
/** Land time (s from the start of the row) of each ball. Pure. */
export function ballTimes(balls, over, overs = 10, B = BALL_SPEED) {
  let t = 0; return (balls || []).map((b) => (t += ballDelay(b.o, over, overs, B)));
}
/** STOP glow at wheel time t (s after SPIN): on inside GLOW_LO..GLOW_HI; GLOW_BEATS half-beats of GLOW_BEAT (up, down, up), one shot.
 *  level 0..1 (the glow ring spread). Reads time only, never the segments. Pure. */
export function glowPhase(t, G = WHEEL_MATCH) {
  if (!(t >= G.GLOW_LO && t <= G.GLOW_HI)) return { on: false, beat: -1, level: 0 };
  const x = (t - G.GLOW_LO) / G.GLOW_BEAT, beat = Math.min(G.GLOW_BEATS - 1, Math.floor(x)), u = Math.min(1, x - beat);
  return { on: true, beat, level: beat % 2 === 0 ? u : 1 - u };
}
/** Label layout for one slice (mockups/QA): wide = number outer, stars in a row inside; narrow (the stars do not fit in a row) = number inner,
 *  stars in a row near the rim. span = slice angle (radians), stars = wickets, R = wheel radius (px). Sizes scale from the mockup's R 146. Pure. */
export function labelPlan(span, stars, R) {
  const k = R / 146, r0 = R * 0.52, n = stars | 0;
  const row = !n || n * 15 * k <= r0 * span - 6 * k;
  const p = row ? { row: true, numR: R * 0.74, starR: r0, glyphR: R * 0.93, starHalf: 6.5 * k, gap: 15 * k }
    : { row: false, numR: R * 0.57, starR: R * 0.88, glyphR: R * 0.75, starHalf: 5 * k, gap: 14.5 * k };
  const chord = (r) => 2 * r * Math.sin(Math.min(span, Math.PI) / 2);
  if (n > 1) { const fit = (chord(p.starR) - 4 * k) / n; if (fit < p.gap) { p.gap = Math.max(4, fit); p.starHalf = Math.min(p.starHalf, p.gap * 0.42); } }
  p.font = Math.max(18, 25 * k); p.maxW = Math.max(10, chord(p.numR) - 6 * k);
  return p;
}
/** Seconds one Auto over takes on screen (AUTO_PACE): 0.6, or 0.9 with a wicket, an innings end (WIN / ALL OUT) or the last over. Pure. */
export function autoPace(balls, opts = {}, P = AUTO_PACE) {
  const wk = (balls || []).some((b) => b.o === 'W');
  return wk || opts.end || opts.lastOver ? P.event : P.over;
}
/** Should Auto stop before the next over? 'end' (not our innings screen any more), 'pause' (live chase, last over: the decider is the player's),
 *  'done' (Auto over: its one over is spun), or '' (go on). kind 'over' | 'rest'; spun = overs auto has spun this run. Pure. */
export function autoStopWhy(vm, kind, spun) {
  if (!vm || (vm.side !== 'bowl' && vm.side !== 'bat')) return 'end';
  if (kind === 'over') return spun >= 1 ? 'done' : vm.autoPauseNow ? 'pause' : '';
  if (vm.autoPauseNow) return 'pause';
  return '';
}
/** Signed shortest offset in [-C/2, C/2). Pure. */
export const wrapHalf = (d, C = WHEEL_MATCH.CIRC) => ((((d + C / 2) % C) + C) % C) - C / 2;
/** Glide plan from the STOP to the stored landing: base = rim under the pointer at the STOP, dist = no-wobble glide (unwrapped near the
 *  physical glide speed*D/3), e = what is left to the stored final pos (the wobble). pos(s) = base + stopExtra(dist, e, s, phys). Pure. */
export function glidePlan(phys, stop, finalPos, C = WHEEL_MATCH.CIRC) {
  const base = rimAt(phys, stop.t, stop.phi), raw = landingPos(phys, { t: stop.t, phi: stop.phi, e: 0 }) - base;
  const approx = phys.W0 * Math.exp(-Math.min(stop.t, phys.COAST) / phys.TAU) * phys.D / 3;
  const dist = raw + C * Math.round((approx - raw) / C);
  return { base, dist, e: wrapHalf(finalPos - (base + dist), C) };
}
/** Slice text before landing: the runs label, or the word only for an end slice (WIN / ALL OUT never print runs or stars, F9). Pure. */
export function labelText(g) { return g.end === 'WIN' ? 'WIN' : g.end === 'AO' ? 'ALL OUT' : String(g.label); }
/** Slice text with its wicket stars (Stop now box, wheel words). End slices: the word only. Pure. */
export const toneMark = (t) => (t === 'good' ? '▲' : t === 'bad' ? '▼' : '●');
export const sliceText = (g) => toneMark(g.tone) + ' ' + labelText(g) + (!g.end && g.stars ? ' ' + '✱'.repeat(g.stars) : '');
/** Result chip from the LANDED over (s.last.wheel runs/wk), never the slice's sampled mode: "8 ✱", "WIN 9 ✱". Pure. */
export function landedText(g, w) {
  const runs = w && w.runs != null ? w.runs : g ? g.runs : 0, wk = w && w.wk != null ? w.wk : g ? g.stars : 0;
  return (g && g.end ? labelText(g) + ' ' : '') + runs + (wk ? ' ' + '✱'.repeat(wk) : '');
}
/** Over end word for the mark: 'WIN' | 'TIE' | 'ALL OUT' | ''. Pure. */
export function endMark(end, result) {
  if (result === 'tie' || result === 'tied' || end === 'TIE') return 'TIE';
  if (end === 'WIN') return 'WIN';
  if (end === 'AO' || end === 'ALL OUT') return 'ALL OUT';
  return '';
}
/** "8 runs, 1 wicket" / "9 runs, no wickets". Pure. */
export function overWords(runs, wk) { return plural(runs, 'run') + ', ' + (wk ? plural(wk, 'wicket') : 'no wickets'); }

// ---------- view state (session only) ----------
const st = { mounted: false, key: '', over: 0, phase: 'pick', bowler: null, auto: null, autoSpun: 0, autoSum: null, stopReq: false, busy: false, res: null, el: null, vm: null, dispatch: null, open: null, live: '', chips: [] };
const reducedNow = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let seenKey = ''; // in memory only: after a reload the last stored hand-spun result shows once (no re-spin), then NEXT
const seenGet = () => seenKey;
const seenSet = (k) => { seenKey = k; };
const resKey = (vm, over) => (vm.side || '') + '|' + over + '|' + (vm.score ? vm.score.runs + '/' + vm.score.wk : '');

const TONE = { good: ['good', 'good for us'], so: ['so', 'so-so'], bad: ['bad', 'bad for us'] };
function css(name, fb) {
  try { const v = getComputedStyle(st.el || document.body).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; }
}
function palette() {
  return { good: css('--wm-good', '#9fcb86'), so: css('--wm-so', '#efe2b0'), bad: css('--wm-bad', '#eb9f93'), ink: css('--wm-ink', '#1f2945'), hi: css('--wm-hi', '#ecd55e'), cream: css('--wm-cream', '#f3ecdc'), white: '#fff' };
}

// ---------- markup ----------
function header(vm, sub, score) {
  const sc = score || vm.score || { runs: 0, wk: 0 };
  return '<header class="strip c-dark wm-strip"><span class="score" aria-label="' + esc(sc.runs) + ' runs for ' + esc(sc.wk) + ' wickets">' + esc(sc.runs) + '/' + esc(sc.wk) + '</span>' +
    '<span class="mid"><b>' + esc(sub && sub.big || 'Over ' + vm.over + ' of 10') + '</b><span>' + esc(sub && sub.small || (vm.side === 'bat' ? 'You bat' : 'You bowl')) + '</span></span>' +
    '<button type="button" class="q" data-act="sheet:glossary" aria-label="Cricket words explained">?</button></header>';
}
function needBanner(vm, right) {
  if (vm.side !== 'bat' || !vm.need) return '';
  const n = vm.need;
  return '<div class="wm-need"><b>Need <em>' + esc(n.runs) + '</em> off <em>' + esc(n.balls) + '</em> balls</b>' + (right ? '<span>' + right + '</span>' : '') + '</div>';
}
function lastHtml(vm) {
  const L = vm.last; if (!L || !(L.balls || []).length) return '<p class="wm-last">First over. No balls yet.</p>';
  const t = overTotals(L.balls);
  return '<p class="wm-last"><span>Last over:</span>' + L.balls.slice(0, 6).map((b) => '<span class="wm-b k-' + kindOf(b.o) + '" role="img" aria-label="' + esc(ballWord(b.o)) + '">' + esc(ballGlyph(b.o)) + '</span>').join('') + '<span class="wm-sum">= ' + esc(overWords(t.runs, t.wk)) + '</span></p>';
}
const kindOf = (o) => (o === 'W' ? 'w' : o === 6 ? 's' : o === 4 ? 'f' : 'n');
function ctrlChips(c) {
  if (!c) return '';
  const a = [];
  if (c.slowRank) a.push('Slow Spin ' + c.slowRank); if (c.steadyRank) a.push('Steady ' + c.steadyRank);
  if (c.guide) a.push('Aim Guide'); if (c.zone) a.push('Aim Zone'); if (c.chime) a.push('Gold Chime');
  return a.length ? '<ul class="wm-ctrl list-flat" aria-label="Workshop">' + a.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '';
}
function autoRow(vm) {
  if (vm.autoPauseNow) return ''; // the decider over is the player's (F11)
  const rest = vm.autoRestShown;
  return '<div class="wm-autos"><button type="button" class="c-btn wm-auto" data-wm="auto-over">Auto over</button>' +
    (rest ? '<button type="button" class="c-btn wm-auto" data-wm="auto-rest">Auto rest of innings</button>' : '') + '</div>';
}
const REASON = {};
function bowlerRows(vm) {
  const info = vm.info || {}, types = info.bowlTypes || {}, sel = pickedBowler(vm);
  return '<div class="wm-bowlers" role="radiogroup" aria-label="Pick your bowler">' + (vm.bowlers || []).map((b) => {
    const sub = b.role || types[b.idx] || '';
    const why = !b.ok ? (REASON[b.reason] || b.reason || "Can't bowl now") : '';
    const on = b.ok && b.idx === sel, sug = b.idx === vm.suggested && b.ok;
    const body = '<span class="wm-bn"><b class="name">' + esc(b.name) + (sug ? ' <small class="wm-sug">suggested</small>' : '') + '</b><small>' + esc(why || sub) + '</small></span>' +
      '<span class="wm-ov"><b>' + esc(b.overs) + '/2</b><small>overs</small></span>';
    return b.ok ? '<button type="button" class="wm-brow' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-bowler="' + b.idx + '" aria-label="' + esc(b.name + (sug ? ', suggested' : '') + ', ' + sub + ', ' + b.overs + ' of 2 overs') + '">' + body + '</button>'
      : '<div class="wm-brow is-off" role="radio" aria-checked="false" aria-disabled="true" aria-label="' + esc(b.name + '. ' + why) + '">' + body + '</div>';
  }).join('') + '</div>';
}
function pickedBowler(vm) {
  const ok = (i) => (vm.bowlers || []).some((b) => b.idx === i && b.ok);
  if (st.bowler != null && ok(st.bowler)) return st.bowler;
  if (ok(vm.suggested)) return vm.suggested;
  const f = (vm.bowlers || []).find((b) => b.ok); return f ? f.idx : null;
}
function bowlerOf(vm, i) { return (vm.bowlers || []).find((b) => b.idx === i) || null; }
function batPair(vm) {
  const c = (vm.info && vm.info.crease) || [];
  return c.length ? c.map((b) => b.name).join(' & ') : '';
}
function pickHtml(vm) {
  const reduced = reducedNow(), info = vm.info || {};
  if (vm.side === 'bat') {
    const c = info.crease || [];
    const bats = c.length ? '<p class="wm-cap">Your batters</p><div class="wm-bats">' + c.map((b) => '<div class="wm-bat' + (b.onStrike ? ' is-strike' : '') + '"><b class="name">' + esc(b.name) + '</b><small>' + esc(b.r != null ? b.r + ' (' + b.b + ')' : '') + (b.onStrike ? ' · on strike' : '') + '</small></div>').join('') + '</div>' : '';
    return '<div class="wm wm--pick wm--bat">' + header(vm, { small: vm.target ? 'Chasing ' + vm.target : 'You bat' }) + needBanner(vm, vm.need ? esc(Math.max(0, (vm.need.wkLeft != null ? vm.need.wkLeft : 5 - (vm.score ? vm.score.wk : 0)))) + ' wickets left' : '') +
      chipRowHtml(info.chips) + roarChipHtml(vm.roar) + '<p class="wm-cap">Their bowler this over</p><p class="wm-their">' + esc(vm.rivalBowler ? vm.rivalBowler.name + (vm.rivalBowler.role ? ' (' + vm.rivalBowler.role + ')' : '') : 'They pick a bowler') + '</p>' + bats + lastHtml(vm) +
      '<p class="wm-exp">' + esc(vm.expectText || '') + '</p>' + autoRow(vm) +
      '<div class="wm-cta"><button type="button" class="c-btn c-btn--primary c-btn--cta wm-go" data-wm="go"><span>BAT OVER ' + esc(vm.over) + '</span><small>' + esc(batPair(vm) || (reduced ? 'Show result' : 'whole over in one spin')) + '</small></button></div>' + liveHtml() + '</div>';
  }
  const b = bowlerOf(vm, pickedBowler(vm));
  return '<div class="wm wm--pick wm--bowl">' + header(vm, { small: info.phaseName || 'You bowl' }) + chipRowHtml(info.chips) + roarChipHtml(vm.roar) +
    '<p class="wm-cap">Pick your bowler <small>tap a row</small></p>' + bowlerRows(vm) + lastHtml(vm) + autoRow(vm) +
    '<div class="wm-cta"><button type="button" class="c-btn c-btn--primary c-btn--cta wm-go" data-wm="go"' + (b ? '' : ' disabled') + '><span>BOWL OVER ' + esc(vm.over) + '</span><small class="name">' + esc(b ? b.name : 'No bowler can bowl') + '</small></button></div>' + liveHtml() + '</div>';
}
const liveHtml = () => '<div class="ss-sr wm-live" role="status" aria-live="polite" aria-atomic="true"></div>';
const legendHtml = () => '<div class="wm-legend" aria-hidden="true"><span><i class="wm-sw wm-sw--good">▲</i>good for us</span><span><i class="wm-sw wm-sw--so">●</i>so-so</span><span><i class="wm-sw wm-sw--bad">▼</i>bad for us</span><span><i class="wm-star">✱</i>= wicket</span></div>';
function whoLine(vm, back) {
  if (vm.side === 'bat') return '';
  const b = bowlerOf(vm, pickedBowler(vm)), ty = b ? b.role || (vm.info && vm.info.bowlTypes ? vm.info.bowlTypes[b.idx] : '') : '';
  const pair = batPair(vm);
  return '<p class="wm-who"><span><b class="name">' + esc(b ? b.name : '') + '</b>' + (ty ? ' (' + esc(ty) + ')' : '') + ' bowls' + (pair ? ' to <b class="name">' + esc(pair) + '</b>' : '') + '</span>' + (back ? '<button type="button" class="c-btn wm-back" data-wm="back">Change</button>' : '') + '</p>';
}
function wheelHtml(vm, mode) {
  const reduced = reducedNow(), auto = mode === 'auto';
  const go = auto ? '<button type="button" class="c-btn c-btn--primary wm-go wm-stopauto" data-wm="stop-auto"><span>Stop auto</span></button>'
    : '<button type="button" class="c-btn c-btn--primary c-btn--cta wm-go" data-wm="spin"><span>' + (reduced ? 'Show result' : 'SPIN') + '</span><small>' + (reduced ? 'whole over at once' : 'whole over in one spin') + '</small></button>';
  return '<div class="wm wm--wheel wm--' + (vm.side === 'bat' ? 'bat' : 'bowl') + (auto ? ' is-auto' : '') + '">' + header(vm) +
    needBanner(vm, vm.side === 'bat' ? esc(batPair(vm)) : '') + whoLine(vm, mode === 'ready') +
    '<p class="wm-exp">' + esc(vm.expectText || '') + (vm.roar ? ' <span class="wm-roar">' + esc(typeof vm.roar === 'object' && vm.roar.text || 'Crowd roar +5%') + '</span>' : '') + '</p>' +
    (auto ? '<ol class="wm-achips list-flat" aria-label="Auto overs">' + st.chips.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ol>' : '') +
    '<div class="wm-stage"><div class="wm-wrap"><canvas class="wm-cv" role="img" aria-label="' + esc(segWords(vm.segs)) + '"></canvas><span class="wm-mark" hidden></span></div></div>' + legendHtml() +
    '<div class="wm-row"><div class="wm-now" hidden><span>Stop now:</span><b class="wm-nowv"></b></div><span class="wm-tim" hidden></span>' + ctrlChips(vm.ctrl) + '</div>' +
    '<div class="wm-res" hidden></div>' +
    '<div class="wm-cta">' + go + '</div>' + liveHtml() + '</div>';
}
function segWords(segs) {
  return 'Over wheel: ' + (segs || []).map((g) => labelText(g) + (!g.end && g.stars ? ' with ' + plural(g.stars, 'wicket') : '') + ' ' + Math.round((g.p || 0) * 100) + ' in 100 ' + (TONE[g.tone] || TONE.so)[1]).join(', ');
}

// ---------- wheel canvas ----------
function makeWheel(cv, segs, vm) {
  const C = WHEEL_MATCH.CIRC, U = TAU / C, pal = palette();
  const k = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  let W = 0, R = 0, M = 0, landed = -1, lastRot = null;
  // PERF fix 5: the static wheel (segments, stars, rim) is painted once per model on cv and turned by a CSS transform (compositor);
  // only the overlay (upright labels and tone marks, tick, Aim Guide band, hub, pointer) is drawn per frame.
  const bctx = cv.getContext('2d');
  let ovc = cv.parentElement && cv.parentElement.querySelector('.wm-ovl');
  if (!ovc) { ovc = document.createElement('canvas'); ovc.className = 'wm-ovl'; ovc.setAttribute('aria-hidden', 'true'); cv.insertAdjacentElement('afterend', ovc); }
  const ctx = ovc.getContext('2d');
  function size() {
    const wrap = cv.parentElement, stage = wrap && wrap.parentElement;
    const w = stage ? stage.clientWidth : 300, h = stage ? stage.clientHeight : 300;
    W = Math.max(150, Math.floor(Math.min(w, h, 380)));
    for (const c of [cv, ovc]) { c.width = c.height = Math.round(W * k); c.style.width = c.style.height = W + 'px'; }
    if (wrap) { wrap.style.width = wrap.style.height = W + 'px'; }
    M = Math.max(20, Math.round(W * 0.085)); R = W / 2 - M; paint(); lastRot = null;
  }
  function star(c, x, y, s) { c.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, dx = s * Math.sin(a), dy = s * Math.cos(a); c.moveTo(x - dx, y - dy); c.lineTo(x + dx, y + dy); } c.stroke(); }
  function glyph(c, tone, x, y, s) {
    c.beginPath();
    if (tone === 'good') { c.moveTo(x, y - s); c.lineTo(x + s, y + s * 0.8); c.lineTo(x - s, y + s * 0.8); c.closePath(); c.fill(); }
    else if (tone === 'bad') { c.moveTo(x, y + s); c.lineTo(x + s, y - s * 0.8); c.lineTo(x - s, y - s * 0.8); c.closePath(); c.fill(); }
    else { c.arc(x, y, s * 0.6, 0, TAU); c.fill(); }
  }
  function paint() { // the wheel at pos 0 (segments, stars, rim): drawn once per over (and on landing), then only turned by CSS
    const c = bctx; c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, W); c.translate(W / 2, W / 2);
    const fill = (g) => pal[g.tone] || pal.so, ks = R / 146;
    (segs || []).forEach((g, i) => {
      const a0 = -(g.start + g.width) * U - Math.PI / 2, a1 = -g.start * U - Math.PI / 2;
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a0, a1); c.closePath(); c.fillStyle = fill(g); c.fill();
      if (landed >= 0 && i !== landed) { c.fillStyle = 'rgba(31,41,69,.30)'; c.fill(); }
      c.lineWidth = 2.5 * ks; c.strokeStyle = pal.ink; c.stroke();
    });
    if (landed >= 0 && segs[landed]) { const g = segs[landed], a0 = -(g.start + g.width) * U - Math.PI / 2, a1 = -g.start * U - Math.PI / 2;
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R - 2, a0, a1); c.closePath(); c.lineWidth = 7 * ks; c.strokeStyle = pal.hi; c.stroke(); c.lineWidth = 2 * ks; c.strokeStyle = pal.ink; c.stroke(); }
    c.beginPath(); c.arc(0, 0, R + 7 * ks, 0, TAU); c.lineWidth = 12 * ks; c.strokeStyle = pal.ink; c.stroke();
    for (let j = 0; j < 36; j++) { const a = j / 36 * TAU, r = R + 7 * ks, s = 4 * ks; c.fillStyle = j % 2 ? pal.hi : pal.cream; c.fillRect(r * Math.sin(a) - s / 2, -r * Math.cos(a) - s / 2, s, s); }
    (segs || []).forEach((g) => { // wicket stars turn with the wheel (an asterisk reads the same at any angle)
      const stars = g.end ? 0 : g.stars || 0; if (!stars) return;
      const m = -(g.start + g.width / 2) * U, P = labelPlan(g.width * U, stars, R), sx = P.starR * Math.sin(m), sy = -P.starR * Math.cos(m), tx = Math.cos(m), ty = Math.sin(m);
      c.strokeStyle = pal.ink; c.lineWidth = Math.max(1.6, 3.4 * ks * Math.min(1, P.starHalf / (6.5 * ks))); c.lineCap = 'square';
      for (let j = 0; j < stars; j++) { const o = (j - (stars - 1) / 2) * P.gap; star(c, sx + o * tx, sy + o * ty, P.starHalf); }
    });
  }
  /** One frame. pos = rim units under the pointer; tick = landing units (null = none); band = Aim Guide half-width (units, 0 = none). */
  function draw(pos, f = {}) {
    if (!W) return; const ks = R / 146;
    const rot = (((pos % C) + C) % C) * U; if (rot !== lastRot) { lastRot = rot; cv.style.transform = 'rotate(' + rot.toFixed(5) + 'rad)'; }
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, W, W); ctx.save(); ctx.translate(W / 2, W / 2);
    labels(pos);
    if (f.tick != null) {
      const a = (pos - f.tick) * U, rr = R + 7 * ks;
      if (f.band > 0) { const b = f.band * U; ctx.beginPath(); ctx.arc(0, 0, rr, a - b - Math.PI / 2, a + b - Math.PI / 2); ctx.lineWidth = 12 * ks; ctx.strokeStyle = pal.hi; ctx.stroke(); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = pal.ink; ctx.stroke(); ctx.setLineDash([]); }
      ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -(R + 2 * ks)); ctx.lineTo(-7 * ks, -(R + 20 * ks)); ctx.lineTo(7 * ks, -(R + 20 * ks)); ctx.closePath();
      ctx.fillStyle = pal.hi; ctx.fill(); ctx.lineWidth = 2.5 * ks; ctx.strokeStyle = pal.ink; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = pal.ink; ctx.font = '900 ' + Math.max(9, 11 * ks) + 'px ' + fontFam(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if (Math.cos(a) < 0) { ctx.translate(0, -(R + 28 * ks)); ctx.rotate(Math.PI); ctx.fillText('AIM', 0, 0); } else ctx.fillText('AIM', 0, -(R + 28 * ks)); ctx.restore();
    }
    // hub (does not turn): OVER n
    const hr = 27 * ks; ctx.beginPath(); ctx.arc(0, 0, hr, 0, TAU); ctx.fillStyle = pal.ink; ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.hi; ctx.font = '800 ' + Math.max(8, 10 * ks) + 'px ' + fontFam(); ctx.fillText('OVER', 0, -6 * ks);
    ctx.fillStyle = pal.white; ctx.font = '900 ' + Math.max(11, 16 * ks) + 'px ' + fontFam(); ctx.fillText(String(f.over || ''), 0, 9 * ks);
    // pointer at the top: the slice under it is the result. Aim Zone glows it (feel only); Gold Chime flashes it white.
    const top = -(R + 13 * ks);
    if (f.zone) { ctx.beginPath(); ctx.arc(0, top + 14 * ks, 20 * ks, 0, TAU); ctx.fillStyle = 'rgba(236,213,94,.55)'; ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-15 * ks, top - 10 * ks); ctx.lineTo(15 * ks, top - 10 * ks); ctx.lineTo(0, top + 22 * ks); ctx.closePath();
    ctx.fillStyle = f.chime ? pal.white : pal.hi; ctx.fill(); ctx.lineWidth = 3 * ks; ctx.strokeStyle = pal.ink; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
  }
  /** Labels per frame (QA D2/D3, F16): text is radial but flipped in the lower half so it never reads upside down; tone marks and
   *  stars are drawn screen-upright, so a good ▲ never turns into ▼. End slices (WIN / ALL OUT) show the word only (F9). */
  function labels(pos) {
    const ks = R / 146, fam = fontFam();
    (segs || []).forEach((g) => {
      const span = g.width * U, a = (pos - (g.start + g.width / 2)) * U, stars = g.end ? 0 : g.stars || 0, P = labelPlan(span, stars, R);
      const lower = Math.cos(a) < 0, xy = (r) => [r * Math.sin(a), -r * Math.cos(a)];
      ctx.fillStyle = pal.ink; ctx.strokeStyle = pal.ink;
      const txt = labelText(g); let f = P.font, [x, y] = xy(P.numR);
      ctx.font = '900 ' + f + 'px ' + fam; let w = ctx.measureText(txt).width;
      if (w > P.maxW) f = f * P.maxW / w;
      let show = txt;
      if (f < 10 && g.end) { const sh = g.end === 'AO' ? 'AO' : 'WIN'; f = P.font; ctx.font = '900 ' + f + 'px ' + fam; w = ctx.measureText(sh).width; if (w > P.maxW) f = f * P.maxW / w; show = sh; }
      if (f >= 9) { ctx.save(); ctx.translate(x, y); ctx.rotate(lower ? a + Math.PI : a); ctx.font = '900 ' + f + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(show, 0, 1); ctx.restore(); }
      const c = ctx, at = (r, fn) => { const [gx, gy] = xy(r); c.save(); c.translate(gx, gy); fn(); c.restore(); }; // screen-upright mark
      at(P.glyphR, () => glyph(c, g.tone, 0, 0, 4 * ks));
    });
  }
  function land(i) { landed = i; paint(); }
  size();
  return { draw, land, size, get R() { return R; } };
}
function fontFam() { return css('--font-head', '') || 'system-ui, sans-serif'; }

// ---------- render ----------
/** @param {HTMLElement} el @param {any} vm @param {(cmd:string, payload?:any)=>any} dispatch @param {any} open */
export function render(el, vm, dispatch, open) {
  st.el = el; st.vm = vm; st.dispatch = dispatch; st.open = open;
  if (st.busy && el.querySelector('.wm')) return; // an animation owns the screen (app.js holds re-renders during a WheelOver)
  const key = (vm.side || '') + '|' + (vm.mode || '');
  if (key !== st.key) { st.key = key; st.phase = 'pick'; st.bowler = null; st.res = null; if (st.auto) stopAuto(); }
  if (!st.mounted) { // reload mid-over: the stored result shows (no re-spin) until NEXT
    st.mounted = true; const L = vm.last, rk = resKey(vm, L && L.over);
    if (L && L.wheel && !L.wheel.auto && L.over === vm.over - 1 && seenGet() !== rk) st.res = { wheel: L.wheel, balls: L.balls || [], over: L.over, score: vm.score, stage: null, nextLabel: 'Next over', seenKey: rk, reload: true };
  }
  if (vm.over !== st.over) { st.over = vm.over; if (!st.res) st.phase = st.auto ? 'auto' : 'pick'; }
  if (st.res) return showResult(el, vm, st.res, false);
  if (st.auto) { el.innerHTML = wheelHtml(vm, 'auto'); const w = setupWheel(el, vm.segs, vm); w.draw(st.restPos || 0, { over: vm.over }); bindView(el); const b = el.querySelector('[data-wm="stop-auto"]'); if (b && st.focusStop) b.focus(); scheduleAuto(); return; }
  if (st.phase === 'ready') { if (vm.side === 'bowl' && st.bowler != null && st.bowler !== vm.bowler && typeof vm.vmFor === 'function') { const v2 = vm.vmFor(st.bowler); if (v2) { vm = v2; st.vm = vm; } } el.innerHTML = wheelHtml(vm, 'ready'); const w = setupWheel(el, vm.segs, vm); st.restPos = st.restPos || Math.random() * WHEEL_MATCH.CIRC; w.draw(st.restPos, { over: vm.over }); bindView(el); readyHint(el, vm); const g = el.querySelector('[data-wm="spin"]'); if (g) g.focus(); return; }
  el.innerHTML = pickHtml(vm); bindView(el);
  if (st.liveNote) { const n = st.liveNote; st.liveNote = ''; setTimeout(() => setLive(el, n), 0); } // A11Y-1: a task after the render, so the region exists before its text
}
function readyHint(el, vm) {
  if (reducedNow()) return;
  const n = el.querySelector('.wm-now'); if (!n) return;
  n.hidden = false; n.classList.add('is-hint'); n.innerHTML = '<span>Spin, then watch the AIM tick: tap STOP when a ▲ slice is at it</span>';
}
function setupWheel(el, segs, vm) {
  const cv = el.querySelector('.wm-cv'); const w = makeWheel(cv, segs || [], vm);
  if (st.onResize) removeEventListener('resize', st.onResize);
  st.onResize = () => { if (!cv.isConnected) { removeEventListener('resize', st.onResize); st.onResize = null; return; } w.size(); w.draw(st.drawPos || 0, st.drawOpts || { over: vm.over }); };
  addEventListener('resize', st.onResize);
  st.wheel = w; return w;
}
function setLive(el, text) { const l = el.querySelector('.wm-live'); if (l) l.textContent = text; }
function bindView(el) {
  const root = el.querySelector('.wm'); if (!root) return;
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-res-tap]'); if (!t || !root.contains(t) || t.disabled) return;
    const vm = st.vm, act = t.getAttribute('data-wm');
    if (t.hasAttribute('data-bowler')) { st.bowler = Number(t.getAttribute('data-bowler')); render(el, vm, st.dispatch, st.open); const f = el.querySelector('[data-bowler="' + st.bowler + '"]'); if (f) f.focus(); return; }
    if (act === 'go') { if (vm.side === 'bowl' && pickedBowler(vm) == null) return; st.bowler = pickedBowler(vm); st.phase = 'ready'; st.restPos = Math.random() * WHEEL_MATCH.CIRC; render(el, vm, st.dispatch, st.open); }
    else if (act === 'back') { st.phase = 'pick'; render(el, vm, st.dispatch, st.open); const f = el.querySelector('[data-wm="go"]'); if (f) f.focus(); }
    else if (act === 'spin') onSpin(el, vm, t);
    else if (act === 'auto-over' || act === 'auto-rest') startAuto(el, act === 'auto-rest' ? 'rest' : 'over');
    else if (act === 'stop-auto') { st.stopReq = true; t.setAttribute('aria-disabled', 'true'); t.querySelector('span').textContent = 'Stopping after this over'; }
  });
}

// ---------- spin / STOP / glide ----------
function onSpin(el, vm, btn) {
  if (st.busy) return;
  const phys = vm.phys || WHEEL_MATCH, payloadBowler = vm.side === 'bowl' ? { bowler: pickedBowler(vm) } : {};
  if (reducedNow()) { // no spin, no tick, no glow: the unaimed result (store lands it), text first, balls at once
    const r = st.dispatch('WheelOver', { ...payloadBowler, auto: true }); if (!r) return; // the store lands an aimless spin only as auto (no STOP)
    st.res = r; const keep = !!el.querySelector('.wm--wheel') && !!st.wheel; if (keep) { const sg = (r.wheel && r.wheel.segs) || vm.segs || [], li = sg.findIndex((g) => g.id === (r.wheel && r.wheel.segId)); if (li >= 0) st.wheel.land(li); st.drawPos = r.wheel && r.wheel.pos != null ? r.wheel.pos : 0; }
    showResult(el, vm, r, true, keep); return;
  }
  st.busy = true;
  const C = WHEEL_MATCH.CIRC, phi = st.restPos || 0, w = st.wheel, ctrl = vm.ctrl || {}, guide = !!ctrl.guide, segs = vm.segs || [];
  const nowBox = el.querySelector('.wm-now'), nowV = el.querySelector('.wm-nowv');
  const sub = btn.querySelector('small'), lab = btn.querySelector('span');
  let clock = 0, last = 0, raf = 0, stopped = false, prevSeg = -1, chimeUntil = -1, lastNow = -1, lastGlow = null, lastGlowOn = false;
  const segAtPos = (p) => { const u = ((p % C) + C) % C; for (let i = 0; i < segs.length; i++) { const g = segs[i]; if (u >= g.start && u < g.start + g.width) return i; } return segs.length ? segs.length - 1 : -1; };
  const waitLook = (on) => { btn.classList.toggle('is-wait', on); if (on) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled'); };
  lab.textContent = 'Wait...'; sub.textContent = 'STOP wakes up in a moment'; waitLook(true); btn.setAttribute('data-wm', 'stop');
  const back = el.querySelector('[data-wm="back"]'); if (back) back.remove();
  if (nowBox) { nowBox.classList.remove('is-hint'); nowBox.innerHTML = '<span>Stop now:</span><b class="wm-nowv"></b>'; }
  const nowEl = () => el.querySelector('.wm-nowv');
  function frame(ts) {
    if (stopped) return; const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016; last = ts; clock += dt; // tab hidden: the clock pauses (dt clamp)
    const t = Math.min(clock, phys.COAST), pos = rimAt(phys, t, phi), tick = landingPos(phys, { t, phi, e: 0 });
    const speed = phys.W0 * Math.exp(-t / phys.TAU), si = segAtPos(pos);
    let zone = false, chime = false;
    if (ctrl.zone) { const z = typeof ctrl.zone === 'number' ? ctrl.zone : 0.2, reach = speed * z; for (let d = 0; d <= reach + 1e-9; d += Math.max(0.05, reach / 8)) { const g = segs[segAtPos(pos + d)]; if (g && g.tone === 'good') { zone = true; break; } } } // feel only
    if (ctrl.chime && si !== prevSeg && segs[si] && segs[si].tone === 'good') chimeUntil = clock + 0.3; prevSeg = si; chime = clock < chimeUntil; // feel only
    st.drawPos = pos; st.drawOpts = { over: vm.over, tick, band: guide ? phys.J : 0, zone, chime };
    w.draw(pos, st.drawOpts);
    const ni = segAtPos(tick), ne = ni !== lastNow ? nowEl() : null; if (ne) { lastNow = ni; const g = segs[ni]; if (g) { ne.textContent = sliceText(g); ne.className = 'wm-nowv wm-t--' + (g.tone || 'so'); } }
    if (t >= phys.STOP_FROM && btn.classList.contains('is-wait')) { waitLook(false); lab.textContent = 'STOP'; sub.textContent = 'tap when your slice is at AIM'; btn.setAttribute('aria-label', 'Stop the wheel'); }
    const gl = glowPhase(clock); // time only; one shot
    const gv = gl.on ? (gl.level * 7).toFixed(1) : ''; // DOM writes only on change (PERF fix 5)
    if (gl.on !== lastGlowOn) { lastGlowOn = gl.on; btn.classList.toggle('is-glow', gl.on); }
    if (gv !== lastGlow) { lastGlow = gv; if (gv) btn.style.setProperty('--wm-glow', gv + 'px'); }
    if (gl.on && lab.textContent !== 'STOP!') { lab.textContent = 'STOP!'; sub.textContent = 'Now! ' + WHEEL_MATCH.GLOW_LO + '-' + WHEEL_MATCH.GLOW_HI + ' s'; }
    else if (clock > WHEEL_MATCH.GLOW_HI && lab.textContent === 'STOP!') { lab.textContent = 'STOP'; sub.textContent = 'tap when your slice is at AIM'; }
    if (clock >= phys.COAST) return doStop(phys.COAST, true);
    raf = requestAnimationFrame(frame);
  }
  function doStop(t, coasted) {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf); btn.removeEventListener('click', onTap, true);
    btn.classList.remove('is-glow'); waitLook(true); btn.removeAttribute('aria-label'); lab.textContent = 'Slowing...'; sub.textContent = 'please wait';
    const stop = { t: Math.max(phys.STOP_FROM, Math.min(phys.COAST, t)), phi };
    const r = st.dispatch('WheelOver', { ...payloadBowler, stop });
    if (!r) { st.busy = false; st.phase = 'pick'; render(el, st.vm, st.dispatch, st.open); return; }
    const L = r.wheel || {}, plan = glidePlan(phys, stop, L.pos != null ? L.pos : rimAt(phys, stop.t, phi));
    const bucket = stopBucket(stop.t, !!coasted);
    if (nowBox) nowBox.hidden = true;
    let g0 = 0, gl = 0;
    function glide(ts) {
      const dt = gl ? Math.min(0.05, (ts - gl) / 1000) : 0.016; gl = ts; g0 += dt;
      const s = Math.min(g0, phys.D), pos = plan.base + stopExtra(plan.dist, plan.e, s, phys);
      st.drawPos = pos; st.drawOpts = { over: vm.over }; w.draw(pos, st.drawOpts);
      if (g0 < phys.D) { raf = requestAnimationFrame(glide); return; }
      const fin = L.pos != null ? L.pos : pos; st.drawPos = fin;
      afterLanding(el, vm, r, fin, bucket);
    }
    raf = requestAnimationFrame(glide);
  }
  function onTap(ev) {
    if (st.vm !== vm && !el.contains(btn)) return;
    ev.stopPropagation(); ev.preventDefault();
    const t = Math.min(clock, phys.COAST);
    if (t < phys.STOP_FROM) return; // early presses do nothing
    doStop(t, false);
  }
  btn.addEventListener('click', onTap, true);
  raf = requestAnimationFrame(frame);
}
/** Landing beat (0.40 s; 0.60 s with a WIN / TIE / ALL OUT mark), timing chip, then the ball row. */
function afterLanding(el, vm, r, pos, bucket) {
  const w = st.wheel, segs = (r.wheel && r.wheel.segs) || vm.segs || [], idx = segs.findIndex((g) => g.id === (r.wheel && r.wheel.segId));
  if (idx >= 0) w.land(idx); w.draw(pos, { over: vm.over });
  const tim = el.querySelector('.wm-tim'); if (tim && bucket) { tim.hidden = false; tim.textContent = TIMING_LINE[bucket] || ''; tim.className = 'wm-tim wm-tim--' + bucket; }
  const mk = endMark(r.wheel && r.wheel.end, r.result); stamp(el, mk);
  setTimeout(() => { st.res = r; st.busy = false; showResult(el, st.vm || vm, r, true, true); if (typeof r.prebuild === 'function') setTimeout(r.prebuild, 0); }, mk ? 600 : 400); // warm the next over in the ball row's first gap
}
function stamp(el, mk) { const m = el.querySelector('.wm-mark'); if (!m) return; m.hidden = !mk; m.textContent = mk; m.className = 'wm-mark' + (mk ? ' wm-mark--' + mk.replace(' ', '').toLowerCase() : ''); }

// ---------- result: wheel at rest + ball row ----------
function showResult(el, vm, r, fresh, keepWheel) {
  const reduced = reducedNow(), segs = (r.wheel && r.wheel.segs) || vm.segs || [], idx = segs.findIndex((g) => g.id === (r.wheel && r.wheel.segId)), g = segs[idx];
  const balls = (r.balls || []).slice(0, 6), t = overTotals(balls), mk = endMark(r.wheel && r.wheel.end, r.result), over = r.over || vm.over - 1;
  const say = 'Over ' + over + ': ' + overWords(t.runs, t.wk) + (mk ? '. ' + (mk === 'ALL OUT' ? 'All out' : mk === 'WIN' ? 'Target reached, you win' : 'Scores level, a tie') : '') + '.';
  const shell = !keepWheel || !el.querySelector('.wm--wheel');
  if (shell) {
    const v = { ...vm, over, segs };
    el.innerHTML = wheelHtml(v, 'result');
    if (reduced || fresh) setLive(el, say); // the live region is in the DOM first; the result text goes in before the balls
    const w = setupWheel(el, segs, v); if (idx >= 0) w.land(idx); const pos = r.wheel && r.wheel.pos != null ? r.wheel.pos : (g ? g.start + g.width / 2 : 0); st.drawPos = pos; st.drawOpts = { over }; w.draw(pos, { over });
    stamp(el, mk);
  } else { setLive(el, say); stamp(el, mk); }
  const root = el.querySelector('.wm'); root.classList.add('is-result');
  const sc = r.score || vm.score; const hs = root.querySelector('.wm-strip .score'); if (hs && sc) { hs.textContent = sc.runs + '/' + sc.wk; hs.setAttribute('aria-label', sc.runs + ' runs for ' + sc.wk + ' wickets'); }
  const hm = root.querySelector('.wm-strip .mid'); if (hm) hm.innerHTML = '<b>Over ' + esc(over) + ' done</b><span>' + esc(r.stage === 'break' ? 'Innings over' : r.stage === 'done' ? 'Match over' : 'Next: over ' + (over + 1) + ' of 10') + '</span>';
  if (r.need && root.querySelector('.wm-need')) root.querySelector('.wm-need b').innerHTML = 'Need <em>' + esc(r.need.runs) + '</em> off <em>' + esc(r.need.balls) + '</em> balls';
  ['.wm-row', '.wm-legend', '.wm-exp', '.wm-who'].forEach((q) => { const x = root.querySelector(q); if (x) x.hidden = true; });
  const res = root.querySelector('.wm-res'); res.hidden = false;
  const chip = g ? '<b class="wm-chip wm-t--' + esc(g.tone || 'so') + '">' + esc(toneMark(g.tone) + ' ' + landedText(g, r.wheel)) + '</b>' : '';
  const slots = Array.from({ length: 6 }, (_, i) => '<li class="op-slot' + (i >= balls.length ? ' is-unused' : '') + '" data-i="' + i + '"><span class="op-circle" aria-hidden="true"></span><span class="op-word" aria-hidden="true"></span></li>').join('');
  res.innerHTML = '<div class="wm-resh"><span>Landed on</span>' + chip + '<span class="wm-eq">= ' + esc(overWords(t.runs, t.wk)) + '</span>' +
    '<button type="button" class="c-icon-btn wm-x" aria-label="Skip to the end of the over"><span class="c-ico c-ico--x"></span></button></div>' +
    '<ol class="op-circles wm-balls" aria-label="Balls this over" data-res-tap>' + slots + '</ol><p class="wm-found" hidden></p>';
  if (st.wheel) { st.wheel.size(); st.wheel.draw(st.drawPos != null ? st.drawPos : 0, { over }); } // the panel took room: fit the wheel to what is left
  const nr = root.querySelector('.wm-need span'); if (nr && vm.side === 'bat') nr.textContent = '+' + t.runs + ' this over';
  const nb = root.querySelector('.wm-need b'); if (nb && r.stage === 'done') nb.textContent = r.result === 'won' ? 'You won the chase!' : r.result === 'tied' ? 'Scores level: a tie' : 'Chase over: they won';
  const cta = root.querySelector('.wm-cta'), nx = r.stage === 'done' ? 'See result' : r.stage === 'break' ? 'Innings break' : 'NEXT OVER';
  const nsub = r.stage === 'done' || r.stage === 'break' ? '' : vm.side === 'bowl' ? 'pick bowler for over ' + (over + 1) : 'over ' + (over + 1) + ' of 10';
  cta.innerHTML = '<button type="button" class="c-btn c-btn--primary c-btn--cta wm-go" data-wm-next><span>' + esc(nx) + '</span>' + (nsub ? '<small>' + esc(nsub) + '</small>' : '') + '</button>';
  const slotEls = res.querySelectorAll('.op-slot'); let landed = 0, finished = false; const timers = [];
  function land(i) {
    if (i < landed) return; landed = i + 1; const b = balls[i], k = kindOf(b.o), s = slotEls[i];
    s.querySelector('.op-circle').textContent = ballGlyph(b.o); s.classList.add('is-filled', 'k-' + k); s.querySelector('.op-word').textContent = ballWord(b.o);
    s.setAttribute('aria-label', 'Ball ' + (i + 1) + ': ' + ballWord(b.o).toLowerCase());
  }
  function finish() {
    if (finished) return; finished = true; timers.forEach(clearTimeout); for (let i = landed; i < balls.length; i++) land(i);
    const f = r.found || []; const fp = res.querySelector('.wm-found');
    if (f.length && fp) { fp.hidden = false; fp.innerHTML = '<button type="button" class="c-btn wm-book">New in your Book! (' + f.length + ')</button>'; if (st.wheel) { st.wheel.size(); st.wheel.draw(st.drawPos != null ? st.drawPos : 0, { over }); } } // D13: refit the wheel to the room left
  }
  if (reduced || !fresh) finish();
  else { const ts = ballTimes(balls, over, 10); ts.forEach((tt, i) => timers.push(setTimeout(() => land(i), tt * 1000))); timers.push(setTimeout(finish, (ts[ts.length - 1] || 0) * 1000 + 200)); }
  res.addEventListener('click', (e) => {
    if (e.target.closest('.wm-book')) { const f = r.found || []; next(); if (st.open) st.open('book', { cell: f[0] && f[0].i }); return; }
    finish(); // tap the panel (or X) to fill every ball at once
  });
  function next() {
    if (!finished) { finish(); return; }
    timers.forEach(clearTimeout);
    seenSet(r.seenKey || resKey(st.vm || vm, over)); st.res = null; st.phase = 'pick'; st.bowler = null; st.restPos = 0;
    if (typeof r.release === 'function') r.release(); else render(el, st.vm || vm, st.dispatch, st.open);
  }
  cta.querySelector('[data-wm-next]').addEventListener('click', () => next());
  if (r.release && !r.seenKey) r.seenKey = resKey({ side: vm.side, score: r.score }, over);
  cta.querySelector('[data-wm-next]').focus();
}

// ---------- Auto ----------
function startAuto(el, kind) {
  if (st.auto || st.busy) return;
  st.auto = kind; st.autoSpun = 0; st.stopReq = false; st.chips = []; st.focusStop = true;
  st.autoSum = { from: st.vm.over, runs: 0, wk: 0 };
  render(el, st.vm, st.dispatch, st.open);
}
function stopAuto(note) {
  clearTimeout(st.autoT); st.auto = null; st.stopReq = false; st.focusStop = false; st.phase = 'pick'; st.chips = [];
  if (note) st.liveNote = note;
}
function scheduleAuto() {
  clearTimeout(st.autoT);
  st.autoT = setTimeout(autoStep, 0);
}
function autoStep() {
  const el = st.el, vm = st.vm; if (!st.auto || st.busy || !el) return;
  const why = st.stopReq ? 'stop' : autoStopWhy(vm, st.auto, st.autoSpun);
  if (why) {
    const S = st.autoSum, to = (vm.over || 1) - 1;
    const note = why === 'pause' ? 'Auto paused. ' + (vm.needText || 'Last over') + '. Your over!' : S && st.autoSpun ? spanWords(S.from, to) + ': ' + S.runs + ' for ' + S.wk + '.' : '';
    stopAuto(note); render(el, vm, st.dispatch, st.open); const f = el.querySelector('[data-wm="go"]'); if (f) f.focus(); return;
  }
  st.busy = true;
  const r = st.dispatch('WheelOver', { auto: true });
  if (!r) { st.busy = false; stopAuto('Auto stopped.'); render(el, vm, st.dispatch, st.open); return; }
  st.autoSpun += 1;
  const t = overTotals(r.balls || []); st.autoSum.runs += t.runs; st.autoSum.wk += t.wk;
  const chip = (r.over || vm.over) + ': ' + t.runs + (t.wk ? ' ' + '✱'.repeat(t.wk) : '');
  const ended = r.stage !== st.stageOf(vm), lastOver = (r.over || vm.over) >= 10;
  const pace = autoPace(r.balls, { end: ended || !!(r.wheel && r.wheel.end), lastOver });
  const done = () => {
    st.chips.push(chip); if (st.chips.length > 10) st.chips.shift();
    st.busy = false;
    if (ended) { const S = st.autoSum, to = r.over || vm.over; stopAuto(); st.liveNote = spanWords(S.from, to) + ': ' + S.runs + ' for ' + S.wk + '.'; }
    st.restPos = r.wheel && r.wheel.pos != null ? r.wheel.pos : 0;
    if (typeof r.release === 'function') r.release(); else render(el, st.vm, st.dispatch, st.open);
  };
  if (reducedNow()) { setLive(el, 'Over ' + (r.over || vm.over) + ': ' + overWords(t.runs, t.wk) + '.'); setTimeout(done, pace * 1000); return; } // A11Y-1: keep the Auto pace; the next render is a later task, so the text is read
  // 0.35 s fast spin, 0.25 s cubic ease-out onto the unaimed result; a wicket / end / last over holds 0.3 s more
  const w = st.wheel, segs = (r.wheel && r.wheel.segs) || vm.segs || [], C = WHEEL_MATCH.CIRC, from = st.restPos || 0, to = r.wheel && r.wheel.pos != null ? r.wheel.pos : from;
  const fwd = ((((to - from) % C) + C) % C), total = 2 * C + fwd, fast = 0.35, ease = 0.25, T = fast + ease;
  const v = total / (fast + ease / 3); // speed through the fast part; the ease-out covers v*ease/3
  const idx = segs.findIndex((g) => g.id === (r.wheel && r.wheel.segId));
  const sc = el.querySelector('.wm-strip .score');
  let t0 = 0, raf = 0;
  function f(ts) {
    if (!t0) t0 = ts; const s = (ts - t0) / 1000;
    const pos = s < fast ? from + v * s : from + v * fast + v * ease / 3 * (1 - Math.pow(1 - Math.min(1, (s - fast) / ease), 3));
    if (w) w.draw(pos, { over: r.over || vm.over });
    if (s < T) { raf = requestAnimationFrame(f); return; }
    if (w && idx >= 0) { w.land(idx); w.draw(to, { over: r.over || vm.over }); }
    if (sc && r.score) sc.textContent = r.score.runs + '/' + r.score.wk;
    const ol = el.querySelector('.wm-achips'); if (ol) { const li = document.createElement('li'); li.textContent = chip; ol.appendChild(li); }
    stamp(el, endMark(r.wheel && r.wheel.end, r.result));
    const t1 = performance.now(); if (typeof r.prebuild === 'function') r.prebuild(); // the auto pace hides the next model's build
    setTimeout(done, Math.max(0, (pace - T) * 1000 - (performance.now() - t1)));
  }
  raf = requestAnimationFrame(f);
}
const spanWords = (a, b) => (b > a ? 'Overs ' + a + ' to ' + b : 'Over ' + a);
st.stageOf = (vm) => (vm.side === 'bat' ? 'chase' : 'bowl');

/** Test hook: reset the session view state. */
export function _resetViewState() { Object.assign(st, { mounted: false, key: '', over: 0, phase: 'pick', bowler: null, auto: null, busy: false, res: null, chips: [] }); }
