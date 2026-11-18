'use strict';
require('../parts/core.js');
const PL = globalThis.PL;
const assert = require('assert');
const room = (o) => Object.assign({
  w: 800, h: 700, start: { x: 100, y: 289, g: 2 }, exit: { x: 790, y: 5 },
  walls: [[0, 300, 800, 40]], crumbles: [], gates: [], crushers: [], spikes: [],
}, o);
let n = 0;
const t = (name, f) => { f(); n++; console.log('ok -', name); };

const wallRoom = () => room({ start: { x: 289, y: 50, g: 2 }, walls: [[0, 600, 800, 40], [300, 0, 40, 600]] });

t('constants present', () => { assert.strictEqual(PL.C.WALL_RIDE_T, 0.25); assert.strictEqual(PL.C.COYOTE_T, 0.06); });

t('wall-ride refills +1 once per solid per airborne period', () => {
  const s = PL.newState(wallRoom());
  s.charges = 0;
  let rides = 0, first = -1;
  for (let i = 0; i < 400 && !s.grounded; i++) {
    PL.step(s, []);
    if (s.events.includes('ride')) { rides++; if (first < 0) first = i; }
    if (rides === 1 && s.events.length === 0) assert.strictEqual(s.charges, 1, 'charge stays at 1 (no second refill)');
  }
  assert.strictEqual(rides, 1, 'exactly one ride event');
  assert(first >= 29 && first <= 31, 'refill after ~0.25 s, tick ' + first);
  // landing resets
  assert(s.grounded && s.charges === 2 && s.rideUsed.length === 0 && s.rideT === 0);
});

t('wall-ride needs continuous contact (ceiling counts, brief touch does not)', () => {
  const s = PL.newState(room({ start: { x: 100, y: 200, g: 0 }, walls: [[0, 100, 800, 40]] })); // g up, ceiling is gravity side
  const w = PL.newState(room({ start: { x: 100, y: 200, g: 2 }, walls: [[0, 100, 800, 40], [0, 600, 800, 40]] }));
  w.charges = 0; w.vy = -300; // thrown up into the ceiling, bounces off, no sustained contact
  for (let i = 0; i < 40; i++) PL.step(w, []);
  assert.strictEqual(w.rideUsed.length, 0, 'bounce is not a ride');
  assert(s && s.charges === 2);
});

const ledge = () => room({ start: { x: 100, y: 289, g: 2 }, walls: [[0, 300, 150, 40]], h: 800 });
function walkOff(k) {
  const s = PL.newState(ledge());
  s.charges = 0; s.vx = 500;
  while (s.grounded) PL.step(s, []);
  s.charges = 0;
  assert.strictEqual(s.coyote, 7);
  for (let i = 0; i < k; i++) PL.step(s, []);
  PL.step(s, [{ k: 'flip', dir: 1 }]);
  return s;
}

t('coyote flip is free within 0.06 s of walking off a ledge', () => {
  for (let k = 0; k <= 6; k++) {
    const s = walkOff(k);
    assert.strictEqual(s.flips, 1, 'flip ok after ' + k + ' ticks');
    assert.strictEqual(s.charges, 0, 'free: charges untouched');
    assert.strictEqual(s.pending, null);
  }
});

t('coyote flip not allowed after 8 ticks', () => {
  const s = walkOff(7);
  assert.strictEqual(s.flips, 0);
  assert(s.pending && s.pending.dir === 1, 'buffered instead');
});

t('coyote dive is free, and flip/dive does not grant coyote', () => {
  const s = PL.newState(ledge());
  s.charges = 0; s.vx = 500;
  while (s.grounded) PL.step(s, []);
  s.charges = 0;
  PL.step(s, [{ k: 'dive' }]);
  assert(s.events.includes('dive') && s.charges === 0 && s.coyote === 0);
  const f = PL.newState(ledge());
  PL.step(f, [{ k: 'flip', dir: 1 }]); // grounded flip into open air: not a ledge walk-off
  assert.strictEqual(f.coyote, 0);
  const idx = f.coyote;
  PL.step(f, []); assert.strictEqual(f.coyote, idx);
});

t('hash covers new counters, is stable, replay equal', () => {
  const r = wallRoom();
  const log = [{ tick: 5, k: 'dive', dir: 0 }, { tick: 40, k: 'flip', dir: 3 }];
  const a = PL.replay(r, log), b = PL.replay(r, log);
  assert.strictEqual(a.hash, b.hash);
  const s = PL.newState(r); let i = 0;
  while (s.t < a.state.t && !s.won && !s.dead) {
    const inp = []; while (i < log.length && log[i].tick <= s.t) { inp.push({ k: log[i].k, dir: log[i].dir }); i++; }
    PL.step(s, inp);
  }
  assert.strictEqual(PL.hash(s), a.hash);
  const h1 = PL.hash(PL.newState(r)), s2 = PL.newState(r); s2.rideT = 3;
  assert.notStrictEqual(PL.hash(s2), h1); s2.rideT = 0; s2.coyote = 2;
  assert.notStrictEqual(PL.hash(s2), h1);
});

console.log(n + ' tests passed');
