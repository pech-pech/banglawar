// B4 vis integrator: creates every cosmetic module, builds the `vs` snapshot each frame from sim state (read only),
// fans out sim events, owns the cosmetic RNG (separate seed from the sim), ground-shader injection, quality step-down,
// floating-origin shift fan-out and the post chain. Never writes sim state or the physics world.
import { mulberry32 } from '../rng.js';
import { createSledRig, HULLS, KEYS as K_SLED } from './sledrig.js';
import { createSandTracks, KEYS as K_TRACK } from './sandtracks.js';
import { createMoments, KEYS as K_MOM } from './moments.js';
import { createSky, nightFrom, gradeStrength, gradeColor, KEYS as K_SKY } from './sky.js';
import { createPostFx, KEYS as K_POST } from './postfx.js';
import { createQuality, tierFromIndex, pixelRatioFor, KEYS as K_QUAL } from './quality.js';
import { createFrontDoor, KEYS as K_FRONT } from './frontdoor.js';
import { createGarage, UNLOCK_M, KEYS as K_GAR } from './garage.js';
import { createHud, KEYS as K_HUD } from './hudspring.js';
import { createMarkers, KEYS as K_MARK } from './markers.js';
import { createCamRig, KEYS as K_CAM } from './camrig.js';

// every module key + the integrator's own keys (config.js carries a literal copy; tests/vis-replay checks they match)
export const VIS_KEYS = {
  ...K_SLED, ...K_TRACK, ...K_MOM, ...K_SKY, ...K_POST, ...K_QUAL, ...K_FRONT, ...K_GAR, ...K_HUD, ...K_MARK, ...K_CAM,
  lookReducedMotion: { def: 0, min: 0, max: 1, step: 1, label: 'Reduced motion' },
  lookGapStub: { def: 0, min: 0, max: 200, step: 1, label: 'Gap stub m (0 off, until B3)' },
};
export { HULLS, UNLOCK_M };
export const hullUnlocked = (id, bestM) => (UNLOCK_M[id] || 0) <= (bestM || 0);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * o = { THREE, scene, camera, renderer, cfg, look, sunDir, root, groundY(x,z), course, seed, sledGroup,
 *       hooks: { getPhase(), hull(), bestM(), onRun(mode), onDaily(), onGarage(), onSettings(), onRide(hull), onGarageClose() } }
 */
// Flip to true only if the render world ever goes local (shifts with the physics origin): enables the module shift fan-out.
export const RENDER_LOCAL = false;
export const _test = { renderLocal: null }; // test hook: set _test.renderLocal = true/false to override RENDER_LOCAL

