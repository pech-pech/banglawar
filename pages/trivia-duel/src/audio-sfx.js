// audio-sfx.js - Trivia Duel SFX: 14 synth cues registered on TD.audio.registerCue. Own synth, no samples. Levels are [guess].
var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
(function () {
  'use strict';
  var FLOOR = 0.0001, PEAK = 0.3;

  function env(c, t, dur, pk, att) {
    var g = c.ctx.createGain(), p = g.gain;
    pk = Math.max(FLOOR * 2, Math.min(PEAK, pk)); att = Math.min(att || 0.004, dur * 0.5);
    p.setValueAtTime(FLOOR, t); p.exponentialRampToValueAtTime(pk, t + att); p.exponentialRampToValueAtTime(FLOOR, t + dur);
    return g;
  }
  function out(c, src, mid, g) {
    var n = src;
    if (mid) { n.connect(mid); n = mid; }
    n.connect(g); g.connect(c.sfxBus);
  }
  function tone(c, nodes, type, f0, f1, t, dur, pk, o) {
    o = o || {};
    var s = c.ctx.createOscillator(), g = env(c, t, dur, pk, o.att), f = null;
    s.type = type; s.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) s.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (o.lp) { f = c.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; }
    out(c, s, f, g); s.start(t); s.stop(t + dur + 0.03); nodes.push(s);
  }
  function burst(c, nodes, ft, f0, f1, t, dur, pk, o) {
    o = o || {};
    var s = c.ctx.createBufferSource(), f = c.ctx.createBiquadFilter(), g = env(c, t, dur, pk, o.att);
    s.buffer = c.noise(); s.loop = true; f.type = ft; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    out(c, s, f, g); s.start(t); s.stop(t + dur + 0.03); nodes.push(s);
  }
  function pv(c) { return 1 + (c.rnd() * 2 - 1) * 0.03; }

  var C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, G6 = 1568, E6 = 1318.5;

  var R = {
    tap: [3, 0.06, function (c, t) { var n = [], p = pv(c); tone(c, n, 'sine', 900 * p, 600 * p, t, 0.05, 0.12); return n; }],
    select: [3, 0.1, function (c, t) {
      var n = [], p = pv(c);
      tone(c, n, 'triangle', 420 * p, 300 * p, t, 0.08, 0.16, { lp: 1800 });
      burst(c, n, 'bandpass', 1400, 1400, t, 0.03, 0.08, { q: 2 });
      return n;
    }],
    qstart: [2, 0.35, function (c, t) {
      var n = [], p = pv(c);
      burst(c, n, 'bandpass', 500 * p, 2600 * p, t, 0.22, 0.12, { q: 1.2, att: 0.05 });
      tone(c, n, 'sine', G5 * p, G5 * p, t + 0.14, 0.2, 0.1);
      tone(c, n, 'sine', C6 * p, C6 * p, t + 0.18, 0.16, 0.07);
      return n;
    }],
    correct: [3, 0.5, function (c, t) {
      var n = [];
      tone(c, n, 'sine', C6, C6, t, 0.3, 0.2); tone(c, n, 'sine', C6 * 2, C6 * 2, t, 0.12, 0.04);
      tone(c, n, 'sine', G6, G6, t + 0.12, 0.38, 0.2); tone(c, n, 'sine', G6 * 1.5, G6 * 1.5, t + 0.12, 0.12, 0.03);
      return n;
    }],
    wrong: [3, 0.4, function (c, t) {
      var n = [];
      tone(c, n, 'sine', 160, 70, t, 0.18, 0.28);
      burst(c, n, 'lowpass', 300, 300, t, 0.05, 0.1);
      tone(c, n, 'triangle', 330, 330, t + 0.1, 0.12, 0.12, { lp: 1500 });
      tone(c, n, 'triangle', 311, 311, t + 0.22, 0.17, 0.12, { lp: 1500 });
      return n;
    }],
    timeout: [3, 0.5, function (c, t) {
      var n = [];
      tone(c, n, 'sine', 196, 190, t, 0.48, 0.26, { att: 0.01 });
      tone(c, n, 'sine', 196 * 2.4, 196 * 2.4, t, 0.3, 0.06);
      tone(c, n, 'sine', 98, 96, t, 0.45, 0.14);
      return n;
    }],
    tick: [1, 0.08, function (c, t, o) {
      var n = [], u = !!(o && o.urgent);
      tone(c, n, 'square', u ? 1500 : 1000, u ? 1100 : 750, t, 0.03, u ? 0.1 : 0.05, { lp: 2500 });
      burst(c, n, 'bandpass', u ? 2200 : 1600, u ? 2200 : 1600, t, 0.02, u ? 0.06 : 0.03, { q: 2 });
      return n;
    }],
    rivalSeal: [1, 0.2, function (c, t) {
      var n = [];
      burst(c, n, 'lowpass', 900, 400, t, 0.06, 0.18);
      tone(c, n, 'sine', 140, 80, t, 0.15, 0.22);
      return n;
    }],
    wager: [2, 0.5, function (c, t) {
      var n = [], i, f;
      for (i = 0; i < 4; i++) {
        f = C5 * Math.pow(2, i * 0.25 + 0.0);
        tone(c, n, 'sine', f, f * 1.01, t + i * 0.06, 0.26, 0.08);
      }
      burst(c, n, 'bandpass', 1200, 3200, t, 0.35, 0.05, { q: 1.5, att: 0.08 });
      return n;
    }],
    wagerX2: [3, 0.5, function (c, t) {
      var n = [], i, a = [C5, E5, G5, C6, E6, G6], f;
      for (i = 0; i < 3; i++) tone(c, n, 'sine', C5 * (1 + i * 0.2), C5 * (1.15 + i * 0.2), t + i * 0.04, 0.3, 0.07);
      for (i = 0; i < a.length; i++) { f = a[i]; tone(c, n, 'triangle', f, f, t + 0.1 + i * 0.05, 0.16, 0.1, { lp: 3500 }); }
      return n;
    }],
    vs: [2, 0.8, function (c, t) {
      var n = [];
      tone(c, n, 'sine', 120, 55, t, 0.22, 0.3); burst(c, n, 'lowpass', 500, 200, t, 0.1, 0.16);
      tone(c, n, 'sine', 100, 45, t + 0.22, 0.3, 0.3); burst(c, n, 'lowpass', 500, 200, t + 0.22, 0.1, 0.16);
      tone(c, n, 'triangle', 200, 900, t + 0.35, 0.42, 0.1, { lp: 3000, att: 0.15 });
      burst(c, n, 'bandpass', 300, 2800, t + 0.35, 0.42, 0.06, { q: 1, att: 0.2 });
      return n;
    }],
    win: [3, 1.6, function (c, t) {
      var n = [], a = [C5, E5, G5, C6], i, d, last;
      for (i = 0; i < a.length; i++) {
        last = i === a.length - 1;
        d = last ? 0.9 : 0.2;
        tone(c, n, 'triangle', a[i], a[i], t + i * 0.16, d, 0.2, { lp: 3800 });
        tone(c, n, 'sine', a[i] * 2, a[i] * 2, t + i * 0.16, d * 0.6, 0.05);
      }
      tone(c, n, 'sine', G5, G5, t + 0.64, 0.9, 0.08);
      return n;
    }],
    lose: [3, 1.2, function (c, t) {
      var n = [], a = [440, 392, 329.63], i;
      for (i = 0; i < a.length; i++) tone(c, n, 'triangle', a[i], a[i], t + i * 0.3, i === 2 ? 0.55 : 0.32, 0.17, { lp: 1800, att: 0.02 });
      return n;
    }],
    draw: [3, 1.0, function (c, t) {
      var n = [];
      tone(c, n, 'triangle', 392, 392, t, 0.45, 0.16, { lp: 2400, att: 0.02 });
      tone(c, n, 'triangle', 392, 392, t + 0.42, 0.5, 0.16, { lp: 2400, att: 0.02 });
      tone(c, n, 'sine', 196, 196, t, 0.9, 0.08);
      return n;
    }],
    pointsUp: [1, 0.2, function (c, t, o) {
      var n = [], k = o && o.big ? 1.5 : 1;
      tone(c, n, 'square', 1200 * k, 1200 * k, t, 0.05, 0.07, { lp: 3000 });
      tone(c, n, 'square', 1600 * k, 1600 * k, t + 0.05, 0.1, 0.07, { lp: 3000 });
      return n;
    }]
  };

  // contract text says 14 but enumerates 15 names; all enumerated names are registered
  var api = { names: Object.keys(R) };
  TD.sfx = api;

  try {
    if (TD.audio && typeof TD.audio.registerCue === 'function') {
      api.names.forEach(function (name) {
        var r = R[name];
        TD.audio.registerCue(name, r[0], r[1], function (c, t, opts) {
          try { return r[2](c, t, opts || {}); } catch (e) { return []; }
        });
      });
    }
  } catch (e) { /* silent */ }

  if (typeof module !== 'undefined') module.exports = api;
})();
