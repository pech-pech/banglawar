// audio.js - PL.audio: WebAudio synth blips, no files. No-op when AudioContext is absent.
(function (G) {
  'use strict';
  var PL = G.PL = G.PL || {};
  var MAXG = 0.15, ctx = null, master = null, muted = false, tried = false;
  function Ctor() { return G.AudioContext || G.webkitAudioContext || null; }
  function ensure() {
    if (ctx) return ctx;
    if (tried) return null;
    var C = Ctor(); if (!C) return null;
    tried = true;
    try {
      ctx = new C(); master = ctx.createGain();
      master.gain.value = muted ? 0 : MAXG; master.connect(ctx.destination);
    } catch (e) { ctx = null; master = null; }
    return ctx;
  }
  function init() {
    if (!Ctor()) return;
    var c = ensure();
    try { if (c && c.state === 'suspended' && c.resume) { var pr = c.resume(); if (pr && pr.catch) pr.catch(function () {}); } } catch (e) {}
  }
  // blip: freq sweep f0->f1 over dur seconds, peak volume v (0..1 of master)
  function blip(type, f0, f1, dur, v) {
    if (muted || !ctx || !master) return;
    try {
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(Math.max(0.0001, Math.min(1, v)), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  var LAND_MAX = 900;
  var SND = {
    flip: function () { blip('square', 330, 660, 0.09, 0.5); },
    dive: function () { blip('sawtooth', 500, 160, 0.18, 0.45); },
    land: function (st) {
      var s = (st && +st.lastLandSpeed) || 0, v = Math.max(0.15, Math.min(1, s / LAND_MAX));
      blip('triangle', 140, 60, 0.12, v);
    },
    death: function () { blip('sawtooth', 300, 40, 0.5, 0.8); },
    win: function () { blip('square', 523, 523, 0.1, 0.5); blip('square', 659, 659, 0.14, 0.5); blip('square', 784, 1047, 0.25, 0.5); },
    crumble: function () { blip('sawtooth', 120, 50, 0.2, 0.4); },
    ride: function () { blip('sine', 220, 260, 0.06, 0.2); }
  };
  function nameOf(e) { return typeof e === 'string' ? e : e && (e.type || e.name || e.kind || e.id); }
  function onEvents(events, state) {
    if (muted || !events || !events.length || !ctx) return;
    for (var i = 0; i < events.length; i++) {
      var f = SND[nameOf(events[i])];
      if (f) { try { f(state); } catch (e) {} }
    }
  }
  function setMuted(b) {
    muted = !!b;
    try { if (master) master.gain.value = muted ? 0 : MAXG; } catch (e) {}
  }
  PL.audio = { init: init, onEvents: onEvents, setMuted: setMuted, isMuted: function () { return muted; }, MAX_GAIN: MAXG };
})(typeof globalThis !== 'undefined' ? globalThis : this);
