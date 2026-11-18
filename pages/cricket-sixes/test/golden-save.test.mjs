// Captain's Over save: VERSION 8, v7 -> v8 adds golden / goldCal as null, never downgrades, keeps present values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, migrate, unwrap, wrap } from '../js/core/save-migrate.js';
import { loadV7 } from './_v7-fixture.mjs';

test('VERSION is 8', () => assert.equal(VERSION, 8));

test('v7 fixture migrates to v8 with golden and goldCal null', () => {
  const s = loadV7();
  assert.equal(s.v, 8); assert.equal(s.golden, null); assert.equal(s.goldCal, null);
});

test('migrate v7 -> v8 keeps present values and does not mutate the input', () => {
  const base = { stage: 'hub', v: 7, golden: { inn1: null, inn2: null }, goldCal: { offset: 12, n: 10 } };
  const copy = JSON.stringify(base);
  const r = migrate(base, 7);
  assert.ok(r.ok); assert.equal(r.state.v, 8); assert.deepEqual(r.state.goldCal, { offset: 12, n: 10 }); assert.deepEqual(r.state.golden, { inn1: null, inn2: null });
  assert.equal(JSON.stringify(base), copy);
  const r2 = migrate({ stage: 'hub', v: 7 }, 7);
  assert.equal(r2.state.golden, null); assert.equal(r2.state.goldCal, null);
});

test('migration is idempotent and a v8 save is not touched', () => {
  const s = migrate({ stage: 'hub', v: 7 }, 7).state;
  s.goldCal = { offset: -5, n: 10 };
  const again = migrate(s, 8);
  assert.ok(again.ok); assert.deepEqual(again.state.goldCal, { offset: -5, n: 10 }); assert.equal(again.state.v, 8);
});

test('never downgrades: a newer save is refused, envelope round-trips at v8', () => {
  assert.equal(migrate({ stage: 'hub', v: 9 }, 9).ok, false);
  assert.equal(migrate({ stage: 'hub', v: 9 }, 9).reason, 'newer');
  const w = wrap(migrate({ stage: 'hub', v: 7 }, 7).state);
  assert.equal(w.v, 8);
  const u = unwrap(JSON.stringify(w)); assert.ok(u.ok); assert.equal(u.state.golden, null);
  const future = { ...w, v: 9 }; assert.equal(unwrap(JSON.stringify(future)).reason, 'newer');
});
