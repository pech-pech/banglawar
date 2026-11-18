// Independent camera check: falling bob frame by frame on two views.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { globalThis: null, console, Math };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../parts/camera.js'), 'utf8'), ctx);
const PL = ctx.PL;
let fails = 0;
const bad = (m) => { if (fails++ < 25) console.log('FAIL', m); };
const HALF = 11;
// Step modes: 60 fps, 120 Hz, and each with a 0.1 s hitch mid-fall.
// Jitter is the camera's screen-space step change normalised to 60 fps frames
// (= |dv| / mean dt / 3600), identical to the raw px/frame metric at 60 fps.
const MODES = [
  { name: '60fps', dt: () => 1 / 60 },
  { name: '120Hz', dt: () => 1 / 120 },
  { name: '60fps+hitch', dt: (t, f) => (f === 20 ? 0.1 : 1 / 60) },
  { name: '120Hz+hitch', dt: (t, f) => (f === 40 ? 0.1 : 1 / 120) },
];
for (const mode of MODES)
for (const [W, H] of [[344, 882], [475, 638]]) {
  for (const dir of [2, 0]) { // fall down, and fall up
    const view = { W, H }, cam = PL.camNew();
    const sMin = W / 480 - 1e-6, sMax = W / 336 + 1e-6;
    const sgn = dir === 2 ? 1 : -1;
    // room 336x1000: too tall to fit either view, so this exercises the scroll fallback
    const st = { room: { w: 336, h: 1000 }, x: 168, y: dir === 2 ? 20 : 980, vx: 0, vy: 0, g: dir, t: 0, dead: 0, won: false };
    let prevStepX = null, prevStepY = null, prevCx = null, prevCy = null, prevSc = null, maxJ = 0, minSy = 1e9, maxSy = -1e9;
    let simT = 0, prevDt = 1 / 60;
    for (let f = 0; simT < 10; f++) {
      const dt = mode.dt(simT, f); simT += dt;
      st.vy = Math.min(700, st.vy + 1500 * dt) * 1; // magnitude
      const spd = st.vy;
      st.y += sgn * spd * dt;
      if (st.y > 988 || st.y < 12) { st.y = dir === 2 ? 988 : 12; st.vy = 0; }
      st.t = f; // ticks-ish; camera snaps while t < 3 (room start)
      const real = { ...st, vy: sgn * st.vy };
      // contract says state.vx/vy; mimic hold at 700 for steady section
      const fr = PL.camUpdate(cam, real, view, dt);
      const sy = (st.y - fr.cy) * fr.scale + H / 2, sx = (st.x - fr.cx) * fr.scale + W / 2;
      const r = HALF * fr.scale;
      const tag = `${mode.name} ${W}x${H} g${dir} f${f}`;
      if (sx - r < 0 || sx + r > W || sy - r < 0 || sy + r > H) bad(`${tag} off screen sx=${sx.toFixed(1)} sy=${sy.toFixed(1)}`);
      if (sy + r > 0.55 * H + 1e-6) bad(`${tag} below 55% sy+r=${(sy + r).toFixed(1)}`);
      if (sy + r > 0.6 * H + 0.5) bad(`${tag} in strip sy+r=${(sy + r).toFixed(1)} limit ${0.6 * H}`);
      if (fr.scale < sMin || fr.scale > sMax) bad(`${tag} scale ${fr.scale}`);
      if (fr.fit !== false) bad(`${tag} expected scroll fallback`);
      if (prevCx !== null) {
        // jitter = frame-to-frame change of the camera's screen-space step (camera "acceleration"), px/frame
        // steps as screen px per 1/60 s so modes compare
        const k = 1 / 60 / dt, stepX = (fr.cx - prevCx) * fr.scale * k, stepY = (fr.cy - prevCy) * fr.scale * k;
        if (prevStepY !== null) {
          const n = (1 / 60) / ((dt + prevDt) / 2);
          const jit = Math.max(Math.abs(stepX - prevStepX), Math.abs(stepY - prevStepY)) * n;
          maxJ = Math.max(maxJ, jit);
          if (jit > 6) bad(`${tag} camera jitter ${jit.toFixed(1)} px/frame`);
        }
        prevStepX = stepX; prevStepY = stepY;
      }
      var prevSy = sy; prevDt = dt;
      prevCx = fr.cx; prevCy = fr.cy; prevSc = fr.scale;
      minSy = Math.min(minSy, sy); maxSy = Math.max(maxSy, sy);
    }
    console.log(`${mode.name.padEnd(11)} ${W}x${H} g${dir}: bob screen y ${minSy.toFixed(0)}..${maxSy.toFixed(0)} (strip at ${(0.6 * H).toFixed(0)}), max jitter ${maxJ.toFixed(2)}px`);
  }
}
if (fails) { console.log(fails + ' failures'); process.exit(1); }
console.log('camera-check2 OK');
