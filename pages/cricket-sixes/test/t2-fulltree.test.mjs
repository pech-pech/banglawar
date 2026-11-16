import test from 'node:test'; import assert from 'node:assert/strict';
import { run } from '../tools/t2-fulltree.mjs';

// SPEC 11c (avg careful, full tree, tokens on, the season and shared token pool of sim/gaps_sim.py): Spotlight 2.60x +-0.1 (2.52x without
// Kind Floor), Course 3.76 steps and 75% gold. Game core for Spotlight / Course (pulse landing, SPEC rings summing 10, Booster / Hot Streak /
// Lift in x units, Kind Floor via perks/kind-floor.js). 3000 Course spins (about 22000 Spotlight spins) keep it quick; tools/t2-fulltree.mjs runs 20000.
test('SPEC 11c full tree + tokens, avg careful: Spotlight 2.60x (2.52x no Kind Floor), Course 3.76 steps, 75% gold', () => {
  const f = run(3000, 11), z = run(3000, 12, { drop: ['f_floor'] });
  console.log('t2-fulltree spot', f.spot.mean.toFixed(3), 'gold', f.spot.gold.toFixed(3), '| no floor', z.spot.mean.toFixed(3), '| course', f.course.mean.toFixed(3), 'gold', f.course.gold.toFixed(3));
  assert.ok(Math.abs(f.spot.mean - 2.60) <= 0.1, 'Spotlight ' + f.spot.mean);
  assert.ok(Math.abs(z.spot.mean - 2.52) <= 0.1, 'Spotlight no Kind Floor ' + z.spot.mean);
  assert.ok(f.spot.mean - z.spot.mean > 0.03 && f.spot.mean - z.spot.mean < 0.15, 'Kind Floor +0.2x adds about 0.08x');
  assert.ok(f.spot.mean < 3.0, 'bug line: Spotlight under 3.0x');
  assert.ok(Math.abs(f.course.gold - 0.75) <= 0.03, 'Course gold ' + f.course.gold);
  assert.ok(Math.abs(f.course.mean - 3.76) <= 0.12, 'Course steps ' + f.course.mean);
});
