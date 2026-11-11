(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// WebGPU backend: one instanced quad pipeline, SDF per primitive type, premultiplied alpha, AA edges.
// Instance = 16 floats: cx,cy,hx,hy | qrot,type,p0,p1 | p2,p3,p4,p5 | r,g,b,a  (CSS px; quad local frame rotated by qrot)
// type 0 circle, 1 ring, 2 rect, 3 ngon, 4 linear gradient rect (colour -> c2 along local +y), 5 radial gradient disc (colour at centre -> c2 at r).
// Add 8 to the type for additive light (premultiplied output with alpha 0). Gradients carry c2 in p2..p5.

var WGSL = [
  'struct U { W: f32, H: f32, dpr: f32, pad: f32 };',
  '@group(0) @binding(0) var<uniform> u: U;',
  'struct VO { @builtin(position) pos: vec4<f32>, @location(0) l: vec2<f32>, @location(1) @interpolate(flat) tp: vec4<f32>, @location(2) @interpolate(flat) p2: vec4<f32>, @location(3) @interpolate(flat) col: vec4<f32> };',
  '@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4<f32>, @location(1) b: vec4<f32>, @location(2) d: vec4<f32>, @location(3) c: vec4<f32>) -> VO {',
  '  var k = array<vec2<f32>, 6>(vec2<f32>(-1.0,-1.0), vec2<f32>(1.0,-1.0), vec2<f32>(-1.0,1.0), vec2<f32>(-1.0,1.0), vec2<f32>(1.0,-1.0), vec2<f32>(1.0,1.0));',
  '  let pad = 1.0 + 1.0 / u.dpr;',
  '  let l = k[vi] * (a.zw + vec2<f32>(pad, pad));',
  '  let cs = cos(b.x); let sn = sin(b.x);',
  '  let w = a.xy + vec2<f32>(l.x * cs - l.y * sn, l.x * sn + l.y * cs);',
  '  var o: VO;',
  '  o.pos = vec4<f32>(w.x / u.W * 2.0 - 1.0, 1.0 - w.y / u.H * 2.0, 0.0, 1.0);',
  '  o.l = l; o.tp = b; o.p2 = d; o.col = c;',
  '  return o;',
  '}',
  'const PI: f32 = 3.14159265;',
  '@fragment fn fs(i: VO) -> @location(0) vec4<f32> {',
  '  let l = i.l; let ad = i.tp.y > 7.5; let t = select(i.tp.y, i.tp.y - 8.0, ad); let p0 = i.tp.z; let p1 = i.tp.w;',
  '  var d: f32 = 0.0;',
  '  var col = i.col;',
  '  if (t < 0.5) {',
  '    d = length(l) - p0;',
  '  } else if (t < 1.5) {',
  '    d = abs(length(l) - p0) - p1 * 0.5;',
  '    let ha = i.p2.x;',
  '    if (ha < PI - 0.0001) {',
  '      let q = vec2<f32>(l.x, abs(l.y));',
  '      let c = vec2<f32>(cos(ha), sin(ha));',
  '      let m = length(q - c * max(dot(q, c), 0.0));',
  '      let s = select(-1.0, 1.0, c.x * q.y - c.y * q.x > 0.0);',
  '      d = max(d, m * s);',
  '    }',
  '  } else if (t < 2.5) {',
  '    let q = abs(l) - vec2<f32>(p0, p1);',
  '    d = length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0);',
  '  } else if (t < 3.5) {',
  '    let an = PI / max(p1, 3.0);',
  '    let ang = atan2(l.y, l.x);',
  '    let bn = ang - 2.0 * an * floor(ang / (2.0 * an)) - an;',
  '    var q = length(l) * vec2<f32>(cos(bn), abs(sin(bn)));',
  '    q = q - p0 * vec2<f32>(cos(an), sin(an));',
  '    q.y = q.y + clamp(-q.y, 0.0, p0 * sin(an));',
  '    d = length(q) * select(-1.0, 1.0, q.x > 0.0);',
  '  } else if (t < 4.5) {',
  '    let q = abs(l) - vec2<f32>(p0, p1);',
  '    d = length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0);',
  '    col = mix(i.col, i.p2, clamp((l.y + p1) / max(2.0 * p1, 0.0001), 0.0, 1.0));',
  '  } else {',
  '    d = length(l) - p0;',
  '    col = mix(i.col, i.p2, clamp(length(l) / max(p0, 0.0001), 0.0, 1.0));',
  '  }',
  '  let cov = clamp(0.5 - d * u.dpr, 0.0, 1.0);',
  '  let al = col.a * cov;',
  '  if (al <= 0.0) { discard; }',
  '  return vec4<f32>(col.rgb * al, select(al, 0.0, ad));',
  '}'
].join('\n');

var FL = 16;

function pack(list, arr) {
  var n = 0, o = 0, k, p, c;
  for (k = 0; k < list.length; k++) {
    p = list[k]; c = p.c; o = n * FL;
    var cx, cy, hx, hy, qr = 0, ty, a = 0, b = 0, e = 0;
    switch (p.p) {
      case 'circle': cx = p.x; cy = p.y; hx = hy = Math.max(0, p.r); ty = 0; a = hx; break;
      case 'ring':
        cx = p.x; cy = p.y; hx = hy = Math.max(0, p.r) + p.lw * 0.5; ty = 1; a = Math.max(0, p.r); b = p.lw; e = Math.PI;
        if (p.a0 != null) {
          var sp = p.a1 - p.a0;
          if (sp < 6.2831) { if (sp <= 0) continue; qr = (p.a0 + p.a1) * 0.5; e = sp * 0.5; }
        }
        break;
      case 'rect': cx = p.x; cy = p.y; hx = p.w * 0.5; hy = p.h * 0.5; qr = p.rot || 0; ty = 2; a = hx; b = hy; break;
      case 'line':
        var dx = p.x2 - p.x1, dy = p.y2 - p.y1, L = Math.sqrt(dx * dx + dy * dy);
        cx = (p.x1 + p.x2) * 0.5; cy = (p.y1 + p.y2) * 0.5; hx = L * 0.5; hy = p.lw * 0.5; qr = Math.atan2(dy, dx); ty = 2; a = hx; b = hy; break;
      case 'ngon': cx = p.x; cy = p.y; hx = hy = p.r; qr = p.rot || 0; ty = 3; a = p.r; b = p.n; break;
      case 'grad': cx = p.x; cy = p.y; hx = p.w * 0.5; hy = p.h * 0.5; qr = p.rot || 0; ty = 4; a = hx; b = hy; break;
      case 'rgrad': cx = p.x; cy = p.y; hx = hy = Math.max(0, p.r); ty = 5; a = hx; break;
      default: continue;
    }
    if ((o + FL) > arr.length) return -1; // caller grows
    arr[o] = cx; arr[o + 1] = cy; arr[o + 2] = hx; arr[o + 3] = hy;
    arr[o + 4] = qr; arr[o + 5] = ty; arr[o + 6] = a; arr[o + 7] = b;
    if (ty >= 4) { var c2 = p.c2 || c; arr[o + 8] = c2[0]; arr[o + 9] = c2[1]; arr[o + 10] = c2[2]; arr[o + 11] = c2[3] == null ? 1 : c2[3]; }
    else { arr[o + 8] = e; arr[o + 9] = 0; arr[o + 10] = 0; arr[o + 11] = 0; }
    if (p.add) arr[o + 5] = ty + 8;
    arr[o + 12] = c[0]; arr[o + 13] = c[1]; arr[o + 14] = c[2]; arr[o + 15] = c[3] == null ? 1 : c[3];
    n++;
  }
  return n;
}

V.GPU = {
  WGSL: WGSL,
  pack: pack,
  // -> Promise<backend|null>. Never throws.
  // o.offscreen: render into a private texture instead of the canvas swapchain (headless test mode; see gpu-test.js)
  create: function (canvas, o) {
    o = o || {};
    var S = { dev: null, ad: null, gctx: null, fmt: 'bgra8unorm', pipe: null, ubuf: null, bind: null, ibuf: null, icap: 0,
      arr: new Float32Array(FL * 1024), off: null, offW: 0, offH: 0, w: 0, h: 0, dpr: 1, lostFns: [], quiet: false, dead: false, warned: false, n: 0 };
    function warnOnce(m) { if (!S.warned) { S.warned = true; try { console.warn('[gpu] ' + m); } catch (e) {} } }
    function ensureBuf(n) {
      if (n <= S.icap && S.ibuf) return;
      var cap = Math.max(1024, S.icap); while (cap < n) cap *= 2;
      if (S.ibuf) S.ibuf.destroy();
      S.ibuf = S.dev.createBuffer({ size: cap * FL * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      S.icap = cap;
    }
    function upload(list) {
      var n = pack(list, S.arr);
      while (n < 0) { S.arr = new Float32Array(S.arr.length * 2); n = pack(list, S.arr); }
      ensureBuf(Math.max(1, n));
      if (n) S.dev.queue.writeBuffer(S.ibuf, 0, S.arr.buffer, 0, n * FL * 4);
      S.dev.queue.writeBuffer(S.ubuf, 0, new Float32Array([S.w, S.h, S.dpr, 0]));
      S.n = n;
    }
    function encode(enc, view) {
      var pass = enc.beginRenderPass({ colorAttachments: [{ view: view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
      if (S.n) { pass.setPipeline(S.pipe); pass.setBindGroup(0, S.bind); pass.setVertexBuffer(0, S.ibuf); pass.draw(6, S.n); }
      pass.end();
    }
    function release() {
      S.quiet = true;
      try { if (S.gctx && S.gctx.unconfigure) S.gctx.unconfigure(); } catch (e) {}
      try { if (S.ibuf) S.ibuf.destroy(); if (S.off) S.off.destroy(); } catch (e) {}
      S.off = null; S.offW = S.offH = 0;
      try { if (S.dev) S.dev.destroy(); } catch (e) {}
      S.ibuf = null; S.icap = 0; S.dead = true;
    }

    var api = {
      name: 'WebGPU',
      canvas: canvas,
      get alive() { return !S.dead; },
      get count() { return S.n; },
      resize: function (w, h, dpr) {
        S.w = w; S.h = h; S.dpr = Math.min(dpr || 1, 2);
        var pw = Math.max(1, Math.round(w * S.dpr)), ph = Math.max(1, Math.round(h * S.dpr));
        if (canvas.width !== pw) canvas.width = pw;
        if (canvas.height !== ph) canvas.height = ph;
        S.dpr = pw / Math.max(1, w); // effective
        if (o.offscreen && S.dev && !S.dead && (S.offW !== pw || S.offH !== ph)) {
          if (S.off) S.off.destroy();
          S.off = S.dev.createTexture({ size: [pw, ph], format: S.fmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
          S.offW = pw; S.offH = ph;
        }
      },
      // returns false if the device is gone (caller falls back the same frame)
      draw: function (list) {
        if (S.dead) return false;
        if (!(S.w > 0 && S.h > 0)) return true;
        upload(list);
        var enc = S.dev.createCommandEncoder();
        encode(enc, o.offscreen ? S.off.createView() : S.gctx.getCurrentTexture().createView());
        S.dev.queue.submit([enc.finish()]);
        return true;
      },
      // test hook: resolves when the last submitted frame has finished on the device (a 1-pixel copy and map; offscreen mode only)
      fence: function () {
        if (S.dead || !S.off) return Promise.resolve(false);
        if (!S.fbuf) S.fbuf = S.dev.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        var enc = S.dev.createCommandEncoder();
        enc.copyTextureToBuffer({ texture: S.off }, { buffer: S.fbuf, bytesPerRow: 256 }, [1, 1]);
        S.dev.queue.submit([enc.finish()]);
        return S.fbuf.mapAsync(GPUMapMode.READ).then(function () { S.fbuf.unmap(); return true; });
      },
      onLost: function (fn) { S.lostFns.push(fn); },
      destroy: release,
      // test hook: behave exactly as if dev.lost resolved with this reason (device is released quietly first)
      _fakeLoss: function (reason) {
        release();
        S.lostFns.slice().forEach(function (fn) { try { fn(reason || 'unknown', 'fake'); } catch (e) {} });
      },
      _device: function () { return S.dev; },
      readback: function (list, bg, wantPng) {
        if (S.dead) return Promise.resolve({ w: 0, h: 0, nonBg: 0, error: 'device gone' });
        try {
          upload(list);
          var w = canvas.width, h = canvas.height, dev = S.dev;
          var tex = dev.createTexture({ size: [w, h], format: S.fmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
          var bpr = Math.ceil(w * 4 / 256) * 256;
          var buf = dev.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
          var enc = dev.createCommandEncoder();
          encode(enc, tex.createView());
          enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
          dev.queue.submit([enc.finish()]);
          var bgra = /^bgra/.test(S.fmt), B = bg || [0, 0, 0];
          var br = Math.round(B[0] * 255), bgc = Math.round(B[1] * 255), bb = Math.round(B[2] * 255);
          return buf.mapAsync(GPUMapMode.READ).then(function () {
            var d = new Uint8Array(buf.getMappedRange()), nonBg = 0, nonBlack = 0, x, y, o;
            for (y = 0; y < h; y++) {
              o = y * bpr;
              for (x = 0; x < w; x++, o += 4) {
                var r = bgra ? d[o + 2] : d[o], g = d[o + 1], b = bgra ? d[o] : d[o + 2];
                if (r + g + b > 24) nonBlack++;
                if (Math.abs(r - br) > 10 || Math.abs(g - bgc) > 10 || Math.abs(b - bb) > 10) nonBg++;
              }
            }
            var png = null;
            if (wantPng && typeof document !== 'undefined') {
              var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
              var cx = cv.getContext('2d'), im = cx.createImageData(w, h), q = im.data;
              for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
                var si = y * bpr + x * 4, di = (y * w + x) * 4;
                q[di] = bgra ? d[si + 2] : d[si]; q[di + 1] = d[si + 1]; q[di + 2] = bgra ? d[si] : d[si + 2]; q[di + 3] = 255;
              }
              cx.putImageData(im, 0, 0); png = cv.toDataURL('image/png');
            }
            buf.unmap(); buf.destroy(); tex.destroy();
            return { w: w, h: h, nonBg: nonBg, nonBlack: nonBlack, instances: S.n, png: png };
          });
        } catch (e) { return Promise.resolve({ w: 0, h: 0, nonBg: 0, error: String(e && e.message || e) }); }
      }
    };
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return Promise.resolve(null);
      return navigator.gpu.requestAdapter().then(function (ad) {
        if (!ad) throw new Error('no adapter');
        S.ad = ad;
        return ad.requestDevice();
      }).then(function (dev) {
        S.dev = dev; G.__vGpuKeep = [S.ad, dev, navigator.gpu]; // keep the instance alive (GC loses the device otherwise)
        S.fmt = navigator.gpu.getPreferredCanvasFormat();
        if (!o.offscreen) {
          var gctx = canvas.getContext('webgpu');
          if (!gctx) throw new Error('no webgpu context');
          S.gctx = gctx;
          gctx.configure({ device: dev, format: S.fmt, alphaMode: 'opaque' });
        }
        G.__vGpuKeep.push(S.gctx, canvas);
        dev.lost.then(function (info) {
          S.dead = true;
          if (S.quiet) return; // we released it ourselves
          var reason = (info && info.reason) || 'unknown';
          S.lostFns.slice().forEach(function (fn) { try { fn(reason, info && info.message); } catch (e) {} });
        });
        dev.addEventListener('uncapturederror', function (e) { warnOnce('uncaptured: ' + (e.error && e.error.message)); });
        var mod = dev.createShaderModule({ code: WGSL });
        return mod.getCompilationInfo().then(function (ci) {
          var er = ci.messages.filter(function (m) { return m.type === 'error'; });
          if (er.length) throw new Error('WGSL: ' + er.map(function (m) { return m.lineNum + ':' + m.message; }).join(' | '));
          S.ubuf = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
          var bgl = dev.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
          S.bind = dev.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: S.ubuf } }] });
          var attrs = [0, 1, 2, 3].map(function (i) { return { shaderLocation: i, offset: i * 16, format: 'float32x4' }; });
          dev.pushErrorScope('validation');
          S.pipe = dev.createRenderPipeline({
            layout: dev.createPipelineLayout({ bindGroupLayouts: [bgl] }),
            vertex: { module: mod, entryPoint: 'vs', buffers: [{ arrayStride: FL * 4, stepMode: 'instance', attributes: attrs }] },
            fragment: { module: mod, entryPoint: 'fs', targets: [{ format: S.fmt, blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
            primitive: { topology: 'triangle-list' }
          });
          return dev.popErrorScope().then(function (err) { if (err) throw new Error('pipeline: ' + err.message); });
        });
      }).then(function () {
        return api;
      }).catch(function (e) {
        warnOnce('init failed: ' + (e && e.message || e));
        release();
        return null;
      });
    } catch (e) { return Promise.resolve(null); }

  }
};
})();
