// node src/test/vfx.test.js - PL.Light / PL.Vfx with a fake canvas (no DOM)
const assert = require('assert');
const fs = require('fs'), path = require('path');
const calls = { n: 0 };
function fakeCtx() {
  const grad = { addColorStop() {} };
  const h = {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      return function () { calls.n++; };
    },
    set(t, k, v) { t[k] = v; return true; }
  };
  return new Proxy({}, h);
}
global.document = { createElement() { return { width: 0, height: 0, getContext: fakeCtx }; } };
globalThis.PL = {};
function load(f) { new Function(fs.readFileSync(path.join(__dirname, '../parts', f), 'utf8') + '\n').call(globalThis); }
load('light.js'); load('vfx.js');
const V = PL.Vfx, L = PL.Light;
let pass = 0;
function t(name, fn) { fn(); pass++; console.log('ok', name); }

const room = {
  w: 336, h: 500, walls: [[0, 470, 336, 30], [0, 0, 16, 500], [320, 0, 16, 500]], spikes: [{ r: [34, 458, 92, 12] }],
  crushers: [{ r: [150, 40, 64, 30], ay: 1, amp: 50, phase: 0 }], gates: [{ r: [236, 286, 16, 84], dir: 1 }],
  crumbles: [[24, 330, 96, 12]], exit: { x: 290, y: 440 }
};
function fresh(seed) { V.init(400, 600, 3, { seed: seed || 5 }); V.setRoom(room); V.setQuality('full'); V.setReduced(false); }
const hero = { x: 100, y: 440, g: 2, t: 0, dead: 0, grounded: true };
const cam = { scale: 1.1, cx: 168, cy: 250 };
function nanFree(o) { for (const k in o) if (typeof o[k] === 'number') assert(isFinite(o[k]), k + ' not finite'); }

