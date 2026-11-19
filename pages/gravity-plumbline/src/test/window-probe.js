// window-probe.js: LOOSEST-route timing windows per template (the old shaft-robust.js only probed the fastest route).
// For each template x {unmirrored, mirrored} x crusher phases (5 seeds if the room has a crusher, else 1):
//   1. beam search (shaft-check.js) collecting ALL winning logs of the first winning input-count level;
//   2. keep up to 24 distinct candidates (spread over input signatures);
//   3. delay every input by a lead-in (48 ticks; 288 = one crusher period for crusher rooms, so crusher phase is unchanged)
//      so the first input is not clipped at tick 0 (a human has no "tick 0" deadline);
//   4. centre each input in its own window (coordinate ascent, 6 rounds);
//   5. window of input i = contiguous winning ticks when ONLY input i is shifted (+-30 ticks probed, cap 61).
// Result per variant = the candidate with the largest min window. Template result = worst variant.
// 120 ticks/s: 12 ticks = 100 ms, 8 ticks = 67 ms.
// Usage: node window-probe.js [ids...]  (env SEEDS=1,2,3 overrides crusher seeds)
process.env.PROBE = '1';
const sc = require('./shaft-check.js');
const { search, PL } = sc;
const CAP = 30;
const BANDS = { 1: 12, 2: 12, 3: 8 };

