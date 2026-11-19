// camera.js - Plumbline camera (pure, Node-loadable, deterministic).
// FIT-WHOLE-ROOM [AD] (all current 336x500 rooms): scale =
// min(W/room.w, (H - hudTop - 6)/room.h), room centred horizontally, top edge
// pinned at hudTop (84 css px + safe-area top view.inset.t; returned as
// frame.hudTop for draw.js), camera STATIC: no look-ahead, no speed zoom, no
// smoothing, so no settle crop. The control strip is only a tint over the room.
//   view     scale   room on screen (y)
//   344x882  1.024   84..596
//   475x638  1.096   84..632
// Sight ahead in fit mode = time to the room edge (whole room visible).
// SCROLL FALLBACK only when that fit scale < 0.9 (a room too tall, future):
// (1) zoom spring, (2) look-ahead target, (3) soft room clamp + soft bob band
// (below HUD, at/above 55% H, led LEAD s along the motion), (4) critically
// damped spring on the error with target velocity fed forward, camera accel
// capped at ACC (5 px/frame step change at 60 fps), (5) hard guarantees: room
// clamp, bob on screen and above 55% H. x locked to room centre while the
// visible width >= room.w - 8. Snaps (cut) on first frame, room change,
// state.t < 3 and teleports. Measured (room 336x1000, cap 700 px/s, bob at
// room centre, settled; play = to strip line 0.6H when moving down):
//   view     dir    screen s  play s
//   344x882  up     0.71      0.71
//   344x882  right  0.24      0.24
//   344x882  down   0.71      0.41
//   344x882  left   0.24      0.24
//   475x638  up     0.46      0.46
//   475x638  right  0.24      0.24
//   475x638  down   0.71      0.35
//   475x638  left   0.24      0.24
// (right/left = time to the side wall.) Jitter (test/camera-check2.js, 60 fps
// / 120 Hz / 0.1 s hitch): max 1.4 px/frame step change (limit 6, was 16.4).
const PL = (globalThis.PL = globalThis.PL || {});

PL.CAM = {
  ROOM_W: 336, MAX_W: 480, CAP: 700,
  LOOK_WIDE: 0.35, LOOK_TALL: 0.25, WIDE_ASPECT: 0.6,
  BOB_MAX_Y: 0.55, BOB_MIN_Y: 0.12, SIDE_PAD: 16, R: 11,
  OVER: 40, POS_T: 0.15, ZOOM_T: 0.45, MAX_DT: 0.1,
  // soft bob band margin (screen px) + blend width (room px); camera accel
  // limit (screen px/s^2): 18000 = 5 px/frame step change at 60 fps.
  SOFT_PAD: 28, SOFT_K: 48, ACC: 18000, LEAD: 0.25,
  // HUD band at the top (css px, + safe-area top = frame.hudTop); horizontal
  // lock when the view shows the room width (visible >= room.w - LOCK_SLACK).
  HUD: 84, LOCK_SLACK: 8, STRIP_Y: 0.6, ROOM_PAD: 16, TGT_SLACK: 40,
  // FIT-WHOLE-ROOM [AD]: bottom margin (css px); fall back to scrolling only
  // when the fit scale drops below FIT_MIN css px per room px.
  FIT_GAP: 6, FIT_MIN: 0.9,
};

// Critically damped smoothing (stable for any dt). s = {v}
function smooth(cur, target, s, T, dt) {
  const w = 2 / T, x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (s.v + w * ch) * dt;
  s.v = (s.v - w * tmp) * e;
  return target + (ch + tmp) * e;
}

function roomDims(state) {
  const r = state && state.room;
  return { w: (r && r.w) || 336, h: (r && r.h) || 500 };
}

function targets(state, view) {
  const K = PL.CAM;
  const sp = Math.min(K.CAP, Math.hypot(state.vx || 0, state.vy || 0));
  const visW = K.ROOM_W + (K.MAX_W - K.ROOM_W) * (sp / K.CAP);
  const look = view.W / view.H > K.WIDE_ASPECT ? K.LOOK_WIDE : K.LOOK_TALL;
  return { visW, cx: state.x + (state.vx || 0) * look, cy: state.y + (state.vy || 0) * look };
}

