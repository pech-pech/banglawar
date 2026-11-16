// T2 full-tree sim: Spotlight and Course at the full Workshop tree, tokens on, avg careful tapper (SPEC 11c).
// The Spotlight / Course spins, tree, booster, Hot Streak, Second Opinion, Kind Floor and tokens are the GAME core
// (metaWheel, spinResult careful tap, afterResult, useToken). The season and the token pool follow sim/gaps_sim.py season_sim:
// 10 match days (Spotlight, Hype, Toss, Pep), Course 1.33 a season, Find 6, Scout 1, Finals 0.6; one shared pool of 7 tokens
// (respin 3, nudge 1, two 1, wild 1, lift 1); 2 a season a wheel (Hype 1, Course none), 1 a match day across Hype / Toss / Pep,
// 1 a spin on Scout / Finals. The six other wheels only compete for the pool: their landings are the design sim's own exact
// odds at the full tree (tools/t2-fulltree-packs.json, from gaps_sim.pack_all), spent by the sim's rules. Reports, never tunes.
// Run: node tools/t2-fulltree.mjs [spins=20000] [seed=7]   (runs seasons until Course has `spins` spins; Spotlight gets about 7.5x that)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FLAGS } from '../js/data/flags.js';
import { NODES } from '../js/data/wheelmeta.js';
import { makeRng } from '../js/core/rng.js';
import { wheelSlices, courseWheel, spinResult } from '../js/core/training.js';
import { metaOf, metaWheel, afterResult, seasonTokens, tokenOptions, useToken } from '../js/core/wheelmeta.js';

const PACKS = JSON.parse(readFileSync(new URL('./t2-fulltree-packs.json', import.meta.url), 'utf8'));
// gaps_sim TT: LINE (re-spin below), LIFT ([bonus choices], cap), SPINS (lift waits until spin round(SPINS) of the season)
const LINE = { spot: 2.0, course: 2 };
const LIFT = { course: 3, spot: 5, hype: [[0, 1, 1, 2], 6], toss: [[0, 1], 4], pep: [[0, 2.5], 7.5], scout: [[0, 1], 1], finals: [[0, 5, 10], 30] };
const WAIT = { spot: 9, course: 0, hype: 9, toss: 9, pep: 9, scout: 0, finals: 0 };
const CAP = { spot: 2, course: null, hype: 1, toss: 2, pep: 2, find: 2, scout: 2, finals: 2 }; // SPEC 11: Hype 1 a season
const MATCH = ['hype', 'toss', 'pep'], SPIN1 = ['scout', 'finals'];
const BOOST_CH = 0.6, BOOST_VAL = 3;

/** The full power tree (every Control / Fortune / Specialist node at max rank), Workshop on. */
export function fullTree(opts = {}) {
  const s = { v: 7, seed: 'ft', season: { n: 0 }, wheelMeta: { tally: 600, spokes: 0, spent: 0, owned: {}, tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 }, tokSeason: 0, spotTokensUsed: 0, streak: 0, tierSeen: 0, tierUpQueue: [], swapDone: {}, tokUsed: {}, matchTokUsed: { key: '', n: 0 } }, wheelCraft: { owned: {} } };
  for (const n of NODES) if (n.branch !== 'craft' && !(opts.drop || []).includes(n.id)) s.wheelMeta.owned[n.id] = n.max_rank;
  return s;
}