const wins = (room, log) => {
  const r = PL.replay(room, log.slice().sort((a, b) => a.tick - b.tick));
  return r.state.won && !r.state.dead;
};
// Snapshot every 6 ticks of the base run so a one-input shift only re-simulates from just before that input.
function snapshots(room, log) {
  const L = log.slice().sort((a, b) => a.tick - b.tick), snaps = [];
  const s = PL.newState(room);
  let i = 0;
  const end = (L.length ? L[L.length - 1].tick : 0) + 600;
  while (s.t < end && !s.won && !s.dead) {
    if (s.t % 6 === 0) snaps.push(sc.clone(s));
    const inp = [];
    while (i < L.length && L[i].tick <= s.t) { inp.push({ k: L[i].k, dir: L[i].dir }); i++; }
    PL.step(s, inp);
  }
  return snaps;
}
function winsShift(room, log, snaps, i, nt) {
  const minT = Math.min(log[i].tick, nt);
  let sn = snaps[0];
  for (const q of snaps) { if (q.t <= minT) sn = q; else break; }
  const s = sc.clone(sn);
  const L = log.map((x, j) => (j === i ? { ...x, tick: nt } : x)).sort((a, b) => a.tick - b.tick);
  const end = L[L.length - 1].tick + 600;
  let k = 0;
  while (k < L.length && L[k].tick < s.t) k++;
  while (s.t < end && !s.won && !s.dead) {
    const inp = [];
    while (k < L.length && L[k].tick <= s.t) { inp.push({ k: L[k].k, dir: L[k].dir }); k++; }
    PL.step(s, inp);
  }
  return s.won && !s.dead;
}
function windowOf(room, log, i, snaps = snapshots(room, log)) {
  let lo = 0, hi = 0;
  for (let d = 1; d <= CAP; d++) {
    const t = log[i].tick - d;
    if (t < 0) break;
    if (winsShift(room, log, snaps, i, t)) lo = d; else break;
  }
  for (let d = 1; d <= CAP; d++) {
    if (winsShift(room, log, snaps, i, log[i].tick + d)) hi = d; else break;
  }
  return { lo, hi, w: lo + hi + 1 };
}
function windows(room, log) { const sn = snapshots(room, log); return log.map((_, i) => windowOf(room, log, i, sn).w); }
function centre(room, log0, rounds = 6) {
  let log = log0.map((e) => ({ ...e }));
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < log.length; i++) {
      const { lo, hi } = windowOf(room, log, i);
      const sh = Math.floor((hi - lo) / 2);
      if (sh) { log[i].tick += sh; moved = true; }
    }
    if (!moved) break;
  }
  return log;
}
const sig = (c) => c.log.map((e) => (e.k === 'dive' ? 'D' : 'f' + e.dir)).join('');
function pickCandidates(all, max = 24) {
  const by = new Map();
  for (const c of all) { const k = sig(c); if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
  const out = [];
  const lists = [...by.values()].map((l) => l.sort((a, b) => a.t - b.t));
  for (const pos of [0, 1, 2]) // round 0 fastest of each signature, 1 slowest, 2 middle
    for (const l of lists) {
      const c = pos === 0 ? l[0] : pos === 1 ? l[l.length - 1] : l[l.length >> 1];
      if (c && !out.includes(c) && out.length < max) out.push(c);
    }
  return out;
}
// Signature-guided timing search (used for crusher rooms, where the generic beam drowns in waiting branches).
// sig = array of actions (0-3 = flip dir, 'D' = dive). Explores every wait (3-tick slots) before each input,
// dedupes on the state modulo the crusher period (288 ticks); returns ALL winning logs (capped, stride-sampled per level).
const SLOT = 3, PERIOD = 288;
const ACT = (a) => (a === 'D' ? { k: 'dive' } : { k: 'flip', dir: a });
function guided(room, sig, { maxWait = 300, levelCap = 600, win = 300 } = {}) {
  const hasCr = room.crushers.length > 0;
  const key = (s, k) => {
    const r = (v, q) => Math.round(v / q);
    return [k, r(s.x, 3), r(s.y, 3), r(s.vx, 30), r(s.vy, 30), s.g, s.charges, s.grounded ? 1 : 0, s.diveCd > 0 ? 1 : 0, s.pending ? 1 : 0,
      hasCr ? r(s.t % PERIOD, SLOT) : '', s.crumbleS.map((c) => c.st + ':' + (c.timer > 0 ? 1 : 0)).join('')].join(',');
  };
  let level = [{ s: PL.newState(room), log: [] }];
  const winners = [];
  for (let k = 0; k < sig.length; k++) {
    const a = ACT(sig[k]);
    const next = [], seen = new Set();
    for (const nd of level) {
      if (winners.length >= 800) return winners;
      let s = nd.s;
      for (let w = 0; w * SLOT <= maxWait; w++) {
        const c = sc.clone(s), t0 = c.t;
        if (!(a.k === 'flip' && a.dir === c.g)) {
          PL.step(c, [a]);
          let ok = c.dead === 0;
          for (let i = 1; i < SLOT && ok && !c.won; i++) { PL.step(c, []); if (c.dead > 0) ok = false; }
          if (ok) {
            const log = nd.log.concat([{ tick: t0, k: a.k, dir: a.dir }]);
            if (c.won) winners.push({ log, t: c.t, n: k + 1 });
            else if (k === sig.length - 1) {
              const kk = key(c, k + 1);
              if (!seen.has(kk)) {
                seen.add(kk);
                for (let i = 0; i < win && !c.won && !c.dead; i++) PL.step(c, []);
                if (c.won && !c.dead) winners.push({ log, t: c.t, n: k + 1 });
              }
            } else {
              const kk = key(c, k + 1);
              if (!seen.has(kk)) { seen.add(kk); next.push({ s: c, log }); }
            }
          }
        }
        const d = sc.clone(s); let ok2 = true;
        for (let i = 0; i < SLOT; i++) { PL.step(d, []); if (d.dead > 0) { ok2 = false; break; } if (d.won) break; }
        if (!ok2 || d.won) break;
        s = d;
      }
    }
    if (next.length > levelCap) { const st = next.length / levelCap, o = []; for (let i = 0; i < levelCap; i++) o.push(next[Math.floor(i * st)]); next.length = 0; next.push(...o); }
    level = next;
    if (!level.length) break;
  }
  return winners;
}
// Intended / found signatures per crusher template (unmirrored; mirrored rooms swap flip 1<->3).
const SIGS = {
  t03: [[1, 2, 3], [1, 2, 3, 0]],
  t11: [[1, 2], [1, 2, 0], [1, 2, 'D']],
  t12: [[2, 1, 2], [2, 1, 2, 3]],
  t13: [[1, 2, 3, 0], [1, 2, 3, 2, 3], [1, 2, 3]],
  t16: [[1, 2, 3, 2], [1, 2, 3, 2, 3]],
  t19: [[1, 2, 3], [1, 2, 3, 0], [1, 3, 2, 0]],
};
const swapDir = (a) => (a === 1 ? 3 : a === 3 ? 1 : a);
function fromGuided(room) {
  const sigs = (SIGS[room.templateId] || []).map((sg) => (room.mirrored ? sg.map(swapDir) : sg));
  const all = [];
  for (const sg of sigs) all.push(...guided(room, sg));
  return all;
}

const crypto = require('crypto'), fsx = require('fs');
let CACHE = null;
function cacheGet(room) {
  if (!process.env.ROUTECACHE) return undefined;
  if (!CACHE) { try { CACHE = JSON.parse(fsx.readFileSync(process.env.ROUTECACHE, 'utf8')); } catch (e) { CACHE = {}; } }
  return CACHE[crypto.createHash('md5').update(JSON.stringify(room)).digest('hex')];
}
function cachePut(room, v) {
  if (!process.env.ROUTECACHE) return;
  cacheGet(room);
  CACHE[crypto.createHash('md5').update(JSON.stringify(room)).digest('hex')] = v;
  fsx.writeFileSync(process.env.ROUTECACHE, JSON.stringify(CACHE));
}
function bestRoute(room, o) { // optional disk cache (env ROUTECACHE=file) keyed by the exact room geometry
  const c = cacheGet(room);
  if (c !== undefined) return c;
  const b = bestRoute0(room, o);
  cachePut(room, b);
  return b;
}
function bestRoute0(room, { maxCand = 24 } = {}) {
  const all = [];
  let r = null;
  if (room.crushers.length && SIGS[room.templateId]) {
    all.push(...fromGuided(room));
    if (all.length) r = all.slice().sort((a, b) => a.t - b.t)[0];
  }
  if (!r) { r = search(room, { collect: all }); }
  if (!r) { all.length = 0; r = search(room, { fm: 24, collect: all }); }
  if (!r) return null;
  const lead = room.crushers.length ? PERIOD : 48;
  let best = null;
  for (const c of pickCandidates(all, room.crushers.length ? Math.min(maxCand, 10) : maxCand)) {
    const full = c.log.map((e) => ({ tick: e.tick + lead, k: e.k, dir: e.dir }));
    if (!wins(room, full)) continue;
    let pruned = full;
    for (let i = pruned.length - 1; i >= 0; i--) { // drop inputs the route does not need
      const l2 = pruned.filter((_, j) => j !== i);
      if (l2.length && wins(room, l2)) pruned = l2;
    }
    // a recovery input (e.g. slide back into the exit) can widen earlier windows: score pruned AND full routes
    for (const base of pruned.length === full.length ? [full] : [pruned, full]) {
      const log = centre(room, base);
      const w = windows(room, log);
      const score = Math.min(...w) * 1000 - log.length * 100 + w.reduce((a, b) => a + Math.min(b, 40), 0) / 10;
      if (!best || score > best.score) best = { log, w, score, min: Math.min(...w), n: log.length, t: c.t + lead, fast: r };
    }
  }
  return best;
}
function variants(tpl) {
  const cr = tpl.make(PL.mulberry32(1)).crushers.length > 0;
  const seeds = process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : cr ? [1, 2, 3, 4, 5] : [1];
  const out = [];
  for (const mir of [0, 1]) for (const sd of seeds) {
    let room = tpl.make(PL.mulberry32(sd * 7919 + 13));
    if (mir) room = PL.mirrorRoom(room);
    room.templateId = tpl.id;
    out.push({ mir, sd, room });
  }
  return out;
}
// Routes for every variant. A non-crusher room's mirrored variant is the exact mirror image of the unmirrored one, so the
// mirrored variant also gets the unmirrored best route with flips 1<->3 swapped (the beam search is not symmetric).
function routesFor(tpl) {
  const vs = variants(tpl);
  const raw = vs.map((v) => ({ v, b: bestRoute(v.room) }));
  if (vs[0] && !vs[0].room.crushers.length) {
    const ev = (room, log) => (wins(room, log) ? windows(room, log) : null);
    const swap = (log) => log.map((e) => ({ tick: e.tick, k: e.k, dir: e.k === 'flip' ? swapDir(e.dir) : e.dir }));
    const [U, M] = raw;
    if (U && M && U.b && M.b && U.b.min !== M.b.min) {
      const hi = U.b.min > M.b.min ? U : M, lo = hi === U ? M : U;
      const log = swap(hi.b.log), w = ev(lo.v.room, log);
      if (w && Math.min(...w) > lo.b.min) lo.b = { ...hi.b, log, w, min: Math.min(...w), n: log.length };
    }
  }
  return raw;
}
const fmt = (log) => log.map((e) => e.tick + ':' + (e.k === 'dive' ? 'D' : 'f' + e.dir)).join(' ');
module.exports = { routesFor, guided, PL, bestRoute, variants, windows, wins, BANDS, fmt, search };

if (require.main === module) {
  const only = process.argv.slice(2);
  const sum = [];
  for (const t of PL.TEMPLATES) {
    if (only.length && !only.includes(t.id)) continue;
    let worst = null, nf = 0;
    for (const { v, b } of routesFor(t)) {
      if (!b) { nf++; console.log(t.id, v.mir ? 'M' : 'U', 's' + v.sd, 'NOT FOUND'); continue; }
      console.log(t.id, v.mir ? 'M' : 'U', 's' + v.sd, `n=${b.n} min=${b.min}t (${(b.min * 1000 / 120).toFixed(0)}ms) w=${b.w.join(',')} log=${fmt(b.log)}`);
      if (!worst || b.min < worst.min) worst = { min: b.min, w: b.w, v };
    }
    const band = BANDS[t.tier] || 12;
    sum.push(`${t.id} tier${t.tier} worst-variant min window ${worst ? worst.min : '-'}t band ${band}t ${nf ? 'UNSOLVED variants ' + nf : worst && worst.min >= band ? 'PASS' : 'MISS'}`);
  }
  console.log('\nSUMMARY\n' + sum.join('\n'));
}
