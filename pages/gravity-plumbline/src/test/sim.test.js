// node sim.test.js : determinism + cap tests. Loads parts/core.js + rooms.js into one vm context.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({ console, Math });
ctx.globalThis = ctx;
for (const f of ['core.js', 'rooms.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'parts', f), 'utf8').replace(/^const PL =/m, 'var PL ='), ctx, { filename: f });
}
const PL = ctx.PL;
let fails = 0;
function t(name, fn) { try { fn(); console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + e.message); } }
const TICKS = 1500;
function script(seed, n) { // tick -> inputs
  const r = PL.mulberry32(seed), m = {};
  for (let k = 0; k < n; k++) {
    const x = r();
    if (x < 0.03) m[k] = [{ k: 'flip', dir: Math.floor(r() * 4) }];
    else if (x < 0.045) m[k] = [{ k: 'dive' }];
  }
  return m;
}
function run(room, sc, opts = {}) {
  const N = opts.ticks || TICKS;
  const s = PL.newState(room), log = [];
  let maxOver = 0;
  for (let k = 0; k < N; k++) {
    const inp = sc[k] || [];
    for (const i of inp) log.push({ tick: s.t, k: i.k, dir: i.dir });
    PL.step(s, inp);
    const cap = s.diveBoost > 0 ? PL.C.DIVE_CAP : PL.C.CAP;
    maxOver = Math.max(maxOver, Math.abs(s.vx) - cap, Math.abs(s.vy) - cap);
    if (opts.onStep) opts.onStep(s);
    if (s.won || s.dead > 0) break;
  }
  return { s, log, hash: PL.hash(s), maxOver };
}
t('same seed -> deep-equal rooms', () => {
  for (const seed of [1, 2, 7, 12345]) assert.deepStrictEqual(PL.buildRooms(seed), PL.buildRooms(seed));
});
t('different seeds differ somewhere', () => {
  const a = JSON.stringify(PL.buildRooms(1)), b = JSON.stringify(PL.buildRooms(2)), c = JSON.stringify(PL.buildRooms(3));
  assert(a !== b || a !== c, 'seed has no effect');
});
t('100 scripted runs per room give identical hash', () => {
  const rooms = PL.buildRooms(1);
  rooms.forEach((room, ri) => {
    const sc = script(99 + ri, TICKS), h0 = run(room, sc).hash;
    for (let i = 0; i < 100; i++) assert.strictEqual(run(PL.buildRooms(1)[ri], sc).hash, h0, 'room ' + (ri + 1) + ' run ' + i);
  });
});
t('replay(log) equals live hash', () => {
  const rooms = PL.buildRooms(1);
  rooms.forEach((room, ri) => {
    for (let sd = 0; sd < 5; sd++) {
      const r = run(room, script(500 + sd * 7 + ri, TICKS));
      const rp = PL.replay(PL.buildRooms(1)[ri], r.log);
      // replay stops at log end + 600 ticks (or win/death); rerun live to the same tick count
      const r2 = run(room, script(500 + sd * 7 + ri, TICKS), { ticks: rp.state.t });
      assert.strictEqual(rp.hash, r2.hash, 'room ' + (ri + 1) + ' script ' + sd);
    }
  });
});
t('speed never exceeds 700 (900 during dive boost)', () => {
  const rooms = PL.buildRooms(1);
  rooms.forEach((room, ri) => {
    for (let sd = 0; sd < 20; sd++) {
      const r = run(room, script(900 + sd * 13 + ri, TICKS));
      assert(r.maxOver <= 1e-6, 'room ' + (ri + 1) + ' script ' + sd + ' over by ' + r.maxOver);
    }
  });
  // long free fall in a flip-heavy script to actually reach cap
  const s = PL.newState(rooms[0]); s.vy = 650; s.grounded = false;
  for (let k = 0; k < 120; k++) { PL.step(s, k === 5 ? [{ k: 'dive' }] : []); }
});
t('flip does not change v (only gravity of next tick applies)', () => {
  const room = PL.buildRooms(1)[0];
  const a = PL.newState(room);
  a.grounded = false; a.y -= 30; a.vx = 100; a.vy = 200; a.airT = 0.05; a.charges = 2;
  const b = JSON.parse(JSON.stringify(a));
  const g2 = (a.g + 1) % 4, D = PL.DIRS[g2], GD = PL.C.G * PL.C.DT;
  const v0 = [a.vx, a.vy];
  PL.step(b, [{ k: 'flip', dir: g2 }]);
  assert.strictEqual(b.g, g2, 'flip not applied');
  assert.strictEqual(b.flips, 1);
  const ex = v0[0] + D[0] * GD, ey = v0[1] + D[1] * GD;
  if (!b.grounded && b.vx !== 0 || true) {
    assert(Math.abs(b.vx - ex) < 1e-6 && Math.abs(b.vy - ey) < 1e-6, `v ${b.vx},${b.vy} expected ${ex},${ey}`);
  }
});
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
