// B2 (PGS review): every rolled squad keeps at least capRoom (+12) of growth room over its starting ratings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClubs } from '../js/core/clubs.js';
import { makeRng } from '../js/core/rng.js';
import { capSum } from '../js/core/ability.js';
import { SEASON } from '../js/data/season.js';

test('start-squad cap floor: capSum(P) >= ratings + capRoom for every player, 200 seeds', () => {
  assert.equal(SEASON.capRoom, 12);
  let n = 0, tight = 0;
  for (let s = 0; s < 200; s++) {
    for (const c of makeClubs(makeRng(`floor${s}|clubs`), SEASON)) {
      for (const p of c.squad) {
        const sum = p.bp + p.bs + p.spd + p.bsk;
        const cap = capSum(p.potential);
        assert.ok(cap >= sum + SEASON.capRoom, `${p.id} seed ${s}: cap ${cap} < ${sum} + ${SEASON.capRoom}`);
        if (cap - sum < SEASON.capRoom + 4) tight++;
        n++;
      }
    }
  }
  assert.equal(n, 200 * 10 * 10);
  assert.ok(tight < n, 'floor is a floor, not the norm');
});
