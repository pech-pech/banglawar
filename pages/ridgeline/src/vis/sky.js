// vis/sky.js - B4 M4: night front + colour arc (ported from mock duskarc.js + nightfront.js, rewritten for the real loop).
// Cosmetic only. Reads the `vs` snapshot, never the sim. Pure math is exported for tests; GPU objects are built in createSky.
// QA 1 (HIGH): the night grade ONLY darkens and shifts hue toward plum. It never lifts value and never lowers (relative) contrast.
//   grade(c, k):  L = lum(c);  c1 = c * (1 - D k);  c2 = mix(c1, PLUM * lum(c1), H k)   with lum(PLUM) = 1  =>  lum(c2) = (1 - D k) L.
//   A uniform darken plus a luminance-preserving hue mix keeps the ratio L_a / L_b (and Michelson contrast) exactly.
// shift(dz, dy): ADDS dz/dy to stored absolute positions (floating origin passes dz = -2000).

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const KEYS = {
  lookNightRamp: { def: 1, min: 0.5, max: 2, step: 0.05, label: 'Night ramp (gap to n) scale' },
  lookNightStrength: { def: 1, min: 0, max: 1.5, step: 0.05, label: 'Night grade strength' },
  lookStarCount: { def: 320, min: 0, max: 400, step: 10, label: 'Star count' },
  lookStarTwinkle: { def: 1, min: 0, max: 1, step: 0.05, label: 'Star twinkle' },
  lookLanternBright: { def: 1, min: 0, max: 2, step: 0.05, label: 'Lantern brightness' },
};
const kv = (cfg, k) => { const v = cfg && cfg[k]; return typeof v === 'number' && isFinite(v) ? v : KEYS[k].def; };

// ---- gap (m) -> n. [gap, n], gap descending. far >= 130 m n 0; near 60..130 n 0.25..0.5 side; heels < 60 n 0.5..0.85; caught (gap <= 0) n 1.
export const GAP_KEYS = [[150, 0], [130, 0], [95, 0.25], [60, 0.5], [30, 0.7], [10, 0.85], [0, 1]];
export function nightForGap(g) {
  if (!(g === g)) return 0;                       // NaN
  if (g >= GAP_KEYS[0][0]) return 0;              // Infinity too
  for (let i = 1; i < GAP_KEYS.length; i++) {
    if (g >= GAP_KEYS[i][0]) { const a = GAP_KEYS[i - 1], b = GAP_KEYS[i]; return lerp(a[1], b[1], (a[0] - g) / (a[0] - b[0])); }
  }
  return 1;
}
export function lapFloor(lap) { return Math.min(0.3, 0.06 * Math.max(0, lap | 0)); }
// per-zone hue offset (rgb add, tiny, applied to fog/clear only). Warm family, never cold.
export const ZONE_HUE = [[0, 0, 0], [0.018, -0.004, -0.012], [-0.008, 0.006, 0.016], [0.012, 0.008, -0.01], [-0.012, -0.006, 0.01]];
export function zoneHue(zone) { const n = ZONE_HUE.length; return ZONE_HUE[((zone | 0) % n + n) % n]; }

// n from the vs snapshot + cfg (ramp scale shifts the gap axis; lap floor under it; gap Infinity -> floor only)
export function nightFrom(vs, cfg) {
  const ramp = kv(cfg, 'lookNightRamp');
  const g = vs && vs.gap != null ? vs.gap : Infinity;
  const base = isFinite(g) ? nightForGap(g * ramp) : 0;
  return clamp(Math.max(base, lapFloor(vs ? vs.lap : 0)), 0, 1);
}

