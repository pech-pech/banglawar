// node assets.test.js : manifest files exist + sizes (WebP headers), total budget, nine-slice maths, loader never throws.
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const AD = path.join(ROOT, 'assets');
(0, eval)(fs.readFileSync(path.join(ROOT, 'src', 'parts', 'assets.js'), 'utf8').replace(/^const PL =/m, 'var PL ='));
const A = globalThis.PL.Assets;
let fails = 0;
function t(name, fn) { try { fn(); console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + e.message); } }
function webpSize(f) {
  const b = fs.readFileSync(f);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const k = b.toString('ascii', 12, 16);
  if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (k === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}
t('manifest files exist and match declared size', () => {
  assert.ok(A.manifest.length >= 20);
  for (const m of A.manifest) {
    const f = path.join(AD, m.file); if (m.opt && !fs.existsSync(f)) continue;   // optional art may be absent
    assert.ok(fs.existsSync(f), 'missing ' + m.file);
    const [w, h] = webpSize(f); assert.deepEqual([w, h], [m.w, m.h], m.file + ' is ' + w + 'x' + h);
  }
});
t('no unlisted files in assets/ (no masters, qa, sheets)', () => {
  const listed = new Set(A.manifest.map(m => m.file));
  for (const f of fs.readdirSync(AD)) assert.ok(listed.has(f), 'unlisted ' + f);
});
t('total budget < 800 KB', () => {
  let tot = 0; for (const f of fs.readdirSync(AD)) tot += fs.statSync(path.join(AD, f)).size;
  console.log('     assets/ total ' + (tot / 1024).toFixed(1) + ' KB');
  assert.ok(tot < 800 * 1024);
  for (const n of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) assert.ok(fs.statSync(path.join(ROOT, n)).size < 160 * 1024, n);
});
t('backdrop cover-fit maths and fallback', () => {
  const p = A.coverPlan(720, 1280, 400, 300); assert.ok(p.w >= 400 && p.h >= 300 && Math.abs(p.x + p.w / 2 - 200) < 1e-9);
  A._reset(); assert.equal(A.drawBackdrop(fakeCtx(), 400, 300), false);
});
t('optional art (lantern, stoneTile, corbel) never counts as missing', () => {
  A._reset(); for (const m of A.manifest) if (!m.opt) A._inject(m.name, { w: m.w, h: m.h });
  assert.deepEqual(A.missing(), []); assert.deepEqual(A.missingOptional().sort(), ['corbel', 'lantern', 'stoneTile']);
  for (const n of ['lantern', 'stoneTile', 'corbel']) assert.ok(A.byName[n] && A.byName[n].opt, n);
});
t('ledge >= 18 px tall at 100 px wide', () => { const m = A.byName.ledge; assert.ok(m.h * 100 / m.w >= 18); });
t('platform plan: short block, tiles + caps fill width exactly', () => {
  for (const w of [40, 100, 160, 333, 600]) {
    const p = A.platformPlan(w, 32), got = 2 * p.capW + p.full * p.tileW + p.rem;
    assert.ok(Math.abs(got - w) < 1e-6, w + ' -> ' + got); assert.equal(p.tall, false); assert.equal(p.courseH, 32);
  }
});
t('platform plan: caps shrink when narrower than two caps', () => {
  const p = A.platformPlan(20, 32); assert.equal(p.capW, 10); assert.equal(p.full, 0); assert.ok(p.rem < 1e-9);
});
t('platform plan: tall block has course + fill = h', () => {
  const p = A.platformPlan(200, 140); assert.ok(p.tall); assert.ok(Math.abs(p.courseH + p.fillH - 140) < 1e-9); assert.ok(p.courseH < 36);
});
t('spike plan for 4 sides', () => {
  const r = { x: 0, y: 0, w: 140, h: 24 };
  assert.deepEqual([A.spikePlan(r, 'up').vert, A.spikePlan(r, 'down').vert], [false, false]);
  const v = A.spikePlan({ x: 0, y: 0, w: 24, h: 140 }, 'left'); assert.ok(v.vert); assert.equal(v.len, 140); assert.equal(v.th, 24);
  const sm = A.manifest.find(m => m.name === 'spikes'); assert.equal(A.spikePlan(r, 'up').n, Math.round(140 / (24 * sm.w / sm.h)));
  assert.equal(A.dirAngle('up'), 0); assert.equal(A.dirAngle('down'), Math.PI); assert.equal(A.dirAngle('right'), Math.PI / 2); assert.equal(A.dirAngle('left'), -Math.PI / 2);
});
// fake canvas context recording draw calls
function fakeCtx() {
  const calls = []; const c = new Proxy({}, { get: (o, k) => k === 'calls' ? calls : (k in o ? o[k] : (...a) => { calls.push(k); return k === 'createRadialGradient' ? { addColorStop() {} } : undefined; }), set: (o, k, v) => { o[k] = v; return true; } });
  return c;
}
t('nothing loaded: get() null, missing() lists all, draws return false, no throw', () => {
  A._reset(); assert.equal(A.get('platMid'), null); assert.equal(A.missing().length, A.manifest.filter(m => !m.opt).length); assert.equal(A.missingOptional().length, A.manifest.filter(m => m.opt).length);
  const c = fakeCtx(); const r = { x: 0, y: 0, w: 50, h: 30 };
  assert.equal(A.drawPlatform(c, 0, 0, 100, 30), false); assert.equal(A.drawSpikes(c, r, 'up'), false);
  assert.equal(A.drawCrusher(c, r), false); assert.equal(A.drawLedge(c, 0, 0, 100), false); assert.equal(A.drawGate(c, r), false);
  assert.equal(A.drawPortal(c, 0, 0, 100, 0), false); assert.equal(A.drawPip(c, 0, 0, 20, true), false); assert.equal(A.drawHero(c, 'idle', 0, 0, 40), false);
});
t('with art injected: draws use all pieces', () => {
  A._reset(); for (const m of A.manifest) A._inject(m.name, { w: m.w, h: m.h });
  assert.equal(A.missing().length, 0);
  const c = fakeCtx();
  assert.ok(A.drawPlatform(c, 0, 0, 200, 140)); assert.ok(c.calls.filter(k => k === 'drawImage').length >= 4);
  assert.ok(A.drawSpikes(c, { x: 0, y: 0, w: 24, h: 140 }, 'right')); assert.ok(A.drawCrusher(c, { x: 0, y: 0, w: 60, h: 200 }, 'down'));
  assert.ok(A.drawLedge(c, 0, 0, 100, null, 0.5)); assert.ok(A.drawGate(c, { x: 0, y: 0, w: 40, h: 90 }, 0.5));
  assert.ok(A.drawPortal(c, 50, 50, 80, 1)); assert.ok(A.drawPip(c, 5, 5, 20, false)); assert.ok(A.drawHero(c, 'dive', 0, 0, 40, { shadow: true }));
});
t('draw never throws when ctx is broken', () => {
  const bad = { drawImage() { throw new Error('x'); }, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {} };
  assert.equal(A.drawSpikes(bad, { x: 0, y: 0, w: 70, h: 48 }, 'up'), false); assert.equal(A.drawPlatform(bad, 0, 0, 90, 30), false);
});
(async () => {
  A._reset();
  const mk = (mode) => () => { const im = {}; setTimeout(() => { if (mode === 'ok') im.onload && im.onload(); else if (mode === 'err') im.onerror && im.onerror(); }, 5); Object.defineProperty(im, 'src', { set() {} }); return im; };
  let n = 0; const m1 = await A.load({ timeout: 40, makeImage: () => mk(['ok', 'err', 'hang'][n++ % 3])() });
  try {
    assert.ok(m1.length > 0 && m1.length < A.manifest.filter(m => !m.opt).length); const why = Object.values(A.reasons());
    assert.ok(why.includes('error') && why.includes('timeout')); console.log('ok   loader settles (ok/error/timeout): missing ' + m1.length);
  } catch (e) { fails++; console.log('FAIL loader: ' + e.message); }
  A._reset(); const m2 = await A.load({ makeImage: () => { throw new Error('boom'); } });
  try { assert.equal(m2.length, A.manifest.filter(m => !m.opt).length); console.log('ok   loader survives throwing Image()'); } catch (e) { fails++; console.log('FAIL ' + e.message); }
  console.log(fails ? fails + ' FAILED' : 'all assets tests passed'); process.exit(fails ? 1 : 0);
})();
