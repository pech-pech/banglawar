// B4 vis: Front door. World title RIDGE / LINE (extruded slab letters on smooth dune skirts), home camera, haze reveal,
// 1.1 s blend into the run camera, bottom drawer DOM. Cosmetic only; reads sled position passed in, never sim state.
// Pure helpers (blendAt, revealAt, drawerStep, ...) are exported for node tests. DOM/THREE are only touched in createFrontDoor.
import { ensureStyle } from './garage.js';

export const KEYS = {
  lookHomeBlend: { def: 1.1, min: 0.4, max: 2.5, step: 0.05, label: 'Home blend s' },
  lookHomeReveal: { def: 0.8, min: 0.2, max: 2, step: 0.05, label: 'Home reveal s' },
  lookHomeFov: { def: 66, min: 40, max: 90, step: 1, label: 'Home FOV' },
  lookHomeTitleScale: { def: 1.9, min: 1, max: 3, step: 0.05, label: 'Title scale m' },
  lookHomeTitleDist: { def: 118, min: 60, max: 200, step: 2, label: 'Title distance' },
};
const kv = (ctx, k) => { const v = ctx && ctx.cfg && ctx.cfg[k]; return typeof v === 'number' ? v : KEYS[k].def; };

// ---------------------------------------------------------------- pure state
export const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const blendAt = (t, dur = 1.1) => smooth(t / dur);                 // camera blend 0 -> 1 in dur seconds
export const revealAt = (t, dur = 0.8) => 1 - smooth(t / dur);            // haze amount 1 -> 0 (haze lifts)
export const reducedBlend = (t, dur = 1.1) => Math.min(1, Math.max(0, t / dur)); // reduced motion: plain linear cross-fade of pose

// camera mode machine: hold -> ride -> run. Returns the new {mode,t} and blend.
export function camStep(st, dt, dur = 1.1, reduced = false) {
  if (st.mode === 'hold') { st.t = 0; st.blend = 0; return st; }
  if (st.mode === 'ride') {
    st.t += dt; st.blend = reduced ? reducedBlend(st.t, dur) : blendAt(st.t, dur);
    if (st.t >= dur) { st.mode = 'run'; st.blend = 1; }
    return st;
  }
  st.blend = 1; return st;
}

// drawer: states open | closed | riding | gone; transitions return {state, cb|null}
export function drawerStep(state, action) {
  switch (action) {
    case 'toggle': return state === 'open' ? { state: 'closed', cb: null } : state === 'closed' ? { state: 'open', cb: null } : { state, cb: null };
    case 'run': case 'tapWorld': return state === 'open' || state === 'closed' ? { state: 'riding', cb: 'onRun' } : { state, cb: null };
    case 'daily': return state === 'open' ? { state: 'riding', cb: 'onDaily' } : { state, cb: null };
    case 'garage': return state === 'open' ? { state, cb: 'onGarage' } : { state, cb: null };
    case 'settings': return state === 'open' ? { state, cb: 'onSettings' } : { state, cb: null };
    case 'done': return state === 'riding' ? { state: 'gone', cb: null } : { state, cb: null };
    case 'reset': return { state: 'open', cb: null };
    default: return { state, cb: null };
  }
}

