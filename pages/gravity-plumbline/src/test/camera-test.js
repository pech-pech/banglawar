// camera-test.js - node src/test/camera-test.js
// 1-3) Scroll fallback (room 336x1000, too tall to fit): sweeps bob
// positions/velocities (4 gravity dirs) on 344x882 and 475x638 and asserts:
// bob fully on screen, fully above the 55% line, frames
// deterministic (60 fps and 120 Hz steps, both with 0.1 s hitches). Prints sight ahead at cap 700 px/s (bob at room centre, settled).
// Measured table (scroll fallback, room 336x1000; seconds; play = to strip line 0.6H):
//   view     dir    screen s  play s
//   344x882  up     0.71      0.71
//   344x882  right  0.24      0.24
//   344x882  down   0.71      0.41
//   344x882  left   0.24      0.24
//   475x638  up     0.46      0.46
//   475x638  right  0.24      0.24
//   475x638  down   0.71      0.35
//   475x638  left   0.24      0.24
// 4) FIT-WHOLE-ROOM (room 336x500): exact scale, centred, top at hudTop, whole
// room on screen, static camera, fresh cam = final frame, fit sight = room
// edge; scroll fallback snaps on room change and t < 3.
//   344x882 scale 1.024 (room y 84..596), 475x638 scale 1.096 (84..632).
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'parts', 'camera.js'));
const PL = globalThis.PL;

const VIEWS = [{ W: 344, H: 882 }, { W: 475, H: 638 }];
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const NAMES = ['up', 'right', 'down', 'left'];
const room = { w: 336, h: 1000 };   // scroll fallback: too tall to fit on either view
const ROOM = { w: 336, h: 500 };    // real rooms: FIT-WHOLE-ROOM
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
  if (frame.fit !== false) { fails++; console.log('FAIL not scroll mode', tag); return; }
  const sx = (st.x - frame.cx) * frame.scale + view.W / 2;
  const sy = (st.y - frame.cy) * frame.scale + view.H / 2;
  const r = R * frame.scale;
  const ok = sx - r >= 0 && sx + r <= view.W && sy - r >= 0 && sy + r <= 0.55 * view.H + 1e-6 &&
    isFinite(frame.scale) && frame.scale > 0;
  if (!ok && fails++ < 10) console.log('FAIL', tag, { sx: sx.toFixed(1), sy: sy.toFixed(1), lim: 0.55 * view.H, scale: frame.scale });
}

