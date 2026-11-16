// Ring helpers (CONTRACT-A sec 2/5, SPEC 2f/11b, test 6). Pure, no DOM, no RNG.
// A ring is an array of slice rows {id, w, value, label, tier, gold}; w in rim units, sum 10.000.
import { WHEEL_ENGINE } from '../data/wheel-engine.js';

export const SLICE_MAX_P = WHEEL_ENGINE.SLICE_MAX_P;
export const SLICE_WIDEN_MAX = WHEEL_ENGINE.SLICE_WIDEN_MAX;
export const RING_TOTAL = 10;
export const SUM_TOL = 0.001;
const EPS = 1e-9;

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
// opts.allowEqual: true, or a (a, b, i) => bool allowlist for SPEC test 6 exception rings.
export function checkRing(ring, opts = {}) {
  const cap = opts.cap ?? SLICE_MAX_P;
  const allow = opts.allowEqual;
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

// Widen the given slices by `by` (share of the ring, e.g. 0.01), each clamped at max of the ring.
// A widened slice is never re-split; the other slices shrink pro rata so the total is kept.
export function widen(ring, sliceIds, by, max = SLICE_WIDEN_MAX) {
  const T = total(ring);
  const ids = new Set(sliceIds);
  const ceil = max * T;
  let grown = 0, others = 0;
  const w = ring.map((s, i) => {
    if (ids.has(i)) { const v = Math.max(s.w, Math.min(ceil, s.w + by * T)); grown += v; return v; }
    others += s.w; return s.w;
  });
  const k = others > 0 ? (T - grown) / others : 1;
  return Object.freeze(ring.map((s, i) => Object.freeze({ ...s, w: ids.has(i) ? w[i] : s.w * k })));
}
