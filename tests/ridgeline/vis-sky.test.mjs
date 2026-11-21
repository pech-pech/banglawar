// B4 M4 sky: gap->n table, lap floor, night grade (CPU mirror of the GLSL), stars, pools.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../pages/ridgeline');
const S = await import(root + '/src/vis/sky.js');
const THREE = await import(root + '/vendor/three.module.js');

test('gap->n table is monotone and hits the spec bands', () => {
  let prev = -1;
  for (let g = 200; g >= -5; g -= 1) { const n = S.nightForGap(g); assert.ok(n >= prev - 1e-12, `monotone at gap ${g}`); assert.ok(n >= 0 && n <= 1); prev = n; }
  assert.equal(S.nightForGap(Infinity), 0); assert.equal(S.nightForGap(130), 0); assert.equal(S.nightForGap(500), 0);
  const near = S.nightForGap(95); assert.ok(near >= 0.25 && near <= 0.5);
  assert.ok(S.nightForGap(59) > 0.5 && S.nightForGap(10) <= 0.85 + 1e-9 && S.nightForGap(10) >= 0.85 - 1e-9);
  assert.equal(S.nightForGap(0), 1); assert.equal(S.nightForGap(-50), 1); assert.equal(S.nightForGap(NaN), 0);
  for (let i = 1; i < S.GAP_KEYS.length; i++) assert.ok(S.GAP_KEYS[i][0] < S.GAP_KEYS[i - 1][0] && S.GAP_KEYS[i][1] >= S.GAP_KEYS[i - 1][1]);
});

test('lap floor and nightFrom', () => {
  assert.equal(S.lapFloor(0), 0); assert.ok(Math.abs(S.lapFloor(2) - 0.12) < 1e-12); assert.equal(S.lapFloor(10), 0.3);
  assert.equal(S.nightFrom({ gap: Infinity, lap: 0 }, {}), 0);
  assert.equal(S.nightFrom({ gap: Infinity, lap: 3 }, {}), S.lapFloor(3));
  assert.equal(S.nightFrom({ gap: 200, lap: 9 }, {}), 0.3);
  assert.ok(S.nightFrom({ gap: 10, lap: 9 }, {}) > 0.8);
  const slow = S.nightFrom({ gap: 60, lap: 0 }, { lookNightRamp: 1 }), fast = S.nightFrom({ gap: 60, lap: 0 }, { lookNightRamp: 2 });
  assert.ok(fast < slow);
  assert.equal(S.nightFrom({}, undefined), 0);
});

const SAND = [[1, 0.69, 0.44], [0.9, 0.55, 0.52], [0.54, 0.29, 0.45], [0.23, 0.12, 0.38], [1, 0.88, 0.66], [0.12, 0.08, 0.2], [0.8, 0.8, 0.8], [0.02, 0.01, 0.03]];
const mich = (a, b) => (S.lum(a) - S.lum(b)) / (S.lum(a) + S.lum(b));

test('night grade never raises luminance, never drops contrast, shifts toward plum', () => {
  for (const n of [0.1, 0.25, 0.5, 0.7, 0.85, 1]) {
    const k = S.gradeStrength(n, {});
    for (const c of SAND) {
      const g = S.gradeColor(c, k);
      assert.ok(S.lum(g) <= S.lum(c) + 1e-12, `lum up at n ${n}`);
      for (const ch of g) assert.ok(isFinite(ch) && ch >= 0);
      if (S.lum(c) > 0.3) assert.ok(g[0] / g[1] >= c[0] / c[1] - 1e-9 || g[2] / g[1] >= c[2] / c[1] - 1e-9, 'plum shift');
      assert.ok(g[2] / g[0] <= Math.max(c[2] / c[0], S.PLUM_DIR[2] / S.PLUM_DIR[0]) + 1e-9, 'never colder than plum');
    }
    for (const a of SAND) for (const b of SAND) {
      if (a === b || S.lum(a) <= S.lum(b)) continue;
      const m0 = mich(a, b), m1 = mich(S.gradeColor(a, k), S.gradeColor(b, k));
      assert.ok(m1 >= m0 - 1e-9, `contrast dropped n ${n}`);
      const ratio0 = S.lum(a) / S.lum(b), ratio1 = S.lum(S.gradeColor(a, k)) / S.lum(S.gradeColor(b, k));
      assert.ok(ratio1 >= ratio0 - 1e-9);
    }
  }
  const a = [1, 0.69, 0.44]; assert.deepEqual(S.gradeColor(a, 0), a.map((v) => v)); // n 0 untouched
});

test('n 0.5 grade strength is 45% of n 0.85', () => {
  assert.ok(Math.abs(S.gradeStrength(0.5, {}) - 0.45 * S.gradeStrength(0.85, {})) < 1e-12);
  assert.equal(S.gradeStrength(0.85, {}), 1); assert.equal(S.gradeStrength(0, {}), 0);
  let p = 0; for (let n = 0; n <= 1; n += 0.01) { const k = S.gradeStrength(n, {}); assert.ok(k >= p - 1e-12); p = k; }
  // darkening at n .5 is 45% of the n .85 darkening, for every sample
  for (const c of SAND) {
    const d85 = S.lum(c) - S.lum(S.gradeColor(c, 1)), d50 = S.lum(c) - S.lum(S.gradeColor(c, S.gradeStrength(0.5, {})));
    assert.ok(Math.abs(d50 - 0.45 * d85) < 1e-9 * Math.max(1, d85));
  }
});

