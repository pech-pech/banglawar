// Policy sweep on the step-0 core: are Call (bowler+field) and Intent real choices? Run: node tools/sweep.mjs
import { applyCommand } from '../js/store/commands.js';
import { bowlVM, chaseVM } from '../js/store/selectors.js';
import { makeRng } from '../js/core/rng.js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const N = Number(process.env.SWEEP_N || 400);
const OUT_DIR = '/mnt/project-files/games-design/cricket-sixes/build/addexp/sweep/';
const OUT = OUT_DIR + 'SWEEP-2026-11-12.md';
const el = (vm) => vm.bowlers.filter((b) => b.eligible);
const bestSB = (s, vm) => el(vm).reduce((a, b) => {
  const f = (x) => s.me.players[x.i].spd + s.me.players[x.i].bsk;
  return f(b) > f(a) ? b : a;
}).i;

const rotes = [];
for (const f of ['A', 'P']) for (const i of ['D', 'R', 'A']) rotes.push([`rote ${f}/${i}`, { field: () => f, intent: () => i, bowler: bestSB }]);

const skilledBowler = (s, vm) => {
  let best = null, bs = -Infinity;
  for (const b of el(vm)) {
    const p = s.me.players[b.i];
    const sc = b.previews.reduce((a, c) => a + c.g + (c.inPhase ? 1 : 0), 0) + (p.spd + p.bsk) / 1000;
    if (sc > bs) { bs = sc; best = b.i; }
  }
  return best;
};
const skilledField = (s) => {
  const inn = s.inn1, st = s.rival.players[inn.crease[inn.strike]];
  return st.bp + st.bs < 95 ? 'A' : 'P';
};
const skilledIntent = (s) => {
  const vm = chaseVM(s), inn = s.inn2;
  const rr = vm.need / Math.max(vm.ballsLeft, 1);
  if (rr > 1.65 || (inn.over >= 8 && inn.wk <= 2)) return 'A';
  return inn.wk >= 4 && rr < 1.2 ? 'D' : 'R';
};
const skilled = { bowler: skilledBowler, field: skilledField, intent: skilledIntent };
const idle = { bowler: (s, vm) => el(vm)[0].i, field: () => 'A', intent: () => 'R' };
const naive = { rnd: true,
  bowler: (s, vm, r) => r.pick(el(vm)).i, field: (s, r) => r.pick(['A', 'P']), intent: (s, r) => r.pick(['D', 'R', 'A']) };
const noisy = { rnd: true,
  bowler: (s, vm, r) => (r.random() < 0.2 ? r.pick(el(vm)).i : skilledBowler(s, vm)),
  field: (s, r) => (r.random() < 0.2 ? r.pick(['A', 'P']) : skilledField(s)),
  intent: (s, r) => (r.random() < 0.2 ? r.pick(['D', 'R', 'A']) : skilledIntent(s)) };

const policies = [['idle', idle], ['naive (random)', naive], ...rotes, ['skilled', skilled], ['noisy-skilled (20%)', noisy]];

function play(seed, pol) {
  const r = makeRng(`${seed}|policy`);
  let s = applyCommand(null, 'NewMatch', { seed });
  while (s.stage === 'bowl') {
    const vm = bowlVM(s);
    s = applyCommand(s, 'MakeCall', { bowler: pol.bowler(s, vm, r), field: pol.field(s, r) });
    s = applyCommand(s, 'BowlOver', {});
  }
  s = applyCommand(s, 'StartChase', {});
  while (s.stage === 'chase') s = applyCommand(s, 'BowlOver', { intent: pol.intent(s, r) });
  return { res: s.result, f: s.inn2.runs, a: s.inn1.runs };
}

const z = 1.96;
const rows = [];
for (const [name, pol] of policies) {
  let w = 0, t = 0, f = 0, a = 0; const wins = [];
  for (let k = 0; k < N; k++) {
    const o = play(`sweep-${k}`, pol);
    const win = o.res === 'won' ? 1 : 0; w += win; t += o.res === 'tied' ? 1 : 0; f += o.f; a += o.a; wins.push(win);
  }
  const p = w / N;
  rows.push({ name, p, ci: z * Math.sqrt(p * (1 - p) / N), tie: t / N, f: f / N, a: a / N });
}
const pct = (x) => (100 * x).toFixed(1);
const rote = rows.filter((r) => r.name.startsWith('rote'));
const bestRote = rote.reduce((a, b) => (b.p > a.p ? b : a));
const worstRote = rote.reduce((a, b) => (b.p < a.p ? b : a));
const sk = rows.find((r) => r.name === 'skilled'), nz = rows.find((r) => r.name.startsWith('noisy'));
const idl = rows.find((r) => r.name === 'idle'), nv = rows.find((r) => r.name.startsWith('naive'));
const gap = (a, b) => ({ d: a.p - b.p, ci: z * Math.sqrt(a.ci ** 2 / z ** 2 + b.ci ** 2 / z ** 2) });
const g1 = gap(sk, bestRote);
const fieldA = rote.filter((r) => r.name.includes('A/')), fieldP = rote.filter((r) => r.name.includes('P/'));
const mean = (xs) => xs.reduce((a, b) => a + b.p, 0) / xs.length;
const intM = (c) => mean(rote.filter((r) => r.name.endsWith('/' + c)));

