// node input.test.js : S1 arrow pad adapter (PL.Input) - layout rects on 475x638 / 344x882 / 816x568, both hands,
// fire on touch-down, multi-touch, lit / dim / shake, keyboard, haptics, settings, and camera fit never under the pad.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const P = path.join(__dirname, '..', 'parts');
function boot(store, nav) {
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const ctx = vm.createContext({ console, Math, JSON, localStorage: ls, navigator: nav || {}, Buffer });
  ctx.globalThis = ctx;
  for (const f of ['core', 'camera', 'tweak', 'input']) vm.runInContext('(function(){' + fs.readFileSync(path.join(P, f + '.js'), 'utf8') + '\n})()', ctx, { filename: f });
  return ctx.PL;
}
const J = (x) => JSON.parse(JSON.stringify(x));
const R = (r) => [r.x, r.y, r.x + r.w, r.y + r.h]; // x0,y0,x1,y1
const inter = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const gap = (a, b) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
let fails = 0, n = 0;
function t(name, fn) { try { fn(); n++; console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); } }
function mkHost(W, H, st) {
  const calls = [];
  const host = { calls, st: st || { g: 2, charges: 2, grounded: true, coyote: 0 }, ms: 1000,
    view: () => ({ W, H }), state: () => host.st, now: () => host.ms, active: () => true,
    flip: (d) => calls.push('flip' + d), dive: () => calls.push('dive'), restart: () => calls.push('restart'), pause: () => calls.push('pause') };
  return host;
}
const ctr = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const VIEWS = [[475, 638], [344, 882], [816, 568]];

