// music.js - PL.music: lookahead note scheduler (100 ms) over PL.musicData, synth voices, loops, equal-power crossfade, one-shot stings.
// Needs audio.js (buses) and music-data.js. Everything is silent until PL.audio.unlock() ran.
(function (G) {
  'use strict';
  var PL = G.PL = G.PL || {};
  var LOOK = 0.1, TICK = 25, FLOOR = 0.0001;
  var cur = null, old = null, stings = [], pending = null, timer = null, xf = 1.5;
  var SPARK = ['C6', 'E6', 'G6', 'C7', 'E7', 'G7', 'C8'];
  function A() { return PL.audio; }
  function D() { return PL.musicData; }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // ---- voices: build nodes for one note at time t lasting dur seconds, peak vel, into dest. Return the sources.
  function mkEnv(c, t, pk, att) { var g = c.ctx.createGain(); g.gain.setValueAtTime(FLOOR, t); g.gain.exponentialRampToValueAtTime(Math.max(FLOOR * 2, pk), t + att); return g; }
  function osc(c, type, f, t, stop, dest, det) {
    var o = c.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det;
    o.connect(dest); o.start(t); o.stop(stop); return o;
  }
  var VOICE = {
    celesta: function (c, t, dur, m, vel, dest) {
      var f = hz(m), d = Math.max(0.5, 1.6 - f / 2400), g = mkEnv(c, t, vel * 0.7, 0.003), h = c.ctx.createGain(), e = t + d + 0.05;
      g.gain.exponentialRampToValueAtTime(FLOOR, t + d); g.connect(dest); h.gain.value = 0.18; h.connect(g);
      return [osc(c, 'sine', f, t, e, g), osc(c, 'sine', f * 4, t, e, h)];
    },
    musicbox: function (c, t, dur, m, vel, dest) {
      var f = hz(m), d = 0.9, g = mkEnv(c, t, vel * 0.7, 0.002), h = c.ctx.createGain(), e = t + d + 0.05;
      g.gain.exponentialRampToValueAtTime(FLOOR, t + d); g.connect(dest); h.gain.value = 0.12; h.connect(g);
      return [osc(c, 'sine', f, t, e, g), osc(c, 'triangle', f * 3, t, e, h)];
    },
    pad: function (c, t, dur, m, vel, dest) {
      var f = hz(m), att = Math.min(0.25, dur * 0.4), e = t + dur + 0.45, g = c.ctx.createGain(), lp = c.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = Math.min(2500, f * 4);
      g.gain.setValueAtTime(FLOOR, t); g.gain.linearRampToValueAtTime(vel * 0.5, t + att); g.gain.setValueAtTime(vel * 0.5, t + dur);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + dur + 0.4);
      lp.connect(g); g.connect(dest);
      return [osc(c, 'triangle', f, t, e, lp), osc(c, 'triangle', f, t, e, lp, 7)];
    },
    pizz: function (c, t, dur, m, vel, dest) {
      var f = hz(m), d = f < 150 ? 0.4 : 0.25, g = mkEnv(c, t, vel * 0.9, 0.004), lp = c.ctx.createBiquadFilter(), e = t + d + 0.05;
      lp.type = 'lowpass'; lp.frequency.value = 1400; g.gain.exponentialRampToValueAtTime(FLOOR, t + d);
      lp.connect(g); g.connect(dest);
      var s = [osc(c, 'triangle', f, t, e, lp)];
      var n = c.ctx.createBufferSource(), nf = c.ctx.createBiquadFilter(), ng = c.ctx.createGain();
      n.buffer = c.noise(); n.loop = true; nf.type = 'bandpass'; nf.frequency.value = 1800; ng.gain.value = 0.15 * vel;
      n.connect(nf); nf.connect(ng); ng.connect(g); n.start(t); n.stop(t + 0.01); s.push(n);
      return s;
    }
  };

  // ---- compile a piece (or sting) into events + a beat->seconds map
  function compile(id, isSting) {
    var d = D(), sd = isSting ? d.stings[id] : null, p = d.pieces[isSting ? sd && sd.ref : id];
    if (!p) return null;
    var ev = [], i, j, tr, rows, len = 0, tempo = sd ? sd.tempo : (p.tempo || [[0, p.bpm]]);
    for (i = 0; i < p.tracks.length; i++) {
      if (sd && sd.tr && sd.tr.indexOf(i) < 0) continue;
      tr = p.tracks[i]; rows = d.parse(tr.s, tr.o || 0);
      for (j = 0; j < rows.length; j++) ev.push({ b: rows[j][0], d: rows[j][1], m: rows[j][2], v: tr.v, g: (tr.g || 0.5) * (p.g || 1) });
      len = Math.max(len, d.len(tr.s));
    }
    if (sd) {
      var out = [], off = 0, s, e;
      for (i = 0; i < sd.segs.length; i++) {
        s = sd.segs[i][0]; e = sd.segs[i][1];
        for (j = 0; j < ev.length; j++) if (ev[j].b >= s && ev[j].b < e) out.push({ b: off + ev[j].b - s, d: Math.min(ev[j].d, e - ev[j].b), m: ev[j].m, v: ev[j].v, g: ev[j].g });
        off += e - s;
      }
      ev = out; len = off;
      if (sd.sparkle) for (i = 0; i < SPARK.length; i++) ev.push({ b: len + i * 0.3, d: 0.5, m: d.midi(SPARK[i]), v: 'celesta', g: 0.35 });
      if (sd.sparkle) len += SPARK.length * 0.3;
    }
    ev.sort(function (a, b) { return a.b - b.b; });
    // beat -> seconds table at 1/8 beat steps, bpm linearly interpolated between tempo breakpoints
    function bpmAt(b) {
      if (b <= tempo[0][0]) return tempo[0][1];
      for (var k = 1; k < tempo.length; k++) if (b <= tempo[k][0]) return tempo[k - 1][1] + (tempo[k][1] - tempo[k - 1][1]) * (b - tempo[k - 1][0]) / (tempo[k][0] - tempo[k - 1][0]);
      return tempo[tempo.length - 1][1];
    }
    var n = Math.ceil(len * 8) + 2, T = [0], k2;
    for (k2 = 0; k2 < n; k2++) T.push(T[k2] + 60 / bpmAt((k2 + 0.5) / 8) / 8);
    function secAt(b) { var x = b * 8, i2 = Math.max(0, Math.min(n - 1, Math.floor(x))); return T[i2] + (T[i2 + 1] - T[i2]) * (x - i2); }
    return { ev: ev, len: len, secAt: secAt, loop: isSting ? -1 : (p.loop == null ? 0 : p.loop) };
  }
  function firstIdx(ev, b) { for (var i = 0; i < ev.length; i++) if (ev[i].b >= b) return i; return ev.length; }

  function newTrack(id, isSting, dest, at) {
    var c = A().core(), k = compile(id, isSting); if (!c || !k) return null;
    var g = c.ctx.createGain(); g.connect(dest);
    return { id: id, kind: isSting ? 'sting' : 'bgm', ev: k.ev, len: k.len, secAt: k.secAt, loop: k.loop, g: g, idx: 0, startBeat: 0,
      t0: at, src: [], stop: false, done: false, endT: 0, killAt: 0 };
  }
  function pump(tr, now, c) {
    if (tr.stop) return;
    var guard = 0, e, ts, ok, voice, s, i;
    while (guard++ < 4000) {
      if (tr.idx >= tr.ev.length) {
        var endT = tr.t0 + tr.secAt(tr.len) - tr.secAt(tr.startBeat);
        if (tr.loop < 0) { tr.done = true; tr.endT = endT; return; }
        if (endT > now + LOOK) return;
        tr.t0 = endT; tr.startBeat = tr.loop; tr.idx = firstIdx(tr.ev, tr.loop); continue;
      }
      e = tr.ev[tr.idx]; ts = tr.t0 + tr.secAt(e.b) - tr.secAt(tr.startBeat);
      if (ts > now + LOOK) return;
      tr.idx++;
      if (ts < now - 0.25) continue; // far behind (tab was hidden): skip rather than burst
      ok = tr.kind === 'sting' ? c.live() : A().canMusic();
      if (!ok) continue;
      voice = VOICE[e.v]; if (!voice) continue;
      try {
        var dur = tr.secAt(e.b + e.d) - tr.secAt(e.b);
        s = voice(c, Math.max(ts, now), dur, e.m, e.g, tr.g);
        var end = Math.max(ts, now) + dur + 2.5;
        for (i = 0; i < s.length; i++) tr.src.push({ n: s[i], end: end });
        if (tr.src.length > 96) tr.src = tr.src.filter(function (x) { return x.end > now; });
      } catch (err) {}
    }
  }
  function dispose(tr) {
    if (!tr) return;
    tr.stop = true;
    for (var i = 0; i < tr.src.length; i++) { try { tr.src[i].n.stop(); } catch (e) {} }
    tr.src = [];
    try { tr.g.disconnect(); } catch (e) {}
  }
  function curve(param, t, dur, up, from) {
    var n = 33, a = new Float32Array(n), i, x;
    for (i = 0; i < n; i++) { x = i / (n - 1) * Math.PI / 2; a[i] = (up ? Math.sin(x) : Math.cos(x)) * from; }
    try {
      if (param.cancelScheduledValues) param.cancelScheduledValues(t);
      if (param.setValueCurveAtTime) param.setValueCurveAtTime(a, t, dur);
      else { param.setValueAtTime(a[0], t); param.linearRampToValueAtTime(a[n - 1], t + dur); }
    } catch (e) {}
  }
  function ensureTimer() { if (!timer && G.setInterval) timer = G.setInterval(tick, TICK); }
  function tick() {
    var c = A() && A().core(); if (!c) return;
    var now = c.ctx.currentTime, i;
    if (cur) pump(cur, now, c);
    if (old && now >= old.killAt) { dispose(old); old = null; }
    for (i = stings.length - 1; i >= 0; i--) {
      pump(stings[i], now, c);
      if (stings[i].done && now >= stings[i].endT + 3) { dispose(stings[i]); stings.splice(i, 1); }
    }
    if (!cur && !old && !stings.length && timer && G.clearInterval) { G.clearInterval(timer); timer = null; }
  }
  function isMenu(m) { return m === 'menu' || m === 'settings'; }
  function play(m) {
    var d = D(), id = m == null ? null : (d.moments[m] || (d.pieces[m] ? m : null));
    if (!id) { stop(0.6); return null; }
    var c = A().core();
    if (!c || !A().isUnlocked()) { pending = m; return id; }
    pending = null;
    if (cur && cur.id === id && !cur.stop) return id;
    var now = c.ctx.currentTime, fade = xf, prevMenu = cur && cur.moment ? isMenu(cur.moment) : false;
    if (cur && prevMenu && !isMenu(m)) fade = Math.min(fade, 1);
    if (!cur) fade = 1;
    if (old) { dispose(old); old = null; }
    if (cur) { curve(cur.g.gain, now, fade, false, cur.g.gain.value); cur.stop = true; cur.killAt = now + fade + 0.1; old = cur; }
    var tr = newTrack(id, false, c.musicDuck, now + 0.05);
    if (!tr) { cur = null; return null; }
    tr.moment = m; tr.g.gain.value = 0; curve(tr.g.gain, now, fade, true, 1);
    cur = tr; ensureTimer(); tick();
    return id;
  }
  function stop(fade) {
    pending = null;
    var c = A() && A().core(); if (!c) return;
    if (old) { dispose(old); old = null; }
    if (!cur) return;
    if (!(fade > 0)) { dispose(cur); cur = null; return; }
    var now = c.ctx.currentTime;
    curve(cur.g.gain, now, fade, false, cur.g.gain.value); cur.stop = true; cur.killAt = now + fade + 0.1; old = cur; cur = null; ensureTimer();
  }
  function sting(id) {
    var c = A() && A().core(), sd = D().stings[id];
    if (!c || !sd || !c.live()) return;
    var now = c.ctx.currentTime, tr = newTrack(id, true, c.sfxBus, now + 0.02);
    if (!tr) return;
    tr.g.gain.value = 0.9;
    while (stings.length >= 2) dispose(stings.shift());
    stings.push(tr);
    var dur = tr.secAt(tr.len);
    if (sd.stopBgm) stop(0.6); else if (sd.duck) A().duck(A().duckLevel(), Math.min(dur, 8), 0.4);
    ensureTimer(); pump(tr, now, c);
  }
  PL.music = {
    play: play, stop: stop, sting: sting, tick: tick,
    onUnlock: function () { if (pending != null) play(pending); },
    setXfade: function (s) { s = +s; xf = s === s ? Math.max(0.2, Math.min(4, s)) : 1.5; },
    current: function () { return cur ? cur.id : null; },
    activeTracks: function () { return (cur ? 1 : 0) + (old ? 1 : 0); },
    stingCount: function () { return stings.length; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
