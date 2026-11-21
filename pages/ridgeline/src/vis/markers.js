// B4 M8 markers: in-world moment markers, 3 instanced draw calls (solid boxes, cloth banners, additive glow).
//   milestone posts (cloth banner + lantern + dot line) at each 1000 m and at hull unlock distances,
//   zone banner poles on zone_enter, recover sparks. Pooled, no per-frame allocation, shift-aware:
//   markers are keyed by ABSOLUTE distance; world z = dist + zOff, shift(dz) adds dz to zOff.
export const KEYS = {
  lookMarkSpacing: { def: 1000, min: 250, max: 5000, step: 250, label: 'Marker spacing (m)' },
  lookMarkAhead: { def: 420, min: 100, max: 800, step: 20, label: 'Marker draw ahead (m)' },
  lookMarkGlow: { def: 1, min: 0, max: 2, step: 0.1, label: 'Marker glow' },
  lookMarkSparks: { def: 14, min: 0, max: 24, step: 1, label: 'Recover sparks' },
};

export const UNLOCKS = [
  { dist: 2800, hull: 'kite' }, { dist: 5500, hull: 'anvil' },
  { dist: 8500, hull: 'barge' }, { dist: 13500, hull: 'spindle' },
];

// Pure: every milestone distance in [from, to], sorted, unlock marks merged with each `spacing` m.
export function milestoneDistances(from, to, spacing = 1000) {
  const out = [];
  const start = Math.max(1, Math.ceil(from / spacing));
  for (let k = start; k * spacing <= to; k++) out.push({ dist: k * spacing, hull: null });
  for (const u of UNLOCKS) {
    if (u.dist < from || u.dist > to) continue;
    const hit = out.find((o) => o.dist === u.dist);
    if (hit) hit.hull = u.hull; else out.push({ dist: u.dist, hull: u.hull });
  }
  return out.sort((a, b) => a.dist - b.dist);
}

import { ZONE_NAMES } from '../endless.js';

// Largest font size (<= maxPx, >= minPx) at which every line fits maxW; measure(text, px) -> width. Pure.
export function fitFont(measure, lines, maxW, maxPx, minPx = 6) {
  let px = maxPx;
  while (px > minPx && lines.some((t) => measure(t, px) > maxW)) px -= 1;
  return px;
}
export function zoneLines(name) {
  const w = String(name).toUpperCase().split(' ');
  return w.length > 1 ? [w[0], w.slice(1).join(' ')] : [w[0]];
}

const POOL_M = 6, POOL_Z = 2, SOLID_CAP = 64, GLOW_CAP = 192, DOTS = 17, SLOT_W = 128, SLOT_H = 256;
const BANNER_W = 1.75, BANNER_H = 3.2, POST_H = 5.6, ZONE_H = 7.4, ZBAN_W = 6.0, ZBAN_H = 2.4;

