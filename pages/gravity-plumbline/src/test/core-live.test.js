// node core-live.test.js : S1 tick constants are live (read from PL.C at attempt start, not at load),
// frozen per attempt (snapshot in state.K), replay with snapshot, death cause, golden hash at defaults.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const P = path.join(__dirname, '..', 'parts');
const ctx = vm.createContext({ console, Math });
ctx.globalThis = ctx;
for (const f of ['core', 'rooms', 'tpl1', 'tpl2']) vm.runInContext('(function(){' + fs.readFileSync(path.join(P, f + '.js'), 'utf8') + '\n})()', ctx, { filename: f });
const PL = ctx.PL;
const DEF = JSON.parse(JSON.stringify(PL.C));
let fails = 0, n = 0;
function t(name, fn) {
  try { fn(); n++; console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + e.message); }
  finally { for (const k of Object.keys(PL.C)) if (!(k in DEF)) delete PL.C[k]; Object.assign(PL.C, DEF); }
}
const room = (o) => Object.assign({
  w: 800, h: 600, start: { x: 100, y: 289, g: 2 }, exit: { x: 700, y: 50 },
  walls: [[0, 300, 800, 40]], crumbles: [], gates: [], crushers: [], spikes: [],
}, o);
const run = (s, n, inp) => { for (let i = 0; i < n; i++) PL.step(s, i === 0 && inp ? inp : []); return s; };

