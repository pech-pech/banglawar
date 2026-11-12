// Expected-range bands for the playtest report. Run: BANDS_N=2000 node tools/bands.mjs
// Policies are COPIED from tools/sweep.mjs (not exported there), same definitions and same seeds ('sweep-k').
// Adds: p10/median/p90, runs/over by field and intent, preview-grade mix, fit with skilled call, luck. Writes build/report/bands.json.
import { applyCommand } from '../js/store/commands.js';
import { bowlVM, chaseVM } from '../js/store/selectors.js';
import { makeRng } from '../js/core/rng.js';
import { skilledBowler, skilledField, skilledIntent as skilledIntentVM } from '../js/core/skilled.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const N = Number(process.env.BANDS_N || 2000);
const OUT = '/mnt/project-files/games-design/cricket-sixes/build/report/bands.json';
const el = (vm) => vm.bowlers.filter((b) => b.eligible);
const bestSB = (s, vm) => el(vm).reduce((a, b) => {
  const f = (x) => s.me.players[x.i].spd + s.me.players[x.i].bsk;
  return f(b) > f(a) ? b : a;
}).i;
const rotes = [];
for (const f of ['A', 'P']) for (const i of ['D', 'R', 'A']) rotes.push([`rote ${f}/${i}`, { field: () => f, intent: () => i, bowler: bestSB }]);
const skilledIntent = (s) => skilledIntentVM(s, chaseVM(s));
const skilled = { bowler: skilledBowler, field: skilledField, intent: skilledIntent };
const idle = { bowler: (s, vm) => el(vm)[0].i, field: () => 'A', intent: () => 'R' };
const naive = { rnd: true, bowler: (s, vm, r) => r.pick(el(vm)).i, field: (s, r) => r.pick(['A', 'P']), intent: (s, r) => r.pick(['D', 'R', 'A']) };
const noisy = { rnd: true,
  bowler: (s, vm, r) => (r.random() < 0.2 ? r.pick(el(vm)).i : skilledBowler(s, vm)),
  field: (s, r) => (r.random() < 0.2 ? r.pick(['A', 'P']) : skilledField(s)),
  intent: (s, r) => (r.random() < 0.2 ? r.pick(['D', 'R', 'A']) : skilledIntent(s)) };
const policies = [['idle', idle], ['naive (random)', naive], ...rotes, ['skilled', skilled], ['noisy-skilled (20%)', noisy]];

const exp = (pr) => 6 * pr.p.six + 4 * pr.p.four + 2 * pr.p.two + pr.p.single;
const ovRuns = (o) => o.balls.reduce((a, b) => a + (b.o === 'W' ? 0 : b.o), 0);
const ovWk = (o) => o.balls.filter((b) => b.o === 'W').length;

function play(seed, pol) {
  const r = makeRng(`${seed}|policy`);
  const m = { bowlFit: [], fieldFit: [], intentFit: [], grade: { Good: 0, OK: 0, Poor: 0 } };
  let s = applyCommand(null, 'NewMatch', { seed });
  while (s.stage === 'bowl') {
    const vm = bowlVM(s);
    const bw = pol.bowler(s, vm, r), fd = pol.field(s, r);
    // scoring does not touch the policy rng stream (skilled fns are pure), so bot behaviour is identical to sweep.mjs
    m.bowlFit.push(bw === skilledBowler(s, vm) ? 1 : 0); m.fieldFit.push(fd === skilledField(s) ? 1 : 0);
    const g = vm.bowlers[bw].previews.reduce((a, c) => a + c.g, 0);
    m.grade[g > 0 ? 'Good' : g < 0 ? 'Poor' : 'OK']++;
    s = applyCommand(s, 'MakeCall', { bowler: bw, field: fd });
    s = applyCommand(s, 'BowlOver', {});
  }
  s = applyCommand(s, 'StartChase', {});
  while (s.stage === 'chase') {
    const it = pol.intent(s, r);
    m.intentFit.push(it === skilledIntent(s) ? 1 : 0);
    s = applyCommand(s, 'BowlOver', { intent: it });
  }
  m.res = s.result; m.f = s.inn2.runs; m.a = s.inn1.runs; m.wf = s.inn2.wk; m.wa = s.inn1.wk;
  m.ov1 = s.inn1.overs.map((o) => ({ k: o.field, r: ovRuns(o), w: ovWk(o) }));
  m.ov2 = s.inn2.overs.map((o) => ({ k: o.intent, r: ovRuns(o), w: ovWk(o) }));
  const ex = (inn) => inn.overs.reduce((a, o) => a + o.balls.reduce((b, x) => b + exp(x.pr), 0), 0);
  m.exF = ex(s.inn2); m.exA = ex(s.inn1);
  return m;
}