export function createMarkers(ctx) {
  const THREE = ctx.THREE;
  const cfg = () => ctx.cfg || {};
  const g = (k) => { const v = cfg()[k]; return v === undefined ? KEYS[k].def : v; };
  const hasDoc = typeof document !== 'undefined';

  const ms = []; for (let i = 0; i < POOL_M; i++) ms.push({ on: false, D: 0, hull: null, x: 0, y: 0, z: 0, flare: 0 });
  const zs = []; for (let i = 0; i < POOL_Z; i++) zs.push({ on: false, z: 0, x: 0, y: 0, name: '', lap: 0, age: 0 });
  const SPARKS = 24;
  const sp = []; for (let i = 0; i < SPARKS; i++) sp.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, max: 1 });
  let zOff = null, lastDist = 0, time = 0, runId = 0;
  const S = { milestones: 0, zones: 0, sparks: 0, solid: 0, glow: 0, cloth: 0 };

  // label atlas: POOL_M+POOL_Z slots side by side
  const SLOTS = POOL_M + POOL_Z;
  let cv = null, cx2 = null, tex = null;
  if (hasDoc) {
    cv = document.createElement('canvas'); cv.width = SLOT_W * SLOTS; cv.height = SLOT_H; cx2 = cv.getContext('2d');
    tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  }
  const slotKey = new Array(SLOTS).fill('');
  function paintSlot(slot, kind, line1, line2) {
    const key = kind + line1 + line2;
    if (slotKey[slot] === key) return; slotKey[slot] = key;
    if (!cx2) return;
    const x0 = slot * SLOT_W, c = cx2;
    c.clearRect(x0, 0, SLOT_W, SLOT_H);
    c.fillStyle = kind === 'zone' ? '#fff4df' : '#fbeed2'; c.fillRect(x0, 0, SLOT_W, SLOT_H);
    c.fillStyle = '#6a2c5a'; c.fillRect(x0, 0, SLOT_W, 10); c.fillRect(x0, SLOT_H - 10, SLOT_W, 10);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = kind === 'zone' ? '#3a1030' : '#5a2250';
    if (kind === 'zone') {
      // slot is stretched onto a wide banner: pre-scale y so glyphs come out square on screen
      const sy = (SLOT_H / ZBAN_H) / (SLOT_W / ZBAN_W), lh = SLOT_H / sy, lines = zoneLines(line1), fam = '"Arial Black", Impact, sans-serif';
      c.save(); c.beginPath(); c.rect(x0, 0, SLOT_W, SLOT_H); c.clip(); c.translate(x0, 0); c.scale(1, sy);
      const px = fitFont((t, f) => { c.font = '900 ' + f + 'px ' + fam; return c.measureText(t).width; }, lines, SLOT_W - 14, Math.floor((lh - 10) / (lines.length + (line2 ? 0.6 : 0)) * 0.9));
      c.font = '900 ' + px + 'px ' + fam;
      const n = lines.length + (line2 ? 0.55 : 0), y0 = lh / 2 - (n - 1) * px * 0.55;
      lines.forEach((t, i) => c.fillText(t, SLOT_W / 2, y0 + i * px * 1.1));
      if (line2) { c.fillStyle = '#c4452f'; c.font = '900 ' + Math.max(6, Math.round(px * 0.5)) + 'px ' + fam; c.fillText(line2, SLOT_W / 2, y0 + lines.length * px * 1.1); }
      c.restore();
    }
    else {
      c.font = '900 40px "Arial Black", Impact, sans-serif'; c.fillText(line1, x0 + SLOT_W / 2, 100, SLOT_W - 12);
      c.font = '900 30px "Arial Black", Impact, sans-serif'; c.fillText('m', x0 + SLOT_W / 2, 150);
      if (line2) { c.fillStyle = '#ff5a4a'; c.font = '900 22px "Arial Black", Impact, sans-serif'; c.fillText(line2, x0 + SLOT_W / 2, 200, SLOT_W - 12); }
    }
    tex.needsUpdate = true;
  }

  // --- solid boxes
  const solidMat = new THREE.MeshBasicMaterial({ fog: false });
  const solid = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), solidMat, SOLID_CAP);
  solid.frustumCulled = false; solid.renderOrder = 4; solid.count = 0;
  solid.setColorAt(0, new THREE.Color(1, 1, 1));
  // --- cloth banners
  const clothGeo = new THREE.PlaneGeometry(1, 1, 4, 8); clothGeo.translate(0, -0.5, 0);
  const aSlot = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS), 1); clothGeo.setAttribute('aSlot', aSlot);
  const U = { uTime: { value: 0 }, uSway: { value: 1 }, uTex: { value: tex }, uHas: { value: tex ? 1 : 0 }, uSlots: { value: SLOTS } };
  const clothMat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide, fog: false,
    vertexShader: `attribute float aSlot; uniform float uTime, uSway, uSlots; varying vec2 vUv; varying float vSh;
      void main(){ vec3 p = position; float w = 1.0 - uv.y; float sw = uSway * w * w;
        p.x += sin(uTime*2.2 + position.y*3.0 + aSlot) * 0.09 * sw; p.z += cos(uTime*1.7 + position.y*2.0) * 0.07 * sw;
        vUv = vec2((aSlot + uv.x) / uSlots, uv.y); vSh = 0.88 + 0.12 * sin(position.y*7.0 + uTime*uSway*2.0);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uHas; varying vec2 vUv; varying float vSh;
      void main(){ vec3 c = uHas > 0.5 ? texture2D(uTex, vUv).rgb : vec3(0.98,0.93,0.82); gl_FragColor = vec4(c * vSh, 1.0); }`,
  });
  const cloth = new THREE.InstancedMesh(clothGeo, clothMat, POOL_M + POOL_Z * 2); cloth.frustumCulled = false; cloth.renderOrder = 5; cloth.count = 0;
  // --- glow billboards (additive)
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(GLOW_CAP * 4), 4); glowGeo.setAttribute('aCol', aCol);
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol;
      void main(){ vUv = uv; vCol = aCol; vec4 c = modelViewMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
        float s = length(instanceMatrix[0].xyz); c.xy += position.xy * s; gl_Position = projectionMatrix * c; }`,
    fragmentShader: `varying vec2 vUv; varying vec4 vCol;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = clamp(1.0 - d, 0.0, 1.0); a *= a;
        gl_FragColor = vec4(vCol.rgb * vCol.a * a, 1.0); }`,
  });
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, GLOW_CAP); glow.frustumCulled = false; glow.renderOrder = 9; glow.count = 0;
  const group = new THREE.Group(); group.name = 'b4-markers';
  group.add(solid, cloth, glow);
  if (ctx.scene) ctx.scene.add(group);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const Q_ID = new THREE.Quaternion(), Q_FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  let nSolid = 0, nGlow = 0, nCloth = 0;
  const box = (x, y, z, sx, sy, sz, hex) => {
    if (nSolid >= SOLID_CAP) return;
    _m.compose(_p.set(x, y, z), Q_ID, _s.set(sx, sy, sz)); solid.setMatrixAt(nSolid, _m);
    solid.setColorAt(nSolid, _c.set(hex)); nSolid++;
  };
  const glw = (x, y, z, size, r, gg, b, a) => {
    if (nGlow >= GLOW_CAP) return;
    _m.compose(_p.set(x, y, z), Q_ID, _s.set(size, size, 1)); glow.setMatrixAt(nGlow, _m);
    const o = nGlow * 4; aCol.array[o] = r; aCol.array[o + 1] = gg; aCol.array[o + 2] = b; aCol.array[o + 3] = a; nGlow++;
  };
  const banner = (x, y, z, w, h, slot) => {
    _m.compose(_p.set(x, y, z), Q_FLIP, _s.set(w, h, 1)); cloth.setMatrixAt(nCloth, _m);
    aSlot.array[nCloth] = slot; nCloth++;
  };

  const worldZ = (D) => D + (zOff || 0);
  const gy = (x, z) => (ctx.groundY ? ctx.groundY(x, z) : 0);

  function activateM(D, hull, vs) {
    let s = null;
    for (let i = 0; i < ms.length; i++) { if (ms[i].on && ms[i].D === D) return; if (!s && !ms[i].on) s = ms[i]; }
    if (!s) return;
    s.on = true; s.D = D; s.hull = hull; s.flare = 0;
    s.x = vs.x - 2.9; s.z = worldZ(D); s.y = gy(s.x, s.z);
  }

  function update(dt, vs) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1); time += dt;
    const reduced = cfg().lookReducedMotion === 1 || !!vs.reduced;
    if (zOff === null || vs.dist < lastDist - 50) zOff = vs.z - vs.dist; // first frame or run restart
    lastDist = vs.dist;
    // pool upkeep: free passed markers, then claim upcoming ones
    for (const m of ms) if (m.on && m.z < vs.z - 40) m.on = false;
    for (const z of zs) if (z.on) { z.age += dt; if (z.z < vs.z - 40) z.on = false; }
    // same set as milestoneDistances(), scanned without allocating
    const from = vs.dist - 30, to = vs.dist + g('lookMarkAhead'), spc = g('lookMarkSpacing');
    for (let k = Math.max(1, Math.ceil(from / spc)); k * spc <= to; k++) {
      let hull = null;
      for (let u = 0; u < UNLOCKS.length; u++) if (UNLOCKS[u].dist === k * spc) hull = UNLOCKS[u].hull;
      activateM(k * spc, hull, vs);
    }
    for (let u = 0; u < UNLOCKS.length; u++) if (UNLOCKS[u].dist >= from && UNLOCKS[u].dist <= to) activateM(UNLOCKS[u].dist, UNLOCKS[u].hull, vs);

    nSolid = nGlow = nCloth = 0;
    U.uTime.value = time; U.uSway.value = reduced ? 0 : 1;
    const ga = g('lookMarkGlow'), flick = reduced ? 1 : 0.92 + 0.08 * Math.sin(time * 7);
    let nm = 0, nz = 0;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]; if (!m.on) continue; nm++;
      m.z = worldZ(m.D);
      paintSlot(i, 'm', String(m.D), m.hull ? m.hull.toUpperCase() : '');
      const x = m.x, y = m.y, z = m.z, armY = y + POST_H - 0.3;
      box(x, y + 0.18, z, 0.56, 0.36, 0.56, '#7a4a5a');
      box(x, y + POST_H / 2, z, 0.18, POST_H, 0.18, '#a8705f');
      box(x + 0.9, armY, z, 1.96, 0.12, 0.12, '#a8705f'); // arm toward path (+x side)
      box(x, y + POST_H + 0.3, z, 0.2, 0.3, 0.2, '#ffc060'); // lantern core
      banner(x + 1.2, armY - 0.05, z - 0.02, BANNER_W, BANNER_H, i);
      m.flare = Math.max(0, m.flare - dt);
      const fl = (1 + (reduced ? m.flare : m.flare * 2)) * ga * flick;
      glw(x, y + POST_H + 0.3, z, 1.6 * (1 + m.flare), 1, 0.81, 0.54, 0.85 * fl);
      for (let k = 0; k < DOTS; k++) {
        const u = (k / (DOTS - 1) - 0.5) * 2, dx = x + 2.9 + u * 6.2;
        glw(dx, gy(dx, z) + 0.12, z, 0.7, 1, 0.72, 0.4, 0.7 * ga);
      }
    }
    for (let i = 0; i < zs.length; i++) {
      const zn = zs[i]; if (!zn.on) continue; nz++;
      paintSlot(POOL_M + i, 'zone', zn.name, zn.lap > 0 ? 'LAP ' + zn.lap : '');
      for (let si = 0; si < 2; si++) { const sg = si * 2 - 1;
        const x = zn.x + sg * 4.2, y = gy(x, zn.z), armY = y + ZONE_H - 0.25;
        box(x, y + 0.2, zn.z, 0.6, 0.4, 0.6, '#7a4a5a');
        box(x, y + ZONE_H / 2, zn.z, 0.2, ZONE_H, 0.2, '#a8705f');
        box(x - sg * 0.7, armY, zn.z, 1.4, 0.1, 0.1, '#a8705f');
        glw(x, y + ZONE_H + 0.3, zn.z, 0.9, 1, 0.81, 0.54, 0.55 * ga);
      }
      // one wide banner between the poles, horizontal text, fade in over 0.6 s
      banner(zn.x + 3.0, gy(zn.x, zn.z) + ZONE_H - 1.5, zn.z - 0.02, ZBAN_W, ZBAN_H, POOL_M + i);
    }
    // sparks (verlet-free simple ballistic; reduced = no motion, they just fade)
    let ns = 0;
    for (const s of sp) {
      if (s.life <= 0) continue; ns++;
      s.life -= dt;
      if (!reduced) { s.vy -= 2.2 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; }
      const k = Math.max(0, s.life / s.max);
      glw(s.x, s.y, s.z, 0.22 + 0.2 * k, 1, 0.82, 0.5, k * ga);
    }
    solid.count = nSolid; solid.instanceMatrix.needsUpdate = true; if (solid.instanceColor) solid.instanceColor.needsUpdate = true;
    cloth.count = nCloth; cloth.instanceMatrix.needsUpdate = true; aSlot.needsUpdate = true;
    glow.count = nGlow; glow.instanceMatrix.needsUpdate = true; aCol.needsUpdate = true;
    S.milestones = nm; S.zones = nz; S.sparks = ns; S.solid = nSolid; S.glow = nGlow; S.cloth = nCloth;
    lastVs = vs;
  }
  let lastVs = null;

  function fx(ev) {
    if (!ev) return;
    if (ev.type === 'zone_enter' && lastVs) {
      let z = zs[0]; for (let i = 0; i < zs.length; i++) if (!zs[i].on) { z = zs[i]; break; }
      z.on = true; z.age = 0; const zi = Number.isInteger(ev.zone) ? ev.zone : -1;
      z.name = String(ev.name || ZONE_NAMES[zi] || ev.zone || '').slice(0, 24); z.lap = ev.lap > 0 ? ev.lap | 0 : 0;
      z.x = lastVs.x; z.z = lastVs.z + 60; z.y = gy(z.x, z.z);
    } else if (ev.type === 'hull_unlock') {
      for (const m of ms) if (m.on && (m.hull === ev.hull || !ev.hull)) m.flare = 1.5;
    } else if (ev.type === 'recover_end' && lastVs) {
      const n = Math.min(SPARKS, g('lookMarkSparks') | 0);
      for (let i = 0; i < n; i++) {
        const s = sp[i], a = ctx.crng() * Math.PI * 2, r = 0.3 + ctx.crng() * 0.6;
        s.x = lastVs.x + Math.cos(a) * r * 0.5; s.y = lastVs.y + 1.2; s.z = lastVs.z + Math.sin(a) * r * 0.5;
        s.vx = Math.cos(a) * r; s.vy = 1.2 + ctx.crng() * 1.4; s.vz = Math.sin(a) * r; s.max = s.life = 0.6 + ctx.crng() * 0.5;
      }
    } else if (ev.type === 'run_start') { for (const m of ms) m.on = false; for (const z of zs) z.on = false; for (const s of sp) s.life = 0; zOff = null; }
  }

  // Floating origin: everything keyed by absolute distance moves with zOff; stored absolute-world bits move directly.
  function shift(dz, dy) {
    zOff = (zOff || 0) + dz;
    for (const m of ms) { m.z += dz; m.y += dy || 0; }
    for (const z of zs) { z.z += dz; z.y += dy || 0; }
    for (const s of sp) { s.z += dz; s.y += dy || 0; }
  }

  return {
    update, fx, shift, setQuality() {}, group,
    stats: () => S,
    state: () => ({ ms, zs, zOff }),
    dispose() {
      if (ctx.scene) ctx.scene.remove(group);
      solid.geometry.dispose(); solidMat.dispose(); clothGeo.dispose(); clothMat.dispose(); glowGeo.dispose(); glowMat.dispose();
      solid.dispose(); cloth.dispose(); glow.dispose(); if (tex) tex.dispose();
    },
  };
}
