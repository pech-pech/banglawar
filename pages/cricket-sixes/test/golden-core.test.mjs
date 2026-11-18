import test from 'node:test';
import assert from 'node:assert/strict';
import { GOLDEN } from '../js/data/golden-over.js';
import { windowFor, gradeOf, pickX } from '../js/core/golden-over.js';
import { outcomeFromX } from '../js/core/match.js';
import { makeRng } from '../js/core/rng.js';
import { STEPS } from '../js/core/letters.js';

test('window per letter step: F- .75x, C 1x-ish, S+ 1.375x, Mid default', () => {
  const raw = (step) => STEPS[step - 1].rawFrom;
  assert.deepEqual(windowFor(raw(1)), { p: Math.round(55 * 0.75), g: Math.round(120 * 0.75) });
  assert.deepEqual(windowFor(raw(21)), { p: Math.round(55 * 1.375), g: Math.round(120 * 1.375) });
  assert.deepEqual(windowFor(raw(21), 'Tight'), { p: Math.round(40 * 1.375), g: Math.round(90 * 1.375) });
  assert.deepEqual(windowFor(raw(11), [80, 170]), { p: Math.round(80 * 1.0625), g: Math.round(170 * 1.0625) });
  let last = 0; for (let st = 1; st <= 21; st++) { const w = windowFor(raw(st)); assert.ok(w.p >= last); last = w.p; assert.ok(Number.isInteger(w.p) && Number.isInteger(w.g)); }
  assert.equal(GOLDEN.WINDOW, 'Mid'); assert.equal(GOLDEN.ROLLS, 3);
});
test('grade boundaries', () => {
  const w = { p: 55, g: 120 };
  assert.equal(gradeOf(55, w), 'P'); assert.equal(gradeOf(-55, w), 'P'); assert.equal(gradeOf(56, w), 'G');
  assert.equal(gradeOf(-120, w), 'G'); assert.equal(gradeOf(121, w), 'M'); assert.equal(gradeOf(null, w), 'M'); assert.equal(gradeOf(0, w), 'P');
});
const PR = { p: { wicket: 0.1, six: 0.1, four: 0.1, two: 0.1, single: 0.3 }, singleRaw: 0.3 };
const o = (x) => outcomeFromX(PR.p, PR.singleRaw, x);
const draws = (seed) => { const r = makeRng(seed); return [r.random(), r.random(), r.random()]; };
test('pick rule: G = x0, M = worse of x0,x1, P = best of 3 with floor; always 3 draws', () => {
  for (let i = 0; i < 300; i++) for (const side of ['bat', 'bowl']) {
    const seed = 'k' + i, xs = draws(seed), val = (z) => (side === 'bat' ? (z === 'W' ? -6 : z) : (z === 'W' ? 6 : -z));
    for (const g of ['P', 'G', 'M']) {
      const r = makeRng(seed), x = pickX(g, side)(PR, r), after = r.random();
      assert.equal(after, makeRng(seed).random.call ? (() => { const q = makeRng(seed); q.random(); q.random(); q.random(); return q.random(); })() : 0, 'exactly 3 draws');
      const os = xs.map(o);
      if (g === 'G') assert.equal(x, xs[0]);
      if (g === 'M') assert.equal(val(o(x)), Math.min(val(os[0]), val(os[1])));
      if (g === 'P') {
        let best = Math.max(...os.map(val)), res = o(x);
        if (side === 'bat' && (os.find((q) => val(q) === best) === 'W' || os.find((q) => val(q) === best) === 0)) assert.equal(res, 1);
        else if (side === 'bowl' && [4, 6].includes(os.find((q) => val(q) === best))) assert.equal(res, 2);
        else assert.equal(val(res), best);
        if (side === 'bat') assert.ok(res !== 0 && res !== 'W'); else assert.ok(res !== 4 && res !== 6);
      }
    }
  }
});
