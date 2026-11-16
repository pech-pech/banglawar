// Ring helpers (CONTRACT-A sec 2/5, SPEC 2f/11b, test 6). Pure, no DOM, no RNG.
// A ring is an array of slice rows {id, w, value, label, tier, gold}; w in rim units, sum 10.000.
import { WHEEL_ENGINE } from '../data/wheel-engine.js';

export const SLICE_MAX_P = WHEEL_ENGINE.SLICE_MAX_P;
export const SLICE_WIDEN_MAX = WHEEL_ENGINE.SLICE_WIDEN_MAX;
export const RING_TOTAL = 10;
export const SUM_TOL = 0.001;
const EPS = 1e-9;

// Equal-neighbour exceptions of SPEC test 6 for rings whose sim-found values repeat. Each pair [i, j] is 0-BASED ring
// indices, j = i + 1 (SPEC prints 1-based slice numbers). Toss (SPEC 7: 0 0 0 | 2.5 5 2.5 2.5 5 5 2.5): slices 1-3, 6-7, 8-9.
// Pep (SPEC 8: 5 7.5 5 2.5 2.5 5 7.5 10 7.5 5 2.5 2.5): slices 4-5 and 11-12 (12 -> 1 is 2.5 vs 5, no wrap pair).
export const EQUAL_OK = Object.freeze({
  toss: Object.freeze([[0, 1], [1, 2], [5, 6], [7, 8]]),
  pep: Object.freeze([[3, 4], [10, 11]]),
});

const total = (ring) => ring.reduce((a, s) => a + s.w, 0);
const reId = (ring) => ring.map((s, i) => Object.freeze({ ...s, id: i }));

// Split every slice wider than cap of the ring into equal neighbours (value/tier/gold kept,
// ids re-numbered in ring order). Total width is kept.
export function capSplit(ring, cap = SLICE_MAX_P) {
  const T = total(ring);
  const lim = cap * T;
  const out = [];
  for (const s of ring) {
    const n = s.w > lim + EPS ? Math.ceil(s.w / lim - EPS) : 1;
    for (let k = 0; k < n; k++) out.push({ ...s, w: s.w / n });
  }
  return Object.freeze(reId(out));
}

// Problems list (empty = ok). opts.cap (default SLICE_MAX_P; pass SLICE_WIDEN_MAX for widened rings),
// opts.wheelId ('toss'|'pep' use EQUAL_OK when no allowEqual is given), opts.allowEqual: true, or a (a, b, i) => bool allowlist for SPEC test 6 exception rings.
export function checkRing(ring, opts = {}) {
  const cap = opts.cap ?? SLICE_MAX_P;
  let allow = opts.allowEqual;
  if (allow === undefined && opts.wheelId && EQUAL_OK[opts.wheelId]) {
    const pairs = EQUAL_OK[opts.wheelId];
    allow = (a, b, i) => pairs.some(([x, y]) => x === i && y === (i + 1) % ring.length);
  }
  const problems = [];
  const T = total(ring);
  if (Math.abs(T - RING_TOTAL) > SUM_TOL) problems.push(`sum ${T.toFixed(4)} not ${RING_TOTAL}`);
  ring.forEach((s, i) => {
    if (s.w > cap * RING_TOTAL + EPS) problems.push(`slice ${i} width ${(s.w / RING_TOTAL * 100).toFixed(2)}% over cap ${(cap * 100).toFixed(1)}%`);
  });
  if (allow !== true && ring.length > 1) {
    ring.forEach((s, i) => {
      const nx = ring[(i + 1) % ring.length];
      if (s.value === nx.value) {
        const ok = typeof allow === 'function' && allow(s, nx, i);
        if (!ok) problems.push(`slices ${i} and ${(i + 1) % ring.length} share value ${s.value}`);
      }
    });
  }
  return problems;
}

