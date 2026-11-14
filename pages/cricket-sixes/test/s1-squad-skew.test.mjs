import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C, squadMax, canAddPlayer } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { makeClubs } from '../js/core/clubs.js';
import { makeRng } from '../js/core/rng.js';
import { SEASON } from '../js/data/season.js';
import { SQUAD, SKEW } from '../js/data/run.js';
import { skewPlayer } from '../js/core/skew.js';
import { recruitList } from '../js/core/recruit.js';
import { capSum } from '../js/core/ability.js';
import { ABILITY } from '../js/data/ability.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const bat = (p) => p.bp + p.bs, bowl = (p) => p.spd + p.bsk;
const atEnd = (s) => ({ ...clone(s), stage: 'end' });

test('s1 new game: rules flag, 8 players, cap 9', () => {
  const s = C(null, 'NewGame', { seed: 'sk1' });
  assert.deepEqual(s.rules, { squadSkew: 1, squadMax: 9 });
  assert.equal(s.clubs[0].squad.length, SKEW.squadStart);
  assert.equal(squadMax(s), 9); assert.equal(canAddPlayer(s).ok, true);
  const old = (({ rules, ...r }) => r)(s); assert.equal(squadMax(old), SQUAD.size);
});

test('s1 start squad = plain roll shifted by batting type; rivals identical', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const raw = makeClubs(makeRng(`${seed}|clubs`), SEASON);
    const s = C(null, 'NewGame', { seed });
    for (let ci = 1; ci < raw.length; ci++) assert.deepEqual(s.clubs[ci].squad, raw[ci].squad, 'rival untouched');
    const plain = SQUAD.startSlots.map((i) => raw[0].squad[i]);
    s.clubs[0].squad.forEach((p, i) => {
      const q = plain[i], k = SKEW[q.bat.toLowerCase()];
      assert.equal(p.bp, Math.max(1, Math.min(99, q.bp + k.bat))); assert.equal(p.spd, Math.max(1, Math.min(99, q.spd + k.bowl)));
      assert.ok(p.potential >= 20 && p.potential <= Math.max(ABILITY.limit, q.potential));
      assert.ok(capSum(p.potential) >= p.bp + p.bs + p.spd + p.bsk + SEASON.capRoom || p.potential === 200, 'cap floor kept');
    });
  }
});

test('s1 skew over many seeds: openers bat better, lower order bowl better, potential top > lower', () => {
  const agg = { Opener: { b: 0, w: 0, p: 0, n: 0 }, Middle: { b: 0, w: 0, p: 0, n: 0 }, Lower: { b: 0, w: 0, p: 0, n: 0 } };
  for (let i = 0; i < 60; i++) for (const p of C(null, 'NewGame', { seed: 'm' + i }).clubs[0].squad) { const a = agg[p.bat]; a.b += bat(p); a.w += bowl(p); a.p += p.potential; a.n++; }
  const av = (r, k) => agg[r][k] / agg[r].n;
  assert.ok(av('Opener', 'b') - av('Lower', 'b') > 20, 'bat gap ~32');
  assert.ok(av('Lower', 'w') - av('Opener', 'w') > 20, 'bowl gap ~32');
  assert.ok(av('Opener', 'p') > av('Lower', 'p') + 15, 'potential gap');
});

test('skewPlayer: middle unchanged; clamps', () => {
  const p = { bat: 'Middle', bp: 50, bs: 50, spd: 50, bsk: 50, potential: 120 };
  assert.deepEqual(skewPlayer(p, 12), p);
  const hi = skewPlayer({ bat: 'Opener', bp: 97, bs: 95, spd: 3, bsk: 5, potential: 180 }, 12);
  assert.equal(hi.bp, 99); assert.equal(hi.spd, 1); assert.ok(hi.potential <= 200 && hi.potential >= 180);
});

test('s1 season-end recruits: 3, one per batting type, deterministic, only at end', () => {
  const s = C(null, 'NewGame', { seed: 'rc' });
  assert.equal(sel.recruitsVM(s).list.length, 0, 'closed outside end');
  const e = atEnd(s), a = recruitList(e), b = recruitList(clone(e));
  assert.deepEqual(a, b); assert.deepEqual(a.map((p) => p.bat), ['Opener', 'Middle', 'Lower']);
  const v = sel.recruitsVM(e); assert.equal(v.list.length, 3); assert.equal(v.full, false); assert.equal(v.max, 9);
  assert.ok(v.list.every((r) => r.wage > 0 && r.name));
  assert.equal(sel.endVM(e).recruits.list.length, 3);
});

test('s1 SignRecruit fills slot 9; second sign same season refused; Pass closes', () => {
  const e = atEnd(C(null, 'NewGame', { seed: 'rc2' }));
  const id = recruitList(e)[0].id;
  const n = C(e, 'SignRecruit', { id });
  assert.equal(n.clubs[0].squad.length, 9); assert.ok(n.clubs[0].squad.some((p) => p.id === id));
  assert.equal(C(n, 'SignRecruit', { id: recruitList(e)[1].id }), n);
  assert.equal(sel.recruitsVM(n).list.length, 0); assert.ok(sel.recruitsVM(n).signed);
  const p = C(e, 'PassRecruit', {}); assert.equal(p.recruit.passed, true); assert.equal(C(p, 'SignRecruit', { id }), p);
});

test('s1 full 9: SignRecruit needs leaveId; that player leaves free', () => {
  const e = atEnd(C(null, 'NewGame', { seed: 'rc3' }));
  e.clubs[0].squad.push({ ...clone(e.clubs[0].squad[0]), id: 'x9', name: 'Ninth' });
  const id = recruitList(e)[2].id;
  assert.equal(C(e, 'SignRecruit', { id }), e, 'no leaveId refused');
  assert.equal(C(e, 'SignRecruit', { id, leaveId: 'nope' }), e);
  const v = sel.recruitsVM(e); assert.equal(v.full, true); assert.equal(v.release.length, 9);
  const coins = e.econ && e.econ.coins;
  const n = C(e, 'SignRecruit', { id, leaveId: 'x9' });
  assert.equal(n.clubs[0].squad.length, 9); assert.ok(!n.clubs[0].squad.some((p) => p.id === 'x9'));
  assert.equal(n.recruit.left, 'Ninth'); if (coins != null) assert.equal(n.econ.coins, coins, 'no fee, no refund');
  assert.equal(n.clubs[0].six.length, 6);
});

test('old save: no recruits, cap 8', () => {
  const s = (({ rules, ...r }) => r)(C(null, 'NewGame', { seed: 'old' }));
  assert.equal(sel.recruitsVM(atEnd(s)), null);
  const e = atEnd(s); assert.equal(C(e, 'SignRecruit', { id: 'r1-0' }), e);
});
