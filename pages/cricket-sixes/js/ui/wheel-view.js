/* wheel-view: the shared big wheel on the pulse engine (A2.1; wheels SPEC 2a-2g, CONTRACT-A sec 4). Layout A: big centre wheel under the card, result box + COLLECT below.
   openWheel(o) -> close()
   o = { title, sub?, cardHtml,                 card under the strip (trusted markup)
         ring?: SliceRow[]                      CONTRACT-A sec 5 rows {id, w, value, label, tier, gold} (w in rim units). Replaces the four old keys below
         slices:number[], jackpotIndex, widths?:number[], plus:'+'   old ring keys, still accepted until T2/T4 move to `ring` (widths: units; missing = looked up from the jackpot gain)
         wheelId?, spinKey?                     sec 6 id + spinKeyOf key (data attributes only; the host records)
         J?:number                              the wheel's J before Steady (Find 1.5); phys.J (after Steady), when given, wins; default WHEEL_ENGINE.J
         wobKey?:string                         wobbleKey(...): the wobble is wheelWobble(wobKey, J). No key = an unkeyed draw (old callers)
         stored?:{stops, kept, spent}           the wheels.stops entry: a recorded stop opens on its result and never spins again
         legend?:[{ch, text}]                   under-7% letters (default: legendRows(ring))
         pending: {index,gain,jackpot}|null,    already spun (reload / reopen): opens on the result
         onSpin(stop),                          the one STOP callback, called synchronously at STOP before the result animation (the host's spin handler calls recordStop).
                                                stop = {t, phi, e, stopT, cycle, tInCycle, sliceId, respin}: t = s since SPIN (tap event timeStamp), phi = start offset (units), e = wobble, stopT = ms
         onTick?({loud, rate}),                 optional: one call per slice boundary under the pointer (sound hook)
         getPending() -> {index,gain,jackpot}|null,
         describe(p) -> { big:'+2 Power', from:'C', to:'C+', barHtml?, breakthrough:bool, say:'one line for the live region' },
         onCollect(), collectLabel?:'COLLECT', onClose?(),
         phys?:{W0,J,SD,D?}     physics after Control (Slow scales W0 and the ramp peak, Steady scales J); default WHEEL_ENGINE
         zone?:number           Aim Zone (seconds): the pointer-lane marks glow gold while a gold slice is within that many seconds of the pointer (feel only)
         chime?:boolean         Gold Chime: the pointer flashes gold, and onTick gets {chime:true}, each time a gold slice passes under it (feel only)
         guide?:boolean         Aim Guide: the gold wedge tick plus the yellow rim band of the J spread around it
         tokens?, getTokens?(), onToken(kind), spokeGain?(), labels?, aims?, plainResult?, jpText?, tokName?, outcome?(kind,before,after), look?, golds?   as before
         timing?                accepted and ignored: the STOP glow is always on }
   Pulse (SPEC 2c): elapsed = performance.now() - SPIN time, never integrated from frames; the wheel turns phi + arc(t) and the tick shows phi + tickAt(t).
   STOP uses the tap event's timeStamp; STOP is ignored for STOP_GUARD_S (0.35 s) after SPIN; a double tap counts once. No coast, no auto-stop, no skip:
   the wheel spins until STOP (still spinning at 60 s, after a hidden tab too). Glow 3.2-3.8 s of every cycle, button reads "STOP!". Every wheel always spins.
   Canvas drawn in code, pixel style, palette read from the page's CSS variables (Green and chalk and Scorebook both work).
   Ring wheels (o.ring; T3 QA D2/D4/D5/D8/D9, T1 QA D1-D6, T6 live QA): the list reads clockwise from the pointer (the wheel turns anticlockwise, so slices
   still reach the pointer in list order); labels run radially and fit their slice (too long = one character + a legend row under the wheel); every slice
   has its tier mark; no jackpot diamond; AIM rides the moving landing tick (as on the match wheel) and the card reads "Tick on: <slice>"; the result
   says "Landed on [slice]" and lights only the landed slice; a stored stop reopens with its Early / Good timing / Late line. */
/** Is the ring drawn clockwise (list order clockwise from the pointer, SPEC 3-10)? Ring wheels yes; the old Training keys keep their look. Pure. */
export const ringDir = (isRing) => (isRing ? -1 : 1);
/** Canvas angle (0 = right, y down) of wheel coordinate u when pos is under the pointer at the top. dir = ringDir(..). Pure. */
export const screenAngle = (u, pos, U, dir) => -Math.PI / 2 + dir * (pos - u) * U;
/** Which slice index a result shows: the host's pending index when it is a number, else the slice the stop landed on. Pure (T6 live QA: a pending
 *  without an index turned the whole wheel to NaN, one gold blur). */
export function landedIndex(p, stop, n) {
  const i = p && Number.isFinite(+p.index) && p.index !== null && p.index !== '' ? +p.index : stop && Number.isFinite(+stop.sliceId) ? +stop.sliceId : 0;
  return Math.max(0, Math.min(Math.max(0, n - 1), Math.round(i)));
}
/** Largest wheel (css px) a ring wheel may take: 340 narrow, 420 at >= 560 wide, 560 on the landscape inner screen (GRID-RULES G0: >= 760 x >= 500, landscape), where the wheel owns the left column. Pure. */
export const isLandscapeWide = (w, h) => w >= 760 && h >= 500 && w > h;
export const wheelCap = (w, h, wide) => (isLandscapeWide(w, h) ? 560 : wide ? 420 : 340);
import { esc, icoDeco } from './dom.js';
import { releaseInert } from './inert.js';
import { wheelWidths, stopExtra, TIMING_WIN, timingBucket, TIMING_LINE } from '../core/training.js';
import { scoutShort } from './wheels/scout-opts.js';
import { matOf, colourOf, normLook, PALETTES, spokeIcon, glowOn, aimMarker, sliceLabel, legendRows, tierShape, LABEL_MIN_W, tierMark, MARK_MIN_RAD, radialFit, radialTurn, legendWith, legendShape, cardOf, rowText, boostText, splitNameValue, tierKeyRows, uniquePrefixLens, uniqueTailLens, shortNameForms, scoutNameCuts } from './wheel-look.js';
import { tickKind, TICK } from '../core/landtick.js';
import { getTickStyle } from '../report/tick-pref.js';
import { WHEEL_ENGINE } from '../data/wheel-engine.js';
import { pulseW, pulseArc, tickAt, cycleOf, ARC_PER_CYCLE } from '../core/wheel-pulse.js';
import { restNudge, seamClearDeg } from '../core/wheel-ring.js';
import { wheelWobble } from '../core/wheel-wobble.js';

const TAU = Math.PI * 2, E = WHEEL_ENGINE;
const nowMs = () => performance.now();

/** Resolve a CSS variable to [r,g,b] (works through var() chains and both skins). */
function tok(name, fb) {
  const p = document.createElement('i'); p.style.cssText = 'position:absolute;visibility:hidden;color:var(' + name + ',' + fb + ')'; document.body.appendChild(p);
  const m = getComputedStyle(p).color.match(/\d+(\.\d+)?/g) || [0, 0, 0]; p.remove(); return [+m[0], +m[1], +m[2]];
}
/** QA3 m5: "Breakthrough!" is kept for a whole-letter change (E+ to D-), not every step (E to E+). */
export const wholeLetter = (a, b) => String(a || '').charAt(0) !== String(b || '').charAt(0);
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const dim = (c, k) => c.map((v) => Math.round(v * (1 - k)));

/** Aim Zone: is a gold slice under the pointer, or due under it (or just past it) within `zone` seconds at the wheel's speed (units/second)? cum = slice edges in wheel units (cum[i]..cum[i+1] is slice i), C = the wheel's total width, golds = gold slice indices. Pure. */
export function goldNearPointer(pos, speed, zone, cum, C, golds) {
  if (!(zone > 0)) return false;
  const reach = Math.max(0, speed) * zone;
  for (const g of golds) { const a = cum[g], b = cum[g + 1], inside = (((pos - a) % C) + C) % C < b - a, ahead = (((a - pos) % C) + C) % C, behind = (((pos - b) % C) + C) % C; if (inside || ahead <= reach || behind <= reach) return true; }
  return false;
}
/** Gold Chime: does the pointer moving from slice a to slice b just enter a gold slice? Pure. */
export const chimeEnters = (a, b, golds) => a !== b && golds.includes(b) && !golds.includes(a);

