#!/usr/bin/env node
// Wheel match parity check (2026-11-15 wheel-match build, SIMCHECK). Plays WHOLE wheel matches through the REAL store commands
// (NewGame -> StartMatch -> WheelOver x up to 20 -> StartChase), season path (league 1, centre 30, pairing on, settled on), so the
// store's rival boost (+WHEEL_RIVAL_BOOST on rival bp/bs/spd/bsk) applies. Teams follow the sim's make_teams (wheel_match_sim.py):
// six players, ratings N(50, 8) - 20 + offset clamped 1..99, bat roles O,O,M,M,L,L, bowl types 2 Fast 2 Medium 2 Spin shuffled.
//   variant wheel     ours at +1.9 (the Classic offset), rival at 0 (league centre 30). The engine plays the rival +WHEEL_RIVAL_BOOST (9.9, rivalBoostOf)
//                     and reads the field centre at 30 + 9.9, i.e. the sim's OFF -8 shifted up 9.9 (same rating differences, same z vs centre)
//   variant classic   matchMode classic, BowlOver / StartChase with default calls: no boost, centre 30 (sanity)
// Tapper bots pick the STOP time t (and the start offset phi) and pass {t, phi} through WheelOver:
//   random  t uniform 1..6 s
//   avg     careful naive aim (wheel_match_sim spin_wheel 'naive'): best-value slice with width >= 0.5 unit, tap time whose honest
//           landing (e 0) is the slice centre with arrival nearest 3.5 s, then t + N(0, 0.110)
//   good    same, sd 0.070
//   full    avg with full Control (wheel meta ranks Slow 3, Steady 2, Aim Guide): game physics W0 x0.55, J x0.7225, sd 0.080
//   savvy   avg sd, picks the slice with the best expected value under its own error model (aim.py choose_target / sim 'savvy')
// Usage: node tools/wheelmatch-parity.mjs [--n 300] [--cells random,avg,good,full] [--variant wheel] [--seed parity] [--workers 4] [--json]
// Tool only (not shipped): uses worker_threads and performance.now.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { applyCommand } from '../js/store/commands.js';
import { FLAGS } from '../js/data/flags.js';
import { makeRng } from '../js/core/rng.js';
import { WHEEL_MATCH as WMX, WHEEL_RIVAL_BOOST } from '../js/data/wheelmatch.js';
import { matchPhys, rivalBoostOf, matchOpts, boostedRival } from '../js/core/wheelmatch.js';
import { centreOf } from '../js/core/match.js';
import { suggestedBowler, rivalBowler, modelOf } from '../js/store/wheelmatch-store.js';

export const SPEC_TABLE = { // target win % (numbers thread: python v3 fold + slice cap 0.12, sim/v3_cap_sim.py, OFF -8, phys 36/2.0/1.2, n 1500, league 1).
  // Was SPEC s6 at OFF -10 with the cluster builder: random 30.7, avg 60.1, good 64.0, full 77.5.
  wheel: { random: 33.4, avg: 55.2, good: 59.5, full: 72.9 },
};
const SD = { avg: WMX.SD_AVG, good: WMX.SD_GOOD, full: WMX.SD_GUIDE_AVG, savvy: WMX.SD_AVG };
const T_MID = 3.5, T_MIN = 0.5, MIN_AIM_W = 0.5, CENTRE_OFF = -20; // sim: CENTRE 30 = 50 - 20
const OUR_OFF = { wheel: 1.9, classic: 1.9 };

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/** Box-Muller normal (tool only). */
const gauss = (rng, sd) => { const u = Math.max(1e-12, rng.random()), v = rng.random(); return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** Unwrapped honest landing (e 0): arc(t) + glide distance. Same as core landingPos without the mod. */
const landU = (P, t) => P.W0 * P.TAU * (1 - Math.exp(-t / P.TAU)) + P.W0 * Math.exp(-t / P.TAU) * P.D / 3;
function solveT(P, target) { let lo = T_MIN, hi = P.COAST; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (landU(P, m) < target) lo = m; else hi = m; } return (lo + hi) / 2; }
/** Tap time whose honest landing is rim pos c from offset phi, arrival nearest 3.5 s (sim tap_time). */
function tapTime(P, c, phi) {
  const C = WMX.CIRC, k0 = Math.round((landU(P, T_MID) + phi - c) / C), lo = landU(P, T_MIN), hi = landU(P, P.COAST);
  let best = null;
  for (const k of [k0 - 1, k0, k0 + 1]) {
    const tg = c + k * C - phi; if (tg < lo || tg > hi) continue;
    const t = solveT(P, tg); if (best == null || Math.abs(t - T_MID) < Math.abs(best - T_MID)) best = t;
  }
  return best ?? P.COAST;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); }
const H = (z) => z * Phi(z) + Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
function errCdf(x, sig, J) { if (J <= 1e-9) return Phi(x / sig); return sig / (2 * J) * (H((x + J) / sig) - H((x - J) / sig)); }

