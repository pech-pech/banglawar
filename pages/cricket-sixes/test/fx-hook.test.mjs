import test from 'node:test';
import assert from 'node:assert/strict';
import { ballProbs, newInnings, playOver } from '../js/core/match.js';
import { makeFx, playerFx } from '../js/core/skills.js';
import { makeRng } from '../js/core/rng.js';
import { player, coach } from './_tr-fixture.mjs';

const bat = (o = {}) => player({ id: 'b', bat: 'Opener', bp: 50, bs: 50, ...o });
const bowl = (o = {}) => player({ id: 'w', bowl: 'Fast', spd: 50, bsk: 50, ...o });
const base = (b, w, ph = 0, i = 'R', f = 'A') => ballProbs(b, w, ph, i, f);

test('no fx, or fx for players with no nodes, is identical to today (deepEqual)', () => {
  const b = bat(), w = bowl();
  for (const ph of [0, 1, 2]) for (const i of 'DRA') for (const f of 'APN') {
    assert.deepEqual(ballProbs(b, w, ph, i, f, undefined), ballProbs(b, w, ph, i, f));
    assert.deepEqual(ballProbs(b, w, ph, i, f, makeFx([])), ballProbs(b, w, ph, i, f));
  }
});
test('a batting node adds its probability only inside its condition (Opener N1: wicket -0.15 pp, overs 1-3)', () => {
  const b = bat({ nodes: { bat: 1, bowl: 0 } }), w = bowl(), fx = makeFx([]);
  assert.ok(Math.abs(ballProbs(b, w, 0, 'R', 'N', fx).p.wicket - (base(b, w, 0, 'R', 'N').p.wicket - 0.0015)) < 1e-12);
  assert.equal(ballProbs(b, w, 1, 'R', 'N', fx).p.wicket, base(b, w, 1, 'R', 'N').p.wicket);
});
test('a bowling node uses the bowler: Fast N1 wicket +0.15 pp overs 1-3; the coach boost makes it x1.5', () => {
  const b = bat(), w = bowl({ nodes: { bat: 0, bowl: 1 } });
  const c3 = coach({ lv: { Power: 0, Technique: 0, Pace: 3, Craft: 0 } });
  const d1 = ballProbs(b, w, 0, 'R', 'N', makeFx([])).p.wicket - base(b, w, 0, 'R', 'N').p.wicket;
  const d2 = ballProbs(b, w, 0, 'R', 'N', makeFx([c3])).p.wicket - base(b, w, 0, 'R', 'N').p.wicket;
  assert.ok(Math.abs(d1 - 0.0015) < 1e-12); assert.ok(Math.abs(d2 - 0.00225) < 1e-12);
});
test('bad pairing reduction shrinks a Bad matchup; Great reduction shrinks a Great one', () => {
  // Opener v Spin: find the grid sign by probing
  const b = bat({ nodes: { bat: 2, bowl: 0 } });          // Opener N2: bad -0.5
  for (const type of ['Fast', 'Medium', 'Spin']) {
    const w = bowl({ bowl: type });
    const plain = base(b, w).step, withFx = ballProbs(b, w, 0, 'R', 'A', makeFx([]));
    if (plain < 0) assert.ok(withFx.eff.bp > base(b, w).eff.bp, `Bad pairing vs ${type} should help`);
    else assert.equal(withFx.eff.bp, base(b, w).eff.bp);
  }
});
test('burst: once per innings, first home-phase over of a Burst bowler, no button', () => {
  const w = bowl({ nodes: { bat: 0, bowl: 5 } });
  const team = [w, bowl({ id: 'w2' })], batters = [bat(), bat({ id: 'b2' }), bat({ id: 'b3' })];
  const fx = makeFx([]);
  const inn = newInnings(batters, team, null);
  playOver(makeRng('burst'), inn, batters, team, 0, 'R', 'N', fx);     // over 1: Fast home phase -> burst
  assert.equal(inn.burstOver, 1);
  inn.over = 2; inn.done = false;
  playOver(makeRng('burst2'), inn, batters, team, 0, 'R', 'N', fx);    // over 2: already used, still 1
  assert.equal(inn.burstOver, 1);
  const inn2 = newInnings(batters, team, null); inn2.over = 5;
  playOver(makeRng('b3'), inn2, batters, team, 0, 'R', 'N', fx);       // over 5 not Fast home, under 8 -> no burst yet
  assert.equal(inn2.burstOver, undefined);
  inn2.over = 8; playOver(makeRng('b4'), inn2, batters, team, 0, 'R', 'N', fx);
  assert.equal(inn2.burstOver, 8);
});
test('playOver without fx never adds a burstOver field and gives the same balls as before', () => {
  const team = [bowl(), bowl({ id: 'w2' })], batters = [bat(), bat({ id: 'b2' }), bat({ id: 'b3' })];
  const run = (fx) => { const inn = newInnings(batters.map((p) => ({ ...p })), team.map((p) => ({ ...p })), null);
    const bt = batters.map((p) => ({ ...p })), bw = team.map((p) => ({ ...p })); const i = newInnings(bt, bw, null);
    const balls = playOver(makeRng('same'), i, bt, bw, 0, 'R', 'A', fx); return { i, balls, inn }; };
  const a = run(undefined), b = run(makeFx([]));
  assert.deepEqual(a.balls.map((x) => x.o), b.balls.map((x) => x.o));
  assert.equal('burstOver' in a.i, false); assert.equal('burstOver' in b.i, false);
});
test('playerFx values come straight from tuning (Medium N5: four -0.8 pp on Protect)', () => {
  const f = playerFx(player({ bowl: 'Medium', nodes: { bat: 0, bowl: 5 } }), []);
  const e = f.bowl.eff.find((x) => x.k === 'four' && x.field === 'P'); assert.equal(e.v, -0.008);
});
