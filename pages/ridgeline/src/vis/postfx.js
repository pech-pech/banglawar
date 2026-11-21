// M5 post chain (Max tier): MSAA 4x half-float scene RT -> dual-filter bloom 1/2-1/4-1/8 -> composite (grade, vignette, dither).
// WebGL2 only; any missing capability or runtime error degrades to plain renderer.render. Cosmetic only.
import * as THREE from '../../vendor/three.module.js';

export const KEYS = {
  lookBloom: { def: 0.5, min: 0, max: 1.5, step: 0.05, label: 'Bloom strength' },
  lookBloomThr: { def: 0.72, min: 0.3, max: 1.2, step: 0.02, label: 'Bloom threshold' },
  lookGrade: { def: 1, min: 0, max: 1, step: 1, label: 'Grade on' },
  lookVignette: { def: 0.12, min: 0, max: 0.4, step: 0.01, label: 'Vignette' },
};
const kv = (cfg, k) => (cfg && cfg[k] !== undefined ? +cfg[k] : KEYS[k].def);

const VERT = 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';
const LUMA = 'float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }';

// 13-tap dual-filter downsample (Call of Duty / Jimenez). Optional bright-pass with soft knee on every tap (fused prefilter).
const DOWN_FRAG = `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPre; uniform float uThr; uniform float uKnee; uniform float uSat;
${LUMA}
vec3 tap(vec2 uv){
  vec3 c = min(texture2D(tSrc, uv).rgb, vec3(8.0));
  if (uPre > 0.5) {
    float l = lum(c);
    float soft = clamp(l - uThr + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
    float k = max(soft, l - uThr) / max(l, 1e-4);
    // favour hot, saturated emitters (aqua gate, coral flare) over broad pale sand: tiny chroma bias
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    k *= 1.0 + uSat * (mx - mn) / (mx + 1e-3);
    c *= k;
  }
  return c;
}
vec3 karis(vec3 c){ return c / (1.0 + lum(c)); }
void main(){
  vec2 uv = gl_FragCoord.xy * uTexel; // uTexel = 1 / destination size; source sampled at dest texel centres => 2x footprint
  vec2 d = uTexel * 0.5; // source texel = d
  vec3 a = tap(uv + d * vec2(-2.,  2.)), b = tap(uv + d * vec2(0.,  2.)), c = tap(uv + d * vec2(2.,  2.));
  vec3 e = tap(uv + d * vec2(-2.,  0.)), f = tap(uv),                      g = tap(uv + d * vec2(2.,  0.));
  vec3 h = tap(uv + d * vec2(-2., -2.)), i = tap(uv + d * vec2(0., -2.)), j = tap(uv + d * vec2(2., -2.));
  vec3 k = tap(uv + d * vec2(-1.,  1.)), l = tap(uv + d * vec2(1.,  1.));
  vec3 m = tap(uv + d * vec2(-1., -1.)), n = tap(uv + d * vec2(1., -1.));
  vec3 o;
  if (uPre > 0.5) { // Karis-weighted groups kill single-pixel fireflies on the first pass
    vec3 g0 = (a + b + e + f) * 0.25, g1 = (b + c + f + g) * 0.25, g2 = (e + f + h + i) * 0.25, g3 = (f + g + i + j) * 0.25, g4 = (k + l + m + n) * 0.25;
    float w0 = 1.0 / (1.0 + lum(g0)), w1 = 1.0 / (1.0 + lum(g1)), w2 = 1.0 / (1.0 + lum(g2)), w3 = 1.0 / (1.0 + lum(g3)), w4 = 1.0 / (1.0 + lum(g4));
    o = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (0.125 * (w0 + w1 + w2 + w3) + 0.5 * w4);
  } else {
    o = f * 0.125 + (a + c + h + j) * 0.03125 + (b + e + g + i) * 0.0625 + (k + l + m + n) * 0.125;
  }
  gl_FragColor = vec4(o, 1.0);
}`;

// 9-tap tent upsample, added onto the larger level (blending One/One), so no extra RTs.
const UP_FRAG = `
precision highp float;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform vec2 uDest; uniform float uGain;
void main(){
  vec2 uv = gl_FragCoord.xy / uDest; vec2 d = uTexel;
  vec3 s = texture2D(tSrc, uv).rgb * 4.0;
  s += texture2D(tSrc, uv + d * vec2(-1., 0.)).rgb * 2.0 + texture2D(tSrc, uv + d * vec2(1., 0.)).rgb * 2.0;
  s += texture2D(tSrc, uv + d * vec2(0., -1.)).rgb * 2.0 + texture2D(tSrc, uv + d * vec2(0., 1.)).rgb * 2.0;
  s += texture2D(tSrc, uv + d * vec2(-1., -1.)).rgb + texture2D(tSrc, uv + d * vec2(1., -1.)).rgb;
  s += texture2D(tSrc, uv + d * vec2(-1., 1.)).rgb + texture2D(tSrc, uv + d * vec2(1., 1.)).rgb;
  gl_FragColor = vec4(s * (uGain / 16.0), 1.0);
}`;

