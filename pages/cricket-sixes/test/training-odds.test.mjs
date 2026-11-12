import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { drillOdds, rollDrill, rollOutcome, doDrill, canDrill } from '../js/core/training.js';
import { game, player, coach, me, fixed, makeRng } from './_tr-fixture.mjs';

const TUNING = '/mnt/project-files/games-design/cricket-sixes/2026-11-12/data/tuning.json';
const rows = existsSync(TUNING) ? JSON.parse(readFileSync(TUNING, 'utf8')).training.drill_odds.table : null;

test('drillOdds equals all 30 rows of tuning.json training.drill_odds.table', { skip: rows ? false : 'tuning.json not mounted' }, () => {
  assert.equal(rows.length, 30);
  for (const r of rows) assert.deepEqual(drillOdds(r.nets, r.coach_focus), { okay: r.okay, good: r.good, great: r.great }, `nets ${r.nets} coach ${r.coach_focus}`);
});
test('drillOdds follows the formula Quality = 3(nets-1) + 4 coach, and sums to 100', () => {
  for (let n = 1; n <= 5; n++) for (let c = 0; c <= 5; c++) {
    const q = 3 * (n - 1) + 4 * c, o = drillOdds(n, c);
    assert.equal(o.okay, 60 - q); assert.equal(o.good, 30 + q / 2); assert.equal(o.great, 10 + q / 2);
    assert.equal(o.okay + o.good + o.great, 100);
  }
});
test('headline set-ups from parts/07: 60/30/10, 42/39/19, 28/46/26', () => {
  assert.deepEqual(drillOdds(1, 0), { okay: 60, good: 30, great: 10 });
  assert.deepEqual(drillOdds(3, 3), { okay: 42, good: 39, great: 19 });
  assert.deepEqual(drillOdds(5, 5), { okay: 28, good: 46, great: 26 });
});
test('roll boundaries: x < okay is Okay, x < okay+good is Good, else Great; gain 1/2/3', () => {
  const o = drillOdds(1, 0); // 60 / 30 / 10
  assert.deepEqual(rollOutcome(o, 0), { outcome: 'Okay', gain: 1 });
  assert.equal(rollOutcome(o, 59.999).outcome, 'Okay');
  assert.deepEqual(rollOutcome(o, 60), { outcome: 'Good', gain: 2 });
  assert.equal(rollOutcome(o, 89.999).outcome, 'Good');
  assert.deepEqual(rollOutcome(o, 90), { outcome: 'Great', gain: 3 });
  assert.equal(rollOutcome(o, 99.999).gain, 3);
});
test('20000 seeded rolls per cell land within 3 sigma of the table (30 cells)', () => {
  const N = 20000;
  for (let n = 1; n <= 5; n++) for (let c = 0; c <= 5; c++) {
    const rng = makeRng(`odds|${n}|${c}`), o = drillOdds(n, c), got = { Okay: 0, Good: 0, Great: 0 };
    for (let i = 0; i < N; i++) got[rollDrill(rng, n, c).outcome]++;
    for (const [k, want] of [['Okay', o.okay], ['Good', o.good], ['Great', o.great]]) {
      const p = want / 100, sd = Math.sqrt(N * p * (1 - p));
      assert.ok(Math.abs(got[k] - N * p) <= 3 * sd, `nets ${n} coach ${c} ${k}: ${got[k]} vs ${N * p} +-${(3 * sd).toFixed(0)}`);
    }
  }
});
test('doDrill: a Good roll adds 2 to the chosen rating, costs 15 TP, marks the week, never mutates input', () => {
  const s = game(); const before = JSON.stringify(s);
  const t = doDrill(s, { playerId: 'p1', drillId: 'bp' }, fixed(0.7)); // x=70 -> Good at 60/30/10
  assert.equal(JSON.stringify(s), before);
  assert.equal(me(t).bp, 32); assert.equal(me(t).bs, 30);
  assert.equal(t.training.tp, 435); assert.equal(t.training.drilled.p1, true);
  assert.equal(me(t).drillsHere, 1);
  assert.equal(t.training.last.outcome, 'Good'); assert.equal(t.training.last.gain, 2);
});
test('one drill per player per week; not enough TP is refused; invalid commands return the same state', () => {
  const s = doDrill(game(), { playerId: 'p1', drillId: 'bp' }, fixed(0.1));
  assert.equal(doDrill(s, { playerId: 'p1', drillId: 'bs' }, fixed(0.1)), s);
  assert.equal(canDrill(s, 'p1', 'bs').reason, 'week');
  const poor = game({ tp: 14 });
  assert.equal(doDrill(poor, { playerId: 'p1', drillId: 'bp' }, fixed(0.1)), poor);
  assert.equal(canDrill(poor, 'p1', 'bp').reason, 'tp');
  assert.equal(doDrill(game(), { playerId: 'nobody', drillId: 'bp' }, fixed(0.1)).training.tp, 450);
  assert.equal(doDrill(game(), { playerId: 'p1', drillId: 'zz' }, fixed(0.1)).training.tp, 450);
});
test('coach focus and nets change the odds used; best matching coach earns XP equal to the points produced', () => {
  const c = coach({ lv: { Power: 3, Technique: 0, Pace: 0, Craft: 0 }, xp: { Power: 70, Technique: 0, Pace: 0, Craft: 0 } });
  const s = game({ coaches: [c], nets: 3 });
  const t = doDrill(s, { playerId: 'p1', drillId: 'bp' }, fixed(0.41)); // 42/39/19 -> x=41 Okay
  assert.deepEqual(t.training.last.odds, { okay: 42, good: 39, great: 19 });
  assert.equal(t.training.last.outcome, 'Okay');
  assert.equal(t.coaches[0].xp.Power, 71);
  const u = doDrill(s, { playerId: 'p1', drillId: 'bs' }, fixed(0.41)); // Technique: coach has no level there -> 54/33/13 at nets 3
  assert.deepEqual(u.training.last.odds, { okay: 54, good: 33, great: 13 });
  assert.equal(u.coaches[0].xp.Technique, 0);
});
test('same seed gives the same drill result', () => {
  const run = () => doDrill(game(), { playerId: 'p1', drillId: 'spd' }, makeRng('season|drill|1|p1|salt')).training.last;
  assert.deepEqual(run(), run());
});
