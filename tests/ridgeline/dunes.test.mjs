import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../pages/ridgeline/src');
const { pexp, psin, layoutDunes, duneAt, baseOffset, SHAPES } = await import(src + '/dunes.js');
const { halfWidthAt } = await import(src + '/endless.js');
const { createCourse } = await import(src + '/terrain.js');
const { cfg, resetCfg } = await import(src + '/config.js');

const mk = (seed) => { resetCfg(); return createCourse(seed, cfg); };
const seeds20 = Array.from({ length: 20 }, (_, i) => 1000 + i * 7919);
const seeds50 = Array.from({ length: 50 }, (_, i) => 77 + i * 104729);

test('psin accuracy over [-1e4, 1e4]', () => {
  let worst = 0;
  for (let i = 0; i <= 400000; i++) {
    const x = -1e4 + i * 0.05 + (i % 7) * 0.0123;
    worst = Math.max(worst, Math.abs(psin(x) - Math.sin(x)));
  }
  for (const x of [0, Math.PI, Math.PI / 2, -Math.PI / 2, 1e4, -1e4, 1e-9]) worst = Math.max(worst, Math.abs(psin(x) - Math.sin(x)));
  console.log('psin max error', worst.toExponential(2));
  assert.ok(worst < 1e-8, 'worst ' + worst);
});

test('determinism: same seed gives identical features and heights', () => {
  for (const s of seeds20.slice(0, 5)) {
    const a = mk(s), b = mk(s);
    assert.deepEqual(a.features, b.features);
    for (let z = 0; z < 1800; z += 13.7) assert.equal(a.height(a.centerX(z) + 2, z), b.height(b.centerX(z) + 2, z));
  }
  assert.notDeepEqual(mk(1).features, mk(2).features);
});

test('curvature cap |d2h/dz2| <= 0.0255 on 20 seeds', () => {
  let worst = 0, where = '';
  for (const s of seeds20) {
    const k = mk(s);
    // x fixed over the 1 m stencil; lines: centre, +-half width * 0.5, edge (1 m inside the bank start)
    for (const off of [0, 0.5, -0.5, 'e', '-e']) {
      for (let z = 5; z <= 1795; z += 0.25) {
        const x0 = k.centerX(z) + (off === 'e' ? k.halfWidth(z) - 1 : off === '-e' ? -(k.halfWidth(z) - 1) : off * k.halfWidth(z));
        const h = (zz) => k.height(x0, zz);
        const d2 = (h(z + 1) - 2 * h(z) + h(z - 1)) / 1;
        if (Math.abs(d2) > worst) { worst = Math.abs(d2); where = `seed ${s} off ${off} z ${z}`; }
      }
    }
  }
  console.log('max |d2h/dz2|', worst.toFixed(5), where);
  assert.ok(worst <= 0.0255, `${worst} at ${where}`);
});

test('texture alone is under 0.002 curvature (plain-plane check outside features)', () => {
  for (const s of seeds20.slice(0, 5)) {
    const k = mk(s);
    let worst = 0;
    for (let z = 5; z < 140; z += 0.25) {
      const x0 = k.centerX(z) + 1;
      const h = (zz) => k.height(x0, zz);
      worst = Math.max(worst, Math.abs(h(z + 1) - 2 * h(z) + h(z - 1)));
    }
    assert.ok(worst <= 0.002, 'texture ' + worst);
  }
});

test('no rock inside lee or 3 m before up-face start', () => {
  for (const s of seeds20) {
    const k = mk(s);
    const rocks = k.rocksInRange(0, 1800);
    for (const r of rocks) {
      for (const f of k.features) {
        assert.ok(!(r.z >= f.z && r.z <= f.z + f.lee), `rock ${r.id} in lee of ${f.type}@${f.z}`);
        assert.ok(!(r.z >= f.z - f.lead - 3 && r.z <= f.z - f.lead), `rock ${r.id} on approach of ${f.type}@${f.z}`);
      }
    }
  }
});

