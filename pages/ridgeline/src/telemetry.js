// Ridgeline telemetry: per-run stats for the Copy report. Pure math + running sums; no gameplay effect.
// Only deviceInfo() touches the environment (navigator/screen/window, passed in or global), all in try/catch.
export const TAP_MS = 200;
export const TAP_PX = 10;
export const STEER_T = 0.2;
export const DRY_CHARGE = 0.25;
export const RING = 600;

// tap = short and barely moved; everything else is a drag
export function classifyPointer(durMs, distPx) {
  return durMs < TAP_MS && distPx < TAP_PX ? 'tap' : 'drag';
}

// p in 0..100 over the first n values of arr (copied + sorted; call on snapshot only)
export function percentile(arr, n, p) {
  if (!n) return null;
  const a = Array.prototype.slice.call(arr, 0, n).sort((x, y) => x - y);
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return a[idx];
}

export function steerShares(left, centre, right) {
  const tot = left + centre + right;
  if (!tot) return { left: 0, centre: 0, right: 0 };
  return { left: (100 * left) / tot, centre: (100 * centre) / tot, right: (100 * right) / tot };
}

export function createTelemetry() {
  const ring = new Float64Array(RING);
  const t = {};
  function reset(startMs) {
    t.startMs = startMs || 0;
    t.touches = 0; t.taps = 0; t.drags = 0; t.dragSum = 0; t.dragMax = 0;
    t.holdMax = 0; t.ignoredHud = 0; t.extraFingers = 0; t.keyboard = false; t.firstInputMs = null;
    t.boosted = 0; t.dry = 0;
    t.runT = 0; t.stL = 0; t.stC = 0; t.stR = 0;
    t.uses = 0; t.chargeSpent = 0; t.chargingT = 0; t.speedMax = 0; t.speedSum = 0; t.speedN = 0;
    t.frames = 0; t.slow = 0; t.longest = 0; t.winMs = 0; t.winN = 0; t.fpsMin = Infinity;
    t.edgeHits = 0; t.outside = false; t.crash = null; t.finished = false;
    t.pDown = 0; t.pX = 0; t.pY = 0; t.pMax = 0; t.pActive = false;
  }
  reset(0);

  return {
    reset,
    // pointer lifecycle (accepted pointer only)
    touchDown(now, x, y) {
      t.touches++;
      if (t.firstInputMs === null) t.firstInputMs = Math.max(0, now - t.startMs);
      t.pDown = now; t.pX = x; t.pY = y; t.pMax = 0; t.pActive = true;
    },
    touchMove(x, y) {
      if (!t.pActive) return;
      const dx = x - t.pX, dy = y - t.pY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > t.pMax) t.pMax = d;
    },
    touchUp(now, boostCharge, fired) {
      if (!t.pActive) return;
      t.pActive = false;
      const dur = now - t.pDown;
      if (classifyPointer(dur, t.pMax) === 'tap') t.taps++;
      else { t.drags++; t.dragSum += t.pMax; if (t.pMax > t.dragMax) t.dragMax = t.pMax; }
      if (dur / 1000 > t.holdMax) t.holdMax = dur / 1000;
      if (fired) { if (boostCharge >= DRY_CHARGE) t.boosted++; else t.dry++; }
    },
    // a pointerdown during the run that never became a gesture
    touchIgnored(now, onHud) {
      if (!onHud) { t.extraFingers++; return; }
      t.touches++;
      t.ignoredHud++;
      if (t.firstInputMs === null) t.firstInputMs = Math.max(0, now - t.startMs);
    },
    key() { t.keyboard = true; },
    // once per fixed sled step
    step(dt, steer, speed, charging, offEdge) {
      t.runT += dt;
      if (steer < -STEER_T) t.stL += dt; else if (steer > STEER_T) t.stR += dt; else t.stC += dt;
      if (charging) t.chargingT += dt;
      if (speed > t.speedMax) t.speedMax = speed;
      t.speedSum += speed; t.speedN++;
      if (offEdge && !t.outside) t.edgeHits++;
      t.outside = !!offEdge;
    },
    boost(amount) { t.uses++; t.chargeSpent += amount; },
    crash(info) { t.crash = info; },
    finish() { t.finished = true; },
    // once per rendered frame while running
    frame(ms) {
      ring[t.frames % RING] = ms;
      t.frames++;
      if (ms > 50) t.slow++;
      if (ms > t.longest) t.longest = ms;
      t.winMs += ms; t.winN++;
      if (t.winMs >= 1000) {
        const f = (t.winN * 1000) / t.winMs;
        if (f < t.fpsMin) t.fpsMin = f;
        t.winMs = 0; t.winN = 0;
      }
    },
    snapshot() {
      const n = Math.min(t.frames, RING);
      return {
        touches: t.touches, taps: t.taps, drags: t.drags,
        dragAvg: t.drags ? t.dragSum / t.drags : 0, dragMax: t.dragMax,
        steer: steerShares(t.stL, t.stC, t.stR),
        boosted: t.boosted, dry: t.dry, holdMax: t.holdMax, keyboard: t.keyboard,
        ignoredHud: t.ignoredHud, extraFingers: t.extraFingers, firstInputMs: t.firstInputMs,
        uses: t.uses, chargeAvg: t.uses ? t.chargeSpent / t.uses : 0, chargingT: t.chargingT,
        speedMax: t.speedMax, speedAvg: t.speedN ? t.speedSum / t.speedN : 0,
        fpsMin: t.fpsMin === Infinity ? null : t.fpsMin,
        p5: percentile(ring, n, 5), p95: percentile(ring, n, 95),
        slow: t.slow, longest: t.longest, frames: t.frames,
        edgeHits: t.edgeHits, crash: t.crash, finished: t.finished,
      };
    },
  };
}

