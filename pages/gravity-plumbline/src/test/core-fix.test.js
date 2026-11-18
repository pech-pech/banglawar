'use strict';
require('../parts/core.js');
const PL = globalThis.PL;
const assert = require('assert');
const room = (o) => Object.assign({
  w: 800, h: 600, start: { x: 100, y: 289, g: 2 }, exit: { x: 700, y: 50 },
  walls: [[0, 300, 800, 40]], crumbles: [], gates: [], crushers: [], spikes: [],
}, o);
let n = 0;
const t = (name, f) => { f(); n++; console.log('ok -', name); };

t('crusher squeezing grounded bob kills it', () => {
  const s = PL.newState(room({ crushers: [{ r: [60, 150, 80, 20], ax: 0, ay: 1, amp: 140, phase: 0 }] }));
  assert(s.grounded, 'spawn grounded');
  let died = false;
  for (let i = 0; i < 400 && !died; i++) { PL.step(s, []); died = s.dead > 0; }
  assert(died, 'bob must die');
  assert(s.y < 300, 'bob not teleported through floor');
});

t('gate passes at 130 px/s without death', () => {
  const s = PL.newState(room({ start: { x: 100, y: 100, g: 2 }, walls: [[0, 500, 800, 40]], gates: [{ r: [60, 200, 80, 30], dir: 2 }] }));
  s.vy = 130;
  let min = 1e9;
  for (let i = 0; i < 120; i++) { PL.step(s, []); assert(!s.dead, 'dead at tick ' + i); min = Math.min(min, s.vy); }
  assert(s.y > 230, 'passed through gate, y=' + s.y);
});

t('double flip in one tick costs once', () => {
  const s = PL.newState(room());
  PL.step(s, [{ k: 'flip', dir: 1 }, { k: 'flip', dir: 3 }]);
  assert.strictEqual(s.flips, 2);
  assert.strictEqual(s.charges, 1);
});

t('buffered flip applied free within 10 ticks', () => {
  // airborne, no charges, floor 10 ticks-ish away
  const s = PL.newState(room({ start: { x: 100, y: 200, g: 2 } }));
  s.charges = 0; s.grounded = false;
  PL.step(s, [{ k: 'flip', dir: 1 }]);
  assert(s.pending && s.pending.dir === 1);
  let applied = false;
  for (let i = 0; i < 9 && !applied; i++) { PL.step(s, []); if (s.flips === 1) applied = true; }
  // force landing within window instead: place bob just above floor
  const r = PL.newState(room({ start: { x: 100, y: 285, g: 2 } }));
  r.grounded = false; r.charges = 0;
  PL.step(r, [{ k: 'flip', dir: 1 }]);
  assert(r.pending || r.flips === 1);
  for (let i = 0; i < 10 && r.flips < 1; i++) PL.step(r, []);
  assert.strictEqual(r.flips, 1, 'flip applied on landing');
  assert.strictEqual(r.charges, 2, 'free: charges refilled, none spent');
  // expiry: pending gone after 11 ticks
  const e = PL.newState(room({ start: { x: 100, y: 100, g: 2 } }));
  e.charges = 0; e.grounded = false;
  PL.step(e, [{ k: 'flip', dir: 1 }]);
  for (let i = 0; i < 9; i++) PL.step(e, []);
  assert(e.pending, 'still pending at age 10');
  PL.step(e, []);
  assert.strictEqual(e.pending, null, 'expired at age 11');
});

t('spike death', () => {
  const s = PL.newState(room({ spikes: [{ r: [80, 280, 40, 20] }] }));
  PL.step(s, []);
  assert(s.dead > 0);
});

t('crumble timer is 42 ticks', () => {
  const s = PL.newState(room({ walls: [], crumbles: [[0, 300, 800, 40]] }));
  let trig = -1, done = -1;
  for (let i = 0; i < 200 && done < 0; i++) {
    PL.step(s, []);
    if (trig < 0 && s.crumbleS[0].st === 1) { trig = i; assert.strictEqual(s.crumbleS[0].timer, 42); }
    if (s.crumbleS[0].st === 2) done = i;
  }
  assert(trig >= 0 && done >= 0);
  assert.strictEqual(done - trig, 42);
});

t('hash stable across two runs', () => {
  const rm = room({ crushers: [{ r: [500, 100, 60, 20], ax: 0, ay: 1, amp: 40, phase: 1 }] });
  const log = [{ tick: 5, k: 'flip', dir: 1 }, { tick: 30, k: 'dive', dir: 0 }, { tick: 60, k: 'flip', dir: 2 }];
  const a = PL.replay(rm, log), b = PL.replay(rm, log);
  assert.strictEqual(a.hash, b.hash);
  assert(a.hash.length > 10);
});

console.log(n + ' passed');