// ---- night grade (CPU mirror of the GLSL below). strength(n): n 0.5 = 45% of n 0.85, n >= 0.85 = full.
export function gradeStrength(n, cfg) {
  const k = n <= 0 ? 0 : n < 0.5 ? 0.9 * n : n < 0.85 ? lerp(0.45, 1, (n - 0.5) / 0.35) : 1;
  return clamp(k * kv(cfg, 'lookNightStrength'), 0, 1.5);
}
export const GRADE = { D: 0.62, H: 0.55, W: [0.2126, 0.7152, 0.0722], PLUM: [0.45, 0.2, 0.5] };
const _pl = GRADE.PLUM[0] * GRADE.W[0] + GRADE.PLUM[1] * GRADE.W[1] + GRADE.PLUM[2] * GRADE.W[2];
export const PLUM_DIR = [GRADE.PLUM[0] / _pl, GRADE.PLUM[1] / _pl, GRADE.PLUM[2] / _pl]; // luminance 1
export const lum = (c) => c[0] * GRADE.W[0] + c[1] * GRADE.W[1] + c[2] * GRADE.W[2];
// QA-Q1 D1: the GROUND takes a deeper, bluer plum than the sky/fog (same operator, different constants). Linear-light maths:
// golden sand lum .43 -> ~.05 at k 1 (sRGB ~(82,49,108), hue ~270, like reference still 13); k .45 (n 0.5) = 45% of that. Never lifts, never drops contrast.
export const GROUND_GRADE = { D: 0.88, H: 0.85, PLUM: [0.57, 0.21, 1.0] };
const _gl = GROUND_GRADE.PLUM[0] * GRADE.W[0] + GROUND_GRADE.PLUM[1] * GRADE.W[1] + GROUND_GRADE.PLUM[2] * GRADE.W[2];
export const GROUND_PLUM_DIR = [GROUND_GRADE.PLUM[0] / _gl, GROUND_GRADE.PLUM[1] / _gl, GROUND_GRADE.PLUM[2] / _gl]; // luminance 1
export function gradeColor(c, k, out, ground) {
  out = out || [0, 0, 0];
  const G = ground ? GROUND_GRADE : GRADE, P = ground ? GROUND_PLUM_DIR : PLUM_DIR;
  const d = 1 - G.D * k, h = clamp(G.H * k, 0, 1);
  const r = c[0] * d, g = c[1] * d, b = c[2] * d, L = lum([r, g, b]);
  out[0] = r + (P[0] * L - r) * h; out[1] = g + (P[1] * L - g) * h; out[2] = b + (P[2] * L - b) * h;
  return out;
}
// afterglow lip hugging the front edge. dz = metres past the front (negative = inside the night). Zero away from the edge, so mid-range never lifts.
export function lipAt(dz, feather, strength) {
  const x = (dz - feather * 0.2) / (feather * 0.85);
  return Math.exp(-x * x) * strength * (Math.abs(dz) < 3.2 * feather ? 1 : 0);
}
// visual distance of the front behind the sled (the portrait frame shows ground from ~4.7 m behind the sled, so the gap is compressed)
export function frontDistance(gap) { return gap >= 0 ? 4.7 * (Math.min(gap, 140) / 14) : gap; }
export function frontFeather(d) { return 2.2 + 0.11 * Math.abs(d); }

// ---- fog / clear colour as a function of n (dusk palette -> plum -> indigo; darkens only)
const HEX = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const HAZE_G = HEX('#ffb070'), HAZE_D = HEX('#d97a78'), FOG_PLUM = HEX('#5a3a78'), FOG_INDIGO = HEX('#2a2358');
export function hazeAt(n, out) {
  out = out || [0, 0, 0];
  const t = 0.55 * n + 0.4 * sm(0.6, 1, n), p = sm(0.3, 1, n) * 0.85 * kvSafe, deep = sm(0.7, 1, n);
  for (let i = 0; i < 3; i++) {
    const day = lerp(HAZE_G[i], HAZE_D[i], t), night = lerp(FOG_PLUM[i], FOG_INDIGO[i], deep);
    out[i] = lerp(day, night, p);
  }
  return out;
}
const kvSafe = 1;

// ---- stars: pure layout (testable). count entries into typed arrays. Sharp 1-2 px, ~8% 3 px.
export const STAR_MAX = 400;
export function starLayout(count, rnd, sunAzDeg, out) {
  const DEG = Math.PI / 180, R = 275;
  out = out || { pos: new Float32Array(STAR_MAX * 3), sz: new Float32Array(STAR_MAX), ph: new Float32Array(STAR_MAX), el: new Float32Array(STAR_MAX), k: new Float32Array(STAR_MAX) };
  for (let i = 0; i < count; i++) {
    let az, elD, tries = 0;
    do { az = sunAzDeg + (rnd() < 0.7 ? (rnd() - 0.5) * 110 : rnd() * 360 - 180); elD = 8 + 72 * Math.pow(rnd(), 1.15); tries++; } // QA D8: 70% in the ~110 deg window the portrait camera sees, above the canyon rim
    while (tries < 6 && Math.hypot(((az - sunAzDeg + 540) % 360) - 180, elD - 2) < 14); // keep the sun halo clear
    const a = az * DEG, e = elD * DEG;
    out.pos[i * 3] = Math.sin(a) * Math.cos(e) * R; out.pos[i * 3 + 1] = Math.sin(e) * R; out.pos[i * 3 + 2] = Math.cos(a) * Math.cos(e) * R;
    const r = rnd();
    out.sz[i] = r < 0.08 ? 3 : r < 0.45 ? 2 : 1;
    out.ph[i] = rnd(); out.el[i] = elD; out.k[i] = 0.55 + 0.45 * rnd();
  }
  return out;
}
// zenith-down reveal: elevation (deg) below which stars are still hidden, as a function of n. All on at n 0.85.
export function starCeil(n) { return lerp(90, 0, sm(0.12, 0.85, n)); }