const q = (xs, p) => { const a = [...xs].sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return +(a[lo] + (a[hi] - a[lo]) * (i - lo)).toFixed(2); };
const band = (xs) => ({ p10: q(xs, 0.1), median: q(xs, 0.5), p90: q(xs, 0.9), mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) });
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (x) => +(100 * x).toFixed(1);
const varr = (xs) => { const m = mean(xs); return mean(xs.map((x) => (x - m) ** 2)); };
const byKey = (ovs, keys) => Object.fromEntries(keys.map((k) => {
  const o = ovs.filter((x) => x.k === k); if (!o.length) return [k, null];
  return [k, { overs: o.length, runs_per_over: band(o.map((x) => x.r)), wickets_per_over: +mean(o.map((x) => x.w)).toFixed(3) }];
}));

const out = {
  meta: { n_per_policy: N, seeds: `sweep-0..sweep-${N - 1}`, rival_good_call_share: 0.7, made: new Date().toISOString().slice(0, 10),
    source: 'tools/bands.mjs (policies copied from tools/sweep.mjs; core from js/)', win_ci95_pts_at_n: pct(1.96 * Math.sqrt(0.25 / N)),
    notes: 'win = outright win (ties apart). Innings bands are across matches. runs_per_over bands are across single overs. Fit = share of calls equal to skilledBowler/Field/Intent chosen from the same board.' },
  policies: {},
};
for (const [name, pol] of policies) {
  const ms = []; for (let k = 0; k < N; k++) ms.push(play(`sweep-${k}`, pol));
  const win = mean(ms.map((m) => (m.res === 'won' ? 1 : 0))), tie = mean(ms.map((m) => (m.res === 'tied' ? 1 : 0)));
  const all = (k) => ms.flatMap((m) => m[k]);
  const grades = ms.reduce((a, m) => ({ Good: a.Good + m.grade.Good, OK: a.OK + m.grade.OK, Poor: a.Poor + m.grade.Poor }), { Good: 0, OK: 0, Poor: 0 });
  const gt = grades.Good + grades.OK + grades.Poor;
  const luckF = ms.map((m) => m.f - m.exF);
  const margin = ms.map((m) => m.f - m.a);
  out.policies[name] = {
    win_pct: { value: pct(win), ci95_pts: pct(1.96 * Math.sqrt(win * (1 - win) / N)), source: `bot sweep n=${N}` },
    tie_pct: { value: pct(tie), source: `bot sweep n=${N}` },
    runs_for_per_innings: { ...band(ms.map((m) => m.f)), source: 'our chase innings (inn2.runs), per match' },
    runs_against_per_innings: { ...band(ms.map((m) => m.a)), source: 'rival innings vs our bowling (inn1.runs), per match' },
    wickets_taken: { ...band(ms.map((m) => m.wa)), source: 'inn1.wk (we bowl), per match' },
    wickets_lost: { ...band(ms.map((m) => m.wf)), source: 'inn2.wk (we chase), per match' },
    margin_runs: { ...band(margin), source: 'runs for minus runs against' },
    close_finish_pct: { value: pct(mean(margin.map((d) => (Math.abs(d) <= 6 ? 1 : 0)))), source: '|margin| <= 6 runs (wicket-margin not computed)' },
    blowout_pct: { value: pct(mean(margin.map((d) => (Math.abs(d) > 40 ? 1 : 0)))), source: '|margin| > 40 runs' },
    runs_per_over_by_field: { ...byKey(all('ov1'), ['A', 'P']), source: 'our bowling overs (inn1), field chosen in that over; confounded for conditional policies, clean for rotes' },
    runs_per_over_by_intent: { ...byKey(all('ov2'), ['D', 'R', 'A']), source: 'our chase overs (inn2), intent chosen in that over; confounded for conditional policies, clean for rotes' },
    matchup_pick_share_pct: { Good: pct(grades.Good / gt), OK: pct(grades.OK / gt), Poor: pct(grades.Poor / gt), picks: gt,
      source: 'per bowl over, sum of preview g of chosen bowler: >0 Good (label Great), 0 OK (Even or no preview), <0 Poor (Bad)' },
    match_to_skilled_call_pct: { bowler: pct(mean(all('bowlFit'))), field: pct(mean(all('fieldFit'))), intent: pct(mean(all('intentFit'))),
      source: 'share of overs where the pick equals the skilled rule on the same board' },
    luck: { actual_minus_expected_runs: { ...band(luckF), source: 'our chase: actual runs minus sum of per-ball expected runs from pr.p' },
      luck_share_of_runs_variance_pct: pct(varr(luckF) / varr(ms.map((m) => m.f)) || 0),
      source: 'variance(actual - expected) / variance(actual runs for); expected-run noise is pure ball luck given the calls' },
  };
  console.log(name, 'win', pct(win));
}
mkdirSync('/mnt/project-files/games-design/cricket-sixes/build/report/', { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('wrote', OUT);
