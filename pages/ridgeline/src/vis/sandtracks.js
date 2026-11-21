// Sand carving (B4 M2). 512^2 RGBA8 stamp map used as a TORUS covering 48 m (x) x 96 m (z) of ground, keyed by ABSOLUTE
// world position (z + origin), so the 2000 m floating-origin shift never moves a mark: shift() only changes the key offset.
// Channels: R groove depth, G berm lip, B wide ambient darkening, A boost flag (fades 4x faster => white-gold for ~1.5 s).
// Per frame: 1 fade draw (reverse-subtract) + 1 instanced MAX-blend dab draw + scissored clears (0 draws).
// Everything above `buildGpu` is pure (no THREE, no GL) and is what the node test exercises.
export const KEYS = {
  lookTrackOn:    { def: 1,   min: 0,   max: 1,  step: 1,    label: 'Sand tracks on' },
  lookTrackFade:  { def: 6,   min: 2,   max: 14, step: 0.5,  label: 'Track fade (s)' },
  lookTrackDepth: { def: 1,   min: 0.2, max: 1.5, step: 0.05, label: 'Groove depth' },
  lookTrackWidth: { def: 1,   min: 0.5, max: 1.6, step: 0.05, label: 'Groove width' },
  lookTrackBerm:  { def: 1,   min: 0,   max: 1.5, step: 0.05, label: 'Berm lip strength' },
  lookTrackGlow:  { def: 1,   min: 0,   max: 1,  step: 0.05, label: 'Boost glow' },
};
export const SIZE_X = 48, SIZE_Z = 96;
export const BOOST_FRESH_S = 1.5;
const DAB_CAP = 320, SPACING = 0.12, LEAD = 6, MAX_SEG = 48, TELEPORT = 6;
const WIN_BACK = 64, WIN_AHEAD = 1, WIN_X = 17;
const SKID_HALF = 0.55, SKID_TAIL = -0.5;
const RES_BY_TIER = { max: 512, showcase: 512, lean: 256 };
const cv = (k, cfg) => (cfg && cfg[k] != null ? cfg[k] : KEYS[k].def);
export const wrap = (a, size) => ((a % size) + size) % size;