/* ---- Pure pulse pieces of the view (exported for the tests; no DOM, no clock of their own). ---- */
/** Slice index under wheel coordinate pos (units, any sign) for edges cum (cum[0] = 0, cum[N] = C). */
export function sliceIndexAt(cum, C, pos) {
  const N = cum.length - 1; let u = pos % C; if (u < 0) u += C;
  for (let i = 0; i < N; i++) if (u < cum[i + 1]) return i;
  return N - 1;
}
/** One frame at `elapsed` s since SPIN from start offset phi: pointer pos, landing tick (no wobble), speed, glide still to come, cycle, glow. */
export function spinFrame(P, phi, elapsed) {
  const { cycle, tInCycle } = cycleOf(elapsed, P), arc = (cycle - 1) * ARC_PER_CYCLE(P) + pulseArc(tInCycle, P), D = (P && P.D) ?? E.D;
  return { pos: phi + arc, tick: phi + tickAt(elapsed, P), speed: pulseW(tInCycle, P), dist: pulseW(tInCycle, P) * D / 3, cycle, tInCycle, glow: glowOn(tInCycle) };
}
/** The STOP record for a tap at t s since SPIN with wobble e: landing = phi + tickAt(t) + e (mod ring). base/dist feed the ease-out. */
export function pulseStop(P, phi, t, e, cum, C, respin = 0) {
  const f = spinFrame(P, phi, t), sliceId = sliceIndexAt(cum, C, f.tick + e);
  return { stop: { t, phi, e, stopT: Math.round(t * 1000), cycle: f.cycle, tInCycle: f.tInCycle, sliceId, respin: respin ? 1 : 0 }, base: f.pos, dist: f.dist };
}
/** SPIN / STOP clock on tap timestamps (ms). start() once (a second SPIN tap = false); tap() returns the STOP time in s, or null inside the guard,
 *  before SPIN, or after the first STOP (a double tap counts once). Nothing here ever stops the wheel by itself. */
export function spinClock(guardS = E.STOP_GUARD_S) {
  let t0 = null, done = false;
  const c = {
    get spinning() { return t0 != null && !done; },
    get stopped() { return done; },
    start(ms) { if (t0 != null) return false; t0 = +ms; return true; },
    elapsed(ms) { return t0 == null ? 0 : Math.max(0, (ms - t0) / 1000); },
    armed(ms) { return c.spinning && c.elapsed(ms) >= guardS; },
    tap(ms) { if (!c.spinning) return null; const t = c.elapsed(ms); if (t < guardS) return null; done = true; return t; },
  };
  return c;
}
/** Which stored stop the wheel opens on (null = unspun): a recorded stop, unless a Spin Again / Pick Two is spent and its next stop is still to come. */
export function storedStop(stored) {
  const st = stored && Array.isArray(stored.stops) ? stored.stops : null;
  if (!st || !st.length || (stored.spent && st.length < 2)) return null;
  return st[Math.max(0, Math.min(st.length - 1, stored.kept | 0))] || null;
}

const SHAPE_SAY = { top: 'triangle', mid: 'dot', low: 'pale dot', gold: 'gold' };
/** Small focus / prize icons drawn in code (legend rows; slices draw the same on the canvas). Unknown names try the kit icon set, else nothing. */
const ONE_HALO = '-1px 0 #f4ecd6,1px 0 #f4ecd6,0 -1px #f4ecd6,0 1px #f4ecd6,-1px -1px #f4ecd6,1px 1px #f4ecd6,-1px 1px #f4ecd6,1px -1px #f4ecd6,0 0 3px #f4ecd6'; // cream halo for a one-character label
const ICON_SVG = {
  bat: '<svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true" focusable="false"><g transform="rotate(35)"><rect x="-2.5" y="-7.5" width="5" height="10" rx="1.5" fill="#c9a36a" stroke="#1f2945" stroke-width="1.2"/><rect x="-1" y="2.5" width="2" height="5" fill="#1f2945"/></g></svg>',
  ball: '<svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true" focusable="false"><circle r="6.5" fill="#c0392b" stroke="#1f2945" stroke-width="1.2"/><path d="M-4.5,-4 Q0,0 -4.5,4 M4.5,-4 Q0,0 4.5,4" stroke="#fff" stroke-width="1.1" fill="none"/></svg>',
  bal: '<svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true" focusable="false"><circle r="6.5" fill="#fff" stroke="#1f2945" stroke-width="1.2"/><path d="M0,-6.5 A6.5,6.5 0 0 1 0,6.5 Z" fill="#1f2945"/></svg>',
};
const iconKey = (k) => { const v = String(k || '').toLowerCase(); return v === 'bowl' ? 'ball' : v === 'balanced' || v === 'all' || v === 'allround' ? 'bal' : v; };
function iconHtml(k) { const v = iconKey(k); return '<span class="wk-legend-ico" aria-hidden="true">' + (ICON_SVG[v] || (/^[a-z0-9_-]+$/.test(v) ? icoDeco(v, 16) : '')) + '</span>'; }

