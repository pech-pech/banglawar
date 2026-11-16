// A2.11m: the match wheel (WheelOver, js/store/spins/match.js) records each STOP via recordStop in the same dispatch (CONTRACT-A s6/s7,
// wheels SPEC 2d / 13, SPEC test 9 pure part): reload before STOP = unspun, nothing stored; a stored spin is never re-rolled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { suggestedBowler } from '../js/store/wheelmatch-store.js';
import { FLAGS } from '../js/data/flags.js';
import { spinKeyOf, storedStop, statsOf } from '../js/core/wheel-stops.js';
import { matchKeyOf } from '../js/core/wheelmeta.js';
import { cycleOf } from '../js/core/wheel-pulse.js';
import { matchBallOf } from '../js/store/spins/match.js';
import { newGame, step } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const reload = clone; // save + load
const withFlags = (flags, fn) => { const old = {}; for (const k of Object.keys(flags)) { old[k] = FLAGS[k]; FLAGS[k] = flags[k]; } try { return fn(); } finally { for (const k of Object.keys(old)) FLAGS[k] = old[k]; } };
const W = (s, p) => C(s, 'WheelOver', p);
const AUTO = { auto: true };
const keyOf = (s) => spinKeyOf(s, 'match', { ball: matchBallOf(s.stage === 'chase' ? 1 : 0, (s.stage === 'chase' ? s.inn2 : s.inn1).over) });
const segIdxOf = (n) => n.last.wheel.segs.findIndex((g) => g.id === n.last.wheel.segId);

function toBowl(seed) {
  return withFlags({ wheelMatch: true }, () => {
    const st = newGame(seed); let g = 0;
    while (st.get().stage !== 'bowl' && g++ < 200) step(st);
    return st.get();
  });
}
const S0 = toBowl('a211m');

test('spin key: matchKeyOf|ball, ball = innings x 10 + over (1..20)', () => {
  assert.equal(matchBallOf(0, 1), 1); assert.equal(matchBallOf(0, 10), 10); assert.equal(matchBallOf(1, 1), 11); assert.equal(matchBallOf(1, 10), 20);
  assert.ok(matchKeyOf(S0));
  assert.equal(keyOf(S0), `${matchKeyOf(S0)}|1`);
});

test('aimed STOP: record {stopT, cycle, tInCycle, sliceId, value, auto:false, respin:0} written in the same dispatch', () => {
  const s = S0, key = keyOf(s);
  assert.equal(storedStop(s, 'match', key), null);
  const a = W(s, { bowler: suggestedBowler(s), stop: { t: 3.5, phi: 2.25 } });
  const e = storedStop(a, 'match', key);
  assert.ok(e, 'record written');
  assert.equal(e.stops.length, 1); assert.equal(e.kept, 0); assert.equal(e.spent, false);
  const r = e.stops[0], idx = segIdxOf(a), seg = a.last.wheel.segs[idx];
  assert.deepEqual(Object.keys(r).sort(), ['auto', 'cycle', 'respin', 'sliceId', 'stopT', 'tInCycle', 'value']);
  assert.equal(r.stopT, 3500); assert.equal(r.cycle, 1); assert.equal(r.tInCycle, 3.5); // derived by cycleOf from stopT
  assert.equal(r.sliceId, idx); assert.equal(r.value, seg.value); assert.equal(r.auto, false); assert.equal(r.respin, 0);
  const st = statsOf(a, 'match');
  assert.equal(st.n, 1); assert.equal(st.early, 0); assert.equal(st.late, 0);
  assert.equal(st.careful, a.wheelLog.at(-1).careful ? 1 : 0); // match careful = wheel-match SPEC 14 (tick slice)
  assert.deepEqual(st.taps, [{ cycle: 1, tInCycle: 3.5 }]);
});

test('aimed STOP: view-sent stopT / cycle / tInCycle are stored as sent; missing ones derive from cycleOf(stopT)', () => {
  const s = S0, key = keyOf(s), bw = suggestedBowler(s);
  const a = W(s, { bowler: bw, stop: { t: 3.5, phi: 2.25, stopT: 9512, cycle: 2, tInCycle: 3.512 } });
  assert.deepEqual(storedStop(a, 'match', key).stops[0], { stopT: 9512, cycle: 2, tInCycle: 3.512, sliceId: segIdxOf(a), value: a.last.wheel.segs[segIdxOf(a)].value, auto: false, respin: 0 });
  const b = W(s, { bowler: bw, stop: { t: 2, phi: 1, stopT: 8100 } }), c = cycleOf(8.1);
  const rb = storedStop(b, 'match', key).stops[0];
  assert.equal(rb.cycle, c.cycle); assert.equal(rb.cycle, 2); assert.ok(Math.abs(rb.tInCycle - c.tInCycle) < 1e-12);
  assert.equal(statsOf(b, 'match').early, 1); // 2.1 s in the cycle
  // the stored timing never changes the landing: same t/phi with or without the extra fields lands the same over
  const plain = W(s, { bowler: bw, stop: { t: 3.5, phi: 2.25 } });
  assert.deepEqual({ ...a, wheels: null }, { ...plain, wheels: null });
});