let md = `# Cricket sixes step-0 policy sweep (${new Date().toISOString().slice(0, 10)})

${N} seeds per policy (seeds sweep-0..sweep-${N - 1}, same seeds for every policy), us vs rival at good-call share 0.7. Win = outright win; ties listed apart. CI = 95% normal approx on win %.

| Policy | Win % | 95% CI (+/-) | Tie % | Runs for | Runs against |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${pct(r.p)} | ${pct(r.ci)} | ${pct(r.tie)} | ${r.f.toFixed(1)} | ${r.a.toFixed(1)} |`).join('\n')}

## Gaps
- Skilled minus best rote (${bestRote.name}): ${(100 * g1.d).toFixed(1)} pts (CI +/-${pct(g1.ci)}; seeds are shared so true paired error is smaller).
- Noisy-skilled minus best rote: ${(100 * gap(nz, bestRote).d).toFixed(1)} pts.
- Skilled minus idle: ${(100 * gap(sk, idl).d).toFixed(1)} pts. Skilled minus naive: ${(100 * gap(sk, nv).d).toFixed(1)} pts.
- Best rote minus worst rote (${worstRote.name}): ${(100 * (bestRote.p - worstRote.p)).toFixed(1)} pts.
- Mean rote win % by field: A ${pct(mean(fieldA))}, P ${pct(mean(fieldP))} (spread ${(100 * Math.abs(mean(fieldA) - mean(fieldP))).toFixed(1)} pts).
- Mean rote win % by intent: D ${pct(intM('D'))}, R ${pct(intM('R'))}, A ${pct(intM('A'))}.

## Verdict
VERDICT_PLACEHOLDER
`;
const fSpread = Math.abs(mean(fieldA) - mean(fieldP)) * 100;
const iSpread = (Math.max(intM('D'), intM('R'), intM('A')) - Math.min(intM('D'), intM('R'), intM('A'))) * 100;
const verdict = `Measured, not argued. Skilled play beats the best rote by ${(100 * g1.d).toFixed(1)} pts (CI +/-${pct(g1.ci)}), so the combined Call+Intent skill is ${g1.d * 100 >= 5 ? 'a real' : 'NOT yet a real'} edge against a 5-pt target. Field: fixed A vs fixed P differ by ${fSpread.toFixed(1)} pts on average, ${fSpread < 2 ? 'so one field dominates or barely matters as a rote, ie it is a weak choice by itself' : 'so the field setting carries weight as a rote and the conditional rule must beat it'}. Intent: the rote spread D/R/A is ${iSpread.toFixed(1)} pts, ${iSpread >= 5 ? 'a dominant fixed intent exists, which makes Intent a solved choice unless the need rate changes the best pick' : 'no single intent dominates, so context could matter'}. Bowler: idle (first eligible) vs best-spd+bsk rote isolates bowler choice at about ${(100 * ((rote.find((r) => r.name === 'rote A/R') || {p: 0}).p - idl.p)).toFixed(1)} pts; skilled adds the preview-chip matchup on top. Noisy-skilled keeping ${(100 * (nz.p - bestRote.p)).toFixed(1)} pts over best rote shows ${nz.p > bestRote.p ? 'mistakes still cost less than ignoring the board' : 'a small slip erases the edge'}. Suggested target margin: skilled beats best rote by >= 5 pts (CI excluding 0) and best rote beats idle/naive by < the skilled gap, with each of field and intent individually worth >= 2 pts when played right versus wrong; re-run after any ability/fixture/why change.`;
md = md.replace('VERDICT_PLACEHOLDER', verdict);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, md);
console.log(md);
setTimeout(() => { const back = readFileSync(OUT, 'utf8'); console.log(back === md ? 'REREAD OK ' + OUT : 'REREAD MISMATCH'); }, 10000);