t('475x638 right hand: pad box spec (291-471, 310-490) +2 px for the 4 px Dive gap, keys 60, Dive 56', () => {
  const L = J(boot({}).Input.layout(475, 638));
  assert.deepStrictEqual(R(L.box), [289, 308, 473, 492]);
  assert.deepStrictEqual(L.keys.map(R), [[351, 308, 411, 368], [413, 370, 473, 430], [351, 432, 411, 492], [289, 370, 349, 430]]);
  assert.deepStrictEqual(R(L.dive), [353, 372, 409, 428]);
  assert.deepStrictEqual(R(L.retry), [12, 516, 68, 572]);
  assert.deepStrictEqual(R(L.pause), [411, 12, 467, 68]);
  assert.deepStrictEqual(R(L.teach), [291, 92, 471, 296]);
  assert.strictEqual(L.mode, 'side');
});
t('344x882: pad box spec (82-262, 650-830) +2, Retry 12-68 x 660-716, teach y 596-644 full width', () => {
  const L = J(boot({}).Input.layout(344, 882));
  assert.deepStrictEqual(R(L.box), [80, 648, 264, 832]);
  assert.deepStrictEqual(R(L.retry), [12, 660, 68, 716]);
  assert.deepStrictEqual(R(L.teach), [4, 596, 340, 644]);
  assert.deepStrictEqual(R(L.pause), [276, 12, 332, 68]);
  assert.strictEqual(L.mode, 'below');
});
t('816x568 landscape: pad in the right gutter, Retry and teach left (admin default)', () => {
  const L = J(boot({}).Input.layout(816, 568));
  assert.deepStrictEqual(R(L.box), [604, 328, 788, 512]);
  assert.deepStrictEqual(R(L.retry), [12, 330, 68, 386]);
  assert.deepStrictEqual(R(L.teach), [12, 100, 236, 200]);
  assert.strictEqual(L.mode, 'landscape');
});
t('left-hand mirror: x -> W - x - w for pad, Retry, Pause, teach; arrows keep their meaning', () => {
  const PL = boot({});
  for (const [W, H] of VIEWS) {
    const a = J(PL.Input.layout(W, H, { hand: 'right' })), b = J(PL.Input.layout(W, H, { hand: 'left' }));
    for (const k of ['box', 'retry', 'pause', 'teach', 'dive']) assert.strictEqual(b[k].x, W - a[k].x - a[k].w, W + ' ' + k);
    assert(b.keys[1].x > b.keys[3].x, 'right key still right of left key');
  }
  assert.deepStrictEqual(R(J(PL.Input.layout(475, 638, { hand: 'left' })).box), [2, 308, 186, 492]);
  assert.deepStrictEqual(R(J(PL.Input.layout(344, 882, { hand: 'left' })).retry), [276, 660, 332, 716]);
});
t('all views, both hands: on screen, no overlaps, targets >= 56, Dive gap >= 4 to each arrow', () => {
  const PL = boot({});
  for (const [W, H] of VIEWS) for (const hand of ['right', 'left']) {
    const L = PL.Input.layout(W, H, { hand });
    const all = L.keys.concat([L.dive, L.retry, L.pause]);
    for (const r of all.concat([L.box, L.teach])) assert(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H, W + 'x' + H + ' ' + hand + ' off screen ' + JSON.stringify(r));
    for (const r of all) assert(r.w >= 56 && r.h >= 56, 'target < 56');
    for (const k of L.keys) assert(gap(k, L.dive) >= 4, 'dive gap ' + gap(k, L.dive));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!inter(all[i], all[j]), W + ' overlap ' + i + ',' + j);
    assert(!inter(L.teach, L.box) && !inter(L.teach, L.retry) && !inter(L.teach, L.pause), 'teach overlaps');
    assert(L.box.y + L.box.h <= H - 32, 'pad clear of the bottom 32 px (home swipe)');
  }
});
t('fires on touch-down: each key, Dive, Retry, Pause; gap inside pad is swallowed; outside returns false', () => {
  const PL = boot({}), h = mkHost(475, 638); PL.Input.attach(h);
  const L = PL.Input.layout(475, 638);
  L.keys.forEach((k, i) => assert(PL.Input.down(...ctr(k), 10 + i)));
  assert(PL.Input.down(...ctr(L.dive), 20)); assert(PL.Input.down(...ctr(L.retry), 21)); assert(PL.Input.down(...ctr(L.pause), 22));
  assert.deepStrictEqual(h.calls, ['flip0', 'flip1', 'flip2', 'flip3', 'dive', 'restart', 'pause']);
  assert.strictEqual(PL.Input.down(351, 370, 30), true, 'corner gap in pad box swallowed');
  assert.strictEqual(h.calls.length, 7);
  assert.strictEqual(PL.Input.down(100, 200, 31), false, 'room area not handled');
  PL.Input.up(10); PL.Input.up(99);
});
t('multi-touch: a held key does not block a second finger; pressed set tracks both; up clears', () => {
  const PL = boot({}), h = mkHost(344, 882); PL.Input.attach(h);
  const L = PL.Input.layout(344, 882);
  PL.Input.down(...ctr(L.keys[1]), 1); PL.Input.down(...ctr(L.dive), 2);
  assert.deepStrictEqual(h.calls, ['flip1', 'dive']);
  let m = J(PL.Input.view());
  assert(m.pressed.k1 && m.pressed.dive);
  PL.Input.up(1); m = J(PL.Input.view()); assert(!m.pressed.k1 && m.pressed.dive);
  PL.Input.cancel(2); assert(!J(PL.Input.view()).pressed.dive);
  PL.Input.down(...ctr(L.keys[0]), 1); PL.Input.down(...ctr(L.keys[0]), 1); // repeated down, same id: each fires
  assert.strictEqual(h.calls.filter((c) => c === 'flip0').length, 2);
  PL.Input.clear(); assert.deepStrictEqual(J(PL.Input.view()).pressed, {});
});
t('lit key = current down; dim at 0 charges in the air; shake flag on a press at 0 (still logged for the buffer)', () => {
  const PL = boot({}), h = mkHost(475, 638, { g: 1, charges: 2, grounded: false, coyote: 0 }); PL.Input.attach(h);
  let m = J(PL.Input.view()); assert.strictEqual(m.lit, 1); assert.strictEqual(m.dim, false); assert.strictEqual(m.shake, null);
  h.st = { g: 2, charges: 0, grounded: false, coyote: 0 };
  m = J(PL.Input.view()); assert.strictEqual(m.lit, 2); assert.strictEqual(m.dim, true);
  const L = PL.Input.layout(475, 638);
  PL.Input.down(...ctr(L.keys[0]), 1);
  m = J(PL.Input.view()); assert.strictEqual(m.shake.id, 'k0'); assert(m.shake.age >= 0);
  assert.deepStrictEqual(h.calls, ['flip0']);
  h.ms += 1000; assert.strictEqual(J(PL.Input.view()).shake, null, 'shake expires');
  h.st = { g: 2, charges: 0, grounded: true, coyote: 0 }; assert.strictEqual(J(PL.Input.view()).dim, false, 'grounded is never dim');
  h.st = { g: 2, charges: 0, grounded: false, coyote: 3 }; assert.strictEqual(J(PL.Input.view()).dim, false, 'coyote is free');
});
t('keyboard: arrows / space / R map like the old input (same replay entries)', () => {
  const PL = boot({}), h = mkHost(475, 638); PL.Input.attach(h);
  for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', ' ', 'r', 'R']) assert(PL.Input.key(k), k);
  assert(!PL.Input.key('x'));
  assert.deepStrictEqual(h.calls, ['flip0', 'flip1', 'flip2', 'flip3', 'dive', 'restart', 'restart']);
});
t('inactive host (menu / complete / overlay): nothing fires', () => {
  const PL = boot({}), h = mkHost(475, 638); h.active = () => false; PL.Input.attach(h);
  const L = PL.Input.layout(475, 638);
  assert.strictEqual(PL.Input.down(...ctr(L.keys[0]), 1), false); assert.strictEqual(PL.Input.key('ArrowUp'), false);
  assert.deepStrictEqual(h.calls, []);
  PL.Input.detach(); assert.strictEqual(PL.Input.down(...ctr(L.keys[0]), 1), false);
});
t('haptics: vibrate(8) on key press when on and available; 30-40-30 at 0 moves; off = none; no vibrate API = no crash', () => {
  const vib = []; const PL = boot({}, { vibrate: (p) => { vib.push(p); return true; } });
  const h = mkHost(475, 638); PL.Input.attach(h); const L = PL.Input.layout(475, 638);
  PL.Input.down(...ctr(L.keys[0]), 1);
  h.st = { g: 2, charges: 0, grounded: false, coyote: 0 }; PL.Input.down(...ctr(L.keys[1]), 2);
  PL.Input.setVibrate(false); PL.Input.down(...ctr(L.keys[3]), 3);
  assert.deepStrictEqual(J(vib), [8, [30, 40, 30]]);
  const PL2 = boot({}, {}); const h2 = mkHost(475, 638); PL2.Input.attach(h2);
  assert.doesNotThrow(() => PL2.Input.down(...ctr(L.keys[0]), 1));
});
t('settings persist versioned: hand + vibrate in plumbline.input.v1; layout follows saved hand', () => {
  const store = {}; let PL = boot(store);
  assert.strictEqual(PL.Input.getHand(), 'right'); assert.strictEqual(PL.Input.getVibrate(), true);
  PL.Input.setHand('left'); PL.Input.setVibrate(false); PL.Input.setHand('bogus');
  assert.deepStrictEqual(JSON.parse(store['plumbline.input.v1']), { v: 1, hand: 'left', vibrate: false });
  PL = boot(store); assert.strictEqual(PL.Input.getHand(), 'left'); assert.strictEqual(PL.Input.layout(475, 638).box.x, 2);
  store['plumbline.input.v1'] = JSON.stringify({ v: 5, hand: 'left' }); PL = boot(store);
  PL.Input.setHand('right'); assert.strictEqual(JSON.parse(store['plumbline.input.v1']).v, 5, 'newer version never overwritten');
});
t('PAD tweak ids resize the pad around the same centre', () => {
  const PL = boot({}); PL.Tweak.set('PAD_KEY', 64);
  const L = PL.Input.layout(475, 638); assert.strictEqual(L.keys[0].w, 64); assert.strictEqual(L.box.x + L.box.w / 2, 381);
});
t('camera fit: room never under pad, Retry or Pause; scale >= FIT_MIN 0.84 on all 3 views, both hands', () => {
  const PL = boot({});
  assert.strictEqual(PL.CAM.FIT_MIN, 0.84);
  const want = { '475x638': 0.842, '344x882': 1.024, '816x568': 0.956 };
  for (const [W, H] of VIEWS) for (const hand of ['right', 'left']) {
    PL.Input.setHand(hand);
    const view = { W, H, inset: { t: 0, r: 0, b: 0, l: 0 } }, state = { room: { w: 336, h: 500 }, x: 168, y: 250, vx: 0, vy: 0 };
    const f = PL.camUpdate(PL.camNew(), state, view, 1 / 60);
    assert(f.fit, W + ' fit mode');
    const room = { x: (0 - f.cx) * f.scale + W / 2, y: (0 - f.cy) * f.scale + H / 2, w: 336 * f.scale, h: 500 * f.scale };
    const L = PL.Input.layout(W, H);
    for (const k of ['box', 'retry', 'pause']) assert(!inter(room, L[k]), W + 'x' + H + ' ' + hand + ' room under ' + k + ' ' + JSON.stringify(room));
    assert(room.x >= 0 && room.x + room.w <= W + 1e-9 && room.y >= 84 - 1e-9 && room.y + room.h <= H, 'room on screen');
    assert(f.scale >= 0.84, 'scale ' + f.scale);
    assert(Math.abs(f.scale - want[W + 'x' + H]) < 0.001, W + ' scale ' + f.scale.toFixed(4));
    console.log('     ' + W + 'x' + H + ' ' + hand + ': scale ' + f.scale.toFixed(4) + ' room x ' + room.x.toFixed(1) + '-' + (room.x + room.w).toFixed(1) + ' y ' + room.y.toFixed(1) + '-' + (room.y + room.h).toFixed(1) + ' pad x ' + L.box.x + '-' + (L.box.x + L.box.w));
  }
  PL.Input.setHand('right');
});
t('camera with view.pad = null keeps the old full-width fit (475x638 scale 1.096)', () => {
  const PL = boot({});
  const f = PL.camUpdate(PL.camNew(), { room: { w: 336, h: 500 }, x: 1, y: 1 }, { W: 475, H: 638, pad: null }, 1 / 60);
  assert(Math.abs(f.scale - 1.096) < 0.001);
});
console.log(fails ? fails + ' FAILED' : n + ' passed');
process.exit(fails ? 1 : 0);
