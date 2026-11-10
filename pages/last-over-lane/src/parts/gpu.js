(function () {
  window.LOLParts = window.LOLParts || {};

  var WGSL = [
    'struct U { W: f32, H: f32, dpr: f32, time: f32, reduced: f32, topY: f32, batY: f32, cx: f32, laneTopW: f32, laneBotW: f32, p0: f32, p1: f32 };',
    '@group(0) @binding(0) var<uniform> u: U;',
    '',
    'struct VO { @builtin(position) pos: vec4<f32> };',
    '@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {',
    '  var q = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));',
    '  var o: VO; o.pos = vec4<f32>(q[i], 0.0, 1.0); return o;',
    '}',
    '',
    'fn hash(p: vec2<f32>) -> f32 {',
    '  var q = fract(p * vec2<f32>(0.1031, 0.1030));',
    '  q = q + dot(q, q.yx + 33.33);',
    '  return fract((q.x + q.y) * q.x);',
    '}',
    'fn vnoise(p: vec2<f32>) -> f32 {',
    '  let i = floor(p); let f = fract(p);',
    '  let s = f * f * (3.0 - 2.0 * f);',
    '  let a = hash(i); let b = hash(i + vec2<f32>(1.0, 0.0));',
    '  let c = hash(i + vec2<f32>(0.0, 1.0)); let d = hash(i + vec2<f32>(1.0, 1.0));',
    '  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);',
    '}',
    '',
    '@fragment fn fs(@builtin(position) fc: vec4<f32>) -> @location(0) vec4<f32> {',
    '  let px = 1.0 / u.dpr;',
    '  let p = fc.xy / u.dpr;',
    '  let W = u.W; let H = u.H; let x = p.x; let y = p.y;',
    '  let wallW = W * 0.05;',
    '  let wallTop = u.topY - 10.0;',
    '',
    '  // ---- grass: base + mowing bands + blade noise ----',
    '  var col = vec3<f32>(30.0, 58.0, 36.0) / 255.0;',
    '  let bandH = H / 4.9;',
    '  let band = floor(y / bandH);',
    '  if (band - 2.0 * floor(band * 0.5) > 0.5) { col = mix(col, vec3<f32>(1.0), 0.025); }',
    '  let gn = vnoise(vec2<f32>(x * 0.9, y * 0.22)) * 0.6 + vnoise(vec2<f32>(x * 2.7 + 11.0, y * 0.7)) * 0.4;',
    '  col = col * (1.0 + (gn - 0.5) * 0.10);',
    '  // floodlight pool at the crease',
    '  let cy = u.batY + 36.0;',
    '  let lr = length((p - vec2<f32>(u.cx, cy)) / vec2<f32>(W * 0.75, H * 0.42));',
    '  let pool = 1.0 - smoothstep(0.0, 1.0, lr);',
    '  col = col * (1.0 + 0.22 * pool);',
    '',
    '  // ---- lane ----',
    '  let t = clamp((y - u.topY) / (H - u.topY), 0.0, 1.0);',
    '  let halfW = mix(u.laneTopW, u.laneBotW, t) * 0.5;',
    '  let dx = x - u.cx;',
    '  let dSide = abs(dx) - halfW;',
    '  let dTop = u.topY - y;',
    '  let dLane = max(dSide, dTop);',
    '  let laneCov = 1.0 - smoothstep(-0.5 * px, 0.5 * px, dLane);',
    '  // soft AO of the lane on the grass just outside it',
    '  let aoLane = (1.0 - smoothstep(0.0, 5.0, max(dLane, 0.0))) * (1.0 - laneCov) * 0.14;',
    '  col = col * (1.0 - aoLane);',
    '  var lane = vec3<f32>(201.0, 180.0, 138.0) / 255.0;',
    '  let ln = vnoise(vec2<f32>(x * 1.7, y * 1.1)) * 0.5 + vnoise(vec2<f32>(x * 5.3 + 3.0, y * 3.1)) * 0.5;',
    '  lane = lane * (1.0 + (ln - 0.5) * 0.09);',
    '  // lighter centre strip',
    '  let hw = max(halfW, 1.0);',
    '  lane = lane * (1.0 + 0.035 * exp(-pow(dx / (hw * 0.3), 2.0)));',
    '  // wear: bowler end and around the crease',
    '  let wn = vnoise(vec2<f32>(x * 0.35 + 7.0, y * 0.35));',
    '  let wearTop = (1.0 - smoothstep(u.topY, u.topY + 40.0, y)) * (0.45 + 0.55 * wn);',
    '  let wearBat = exp(-pow((y - (u.batY + 22.0)) / 30.0, 2.0)) * exp(-pow(dx / (hw * 0.55), 2.0)) * (0.4 + 0.6 * wn);',
    '  let wearK = clamp(wearTop + wearBat, 0.0, 1.0);',
    '  lane = mix(lane, lane * vec3<f32>(0.687, 0.589, 0.464), 0.10 * wearK);',  // ~4% darker, warm brown (toward #8a6a40), not grey
    '  // soft darker edges (2-3 px)',
    '  let edge = 1.0 - smoothstep(0.0, 3.0, -dLane);',
    '  lane = lane * (1.0 - 0.10 * edge);',
    '  lane = lane * (1.0 + 0.09 * pool * 0.5);',
    '  col = mix(col, lane, laneCov);',
    '',
    '  // ---- gully walls ----',
    '  let inWallY = step(wallTop, y);',
    '  let distToInner = select(x - (W - wallW), wallW - x, x < W * 0.5);',
    '  // AO on grass / lane next to the walls',
    '  let outside = max(-distToInner, 0.0);',
    '  let aoWall = exp(-outside / 5.0) * 0.20 * step(distToInner, 0.0) * inWallY;',
    '  col = col * (1.0 - aoWall);',
    '  if (distToInner >= -0.0 && inWallY > 0.5) {',
    '    var wc = vec3<f32>(58.0) / 255.0;',
    '    let vg = 1.0 + 0.07 * (1.0 - clamp((y - wallTop) / (H - wallTop), 0.0, 1.0)) - 0.04;',
    '    wc = wc * vg;',
    '    let wnn = vnoise(vec2<f32>(x * 0.8, y * 0.5));',
    '    wc = wc * (1.0 + (wnn - 0.5) * 0.06);',
    '    // bevel: lighter inner edge (2 px), darker outer edge (2 px)',
    '    let lightE = 1.0 - smoothstep(1.5, 2.5, distToInner);',
    '    let outerD = select(W - x, x, x < W * 0.5);',
    '    let darkE = 1.0 - smoothstep(1.5, 2.5, outerD);',
    '    wc = wc * (1.0 + 0.28 * lightE - 0.30 * darkE);',
    '    // top cap of the wall',
    '    let capE = 1.0 - smoothstep(1.0, 2.0, y - wallTop);',
    '    wc = wc * (1.0 + 0.18 * capE);',
    '    col = wc;',
    '  }',
    '',
    '  // ---- popping crease (anti-aliased) ----',
    '  let cdy = (1.0 - abs(y - cy)) / px + 0.5;',
    '  let cdx = (70.0 - abs(dx)) / px + 0.5;',
    '  let cov = clamp(cdy, 0.0, 1.0) * clamp(cdx, 0.0, 1.0) * 0.55;',
    '  col = mix(col, vec3<f32>(1.0), cov);',
    '',
    '  // ---- top-corner vignette, slow shimmer ----',
    '  let ax = clamp(abs(x - W * 0.5) / (W * 0.5), 0.0, 1.0);',
    '  let vig = 0.18 * ax * (1.0 - smoothstep(0.0, H * 0.5, y));',
    '  col = col * (1.0 - vig);',
    '  let sh = (1.0 - u.reduced) * 0.015 * sin(u.time * 0.0006 + x * 0.01 + y * 0.004);',
    '  col = col * (1.0 + sh);',
    '  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);',
    '}'
  ].join('\n');

  var CLEAR = { r: 30 / 255, g: 58 / 255, b: 36 / 255, a: 1 };
  var S = {
    ready: false, name: 'Canvas 2D', canvas: null, G: null, dev: null, gctx: null, fmt: 'bgra8unorm',
    pipe: null, ubuf: null, bind: null, uarr: new Float32Array(12), lost: [], warned: false,
    ctx: { dev: null, fmt: 'bgra8unorm', W: 0, H: 0, dpr: 1, time: 0 }, layers: []
  };

  function logOnce(m) { if (!S.warned) { S.warned = true; try { console.error('[gpu] ' + m); } catch (e) {} } }

  function size() {
    var c = S.canvas, W = c.clientWidth, H = c.clientHeight;
    var dpr = W > 0 ? c.width / W : 1;
    return { W: W, H: H, dpr: dpr };
  }

  function writeUniforms(G, sz) {
    var g = G.geom(sz.W, sz.H), a = S.uarr;
    a[0] = sz.W; a[1] = sz.H; a[2] = sz.dpr; a[3] = G.now || 0; a[4] = G.reduced ? 1 : 0;
    a[5] = g.topY; a[6] = g.batY; a[7] = g.cx; a[8] = g.laneTopW; a[9] = g.laneBotW; a[10] = 0; a[11] = 0;
    S.dev.queue.writeBuffer(S.ubuf, 0, a);
    var c = S.ctx; c.W = sz.W; c.H = sz.H; c.dpr = sz.dpr; c.time = G.now || 0;
  }

  function setupLayers() {
    var arr = api.layers, ps = [];
    arr.forEach(function (l) {
      if (l._lolState) return;
      l._lolState = 'pending';
      var done = function () { l._lolState = 'ok'; };
      var drop = function (e) {
        l._lolState = 'bad'; logOnce('layer ' + (l.name || '?') + ' dropped: ' + (e && e.message || e));
        var i = arr.indexOf(l); if (i >= 0) arr.splice(i, 1);
      };
      try {
        var r = l.setup && l.setup(S.ctx);
        if (r && typeof r.then === 'function') ps.push(r.then(done, drop)); else done();
      } catch (e) { drop(e); }
    });
    return Promise.all(ps);
  }

  function encodeFrame(pass, G) {
    pass.setPipeline(S.pipe); pass.setBindGroup(0, S.bind); pass.draw(3);
    var arr = api.layers.slice();
    for (var i = 0; i < arr.length; i++) {
      var l = arr[i];
      if (l._lolState !== 'ok') continue;
      try { l.encode(pass, S.ctx, G); }
      catch (e) {
        l._lolState = 'bad'; logOnce('layer ' + (l.name || '?') + ' encode failed: ' + (e && e.message || e));
        var k = api.layers.indexOf(l); if (k >= 0) api.layers.splice(k, 1);
      }
    }
  }

  function fail() {
    S.ready = false; S.name = 'Canvas 2D';
  }

  var api = {
    layers: [],
    init: function (canvas, G) {
      try {
        if (!navigator.gpu) return Promise.resolve(false);
        if (/[?&]gpu=0(&|$)/.test(location.search)) return Promise.resolve(false);
        S.canvas = canvas; S.G = G;
        return navigator.gpu.requestAdapter().then(function (ad) {
          if (!ad) throw new Error('no adapter');
          return ad.requestDevice().then(function (dev) {
            S.dev = dev; window.__lolGpuKeep = [ad, dev, navigator.gpu];
            var gctx = canvas.getContext('webgpu');
            if (!gctx) throw new Error('no webgpu context');
            S.gctx = gctx;
            S.fmt = navigator.gpu.getPreferredCanvasFormat();
            gctx.configure({ device: dev, format: S.fmt, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
            dev.lost.then(function (info) {
              var was = S.ready; fail();
              var reason = (info && (info.reason || info.message)) || 'lost';
              S.lost.slice().forEach(function (fn) { try { fn(reason); } catch (e) {} });
              if (!was) return;
            });
            dev.addEventListener('uncapturederror', function (e) { logOnce('uncaptured: ' + (e.error && e.error.message)); });
            var mod = dev.createShaderModule({ code: WGSL });
            return mod.getCompilationInfo().then(function (ci) {
              var er = ci.messages.filter(function (m) { return m.type === 'error'; });
              if (er.length) throw new Error('WGSL: ' + er.map(function (m) { return m.lineNum + ':' + m.message; }).join(' | '));
              S.ubuf = dev.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
              var bgl = dev.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
              S.bind = dev.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: S.ubuf } }] });
              S.pipe = dev.createRenderPipeline({
                layout: dev.createPipelineLayout({ bindGroupLayouts: [bgl] }),
                vertex: { module: mod, entryPoint: 'vs' },
                fragment: { module: mod, entryPoint: 'fs', targets: [{ format: S.fmt }] },
                primitive: { topology: 'triangle-list' }
              });
              var sz = size();
              S.ctx.dev = dev; S.ctx.fmt = S.fmt; S.ctx.W = sz.W; S.ctx.H = sz.H; S.ctx.dpr = sz.dpr; S.ctx.time = G.now || 0;
              return setupLayers();
            });
          });
        }).then(function () {
          S.ready = true; S.name = 'WebGPU'; return true;
        }).catch(function (e) {
          logOnce('init failed: ' + (e && e.message || e)); fail(); return false;
        });
      } catch (e) { fail(); return Promise.resolve(false); }
    },

    resize: function (pxW, pxH, dpr) {
      // canvas.width/height are set by the shell; the swapchain follows the canvas size. Nothing else to rebuild.
    },

    draw: function (G) {
      if (!S.ready) return;
      try {
        S.G = G;
        var sz = size(); if (!(sz.W > 0 && sz.H > 0)) return;
        writeUniforms(G, sz);
        if (api.layers.some(function (l) { return !l._lolState; })) setupLayers();
        var enc = S.dev.createCommandEncoder();
        var pass = enc.beginRenderPass({ colorAttachments: [{ view: S.gctx.getCurrentTexture().createView(), clearValue: CLEAR, loadOp: 'clear', storeOp: 'store' }] });
        encodeFrame(pass, G);
        pass.end();
        S.dev.queue.submit([enc.finish()]);
      } catch (e) { logOnce('draw failed: ' + (e && e.message || e)); }
    },

    onLost: function (fn) { if (typeof fn === 'function') S.lost.push(fn); },

    readback: function () {
      try {
        if (!S.ready) return Promise.resolve({ w: 0, h: 0, nonBg: 0, samples: [], error: 'not ready' });
        var G = S.G, dev = S.dev, sz = size();
        var w = S.canvas.width, h = S.canvas.height;
        writeUniforms(G, sz);
        var tex = dev.createTexture({ size: [w, h], format: S.fmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        var bpr = Math.ceil(w * 4 / 256) * 256;
        var buf = dev.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        var enc = dev.createCommandEncoder();
        var pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), clearValue: CLEAR, loadOp: 'clear', storeOp: 'store' }] });
        encodeFrame(pass, G);
        pass.end();
        enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
        dev.queue.submit([enc.finish()]);
        var bgra = /^bgra/.test(S.fmt);
        return dev.queue.onSubmittedWorkDone().then(function () { return buf.mapAsync(GPUMapMode.READ); }).then(function () {
          var d = new Uint8Array(buf.getMappedRange()), n = 0, x, y, o;
          for (y = 0; y < h; y++) {
            o = y * bpr;
            for (x = 0; x < w; x++, o += 4) {
              var r = bgra ? d[o + 2] : d[o], b = bgra ? d[o] : d[o + 2];
              if (Math.abs(r - 30) > 8 || Math.abs(d[o + 1] - 58) > 8 || Math.abs(b - 36) > 8) n++;
            }
          }
          var g = G.geom(sz.W, sz.H), dpr = sz.dpr;
          var pts = [[g.cx, sz.H * 0.5], [sz.W * 0.15, sz.H * 0.5], [sz.W * 0.025, sz.H * 0.6], [g.cx, g.batY + 36], [g.cx, sz.H * 0.03]];
          var samples = pts.map(function (q) {
            var sx = Math.min(w - 1, Math.max(0, Math.round(q[0] * dpr))), sy = Math.min(h - 1, Math.max(0, Math.round(q[1] * dpr)));
            var k = sy * bpr + sx * 4;
            return bgra ? [d[k + 2], d[k + 1], d[k], d[k + 3]] : [d[k], d[k + 1], d[k + 2], d[k + 3]];
          });
          buf.unmap(); buf.destroy(); tex.destroy();
          return { w: w, h: h, nonBg: n, samples: samples };
        }).catch(function (e) { return { w: w, h: h, nonBg: 0, samples: [], error: String(e && e.message || e) }; });
      } catch (e) { return Promise.resolve({ w: 0, h: 0, nonBg: 0, samples: [], error: String(e && e.message || e) }); }
    }
  };

  Object.defineProperty(api, 'name', { get: function () { return S.name; }, enumerable: true });
  Object.defineProperty(api, 'ready', { get: function () { return S.ready; }, enumerable: true });
  window.LOLParts.gpu = api;
})();