test('feature spacing, counts per type, API', () => {
  const counts = {};
  let pitchSum = 0, pitchN = 0, minPitch = 1e9, nSum = 0;
  for (const s of seeds50) {
    const f = layoutDunes(s, 1800, cfg);
    nSum += f.length;
    assert.ok(f[0].z === 170, 'first at 170');
    assert.ok(f[f.length - 1].z <= 1800 - 110, 'last before length-110');
    for (let i = 0; i < f.length; i++) {
      counts[f[i].type] = (counts[f[i].type] || 0) + 1;
      if (f[i].z < 600) assert.ok(['roller', 'hopper', 'step', 'crestS'].includes(f[i].type), 'easy start ' + f[i].type);
      if (i) {
        const p = f[i].z - f[i - 1].z;
        pitchSum += p; pitchN++; minPitch = Math.min(minPitch, p);
        assert.ok(p >= Math.max(f[i - 1].end, f[i - 1].lee) + f[i].lead - 1e-9);
        assert.ok(!(f[i].type === 'crestL' && f[i - 1].type === 'crestL'));
      }
    }
  }
  const mean = pitchSum / pitchN;
  console.log(`features/run ${(nSum / seeds50.length).toFixed(2)}, mean pitch ${mean.toFixed(1)} m, min pitch ${minPitch.toFixed(1)}, counts`, JSON.stringify(counts));
  assert.ok(mean >= 60 && mean <= 110);
  const k = mk(5);
  const f = k.features[2];
  assert.equal(k.featureAt(f.z).id, f.id);
  assert.equal(k.featureAt(f.z - f.lead - 1), null);
  assert.equal(k.crestAt(f.z).lipZ, f.z);
  assert.ok(Math.abs(duneAt(k.features, f.z) - SHAPES[f.type].g(0)) < 1e-12);
  assert.ok(baseOffset(k.features, 1799) <= 0);
});

test('slow sled never flies: R = v^2 k / (9.8 cos th) < 1.5 at 22 m/s on the course line', () => {
  let worst = 0, where = '';
  for (const s of seeds50) {
    const k = mk(s);
    const y = (z) => k.height(k.centerX(z), z);
    for (let z = 5; z < 1795; z += 0.25) {
      const sl = (y(z + 0.05) - y(z - 0.05)) / 0.1;
      const d2 = (y(z + 1) - 2 * y(z) + y(z - 1));
      const curv = -d2 / Math.pow(1 + sl * sl, 1.5), cos = 1 / Math.sqrt(1 + sl * sl);
      const R = 22 * 22 * curv / (9.8 * cos);
      if (R > worst) { worst = R; where = `seed ${s} z ${z}`; }
    }
  }
  console.log('max R at 22 m/s', worst.toFixed(3), where);
  assert.ok(worst < 1.5);
});

test('pexp relative error < 1e-10', () => {
  let worst = 0;
  for (let x = -30; x <= 30; x += 0.001) worst = Math.max(worst, Math.abs(pexp(x) / Math.exp(x) - 1));
  console.log('pexp max rel error', worst.toExponential(2));
  assert.ok(worst < 1e-10);
});

// ---------------------------------------------------------------- B2: endless fold
const D = await import(src + '/dunes.js');
const { createFold, duneField, w: wfn } = D;
const seeds20e = Array.from({ length: 20 }, (_, i) => 31 + i * 6007);
const mkc = () => { resetCfg(); return cfg; };

test('fold: same seed same features regardless of extend order, deterministic', () => {
  const c = mkc();
  for (const s of seeds20e.slice(0, 8)) {
    const a = createFold(s, c), b = createFold(s, c), d = createFold(s, c);
    a.extend(30000);
    for (const z of [9000, 300, 21000, 100, 30000, 15000]) b.extend(z);
    for (let z = 0; z <= 30000; z += 700) d.extend(z);
    const n = Math.min(a.features.length, b.features.length, d.features.length);
    assert.ok(n > 300);
    assert.deepEqual(a.features.slice(0, n), b.features.slice(0, n));
    assert.deepEqual(a.features.slice(0, n), d.features.slice(0, n));
    // lookups auto-extend and agree
    const e = createFold(s, c);
    assert.equal(duneField(e, 29000.5, 1, 12), duneField(a, 29000.5, 1, 12));
    assert.equal(baseOffset(e, 29999), baseOffset(a, 29999));
  }
  assert.notDeepEqual(createFold(1, c).extend(2000).features, createFold(2, c).extend(2000).features);
});