export function openWheel(o) {
  const RING = Array.isArray(o.ring) && o.ring.length ? o.ring : null; // CONTRACT-A sec 5 rows; else the old slices / jackpotIndex / widths / plus
  const VALS = RING ? RING.map((r) => +r.value) : o.slices, N = VALS.length;
  const RG = RING ? RING.map((r, i) => (r.gold ? i : -1)).filter((i) => i >= 0) : null, JP = RING ? (RG.length ? RG[0] : 0) : o.jackpotIndex || 0;
  const TIMING = true; let timeB = null; // the glow and the Early / Good timing / Late line are on for every wheel (the old timing option is accepted and ignored); timeB = bucket of the last STOP
  const ZONE = +o.zone > 0 ? +o.zone : 0, CHIME = !!o.chime, PH = o.phys || null, LK = normLook(o.look), GD = RG && RG.length ? RG : o.golds && o.golds.length ? o.golds : [JP];
  const P = { W0: PH && PH.W0 > 0 ? +PH.W0 : E.W0, D: PH && PH.D > 0 ? +PH.D : E.D }, PERIOD = E.PULSE_PERIOD, GUARD = E.STOP_GUARD_S; // the pulse physics after Control (Slow = W0)
  const JE = PH && Number.isFinite(+PH.J) && PH.J !== null ? Math.max(0, +PH.J) : Number.isFinite(+o.J) && o.J !== null && o.J !== undefined ? Math.max(0, +o.J) : E.J; // wobble half-width after Steady
  const ST = o.stored && typeof o.stored === 'object' ? o.stored : null, stRec = storedStop(ST);
  const RESPIN = Number.isFinite(+o.respin) && o.respin != null ? (+o.respin ? 1 : 0) : ST && ST.spent ? Math.min(1, (ST.stops || []).length) : 0;
  const widths = RING ? RING.map((r) => +r.w) : wheelWidths({ slices: o.slices, jackpotIndex: JP, widths: o.widths }), C = widths.reduce((a, b) => a + b, 0), U = TAU / C; // units -> radians
  const cum = [0]; widths.forEach((w, i) => cum.push(cum[i] + w));
  const sliceOf = (pos) => sliceIndexAt(cum, C, pos);
  const ringPending = (i) => { const k = Math.max(0, Math.min(N - 1, i | 0)); return { index: k, gain: VALS[k], jackpot: GD.includes(k) }; };
  let lastStop = null, landedFull = '', landedShort = false;
  const pendingNow = () => (o.getPending && o.getPending()) || (RING && lastStop ? ringPending(lastStop.sliceId) : null) || (stRec ? ringPending(stRec.sliceId) : null);
  const app = document.getElementById('app'), opener = document.activeElement;
  const pal = { cream: tok('--cream', '#F3EBD3'), out: tok('--outline', '#2A2238'), gold: tok('--gold', '#D2B357'), wall: tok('--wall1', '#E3D8B9'), g2: tok('--grass2', '#7EB261'), acc: tok('--accent', '#22625D'), b1: tok('--kitA1', '#3b5ba5') };
  const LP = LK && PALETTES[LK.pal] || null, mat = LK && LK.material ? matOf(LK.material) : null; // craft look: colour-blind safe slice palette, tier material on the rim
  const crys = !!(LK && LK.crystal), cmat = matOf('crystal'), ringCol = crys ? cmat.rim : (LK && colourOf(LK.rim)) || (mat && mat.rim) || pal.cream, trailCol = (LK && colourOf(LK.trail)) || pal.cream, hubCol = crys ? cmat.rim : (LK && colourOf(LK.hub)) || pal.acc, ptrCol = LK && colourOf(LK.ptr);
  const shape = LK && LK.spoke ? String(LK.spoke) : '';
  const tierFill = (t) => (t === 'top' ? (LP ? LP[3] : pal.g2) : t === 'low' ? (LP ? LP.low : tierShape('low').colour) : LP ? LP[2] : pal.wall); // bottom tier pale sand, never rose (SPEC 2f)
  const fillOf = (i) => (GD.includes(i) ? pal.gold : RING ? tierFill(RING[i].tier) : LP ? (VALS[i] <= 1 ? LP.low : VALS[i] === 2 ? LP[2] : VALS[i] === 3 ? LP[3] : LP[4]) : VALS[i] <= 1 ? pal.wall : VALS[i] === 2 ? pal.g2 : VALS[i] === 3 ? pal.acc : pal.b1);
  const fills = VALS.map((_, i) => fillOf(i));
  if (RING) for (let i = 1, run = 0; i < N; i++) { run = !GD.includes(i) && VALS[i] === VALS[i - 1] && !GD.includes(i - 1) ? run + 1 : 0; if (run % 2) fills[i] = dim(fills[i], 0.1); } // equal neighbours (x1.0, +1) in two shades (SPEC 3, T2 QA)
  { const rl = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }, inkL = rl(pal.out); // T8 QA-V1 L1: ink text on a mid-light slice (the green tiers) keeps >= 4.6:1: lighten the fill a step at a time
    fills.forEach((c, i) => { if (lum(c) <= 0.5) return; for (let n = 0; n < 12 && (rl(c) + 0.05) / (inkL + 0.05) < 4.6; n++) c = c.map((v) => Math.round(v + (255 - v) * 0.06)); fills[i] = c; }); }
  const keyed = (rows) => (RING ? [...tierKeyRows(RING, o.legend), ...rows] : rows); // T8: the tier key (shape + word per tier) leads every ring legend
  let legend = Array.isArray(o.legend) ? keyed(o.legend) : RING ? keyed(legendRows(RING)) : [];
  const DIR = ringDir(!!RING), angOf = (u) => screenAngle(u, pos, U, DIR); // ring wheels: clockwise list, the wheel turns anticlockwise (T3 QA D9)
  const ov = document.createElement('section');
  ov.className = 't2-ov wh-ov' + (crys ? ' is-crystal' : '') + (RING ? ' is-ring' : ''); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', o.title);
  if (o.wheelId) ov.setAttribute('data-wheel', String(o.wheelId)); if (o.spinKey) ov.setAttribute('data-spin-key', String(o.spinKey));
  const sliceWords = RING ? RING.map((r) => String(r.full != null ? r.full : r.label != null && r.label !== '' ? r.label : r.value) + (r.gold ? ' gold' : '')).join(', ') : o.labels ? o.labels.map((l, i) => l || (GD.includes(i) ? 'gold' : 'blank')).join(', ') : VALS.map((v, i) => '+' + v + (GD.includes(i) ? ' jackpot' : '')).join(', '); /* wa1 find: o.labels = word labels */
  // AIM: one upright word fixed above the top pointer on ring wheels (locked mockup "Fixed AIM marker"; T8). Shown while spinning.
  const am = aimMarker({ size: 24 }), aimSvg = RING ? '<span class="wh-aimw" aria-hidden="true" hidden>' + am.text + '</span>' : ''; // ONE fixed AIM word above the top pointer (T8 / M pick: one AIM at top); the landing tick still rides the rim
  const legendIn = (rows) => rows.map((r) => { const sh = legendShape(r.ch); // a shape word (tri / dot / pale / gold) draws the shape, never the word (T4 QA 2)
    return '<span class="wk-legend-row">' + (sh ? '<span class="wk-tier wk-tier--' + sh + '" aria-hidden="true"></span><span class="sr-only">' + esc(SHAPE_SAY[sh]) + '</span>' : '<span class="wk-legend-ch">' + esc(r.ch) + '</span>') + (r.icon ? iconHtml(r.icon) : '') + '<span>' + esc(r.text) + '</span></span>'; }).join('');
  const legendHtml = legend.length || RING ? '<div class="wk-legend wh-lgd" data-legend' + (legend.length ? '' : ' hidden') + '>' + legendIn(legend) + '</div>' : ''; // under the wheel, never beside it (T1 QA D1: clipped at x 320-344)
  ov.innerHTML = '<div class="t2-strip"><span>' + icoDeco('burst', 24) + ' ' + esc(o.title) + (o.sub ? ' <small>' + esc(o.sub) + '</small>' : '') + '</span>' +
    '<button type="button" class="c-icon-btn wh-x" aria-label="Close"><span class="c-ico c-ico--x"></span></button></div>' +
    '<div class="wh-card c-card">' + (o.cardHtml || '') + '</div>' +
    '<div class="wh-stage"><div class="wh-wrap" role="img" aria-label="Wheel of ' + N + ' slices: ' + esc(sliceWords) + '"><canvas class="wh-cv"></canvas><canvas class="wh-tk" aria-hidden="true"></canvas><span class="wh-ptr" aria-hidden="true"></span><span class="wh-hub" aria-hidden="true"></span>' + aimSvg + (LK && LK.crystal ? '<span class="wh-crystal" aria-hidden="true"></span>' : '') + (LK && LK.stand ? '<span class="wh-stand wh-stand--' + esc(String(LK.stand).replace(/[^a-z]/gi, '')) + '" aria-hidden="true"></span>' : '') + (LK && LK.name ? '<span class="wh-plate" aria-hidden="true" hidden></span>' : '') + '</div></div>' + legendHtml +
    '<div class="wh-foot"><div class="wh-msg c-card" data-msg></div><div class="wh-res c-card c-card--inset" data-res hidden></div><div class="wh-tok" data-tok hidden></div>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block wh-go" data-go>SPIN</button></div>' +
    '<div class="sr-only" role="status" aria-live="polite" data-live></div>';
  document.body.appendChild(ov); if (app) app.inert = true;
  const $ = (q) => ov.querySelector(q), wrap = $('.wh-wrap'), cv = $('.wh-cv'), ctx = cv.getContext('2d'), tkc = $('.wh-tk'), tctx = tkc.getContext('2d'), go = $('[data-go]'), msg = $('[data-msg]'), res = $('[data-res]'), live = $('[data-live]'), ptr = $('.wh-ptr'), tokBox = $('[data-tok]');
  if (LK) { if (ptrCol) ov.style.setProperty('--wh-ptr', 'rgb(' + ptrCol + ')'); if (LK.hub && colourOf(LK.hub)) ov.style.setProperty('--wh-hub', 'rgb(' + hubCol + ')'); const pl = $('.wh-plate'); if (LK.name && pl) { pl.textContent = String(LK.name).slice(0, 24); pl.hidden = false; pl.setAttribute('aria-hidden', 'true'); } }
  const labels = VALS.map((v, i) => { const s = document.createElement('span'); s.className = 'wh-lab' + (GD.includes(i) ? ' is-jp' : '') + (RING ? ' wh-rlab' : ''); s.style.zIndex = '2'; s.textContent = o.labels ? o.labels[i] || '' : RING ? sliceLabel(RING[i]) : (o.plus || '+') + v; /* wa1 find: word labels; ring: under-7% = one character or signed number */ s.setAttribute('aria-hidden', 'true'); wrap.appendChild(s); return s; });
  // wheel state: pos = the wheel coordinate (units) under the pointer; the wheel's turn is rot = pos * U. clock / spinEv / tapT are performance.now() seconds.
  const clk = spinClock(GUARD);
  let state = 'idle', pos = Math.random() * C, phi = pos, speed = 0, curDist = 0, clock = nowMs() / 1000, tapT = 0, stopInfo = null, adj = 0, raf = 0, closed = false, S = 2, size = 100, css = 200, spinEv = 0;
  if (RING) { const k0 = sliceOf(pos), off = pos - cum[k0], w0 = widths[k0]; if (off < w0 * 0.15 || off > w0 * 0.85) pos = phi = (cum[k0] + cum[k0 + 1]) / 2; } // at rest a seam never sits under the pointer: a start within 15% of a seam turns half a slice to the slice centre
  let landI = -1, fixCss = 0, nowI = -1; // ring: the landed slice (result look), the wheel size kept across states (T6 live QA 4), the slice the "Tick on" readout shows
  const rfit = RING ? RING.map(() => null) : null, aimW = $('.wh-aimw');
  const centreOf = (i) => (cum[i] + cum[i + 1]) / 2;
  // wa1 fixfind: word labels (Find) sit on the whole gold block (a run of gold cells), sized to fit inside the slice and the rim; too thin -> a gold Nothing is skipped, a find block gets a diamond icon
  const WL = !!o.labels && !RING, isG = (i) => GD.includes(i), joinP = (i) => WL && i > 0 && isG(i) && isG(i - 1), joinN = (i) => WL && i < N - 1 && isG(i) && isG(i + 1);
  const plan = WL ? o.labels.map((t, i) => { let s0 = i, s1 = i; if (isG(i)) { while (joinP(s0)) s0--; while (joinN(s1)) s1++; } return { text: t || '', c: (cum[s0] + cum[s1 + 1]) / 2, half: (cum[s1 + 1] - cum[s0]) * U / 2, rl: 0, ico: false }; }) : null;
  /** Ring labels (T3 QA D4): radial, fitted between the hub and the tier mark, one or two lines; a label that does not fit at 12 px prints one character and gets a legend row. */
  const shorted = new Set();
  function fitRing() { // css px; mockup radii scaled from R 150: tier mark R-22, icon R-37, card chip R-59, card name from r 32 outward
    const RS = (size / 2 - 1) * S, k = RS / 150, rIn = 14 * S, narrow = [], ff = 'px';
    const measure = (lines, f) => { const l = labels[0]; l.style.fontSize = f + ff; l.style.lineHeight = Math.round(f * 1.12) + ff; l.innerHTML = lines.map(esc).join('<br>'); return { w: l.offsetWidth, h: l.offsetHeight }; };
    ov.querySelectorAll('.wh-cg').forEach((e) => e.remove());
    const rawName = (r) => (r.card && (r.card.fullName || r.card.surname)) || splitNameValue(sliceLabel(r)).name, names = RING.map(rawName), minLen = uniquePrefixLens(names), tailLen = uniqueTailLens(names, minLen); // short names stay unique: each keeps at least the letters that tell it from the others
    RING.forEach((r, i) => {
      if (shorted.has(r)) { delete r.short; shorted.delete(r); }
      const own = sliceLabel(r), half = widths[i] * U / 2, short = sliceLabel({ ...r, w: 0 }), card = cardOf(r), ic = iconKey(card ? card.focus : r.icon);
      const GAP = 3.5, markIn = RS - 39 * k - GAP, iconIn = RS - 54 * k - GAP; // T4 QA5 NEW-5: the tier mark spans R-39k..R-23k and the icon R-44k..R-30k; text keeps >= 3 px (css) clear of both
      let chipW = 0, chipEl = null; if (card && card.grade) { chipEl = document.createElement('span'); chipEl.className = 'wh-cg'; chipEl.setAttribute('aria-hidden', 'true'); chipEl.textContent = card.grade; chipEl.dataset.i = String(i); wrap.appendChild(chipEl); chipW = chipEl.offsetWidth; }
      const chipRc = iconIn - chipW / 2, rOut = card ? chipRc - chipW / 2 - GAP : ICON_SVG[ic] ? iconIn : markIn; // the text stops short of the chip / icon / tier mark
      let F = null;
      if (card) { // Scout name (QA3 D2): 14 px; the longest cut that fits the slice, 6 letters + '.' down to 3 letters + '.', never a single letter
        const cuts = scoutNameCuts(card.fullName || card.name, minLen[i], tailLen[i], ov.classList.contains('is-wide') ? 99 : undefined); /* N7: on wide screens the whole name is tried first, so the measured slice arc (radialFit, 14 px floor) picks the longest form; 344 keeps the 6-letter cap */ // ONE short name per card, shared by the slice, readout, chip and log
        for (const nm of cuts) { F = radialFit({ text: nm, ways: [[nm]], half, rIn: Math.max(rIn, 32 * k), rOut, measure, fMax: 14, fMin: 14 }); if (F) { F.rc = Math.max(32 * k, F.rc); r.short = scoutShort(card.grade, nm); break; } }
      }
      else if (own) { const sub = r.sub != null && String(r.sub).trim() ? String(r.sub).trim() : ''; F = radialFit({ text: own, ways: sub ? [[own + ' ' + sub], [own, sub], ...(r.w < LABEL_MIN_W ? [] : [[own]])] : undefined, half, rIn, rOut, measure, rPref: RS * 0.5, fMin: 14 }); } // slice text 14 px or more (T2 / T4 QA)
      if (!F && !card && own && r.w >= LABEL_MIN_W) { const forms = shortNameForms(own, minLen[i], tailLen[i]), pv = splitNameValue(own).val; if (pv) { const j = forms.findIndex((x) => !/ /.test(x)); forms.splice(j < 0 ? forms.length : j, 0, pv); } /* QA-V1 H1: the +% always stays on the slice: when no name + value fits, the value alone goes before any name-only form */ if (forms.length) { F = radialFit({ text: forms[0], ways: forms.map((x) => [x]), half, rIn, rOut, measure, rPref: RS * 0.5, fMax: 14, fMin: 14 }); if (F) r.short = F.lines[0], shorted.add(r); } } // 14 px floor: a name that does not fit prints a short form ("Maxi.."), upright, kept unique; the full name stays in aria and the result line
      if (F && !card && r.w < LABEL_MIN_W && Array.from(own).length === 1) F = null; // a one-character label on a thin slice (Find 4% and 2% 'F'): same treatment, rim lane + cream halo, the tier mark sits inboard of it
      if (!F) { narrow[i] = !card && own !== short; const txt = card ? Array.from(card.name)[0] || short : short, one = (lines, f) => measure([txt], f); F = radialFit({ text: txt, ways: [[txt]], half, rIn, rOut, measure: one, rPref: RS * 0.5, fMax: 18, fMin: 14 }) || { f: 14, rc: (rIn + rOut) / 2 }; F.lines = [txt]; if (!card) { F.one = true; F.f = Math.max(ov.classList.contains('is-wide') ? 24 : 14, F.f); F.rc = RS - 17 * k; } } // one character on a thin slice (QA3 D4): out at the rim lane (slice is widest there), not clipped, dark glyph with a cream halo, 14 px or more // one character: 14 px or more (T4 QA 2)
      F.card = card; F.ic = ic; rfit[i] = F;
      if (chipEl) { F.chip = chipEl; F.chipRc = chipRc; }
    });
    labels.forEach((l, i) => { const F = rfit[i]; l.style.fontSize = F.f + 'px'; l.style.lineHeight = Math.round(F.f * 1.12) + 'px'; l.innerHTML = F.lines.map(esc).join('<br>'); });
    const lg = $('[data-legend]'), rows = keyed(legendWith(RING, narrow, Array.isArray(o.legend) ? o.legend : null)), html = legendIn(rows);
    legend = rows; if (lg && lg.innerHTML !== html) { lg.innerHTML = html; lg.hidden = !rows.length; return true; } // legend changed: the caller sizes once more
    return false;
  }
  function fitLabels() {
    if (RING) return fitRing();
    if (!WL) return; const rIn = (size / 2 - 12) * S, rHub = 13 * S, f0 = Math.round(Math.min(24, Math.max(13, css * 0.075)));
    labels.forEach((l, i) => {
      const Q = plan[i]; Q.rl = 0; Q.ico = false; l.classList.remove('is-ico'); l.removeAttribute('style'); l.hidden = !Q.text; if (!Q.text) return; l.textContent = Q.text;
      const sa = Math.sin(Math.min(Q.half, Math.PI / 2));
      const full = Q.text, cands = Array.from(full).length > 1 ? [full, Array.from(full)[0]] : [full]; // 14 px floor: shorten to one character before giving up (as the ring does)
      for (const tx of cands) { l.textContent = tx;
        for (let fs = f0; fs >= 14; fs--) { // largest font whose bounding circle fits between the slice edges and inside the rim lane
          l.style.fontSize = fs + 'px'; l.style.lineHeight = Math.round(fs * 1.1) + 'px';
          const h = Math.hypot(l.offsetWidth, l.offsetHeight) / 2 + 1, near = Math.max(h / sa, rHub + h), far = rIn - h;
          if (near <= far) { Q.rl = (near + far) / 2; return; }
        }
      }
      l.textContent = full;
      if (isG(i)) { Q.ico = true; Q.rl = rIn - 9; l.textContent = ''; l.classList.add('is-ico'); Object.assign(l.style, { fontSize: '', width: '12px', height: '12px', background: 'rgb(' + pal.gold + ')', border: '2px solid rgb(' + pal.out + ')', boxShadow: '0 0 0 1px #fff', transform: 'translate(-50%,-50%) rotate(45deg)' }); return; }
      l.hidden = true; // a Nothing gap too thin for the word: unlabelled (its plain colour says it)
    });
  }

  function layout() { // wheel sized from the free height (stage), never wider than the screen
    const st = $(".wh-stage"), RES = LK && LK.name && !ov.classList.contains('is-res-compact') ? 34 : LK && (LK.stand || LK.name) ? 14 : 0, AM = 0; // RES: room under the rim for the stand / name plate (they hang from the wheel box); AM: room round the rim for the AIM tag
    const resv = RING && ov.clientWidth >= 560 && !isLandscapeWide(ov.clientWidth, ov.clientHeight) ? (o.plainResult ? 12 : 56) : 0, /* M1b: the idle box is 64 px; the result box may be taller: keep that room so the wheel never resizes at the result */ h = st.clientHeight - (RING ? 22 + 22 + 8 : 24 + 22) + (RING && ov.clientHeight <= 700 && ov.clientWidth >= 440 && ov.clientWidth < 760 ? 6 : 0) - RES - resv, /* D5: short-and-wide (Fold cover): 6 px less spare under the rim */ /* ring: stage pad 22 + 22 for the fixed AIM word over the pointer + 8 under */ /* N2: the AIM word is clamped into the stage, so only the tick (17 px) needs room above and below; the sides keep the full AIM room */ w = st.clientWidth - Math.max(24, 2 * AM) - (RING ? 4 : 0); // the legend sits under the stage, not in it (T1 QA D1)
    const wide = ov.clientWidth >= 560; ov.classList.toggle('is-wide', wide); css = Math.max(160, Math.min(w, h, wheelCap(ov.clientWidth, ov.clientHeight, wide))); /* X6: wide screens (>= 560 px) fill the free room, up to 420 px */ if (RING) { if (fixCss) css = fixCss; fixCss = css; } // ring: one size in every state, it never jumps up at the result (T6 live QA 4)
    size = Math.floor(css / S / 2) * 2; css = size * S; wrap.style.marginBottom = RES ? RES + 'px' : ''; wrap.style.marginTop = RING ? '22px' : '';
    wrap.style.width = wrap.style.height = css + 'px'; cv.width = cv.height = size; cv.style.width = cv.style.height = css + 'px'; tkc.width = tkc.height = size; tkc.style.cssText = 'position:absolute;left:0;top:0;z-index:2;pointer-events:none;image-rendering:pixelated;width:' + css + 'px;height:' + css + 'px';
    if (fitLabels() === true && !layout.again) { layout.again = true; fixCss = 0; try { layout(); } finally { layout.again = false; } return; } // the legend rows changed the free height: size once more
    draw();
  }
  const onResize = () => { fixCss = 0; layout(); };
  let stW = 0; const roW = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const st = $('.wh-stage'), w = st ? st.clientWidth : 0; if (w && stW && Math.abs(w - stW) > 1 && !closed) onResize(); if (w) stW = w; }) : null; // X6: a stage that was narrower at first paint re-sizes the wheel once it widens (never on a height change, so the result does not resize it)
  function hubSpoke(th, r, rot) { // the hub's spokes as pixels: shape plain (none) / round (dots) / blade (thin) / diamond
    if (shape === 'plain') return false;
    const k = 8, a = (((th - rot * 0.15) % TAU) + TAU) % TAU, f = (a / TAU * k) % 1, d = Math.abs(f - 0.5) * 2; // 0 on a spoke, 1 between
    if (shape === 'round') return d < 0.5 && Math.abs(r - 8) < 1.6;
    if (shape === 'diamond') return d < (1 - Math.abs(r - 8) / 4) * 0.7 && Math.abs(r - 8) < 4;
    return d < 0.22 && r > 4;
  }
  const ZONE_COL = [255, 226, 110];
  /** Aim Zone: is a gold slice under the pointer, or due under it (or just past it) within ZONE seconds at the current speed? Spin state only. */
  const goldNear = () => state === 'spin' && goldNearPointer(pos, speed, ZONE, cum, C, GD);
  function drawIcon(kind, x, y, r) { // tiny upright focus icon on the canvas (bat / ball / balanced), as the mockup
    ctx.save(); ctx.translate(x, y); ctx.lineWidth = 1; ctx.strokeStyle = 'rgb(' + pal.out + ')';
    if (kind === 'bat') { ctx.rotate(0.6); ctx.fillStyle = '#c9a36a'; ctx.fillRect(-r * 0.4, -r, r * 0.8, r * 1.4); ctx.strokeRect(-r * 0.4, -r, r * 0.8, r * 1.4); ctx.fillStyle = 'rgb(' + pal.out + ')'; ctx.fillRect(-r * 0.15, r * 0.4, r * 0.3, r * 0.7); }
    else { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = kind === 'ball' ? '#c0392b' : '#fff'; ctx.fill(); ctx.stroke(); if (kind === 'bal') { ctx.beginPath(); ctx.moveTo(0, -r); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fillStyle = 'rgb(' + pal.out + ')'; ctx.fill(); } else { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(-r * 1.3, 0, r * 0.9, -0.6, 0.6); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.3, 0, r * 0.9, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke(); } }
    ctx.restore();
  }
  function draw() {
    const w = size, cx = w / 2, cy = w / 2, R = w / 2 - 1, im = ctx.createImageData(w, w), d = im.data, moving = state === 'spin' || state === 'land' || state === 'tok', rot = pos * U, zoneOn = ZONE > 0 && goldNear();
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.sqrt(dx * dx + dy * dy); if (r > R) continue;
      const th = Math.atan2(dy, dx); let q = (rot - DIR * (th + Math.PI / 2)) % TAU; if (q < 0) q += TAU; // wheel angle under this pixel; slices pass the pointer in list order (ring: drawn clockwise, turning anticlockwise)
      const u = q / U; let idx = 0; while (idx < N - 1 && u >= cum[idx + 1]) idx++;
      const m = (u - cum[idx]) * U, wa = widths[idx] * U, bd = r * Math.sin(Math.min(joinP(idx) ? 9 : m, joinN(idx) ? 9 : wa - m, Math.PI / 2)); // wa1 fixfind: no spoke line inside one gold find block
      const sa = ((th + Math.PI / 2 + Math.PI * 3) % TAU) - Math.PI; let c;
      if (r > R - 1.6) c = pal.out;
      else if (r > R - 6) { c = r < R - 5.2 || bd < 1.3 ? pal.out : ringCol; if (crys && r > R - 4.8 && r < R - 2.2 && Math.abs(((q / TAU * 16) % 1) - 0.5) * TAU / 16 * r < 1.1) c = cmat.stud; } // Crystal: white pixel studs on the cyan rim
      else if (crys && r < 12) { const a = (((th - rot * 0.15) % TAU) + TAU) % TAU, f = (a / TAU * 12) % 1, dm = Math.abs(dx) + Math.abs(dy); c = dm < 3.2 ? (dm < 1.6 ? [255, 255, 255] : cmat.rim) : r > 4 && Math.abs(f - 0.5) * 2 < 0.2 ? cmat.rim : pal.out; } // Crystal gem cap: dark hub, light spokes, a gem diamond
      else if (LK && shape && r < 12) c = r < 4 ? [255, 255, 255] : hubSpoke(th, r, rot) ? pal.cream : hubCol;
      else if (r < 4) c = [255, 255, 255]; else if (r < 10) c = pal.acc; else if (r < 12) c = pal.cream;
      else if (bd < 0.9) c = pal.out;
      else {
        c = fills[idx]; if (((x + y) & 1) === 0 && r > R - 15 && r < R - 8) c = dim(c, 0.18);
        if (moving && ((r > R * 0.36 && r < R * 0.4) || (r > R * 0.66 && r < R * 0.69)) && Math.floor(q * 27 / TAU) % 3 !== 0) c = trailCol;
        if (r > R - 9.6 && r < R - 7.4 && Math.abs(sa) < 0.62 && Math.floor((sa + 0.62) / 0.095) % 2 === 0) c = zoneOn ? ZONE_COL : dim(pal.gold, 0.25); // dashes mark the pointer lane (no aim help); Aim Zone: they glow gold when gold is near
        if (r > R - 10.4 && r <= R - 9.6 && Math.abs(sa) < 0.62) c = zoneOn ? ZONE_COL : pal.out;
        if (zoneOn && r > R - 11.4 && r <= R - 10.4 && Math.abs(sa) < 0.62) c = pal.out; // Aim Zone: the glow sits in an outlined lane
        if (landI >= 0) { if (idx !== landI) c = c.map((v, k) => Math.round(v * 0.7 + pal.out[k] * 0.3)); else if (bd < 2.6 || r > R - 8.6) c = pal.gold; } // ring result: every slice stays, only the landed one is lit (T6 live QA 1)
      }
      const p = (y * w + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
    ctx.putImageData(im, 0, 0); tctx.clearRect(0, 0, w, w); // the landing tick lives on its own canvas above the glass sheen (z 2; the labels sit above it)
    if (RING) RING.forEach((row, i) => { // tier mark on every slice (SPEC 2f, T3 QA D5, T4 QA 1): upright on screen at R-22 (css), outlined; a slice under 10 degrees that prints a letter may drop it
      if (widths[i] * U < MARK_MIN_RAD && widths[i] < LABEL_MIN_W) return;
      const kk = R / 75, F = rfit && rfit[i], a = angOf(centreOf(i)); if (F && ICON_SVG[F.ic]) drawIcon(F.ic, cx + Math.cos(a) * (R - 23.5 * kk), cy + Math.sin(a) * (R - 23.5 * kk), 3 * kk); // focus icon at R-47 (150 scale), upright; D6: inboard of the tier mark (R-39..R-23), no overlap
      if (F && F.one && F.lines && Array.from(String(F.lines[0])).length > 1) return; // D5: a rim label wider than its thin slice ("+2"): no tier mark under it (the slice colour and the legend still say the tier)
      const mk = tierMark(row.tier, GD.includes(i)), off = F && F.one ? 3 * kk : 0, mx = cx + Math.cos(a) * (R - 15.5 * kk) - Math.cos(a) * off, my = cy + Math.sin(a) * (R - 15.5 * kk) - Math.sin(a) * off, h = 4 * kk;
      ctx.beginPath(); if (mk.shape === 'triangle-up') { ctx.moveTo(mx, my - h); ctx.lineTo(mx + h, my + h * 0.78); ctx.lineTo(mx - h, my + h * 0.78); ctx.closePath(); } else ctx.arc(mx, my, h * 0.85, 0, TAU);
      ctx.fillStyle = 'rgb(' + (landI >= 0 && i !== landI ? mk.fill.map((v, k) => Math.round(v * 0.7 + pal.out[k] * 0.3)) : mk.fill) + ')'; ctx.fill(); ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgb(' + pal.out + ')'; ctx.stroke();
    });
    const tk = tickKind({ guide: !!o.guide });
    if (tk !== 'none' && state === 'spin') { // landing tick (free for everyone): the wheel point that ends under the pointer if STOP is tapped now (phi + tickAt(t), no wobble); Aim Guide = gold wedge + J band
      const ga = -Math.PI / 2 - DIR * curDist * U, gx = Math.cos(ga), gy = Math.sin(ga), r0 = R - 15, TS = getTickStyle(), p0 = R - TS.len, plot = (rr, o, col) => { tctx.fillStyle = col; tctx.fillRect(Math.round(cx + gx * rr - gy * o), Math.round(cy + gy * rr + gx * o), 1, 1); };
      if (o.guide && JE > 0) { tctx.beginPath(); tctx.arc(cx, cy, R - 4, ga - JE * U, ga + JE * U); tctx.lineWidth = 5; tctx.strokeStyle = 'rgba(' + ZONE_COL.join(',') + ',0.9)'; tctx.stroke(); } // Aim Guide: the yellow rim band of the wobble spread (+-J; Steady narrows it)
      if (tk === 'wedge') {
        for (const [grow, col] of [[1.6, 'rgb(' + pal.out + ')'], [0, 'rgb(' + pal.gold + ')']]) for (let rr = r0 - grow; rr <= R - 0.5; rr += 0.5) { const t = Math.max(0, (rr - r0) / (R - r0)), hw = TICK.WEDGE_TIP_PX + t * 3 + grow; for (let o = -hw; o <= hw; o += 0.5) plot(rr, o, col); } // Aim Guide: an outlined gold wedge on the rim, sharp tip inside, wide end at the rim
        for (let rr = r0 + 2; rr <= R - 2; rr += 0.5) plot(rr, 0, '#fff');
      } else { // plain tick: a dark 2 px bar with a 1 px white halo, 15 px long across the rim band; readable on every slice and skin
        for (const [hw, col, ext] of [[TS.px / 2 + TS.halo, '#fff', TS.halo], [TS.px / 2, 'rgb(' + pal.out + ')', 0]]) for (let rr = p0 - (hw > 1.5 ? ext : 0); rr <= R - 0.5; rr += 0.5) for (let o = -hw; o <= hw; o += 0.5) plot(rr, o, col); // TS = Settings Tick (Normal 2 px / Bold wider, longer, 2 px halo); landing position untouched
      }
    }
    const a = rot - centreOf(JP) * U - Math.PI / 2, ax = Math.round(cx + Math.cos(a) * (R - 3.6)), ay = Math.round(cy + Math.sin(a) * (R - 3.6));
    if (!RING) for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const q = Math.abs(i) + Math.abs(j); if (q > 5) continue; ctx.fillStyle = q >= 5 ? 'rgb(' + pal.out + ')' : q >= 4 ? '#fff' : 'rgb(' + pal.gold + ')'; ctx.fillRect(ax + i, ay + j, 1, 1); } // diamond on the jackpot slice; ring wheels: none (T3 QA D8: it read as the pointer and sat on a label; the gold fill and the triangle say gold)
    if (WL) labels.forEach((l, i) => { const Q = plan[i]; if (l.hidden) return; const b = rot - Q.c * U - Math.PI / 2; // wa1 fixfind: fitted word labels
      l.style.left = cx * S + Math.cos(b) * Q.rl + 'px'; l.style.top = cy * S + Math.sin(b) * Q.rl + 'px';
      if (!Q.ico) l.style.color = lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; l.style.opacity = moving && speed > 8 && !isG(i) ? '.55' : '1';
    });
    else if (RING) {
      labels.forEach((l, i) => { // radial ring labels (T3 QA D4): along the slice centre line, turned so none reads upside down
        const F = rfit[i]; if (!F) return; const b = angOf(centreOf(i));
        l.style.left = cx * S + Math.cos(b) * F.rc + 'px'; l.style.top = cy * S + Math.sin(b) * F.rc + 'px'; l.style.transform = 'translate(-50%,-50%) rotate(' + ((Math.abs(Math.cos(b)) < 0.34 && F.lines.length === 1 && Array.from(F.lines[0]).length <= 3 && !F.one) || (F.one && ov.classList.contains('is-wide')) ? 0 : radialTurn(b)).toFixed(4) + 'rad)'; // X6: on wide screens a one-letter rim label always stands upright // QA-V2 #9: a short label ("+1") within 20 degrees of 12 / 6 o'clock stands upright, not on its side
        l.style.color = F.one || lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; if (F.one) { l.style.overflow = 'visible'; l.style.zIndex = '3'; l.style.textShadow = ONE_HALO; } l.style.opacity = '1'; /* D6 / QA-V3 D6: losing labels keep full ink (the fill dims, not the text) */
        if (F.chip) { const rc = F.chipRc != null ? F.chipRc : (R + 1) * S - 59 * (R + 1) * S / 150; F.chip.style.left = cx * S + Math.cos(b) * rc + 'px'; F.chip.style.top = cy * S + Math.sin(b) * rc + 'px'; F.chip.style.transform = l.style.transform; F.chip.style.opacity = l.style.opacity; } // Scout card grade chip at R-59
      });
      if (aimW) aimW.hidden = state !== 'spin'; // fixed at the top pointer (css): never moves, never turns
    }
    else labels.forEach((l, i) => {
      const b = rot - centreOf(i) * U - Math.PI / 2, thin = widths[i] * U < 0.2 || (RING && widths[i] < LABEL_MIN_W), rl = R * (GD.includes(i) ? 0.8 : 0.62); l.style.fontSize = thin ? '14px' : ''; // a thin slice: a smaller label so it stays inside the slice edges
      l.style.left = (cx + Math.cos(b) * rl) * S + 'px'; l.style.top = (cy + Math.sin(b) * rl) * S + 'px';
      l.style.color = lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; l.style.opacity = moving && speed > 8 && !GD.includes(i) ? '.55' : '1';
    });
  }
  const setMsg = (t) => { msg.textContent = t; nowI = -1; nowAt = -1e9; }; // ring: the "Tick on" readout redraws on the next frame
  function tick(from, to, loud) { // one call per slice boundary crossed; the pointer flexes a little (cosmetic, never moves the wheel)
    const a = sliceOf(from), b = sliceOf(to); if (a === b) return;
    const chime = CHIME && chimeEnters(a, b, GD); // Gold Chime: a gold slice has just come under the pointer
    if (o.onTick) o.onTick(chime ? { loud: true, rate: speed, chime: true } : { loud: !!loud, rate: speed });
    if (chime) { ptr.classList.add('is-chime'); setTimeout(() => ptr.classList.remove('is-chime'), 320); }
    ptr.style.transform = 'rotate(' + Math.min(10, speed * 0.5) + 'deg)'; requestAnimationFrame(() => { ptr.style.transform = ''; });
  }
  function frame() {
    if (closed) return; clock = nowMs() / 1000; const was = pos; // every frame reads the clock; nothing is integrated from frame steps
    if (state === 'spin') {
      const el = clock - spinEv, f = spinFrame(P, phi, el); speed = f.speed; pos = f.pos; curDist = f.dist;
      if (el >= GUARD && go.getAttribute('aria-disabled') === 'true') { go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); go.textContent = 'STOP'; go.setAttribute('aria-label', 'Stop the wheel'); setMsg(MSG_GO); }
      if (TIMING) { const tw0 = clock - spinEv - (f.cycle - 1) * PERIOD, inW = el >= GUARD && tw0 >= E.GLOW[0] && tw0 <= E.GLOW[1]; if (inW !== go.classList.contains('is-window')) { go.classList.toggle('is-window', inW); go.classList.toggle('is-glow', inW); go.classList.toggle('c-btn--gold', inW); /* T4 QA 8: the button fills gold in the window (the art skin paints the wash) */ if (el >= GUARD) { go.textContent = inW ? 'STOP!' : 'STOP'; go.setAttribute('aria-label', inW ? 'Stop now' : 'Stop the wheel'); if (inW) live.textContent = 'Stop now.'; } } } // STOP glow 3.2-3.8 s of every cycle: time only, never reads a slice
      tick(was, pos); // no coast, no auto-stop: the wheel turns until the player taps STOP
      if (RING) readout(sliceOf(pos + curDist));
    } else if (state === 'land') {
      const s = Math.max(0, clock - tapT), L = stopInfo, u = Math.min(1, s / P.D);
      pos = L.base + stopExtra(L.dist, L.e, s, P) + adj * (3 * u * u - 2 * u * u * u);
      speed = Math.max(0, (L.dist * 3 * (1 - u) * (1 - u) + L.e * 6 * u * (1 - u) + adj * 6 * u * (1 - u)) / P.D); tick(was, pos, u >= 1);
      if (s >= P.D) { state = 'result'; draw(); showResult(); return; }
    }
    else if (state === 'tok') {
      const T = tw, u = Math.min(1, Math.max(0, (clock - T.t0) / T.dur)), e = (v) => 1 - Math.pow(1 - v, 3);
      if (T.kind === 'two') { const h = 0.5; pos = u < h ? T.from + (T.mid - T.from) * e(u / h) : T.mid + (T.to - T.mid) * e((u - h) / (1 - h)); if (!T.flashed && u >= h) { T.flashed = true; flash2(); } speed = 10 * (1 - (u < h ? u / h : (u - h) / (1 - h))); }
      else if (T.kind === 'nudge') { pos = T.from + (T.to - T.from) * (u * u * (3 - 2 * u)); speed = 2; }
      else if (T.kind === 'lift') { speed = 0; }
      else { pos = T.from + (T.to - T.from) * e(u); speed = 14 * (1 - u); }
      tick(was, pos);
      if (u >= 1) { pos = T.dest; state = 'result'; draw(); finishToken(); return; }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  const MSG_GO = 'Turning. Tap STOP.'; // one plain line, no promise about where it lands (T6 live QA 2-3)
  let nowAt = 0;
  /** Ring wheels: "Tick on: <slice>" under the wheel while it turns (T1 QA D5; mockup readout). The slice under the landing tick; every frame, a DOM write only when the slice changes. Not announced. */
  const fullText = (r) => (r.card || r.short == null || r.short === '' ? rowText(r) : String(r.label == null ? r.value : r.label) + (r.sub != null && String(r.sub).trim() ? ' ' + String(r.sub).trim() : '')); // T8 QA-V1 M1: the readout and result chip name the whole slice ("No boost +1 Spoke"); only a Scout card keeps its one short name
  function readout(i) {
    if (i === nowI) return; nowI = i; nowAt = clock; const r = RING[i];
    msg.innerHTML = '<span class="wh-now" aria-hidden="true"><span>Tick on:</span><b class="wh-nowv" style="background:rgb(' + fills[i] + ');color:' + (lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff') + '">' + esc(fullText(r)) + '</b></span><span class="wh-msg2">' + esc(go.getAttribute('aria-disabled') === 'true' ? 'Get ready.' : MSG_GO) + '</span>';
  }
  const TOKNAME = { respin: 'Spin Again', two: 'Pick Two', nudge: 'Nudge', lift: 'Lucky Lift' }, PL = () => o.plus || '+';
  /** One outcome line for a used token: what the wheel now says, whether or not it improved. */
  function outcomeLine(kind, b, q) {
    if (o.outcome) return o.outcome(kind, b, q); // wa1 find: the caller words the outcome
    const nm = TOKNAME[kind] || 'Token', g0 = b ? b.gain : q.gain;
    if (kind === 'lift') return q.gain > g0 ? nm + ': +' + (q.gain - g0) + ' bonus, now ' + PL() + q.gain : nm + ': no bonus, kept ' + PL() + g0;
    if (kind === 'nudge') return q.index !== (b && b.index) ? nm + ': moved to ' + PL() + q.gain : nm + ': kept ' + PL() + g0;
    return q.gain > g0 ? nm + ': new ' + PL() + q.gain : nm + ': kept ' + PL() + g0;
  }
  function showTokens(p, line) { // token buttons after the result (only when the store offers some); a used token plays a short action on the wheel, then the result and the buttons are read again
    const list = (o.getTokens ? o.getTokens() : typeof o.tokens === 'function' ? o.tokens(p) : o.tokens) || [];
    tokBox.hidden = !list.length && !line; tokBox.innerHTML = ''; tokBox.classList.remove('is-busy');
    if (line) { const l = document.createElement('p'); l.className = 'wh-out'; l.setAttribute('data-out', ''); l.textContent = line; tokBox.appendChild(l); }
    list.forEach((t) => { const b = document.createElement('button'), n = t.count > 0 ? ' x' + t.count : ''; b.type = 'button'; b.className = 'c-btn wh-tk'; b.textContent = t.label + n; b.setAttribute('data-kind', t.kind); b.setAttribute('aria-label', t.label + (n ? ', ' + t.count + ' left' : ''));
      b.addEventListener('click', () => { if (state !== 'result' || !o.onToken) return; const before = pendingNow(); o.onToken(t.kind); const q = pendingNow(); if (!q) return; useVisible(t.kind, before, q); }); tokBox.appendChild(b); });
    const left = list.length && list[0].left !== undefined ? list[0].left : null;
    if (left !== null) { const n = document.createElement('p'); n.className = 'wh-tknote'; n.textContent = (o.tokName || 'Spotlight') + ': ' + left + (left === 1 ? ' token use' : ' token uses') + ' left this season'; tokBox.appendChild(n); }
  }
  let tw = null;
  function flash2() { // Pick Two: the second pointer flashes
    ptr.classList.add('is-flash'); const g = document.createElement('span'); g.className = 'wh-ptr wh-ptr2'; g.setAttribute('aria-hidden', 'true'); wrap.appendChild(g); setTimeout(() => { g.remove(); ptr.classList.remove('is-flash'); }, 520);
  }
  function useVisible(kind, before, q) { // the wheel visibly acts, then the outcome line
    const line = outcomeLine(kind, before, q), qi = landedIndex(q, lastStop, N), dest = centreOf(qi); clock = nowMs() / 1000;
    const from = pos, fwd = (((dest - from) % C) + C) % C, half = (((dest - from + C / 2) % C) + C) % C - C / 2;
    tw = { kind, t0: clock, from, dest, line, dur: kind === 'two' ? 1.9 : kind === 'nudge' ? 0.5 : kind === 'lift' ? 0.8 : 1.3, to: kind === 'nudge' ? from + half : from + 2 * C + fwd };
    if (kind === 'two') { tw.mid = from + C + ((((centreOf((qi + 3) % N) - from) % C) + C) % C); tw.to = tw.mid + C + ((((dest - tw.mid) % C) + C) % C); } // first stop on another slice (the pointer flashes), then the final one
    state = 'tok'; tokBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-disabled', 'true')); tokBox.classList.add('is-busy');
    waitLook(kind === 'lift' ? 'Lifting...' : kind === 'nudge' ? 'Stepping...' : 'Spinning again...', 'Please wait'); ov.classList.add('is-turning');
    if (kind === 'lift') { const bn = document.createElement('span'), d = q.gain - (before ? before.gain : q.gain); bn.className = 'wh-bonus'; bn.setAttribute('aria-hidden', 'true'); bn.textContent = d > 0 ? '+' + d : '+0'; wrap.appendChild(bn); setTimeout(() => bn.remove(), 900); }
    raf = requestAnimationFrame(frame);
  }
  let kbd = false; ov.addEventListener('keydown', () => { kbd = true; }, true); ov.addEventListener('pointerdown', () => { kbd = false; }, true);
  /** N4: the dashed focus ring (:focus-visible) shows only for keyboard use; after a tap or click the sheet itself takes focus, so SPIN / COLLECT carry no ring. */
  function focusGo(el) { setTimeout(() => { if (closed) return; if (kbd) { el.focus(); return; } ov.tabIndex = -1; ov.style.outline = 'none'; ov.focus({ preventScroll: true }); }, 150); } // a11y: focus moves after the polite live text is set (about 150 ms), so a screen reader does not drop the announcement
  function finishToken() { ov.classList.remove('is-turning'); showResult(true, tw && tw.line); const f = tokBox.querySelector('button') || go; focusGo(f); tw = null; }
  function burst() { // landing burst (craft look): a few pixel bits fly out once
    if (!LK || !LK.burst) return; const b = document.createElement('span'); b.className = 'wh-burst wh-burst--' + String(LK.burst).replace(/[^a-z]/gi, ''); b.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = css * 0.46, e = document.createElement('i'); e.style.setProperty('--bx', Math.round(Math.cos(a) * r) + 'px'); e.style.setProperty('--by', Math.round(Math.sin(a) * r) + 'px'); b.appendChild(e); }
    wrap.appendChild(b); setTimeout(() => b.remove(), 1000);
  }
  const describeOf = (p) => { // the contract is an object; a host that returns a plain string gets it as the big line (T1 QA D4)
    const k = landedIndex(p, lastStop, N), d = o.describe ? o.describe(p) : { big: RING ? String(RING[k].label) : PL() + p.gain, from: '', to: '', say: 'Landed: ' + (RING ? RING[k].label : PL() + p.gain) + '.' };
    return d && typeof d === 'object' ? d : { big: String(d == null ? '' : d), say: String(d == null ? '' : d) };
  };
  /** Result block, ring and non-ring alike: "Landed on [slice]", then the host's big line and one plain line (timing is added by showResult). No lone "+", no stay-the-same text. The chip prints the short slice label (sliceLabel: "+2" for "+2 steps" on a narrow slice); the full label is the chip's title / aria-label and the spoken line. */
  function landedRow(k) { return RING ? RING[k] : { label: o.labels && o.labels[k] ? o.labels[k] : (o.plus || '+') + VALS[k], value: VALS[k], w: widths[k] }; }
  function ringResultHtml(p, d, sg) {
    const k = landedIndex(p, lastStop, N), row = landedRow(k), lab = row.full != null ? String(row.full) : String(row.label == null ? row.value : row.label) + (row.sub != null && String(row.sub).trim() ? ' ' + String(row.sub).trim() : ''), short = row.short != null && row.short !== '' ? fullText(row) : sliceLabel(row) + (row.sub != null && String(row.sub).trim() && !(row.w < LABEL_MIN_W) ? ' ' + String(row.sub).trim() : ''), chip = short || lab, big = d.big != null ? String(d.big) : '';
    landedFull = lab; landedShort = chip !== lab;
    const chg = RING ? '' : ((d.from != null && d.to != null && String(d.from) !== '' && d.from !== d.to) ? '<div class="wh-chg"><span>' + esc(d.from) + '</span><span class="t2-arr" aria-hidden="true"></span><b class="t2-new">' + esc(d.to) + '</b></div>' : d.barHtml ? '<div class="wh-chg">' + d.barHtml + '</div>' : '');
    return (p.jackpot && o.jpText ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' ' + esc(o.jpText) + '</span>' : '') +
      '<div class="wh-big wh-land"><span>Landed on</span><span class="wh-chip' + (p.boosted || p.hot ? ' is-boost' : '') + '"' + (chip !== lab ? ' title="' + esc(lab) + '" aria-label="' + esc(lab) + '"' : '') + '>' + esc(chip) + '</span></div>' +
      (big && big !== chip && big !== lab ? '<div class="wh-line"><b>' + esc(big) + '</b></div>' : '') + (d.line ? '<div class="wh-line">' + esc(d.line) + '</div>' : '') + chg +
      (sg > 0 ? '<div class="wh-sp">' + spokeIcon(20) + '<b>+' + esc(sg) + (Number(sg) === 1 ? ' Spoke' : ' Spokes') + '</b></div>' : '');
  }
  function showResult(again, line) {
    const p = pendingNow(); if (!p) return; const d = describeOf(p), sg = o.spokeGain ? Number(o.spokeGain()) || 0 : 0;
    state = 'result'; ov.classList.remove('is-turning'); msg.hidden = true; res.hidden = false; ov.classList.toggle('is-jp', !!p.jackpot);
    landI = RING ? landedIndex(p, lastStop, N) : -1;
    if (RING) res.innerHTML = ringResultHtml(p, d, sg);
    else if (o.plainResult) res.innerHTML = (p.jackpot ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' ' + esc(o.jpText || 'JACKPOT!') + '</span>' : '') + // wa1 find: a word result (chip + big line + one plain line)
      '<div class="wh-big">' + (d.chip ? '<span class="wh-chip' + (p.boosted ? ' is-boost' : '') + '">' + esc(d.chip) + '</span>' : '') + '<b>' + esc(d.big) + '</b></div>' + (d.line ? '<div class="wh-chg"><span>' + esc(d.line) + '</span></div>' : '') +
      (sg > 0 ? '<div class="wh-sp">' + spokeIcon(20) + '<b>+' + esc(sg) + (Number(sg) === 1 ? ' Spoke' : ' Spokes') + '</b></div>' : '');
    else res.innerHTML = (!p.jackpot && d.breakthrough && wholeLetter(d.from, d.to) ? '<span class="wh-bt">Breakthrough!</span>' : p.jackpot && !o.jpText ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' JACKPOT!' + (d.breakthrough && wholeLetter(d.from, d.to) ? ' Breakthrough!' : '') + '</span>' : '') + ringResultHtml(p, d, sg) + (p.boosted || p.hot ? '<div class="wh-bst">' + (p.boosted ? '<span class="wh-bst1">' + esc(boostText('Booster', o.plus, p.boostBy || 1)) + '</span>' : '') + (p.hot ? '<span class="wh-bst1">' + esc(boostText('Hot Streak', o.plus, p.hotBy || 1)) + '</span>' : '') + '</div>' : ''); // production Training / Course / Find / Hype pass `slices`: same block as the ring
    const TL = TIMING && timeB && (RING || !o.plainResult); // ring wheels always say Early / Good timing / Late (a stored stop too)
    if (TIMING && timeB && !o.plainResult) res.insertAdjacentHTML('beforeend', '<div class="wh-tim" data-timing="' + timeB + '"><span class="wh-tim--' + timeB + '">' + esc(TIMING_LINE[timeB]) + '</span></div>');
    else if (TL) res.insertAdjacentHTML('beforeend', '<div class="wh-tim" data-timing="' + timeB + '"><span class="wh-tim--' + timeB + '">' + esc(TIMING_LINE[timeB]) + '</span></div>'); // wa2: one timing line (copy only)
    live.textContent = (TIMING && timeB && !o.plainResult ? TIMING_LINE[timeB] + '. ' : '') + (TL && o.plainResult ? TIMING_LINE[timeB] + '. ' : '') + (line ? line + '. ' : '') + (landedShort ? 'Landed on ' + landedFull + '. ' : '') + (d.say || '') + (p.boosted ? ' Booster plus ' + (p.boostBy || 1) + '.' : '') + (p.hot ? ' Hot Streak plus ' + (p.hotBy || 1) + '.' : ''); // read once, politely; nothing is announced while spinning
    showTokens(p, line); ov.classList.toggle('has-tok', !tokBox.hidden && !!tokBox.querySelector('button')); if (!again && !o.pending && !stRec) burst();
    go.textContent = o.collectLabel || 'COLLECT'; go.classList.add('is-collect', 'c-btn--gold'); go.classList.remove('c-btn--primary', 'is-window', 'is-glow'); go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); go.setAttribute('aria-label', o.collectLabel || 'Collect'); xLook(false); focusGo(go);
    if (o.plainResult) { const cd = $('.wh-card'), pl = $('.wh-plate'); if (cd && !RING) cd.style.display = 'none'; /* ring: the card stays so the stage top, and the wheel under it, never moves (T4 QA4 NEW-6) */ res.style.minHeight = '0'; if (pl) pl.hidden = true; ov.classList.add('is-res-compact'); } // wa1 fixfind: Find result: the hint card, the name plate and the result box's empty height make way so the wheel stays big (>= ~240 px at 475x638)
    if (LK || o.plainResult || RING) layout(); // wheel meta only (flag off: unchanged). The foot is taller now (result, tokens, outcome line): size the wheel to the room left so the stand and plate under it are never covered or clipped
    draw();
  }
  /** m5: the button shows it is waiting: words, dimmed look (css .wh-go.is-wait), aria-disabled. Static: nothing flashes. */
  function waitLook(text, aria) { go.textContent = text; go.setAttribute('aria-label', aria); go.setAttribute('aria-disabled', 'true'); go.classList.add('is-wait', 'is-disabled'); xLook(true); }
  /** QA3 m11: the X cannot close while the wheel turns or slows, so it looks off (dashed, dimmed, aria-disabled) and says why. Static. */
  function xLook(off) { const x = $('.wh-x'); if (!x) return; x.classList.toggle('is-wait', off); x.classList.toggle('is-disabled', off); if (off) { x.setAttribute('aria-disabled', 'true'); x.setAttribute('aria-label', 'Close (wait for the wheel to stop)'); } else { x.removeAttribute('aria-disabled'); x.setAttribute('aria-label', 'Close'); } }
  /** SPIN at tap time ms: the first cycle starts at W0; STOP stays inactive (same spot, aria-disabled) for the 0.35 s guard. */
  function spin(ms) { state = 'spin'; phi = pos; spinEv = ms / 1000; clock = nowMs() / 1000; speed = P.W0; curDist = pulseW(0, P) * P.D / 3; setMsg('Get ready. STOP wakes up in a moment.'); waitLook('Wait...', 'Wait. STOP wakes up in a moment'); ov.classList.add('is-turning'); raf = requestAnimationFrame(frame); }
  const wobbleOf = () => (o.wobKey != null && o.wobKey !== '' ? wheelWobble(String(o.wobKey), JE) : (Math.random() * 2 - 1) * JE); // keyed: the same key gives the same wobble after a reload
  /** STOP at t s after SPIN (from the tap's own timeStamp). The wobble is drawn now; the slice is phi + tickAt(t) + e. The host records inside onSpin, before the result animation starts. */
  function stop(t) {
    const e = wobbleOf(), R = pulseStop(P, phi, t, e, cum, C, RESPIN), st = R.stop; lastStop = st;
    go.classList.remove('is-glow', 'c-btn--gold'); go.classList.remove('is-window'); if (TIMING) timeB = timingBucket(st.tInCycle); // same early / careful / late buckets as the Copy report (cycle time; never "Coasted")
    o.onSpin(st); const p = pendingNow(); if (!p) { close(); return; }
    // the store agrees with the landing: the wheel just eases out. If an older store answered with its own slice, steer the ease to that slice so the card never contradicts the wheel.
    const pi = landedIndex(p, st, N); adj = 0; if (pi !== st.sliceId) { const end = R.base + R.dist + e, mid = centreOf(pi); adj = (((mid - end) % C) + C) % C; }
    if (RING) adj += restNudge(cum, R.base + R.dist + e + adj, pi, seamClearDeg(size / 2 - 1)); // N5: the pointer never rests on a spoke (display only; the stop record and landed slice are unchanged)
    stopInfo = { base: R.base, dist: R.dist, e }; tapT = spinEv + t; state = 'land'; speed = pulseW(st.tInCycle, P); ov.classList.remove('is-turning'); waitLook('Slowing...', 'Slowing down. Please wait'); setMsg('Slowing down...');
  }
  /** The tap's own time (ms, performance.now() clock); a missing or epoch-style timeStamp falls back to now. */
  const stampOf = (ev) => { const n = nowMs(), s = ev && ev.timeStamp; return typeof s === 'number' && s > 0 && s <= n + 1000 ? s : n; };
  function onGo(ev) {
    const ms = stampOf(ev);
    if (state === 'idle') { if (clk.start(ms)) spin(ms); } // a second SPIN tap is ignored: a spin is running
    else if (state === 'spin') { const t = clk.tap(ms); if (t == null) return; stop(t); } // inside the guard, or a second STOP tap: ignored
    else if (state === 'result') { const f = o.onCollect; close(true); if (f) f(); }
  }
  go.addEventListener('click', onGo);
  function close(done) {
    if (closed) return; closed = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); try { if (roW) roW.disconnect(); } catch (e) { /* ignore */ }
    ov.remove(); releaseInert(app); if (opener && opener.isConnected && opener.focus) opener.focus(); if (!done && o.onClose) o.onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape' && state !== 'spin' && state !== 'land' && state !== 'tok') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { const f = [...ov.querySelectorAll('button')].filter((b) => !b.disabled); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  }
  $('.wh-x').addEventListener('click', () => { if (state !== 'spin' && state !== 'land' && state !== 'tok') close(); });
  document.addEventListener('keydown', onKey, true); window.addEventListener('resize', onResize);
  layout();
  try { if (roW) roW.observe($('.wh-stage')); } catch (e) { /* no observer: the window resize still works */ }
  if (RING && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!closed) onResize(); }); // ring labels are measured: fit again once the pixel font has loaded
  const pend = o.pending || (stRec ? ringPending(stRec.sliceId) : null); // a stored stop opens on its result and never spins again
  if (pend) { pos = centreOf(landedIndex(pend, stRec, N)); if (stRec && Number.isFinite(+stRec.tInCycle) && stRec.tInCycle !== null) timeB = timingBucket(+stRec.tInCycle); state = 'result'; draw(); showResult(); } // a stored stop keeps its Early / Good timing / Late line
  else { setMsg('Tap SPIN, then tap STOP.'); focusGo(go); }
  return close;
}