export function deviceInfo(env, gpu) {
  env = env || {};
  const w = env.window || (typeof window !== 'undefined' ? window : null);
  const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const scr = env.screen || (typeof screen !== 'undefined' ? screen : null);
  const d = {};
  try { d.viewport = `${w.innerWidth}x${w.innerHeight}`; d.dpr = w.devicePixelRatio; } catch (e) { /* ignore */ }
  try { d.screen = `${scr.width}x${scr.height}`; } catch (e) { /* ignore */ }
  try {
    d.orientation = (scr.orientation && scr.orientation.type) || (w.innerWidth >= w.innerHeight ? 'landscape' : 'portrait');
  } catch (e) { /* ignore */ }
  try { d.ua = String(nav.userAgent).slice(0, 60); } catch (e) { /* ignore */ }
  d.gpu = gpu || null;
  try { d.reducedMotion = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignore */ }
  try {
    d.standalone = !!((w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) || (nav && nav.standalone));
  } catch (e) { /* ignore */ }
  return d;
}

const f = (v, dp) => (typeof v === 'number' && isFinite(v) ? v.toFixed(dp) : '-');
const yn = v => (v ? 'yes' : 'no');

export function formatTelemetry(s, dev) {
  if (!s) return [];
  dev = dev || {};
  const L = [];
  L.push('input:');
  L.push('  touches: ' + s.touches);
  L.push('  taps: ' + s.taps);
  L.push('  drags: ' + s.drags);
  L.push(`  drag px avg/max: ${f(s.dragAvg, 0)} / ${f(s.dragMax, 0)}`);
  L.push(`  steer L/C/R %: ${f(s.steer.left, 0)} / ${f(s.steer.centre, 0)} / ${f(s.steer.right, 0)}`);
  L.push('  boost releases: ' + s.boosted);
  L.push('  dry releases: ' + s.dry);
  L.push('  longest hold s: ' + f(s.holdMax, 2));
  L.push('  keyboard: ' + yn(s.keyboard));
  L.push('  ignored on HUD: ' + s.ignoredHud);
  L.push('  extra fingers: ' + s.extraFingers);
  L.push('  first input ms: ' + f(s.firstInputMs, 0));
  L.push('boost:');
  L.push('  uses: ' + s.uses);
  L.push('  avg charge spent: ' + f(s.chargeAvg, 2));
  L.push('  charging s: ' + f(s.chargingT, 2));
  L.push('  peak speed m/s: ' + f(s.speedMax, 1));
  L.push('  avg speed m/s: ' + f(s.speedAvg, 1));
  L.push('frames:');
  L.push('  fps min: ' + f(s.fpsMin, 1));
  L.push('  p5 ms: ' + f(s.p5, 1));
  L.push('  p95 ms: ' + f(s.p95, 1));
  L.push('  over 50 ms: ' + s.slow);
  L.push('  longest ms: ' + f(s.longest, 1));
  L.push('run:');
  const c = s.crash;
  if (c) L.push(`  crash: rock ${c.rockId} at x ${f(c.rockX, 1)} z ${f(c.rockZ, 1)}, sled x ${f(c.sledX, 1)}, lateral ${f(c.vx, 1)} m/s`);
  else L.push('  end: ' + (s.finished ? 'finish' : 'none'));
  L.push('  edge hits: ' + s.edgeHits);
  L.push('device:');
  L.push('  viewport: ' + (dev.viewport || '-'));
  L.push('  dpr: ' + f(dev.dpr, 2));
  L.push('  screen: ' + (dev.screen || '-'));
  L.push('  orientation: ' + (dev.orientation || '-'));
  L.push('  ua: ' + (dev.ua || '-'));
  L.push('  gpu: ' + (dev.gpu || '-'));
  L.push('  reduced motion: ' + (dev.reducedMotion === undefined ? '-' : dev.reducedMotion ? 'on' : 'off'));
  L.push('  standalone: ' + (dev.standalone === undefined ? '-' : yn(dev.standalone)));
  return L;
}
