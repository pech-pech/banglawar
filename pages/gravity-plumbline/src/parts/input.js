// input.js - S1: arrow pad adapter (controls.md scheme B; PICKS 4). DOM-free logic, Node-loadable.
// 4 arrow keys (PAD_KEY 60 px) in a diamond, Dive (PAD_DIVE 56 px) in the centre with PAD_GAP 4 px to each arrow
// (lead ruling: a near-miss must not spend a move). Keys fire on touch-down, every pointer on its own (multi-touch
// safe, no capture). Lit key = current down (state.g). Keys dim at 0 moves in the air. A press at 0 moves sets a
// shake flag for the UI and buzzes 30-40-30; the flip/dive is still passed on (core buffers a flip for BUFFER s and
// applies it on landing; an air Dive at 0 is refused by core) so the replay log is exactly what the old input logged.
// One-tap Retry, Pause. Left-hand mirror. Keyboard: arrows, Space = Dive, R = Retry.
// Host (ui.js): {flip(dir), dive(), restart(), pause?(), state(), view()->{W,H}, active()->bool, now?()->ms}.
//   flip/dive push into ui's queue; ui logs {tick,k,dir} at application, unchanged (absolute dir).
// Layout (CSS px; pad box = 3*KEY + 2*GAP - 2*(KEY-DIVE)/2 ... = 184 at defaults, centred on the picked 180 box):
//   475x638 side      box 283-467 x 308-492, Retry 12-68 x 516-572, Pause 411-467 x 12-68, teach 291-471 x 92-296
//   344x882 below     box 80-264 x 648-832, Retry 12-68 x 660-716, Pause 276-332 x 12-68, teach 4-340 x 596-644
//   816x568 landscape box 604-788 x 328-512, Retry 12-68 x 330-386, Pause 752-808 x 12-68, teach 12-236 x 100-200
// Settings key 'plumbline.input.v1' {v:1, hand:'right'|'left', vibrate:bool} (PL.store, never downgraded).
const PL = (globalThis.PL = globalThis.PL || {});
// side mode now fits the room at 0.824 (pad 8 px off the edge); camera.js FIT_MIN 0.84 would drop to scroll mode, so allow 0.82.
if (PL.CAM && PL.CAM.FIT_MIN > 0.82) PL.CAM.FIT_MIN = 0.82;

