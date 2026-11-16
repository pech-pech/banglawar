// Token offers on the stop-path match-day wheels read the RING the wheel landed on (pending.index is a ring index), not the old dial / reveal wheel.
import test from 'node:test'; import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { makeRng } from '../js/core/rng.js';
import { tokenOptions, useToken } from '../js/core/wheelmeta.js';
import { hypeRing, hypeDial, hypeAtStop } from '../js/core/wheels/hype.js';
import { tossRing, tossAtStop } from '../js/core/wheels/toss.js';
import { pepRing, pepAtStop } from '../js/core/wheels/pep.js';
import { revealWheel } from '../js/core/wheels/reveal.js';

const st = () => ({ v: 7, seed: 'r', season: { n: 1 }, fixture: { kind: 'league', round: 1 }, salt: '', wheelMeta: { tally: 0, spokes: 0, spent: 0, owned: {}, tokens: { respin: 3, nudge: 3, two: 3, wild: 3, lift: 3 }, tokUsed: {}, matchTokUsed: { key: '', n: 0 } }, wheelCraft: { owned: {} } });
const on = (f) => { FLAGS.wheelMeta = true; try { return f(); } finally { FLAGS.wheelMeta = false; } };
const kinds = (s, w, p) => tokenOptions(s, w, p, { matchKey: 'k' }).map((o) => o.kind);

test('hype: ring slice results get offers by their ring value; gold gets none; nudge is offered', () => on(() => {
  const ring = hypeRing(), dial = hypeDial([20, 40, 30, 10]);
  for (let i = 0; i < ring.length; i++) {
    const r = { ...hypeAtStop(makeRng('h' + i), ring, { sliceId: ring[i].id }), ring, wheel: dial };
    const k = kinds(st(), 'hype', r), row = ring[r.index];
    if (row.gold) assert.deepEqual(k, [], 'gold ring slice ' + row.label);
    else if (row.value < 5) assert.ok(k.includes('respin') && k.includes('lift'), 'low ring slice ' + row.label + ' -> ' + k);
  }
  const L = ring.length, lowI = ring.findIndex((r, i) => !r.gold && r.value < 5 && [(i + 1) % L, (i - 1 + L) % L].some((j) => !ring[j].gold && ring[j].value > r.value));
  assert.ok(lowI >= 0, 'fixture: a low ring slice with a better non-gold neighbour');
  const r = { ...hypeAtStop(makeRng('n'), ring, { sliceId: ring[lowI].id }), ring, wheel: dial };
  assert.ok(kinds(st(), 'hype', r).includes('nudge'), 'nudge on a low ring slice with a better neighbour');
}));

test('hype: using Nudge / Spin Again keeps a ring index and ring value', () => on(() => {
  const ring = hypeRing(), dial = hypeDial([20, 40, 30, 10]);
  const low = ring.findIndex((r) => !r.gold && r.value < 5);
  const r = { ...hypeAtStop(makeRng('u'), ring, { sliceId: ring[low].id }), ring, wheel: dial };
  for (const kind of ['nudge', 'respin']) {
    const o = useToken(st(), 'hype', kind, r, makeRng('t' + kind), true, { matchKey: 'k' }).pending;
    assert.ok(o.index >= 0 && o.index < ring.length && o.pts === ring[o.index].value && !ring[o.index].gold, kind + ' ' + o.index + '/' + o.pts);
    assert.ok(o.pts >= r.pts);
  }
}));

test('toss and pep: ring results read the ring (5% / 10% gold and top rows get nothing, low rows do)', () => on(() => {
  const tr = tossRing(), pr = pepRing();
  for (let i = 0; i < tr.length; i++) {
    const r = { ...tossAtStop(makeRng('t' + i), tr, { sliceId: i }), ring: tr, wheel: revealWheel('toss', {}) }, k = kinds(st(), 'toss', r);
    if (tr[i].gold) assert.deepEqual(k, [], 'toss gold ' + tr[i].label); else if (tr[i].value < 5) assert.ok(k.includes('respin'), 'toss ' + tr[i].label);
  }
  for (let i = 0; i < pr.length; i++) {
    const r = { ...pepAtStop(makeRng('p' + i), pr, { sliceId: i }), ring: pr, wheel: revealWheel('pep', {}) }, k = kinds(st(), 'pep', r);
    if (pr[i].gold) assert.deepEqual(k, [], 'pep gold ' + pr[i].label);
  }
}));
