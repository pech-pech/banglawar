import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKS, KEYS, createMarks } from '../../pages/ridgeline/src/marks.js';

test('table is ordered and keys match', () => {
  for (let i = 1; i < MARKS.length; i++) assert.ok(MARKS[i].m > MARKS[i - 1].m);
  assert.equal(Object.keys(KEYS).filter((k) => k.startsWith('markDist')).length, 11);
  assert.equal(KEYS.markDist4.def, 2800);
});
test('step fires in distance order, milestone before hull_unlock', () => {
  const m = createMarks({ reached: new Set() });
  const ev = m.step(2900);
  assert.deepEqual(ev.map((e) => e.type + ':' + (e.id || e.hull)), [
    'milestone:first_light', 'milestone:brass_mile', 'milestone:dust_bell', 'milestone:lantern_row', 'hull_unlock:kite']);
  assert.deepEqual(m.step(2950), []);
});
test('two marks in one run fire in order with hull after its own milestone', () => {
  const m = createMarks({ reached: new Set(['first_light', 'brass_mile', 'dust_bell', 'lantern_row', 'dune_crown']) });
  const ev = m.step(9000);
  assert.deepEqual(ev.map((e) => e.type + ':' + (e.id || e.hull)), [
    'milestone:salt_road', 'hull_unlock:anvil', 'milestone:deep_dusk', 'hull_unlock:barge']);
  assert.deepEqual(ev.filter((e) => e.type === 'milestone').map((e) => e.dist), [5500, 8500]);
});
test('already reached marks are silent', () => {
  const m = createMarks({ reached: new Set(['first_light']) });
  assert.deepEqual(m.step(600), []);
});
test('repeats every 5000 m after 20000, no reward', () => {
  const m = createMarks({ reached: new Set(MARKS.map((k) => k.id)) });
  assert.deepEqual(m.step(24999), []);
  const ev = m.step(30500);
  assert.deepEqual(ev.map((e) => e.dist), [25000, 30000]);
  assert.ok(ev.every((e) => e.type === 'milestone' && e.id === 'past_the_lamps'));
  const fresh = createMarks({ reached: new Set() }).step(25100);
  assert.equal(fresh.filter((e) => e.type === 'hull_unlock').length, 4);
  assert.equal(fresh.filter((e) => e.dist === 25000).length, 1);
});
test('nextGoal text', () => {
  const m = createMarks({ reached: new Set() });
  const g = m.nextGoal(5260, []);
  assert.equal(g.text, '240 m to Salt Road, opens Anvil');
  assert.equal(g.remaining, 240);
  assert.equal(g.hull, 'anvil');
  assert.equal(m.nextGoal(5260, ['anvil']).text, '240 m to Salt Road');
  assert.equal(m.nextGoal(100, []).text, '400 m to First Light');
  assert.equal(m.nextGoal(21000, []).text, '4000 m to Past the Lamps');
  assert.equal(m.nextGoal(25000, []).remaining, 5000);
});
test('cfg overrides mark distance', () => {
  const m = createMarks({ reached: new Set() }, { markDist1: 300 });
  assert.equal(m.step(350)[0].dist, 300);
});
