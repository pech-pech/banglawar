import test from 'node:test'; import assert from 'node:assert/strict';
import { runNets, setPlan, spotPaid, netsPreview } from '../js/core/training.js';
import { game, P, makeRng } from './_tr2-fixture.mjs';

test('spotPaid: stochastic rounding is EV-true (x1.2, x1.5 within 0.01 over 20000 rolls), never below the roll, deterministic per seed', () => {
  for (const mult of [1.2, 1.5]) {
    const run = (seed) => { const r = makeRng(seed); let paid = 0, roll = 0; const out = [];
      for (let i = 0; i < 20000; i++) { const k = 1 + (i % 3), p = spotPaid(k, mult, r.random()); assert.ok(p >= k && Number.isInteger(p)); paid += p; roll += k; out.push(p); }
      return { m: paid / roll, out }; };
    const a = run('sp' + mult), b = run('sp' + mult);
    assert.ok(Math.abs(a.m - mult) <= 0.01, `x${mult} mean ${a.m}`);
    assert.deepEqual(a.out, b.out);
  }
  assert.equal(spotPaid(2, 3, 0.99), 6); assert.equal(spotPaid(1, 1.2, 0.19), 2); assert.equal(spotPaid(1, 1.2, 0.2), 1); assert.equal(spotPaid(3, 0.5, 0), 3);
});

test('spot pay stream is its own: the training rng draws and the other players rolls do not move', () => {
  const s = setPlan(game({ plan: { focus: 'bat', effort: 'normal' } }), { spotlightId: 'p3' });
  const w = { index: 0, gain: 1.2, jackpot: false };
  const a = runNets(s, makeRng('x'), { wheel: w }), b = runNets(s, makeRng('x'), { wheel: w });
  assert.deepEqual(a.lines, b.lines);
  const plain = runNets(setPlan(s, { spotlightId: null }), makeRng('x'), {});
  for (const l of a.lines) if (l.id !== 'p3') assert.deepEqual(l, plain.lines.find((x) => x.id === l.id), 'non-spotlight rolls unchanged');
});

test('room cap: the Spotlight paid roll never passes the room', () => {
  const tight = (i) => P(i, { bp: 44, bs: 44 }); // bat focus rating 44, lowest 30 -> room 1
  const s = setPlan(game({ players: [tight(1), ...[2, 3, 4].map((i) => P(i))], plan: { focus: 'bat', effort: 'normal' } }), { spotlightId: 'p1' });
  for (let i = 0; i < 20; i++) { const r = runNets(s, makeRng('c' + i), { wheel: { gain: 3, jackpot: true } }); const l = r.lines.find((x) => x.id === 'p1'); assert.ok(l.toRaw - l.fromRaw <= 1); }
});

test('TP short: a Clinic-boosted player trains first; no boost changes nothing', () => {
  const base = game({ players: [P(1), P(2)], tp: 13, plan: { focus: 'bat', effort: 'normal' } });
  assert.deepEqual(netsPreview(base).trainIds, ['p1']); assert.deepEqual(netsPreview(base).shortIds, ['p2']);
  for (const b of [{}, { p2: { pcts: [], extraRun: false } }]) assert.deepEqual(netsPreview({ ...base, clinic: { boost: b } }).trainIds, ['p1']);
  const s = { ...base, clinic: { boost: { p2: { pcts: [10], extraRun: false } } } };
  assert.deepEqual(netsPreview(s).trainIds, ['p2']); assert.deepEqual(netsPreview(s).shortIds, ['p1']);
  const r = runNets(s, makeRng('b'), {}); assert.deepEqual(r.lines.map((l) => l.id), ['p2']);
  const e = { ...base, clinic: { boost: { p2: { pcts: [], extraRun: true } } } }; assert.deepEqual(netsPreview(e).trainIds, ['p2']);
  assert.deepEqual(netsPreview({ ...base, clinic: 'garbage' }).trainIds, ['p1']);
});
