/* Gravity Burn Window - BW.audio
 * free WebAudio synth, not heard by ear (never auditioned by a human; levels are estimates).
 * API: init, hum(speed0..160, nearBodies0..1), burn(on,throttle), dock, crash, tick,
 *      low_fuel, medal(level1..3), mute(bool), isMuted
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.BW = root.BW || {}; root.BW.audio = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CAP = 12, DOCK_CRASH_RESERVE = 3, MASTER = 0.5, FLOOR = 0.0001;
  var ctx = null, master = null, comp = null;
  var humG = null, humO1 = null, humO2 = null, humO3 = null, humF = null, humBeatG = null, humLfo = null, humLfoG = null;
  var burnG = null, burnF = null, burnSrc = null, rumbleG = null, rumbleO = null, rumbleF = null, noiseBuf = null;
  var muted = false, inited = false, voices = 0, wired = false, burning = false;
  var seed = 7, cur = null, lastSpeed = -1, lastNear = -1;
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
  // build(t) returns the node that ends last; it is the voice's onended hook.
  function voice(pri, dur, build) {
    if (!inited || muted || !take(pri)) return;
    var t = now(), done = false, nodes = [];
    function end() {
      if (done) return; done = true; release();
      for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) {} }
    }
    try {
      cur = nodes;
      var last = build(t);
      cur = null;
      last.onended = end;
      setTimeout(end, (dur + 0.5) * 1000);
    } catch (e) { cur = null; end(); }
  }
  function vg() { var g = ctx.createGain(); if (cur) cur.push(g); return g; }
  function vf() { var f = ctx.createBiquadFilter(); if (cur) cur.push(f); return f; }
  // attack, exponential decay to 0.0001 (no click at the end)
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + a + d);
  }
  function osc(type, freq, t0, t1, dest) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    o.connect(dest); o.start(t0); o.stop(t1);
    return o;
  }
  function noiseSrc(t0, t1, dest) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.connect(dest); s.start(t0, rnd() * 0.5); s.stop(t1);
    return s;
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
      noiseBuf = mkNoise();
      // pad hum: sine + triangle fifth-ish, lowpassed, slow tremolo, plus a detuned "beat" partner
      humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 500; humF.Q.value = 0.5;
      humG = ctx.createGain(); humG.gain.value = FLOOR;
      humO1 = ctx.createOscillator(); humO1.type = 'sine'; humO1.frequency.value = 55;
      humO2 = ctx.createOscillator(); humO2.type = 'triangle'; humO2.frequency.value = 82.5;
      humO3 = ctx.createOscillator(); humO3.type = 'sine'; humO3.frequency.value = 85;
      humBeatG = ctx.createGain(); humBeatG.gain.value = 0;
      humO1.connect(humF); humO2.connect(humF); humO3.connect(humBeatG); humBeatG.connect(humF);
      humF.connect(humG); humG.connect(master);
      humLfo = ctx.createOscillator(); humLfo.type = 'sine'; humLfo.frequency.value = 0.18;
      humLfoG = ctx.createGain(); humLfoG.gain.value = 0.015;
      humLfo.connect(humLfoG); humLfoG.connect(humG.gain);
      humO1.start(); humO2.start(); humO3.start(); humLfo.start();
      // burn: bandpassed noise whoosh + low rumble
      burnSrc = ctx.createBufferSource(); burnSrc.buffer = noiseBuf; burnSrc.loop = true;
      burnF = ctx.createBiquadFilter(); burnF.type = 'bandpass'; burnF.frequency.value = 500; burnF.Q.value = 0.8;
      burnG = ctx.createGain(); burnG.gain.value = 0;
      burnSrc.connect(burnF); burnF.connect(burnG); burnG.connect(master);
      burnSrc.start();
      rumbleO = ctx.createOscillator(); rumbleO.type = 'sawtooth'; rumbleO.frequency.value = 45;
      rumbleF = ctx.createBiquadFilter(); rumbleF.type = 'lowpass'; rumbleF.frequency.value = 120;
      rumbleG = ctx.createGain(); rumbleG.gain.value = 0;
      rumbleO.connect(rumbleF); rumbleF.connect(rumbleG); rumbleG.connect(master);
      rumbleO.start();
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
  function thump(t) {
    voice(0, 0.3, function (t0) {
      var g = vg(); g.connect(master);
      env(g, t0, 0.004, 0.25, 0.22);
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + 0.2);
      o.connect(g); o.start(t0); o.stop(t0 + 0.3);
      return o;
    });
  }
  var api = {
    init: function () { wire(); },
    // speed 0..160; near 0..1 = proximity to a body (optional) adds a slow dissonant beat
    hum: function (speed, near) {
      if (!inited) return;
      var s = Math.max(0, Math.min(160, +speed || 0)) / 160, t = now();
      var n = Math.max(0, Math.min(1, +near || 0));
      if (s === lastSpeed && n === lastNear && !muted) return;
      lastSpeed = s; lastNear = n;
      var f1 = 55 + 110 * s;
      humO1.frequency.setTargetAtTime(f1, t, 0.25);
      humO2.frequency.setTargetAtTime(f1 * 1.5, t, 0.25);
      // minor-second-ish partner, offset 1..6 Hz so the beat quickens as bodies get close
      humO3.frequency.setTargetAtTime(f1 * 1.5 + 1 + 5 * n, t, 0.25);
      humBeatG.gain.setTargetAtTime(muted ? 0 : 0.7 * n, t, 0.4);
      humF.frequency.setTargetAtTime(400 + 700 * s, t, 0.3);
      humG.gain.setTargetAtTime(muted ? FLOOR : 0.03 + 0.09 * s, t, 0.3);
    },
    burn: function (on, throttle) {
      if (!inited) return;
      var th = Math.max(0, Math.min(1, throttle == null ? 1 : +throttle)), t = now();
      var was = burning;
      burning = !!on;
      burnG.gain.setTargetAtTime(on ? 0.05 + 0.15 * th : 0, t, on ? 0.04 : 0.12);
      burnF.frequency.setTargetAtTime(350 + 1100 * th, t, 0.08);
      burnF.Q.setTargetAtTime(0.7 + 1.2 * th, t, 0.08);
      rumbleG.gain.setTargetAtTime(on ? 0.03 + 0.05 * th : 0, t, on ? 0.06 : 0.15);
      rumbleO.frequency.setTargetAtTime(38 + 40 * th, t, 0.12);
      rumbleF.frequency.setTargetAtTime(90 + 120 * th, t, 0.12);
      if (on && !was) thump(t);
    },
    // rising 3-note chime with a shimmer tail
    dock: function () {
      voice(1, 1.8, function (t) {
        var last, notes = [[523.25, 0], [659.25, 0.13], [783.99, 0.26]];
        notes.forEach(function (n, i) {
          var g = vg(); g.connect(master);
          env(g, t + n[1], 0.01, 0.08, 0.7);
          var e = t + n[1] + 0.8;
          osc('sine', n[0], t + n[1], e, g);
          last = osc('triangle', n[0] * 2, t + n[1], e, g);
        });
        // shimmer: two slightly detuned high partials that fade slowly
        var sg = vg(); sg.connect(master);
        env(sg, t + 0.26, 0.05, 0.035, 1.3);
        osc('sine', 1567.98, t + 0.26, t + 1.7, sg);
        last = osc('sine', 1567.98 * 1.004, t + 0.26, t + 1.7, sg);
        return last;
      });
    },
    // low boom + noise crackle
    crash: function () {
      voice(1, 1.1, function (t) {
        var bg = vg(); bg.connect(master);
        env(bg, t, 0.004, 0.4, 0.8);
        var o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(90, t);
        o.frequency.exponentialRampToValueAtTime(30, t + 0.7);
        o.connect(bg); o.start(t); o.stop(t + 0.9);
        var f = vf(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.6;
        var cg = vg(); cg.connect(master); f.connect(cg);
        // crackle: a few short seeded noise bursts
        cg.gain.setValueAtTime(FLOOR, t);
        for (var i = 0; i < 6; i++) {
          var bt = t + 0.02 + i * 0.09 + rnd() * 0.02, pk = 0.2 * (1 - i / 7) * (0.6 + rnd() * 0.4);
          cg.gain.setValueAtTime(FLOOR, bt);
          cg.gain.linearRampToValueAtTime(pk, bt + 0.004);
          cg.gain.exponentialRampToValueAtTime(FLOOR, bt + 0.05);
        }
        noiseSrc(t, t + 0.6, f);
        return o; // boom stops last (t+0.9)
      });
    },
    // short crisp click
    tick: function () {
      voice(0, 0.05, function (t) {
        var g = vg(); g.connect(master);
        env(g, t, 0.001, 0.03, 0.025);
        return osc('square', 1800 + rnd() * 200, t, t + 0.04, g);
      });
    },
    // optional: two soft beeps
    low_fuel: function () {
      voice(0, 0.5, function (t) {
        var last;
        [0, 0.22].forEach(function (d) {
          var g = vg(); g.connect(master);
          env(g, t + d, 0.01, 0.06, 0.13);
          last = osc('sine', 660, t + d, t + d + 0.2, g);
        });
        return last;
      });
    },
    // optional: medal(1..3) arpeggio; more notes for higher medals
    medal: function (level) {
      var lv = Math.max(1, Math.min(3, Math.round(+level || 1)));
      var scale = [523.25, 659.25, 783.99, 1046.5];
      var n = lv + 1;
      voice(0, 0.3 * n + 1, function (t) {
        var last;
        for (var i = 0; i < n; i++) {
          var st = t + i * 0.11, g = vg(); g.connect(master);
          env(g, st, 0.01, 0.08, 0.5 + (i === n - 1 ? 0.4 : 0));
          osc('triangle', scale[i], st, st + 1.0, g);
          last = osc('sine', scale[i] * 2, st, st + 1.0, g);
        }
        return last;
      });
    },
    mute: function (m) {
      muted = !!m;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, now(), 0.02);
    },
    suspend: function () { if (ctx) { try { ctx.suspend(); } catch (e) {} } },
    resume: function () { resume(); },
    isMuted: function () { return muted; },
    _voices: function () { return voices; },
    // worst case plausible simultaneous sum, pre-compressor, x master
    _peakEstimate: function () {
      // honest sums of source amplitudes: hum ~0.32, burn ~0.25, dock ~0.6, thump 0.25, ticks 0.09
      // (crash ~0.6 does not overlap dock in play)
      return MASTER * (0.32 + 0.25 + 0.6 + 0.25 + 0.09);
    }
  };
  return api;
});