// ---- ground shader chunk. `vW` (vec3 world pos) and `col` (vec3) must be in scope; `vFogDepth` optional via #ifdef-free use (declared by render.js).
export function groundChunk() {
  return {
    uniforms: {
      uSkF: { value: { x: -1e6, y: 3, z: 0.16, w: 0 } },        // front z at the sled x, feather, curve, terminator strength
      uSkS: { value: { x: 0, y: 0, z: 0, w: 0 } },              // sled x, y, z, unused
      uSkG: { value: { x: 0, y: GROUND_GRADE.D, z: GROUND_GRADE.H, w: 0 } },  // global (ahead) strength, darken D, hue H, lip strength
      uSkP: { value: { x: GROUND_PLUM_DIR[0], y: GROUND_PLUM_DIR[1], z: GROUND_PLUM_DIR[2] } },
    },
    fragDecl: `uniform vec4 uSkF; uniform vec4 uSkS; uniform vec4 uSkG; uniform vec3 uSkP;`,
    fragBody: `
 {
 // B4 night grade: terminator by world Z behind the sled. ONLY darkens + shifts hue to plum (luminance-preserving hue mix). Never lifts value.
 float skdx = vW.x - uSkS.x;
 float skdz = vW.z - ( uSkF.x + min( uSkF.z * skdx * skdx, 12.0 ) );
 float skA = ( 1.0 - smoothstep( - uSkF.y, uSkF.y, skdz ) ) * uSkF.w;
 float skFar = smoothstep( 30.0, 120.0, vFogDepth );
 float skK = clamp( max( skA, uSkG.x * ( 1.0 - 0.85 * skFar ) ), 0.0, 1.0 );
 vec3 sk1 = col * ( 1.0 - uSkG.y * skK );
 float skL = dot( sk1, vec3( 0.2126, 0.7152, 0.0722 ) );
 col = mix( sk1, uSkP * skL, clamp( uSkG.z * skK, 0.0, 1.0 ) );
 // afterglow lip: narrow band on the front edge only (zero beyond 3 feathers), warm rose to gold
 float skX = ( skdz - uSkF.y * 0.2 ) / ( uSkF.y * 0.85 );
 float skLip = exp( - skX * skX ) * uSkG.w * step( abs( skdz ), 3.2 * uSkF.y );
 vec3 skLc = mix( vec3( 0.95, 0.36, 0.52 ), vec3( 1.0, 0.72, 0.36 ), smoothstep( - 0.6 * uSkF.y, 1.2 * uSkF.y, skdz ) );
 skLc /= dot( skLc, vec3( 0.2126, 0.7152, 0.0722 ) );
 col = mix( col, skLc * dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ), clamp( skLip * 0.45, 0.0, 1.0 ) ); // hue only, luminance preserved (QA 1: never lift)
 }`,
  };
}

// ---- fog / clear colour for the integrator: out.fog, out.clear = [r,g,b] (arrays reused), out.n
export function skyParams(out, n, zone) {
  out = out || {};
  out.fog = out.fog || [0, 0, 0]; out.clear = out.clear || [0, 0, 0];
  hazeAt(n == null ? 0 : n, out.fog);
  if (zone != null) { const z = zoneHue(zone); for (let i = 0; i < 3; i++) out.fog[i] = clamp(out.fog[i] + z[i] * (1 - 0.5 * (n || 0)), 0, 1); }
  out.clear[0] = out.fog[0]; out.clear[1] = out.fog[1]; out.clear[2] = out.fog[2];
  out.n = n == null ? 0 : n;
  return out;
}

const STAR_VS = `attribute float aSz; attribute float aPh; attribute float aEl; attribute float aK;
uniform float uCeil; uniform float uTime; uniform float uTw; uniform float uPx; uniform float uOp;
varying float vA; varying float vS;
void main() {
 gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
 float tw = 1.0 - uTw * 0.35 * ( 0.5 + 0.5 * sin( uTime * ( 1.3 + aPh * 1.7 ) + aPh * 40.0 ) );
 vA = aK * tw * clamp( ( aEl - uCeil ) / 6.0, 0.0, 1.0 ) * uOp;
 vS = aSz; gl_PointSize = aSz * uPx;
}`;
const STAR_FS = `varying float vA; varying float vS;
void main() {
 vec2 q = abs( gl_PointCoord - 0.5 );
 float m = 1.0;
 if ( vS > 2.5 ) m = step( min( q.x, q.y ), 0.17 ); // 3 px: a tiny sharp cross, never a round dot
 gl_FragColor = vec4( 1.0, 0.95, 0.86, vA * m );
}`;