// ---------------------------------------------------------------- pure planner
export function createPlanner() {
  const aC = new Float32Array(DAB_CAP * 2), aD = new Float32Array(DAB_CAP * 2);
  const aP = new Float32Array(DAB_CAP * 4), aK = new Float32Array(DAB_CAP);
  const P = { n: 0, originZ: 0, fadeAcc: 0, fadeLv: 0, ok: false, lx: 0, lz: 0, rx: 0, rz: 0, dlOk: false, dlx: 0, dlz: 1, drOk: false, drx: 0, drz: 1, impact: 0, lastSweep: 0 };
  const rects = new Int32Array(4 * 4 * 4); // up to 4 rects x 4 ints per clear call, 2 calls reserved below
  const out = { rects, n: 0 };

  function dab(ax, az, dx, dz, hw, hl, S, boost, side) { // ax/az absolute world
    const cx = wrap(ax, SIZE_X), cz = wrap(az, SIZE_Z);
    const R = Math.max(hw, hl) + 0.1;
    const ox = cx < R ? SIZE_X : cx > SIZE_X - R ? -SIZE_X : 0, oz = cz < R ? SIZE_Z : cz > SIZE_Z - R ? -SIZE_Z : 0;
    for (let i = 0; i < 4; i++) {
      if (((i & 1) && !ox) || ((i & 2) && !oz) || P.n >= DAB_CAP) continue;
      const n = P.n++;
      aC[n * 2] = cx + ((i & 1) ? ox : 0); aC[n * 2 + 1] = cz + ((i & 2) ? oz : 0);
      aD[n * 2] = dx; aD[n * 2 + 1] = dz;
      const o = n * 4; aP[o] = hw; aP[o + 1] = hl; aP[o + 2] = S; aP[o + 3] = boost; aK[n] = side;
    }
  }
  // one skid swept from (px,pz) to (cx,cz), render-space coords; side -1 left / +1 right
  function skid(px, pz, cx, cz, side, S, hw, boost) {
    const ddx = cx - px, ddz = cz - pz, len = Math.hypot(ddx, ddz);
    if (len > TELEPORT || len < 1e-4) { if (side < 0) P.dlOk = false; else P.drOk = false; return; }
    let dx = ddx / len, dz = ddz / len;
    const ok = side < 0 ? P.dlOk : P.drOk, pdx = side < 0 ? P.dlx : P.drx, pdz = side < 0 ? P.dlz : P.drz;
    if (ok) { dx = dx * 0.35 + pdx * 0.65; dz = dz * 0.35 + pdz * 0.65; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    if (side < 0) { P.dlOk = true; P.dlx = dx; P.dlz = dz; } else { P.drOk = true; P.drx = dx; P.drz = dz; }
    const zo = P.originZ, k = Math.min(MAX_SEG, Math.ceil(len / SPACING - 1e-6));
    for (let i = 1; i <= k; i++) { const t = i / k; dab(px + ddx * t, pz + ddz * t + zo, dx, dz, hw, 0.3, S, boost, side); }
    for (let j = 1; j <= LEAD; j++) dab(cx + dx * SPACING * j, cz + dz * SPACING * j + zo, dx, dz, hw, 0.3, S, boost, side);
  }
  // v = vs-like {x,z,heading,speed,comp,latAcc,boostT,grounded,mode}; k = {depth,width}; returns dab count
  function sweep(v, k) {
    P.n = 0;
    const hs = Math.sin(v.heading), hc = Math.cos(v.heading);
    const lx = v.x - hc * SKID_HALF + hs * SKID_TAIL, lz = v.z + hs * SKID_HALF + hc * SKID_TAIL;
    const rx = v.x + hc * SKID_HALF + hs * SKID_TAIL, rz = v.z - hs * SKID_HALF + hc * SKID_TAIL;
    const on = v.grounded && (v.mode == null || v.mode === 'ground') && v.dt !== 0;
    if (on && P.ok) {
      const speedK = Math.min(1, v.speed / 40), slip = Math.min(1, Math.abs(v.latAcc || 0) / 12);
      const S = Math.min(1, (0.55 + 0.3 * (v.comp || 0) + 0.15 * speedK + 0.3 * P.impact) * k.depth);
      const hw = (0.62 + 0.5 * slip) * k.width, boost = v.boostT > 0 ? 1 : 0;
      skid(P.lx, P.lz, lx, lz, -1, S, hw, boost);
      skid(P.rx, P.rz, rx, rz, 1, S, hw, boost);
    } else { P.dlOk = P.drOk = false; }
    P.ok = on; P.lx = lx; P.lz = lz; P.rx = rx; P.rz = rz;
    P.impact = Math.max(0, P.impact - v.dt * 2.5);
    P.lastSweep = P.n; return P.n;
  }
  function shift(dz) { // dz = delta APPLIED to world z (floating origin: -2000). Key offset absorbs it; sweep anchors move with the world.
    P.originZ -= dz; P.lz += dz; P.rz += dz;
    if (P.originZ > 1e7 || P.originZ < -1e7) P.originZ = wrap(P.originZ, SIZE_Z); // keep float32-safe (multiple of 96 irrelevant: only mod 96 is used)
  }
  // fade amount in 8-bit levels for this dt (accumulates so sub-level steps still add up)
  function fadeStep(dt, seconds) {
    P.fadeAcc += dt / Math.max(0.1, seconds);
    const lv = Math.floor(P.fadeAcc * 255);
    if (lv >= 1) P.fadeAcc -= lv / 255;
    P.fadeLv = lv >= 1 ? lv : 0; return P.fadeLv;
  }
  // scissor rects (pixels) for a torus world rectangle given in ABSOLUTE coords; appends into out.rects (reset first call with reset=true)
  function planClear(x0, x1, z0, z1, res, reset) {
    if (reset) out.n = 0;
    const spanX = x1 - x0, spanZ = z1 - z0;
    if (spanX <= 0 || spanZ <= 0) return out.n;
    const sx = wrap(x0, SIZE_X), sz = wrap(z0, SIZE_Z);
    const wx = sx + spanX <= SIZE_X ? 1 : 2, wz = sz + spanZ <= SIZE_Z ? 1 : 2;
    for (let i = 0; i < wx; i++) for (let j = 0; j < wz; j++) {
      const ax = i ? 0 : sx, bx = wx === 1 ? sx + spanX : i ? sx + spanX - SIZE_X : SIZE_X;
      const az = j ? 0 : sz, bz = wz === 1 ? sz + spanZ : j ? sz + spanZ - SIZE_Z : SIZE_Z;
      const px = Math.floor(ax / SIZE_X * res), pz = Math.floor(az / SIZE_Z * res);
      const o = out.n * 4;
      if (o + 4 > rects.length) return out.n;
      rects[o] = px; rects[o + 1] = pz;
      rects[o + 2] = Math.max(1, Math.ceil(bx / SIZE_X * res) - px); rects[o + 3] = Math.max(1, Math.ceil(bz / SIZE_Z * res) - pz);
      out.n++;
    }
    return out.n;
  }
  // the wipe plan each frame: ahead of the sled (full width) + beyond the lateral window; ABSOLUTE coords
  function planWindow(x, z, res) {
    const az = z + P.originZ;
    planClear(0, SIZE_X, az + WIN_AHEAD + 0.5, az + SIZE_Z - WIN_BACK - 1.5, res, true);
    return planClear(x + WIN_X + 2, x + SIZE_X - WIN_X - 2, az - WIN_BACK, az + SIZE_Z - WIN_BACK, res, false);
  }
  const texel = (x, z, res) => { // which texel does world (render-space) x,z land on
    const u = wrap(x, SIZE_X) / SIZE_X, v = wrap(z + P.originZ, SIZE_Z) / SIZE_Z;
    return [Math.floor(u * res), Math.floor(v * res)];
  };
  return { P, aC, aD, aP, aK, sweep, shift, fadeStep, planClear, planWindow, out, texel, bump(i) { P.impact = Math.max(P.impact, i); }, reset() { P.ok = false; P.dlOk = P.drOk = false; } };
}

// ---------------------------------------------------------------- GLSL for the ground shader
// Singleton uniforms (arrays => no THREE needed here); the instance fills uTrk with its render-target texture.
const UNI = {
  uTrk: { value: null }, uTrkSz: { value: [SIZE_X, SIZE_Z] }, uTrkOff: { value: 0 }, uSledP: { value: [0, 0] },
  uTrkGlow: { value: 1 }, uTrkBerm: { value: 1 }, uTrkWin: { value: [WIN_X, WIN_BACK, WIN_AHEAD, 0] },
  uTrkN: { value: 0 }, uTrkCol: { value: [0.54, 0.29, 0.447] }, uTrkRim: { value: [1.0, 0.878, 0.659] },
};
export const DECL = 'uniform sampler2D uTrk; uniform vec2 uTrkSz; uniform float uTrkOff; uniform vec2 uSledP; uniform float uTrkGlow; uniform float uTrkBerm; uniform vec4 uTrkWin; uniform vec3 uTrkCol; uniform vec3 uTrkRim; uniform float uTrkN;';
// Inject right after `diffuseColor.rgb = col;` (needs vW, col, vFogDepth; re-assigns diffuseColor.rgb itself).
export const BODY = `
 {
  float tw = ( 1.0 - smoothstep( uTrkWin.x - 2.0, uTrkWin.x, abs( vW.x - uSledP.x ) ) )
           * smoothstep( -uTrkWin.y, -uTrkWin.y + 8.0, vW.z - uSledP.y ) * ( 1.0 - smoothstep( uTrkWin.z, uTrkWin.z + 1.5, vW.z - uSledP.y ) );
  tw *= 1.0 - smoothstep( 38.0, 80.0, vFogDepth );
  if ( tw > 0.001 ) {
   vec4 T = texture2D( uTrk, ( vW.xz + vec2( 0.0, uTrkOff ) ) / uTrkSz );
   float grv = smoothstep( 0.3, 0.7, T.r ) * T.r, brm = smoothstep( 0.25, 0.7, T.g ) * T.g * uTrkBerm, amb = T.b;
   vec3 base = col;
   base *= mix( vec3( 1.0 ), vec3( 0.9, 0.8, 0.92 ), amb * 0.6 );
   base = mix( base, base * vec3( 0.4, 0.25, 0.43 ) + uTrkCol * 0.05, min( 1.0, grv * 1.1 ) * 0.92 );
   // QA D4: berm applied after the night grade; at night it replaces (not max-es with) the plum floor so it stays warm cream, never grey-mauve
   // Night: warm amber target (never cool) so the berm reads gold, not rose-grey; day keeps uTrkRim.
   vec3 brmT = mix( uTrkRim, vec3( 1.0, 0.78, 0.52 ), uTrkN ) * ( 0.98 * ( 1.0 - 0.35 * uTrkN ) );
   base = mix( base, mix( max( base, brmT ), brmT, uTrkN ), min( 1.0, brm * 1.2 ) * ( 1.0 - grv ) * mix( 0.7, 0.92, uTrkN ) );
   float glow = smoothstep( 0.08, 0.5, T.a ) * grv * uTrkGlow;
   base = mix( base, vec3( 1.0, 0.86, 0.5 ), clamp( glow * 0.9, 0.0, 0.9 ) );
   base += vec3( 1.0, 0.8, 0.4 ) * glow * ( 0.2 + 0.5 * brm );
   col = mix( col, base, tw );
   diffuseColor.rgb = col;
  }
 }`;
// QA-4: pale haze band. In render.js replace the `float bandFade = ...;` line with this (adds a 12-25 m camera-distance fade):
export const BAND_FADE_GLSL = 'float bandFade = ( 1.0 - bankK ) * ( 1.0 - smoothstep( 40.0, 110.0, vFogDepth ) ) * ( 1.0 - smoothstep( 0.4, 1.2, fwidth( bs ) * 8.0 ) ) * smoothstep( 12.0, 25.0, length( vW.xz - cameraPosition.xz ) );';
export function groundChunk() { return { uniforms: UNI, fragDecl: DECL, fragBody: BODY, bandFadeGlsl: BAND_FADE_GLSL }; }

// ---------------------------------------------------------------- GPU (needs ctx.THREE + ctx.renderer)
const DAB_VS = `attribute vec2 aC; attribute vec2 aD; attribute vec4 aP; attribute float aK;
uniform vec2 uSize; varying vec2 vL; varying vec4 vP; varying float vK;
void main(){ vec2 perp = vec2( aD.y, -aD.x ); vec2 w = aC + aD * position.y * aP.y + perp * position.x * aP.x;
 vL = position.xy; vP = aP; vK = aK; gl_Position = vec4( w / uSize * 2.0 - 1.0, 0.0, 1.0 ); }`;
const DAB_FS = `varying vec2 vL; varying vec4 vP; varying float vK;
void main(){ float u = abs( vL.x ) * 0.62; float outer = vL.x * vK > 0.0 ? 1.0 : 0.0;
 float S = vP.z * ( 1.0 - smoothstep( 0.7, 1.0, abs( vL.y ) ) );
 float g = ( 1.0 - smoothstep( 0.075, 0.13, u ) ) * S;
 float bw = smoothstep( 0.115, 0.145, u ) * ( 1.0 - smoothstep( 0.18, 0.23, u ) );
 float b = bw * mix( 0.3, 1.0, outer ) * S; float amb = ( 1.0 - smoothstep( 0.1, 0.5, u ) ) * S;
 gl_FragColor = vec4( g, b, amb, vP.w * ( g / max( vP.z, 0.05 ) ) ); }`;

function buildGpu(ctx, pl, res) {
  const T = ctx.THREE, renderer = ctx.renderer;
  const mk = (r) => { const t = new T.WebGLRenderTarget(r, r, { type: T.UnsignedByteType, format: T.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: T.LinearFilter, magFilter: T.LinearFilter, wrapS: T.RepeatWrapping, wrapT: T.RepeatWrapping, generateMipmaps: false }); t.texture.colorSpace = T.NoColorSpace; return t; };
  let rt = mk(res);
  const sc = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blend = (eq) => ({ blending: T.CustomBlending, blendEquation: eq, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquationAlpha: eq, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneFactor });
  const fadeMat = new T.ShaderMaterial({ uniforms: { uK: { value: new T.Vector4() } }, vertexShader: 'void main(){ gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: 'uniform vec4 uK; void main(){ gl_FragColor = uK; }', depthTest: false, depthWrite: false, ...blend(T.ReverseSubtractEquation) });
  const fadeMesh = new T.Mesh(new T.PlaneGeometry(2, 2), fadeMat); fadeMesh.frustumCulled = false; fadeMesh.renderOrder = 0; sc.add(fadeMesh);
  const geo = new T.InstancedBufferGeometry(); const q = new T.PlaneGeometry(2, 2);
  geo.setAttribute('position', q.getAttribute('position')); geo.setIndex(q.getIndex());
  const att = (arr, n) => new T.InstancedBufferAttribute(arr, n).setUsage(T.DynamicDrawUsage);
  const aC = att(pl.aC, 2), aD = att(pl.aD, 2), aP = att(pl.aP, 4), aK = att(pl.aK, 1);
  geo.setAttribute('aC', aC); geo.setAttribute('aD', aD); geo.setAttribute('aP', aP); geo.setAttribute('aK', aK); geo.instanceCount = 0;
  const dabMat = new T.ShaderMaterial({ uniforms: { uSize: { value: new T.Vector2(SIZE_X, SIZE_Z) } }, vertexShader: DAB_VS, fragmentShader: DAB_FS,
    side: T.DoubleSide, depthTest: false, depthWrite: false, ...blend(T.MaxEquation) });
  const mesh = new T.Mesh(geo, dabMat); mesh.frustumCulled = false; mesh.renderOrder = 1; sc.add(mesh);
  const cc = new T.Color();
  UNI.uTrk.value = rt.texture;
  return {
    get res() { return rt.width; },
    resize(r) { rt.dispose(); rt = mk(r); UNI.uTrk.value = rt.texture; },
    render(fadeLv, fadeAlpha, glowFresh) {
      geo.instanceCount = pl.P.n;
      if (pl.P.n) aC.needsUpdate = aD.needsUpdate = aP.needsUpdate = aK.needsUpdate = true;
      fadeMesh.visible = fadeLv >= 1;
      if (fadeLv >= 1) fadeMat.uniforms.uK.value.set(fadeLv / 255, fadeLv / 255, fadeLv / 255, Math.min(1, fadeLv / 255 * glowFresh));
      const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevA = renderer.getClearAlpha();
      renderer.getClearColor(cc); renderer.setRenderTarget(rt); renderer.autoClear = false; renderer.setClearColor(0x000000, 0);
      rt.scissorTest = true;
      for (let i = 0; i < pl.out.n; i++) { const o = i * 4; rt.scissor.set(pl.out.rects[o], pl.out.rects[o + 1], pl.out.rects[o + 2], pl.out.rects[o + 3]); renderer.setRenderTarget(rt); renderer.clear(true, false, false); }
      rt.scissorTest = false; renderer.setRenderTarget(rt); renderer.render(sc, cam);
      renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto; renderer.setClearColor(cc, prevA);
    },
    dispose() { rt.dispose(); geo.dispose(); dabMat.dispose(); fadeMat.dispose(); fadeMesh.geometry.dispose(); },
  };
}

// ---------------------------------------------------------------- module
export function createSandTracks(ctx) {
  const pl = createPlanner();
  const kk = { depth: 1, width: 1 }, v = { x: 0, z: 0, heading: 0, speed: 0, comp: 0, latAcc: 0, boostT: 0, grounded: false, mode: null, dt: 0 };
  let tier = 'max', res = RES_BY_TIER.max;
  const gpu = ctx && ctx.THREE && ctx.renderer ? buildGpu(ctx, pl, res) : null;
  const st = { lastMs: 0, dabs: 0, res, calls: gpu ? 2 : 0, enabled: true };
  const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
  function update(dt, vs) {
    const t0 = now(), cfg = ctx && ctx.cfg;
    st.enabled = cv('lookTrackOn', cfg) > 0;
    kk.depth = cv('lookTrackDepth', cfg); kk.width = cv('lookTrackWidth', cfg);
    const fadeS = cv('lookTrackFade', cfg);
    v.x = vs.x; v.z = vs.z; v.heading = vs.heading || 0; v.speed = vs.speed || 0; v.comp = vs.comp || 0; v.latAcc = vs.latAcc || 0;
    v.boostT = vs.boostT || 0; v.grounded = !!vs.grounded; v.mode = vs.mode; v.dt = dt;
    if (!st.enabled) { pl.P.n = 0; pl.reset(); } else pl.sweep(v, kk);
    const lv = pl.fadeStep(dt, fadeS);
    st.dabs = pl.P.n;
    UNI.uSledP.value[0] = vs.x; UNI.uSledP.value[1] = vs.z;
    UNI.uTrkOff.value = wrap(pl.P.originZ, SIZE_Z);
    UNI.uTrkGlow.value = cv('lookTrackGlow', cfg); UNI.uTrkBerm.value = cv('lookTrackBerm', cfg);
    if (gpu) { pl.planWindow(vs.x, vs.z, gpu.res); gpu.render(lv, 0, fadeS / BOOST_FRESH_S); } // A fades fadeS/1.5 x faster: white-gold only while fresh
    st.lastMs = now() - t0;
  }
  return {
    update,
    fx(ev) {
      if (!ev) return;
      const k = ev.type || ev.name || ev.t;
      if (k === 'land') pl.bump(Math.min(1, +(ev.impact != null ? ev.impact : 0) / 12));
      else if (k === 'tumble_start' || k === 'run_start' || k === 'launch' || k === 'recover_end') pl.reset();
    },
    shift(dz, dy) { pl.shift(dz, dy); },
    setQuality(t) { tier = RES_BY_TIER[t] ? t : 'max'; res = RES_BY_TIER[tier]; st.res = res; if (gpu && gpu.res !== res) gpu.resize(res); },
    stats() { return st; },
    get lastMs() { return st.lastMs; },
    dispose() { if (gpu) gpu.dispose(); UNI.uTrk.value = null; },
    planner: pl, groundChunk,
  };
}
