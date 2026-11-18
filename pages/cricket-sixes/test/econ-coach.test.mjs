// Checker: Balanced nets with a coach strong in BOTH bat and bowl = 75% quality + 10 nets XP.
import test from 'node:test'; import assert from 'node:assert/strict';
import { coachQuality, coachStepInUse, setPlan } from '../js/core/training.js';
import { netsXp } from '../js/core/coach-xp.js';
import { game, K } from './_tr2-fixture.mjs';

const Q = 0.95;
const g = (focus, strong, step = 8) => setPlan(game({ coaches: [K({ strong, step })] }), { focus, effort: 'normal', coachId: 'k1' });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('both-strong coach on Balanced: 75% quality, 10 XP', () => {
  const s = g('bal', ['bat', 'bowl']);
  near(coachQuality(s), 0.75 * Q * 8);
  assert.equal(netsXp(s, 'k1'), 10);
});
test('both-strong coach on Bat / Bowl: full quality, 10 XP (unchanged)', () => {
  for (const f of ['bat', 'bowl']) { const s = g(f, ['bat', 'bowl']); near(coachQuality(s), Q * 8); assert.equal(netsXp(s, 'k1'), 10); }
});
test('single-skill coach on Balanced: quality 0, XP 5 (unchanged)', () => {
  for (const st of [['bat'], ['bowl']]) { const s = g('bal', st); assert.equal(coachQuality(s), 0); assert.equal(netsXp(s, 'k1'), 5); }
});
test('single-skill coach on own focus: full quality, 10 XP; off focus: 0 / 5', () => {
  const a = g('bat', ['bat']); near(coachQuality(a), Q * 8); assert.equal(netsXp(a, 'k1'), 10);
  const b = g('bowl', ['bat']); assert.equal(coachQuality(b), 0); assert.equal(netsXp(b, 'k1'), 5);
});
test('step in use scales with 75% factor, no coach picked gives 0', () => {
  assert.equal(coachStepInUse(g('bal', ['bat', 'bowl'], 8)), 6);
  const s = setPlan(game({ coaches: [K()] }), { focus: 'bal', effort: 'normal' });
  assert.equal(coachQuality(s), 0);
});
test('away both-strong coach on Balanced pays 0 XP', () => {
  const s = setPlan(game({ coaches: [K({ away: 2 })] }), { focus: 'bal', effort: 'normal' });
  assert.equal(netsXp(s, 'k1'), 0);
});