const NL = 32;

export function createSky(ctx) {
  const { THREE, scene, camera } = ctx;
  const cfg = () => ctx.cfg || {};
  const S = { n: 0, target: 0, glide: 0, now: 0, dusk: false, tier: 'max', frontZ: -1e6, zone: 0, lap: 0, reduced: false, starCount: -1, lanN: 0, lastDay: 0 };
  const chunk = groundChunk();
  const U = chunk.uniforms;
  const scratch = { fog: [0, 0, 0], clear: [0, 0, 0], n: 0 };
  const rnd = ctx.crng || (() => 0.5);

  // ---- stars: 1 Points call, ShaderMaterial, sharp points
  const geo = new THREE.BufferGeometry();
  const lay = { pos: new Float32Array(STAR_MAX * 3), sz: new Float32Array(STAR_MAX), ph: new Float32Array(STAR_MAX), el: new Float32Array(STAR_MAX), k: new Float32Array(STAR_MAX) };
  geo.setAttribute('position', new THREE.BufferAttribute(lay.pos, 3));
  geo.setAttribute('aSz', new THREE.BufferAttribute(lay.sz, 1));
  geo.setAttribute('aPh', new THREE.BufferAttribute(lay.ph, 1));
  geo.setAttribute('aEl', new THREE.BufferAttribute(lay.el, 1));
  geo.setAttribute('aK', new THREE.BufferAttribute(lay.k, 1));
  const starU = { uCeil: { value: 90 }, uTime: { value: 0 }, uTw: { value: 1 }, uPx: { value: 1 }, uOp: { value: 1 } };
  const starMat = new THREE.ShaderMaterial({ uniforms: starU, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false, fog: false });
  const stars = new THREE.Points(geo, starMat);
  stars.frustumCulled = false; stars.renderOrder = -8; stars.visible = false;
  scene.add(stars);
  function layoutStars(count) {
    const sd = ctx.sunDir, sunAz = sd ? Math.atan2(sd.x, sd.z) * 180 / Math.PI : 0;
    starLayout(count, rnd, sunAz, lay);
    for (const a of ['position', 'aSz', 'aPh', 'aEl', 'aK']) geo.attributes[a].needsUpdate = true;
    geo.setDrawRange(0, count); S.starCount = count;
  }

  // ---- lanterns: 1 instanced additive billboard call (DataTexture, no canvas)
  const lanTex = (() => {
    const N = 32, d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2), a = r >= 1 ? 0 : Math.min(1, Math.exp(-r * r * 9) * 1.1 + Math.exp(-r * r * 40));
      const i = (y * N + x) * 4; d[i] = 255; d[i + 1] = 214 + 30 * (1 - r) | 0; d[i + 2] = 140 + 90 * (1 - r) | 0; d[i + 3] = a * 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
  })();
  const lanMat = new THREE.MeshBasicMaterial({ map: lanTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  lanMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `vec4 lnC = modelMatrix * vec4( instanceMatrix[3].xyz, 1.0 );
 vec4 mvPosition = viewMatrix * lnC;
 mvPosition.xy += position.xy * vec2( instanceMatrix[0].x, instanceMatrix[1].y );
 gl_Position = projectionMatrix * mvPosition;`);
  };
  lanMat.customProgramCacheKey = () => 'skyLantern';
  const lanMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), lanMat, NL);
  lanMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lanMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  lanMesh.frustumCulled = false; lanMesh.renderOrder = 4; lanMesh.count = 0; lanMesh.visible = false;
  scene.add(lanMesh);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color(), lanC = new THREE.Color('#ffc46a');
  let lanK = 0, lanSource = null;
  function emit(x, y, z, size, k) {
    if (S.lanN >= NL || lanK <= 0) return;
    const i = S.lanN++, fl = S.reduced ? 1 : 0.9 + 0.1 * Math.sin(S.now * 2.3 + i * 7.1) * Math.sin(S.now * 1.1 + i * 3.3);
    _p.set(x, y, z); _s.set(size, size, 1); _m.compose(_p, _q, _s); lanMesh.setMatrixAt(i, _m);
    lanMesh.setColorAt(i, _c.copy(lanC).multiplyScalar(lanK * (k == null ? 1 : k) * fl));
  }

  function setUniforms(vs, n) {
    const k = gradeStrength(n, cfg());
    const gap = vs && isFinite(vs.gap) ? vs.gap : 1e4;
    const caught = n >= 0.999 && S.target >= 1;
    const d = caught ? -100 : frontDistance(gap);
    S.frontZ = vs.z - d;
    U.uSkF.value.x = S.frontZ; U.uSkF.value.y = frontFeather(d); U.uSkF.value.w = k > 0 ? Math.min(1, k) : 0;
    U.uSkS.value.x = vs.x; U.uSkS.value.y = vs.y; U.uSkS.value.z = vs.z;
    U.uSkG.value.x = k * sm(0.45, 1, n);  // the ground AHEAD of the front starts to dim only in the late stages
    U.uSkG.value.w = sm(0.05, 0.3, n) * (1 - 0.6 * sm(0.85, 1, n));
  }

  function update(dt, vs) {
    S.now += dt; S.reduced = !!(vs && vs.reduced) || cfg().lookReducedMotion === 1;
    S.lap = vs.lap | 0; S.zone = vs.zone | 0;
    S.target = S.glide > 0 ? 1 : nightFrom(vs, cfg());
    if (S.glide > 0) { S.glide = Math.max(0, S.glide - dt); S.n = lerp(S.n, 1, 1 - S.glide) ; if (S.glide === 0) S.n = 1; if (S.glide === 0) S.glide = -1; }
    else if (S.glide < 0) S.n = 1;
    else { const a = 1 - Math.exp(-dt * (S.reduced ? 20 : 4)); S.n += (S.target - S.n) * a; if (Math.abs(S.target - S.n) < 1e-4) S.n = S.target; }
    const n = S.n;
    // stars
    const want = Math.round(clamp(kv(cfg(), 'lookStarCount'), 0, STAR_MAX));
    if (want !== S.starCount) layoutStars(want);
    const ceil = starCeil(n);
    starU.uCeil.value = ceil; starU.uTime.value = S.now; starU.uTw.value = S.reduced ? 0 : kv(cfg(), 'lookStarTwinkle');
    starU.uPx.value = ctx.renderer && ctx.renderer.getPixelRatio ? ctx.renderer.getPixelRatio() : 1;
    starU.uOp.value = S.tier === 'lean' ? 0.8 : 1;
    stars.visible = want > 0 && n > 0.12; stars.position.copy(camera.position);
    // lanterns
    lanK = Math.max(sm(0.4, 0.8, n), 0) * kv(cfg(), 'lookLanternBright') * (S.tier === 'lean' ? 0.8 : 1);
    S.lanN = 0;
    if (lanK > 0.002 && lanSource) lanSource(emit);
    lanMesh.count = S.lanN; lanMesh.visible = S.lanN > 0;
    if (S.lanN > 0) { lanMesh.instanceMatrix.needsUpdate = true; if (lanMesh.instanceColor) lanMesh.instanceColor.needsUpdate = true; }
    setUniforms(vs, n);
    // HUD dusk hook with hysteresis
    if (!S.dusk && n > 0.4) { S.dusk = true; try { if (typeof window !== 'undefined' && window.__hudSky) window.__hudSky('dusk'); } catch (e) { /* ignore */ } }
    else if (S.dusk && n < 0.35) S.dusk = false;
  }
  function fx(ev) {
    if (!ev) return;
    if (ev.type === 'caught' || ev === 'caught') S.glide = 1.0;
    else if (ev.type === 'run_start') { S.glide = 0; S.n = 0; S.dusk = false; }
  }
  function shift(dz, dy) { S.frontZ += dz || 0; U.uSkF.value.x += dz || 0; U.uSkS.value.z += dz || 0; U.uSkS.value.y += dy || 0; }
  function setQuality(t) { S.tier = t; }
  function stats() { return { n: S.n, target: S.target, stars: stars.visible ? S.starCount : 0, lanterns: S.lanN, calls: (stars.visible ? 1 : 0) + (lanMesh.visible ? 1 : 0), dusk: S.dusk }; }
  function dispose() {
    scene.remove(stars); scene.remove(lanMesh);
    geo.dispose(); starMat.dispose(); lanTex.dispose(); lanMat.dispose(); lanMesh.geometry.dispose(); lanMesh.dispose();
  }
  return {
    update, fx, shift, setQuality, stats, dispose,
    groundChunk: () => chunk,
    skyParams: (out) => skyParams(out || scratch, S.n, S.zone),
    setLanternSource(fn) { lanSource = fn; },
    get n() { return S.n; }, stars, lanterns: lanMesh,
  };
}
