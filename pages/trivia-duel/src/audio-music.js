// audio-music.js -> TD.music (build td-audio-1). Live look-ahead sequencer (25 ms timer, 120 ms look-ahead) on the audio clock.
// Routes to TD.audio.core().musicBus (loops) / sfxBus (stings). Silent no-op (play/sting return false) while TD.audio.core() is null.
// PROVENANCE (all tunes public domain; note strings written from memory, arrangements own; levels/tempi are [guess], tune by ear):
//  canon    Canon in D, melody F#5 E5 D5 C#5 B4 A4 B4 C#5 x2 + pad + bass D A B F# G D G A. Pachelbel (d. 1706). 66 bpm [guess]. Arrangement own.
//  mountain In the Hall of the Mountain King, first phrase B C# D E F# D F#. Grieg (d. 1907). Tempo ramp 100->150 over 8 bars then hold. Arrangement own.
//  win      Ode to Joy 8-bar theme (Symphony 9). Beethoven (d. 1827). 200 bpm with ritard (~10 s); opts.short -> first 4 bars. Arrangement own.
//  lose     Own composition: 4 descending notes in D minor, Gymnopedie-like mood (not Satie's notes). ~3 s. Original, admin default.
//  draw     Twinkle line 1 (Ah vous dirai-je, Maman, K.265 theme). Mozart (d. 1791). ~2 s. Arrangement own.
//  medal    Twinkle lines 1-2, 192 bpm. Mozart (d. 1791). Arrangement own.
var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
(function () {
  'use strict';
  var LOOK = 0.12, TICK = 25, FLOOR = 0.0001, XF = 0.8;
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(n) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(n); if (!m) return -1;
    return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  // token NOTE[+NOTE]:BEATS, r = rest -> rows [startBeat, durBeats, midi]
  function parse(str, shift) {
    var out = [], t = 0, tk = String(str).trim().split(/\s+/), i, j, p, ns;
    for (i = 0; i < tk.length; i++) {
      if (!tk[i]) continue;
      p = tk[i].split(':');
      var d = +p[1];
      if (p[0] !== 'r') { ns = p[0].split('+'); for (j = 0; j < ns.length; j++) out.push([t, d, midi(ns[j]) + (shift || 0)]); }
      t += d;
    }
    return out;
  }
  function blen(str) { var s = 0, tk = String(str).trim().split(/\s+/); for (var i = 0; i < tk.length; i++) s += +tk[i].split(':')[1] || 0; return s; }
  function rep(s, n) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o.join(' '); }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rnd = mulberry32(0x7D51CA);

  // ---- note data
  var ODE_A = 'F#4:1 F#4:1 G4:1 A4:1 A4:1 G4:1 F#4:1 E4:1 D4:1 D4:1 E4:1 F#4:1 ';
  var ODE_M = ODE_A + 'F#4:1.5 E4:0.5 E4:2 ' + ODE_A + 'E4:1.5 D4:0.5 D4:2';
  var ODE_B = 'D3:4 D3:2 A2:2 D3:4 A2:4 D3:4 D3:2 A2:2 D3:4 A2:2 D3:2';
  var T1 = 'C5:1 C5:1 G5:1 G5:1 A5:1 A5:1 G5:2 ', T2 = 'F5:1 F5:1 E5:1 E5:1 D5:1 D5:1 C5:2 ';
  var TW_B1 = 'C3:4 F3:2 C3:2 ', TW_B2 = 'F3:2 C3:2 G2:2 C3:2 ';
  function mk(a, b, c, d, e, f, g) { return a + ':0.5 ' + b + ':0.5 ' + c + ':0.5 ' + d + ':0.5 ' + e + ':0.5 ' + f + ':0.5 ' + g + ':1 '; }
  var MK = mk('B3', 'C#4', 'D4', 'E4', 'F#4', 'D4', 'F#4');

  // loops: tempo = breakpoints [beat,bpm] for the first pass; tempo2 = for later passes (default same)
  var PIECES = {
    canon: { loop: true, tempo: [[0, 66]], tracks: [
      { v: 'bell', g: 0.5, s: rep('F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2', 2) },
      { v: 'pad', g: 0.38, s: rep('D4+F#4+A4:2 C#4+E4+A4:2 D4+F#4+B4:2 C#4+F#4+A4:2 B3+D4+G4:2 D4+F#4+A4:2 B3+D4+G4:2 C#4+E4+A4:2', 2) },
      { v: 'pluck', g: 0.42, s: rep('D3:2 A2:2 B2:2 F#2:2 G2:2 D3:2 G2:2 A2:2', 2) }] },
    mountain: { loop: true, tempo: [[0, 100], [32, 150]], tempo2: [[0, 150]], tracks: [
      { v: 'saw', g: 0.4, s: rep(MK, 8) },
      { v: 'bell', g: 0.22, o: 12, s: rep(MK, 8) },
      { v: 'pluck', g: 0.4, o: -12, s: rep('B3:1 F#3:1 B3:1 F#3:1', 8) }] }
  };
  var STINGS = {
    win: { tempo: [[0, 200], [28, 190], [31, 120], [32, 90]], tracks: [{ v: 'bell', g: 0.6, s: ODE_M }, { v: 'pad', g: 0.35, s: ODE_B }], shortBeats: 16 },
    lose: { tempo: [[0, 100]], tracks: [{ v: 'bell', g: 0.55, s: 'D5:1 C5:1 A4:1 F4:2.5' }, { v: 'pad', g: 0.35, s: 'D3+A3+F4:2 C3+G3+E4:1 A2+E3+C4:3.5' }] },
    draw: { tempo: [[0, 240]], tracks: [{ v: 'bell', g: 0.55, s: T1 }, { v: 'pad', g: 0.28, s: TW_B1 }] },
    medal: { tempo: [[0, 192]], tracks: [{ v: 'bell', g: 0.6, s: T1 + T2 }, { v: 'pad', g: 0.3, s: TW_B1 + TW_B2 }] }
  };

  // ---- voices: (c, t, dur, midiNote, vel, dest) -> array of started sources. All never throw out of pump (caller catches).
  function env(c, t, pk, att, end) { var g = c.ctx.createGain(); g.gain.setValueAtTime(FLOOR, t); g.gain.exponentialRampToValueAtTime(Math.max(FLOOR * 2, pk), t + att); g.gain.exponentialRampToValueAtTime(FLOOR, end); return g; }
  function osc(c, type, f, t, stop, dest, det) {
    var o = c.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (det && o.detune) o.detune.value = det;
    o.connect(dest); o.start(t); o.stop(stop); return o;
  }
  var VOICE = {
    bell: function (c, t, dur, m, vel, dest) {
      var f = hz(m), d = Math.max(0.5, 1.5 - f / 2400), g = env(c, t, vel * 0.7, 0.004, t + d), h = c.ctx.createGain(), e = t + d + 0.05;
      g.connect(dest); h.gain.value = 0.15; h.connect(g);
      return [osc(c, 'sine', f, t, e, g), osc(c, 'sine', f * 3, t, e, h)];
    },
    pad: function (c, t, dur, m, vel, dest) {
      var f = hz(m), att = Math.min(0.25, dur * 0.4), e = t + dur + 0.45, g = c.ctx.createGain(), lp = c.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = Math.min(2200, f * 4);
      g.gain.setValueAtTime(FLOOR, t); g.gain.linearRampToValueAtTime(vel * 0.45, t + att); g.gain.setValueAtTime(vel * 0.45, t + dur);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + dur + 0.4);
      lp.connect(g); g.connect(dest);
      return [osc(c, 'triangle', f, t, e, lp), osc(c, 'sine', f, t, e, lp, 6 + rnd() * 3)];
    },
    pluck: function (c, t, dur, m, vel, dest) {
      var f = hz(m), d = f < 150 ? 0.45 : 0.3, g = env(c, t, vel * 0.85, 0.005, t + d), lp = c.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(g); g.connect(dest);
      return [osc(c, 'triangle', f, t, t + d + 0.05, lp)];
    },
    saw: function (c, t, dur, m, vel, dest) { // soft plucked saw, lowpassed [guess]
      var f = hz(m), d = Math.max(0.14, Math.min(0.4, dur * 0.9)), g = env(c, t, vel * 0.5, 0.006, t + d), lp = c.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(380, t + d); lp.Q.value = 1;
      lp.connect(g); g.connect(dest);
      return [osc(c, 'sawtooth', f, t, t + d + 0.05, lp)];
    }
  };

  // ---- compile: events + beat->seconds tables (1/8 beat steps, bpm linear between breakpoints, hold last)
  function mkSec(tempo, len) {
    function bpmAt(b) {
      if (b <= tempo[0][0]) return tempo[0][1];
      for (var k = 1; k < tempo.length; k++) if (b <= tempo[k][0]) return tempo[k - 1][1] + (tempo[k][1] - tempo[k - 1][1]) * (b - tempo[k - 1][0]) / (tempo[k][0] - tempo[k - 1][0]);
      return tempo[tempo.length - 1][1];
    }
    var n = Math.ceil(len * 8) + 4, T = [0], k;
    for (k = 0; k < n; k++) T.push(T[k] + 60 / bpmAt((k + 0.5) / 8) / 8);
    return function (b) { var x = b * 8, i = Math.max(0, Math.min(n - 1, Math.floor(x))); return T[i] + (T[i + 1] - T[i]) * (x - i); };
  }
  function compile(def, maxBeats) {
    var ev = [], len = 0, i, j, tr, rows;
    for (i = 0; i < def.tracks.length; i++) {
      tr = def.tracks[i]; rows = parse(tr.s, tr.o || 0);
      for (j = 0; j < rows.length; j++) {
        if (maxBeats && rows[j][0] >= maxBeats) continue;
        ev.push({ b: rows[j][0], d: maxBeats ? Math.min(rows[j][1], maxBeats - rows[j][0]) : rows[j][1], m: rows[j][2], v: tr.v, g: tr.g || 0.5 });
      }
      len = Math.max(len, blen(tr.s));
    }
    if (maxBeats) len = Math.min(len, maxBeats);
    ev.sort(function (a, b) { return a.b - b.b; });
    return { ev: ev, len: len, sec1: mkSec(def.tempo, len), sec2: mkSec(def.tempo2 || def.tempo, len) };
  }

  // ---- engine state
  var cur = null, old = null, stings = [], timer = null;
  function core() { try { return (TD.audio && TD.audio.core && TD.audio.core()) || null; } catch (e) { return null; } }

  function newTrack(k, dest, c, at, loop) {
    var g = c.ctx.createGain(); g.connect(dest);
    return { ev: k.ev, len: k.len, sec: k.sec1, sec2: k.sec2, loop: loop, g: g, idx: 0, t0: at, src: [], stop: false, done: false, endT: 0, killAt: 0 };
  }
  function pump(tr, now, c) {
    if (tr.stop) return;
    var guard = 0, e, ts, dur, s, i, endT;
    while (guard++ < 4000) {
      if (tr.idx >= tr.ev.length) {
        endT = tr.t0 + tr.sec(tr.len);
        if (!tr.loop) { tr.done = true; tr.endT = endT; return; }
        if (endT > now + LOOK) return;
        tr.t0 = endT; tr.idx = 0; tr.sec = tr.sec2; continue;
      }
      e = tr.ev[tr.idx]; ts = tr.t0 + tr.sec(e.b);
      if (ts > now + LOOK) return;
      tr.idx++;
      if (ts < now - 0.25) continue; // far behind (tab was hidden): skip, no burst
      if (!VOICE[e.v]) continue;
      try {
        dur = tr.sec(e.b + e.d) - tr.sec(e.b);
        s = VOICE[e.v](c, Math.max(ts, now), dur, e.m, e.g, tr.g);
        for (i = 0; i < s.length; i++) tr.src.push({ n: s[i], end: Math.max(ts, now) + dur + 2.5 });
        if (tr.src.length > 96) tr.src = tr.src.filter(function (x) { return x.end > now; });
      } catch (err) { /* silent */ }
    }
  }
  function dispose(tr) {
    if (!tr) return;
    tr.stop = true;
    for (var i = 0; i < tr.src.length; i++) { try { tr.src[i].n.stop(); } catch (e) { /* */ } }
    tr.src = [];
    try { tr.g.disconnect(); } catch (e) { /* */ }
  }
  function ramp(param, t, dur, from, to) {
    try {
      if (param.cancelScheduledValues) param.cancelScheduledValues(t);
      param.setValueAtTime(Math.max(FLOOR, from), t);
      param.linearRampToValueAtTime(Math.max(0, to), t + dur);
    } catch (e) { /* */ }
  }
  function tick() {
    try {
      var c = core(), now, i;
      if (!c) return;
      now = c.ctx.currentTime;
      if (cur) pump(cur, now, c);
      if (old && now >= old.killAt) { dispose(old); old = null; }
      for (i = stings.length - 1; i >= 0; i--) {
        pump(stings[i], now, c);
        if (stings[i].done && now >= stings[i].endT + 3) { dispose(stings[i]); stings.splice(i, 1); }
      }
      if (!cur && !old && !stings.length && timer) { clearInterval(timer); timer = null; }
    } catch (e) { /* silent */ }
  }
  function ensureTimer() { if (!timer && typeof setInterval === 'function') { timer = setInterval(tick, TICK); if (timer && timer.unref) timer.unref(); } }

  function play(id) {
    try {
      var def = PIECES[id], c = core();
      if (!def || !c) return false;
      if (cur && cur.id === id && !cur.stop) return true;
      var now = c.ctx.currentTime, k = compile(def), tr;
      if (old) { dispose(old); old = null; }
      if (cur) { ramp(cur.g.gain, now, XF, cur.g.gain.value, 0); cur.stop = true; cur.killAt = now + XF + 0.1; old = cur; }
      tr = newTrack(k, c.musicBus, c, now + 0.05, true);
      tr.id = id;
      if (old) { tr.g.gain.value = FLOOR; ramp(tr.g.gain, now, XF, FLOOR, 1); } else tr.g.gain.value = 1;
      cur = tr; ensureTimer(); tick();
      return true;
    } catch (e) { return false; }
  }
  function stop(fadeSec) {
    try {
      var c = core(); if (!c) { cur = old = null; return; }
      if (old) { dispose(old); old = null; }
      if (!cur) return;
      if (!(fadeSec > 0)) { dispose(cur); cur = null; return; }
      var now = c.ctx.currentTime;
      ramp(cur.g.gain, now, fadeSec, cur.g.gain.value, 0); cur.stop = true; cur.killAt = now + fadeSec + 0.1; old = cur; cur = null; ensureTimer();
    } catch (e) { /* silent */ }
  }
  function sting(id, opts) {
    try {
      var def = STINGS[id], c = core();
      if (!def || !c) return false;
      var short = !!(opts && opts.short), k = compile(def, short && def.shortBeats ? def.shortBeats : 0);
      var now = c.ctx.currentTime, tr = newTrack(k, c.sfxBus, c, now + 0.02, false);
      tr.id = id; tr.g.gain.value = 0.9;
      while (stings.length >= 2) dispose(stings.shift());
      stings.push(tr);
      try { if (TD.audio && TD.audio.duck) TD.audio.duck(0.3, k.sec1(k.len), 0.5); } catch (e) { /* */ }
      ensureTimer(); pump(tr, now, c);
      return true;
    } catch (e) { return false; }
  }

  TD.music = {
    play: play, stop: stop, sting: sting,
    ids: ['canon', 'mountain'], stings: ['win', 'lose', 'draw', 'medal'],
    isPlaying: function () { return !!(cur && !cur.stop); },
    current: function () { return cur && !cur.stop ? cur.id : null; },
    _tick: tick
  };
})();
if (typeof module !== 'undefined') module.exports = TD.music;