test('Auto spin: record auto:true; stats count n only (no careful / early / late / taps)', () => {
  const a = W(S0, AUTO), r = storedStop(a, 'match', keyOf(S0)).stops[0];
  assert.equal(r.auto, true); assert.equal(r.respin, 0); assert.equal(r.sliceId, segIdxOf(a));
  assert.deepEqual(statsOf(a, 'match'), { n: 1, careful: 0, early: 0, late: 0, taps: [] });
});

test('reload before STOP: no record, ball unspun, no token spent', () => {
  const s = reload(S0), bw = suggestedBowler(s);
  const n = W(s, { bowler: bw }); // SPIN pressed, no STOP yet: nothing to dispatch but a stop-less payload
  assert.equal(n, s);
  assert.equal(storedStop(n, 'match', keyOf(n)), null);
  assert.equal(n.inn1.over, S0.inn1.over);
  assert.deepEqual(n.wheelMeta, S0.wheelMeta); // matchTokUsed / tokUsed untouched
  assert.deepEqual(statsOf(n, 'match'), { n: 0, careful: 0, early: 0, late: 0, taps: [] });
});

test('kill after STOP, reload: the stored ball is never re-rolled (result read back, no second record)', () => {
  const s = S0, key = keyOf(s), bw = suggestedBowler(s);
  const a = W(s, { bowler: bw, stop: { t: 3.5, phi: 2.25 } });
  // a save written in the STOP dispatch but holding the pre-STOP over (worst case): any later STOP or Auto replays the stored slice
  const killed = reload({ ...s, wheels: a.wheels });
  for (const p of [{ bowler: bw, stop: { t: 1.1, phi: 7.7 } }, AUTO, { bowler: bw, stop: { t: 5.9, phi: 0.3 } }]) {
    const b = W(killed, p);
    assert.equal(b.last.wheel.segId, a.last.wheel.segId); assert.deepEqual(b.last.balls, a.last.balls);
    assert.equal(b.last.wheel.runs, a.last.wheel.runs); assert.equal(b.last.wheel.wk, a.last.wheel.wk);
    assert.equal(b.last.wheel.auto, false); assert.deepEqual(b.inn1, a.inn1);
    assert.deepEqual(storedStop(b, 'match', key), storedStop(a, 'match', key)); // still one stop
    assert.equal(statsOf(b, 'match').n, 1);
  }
  // after the dispatch the save holds both the record and the next over: the over is never spun again
  const after = reload(a);
  assert.equal(after.inn1.over, s.inn1.over + 1); assert.notEqual(keyOf(after), key);
});

test('full auto match: one record per spin, keys ball 1..20 distinct, n = spins, nothing in careful / taps', () => {
  let s = S0, g = 0;
  const keys = [];
  while (g++ < 60 && s.stage !== 'done') {
    if (s.stage === 'break') { s = C(s, 'StartChase'); continue; }
    keys.push(keyOf(s)); s = W(s, AUTO);
  }
  assert.equal(s.stage, 'done');
  assert.equal(new Set(keys).size, keys.length); assert.equal(keys.length, s.wheelLog.length);
  const by = s.wheels.stops.match;
  assert.deepEqual(Object.keys(by).sort(), [...keys].sort());
  for (const k of keys) { assert.equal(by[k].stops.length, 1); assert.equal(by[k].stops[0].auto, true); }
  assert.deepEqual(statsOf(s, 'match'), { n: keys.length, careful: 0, early: 0, late: 0, taps: [] });
});

test('non-season quick match (no fixture): spinKeyOf is empty, nothing recorded, result unchanged', () => {
  const q = C(null, 'NewMatch', { seed: 'a211m-q', mode: 'wheel' });
  const n = W(q, AUTO);
  assert.notEqual(n, q); assert.equal(spinKeyOf(q, 'match', { ball: 1 }), '');
  assert.equal(n.wheels && n.wheels.stops && n.wheels.stops.match, undefined);
});
