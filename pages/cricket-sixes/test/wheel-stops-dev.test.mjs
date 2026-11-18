// G1 (wheel settings guards): a stored stop reopens on the slice / result it was recorded with, whatever Dev values change afterwards
// (tick lead glideDeg, cycle length PULSE_PERIOD, wheel speed). Big wheel: recordStop + wheel-view storedStop/landedIndex. Match wheel: WheelOver replays the stored slice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { FLAGS } from '../js/data/flags.js';
import { recordStop, storedStop as storedOf, spinKeyOf } from '../js/core/wheel-stops.js';
import { storedStop as viewStored, landedIndex, pulseStop, sliceIndexAt } from '../js/ui/wheel-view.js';
import { suggestedBowler } from '../js/store/wheelmatch-store.js';
import { matchBallOf } from '../js/store/spins/match.js';
import { matchPhys } from '../js/core/wheelmatch.js';
import { WHEEL_ENGINE } from '../js/data/wheel-engine.js';
import { newGame, step } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const withFlags = (flags, fn) => { const old = {}; for (const k of Object.keys(flags)) { old[k] = FLAGS[k]; FLAGS[k] = flags[k]; } try { return fn(); } finally { for (const k of Object.keys(old)) FLAGS[k] = old[k]; } };

test('big wheel: stored stop reopens on its sliceId under any phys (glideDeg, PULSE_PERIOD, W0)', () => {
  const widths = [10, 20, 30, 15, 25], C0 = 100, cum = [0]; widths.forEach((w, i) => cum.push(cum[i] + w));
  const P0 = { W0: WHEEL_ENGINE.W0, D: WHEEL_ENGINE.D };
  const phys = [P0, { ...P0, glideDeg: [30, 30] }, { ...P0, glideDeg: [120, 120] }, { ...P0, PULSE_PERIOD: 3, PULSE_FROM: 1.9 }, { ...P0, PULSE_PERIOD: 12, PULSE_FROM: 7.6 }, { ...P0, W0: P0.W0 * 2 }];
  let differs = 0;
  for (const t of [3.4, 3.9, 4.6, 7.3]) {
    const rec = pulseStop(P0, 12.5, t, 0.5, cum, C0), n = {};
    recordStop(n, 'spot', 'k', { ...rec.stop, value: 5 });
    const nn = clone(n); // save + load
    for (const P of phys) {
      const st = viewStored(storedOf(nn, 'spot', 'k')); // reopen: the stored entry, no phys read
      assert.equal(st.sliceId, rec.stop.sliceId);
      assert.equal(landedIndex(null, st, widths.length), rec.stop.sliceId);
      if (pulseStop(P, 12.5, t, 0.5, cum, C0).stop.sliceId !== rec.stop.sliceId) differs++;
    }
  }
  assert.ok(differs > 0, 'sensitivity: a fresh landing under other phys does change the slice (so the stored read is what holds it)');
});

function toBowl(seed) {
  return withFlags({ wheelMatch: true }, () => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'bowl' && g++ < 200) step(st); return st.get(); });
}
test('match wheel: after Dev lead / cycle / speed change, reopen gives the same slice, balls and result', () => {
  const s = toBowl('g1dev'), bw = suggestedBowler(s);
  const a = C(s, 'WheelOver', { bowler: bw, stop: { t: 3.5, phi: 2.25 } });
  const key = spinKeyOf(s, 'match', { ball: matchBallOf(0, s.inn1.over) });
  const rec = storedOf(a, 'match', key).stops[0];
  const killed = clone({ ...s, wheels: a.wheels }); // saved in the STOP dispatch, over not yet advanced
  const devs = [{ on: true, matchLeadMin: 30, matchLeadMax: 30 }, { on: true, matchLeadMin: 120, matchLeadMax: 120 }, { on: true, matchCycle: 3 }, { on: true, matchCycle: 12 }, { on: true, matchW0: 60, matchLeadMin: 90, matchLeadMax: 100, matchCycle: 9 }];
  for (const patch of devs) {
    const d = C(killed, 'SetDev', { patch });
    assert.equal(d.dev.on, true);
    const A = matchPhys(d), B = matchPhys(killed);
    assert.ok(A.glideDeg !== B.glideDeg || A.PULSE_PERIOD !== B.PULSE_PERIOD || A.W0 !== B.W0, 'the Dev patch really changes phys');
    for (const p of [{ bowler: bw, stop: { t: 1.1, phi: 7.7 } }, { auto: true }]) {
      const b = C(d, 'WheelOver', p);
      assert.equal(b.last.wheel.segId, a.last.wheel.segId);
      assert.deepEqual(b.last.balls, a.last.balls);
      assert.equal(b.last.wheel.runs, a.last.wheel.runs); assert.equal(b.last.wheel.wk, a.last.wheel.wk);
      assert.deepEqual(storedOf(b, 'match', key).stops, [rec], 'still the one stop, unchanged');
    }
  }
});
