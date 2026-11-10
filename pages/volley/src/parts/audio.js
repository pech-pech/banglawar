(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Four synth sounds (fire, hit, hurt, door/levelup). L-HB-1/L-HB-2: unlock on first pointerdown (capture) and keydown,
// suspend while hidden or paused, voice cap with headroom for important sounds, own RNG stream (never the sim's).
// F0 #11 sound shell (spec 07 s2, s6, s9): voices -> sfx bus -> master (volume x mute) -> limiter. A music bus exists for the
// later sequencer. Levels live in their own key 'volley.settings.v1' under `.audio` (meta.js owns `.haptics`; a save wipe keeps it).
var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, paused = false, voices = 0, played = 0, dropped = 0;
var CAP = 16, LOW_CAP = 10;                      // low-priority sounds (fire, hit) stop at 10, leaving 6 for hurt/door/levelup
var PRIO = { fire: 0, hit: 0, kill: 1, hurt: 2, door: 2, levelup: 2 };
// ---- one seeded audio stream (spec 07 s2 "Random"): seeded from the run seed, never draws from the sim stream (L-TD-6) ----
var rs = 0x5eed1234, seed0 = 0;
function rnd(){ rs |= 0; rs = rs + 0x6D2B79F5 | 0; var t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

// ---- settings ----
var SKEY = 'volley.settings.v1';
var LEVELS = { off: 0, low: 0.35, mid: 0.6, high: 0.85 };   // spec 07 s9 gain table
var BASE = 0.55;                                            // today's master gain; 'mid' sfx + master 1 = today's mix (guess: keeps P1.7 loudness)
var DEF = { v: 1, master: 1, sfx: 'mid', music: 'mid', muted: false };
var set = clean(null);
function clean(o){
  var a = {}; o = (o && typeof o === 'object') ? o : {};
  a.v = 1;
  a.master = (typeof o.master === 'number' && o.master >= 0 && o.master <= 1) ? o.master : DEF.master;
  a.sfx = (typeof o.sfx === 'string' && o.sfx in LEVELS) ? o.sfx : DEF.sfx;
  a.music = (typeof o.music === 'string' && o.music in LEVELS) ? o.music : DEF.music;
  a.muted = typeof o.muted === 'boolean' ? o.muted : DEF.muted;
  return a;
}
function store(){ try { return G.localStorage || null; } catch (e) { return null; } }
function readAll(){ var st = store(); if (!st) return null; try { var t = st.getItem(SKEY); if (!t) return null; var o = JSON.parse(t); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; } catch (e) { return null; } }
function loadSettings(){
  var all = readAll();
  if (all && all.audio) { set = clean(all.audio); return; }
  set = clean(null);
  // One-time carry-over: P1.7 kept sound-off as SOUND:false in 'volley.tune'.
  try { var st = store(), t = st && st.getItem('volley.tune'), o = t && JSON.parse(t); if (o && o.SOUND === false) set.muted = true; } catch (e) {}
}
function saveSettings(){
  var st = store(); if (!st) return false;
  try { var all = readAll() || {}; all.audio = clean(set); st.setItem(SKEY, JSON.stringify(all)); return true; } catch (e) { return false; }   // read-modify-write: keeps meta.js's fields
}
function sfxGain(){ return LEVELS[set.sfx] / LEVELS.mid; }
function musicGain(){ return LEVELS[set.music] / LEVELS.mid; }
function masterGain(){ return set.muted ? 0 : BASE * set.master; }
function applyGains(){
  if (!ctx || !master) return;
  var t = ctx.currentTime;
  try { master.gain.setTargetAtTime(masterGain(), t, 0.015); sfxBus.gain.setTargetAtTime(sfxGain(), t, 0.015); musicBus.gain.setTargetAtTime(musicGain(), t, 0.015); }
  catch (e) { master.gain.value = masterGain(); sfxBus.gain.value = sfxGain(); musicBus.gain.value = musicGain(); }
}
// Off stops scheduling (spec 07 s9), it is not only a gain of 0.
function on(){ return !set.muted && set.sfx !== 'off' && set.master > 0; }
loadSettings();
// V.TUNE.SOUND (tune drawer, Intel tab, pause button) is a view of `muted`, so every old writer lands in the settings key.
if (V.TUNE) {
  try {
    delete V.TUNE.SOUND;
    Object.defineProperty(V.TUNE, 'SOUND', { enumerable: true, configurable: true,
      get: function(){ return !set.muted; }, set: function(v){ setMuted(!v); } });
  } catch (e) {}
}
function setMuted(m){ m = !!m; if (set.muted === m) return; set.muted = m; applyGains(); saveSettings(); }

function make(){
  if (ctx) return ctx;
  var AC = G.AudioContext || G.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }
  build(ctx);
  return ctx;
}
function build(c){
  var comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.12;
  master = c.createGain(); master.gain.value = masterGain();
  sfxBus = c.createGain(); sfxBus.gain.value = sfxGain(); sfxBus.connect(master);
  musicBus = c.createGain(); musicBus.gain.value = musicGain(); musicBus.connect(master);
  master.connect(comp); comp.connect(c.destination);
  var n = Math.floor(c.sampleRate * 0.25); noiseBuf = c.createBuffer(1, n, c.sampleRate);
  var d = noiseBuf.getChannelData(0); var save = rs; rs = 0x0badf00d;
  for (var i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  rs = save;
}
function unlock(){
  var c = make(); if (!c) return;
  if (c.state === 'suspended' && !paused && !(G.document && document.hidden)) c.resume().catch(function(){});
}
function voice(node, end){ voices++; played++; node.onended = function(){ voices = Math.max(0, voices - 1); }; }

function env(c, g, t, a, peak, dur){ g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }

var SND = {
  fire: function(c, t, o){
    var os = c.createOscillator(), g = c.createGain(), f = 880 + rnd() * 120;
    os.type = 'square'; os.frequency.setValueAtTime(f, t); os.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.07);
    env(c, g, t, 0.003, 0.09, 0.08); os.connect(g); g.connect(o); os.start(t); os.stop(t + 0.09); return os;
  },
  hit: function(c, t, o, big){
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; s.playbackRate.value = 0.8 + rnd() * 0.4;
    f.type = 'lowpass'; f.frequency.value = big ? 1400 : 2200;
    env(c, g, t, 0.002, big ? 0.45 : 0.28, big ? 0.22 : 0.1); s.connect(f); f.connect(g); g.connect(o);
    s.start(t, rnd() * 0.1, 0.25); s.stop(t + (big ? 0.24 : 0.12));
    var th = c.createOscillator(), tg = c.createGain(); th.type = 'sine';
    th.frequency.setValueAtTime(big ? 120 : 170, t); th.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    env(c, tg, t, 0.002, big ? 0.5 : 0.25, 0.14); th.connect(tg); tg.connect(o); th.start(t); th.stop(t + 0.15);
    return s;
  },
  hurt: function(c, t, o){
    var os = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    os.type = 'sawtooth'; os.frequency.setValueAtTime(240, t); os.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    f.type = 'lowpass'; f.frequency.value = 1200;
    env(c, g, t, 0.004, 0.5, 0.28); os.connect(f); f.connect(g); g.connect(o); os.start(t); os.stop(t + 0.3); return os;
  },
  door: function(c, t, o, lv){
    var notes = lv ? [523, 659, 784, 1047] : [392, 523, 659], last = null;
    for (var i = 0; i < notes.length; i++) {
      var os = c.createOscillator(), g = c.createGain(), ti = t + i * 0.075;
      os.type = 'triangle'; os.frequency.value = notes[i];
      env(c, g, ti, 0.005, 0.3, 0.22); os.connect(g); g.connect(o); os.start(ti); os.stop(ti + 0.24); last = os;
    }
    return last;
  }
};

function play(name, opt){
  if (!on() || !ctx || !sfxBus) return false;
  var p = PRIO[name] || 0;
  if (voices >= CAP || (p === 0 && voices >= LOW_CAP)) { dropped++; return false; }
  // Scheduled even while suspended (L-HB-1): it sounds once resume() lands instead of being dropped.
  var t = ctx.currentTime + 0.005, n;
  if (name === 'fire') n = SND.fire(ctx, t, sfxBus);
  else if (name === 'hit') n = SND.hit(ctx, t, sfxBus, false);
  else if (name === 'kill') n = SND.hit(ctx, t, sfxBus, true);
  else if (name === 'hurt') n = SND.hurt(ctx, t, sfxBus);
  else if (name === 'door') n = SND.door(ctx, t, sfxBus, false);
  else if (name === 'levelup') n = SND.door(ctx, t, sfxBus, true);
  if (!n) return false;
  voice(n); return true;
}

if (G.addEventListener) {
  G.addEventListener('pointerdown', unlock, true);
  G.addEventListener('keydown', unlock, true);
  if (G.document) document.addEventListener('visibilitychange', function(){
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(function(){});
    else if (!paused) ctx.resume().catch(function(){});
  });
}

V.Audio = {
  play: play,
  unlock: unlock,
  seed: function(s){ seed0 = s | 0; rs = (seed0 ^ 0x5eed1234) | 0; },
  // The audio stream itself (pitch/timing jitter for future cues). Tests: V.Audio.seed(n); V.Audio.rand() is repeatable and never moves the sim RNG.
  rand: function(){ return rnd(); },
  get seedValue(){ return seed0; },
  // Settings (spec 07 s9). Levels: 'off' | 'low' | 'mid' | 'high'. Master 0..1. Each setter saves at once.
  LEVELS: LEVELS, SETTINGS_KEY: SKEY,
  settings: function(){ return clean(set); },
  setMuted: setMuted,
  get muted(){ return set.muted; },
  setMaster: function(v){ v = +v; if (!(v >= 0)) v = 0; if (v > 1) v = 1; set.master = v; applyGains(); saveSettings(); },
  setLevel: function(bus, lv){ if (!(lv in LEVELS) || (bus !== 'sfx' && bus !== 'music')) return false; set[bus] = lv; applyGains(); saveSettings(); return true; },
  reloadSettings: function(){ loadSettings(); applyGains(); return clean(set); },
  get gains(){ return { master: masterGain(), sfx: sfxGain(), music: musicGain() }; },
  get musicBus(){ return musicBus; },
  // Game pause: stay suspended until the game resumes.
  setPaused: function(p){
    paused = !!p; if (!ctx) return;
    if (paused) ctx.suspend().catch(function(){}); else if (!(G.document && document.hidden)) ctx.resume().catch(function(){});
  },
  // For tests (OfflineAudioContext burst render, L-HB-2 item 5).
  renderBurst: function(spec){
    var OAC = G.OfflineAudioContext; if (!OAC) return Promise.resolve(null);
    var c = new OAC(1, 44100 * 1, 44100), sv = { ctx: ctx, master: master, sfxBus: sfxBus, musicBus: musicBus, noiseBuf: noiseBuf, voices: voices };
    build(c); var m = master; m.gain.value = BASE; var t = 0.01;   // mix-headroom test: independent of the player's volume/mute
    (spec || ['hurt', 'levelup', 'kill', 'kill', 'kill']).forEach(function(nm, i){
      if (nm === 'fire') SND.fire(c, t, m); else if (nm === 'hit') SND.hit(c, t, m, false); else if (nm === 'kill') SND.hit(c, t, m, true);
      else if (nm === 'hurt') SND.hurt(c, t, m); else SND.door(c, t, m, nm === 'levelup');
    });
    master = sv.master; sfxBus = sv.sfxBus; musicBus = sv.musicBus; noiseBuf = sv.noiseBuf;
    return c.startRendering().then(function(b){ var d = b.getChannelData(0), pk = 0; for (var i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); return pk; });
  },
  get state(){ return ctx ? ctx.state : 'none'; },
  get voices(){ return voices; },
  get played(){ return played; },
  get dropped(){ return dropped; },
  CAP: CAP
};
})();
