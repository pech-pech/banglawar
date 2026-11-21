// vis/moments.js - B4 M3: spray + dust moments, pebbles, cosmetic pennants. Cosmetic only: reads the `vs` snapshot, never physics.
// 3 draw calls: dust (pooled billboards), pebbles (instanced icosphere), pennants (one dynamic ribbon mesh).
// Pools are preallocated typed arrays; update() and fx() allocate nothing.
export const KEYS = {
  lookMomDensity: { def: 1, min: 0.2, max: 2, step: 0.05, label: 'Dust density' },
  lookMomPlumeCap: { def: 1.6, min: 0.4, max: 1.6, step: 0.05, label: 'Plume cap (m)' },
  lookMomLife: { def: 1, min: 0.4, max: 2, step: 0.05, label: 'Dust life' },
  lookMomSkid: { def: 1, min: 0, max: 2, step: 0.05, label: 'Skid fan' },
  lookMomPebbles: { def: 1, min: 0, max: 2, step: 0.05, label: 'Pebbles' },
  lookMomPennant: { def: 1, min: 0, max: 2, step: 0.05, label: 'Pennant whip' },
  lookMomImpactRef: { def: 8, min: 3, max: 20, step: 0.5, label: 'Impact ref (m/s)' },
};

const DUST_VS = `
attribute vec4 aP; attribute vec2 aQ;
varying vec2 vUv; varying vec2 vS; varying vec4 vP; varying vec2 vQ;
void main(){
  vec4 mv = viewMatrix * modelMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  vec2 sc = vec2(instanceMatrix[0].x, instanceMatrix[1].y);
  vec2 q = position.xy * 2.0;
  vS = q; vP = aP; vQ = aQ;
  float cr = cos(aP.x), sr = sin(aP.x);
  vUv = vec2(cr*q.x - sr*q.y, sr*q.x + cr*q.y);
  mv.z += sc.x * 0.4; mv.xy += position.xy * sc;
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = `
uniform vec3 uSun, uGlow, uMid, uCore, uBounce;
varying vec2 vUv; varying vec2 vS; varying vec4 vP; varying vec2 vQ;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+17.1; a*=0.5; } return s; }
void main(){
  float sd = vP.z * 13.7, r = length(vS);
  if (r > 1.0) discard;
  float n = fbm(vUv*1.7 + sd), n2 = fbm(vUv*5.5 + sd*1.7), n3 = fbm(vUv*1.7 + sd + 9.0);
  float d = (1.0 - r) * 1.55 - 0.32 + (n - 0.5) * 1.15 + (n2 - 0.5) * 0.38;
  float a = smoothstep(0.0, 0.3, d);
  a *= 0.82 + 0.18 * step(0.38, h21(floor(vUv*38.0) + sd));
  if (a < 0.01) discard;
  float thick = clamp(d, 0.0, 1.3), z = sqrt(max(0.0, 1.0 - r*r));
  vec3 nn = normalize(vec3(vS.x + (n - 0.5)*0.7, vS.y + (n3 - 0.5)*0.7, z + 0.15));
  float wrap = clamp(dot(nn, uSun)*0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uCore, uMid, smoothstep(0.05, 0.85, wrap * (0.5 + 1.0 * vQ.x) + nn.y * 0.22));
  col = mix(col, uCore, smoothstep(0.35, 1.05, thick) * 0.8 * (1.0 - 0.5 * vQ.x));
  float thin = exp(-thick * 1.7);
  col = mix(col, uGlow * 1.12, clamp(thin * (0.6 + 0.6 * vQ.y), 0.0, 1.0));
  col = mix(col, uCore * 1.15, smoothstep(0.52, 0.8, n3) * 0.4 * (1.0 - thin));
  col += uBounce * max(-nn.y, 0.0) * 0.3 + uGlow * pow(r, 2.6) * 0.2 * vQ.y;
  gl_FragColor = vec4(col, clamp(a * vP.y * 1.05, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const SOLID_VS = `
varying vec3 vC; varying vec3 vVP;
void main(){ vC = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#endif
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vVP = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const SOLID_FS = `
uniform vec3 uSun, uGlow, uAmb;
varying vec3 vC; varying vec3 vVP;
void main(){
  vec3 n = normalize(cross(dFdx(vVP), dFdy(vVP))), v = normalize(-vVP);
  float ndl = dot(n, uSun);
  vec3 col = vC * (uAmb + 0.9 * max(ndl, 0.0) * uGlow);
  col += uGlow * pow(1.0 - max(dot(n, v), 0.0), 2.2) * clamp(ndl + 0.55, 0.0, 1.0) * 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PEN_VS = `
attribute vec3 aCol; varying vec3 vC; varying vec3 vVP;
void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); vVP = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const PEN_FS = `
uniform vec3 uSun, uGlow, uAmb;
varying vec3 vC; varying vec3 vVP;
void main(){
  vec3 n = normalize(cross(dFdx(vVP), dFdy(vVP))), v = normalize(-vVP);
  if (dot(n, v) < 0.0) n = -n;
  float ndl = dot(n, uSun);
  vec3 col = vC * (uAmb + 0.8 * max(ndl, 0.0) * uGlow);
  col = mix(col, vC * 1.25 + uGlow * 0.42, 0.7);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const POOL = { dust: 160, peb: 44, pen: 4, seg: 8 };
const ND = POOL.dust, NP = POOL.peb, NPEN = POOL.pen, NSEG = POOL.seg, NPT = NSEG + 1;
const PEN_COLS = [[1, 0.94, 0.82], [1, 0.77, 0.42], [1, 0.48, 0.35], [1, 0.6, 0.66]];
const CLODS = [[0.82, 0.57, 0.38], [0.77, 0.51, 0.35], [0.88, 0.64, 0.42], [0.72, 0.46, 0.33]];
const GATE_COOL = [0.24, 1, 0.94];
const TIER = { max: 1, showcase: 0.7, lean: 0.4 };

export function createMoments(ctx) {
  const THREE = ctx.THREE, cfg = ctx.cfg || {}, rnd = ctx.crng;
  const kv = (n) => (cfg[n] !== undefined ? cfg[n] : KEYS[n].def);
  const isRed = (vs) => cfg.lookReducedMotion === 1 || (vs && vs.reduced);
  let tierK = 1, lean = false, reduced = false, tNow = 0;

  // ---- dust pool (struct of arrays); age < 0 means free
  const dx = new Float32Array(ND), dy = new Float32Array(ND), dz = new Float32Array(ND);
  const dvx = new Float32Array(ND), dvy = new Float32Array(ND), dvz = new Float32Array(ND);
  const dAge = new Float32Array(ND).fill(-1), dLife = new Float32Array(ND), dW = new Float32Array(ND), dH = new Float32Array(ND);
  const dA = new Float32Array(ND), dGrow = new Float32Array(ND), dDark = new Float32Array(ND), dGlow = new Float32Array(ND);
  const dSeed = new Float32Array(ND), dRot = new Float32Array(ND), dCap = new Float32Array(ND);
  let dCur = 0, spawned = 0, maxTop = 0, live = 0;

  // ---- pebbles
  const px = new Float32Array(NP), py = new Float32Array(NP), pz = new Float32Array(NP);
  const pvx = new Float32Array(NP), pvy = new Float32Array(NP), pvz = new Float32Array(NP);
  const pAge = new Float32Array(NP).fill(-1), pLife = new Float32Array(NP), pS = new Float32Array(NP), pCi = new Uint8Array(NP);
  const pRx = new Float32Array(NP), pRy = new Float32Array(NP);
  let pCur = 0;

  // ---- pennants: verlet chains hanging off a pole top
  const nx = new Float32Array(NPEN * NPT), ny = new Float32Array(NPEN * NPT), nz = new Float32Array(NPEN * NPT);
  const ox = new Float32Array(NPEN * NPT), oy = new Float32Array(NPEN * NPT), oz = new Float32Array(NPEN * NPT);
  const nAge = new Float32Array(NPEN).fill(-1), nAx = new Float32Array(NPEN), nAy = new Float32Array(NPEN), nAz = new Float32Array(NPEN);
  const nCol = new Uint8Array(NPEN), nGate = new Uint8Array(NPEN), nSide = new Float32Array(NPEN);
  let nCur = 0;
  const PEN_LIFE = 14, PEN_LEN = 1.3, PEN_W = 0.32;

  // ---- sled-state bits exposed for the rig
  let skidAcc = 0, glowPulse = 0, glowT = 0, settleT = 0, lastX = 0, lastY = 0, lastZ = 0, lastGy = 0;

  const SUNV = new THREE.Vector3().copy(ctx.sunDir || new THREE.Vector3(0, 0.3, 1)).normalize();
  const sunW = SUNV.clone();
  const C = (h) => new THREE.Color(h);
  const group = new THREE.Group();
  group.frustumCulled = false;

  const dGeo = new THREE.PlaneGeometry(1, 1);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(ND * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aQ = new THREE.InstancedBufferAttribute(new Float32Array(ND * 2), 2).setUsage(THREE.DynamicDrawUsage);
  dGeo.setAttribute('aP', aP); dGeo.setAttribute('aQ', aQ);
  const dMat = new THREE.ShaderMaterial({
    vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUNV }, uGlow: { value: C('#ffcf8a') }, uMid: { value: C('#ecbe8a') }, uCore: { value: C('#7a4466') }, uBounce: { value: C('#e08a4c') } },
  });
  const dust = new THREE.InstancedMesh(dGeo, dMat, ND);
  dust.frustumCulled = false; dust.renderOrder = 6; dust.count = 0; dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const iso = new THREE.IcosahedronGeometry(1, 1);
  const solMat = new THREE.ShaderMaterial({
    vertexShader: SOLID_VS, fragmentShader: SOLID_FS, fog: false,
    uniforms: { uSun: { value: SUNV }, uGlow: { value: C('#ffcf8a') }, uAmb: { value: C('#6a4a5e') } },
  });
  const peb = new THREE.InstancedMesh(iso, solMat, NP);
  peb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3);
  peb.frustumCulled = false; peb.count = 0; peb.renderOrder = 1; peb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const penPos = new Float32Array(NPEN * NPT * 2 * 3), penCol = new Float32Array(NPEN * NPT * 2 * 3);
  const penIdx = new Uint16Array(NPEN * NSEG * 6);
  for (let p = 0, w = 0; p < NPEN; p++) for (let s = 0; s < NSEG; s++) {
    const a = (p * NPT + s) * 2;
    penIdx[w++] = a; penIdx[w++] = a + 1; penIdx[w++] = a + 2; penIdx[w++] = a + 1; penIdx[w++] = a + 3; penIdx[w++] = a + 2;
  }
  const pGeo = new THREE.BufferGeometry();
  const penPA = new THREE.BufferAttribute(penPos, 3).setUsage(THREE.DynamicDrawUsage);
  const penCA = new THREE.BufferAttribute(penCol, 3).setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', penPA); pGeo.setAttribute('aCol', penCA); pGeo.setIndex(new THREE.BufferAttribute(penIdx, 1));
  const penMat = new THREE.ShaderMaterial({
    vertexShader: PEN_VS, fragmentShader: PEN_FS, side: THREE.DoubleSide, fog: false,
    uniforms: { uSun: { value: SUNV }, uGlow: { value: C('#ffcf8a') }, uAmb: { value: C('#6f5066') } },
  });
  const pen = new THREE.Mesh(pGeo, penMat);
  pen.frustumCulled = false; pen.renderOrder = 3; pGeo.setDrawRange(0, 0);

  group.add(dust, peb, pen);
  if (ctx.scene && ctx.scene.add) ctx.scene.add(group);

  const gy = (x, z) => (ctx.groundY ? ctx.groundY(x, z) : 0);
  const R = (a, b) => a + (b - a) * rnd();

  // ---------------------------------------------------------------- spawners
  function puff(x, y, z, vx, vy, vz, w, h, a, life, dark, glow, grow, cap) {
    const i = dCur; dCur = (dCur + 1) % ND; // ring: oldest is overwritten, pool never grows
    dx[i] = x; dy[i] = y; dz[i] = z; dvx[i] = reduced ? 0 : vx; dvy[i] = reduced ? 0 : vy; dvz[i] = reduced ? 0 : vz;
    dW[i] = w; dH[i] = h; dA[i] = a; dLife[i] = life * kv('lookMomLife') * (reduced ? 1.3 : 1); dAge[i] = 0;
    dDark[i] = dark; dGlow[i] = glow; dGrow[i] = grow; dSeed[i] = rnd(); dRot[i] = rnd() * 6.28; dCap[i] = cap;
    spawned++;
  }
  function pebble(x, y, z, vx, vy, vz, s, life) {
    if (lean || kv('lookMomPebbles') <= 0) return;
    const i = pCur; pCur = (pCur + 1) % NP;
    px[i] = x; py[i] = y; pz[i] = z; pvx[i] = reduced ? 0 : vx; pvy[i] = reduced ? 0 : vy; pvz[i] = reduced ? 0 : vz;
    pS[i] = s; pLife[i] = life; pAge[i] = 0; pCi[i] = (rnd() * 4) | 0; pRx[i] = rnd() * 6.28; pRy[i] = rnd() * 6.28;
  }
  function pennant(x, z, gate) {
    if (lean || kv('lookMomPennant') <= 0) return;
    const i = nCur; nCur = (nCur + 1) % NPEN;
    const y = gy(x, z) + 2.2;
    nAx[i] = x; nAy[i] = y; nAz[i] = z; nAge[i] = 0; nCol[i] = (rnd() * 4) | 0; nGate[i] = gate ? 1 : 0; nSide[i] = x < lastX ? -1 : 1;
    for (let k = 0; k < NPT; k++) { const o = i * NPT + k; nx[o] = ox[o] = x + nSide[i] * 0.04 * k; ny[o] = oy[o] = y - PEN_LEN * k / NSEG; nz[o] = oz[o] = z; }
  }
  const cap0 = () => kv('lookMomPlumeCap');
  const dens = (n) => Math.max(1, Math.round(n * tierK * kv('lookMomDensity') * (reduced ? 0.45 : 1)));

  // low puff that respects the plume cap: top (centre + half height) never exceeds `cap` above ground
  function lowPuff(x, z, up, w, h, a, life, vx, vy, vz, dark, glow, grow) {
    const g = gy(x, z), cap = cap0();
    const hh = Math.min(h, cap), yy = Math.min(g + up, g + cap - hh * 0.5);
    puff(x, yy, z, vx, vy, vz, w, hh, a, life, dark, glow, grow, cap);
  }

  function evLand(ev) {
    const imp = Math.min(1.5, Math.max(0.25, (ev.impact || 4) / kv('lookMomImpactRef')));
    const p = ev.point || { x: lastX, y: lastY, z: lastZ };
    const ringR = 1.5 + 0.9 * imp, n = dens(18) | 0;
    for (let i = 0; i < n; i++) { // low ring hugging the sand, forward centre cleared
      const a = (i + R(-0.3, 0.3)) / n * 6.283, rr = ringR * R(0.85, 1.15);
      let lx = Math.cos(a) * rr * 1.2, lf = Math.sin(a) * rr * 0.9;
      if (lf > -0.2 && Math.abs(lx) < 2.3) lf = -lf * 0.7 - 0.3;
      const h = R(0.4, 0.62);
      lowPuff(p.x - lx, p.z + lf, h * 0.4, R(1.2, 1.8) * (0.85 + 0.3 * imp), h, R(0.4, 0.62), R(0.7, 1.1), -lx * 0.5, 0.15, lf * 0.5, R(0.3, 0.8), 0.9, 0.5);
    }
    const pl = dens(6) | 0;
    for (let sg = -1; sg <= 1; sg += 2) for (let i = 0; i < pl; i++) { // two plumes thrown sideways-back, height by impact, hard cap
      const t = i / Math.max(1, pl - 1);
      lowPuff(p.x - sg * (0.9 + t * 1.5), p.z - 0.1 - t * 1.5, (0.25 + t * 0.75) * (0.6 + 0.6 * imp), 0.9 + t * 0.8, (0.7 + 0.5 * t) * (0.7 + 0.5 * imp),
        0.85 - t * 0.4, R(0.8, 1.3), -sg * 1.2, 0.8 * imp, -1.4, 0.6 - t * 0.35, 0.7 + t * 0.5, 0.8);
    }
    for (let i = 0; i < 10 * imp; i++) { const a = R(0, 6.28), s = R(2, 5) * imp; pebble(p.x, p.y + 0.15, p.z, Math.cos(a) * s, R(1.5, 3.5) * imp, Math.sin(a) * s, R(0.04, 0.1), R(1.2, 2)); }
  }
  function evLaunch(ev) {
    const lp = ev.lipPos || { x: lastX, y: lastY, z: lastZ - 2 }, n = dens(10) | 0, sp = Math.min(1.5, (ev.speed || 30) / 45);
    for (let i = 0; i < n; i++) { // thin curtain along the lip, gaps between puffs
      const u = i / Math.max(1, n - 1), h = R(0.3, 0.55) * (1 - Math.abs(u - 0.5) * 0.6);
      lowPuff(lp.x + (u - 0.5) * 6 + R(-0.2, 0.2), lp.z + R(-0.3, 0.3), h * 0.4, R(0.9, 1.4), h, R(0.35, 0.55), R(0.6, 1), 0, 0.3, -2 * sp, 0.4, 0.95, 0.4);
    }
    for (let i = 0; i < 6; i++) pebble(lp.x + R(-2, 2), lp.y + 0.2, lp.z + R(-0.4, 1), R(-1, 1), R(1, 3) * sp, -R(0, 3) * sp, R(0.04, 0.08), R(1, 1.6));
  }
  function evTumble() {
    const n = dens(16) | 0;
    for (let i = 0; i < n; i++) {
      const sg = i & 1 ? 1 : -1, x = lastX + sg * R(2, 4.2), z = lastZ + R(-2.8, 1.2), h = R(0.9, 1.7);
      lowPuff(x, z, h * 0.42, R(1.4, 2.2), Math.min(h, 1.6), R(0.38, 0.6), R(1, 1.6), sg * 0.8, 0.3, 0, R(0.3, 0.7), 0.8, 0.7);
    }
    for (let i = 0; i < 8; i++) pebble(lastX + R(-3, 3), lastY + 0.3, lastZ + R(-1, 3), R(-2, 2), R(1, 3), R(-2, 2), R(0.05, 0.2), R(1.4, 2.4));
  }
  function evSettle(n0, w) { // recover_start/end: dust settles low and soft
    const n = dens(n0) | 0;
    for (let i = 0; i < n; i++) lowPuff(lastX + R(-w, w), lastZ + R(-w, w), 0.2, R(0.9, 1.5), R(0.3, 0.5), R(0.25, 0.4), R(0.9, 1.4), 0, 0.05, 0, 0.3, 0.9, 0.5);
  }

  function fx(ev) {
    if (!ev) return;
    switch (ev.type || ev.t || ev.name) {
      case 'land': evLand(ev); break;
      case 'launch': evLaunch(ev); break;
      case 'tumble_start': evTumble(); break;
      case 'recover_start': evSettle(8, 1.8); settleT = 1; break;
      case 'recover_end': evSettle(5, 1.2); glowT = 1; break;
      case 'boost': { const n = dens(6) | 0; for (let i = 0; i < n; i++) lowPuff(lastX + R(-1, 1), lastZ - R(1, 2.5), 0.3, R(0.8, 1.3), R(0.3, 0.5), 0.5, 0.7, 0, 0.2, -3, 0.35, 1, 0.6); break; }
      case 'prop_hit': {
        const p = ev.pos || { x: lastX, z: lastZ }, n = dens(5) | 0;
        for (let i = 0; i < n; i++) lowPuff(p.x + R(-0.4, 0.4), p.z + R(-0.4, 0.4), 0.3, R(0.5, 0.9), R(0.3, 0.5), 0.5, 0.8, R(-1, 1), 0.5, R(-1, 1), 0.4, 0.9, 0.6);
        for (let i = 0; i < 3; i++) pebble(p.x, (p.y || lastY) + 0.2, p.z, R(-2, 2), R(1, 2.5), R(-2, 2), R(0.03, 0.07), R(1, 1.5));
        break;
      }
      case 'gate': pennant(lastX + (rnd() < 0.5 ? -3.2 : 3.2), lastZ + 4, true); break;
      case 'milestone': pennant(lastX + (rnd() < 0.5 ? -3.6 : 3.6), lastZ + 6, false); break;
      case 'run_start': reset(); break;
      default: break;
    }
  }
  function reset() {
    dAge.fill(-1); pAge.fill(-1); nAge.fill(-1); skidAcc = 0; glowT = 0; settleT = 0; glowPulse = 0;
  }

  // ---------------------------------------------------------------- update
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), TC = new THREE.Color();
  let sunFrame = -1;

  function update(dt, vs) {
    if (dt > 0.1) dt = 0.1;
    reduced = !!isRed(vs); tNow += dt;
    if (vs) { lastX = vs.x; lastY = vs.y; lastZ = vs.z; }
    lastGy = gy(lastX, lastZ);

    // skid fan: grounded and moving; x2 on boost; rate scales with speed and |steer|
    if (vs && vs.grounded && vs.mode === 'ground' && vs.speed > 6 && kv('lookMomSkid') > 0 && !reduced) {
      skidAcc += dt * kv('lookMomSkid') * tierK * kv('lookMomDensity') * (vs.boostT > 0 ? 2 : 1) * (4 + vs.speed * 0.12 + 6 * Math.abs(vs.steer || 0));
      while (skidAcc >= 1) {
        skidAcc -= 1;
        const sg = rnd() < 0.5 ? -1 : 1;
        lowPuff(lastX - sg * R(0.6, 1.1), lastZ - R(0.2, 1.2), 0.1, R(0.5, 0.9), R(0.25, 0.4), R(0.28, 0.45) * (vs.boostT > 0 ? 1.3 : 1), R(0.5, 0.9), -sg * R(0.6, 1.4), 0.5, -vs.speed * 0.08, 0.35, 0.95, 0.7);
      }
    } else if (vs && vs.mode !== 'ground') skidAcc = 0;

    glowT = Math.max(0, glowT - dt * 1.2); settleT = Math.max(0, settleT - dt);
    glowPulse = glowT > 0 ? Math.sin((1 - glowT) * Math.PI) : 0;

    // dust integrate
    const cap = cap0(); live = 0; maxTop = 0;
    const m = dust.instanceMatrix.array, ap = aP.array, aq = aQ.array;
    let n = 0;
    for (let i = 0; i < ND; i++) {
      if (dAge[i] < 0) continue;
      dAge[i] += dt;
      const t = dAge[i] / dLife[i];
      if (t >= 1) { dAge[i] = -1; continue; }
      const drag = Math.exp(-2.2 * dt);
      dvx[i] *= drag; dvy[i] *= drag; dvz[i] *= drag; dvy[i] -= 1.2 * dt;
      dx[i] += dvx[i] * dt; dy[i] += dvy[i] * dt; dz[i] += dvz[i] * dt;
      const g = gy(dx[i], dz[i]), lim = Math.min(dCap[i], cap); // top = centre + h/2 stays under the cap above local ground
      const w = dW[i] * (1 + dGrow[i] * t), h = Math.min(dH[i] * (1 + dGrow[i] * 0.5 * t), lim * 0.95);
      if (dy[i] + h * 0.5 > g + lim) dy[i] = g + lim - h * 0.5;
      if (dy[i] - h * 0.5 < g - 0.05) dy[i] = g - 0.05 + h * 0.5;
      const top = dy[i] + h * 0.5 - g; if (top > maxTop) maxTop = top;
      const fade = Math.min(1, dAge[i] / 0.06) * (1 - t) * (1 - t);
      const o = n * 16;
      m[o] = w; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = h; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0; m[o + 12] = dx[i]; m[o + 13] = dy[i]; m[o + 14] = dz[i]; m[o + 15] = 1;
      ap[n * 4] = dRot[i]; ap[n * 4 + 1] = dA[i] * fade; ap[n * 4 + 2] = dSeed[i]; ap[n * 4 + 3] = 0;
      aq[n * 2] = dDark[i]; aq[n * 2 + 1] = dGlow[i];
      n++;
    }
    live = n; dust.count = n;
    dust.instanceMatrix.needsUpdate = true; aP.needsUpdate = true; aQ.needsUpdate = true;

    // pebbles: ballistic, rest on the ground, shrink out
    let pc = 0;
    for (let i = 0; i < NP; i++) {
      if (pAge[i] < 0) continue;
      pAge[i] += dt;
      if (pAge[i] >= pLife[i]) { pAge[i] = -1; continue; }
      pvy[i] -= 9.8 * dt; px[i] += pvx[i] * dt; py[i] += pvy[i] * dt; pz[i] += pvz[i] * dt;
      const g = gy(px[i], pz[i]) + pS[i] * 0.6;
      if (py[i] < g) { py[i] = g; pvy[i] = -pvy[i] * 0.25; pvx[i] *= 0.6; pvz[i] *= 0.6; if (Math.abs(pvy[i]) < 0.3) pvy[i] = 0; }
      const k = Math.min(1, (pLife[i] - pAge[i]) / (pLife[i] * 0.25)), s = pS[i] * k;
      P.set(px[i], py[i], pz[i]); E.set(pRx[i] + pAge[i] * pvx[i], pRy[i], 0); Q.setFromEuler(E); S.set(s * 1.15, s * 0.8, s); M.compose(P, Q, S);
      peb.setMatrixAt(pc, M); const c = CLODS[pCi[i]]; TC.setRGB(c[0], c[1], c[2]); peb.setColorAt(pc, TC); pc++;
    }
    peb.count = pc; peb.instanceMatrix.needsUpdate = true; peb.instanceColor.needsUpdate = true;

    // pennants: verlet chain, sled wake pushes it away (not in reduced motion)
    const whip = reduced ? 0 : kv('lookMomPennant'), wake = vs ? Math.min(1, vs.speed / 40) * whip : 0;
    let verts = 0, segs = 0;
    for (let p = 0; p < NPEN; p++) {
      if (nAge[p] < 0) continue;
      nAge[p] += dt;
      if (nAge[p] >= PEN_LIFE) { nAge[p] = -1; continue; }
      const base = p * NPT, fadeK = Math.min(1, (PEN_LIFE - nAge[p]) / 2);
      nx[base] = ox[base] = nAx[p]; ny[base] = oy[base] = nAy[p]; nz[base] = oz[base] = nAz[p];
      const near = Math.max(0, 1 - Math.hypot(lastX - nAx[p], lastZ - nAz[p]) / 8);
      for (let k = 1; k < NPT; k++) {
        const o = base + k, vx = (nx[o] - ox[o]) * 0.96, vy = (ny[o] - oy[o]) * 0.96, vz = (nz[o] - oz[o]) * 0.96;
        ox[o] = nx[o]; oy[o] = ny[o]; oz[o] = nz[o];
        nx[o] += vx + (nSide[p] * near * wake * 14 + Math.sin(tNow * 3 + k + p) * whip * 0.8) * dt * dt * k * 0.3;
        ny[o] += vy - 3 * dt * dt;
        nz[o] += vz + (-near * wake * 18 + Math.cos(tNow * 2.3 + k) * whip * 0.6) * dt * dt * k * 0.3;
      }
      const seg = PEN_LEN / NSEG; // distance constraints, two relax passes
      for (let it = 0; it < 2; it++) for (let k = 1; k < NPT; k++) {
        const a = base + k - 1, b = base + k, ex = nx[b] - nx[a], ey = ny[b] - ny[a], ez = nz[b] - nz[a], d = Math.hypot(ex, ey, ez) || 1, f = (d - seg) / d;
        if (k === 1) { nx[b] -= ex * f; ny[b] -= ey * f; nz[b] -= ez * f; } else { nx[a] += ex * f * 0.5; ny[a] += ey * f * 0.5; nz[a] += ez * f * 0.5; nx[b] -= ex * f * 0.5; ny[b] -= ey * f * 0.5; nz[b] -= ez * f * 0.5; }
      }
      const c = PEN_COLS[nCol[p]];
      for (let k = 0; k < NPT; k++) {
        const o = base + k, w = PEN_W * 0.5 * (1 - k / NPT) * fadeK, v = (p * NPT + k) * 6, cool = nGate[p] && k < 2;
        penPos[v] = nx[o] - w; penPos[v + 1] = ny[o]; penPos[v + 2] = nz[o]; penPos[v + 3] = nx[o] + w; penPos[v + 4] = ny[o]; penPos[v + 5] = nz[o];
        for (let j = 0; j < 2; j++) { penCol[v + j * 3] = cool ? GATE_COOL[0] : c[0]; penCol[v + j * 3 + 1] = cool ? GATE_COOL[1] : c[1]; penCol[v + j * 3 + 2] = cool ? GATE_COOL[2] : c[2]; }
        verts++;
      }
      segs++;
    }
    // inactive slots collapse to degenerate (zero-area) by zeroing their vertices
    for (let p = 0; p < NPEN; p++) if (nAge[p] < 0) penPos.fill(0, p * NPT * 6, (p + 1) * NPT * 6);
    pGeo.setDrawRange(0, segs ? NPEN * NSEG * 6 : 0); penPA.needsUpdate = true; penCA.needsUpdate = true;

    // sun to view space for the billboard shading
    if (ctx.camera && ctx.camera.matrixWorldInverse) { SUNV.copy(sunW).transformDirection(ctx.camera.matrixWorldInverse); }
  }
  if (ctx.sunDir) sunW.copy(ctx.sunDir).normalize();

  function shift(dz_, dy_) {
    dz_ = dz_ || 0; dy_ = dy_ || 0;
    for (let i = 0; i < ND; i++) if (dAge[i] >= 0) { dz[i] += dz_; dy[i] += dy_; }
    for (let i = 0; i < NP; i++) if (pAge[i] >= 0) { pz[i] += dz_; py[i] += dy_; }
    for (let p = 0; p < NPEN; p++) if (nAge[p] >= 0) {
      nAz[p] += dz_; nAy[p] += dy_;
      for (let k = 0; k < NPT; k++) { const o = p * NPT + k; nz[o] += dz_; oz[o] += dz_; ny[o] += dy_; oy[o] += dy_; }
    }
    lastZ += dz_; lastY += dy_;
  }
  function setQuality(t) {
    tierK = TIER[t] != null ? TIER[t] : 1; lean = t === 'lean';
    pen.visible = !lean; peb.visible = !lean;
  }
  function stats() {
    return { draws: lean ? 1 : 3, tris: live * 2 + peb.count * 80 + (pGeo.drawRange.count / 3 | 0), live, spawned, maxTop, pebbles: peb.count, pennants: nAge.reduce((a, v) => a + (v >= 0 ? 1 : 0), 0), glowPulse, settle: settleT, capacity: ND };
  }
  function dispose() {
    if (ctx.scene && ctx.scene.remove) ctx.scene.remove(group);
    for (const m of [dust, peb, pen]) { m.geometry.dispose(); m.material.dispose(); if (m.dispose) m.dispose(); }
  }
  return { group, update, fx, shift, setQuality, stats, dispose, reset, get glowPulse() { return glowPulse; } };
}
