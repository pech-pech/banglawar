// Bot gate for Bad Trade Bazaar. node tools/bots.mjs [seeds=200] [runs=6] [--selftest] [--same] [--g2]
// --same: sameMarkets on (every run replays run 1 market). --g2: where the fixed run-1 seed sits vs random markets.
// Ports the 7 bots of sim-spare.js; drives core only through newRun/tick/buy/sell/endRun.
import * as C from '../core.js';
const { DEFAULTS, SCARS, newProfile, newRun, tick, buy, sell, sellPreview, canBuy, endRun, setSlot, protoCheck, report, mulberry32, hash } = C;

const args = process.argv.slice(2);
const nums = args.filter((a) => !a.startsWith('--')).map(Number);
const SEEDS = nums[0] || 200, RUNS = nums[1] || 6;
const SLOTS = DEFAULTS.slots, STACK = DEFAULTS.stackCap;
const RANK = [5, 4, 0, 2, 1, 3];
const P0 = DEFAULTS.base;
const scarType = (i, b, p) => i * 2 + ((b - p) / b >= DEFAULTS.lossLine ? 1 : 0);
const hasRoom = (coll, ty) => coll[ty] < STACK;
const wantType = (coll) => {
  let c = 0; const want = new Set();
  for (const ty of RANK) {
    let k = 0;
    while (c < SLOTS && k < STACK) { if (coll[ty] > k) { c++; k++; } else { want.add(ty); break; } }
    if (c >= SLOTS) break;
  }
  return want;
};
function pickBuild(profile) {
  const b = [], n = Array(6).fill(0), coll = profile.collection;
  for (const ty of RANK) while (b.length < SLOTS && n[ty] < Math.min(STACK, coll[ty])) { b.push(ty); n[ty]++; }
  b.forEach((ty, s) => setSlot(profile, s, ty, DEFAULTS));
  for (let s = b.length; s < SLOTS; s++) setSlot(profile, s, null, DEFAULTS);
}
const sk = (i, t, p, mk) => t < 165 && p < P0[i] * 0.93 && t >= 2 && p > mk[i][t - 2];
const peak = [0, 0, 0];
// strong: trend rider matched to M's no-scar play (btb-run1-s1: 146, 7 trades, 0 losses; M 149.4, 7, 0). Never sells below buy before the bell.
const strong = {
  buy: (i, t, p, mk) => { const ok = t >= 3 && t < 170 && p > mk[i][t - 3] * 1.04 && p > mk[i][t - 1]; if (ok) peak[i] = p; return ok; },
  sell: (i, t, p, pos) => { peak[i] = Math.max(peak[i], p); return p <= peak[i] * 0.97 && p >= pos.buyPrice; }
};
const bots = {
  strong,
  idle: { buy: () => false, sell: () => false },
  noLoss: { buy: (i, t, p, mk, r) => t < 150 && r() < 0.10, sell: (i, t, p, pos) => p >= pos.buyPrice * 1.03 },
  dump: { buy: (i, t) => t < 170, sell: (i, t, p, pos) => p < pos.buyPrice },
  farmer: { buy: (i, t) => t < 170, sell: () => true },
  human: { buy: (i, t, p, mk) => t >= 3 && t < 165 && p > mk[i][t - 3] * 1.01, sell: (i, t, p, pos) => p >= pos.buyPrice * 1.06 || p <= pos.buyPrice * 0.95 },
  skilled: { buy: sk, sell: (i, t, p, pos) => p >= P0[i] * 1.03 || p <= pos.buyPrice * 0.90 },
  skilledScars: {
    buy: sk,
    sell: (i, t, p, pos, mk, r, coll) => {
      if (p >= P0[i] * 1.03) return true;
      if (p <= pos.buyPrice * 0.90) return true;
      if (t < 150 && p < pos.buyPrice) {
        const ty = scarType(i, pos.buyPrice, p);
        if (wantType(coll).has(ty) && hasRoom(coll, ty)) { if (ty % 2 === 0) return t - pos.t >= 2; return true; }
      }
      if (t < 150 && p < pos.buyPrice * 0.97) { const ty = scarType(i, pos.buyPrice, p); if (wantType(coll).has(ty)) return true; }
      return false;
    }
  }
};

