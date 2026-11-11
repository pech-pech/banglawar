(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Renderer chooser: WebGPU unless forced off / unavailable / failing; Canvas 2D otherwise.
// L-LOL-7 slow-frame fallback (judged against measured cadence, whole session), L-LOL-8 device release + one re-init.

// Slow-frame detector. feed(gapMs) -> true when the GPU should be dropped.
// slow gap = gap > max(34, 1.6 x cadence); cadence = median of the last LONG gaps (adapts to a 30 Hz cap,
// but too slowly to absorb a sustained slowdown); drop when >= half of the last SHORT gaps are slow.
function SlowDetector(o) {
  o = o || {};
  var SHORT = o.short || 120, LONG = o.long || 600, IGNORE = o.ignore || 250;
  var short = [], long = [], slowN = 0, strikes = 0, cad = 0, sinceMed = 0;
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }
  var d = {
    get cadence() { return cad; }, get slowInWindow() { return slowN; }, get strikes() { return strikes; },
    threshold: function () { return Math.max(34, 1.6 * (cad || 16.7)); },
    feed: function (g) {
      if (!(g > 0) || g > IGNORE) return false; // hidden tab, stall, single hitch: not a cadence sample
      long.push(g); if (long.length > LONG) long.shift();
      if (++sinceMed >= 30 || !cad) { sinceMed = 0; if (long.length >= 30) cad = median(long); }
      var slow = cad > 0 && g > d.threshold();
      short.push(slow); if (slow) slowN++;
      if (short.length > SHORT) { if (short.shift()) slowN--; }
      return (short.length >= SHORT && slowN * 2 >= SHORT) || strikes >= 3;
    },
    strike: function () { strikes++; return strikes >= 3; },
    reset: function () { short.length = 0; long.length = 0; slowN = 0; strikes = 0; cad = 0; sinceMed = 0; }
  };
  return d;
}

// Effect scaler (pick 15, 06-art-motion-vfx section 5). Steps 0..5 drop effect tiers only; resolution, ink, hard shadows, the sun grade and every
// danger cue never drop. Steps go DOWN quickly when frames are slow and go back UP only at a stage load (so nothing pops in mid-fight), one step
// per load, and only when the last window held the budget. feed(gapMs) returns the new step (or -1 if unchanged); load(label) is the up-move.
// Numbers are guesses (nothing timed on the Fold): slow = median gap over 20 ms (below 50 fps) or 30% of gaps over 25 ms in a 45-frame window,
// cooldown 60 frames between down-moves; headroom for an up-move = 90th percentile gap at or under 18.5 ms over the last 90 frames.
function EffectScaler(o) {
  o = o || {};
  var WIN = o.win || 45, COOL = o.cool || 60, MAXS = 5, step = 0, gaps = [], hist = [], since = COOL, frame = 0, log = [], peak = 0, downs = 0, ups = 0;
  var SLOW_MED = o.slowMed || 20, SLOW_GAP = o.slowGap || 25, SLOW_FRAC = o.slowFrac || 0.3, HEAD = o.headroom || 18.5;
  function pct(a, p) { var b = a.slice().sort(function (x, y) { return x - y; }); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : 0; }
  function note(dir, from, to, why, extra) {
    var e = { frame: frame, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now())), dir: dir, from: from, to: to, why: why };
    if (extra) for (var k in extra) e[k] = extra[k];
    log.push(e); if (log.length > 200) log.shift();
    try { if (typeof console !== 'undefined' && console.info) console.info('[scaler] ' + dir + ' ' + from + '->' + to + ' ' + why); } catch (e2) {}
  }
  var sc = {
    get step() { return step; }, get log() { return log; }, get peak() { return peak; }, get downs() { return downs; }, get ups() { return ups; },
    set: function (n, why) { var f = step; step = Math.max(0, Math.min(MAXS, n | 0)); since = 0; if (step > peak) peak = step; if (step !== f) note('set', f, step, why || 'forced'); },
    reset: function () { step = 0; gaps.length = 0; hist.length = 0; since = COOL; frame = 0; log.length = 0; peak = 0; downs = ups = 0; },
    feed: function (g, ctx) {
      frame++; since++;
      if (!(g > 0) || g > 250) return -1;   // hidden tab, stall: not a cadence sample
      gaps.push(g); if (gaps.length > WIN) gaps.shift();
      hist.push(g); if (hist.length > 90) hist.shift();
      if (step >= MAXS || since < COOL || gaps.length < WIN) return -1;
      var med = pct(gaps, 0.5), slowN = 0, i; for (i = 0; i < gaps.length; i++) if (gaps[i] > SLOW_GAP) slowN++;
      if (med > SLOW_MED || slowN >= gaps.length * SLOW_FRAC) {
        var from = step; step++; since = 0; downs++; if (step > peak) peak = step; gaps.length = 0;
        note('down', from, step, (ctx && ctx.effective != null ? 'eff ' + ctx.effective + ' ' : '') + 'p50 ' + med.toFixed(1) + ' ms, ' + slowN + '/' + WIN + ' slow', { p50: +med.toFixed(1), p95: +pct(hist, 0.95).toFixed(1), ctx: ctx || null });
        return step;
      }
      return -1;
    },
    load: function (label, ctx) {
      if (step <= 0 || hist.length < 60) { return -1; }
      var p90 = pct(hist, 0.9);
      if (p90 <= HEAD) { var from = step; step--; since = 0; ups++; gaps.length = 0; note('up', from, step, 'stage load ' + (label || '') + ', p90 ' + p90.toFixed(1) + ' ms', { p90: +p90.toFixed(1), ctx: ctx || null }); return step; }
      note('hold', step, step, 'stage load ' + (label || '') + ', p90 ' + p90.toFixed(1) + ' ms over ' + HEAD, { p90: +p90.toFixed(1), ctx: ctx || null });
      return -1;
    }
  };
  return sc;
}

