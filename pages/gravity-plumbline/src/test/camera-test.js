// camera-test.js - node src/test/camera-test.js
// Sweeps bob positions/velocities (4 gravity dirs, room 336x500) on 344x882 and
// 475x638 and asserts: bob fully on screen, fully above the 55% line, frames
// deterministic (60 fps and 120 Hz steps, both with 0.1 s hitches). Prints sight ahead at cap 700 px/s (bob at room centre, settled).
// Measured table (seconds; play = to strip line 0.6H):
//   view     dir    screen s  play s
//   344x882  up     0.89      0.89
//   344x882  right  0.34      0.34
//   344x882  down   1.15      0.44
//   344x882  left   0.34      0.34
//   475x638  up     0.46      0.46
//   475x638  right  0.34      0.34
//   475x638  down   0.63      0.26
//   475x638  left   0.34      0.34
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'parts', 'camera.js'));
const PL = globalThis.PL;

const VIEWS = [{ W: 344, H: 882 }, { W: 475, H: 638 }];
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const NAMES = ['up', 'right', 'down', 'left'];
const room = { w: 336, h: 500 };
const CAP = 700, R = 11;
let fails = 0, checks = 0;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function check(frame, st, view, tag) {
  checks++;
  const sx = (st.x - frame.cx) * frame.scale + view.W / 2;
  const sy = (st.y - frame.cy) * frame.scale + view.H / 2;
  const r = R * frame.scale;
  const ok = sx - r >= 0 && sx + r <= view.W && sy - r >= 0 && sy + r <= 0.55 * view.H + 1e-6 &&
    isFinite(frame.scale) && frame.scale > 0;
  if (!ok && fails++ < 10) console.log('FAIL', tag, { sx: sx.toFixed(1), sy: sy.toFixed(1), lim: 0.55 * view.H, scale: frame.scale });
}

// 1) Static sweep: grid of positions x velocities, fresh cam and settled cam.
for (const view of VIEWS) for (let g = 0; g < 4; g++) {
  for (let x = 11; x <= 325; x += 21) for (let y = 11; y <= 489; y += 26) {
    for (const sp of [0, 150, 400, 700, 900]) for (const lat of [-700, -300, 0, 300, 700]) {
      const d = DIRS[g];
      const st = { room, x, y, vx: d[0] * sp + (d[0] ? 0 : lat), vy: d[1] * sp + (d[1] ? 0 : lat), g };
      const cam = PL.camNew();
      check(PL.camUpdate(cam, st, view, 1 / 60), st, view, `static ${view.W}x${view.H} g${g}`);
      for (let i = 0; i < 30; i++) PL.camUpdate(cam, st, view, 1 / 60);
      check(PL.camUpdate(cam, st, view, 1 / 60), st, view, `settled ${view.W}x${view.H} g${g}`);
    }
  }
}

// 2) Dynamic: bob flies around under gravity with random flips, bounces off the
// box, respawns (teleport), with frame dt jitter (incl. 0.1 s hitches).
// hz 60: 1/60..1/60+0.01 s frames; hz 120: 1/120..1/120+0.004 s; both 2% 0.1 s hitches.
function simRun(view, seed, hz) {
  const rnd = mulberry32(seed), cam = PL.camNew(), frames = [];
  const st = { room, x: 168, y: 400, vx: 0, vy: 0, g: 2 };
  for (let f = 0; f < 3000; f++) {
    const dt = rnd() < 0.02 ? 0.1 : hz === 120 ? 1 / 120 + rnd() * 0.004 : 1 / 60 + rnd() * 0.01;
    if (rnd() < 0.02) st.g = (rnd() * 4) | 0;
    if (rnd() < 0.003) { st.x = 11 + rnd() * 314; st.y = 11 + rnd() * 478; st.vx = st.vy = 0; }
    const d = DIRS[st.g];
    st.vx = Math.max(-CAP, Math.min(CAP, st.vx + d[0] * 1500 * dt));
    st.vy = Math.max(-CAP, Math.min(CAP, st.vy + d[1] * 1500 * dt));
    st.x += st.vx * dt; st.y += st.vy * dt;
    if (st.x < R) { st.x = R; st.vx = -0.15 * st.vx; }
    if (st.x > room.w - R) { st.x = room.w - R; st.vx = -0.15 * st.vx; }
    if (st.y < R) { st.y = R; st.vy = -0.15 * st.vy; }
    if (st.y > room.h - R) { st.y = room.h - R; st.vy = -0.15 * st.vy; }
    const fr = PL.camUpdate(cam, st, view, dt);
    check(fr, st, view, `dyn${hz} ${view.W}x${view.H} seed${seed} f${f}`);
    frames.push(fr.scale, fr.cx, fr.cy);
  }
  return frames.join(',');
}
for (const hz of [60, 120]) for (const view of VIEWS) for (let seed = 1; seed <= 8; seed++) {
  const a = simRun(view, seed, hz), b = simRun(view, seed, hz);
  checks++;
  if (a !== b) { fails++; console.log('FAIL determinism', hz, view, seed); }
}

// 3) Sight table at cap speed, bob at room centre, camera settled.
const rows = [];
for (const view of VIEWS) for (let g = 0; g < 4; g++) {
  const d = DIRS[g];
  const st = { room, x: 168, y: 250, vx: d[0] * CAP, vy: d[1] * CAP, g };
  const cam = PL.camNew(); let fr;
  for (let i = 0; i < 120; i++) fr = PL.camUpdate(cam, st, view, 1 / 60);
  check(fr, st, view, `sight ${view.W}x${view.H} g${g}`);
  rows.push(`  ${(view.W + 'x' + view.H).padEnd(8)} ${NAMES[g].padEnd(6)} ${PL.sightAhead(fr, st, view).toFixed(2).padEnd(9)} ${PL.sightAheadPlay(fr, st, view).toFixed(2)}   (visW ${(view.W / fr.scale).toFixed(0)})`);
}
console.log('Sight ahead at cap 700 px/s (s):\n  view     dir    screen    play\n' + rows.join('\n'));
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.log('camera-test FAIL'); process.exit(1); }
console.log('camera-test OK');