const COMP_FRAG = `
precision highp float;
uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uRes; uniform float uBloom; uniform float uGrade; uniform float uBloomOn; uniform float uVig;
${LUMA}
vec3 enc(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); } // interleaved gradient noise (blue-ish)
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture2D(tScene, uv).rgb;
  if (uBloomOn > 0.5) c += texture2D(tBloom, uv).rgb * uBloom * (1.0 - 0.7 * smoothstep(0.65, 1.0, lum(c))); // already-bright pixels (sun core) take less, keeps the disc readable
  // soft shoulder only above 0.85 so mids are untouched (bloom adds can exceed 1)
  vec3 over = max(c - 0.85, 0.0); c = min(c, vec3(0.85)) + 0.15 * (1.0 - exp(-over / 0.15));
  c = clamp(enc(max(c, 0.0)), 0.0, 1.0); // display (sRGB) space from here on
  if (uGrade > 0.5) {
    float l = lum(c);
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);                                   // gentle S-curve
    float sh = pow(1.0 - clamp(l * 1.6, 0.0, 1.0), 2.0);
    c += (vec3(0.227, 0.184, 0.416) - c) * 0.20 * sh;                            // plum-lifted shadows (#3a2f6a)
    float hi = smoothstep(0.55, 1.0, l);
    c *= mix(vec3(1.0), vec3(1.0, 0.851, 0.627), 0.40 * hi);                     // warm highlights (#ffd9a0)
    float l2 = lum(c); float mid = 1.0 - abs(2.0 * clamp(l2, 0.0, 1.0) - 1.0);
    c = mix(vec3(l2), c, 1.0 + 0.16 * mid);                                      // mid saturation lift
    vec2 q = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float r = length(q) / length(vec2(0.5 * uRes.x / uRes.y, 0.5));              // 0 centre, 1 corner
    float vg = smoothstep(0.45, 1.0, r); c *= 1.0 - uVig * vg;
  }
  float n = ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + 37.0) - 1.0;           // triangular, +-1 LSB
  c += n / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;


const TIER_POST = { max: { bloom: true, grade: true }, showcase: { bloom: false, grade: true }, lean: null };

export function createPostFx(ctx) {
  const renderer = ctx.renderer, cfg = ctx.cfg;
  let quality = 'max', disabled = false, why = '';
  let gl = null, MS = 0, hasHalf = false, timer = null;
  try {
    gl = renderer.getContext();
    const isGL2 = renderer.capabilities && renderer.capabilities.isWebGL2;
    if (!gl || !isGL2) { disabled = true; why = 'no webgl2'; }
    else {
      hasHalf = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
      MS = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (ext) timer = { ext, q: null, pending: null, ms: 0 };
    }
  } catch (e) { disabled = true; why = 'init'; }
  let tri = null, cam = null, fsScene = null, downMat = null, upMat = null, compMat = null, quad = null;
  let sceneRT = null, bl = [], W = 0, H = 0;
  const st = { calls: 0, triangles: 0, passes: 0, cpuMs: 0, gpuMs: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function build() {
    if (tri || disabled) return;
    tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    fsScene = new THREE.Scene();
    const mk = (frag, uniforms, extra) => new THREE.ShaderMaterial(Object.assign({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, fog: false }, extra || {}));
    const U = (v) => ({ value: v });
    downMat = mk(DOWN_FRAG, { tSrc: U(null), uTexel: U(new THREE.Vector2()), uPre: U(0), uThr: U(0.72), uKnee: U(0.28), uSat: U(0.9) });
    upMat = mk(UP_FRAG, { tSrc: U(null), uTexel: U(new THREE.Vector2()), uDest: U(new THREE.Vector2()), uGain: U(1) }, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    compMat = mk(COMP_FRAG, { tScene: U(null), tBloom: U(null), uRes: U(new THREE.Vector2(1, 1)), uBloom: U(0.5), uGrade: U(1), uBloomOn: U(1), uVig: U(0.12) });
    quad = new THREE.Mesh(tri, downMat); quad.frustumCulled = false; fsScene.add(quad);
  }
  const bRT = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: hasHalf ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  function free() { if (sceneRT) sceneRT.dispose(); for (const t of bl) t.dispose(); sceneRT = null; bl = []; }
  const _v = new THREE.Vector2(), _vp = new THREE.Vector4();
  function alloc() {
    renderer.getDrawingBufferSize(_v);
    const w = Math.max(8, _v.x | 0), h = Math.max(8, _v.y | 0);
    if (sceneRT && w === W && h === H) return;
    W = w; H = h; free();
    sceneRT = new THREE.WebGLRenderTarget(w, h, { type: hasHalf ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, samples: MS, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    bl = [bRT(w >> 1, h >> 1), bRT(w >> 2, h >> 2), bRT(w >> 3, h >> 3)];
  }
  function pass(mat, target, clear) {
    quad.material = mat; renderer.setRenderTarget(target);
    if (target) renderer.setViewport(0, 0, target.width, target.height);
    else renderer.setViewport(_vp); // restore the caller's (CSS px) viewport: target passes overwrite the renderer's _viewport
    renderer.autoClear = false; if (clear) renderer.clear(true, false, false);
    renderer.render(fsScene, cam);
  }
  function timerBegin() {
    if (!timer) return;
    try {
      if (timer.pending) {
        const avail = gl.getQueryParameter(timer.pending, gl.QUERY_RESULT_AVAILABLE);
        const dis = gl.getParameter(timer.ext.GPU_DISJOINT_EXT);
        if (avail && !dis) { timer.ms = gl.getQueryParameter(timer.pending, gl.QUERY_RESULT) / 1e6; st.gpuMs = timer.ms; }
        if (avail) { gl.deleteQuery(timer.pending); timer.pending = null; }
      }
      if (!timer.pending) { timer.q = gl.createQuery(); gl.beginQuery(timer.ext.TIME_ELAPSED_EXT, timer.q); }
    } catch (e) { timer = null; }
  }
  function timerEnd() {
    if (!timer || !timer.q) return;
    try { gl.endQuery(timer.ext.TIME_ELAPSED_EXT); timer.pending = timer.q; timer.q = null; } catch (e) { timer = null; }
  }

  function plain(scene, camera) { renderer.render(scene, camera); st.passes = 0; st.cpuMs = 0; }

  function render(scene, camera) {
    if (disabled || !TIER_POST[quality]) { plain(scene, camera); return; }
    const t0 = now();
    const prevTarget = renderer.getRenderTarget(), ac = renderer.autoClear;
    renderer.getViewport(_vp);
    try {
      build(); alloc();
      const bloomS = kv(cfg, 'lookBloom'), bloomOn = TIER_POST[quality].bloom && bloomS > 0;
      const grade = TIER_POST[quality].grade && kv(cfg, 'lookGrade') > 0 ? 1 : 0;
      downMat.uniforms.uThr.value = kv(cfg, 'lookBloomThr');
      timerBegin();
      renderer.setRenderTarget(sceneRT); renderer.setViewport(0, 0, W, H); renderer.autoClear = true;
      renderer.render(scene, camera);
      let passes = 1;
      if (bloomOn) {
        downMat.uniforms.tSrc.value = sceneRT.texture; downMat.uniforms.uPre.value = 1; downMat.uniforms.uTexel.value.set(1 / bl[0].width, 1 / bl[0].height);
        pass(downMat, bl[0], true); passes++;
        downMat.uniforms.uPre.value = 0;
        for (let i = 1; i < 3; i++) { downMat.uniforms.tSrc.value = bl[i - 1].texture; downMat.uniforms.uTexel.value.set(1 / bl[i].width, 1 / bl[i].height); pass(downMat, bl[i], true); passes++; }
        for (let i = 2; i > 0; i--) {
          upMat.uniforms.tSrc.value = bl[i].texture; upMat.uniforms.uTexel.value.set(1 / bl[i].width, 1 / bl[i].height);
          upMat.uniforms.uDest.value.set(bl[i - 1].width, bl[i - 1].height); upMat.uniforms.uGain.value = i === 2 ? 0.8 : 1.0;
          pass(upMat, bl[i - 1], false); passes++;
        }
      }
      const u = compMat.uniforms;
      u.tScene.value = sceneRT.texture; u.tBloom.value = bloomOn ? bl[0].texture : sceneRT.texture;
      u.uBloomOn.value = bloomOn ? 1 : 0; u.uGrade.value = grade; u.uBloom.value = bloomS; u.uVig.value = kv(cfg, 'lookVignette');
      u.uRes.value.set(W, H);
      pass(compMat, null, true); passes++;
      renderer.setRenderTarget(prevTarget); renderer.autoClear = ac;
      if (!prevTarget) renderer.setViewport(_vp);
      timerEnd();
      st.passes = passes;
      st.cpuMs = now() - t0;
    } catch (e) {
      // anything unsupported at runtime: restore state and fall back for good
      try { renderer.setRenderTarget(prevTarget); renderer.autoClear = ac; if (!prevTarget) renderer.setViewport(_vp); } catch (e2) { /* noop */ }
      timerEnd();
      disabled = true; why = 'runtime'; free();
      plain(scene, camera);
    }
  }

  return {
    render,
    resize(w, h) { if (!disabled && sceneRT) { try { alloc(); } catch (e) { disabled = true; why = 'resize'; } } },
    setQuality(q) { if (TIER_POST[q] !== undefined) quality = q; return quality; },
    get quality() { return quality; },
    get active() { return !disabled && !!TIER_POST[quality]; },
    stats() {
      const info = renderer.info && renderer.info.render;
      st.calls = info ? info.calls : 0; st.triangles = info ? info.triangles : 0;
      return { passes: st.passes, cpuMs: st.cpuMs, gpuMs: timer ? st.gpuMs : null, calls: st.calls, triangles: st.triangles, msaa: MS, half: hasHalf, disabled, why, quality };
    },
    dispose() { free(); if (tri) { tri.dispose(); downMat.dispose(); upMat.dispose(); compMat.dispose(); tri = null; } },
  };
}