export function createVis(o) {
  const { THREE, scene, camera, renderer, cfg } = o;
  const hooks = o.hooks || {};
  const crng = mulberry32(((o.seed >>> 0) ^ 0xc05e71c) >>> 0); // cosmetic only, never the sim RNG
  const ctx = { THREE, scene, camera, renderer, cfg, crng, look: o.look, sunDir: o.sunDir, root: o.root || null, groundY: o.groundY };
  const course = o.course;
  const hasDom = !!ctx.root;
  let suppress = false; // programmatic dispatch: do not call back into main
  const cb = (name) => (...a) => { if (!suppress && typeof hooks[name] === 'function') hooks[name](...a); };

  const startHull = typeof hooks.hull === 'function' ? hooks.hull() : 'wren';
  const bestM = () => (typeof hooks.bestM === 'function' ? hooks.bestM() : 0);
  const unlockM = () => (typeof hooks.unlockM === 'function' ? hooks.unlockM() : bestM()); // B5: B3 unlocks (marks, dev) as a metre threshold
  const rig = createSledRig(ctx, { hull: startHull });
  const tracks = createSandTracks(ctx);
  const moments = createMoments(ctx);
  const sky = createSky(ctx);
  const markers = createMarkers(ctx);
  const cam = createCamRig(ctx);
  const post = createPostFx(ctx);
  const hud = createHud(ctx);
  const front = createFrontDoor(ctx, { onRun: cb('onRun'), onDaily: cb('onDaily'), onGarage: cb('onGarage'), onSettings: cb('onSettings'), bestM: bestM() });
  const garage = hasDom ? createGarage(ctx, {
    hulls: HULLS, bestM: unlockM(), start: startHull,
    onSelect(id, locked) { rig.setHull(id); rig.silhouette(locked); },
    onRide: cb('onRide'), onClose: cb('onGarageClose'),
  }) : null;
  // shift(dz,dy) convention: modules ADD the delta applied to world coords (frontdoor subtracts: gets the raw origin move)
  const mods = [rig, tracks, moments, sky, markers, cam, hud];
  const all = mods.concat([front]).concat(garage ? [garage] : []);

  // ---- quality
  const userTier = () => tierFromIndex(cfg.lookTier);
  let lastUserIdx = cfg.lookTier;
  // pixel ratio follows the tier: cap = render.js dprCap (taken from the renderer at creation, refreshed by render.js resize)
  let dprCap = (renderer.getPixelRatio && renderer.getPixelRatio()) || 1, dprNow = dprCap;
  function pixelRatio(cap) { if (cap) dprCap = cap; dprNow = pixelRatioFor(quality.tier, dprCap); return dprNow; }
  function applyDpr(t) {
    const r = pixelRatioFor(t, dprCap);
    if (r === dprNow) return;
    dprNow = r;
    try { renderer.setPixelRatio(r); post.resize(0, 0); } catch (e) { /* ignore */ } // setPixelRatio re-applies the size; post re-allocs on drawing-buffer size
  }
  function setQ(t) { for (const m of all) if (m.setQuality) m.setQuality(t); post.setQuality(t); applyDpr(t); }
  const quality = createQuality({ tier: userTier(), onTier: (t) => setQ(t) });
  setQ(quality.tier);

  // ---- ground shader (sand tracks + night grade), injected by render.js's terrain onBeforeCompile
  const tChunk = tracks.groundChunk();
  const sChunk = sky.groundChunk();
  function patchGround(sh) {
    Object.assign(sh.uniforms, tChunk.uniforms, sChunk.uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + tChunk.fragDecl + '\n' + sChunk.fragDecl)
      // QA-Q1 D4: night grade FIRST, then sand tracks, so the warm berm lip is added over the plum ground (not graded away with it)
      .replace('diffuseColor.rgb = col;', 'diffuseColor.rgb = col;\n' + sChunk.fragBody + '\n diffuseColor.rgb = col;\n' + tChunk.fragBody + '\n diffuseColor.rgb = col;');
  }

  // ---- sky / fog colours
  const baseFog = scene.fog ? scene.fog.color.clone() : new THREE.Color(0xffb070);
  const baseBg = scene.background && scene.background.isColor ? scene.background.clone() : baseFog.clone();
  const _g = [0, 0, 0], _w = [1, 1, 1];
  const skyTint = new THREE.Color(1, 1, 1); // render.js multiplies dome / ranges by this (darken + plum only)

  // ---- lanterns: bow lantern + lantern posts along the course ahead (cosmetic positions from the course function)
  const _lp = new THREE.Vector3();
  sky.setLanternSource((emit) => {
    const L = rig.parts && rig.parts.lantern;
    if (L) { L.getWorldPosition(_lp); emit(_lp.x, _lp.y, _lp.z, 1.3, 1); }
    if (!course || !course.centerX) return;
    const z0 = Math.ceil(vs.z / 40) * 40;
    for (let k = 0; k < 7; k++) {
      const z = z0 + k * 40, c = course.centerX(z), hw = course.halfWidth ? course.halfWidth(z) : 14;
      for (let s = -1; s <= 1; s += 2) { const x = c + s * (hw + 1.5); emit(x, o.groundY(x, z) + 2.4, z, 1.6, 0.9); }
    }
  });

  // ---- vs snapshot (reused object)
  const vs = { t: 0, dt: 0, x: 0, y: 0, z: 0, speed: 0, vx: 0, vy: 0, mode: 'ground', grounded: true, pitch: 0, roll: 0, quat: null, heading: 0,
    diving: false, comp: 0, steer: 0, latAcc: 0, boostT: 0, boost: 0, flow: 0, dist: 0, zone: 0, lap: 0, gap: Infinity, n: 0, tumbleP: null, home: true, reduced: false };
  const tumbleP = { x: 0, y: 0, z: 0 };
  let frontHidden = false, steerIn = 0, prevVx = 0, latS = 0, shiftZ = 0, phase = 'home', inited = false, lastReal = 0, endOpen = false, shiftN = 0, shiftDy = 0;
  const runPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 58 };
  const sledPos = new THREE.Vector3();

  function build(state, dt) {
    vs.t = state.t || 0; vs.dt = dt;
    vs.x = state.x; vs.y = state.y; vs.z = state.z; vs.speed = Math.abs(state.speed || 0); vs.vx = state.vx || 0; vs.vy = state.vy || 0;
    vs.mode = state.mode || 'ground'; vs.grounded = !!state.grounded; vs.pitch = state.pitch || 0; vs.roll = state.roll || 0;
    vs.quat = state.quat || null; vs.heading = state.heading || 0; vs.diving = !!state.diving; vs.comp = state.comp || 0;
    vs.steer = clamp(steerIn, -1, 1);
    if (dt > 0) { const a = (vs.vx - prevVx) / dt; latS += (clamp(a, -80, 80) - latS) * (1 - Math.exp(-dt * 12)); }
    prevVx = vs.vx; vs.latAcc = latS;
    vs.boostT = state.boostT || 0; vs.boost = state.boost || 0; vs.flow = state.flow | 0;
    vs.dist = typeof state.dist === 'number' ? state.dist : state.z + shiftZ;
    vs.zone = state.zone | 0; vs.lap = state.lap | 0;
    vs.gap = state.gap != null ? state.gap : (cfg.lookGapStub > 0 ? cfg.lookGapStub : Infinity);
    vs.reduced = cfg.lookReducedMotion === 1;
    vs.home = phase === 'home' || phase === 'garage';
    if (vs.mode === 'tumble') { tumbleP.x = state.x; tumbleP.y = typeof state.bodyY === 'number' ? state.bodyY : state.y; tumbleP.z = state.z; vs.tumbleP = tumbleP; }
    else vs.tumbleP = null;
    vs.n = nightFrom(vs, cfg);
    return vs;
  }

  // per frame, from render.js draw() in place of the old camera block. Sets the camera; returns vs.
  function frame(state, dt, sledObj) {
    const nowR = typeof performance !== 'undefined' ? performance.now() : 0;
    const realDt = lastReal ? (nowR - lastReal) / 1000 : 0; lastReal = nowR;
    if (renderer.info) { renderer.info.autoReset = false; renderer.info.reset(); }
    if (cfg.lookTier !== lastUserIdx) { lastUserIdx = cfg.lookTier; quality.setUser(userTier()); }
    if (phase === 'run' && realDt > 0) quality.update(realDt);
    const p = typeof hooks.getPhase === 'function' ? hooks.getPhase() : phase;
    if (p !== phase) setPhase(p);
    build(state, dt);
    if (sledObj) sledPos.copy(sledObj.position); else sledPos.set(vs.x, vs.y + 0.7, vs.z);
    if (!inited) { inited = true; front.init({ x: sledPos.x, y: vs.y, z: vs.z }); }
    if (phase !== 'home' && front.mode === 'hold' && !frontHidden) { frontHidden = true; front.show(false); }
    for (const m of mods) if (m !== cam) m.update(dt, vs);
    tChunk.uniforms.uTrkN.value = Math.min(1, gradeStrength(sky.n, cfg));
    sky.groundChunk().uniforms.uSkG.value.x = gradeStrength(sky.n, cfg); // whole-view grade (full strength: ground plum, QA-Q1 D1) (lead note: n 0.5 = 45% everywhere)
    // camera
    if (phase === 'garage' && garage) garage.garageCam(camera, sledPos, vs.heading, o.groundY);
    else {
      cam.update(dt, vs, camera);
      if (phase === 'home' || front.mode === 'ride') {
        runPose.position.copy(camera.position); runPose.quaternion.copy(camera.quaternion); runPose.fov = camera.fov;
        front.homeCam(dt, camera, sledPos, runPose);
      }
    }
    // fog / clear / sky tint by n
    const n = sky.n, k = gradeStrength(n, cfg);
    // QA-1: fog / clear get the SAME darken + plum-hue operator as the ground (sky.skyParams' brighter rose haze lifted the
    // mid-range ground to a washed pink-lilac at n 0.5-0.6), so the whole frame only darkens and shifts hue.
    if (scene.fog) { _g[0] = baseFog.r; _g[1] = baseFog.g; _g[2] = baseFog.b; gradeColor(_g, k, _g); scene.fog.color.setRGB(_g[0], _g[1], _g[2]); }
    if (scene.background && scene.background.isColor) { _g[0] = baseBg.r; _g[1] = baseBg.g; _g[2] = baseBg.b; gradeColor(_g, k, _g); scene.background.setRGB(_g[0], _g[1], _g[2]); }
    gradeColor(_w, k, _g); skyTint.setRGB(_g[0], _g[1], _g[2]);
    return vs;
  }

  function render(sc, cm) { post.render(sc, cm); }

  function fx(ev) {
    if (!ev) return;
    if (ev.type === 'run_start') {
      latS = 0; prevVx = 0; shiftZ = 0; quality.resetRun(userTier()); setQ(quality.tier);
      if (phase !== 'run') setPhase('run');
      if (front.mode === 'hold') { suppress = true; try { frontHidden = false; front.show(true); front.dispatch('run'); } finally { suppress = false; } }
    }
    for (const m of all) { try { m.fx(ev); } catch (e) { /* cosmetic: never break the run */ } }
  }

  function setPhase(p) {
    const prev = phase; phase = p;
    if (p === 'home') {
      hud.show(false); hud.hideEnd(); hud.show(false); endOpen = false;
      if (garage) garage.close();
      if (prev !== 'garage') front.reset();
      frontHidden = false; front.show(true); front.setBest(bestM());
      rig.setHull(typeof hooks.hull === 'function' ? hooks.hull() : 'wren'); rig.silhouette(false);
    } else if (p === 'garage') {
      front.show(false);
      if (garage) garage.open(typeof hooks.hull === 'function' ? hooks.hull() : 'wren', unlockM());
    } else if (p === 'run') {
      if (garage && garage.isOpen) garage.close();
      if (endOpen) { hud.hideEnd(); endOpen = false; }
      hud.show(true);
    } else if (p === 'end') { /* endCard() opens the sheet */ }
  }

  function attachPhys(phys) {
    if (!phys || typeof phys.onShift !== 'function') return;
    phys.onShift((dz, dy) => {
      const renderLocal = _test.renderLocal == null ? RENDER_LOCAL : _test.renderLocal;
      shiftZ += dz || 0; shiftN++; shiftDy += dy || 0;
      // Render world stays ABSOLUTE across the floating-origin shift (only the Rapier world shifts): world modules keep absolute coords.
      if (!renderLocal) return;
      for (const m of mods) { try { m.shift(-(dz || 0), -(dy || 0)); } catch (e) { /* ignore */ } }
      front.shift(dz || 0, dy || 0);
    });
  }

  function stats() {
    const r = renderer.info && renderer.info.render;
    const ms = {};
    for (const [k, m] of Object.entries({ rig, tracks, moments, sky, markers, cam, front })) { try { ms[k] = m.stats(); } catch (e) { ms[k] = null; } }
    return { calls: r ? r.calls : 0, triangles: r ? r.triangles : 0, tier: quality.tier, post: post.stats(), n: sky.n, mods: ms };
  }

  // title + drawer DOM exist before any run_start dispatch (anchor = the parked sled spot at z 0)
  if (course && course.centerX) { const ax = course.centerX(0); front.init({ x: ax, y: o.groundY(ax, 0), z: 0 }); inited = true; }
  phase = 'init';
  setPhase(typeof hooks.getPhase === 'function' ? hooks.getPhase() : 'home');

  return {
    frame, render, fx, setPhase, attachPhys, shiftInfo: () => ({ n: shiftN, z: shiftZ, y: shiftDy }), patchGround, stats,
    resize(w, h) { post.resize(w, h); },
    pixelRatio,
    get mods() { return mods; },
    setInput(s) { steerIn = +s || 0; },
    tapWorld() { if (phase === 'home') front.dispatch('tapWorld'); },
    endCard(m, cbs) { endOpen = true; return hud.endCard(m, cbs); },
    hideEnd() { endOpen = false; hud.hideEnd(); },
    probeLine() { const p = post.stats(); return quality.probeLine({ postMs: p.cpuMs, stampMs: tracks.lastMs, gpuMs: p.gpuMs, dpr: dprNow }); },
    get rig() { return rig; }, get vs() { return vs; }, get quality() { return quality; }, get front() { return front; }, get garage() { return garage; },
    get hud() { return hud; }, get sky() { return sky; }, get phase() { return phase; }, skyTint,
    dispose() { for (const m of all) { try { m.dispose(); } catch (e) { /* ignore */ } } try { post.dispose(); } catch (e) { /* ignore */ } if (renderer.info) renderer.info.autoReset = true; },
  };
}