// Widen the given slices by `by` (share of the ring, e.g. 0.01, by >= 0; a negative or NaN `by` widens nothing), each clamped
// at max of the ring. A widened slice is never re-split; the other slices shrink pro rata so the total is kept.
// The shrink is bounded: every other slice keeps at least MIN_KEEP of its width, so no width ever reaches zero or goes
// negative; when the requested growth would break that, the growth is scaled back. Widening every slice changes nothing.
export const MIN_KEEP = 0.1;
export function widen(ring, sliceIds, by, max = SLICE_WIDEN_MAX) {
  const T = total(ring);
  const ids = new Set(sliceIds);
  const ceil = max * T, up = by > 0 ? by * T : 0;
  let base = 0, G = 0, others = 0;
  const want = ring.map((s, i) => {
    if (!ids.has(i)) { others += s.w; return s.w; }
    const v = Math.max(s.w, Math.min(ceil, s.w + up));
    base += s.w; G += v - s.w; return v;
  });
  if (!(others > 0)) return Object.freeze(ring.map((s) => Object.freeze({ ...s })));
  // growth factor f in [0, 1]: others end at (T - base - f G) / others >= MIN_KEEP of their width
  const f = G > 0 ? Math.max(0, Math.min(1, (T - base - MIN_KEEP * others) / G)) : 0;
  const k = (T - base - f * G) / others;
  return Object.freeze(ring.map((s, i) => Object.freeze({ ...s, w: ids.has(i) ? s.w + f * (want[i] - s.w) : s.w * k })));
}

// ---- Spoke-clear rest (T8 N5). Display only: the stop record, the landed slice and every RNG draw are unchanged.
// A stop whose rest point ends within the clear angle (REST_CLEAR_DEG, or seamClearDeg(R) from the view) of a seam (spoke) is nudged into the slice it landed in, so the pointer never sits
// on a line; a slice narrower than 2 x the clear angle rests at its centre. The stored stop (t, phi, e, sliceId) is never touched.
// QA (V3 D5, V1 L3): the gap is seen from the DRAWN seam, not the seam's centre line. At the result the landed slice lights a gold band
// bd < SEAM_LINE_PX canvas px each side of its seams (wheel-view draw()), which at the rim eats asin(px / R) of the angle (about 2 deg on a
// R 74 px wheel, about 4 deg on the smallest). So the clear angle is SEAM_CLEAR_DEG of visible gap past that band: seamClearDeg(R).
export const SEAM_CLEAR_DEG = 3;
export const SEAM_LINE_PX = 2.6;
export const SEAM_REF_R = 74; // canvas px radius of a typical phone wheel (css 300 at 2 css px per canvas px), used when the view gives no radius
const DEG = 180 / Math.PI;
/** Clear angle (deg) from a seam's centre line for a wheel of canvas radius rPx: SEAM_CLEAR_DEG of gap past the drawn seam band. @param {number} [rPx] */
export const seamClearDeg = (rPx = SEAM_REF_R) => SEAM_CLEAR_DEG + DEG * Math.asin(Math.min(1, SEAM_LINE_PX / (+rPx > SEAM_LINE_PX ? +rPx : SEAM_LINE_PX)));
/** Default clear angle of restPos / restNudge (about 5 deg): seamClearDeg(SEAM_REF_R). */
export const REST_CLEAR_DEG = seamClearDeg(SEAM_REF_R);
const modC = (x, C) => ((x % C) + C) % C;

/** Slice edges of a ring (cum[0] = 0, cum[N] = total). @param {{w:number}[]} ring */
export const ringEdges = (ring) => ring.reduce((a, s) => (a.push(a[a.length - 1] + +s.w), a), [0]);

/**
 * Display rest position (units, same unwrapped turn as `end`) for a stop landed in slice idx. cum = slice edges (cum[N] = C).
 * Inside idx: clamped to >= clearDeg from both seams (slice narrower than 2 x clearDeg: its centre). `end` outside idx (an older store steered
 * the ease to its own slice): the centre of idx, by the shortest way. Pure; sliceIndexAt(cum, C, restPos(..)) === idx always.
 * @param {number[]} cum @param {number} end @param {number} idx @param {number} [clearDeg]
 */