function playRun(profile, cfg, bot, botName) {
  pickBuild(profile);
  const s = newRun(profile, cfg);
  const r = mulberry32(hash(s.seed + ':bot:' + botName));
  const coll = profile.collection;
  while (!s.over) {
    const t = s.t;
    for (let i = 0; i < 3; i++) {
      const p = s.px[i][t];
      if (s.pos[i]) { if (bot.sell(i, t, p, s.pos[i], s.px, r, coll)) sell(s, i); }
      else if (bot.buy(i, t, p, s.px, r, coll)) buy(s, i);
    }
    tick(s);
  }
  return endRun(profile, s);
}

const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const f3 = (a) => `${q(a, .1).toFixed(0)}/${q(a, .5).toFixed(0)}/${q(a, .9).toFixed(0)}`;

function selftest() {
  let fails = 0;
  const ck = (ok, msg) => { if (!ok) { fails++; console.log('FAIL ' + msg); } };
  // 1) sellPreview == sell on 1000 random actions
  const rnd = mulberry32(12345);
  let n = 0, prof = newProfile('st');
  for (let g = 0; n < 1000; g++) {
    if (g % 3 === 0) { prof = newProfile('st' + g); prof.collection = [1, 1, 1, 1, 1, 1]; pickBuild(prof); }
    const s = newRun(prof, DEFAULTS);
    while (!s.over && n < 1000) {
      const i = Math.floor(rnd() * 3), a = rnd();
      if (s.pos[i] && a < 0.5) { const pv = sellPreview(s, i); const ev = sell(s, i); n++; ck(pv.pnl === ev.pnl && pv.loss === ev.loss && JSON.stringify(pv.scar) === JSON.stringify(ev.scar) && pv.perkTag === ev.perkTag, 'preview!=sell ' + JSON.stringify([pv, ev])); }
      else if (!s.pos[i] && a < 0.8) buy(s, i);
      if (rnd() < 0.3) tick(s);
    }
    endRun(prof, s);
  }
  // 2) spare logic: own 2 of type 0, third loss of type 0 is a spare; own 1 -> not a spare
  const find = (collType, cnt) => {
    const p = newProfile('sp'); p.collection[collType] = cnt;
    for (let k = 0; k < 400; k++) {
      const s = newRun(p, DEFAULTS); s.config.saleCut = 0.015;
      for (let t = 0; t < 179; t++) {
        if (!s.pos[0] && canBuy(s, 0)) buy(s, 0);
        else if (s.pos[0]) { const pv = sellPreview(s, 0); if (pv.loss && pv.scar.type === collType) return { pv, ev: sell(s, 0) }; }
        tick(s);
      }
      p.runs.push({}); // advance seed
    }
    return null;
  };
  const a = find(0, 2), b = find(0, 1);
  ck(a && a.ev.scar.spare === true && a.pv.scar.spare === true, '3rd loss with 2 owned should be spare');
  ck(b && b.ev.scar.spare === false, 'loss with 1 owned should not be spare');
  // 3) sparesNext cap 10 and pays once; Deep Cut/refs
  const p3 = newProfile('cap'); p3.collection = [2, 2, 2, 2, 2, 2];
  const s3 = newRun(p3, DEFAULTS);
  for (let k = 0; k < 15; k++) s3.drops.push({ type: 0, spare: true, t: 1, i: 0, pnl: -1 });
  endRun(p3, s3);
  ck(p3.sparesNext === 10 * DEFAULTS.spareCash, 'sparesNext cap 10, got ' + p3.sparesNext);
  const s4 = newRun(p3, DEFAULTS);
  ck(s4.startCash === DEFAULTS.startCash + 10, 'start cash includes spares');
  endRun(p3, s4);
  ck(p3.sparesNext === 0, 'spares pay once');
  // 4) report
  ck(report(p3, DEFAULTS).includes('btb-tune-1') && report(p3, DEFAULTS).startsWith('Bad Trade Bazaar btb-tune-1 report'), 'report text');
  // 5) run1 seed visible loss chance
  const s5 = newRun(newProfile('x'), DEFAULTS);
  let vis = false;
  for (let tb = 0; tb <= 5; tb++) for (let i = 0; i < 3; i++) for (let t = tb + 1; t <= tb + 25; t++) if (s5.px[i][t] <= s5.px[i][tb] * 0.98) vis = true;
  ck(vis, 'run1Seed has a 2% dip within 25 s of a buy in first 5 s');
  console.log(fails ? `SELFTEST FAIL (${fails})` : 'SELFTEST PASS (1000 preview checks, spare, cap 10, report, run1 seed)');
  process.exit(fails ? 1 : 0);
}
if (args.includes('--selftest')) selftest();
if (args.includes('--g2')) {
  console.log(`G2 fixed run-1 seed ${DEFAULTS.run1Seed} vs ${SEEDS} random markets (run 1, empty build)`);
  for (const b of ['strong', 'skilled', 'human', 'noLoss']) {
    const fixed = playRun(newProfile('g2'), DEFAULTS, bots[b], b).endCash;
    const e = [];
    for (let n = 0; n < SEEDS; n++) e.push(playRun(newProfile('g' + n), { ...DEFAULTS, run1Seed: `btb-g2-${n}` }, bots[b], b).endCash);
    const pctl = Math.round(100 * e.filter((x) => x < fixed).length / e.length);
    console.log(`${b.padEnd(8)} fixed ${fixed} | random p10/p50/p90 ${f3(e)} | fixed seed percentile ${pctl}`);
  }
  process.exit(0);
}
const SAME = args.includes('--same');