PL.Input = (function () {
  'use strict';
  const KEY = 'plumbline.input.v1', VER = 1;
  const SHAKE_MS = 300;
  const settings = { hand: 'right', vibrate: true };
  let readOnly = false;
  (function load() {
    if (!PL.store) return;
    const r = PL.store.load(KEY, VER);
    readOnly = r.readOnly;
    const d = r.data; if (!d) return;
    if (d.hand === 'left' || d.hand === 'right') settings.hand = d.hand;
    if (typeof d.vibrate === 'boolean') settings.vibrate = d.vibrate;
  })();
  function save() { if (PL.store && !readOnly) PL.store.save(KEY, VER, { hand: settings.hand, vibrate: settings.vibrate }); }
  function tw(id, d) { const v = PL.Tweak && PL.Tweak.get(id); return typeof v === 'number' ? v : d; }

  function rect(x, y, w, h) { return { x, y, w, h }; }
  function mirror(r, W) { return rect(W - r.x - r.w, r.y, r.w, r.h); }
  // -> {mode, hand, box, keys:[up,right,down,left] (index = gravity dir), dive, retry, pause, teach}
  function layout(W, H, opts) {
    const hand = (opts && opts.hand) || settings.hand;
    const KEYP = tw('PAD_KEY', 60), DIVEP = tw('PAD_DIVE', 56), GAP = tw('PAD_GAP', 4);
    const B = 2 * KEYP + DIVEP + 2 * GAP; // 184 at defaults
    const hudTop = (PL.CAM && PL.CAM.HUD) || 84;
    let mode, cx, cy, retry, pause, teach;
    if (W > H) {
      // landscape: pad in the right gutter (admin default), Retry and teach on the left
      mode = 'landscape'; cx = W - 120; cy = H - 148;
      retry = rect(12, cy - 90, 56, 56); pause = rect(W - 64, 12, 56, 56); teach = rect(12, 100, 224, 100);
    } else if (hudTop + 500 * (W / 336) + 6 + 2 <= H - 232) {
      // tall: room keeps its full-width fit, pad centred below it
      mode = 'below'; cx = W / 2; cy = H - 142;
      retry = rect(12, cy - 80, 56, 56); pause = rect(W - 68, 12, 56, 56); teach = rect(4, cy - 144, W - 8, 48);
    } else {
      // side: pad beside the room (room drawn smaller, camera.js fits it left of the pad)
      mode = 'side'; cx = W - 100; cy = H - 238; // pad 8 px in from the screen edge (QA 4)
      retry = rect(12, H - 122, 56, 56); pause = rect(W - 64, 12, 56, 56);
      teach = rect(cx - 90, hudTop + 8, 180, Math.max(48, cy - B / 2 - 12 - (hudTop + 8)));
    }
    const box = rect(cx - B / 2, cy - B / 2, B, B);
    const off = (B - KEYP) / 2;
    let keys = [rect(box.x + off, box.y, KEYP, KEYP), rect(box.x + B - KEYP, box.y + off, KEYP, KEYP),
      rect(box.x + off, box.y + B - KEYP, KEYP, KEYP), rect(box.x, box.y + off, KEYP, KEYP)];
    let dive = rect(cx - DIVEP / 2, cy - DIVEP / 2, DIVEP, DIVEP);
    let L = { mode, hand, box, keys, dive, retry, pause, teach };
    if (hand === 'left') {
      const m = (r) => mirror(r, W);
      const bx = m(box), dx = bx.x - box.x;
      keys = keys.map((k) => rect(k.x + dx, k.y, k.w, k.h)); // arrows keep their meaning, pad moves as a whole
      L = { mode, hand, box: bx, keys, dive: rect(dive.x + dx, dive.y, dive.w, dive.h), retry: m(retry), pause: m(pause), teach: m(teach) };
    }
    return L;
  }

  let host = null;
  const pressed = {}; // pointerId -> target id ('k0'..'k3','dive','retry','pause','pad')
  let shake = null; // {id, at}
  function now() { return host && host.now ? host.now() : (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
  function hit(r, x, y) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
  function targetAt(x, y, L) {
    for (let i = 0; i < 4; i++) if (hit(L.keys[i], x, y)) return 'k' + i;
    if (hit(L.dive, x, y)) return 'dive';
    if (hit(L.retry, x, y)) return 'retry';
    if (hit(L.pause, x, y)) return 'pause';
    if (hit(L.box, x, y)) return 'pad'; // gap inside the pad: swallowed, no action
    return null;
  }
  function empty() {
    const s = host && host.state && host.state();
    return !!(s && s.charges <= 0 && !s.grounded && !(s.coyote > 0));
  }
  function haptic(p) {
    if (!settings.vibrate) return;
    try { if (typeof navigator !== 'undefined' && navigator && typeof navigator.vibrate === 'function') navigator.vibrate(p); } catch (e) {}
  }
  function fire(id) {
    if (id === 'retry') { haptic(tw('HAPTIC_MS', 8)); host.restart(); return; }
    if (id === 'pause') { if (host.pause) host.pause(); return; }
    if (id === 'pad') return;
    const s = host.state && host.state();
    if (empty() && !(id !== 'dive' && s && +id.slice(1) === s.g)) { shake = { id, at: now() }; haptic([30, 40, 30]); }
    else haptic(tw('HAPTIC_MS', 8));
    if (id === 'dive') host.dive(); else host.flip(+id.slice(1));
  }
  function attach(h) { host = h; clear(); }
  function detach() { host = null; clear(); }
  function clear() { for (const k in pressed) delete pressed[k]; shake = null; }
  // pointer down (CSS px). true = handled by the pad (caller stops); false = not a pad target or inactive.
  function down(x, y, id) {
    if (!host || !host.active()) return false;
    const v = host.view(), tgt = targetAt(x, y, layout(v.W, v.H));
    if (!tgt) return false;
    pressed[id] = tgt;
    fire(tgt);
    return true;
  }
  function up(id) { delete pressed[id]; }
  function cancel(id) { delete pressed[id]; }
  const KEYS = { ArrowUp: 'k0', ArrowRight: 'k1', ArrowDown: 'k2', ArrowLeft: 'k3', ' ': 'dive', r: 'retry', R: 'retry' };
  function key(k) {
    if (!host || !host.active() || !KEYS[k]) return false;
    fire(KEYS[k]);
    return true;
  }
  // draw model for the UI agent (PL.drawPad(ctx, view, model)) and the fallback below
  function view() {
    const v = host ? host.view() : { W: 0, H: 0 }, s = host && host.state ? host.state() : null;
    const p = {}; for (const k in pressed) p[pressed[k]] = true;
    const t = now();
    if (shake && t - shake.at > SHAKE_MS) shake = null;
    return { layout: layout(v.W, v.H), lit: s ? s.g : -1, dim: empty(), pressed: p,
      shake: shake ? { id: shake.id, age: (t - shake.at) / SHAKE_MS } : null, hand: settings.hand };
  }
  // plain fallback drawing (used only until draw.js provides PL.drawPad). Canvas 2D, CSS px transform already set.
  const ARROW = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function drawFallback(ctx, m) {
    const L = m.layout;
    const box = (r, fill, stroke) => { ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); };
    for (let i = 0; i < 4; i++) {
      const k = L.keys[i], lit = m.lit === i, on = m.pressed['k' + i];
      const dx = m.shake && m.shake.id === 'k' + i ? Math.sin(m.shake.age * 30) * 2 : 0;
      ctx.save(); ctx.translate(dx, 0); ctx.globalAlpha = m.dim ? 0.4 : 1;
      box(k, on ? '#ffd76a' : lit ? '#e8b64a' : 'rgba(20,24,40,0.55)', lit ? '#fff3c4' : 'rgba(255,255,255,0.7)');
      const cx = k.x + k.w / 2, cy = k.y + k.h / 2, a = ARROW[i], s = k.w * 0.22;
      ctx.fillStyle = lit || on ? '#1b1a17' : '#ffffff';
      ctx.beginPath(); ctx.moveTo(cx + a[0] * s, cy + a[1] * s);
      ctx.lineTo(cx - a[0] * s * 0.6 - a[1] * s, cy - a[1] * s * 0.6 + a[0] * s);
      ctx.lineTo(cx - a[0] * s * 0.6 + a[1] * s, cy - a[1] * s * 0.6 - a[0] * s); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = m.dim ? 0.4 : 1;
    const dsh = m.shake && m.shake.id === 'dive' ? Math.sin(m.shake.age * 30) * 2 : 0;
    ctx.translate(dsh, 0);
    box(L.dive, m.pressed.dive ? '#ffd76a' : 'rgba(20,24,40,0.55)', 'rgba(255,255,255,0.7)');
    ctx.fillStyle = m.pressed.dive ? '#1b1a17' : '#fff'; ctx.font = '700 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Dive', L.dive.x + L.dive.w / 2, L.dive.y + L.dive.h / 2);
    ctx.restore();
    box(L.retry, m.pressed.retry ? '#ffd76a' : 'rgba(20,24,40,0.55)', 'rgba(255,255,255,0.7)');
    ctx.fillStyle = m.pressed.retry ? '#1b1a17' : '#fff'; ctx.font = '700 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Retry', L.retry.x + L.retry.w / 2, L.retry.y + L.retry.h / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  return {
    layout, attach, detach, down, up, cancel, clear, key, view, drawFallback, haptic,
    getHand: () => settings.hand, setHand: (h) => { if (h === 'left' || h === 'right') { settings.hand = h; save(); } return settings.hand; },
    getVibrate: () => settings.vibrate, setVibrate: (b) => { settings.vibrate = !!b; save(); return settings.vibrate; },
    scheme: 'B-arrow-pad',
  };
})();
