// Wheel meta w1 fix round 1: tokens on the STORED pending shape ({week, careful, wheel, result}); never on gold (Spotlight and Course); the token result really changes the stored result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { FLAGS } from '../js/data/flags.js';
import { emptyWheelMeta } from '../js/core/save-migrate.js';
import { courseWheel } from '../js/core/training.js';
import { metaWheel, tokenOptions, useToken } from '../js/core/wheelmeta.js';
import { newGame, step } from './_season-bot.mjs';

const withFlag = (on, fn) => { const old = FLAGS.wheelMeta; FLAGS.wheelMeta = on; try { return fn(); } finally { FLAGS.wheelMeta = old; } };
const untilTrain = (seed) => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'train' && g++ < 3000 && step(st)); return st.get(); };
const TOK = { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 };
const spotSpun = (seed) => { const s0 = untilTrain(seed), s1 = C(s0, 'SetTrainPlan', { spotlightId: s0.clubs[0].squad[0].id }); const s2 = { ...s1, wheelMeta: { ...emptyWheelMeta(), tokens: { ...TOK }, tokSeason: 1, owned: { f_extra: 1 } } }; return C(s2, 'Spin', { careful: true }); };

test('Spotlight: a gold result in the stored shape offers no token (every gold index) and UseToken leaves the state alone', () => {
  withFlag(true, () => {
    const s = spotSpun('fix1a'), w = s.training.pending.wheel;
    for (const gi of (w.golds && w.golds.length ? w.golds : [w.jackpotIndex])) {
      const g = { ...s, training: { ...s.training, pending: { ...s.training.pending, result: { ...s.training.pending.result, index: gi, gain: w.slices[gi], jackpot: true } } } };
      assert.deepEqual(sel.tokenVM(g, 'spot').options, [], 'tokenVM empty on gold ' + gi);
      assert.deepEqual(sel.trainingVM(g).spotlight.tokens, [], 'training VM tokens empty on gold ' + gi);
      assert.equal(tokenOptions(g, 'spot', g.training.pending).length, 0);
      for (const kind of ['respin', 'two', 'nudge', 'lift']) assert.equal(C(g, 'UseToken', { wheel: 'spot', kind, careful: true }), g, kind + ' blocked on gold');
    }
  });
});

test('Course: a gold result in the stored shape offers no token (every gold index) and UseToken leaves the state alone', () => {
  withFlag(true, () => {
    const s0 = spotSpun('fix1b'), w = metaWheel(courseWheel(), 'course', s0), golds = w.golds && w.golds.length ? w.golds : [w.jackpotIndex];
    assert.ok(golds.length >= 2, 'extra gold slice present (f_extra owned)');
    for (const gi of golds) {
      const g = { ...s0, training: { ...s0.training, coursePending: { coachId: 'x', careful: true, wheel: w, result: { index: gi, gain: w.slices[gi], jackpot: true } } } };
      assert.deepEqual(sel.tokenVM(g, 'course').options, [], 'course tokens empty on gold ' + gi);
      for (const kind of ['respin', 'two', 'nudge', 'lift']) assert.equal(C(g, 'UseToken', { wheel: 'course', kind, careful: true }), g, kind + ' blocked on gold');
    }
    // not gold: offered
    const ng = w.slices.findIndex((_v, i) => !golds.includes(i)), p = { index: ng, gain: w.slices[ng], jackpot: false };
    const o = { ...s0, training: { ...s0.training, coursePending: { coachId: 'x', careful: true, wheel: w, result: p } } };
    assert.ok(sel.tokenVM(o, 'course').options.length > 0, 'offered on a normal stop');
  });
});

test('Spotlight: a token on the stored result changes the stored result when it can (never worse), and the count drops', () => {
  withFlag(true, () => {
    let seen = 0;
    for (let k = 0; k < 8 && !seen; k++) {
      const s = spotSpun('fix1c' + k), r0 = s.training.pending.result; if (r0.jackpot) continue;
      const o = sel.tokenVM(s, 'spot').options.find((x) => x.kind === 'lift'); if (!o) continue;
      const u = C(s, 'UseToken', { wheel: 'spot', kind: 'lift', careful: true }), r1 = u.training.pending.result;
      assert.ok(r1.gain > r0.gain, 'lift adds'); assert.equal(u.training.pending.tokUsed, 1); assert.equal(u.wheelMeta.tokens.lift, 0); seen++;
      assert.equal(sel.trainingVM(u).spotlight.pending.gain, r1.gain, 'the view reads the new gain');
    }
    assert.ok(seen, 'at least one non-gold stop in 8 seeds');
  });
});

test('tokenVM options carry the count left (and the Spotlight uses left)', () => {
  withFlag(true, () => {
    for (let k = 0; k < 8; k++) {
      const s = spotSpun('fix1d' + k); if (s.training.pending.result.jackpot) continue;
      const v = sel.tokenVM(s, 'spot'); assert.ok(v.options.length); for (const o of v.options) { assert.equal(typeof o.count, 'number'); assert.ok(o.count >= 1); assert.equal(o.left, 2); } return;
    }
    assert.fail('no non-gold stop found');
  });
});

test('useToken: both the flat shape and the stored shape work', () => {
  withFlag(true, () => {
    const s = spotSpun('fix1e'), p = s.training.pending, flat = { ...p.result, wheel: p.wheel };
    if (!p.result.jackpot) assert.deepEqual(tokenOptions(s, 'spot', p).map((o) => o.kind), tokenOptions(s, 'spot', flat).map((o) => o.kind));
    assert.equal(useToken(s, 'spot', 'respin', { ...flat, index: p.wheel.golds ? p.wheel.golds[0] : p.wheel.jackpotIndex, jackpot: true }, { random: () => 0.5 }).s, s);
  });
});