// Smooth max/min: continuous, >= max (<= min), off by at most k/2 at the seam.
function softMax(a, b, k) { return (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2; }
function softMin(a, b, k) { return (a + b - Math.sqrt((a - b) * (a - b) + k * k)) / 2; }

// Per-axis limits for camera centre c given bob p: bob screen pos in [sMin,sMax].
// screen = (p - c)*s + half  ->  c in [p - (sMax-half)/s, p - (sMin-half)/s]
function bobRange(p, s, half, sMin, sMax) {
  return [p - (sMax - half) / s, p - (sMin - half) / s];
}

// Bob screen bands for this frame's scale (pad = extra soft margin, screen px).
// Soft band keeps the bob below the HUD; the hard band only below 12% H.
// lockX: horizontal is locked, so x only has to stay on screen.
function bands(view, s, pad, lockX) {
  const K = PL.CAM, rr = K.R * s;
  const top = pad > 0 ? Math.max(K.BOB_MIN_Y * view.H, hudTop(view)) : K.BOB_MIN_Y * view.H;
  const sp = lockX ? 0 : K.SIDE_PAD;
  return {
    x: lockX ? [rr + 1e-6, view.W - rr - 1e-6] : [sp + rr + pad, view.W - sp - rr - pad],
    y: [top + rr + pad, K.BOB_MAX_Y * view.H - rr - pad],
  };
}

// Target for one axis, from the FINAL scale: look-ahead -> room clamp ->
// bob band as a soft limit (bob wins over the room).
function axisTarget(look, p, v, s, half, len, band) {
  const K = PL.CAM;
  // soft room clamp, ROOM_PAD inside the hard one so overshoot never hits it
  const a = -(K.OVER - K.ROOM_PAD) + half / s, b = len + (K.OVER - K.ROOM_PAD) - half / s;
  let t = softMax(softMin(look, Math.max(a, b), K.SOFT_K), Math.min(a, b), K.SOFT_K);
  // lead the band along the motion (bob position LEAD s ahead, kept inside the
  // room) so the band takes over from the room clamp before the bob reaches it
  const lim = [K.R, len - K.R];
  // (lead capped to 80% of the band so the band never empties)
  const cap = 0.8 * (band[1] - band[0]) / s, d = Math.max(-cap, Math.min(cap, v * K.LEAD));
  const pLo = Math.max(p, softMin(p + Math.max(0, d), lim[1], K.SOFT_K));
  const pHi = Math.min(p, softMax(p + Math.min(0, d), lim[0], K.SOFT_K));
  const r = [bobRange(pLo, s, half, band[0], band[1])[0], bobRange(pHi, s, half, band[0], band[1])[1]];
  if (r[0] <= r[1]) { t = softMax(t, r[0], K.SOFT_K); t = softMin(t, r[1], K.SOFT_K); }
  return t;
}

// Hard limits (last line): room clamp, then bob on screen and above 55%.
// The room range is widened to the target (the bob needs the camera outside
// the box) and to the previous camera position `prev` (never moves further
// out; it eases back in instead of being yanked when the target jumps).
function hardAxis(c, tgt, p, s, half, len, band, prev) {
  const K = PL.CAM, hl = half / s;
  const a = -K.OVER + hl, b = len + K.OVER - hl;
  const pv = prev === undefined ? tgt : prev;
  // (TGT_SLACK around the target: room for the spring to overshoot a
  // decelerating target without being yanked)
  const lo = Math.min(Math.min(a, b), tgt - K.TGT_SLACK, pv), hi = Math.max(Math.max(a, b), tgt + K.TGT_SLACK, pv);
  c = c < lo ? lo : c > hi ? hi : c;
  const r = bobRange(p, s, half, band[0], band[1]);
  return c < r[0] ? r[0] : c > r[1] ? r[1] : c;
}

PL.camNew = function () {
  return { init: false, visW: 336, cx: 0, cy: 0, vx: 0, vy: 0, tx: 0, ty: 0, bx: 0, by: 0,
    scale: 1, sw: { v: 0 } };
};

// One axis: track the moving target with a critically damped spring on the
// error (target velocity fed forward, camera velocity continuous), then
// rate-limit the camera acceleration, then hard-limit.
function stepAxis(cam, ax, tgt, p, s, half, len, hardBand, dt) {
  const K = PL.CAM, c = 'c' + ax, v = 'v' + ax, tk = 't' + ax;
  const x0 = cam[c], v0 = cam[v];
  const tv = (tgt - cam[tk]) / dt;
  const es = { v: v0 - tv };
  // error measured against LAST frame's target; the target's own motion is
  // fed forward through es.v, so it is not counted twice
  const e = smooth(x0 - cam[tk], 0, es, K.POS_T, dt);
  let vd = (tgt + e - x0) / dt;
  const dvMax = K.ACC / s * dt;
  if (vd - v0 > dvMax) vd = v0 + dvMax; else if (vd - v0 < -dvMax) vd = v0 - dvMax;
  let x = x0 + vd * dt;
  x = hardAxis(x, tgt, p, s, half, len, hardBand, x0);
  cam[c] = x; cam[v] = (x - x0) / dt; cam[tk] = tgt;
}

// HUD bottom in css px: HUD + safe-area top (view.inset.t when given).
function hudTop(view) {
  return PL.CAM.HUD + ((view.inset && view.inset.t) || 0);
}

// FIT-WHOLE-ROOM: scale so the whole room fits under the HUD; null when the
// room is too tall for that (scale < FIT_MIN) and the scroll path applies.
function fitFrame(state, view) {
  const K = PL.CAM, rd = roomDims(state), ht = hudTop(view);
  const s = Math.min(view.W / rd.w, (view.H - ht - K.FIT_GAP) / rd.h);
  if (!(s >= K.FIT_MIN)) return null;
  // room centred horizontally, top edge pinned at hudTop
  return { scale: s, cx: rd.w / 2, cy: (view.H / 2 - ht) / s, hudTop: ht, fit: true };
}
PL.camFit = fitFrame;

PL.camUpdate = function (cam, state, view, dt) {
  const K = PL.CAM, t = targets(state, view), rd = roomDims(state);
  dt = Math.max(0, Math.min(K.MAX_DT, dt || 0));
  // Static camera whenever the room fits: no look-ahead, no speed zoom.
  const fit = fitFrame(state, view);
  if (fit) {
    cam.init = true; cam.mode = 'fit'; cam.room = state.room;
    cam.scale = fit.scale; cam.visW = view.W / fit.scale; cam.cx = fit.cx; cam.cy = fit.cy;
    cam.vx = cam.vy = 0; cam.sw.v = 0; cam.tx = fit.cx; cam.ty = fit.cy;
    cam.bx = state.x; cam.by = state.y;
    return fit;
  }
  // Scroll fallback (room taller than fits). Snap (cut, no settle crop) on the
  // first frame, room change, mode change, room start (state.t < 3) or teleport.
  // A t<3 snap in the same room keeps the camera's real velocity so the
  // spring takes over without a kick.
  let carry = false;
  if (cam.mode !== 'scroll' || cam.room !== state.room) cam.init = false;
  else if (typeof state.t === 'number' && state.t < 3) { carry = cam.init && dt > 0; cam.init = false; }
  const ox = cam.cx, oy = cam.cy;
  cam.mode = 'scroll'; cam.room = state.room;
  // 1) scale first (slower zoom spring), so every limit below uses this frame's scale
  const jump = cam.init && Math.hypot(state.x - cam.bx, state.y - cam.by) > K.CAP * Math.max(dt, 1 / 60) * 1.5 + 40;
  if (!cam.init || jump) { cam.visW = t.visW; cam.sw.v = 0; }
  else if (dt > 0) cam.visW = smooth(cam.visW, t.visW, cam.sw, K.ZOOM_T, dt);
  cam.visW = Math.max(K.ROOM_W, Math.min(K.MAX_W, cam.visW));
  const s = (cam.scale = view.W / cam.visW);
  // 2) look-ahead target, 3) room clamp + soft bob band
  // Horizontal: when the view shows the whole room width, lock cx to the room
  // centre (no following); follow only when zoomed in tighter than the room.
  const lockX = view.W / s >= rd.w - K.LOCK_SLACK;
  // Vertical: scrolls with the bob, 55% rule kept.
  const soft = bands(view, s, K.SOFT_PAD, lockX), hard = bands(view, s, 0, lockX);
  const tx = lockX ? rd.w / 2 : axisTarget(t.cx, state.x, state.vx || 0, s, view.W / 2, rd.w, soft.x);
  const ty = axisTarget(t.cy, state.y, state.vy || 0, s, view.H / 2, rd.h, soft.y);
  if (!cam.init || jump) {
    // first frame or teleport (respawn): cut, no motion carried over
    cam.init = true;
    cam.cx = hardAxis(tx, tx, state.x, s, view.W / 2, rd.w, hard.x);
    cam.cy = hardAxis(ty, ty, state.y, s, view.H / 2, rd.h, hard.y);
    cam.vx = carry ? (cam.cx - ox) / dt : 0; cam.vy = carry ? (cam.cy - oy) / dt : 0;
    cam.tx = tx; cam.ty = ty;
  } else if (dt > 0) {
    // 4) spring + acceleration limit, 5) hard guarantees
    stepAxis(cam, 'x', tx, state.x, s, view.W / 2, rd.w, hard.x, dt);
    stepAxis(cam, 'y', ty, state.y, s, view.H / 2, rd.h, hard.y, dt);
  } else {
    cam.cx = hardAxis(cam.cx, tx, state.x, s, view.W / 2, rd.w, hard.x);
    cam.cy = hardAxis(cam.cy, ty, state.y, s, view.H / 2, rd.h, hard.y);
  }
  cam.bx = state.x; cam.by = state.y;
  return { scale: cam.scale, cx: cam.cx, cy: cam.cy, hudTop: hudTop(view), fit: false };
};

// Seconds of visible room ahead: distance (room px) from bob along velocity
// to the nearer of the room edge and the screen region [0,W]x[0,yBottom],
// divided by speed. In fit mode the whole room is visible, so this is the
// time to the room edge. Infinity when nearly still.
function sightTo(frame, state, view, yBottom) {
  const vx = state.vx || 0, vy = state.vy || 0, sp = Math.hypot(vx, vy);
  if (sp < 1) return Infinity;
  const s = frame.scale;
  const x0 = (state.x - frame.cx) * s + view.W / 2;
  const y0 = (state.y - frame.cy) * s + view.H / 2;
  const dx = vx / sp, dy = vy / sp;
  let d = Infinity;
  if (dx > 0) d = Math.min(d, (view.W - x0) / dx);
  if (dx < 0) d = Math.min(d, -x0 / dx);
  if (dy > 0) d = Math.min(d, (yBottom - y0) / dy);
  if (dy < 0) d = Math.min(d, -y0 / dy);
  d /= s;
  const rd = roomDims(state);
  if (dx > 0) d = Math.min(d, (rd.w - state.x) / dx);
  if (dx < 0) d = Math.min(d, -state.x / dx);
  if (dy > 0) d = Math.min(d, (rd.h - state.y) / dy);
  if (dy < 0) d = Math.min(d, -state.y / dy);
  return Math.max(0, d) / sp;
}

PL.sightAhead = function (frame, state, view) {
  return sightTo(frame, state, view, view.H);
};
// Same, but also stopping at the control strip line (y = 0.6H).
PL.sightAheadPlay = function (frame, state, view) {
  return sightTo(frame, state, view, 0.6 * view.H);
};
