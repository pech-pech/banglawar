// WC: Warm Crowd replaces Big Voice on Hype (SPEC 6/11, [M]). Node data, effective(s).hype.warmCrowd, mods adapter. The +7 payout is the perk's test.
import test from 'node:test'; import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { NODES } from '../js/data/wheelmeta.js';
import { effective } from '../js/core/wheelmeta.js';
import { neutralMods, modsFor, modsFromSim, simFromRanks } from '../js/core/wheels/common.js';
import { hypeDial } from '../js/core/wheels/hype.js';

const on = (f) => { const was = FLAGS.wheelMeta; FLAGS.wheelMeta = true; try { return f(); } finally { FLAGS.wheelMeta = was; } };
const st = (owned) => ({ wheelMeta: { owned, spokes: 0, spent: 0, tally: 0, tokens: {} } });

test('sp_hyp_n is Warm Crowd: hype_high_plus per_rank 1, Hype only, text', () => {
  const n = NODES.find((x) => x.id === 'sp_hyp_n');
  assert.equal(n.name, 'Warm Crowd'); assert.equal(n.effect.type, 'hype_high_plus'); assert.equal(n.effect.per_rank, 1);
  assert.deepEqual([...n.effect.scope], ['hype']); assert.equal(n.words, 'A HIGH +6 Hype landing pays +7.');
  assert.ok(!NODES.some((x) => x.name === 'Big Voice'));
});
test('effective: hype.warmCrowd 0 neutral, 1 when owned (any rank), no Hype width', () => {
  assert.equal(on(() => effective(st({}))).hype.warmCrowd, 0);
  for (const r of [1, 2]) { const e = on(() => effective(st({ sp_hyp_n: r }))); assert.equal(e.hype.warmCrowd, 1); assert.equal(e.hype.rareAdd, 0); }
  assert.equal(effective(st({ sp_hyp_n: 2 })).hype.warmCrowd, 0, 'flag off = neutral');
  const e = on(() => effective(st({ sp_hyp_n: 1 }))); for (const w of ['toss', 'pep', 'find']) assert.equal(e[w].rareAdd, 0);
});
test('mods: warmCrowd on Hype only, both adapter paths; sim drops the Hype width', () => {
  assert.ok(!('warmCrowd' in neutralMods()), 'absent = 0: wheels in state carry mods, a 0 key would drift the T19 classic hash');
  const e = on(() => effective(st({ sp_hyp_n: 1 })));
  assert.equal(modsFor(e, 'hype').warmCrowd, 1); assert.ok(!modsFor(e, 'toss').warmCrowd); assert.equal(modsFor(e, 'hype').rareAdd, 0);
  assert.ok(!('warmCrowd' in modsFor(on(() => effective(st({}))), 'hype')));
  const E = simFromRanks({ sp_hyp_n: 2 }); assert.equal(E.rw_by.hype, undefined);
  assert.equal(modsFor(E, 'hype').warmCrowd, 1); assert.ok(!modsFromSim(E, 'pep').warmCrowd); assert.equal(modsFromSim(E, 'hype').rareAdd, 0);
  assert.ok(!modsFor(simFromRanks({}), 'hype').warmCrowd);
  // widths do not change: the dial with Warm Crowd equals the plain dial slice for slice
  const odds = [40, 30, 20, 10], a = hypeDial(odds), b = hypeDial(odds, modsFor(E, 'hype'));
  assert.deepEqual(b.slices.map((s) => [s.kind, s.w, s.pts]), a.slices.map((s) => [s.kind, s.w, s.pts]));
});
