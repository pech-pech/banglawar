/* gpufx.js - Last Over Lane WebGPU effects layer: ball glow, ball trail, hit bursts.
   Loaded AFTER gpu.js. Stateless: everything is derived from G + G.now each frame. */
(function () {
  var L = window.LOLParts = window.LOLParts || {};

  var WGSL = [
    'struct U {',
    '  a : vec4f,',            // W, H, dpr, now
    '  b : vec4f,',            // t0, originX, originY, kind (0 spark, 1 dust, 2 dark rim)
    '  c : vec4f,',            // r, g, b, durMs
    '  d : vec4f,',            // count, speedScale, sizeScale, peakAlpha
    '  items : array<vec4f, 12>,', // ball mode: x, y, radius, alpha
    '};',
    '@group(0) @binding(0) var<uniform> u : U;',
    'struct VO { @builtin(position) pos : vec4f, @location(0) uv : vec2f, @location(1) col : vec4f };',
    'fn hash(n : u32) -> u32 {',
    '  var x = n * 747796405u + 2891336453u;',
    '  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;',
    '  return (x >> 22u) ^ x;',
    '}',
    'fn h01(n : u32, salt : u32) -> f32 { return f32(hash(n * 7919u + salt * 104729u) & 65535u) / 65535.0; }',
    'fn corner(vi : u32) -> vec2f {',
    '  var c = array<vec2f, 6>(vec2f(-1.0,-1.0), vec2f(1.0,-1.0), vec2f(-1.0,1.0), vec2f(-1.0,1.0), vec2f(1.0,-1.0), vec2f(1.0,1.0));',
    '  return c[vi];',
    '}',
    'fn toClip(px : vec2f) -> vec4f {',
    '  let w = u.a.xy;',
    '  let q = px / w * 2.0 - vec2f(1.0, 1.0);',
    '  return vec4f(q.x, -q.y, 0.0, 1.0);',
    '}',
    '@vertex fn vsBall(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VO {',
    '  let it = u.items[ii];',
    '  let cn = corner(vi);',
    '  var o : VO;',
    '  o.pos = toClip(it.xy + cn * it.z);',
    '  o.uv = cn;',
    '  o.col = vec4f(u.c.rgb, it.w);',
    '  return o;',
    '}',
    '@vertex fn vsBurst(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VO {',
    '  let cn = corner(vi);',
    '  let t = max(0.0, (u.a.w - u.b.x) / 1000.0);',
    '  let life = clamp((u.a.w - u.b.x) / u.c.w, 0.0, 1.0);',
    '  let ang = h01(ii, 1u) * 6.2831853;',
    '  let spd = mix(0.35, 1.0, h01(ii, 2u)) * u.d.y;',
    '  let sz = mix(2.0, 3.0, h01(ii, 3u));',
    '  let isDust = u.b.w > 0.5 && u.b.w < 1.5;',
    '  let isRim = u.b.w > 1.5;',
    '  let tau = select(0.28, 0.45, isDust);',
    '  let dist = spd * tau * (1.0 - exp(-t / tau));',
    '  let ctr = u.b.yz + vec2f(cos(ang), sin(ang)) * dist;',
    '  var half = sz * 1.5 * u.d.z;',
    '  var a = u.d.w * pow(1.0 - life, 1.5);',
    '  if (isDust) {',
    '    half = mix(7.0, 16.0, h01(ii, 4u)) * (0.6 + 0.8 * life) * u.d.z;',
    '    a = u.d.w * (1.0 - life) * (1.0 - life);',
    '  } else {',
    '    half = half * (1.0 - 0.5 * life) + select(0.0, 1.0, isRim);',
    '  }',
    '  var o : VO;',
    '  o.pos = toClip(ctr + cn * half);',
    '  o.uv = cn;',
    '  o.col = vec4f(u.c.rgb, a);',
    '  return o;',
    '}',
    '@fragment fn fs(v : VO) -> @location(0) vec4f {',
    '  let d = length(v.uv);',
    '  let f = smoothstep(1.0, 0.0, d);',
    '  let a = f * f * (3.0 - 2.0 * f) * v.col.a;',
    '  return vec4f(v.col.rgb * a, a);',   // premultiplied
    '}'
  ].join('\n');

  var ADD = {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
  };
  var OVER = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
  };

  var S = null;       // setup state
  var dead = false;
  var ballF = new Float32Array(64);
  var burstF = new Float32Array(64);
  var rimF = new Float32Array(64);

  // colours (sRGB 0..1)
  var GOLD = [1.0, 0.824, 0.247];     // #ffd23f (unused by Perfect now)
  var WHITE = [0.933, 0.953, 0.910];  // #eef3e8
  var PGOLD = [1.0, 0.722, 0.0];     // #ffb800 deeper gold (Perfect, non-additive so it holds on the tan lane)
  var RIM = [0.231, 0.184, 0.078];    // #3b2f14 dark rim
  var DUST = [0.541, 0.353, 0.227];   // #8a5a3a
  var WARM = [1.0, 0.824, 0.478];       // #ffd27a ball halo / trail warm tint

  function fail(e) {
    if (!dead) { dead = true; try { console.warn('gpufx disabled:', e && e.message ? e.message : e); } catch (_) {} }
  }

  function setup(ctx) {
    try {
      var dev = ctx.dev;
      var mod = dev.createShaderModule({ code: WGSL });
      var bgl = dev.createBindGroupLayout({ entries: [{
        binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
      var pl = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
      function mk(entry, blend) {
        return dev.createRenderPipeline({
          layout: pl,
          vertex: { module: mod, entryPoint: entry },
          fragment: { module: mod, entryPoint: 'fs', targets: [{ format: ctx.fmt, blend: blend }] },
          primitive: { topology: 'triangle-list' }
        });
      }
      var uf = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
      var bb = dev.createBuffer({ size: 256, usage: uf });
      var ub = dev.createBuffer({ size: 256, usage: uf });
      var rbuf = dev.createBuffer({ size: 256, usage: uf });
      S = {
        dev: dev,
        ball: mk('vsBall', ADD),
        spark: mk('vsBurst', ADD),
        dust: mk('vsBurst', OVER),
        fill: mk('vsBurst', OVER),
        bb: bb, ub: ub, rb: rbuf,
        rbg: dev.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: rbuf } }] }),
        bbg: dev.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: bb } }] }),
        ubg: dev.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: ub } }] })
      };
    } catch (e) { fail(e); }
  }

  function setHead(f, ctx, now) { f[0] = ctx.W; f[1] = ctx.H; f[2] = ctx.dpr; f[3] = now; }

  function encode(pass, ctx, G) {
    if (dead || !S) return;
    try {
      var cur = G && G.cur;
      if (!cur || cur.tRel == null || cur.tArr == null) return;
      var now = G.now, W = ctx.W, H = ctx.H, q, i;

      if (!cur.res) {
        if (now < cur.tRel) return;
        var tn = now;
        if (cur.stopUntil && now < cur.stopUntil) {          // hit-stop: hold the ball where it was
          var th = cur.tSettle != null ? cur.tSettle : cur.tArr;
          if (th < tn) tn = th;
        }
        var span = cur.tArr - cur.tRel;
        if (!(span > 0)) return;
        var p = (tn - cur.tRel) / span;
        if (p < 0 || p > 1.3) return;
        var f = ballF;
        setHead(f, ctx, now);
        f[8] = WARM[0]; f[9] = WARM[1]; f[10] = WARM[2]; f[11] = 1;
        q = G.path(p, W, H);
        var n = 1;
        f[16] = q[0]; f[17] = q[1]; f[18] = 16; f[19] = 0.45;   // items[0] glow
        if (!G.reduced) {
          for (i = 1; i <= 10; i++) {
            var pk = p - i * 0.012;
            var o = 16 + i * 4;
            if (pk < 0) { f[o + 3] = 0; continue; }
            q = G.path(pk, W, H);
            f[o] = q[0]; f[o + 1] = q[1];
            f[o + 2] = 3 - 1.5 * (i - 1) / 9;
            f[o + 3] = 0.25 * (11 - i) / 10;
          }
          n = 11;
        }
        S.dev.queue.writeBuffer(S.bb, 0, f.buffer, 0, 256);
        pass.setPipeline(S.ball);
        pass.setBindGroup(0, S.bbg);
        pass.draw(6, n);
        return;
      }

      // burst
      if (G.reduced) return;
      var res = cur.res;
      if (cur.tSettle == null) return;
      var el = now - cur.tSettle;
      var col, dur, cnt, spd, sz, pa, dust = 0, pf = 0;
      if (res.out) { col = DUST; dur = 500; cnt = 24; spd = 240; sz = 1; pa = 0.55; dust = 1; }
      else if (res.grade === 'perfect') { col = PGOLD; dur = 450; cnt = 80; spd = 420; sz = 1.4; pa = 1.0; pf = 1; }
      else if (res.grade === 'good') { col = WHITE; dur = 400; cnt = 40; spd = 300; sz = 1; pa = 0.85; }
      else if (res.grade === 'edge') { col = WHITE; dur = 300; cnt = 12; spd = 200; sz = 0.9; pa = 0.7; }
      else return;
      if (el < 0 || el > dur) return;
      q = G.path(1, W, H);
      var b = burstF;
      setHead(b, ctx, now);
      b[4] = cur.tSettle; b[5] = q[0]; b[6] = q[1]; b[7] = dust;
      b[8] = col[0]; b[9] = col[1]; b[10] = col[2]; b[11] = dur;
      b[12] = cnt; b[13] = spd; b[14] = sz; b[15] = pa;
      if (pf) {                                   // two-tone: dark rim pass, then gold fill, both normal-over
        var r = rimF;
        r.set(b);
        r[7] = 2; r[8] = RIM[0]; r[9] = RIM[1]; r[10] = RIM[2]; r[15] = 0.6;
        S.dev.queue.writeBuffer(S.rb, 0, r.buffer, 0, 256);
        S.dev.queue.writeBuffer(S.ub, 0, b.buffer, 0, 256);
        pass.setPipeline(S.fill);
        pass.setBindGroup(0, S.rbg);
        pass.draw(6, cnt);
        pass.setBindGroup(0, S.ubg);
        pass.draw(6, cnt);
        return;
      }
      S.dev.queue.writeBuffer(S.ub, 0, b.buffer, 0, 256);
      pass.setPipeline(dust ? S.dust : S.spark);
      pass.setBindGroup(0, S.ubg);
      pass.draw(6, cnt);
    } catch (e) { fail(e); }
  }

  var layer = { name: 'fx', setup: setup, encode: encode };
  if (L.gpu && L.gpu.layers) L.gpu.layers.push(layer);
  else { L._gpuLayers = (L._gpuLayers || []); L._gpuLayers.push(layer); }
})();