/** Pick {t, phi} for a tapper on these segments. */
export function chooseStop(who, segs, P, rng) {
  const phi = rng.random() * WMX.CIRC;
  if (who === 'random') return { t: 1 + 5 * rng.random(), phi };
  const sd = SD[who], cen = segs.map((g) => g.start + g.width / 2);
  let tgt;
  if (who === 'savvy') {
    let bv = -Infinity;
    for (let i = 0; i < segs.length; i++) {
      const t = tapTime(P, cen[i], phi), sig = sd * P.W0 * Math.exp(-t / P.TAU) * (1 - P.D / (3 * P.TAU));
      let ev = 0, pt = 0;
      for (const g of segs) { let m = 0; for (const k of [-1, 0, 1]) m += errCdf(g.start + g.width - cen[i] + k * WMX.CIRC, sig, P.J) - errCdf(g.start - cen[i] + k * WMX.CIRC, sig, P.J); ev += m * g.value; pt += m; }
      ev /= Math.max(pt, 1e-9); if (ev > bv) { bv = ev; tgt = i; }
    }
  } else {
    let cand = segs.map((g, i) => i).filter((i) => segs[i].width >= MIN_AIM_W); if (!cand.length) cand = segs.map((g, i) => i);
    tgt = cand.reduce((a, i) => (segs[i].value > segs[a].value ? i : a), cand[0]);
  }
  const t0 = tapTime(P, cen[tgt], phi);
  return { t: Math.min(P.COAST, Math.max(T_MIN, t0 + gauss(rng, sd))), phi };
}

const BAT = ['Opener', 'Opener', 'Middle', 'Middle', 'Lower', 'Lower'];
function makeTeam(rng, off, idPre, src) {
  const bw = rng.shuffle(['Fast', 'Fast', 'Medium', 'Medium', 'Spin', 'Spin']);
  const r = () => clamp(50 + gauss(rng, 8) + CENTRE_OFF + off, 1, 99);
  return BAT.map((bat, i) => ({ ...src[i % src.length], id: `${idPre}${i}`, bat, bowl: bw[i], bp: r(), bs: r(), spd: r(), bsk: r(), nodes: { bat: 0, bowl: 0 } }));
}

/** One base season game (built once). */
export function baseGame(seed, variant, who) {
  let s = applyCommand(null, 'NewGame', { seed });
  s = { ...s, matchMode: variant === 'classic' ? 'classic' : 'wheel' };
  if (who === 'full') s = { ...s, wheelMeta: { ...s.wheelMeta, owned: { ...(s.wheelMeta.owned || {}), c_slow: 3, c_steady: 2, c_guide: 1 } } };
  return s;
}

/** Play match k. Returns {win (1 / 0.5 / 0), ours, rival, ms[] model build per over, boostOk}. */
export function playMatch(base, k, variant, who) {
  const trng = makeRng(`parity|teams|${k}`); // same teams for every tapper (common random numbers)
  const mine = base.clubs[0], oppId = base.fixture.opp;
  const ours = makeTeam(trng, OUR_OFF[variant], 'c0p', mine.squad);
  const opp0 = base.clubs.find((c) => c.id === oppId);
  const rival = makeTeam(trng, 0, `${oppId}p`, opp0.squad);
  const clubs = base.clubs.map((c) => (c.id === 'c0' ? { ...c, squad: ours, six: ours.map((p) => p.id) } : c.id === oppId ? { ...c, squad: rival, six: rival.map((p) => p.id) } : c));
  let s = { ...base, clubs, salt: `k${k}`, plan: { ...base.plan, edited: false, key: '' } };
  s = applyCommand(s, 'StartMatch');
  if (s.stage !== 'bowl') throw new Error(`StartMatch did not start a match (stage ${s.stage})`);
  // boost check: save keeps raw rival ratings; the engine adds +WHEEL_RIVAL_BOOST (wheel) / 0 (classic) and moves the field centre by the same amount
  const want = variant === 'classic' ? 0 : WHEEL_RIVAL_BOOST;
  const raw = s.rival.players.every((p) => { const q = rival.find((x) => x.id === p.id); return p.bp === q.bp && p.bsk === q.bsk; });
  const boostOk = raw && rivalBoostOf(s) === want && Math.abs(matchOpts(s, 'bowl').centre - centreOf(s) - want) < 1e-9 && boostedRival(s.rival.players[0], want).bp === Math.min(99, s.rival.players[0].bp + want);
  const ms = [], prng = makeRng(`parity|tap|${who}|${k}`);
  for (let guard = 0; guard < 40; guard++) {
    if (s.stage === 'break') { s = applyCommand(s, 'StartChase'); continue; }
    if (s.stage !== 'bowl' && s.stage !== 'chase') break;
    if (variant === 'classic') { s = applyCommand(s, 'BowlOver', {}); continue; }
    const side = s.stage === 'bowl' ? 'bowl' : 'bat';
    const vm = { bowler: side === 'bowl' ? suggestedBowler(s) : rivalBowler(s) };
    const t0 = performance.now();
    const model = modelOf(s, side, vm.bowler); // the store's own model call: WheelOver then reuses it (memo)
    ms.push(performance.now() - t0);
    const P = matchPhys(s);
    const stop = chooseStop(who, model.segs, P, prng);
    const n = applyCommand(s, 'WheelOver', side === 'bowl' ? { bowler: vm.bowler, stop } : { stop });
    if (n === s) throw new Error(`WheelOver ignored at ${s.stage} over ${(side === 'bowl' ? s.inn1 : s.inn2).over}`);
    s = n;
  }
  if (s.stage !== 'done') throw new Error(`match did not finish (stage ${s.stage})`);
  return { win: s.result === 'won' ? 1 : s.result === 'tied' ? 0.5 : 0, ours: s.inn2.runs, rival: s.inn1.runs, ourWk: s.inn2.wk, rivWk: s.inn1.wk, ms, boostOk, spins: (s.wheelLog || []).length };
}

