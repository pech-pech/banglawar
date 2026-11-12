// Season bot sweep: whole seeded seasons through applyCommand, five policy families, TEST-PLAN section 3 pass bands.
// Run: SWEEP_N=200 node tools/season-sweep.mjs     (400 for the report; SWEEP_OUT=dir to move the report; SWEEP_QUIET=1 for one-line)
// Exit 0 = every hard check held (or the season store is not built yet: SKIP). Exit 1 = a hard check failed.
// Band misses and policy-order misses are REPORT-ONLY until the first run sets bands: a miss is a card to M, never a silent retune.
import { mkdirSync, writeFileSync } from 'node:fs';
import { seasonReady, POLICIES, playSeason } from './season-bot.mjs';

if (!seasonReady()) {
  console.log('SKIP season-sweep: the store has no NewGame/season yet (js/store/commands.js still step-0). Nothing was run.');
  process.exit(0);
}
const { wrap, unwrap } = await import('../js/core/save-migrate.js');

const N = Number(process.env.SWEEP_N || 400);
const OUT_DIR = process.env.SWEEP_OUT || '/mnt/project-files/games-design/cricket-sixes/build/m0/sweep/';
const REPEAT_CHECK = Math.min(N, Number(process.env.SWEEP_REPEAT || 5)); // seeds replayed to prove same seed twice is equal
const SAVE_CHECK = Math.min(N, Number(process.env.SWEEP_SAVECHK || 20)); // seeds that also round-trip the save every week
const z = 1.96;

// TEST-PLAN section 3 bands: PLACEHOLDERS, report-only. Proportions get +-0.03 at N=400 once measured and frozen.
const BANDS = {
  'careless': { top4: [0.15, 0.40], champion: [0, 0.06], wins: [3.0, 4.5] },
  'skilled': { top4: [0.65, 0.90], champion: [0.20, 0.45], wins: [5.5, 7.0] },
};

const t0 = Date.now();
const hard = []; // hard failures: {policy, seed, msg}
const rows = [];
for (const pol of POLICIES) {
  const agg = { name: pol.name, n: 0, pts: 0, wins: 0, top4: 0, champion: 0, matches: 0, maxMatches: 0, places: Array(10).fill(0) };
  for (let k = 0; k < N; k++) {
    const seed = `season-${k}`;
    const o = playSeason(seed, pol, k < SAVE_CHECK ? { wrap, unwrap } : {});
    for (const e of o.errors) hard.push({ policy: pol.name, seed, msg: e });
    if (!o.state || o.state.stage !== 'end') continue;
    if (o.myMatches > 11) hard.push({ policy: pol.name, seed, msg: `M played ${o.myMatches} matches, max 11` });
    if (k < REPEAT_CHECK) {
      const again = playSeason(seed, pol);
      if (JSON.stringify(again.state) !== JSON.stringify(o.state)) hard.push({ policy: pol.name, seed, msg: 'same seed twice gave different final state' });
    }
    agg.n++; agg.pts += o.pts; agg.wins += o.wins; agg.top4 += o.top4 ? 1 : 0; agg.champion += o.champion ? 1 : 0;
    agg.matches += o.myMatches; agg.maxMatches = Math.max(agg.maxMatches, o.myMatches); agg.places[o.place - 1]++;
  }
  const n = Math.max(1, agg.n), p4 = agg.top4 / n, pc = agg.champion / n;
  rows.push({ name: pol.name, n: agg.n, pts: agg.pts / n, wins: agg.wins / n, top4: p4, top4ci: z * Math.sqrt(p4 * (1 - p4) / n), champion: pc,
    matches: agg.matches / n, maxMatches: agg.maxMatches, places: agg.places.map((c) => c / n) });
}
const secs = (Date.now() - t0) / 1000;

const pct = (x) => (100 * x).toFixed(1);
const f1 = (x) => x.toFixed(2);
const rote = rows.filter((r) => r.name.startsWith('rote'));
const bestRote = rote.reduce((a, b) => (b.top4 > a.top4 ? b : a), rote[0]);
const by = (n) => rows.find((r) => r.name === n || r.name.startsWith(n));
const idleR = by('idle'), carR = by('careless'), skR = by('skilled'), nzR = by('noisy');

