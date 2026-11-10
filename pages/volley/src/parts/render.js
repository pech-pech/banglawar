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

V.Render = {
  SlowDetector: SlowDetector,
  create: function (opts) {
    opts = opts || {};
    var c2d = opts.c2d, cgpu = opts.cgpu;
    var r2d = V.Render2D.create(c2d);
    // headless test mode: WebGPU renders offscreen (readback only) and Canvas 2D shows the frame; R.offscreen tells
    var offscreen = !!opts.offscreen || (typeof location !== 'undefined' && /[?&]gpu=offscreen(&|$)/.test(location.search));
    var st = { gpu: null, name: 'Canvas 2D', w: 0, h: 0, dpr: 1, fns: [], lastT: 0, list: null, view: null,
      reinitPending: false, reinitUsed: false, reiniting: false, why: '', det: SlowDetector(opts.detector) };
    var R = {};

    function show() {
      var g = st.name === 'WebGPU' && !offscreen;
      if (cgpu) cgpu.style.display = g ? '' : 'none';
      if (c2d) c2d.style.display = g ? 'none' : '';
    }
    function emit(why) { st.why = why; show(); st.fns.slice().forEach(function (fn) { try { fn(st.name, why); } catch (e) {} }); }
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
    R.readback = function (o) {
      if (!st.gpu || !st.list) return Promise.resolve({ w: 0, h: 0, nonBg: 0, error: 'renderer is ' + st.name });
      return st.gpu.readback(st.list, V.Scene && V.Scene.PAL ? V.Scene.PAL.ground : null, !!(o && o.png));
    };
    R.onChange = function (fn) { if (typeof fn === 'function') st.fns.push(fn); };
    // shell may call this for a timing-safety event that happened while on the GPU (L-LOL-7 instant strike)
    R.strike = function () { if (st.gpu && st.det.strike()) dropGpu('slow'); };
    R.test = {
      detector: st.det,
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