test('fold: rules (first z, easy start, no hard-after-hard, no 3 repeat, cooldowns, spacing, zone order)', () => {
  const c = mkc();
  const seen = new Set();
  for (const s of seeds20e) {
    const f = createFold(s, c).extend(30000).features;
    assert.equal(f[0].z, 170);
    let lastGap = -1e9, lastTab = -1e9, lastKick = -1e9, zl = 0;
    for (let i = 0; i < f.length; i++) {
      seen.add(f[i].type);
      if (f[i].z < 600) assert.ok(['roller', 'hopper', 'step', 'crestS'].includes(f[i].type), f[i].type);
      if (i) {
        assert.ok(!(f[i].hard && f[i - 1].hard), 'hard after hard');
        assert.ok(f[i].z - f[i - 1].z >= Math.max(f[i - 1].end, f[i - 1].lee) + f[i].lead - 1e-9);
        assert.ok(f[i].z > f[i - 1].z);
        assert.ok(f[i].lap * 100 + f[i].zone >= zl, 'zone order');
      }
      zl = f[i].lap * 100 + f[i].zone;
      if (i > 1) assert.ok(!(f[i].type === f[i - 1].type && f[i].type === f[i - 2].type));
      if (f[i].type === 'gap') { assert.ok(f[i].z - lastGap >= 500 - 100, 'gap'); lastGap = f[i].z; }
      if (f[i].type === 'tabletop') { assert.ok(f[i].z - lastTab >= 350 - 100, 'table'); lastTab = f[i].z; }
      if (f[i].type === 'kicker') { assert.ok(f[i].z - lastKick >= 400 - 100, 'kicker'); lastKick = f[i].z; }
      assert.ok(f[i].lee <= c.leeCapM + 1e-9);
    }
  }
  for (const t of ['roller', 'hopper', 'crestS', 'crestM', 'crestL', 'step', 'kicker', 'double', 'tabletop', 'gap', 'blade', 'bowl'])
    if (t !== 'crestS') assert.ok(seen.has(t), 'type never picked ' + t);
});

test('fold: cumDrop equals linear baseOffset; index/featureAt agree with linear scan', () => {
  const c = mkc();
  const fold = createFold(4242, c).extend(8000);
  const arr = fold.features;
  for (let z = 0; z < 7900; z += 3.7) {
    assert.ok(Math.abs(fold.cumDrop(z) - baseOffset(arr, z)) < 1e-9, 'drop at ' + z);
    let lin = null;
    for (const f of arr) { if (z < f.z - f.lead) break; if (z <= f.z + f.end) { lin = f; break; } }
    assert.equal(fold.featureAt(z), lin);
    assert.ok(Math.abs(duneAt(fold, z) - duneAt(arr, z)) < 1e-12);
    assert.equal(duneField(fold, z, 3, 12), duneField(arr, z, 3, 12));
  }
});

test('fold: height lookups at z=30000 are fast', () => {
  const c = mkc();
  const fold = createFold(99, c);
  fold.extend(30400);
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < 200000; i++) {
    const z = 29000 + (i % 1000) * 1.1;
    acc += duneField(fold, z, (i % 9) - 4, 11) + baseOffset(fold, z);
  }
  const ms = performance.now() - t0;
  console.log('200k lookups at 30 km:', ms.toFixed(0), 'ms', acc > -1e12);
  assert.ok(ms < 800, 'slow ' + ms);
  const t1 = performance.now();
  createFold(7, c).extend(30000);
  console.log('fold 30 km build', (performance.now() - t1).toFixed(0), 'ms');
});

