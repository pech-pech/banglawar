/* Gravity Burn Window - BW.audio
 * free synth, not heard by ear (never auditioned by a human; levels are estimates).
 * API: init, hum(speed0..160), burn(on,throttle), dock, crash, tick, mute(bool), isMuted
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.BW = root.BW || {}; root.BW.audio = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CAP = 12, DOCK_CRASH_RESERVE = 3, MASTER = 0.5;
  var ctx = null, master = null, comp = null, humG = null, humO1 = null, humO2 = null;
  var burnG = null, burnF = null, burnSrc = null, noiseBuf = null;
  var muted = false, inited = false, voices = 0, wired = false, burning = false;
  var seed = 7;
  function rnd() { // mulberry32, own stream
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function now() { return ctx ? ctx.currentTime : 0; }
  function mkNoise() {
    var n = ctx.sampleRate | 0, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    return b;
  }
  // priority: 1 = dock/crash may use reserve; 0 = normal voices stop at CAP-reserve
  function take(pri) {
    var lim = pri ? CAP : CAP - DOCK_CRASH_RESERVE;
    if (!ctx || voices >= lim) return false;
    voices++; return true;
  }
  function release() { if (voices > 0) voices--; }
  function voice(pri, dur, build) {
    if (!inited || muted || !take(pri)) return;
    var t = now(), nodes = [], done = false;
    function end() { if (done) return; done = true; release(); }
    try {
      var last = build(t, nodes);
      last.onended = end;
      setTimeout(end, (dur + 0.5) * 1000);
    } catch (e) { end(); }
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function setup() {
    if (inited) return;
    var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
             (typeof globalThis !== 'undefined' && globalThis.AudioContext);
    if (!AC) return;
    try {
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER;
      master.connect(comp); comp.connect(ctx.destination);
      humG = ctx.createGain(); humG.gain.value = 0.0001;
      humO1 = ctx.createOscillator(); humO1.type = 'sine'; humO1.frequency.value = 55;
      humO2 = ctx.createOscillator(); humO2.type = 'triangle'; humO2.frequency.value = 110;
      humO1.connect(humG); humO2.connect(humG); humG.connect(master);
      humO1.start(); humO2.start();
      noiseBuf = mkNoise();
      burnSrc = ctx.createBufferSource(); burnSrc.buffer = noiseBuf; burnSrc.loop = true;
      burnF = ctx.createBiquadFilter(); burnF.type = 'bandpass'; burnF.frequency.value = 500; burnF.Q.value = 0.8;
      burnG = ctx.createGain(); burnG.gain.value = 0;
      burnSrc.connect(burnF); burnF.connect(burnG); burnG.connect(master);
      burnSrc.start();
      inited = true;
    } catch (e) { inited = false; }
  }
  function resume() {
    if (!ctx || !ctx.resume) return;
    try {
      var p = ctx.resume();
      if (p && p.then) p.then(function () {}, function () {}); // sound dropped only until resume resolves
    } catch (e) {}
  }
  function onGesture() { setup(); resume(); }
  function wire() {
    if (wired || typeof document === 'undefined') return;
    wired = true;
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, false);
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) { try { ctx.suspend(); } catch (e) {} }
      else if (inited) resume();
    });
  }
  var api = {
    init: function () { wire(); },
    hum: function (speed) {
      if (!inited) return;
      var s = Math.max(0, Math.min(160, +speed || 0)) / 160, t = now();
      humO1.frequency.setTargetAtTime(55 + 110 * s, t, 0.15);
      humO2.frequency.setTargetAtTime(110 + 220 * s, t, 0.15);
      humG.gain.setTargetAtTime(muted ? 0.0001 : 0.03 + 0.12 * s, t, 0.2);
    },
    burn: function (on, throttle) {
      if (!inited) return;
      var th = Math.max(0, Math.min(1, throttle == null ? 1 : +throttle)), t = now();
      burning = !!on;
      burnG.gain.setTargetAtTime(on ? 0.05 + 0.2 * th : 0, t, on ? 0.04 : 0.1);
      burnF.frequency.setTargetAtTime(350 + 900 * th, t, 0.08);
    },
    dock: function () {
      voice(1, 1.2, function (t) {
        var last;
        [[392, 0], [587.33, 0.16]].forEach(function (n) {
          var g = ctx.createGain(), o = ctx.createOscillator(), o2 = ctx.createOscillator();
          o.type = 'sawtooth'; o2.type = 'triangle';
          o.frequency.value = n[0]; o2.frequency.value = n[0] * 2;
          var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
          o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
          env(g, t + n[1], 0.03, 0.12, 0.9);
          o.start(t + n[1]); o2.start(t + n[1]); o.stop(t + n[1] + 1); o2.stop(t + n[1] + 1);
          last = o;
        });
        return last;
      });
    },
    crash: function () {
      voice(1, 0.8, function (t) {
        var s = ctx.createBufferSource(); s.buffer = noiseBuf;
        s.loopStart = rnd() * 0.5;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
        var g = ctx.createGain(); env(g, t, 0.005, 0.5, 0.6);
        s.connect(f); f.connect(g); g.connect(master);
        s.start(t, rnd() * 0.5); s.stop(t + 0.7);
        return s;
      });
    },
    tick: function () {
      voice(0, 0.05, function (t) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 1400 + rnd() * 200;
        env(g, t, 0.001, 0.04, 0.03);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.05);
        return o;
      });
    },
    mute: function (m) {
      muted = !!m;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, now(), 0.02);
    },
    isMuted: function () { return muted; },
    _voices: function () { return voices; },
    _peakEstimate: function () { // worst case sum of simultaneous sources, pre-compressor, x master
      return MASTER * (0.15 + 0.25 + 12 * 0.0 + 0.5 * 0.9 + 0.24 * 0.9 + 0.04 * 3);
    }
  };
  return api;
});