t('new PL.C ids exist with F2 defaults', () => {
  assert.strictEqual(PL.C.CRUSHER_PERIOD, 2.4); assert.strictEqual(PL.C.SPIKE_SHRINK, 3);
  assert.strictEqual(PL.C.EXIT_R, 18); assert.strictEqual(PL.C.CRUSH_OVERLAP, 1);
});
t('derived ticks at defaults equal the old frozen values', () => {
  const K = PL.newState(room()).K;
  assert.deepStrictEqual([K.CRUMBLE_TICKS, K.DEAD_TICKS, K.BUFFER_TICKS, K.DIVE_CD_TICKS, K.DIVE_BOOST_TICKS, K.RIDE_TICKS, K.COYOTE_TICKS], [42, 36, 10, 60, 36, 30, 7]);
  assert.strictEqual(K.HALF, 11);
});
t('CRUMBLE_T changed before attempt start is used (was frozen at load)', () => {
  PL.C.CRUMBLE_T = 0.5;
  const s = PL.newState(room({ start: { x: 100, y: 200, g: 2 }, crumbles: [[60, 250, 80, 10]] }));
  for (let i = 0; i < 200 && s.crumbleS[0].st === 0; i++) PL.step(s, []);
  assert.strictEqual(s.crumbleS[0].timer, 60);
});
t('PL.C change mid-attempt does not affect the running attempt', () => {
  const s = PL.newState(room({ start: { x: 100, y: 200, g: 2 }, crumbles: [[60, 250, 80, 10]] }));
  PL.C.CRUMBLE_T = 0.5; PL.C.G = 2400;
  for (let i = 0; i < 200 && s.crumbleS[0].st === 0; i++) PL.step(s, []);
  assert.strictEqual(s.crumbleS[0].timer, 42);
  assert.strictEqual(s.K.G, 1500);
});
t('RESPAWN_T, DIVE_CD, DIVE_BOOST_T live', () => {
  PL.C.RESPAWN_T = 0.5; PL.C.DIVE_CD = 0.25; PL.C.DIVE_BOOST_T = 0.1;
  const s = PL.newState(room());
  PL.step(s, [{ k: 'dive' }]);
  assert.strictEqual(s.diveCd, 29); assert.strictEqual(s.diveBoost, 11);
  const d = PL.newState(room({ spikes: [{ r: [90, 270, 20, 20] }] }));
  PL.step(d, []); assert.strictEqual(d.dead, 60);
});
t('BUFFER and COYOTE_T live', () => {
  PL.C.BUFFER = 0.2; PL.C.COYOTE_T = 0.15;
  const K = PL.newState(room()).K;
  assert.strictEqual(K.BUFFER_TICKS, 24); assert.strictEqual(K.COYOTE_TICKS, 18);
});
t('WALL_RIDE_T live', () => { PL.C.WALL_RIDE_T = 0.5; assert.strictEqual(PL.newState(room()).K.RIDE_TICKS, 60); });
t('HALF live: bob rests HALF above the floor', () => {
  PL.C.HALF = 8;
  const s = run(PL.newState(room({ start: { x: 100, y: 200, g: 2 } })), 120);
  assert(Math.abs(s.y - 292) < 1e-6, 'y=' + s.y);
});
t('EXIT_R live', () => {
  const r = room({ start: { x: 100, y: 289, g: 2 }, exit: { x: 125, y: 289 } });
  assert(!run(PL.newState(r), 1).won, 'default 18: 25 px away is not a win');
  PL.C.EXIT_R = 30; assert(run(PL.newState(r), 1).won, 'EXIT_R 30 wins');
});
t('SPIKE_SHRINK live', () => {
  const r = room({ spikes: [{ r: [109, 270, 20, 20] }] }); // bob right edge 111: overlap 2 px < 3 shrink
  assert(!run(PL.newState(r), 1).dead, 'default shrink 3 survives');
  PL.C.SPIKE_SHRINK = 0; assert(run(PL.newState(r), 1).dead, 'shrink 0 dies');
});
t('CRUSHER_PERIOD live via PL.crusherRect', () => {
  const c = { r: [0, 0, 10, 10], ax: 1, ay: 0, amp: 10, phase: 0 };
  const quarter = Math.round(0.6 * 120); // 0.6 s = quarter of 2.4
  assert(Math.abs(PL.crusherRect(c, quarter, PL.newState(room()).K)[0] - 10) < 1e-9);
  PL.C.CRUSHER_PERIOD = 1.2;
  assert(Math.abs(PL.crusherRect(c, quarter, PL.newState(room()).K)[0] - 0) < 1e-9);
  assert.strictEqual(typeof PL.crusherRect(c, 0)[0], 'number', 'K optional (defaults to PL.C)');
});
t('CRUSH_OVERLAP live', () => {
  const mk = () => room({ crushers: [{ r: [60, 150, 80, 20], ax: 0, ay: 1, amp: 140, phase: 0 }] });
  let a = PL.newState(mk()), ta = 0; while (!a.dead && ta < 400) { PL.step(a, []); ta++; }
  PL.C.CRUSH_OVERLAP = 4;
  let b = PL.newState(mk()), tb = 0; while (!b.dead && tb < 400) { PL.step(b, []); tb++; }
  assert(a.dead && b.dead && tb > ta, 'ta ' + ta + ' tb ' + tb);
});
t('G, CAP, CHARGES still live (read at attempt start)', () => {
  PL.C.CHARGES = 4; assert.strictEqual(PL.newState(room()).charges, 4);
  PL.C.G = 2000; const s = PL.newState(room({ start: { x: 100, y: 100, g: 2 } })); PL.step(s, []);
  assert(Math.abs(s.vy - 2000 / 120) < 1e-9);
});
t('death cause: spike / crush / edge', () => {
  assert.strictEqual(run(PL.newState(room({ spikes: [{ r: [90, 270, 20, 20] }] })), 1).cause, 'spike');
  const c = PL.newState(room({ crushers: [{ r: [60, 150, 80, 20], ax: 0, ay: 1, amp: 140, phase: 0 }] }));
  while (!c.dead && c.t < 400) PL.step(c, []);
  assert.strictEqual(c.cause, 'crush');
  const e = PL.newState(room({ walls: [], start: { x: 100, y: 500, g: 2 } }));
  while (!e.dead && e.t < 400) PL.step(e, []);
  assert.strictEqual(e.cause, 'edge');
  assert.strictEqual(PL.newState(room()).cause, '');
});
t('replay with snapshot is deterministic when tuned; snapshot is not PL.C', () => {
  const r = PL.buildRooms(1)[0];
  PL.C.G = 1800; PL.C.CAP = 800;
  const s = PL.newState(r), log = [{ tick: 0, k: 'flip', dir: 1 }, { tick: 1, k: 'dive' }, { tick: 20, k: 'flip', dir: 2 }];
  let i = 0; while (s.t < 400 && !s.won && !s.dead) { const inp = []; while (i < log.length && log[i].tick <= s.t) inp.push(log[i++]); PL.step(s, inp); }
  const snap = s.K.snap;
  assert.strictEqual(snap.G, 1800); assert(!('DT' in snap) || snap.DT === PL.C.DT);
  Object.assign(PL.C, DEF);
  const rep = PL.replay(r, log, snap);
  assert.strictEqual(rep.state.t, s.t); assert.strictEqual(rep.hash, PL.hash(s));
  assert.notStrictEqual(PL.replay(r, log).hash, PL.hash(s), 'without snapshot uses defaults');
});
t('PL.simSnapshot returns sim values only, frozen copy', () => {
  const a = PL.simSnapshot(); PL.C.G = 1900;
  assert.strictEqual(a.G, 1500); assert.strictEqual(PL.simSnapshot().G, 1900);
});
t('hash does not include K (same as before for defaults)', () => {
  const h = PL.hash(PL.newState(room()));
  assert(!/\[object/.test(h)); assert.strictEqual(h.split(',').length, 19);
});
// fixtures/golden-rooms.json = pre-S1 tutorial trio + 20 templates (+ mirrors) frozen from git HEAD rooms/tpl
// (rooms.js is edited by other slices; the fixture keeps this check about core only). Digest computed with the
// pre-S1 core.js (git HEAD) on the same fixture: 460 runs, 83 wins, 8058 deaths.
t('golden digest at defaults equals pre-S1 core on frozen rooms (4d7d5a7a...)', () => {
  const rooms = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-rooms.json'), 'utf8'));
  const h = crypto.createHash('sha256'); let runs = 0, wins = 0, deaths = 0;
  for (const room of rooms) for (let sd = 1; sd <= 10; sd++) {
    const rng = PL.mulberry32(sd * 977 + runs), s = PL.newState(room), log = [];
    for (let k = 0; k < 1500 && !s.won; k++) {
      const x = rng(); const inp = x < 0.03 ? [{ k: 'flip', dir: Math.floor(rng() * 4) }] : x < 0.045 ? [{ k: 'dive' }] : [];
      for (const i of inp) log.push({ tick: s.t, k: i.k, dir: i.dir });
      PL.step(s, inp); if (s.events.includes('death')) deaths++; if (k % 10 === 0) h.update(PL.hash(s) + s.events.join());
    }
    if (s.won) wins++; h.update('R' + PL.replay(room, log).hash); runs++;
  }
  assert.deepStrictEqual([runs, wins, deaths], [460, 83, 8058]);
  assert.strictEqual(h.digest('hex'), '4d7d5a7a33444b369ca1cd376e0daad1582afb6d68c124a30f91ad4b4b728146');
});
console.log(fails ? fails + ' FAILED' : n + ' passed');
process.exit(fails ? 1 : 0);