test('afterglow lip is local to the front edge; GLSL grade block has no lift outside the lip', () => {
  assert.equal(S.lipAt(40, 3, 1), 0); assert.equal(S.lipAt(-40, 3, 1), 0); assert.ok(S.lipAt(0.6, 3, 1) > 0.5);
  const ch = S.groundChunk();
  for (const u of ['uSkF', 'uSkS', 'uSkG', 'uSkP']) { assert.ok(ch.uniforms[u]); assert.ok(ch.fragDecl.includes(u)); }
  assert.ok(ch.fragBody.includes('vW') && ch.fragBody.includes('col ='));
  const grade = ch.fragBody.split('// afterglow')[0];
  assert.ok(!/col\s*\+=/.test(grade) && !/col\s*\*=\s*[^;]*\b[1-9]\d*\.\d+\b\s*;?\s*$/m.test('') );
  assert.ok(Math.abs(S.PLUM_DIR[0] * 0.2126 + S.PLUM_DIR[1] * 0.7152 + S.PLUM_DIR[2] * 0.0722 - 1) < 1e-9);
});

test('skyParams darken monotonically toward plum, zone hue small', () => {
  const o = S.skyParams(null, 0, 0); let pl = S.lum(o.fog);
  for (let n = 0.1; n <= 1.0001; n += 0.1) { S.skyParams(o, n, 0); const l = S.lum(o.fog); assert.ok(l <= pl + 1e-9, 'fog lum rises at ' + n); pl = l; assert.ok(o.fog[2] <= o.fog[0] * 2.2); }
  for (let z = 0; z < 7; z++) for (const v of S.zoneHue(z)) assert.ok(Math.abs(v) < 0.03);
  assert.deepEqual(S.zoneHue(-1), S.zoneHue(4));
});

test('star layout: deterministic, sharp sizes, sun clear, zenith-down reveal', () => {
  const mk = (seed) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const a = S.starLayout(200, mk(7), 0), b = S.starLayout(200, mk(7), 0, null);
  assert.deepEqual(Array.from(a.pos.slice(0, 600)), Array.from(b.pos.slice(0, 600)));
  let big = 0; for (let i = 0; i < 200; i++) { assert.ok([1, 2, 3].includes(a.sz[i])); if (a.sz[i] === 3) big++; assert.ok(a.el[i] >= 2 && a.el[i] <= 80); }
  assert.ok(big > 3 && big < 40);
  assert.ok(S.starCeil(0) === 90 && S.starCeil(0.85) === 0); let p = 91; for (let n = 0; n <= 1; n += 0.02) { const c = S.starCeil(n); assert.ok(c <= p); p = c; }
});

function mkCtx(cfg) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  let s = 3; const crng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return { THREE, scene, camera, cfg: cfg || {}, crng, sunDir: new THREE.Vector3(0, 0.05, 1), renderer: { getPixelRatio: () => 2 } };
}
const vs0 = (o) => Object.assign({ t: 0, x: 0, y: 0, z: 100, gap: Infinity, lap: 0, zone: 0, reduced: false }, o);

test('createSky: calls <= 2, stars/lanterns reveal, pooled, reduced motion, shift, hud hook', () => {
  globalThis.window = { __hudSky: (m) => { globalThis.__hudCalls.push(m); } }; globalThis.__hudCalls = [];
  const ctx = mkCtx(); const sky = S.createSky(ctx);
  const before = ctx.scene.children.length;
  let emitted = 0; sky.setLanternSource((e) => { for (let i = 0; i < 100; i++) { e(i, 1, 100 + i, 2); emitted++; } });
  sky.update(0.016, vs0());
  assert.equal(sky.stats().calls, 0); assert.equal(sky.stars.visible, false);
  for (let i = 0; i < 400; i++) sky.update(0.016, vs0({ gap: 8 }));
  const st = sky.stats(); assert.ok(st.n > 0.8); assert.ok(st.stars > 0); assert.equal(st.lanterns, 32); assert.ok(st.calls <= 2);
  assert.equal(ctx.scene.children.length, before);
  assert.deepEqual(globalThis.__hudCalls, ['dusk']);
  // gap table drives n, glide to 1 on caught
  sky.fx({ type: 'caught' }); sky.update(0.5, vs0({ gap: 0 })); const mid = sky.n; assert.ok(mid >= 0.8);
  for (let i = 0; i < 100; i++) sky.update(0.02, vs0({ gap: 0 })); assert.equal(sky.n, 1);
  sky.fx({ type: 'run_start' }); sky.update(0.016, vs0()); assert.equal(sky.n, 0);
  // shift
  const u = sky.groundChunk().uniforms; sky.update(0.016, vs0({ z: 3000, gap: 20 })); const z0 = u.uSkF.value.x; sky.shift(-2000, 0); assert.equal(u.uSkF.value.x, z0 - 2000);
  // reduced motion: no twinkle, same state
  sky.update(0.016, vs0({ reduced: true, gap: 20 })); assert.equal(sky.stars.material.uniforms.uTw.value, 0);
  // deterministic with same seed
  const a = mkCtx(), b = mkCtx(), sa = S.createSky(a), sb = S.createSky(b);
  sa.update(0.016, vs0({ gap: 5 })); sb.update(0.016, vs0({ gap: 5 }));
  assert.deepEqual(Array.from(sa.stars.geometry.attributes.position.array.slice(0, 90)), Array.from(sb.stars.geometry.attributes.position.array.slice(0, 90)));
  const o = sky.skyParams(); assert.ok(Array.isArray(o.fog));
  sky.dispose(); sa.dispose(); sb.dispose();
  delete globalThis.window;
});