// 1) Static sweep: grid of positions x velocities, fresh cam and settled cam.
for (const view of VIEWS) for (let g = 0; g < 4; g++) {
  for (let x = 11; x <= 325; x += 21) for (let y = 11; y <= 989; y += 52) {
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
  const st = { room, x: 168, y: 500, vx: d[0] * CAP, vy: d[1] * CAP, g };
  const cam = PL.camNew(); let fr;
  for (let i = 0; i < 120; i++) fr = PL.camUpdate(cam, st, view, 1 / 60);
  check(fr, st, view, `sight ${view.W}x${view.H} g${g}`);
  rows.push(`  ${(view.W + 'x' + view.H).padEnd(8)} ${NAMES[g].padEnd(6)} ${PL.sightAhead(fr, st, view).toFixed(2).padEnd(9)} ${PL.sightAheadPlay(fr, st, view).toFixed(2)}   (visW ${(view.W / fr.scale).toFixed(0)})`);
}
console.log('Scroll fallback (room 336x1000), sight ahead at cap 700 px/s (s):\n  view     dir    screen    play\n' + rows.join('\n'));

// 4) FIT-WHOLE-ROOM on the real 336x500 room: scale = min(W/336,(H-hudTop-6)/500),
// room centred, top at hudTop, whole room on screen, camera static whatever the
// bob does, first frame already final (no settle crop), room change snaps.
function near(a, b) { return Math.abs(a - b) < 1e-9; }
function fcheck(ok, msg) { checks++; if (!ok && fails++ < 20) console.log('FAIL fit', msg); }
const fitRows = [];
for (const view of [...VIEWS, { W: 475, H: 638, inset: { t: 24 } }]) {
  const ht = 84 + ((view.inset && view.inset.t) || 0);
  const want = Math.min(view.W / 336, (view.H - ht - 6) / 500);
  const tag = `${view.W}x${view.H}${view.inset ? ' inset' : ''}`;
  const cam = PL.camNew();
  const rnd = mulberry32(7);
  let first = null;
  for (let f = 0; f < 600; f++) {
    const st = { room: ROOM, t: f, x: 11 + rnd() * 314, y: 11 + rnd() * 478,
      vx: (rnd() * 2 - 1) * 900, vy: (rnd() * 2 - 1) * 900, g: (rnd() * 4) | 0 };
    const fr = PL.camUpdate(cam, st, view, rnd() < 0.05 ? 0.1 : rnd() < 0.5 ? 1 / 120 : 1 / 60);
    if (!first) first = fr;
    const L = (0 - fr.cx) * fr.scale + view.W / 2, Rt = (336 - fr.cx) * fr.scale + view.W / 2;
    const T = (0 - fr.cy) * fr.scale + view.H / 2, B = (500 - fr.cy) * fr.scale + view.H / 2;
    fcheck(fr.fit === true && near(fr.scale, want) && fr.hudTop === ht, `${tag} f${f} scale ${fr.scale} want ${want}`);
    fcheck(L >= -1e-9 && Rt <= view.W + 1e-9 && near((L + Rt) / 2, view.W / 2), `${tag} f${f} not centred L${L} R${Rt}`);
    fcheck(near(T, ht) && B <= view.H - 6 + 1e-9, `${tag} f${f} top ${T} bottom ${B}`);
    fcheck(fr.scale === first.scale && fr.cx === first.cx && fr.cy === first.cy, `${tag} f${f} camera moved`);
  }
  // fresh cam: first frame == PL.camFit (no settle)
  const c2 = PL.camNew(), f2 = PL.camUpdate(c2, { room: ROOM, t: 0, x: 30, y: 470, vx: 700, vy: 700 }, view, 1 / 60);
  fcheck(f2.scale === first.scale && f2.cx === first.cx && f2.cy === first.cy, `${tag} fresh cam not snapped`);
  const st = { room: ROOM, x: 168, y: 470, vx: 0, vy: 700 };
  fitRows.push(`  ${tag.padEnd(14)} scale ${first.scale.toFixed(3)}  room top ${ht}  bottom ${((500 - first.cy) * first.scale + view.H / 2).toFixed(0)}/${view.H}  sight down from y470 ${PL.sightAhead(first, st, view).toFixed(3)} s`);
}
// sightAhead in fit mode = time to the room edge
{
  const fr = PL.camFit({ room: ROOM }, VIEWS[1]), st = { room: ROOM, x: 168, y: 150, vx: 0, vy: 700 };
  fcheck(near(PL.sightAhead(fr, st, VIEWS[1]), 350 / 700), 'sightAhead not to room edge');
}
// Scroll fallback: room start (t < 3) and room change snap to the fresh-cam frame.
for (const view of VIEWS) {
  const tall2 = { w: 336, h: 1000 }, cam = PL.camNew();
  for (let f = 0; f < 200; f++) PL.camUpdate(cam, { room, t: 10 + f, x: 100, y: 900, vx: 300, vy: 700 }, view, 1 / 60);
  const st = { room: tall2, t: 0, x: 168, y: 40, vx: 0, vy: 0 };
  const a = PL.camUpdate(cam, st, view, 1 / 60), b = PL.camUpdate(PL.camNew(), st, view, 1 / 60);
  fcheck(a.cx === b.cx && a.cy === b.cy && a.scale === b.scale, `${view.W}x${view.H} scroll room change not snapped`);
  const c = PL.camUpdate(cam, { room: tall2, t: 1, x: 168, y: 40, vx: 0, vy: 0 }, view, 1 / 60);
  fcheck(c.cy === b.cy, `${view.W}x${view.H} scroll t<3 not snapped`);
}
console.log('FIT-WHOLE-ROOM (room 336x500):\n' + fitRows.join('\n'));
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.log('camera-test FAIL'); process.exit(1); }
console.log('camera-test OK');
