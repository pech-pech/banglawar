// P14 P6 (LUCK-AUDIT 2026-11-13 section 5): luck = actual minus the probabilities the engine really rolled, so over many
// seeded matches actual and expected runs must agree. If a later ballProbs change makes the engine roll something other than
// the pr.p it records (which the report cannot see), this drifts and fails loudly.
// Drives the real engine like the audit's luck_audit_engine_run.mjs: NewGame + StartMatch, skilled bot, expected() from b.pr.p.
// Seeds p14d-0..p14d-199; seeded RNG only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../js/store/commands.js';
import { bowlVM, chaseVM } from '../js/store/selectors.js';
import { skilledBowler, skilledField, skilledIntent } from '../js/core/skilled.js';
import { expected } from '../js/report/metrics.js';

// SD = 11 runs is the sd of (actual - expected) per innings ([sim] LUCK-AUDIT chase luck; re-measured on 2,000 matches seeds
// p14x-*: chase 11.0, bowl 11.7, mean -0.11 a match). Bowl + chase together is two innings, so its sd is 11 * sqrt(2) (~15.6;
// measured 15.9). Each innings is held to 3 sd at 11, and the bowl + chase total to 3 sd at 11 * sqrt(2).
const N = 200, SD = 11;
const runsOf = (balls) => balls.reduce((a, x) => a + (typeof x.o === 'number' ? x.o : 0), 0);

function playOne(seed) {
  let s = applyCommand(applyCommand(null, 'NewGame', { seed }), 'StartMatch', {});
  const r = { b: 0, c: 0 }, xr = { b: 0, c: 0 }; let overs = 0, guard = 0;
  while (s.stage !== 'done') {
    if (guard++ > 100) throw new Error('match did not finish: ' + seed);
    const k = s.stage === 'bowl' ? 'b' : 'c';
    if (s.stage === 'bowl') {
      s = applyCommand(s, 'MakeCall', { bowler: skilledBowler(s, bowlVM(s)), field: skilledField(s) });
      s = applyCommand(s, 'BowlOver', {});
    } else if (s.stage === 'break') { s = applyCommand(s, 'StartChase', {}); continue; }
    else if (s.stage === 'chase') s = applyCommand(s, 'BowlOver', { intent: skilledIntent(s, chaseVM(s)) });
    else throw new Error('unexpected stage ' + s.stage + ' for ' + seed);
    const b = s.last.balls;
    assert.ok(b.length && b.every((x) => x.pr && x.pr.p), 'every ball carries the probabilities it was rolled from');
    r[k] += runsOf(b); xr[k] += expected(b).xr; overs++;
  }
  return { r, xr, overs };
}

test('P14 P6: actual minus expected runs over 200 seeded engine matches stays within 3 sd of 0 (bowl, chase, both)', () => {
  const r = { b: 0, c: 0 }, xr = { b: 0, c: 0 }; let overs = 0;
  for (let i = 0; i < N; i++) {
    const m = playOne('p14d-' + i); overs += m.overs;
    for (const k of ['b', 'c']) { r[k] += m.r[k]; xr[k] += m.xr[k]; }
  }
  assert.ok(overs >= N * 10, 'bowl and chase overs were played: ' + overs);
  const check = (name, act, exp, sd) => {
    const drift = act - exp, limit = 3 * sd * Math.sqrt(N);
    assert.ok(Math.abs(drift) <= limit, `${name} run luck drifted: actual ${act} - expected ${exp.toFixed(1)} = ${drift.toFixed(1)} (limit ${limit.toFixed(1)})`);
  };
  check('bowl', r.b, xr.b, SD);
  check('chase', r.c, xr.c, SD);
  check('bowl + chase', r.b + r.c, xr.b + xr.c, SD * Math.SQRT2);
});
