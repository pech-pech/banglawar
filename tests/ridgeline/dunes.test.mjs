import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../pages/ridgeline/src');
const { pexp, psin, layoutDunes, duneAt, baseOffset, SHAPES } = await import(src + '/dunes.js');
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