V.Render = {
  SlowDetector: SlowDetector,
  EffectScaler: EffectScaler,
  create: function (opts) {
    opts = opts || {};
    var c2d = opts.c2d, cgpu = opts.cgpu;
    var r2d = V.Render2D.create(c2d);
    // headless test mode: WebGPU renders offscreen (readback only) and Canvas 2D shows the frame; R.offscreen tells
    var offscreen = !!opts.offscreen || (typeof location !== 'undefined' && /[?&]gpu=offscreen(&|$)/.test(location.search));
    var st = { gpu: null, name: 'Canvas 2D', w: 0, h: 0, dpr: 1, fns: [], lastT: 0, list: null, view: null,
      reinitPending: false, reinitUsed: false, reiniting: false, why: '', det: SlowDetector(opts.detector) };
    var R = {}, sc = V.Render._sc || (V.Render._sc = EffectScaler(opts.scaler)), stg = null, FLOOR_2D = 4; // Canvas 2D has no bloom blur and 12 glow sprites: it starts at step 4 (guess)
    function effStep() { return st.name === 'Canvas 2D' ? Math.max(sc.step, FLOOR_2D) : sc.step; }
    function ctxNow() { return { renderer: st.name, effective: effStep(), stage: V.Scene && V.Scene.lastStage, prims: st.list ? st.list.length : 0, particles: V.Scene && V.Scene.stats ? V.Scene.stats.particles : 0 }; }
    // The scaler reads the display cadence: the rAF timestamp delta (the same clock a frame recorder sees), NOT performance.now() inside draw,
    // whose jitter (sim and build time of that frame) read p90 18 to 22 ms at a true 60 fps (SCALER-CHECK bug 1). This loop only records; it draws nothing.
    if (typeof requestAnimationFrame === 'function' && !V.Render._raf) {
      V.Render._raf = true; var lastRaf = 0;
      (function tick(ts) {
        if (lastRaf && ts > lastRaf && sc.feed(ts - lastRaf, ctxNow()) >= 0) applyStep();
        lastRaf = ts; requestAnimationFrame(tick);
      })(0);
    }
    function applyStep() { if (V.Scene && V.Scene.setStep) V.Scene.setStep(effStep(), st.name === 'Canvas 2D'); }

    function show() {
      var g = st.name === 'WebGPU' && !offscreen;
      if (cgpu) cgpu.style.display = g ? '' : 'none';
      if (c2d) c2d.style.display = g ? 'none' : '';
    }
    function emit(why) { st.why = why; show(); applyStep(); st.fns.slice().forEach(function (fn) { try { fn(st.name, why); } catch (e) {} }); }
    function useGpu(b) {
      st.gpu = b; st.name = 'WebGPU'; st.det.reset(); st.lastT = 0;
      b.resize(st.w, st.h, st.dpr);
      b.onLost(function (reason) {
        if (st.gpu !== b) return;
        st.gpu = null; st.name = 'Canvas 2D';
        if (reason !== 'destroyed' && !st.reinitUsed) st.reinitPending = true;
        if (st.list && st.view) { try { r2d.draw(st.list, st.view); } catch (e) {} }
        emit('lost:' + reason);
      });
    }
    function dropGpu(why) {
      var b = st.gpu; st.gpu = null; st.name = 'Canvas 2D';
      if (b) b.destroy(); // L-LOL-8: release the device on any non-loss fallback (quiet)
      emit(why);
    }
    function tryGpu() {
      if (opts.forceCanvas || !cgpu || typeof navigator === 'undefined' || !navigator.gpu || !V.GPU) return Promise.resolve(null);
      return V.GPU.create(cgpu, { offscreen: offscreen });
    }

    Object.defineProperty(R, 'name', { get: function () { return st.name; }, enumerable: true });
    Object.defineProperty(R, 'why', { get: function () { return st.why; } });
    R.resize = function (w, h, dpr) {
      st.w = w; st.h = h; st.dpr = dpr || 1;
      r2d.resize(w, h, st.dpr);
      if (st.gpu) st.gpu.resize(w, h, st.dpr);
      [c2d, cgpu].forEach(function (c) { if (c) { c.style.width = w + 'px'; c.style.height = h + 'px'; } });
    };
    R.draw = function (list, view) {
      st.list = list; st.view = view;
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      // effect scaler: every frame gap feeds it (both renderers); stage loads move it back up
      var ak = effStep() + st.name; if (st.ak !== ak) { st.ak = ak; applyStep(); }   // keeps Scene in step with the renderer (Canvas 2D floor)
      var cx = ctxNow();
      if (V.Scene && V.Scene.roomSeq !== stg) { if (stg !== null && sc.load('#' + V.Scene.roomSeq, cx) >= 0) applyStep(); stg = V.Scene.roomSeq; }
      if (typeof window !== 'undefined' && window.__pv && window.__pv.scaler !== R.scaler) window.__pv.scaler = R.scaler;   // readable from tests and the report
      if (st.gpu) {
        var gap = st.lastT ? now - st.lastT : 0; st.lastT = now;
        if (gap && st.det.feed(gap)) dropGpu('slow');
      }
      if (st.gpu) {
        var ok = false;
        try { ok = st.gpu.draw(list, view); } catch (e) { ok = false; }
        if (ok) { if (offscreen) r2d.draw(list, view); return; }
        if (st.gpu) dropGpu('draw failed');
      }
      r2d.draw(list, view);
      if (st.reinitPending && !st.reiniting && (typeof document === 'undefined' || document.visibilityState !== 'hidden')) {
        st.reinitPending = false; st.reinitUsed = true; st.reiniting = true;
        tryGpu().then(function (b) {
          st.reiniting = false;
          if (b) { useGpu(b); emit('reinit'); }
        });
      }
    };
    R.offscreen = offscreen;
    // scaler read-out: R.step, R.label ("WebGPU step 2"), R.scaler.{step, effective, log, ...}
    Object.defineProperty(R, 'step', { get: function () { return effStep(); } });
    Object.defineProperty(R, 'label', { get: function () { return st.name + ' step ' + effStep(); } });
    R.scaler = { get step() { return sc.step; }, get effective() { return effStep(); }, get log() { return sc.log; }, get peak() { return sc.peak; }, get downs() { return sc.downs; }, get ups() { return sc.ups; },
      get stats() { return V.Scene ? V.Scene.stats : null; }, tiers: V.Scene ? V.Scene.tiers : null, reset: function () { sc.reset(); applyStep(); }, _sc: sc,
      force: function (n, why) { sc.set(n, why); applyStep(); } };
    R.readback = function (o) {
      if (!st.gpu || !st.list) return Promise.resolve({ w: 0, h: 0, nonBg: 0, error: 'renderer is ' + st.name });
      return st.gpu.readback(st.list, V.Scene && V.Scene.PAL ? V.Scene.PAL.ground : null, !!(o && o.png));
    };
    R.onChange = function (fn) { if (typeof fn === 'function') st.fns.push(fn); };
    // shell may call this for a timing-safety event that happened while on the GPU (L-LOL-7 instant strike)
    R.strike = function () { if (st.gpu && st.det.strike()) dropGpu('slow'); };
    R.test = {
      detector: st.det,
      // Time each backend on the same list: ms per frame over n frames (GPU = submit + completion of the queue, offscreen texture; 2D = software raster).
      // Sandbox numbers: SwiftShader and CPU raster, a relative comparison only, not a phone figure.
      timeBackends: function (n, listIn, viewIn) {
        n = n || 60; var L = listIn || st.list, V0 = viewIn || st.view, res = {};
        function stat(a) { var b = a.slice().sort(function (x, y) { return x - y; }); return { n: a.length, mean: +(a.reduce(function (p, q) { return p + q; }, 0) / a.length).toFixed(2), p50: +b[b.length >> 1].toFixed(2), p95: +b[Math.min(b.length - 1, Math.floor(b.length * 0.95))].toFixed(2), max: +b[b.length - 1].toFixed(2) }; }
        var t2 = []; for (var i = 0; i < n; i++) { var a0 = performance.now(); r2d.draw(L, V0); t2.push(performance.now() - a0); }
        res.canvas2d = stat(t2); res.prims = L.length;
        var g = st.gpu; if (!g || !g.fence) return Promise.resolve(res);
        var tg = [], ts = [], k = 0;
        return new Promise(function (ok) {
          (function nxt() {
            if (k++ >= n) { res.webgpuSubmit = stat(ts); if (tg.length) res.webgpu = stat(tg); ok(res); return; }
            var b0 = performance.now(); g.draw(L, V0); ts.push(performance.now() - b0);
            // completion fence (1-pixel copy and map). In this sandbox's headless SwiftShader it can fail to resolve, so it is raced against 1.5 s;
            // then only the CPU submit time is reported (res.webgpuSubmit), and res.fence says so.
            var done = false, tm = setTimeout(function () { if (!done) { done = true; res.fence = 'unavailable'; while (ts.length < n) { var c0 = performance.now(); g.draw(L, V0); ts.push(performance.now() - c0); } res.webgpuSubmit = stat(ts); ok(res); } }, 1500);
            g.fence().then(function () { if (done) return; clearTimeout(tm); tg.push(performance.now() - b0); nxt(); });
          })();
        });
      },
      fakeLoss: function (reason) { if (st.gpu) st.gpu._fakeLoss(reason); },
      destroyDevice: function () { if (st.gpu) st.gpu._device().destroy(); },
      feedGaps: function (arr) { for (var i = 0; i < arr.length; i++) if (st.gpu && st.det.feed(arr[i])) { dropGpu('slow'); break; } return st.name; },
      get reinitUsed() { return st.reinitUsed; }
    };

    return tryGpu().then(function (b) {
      if (b) useGpu(b);
      show();
      return R;
    }, function () { show(); return R; });
  }
};
})();