// ---------------------------------------------------------------- letters (hand-built slab outlines, units; H = 8)
const H = 8, TK = 1.7, CH = 1.3;
const HOME_SLED_NDC = 0.14, HOME_FOV_PAD = 6, TITLE_DROP = 13, FADE_SINK = 9; // sled centre target (ndc y, +up); title sink depth (m) while it fades during the blend
const chamf = (x0, y0, x1, y1, c, w) => { const a = (k) => (w.includes(k) ? c : 0); return [[x0 + a('bl'), y0], [x1 - a('br'), y0], [x1, y0 + a('br')], [x1, y1 - a('tr')], [x1 - a('tr'), y1], [x0 + a('tl'), y1], [x0, y1 - a('tl')], [x0, y0 + a('bl')]]; };
// each letter: { w, loops: [[outline pts], [hole pts]...] } (first loop = outline)
export const LETTERS = {
  R() { const W = 5.8, yb = 3.1; return { w: W, parts: [{ o: chamf(0, yb, W, H, CH, ['br', 'tr']), h: [chamf(TK, yb + TK, W - TK, H - TK, 0.6, ['br', 'tr']).reverse()] }, { o: [[0, 0], [TK, 0], [TK, yb + 0.2], [0, yb + 0.2]] }, { o: [[2.1, yb + 0.3], [3.9, yb + 0.3], [W + 0.1, 0], [W - 1.7, 0]] }] }; },
  I() { const W = 3.6, s = (W - TK) / 2; return { w: W, parts: [{ o: [[0, 0], [W, 0], [W, 1.4], [s + TK, 1.4], [s + TK, H - 1.4], [W, H - 1.4], [W, H], [0, H], [0, H - 1.4], [s, H - 1.4], [s, 1.4], [0, 1.4]] }] }; },
  D() { const W = 5.8; return { w: W, parts: [{ o: chamf(0, 0, W, H, CH + 0.4, ['br', 'tr']), h: [chamf(TK, TK, W - TK - 0.2, H - TK, 0.7, ['br', 'tr']).reverse()] }] }; },
  G() { const W = 6.0, m = 4.3, c = 0.7; return { w: W, parts: [{ o: [[CH, 0], [W - CH, 0], [W, CH], [W, m], [W * 0.46, m], [W * 0.46, m - TK], [W - TK, m - TK], [W - TK, TK + c], [W - TK - c, TK], [TK + c, TK], [TK, TK + c], [TK, H - TK - c], [TK + c, H - TK], [W, H - TK], [W, H], [CH, H], [0, H - CH], [0, CH]] }] }; },
  E() { const W = 5.2, my = H / 2; return { w: W, parts: [{ o: [[0, 0], [W, 0], [W, TK], [TK, TK], [TK, my - TK / 2], [W - 0.7, my - TK / 2], [W - 0.7, my + TK / 2], [TK, my + TK / 2], [TK, H - TK], [W, H - TK], [W, H], [0, H]] }] }; },
  L() { const W = 4.9; return { w: W, parts: [{ o: [[0, 0], [W, 0], [W, TK], [TK, TK], [TK, H], [0, H]] }] }; },
  N() { const W = 6.2, d = 2.7; return { w: W, parts: [{ o: [[0, 0], [TK, 0], [TK, H - d], [W - TK, 0], [W, 0], [W, H], [W - TK, H], [W - TK, d], [TK, H], [0, H]] }] }; },
};
export const ROWS = ['RIDGE', 'LINE'];
export function rowWidth(word, gap = 1.0) { let t = 0; for (const ch of word) t += LETTERS[ch]().w + gap; return t - gap; }

// ---------------------------------------------------------------- shaders (plum slab letters + warm top light; smooth sand skirt)
const LV = 'varying vec3 vN;varying float vT;varying float vD;attribute float aT;void main(){vN=normalize(mat3(modelMatrix)*normal);vT=aT;vec4 mv=viewMatrix*modelMatrix*vec4(position,1.);vD=length(mv.xyz);gl_Position=projectionMatrix*mv;}';
const LF = 'uniform vec3 uHaze;uniform float uFog;uniform float uLift;uniform vec3 uWarm;uniform vec3 uLo;uniform vec3 uHi;uniform vec3 uBounce;uniform float uAlpha;varying vec3 vN;varying float vT;varying float vD;void main(){vec3 n=normalize(vN);vec3 c=mix(uLo,uHi,smoothstep(.05,.95,vT));c=mix(c,uBounce,(1.-smoothstep(0.,.5,vT))*.7);float t=smoothstep(.3,.7,n.y),s=smoothstep(.1,.6,n.x);float fr=smoothstep(.3,.9,-n.z)*smoothstep(-.1,.9,vT);c=mix(c,uWarm,fr*.35);c=mix(c,uWarm,clamp(max(t,s*.9),0.,1.));float f=1.-exp(-vD*vD*uFog*uFog);c=mix(c,uHaze,clamp(f+uLift,0.,1.));gl_FragColor=vec4(c,uAlpha);\n#include <colorspace_fragment>\n}';
const DV = 'varying vec3 vN;varying float vD;varying vec2 vP;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.);vP=wp.xz;vec4 mv=viewMatrix*wp;vD=length(mv.xyz);gl_Position=projectionMatrix*mv;}';
const DF = 'uniform vec3 uHaze;uniform float uFog;uniform float uLift;uniform vec3 uGold;uniform vec3 uCoral;uniform vec3 uPlum;uniform float uAlpha;varying vec3 vN;varying float vD;varying vec2 vP;void main(){vec3 n=normalize(vN);float d=dot(n,normalize(vec3(-.18,.57,.8)));vec3 c=mix(uPlum,uCoral,smoothstep(-.05,.28,d));c=mix(c,uGold,smoothstep(.1,.4,d));float f=1.-exp(-vD*vD*uFog*uFog);c=mix(c,uHaze,clamp(f+uLift,0.,1.));gl_FragColor=vec4(c,uAlpha);\n#include <colorspace_fragment>\n}';

