'use strict';
// MoonFX self-test. Run: node tests/fx.js
const path = require('path');
const MoonFX = require(path.join(__dirname, '..', 'src', 'fx.js'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const names = [['jump', { x: 0, y: 0, charge01: 1 }], ['land', { x: 0, y: 0, vn: 400, body: 1 }], ['chain', { x: 0, y: 0, n: 3 }],
  ['bounce', { x: 0, y: 0 }], ['crumble', { x: 0, y: 0 }], ['over', { x: 0, y: 0, cause: 'tide' }]];
let calls = 0;
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => { calls++; }), set: (t, k, v) => { t[k] = v; return true; } });
const w2s = (x, y) => [x + 100, y + 100];

const r = MoonFX.make({ reduced: true });
names.forEach(([n, d]) => r.event(n, d));
r.update(0.016);
ok(r.shake().x === 0 && r.shake().y === 0, 'reduced: no shake');
ok(r.pause() === 0, 'reduced: no pause');
ok(r.live() > 0, 'reduced: particles still emitted');

const f = MoonFX.make({});
f.event('land', { x: 0, y: 0, vn: 20, body: 0 });
ok(f.pause() === 0, 'soft land: no hit-pause');
f.event('land', { x: 0, y: 0, vn: 400, body: 0 });
ok(f.pause() >= 0.04 && f.pause() <= 0.09, 'hard land pause 0.04-0.09: ' + f.pause().toFixed(3));
f.event('chain', { x: 0, y: 0, n: 9 });
ok(f.pause() <= 0.09, 'chain pause <= 0.09');
let s = f.shake(); ok(Math.hypot(s.x, s.y) > 0, 'shake nonzero after hard land');
for (let i = 0; i < 60; i++) f.update(0.016);
ok(f.pause() === 0, 'pause decays to 0');
s = f.shake(); ok(s.x === 0 && s.y === 0, 'shake decays to 0');
ok(f.live() === 0, 'particles expire');

// pool bound + no throw + no allocation growth
const g = MoonFX.make({});
let threw = false;
try {
  for (let i = 0; i < 2000; i++) { names.forEach(([n, d]) => g.event(n, d)); g.trail(i, i); g.update(0.016); g.draw(ctx, { scale: 1 }, w2s); }
  g.event('bogus'); g.event('land'); g.update(0); g.update(-1); g.update(NaN);
} catch (e) { threw = true; console.log(e); }
ok(!threw, 'stress: no throw');
ok(g.live() <= 160, 'pool bounded: ' + g.live());
ok(calls > 0, 'draw issues canvas calls');
{ const o = MoonFX.make({}); o.event('land', { x: 0, y: 0, vn: 150 }); ok(o.pause() === 0, 'vn150 (q=.375 @400) no pause'); o.event('land', { x: 0, y: 0, vn: 240 }); ok(o.pause() > 0, 'vn240 pauses (shared 400 norm)'); }
{ const o = MoonFX.make({}); o.event('over', { x: 1, y: 1 }); let n = 0; o.draw({ set fillStyle(v) {}, set globalAlpha(v) {}, beginPath() {}, arc(x, y) { if (typeof x !== 'number' || x !== x) throw new Error('bad xy'); n++; }, fill() {} }, { scale: 1 }, (x, y) => ({ x, y })); ok(n > 0, 'w2s object {x,y} supported'); }
{ const a = MoonFX.make({}), b = MoonFX.make({}); a.event('over', { x: 0, y: 0 }); b.event('over', { x: 0, y: 0 }); a.update(0.032); for (let i = 0; i < 2; i++) b.update(0.016); ok(Math.abs(a.live() - b.live()) <= 0, 'frame-rate independent live count'); }
const before = process.memoryUsage().heapUsed;
for (let i = 0; i < 20000; i++) { g.trail(i, 0); g.update(0.016); g.draw(ctx, { scale: 1 }, (x, y) => [x, y]); }
ok(process.memoryUsage().heapUsed - before < 30e6, 'no runaway heap growth');
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
