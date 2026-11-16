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
   Canvas drawn in code, pixel style, palette read from the page's CSS variables (Green and chalk and Scorebook both work). */
import { esc, icoDeco } from './dom.js';
import { releaseInert } from './inert.js';
import { wheelWidths, stopExtra, TIMING_WIN, timingBucket, TIMING_LINE } from '../core/training.js';
import { matOf, colourOf, normLook, PALETTES, spokeIcon, glowOn, aimMarker, sliceLabel, legendRows, tierShape, LABEL_MIN_W } from './wheel-look.js';
import { tickKind, TICK } from '../core/landtick.js';
import { WHEEL_ENGINE } from '../data/wheel-engine.js';
import { pulseW, pulseArc, tickAt, cycleOf, ARC_PER_CYCLE } from '../core/wheel-pulse.js';
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
  let lastStop = null;
  const pendingNow = () => (o.getPending && o.getPending()) || (RING && lastStop ? ringPending(lastStop.sliceId) : null) || (stRec ? ringPending(stRec.sliceId) : null);
  const app = document.getElementById('app'), opener = document.activeElement;
  const pal = { cream: tok('--cream', '#F3EBD3'), out: tok('--outline', '#2A2238'), gold: tok('--gold', '#D2B357'), wall: tok('--wall1', '#E3D8B9'), g2: tok('--grass2', '#7EB261'), acc: tok('--accent', '#22625D'), b1: tok('--kitA1', '#3b5ba5') };
  const LP = LK && PALETTES[LK.pal] || null, mat = LK && LK.material ? matOf(LK.material) : null; // craft look: colour-blind safe slice palette, tier material on the rim
  const crys = !!(LK && LK.crystal), cmat = matOf('crystal'), ringCol = crys ? cmat.rim : (LK && colourOf(LK.rim)) || (mat && mat.rim) || pal.cream, trailCol = (LK && colourOf(LK.trail)) || pal.cream, hubCol = crys ? cmat.rim : (LK && colourOf(LK.hub)) || pal.acc, ptrCol = LK && colourOf(LK.ptr);
  const shape = LK && LK.spoke ? String(LK.spoke) : '';
  const tierFill = (t) => (t === 'top' ? (LP ? LP[3] : pal.g2) : t === 'low' ? (LP ? LP.low : tierShape('low').colour) : LP ? LP[2] : pal.wall); // bottom tier pale sand, never rose (SPEC 2f)
  const fillOf = (i) => (GD.includes(i) ? pal.gold : RING ? tierFill(RING[i].tier) : LP ? (VALS[i] <= 1 ? LP.low : VALS[i] === 2 ? LP[2] : VALS[i] === 3 ? LP[3] : LP[4]) : VALS[i] <= 1 ? pal.wall : VALS[i] === 2 ? pal.g2 : VALS[i] === 3 ? pal.acc : pal.b1);
  const fills = VALS.map((_, i) => fillOf(i));
  const legend = Array.isArray(o.legend) ? o.legend : RING ? legendRows(RING) : [];
  const ov = document.createElement('section');
  ov.className = 't2-ov wh-ov' + (crys ? ' is-crystal' : ''); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', o.title);
  if (o.wheelId) ov.setAttribute('data-wheel', String(o.wheelId)); if (o.spinKey) ov.setAttribute('data-spin-key', String(o.spinKey));
  const sliceWords = RING ? RING.map((r) => String(r.label != null && r.label !== '' ? r.label : r.value) + (r.gold ? ' gold' : '')).join(', ') : o.labels ? o.labels.map((l, i) => l || (GD.includes(i) ? 'gold' : 'blank')).join(', ') : VALS.map((v, i) => '+' + v + (GD.includes(i) ? ' jackpot' : '')).join(', '); /* wa1 find: o.labels = word labels */
  const am = aimMarker({ size: 34 }), aimSvg = RING ? '<span class="wk-aim wh-aim" aria-hidden="true" style="position:absolute;left:50%;top:-30px;transform:translateX(-50%);z-index:3"><svg width="34" height="40" viewBox="0 0 34 40" focusable="false"><polygon class="wk-aim-tri" points="' + am.points.map((p) => p.join(',')).join(' ') + '"/><text class="wk-aim-txt" x="' + am.textX + '" y="' + (am.textY + 2) + '" text-anchor="middle">' + am.text + '</text></svg></span>' : '';
  const legendHtml = legend.length ? '<div class="wk-legend" data-legend>' + legend.map((r) => '<span class="wk-legend-row"><span class="wk-legend-ch">' + esc(r.ch) + '</span>' + esc(r.text) + '</span>').join('') + '</div>' : '';
  ov.innerHTML = '<div class="t2-strip"><span>' + icoDeco('burst', 24) + ' ' + esc(o.title) + (o.sub ? ' <small>' + esc(o.sub) + '</small>' : '') + '</span>' +
    '<button type="button" class="c-icon-btn wh-x" aria-label="Close"><span class="c-ico c-ico--x"></span></button></div>' +
    '<div class="wh-card c-card">' + (o.cardHtml || '') + '</div>' +
    '<div class="wh-stage"><div class="wh-wrap" role="img" aria-label="Wheel of ' + N + ' slices: ' + esc(sliceWords) + '"><canvas class="wh-cv"></canvas><canvas class="wh-tk" aria-hidden="true"></canvas><span class="wh-ptr" aria-hidden="true"></span><span class="wh-hub" aria-hidden="true"></span>' + aimSvg + (LK && LK.crystal ? '<span class="wh-crystal" aria-hidden="true"></span>' : '') + (LK && LK.stand ? '<span class="wh-stand wh-stand--' + esc(String(LK.stand).replace(/[^a-z]/gi, '')) + '" aria-hidden="true"></span>' : '') + (LK && LK.name ? '<span class="wh-plate" aria-hidden="true" hidden></span>' : '') + '</div>' + legendHtml + '</div>' +
    '<div class="wh-foot"><div class="wh-msg c-card" data-msg></div><div class="wh-res c-card c-card--inset" data-res hidden></div><div class="wh-tok" data-tok hidden></div>' +
    '<button type="button" class="c-btn c-btn--primary c-btn--cta c-btn--block wh-go" data-go>SPIN</button></div>' +
    '<div class="sr-only" role="status" aria-live="polite" data-live></div>';
  document.body.appendChild(ov); if (app) app.inert = true;
  const $ = (q) => ov.querySelector(q), wrap = $('.wh-wrap'), cv = $('.wh-cv'), ctx = cv.getContext('2d'), tkc = $('.wh-tk'), tctx = tkc.getContext('2d'), go = $('[data-go]'), msg = $('[data-msg]'), res = $('[data-res]'), live = $('[data-live]'), ptr = $('.wh-ptr'), tokBox = $('[data-tok]');
  if (LK) { if (ptrCol) ov.style.setProperty('--wh-ptr', 'rgb(' + ptrCol + ')'); if (LK.hub && colourOf(LK.hub)) ov.style.setProperty('--wh-hub', 'rgb(' + hubCol + ')'); const pl = $('.wh-plate'); if (LK.name && pl) { pl.textContent = String(LK.name).slice(0, 24); pl.hidden = false; pl.setAttribute('aria-hidden', 'true'); } }
  const labels = VALS.map((v, i) => { const s = document.createElement('span'); s.className = 'wh-lab' + (GD.includes(i) ? ' is-jp' : ''); s.style.zIndex = '2'; s.textContent = o.labels ? o.labels[i] || '' : RING ? sliceLabel(RING[i]) : (o.plus || '+') + v; /* wa1 find: word labels; ring: under-7% = one character or signed number */ s.setAttribute('aria-hidden', 'true'); wrap.appendChild(s); return s; });
  // wheel state: pos = the wheel coordinate (units) under the pointer; the wheel's turn is rot = pos * U. clock / spinEv / tapT are performance.now() seconds.
  const clk = spinClock(GUARD);
  let state = 'idle', pos = Math.random() * C, phi = pos, speed = 0, curDist = 0, clock = nowMs() / 1000, tapT = 0, stopInfo = null, adj = 0, raf = 0, closed = false, S = 2, size = 100, css = 200, spinEv = 0;
  const centreOf = (i) => (cum[i] + cum[i + 1]) / 2;
  // wa1 fixfind: word labels (Find) sit on the whole gold block (a run of gold cells), sized to fit inside the slice and the rim; too thin -> a gold Nothing is skipped, a find block gets a diamond icon
  const WL = !!o.labels && !RING, isG = (i) => GD.includes(i), joinP = (i) => WL && i > 0 && isG(i) && isG(i - 1), joinN = (i) => WL && i < N - 1 && isG(i) && isG(i + 1);
  const plan = WL ? o.labels.map((t, i) => { let s0 = i, s1 = i; if (isG(i)) { while (joinP(s0)) s0--; while (joinN(s1)) s1++; } return { text: t || '', c: (cum[s0] + cum[s1 + 1]) / 2, half: (cum[s1 + 1] - cum[s0]) * U / 2, rl: 0, ico: false }; }) : null;
  function fitLabels() {
    if (!WL) return; const rIn = (size / 2 - 12) * S, rHub = 13 * S, f0 = Math.round(Math.min(24, Math.max(13, css * 0.075)));
    labels.forEach((l, i) => {
      const Q = plan[i]; Q.rl = 0; Q.ico = false; l.classList.remove('is-ico'); l.removeAttribute('style'); l.hidden = !Q.text; if (!Q.text) return; l.textContent = Q.text;
      const sa = Math.sin(Math.min(Q.half, Math.PI / 2));
      for (let fs = f0; fs >= 12; fs--) { // largest font whose bounding circle fits between the slice edges and inside the rim lane
        l.style.fontSize = fs + 'px'; l.style.lineHeight = Math.round(fs * 1.1) + 'px';
        const h = Math.hypot(l.offsetWidth, l.offsetHeight) / 2 + 1, near = Math.max(h / sa, rHub + h), far = rIn - h;
        if (near <= far) { Q.rl = (near + far) / 2; return; }
      }
      if (isG(i)) { Q.ico = true; Q.rl = rIn - 9; l.textContent = ''; l.classList.add('is-ico'); Object.assign(l.style, { fontSize: '', width: '12px', height: '12px', background: 'rgb(' + pal.gold + ')', border: '2px solid rgb(' + pal.out + ')', boxShadow: '0 0 0 1px #fff', transform: 'translate(-50%,-50%) rotate(45deg)' }); return; }
      l.hidden = true; // a Nothing gap too thin for the word: unlabelled (its plain colour says it)
    });
  }

  function layout() { // wheel sized from the free height (stage), never wider than the screen
    const st = $(".wh-stage"), lg = $('[data-legend]'), RES = LK && LK.name && !ov.classList.contains('is-res-compact') ? 34 : LK && (LK.stand || LK.name) ? 14 : 0, h = st.clientHeight - 24 - 22 - RES - (lg ? lg.offsetHeight + 8 : 0), w = st.clientWidth - 24; // RES: room under the rim for the stand / name plate (they hang from the wheel box)
    css = Math.max(160, Math.min(w, h, 340)); size = Math.floor(css / S / 2) * 2; css = size * S; wrap.style.marginBottom = RES ? RES + 'px' : '';
    wrap.style.width = wrap.style.height = css + 'px'; cv.width = cv.height = size; cv.style.width = cv.style.height = css + 'px'; tkc.width = tkc.height = size; tkc.style.cssText = 'position:absolute;left:0;top:0;z-index:2;pointer-events:none;image-rendering:pixelated;width:' + css + 'px;height:' + css + 'px'; fitLabels(); draw();
  }
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
  function draw() {
    const w = size, cx = w / 2, cy = w / 2, R = w / 2 - 1, im = ctx.createImageData(w, w), d = im.data, moving = state === 'spin' || state === 'land' || state === 'tok', rot = pos * U, zoneOn = ZONE > 0 && goldNear();
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.sqrt(dx * dx + dy * dy); if (r > R) continue;
      const th = Math.atan2(dy, dx); let q = (rot - (th + Math.PI / 2)) % TAU; if (q < 0) q += TAU; // wheel angle under this pixel; slices pass the pointer in list order
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
      }
      const p = (y * w + x) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
    ctx.putImageData(im, 0, 0); tctx.clearRect(0, 0, w, w); // the landing tick lives on its own canvas above the glass sheen (z 2; the labels sit above it)
    const tk = tickKind({ guide: !!o.guide });
    if (tk !== 'none' && state === 'spin') { // landing tick (free for everyone): the wheel point that ends under the pointer if STOP is tapped now (phi + tickAt(t), no wobble); Aim Guide = gold wedge + J band
      const ga = -Math.PI / 2 - curDist * U, gx = Math.cos(ga), gy = Math.sin(ga), r0 = R - 15, plot = (rr, o, col) => { tctx.fillStyle = col; tctx.fillRect(Math.round(cx + gx * rr - gy * o), Math.round(cy + gy * rr + gx * o), 1, 1); };
      if (o.guide && JE > 0) { tctx.beginPath(); tctx.arc(cx, cy, R - 4, ga - JE * U, ga + JE * U); tctx.lineWidth = 5; tctx.strokeStyle = 'rgba(' + ZONE_COL.join(',') + ',0.9)'; tctx.stroke(); } // Aim Guide: the yellow rim band of the wobble spread (+-J; Steady narrows it)
      if (tk === 'wedge') {
        for (const [grow, col] of [[1.6, 'rgb(' + pal.out + ')'], [0, 'rgb(' + pal.gold + ')']]) for (let rr = r0 - grow; rr <= R - 0.5; rr += 0.5) { const t = Math.max(0, (rr - r0) / (R - r0)), hw = TICK.WEDGE_TIP_PX + t * 3 + grow; for (let o = -hw; o <= hw; o += 0.5) plot(rr, o, col); } // Aim Guide: an outlined gold wedge on the rim, sharp tip inside, wide end at the rim
        for (let rr = r0 + 2; rr <= R - 2; rr += 0.5) plot(rr, 0, '#fff');
      } else { // plain tick: a dark 2 px bar with a 1 px white halo, 13 px long across the rim band; readable on every slice and skin
        for (const [hw, col] of [[TICK.PLAIN_PX / 2 + 1, '#fff'], [TICK.PLAIN_PX / 2, 'rgb(' + pal.out + ')']]) for (let rr = r0 - (hw > 1.5 ? 1 : 0); rr <= R - 0.5; rr += 0.5) for (let o = -hw; o <= hw; o += 0.5) plot(rr, o, col);
      }
    }
    const a = rot - centreOf(JP) * U - Math.PI / 2, ax = Math.round(cx + Math.cos(a) * (R - 3.6)), ay = Math.round(cy + Math.sin(a) * (R - 3.6));
    for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const q = Math.abs(i) + Math.abs(j); if (q > 5) continue; ctx.fillStyle = q >= 5 ? 'rgb(' + pal.out + ')' : q >= 4 ? '#fff' : 'rgb(' + pal.gold + ')'; ctx.fillRect(ax + i, ay + j, 1, 1); } // diamond on the jackpot slice
    if (WL) labels.forEach((l, i) => { const Q = plan[i]; if (l.hidden) return; const b = rot - Q.c * U - Math.PI / 2; // wa1 fixfind: fitted word labels
      l.style.left = cx * S + Math.cos(b) * Q.rl + 'px'; l.style.top = cy * S + Math.sin(b) * Q.rl + 'px';
      if (!Q.ico) l.style.color = lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; l.style.opacity = moving && speed > 8 && !isG(i) ? '.55' : '1';
    });
    else labels.forEach((l, i) => {
      const b = rot - centreOf(i) * U - Math.PI / 2, thin = widths[i] * U < 0.2 || (RING && widths[i] < LABEL_MIN_W), rl = R * (GD.includes(i) ? 0.8 : 0.62); l.style.fontSize = thin ? '14px' : ''; // a thin slice: a smaller label so it stays inside the slice edges
      l.style.left = (cx + Math.cos(b) * rl) * S + 'px'; l.style.top = (cy + Math.sin(b) * rl) * S + 'px';
      l.style.color = lum(fills[i]) > 0.5 ? 'rgb(' + pal.out + ')' : '#fff'; l.style.opacity = moving && speed > 8 && !GD.includes(i) ? '.55' : '1';
    });
  }
  const setMsg = (t) => { msg.textContent = t; };
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
      if (TIMING) { const tw0 = clock - spinEv - (f.cycle - 1) * PERIOD, inW = el >= GUARD && tw0 >= TIMING_WIN.lo && tw0 <= TIMING_WIN.hi; if (inW !== go.classList.contains('is-window')) { go.classList.toggle('is-window', inW); go.classList.toggle('is-glow', inW); if (el >= GUARD) go.textContent = inW ? 'STOP!' : 'STOP'; } } // STOP glow 3.2-3.8 s of every cycle: time only, never reads a slice
      tick(was, pos); // no coast, no auto-stop: the wheel turns until the player taps STOP
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
  const MSG_GO = 'Turning. Tap STOP when the button glows. The tick shows where it will land. Tap early and it goes further.';
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
    const line = outcomeLine(kind, before, q), dest = centreOf(q.index); clock = nowMs() / 1000;
    const from = pos, fwd = (((dest - from) % C) + C) % C, half = (((dest - from + C / 2) % C) + C) % C - C / 2;
    tw = { kind, t0: clock, from, dest, line, dur: kind === 'two' ? 1.9 : kind === 'nudge' ? 0.5 : kind === 'lift' ? 0.8 : 1.3, to: kind === 'nudge' ? from + half : from + 2 * C + fwd };
    if (kind === 'two') { tw.mid = from + C + ((((centreOf((q.index + 3) % N) - from) % C) + C) % C); tw.to = tw.mid + C + ((((dest - tw.mid) % C) + C) % C); } // first stop on another slice (the pointer flashes), then the final one
    state = 'tok'; tokBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-disabled', 'true')); tokBox.classList.add('is-busy');
    waitLook(kind === 'lift' ? 'Lifting...' : kind === 'nudge' ? 'Stepping...' : 'Spinning again...', 'Please wait'); ov.classList.add('is-turning');
    if (kind === 'lift') { const bn = document.createElement('span'), d = q.gain - (before ? before.gain : q.gain); bn.className = 'wh-bonus'; bn.setAttribute('aria-hidden', 'true'); bn.textContent = d > 0 ? '+' + d : '+0'; wrap.appendChild(bn); setTimeout(() => bn.remove(), 900); }
    raf = requestAnimationFrame(frame);
  }
  function finishToken() { ov.classList.remove('is-turning'); showResult(true, tw && tw.line); const f = tokBox.querySelector('button') || go; f.focus(); tw = null; }
  function burst() { // landing burst (craft look): a few pixel bits fly out once
    if (!LK || !LK.burst) return; const b = document.createElement('span'); b.className = 'wh-burst wh-burst--' + String(LK.burst).replace(/[^a-z]/gi, ''); b.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = css * 0.46, e = document.createElement('i'); e.style.setProperty('--bx', Math.round(Math.cos(a) * r) + 'px'); e.style.setProperty('--by', Math.round(Math.sin(a) * r) + 'px'); b.appendChild(e); }
    wrap.appendChild(b); setTimeout(() => b.remove(), 1000);
  }
  const describeOf = (p) => (o.describe ? o.describe(p) : { big: RING ? String(RING[p.index].label) : PL() + p.gain, from: '', to: '', say: 'Landed: ' + (RING ? RING[p.index].label : PL() + p.gain) + '.' });
  function showResult(again, line) {
    const p = pendingNow(); if (!p) return; const d = describeOf(p), sg = o.spokeGain ? Number(o.spokeGain()) || 0 : 0;
    state = 'result'; ov.classList.remove('is-turning'); msg.hidden = true; res.hidden = false; ov.classList.toggle('is-jp', !!p.jackpot);
    if (o.plainResult) res.innerHTML = (p.jackpot ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' ' + esc(o.jpText || 'JACKPOT!') + '</span>' : '') + // wa1 find: a word result (chip + big line + one plain line)
      '<div class="wh-big">' + (d.chip ? '<span class="wh-chip' + (p.boosted ? ' is-boost' : '') + '">' + esc(d.chip) + '</span>' : '') + '<b>' + esc(d.big) + '</b></div>' + (d.line ? '<div class="wh-chg"><span>' + esc(d.line) + '</span></div>' : '') +
      (sg > 0 ? '<div class="wh-sp">' + spokeIcon(20) + '<b>+' + esc(sg) + ' Spokes</b></div>' : '');
    else res.innerHTML = (p.jackpot ? '<span class="wh-jp">' + icoDeco('burst', 20) + ' JACKPOT! Breakthrough!</span>' : d.breakthrough && wholeLetter(d.from, d.to) ? '<span class="wh-bt">Breakthrough!</span>' : '') +
      '<div class="wh-big"><span class="wh-chip' + (p.boosted || p.hot ? ' is-boost' : '') + '">' + esc(o.plus || '+') + esc(p.gain) + '</span><b>' + esc(d.big) + '</b></div>' +
      (p.boosted || p.hot ? '<div class="wh-bst">' + (p.boosted ? '<span class="wh-bst1">Booster ' + esc(o.plus || '+') + esc(p.boostBy || 1) + '</span>' : '') + (p.hot ? '<span class="wh-bst1">Hot Streak ' + esc(o.plus || '+') + esc(p.hotBy || 1) + '</span>' : '') + '</div>' : '') +
      '<div class="wh-chg">' + (d.from !== d.to ? '<span>' + esc(d.from) + '</span><span class="t2-arr" aria-hidden="true"></span><b class="t2-new">' + esc(d.to) + '</b>' : d.barHtml ? d.barHtml + '<small>(bar fills)</small>' : '<span>' + esc(d.from) + '</span><small>(same letter)</small>') + '</div>' +
      (sg > 0 ? '<div class="wh-sp">' + spokeIcon(20) + '<b>+' + esc(sg) + ' Spokes</b></div>' : '');
    if (TIMING && timeB && !o.plainResult) res.insertAdjacentHTML('beforeend', '<div class="wh-tim" data-timing="' + timeB + '"><span class="wh-tim--' + timeB + '">' + esc(TIMING_LINE[timeB]) + '</span></div>'); // wa2: one timing line (copy only)
    live.textContent = (TIMING && timeB && !o.plainResult ? TIMING_LINE[timeB] + '. ' : '') + (line ? line + '. ' : '') + (d.say || '') + (p.boosted ? ' Booster plus ' + (p.boostBy || 1) + '.' : '') + (p.hot ? ' Hot Streak plus ' + (p.hotBy || 1) + '.' : ''); // read once, politely; nothing is announced while spinning
    showTokens(p, line); if (!again && !o.pending && !stRec) burst();
    go.textContent = o.collectLabel || 'COLLECT'; go.classList.add('is-collect', 'c-btn--gold'); go.classList.remove('c-btn--primary', 'is-window', 'is-glow'); go.removeAttribute('aria-disabled'); go.classList.remove('is-wait', 'is-disabled'); go.setAttribute('aria-label', o.collectLabel || 'Collect'); xLook(false); go.focus();
    if (o.plainResult) { const cd = $('.wh-card'), pl = $('.wh-plate'); if (cd) cd.style.display = 'none'; res.style.minHeight = '0'; if (pl) pl.hidden = true; ov.classList.add('is-res-compact'); } // wa1 fixfind: Find result: the hint card, the name plate and the result box's empty height make way so the wheel stays big (>= ~240 px at 475x638)
    if (LK || o.plainResult) layout(); // wheel meta only (flag off: unchanged). The foot is taller now (result, tokens, outcome line): size the wheel to the room left so the stand and plate under it are never covered or clipped
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
    go.classList.remove('is-glow'); go.classList.remove('is-window'); if (TIMING) timeB = timingBucket(st.tInCycle); // same early / careful / late buckets as the Copy report (cycle time; never "Coasted")
    o.onSpin(st); const p = pendingNow(); if (!p) { close(); return; }
    // the store agrees with the landing: the wheel just eases out. If an older store answered with its own slice, steer the ease to that slice so the card never contradicts the wheel.
    adj = 0; if (p.index !== st.sliceId) { const end = R.base + R.dist + e, mid = centreOf(p.index); adj = (((mid - end) % C) + C) % C; }
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
    if (closed) return; closed = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', layout);
    ov.remove(); releaseInert(app); if (opener && opener.isConnected && opener.focus) opener.focus(); if (!done && o.onClose) o.onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape' && state !== 'spin' && state !== 'land' && state !== 'tok') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { const f = [...ov.querySelectorAll('button')].filter((b) => !b.disabled); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  }
  $('.wh-x').addEventListener('click', () => { if (state !== 'spin' && state !== 'land' && state !== 'tok') close(); });
  document.addEventListener('keydown', onKey, true); window.addEventListener('resize', layout);
  layout();
  const pend = o.pending || (stRec ? ringPending(stRec.sliceId) : null); // a stored stop opens on its result and never spins again
  if (pend) { pos = centreOf(Math.max(0, Math.min(N - 1, pend.index | 0))); state = 'result'; draw(); showResult(); }
  else { setMsg('Tap SPIN. Tap STOP when the gold slice is near the top. The tick shows where it will land.'); go.focus(); }
  return close;
}