test('fold: curvature cap 0.0255 for all types, 20 seeds x 30 km at 0.25 m, x lines incl. blade/bowl', () => {
  const c = mkc();
  const byType = {};
  let worst = 0, where = '';
  for (const s of seeds20e) {
    const fold = createFold(s, c).extend(30000);
    // height at absolute x measured from the nominal centre; bowl moves the centre line
    for (const f of fold.features.slice(0, -3)) { // snapshot: lookups near the end extend the fold
      const hw = halfWidthAt(f.z, c);
      const hAt = (x, z) => fold.cumDrop(z) + duneField(fold, z, x - fold.laneShift(z), hw);
      const lines = [0, 0.5 * hw, hw - 1, -(hw - 1), -(hw + 2)];
      if (f.type === 'bowl') lines.push(f.shift, -f.shift, 0.8 * hw, -0.8 * hw);
      for (const x of lines) {
        for (let z = f.z - f.lead - 1; z <= f.z + f.end + 1; z += 0.25) {
          const d2 = hAt(x, z + 1) - 2 * hAt(x, z) + hAt(x, z - 1);
          const a = Math.abs(d2);
          if (a > (byType[f.type] || 0)) byType[f.type] = a;
          if (a > worst) { worst = a; where = `seed ${s} ${f.type}@${f.z.toFixed(0)} x ${x.toFixed(1)}`; }
        }
      }
    }
  }
  console.log('fold max |d2h/dz2| per type', JSON.stringify(byType, (k, v) => (typeof v === 'number' ? +v.toFixed(5) : v)));
  assert.ok(worst <= 0.0255, `${worst} at ${where}`);
});

test('blade: peak moves with x (s - x tan phi); bowl: lane shift out and back, wall on outer side', () => {
  const c = mkc();
  const fold = createFold(555, c).extend(30000);
  const blade = fold.features.find((f) => f.type === 'blade');
  const hw = 12;
  const peakZ = (x) => { let bz = 0, bv = -1; for (let z = blade.z - blade.lead; z <= blade.z + blade.end; z += 0.05) { const v = duneField(fold, z, x, hw); if (v > bv) { bv = v; bz = z; } } return bz; };
  const dz = peakZ(blade.xClamp * 0.5) - peakZ(-blade.xClamp * 0.5);
  assert.ok(Math.abs(dz - blade.xClamp * blade.tanPhi) < 0.2, `peak shift ${dz} vs ${blade.xClamp * blade.tanPhi}`);
  assert.ok(Math.abs(blade.xClamp * Math.abs(blade.tanPhi)) >= 3);
  const bowl = fold.features.find((f) => f.type === 'bowl');
  assert.ok(Math.abs(fold.laneShift(bowl.z)) < 1e-9);
  assert.ok(Math.abs(fold.laneShift(bowl.z + 55) - bowl.shift) < 1e-9);
  assert.ok(Math.abs(fold.laneShift(bowl.z + 110)) < 1e-9);
  assert.ok(Math.abs(bowl.shift) <= 9);
  // wall rises on the outer side only
  const s = bowl.z + 25, o = -bowl.side;
  assert.ok(duneField(fold, s, o * 11, 12) > 0.3);
  assert.equal(duneField(fold, s, -o * 11, 12), 0);
});

test('fold: zoneGuard marks the first 60 m of each zone', () => {
  const c = mkc();
  const fold = createFold(1, c);
  assert.ok(fold.zoneGuard(1200 + 30) && !fold.zoneGuard(1200 + 70) && fold.zoneGuard(2700 + 59.9));
  assert.ok(!fold.zoneGuard(1190));
});

test('B1 layoutDunes output unchanged and still plain arrays', () => {
  const a = layoutDunes(321, 1800, cfg);
  assert.ok(Array.isArray(a));
  assert.deepEqual(Object.keys(a[0]), ['id', 'type', 'z', 'lead', 'end', 'lee', 'H', 'side', 'variant', 'hard', 'wEdge']);
  assert.ok(a.every((f) => ['roller', 'hopper', 'crestS', 'crestM', 'crestL', 'step'].includes(f.type)));
});