const res = {};
for (const b in bots) {
  const o = res[b] = { end: [], sp: [], proto: [] };
  for (let k = 0; k < RUNS; k++) { o.end.push([]); o.sp.push([]); }
  for (let n = 0; n < SEEDS; n++) {
    const profile = newProfile(String(n));
    const cfg = { ...DEFAULTS, run1Seed: `btb-${n}-r1`, sameMarkets: SAME };
    for (let k = 0; k < RUNS; k++) {
      const sum = playRun(profile, cfg, bots[b], b);
      o.end[k].push(sum.endCash); o.sp[k].push(sum.spares);
    }
    o.proto.push(protoCheck(profile));
  }
}
console.log(`seeds=${SEEDS} runs=${RUNS} markets=${SAME ? 'same' : 'fresh'} END cash p10/p50/p90`);
console.log('bot'.padEnd(13) + '| run1 | run3 | run6 | spares/run mean');
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
for (const b in bots) {
  const o = res[b];
  console.log(`${b.padEnd(12)} | ${f3(o.end[0])} | ${f3(o.end[2])} | ${f3(o.end[RUNS - 1])} | ${o.sp.map((a) => avg(a).toFixed(1)).join(' ')}`);
}
const m = (b, k) => q(res[b].end[k], .5);
const r3 = Math.min(2, RUNS - 1), r6 = RUNS - 1;
const G1 = m('skilledScars', r3) > m('skilled', r3);
const G2 = m('farmer', r6) < 100;
const G3 = m('dump', r6) < m('skilled', r6);
const T1 = m('noLoss', r3) > m('dump', r3);
console.log(`G1 skilledScars r3 p50 ${m('skilledScars', r3)} > skilled r3 p50 ${m('skilled', r3)}: ${G1 ? 'PASS' : 'FAIL'}`);
console.log(`G2 farmer r6 p50 ${m('farmer', r6)} < 100: ${G2 ? 'PASS' : 'FAIL'}`);
console.log(`G3 dump r6 p50 ${m('dump', r6)} < skilled r6 p50 ${m('skilled', r6)}: ${G3 ? 'PASS' : 'FAIL'}`);
console.log(`T1 (target) noLoss r3 p50 ${m('noLoss', r3)} > dump r3 p50 ${m('dump', r3)}: ${T1 ? 'PASS' : 'MISS'}`);
const pr = res.skilledScars.proto.filter((x) => x.ratio != null).map((x) => x.ratio);
if (pr.length) console.log(`skilledScars proto ratio (median r3-5 / run1): p10/p50/p90 ${[.1, .5, .9].map((f) => Math.round(q(pr, f) * 100) + '%').join('/')}, pass>=130%: ${Math.round(100 * pr.filter((x) => x >= 1.3).length / pr.length)}% of seeds`);
process.exit(G1 && G2 && G3 ? 0 : 1);
