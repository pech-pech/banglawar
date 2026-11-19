(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonAudio = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';
  var ctx = null, master = null, enabled = true, chargeOsc = null, chargeGain = null, chargeOsc2 = null;
  var tideOsc = null, tideOsc2 = null, tideGain = null, tideFilt = null, tideLfo = null, lastCharge = -1, lastTide = -1, lastLfo = -1;
  var noiseBuf = null, lastNear = -9, lastTick = -9, lastBounce = -9;
  var MASTER = 0.7;
  var comp = null, shaper = null, wantRun = false, hiddenSusp = false, unlockOn = false;
  var UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];
  var LAND_VN = 400; // shared land normal-speed normaliser (fx uses the same value)
  function live() { return ctx && (typeof ctx.state !== 'string' || ctx.state === 'running'); }
  function isHidden() { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }

  function now() { return ctx ? ctx.currentTime : 0; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function softClipCurve() {
    var n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 1.1) * 0.93; }
    return c;
  }

  // Resume when the context is suspended (autoplay policy, our own hidden suspend) or iOS 'interrupted'.
  function resume() {
    try {
      if (!ctx || isHidden()) return;
      if ((ctx.state === 'suspended' || ctx.state === 'interrupted') && ctx.resume) {
        var p = ctx.resume(); if (p && p.then) p.then(onRunning, function () {});
      } else onRunning();
    } catch (e) {}
  }
  function onRunning() { if (ctx && ctx.state === 'running') detachUnlock(); }

  function init() {
    try {
      if (!ctx) {
        var C = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
          (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext));
        if (!C) return false;
        ctx = new C();
        master = ctx.createGain();
        master.gain.value = enabled ? MASTER : 0;
        if (ctx.createDynamicsCompressor) {
          comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 6;
          comp.attack.value = 0.003; comp.release.value = 0.25;
          master.connect(comp);
          if (ctx.createWaveShaper) {
            shaper = ctx.createWaveShaper(); shaper.curve = softClipCurve();
            comp.connect(shaper); shaper.connect(ctx.destination);
          } else comp.connect(ctx.destination);
        } else master.connect(ctx.destination);
        try { ctx.onstatechange = function () { if (ctx.state === 'running') onRunning(); else if (!hiddenSusp) { resume(); attachUnlock(); } }; } catch (e) {}
      }
      resume();
      return true;
    } catch (e) { ctx = null; master = null; comp = null; shaper = null; return false; }
  }

  // Called from user gestures: create the context and resume it; a silent blip finishes the iOS unlock.
  function unlock() {
    try {
      wantRun = true;
      if (!init()) return false;
      if (ctx.state !== 'running' && ctx.createBuffer && ctx.createBufferSource) {
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      }
      return true;
    } catch (e) { return false; }
  }

  // Sound-toggle preview: wake the context, then a short tick once it runs.
  function preview() {
    try {
      if (!unlock()) return;
      if (live()) { tick(); return; }
      if (ctx.resume) { var p = ctx.resume(); if (p && p.then) p.then(function () { tick(); }, function () {}); }
    } catch (e) {}
  }

  function onGesture() { unlock(); }
  function attachUnlock() {
    if (unlockOn || typeof document === 'undefined' || !document.addEventListener) return;
    unlockOn = true;
    UNLOCK_EVENTS.forEach(function (n) { document.addEventListener(n, onGesture, true); });
  }
  function detachUnlock() {
    if (!unlockOn) return;
    unlockOn = false;
    UNLOCK_EVENTS.forEach(function (n) { document.removeEventListener(n, onGesture, true); });
  }

  // Background: silence the tide and suspend; resume on return.
  function onHide() {
    try {
      if (tideGain) tideGain.gain.value = 0;
      lastTide = -1;
      stopCharge();
      if (ctx && ctx.state === 'running' && ctx.suspend) { hiddenSusp = true; var p = ctx.suspend(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) {}
  }
  function onShow() {
    hiddenSusp = false;
    if (!ctx || !wantRun) return;
    if (ctx.state !== 'running') attachUnlock(); // a gesture can rescue it if resume() is refused
    resume();
  }
  function onVis() { if (isHidden()) onHide(); else onShow(); }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', onVis);
    attachUnlock();
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pageshow', function () { if (!isHidden()) onShow(); });
    window.addEventListener('focus', function () { if (!isHidden()) onShow(); });
  }

  function setEnabled(on) {
    try {
      enabled = !!on;
      if (master) master.gain.value = enabled ? MASTER : 0;
      if (!enabled) { stopCharge(); if (tideGain) tideGain.gain.value = 0; lastTide = -1; }
    } catch (e) {}
  }

  // Single enveloped oscillator, optional lowpass and detune.
  function tone(freq, dur, type, vol, slideTo, delay, cutoff, detune) {
    try {
      if (!ctx || !enabled || !live()) return;
      var t = now() + (delay || 0);
      var o = ctx.createOscillator(), g = ctx.createGain(), out = g;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(Math.max(1, freq), t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      if (detune && o.detune) o.detune.value = detune;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.01, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      if (cutoff && ctx.createBiquadFilter) {
        var f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = cutoff;
        g.connect(f); out = f;
      }
      out.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) {}
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    var n = Math.floor(ctx.sampleRate * 1.0), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    var s = 12345; // local LCG, deterministic, no Math.random
    for (var i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 2147483648) - 1; }
    noiseBuf = b;
    return b;
  }

  // Filtered noise burst. type: lowpass/bandpass/highpass.
  function noise(dur, vol, type, freq, freqTo, delay, q) {
    try {
      if (!ctx || !enabled || !live() || !ctx.createBufferSource) return;
      var t = now() + (delay || 0);
      var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = getNoise();
      f.type = type || 'lowpass';
      f.frequency.setValueAtTime(freq, t);
      if (freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t + dur);
      if (q) f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.03);
    } catch (e) {}
  }

  function stopCharge() {
    try {
      var t = now(), te = t + 0.02;
      if (chargeGain) {
        try { chargeGain.gain.cancelScheduledValues(t); chargeGain.gain.setValueAtTime(chargeGain.gain.value, t); chargeGain.gain.linearRampToValueAtTime(0, t + 0.015); } catch (e) {}
      }
      if (chargeOsc) { try { chargeOsc.stop(te); } catch (e) {} chargeOsc = null; }
      if (chargeOsc2) { try { chargeOsc2.stop(te); } catch (e) {} chargeOsc2 = null; }
      chargeGain = null; lastCharge = -1;
    } catch (e) {}
  }

  function charge(level) {
    try {
      level = clamp(num(level, 0), 0, 1);
      if (!ctx || !enabled || level <= 0) { stopCharge(); return; }
      if (!chargeOsc) {
        chargeOsc = ctx.createOscillator(); chargeOsc2 = ctx.createOscillator(); chargeGain = ctx.createGain();
        chargeOsc.type = 'triangle'; chargeOsc2.type = 'sine';
        chargeGain.gain.value = 0.0001; lastCharge = -1;
        chargeOsc.connect(chargeGain); chargeOsc2.connect(chargeGain); chargeGain.connect(master);
        chargeOsc.start(); chargeOsc2.start();
      }
      var q = Math.round(level * 64) / 64;
      if (q === lastCharge) return;
      lastCharge = q; level = q;
      var f = 180 + level * 520, t = now();
      if (chargeOsc.frequency.setTargetAtTime) {
        chargeOsc.frequency.setTargetAtTime(f, t, 0.03);
        chargeOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.03); // fifth above, rises with charge
        chargeGain.gain.setTargetAtTime(0.18 + level * 0.14, t, 0.05);
      } else { chargeOsc.frequency.value = f; chargeOsc2.frequency.value = f * 1.5; }
    } catch (e) {}
  }

  function jump() {
    try {
      stopCharge();
      tone(300, 0.14, 'square', 0.3, 700, 0, 2400);
      tone(150, 0.16, 'sine', 0.22, 360);
      noise(0.12, 0.2, 'bandpass', 600, 2400, 0, 1.2);
    } catch (e) {}
  }

  // vn: landing normal speed, scaled by LAND_VN.
  function land(vn) {
    try {
      var v = clamp(Math.abs(num(vn, 0)), 0, LAND_VN) / LAND_VN;
      tone(120 - v * 55, 0.12 + v * 0.22, 'sine', 0.3 + v * 0.7, 36);
      tone(220, 0.05, 'triangle', 0.1 + v * 0.2, 90);
      tone(320, 0.09 + v * 0.1, 'triangle', 0.18 + v * 0.2, 180, 0, 1500); // mid thump for phone speakers
      noise(0.05 + v * 0.14, 0.12 + v * 0.35, 'bandpass', 700 + v * 500, 200, 0, 0.8);
      if (v > 0.6) tone(62, 0.35, 'sine', (v - 0.6) * 1.2, 30, 0.02); // sub boom on hard hits
    } catch (e) {}
  }

  // Pitch ladder: major-ish scale steps climbing with n, chime with octave overtone.
  var LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
  function chain(n) {
    try {
      n = clamp(Math.floor(num(n, 1)), 1, 12);
      var f = 440 * Math.pow(2, LADDER[n - 1] / 12);
      var hot = n / 12;
      tone(f, 0.12, 'sine', 0.32, null, 0, 6000);
      tone(f * 1.5, 0.14, 'sine', 0.2, null, 0.06);
      tone(f * 2, 0.22 + hot * 0.15, 'triangle', 0.12 + hot * 0.1, null, 0.1, 7000);
      if (n >= 4) tone(f * 3, 0.1, 'sine', 0.08 + hot * 0.08, null, 0.14);
    } catch (e) {}
  }

  // Tide rumble: detuned saws through a lowpass, slow LFO swell. Louder and brighter as level rises.
  function tideLevel(level) {
    try {
      level = clamp(num(level, 0), 0, 1);
      if (!ctx || !enabled || level <= 0) {
        if (tideGain) tideGain.gain.value = 0;
        lastTide = -1;
        return;
      }
      if (!tideOsc) {
        tideOsc = ctx.createOscillator(); tideOsc2 = ctx.createOscillator();
        tideGain = ctx.createGain(); tideFilt = ctx.createBiquadFilter();
        tideOsc.type = 'sawtooth'; tideOsc.frequency.value = 46;
        tideOsc2.type = 'sawtooth'; tideOsc2.frequency.value = 47.6;
        tideFilt.type = 'lowpass'; tideFilt.frequency.value = 300; tideFilt.Q.value = 2;
        tideGain.gain.value = 0;
        tideOsc.connect(tideFilt); tideOsc2.connect(tideFilt);
        tideFilt.connect(tideGain); tideGain.connect(master);
        tideOsc.start(); tideOsc2.start();
        try {
          tideLfo = ctx.createOscillator();
          var lg = ctx.createGain();
          tideLfo.frequency.value = 0.35; lg.gain.value = 120;
          tideLfo.connect(lg); lg.connect(tideFilt.frequency);
          tideLfo.start();
        } catch (e) { tideLfo = null; }
      }
      var q = Math.round(level * 64) / 64;
      if (q === lastTide) return;
      lastTide = q; level = q;
      var t = now();
      if (tideGain.gain.setTargetAtTime) {
        tideGain.gain.setTargetAtTime(level * 0.2, t, 0.1);
        tideFilt.frequency.setTargetAtTime(320 + level * 700, t, 0.2);
        var lfo = 0.3 + level * 1.4;
        if (tideLfo && lfo !== lastLfo) { lastLfo = lfo; tideLfo.frequency.setTargetAtTime(lfo, t, 0.3); }
      } else { tideGain.gain.value = level * 0.2; }
    } catch (e) {}
  }

  function over() {
    try {
      stopCharge();
      if (tideGain) tideGain.gain.value = 0;
      lastTide = -1;
      tone(330, 0.25, 'triangle', 0.4, 220);
      tone(247, 0.3, 'triangle', 0.4, 150, 0.22);
      tone(165, 0.6, 'sawtooth', 0.35, 55, 0.48, 900);
      noise(0.7, 0.18, 'lowpass', 700, 80, 0.45, 0.8);
    } catch (e) {}
  }

  // Medal fanfare: bronze < silver < gold < moon, rising arpeggio with sparkle.
  var MEDALS = {
    bronze: { notes: [0, 4, 7], base: 330, wave: 'triangle', gain: 0.26 },
    silver: { notes: [0, 4, 7, 12], base: 392, wave: 'triangle', gain: 0.3 },
    gold: { notes: [0, 4, 7, 12, 16], base: 440, wave: 'sine', gain: 0.34 },
    moon: { notes: [0, 4, 7, 12, 16, 19, 24], base: 494, wave: 'sine', gain: 0.38 }
  };
  function medal(name) {
    try {
      var key = String(name == null ? '' : name).toLowerCase();
      var m = MEDALS[key];
      if (!m) return;
      var step = key === 'moon' ? 0.085 : 0.1;
      for (var i = 0; i < m.notes.length; i++) {
        var f = m.base * Math.pow(2, m.notes[i] / 12), d = i * step;
        tone(f, 0.28, m.wave, m.gain, null, d, 6500);
        tone(f * 2, 0.2, 'sine', m.gain * 0.3, null, d + 0.02);
      }
      var end = m.notes.length * step;
      if (key === 'gold' || key === 'moon') {
        tone(m.base * 2, 0.7, 'sine', 0.22, null, end, 7000);
        tone(m.base * 3, 0.6, 'sine', 0.1, null, end + 0.05);
        noise(0.4, 0.05, 'highpass', 6000, 9000, end, 0.5);
      }
      if (key === 'moon') tone(m.base / 2, 1.0, 'triangle', 0.2, null, end);
    } catch (e) {}
  }

  // Near miss / graze whoosh. Rate-limited so a cluster does not spam.
  function near() {
    try {
      if (!ctx || !enabled) return;
      var t = now();
      if (t - lastNear < 0.15) return;
      lastNear = t;
      noise(0.2, 1.4, 'bandpass', 500, 2600, 0, 2);
      tone(900, 0.14, 'sine', 0.5, 1500);
    } catch (e) {}
  }

  // Repel / bounce pad boing.
  function bounce() {
    try {
      if (!ctx || !enabled) return;
      var t = now();
      if (t - lastBounce < 0.05) return;
      lastBounce = t;
      tone(220, 0.22, 'sine', 0.4, 620);
      tone(440, 0.16, 'triangle', 0.14, 1000, 0.03, 3000);
      noise(0.05, 0.1, 'lowpass', 1200, 300);
    } catch (e) {}
  }

  // Crumbling body: noise rattle plus low crunch.
  function crumble() {
    try {
      if (!ctx || !enabled) return;
      noise(0.22, 1.0, 'bandpass', 1400, 400, 0, 1.5);
      noise(0.16, 0.8, 'bandpass', 1000, 300, 0.09, 1.5);
      noise(0.2, 0.65, 'bandpass', 800, 250, 0.2, 1.5);
      tone(240, 0.25, 'sawtooth', 0.3, 120, 0, 1200); // mid crunch
      tone(90, 0.3, 'sawtooth', 0.2, 45, 0, 500);
    } catch (e) {}
  }

  // Tiny UI / countdown tick. Rate-limited.
  function tick() {
    try {
      if (!ctx || !enabled) return;
      var t = now();
      if (t - lastTick < 0.04) return;
      lastTick = t;
      tone(1500, 0.04, 'square', 0.6, 1100, 0, 4000);
    } catch (e) {}
  }

  return {
    init: init, unlock: unlock, preview: preview, setEnabled: setEnabled, charge: charge, jump: jump, land: land, chain: chain,
    tideLevel: tideLevel, LAND_VN: LAND_VN, over: over, medal: medal, near: near, bounce: bounce, crumble: crumble, tick: tick
  };
});