const noise1 = (x, s) => 0.55 * Math.sin(x * 0.045 + s) + 0.3 * Math.sin(x * 0.11 + s * 2.3) + 0.15 * Math.sin(x * 0.27 + s * 4.1);
// smooth skirt profile: crest at dz=0, long gentle fall in front (-dz), taper out sideways. No mounds, no lumps.
export function skirtY(crest, dz, slope) {
  if (dz <= 0) { const s = Math.min(1, -dz / slope); return crest - 22 * (0.12 * (1 - Math.exp(dz / 2)) + 0.88 * smooth(s)); }
  return crest - 13 * (1 - Math.exp(-dz / 5)) * 0.9;
}

// ---------------------------------------------------------------- DOM drawer
const CSS = `
.fd{position:absolute;inset:0;pointer-events:none;z-index:20;font-family:ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#3a2350;--cream:#fff4df;--cream2:#ffe9c4;--plum:#3a2350;--coral:#ff5a4a}
.fd *{box-sizing:border-box}.fd[hidden]{display:none}
.fd-sheet{position:absolute;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;pointer-events:auto;touch-action:manipulation;padding:6px max(16px,env(safe-area-inset-right,0px)) calc(14px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));border-radius:26px 26px 0 0;background:linear-gradient(180deg,#fffaf0,var(--cream));box-shadow:0 -10px 30px rgba(92,46,98,.38),0 -1px 0 rgba(58,35,80,.25);transition:transform .5s cubic-bezier(.34,1.45,.5,1)}
.fd.riding .fd-sheet{transform:translateY(110%);transition:transform .5s cubic-bezier(.5,0,.9,.4)}
.fd-grab{display:block;width:100%;height:44px;border:0;background:none;padding:0;cursor:pointer;position:relative}
.fd-grab::before{content:"";position:absolute;left:50%;top:18px;width:44px;height:5px;margin-left:-22px;border-radius:3px;background:rgba(58,35,80,.32)}
.fd-body{max-height:220px;overflow:hidden;transition:max-height .45s cubic-bezier(.34,1.3,.5,1),opacity .25s}
.fd.closed .fd-body{max-height:0;opacity:0;pointer-events:none}
.fd-tap{display:none;width:100%;min-height:44px;border:0;background:none;cursor:pointer;font:inherit;color:inherit;text-align:center;font-size:14px;font-weight:900;letter-spacing:.16em;padding:0 0 4px;-webkit-tap-highlight-color:transparent}.fd.closed .fd-tap{display:block}
.fd-best{margin:-2px 2px 8px;font-size:13px;font-weight:800;letter-spacing:.04em;text-align:right}
.fd-run,.fd-btn{font:inherit;color:var(--plum);border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.fd-run{display:block;width:100%;height:60px;border-radius:18px;font-size:22px;font-weight:900;letter-spacing:.14em;color:#fff;background:linear-gradient(180deg,#ff7260,var(--coral));box-shadow:0 4px 0 #b8281c,0 8px 16px rgba(184,40,28,.35)}
.fd-btns{display:flex;gap:8px;margin-top:11px}
.fd-btn{flex:1 1 0;min-width:0;height:56px;border-radius:16px;font-size:12.5px;font-weight:800;letter-spacing:.08em;background:var(--cream2);box-shadow:0 3px 0 rgba(58,35,80,.38)}
.fd-run:active,.fd-btn:active{transform:translateY(2px) scale(.97)}
@media (prefers-reduced-motion:reduce){.fd-sheet,.fd-body{transition:none}}
`;

