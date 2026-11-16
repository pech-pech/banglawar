// Find tie-rule aimer (SPEC 5 [D], test 2b). Pure. Used by the sim aimer, tutorial ghost, hints; never changes a player's tap.
// 1 predict each FIND block's arrival at the AIM; 2 target = nearest arrival to the 3.5 s glow centre;
// 3 blocks within FIND_TIE_EPS of that are tied; 4 tie -> WIDER block, then FIRST clockwise from the pointer.
// Blocks under FIND_AIM_MIN_W (0.3 unit) are never targets. Target is chosen once per spin (call once, keep the id).
export const FIND_TIE_EPS = 0.05;
export const FIND_AIM_MIN_W = 0.3;
export const FIND_GLOW_CENTER = 3.5;
const CIRC = 10, EQ = 1e-9;

// Fallback pulse tick (CONTRACT-A sec 3, W0 36, D 2), used only when no tick fn is injected (T1's wheel-pulse.js not landed).
const W0 = 36, D = 2, E38 = Math.exp(-3.8 / 3), W38 = W0 * E38;
const pulseW = (t) => { if (t < 3.8) return W0 * Math.exp(-t / 3); const x = (t - 3.8) / 2.2; return W38 + (W0 - W38) * x * x * (3 - 2 * x); };
const pulseArc = (t) => { if (t < 3.8) return W0 * 3 * (1 - Math.exp(-t / 3)); const x = (t - 3.8) / 2.2, u = t - 3.8; return W0 * 3 * (1 - E38) + W38 * u + (W0 - W38) * 2.2 * (x ** 3 - x ** 4 / 2); };
export const ARC_PER_CYCLE_FALLBACK = W0 * 3 * (1 - E38) + 2.2 * (W38 + (W0 - W38) / 2);
export const tickFallback = (e) => { const k = Math.floor(e / 6), t = e - 6 * k; return k * ARC_PER_CYCLE_FALLBACK + pulseArc(t) + pulseW(t) * D / 3; };

// Starts (rim units from the pointer, clockwise) of each ring row.
export const blockStarts = (ring) => { let a = 0; return ring.map((r) => { const s = a; a += r.w; return s; }); };

// Arrival time (s) of a block's centre at the AIM, the crossing nearest `center` s. phi = ring offset at SPIN (units).
// tick = injected elapsed->units (monotonic); default fallback. Position at the pointer = (phi + tick(t)) mod 10.
export function arrivalNear(ring, id, phi = 0, tick = tickFallback, center = FIND_GLOW_CENTER) {
  const starts = blockStarts(ring), c = starts[id] + ring[id].w / 2, u = phi + tick(center);
  // candidate arrival values on the unwrapped axis just below and above the position at `center`
  const k = Math.floor((u - c) / CIRC), best = [];
  for (const v of [c + k * CIRC, c + (k + 1) * CIRC]) {
    let lo = 0, hi = 60; // tick(e) rises through every value past phi once the wheel is moving (60 s covers the 10-unit ring many times)
    if (v - phi < tick(0)) { best.push(0); continue; }
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (phi + tick(m) < v) lo = m; else hi = m; }
    best.push((lo + hi) / 2);
  }
  return best.reduce((a, b) => (Math.abs(b - center) < Math.abs(a - center) ? b : a));
}

// Pick the target block id, or -1 when no FIND block is eligible.
// arrivalOf(id) -> seconds (injected, so it works before T1's pulse module); phi = ring offset, for "first clockwise from pointer".
export function findAimTarget(ring, arrivalOf, { phi = 0, eps = FIND_TIE_EPS, minW = FIND_AIM_MIN_W, center = FIND_GLOW_CENTER } = {}) {
  const starts = blockStarts(ring);
  const c = ring.filter((r) => r.gold && r.w >= minW).map((r) => ({ id: r.id, w: r.w, d: Math.abs(arrivalOf(r.id) - center), cw: (((starts[r.id] - phi) % CIRC) + CIRC) % CIRC }));
  if (!c.length) return -1;
  const dMin = Math.min(...c.map((x) => x.d));
  const tied = c.filter((x) => x.d <= dMin + eps);
  tied.sort((a, b) => (Math.abs(a.w - b.w) > EQ ? b.w - a.w : a.cw - b.cw));
  return tied[0].id;
}
