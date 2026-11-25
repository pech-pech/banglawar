// Windward Line - seeded RNG (mulberry32). Pure, deterministic.
function hash32(a, label) {
  // FNV-1a over seed bytes + label chars, 32-bit
  let h = 0x811c9dc5;
  a = a >>> 0;
  for (let i = 0; i < 4; i++) { h ^= (a >>> (i * 8)) & 255; h = Math.imul(h, 0x01000193); }
  const s = String(label);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 255; h = Math.imul(h, 0x01000193); h ^= s.charCodeAt(i) >>> 8; h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

export function makeRng(seed) {
  const s0 = (seed | 0) >>> 0;
  let a = s0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    chance: (p) => next() < p,
    // fork derives from the ORIGINAL seed + label, so it never depends on parent's advance
    fork: (label) => makeRng(hash32(s0, label)),
  };
}
