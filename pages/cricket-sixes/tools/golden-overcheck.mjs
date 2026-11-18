// Independent per-over check of the Captain's Over (A1) against the wheel over model, on real mid-match states.
// Usage: node tools/golden-overcheck.mjs [seeds=60] [json]   (states: every over of both innings, wheel mode, random wheel stops)
// Does not use tools/golden-sim.mjs. Uses: the store's WheelOver to build states, wheelOverModel for (a), goldenReplay (= playOver + pickX hook) for (b).
import { newGame, step } from '../test/_season-bot.mjs';
import { applyCommand } from '../js/store/commands.js';
import { FLAGS } from '../js/data/flags.js';
import { makeRng } from '../js/core/rng.js';
import { WHEEL_MATCH as WMX } from '../js/data/wheelmatch.js';
import { GOLDEN } from '../js/data/golden-over.js';
import { suggestedBowler, rivalBowler, modelOf } from '../js/store/wheelmatch-store.js';
import { goldenReplay, windowFor, gradeOf } from '../js/core/golden-over.js';
import { batPart, bowlPart } from '../js/core/ability.js';

FLAGS.wheelMatch = true; FLAGS.settled = true;
const SEEDS = Number(process.argv[2]) || 60;
const WK = GOLDEN.WK_VAL;

/** Every over-start state of every wheel match (both innings). Overs advance with real WheelOver at a random stop. */
function* states(seedN) {
  for (let k = 0; k < SEEDS; k++) {
    const st = newGame(`oc-${seedN}-${k}`); let g = 0;
    while (st.get().stage !== 'bowl' && g++ < 60) step(st, { drills: 0 });
    let s = st.get();
    if (s.stage !== 'bowl' || s.mode !== 'wheel') continue;
    const prng = makeRng(`oc|walk|${seedN}|${k}`);
    for (let guard = 0; guard < 40; guard++) {
      if (s.stage === 'break') { s = applyCommand(s, 'StartChase'); continue; }
      if (s.stage !== 'bowl' && s.stage !== 'chase') break;
      const side = s.stage === 'bowl' ? 'bowl' : 'bat';
      const bowler = side === 'bowl' ? suggestedBowler(s) : rivalBowler(s);
      yield { s, side, bowler, id: `${seedN}-${k}-${guard}` };
      const stop = { t: 0.8 + (WMX.PULSE_PERIOD - 0.8) * prng.random(), phi: prng.random() * WMX.CIRC }; // random wheel tap
      const n = applyCommand(s, 'WheelOver', side === 'bowl' ? { bowler, stop } : { stop });
      if (n === s) throw new Error('WheelOver ignored');
      s = n;
    }
  }
}

const TAPPERS = [['sd35', 35], ['sd60', 60], ['sd110', 110], ['random', null]];
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r.random())) * Math.cos(2 * Math.PI * r.random());

/** Play a Captain's Over ball by ball: the window of ball i comes from that ball's striker (bat) or M's bowler (bowl). */
function captainOver(s, side, bowler, sd, rng) {
  const grades = [];
  for (let i = 0; i < 6; i++) {
    const balls = goldenReplay(structuredClone(s), side, bowler, grades);
    const b = balls[i]; if (!b) break;
    const raw = side === 'bat' ? batPart(s.me.players[b.batter]) : bowlPart(s.me.players[bowler]);
    const err = sd == null ? (rng.random() * 2 - 1) * 400 : gauss(rng) * sd;
    grades.push(gradeOf(err, windowFor(raw)));
  }
  const n = structuredClone(s);
  const inn = side === 'bowl' ? n.inn1 : n.inn2, r0 = inn.runs, w0 = inn.wk;
  const balls = goldenReplay(n, side, bowler, grades);
  return { runs: inn.runs - r0, wk: inn.wk - w0, grades: grades.slice(0, balls.length) };
}

const acc = () => ({ n: 0, runs: 0, wk: 0, gap: 0, wgap: 0, P: 0, G: 0, M: 0, below: 0, belowVal: 0, wheelR: 0, wheelW: 0, val: 0, wval: 0 });
const R = { bat: {}, bowl: {} };
for (const side of ['bat', 'bowl']) for (const [t] of TAPPERS) R[side][t] = acc();
const W = { bat: { n: 0, r: 0, w: 0 }, bowl: { n: 0, r: 0, w: 0 } };
let count = 0;
for (const { s, side, bowler, id } of states(1)) {
  const e = modelOf(s, side, bowler).expect;
  const wv = side === 'bat' ? e.xr - WK * e.xw : -e.xr + WK * e.xw;
  W[side].n++; W[side].r += e.xr; W[side].w += e.xw; count++;
  for (const [t, sd] of TAPPERS) {
    const c = captainOver(s, side, bowler, sd, makeRng(`oc|tap|${t}|${id}`));
    const v = side === 'bat' ? c.runs - WK * c.wk : -c.runs + WK * c.wk;
    const a = R[side][t]; a.n++; a.runs += c.runs; a.wk += c.wk; a.wheelR += e.xr; a.wheelW += e.xw;
    for (const g of c.grades) a[g]++;
    if (side === 'bat' ? c.runs < e.xr : c.runs > e.xr) a.below++;
    if (v < wv) a.belowVal++;
    a.val += v; a.wval += wv;
  }
}
const f = (x, d = 2) => x.toFixed(d);
const out = [];
for (const side of ['bat', 'bowl']) {
  out.push(`${side === 'bat' ? 'BATTING (inn2, we chase)' : 'BOWLING (inn1, rival bats)'}  overs=${W[side].n}  wheel mean runs ${f(W[side].r / W[side].n)} wkts ${f(W[side].w / W[side].n)}`);
  out.push('tapper  runs  wkts | d_runs d_wkts | d_value(runs-6wk, +good) | P%   G%   M%  | worse-by-runs% worse-by-value%');
  for (const [t] of TAPPERS) {
    const a = R[side][t], n = a.n, b = a.P + a.G + a.M;
    out.push(`${t.padEnd(7)} ${f(a.runs / n)} ${f(a.wk / n)} | ${f((a.runs - a.wheelR) / n)} ${f((a.wk - a.wheelW) / n)} | ${f((a.val - a.wval) / n)} | ${f(100 * a.P / b, 1)} ${f(100 * a.G / b, 1)} ${f(100 * a.M / b, 1)} | ${f(100 * a.below / n, 1)} ${f(100 * a.belowVal / n, 1)}`);
  }
}
out.push(`states=${count}; bowling check: rival runs per over, Captain sd35 ${f(R.bowl.sd35.runs / R.bowl.sd35.n)} vs wheel ${f(W.bowl.r / W.bowl.n)} -> ${R.bowl.sd35.runs / R.bowl.sd35.n < W.bowl.r / W.bowl.n ? 'fewer (ok)' : 'NOT fewer'}`);
console.log(out.join('\n'));
