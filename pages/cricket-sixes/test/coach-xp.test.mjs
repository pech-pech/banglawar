import test from 'node:test'; import assert from 'node:assert/strict';
import { xpToNext, netsXp, matchXp, payXp, stepLoop } from '../js/core/coach-xp.js';
import { XP_PER_STEP } from '../js/data/coach-weekly.js';
import { game, K } from './_tr2-fixture.mjs';

const draft = (o = {}) => ({ coaches: [K({ xp: 0, xpTotal: 0, stepsXp: 0, stepUpPending: 0, ...o })], report: { jobs: { xp: { nets: 0, match: 0, study: 0, scout: 0 } } } });

test('T4.1 nets pays 10 strong in focus, 5 otherwise', () => {
  const s = game({ coaches: [K({ strong: ['bat'] })], plan: { focus: 'bat', effort: 'normal' } });
  assert.equal(netsXp(s, 'k1'), 10);
  const w = game({ coaches: [K({ strong: ['bowl'] })], plan: { focus: 'bat', effort: 'normal' } });
  assert.equal(netsXp(w, 'k1'), 5);
  const n = draft(); payXp(n, 'k1', netsXp(s, 'k1'), 'nets');
  assert.equal(n.coaches[0].xp, 10); assert.equal(n.coaches[0].xpTotal, 10); assert.equal(n.report.jobs.xp.nets, 10);
});
test('T4.2 / T4.4 zero amount pays nothing', () => {
  const n = draft(); assert.equal(payXp(n, 'k1', 0, 'nets'), 0);
  assert.equal(n.coaches[0].xp, 0); assert.equal(n.report.jobs.xp.nets, 0);
});
test('T4.3 match loss 6, win 12', () => { assert.equal(matchXp(false), 6); assert.equal(matchXp(true), 12); });
test('T4.6 away coach pays 0', () => {
  const s = game({ coaches: [K({ away: 2 })] }); assert.equal(netsXp(s, 'k1'), 0);
  const n = draft({ away: 2 }); payXp(n, 'k1', 12, 'study');
  assert.equal(n.coaches[0].xp, 0); assert.equal(n.coaches[0].xpTotal, 0); assert.equal(n.report.jobs.xp.study, 0);
});
test('T4.7 full bar gives +1 step, overflow carries', () => {
  const cost = xpToNext(4), n = draft({ step: 4, xp: cost - 5 });
  assert.equal(payXp(n, 'k1', 12, 'study'), 1);
  const c = n.coaches[0]; assert.equal(c.step, 5); assert.equal(c.xp, 7); assert.equal(c.stepsXp, 1); assert.equal(c.stepUpPending, 1);
});
test('T4.8 payout 500 loops steps, xp conserved', () => {
  const n = draft({ step: 4 }); const g = payXp(n, 'k1', 500, 'study'), c = n.coaches[0];
  let left = 500, st = 4; while (xpToNext(st) !== null && left >= xpToNext(st)) { left -= xpToNext(st); st++; }
  assert.equal(c.step, st); assert.equal(g, st - 4); assert.equal(c.xp, left); assert.equal(c.stepUpPending, g); assert.equal(c.xpTotal, 500);
  const sum = XP_PER_STEP.slice(3, st - 1).reduce((a, b) => a + b, 0); assert.equal(sum + c.xp, 500);
});
test('T4.9 S+ pays 0 and stays xp 0; step capped at 21', () => {
  assert.equal(xpToNext(21), null);
  const n = draft({ step: 21 }); payXp(n, 'k1', 50, 'study');
  assert.equal(n.coaches[0].xp, 0); assert.equal(n.coaches[0].xpTotal, 0);
  const m = draft({ step: 20 }); payXp(m, 'k1', 5000, 'study'); assert.equal(m.coaches[0].step, 21); assert.equal(m.coaches[0].xp, 0);
  assert.equal(stepLoop({ step: 21, xp: 99 }), 0);
});
test('corrupt xp is clamped on read', () => {
  const n = draft({ step: 4, xp: 'x' }); payXp(n, 'k1', 3, 'nets'); assert.equal(n.coaches[0].xp, 3);
  const m = draft({ step: 4, xp: 99999 }); payXp(m, "k1", 1, "nets"); assert.equal(m.coaches[0].step, 5); assert.equal(m.coaches[0].xp, 0); /* clamped to cost-1, then +1 */
});

test('D1 Balanced: both-strong coach gets 75% quality and 10 nets XP', async () => {
  const { coachQuality } = await import('../js/core/training.js');
  const s = game({ coaches: [K({ strong: ['bat', 'bowl'] })], plan: { focus: 'bal', effort: 'normal' } }); s.training.coach_id = 'k1';
  const full = game({ coaches: [K({ strong: ['bat', 'bowl'] })], plan: { focus: 'bat', effort: 'normal' } }); full.training.coach_id = 'k1';
  assert.ok(coachQuality(full) > 0);
  assert.ok(Math.abs(coachQuality(s) - 0.75 * coachQuality(full)) < 1e-9);
  assert.equal(netsXp(s, 'k1'), 10);
});
test('D2 Balanced: single-skill coach unchanged (quality 0, XP 5)', async () => {
  const { coachQuality } = await import('../js/core/training.js');
  for (const st of [['bat'], ['bowl']]) {
    const s = game({ coaches: [K({ strong: st })], plan: { focus: 'bal', effort: 'normal' } }); s.training.coach_id = 'k1';
    assert.equal(coachQuality(s), 0); assert.equal(netsXp(s, 'k1'), 5);
  }
});