const misses = []; // report-only
for (const [name, b] of Object.entries(BANDS)) {
  const r = by(name); if (!r) continue;
  const chk = (label, v, [lo, hi]) => { if (v < lo || v > hi) misses.push(`${name} ${label} ${f1(v)} outside placeholder band ${lo}-${hi}`); };
  chk('P(top 4)', r.top4, b.top4); chk('P(champion)', r.champion, b.champion); chk('mean league wins', r.wins, b.wins);
}
if (idleR.top4 > carR.top4) misses.push(`idle P(top 4) ${f1(idleR.top4)} above careless ${f1(carR.top4)}`);
const order = skR.top4 > bestRote.top4 && bestRote.top4 > idleR.top4;
if (!order) misses.push(`order skilled > best rote > idle on P(top 4) fails: ${f1(skR.top4)} / ${f1(bestRote.top4)} (${bestRote.name}) / ${f1(idleR.top4)}`);
if (skR.top4 - bestRote.top4 < 0.10) misses.push(`skilled beats best rote by ${pct(skR.top4 - bestRote.top4)} pts of P(top 4), want >= 10 (Call and squad pick may not be real choices)`);
if (secs > 60 * (N / 200)) misses.push(`${secs.toFixed(0)} s for ${N} seeds x ${POLICIES.length} policies; guess was 60 s per 200 seeds`);

const bad = hard.slice(0, 40);
const md = `# Cricket sixes M0 season sweep (${new Date().toISOString().slice(0, 10)})

${N} seasons per policy (seeds season-0..season-${N - 1}, the same seeds for every policy), ${POLICIES.length} policies, whole seasons through applyCommand only. ${secs.toFixed(1)} s total.
Hard checks: no throw, every season ends, M plays at most 11 matches, table sums (45 league matches, 90 points), TP never below 0, ratings 1..99 and within cap, no invalid pick, same seed twice equal (${REPEAT_CHECK} seeds per policy), save round trip equal at every week (${SAVE_CHECK} seeds per policy).

| Policy | Seasons | League pts | League wins | P(top 4) | +-95% | P(champion) | M matches (max) |
|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.n} | ${r.pts.toFixed(1)} | ${r.wins.toFixed(2)} | ${pct(r.top4)}% | ${pct(r.top4ci)} | ${pct(r.champion)}% | ${r.matches.toFixed(2)} (${r.maxMatches}) |`).join('\n')}

## Table position distribution (share of seasons ending 1st..10th)
| Policy | ${Array.from({ length: 10 }, (_, i) => i + 1).join(' | ')} |
|---|${'---|'.repeat(10)}
${rows.map((r) => `| ${r.name} | ${r.places.map((x) => pct(x)).join(' | ')} |`).join('\n')}

## Pass bands (placeholders from TEST-PLAN section 3, report-only)
- careless: P(top 4) 0.15-0.40, P(champion) < 0.06, mean wins 3.0-4.5. Measured ${f1(carR.top4)}, ${f1(carR.champion)}, ${f1(carR.wins)}.
- skilled: P(top 4) 0.65-0.90, P(champion) 0.20-0.45, mean wins 5.5-7.0. Measured ${f1(skR.top4)}, ${f1(skR.champion)}, ${f1(skR.wins)}.
- Order on P(top 4): skilled ${f1(skR.top4)} > best rote ${f1(bestRote.top4)} (${bestRote.name}) > idle ${f1(idleR.top4)}; noisy-skilled ${f1(nzR.top4)}. Skilled minus best rote ${pct(skR.top4 - bestRote.top4)} pts (want >= 10).
- Report-only misses: ${misses.length ? '\n' + misses.map((m) => '  - ' + m).join('\n') : 'none'}

## Hard failures: ${hard.length}
${bad.length ? bad.map((h) => `- ${h.policy} ${h.seed}: ${h.msg}`).join('\n') : 'none'}
`;
console.log(md);
try { mkdirSync(OUT_DIR, { recursive: true }); writeFileSync(OUT_DIR + `SEASON-SWEEP-N${N}.md`, md); console.log('wrote ' + OUT_DIR + `SEASON-SWEEP-N${N}.md`); } catch (e) { console.log('report not written: ' + e.message); }
console.log(hard.length ? `HARD FAIL: ${hard.length}` : 'HARD CHECKS OK');
process.exit(hard.length ? 1 : 0);