export function restPos(cum, end, idx, clearDeg = REST_CLEAR_DEG) {
  const N = cum.length - 1, C = cum[N];
  if (!(N > 0) || !(C > 0) || !Number.isFinite(end)) return end;
  const i = Math.max(0, Math.min(N - 1, Math.round(+idx) || 0)), a = cum[i], w = cum[i + 1] - a, m = (Math.max(0, +clearDeg || 0) * C) / 360;
  const d = modC(end - a, C); // offset into slice i (0..C)
  let want;
  if (w < 2 * m) want = w / 2;
  else if (d < w) want = Math.min(w - m, Math.max(m, d));
  else want = w / 2;
  let delta = want - d;
  if (d >= w) { delta = modC(delta, C); if (delta > C / 2) delta -= C; } // outside: the shortest way to the centre
  return end + delta;
}

/** The nudge (units) to add to a rest position `end`: restPos(cum, end, idx) - end. 0 when already clear. @param {number[]} cum @param {number} end @param {number} idx @param {number} [clearDeg] */
export const restNudge = (cum, end, idx, clearDeg = REST_CLEAR_DEG) => restPos(cum, end, idx, clearDeg) - end;

// ---- Tree widening on ring rows (SPEC 11a/11b, T8): Widener / Pep Voice / Coin Weight widths and the Extra Gold piece. Pure.
/**
 * Fit a ring back to RING_TOTAL after some rows were widened or inserted. `fixed(row, i)` marks the rows that keep their own width
 * (clamped at max of the rim, never re-split); every other row shrinks pro rata (SPEC 11b: the extra width comes off the other pieces).
 * The shrink is bounded like widen(): other rows keep at least MIN_KEEP of their width, else the fixed rows are scaled back.
 * Ids re-numbered in ring order. @param {any[]} rows @param {(r:any, i:number) => boolean} fixed @param {number} [max]
 */
export function fitRing(rows, fixed, max = SLICE_WIDEN_MAX) {
  const ceil = max * RING_TOTAL, isF = rows.map((r, i) => !!fixed(r, i));
  const want = rows.map((r, i) => (isF[i] ? Math.min(ceil, Math.max(0, +r.w || 0)) : r.w));
  const F = want.reduce((a, w, i) => a + (isF[i] ? w : 0), 0), O = want.reduce((a, w, i) => a + (isF[i] ? 0 : w), 0);
  if (!(O > 0)) return Object.freeze(reId(rows));
  let k = (RING_TOTAL - F) / O, g = 1;
  if (k < MIN_KEEP) { k = MIN_KEEP; g = (RING_TOTAL - MIN_KEEP * O) / F; }
  return Object.freeze(reId(rows.map((r, i) => ({ ...r, w: isF[i] ? want[i] * g : r.w * k }))));
}

/**
 * Where an Extra Gold piece goes (SPEC 11a, sim rule): the seam farthest round the ring from the centre of the first gold row, among seams
 * with no gold row on either side (so it never sits next to gold). Returns b: insert before row b (b = ring.length = after the last row,
 * next to row 0 across the wrap). A near tie (1e-9) keeps the first seam clockwise. -1 when the ring has no gold row. @param {{w:number,gold?:boolean}[]} ring
 */
export function extraGoldAt(ring) {
  const n = ring.length, g = ring.findIndex((r) => r.gold); if (g < 0 || n < 2) return -1;
  const cum = ringEdges(ring), C = cum[n], centre = cum[g] + ring[g].w / 2;
  const seams = []; for (let b = 1; b <= n; b++) if (!ring[b - 1].gold && !ring[b % n].gold) seams.push(b);
  const pool = seams.length ? seams : Array.from({ length: n }, (_, i) => i + 1);
  let best = pool[0], bd = -1;
  for (const b of pool) { const dx = Math.abs(cum[b] - centre), d = Math.min(dx, C - dx); if (d > bd + 1e-9) { bd = d; best = b; } }
  return best;
}
