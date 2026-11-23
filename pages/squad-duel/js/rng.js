(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // mulberry32, identical to bot.js mulberry32. `a` is the live state.
  function make(seed) {
    let a = seed >>> 0;
    const R = {
      next() {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      int(n) { return Math.floor(R.next() * n); },
      d6() { return 1 + Math.floor(R.next() * 6); },
      // exactly bot.js shuffle5
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(R.next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      pick(arr) { return arr[Math.floor(R.next() * arr.length)]; },
      state() { return a >>> 0; },
      clone() { return make(a >>> 0); }
    };
    return R;
  }

  // FNV-1a 32-bit over String(parts.join('|')), UTF-8 bytes.
  function hash(...parts) {
    const s = String(parts.join('|'));
    let h = 0x811C9DC5;
    // admin default: hash UTF-8 bytes (identical to char codes for ASCII)
    const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Array.from(s, (c) => c.charCodeAt(0) & 255);
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  SD.rng = {
    make,
    hash,
    matchSeed(gameSeed, matchNo) { return hash(gameSeed, 'match', matchNo); },
    pullSeed(gameSeed, pullNo) { return hash(gameSeed, 'pull', pullNo); },
    newGameSeed() { return (Date.now() >>> 0); } // admin default: low 32 bits of Date.now()
  };
})();
