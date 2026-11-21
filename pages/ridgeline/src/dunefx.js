// dunefx.js - sunset-dunes sky streak clouds, ground dust puffs, twinkling glints.
// Two InstancedMeshes (normal blend: clouds+dust, additive: glints), each one draw call.
// ASSUMPTION flipY = true on `texture` (three.js default for Texture/TextureLoader, same as render.js makeBoards).
// json rects are y-from-top, so v0 = 1 - (y + h) / atlasH, dv = h / atlasH. Negative du mirrors horizontally.
// Billboards are fully camera-facing, built in the vertex shader from the instance translation + scale.
// Clouds are pinned to the far plane in clip space (gl_Position.z = w*0.9999) so camera.far (~300) never clips them;
// with depthTest on they still sit behind all terrain and in front of a depthWrite-less sky dome.
export function createDuneFx(THREE, { texture, cells, rand }) {
  const N_CLOUD = 6, N_DUST = 0, /* lead 2026-11-21: puff art reads as cartoon clouds on the dunes, off until redrawn */ N_GLINT = 24;
  const NA = N_CLOUD + N_DUST; // normal-blend instance count
  const W = (texture.image && (texture.image.width || texture.image.naturalWidth)) || 2048;
  const H = (texture.image && (texture.image.height || texture.image.naturalHeight)) || 2048;
  const R = (a, b) => a + (b - a) * rand();

  const group = new THREE.Group();
  group.name = 'duneFx';

  function rectOf(c, mirror, out, i) {
    const du = c.w / W, dv = c.h / H, u0 = c.x / W, v0 = 1 - (c.y + c.h) / H;
    out.setXYZW(i, mirror ? u0 + du : u0, v0, mirror ? -du : du, dv);
  }

  function build(count, additive, renderOrder) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const aRect = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage); // x opacity, y far-pin
    geo.setAttribute('aRect', aRect); geo.setAttribute('aMisc', aMisc);
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, depthTest: true, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nattribute vec2 aMisc;\nvarying float vOp;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = aRect.xy + uv * aRect.zw;\n#endif\n vOp = aMisc.x;')
        .replace('#include <project_vertex>', `vec4 dfC = modelMatrix * vec4( instanceMatrix[3].xyz, 1.0 );
 vec4 mvPosition = viewMatrix * dfC;
 mvPosition.xy += position.xy * vec2( instanceMatrix[0].x, instanceMatrix[1].y );
 gl_Position = projectionMatrix * mvPosition;
 if ( aMisc.y > 0.5 ) gl_Position.z = gl_Position.w * 0.9999;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vOp;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.a *= vOp;');
    };
    mat.customProgramCacheKey = () => 'dunefx' + (additive ? 'A' : 'N');
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return { mesh, aRect, aMisc, arr: mesh.instanceMatrix.array, mop: aMisc.array };
  }

  // renderOrder -900: after opaque terrain/sky (opaque queue is drawn first), before other transparents at 0
  const A = build(NA, false, -900);
  const G = build(N_GLINT, true, -899);

  // matrix writer: column-major, translation + x/y scale only (no rotation, billboard in shader)
  function setM(arr, i, x, y, z, sx, sy) {
    const o = i * 16;
    arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = 1; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
  }

  // ---- clouds (instances 0..N_CLOUD-1) ----
  const cx = new Float32Array(N_CLOUD), cy = new Float32Array(N_CLOUD), cz = new Float32Array(N_CLOUD);
  const cw = new Float32Array(N_CLOUD), ch = new Float32Array(N_CLOUD), cv = new Float32Array(N_CLOUD);
  for (let i = 0; i < N_CLOUD; i++) {
    const c = i % 2 ? cells.cloudB : cells.cloudA;
    rectOf(c, rand() < 0.5, A.aRect, i);
    cw[i] = R(110, 190); ch[i] = cw[i] * c.h / c.w;
    cx[i] = R(-160, 160); cy[i] = R(40, 110); cz[i] = R(260, 340); cv[i] = R(0.6, 2.0) * (rand() < 0.5 ? -1 : 1);
    A.mop[i * 2] = 0.75; A.mop[i * 2 + 1] = 1;
  }

  // ---- dust (instances N_CLOUD..NA-1) ----
  const puffs = [cells.puff1, cells.puff2, cells.puff3, cells.puff4];
  const dx = new Float32Array(N_DUST), dz = new Float32Array(N_DUST), dy = new Float32Array(N_DUST);
  const dw = new Float32Array(N_DUST), dvx = new Float32Array(N_DUST), dOp = new Float32Array(N_DUST);
  const dAsp = new Float32Array(N_DUST);
  function spawnDust(i, initial) {
    const c = puffs[(rand() * 4) | 0];
    rectOf(c, rand() < 0.5, A.aRect, N_CLOUD + i);
    dw[i] = R(3, 6); dAsp[i] = c.h / c.w;
    dOp[i] = R(0.25, 0.4);
    dvx[i] = R(-0.6, 0.6);
    dy[i] = R(0.4, 1.4); // above ground reference
    return initial;
  }
  // ---- glints ----
  const gx = new Float32Array(N_GLINT), gz = new Float32Array(N_GLINT), gy = new Float32Array(N_GLINT);
  const gs = new Float32Array(N_GLINT), gph = new Float32Array(N_GLINT), gfr = new Float32Array(N_GLINT);
  for (let i = 0; i < N_GLINT; i++) {
    rectOf(cells.glints[(rand() * cells.glints.length) | 0], rand() < 0.5, G.aRect, i);
    gs[i] = R(0.15, 0.3); gph[i] = R(0, 6.283); gfr[i] = R(1.5, 5);
    gy[i] = R(0.5, 4); G.mop[i * 2 + 1] = 0;
  }

  let inited = false;
  function init(cam) {
    for (let i = 0; i < N_DUST; i++) { spawnDust(i); dx[i] = cam.x + R(-45, 45); dz[i] = cam.z + R(20, 90); }
    for (let i = 0; i < N_GLINT; i++) { gx[i] = cam.x + R(-20, 20); gz[i] = cam.z + R(5, 40); }
    inited = true;
  }

  let last = 0;
  function update(camPos, t, speed01) {
    if (!inited) { init(camPos); last = t; }
    const dt = Math.min(0.1, Math.max(0, t - last)); last = t;
    const base = camPos.y - 3;
    // clouds: follow camera x/z, slow x drift (wrapped)
    for (let i = 0; i < N_CLOUD; i++) {
      let ox = cx[i] + cv[i] * t; ox = ((ox + 240) % 480 + 480) % 480 - 240; // wrap into -240..240
      setM(A.arr, i, camPos.x + ox, cy[i], camPos.z + cz[i], cw[i], ch[i]);
    }
    // dust: drift, recycle behind 8 m / beyond 95 m / sideways 55 m
    for (let i = 0; i < N_DUST; i++) {
      dx[i] += dvx[i] * dt * (0.5 + speed01);
      const rz = dz[i] - camPos.z, rx = dx[i] - camPos.x;
      if (rz < 8 || rz > 95 || rx > 55 || rx < -55) {
        spawnDust(i);
        dz[i] = camPos.z + R(70, 90); dx[i] = camPos.x + R(-45, 45);
      }
      const j = N_CLOUD + i, w = dw[i];
      setM(A.arr, j, dx[i], base + dy[i], dz[i], w, w * dAsp[i]);
      const fade = Math.min(1, (dz[i] - camPos.z - 8) / 14, (95 - (dz[i] - camPos.z)) / 15); // soft in/out
      A.mop[j * 2] = dOp[i] * (fade < 0 ? 0 : fade);
    }
    // glints: twinkle, recycle
    for (let i = 0; i < N_GLINT; i++) {
      const rz = gz[i] - camPos.z, rx = gx[i] - camPos.x;
      if (rz < 4 || rz > 42 || rx > 25 || rx < -25) { gz[i] = camPos.z + R(30, 40); gx[i] = camPos.x + R(-20, 20); gy[i] = R(0.5, 4); gph[i] = R(0, 6.283); }
      setM(G.arr, i, gx[i], base + gy[i], gz[i], gs[i], gs[i]);
      const s = Math.sin(t * gfr[i] + gph[i]);
      G.mop[i * 2] = s > 0 ? s * s : 0;
    }
    A.mesh.instanceMatrix.needsUpdate = true; A.aMisc.needsUpdate = true;
    G.mesh.instanceMatrix.needsUpdate = true; G.aMisc.needsUpdate = true;
  }

  function dispose() {
    group.remove(A.mesh); group.remove(G.mesh);
    A.mesh.geometry.dispose(); G.mesh.geometry.dispose();
    A.mesh.material.dispose(); G.mesh.material.dispose();
    A.mesh.dispose(); G.mesh.dispose(); // texture is owned by the caller
  }
  return { group, update, dispose };
}
