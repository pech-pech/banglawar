// audio.js - PL.audio: WebAudio SFX synth + buses (master -> sfxBus | duck -> musicBus). No files, no network.
// Music engine lives in music.js (PL.music); this file delegates playMusic/sting to it. No-op when AudioContext is absent.
(function (G) {
  'use strict';
  var PL = G.PL = G.PL || {};
  var MAXG = 0.15, MAXV = 8, FLOOR = 0.0001;
  var ctx = null, master = null, sfxBus = null, musicBus = null, musicDuck = null, noiseBuf = null;
  var muted = false, unlocked = false, tried = false, hidden = false, visHooked = false;
  var sfxGain = 0.8, musicGain = 0.5, musicOn = true, pitchVar = 0.04, duckDb = 8, vibOn = true;
  var voices = [], lastRide = -1, seedv = 0x5eed1234;
  // own deterministic RNG (mulberry32); never Math.random, never the game RNG
  function rnd() {
    seedv = (seedv + 0x6d2b79f5) | 0;
    var t = Math.imul(seedv ^ (seedv >>> 15), 1 | seedv);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function clamp(v, a, b) { v = +v; if (!(v === v)) v = a; return v < a ? a : v > b ? b : v; }
  function Ctor() { return G.AudioContext || G.webkitAudioContext || null; }
  function ensure() {
    if (ctx) return ctx;
    if (tried) return null;
    var C = Ctor(); if (!C) return null;
    tried = true;
    try {
      ctx = new C(); master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain(); musicDuck = ctx.createGain();
      master.gain.value = muted ? 0 : MAXG; sfxBus.gain.value = sfxGain; musicBus.gain.value = musicOn ? musicGain : 0; musicDuck.gain.value = 1;
      sfxBus.connect(master); musicDuck.connect(musicBus); musicBus.connect(master); master.connect(ctx.destination);
    } catch (e) { ctx = master = sfxBus = musicBus = musicDuck = null; }
    return ctx;
  }
  function resume() {
    try { if (ctx && ctx.state === 'suspended' && ctx.resume) { var pr = ctx.resume(); if (pr && pr.catch) pr.catch(function () {}); } } catch (e) {}
  }
  // unlock: call on the first touchstart/pointerdown/keydown. Safe to call every time.
  function unlock() {
    if (!Ctor()) return;
    if (!ensure()) return;
    unlocked = true;
    if (!hidden) resume();
    if (!visHooked && G.document && G.document.addEventListener) {
      visHooked = true;
      try { G.document.addEventListener('visibilitychange', function () { onVisibility(!!G.document.hidden); }); } catch (e) {}
    }
    if (PL.music && PL.music.onUnlock) { try { PL.music.onUnlock(); } catch (e) {} }
  }
  function onVisibility(h) {
    hidden = !!h;
    if (!ctx || !unlocked) return;
    try {
      if (hidden) { if (ctx.suspend) { var p = ctx.suspend(); if (p && p.catch) p.catch(function () {}); } } else resume();
    } catch (e) {}
  }
  function live() { return !!(ctx && unlocked && !muted && sfxGain > 0); }
  function canMusic() { return !!(ctx && unlocked && !muted && musicOn && musicGain > 0); }
  function getNoise() {
    if (noiseBuf || !ctx) return noiseBuf;
    var n = Math.floor(ctx.sampleRate * 0.5) || 22050, b = ctx.createBuffer(1, n, ctx.sampleRate || 44100), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    noiseBuf = b; return b;
  }
  // ---- voices: cap 8, priority 1 (keep) .. 3 (drop first)
  function admit(pri, dur) {
    var t = ctx.currentTime, i, a = [];
    for (i = 0; i < voices.length; i++) if (voices[i].end > t) a.push(voices[i]);
    voices = a;
    if (pri >= 3 && a.length > 6) return null;
    if (a.length >= MAXV) {
      var vi = -1;
      for (i = 0; i < a.length; i++) if (vi < 0 || a[i].pri > a[vi].pri || (a[i].pri === a[vi].pri && a[i].t0 < a[vi].t0)) vi = i;
      if (a[vi].pri < pri) return null;
      kill(a[vi]); voices.splice(voices.indexOf(a[vi]), 1);
    }
    var v = { pri: pri, t0: t, end: t + dur + 0.05, nodes: [] };
    voices.push(v); return v;
  }
  function kill(v) { for (var i = 0; i < v.nodes.length; i++) { try { v.nodes[i].stop(); } catch (e) {} } v.end = 0; }
  function envg(t, dur, pk, att) {
    var g = ctx.createGain(), p = g.gain;
    pk = Math.max(FLOOR * 2, Math.min(1, pk)); att = att || 0.003;
    p.setValueAtTime(FLOOR, t); p.exponentialRampToValueAtTime(pk, t + att); p.exponentialRampToValueAtTime(FLOOR, t + dur);
    return g;
  }
  function route(src, mid, g, o) {
    var n = src; if (mid) { n.connect(mid); n = mid; }
    n.connect(g); n = g;
    if (o && o.pan && ctx.createStereoPanner) { var pn = ctx.createStereoPanner(); pn.pan.value = o.pan; n.connect(pn); n = pn; }
    n.connect(sfxBus);
  }
  // tone: f0 -> f1 over dur at start time t. o: {att, lp, pan, det}
  function tone(v, type, f0, f1, t, dur, pk, o) {
    o = o || {};
    var s = ctx.createOscillator(), g = envg(t, dur, pk, o.att), f = null;
    s.type = type; s.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) s.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (o.det) s.detune.value = o.det;
    if (o.lp) { f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; }
    route(s, f, g, o); s.start(t); s.stop(t + dur + 0.03); v.nodes.push(s);
  }
  // burst: filtered noise. ft: filter type, q ignored when absent
  function burst(v, ft, f0, f1, t, dur, pk, o) {
    o = o || {};
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = envg(t, dur, pk, o.att);
    s.buffer = getNoise(); s.loop = true; f.type = ft; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    route(s, f, g, o); s.start(t); s.stop(t + dur + 0.03); v.nodes.push(s);
  }
  function pv() { return 1 + (rnd() * 2 - 1) * pitchVar; }
  var DIRF = { 0: 'flipUp', 1: 'flipRight', 2: 'flipDown', 3: 'flipLeft' };
  var STING = { clear: 'clear', medalBronze: 'bronze', medalSilver: 'silver', medalGold: 'gold', medalPlumb: 'plumb' };
  // recipes: [priority, duration, fn(voice, t, state)]
  var R = {
    flipUp: [1, 0.16, function (v, t) { var p = pv(); burst(v, 'bandpass', 400 * p, 2400 * p, t, 0.14, 0.6, { q: 1.5 }); tone(v, 'sine', 1568 * p, 1568 * p, t + 0.02, 0.11, 0.22); }],
    flipDown: [1, 0.16, function (v, t) { var p = pv(); burst(v, 'bandpass', 2400 * p, 400 * p, t, 0.14, 0.6, { q: 1.5 }); tone(v, 'sine', 1175 * p, 1175 * p, t + 0.02, 0.11, 0.22); }],
    flipLeft: [1, 0.14, function (v, t) { var p = pv(); burst(v, 'bandpass', 800 * p, 1600 * p, t, 0.12, 0.6, { q: 1.5, pan: -0.4 }); tone(v, 'sine', 1318 * p, 1318 * p, t + 0.02, 0.1, 0.22, { pan: -0.4 }); }],
    flipRight: [1, 0.14, function (v, t) { var p = pv(); burst(v, 'bandpass', 800 * p, 1600 * p, t, 0.12, 0.6, { q: 1.5, pan: 0.4 }); tone(v, 'sine', 1318 * p, 1318 * p, t + 0.02, 0.1, 0.22, { pan: 0.4 }); }],
    dive: [1, 0.22, function (v, t) { tone(v, 'sine', 900, 180, t, 0.2, 0.4); burst(v, 'lowpass', 300, 300, t, 0.08, 0.5); }],
    land: [2, 0.14, function (v, t, st) {
      var s = (st && +st.lastLandSpeed) || 0, k = Math.max(0.15, Math.min(1, s / 900)), p = pv();
      tone(v, 'triangle', 140 * p, 60 * p, t, 0.12, k); burst(v, 'highpass', 1200, 1200, t, 0.005, 0.5 * k);
    }],
    ride: [3, 0.08, function (v, t) { var p = pv(); tone(v, 'sine', 220 * p, 260 * p, t, 0.06, 0.2); }],
    charge: [2, 0.1, function (v, t) { tone(v, 'sine', 1319, 880, t, 0.08, 0.35); }],
    noCharge: [2, 0.12, function (v, t) { tone(v, 'triangle', 180, 120, t, 0.1, 0.5, { lp: 600 }); }],
    refill: [2, 0.27, function (v, t) { tone(v, 'sine', 1047, 1047, t, 0.2, 0.3); tone(v, 'sine', 1568, 1568, t + 0.04, 0.2, 0.3); }],
    crumble: [2, 0.32, function (v, t) {
      burst(v, 'highpass', 3000, 3000, t, 0.12, 0.5);
      for (var i = 0; i < 3; i++) { var f = 2000 + rnd() * 2000; tone(v, 'sine', f, f, t + 0.04 + i * 0.05, 0.14, 0.15); }
    }],
    gate: [2, 0.27, function (v, t) { tone(v, 'sine', 660, 1320, t, 0.25, 0.2, { att: 0.05 }); tone(v, 'sine', 664, 1328, t, 0.25, 0.2, { att: 0.05 }); }],
    gateBlocked: [2, 0.14, function (v, t) { tone(v, 'sine', 110, 110, t, 0.12, 0.5, { lp: 300 }); tone(v, 'sine', 55, 55, t, 0.12, 0.5, { lp: 300 }); }],
    warn: [1, 0.17, function (v, t) { tone(v, 'square', 880, 880, t, 0.03, 0.25, { lp: 2000 }); tone(v, 'square', 880, 880, t + 0.075, 0.03, 0.25, { lp: 2000 }); }],
    slam: [1, 0.27, function (v, t) { tone(v, 'sine', 90, 40, t, 0.25, 0.8); burst(v, 'lowpass', 400, 400, t, 0.2, 0.6); }],
    death: [1, 0.52, function (v, t) {
      burst(v, 'highpass', 2500, 2500, t, 0.2, 0.5);
      tone(v, 'sine', 523, 523, t + 0.15, 0.17, 0.35); tone(v, 'sine', 392, 392, t + 0.32, 0.2, 0.35);
    }],
    respawn: [1, 0.32, function (v, t) { var f = [523.25, 659.25, 783.99, 1046.5]; for (var i = 0; i < 4; i++) tone(v, 'sine', f[i], f[i], t + i * 0.05, 0.12, 0.3); }],
    portal: [1, 0.52, function (v, t) { tone(v, 'sine', 220, 440, t, 0.5, 0.3, { att: 0.25 }); tone(v, 'sine', 223, 446, t, 0.5, 0.3, { att: 0.25 }); }],
    win: [1, 0.4, function (v, t) { tone(v, 'square', 523, 523, t, 0.1, 0.4); tone(v, 'square', 659, 659, t + 0.1, 0.14, 0.4); tone(v, 'square', 784, 1047, t + 0.24, 0.25, 0.4); }],
    ui: [3, 0.06, function (v, t) { tone(v, 'sine', 1200, 1200, t, 0.04, 0.2); }],
    padUp: [3, 0.06, function (v, t) { tone(v, 'sine', 1320, 1320, t, 0.04, 0.15); }],
    padLeft: [3, 0.06, function (v, t) { tone(v, 'sine', 1100, 1100, t, 0.04, 0.15); }],
    padRight: [3, 0.06, function (v, t) { tone(v, 'sine', 1250, 1250, t, 0.04, 0.15); }],
    padDown: [3, 0.06, function (v, t) { tone(v, 'sine', 990, 990, t, 0.04, 0.15); }]
  };
  var VIB = { death: 25, slam: 15, padUp: 8, padLeft: 8, padRight: 8, padDown: 8 };
  function vibrate(ms) { try { if (vibOn && G.navigator && G.navigator.vibrate) G.navigator.vibrate(ms); } catch (e) {} }
  // duck the music bus (not the sfx): level 0..1 for hold seconds then release over rel seconds
  function duck(level, hold, rel) {
    if (!musicDuck) return;
    try {
      var t = ctx.currentTime, p = musicDuck.gain, cur = p.value;
      if (p.cancelScheduledValues) p.cancelScheduledValues(t);
      p.setValueAtTime(cur, t); p.linearRampToValueAtTime(level, t + 0.05);
      p.setValueAtTime(level, t + hold); p.linearRampToValueAtTime(1, t + hold + rel);
    } catch (e) {}
  }
  function duckLevel() { return Math.pow(10, -duckDb / 20); }
  function play(name, state) {
    var key = name;
    if (name === 'flip') key = DIRF[state && state.g] || 'flipUp';
    if (Object.prototype.hasOwnProperty.call(STING, name) || (name === 'win' && PL.music && PL.music.sting)) {
      if (PL.music && PL.music.sting) { PL.music.sting(STING[name] || 'clear'); return; }
      key = 'win';
    }
    var r = Object.prototype.hasOwnProperty.call(R, key) ? R[key] : null; if (!r) return;
    if (key === 'ride') { var tn = ctx.currentTime; if (lastRide >= 0 && tn - lastRide < 0.09 && tn >= lastRide) return; lastRide = tn; }
    var v = admit(r[0], r[1]); if (!v) return;
    r[2](v, ctx.currentTime, state || {});
    if (key === 'death') duck(0.15, 0.6, 0.4);
  }
  function nameOf(e) { return typeof e === 'string' ? e : e && (e.type || e.name || e.kind || e.id); }
  function onEvents(events, state) {
    if (!events || !events.length) return;
    for (var i = 0; i < events.length; i++) {
      var n = nameOf(events[i]); if (!n) continue;
      var key = n === 'flip' ? 'flip' : n;
      if (VIB[key]) vibrate(VIB[key]);
      if (!live()) continue;
      if (Object.prototype.hasOwnProperty.call(R, n) || n === 'flip' || Object.prototype.hasOwnProperty.call(STING, n)) { try { play(n, state); } catch (e) {} }
    }
  }
  function setMuted(b) {
    muted = !!b;
    try { if (master) master.gain.value = muted ? 0 : MAXG; } catch (e) {}
  }
  function setSfxGain(v) { sfxGain = clamp(v, 0, 1); try { if (sfxBus) sfxBus.gain.value = sfxGain; } catch (e) {} }
  function setMusicGain(v) { musicGain = clamp(v, 0, 1); applyMusic(); }
  function setMusicOn(b) { musicOn = !!b; applyMusic(); if (!musicOn && PL.music && PL.music.stop) PL.music.stop(0.3); }
  function applyMusic() { try { if (musicBus) musicBus.gain.value = musicOn ? musicGain : 0; } catch (e) {} }
  PL.audio = {
    init: unlock, unlock: unlock, onEvents: onEvents, setMuted: setMuted, isMuted: function () { return muted; }, MAX_GAIN: MAXG,
    setMusicGain: setMusicGain, setSfxGain: setSfxGain, setMusicOn: setMusicOn, onVisibility: onVisibility,
    setDuckDb: function (v) { duckDb = clamp(v, 0, 18); }, setPitchVar: function (v) { pitchVar = clamp(v, 0, 0.06); },
    setVibration: function (b) { vibOn = !!b; }, seed: function (n) { seedv = n | 0; },
    playMusic: function (m) { return PL.music && PL.music.play ? PL.music.play(m) : null; },
    stopMusic: function (s) { if (PL.music && PL.music.stop) PL.music.stop(s); },
    sting: function (id) { if (live() && PL.music && PL.music.sting) PL.music.sting(id); },
    duck: duck, duckLevel: duckLevel, canMusic: canMusic, isUnlocked: function () { return unlocked; },
    voiceCount: function () { var t = ctx ? ctx.currentTime : 0, n = 0; for (var i = 0; i < voices.length; i++) if (voices[i].end > t) n++; return n; },
    events: Object.keys(R).concat(['flip']).concat(Object.keys(STING)),
    // internals for music.js
    core: function () { return ctx ? { ctx: ctx, sfxBus: sfxBus, musicDuck: musicDuck, musicBus: musicBus, noise: getNoise, rnd: rnd, live: live } : null; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