function setFlags() { FLAGS.settled = true; FLAGS.matchday = false; FLAGS.roar = false; FLAGS.activities = false; FLAGS.freePick = false; FLAGS.wheelMatch = true; }

/** Run matches k0..k1-1 for one cell. */
export function runCell({ variant, who, k0, k1, seed }) {
  setFlags(); FLAGS.wheelMeta = who === 'full';
  const base = baseGame(seed, variant, who);
  const out = { win: 0, n: 0, ours: 0, rival: 0, ourWk: 0, rivWk: 0, ms: [], boostBad: 0, spins: 0 };
  for (let k = k0; k < k1; k++) {
    const r = playMatch(base, k, variant, who);
    out.win += r.win; out.n++; out.ours += r.ours; out.rival += r.rival; out.ourWk += r.ourWk; out.rivWk += r.rivWk; out.boostBad += r.boostOk ? 0 : 1; out.spins += r.spins;
    out.ms.push(...r.ms);
  }
  return out;
}

if (!isMainThread) parentPort.postMessage(runCell(workerData));
else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const n = +arg('n', 300), variant = arg('variant', 'wheel'), seed = arg('seed', 'parity');
  const cells = arg('cells', variant === 'classic' ? 'classic' : 'random,avg,good,full').split(',');
  const W = +arg('workers', 4), json = process.argv.includes('--json');
  const t0 = performance.now(), rows = [];
  for (const who of cells) {
    const parts = await Promise.all(Array.from({ length: W }, (_, i) => new Promise((res, rej) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { variant, who, seed, k0: Math.floor(i * n / W), k1: Math.floor((i + 1) * n / W) } });
      w.on('message', res); w.on('error', rej);
    })));
    const a = parts.reduce((x, y) => ({ win: x.win + y.win, n: x.n + y.n, ours: x.ours + y.ours, rival: x.rival + y.rival, ourWk: x.ourWk + y.ourWk, rivWk: x.rivWk + y.rivWk, ms: x.ms.concat(y.ms), boostBad: x.boostBad + y.boostBad, spins: x.spins + y.spins }));
    const p = a.win / a.n, ci = 1.96 * Math.sqrt(p * (1 - p) / a.n) * 100;
    const ms = a.ms.slice().sort((x, y) => x - y), mean = ms.reduce((x, y) => x + y, 0) / (ms.length || 1);
    const spec = SPEC_TABLE[variant] && SPEC_TABLE[variant][who];
    const row = { variant, who, n: a.n, win: +(p * 100).toFixed(1), ci: +ci.toFixed(1), spec: spec ?? null, diff: spec != null ? +(p * 100 - spec).toFixed(1) : null,
      ourRuns: +(a.ours / a.n).toFixed(1), rivalRuns: +(a.rival / a.n).toFixed(1), ourWk: +(a.ourWk / a.n).toFixed(2), rivalWk: +(a.rivWk / a.n).toFixed(2), spinsPerMatch: +(a.spins / a.n).toFixed(1),
      boostBad: a.boostBad, buildMsMean: +mean.toFixed(1), buildMsP95: ms.length ? +ms[Math.floor(ms.length * 0.95)].toFixed(1) : 0, buildMsMax: ms.length ? +ms[ms.length - 1].toFixed(1) : 0 };
    rows.push(row);
    if (!json) console.log(`${variant.padEnd(10)} ${who.padEnd(7)} n ${row.n}  win ${row.win.toFixed(1)}% +-${row.ci}  spec ${spec ?? '-'}  diff ${row.diff ?? '-'}  runs us ${row.ourRuns} riv ${row.rivalRuns}  wk us ${row.ourWk} riv ${row.rivalWk}  spins ${row.spinsPerMatch}  build ms/over mean ${row.buildMsMean} p95 ${row.buildMsP95} max ${row.buildMsMax}  boostBad ${row.boostBad}`);
  }
  if (json) console.log(JSON.stringify(rows));
  else console.log(`secs ${((performance.now() - t0) / 1000).toFixed(0)}`);
}