/** One run. Returns per wheel {mean, gold, n, tok (tokens a season)}. opts.drop = node ids left out (e.g. ['f_floor']). */
export function run(spins = 20000, seed = 7, opts = {}) {
  const was = FLAGS.wheelMeta; FLAGS.wheelMeta = true;
  try {
    const u = makeRng(`t2-fulltree|${seed}`), R = () => u.random();
    const pickOf = (a) => a[Math.floor(R() * a.length)];
    let s = fullTree(opts);
    const stat = Object.fromEntries(['spot', 'course', ...Object.keys(CAP).filter((w) => PACKS[w])].map((w) => [w, { v: 0, n: 0, g: 0, tok: 0 }]));
    const pool = () => metaOf(s).tokens;
    let seasons = 0;
    while (stat.course.n < spins) {
      seasons += 1; s = structuredClone(s); s.season.n = seasons; s = seasonTokens(s);
      const used = {}, cnt = {}; let sec = 0;
      const fw = new Set(); while (fw.size < 6) fw.add(Math.floor(R() * 10));
      const cw = [Math.floor(R() * 10)]; if (R() < 0.33) cw.push(Math.floor(R() * 10));
      for (let w = 0; w < 10; w++) {
        let matchUsed = 0; const seq = [];
        if (R() < 0.995) seq.push('spot', 'hype', 'toss', 'pep');
        for (const x of cw) if (x === w) seq.push('course');
        if (fw.has(w)) seq.push('find');
        if (w === 0) seq.push('scout');
        if (w === 9 && R() < 0.6) seq.push('finals');
        for (const name of seq) {
          cnt[name] = (cnt[name] || 0) + 1; const c = cnt[name];
          if (name === 'spot' || name === 'course') { spinCore(name, c); continue; }
          // ---- a rival wheel: gaps_sim season_sim, verbatim rules
          const K = PACKS[name], capw = CAP[name]; let spinTok = 0;
          const can = () => !(capw != null && (used[name] | 0) >= capw) && !(MATCH.includes(name) && matchUsed >= 1) && !(SPIN1.includes(name) && spinTok >= 1);
          const use = (k) => { s.wheelMeta.tokens[k] -= 1; used[name] = (used[name] | 0) + 1; spinTok += 1; stat[name].tok += 1; if (MATCH.includes(name)) matchUsed += 1; };
          const draw = () => {
            let x = R(), i = 0; while (i < K.pr.length - 1 && x >= K.pr[i]) { x -= K.pr[i]; i += 1; }
            let v = K.v[i];
            if (name !== 'find' && R() < BOOST_CH && K.ng.length && pickOf(K.ng) === i) v += BOOST_VAL * K.unit;
            return [i, v];
          };
          const two = pool().two > 0 && can() && c === 1; if (two) use('two');
          let [i, v] = draw();
          if (two) { const [i2, v2] = draw(); if (v2 > v) [i, v] = [i2, v2]; }
          if (name === 'find' && K.cheer[i] && sec < 1) { sec += 1; const [i2, v2] = draw(); if (v2 > v) [i, v] = [i2, v2]; }
          if (v < K.line && can()) {
            const k = pool().respin > 0 ? 'respin' : pool().wild > 0 ? 'wild' : null;
            if (k) { use(k); const [i2, v2] = draw(); if (v2 > v) [i, v] = [i2, v2]; }
            else if (pool().nudge > 0 && name !== 'find') {
              const L = K.v.length, nb = (name === 'hype' ? [i - 1, i + 1].filter((j) => j >= 0 && j < L) : [(i - 1 + L) % L, (i + 1) % L]).filter((j) => !K.gold[j]);
              if (nb.length) { const b = nb.reduce((a, j) => (K.v[j] > K.v[a] ? j : a), nb[0]); if (K.v[b] > v) { use('nudge'); i = b; v = K.v[b]; } }
            }
          }
          const g = K.gold[i];
          if (LIFT[name] && pool().lift > 0 && can() && !g) { const [ch, capv] = LIFT[name]; if (v < capv && c - 1 >= WAIT[name]) { use('lift'); v = Math.min(v + pickOf(ch), capv); } }
          const r = stat[name]; r.v += v; r.n += 1; r.g += g ? 1 : 0;
        }
      }
    }
    // ---- Spotlight / Course: the game core
    function spinCore(id, c) {
      const wheel = metaWheel(id === 'spot' ? wheelSlices('normal') : courseWheel(), id, s);
      const capOk = () => CAP[id] == null || ((metaOf(s).tokUsed || {})[id] | 0) < CAP[id];
      const two = pool().two > 0 && capOk() && (id === 'course' || c === 1);
      const a = afterResult(s, id, spinResult(u, wheel, true), u, { wheel }); s = a.s; let p = { ...a.result, wheel };
      const has = (k) => tokenOptions(s, id, p).some((o) => o.kind === k);
      const use = (k) => { const q = useToken(s, id, k, p, u); if (q.s !== s) stat[id].tok += 1; s = q.s; p = q.pending; };
      if (two) { if (has('two')) use('two'); else { s = structuredClone(s); const m = s.wheelMeta; m.tokens.two -= 1; m.tokUsed[id] = (m.tokUsed[id] | 0) + 1; if (id === 'spot') m.spotTokensUsed += 1; stat[id].tok += 1; } } // blind commit (the sim spends it before the spin)
      if (p.gain < LINE[id] && capOk()) { if (pool().respin > 0 || pool().wild > 0) { if (has('respin')) use('respin'); } else if (pool().nudge > 0 && has('nudge')) use('nudge'); }
      if (!p.jackpot && pool().lift > 0 && capOk() && p.gain < LIFT[id] && c - 1 >= WAIT[id] && has('lift')) use('lift');
      const r = stat[id]; r.v += p.gain; r.n += 1; r.g += p.jackpot ? 1 : 0;
    }
    return Object.fromEntries(Object.entries(stat).map(([w, r]) => [w, { mean: r.v / Math.max(1, r.n), gold: r.g / Math.max(1, r.n), n: r.n, tok: r.tok / seasons }]));
  } finally { FLAGS.wheelMeta = was; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const nums = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const spins = nums[0] || 20000, seed = nums[1] || 7, f = (x, d = 3) => x.toFixed(d);
  const ref = PACKS._ref;
  console.log(`t2-fulltree: avg careful, full tree, tokens on, Course spins ${spins}, seed ${seed}. SPEC 11c: Spotlight 2.60x (2.52x without Kind Floor), Course 3.76 (75% gold)`);
  console.log(`design sim (gaps_sim, 20000 seasons): spot ${f(ref.spot.mean)} gold ${f(100 * ref.spot.gold, 1)}% | no floor ${f(ref.spotNoFloor.mean)} | course ${f(ref.course.mean)} gold ${f(100 * ref.course.gold, 1)}%`);
  for (const [lab, o] of [['full tree', {}], ['full tree, no Kind Floor', { drop: ['f_floor'] }]]) {
    const r = run(spins, seed, o);
    console.log(`${lab.padEnd(26)} spot ${f(r.spot.mean)} gold ${f(100 * r.spot.gold, 1)}% (n ${r.spot.n}, tok ${f(r.spot.tok, 2)}) | course ${f(r.course.mean)} gold ${f(100 * r.course.gold, 1)}% (n ${r.course.n}, tok ${f(r.course.tok, 2)})`);
  }
}
