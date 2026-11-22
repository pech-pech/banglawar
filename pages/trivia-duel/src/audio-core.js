// audio-core.js - TD.audio: AudioContext, buses, voice cap, cue registry, bgm routing. Levels marked [guess].
// Chain: sfxBus | musicBus -> master (0.8 [guess]) -> DynamicsCompressor (safety limiter) -> destination.
var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
(function (G) {
  'use strict';
  var MAXV = 8, MIN_GAP = 0.04, FLOOR = 0.0001;
  var ctx = null, master = null, limiter = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var unlocked = false, tried = false, hidden = false, visHooked = false;
  var lv = { musicVol: 0.5, sfxVol: 0.8, musicOn: 1, sfxOn: 1, duckDb: 8 }; // [guess]
  var cues = {}, lastPlay = {}, voices = [];
  var wanted = null, mode = null, fileLoaded = false;
  var bufCache = {}, fileSrc = null, fileGain = null, fileId = null, fileStarted = false;
  var seedv = 0x7d5eed11;

  function rnd() { // mulberry32, own seed, never Math.random
    seedv = (seedv + 0x6d2b79f5) | 0;
    var t = Math.imul(seedv ^ (seedv >>> 15), 1 | seedv);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function clamp(v, a, b) { v = +v; if (!(v === v)) v = a; return v < a ? a : v > b ? b : v; }
  function Ctor() { return G.AudioContext || G.webkitAudioContext || null; }
  function music() { return TD.music || null; }

  function ensure() {
    if (ctx) return ctx;
    if (tried) return null;
    var C = Ctor(); if (!C) return null;
    tried = true;
    try {
      ctx = new C();
      master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
      master.gain.value = 0.8; // [guess]
      limiter = ctx.createDynamicsCompressor();
      try { limiter.threshold.value = -6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.15; } catch (e) {}
      sfxBus.connect(master); musicBus.connect(master); master.connect(limiter); limiter.connect(ctx.destination);
      applyLevels(true);
    } catch (e) { ctx = master = limiter = sfxBus = musicBus = null; }
    return ctx;
  }
  function ramp(param, v, instant) {
    try {
      if (instant || !ctx || !param.linearRampToValueAtTime) { param.value = v; return; }
      var t = ctx.currentTime;
      if (param.cancelScheduledValues) param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(v, t + 0.06);
    } catch (e) { try { param.value = v; } catch (e2) {} }
  }
  function applyLevels(instant) {
    if (!ctx) return;
    ramp(sfxBus.gain, lv.sfxOn ? lv.sfxVol : 0, instant);
    ramp(musicBus.gain, lv.musicOn ? lv.musicVol : 0, instant);
  }
  function resume() {
    try { if (ctx && ctx.state === 'suspended' && ctx.resume) { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
  }
  function onVisibility() {
    hidden = !!(G.document && G.document.hidden);
    if (!ctx || !unlocked) return;
    try {
      if (hidden) { if (ctx.suspend) { var p = ctx.suspend(); if (p && p.catch) p.catch(function () {}); } } else resume();
    } catch (e) {}
  }
  function unlock() {
    try {
      if (!ensure()) return;
      var first = !unlocked;
      unlocked = true;
      if (!hidden) resume();
      if (!visHooked && G.document && G.document.addEventListener) {
        visHooked = true;
        try { G.document.addEventListener('visibilitychange', onVisibility); } catch (e) {}
      }
      if (first && wanted) { var w = wanted; mode = null; bgm(w); }
    } catch (e) {}
  }
  function getNoise() {
    if (noiseBuf || !ctx) return noiseBuf;
    try {
      var sr = ctx.sampleRate || 44100, n = Math.floor(sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
      noiseBuf = b;
    } catch (e) {}
    return noiseBuf;
  }
  function live() { return !!(ctx && unlocked && lv.sfxOn && lv.sfxVol > 0); }
  function core() {
    return ctx ? { ctx: ctx, sfxBus: sfxBus, musicBus: musicBus, noise: getNoise, rnd: rnd, live: live } : null;
  }
  function setLevels(cfg) {
    try {
      if (!cfg) return;
      if (cfg.musicVol != null) lv.musicVol = clamp(cfg.musicVol, 0, 1);
      if (cfg.sfxVol != null) lv.sfxVol = clamp(cfg.sfxVol, 0, 1);
      if (cfg.musicOn != null) lv.musicOn = cfg.musicOn ? 1 : 0;
      if (cfg.sfxOn != null) lv.sfxOn = cfg.sfxOn ? 1 : 0;
      if (cfg.duckDb != null) lv.duckDb = clamp(cfg.duckDb, 0, 24);
      applyLevels(false);
    } catch (e) {}
  }
  function registerCue(name, pri, dur, fn) {
    if (!name || typeof fn !== 'function') return;
    cues[name] = { pri: clamp(pri, 1, 3), dur: +dur > 0 ? +dur : 0.1, fn: fn };
  }
  function kill(v) {
    for (var i = 0; i < v.nodes.length; i++) { try { v.nodes[i].stop(); } catch (e) {} }
    v.end = -1;
  }
  function play(name, opts) {
    try {
      var c = Object.prototype.hasOwnProperty.call(cues, name) ? cues[name] : null;
      if (!c) { api.missing++; return; }
      if (!ctx || !unlocked || !lv.sfxOn || lv.sfxVol <= 0) return;
      var t = ctx.currentTime, i;
      if (lastPlay[name] != null && t >= lastPlay[name] && t - lastPlay[name] < MIN_GAP) return;
      var a = [];
      for (i = 0; i < voices.length; i++) if (voices[i].end > t) a.push(voices[i]);
      voices = a;
      if (a.length >= MAXV) { // steal oldest of lowest priority
        var vi = -1;
        for (i = 0; i < a.length; i++) {
          if (vi < 0 || a[i].pri < a[vi].pri || (a[i].pri === a[vi].pri && a[i].t0 < a[vi].t0)) vi = i;
        }
        if (a[vi].pri > c.pri) return; // everything playing outranks the newcomer
        kill(a[vi]); voices.splice(voices.indexOf(a[vi]), 1);
      }
      var v = { pri: c.pri, t0: t, end: t + c.dur + 0.05, nodes: [] };
      voices.push(v);
      lastPlay[name] = t;
      var r = c.fn(core(), t, opts || {});
      if (r && r.length) for (i = 0; i < r.length; i++) if (r[i]) v.nodes.push(r[i]);
    } catch (e) {}
  }
  function duck(level, holdSec, relSec) {
    if (!ctx || !musicBus) return;
    try {
      level = clamp(level, 0, 1);
      var t = ctx.currentTime, p = musicBus.gain, base = lv.musicOn ? lv.musicVol : 0, hold = Math.max(0, +holdSec || 0), rel = Math.max(0.01, +relSec || 0.3);
      if (p.cancelScheduledValues) p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(base * level, t + 0.05);
      p.setValueAtTime(base * level, t + 0.05 + hold);
      p.linearRampToValueAtTime(base, t + 0.05 + hold + rel);
    } catch (e) {}
  }

  // ---- bgm
  function stopFile(fade) {
    var s = fileSrc, g = fileGain;
    fileSrc = fileGain = null; fileId = null; fileStarted = false;
    if (!s) return;
    try {
      var t = ctx.currentTime, f = Math.max(0.02, +fade || 0);
      if (g && g.gain) { if (g.gain.cancelScheduledValues) g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + f); }
      s.stop(t + f + 0.02);
    } catch (e) { try { s.stop(); } catch (e2) {} }
  }
  function startFile(id, buf, fade) {
    stopFile(fade);
    var t = ctx.currentTime, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.loop = true;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + fade);
    s.connect(g); g.connect(musicBus); s.start(t);
    fileSrc = s; fileGain = g; fileId = id; fileStarted = true;
  }
  function bgmFile(id, url) {
    try {
      if (!ensure()) return Promise.resolve(false);
      var done = function (buf) {
        if (!buf) return false;
        fileLoaded = true;
        if (mode === 'duel' && wanted === 'duel' && unlocked && id === 'duel' && !fileStarted) { try { startFile(id, buf, 0.8); } catch (e) { return false; } }
        return true;
      };
      if (bufCache[id] && bufCache[id].buf) return Promise.resolve(done(bufCache[id].buf));
      if (bufCache[id] && bufCache[id].pending) return bufCache[id].pending;
      if (typeof G.fetch !== 'function') return Promise.resolve(false);
      var p = Promise.resolve().then(function () { return G.fetch(url); })
        .then(function (r) { if (!r || r.ok === false) throw new Error('http'); return r.arrayBuffer(); })
        .then(function (ab) {
          return new Promise(function (res, rej) {
            var pr = ctx.decodeAudioData(ab, res, rej);
            if (pr && pr.then) pr.then(res, rej);
          });
        })
        .then(function (buf) { bufCache[id] = { buf: buf }; return done(buf); })
        .catch(function () { delete bufCache[id]; return false; });
      bufCache[id] = { pending: p };
      return p;
    } catch (e) { return Promise.resolve(false); }
  }
  function stopMusicEngine(fade) { try { if (music() && music().stop) music().stop(fade); } catch (e) {} }
  function bgm(m) {
    try {
      if (m !== 'menu' && m !== 'duel') m = null;
      wanted = m;
      if (!m) { stopBgm(0.8); return; }
      if (!unlocked || !ctx) return; // applied at unlock
      if (m === mode) return;
      mode = m;
      if (m === 'menu') {
        stopFile(0.8);
        if (music() && music().play) music().play('canon');
      } else {
        stopMusicEngine(0.8);
        bgmFile('duel', 'audio/bgm-beethoven5.mp3').then(function (ok) {
          if (mode !== 'duel') return;
          if (!ok) { if (music() && music().play) music().play('mountain'); }
          else if (!fileStarted && bufCache.duel && bufCache.duel.buf) startFile('duel', bufCache.duel.buf, 0.8);
        });
      }
    } catch (e) {}
  }
  function stopBgm(fadeSec) {
    try {
      mode = null;
      var f = fadeSec == null ? 0.8 : +fadeSec;
      if (ctx) stopFile(f);
      stopMusicEngine(f);
    } catch (e) {}
  }
  function state() {
    var t = ctx ? ctx.currentTime : 0, n = 0;
    for (var i = 0; i < voices.length; i++) if (voices[i].end > t) n++;
    return { unlocked: unlocked, mode: mode, missing: api.missing, voices: n, musicVol: lv.musicVol, sfxVol: lv.sfxVol, musicOn: lv.musicOn, sfxOn: lv.sfxOn, fileLoaded: fileLoaded };
  }

  var api = {
    unlock: unlock, core: core, setLevels: setLevels, registerCue: registerCue, play: play, duck: duck,
    bgm: bgm, bgmFile: bgmFile, stopBgm: stopBgm, state: state, missing: 0
  };
  TD.audio = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