t('RNG deterministic and distinct per seed', () => {
  const a = PL.vfxRand(42), b = PL.vfxRand(42), c = PL.vfxRand(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 20; i++) { sa.push(a()); sb.push(b()); sc.push(c()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  sa.forEach(v => assert(v >= 0 && v < 1));
});
t('same seed + same inputs give identical particle state', () => {
  function run() {
    fresh(9); const h = Object.assign({}, hero);
    for (let i = 0; i < 90; i++) { h.x += 2; V.update(1 / 60, i === 10 ? ['flip'] : i === 30 ? ['land', 'dive'] : [], h, 2); }
    const S = V._V; return Array.from(S.x.slice(0, 60)).join(',') + '|' + S.count;
  }
  assert.strictEqual(run(), run());
});
t('pool caps never exceeded (flood of events, every quality, reduced)', () => {
  for (const q of ['full', 'lite', 'off']) for (const red of [false, true]) {
    fresh(3); V.setQuality(q); V.setReduced(red);
    const h = Object.assign({}, hero);
    for (let i = 0; i < 400; i++) {
      h.x = 60 + (i % 200); h.y = 440 - (i % 50);
      V.update(1 / 60, ['flip', 'dive', 'land', 'crumble', 'death', 'win', 'flip', 'land'], h, i % 4);
      const s = V.stats();
      assert(s.particles <= s.cap, q + ' ' + red + ' particles ' + s.particles + ' > cap ' + s.cap);
      assert(s.particles <= 160);
    }
    const s = V.stats();
    assert(s.cap === (red ? Math.min(24, { full: 160, lite: 64, off: 0 }[q]) : { full: 160, lite: 64, off: 0 }[q]), 'cap ' + q + red);
    assert(s.peak <= s.cap + 0 || q === 'off' || s.peak <= 160);
  }
});
t('reduced cap is 24, lite 64, full 160', () => {
  fresh(); assert.strictEqual(V.stats().cap, 160); V.setQuality('lite'); assert.strictEqual(V.stats().cap, 64);
  V.setReduced(true); assert.strictEqual(V.stats().cap, 24);
});
t('governor steps down after 2 s over 20 ms, never while busy, steps up slowly', () => {
  const g = new V.Governor();
  let st = 0; for (let i = 0; i < 400 && !st; i++) st = g.push(25, false);
  assert.strictEqual(st, 1); assert.strictEqual(g.level, 1);
  // busy: never steps
  const b = new V.Governor(); for (let i = 0; i < 600; i++) assert.strictEqual(b.push(30, true), 0); assert.strictEqual(b.level, 0);
  // healthy 60 Hz never steps down
  const h = new V.Governor(); for (let i = 0; i < 2000; i++) assert.strictEqual(h.push(16.7, false), 0);
  // up-step needs 30 s since last change
  let ups = 0, downs = 0, t0 = 0;
  const u = new V.Governor(); for (let i = 0; i < 200; i++) u.push(25, false); // -> lite (maybe off)
  const lvl = u.level; assert(lvl >= 1);
  let upAt = -1; for (let i = 0; i < 3000; i++) { const r = u.push(12, false); t0 += 12 / 1000; if (r === -1) { upAt = t0; break; } }
  assert(upAt >= 25 && upAt < 40, 'upstep timing ' + upAt); // 30 s gap minus the ~4 s already elapsed after the step-down
  void ups; void downs;
  // hitches over 250 ms ignored
  const hh = new V.Governor(); for (let i = 0; i < 200; i++) hh.push(400, false); assert.strictEqual(hh.level, 0);
});
t('auto governor drives quality; manual setQuality locks it', () => {
  fresh(); V.setQuality('auto'); const h = Object.assign({}, hero);
  for (let i = 0; i < 300; i++) V.update(1 / 25, [], h, 2); // 40 ms frames (sim dt clamps, governor sees raw)
  assert.notStrictEqual(V.stats().quality, 'full');
  fresh(); V.setQuality('full');
  for (let i = 0; i < 300; i++) V.update(1 / 25, [], h, 2);
  assert.strictEqual(V.stats().quality, 'full');
  V.setQuality('auto'); assert.strictEqual(V.stats().auto, true);
});
t('reduced-motion: no shake, no tilt, no flash pulses, calm cap', () => {
  fresh(); V.setReduced(true);
  const h = Object.assign({}, hero);
  for (let i = 0; i < 60; i++) { V.update(1 / 60, i === 5 ? ['flip'] : [], h, 1); V.fire('slam', { x: 100, y: 100 }); }
  const fx = V.cameraFx();
  assert.strictEqual(fx.shx, 0); assert.strictEqual(fx.shy, 0); assert.strictEqual(fx.tilt, 0); assert.strictEqual(fx.zoom, 1);
  assert.strictEqual(V.stats().shake, 0);
  assert.strictEqual(L._S.boost, 0); assert.strictEqual(L._S.desat, 0);
  V.update(1 / 60, ['death'], h, 2); assert.strictEqual(L._S.desat, 0);
  V.update(1 / 60, ['win'], h, 2); assert.strictEqual(L._S.celT, 0);
  // full motion does shake
  V.setReduced(false); V.fire('slam', { x: 100, y: 100 }); V.update(1 / 60, [], h, 2);
  assert(V._V.shakeAmp === 5);
});
t('flash limiter: at most 3 per second (we allow 2)', () => {
  const f = new V.FlashLimiter(10); let ok = 0;
  for (let i = 0; i < 100; i++) if (f.try(i * 0.01)) ok++;
  assert.strictEqual(ok, 3);
  const g = new V.FlashLimiter(2); let k = 0; for (let i = 0; i < 100; i++) if (g.try(i * 0.01)) k++; assert.strictEqual(k, 2);
  // through the module: spam flips, check pulse counter
  fresh(); const h = Object.assign({}, hero); let rises = 0, last = 0;
  for (let i = 0; i < 120; i++) { V.update(1 / 60, ['flip'], h, 1); const b = L._S.boost; if (b > last + 0.01) rises++; last = b; }
  assert(rises <= 4, 'rises in 2 s: ' + rises); // 2 s window -> at most 2/s
});
t('slam shake: full 5 px, lite 2 px, off 0', () => {
  fresh(); V.fire('slam', {}); assert.strictEqual(V._V.shakeAmp, 5);
  V.setQuality('lite'); V.fire('slam', {}); assert.strictEqual(V._V.shakeAmp, 2);
  V.setQuality('off'); V._V.shakeAmp = 0; V.fire('slam', {}); assert.strictEqual(V._V.shakeAmp, 0);
});
t('no NaN with garbage input, dt 0, negative, huge, missing hero', () => {
  fresh();
  V.update(0, [], hero, 2); V.update(-1, [], hero, 2); V.update(NaN, [], hero, 2); V.update(100, ['flip'], hero, 2);
  V.update(1 / 60, null, null, undefined); V.update(1 / 60, ['bogus', { type: 'land', x: NaN }], { x: NaN, y: 1 }, 9);
  V.update(1 / 60, [{ type: 'crumble' }, { type: 'slam', x: 1, y: 1 }], { x: 1e6, y: -1e6, g: 0 }, 0);
  for (let i = 0; i < 200; i++) V.update(1 / 60, i % 7 ? [] : ['flip', 'dive', 'land', 'death'], { x: i * 5, y: i * 3, t: i * 2, g: i % 4 }, i % 4);
  nanFree(V.stats()); nanFree(V.cameraFx()); nanFree(V.heroDeform());
  const S = V._V; for (let i = 0; i < 160; i++) if (S.alive[i]) { assert(isFinite(S.x[i]) && isFinite(S.y[i]) && isFinite(S.vx[i]) && isFinite(S.life[i])); }
  const ctx = fakeCtx(); V.drawBack(ctx, cam); V.drawFront(ctx, cam); V.drawOverlay(ctx, cam); V.drawBack(ctx, null); V.drawFront(ctx, {});
});
t('uninitialised / off modules are safe', () => {
  const ctx = fakeCtx();
  // draw before init on a fresh load
  globalThis.PL = {}; load('light.js'); load('vfx.js');
  PL.Vfx.update(0.016, [], hero, 2); PL.Vfx.drawBack(ctx, cam); PL.Vfx.drawFront(ctx, cam); PL.Vfx.drawOverlay(ctx, cam); PL.Vfx.stats();
  // restore for the rest
  globalThis.PL = V === PL.Vfx ? PL : PL;
});
t('hazard mask: spikes, gates, crusher boxes exported; dynamic crusher follows tick', () => {
  fresh(); const hz = L._S.hazards; assert.strictEqual(hz.length, 2); // spike + gate (crusher is dynamic)
  assert.strictEqual(hz[0][2], 92 + 12);
  V.update(1 / 60, [], Object.assign({}, hero, { t: 0 }), 2);
  const a = L._S.dyn[0].slice(); V.update(1 / 60, [], Object.assign({}, hero, { t: 60 }), 2);
  assert.notDeepStrictEqual(a, L._S.dyn[0]);
  V.setHazards([[0, 0, 10, 10]]); assert.strictEqual(L.stats().hazards >= 4, true);
});
t('star wipe: close -> closed -> open -> idle, callbacks fire', () => {
  fresh(); let c1 = 0, c2 = 0;
  V.wipe('close', () => { c1++; V.wipe('open', () => { c2++; }); });
  for (let i = 0; i < 80; i++) V.update(1 / 60, [], hero, 2);
  assert.strictEqual(c1, 1); assert.strictEqual(c2, 1); assert.strictEqual(V.wipeState(), 'idle');
  V.setReduced(true); V.wipe('close'); assert(V._V.wipeDur <= 0.15);
});
t('dpr cap 2 (1.5 in lite/off)', () => {
  fresh(); assert.strictEqual(V.dprFor(3), 2); V.setQuality('lite'); assert.strictEqual(V.dprFor(3), 1.5);
  assert.strictEqual(V.stats().dpr, 2);
});
t('draw never allocates particles: pool arrays are fixed typed arrays', () => {
  fresh(); assert(V._V.x instanceof Float32Array && V._V.x.length === 160);
});
console.log('vfx tests passed:', pass);