// ---------------------------------------------------------------- module
// ctx as contract; cbs = { onRun(mode), onDaily(), onGarage(), onSettings(), bestM, build }
export function createFrontDoor(ctx, cbs = {}) {
  const THREE = ctx.THREE;
  const cam = { mode: 'hold', t: 0, blend: 0 };
  let dstate = 'open', reveal = 0, revealT = 0, el = null, ui = null, tapEl = null, tapFn = null, downFn = null, dx0 = 0, dy0 = 0;
  let meshes = [], mats = [], tris = 0, hold = true, shown = true, timeS = 0, drawerRoot = null, scaleK = 1;
  const reduced = () => !!(ctx.cfg && ctx.cfg.lookReducedMotion === 1);
  const doc = ctx.root && ctx.root.ownerDocument;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), M4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  const pivot = new THREE.Vector3(), AX = new THREE.Vector3(1, 0, 0);
  let sinkApplied = 0;

  function dispatch(action) {
    const r = drawerStep(dstate, action);
    dstate = r.state;
    if (el) { el.classList.toggle('closed', dstate === 'closed'); el.classList.toggle('riding', dstate === 'riding'); if (ui) ui.grab.setAttribute('aria-expanded', String(dstate === 'open')); }
    if (r.cb === 'onRun' || r.cb === 'onDaily') { cam.mode = 'ride'; cam.t = 0; hold = false; }
    if (r.cb && cbs[r.cb]) cbs[r.cb](r.cb === 'onRun' ? 'random' : r.cb === 'onDaily' ? 'daily' : undefined);
    return r;
  }

  // ---- title geometry: ONE letters mesh + ONE skirt mesh (2 calls)
  function buildTitle(anchor) {
    const S = kv(ctx, 'lookHomeTitleScale'), DEPTH = 2.2, GAP = 1.0, dist = kv(ctx, 'lookHomeTitleDist');
    const cx0 = anchor.x - 2, zL = anchor.z + dist, dU = DEPTH / S;
    const base0 = anchor.y + 13.3 - TITLE_DROP, AMP = 0.9;
    const rows = [{ word: ROWS[0], z: zL + 22, up: 24, ph: 4.2, sl: 16 }, { word: ROWS[1], z: zL, up: 0, ph: 1.7, sl: 74 }];
    const lp = [], ln = [], la = [];
    const tmp = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const R of rows) {
      R.crest = (x) => base0 + R.up + AMP * noise1(x, R.ph);
      let cx = -rowWidth(R.word, GAP) / 2;
      for (const ch of R.word) {
        const L = LETTERS[ch]();
        const shapes = L.parts.map((p) => { const s = new THREE.Shape(p.o.map((q) => new THREE.Vector2(q[0], q[1]))); (p.h || []).forEach((h) => s.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q[0], q[1]))))); return s; });
        const g = new THREE.ExtrudeGeometry(shapes, { depth: dU, bevelEnabled: false, curveSegments: 1 });
        const wx = cx0 - (cx + L.w / 2) * S;
        const M = new THREE.Matrix4().compose(tmp.set(wx, R.crest(wx) - 0.13 * H * S, R.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI + 0.03, 0)), new THREE.Vector3(S, S, S))
          .multiply(new THREE.Matrix4().makeTranslation(-L.w / 2, 0, 0));
        nm.getNormalMatrix(M);
        const p0 = g.attributes.position, n0 = g.attributes.normal;
        for (let i = 0; i < p0.count; i++) {
          tmp.set(p0.getX(i), p0.getY(i), p0.getZ(i)); const ly = tmp.y; tmp.applyMatrix4(M); lp.push(tmp.x, tmp.y, tmp.z);
          tmp.set(n0.getX(i), n0.getY(i), n0.getZ(i)).applyMatrix3(nm).normalize(); ln.push(tmp.x, tmp.y, tmp.z); la.push(ly / H);
        }
        g.dispose(); cx += L.w + GAP;
      }
    }
    // smooth sand skirts: regular grid, no mounds
    const dp = [], idx = [], LEN = 190;
    const xs = []; for (let x = -LEN; x <= LEN; x += 16) xs.push(x);
    for (const R of rows) {
      const zr = []; for (let dz = -R.sl; dz <= 36; dz += dz < 0 ? 10 : 12) zr.push(dz);
      const b0 = dp.length / 3, ax = (x) => Math.abs(x);
      zr.forEach((dz) => xs.forEach((x) => dp.push(cx0 + x, skirtY(R.crest(x + cx0) - 0.0058 * ax(x) * ax(x), dz, R.sl), R.z - DEPTH * 0.5 + dz)));
      for (let j = 0; j < zr.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = b0 + j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; idx.push(a, c, b, b, c, d); }
    }
    tris = idx.length / 3 + lp.length / 9;
    const common = { uHaze: { value: new THREE.Color('#ffb070') }, uFog: { value: 0.0006 }, uLift: { value: 1 }, uAlpha: { value: 1 } };
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3)); lg.setAttribute('aT', new THREE.Float32BufferAttribute(la, 1));
    const lm = new THREE.ShaderMaterial({ vertexShader: LV, fragmentShader: LF, side: THREE.DoubleSide, uniforms: { ...common, uWarm: { value: new THREE.Color('#ffcf8a') }, uLo: { value: new THREE.Color('#4a1f48') }, uHi: { value: new THREE.Color('#d9705e') }, uBounce: { value: new THREE.Color('#f0906c') } } });
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setIndex(idx); dg.computeVertexNormals();
    const nn = dg.attributes.normal; for (let i = 0; i < nn.count; i++) if (nn.getY(i) < 0) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
    const dm = new THREE.ShaderMaterial({ vertexShader: DV, fragmentShader: DF, side: THREE.DoubleSide, uniforms: { ...common, uGold: { value: new THREE.Color('#ffb070') }, uCoral: { value: new THREE.Color('#d9707a') }, uPlum: { value: new THREE.Color('#5a2a60') } } });
    mats = [lm, dm];
    meshes = [new THREE.Mesh(lg, lm), new THREE.Mesh(dg, dm)];
    for (const m of meshes) { m.frustumCulled = false; ctx.scene.add(m); }
    pivot.set(cx0, anchor.y - 8, zL - 40);
  }

  // title fades (alpha) and sinks into the dune over the blend, so nothing pops when it hides at u = 1
  function fadeTitle(u, red) {
    const a = 1 - smooth(Math.min(1, u / 0.4)), sink = red ? 0 : FADE_SINK * (1 - a) * (1 - a);
    for (const m of mats) { m.uniforms.uAlpha.value = a; const tr = a < 0.999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } }
    for (const m of meshes) { m.position.y += sinkApplied - sink; m.visible = a > 0.003; }
    sinkApplied = sink;
  }

  function buildDom() {
    ensureStyle(doc, 'frontdoor', CSS);
    el = doc.createElement('div'); el.className = 'fd';
    el.innerHTML = '<h1 style="position:absolute;width:1px;height:1px;overflow:hidden;margin:0">Ridgeline</h1><div class="fd-sheet" role="region" aria-label="Menu"><button class="fd-grab" aria-label="Toggle menu" aria-expanded="true"></button><button class="fd-tap" data-a="run">TAP TO RIDE</button><div class="fd-body"><div class="fd-best"></div><button class="fd-run" data-a="run">RUN</button><div class="fd-btns"><button class="fd-btn" data-a="daily">DAILY</button><button class="fd-btn" data-a="garage">GARAGE</button><button class="fd-btn" data-a="settings">SETTINGS</button></div></div></div>';
    el.querySelector('.fd-best').textContent = 'BEST ' + Math.round(cbs.bestM || 0) + ' m';
    ctx.root.appendChild(el);
    ui = { grab: el.querySelector('.fd-grab') };
    ui.grab.addEventListener('click', () => dispatch('toggle'));
    el.querySelector('.fd-sheet').addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-a]'); if (b) dispatch(b.dataset.a); });
    const cv = ctx.renderer && ctx.renderer.domElement;
    if (cv && cv.addEventListener) { tapEl = cv; tapFn = (e) => { const d = Math.hypot((e.clientX || 0) - dx0, (e.clientY || 0) - dy0); if (hold && shown && d < 14) dispatch('tapWorld'); }; downFn = (e) => { dx0 = e.clientX || 0; dy0 = e.clientY || 0; }; cv.addEventListener('pointerdown', downFn); cv.addEventListener('pointerup', tapFn); }
  }

  return {
    // build the world title once the parked-sled anchor is known
    init(anchor) { if (!meshes.length && THREE.ExtrudeGeometry) buildTitle(anchor); if (doc && !el) buildDom(); revealT = 0; },
    dispatch,
    get drawerState() { return dstate; }, get mode() { return cam.mode; }, get holding() { return hold; },
    setBest(m) { cbs.bestM = m; if (el) el.querySelector('.fd-best').textContent = 'BEST ' + Math.round(m || 0) + ' m'; },
    show(b) { shown = b; if (el) el.hidden = !b; for (const m of meshes) m.visible = b && cam.mode !== 'run'; },
    reset() { for (const m of meshes) m.position.y += sinkApplied; sinkApplied = 0; for (const m of mats) { m.uniforms.uAlpha.value = 1; m.transparent = false; } cam.mode = 'hold'; cam.t = 0; cam.blend = 0; hold = true; revealT = 0; dstate = drawerStep(dstate, 'reset').state; if (el) { el.className = 'fd'; el.hidden = false; } for (const m of meshes) m.visible = true; },
    // Call after run camera pose is known. runPose = {position:Vector3, quaternion:Quaternion, fov}. Returns blend 0..1.
    homeCam(dt, camera, sledPos, runPose) {
      if (cam.mode === 'run') return 1;
      const red = reduced(); timeS += dt;
      const asp = camera.aspect || 1, nf = Math.min(1, Math.max(0, (0.744 - asp) / 0.35)), fovA = kv(ctx, 'lookHomeFov') + HOME_FOV_PAD + 18 * nf;
      const drift = red ? 0 : Math.sin(timeS * 0.35) * 0.25;
      const cx = sledPos.x + 1.7 + drift, cz = sledPos.z - 9.5, gy = ctx.groundY ? ctx.groundY(cx, cz) : sledPos.y;
      A.set(cx, Math.max(gy + 1.25, sledPos.y + 0.3), cz);
      M4.lookAt(A, B.set(sledPos.x - 2, sledPos.y - 4 - 5 * nf, sledPos.z + 60), UP); qA.setFromRotationMatrix(M4);
      // open drawer covers the lower ~32%: pitch down so the parked sled centre sits at ~HOME_SLED_NDC (upper ~45% of the screen)
      B.set(sledPos.x - cx, sledPos.y + 0.45 - A.y, sledPos.z - cz).applyQuaternion(qB.copy(qA).invert());
      const th = Math.tan(fovA * Math.PI / 360), want = HOME_SLED_NDC * th, cur = B.y / -B.z;
      qB.setFromAxisAngle(AX, Math.atan(cur) - Math.atan(want)); qA.multiply(qB);
      // narrow phones: scale title about its foot so RIDGE never clips
      const k = Math.min(1, Math.tan(fovA * Math.PI / 360) * asp / 0.4838);
      if (Math.abs(k - scaleK) > 0.004) { scaleK = k; for (const m of meshes) { m.scale.setScalar(k); m.position.set(pivot.x * (1 - k), pivot.y * (1 - k), pivot.z * (1 - k)); } }
      revealT += dt; reveal = revealAt(revealT, kv(ctx, 'lookHomeReveal'));
      for (const m of mats) m.uniforms.uLift.value = reveal;
      camStep(cam, dt, kv(ctx, 'lookHomeBlend'), red);
      const u = cam.blend;
      if (cam.mode === 'hold' || !runPose) { camera.position.copy(A); camera.quaternion.copy(qA); if (Math.abs(camera.fov - fovA) > 0.01) { camera.fov = fovA; camera.updateProjectionMatrix(); } return 0; }
      camera.position.copy(A).lerp(runPose.position, u); camera.quaternion.copy(qA).slerp(qB.copy(runPose.quaternion), u);
      camera.fov = fovA + (runPose.fov - fovA) * u; camera.updateProjectionMatrix();
      fadeTitle(u, red);
      if (cam.mode === 'run') { dispatch('done'); for (const m of meshes) m.visible = false; if (el) el.hidden = true; }
      return u;
    },
    update(dt, vs) { if (vs && vs.home === false && cam.mode === 'hold' && hold) { /* run started elsewhere */ } },
    fx(ev) { if (ev && ev.type === 'run_start' && cam.mode === 'hold') { cam.mode = 'ride'; cam.t = 0; hold = false; } },
    shift(dz, dy) { pivot.z -= dz; pivot.y -= dy || 0; for (const m of meshes) { m.position.z -= dz; m.position.y -= dy || 0; } },
    setQuality() {},
    stats() { return { calls: meshes.length, tris: Math.round(tris), mode: cam.mode, drawer: dstate, blend: cam.blend }; },
    dispose() {
      for (const m of meshes) { ctx.scene.remove(m); m.geometry.dispose(); } mats.forEach((m) => m.dispose()); meshes = []; mats = [];
      if (tapEl) { tapEl.removeEventListener('pointerup', tapFn); tapEl.removeEventListener('pointerdown', downFn); }
      if (el && el.parentNode) el.parentNode.removeChild(el); el = null;
    },
  };
}
