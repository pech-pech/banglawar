(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonAudio = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';
  var ctx = null, master = null, enabled = true, chargeOsc = null, chargeGain = null;
  var tideOsc = null, tideGain = null, lastChain = 0;
  var MASTER = 0.15;

  function now() { return ctx ? ctx.currentTime : 0; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function init() {
    try {
      if (!ctx) {
        var C = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
          (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext));
        if (!C) return false;
        ctx = new C();
        master = ctx.createGain();
        master.gain.value = enabled ? MASTER : 0;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended' && ctx.resume) { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
      return true;
    } catch (e) { ctx = null; master = null; return false; }
  }

  function setEnabled(on) {
    try {
      enabled = !!on;
      if (master) master.gain.value = enabled ? MASTER : 0;
      if (!enabled) { stopCharge(); }
    } catch (e) {}
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    try {
      if (!ctx || !enabled) return;
      var t = now() + (delay || 0);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function stopCharge() {
    try {
      if (chargeOsc) { try { chargeOsc.stop(); } catch (e) {} chargeOsc = null; chargeGain = null; }
    } catch (e) {}
  }

  function charge(level) {
    try {
      level = clamp(num(level, 0), 0, 1);
      if (!ctx || !enabled || level <= 0) { stopCharge(); return; }
      if (!chargeOsc) {
        chargeOsc = ctx.createOscillator(); chargeGain = ctx.createGain();
        chargeOsc.type = 'triangle';
        chargeGain.gain.value = 0.25;
        chargeOsc.connect(chargeGain); chargeGain.connect(master);
        chargeOsc.start();
      }
      var f = 180 + level * 520;
      if (chargeOsc.frequency.setTargetAtTime) chargeOsc.frequency.setTargetAtTime(f, now(), 0.03);
      else chargeOsc.frequency.value = f;
    } catch (e) {}
  }

  function jump() { stopCharge(); tone(300, 0.14, 'square', 0.25, 700); }

  function land(vn) {
    try {
      var v = clamp(Math.abs(num(vn, 0)), 0, 400) / 400;
      tone(110 - v * 40, 0.12 + v * 0.18, 'sine', 0.3 + v * 0.7, 40);
      tone(220, 0.05, 'triangle', 0.1 + v * 0.2, 90);
    } catch (e) {}
  }

  function chain(n) {
    try {
      n = clamp(Math.floor(num(n, 1)), 1, 12);
      var f = 520 * Math.pow(1.0595, n * 2);
      tone(f, 0.09, 'sine', 0.35);
      tone(f * 1.5, 0.12, 'sine', 0.25, null, 0.07);
      lastChain = n;
    } catch (e) {}
  }

  function tideLevel(level) {
    try {
      level = clamp(num(level, 0), 0, 1);
      if (!ctx || !enabled || level <= 0) {
        if (tideGain) tideGain.gain.value = 0;
        return;
      }
      if (!tideOsc) {
        tideOsc = ctx.createOscillator(); tideGain = ctx.createGain();
        tideOsc.type = 'sawtooth'; tideOsc.frequency.value = 48;
        tideGain.gain.value = 0;
        tideOsc.connect(tideGain); tideGain.connect(master);
        tideOsc.start();
      }
      tideGain.gain.value = level * 0.3;
    } catch (e) {}
  }

  function over() {
    try {
      stopCharge();
      if (tideGain) tideGain.gain.value = 0;
      tone(330, 0.25, 'triangle', 0.4, 220);
      tone(247, 0.3, 'triangle', 0.4, 150, 0.22);
      tone(165, 0.6, 'sawtooth', 0.35, 55, 0.48);
    } catch (e) {}
  }

  return { init: init, setEnabled: setEnabled, charge: charge, jump: jump, land: land, chain: chain, tideLevel: tideLevel, over: over };
});
