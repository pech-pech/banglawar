(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// F1 SOUND (pick 13, spec 07). Every sound is made here in code with Web Audio: no files, no network, no voice.
//   Engine (07 s2, s6): one AudioContext; buses combat / threat / ui -> sfx -> master, music -> master; master -> safety limiter.
//   One-shot cues are recipes (oscillators, noise, envelopes, filters) baked once into buffers with OfflineAudioContext, then played as
//   buffer + gain. Until a cue is baked it plays live from the same recipe (same sound, not a stand-in). Unknown names play nothing and
//   add 1 to `missing` (QA-048, W-009). Tells, the mortar whistle and other timed sounds are live voices sized from the sim.
//   Voice cap 24 (4 held for priority 3), per-cue caps and gaps, oldest priority-1 voice stolen when full (L-HB-2 item 3).
//   Own seeded stream (L-TD-6, L-HB-2 item 4): seeded from the run seed, never draws from the sim stream.
//   Music: live step sequencer (25 ms timer, 120 ms look-ahead on the audio clock). Ch1 loop, boss and home versions (pick 39).
//   Lifecycle (07 s8): unlock in capture phase on pointerdown/pointerup/touchend/click/keydown; suspended while hidden or paused;
//   sounds asked for while suspended are scheduled and play once resume() lands (L-HB-1).
//   Settings in their own key 'volley.settings.v1' under `.audio` (meta.js owns `.haptics`, prompts.js `.prompts`).
// API kept from F0: play(name, opts), unlock, seed, rand, settings, setMuted, muted, setMaster, setLevel, reloadSettings, gains,
//   musicBus, setPaused, renderBurst, state, voices, played, dropped, CAP. New: event(e, S), step(S), music(v), cue list, board().
// Every level, time and pitch below is a guess to be tuned by ear unless marked [spec]. Nothing here has been heard by M.
var ctx = null, master = null, sfxBus = null, musicBus = null, comp = null, paused = false, played = 0, dropped = 0, missing = 0, merged = 0;
var bus = {}, musicIn = null, musicDuck = null, musicFilt = null, musicVer = null;
var CAP = 24, HELD = 4;                               // [spec] 24 one-shot voices, 4 of them held for priority 3
var live = [];                                        // {n, g, pri, name, grp, end}
// ---- one seeded audio stream (07 s2 "Random") ----
var rs = 0x5eed1234, seed0 = 0;
function rnd(){ rs |= 0; rs = rs + 0x6D2B79F5 | 0; var t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

// ---- settings ----
var SKEY = 'volley.settings.v1';
var LEVELS = { off: 0, low: 0.35, mid: 0.6, high: 0.85 };   // [spec] 07 s9 gain table
var BASE = 0.55;                                            // master gain at 'mid' (guess, kept from P1.7)
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
  try { var st = store(), t = st && st.getItem('volley.tune'), o = t && JSON.parse(t); if (o && o.SOUND === false) set.muted = true; } catch (e) {}   // P1.7 carry-over
}
function saveSettings(){
  var st = store(); if (!st) return false;
  try { var all = readAll() || {}; all.audio = clean(set); st.setItem(SKEY, JSON.stringify(all)); return true; } catch (e) { return false; }   // keeps other owners' fields
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
function on(){ return !set.muted && set.sfx !== 'off' && set.master > 0; }               // Off stops scheduling (07 s9)
function musicOn(){ return !set.muted && set.music !== 'off' && set.master > 0; }
loadSettings();
if (V.TUNE) {   // V.TUNE.SOUND (tune drawer, pause button) is a view of `muted`
  try { delete V.TUNE.SOUND; Object.defineProperty(V.TUNE, 'SOUND', { enumerable: true, configurable: true, get: function(){ return !set.muted; }, set: function(v){ setMuted(!v); } }); } catch (e) {}
}
function setMuted(m){ m = !!m; if (set.muted === m) return; set.muted = m; applyGains(); saveSettings(); }

// ---- synth helpers (shared by baking and live voices) ----
function mf(m){ return 440 * Math.pow(2, (m - 69) / 12); }
function nzBuf(c){
  if (c._pvN) return c._pvN;
  var n = Math.floor(c.sampleRate * 1.0), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), s = 0x0badf00d;
  for (var i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 4294967296) * 2 - 1; }   // fixed noise, not the audio stream
  c._pvN = b; return b;
}
function env(g, t, a, peak, d){ g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.005, d)); }
// tone: w wave, f start Hz, f1 end Hz (exp glide over fd or d), d length, v peak, a attack, lp low-pass, q, det detune cents
function tone(c, o, t, p){
  var os = c.createOscillator(), g = c.createGain(), out = os;
  os.type = p.w || 'sine'; os.frequency.setValueAtTime(p.f, t);
  if (p.f1) os.frequency.exponentialRampToValueAtTime(Math.max(1, p.f1), t + (p.fd || p.d));
  if (p.det) os.detune.value = p.det;
  if (p.lp) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.lp; f.Q.value = p.q || 0.7; os.connect(f); out = f; }
  out.connect(g); env(g, t, p.a || 0.003, p.v || 0.3, p.d); g.connect(o);
  os.start(t); os.stop(t + p.d + 0.03); return os;
}
// noise: d, v, lp | hp | bp (Hz), f1 filter end, q, r playback rate, a attack
function noise(c, o, t, p){
  var s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  s.buffer = nzBuf(c); s.loop = true; s.playbackRate.value = p.r || 1;
  f.type = p.hp ? 'highpass' : (p.bp ? 'bandpass' : 'lowpass'); f.frequency.setValueAtTime(p.hp || p.bp || p.lp || 8000, t);
  if (p.f1) f.frequency.exponentialRampToValueAtTime(p.f1, t + p.d);
  f.Q.value = p.q || 0.7; s.connect(f); f.connect(g); env(g, t, p.a || 0.002, p.v || 0.3, p.d); g.connect(o);
  s.start(t, p.off || 0); s.stop(t + p.d + 0.03); return s;
}
function notes(c, o, t, list, step, p){ var last = null; for (var i = 0; i < list.length; i++) { var q = {}; for (var k in p) q[k] = p[k]; q.f = list[i] > 20 ? list[i] : mf(list[i]); last = tone(c, o, t + i * step, q); } return last; }
function M(list){ return list.map(mf); }
function wob(c, o, t, f, d, v, rate, depth){   // soft warble: sine with a slow pitch wobble
  var os = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
  os.frequency.value = f; lfo.frequency.value = rate; lg.gain.value = depth; lfo.connect(lg); lg.connect(os.frequency);
  os.connect(g); env(g, t, 0.04, v, d); g.connect(o); os.start(t); lfo.start(t); os.stop(t + d + 0.03); lfo.stop(t + d + 0.03); return os;
}

// ---- cue table (07 s4). [id, bus, pri, gap ms, cap, length s, variants, recipe(c, o, t, v, opts)] ----
// bus: c combat, t threat, u ui. pri 3 never dropped, 2 important, 1 may drop. live: recipe runs per play with opts.d (never baked).
var KEY = [62, 65, 69, 74, 77, 81];   // D minor, the chapter key (guess)
var C = {};
function cue(name, id, b, pri, gap, cap, d, vars, fn, liveCue){ C[name] = { id: id, bus: b, pri: pri, gap: gap / 1000, cap: cap, d: d, vars: vars || 1, fn: fn, live: !!liveCue }; }
// 4.1 hero, rounds, pickups
cue('fire', 'S-001', 'c', 1, 60, 3, 0.12, 3, function(c, o, t, v){ var f = 180 * (1 + v * 0.06); tone(c, o, t, { w: 'triangle', f: f, f1: f / 2, d: 0.09, v: 0.55, lp: 1400 }); return noise(c, o, t, { d: 0.03, v: 0.3, hp: 2600 + v * 300 }); });
cue('fire_heavy', 'S-002', 'c', 1, 100, 3, 0.17, 1, function(c, o, t){ tone(c, o, t, { w: 'triangle', f: 140, f1: 62, d: 0.14, v: 0.6, lp: 1100 }); return noise(c, o, t, { d: 0.06, v: 0.4, lp: 3200 }); });
cue('brace', 'S-003', 'c', 1, 300, 1, 0.08, 1, function(c, o, t){ return notes(c, o, t, [587, 784], 0.035, { w: 'sine', d: 0.03, v: 0.12 }); });
cue('hit', 'S-004', 'c', 1, 40, 4, 0.06, 3, function(c, o, t, v){ noise(c, o, t, { d: 0.035, v: 0.45, bp: 700 + v * 120, q: 1.1 }); return noise(c, o, t, { d: 0.015, v: 0.18, hp: 4200 }); });
cue('crit', 'S-005', 'c', 2, 40, 2, 0.11, 1, function(c, o, t){ noise(c, o, t, { d: 0.035, v: 0.4, bp: 800, q: 1.1 }); return tone(c, o, t + 0.01, { w: 'sine', f: 4000, d: 0.09, v: 0.22 }); });
cue('block', 'S-006', 'c', 1, 60, 2, 0.06, 1, function(c, o, t){ noise(c, o, t, { d: 0.03, v: 0.25, lp: 700 }); return tone(c, o, t, { w: 'sine', f: 300, f1: 210, d: 0.04, v: 0.45 }); });
cue('plate', 'S-007', 'c', 1, 80, 2, 0.1, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 3600, d: 0.07, v: 0.2 }); return tone(c, o, t + 0.03, { w: 'sine', f: 4800, d: 0.06, v: 0.16 }); });
function hurtBase(c, o, t, d){ tone(c, o, t, { w: 'sine', f: 170, f1: 55, d: d, v: 0.7 }); return tone(c, o, t, { w: 'square', f: 900, f1: 320, d: Math.min(0.12, d), v: 0.16, lp: 2600 }); }
cue('hurt_round', 'S-010a', 't', 3, 100, 2, 0.15, 1, function(c, o, t){ return hurtBase(c, o, t, 0.13); });
cue('hurt_contact', 'S-010b', 't', 3, 100, 2, 0.17, 1, function(c, o, t){ noise(c, o, t, { d: 0.07, v: 0.35, lp: 900 }); return hurtBase(c, o, t, 0.15); });
cue('hurt_blast', 'S-010c', 't', 3, 100, 2, 0.28, 1, function(c, o, t){ noise(c, o, t, { d: 0.26, v: 0.45, lp: 1300, f1: 300 }); return hurtBase(c, o, t, 0.26); });
cue('hurt_beam', 'S-010d', 't', 3, 100, 2, 0.15, 1, function(c, o, t){ tone(c, o, t, { w: 'square', f: 620, f1: 300, d: 0.12, v: 0.14, lp: 2400 }); return hurtBase(c, o, t, 0.12); });
cue('hurt_hazard', 'S-010e', 't', 3, 100, 2, 0.2, 1, function(c, o, t){ tone(c, o, t, { w: 'sawtooth', f: 1400, f1: 2600, d: 0.07, v: 0.1, lp: 4000 }); return hurtBase(c, o, t, 0.18); });
cue('dodge', 'S-014', 'c', 1, 100, 1, 0.11, 1, function(c, o, t){ return noise(c, o, t, { d: 0.09, v: 0.22, bp: 600, f1: 2400, q: 2, a: 0.02 }); });
cue('beat', 'S-015', 'c', 2, 400, 1, 0.34, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 72, f1: 48, d: 0.12, v: 0.55 }); tone(c, o, t, { w: 'sine', f: 300, d: 0.06, v: 0.14 });
  tone(c, o, t + 0.2, { w: 'sine', f: 66, f1: 44, d: 0.11, v: 0.4 }); return tone(c, o, t + 0.2, { w: 'sine', f: 300, d: 0.05, v: 0.1 }); });
cue('down', 'S-016', 't', 3, 0, 1, 0.66, 1, function(c, o, t){ return tone(c, o, t, { w: 'sawtooth', f: 400, f1: 80, d: 0.6, v: 0.32, lp: 1500, a: 0.01 }); });
cue('revive', 'S-017', 'u', 3, 0, 1, 0.5, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 300, f1: 900, d: 0.3, v: 0.3, a: 0.05 }); return notes(c, o, t + 0.24, M([74, 78, 81]), 0, { w: 'triangle', d: 0.22, v: 0.16 }); });
cue('xp', 'S-018', 'c', 1, 30, 3, 0.05, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 660, d: 0.03, v: 0.28 }); return tone(c, o, t, { w: 'sine', f: 3960, d: 0.02, v: 0.06 }); });
cue('level_up', 'S-019', 'u', 2, 0, 1, 0.5, 1, function(c, o, t){ notes(c, o, t, M([KEY[0], KEY[1], KEY[3]]), 0.1, { w: 'triangle', d: 0.2, v: 0.32 }); return tone(c, o, t + 0.3, { w: 'sine', f: 4200, d: 0.12, v: 0.08 }); });
cue('repair', 'S-020', 'c', 2, 0, 1, 0.24, 1, function(c, o, t){ return notes(c, o, t, M([62, 69]), 0.09, { w: 'triangle', d: 0.14, v: 0.3 }); });
cue('coin', 'S-021', 'c', 1, 30, 3, 0.05, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 880, d: 0.03, v: 0.22 }); return tone(c, o, t, { w: 'sine', f: 3520, d: 0.02, v: 0.08 }); });
cue('schematic', 'S-022', 'c', 2, 0, 1, 0.3, 1, function(c, o, t){ return notes(c, o, t, M([74, 77, 81]), 0.07, { w: 'triangle', d: 0.12, v: 0.26 }); });
// 4.2 Chapter 1 enemies. warn_* are live: length = the tell time the player sees (R31), read from the sim at the tell event.
cue('spawn', 'S-100', 'c', 1, 300, 1, 0.13, 1, function(c, o, t){ tone(c, o, t, { w: 'square', f: 300, f1: 520, d: 0.05, v: 0.12, lp: 900 }); return tone(c, o, t + 0.06, { w: 'square', f: 420, d: 0.05, v: 0.1, lp: 900 }); });
cue('elite', 'S-110', 'c', 2, 0, 1, 0.37, 1, function(c, o, t){ tone(c, o, t, { w: 'square', f: 300, f1: 520, d: 0.05, v: 0.1, lp: 900 }); return notes(c, o, t + 0.08, [98, 147], 0.12, { w: 'sawtooth', d: 0.14, v: 0.22, lp: 900 }); });
cue('warn_E-01', 'S-101', 't', 2, 120, 3, 0.8, 1, function(c, o, t, v, p){ return tone(c, o, t, { w: 'sawtooth', f: 1250, f1: 1700, d: p.d, v: 0.06, lp: 3000, a: 0.04 }); }, true);
cue('snap_E-01', 'S-101b', 't', 2, 60, 2, 0.05, 1, function(c, o, t){ return noise(c, o, t, { d: 0.04, v: 0.3, hp: 1500 }); });
cue('warn_E-02', 'S-102', 't', 2, 120, 3, 0.6, 1, function(c, o, t, v, p){ return tone(c, o, t, { w: 'square', f: 1500, f1: 1890, d: p.d, v: 0.05, lp: 3200, a: 0.03 }); }, true);
cue('warn_E-03', 'S-103', 't', 2, 120, 3, 0.7, 1, function(c, o, t, v, p){ var s = p.d / 3; return notes(c, o, t, [1400, 1570, 1760], s, { w: 'square', d: s * 0.85, v: 0.06, lp: 3200 }); }, true);
cue('warn_E-04', 'S-104', 't', 2, 120, 3, 0.6, 1, function(c, o, t, v, p){ return tone(c, o, t, { w: 'sawtooth', f: 1200, f1: 1450, d: p.d, v: 0.045, lp: 2600, a: 0.05 }); }, true);
cue('mortar_launch', 'S-104b', 't', 2, 80, 2, 0.13, 1, function(c, o, t){ noise(c, o, t, { d: 0.08, v: 0.3, lp: 700 }); return tone(c, o, t, { w: 'sine', f: 190, f1: 90, d: 0.1, v: 0.5 }); });
cue('whistle', 'S-104c', 't', 2, 80, 3, 1.0, 1, function(c, o, t, v, p){ return tone(c, o, t, { w: 'sine', f: 2600, f1: 1300, d: p.d, v: 0.06, a: 0.05 }); }, true);
cue('warn_E-05', 'S-105', 't', 2, 120, 3, 0.8, 1, function(c, o, t, v, p){ return tone(c, o, t, { w: 'sawtooth', f: 220, f1: 880, d: p.d, v: 0.12, lp: 2600, a: 0.05 }); }, true);
cue('dash', 'S-105b', 't', 2, 100, 2, 0.26, 1, function(c, o, t){ return noise(c, o, t, { d: 0.24, v: 0.32, bp: 700, f1: 2400, q: 1.6, a: 0.02 }); });
cue('clang', 'S-105c', 'c', 2, 100, 2, 0.3, 1, function(c, o, t){ tone(c, o, t, { w: 'square', f: 1250, d: 0.22, v: 0.08, lp: 3500 }); return tone(c, o, t, { w: 'square', f: 1873, d: 0.18, v: 0.06, lp: 3500 }); });
cue('warble', 'S-105d', 'c', 2, 300, 2, 1.05, 1, function(c, o, t){ return wob(c, o, t, 420, 1.0, 0.1, 5, 18); });   // free-shot window: soft, low, outside the threat band
// Step 7 machines (E-06 to E-08; 03 machines table cues). Same levels as E-01..E-05 warns; all guesses until heard.
cue('warn_E-06', 'S-106', 't', 2, 120, 3, 0.6, 1, function(c, o, t, v, p){ var g = t + Math.max(0, p.d - 0.3);   // seam crack: thin chirp over the tell, two dry snaps when the seam glows (last 0.3 s)
  noise(c, o, g, { d: 0.03, v: 0.16, hp: 2400 }); noise(c, o, g + 0.14, { d: 0.03, v: 0.12, hp: 3000 });
  return tone(c, o, t, { w: 'square', f: 1700, f1: 2300, d: p.d, v: 0.04, lp: 3600, a: 0.02 }); }, true);
cue('split_E-06', 'S-106b', 't', 2, 80, 2, 0.16, 1, function(c, o, t){ noise(c, o, t, { d: 0.05, v: 0.2, hp: 1800 }); return tone(c, o, t, { w: 'square', f: 900, f1: 1800, d: 0.12, v: 0.05, lp: 3200 }); });   // halves pop apart
cue('warn_E-07', 'S-107', 't', 2, 120, 3, 1.0, 1, function(c, o, t, v, p){ noise(c, o, t, { d: p.d, v: 0.14, lp: 180, f1: 520, a: 0.15 });   // mound rumble: low noise that opens up
  return tone(c, o, t, { w: 'sine', f: 55, f1: 85, d: p.d, v: 0.16, a: 0.12 }); }, true);
cue('pop_E-07', 'S-107b', 't', 2, 80, 2, 0.12, 1, function(c, o, t){ noise(c, o, t, { d: 0.06, v: 0.22, lp: 1200 }); return tone(c, o, t, { w: 'sine', f: 240, f1: 110, d: 0.1, v: 0.3 }); });   // ring pop as it surfaces
cue('warn_E-08', 'S-108', 't', 2, 120, 3, 1.2, 1, function(c, o, t, v, p){ return tone(c, o, t, { w: 'triangle', f: 330, f1: 990, d: p.d, v: 0.07, lp: 2400, a: 0.08 }); }, true);   // rising hum
cue('ping_E-08', 'S-108b', 't', 3, 0, 4, 0.14, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 2640, d: 0.12, v: 0.14, a: 0.002 }); return tone(c, o, t, { w: 'sine', f: 3960, d: 0.05, v: 0.05, a: 0.002 }); });   // lock ping: line goes solid (stands in for the shared lock tick)
cue('lock', 'S-120', 't', 3, 0, 4, 0.06, 1, function(c, o, t){ tone(c, o, t, { w: 'square', f: 2400, d: 0.012, v: 0.3, a: 0.001 }); return tone(c, o, t + 0.03, { w: 'square', f: 2400, d: 0.012, v: 0.3, a: 0.001 }); });
cue('enemy_fire', 'S-130', 't', 1, 50, 4, 0.08, 1, function(c, o, t){ return tone(c, o, t, { w: 'square', f: 1600, f1: 900, d: 0.06, v: 0.09, lp: 3500 }); });
cue('blast', 'S-132', 't', 2, 60, 3, 0.34, 1, function(c, o, t){ noise(c, o, t, { d: 0.3, v: 0.5, lp: 1500, f1: 300 }); return tone(c, o, t, { w: 'sine', f: 120, f1: 40, d: 0.3, v: 0.6 }); });
function killR(f, d, nv){ return function(c, o, t, v){ var k = 1 + v * 0.05; noise(c, o, t, { d: d, v: nv, lp: 1800 * k, f1: 380 }); return tone(c, o, t, { w: 'sine', f: f * k, f1: f * 0.3, d: d, v: 0.45 }); }; }
cue('kill_s', 'S-140', 'c', 1, 50, 4, 0.13, 3, killR(220, 0.11, 0.38));
cue('kill_m', 'S-141', 'c', 2, 50, 4, 0.21, 1, killR(170, 0.19, 0.42));
cue('kill_l', 'S-142', 'c', 2, 50, 4, 0.33, 1, killR(120, 0.31, 0.45));
cue('kill_last', 'S-143', 'c', 2, 0, 1, 0.37, 1, function(c, o, t){ return tone(c, o, t, { w: 'sine', f: 90, f1: 40, d: 0.35, v: 0.45 }); });
// 4.3 boss B-01 (the only slice boss, R5). Timelines are baked as one buffer each.
cue('boss_intro', 'S-200', 'u', 3, 0, 1, 2.6, 1, function(c, o, t){
  tone(c, o, t, { w: 'sine', f: 140, f1: 70, d: 0.12, v: 0.55 }); noise(c, o, t, { d: 0.6, v: 0.25, lp: 260, a: 0.1 });
  tone(c, o, t + 0.2, { w: 'sawtooth', f: 90, f1: 300, d: 0.5, v: 0.14, lp: 800, a: 0.1 }); noise(c, o, t + 0.6, { d: 0.25, v: 0.18, bp: 500, f1: 1800, q: 1.4 });
  for (var i = 0; i < 5; i++) tone(c, o, t + 0.95 + i * 0.15, { w: 'triangle', f: 440 + i * 60, d: 0.04, v: 0.16 });
  return notes(c, o, t + 1.6, [523, 587, 698], 0.18, { w: 'triangle', d: 0.14, v: 0.2 }); });
cue('warn_B-01A', 'S-211A', 't', 2, 120, 3, 0.9, 1, function(c, o, t, v, p){ var s = p.d / 5; return notes(c, o, t, [1200, 1340, 1500, 1680, 1880], s, { w: 'square', d: s * 0.7, v: 0.06, lp: 3400 }); }, true);
cue('warn_B-01B', 'S-211B', 't', 2, 120, 3, 0.6, 1, function(c, o, t, v, p){ noise(c, o, t, { d: p.d, v: 0.08, bp: 1300, f1: 2800, q: 3, a: 0.05 }); return tone(c, o, t, { w: 'sawtooth', f: 1300, f1: 2800, d: p.d, v: 0.05, lp: 3600, a: 0.05 }); }, true);
cue('warn_B-01C', 'S-211C', 't', 2, 120, 3, 0.8, 1, function(c, o, t, v, p){ var s = p.d / 3; return notes(c, o, t, [1300, 1550, 1840], s, { w: 'square', d: s * 0.85, v: 0.06, lp: 3200 }); }, true);
// Step 7 bosses (03 section 4 "cues by letter"). Live like B-01: each warn lasts the tell the sim shows.
function hits(c, o, t, d, gaps, p){ var x = 0, last = null, i = 0; while (x < d - 0.02 && i < 48) { noise(c, o, t + x, { d: 0.03, v: p.nv, lp: p.lp }); last = tone(c, o, t + x, { w: 'sine', f: p.f, f1: p.f * 0.6, d: 0.05, v: p.v }); x += gaps(x / d); i++; } return last; }
cue('warn_B-03A', 'S-213A', 't', 2, 120, 3, 0.8, 1, function(c, o, t, v, p){ return hits(c, o, t, p.d, function(){ return 0.075; }, { f: 150, v: 0.16, nv: 0.08, lp: 900 }); }, true);   // drum-roll, even
cue('warn_B-03B', 'S-213B', 't', 2, 120, 3, 1.0, 1, function(c, o, t, v, p){ return hits(c, o, t, p.d, function(k){ return 0.13 - 0.09 * k; }, { f: 180, v: 0.17, nv: 0.09, lp: 1100 }); }, true);   // drum-fast: speeds up to the roll
cue('warn_B-02A', 'S-212A', 't', 2, 120, 3, 1.0, 1, function(c, o, t, v, p){ noise(c, o, t, { d: p.d, v: 0.07, bp: 300, f1: 1400, q: 1.4, a: 0.1 });   // rising air, then the landing thud
  var e = t + Math.max(0, p.d - 0.04); noise(c, o, e, { d: 0.08, v: 0.2, lp: 700 }); return tone(c, o, e, { w: 'sine', f: 130, f1: 45, d: 0.14, v: 0.42 }); }, true);
cue('warn_B-02B', 'S-212B', 't', 2, 120, 3, 0.6, 1, function(c, o, t, v, p){ noise(c, o, t, { d: p.d, v: 0.07, bp: 900, f1: 3200, q: 2.5, a: 0.05 });   // port-flare: ports heat up
  return tone(c, o, t, { w: 'square', f: 900, f1: 1900, d: p.d, v: 0.04, lp: 3200, a: 0.05 }); }, true);
cue('warn_B-04A', 'S-214A', 't', 2, 120, 3, 1.0, 1, function(c, o, t, v, p){ noise(c, o, t, { d: p.d, v: 0.09, bp: 420, f1: 900, q: 4, a: 0.08 });   // spin-grind
  return tone(c, o, t, { w: 'sawtooth', f: 80, f1: 160, d: p.d, v: 0.08, lp: 900, a: 0.08 }); }, true);
cue('warn_B-04B', 'S-214B', 't', 2, 120, 3, 0.8, 1, function(c, o, t, v, p){ return hits(c, o, t, p.d, function(){ return p.d / 3; }, { f: 110, v: 0.3, nv: 0.14, lp: 600 }); }, true);   // rock-thump: three heavy thumps
cue('boss_phase', 'S-230', 't', 3, 0, 1, 0.8, 1, function(c, o, t){   // [spec] at most 800 ms; never the hurt sound (L-PV-10)
  noise(c, o, t, { d: 0.2, v: 0.4, hp: 1800 }); tone(c, o, t, { w: 'square', f: 700, d: 0.16, v: 0.1, lp: 3000 }); tone(c, o, t, { w: 'square', f: 1043, d: 0.14, v: 0.08, lp: 3000 });
  return notes(c, o, t + 0.25, [1500, 1100, 1500, 1100], 0.13, { w: 'square', d: 0.11, v: 0.07, lp: 3200 }); });
cue('boss_dead', 'S-232', 'u', 3, 0, 1, 3.2, 1, function(c, o, t){   // [spec] AN-304: five blasts 320 ms apart from 200, final at 2200, drop burst at 2400
  for (var i = 0; i < 5; i++) { noise(c, o, t + 0.2 + i * 0.32, { d: 0.26, v: 0.38, lp: 1400, f1: 300 }); tone(c, o, t + 0.2 + i * 0.32, { w: 'sine', f: 130 - i * 8, f1: 42, d: 0.26, v: 0.45 }); }
  noise(c, o, t + 2.2, { d: 0.5, v: 0.5, lp: 1600, f1: 200 }); tone(c, o, t + 2.2, { w: 'sine', f: 110, f1: 32, d: 0.5, v: 0.6 });
  noise(c, o, t + 2.4, { d: 0.2, v: 0.15, hp: 3800 });
  return notes(c, o, t + 2.4, M([62, 66, 69, 74]), 0.11, { w: 'triangle', d: 0.3, v: 0.22 }); });
cue('boss_pay', 'S-233', 'u', 2, 0, 1, 0.75, 1, function(c, o, t){ var l = null; for (var i = 0; i < 8; i++) l = tone(c, o, t + i * 0.07, { w: 'sine', f: 880 * Math.pow(2, i / 12), d: 0.03, v: 0.16 }); tone(c, o, t + 0.58, { w: 'triangle', f: mf(81), d: 0.16, v: 0.2 }); return l; });
// 4.4 world, in-run UI, menus
cue('door_open', 'S-300', 'c', 2, 0, 1, 0.6, 1, function(c, o, t){ noise(c, o, t, { d: 0.05, v: 0.3, lp: 900 }); tone(c, o, t, { w: 'sine', f: 200, f1: 120, d: 0.06, v: 0.45 }); return noise(c, o, t + 0.05, { d: 0.5, v: 0.1, hp: 3000, a: 0.06 }); });
cue('door_close', 'S-301', 'c', 2, 0, 1, 0.32, 1, function(c, o, t){ noise(c, o, t, { d: 0.12, v: 0.4, lp: 700 }); return tone(c, o, t, { w: 'sine', f: 110, f1: 50, d: 0.3, v: 0.55 }); });
var CLEAR_FORMS = [[62, 65, 69], [65, 69, 74], [69, 74, 77], [62, 69, 74]];   // 4 forms so a clear every 18 s does not repeat
cue('room_clear', 'S-302', 'u', 2, 0, 1, 0.45, 4, function(c, o, t, v){ return notes(c, o, t, M(CLEAR_FORMS[v % 4]), 0.1, { w: 'triangle', d: 0.2, v: 0.2 }); });
cue('stage_whoosh', 'S-302b', 'u', 1, 300, 1, 0.32, 1, function(c, o, t){ return noise(c, o, t, { d: 0.3, v: 0.12, bp: 400, f1: 1200, q: 1.2, a: 0.08 }); });
cue('cache', 'S-304', 'u', 2, 0, 1, 1.15, 1, function(c, o, t){ for (var i = 0; i < 8; i++) noise(c, o, t + i * 0.085, { d: 0.05, v: 0.18, bp: 900 + (i % 3) * 200, q: 3 }); noise(c, o, t + 1.0, { d: 0.06, v: 0.35, lp: 2500 }); return tone(c, o, t + 1.0, { w: 'triangle', f: mf(74), d: 0.14, v: 0.24 }); });
cue('sheet', 'S-313b', 'u', 1, 100, 1, 0.16, 1, function(c, o, t){ return noise(c, o, t, { d: 0.14, v: 0.1, bp: 500, f1: 1400, q: 1.2, a: 0.03 }); });
cue('chapter_clear', 'S-309', 'u', 2, 0, 1, 2.1, 1, function(c, o, t){ notes(c, o, t, M([62, 65, 69, 74]), 0.16, { w: 'triangle', d: 0.24, v: 0.22 }); notes(c, o, t + 0.9, M([66, 69, 74]), 0, { w: 'triangle', d: 1.0, v: 0.14, a: 0.02 }); return tone(c, o, t + 0.9, { w: 'sine', f: mf(50), d: 1.1, v: 0.25 }); });
cue('offer_flip', 'S-400', 'u', 2, 200, 1, 0.3, 1, function(c, o, t){ var l; for (var i = 0; i < 3; i++) { noise(c, o, t + i * 0.09, { d: 0.015, v: 0.2, hp: 3600 }); l = tone(c, o, t + i * 0.09, { w: 'triangle', f: 600, d: 0.03, v: 0.12 }); } return l; });
cue('pick_confirm', 'S-401', 'u', 2, 100, 1, 0.24, 1, function(c, o, t){ notes(c, o, t, M([74, 81]), 0.06, { w: 'triangle', d: 0.12, v: 0.26 }); return tone(c, o, t + 0.12, { w: 'sine', f: 180, f1: 110, d: 0.08, v: 0.35 }); });
cue('pick_lv2', 'S-405a', 'u', 2, 100, 1, 0.26, 1, function(c, o, t){ return notes(c, o, t, M([76, 83]), 0.06, { w: 'triangle', d: 0.14, v: 0.26 }); });
cue('pick_lv3', 'S-405b', 'u', 2, 100, 1, 0.45, 1, function(c, o, t){ notes(c, o, t, M([77, 84]), 0.06, { w: 'triangle', d: 0.14, v: 0.26 }); return tone(c, o, t + 0.12, { w: 'sine', f: 4400, d: 0.3, v: 0.07 }); });
cue('set_done', 'S-405c', 'u', 2, 0, 1, 0.42, 1, function(c, o, t){ return notes(c, o, t, M([62, 65, 69]), 0, { w: 'triangle', d: 0.4, v: 0.16, a: 0.01 }); });
cue('reject', 'S-402', 'u', 1, 120, 1, 0.12, 1, function(c, o, t){ return notes(c, o, t, [220, 220], 0.07, { w: 'sine', d: 0.035, v: 0.3 }); });
cue('reroll_bank', 'S-406a', 'u', 2, 0, 1, 0.14, 1, function(c, o, t){ tone(c, o, t, { w: 'square', f: 600, d: 0.03, v: 0.12, lp: 1500 }); return tone(c, o, t + 0.06, { w: 'triangle', f: 880, d: 0.06, v: 0.22 }); });
cue('reroll_spend', 'S-406b', 'u', 2, 150, 1, 0.5, 1, function(c, o, t){ noise(c, o, t, { d: 0.2, v: 0.14, bp: 600, f1: 3000, q: 1.5, a: 0.02 }); var l; for (var i = 0; i < 3; i++) { noise(c, o, t + 0.22 + i * 0.09, { d: 0.015, v: 0.2, hp: 3600 }); l = tone(c, o, t + 0.22 + i * 0.09, { w: 'triangle', f: 600, d: 0.03, v: 0.12 }); } return l; });
cue('pause', 'S-403a', 'u', 1, 80, 1, 0.05, 1, function(c, o, t){ return tone(c, o, t, { w: 'triangle', f: 520, d: 0.035, v: 0.18 }); });
cue('resume', 'S-403b', 'u', 1, 300, 1, 0.3, 1, function(c, o, t){ return notes(c, o, t, [520, 520, 780], 0.1, { w: 'triangle', d: 0.035, v: 0.18 }); });
cue('prompt_done', 'S-403c', 'u', 1, 200, 1, 0.16, 1, function(c, o, t){ return notes(c, o, t, M([74, 81]), 0.05, { w: 'sine', d: 0.08, v: 0.16 }); });
cue('results_tick', 'S-404a', 'u', 1, 50, 2, 0.03, 1, function(c, o, t){ return tone(c, o, t, { w: 'sine', f: 1100, d: 0.02, v: 0.1 }); });
cue('tile_pop', 'S-404b', 'u', 1, 60, 2, 0.08, 1, function(c, o, t){ return tone(c, o, t, { w: 'triangle', f: 523, f1: 784, d: 0.06, v: 0.2 }); });
cue('tab', 'S-500', 'u', 1, 60, 1, 0.05, 1, function(c, o, t){ noise(c, o, t, { d: 0.012, v: 0.1, hp: 3800 }); return tone(c, o, t, { w: 'triangle', f: 700, d: 0.03, v: 0.16 }); });
cue('button', 'S-501', 'u', 1, 60, 1, 0.05, 1, function(c, o, t){ return tone(c, o, t, { w: 'triangle', f: 480, f1: 420, d: 0.035, v: 0.2 }); });
cue('toast', 'S-503', 'u', 1, 300, 1, 0.08, 1, function(c, o, t){ return tone(c, o, t, { w: 'sine', f: 880, d: 0.06, v: 0.1 }); });
cue('count', 'S-502', 'u', 1, 50, 2, 0.03, 1, function(c, o, t){ return tone(c, o, t, { w: 'sine', f: 1320, d: 0.02, v: 0.08 }); });
cue('buy', 'S-504a', 'u', 2, 120, 1, 0.3, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 880, d: 0.03, v: 0.2 }); return notes(c, o, t + 0.05, M([69, 74, 78]), 0.06, { w: 'triangle', d: 0.12, v: 0.2 }); });
cue('equip', 'S-504b', 'u', 1, 100, 1, 0.08, 1, function(c, o, t){ noise(c, o, t, { d: 0.02, v: 0.2, hp: 2500 }); return tone(c, o, t, { w: 'sine', f: 240, f1: 160, d: 0.05, v: 0.3 }); });
cue('unlock', 'S-509', 'u', 2, 0, 1, 0.3, 1, function(c, o, t){ tone(c, o, t, { w: 'square', f: 600, d: 0.03, v: 0.1, lp: 1500 }); return notes(c, o, t + 0.07, M([69, 76]), 0.08, { w: 'triangle', d: 0.14, v: 0.22 }); });
cue('deploy', 'S-507', 'u', 2, 300, 1, 0.48, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 120, f1: 60, d: 0.2, v: 0.4 }); return noise(c, o, t, { d: 0.46, v: 0.2, bp: 300, f1: 2400, q: 1, a: 0.12 }); });
cue('roll_sweep', 'S-508a', 'u', 2, 200, 1, 1.0, 1, function(c, o, t, v, p){ return tone(c, o, t, { w: 'triangle', f: 300, f1: 900, d: p.d || 1.0, v: 0.08, lp: 1400, a: 0.05 }); }, true);
cue('roll_common', 'S-508b', 'u', 2, 0, 1, 0.22, 1, function(c, o, t){ return tone(c, o, t, { w: 'triangle', f: mf(74), d: 0.2, v: 0.24 }); });
cue('roll_rare', 'S-508c', 'u', 2, 0, 1, 0.32, 1, function(c, o, t){ return notes(c, o, t, M([74, 81]), 0.1, { w: 'triangle', d: 0.2, v: 0.24 }); });
cue('roll_elite', 'S-508d', 'u', 2, 0, 1, 0.6, 1, function(c, o, t){ notes(c, o, t, M([74, 78, 81]), 0.1, { w: 'triangle', d: 0.22, v: 0.24 }); return tone(c, o, t + 0.22, { w: 'sine', f: 4400, d: 0.35, v: 0.08 }); });
cue('settings', 'S-511', 'u', 1, 80, 1, 0.16, 1, function(c, o, t){ return tone(c, o, t, { w: 'triangle', f: mf(74), d: 0.14, v: 0.26 }); });
cue('title_tap', 'S-510', 'u', 2, 300, 1, 0.42, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 150, f1: 70, d: 0.12, v: 0.45 }); return notes(c, o, t + 0.08, M([62, 69, 74]), 0.08, { w: 'triangle', d: 0.18, v: 0.2 }); });
// catch room (pick 46, SPEC.md s8): all under the threat band; no red, no cross, never the hurt sound
cue('sd_catch', 'S-305a', 'u', 1, 30, 3, 0.07, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 523, d: 0.06, v: 0.24 }); return tone(c, o, t, { w: 'sine', f: 1046, d: 0.04, v: 0.06 }); });
cue('sd_streak3', 'S-305b', 'u', 1, 0, 1, 0.13, 1, function(c, o, t){ return notes(c, o, t, [3700, 4400], 0.05, { w: 'sine', d: 0.06, v: 0.08 }); });
cue('sd_streak5', 'S-305c', 'u', 1, 0, 1, 0.21, 1, function(c, o, t){ tone(c, o, t, { w: 'triangle', f: 523, d: 0.18, v: 0.16 }); return notes(c, o, t, [3520, 4186, 4698], 0.06, { w: 'sine', d: 0.07, v: 0.08 }); });
cue('sd_tier', 'S-305d', 'u', 2, 0, 1, 0.17, 1, function(c, o, t){ notes(c, o, t, M([62, 65, 69]), 0, { w: 'triangle', d: 0.15, v: 0.14 }); return tone(c, o, t + 0.02, { w: 'sine', f: 3800, d: 0.04, v: 0.08 }); });
cue('sd_perfect', 'S-305e', 'u', 2, 0, 1, 0.45, 1, function(c, o, t){ return notes(c, o, t, M([62, 65, 69, 74, 77]), 0.08, { w: 'triangle', d: 0.14, v: 0.22 }); });
cue('sd_land', 'S-312a', 'u', 1, 500, 1, 0.09, 1, function(c, o, t){ return tone(c, o, t, { w: 'sine', f: 150, f1: 80, d: 0.08, v: 0.22 }); });
cue('sd_dud', 'S-312b', 'u', 2, 200, 1, 0.8, 1, function(c, o, t){ tone(c, o, t, { w: 'sine', f: 180, f1: 100, d: 0.07, v: 0.35 }); return wob(c, o, t + 0.07, 300, 0.7, 0.08, 3, 14); });
cue('sd_near', 'S-312c', 'u', 1, 150, 1, 0.09, 1, function(c, o, t){ return notes(c, o, t, [660, 520], 0.04, { w: 'triangle', d: 0.04, v: 0.1 }); });
cue('sd_count', 'S-312d', 'u', 1, 150, 1, 0.04, 1, function(c, o, t){ return tone(c, o, t, { w: 'triangle', f: 600, d: 0.03, v: 0.14 }); });
cue('sd_tick', 'S-312e', 'u', 1, 500, 1, 0.03, 1, function(c, o, t){ return tone(c, o, t, { w: 'sine', f: 760, d: 0.02, v: 0.1 }); });
cue('sd_timeup', 'S-312f', 'u', 2, 0, 1, 0.22, 1, function(c, o, t){ return noise(c, o, t, { d: 0.2, v: 0.14, lp: 900, f1: 200, a: 0.03 }); });
cue('sd_pad', 'S-313a', 'u', 1, 60, 1, 0.04, 1, function(c, o, t){ return tone(c, o, t, { w: 'triangle', f: 640, d: 0.025, v: 0.16 }); });
cue('sd_take', 'S-313c', 'u', 2, 300, 1, 0.3, 1, function(c, o, t){ return notes(c, o, t, M([62, 66, 69]), 0, { w: 'triangle', d: 0.28, v: 0.16, a: 0.01 }); });
// F0 names kept for old callers (main.js handleEvents, tests)
var ALIAS = { kill: 'kill_s', hurt: 'hurt_round', door: 'door_open', levelup: 'level_up', click: 'button', reroll: 'reroll_spend' };   // reroll: G's ui.js / home.js call it on a spend
var LADDER = [0, 2, 4, 7, 9, 12, 14, 16];   // pentatonic steps (semitones) for xp, coins and catches
function ladderRate(i){ return Math.pow(2, LADDER[Math.max(0, Math.min(7, i))] / 12); }
var JITTER = { fire: 1, fire_heavy: 1, hit: 1, kill_s: 1, kill_m: 1, enemy_fire: 1 };   // +-4% playback-rate jitter [spec]

// ---- engine ----
function make(){
  if (ctx && ctx.state !== 'closed') return ctx;
  var AC = G.AudioContext || G.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); } catch (e) { ctx = null; return null; }
  live = []; baked = {}; bakeQ = null;
  build(ctx); bakeAll(); startTimer();
  return ctx;
}
function build(c){
  comp = c.createDynamicsCompressor();   // safety limiter: should stay idle in normal play (07 s6)
  comp.threshold.value = -6; comp.knee.value = 4; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.12;
  master = c.createGain(); master.gain.value = masterGain();
  sfxBus = c.createGain(); sfxBus.gain.value = sfxGain(); sfxBus.connect(master);
  musicBus = c.createGain(); musicBus.gain.value = musicGain(); musicBus.connect(master);
  bus.c = c.createGain(); bus.c.gain.value = 1; bus.c.connect(sfxBus);
  bus.t = c.createGain(); bus.t.gain.value = 1.41; bus.t.connect(sfxBus);       // threat 3 dB over combat [spec]
  bus.u = c.createGain(); bus.u.gain.value = 0.71; bus.u.connect(sfxBus);       // ui 3 dB under combat [spec]
  musicDuck = c.createGain(); musicDuck.gain.value = duckBase(); musicDuck.connect(musicBus);
  musicFilt = c.createBiquadFilter(); musicFilt.type = 'lowpass'; musicFilt.frequency.value = 12000; musicFilt.connect(musicDuck);
  musicVer = c.createGain(); musicVer.gain.value = 1; musicVer.connect(musicFilt);
  var dl = c.createDelay(1), fb = c.createGain(), wet = c.createGain(); dl.delayTime.value = 0.36; fb.gain.value = 0.22; wet.gain.value = 0.16;
  musicIn = c.createGain(); musicIn.connect(musicVer); musicIn.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(musicVer);
  master.connect(comp); comp.connect(c.destination);
}
var MUSIC_MIX = 0.32;   // music 12 dB-ish under the effects peak (guess, 07 s6), times 0.5 under cards and sheets
var sheetDuck = false;
function duckBase(){ return MUSIC_MIX * (sheetDuck ? 0.5 : 1); }
function duck(node, base, db, hold){
  if (!ctx || !node) return;
  var t = ctx.currentTime, p = node.gain;
  try { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(base * Math.pow(10, -db / 20), t, 0.007); p.setTargetAtTime(base, t + hold, 0.05); } catch (e) {}
}
function unlock(){
  var c = make(); if (!c) return null;
  if (c.state === 'suspended' && !paused && !(G.document && document.hidden)) { try { return c.resume(); } catch (e) {} }
  return null;
}
// L-HB-1: a sound for the unlock tap itself runs inside resume().then
function whenRunning(fn){
  var c = make(); if (!c) return;
  if (c.state === 'running') { fn(); return; }
  var p = unlock(); if (p && p.then) p.then(fn, function(){}); else fn();
}

// ---- baking (07 s2): UI and hero cues first, the rest one per idle slice ----
var baked = {}, bakeQ = null, bakeN = 0, bakeMs = 0;
var BAKE_FIRST = ['button', 'tab', 'title_tap', 'fire', 'hit', 'hurt_round', 'kill_s', 'lock', 'xp', 'level_up', 'door_open'];
function bakeAll(){
  var OAC = G.OfflineAudioContext || G.webkitOfflineAudioContext; if (!OAC || !ctx) return;
  var names = BAKE_FIRST.slice(); for (var k in C) if (names.indexOf(k) < 0) names.push(k);
  var jobs = []; names.forEach(function(n){ if (!C[n].live) for (var v = 0; v < C[n].vars; v++) jobs.push([n, v]); });
  var sr = ctx.sampleRate, t0 = now(), me = ctx;
  function next(i){
    if (ctx !== me) return;
    if (i >= jobs.length) { bakeMs = now() - t0; return; }
    var n = jobs[i][0], v = jobs[i][1], cu = C[n];
    try {
      var oc = new OAC(1, Math.ceil(sr * (cu.d + 0.05)), sr);
      cu.fn(oc, oc.destination, 0.002, v, { d: cu.d });
      oc.startRendering().then(function(b){ (baked[n] = baked[n] || [])[v] = b; bakeN++; later(function(){ next(i + 1); }); }, function(){ later(function(){ next(i + 1); }); });
    } catch (e) { later(function(){ next(i + 1); }); }
  }
  next(0);
}
function later(f){ if (G.requestIdleCallback) G.requestIdleCallback(f, { timeout: 60 }); else setTimeout(f, 0); }
function now(){ return (G.performance && performance.now) ? performance.now() : Date.now(); }

// ---- voices ----
var lastAt = {};
function cleanup(){ var t = ctx ? ctx.currentTime : 0; for (var i = live.length - 1; i >= 0; i--) if (live[i].end <= t) live.splice(i, 1); }
function stealOldest(maxPri){
  var best = -1;
  for (var i = 0; i < live.length; i++) if (live[i].pri <= maxPri && (best < 0 || live[i].t0 < live[best].t0)) best = i;
  if (best < 0) return false;
  var v = live[best]; live.splice(best, 1);
  try { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.008); v.n.stop(ctx.currentTime + 0.04); } catch (e) {}
  return true;
}
function play(name, opt){
  opt = opt || {};
  if (ALIAS[name]) name = ALIAS[name];
  var cu = C[name];
  if (!cu) { missing++; return false; }
  if (!on() || !ctx || !sfxBus) return false;
  if (paused && !opt.force) return false;   // pause panel taps stay silent (07 s8); they must not queue up for the resume
  cleanup();
  var t = ctx.currentTime + 0.005 + (opt.delay || 0);
  // gap and per-cue cap: a second play inside the gap merges into the first (counted, not played)
  if (cu.gap && lastAt[name] != null && t - lastAt[name] < cu.gap && !opt.force) { merged++; return false; }
  var same = 0; for (var i = 0; i < live.length; i++) if (live[i].name === name) same++;
  if (cu.cap && same >= cu.cap) { if (cu.pri >= 3) stealOldest(3); else { dropped++; return false; } }
  if (live.length >= CAP - (cu.pri >= 3 ? 0 : HELD)) {
    if (!stealOldest(cu.pri >= 3 ? 2 : 1)) { dropped++; return false; }   // full: steal the oldest priority-1 voice (priority 3 may take a 2)
  }
  var g = ctx.createGain(), out = bus[cu.bus] || sfxBus, n, d = cu.d, rate = opt.rate || 1;
  g.gain.value = opt.gain != null ? opt.gain : 1; g.connect(out);
  if (JITTER[name]) rate *= 1 + (rnd() * 2 - 1) * 0.04;
  var v = opt.v != null ? opt.v : (cu.vars > 1 ? Math.floor(rnd() * cu.vars) : 0);
  var b = !cu.live && baked[name] && baked[name][v % cu.vars];
  try {
    if (b) { n = ctx.createBufferSource(); n.buffer = b; n.playbackRate.value = rate; n.connect(g); n.start(t); d = b.duration / rate; }
    else {
      if (cu.live) d = Math.max(0.03, opt.d || cu.d);
      n = cu.fn(ctx, g, t, v % cu.vars, { d: d });
      if (rate !== 1 && n && n.playbackRate) n.playbackRate.value = rate;
    }
  } catch (e) { return false; }
  if (!n) return false;
  var rec = { n: n, g: g, pri: cu.pri, name: name, t0: t, end: t + d + 0.05, x: opt.x, y: opt.y };
  live.push(rec); played++; lastAt[name] = t;
  n.onended = function(){ var k = live.indexOf(rec); if (k >= 0) live.splice(k, 1); try { g.disconnect(); } catch (e) {} };
  return true;
}
function stopAll(){ if (!ctx) return; var t = ctx.currentTime; live.forEach(function(v){ try { v.g.gain.setTargetAtTime(0, t, 0.01); v.n.stop(t + 0.05); } catch (e) {} }); live = []; hb.on = false; }

// ---- sim events -> cues (07 s4). Pure mapping, testable headless: cueFor(e, S) -> [{name, opts}] ----
var RECENT = {};   // warn crowding: tell type -> audio time
function enemyById(S, id){ var a = S && S.enemies; if (a) for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
function hurtKind(e){
  if (e.src === 'spikes' || e.hazard) return 'hurt_hazard';
  if (e.src === 'E-04' || e.blast) return 'hurt_blast';           // shell landings
  if (e.src === 'beam') return 'hurt_beam';
  if (e.src === 'E-01' || e.src === 'E-05' || e.contact) return 'hurt_contact';   // guess: these two only hurt by body contact
  return 'hurt_round';
}
var xpStep = 0, xpAt = -9, clearForm = 0, sdStep = 0, sdAt = -9;
function cueFor(e, S){
  var k = e.k, out = [], at = ctx ? ctx.currentTime : (S ? S.t : 0);
  function o(n, p){ out.push({ name: n, opts: p || {} }); }
  switch (k) {
    case 'fire': o(e.weapon === 'heavy' ? 'fire_heavy' : 'fire'); break;
    case 'hit': if (!e.crit) o('hit'); break;
    case 'crit': o('crit'); break;
    case 'kill':
      if (e.boss) { o('boss_dead'); o('boss_pay', { delay: 2.9 }); o('reroll_bank', { delay: 3.7 }); break; }   // [spec] S-232, then S-233 and S-406 banked
      o(e.size === 'large' ? 'kill_l' : (e.size === 'medium' ? 'kill_m' : 'kill_s'));
      if (e.last) o('kill_last', { delay: 0.05 });
      break;
    case 'hurt': o(hurtKind(e)); if (e.down) o('down', { delay: 0.08 }); break;
    case 'dodge': o('dodge'); break;
    case 'lock': o('brace'); break;
    case 'block': o('block'); break;
    case 'land': o('blast', { x: e.x, y: e.y }); break;
    case 'split': o('split_E-06', { delay: 0.03 }); break;   // E-06 kill splits (M6): crack after the kill cue
    case 'stun': o('clang'); o('warble', { delay: 0.12 }); break;
    case 'tell': {
      if (e.lock) { o(C['ping_' + e.type] ? 'ping_' + e.type : 'lock'); break; }   // E-08: its own lock ping in place of the shared tick
      var en = enemyById(S, e.id), d = en && en.tellT > 0 ? en.tellT : null;
      var at0 = e.attack === 'H' ? 'A' : (e.attack || ''), base = String(e.type).replace(/(V|h)$/, '');   // B-03V and E-06h fall back to their base type's cues
      var nm = ['warn_' + e.type + at0, 'warn_' + e.type, 'warn_' + base + at0, 'warn_' + base].filter(function(n){ return C[n]; })[0] || 'warn_' + e.type;
      o(nm, { d: d || (C[nm] && C[nm].d) || 0.6, x: e.x, y: e.y, warn: true });
      break;
    }
    case 'pickup':
      if (e.kind === 'xp') { if (at - xpAt > 0.6) xpStep = 0; o('xp', { rate: ladderRate(xpStep), force: true }); xpStep = Math.min(7, xpStep + 1); xpAt = at; }
      else if (e.kind === 'repair') o('repair');
      else if (e.kind === 'schematic') o('schematic');
      else if (e.kind === 'credits' || e.kind === 'coin') o('coin');
      break;
    case 'levelup': o('level_up'); break;
    case 'pick': o(e.level === 3 ? 'pick_lv3' : (e.level === 2 ? 'pick_lv2' : 'pick_confirm')); if (e.setDone) o('set_done', { delay: 0.2 }); break;
    case 'room': o('stage_whoosh'); if (e.kind !== 'boss' && e.kind !== 'collect' && e.kind !== 'supply') o('spawn', { delay: 0.2 }); break;
    case 'door': o('door_open'); o('room_clear', { v: clearForm++ % 4, delay: 0.1 }); break;
    case 'supply': o('sheet'); break;
    case 'chest': o('cache'); break;
    case 'boss': o('boss_intro'); break;
    case 'elite': o('elite'); break;
    case 'bossphase': o('boss_phase'); break;
    case 'win': o('chapter_clear', { delay: S && S.bossWin ? 2.8 : 0.2 }); break;
    case 'reroll_bank': o('reroll_bank'); break;
    case 'offer': o('offer_flip'); break;
    // catch room (K): sd:start sd:catch sd:dud sd:miss sd:tier sd:end sd:payout (+ sd:near sd:count sd:pad if K adds them)
    case 'sd:start': o('sd_count'); break;
    case 'sd:catch': {
      if (at - sdAt > 0.8) sdStep = 0;
      o('sd_catch', { rate: ladderRate(sdStep), force: true }); sdStep = Math.min(7, sdStep + 1); sdAt = at;
      var st = e.streak != null ? e.streak : sdStep;
      if (st === 3) o('sd_streak3', { delay: 0.04 }); else if (st === 5) o('sd_streak5', { delay: 0.04 });
      break;
    }
    case 'sd:dud': sdStep = 0; o('sd_dud'); break;
    case 'sd:miss': o('sd_land'); break;
    case 'sd:near': o('sd_near'); break;
    case 'sd:count': o(e.last3 || e.final ? 'sd_tick' : 'sd_count'); break;
    case 'sd:tier': o('sd_tier'); break;
    case 'sd:end': o(e.perfect || e.perfectBeat || e.net >= 20 ? 'sd_perfect' : 'sd_timeup'); break;   // K: perfectBeat = all 20 before time
    case 'sd:pad': o('sd_pad'); break;
    case 'sd:payout': o('sd_take'); break;
  }
  return out;
}
// Events that are silent on purpose (listed so the coverage lint can tell "no cue" from "forgotten").
var SILENT = { reroll: 'spend: ui.js and home.js play the reroll cue themselves (one sound, not two)', unlock: 'hero target lost: no sound', dot: 'burn ticks: hit cue would flood (guess)', death: 'covered by hurt + down', error: 'debug only' };
function event(e, S){
  if (!e) return;
  if (S) lastS = S;
  if (e.k === 'kill' && e.boss) { bossDeadAt = ctx ? ctx.currentTime : 0; musicStop(0.1); }
  if (e.k === 'hurt' && e.down) musicDeath();
  if (e.k === 'boss') duck(musicDuck, duckBase(), 9, 2.5);
  if (e.k === 'bossphase') duck(musicDuck, duckBase(), 9, 0.8);
  if (e.k === 'hurt') duck(musicDuck, duckBase(), 6, 0.4);
  if (e.k === 'room') { pend = {}; seenShot = typeof WeakSet !== 'undefined' ? new WeakSet() : null; seenShell = seenShot ? new WeakSet() : null; bossDeadAt = -1; if (e.stage === 1) runOver = false; }
  if (e.k === 'tell' && !e.lock) pend[e.id] = { type: e.type, ticked: e.type === 'E-05' || e.type === 'E-06', tt: S && enemyById(S, e.id) ? enemyById(S, e.id).tellT : 0 };
  if (e.k === 'tell' && e.lock && pend[e.id]) pend[e.id].ticked = true;
  var list = cueFor(e, S);
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c.opts.warn && !warnOk(c, S)) continue;
    play(c.name, c.opts);
    if (c.name === 'lock' || c.name.indexOf('ping_') === 0) lockDuck();
  }
}
// crowding (07 s3): same tell type within 120 ms merges (cue gap); at most 3 warn voices, the one nearest the hero wins
function warnOk(c, S){
  cleanup();
  var w = live.filter(function(v){ return v.name.indexOf('warn_') === 0; });
  if (w.length < 3) return true;
  var h = S && S.hero; if (!h || c.opts.x == null) { merged++; return false; }
  function dist(v){ return v.x == null ? 0 : Math.hypot(v.x - h.x, v.y - h.y); }
  var far = w[0]; w.forEach(function(v){ if (dist(v) > dist(far)) far = v; });
  if (Math.hypot(c.opts.x - h.x, c.opts.y - h.y) >= dist(far)) { merged++; return false; }
  try { far.g.gain.setTargetAtTime(0, ctx.currentTime, 0.01); far.n.stop(ctx.currentTime + 0.05); } catch (e) {}
  live.splice(live.indexOf(far), 1); return true;
}
function lockDuck(){ duck(musicDuck, duckBase(), 6, 0.25); duck(bus.c, 1, 4, 0.25); }   // [spec] lock tick ducks music 6 dB, combat 4 dB, 250 ms

// ---- per-step watch (07 s3): lock tick 200 ms before the attack, attack cues, enemy rounds, shells, heartbeat, music state ----
var shellLock = typeof WeakSet !== 'undefined' ? new WeakSet() : { has: function(){ return true; }, add: function(){} };
var pend = {}, seenShot = typeof WeakSet !== 'undefined' ? new WeakSet() : null, seenShell = seenShot ? new WeakSet() : null, lastS = null, bossDeadAt = -1, runOver = false;
var LOCK_LEAD = 0.2;   // [spec] one shared lock tick 200 ms before the attack
var hb = { on: false, next: 0 }, sdClock = { dots: 0, left: 99 }, SD_ROOM_S = 10;   // [spec] SPEC.md R53 10 s clock
function step(S){
  if (!S) return;
  lastS = S;
  if (S.phase === 'play') { runOver = false; if (S.stageKind !== 'boss') bossDeadAt = -1; }   // a new run or room after an end
  var nowSheet = S.phase === 'pick' || S.phase === 'supply' || !!S.mini && S.phase !== 'play';
  if (nowSheet !== sheetDuck) { sheetDuck = nowSheet; if (ctx && musicDuck) duck(musicDuck, duckBase(), 0, 0); }
  if (S.phase === 'results' || S.phase === 'dead') { if (!runOver) { runOver = true; if (S.result && !S.result.win) musicDeath(); else musicStop(0.5); } }
  if (!ctx || !on()) return;
  var mm = S.mini;   // catch room clock (S-312): one soft tick per count-in dot, a quiet tick each of the last 3 s (K: ROOM_S 10)
  if (mm) {
    if (mm.phase === 'countin' && (mm.dots | 0) !== sdClock.dots) { sdClock.dots = mm.dots | 0; if (sdClock.dots > 0) play('sd_count', { force: true }); }
    if (mm.phase === 'play') { var left = Math.ceil(SD_ROOM_S - mm.t); if (left <= 3 && left >= 1 && left !== sdClock.left) { sdClock.left = left; play('sd_tick', { force: true }); } }
  } else { sdClock.dots = 0; sdClock.left = 99; }
  var id, e;
  for (id in pend) {
    e = enemyById(S, +id) || enemyById(S, id);
    var p = pend[id];
    if (!e || e.hp <= 0) { delete pend[id]; continue; }
    if (e.st !== 'tell') {   // tell ended: the attack
      if (p.type === 'E-01') play('snap_E-01');
      else if (p.type === 'E-05') play('dash');
      else if (p.type === 'E-07') play('pop_E-07');
      delete pend[id]; continue;
    }
    if (!p.ticked && e.stT <= LOCK_LEAD) { p.ticked = true; if (play('lock')) lockDuck(); }
  }
  if (seenShot && S.shots) { var nf = 0; for (var i = 0; i < S.shots.length; i++) if (!seenShot.has(S.shots[i])) { seenShot.add(S.shots[i]); nf++; } if (nf) play('enemy_fire'); }
  if (seenShell && S.shells) for (var j = 0; j < S.shells.length; j++) {
    var s = S.shells[j];
    if (!seenShell.has(s)) { seenShell.add(s); play('mortar_launch'); play('whistle', { d: Math.max(0.1, s.T - s.t), force: true }); }
    if (s.T - s.t <= LOCK_LEAD && !shellLock.has(s)) { shellLock.add(s); if (play('lock')) lockDuck(); }   // shell lock tick, then the blast on `land`
  }
  // heartbeat (S-015): HP under 30% at 1.0 Hz, under 15% at 1.2 Hz [spec max 1.2 Hz], only while fighting
  var h = S.hero, f = h && h.maxHp > 0 ? h.hp / h.maxHp : 1, t = ctx.currentTime;
  var want = (S.phase === 'play' || S.phase === 'clear') && h && h.hp > 0 && f < 0.3;
  if (want) { if (!hb.on) { hb.on = true; hb.next = t + 0.05; } if (t >= hb.next - 0.05) { play('beat', { delay: Math.max(0, hb.next - t) }); hb.next += f < 0.15 ? 1 / 1.2 : 1.0; if (hb.next < t) hb.next = t + 0.3; } }
  else hb.on = false;
}

// ---- music (07 s5): one live-sequenced loop per chapter, plus boss and home versions from the same notes ----
// Ch1 desert, D minor. 16 bars of 16 steps; A half bars 0-7, B half bars 8-15. All motifs written for Volley (originality rule).
var VER = {
  run:  { bpm: 100, pad: 1, wind: 1, bass: 1, drums: 1, lead: 1 },
  boss: { bpm: 116, pad: 1, wind: 1, bass: 2, drums: 2, lead: 2 },
  home: { bpm: 80,  pad: 1, wind: 0, bass: 0, drums: 0, lead: 3 }
};
var CH = [[62,65,69],[62,65,69],[58,62,65],[60,64,67],[62,65,69],[55,58,62],[58,62,65],[57,61,64],
          [55,58,62],[55,58,62],[62,65,69],[62,65,69],[58,62,65],[60,64,67],[57,61,64],[57,61,64]];
var ROOT = [38,38,46,36,38,43,46,45, 43,43,38,38,46,36,45,45];
var R1 = [[0,2],[3,1],[4,0],[6,1],[8,2],[11,3],[12,2],[14,1]], R2 = [[0,0],[2,1],[4,2],[8,1],[12,0]], R3 = [[0,3],[4,2],[6,1],[8,2],[10,0],[12,1]];
var HOME_ARP = [[0,0],[6,2],[10,1]];
var mus = { ver: null, pend: null, step: 0, next: 0, pass: 0, force: undefined, wind: null, voices: 0, restart: false };
var timer = null;
function startTimer(){ if (timer || !G.setInterval) return; timer = G.setInterval(tick, 25); }
function wantVer(){
  if (mus.force !== undefined) return mus.force;
  if (!musicOn()) return null;
  if (V.Title && V.Title.visible) return 'home';
  if (V.Run && V.Run.home) return 'home';
  var S = lastS;
  if (!S) return null;
  if (S.phase === 'results' || S.phase === 'dead' || runOver) return null;
  if (bossDeadAt >= 0) return null;
  if (S.mini) return 'home';   // catch room: the calm version (guess; SPEC.md names no music)
  return S.stageKind === 'boss' ? 'boss' : 'run';
}
function tick(){
  if (!ctx || ctx.state !== 'running' || !musicIn) return;
  var w = wantVer(), t = ctx.currentTime;
  if (w !== mus.ver && w !== mus.pend) {
    if (!w) { musicStop(0.5); return; }
    if (!mus.ver) { musStart(w, t + 0.08); }
    else mus.pend = w;   // switch on the next bar line
  }
  if (!mus.ver) return;
  if (mus.restart) { mus.restart = false; mus.step = mus.step - (mus.step & 15); mus.next = t + 0.08; }
  if (mus.next < t - 0.25) mus.next = t + 0.05;   // a long stall: rejoin the clock instead of a burst of notes
  var guard = 0;
  while (mus.next < t + 0.12 && guard++ < 32) {
    if ((mus.step & 15) === 0 && mus.pend) { var nv = mus.pend; mus.pend = null; mus.ver = nv; try { musicVer.gain.setTargetAtTime(0.2, mus.next - 0.1, 0.03); musicVer.gain.setTargetAtTime(1, mus.next, 0.06); } catch (e) {} }
    if (!mus.ver) return;
    sched(mus.step, mus.next);
    mus.next += 60 / VER[mus.ver].bpm / 4;
    mus.step = (mus.step + 1) & 255; if (mus.step === 0) mus.pass++;
  }
}
function musStart(v, t){
  mus.ver = v; mus.pend = null; mus.step = 0; mus.next = t; mus.pass = 0;
  try { musicFilt.frequency.cancelScheduledValues(ctx.currentTime); musicFilt.frequency.setValueAtTime(12000, ctx.currentTime); musicVer.gain.cancelScheduledValues(ctx.currentTime); musicVer.gain.setValueAtTime(0, ctx.currentTime); musicVer.gain.linearRampToValueAtTime(1, t + 0.5); } catch (e) {}
  windOn(VER[v].wind);
}
function musicStop(fade){
  if (!ctx || !mus.ver) { mus.ver = null; mus.pend = null; return; }
  var t = ctx.currentTime; mus.ver = null; mus.pend = null;
  try { musicVer.gain.cancelScheduledValues(t); musicVer.gain.setValueAtTime(musicVer.gain.value, t); musicVer.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.5)); } catch (e) {}
  windOn(0);
}
function musicDeath(){   // [spec] death closes the music filter over 600 ms
  if (!ctx || !musicFilt) return;
  var t = ctx.currentTime; try { musicFilt.frequency.cancelScheduledValues(t); musicFilt.frequency.setValueAtTime(musicFilt.frequency.value, t); musicFilt.frequency.exponentialRampToValueAtTime(150, t + 0.6); } catch (e) {}
  runOver = true; setTimeout(function(){ musicStop(0.3); }, 600);
}
function windOn(onv){
  if (!ctx) return;
  if (onv && !mus.wind) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    s.buffer = nzBuf(ctx); s.loop = true; s.playbackRate.value = 0.5; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.8;
    lfo.frequency.value = 0.07; lg.gain.value = 350; lfo.connect(lg); lg.connect(f.frequency);
    g.gain.value = 0.0001; g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.8);
    s.connect(f); f.connect(g); g.connect(musicIn); s.start(); lfo.start(); mus.wind = { s: s, l: lfo, g: g };
  } else if (!onv && mus.wind) {
    var w = mus.wind; mus.wind = null; var t = ctx.currentTime;
    try { w.g.gain.setTargetAtTime(0.0001, t, 0.15); w.s.stop(t + 0.8); w.l.stop(t + 0.8); } catch (e) {}
  }
}
function mnote(f, t, d, w, v, lp, a){   // one music voice; at most 8 at once [spec]
  if (mus.voices >= 8) return;
  var os = ctx.createOscillator(), g = ctx.createGain(), out = os;
  os.type = w; os.frequency.value = f;
  if (lp) { var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; os.connect(fl); out = fl; }
  out.connect(g); g.connect(musicIn);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (a || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  os.start(t); os.stop(t + d + 0.05); mus.voices++;
  os.onended = function(){ mus.voices = Math.max(0, mus.voices - 1); try { g.disconnect(); } catch (e) {} };
}
function mdrum(kind, t, v){
  if (mus.voices >= 8) return;
  var g = ctx.createGain(), n; g.connect(musicIn); mus.voices++;
  if (kind === 'hat') {
    n = ctx.createBufferSource(); n.buffer = nzBuf(ctx); var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500; n.connect(f); f.connect(g);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); n.start(t, rnd() * 0.5); n.stop(t + 0.06);
  } else {
    n = ctx.createOscillator(); n.type = 'sine';
    var f0 = kind === 'kick' ? 150 : (kind === 'tom' ? 200 : 260), f1 = kind === 'kick' ? 45 : (kind === 'tom' ? 110 : 140);
    n.frequency.setValueAtTime(f0, t); n.frequency.exponentialRampToValueAtTime(f1, t + 0.12); n.connect(g);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'kick' ? 0.22 : 0.16)); n.start(t); n.stop(t + 0.25);
  }
  n.onended = function(){ mus.voices = Math.max(0, mus.voices - 1); try { g.disconnect(); } catch (e) {} };
}
function sched(s, t){
  var P = VER[mus.ver], bar = s >> 4, st = s & 15, sd = 60 / P.bpm / 4, ch = CH[bar], root = ROOT[bar];
  var fill = P.drums && (mus.pass % 4) === 3 && bar === 15 && st >= 8;   // seeded fill on every fourth pass
  if (P.pad && st === 0) for (var i = 0; i < 3; i++) mnote(mf(ch[i]), t, sd * 16 * 0.98, P.lead === 3 ? 'sine' : 'triangle', 0.05, 1200, 0.3);
  if (P.bass === 1 && [0, 3, 6, 8, 11, 14].indexOf(st) >= 0) mnote(mf(st === 14 ? root + 7 : root), t, sd * 1.6, 'sawtooth', 0.16, 700);
  if (P.bass === 2 && (st & 1) === 0) mnote(mf(root + ((st & 2) ? 12 : 0)), t, sd * 1.2, 'sawtooth', 0.17, 800);
  if (fill) mdrum('tom', t, 0.3 + rnd() * 0.15);   // tom run on the last half bar
  else if (P.drums === 1) {
    if (st === 0 || st === 8 || (st === 10 && (bar & 1))) mdrum('kick', t, 0.6);
    if (st === 4 || st === 12) mdrum('tom', t, 0.32);
    if ((st & 3) === 2) mdrum('hat', t, 0.08);
  } else if (P.drums === 2) {
    if ((st & 3) === 0) mdrum('kick', t, 0.65);
    if (st === 6 || st === 14) mdrum('tom', t, 0.35);
    mdrum('hat', t, (st & 1) ? 0.05 : 0.09);   // double-time hats
  }
  var rest = P.lead === 1 && (bar & 3) === 3;
  if (P.lead && P.lead !== 3 && !rest) {
    var R = bar >= 8 ? ((bar & 1) ? R2 : R3) : ((bar & 1) ? R2 : R1);
    for (var j = 0; j < R.length; j++) if (R[j][0] === st) { var dg = R[j][1], n = dg >= 3 ? ch[dg - 3] + 12 : ch[dg]; mnote(mf(n + 12), t, sd * 1.5, P.lead === 2 ? 'square' : 'triangle', P.lead === 2 ? 0.07 : 0.11, 1100); }
  }
  if (P.lead === 3) for (var k = 0; k < HOME_ARP.length; k++) if (HOME_ARP[k][0] === st && (bar & 1) === 0) mnote(mf(ch[HOME_ARP[k][1]] + 12), t, sd * 3, 'sine', 0.07, 1400, 0.02);
}

// ---- lifecycle ----
if (G.addEventListener) {
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function(ev){ G.addEventListener(ev, unlock, true); });   // [spec] 07 s8, L-HB-2 item 1
  if (G.document) document.addEventListener('visibilitychange', function(){
    if (!ctx) return;
    if (document.hidden) { stopAll(); mus.restart = true; ctx.suspend().catch(function(){}); }
    else if (!paused) ctx.resume().catch(function(){});
  });
}

// ---- menu taps (S-500): one delegated listener, so the tab and button files need no sound code. A button that plays its own
// cue (buy, settings levels, title) carries data-act="buy", data-level or sits in the title; those are skipped here.
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target : null; if (!t) return;
  if (t.closest('#pvTitle,#pvSoundboard,[data-act="buy"],[data-level],[data-nosfx],.cu-take')) return;   // Take plays sd_take via sd:payout
  if (t.closest('.cu-r')) { play('sd_pad'); return; }   // catch-room pad swap (S-313)
  if (t.closest('.pv-tab')) play('tab'); else if (t.closest('.pv-btn,.tb-row,.ta-head,.btn')) play('button');
}, true);

// ---- listening page (07 s10, L-HB-4b, W-012): ?sounds=1 opens a soundboard over the game ----
function board(){
  if (typeof document === 'undefined') return null;
  var old = document.getElementById('pvSoundboard'); if (old) { old.remove(); return null; }
  var d = document.createElement('div'); d.id = 'pvSoundboard';
  d.style.cssText = 'position:fixed;inset:0;z-index:200;overflow-y:auto;background:#0b0e11;color:#e4dfd2;font:14px/1.3 system-ui,sans-serif;padding:12px;touch-action:pan-y';
  var h = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><b style="font-size:17px;flex:1">Listening page: every cue is "not heard by ear" until M listens</b>' +
    '<button data-x style="min-height:56px;min-width:96px">Close</button></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
    ['run', 'boss', 'home'].map(function(v){ return '<button data-m="' + v + '" style="min-height:56px;min-width:96px">Music: ' + v + '</button>'; }).join('') +
    '<button data-m="" style="min-height:56px;min-width:96px">Music off</button></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px">';
  Object.keys(C).forEach(function(n){ h += '<button data-c="' + n + '" style="min-height:56px;text-align:left;padding:4px 8px;font-size:13px"><b>' + C[n].id + '</b><br>' + n + '</button>'; });
  d.innerHTML = h + '</div>';
  d.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-x')) { mus.force = undefined; d.remove(); return; }
    whenRunning(function(){
      if (b.hasAttribute('data-m')) { var v = b.getAttribute('data-m') || null; mus.force = v; if (mus.ver && v) { mus.pend = v; } }
      else play(b.getAttribute('data-c'), { force: true, d: 0.8 });
    });
  });
  document.body.appendChild(d); return d;
}
if (typeof document !== 'undefined' && G.location && /[?&]sounds=1(&|#|$)/.test(G.location.search || '')) {
  var openB = function(){ board(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openB); else setTimeout(openB, 0);
}

// ---- offline render for tests (L-HB-2 item 5: worst burst peak under 0.9; 07 s6 loudness check) ----
function renderMix(spec, seconds){
  var OAC = G.OfflineAudioContext; if (!OAC) return Promise.resolve(null);
  var sr = 44100, oc = new OAC(1, Math.ceil(sr * (seconds || 1)), sr);
  var sv = { master: master, sfxBus: sfxBus, musicBus: musicBus, comp: comp, bus: bus, musicIn: musicIn, musicDuck: musicDuck, musicFilt: musicFilt, musicVer: musicVer, ctx: ctx, mus: mus };
  bus = {}; build(oc); master.gain.value = BASE; sfxBus.gain.value = 1; musicBus.gain.value = 1;   // independent of the player's levels
  ctx = oc; mus = { ver: null, pend: null, step: 0, next: 0, pass: 0, voices: 0 };
  (spec || []).forEach(function(it){
    if (it.music) { mus.ver = it.music; var sd = 60 / VER[it.music].bpm / 4; for (var s = 0, t = it.t || 0; t < (seconds || 1); s++, t += sd) { mus.voices = 0; sched(s & 255, t); } return; }
    var cu = C[ALIAS[it.n] || it.n]; if (!cu) return;
    var g = oc.createGain(); g.connect(bus[cu.bus]); cu.fn(oc, g, it.t || 0.01, it.v || 0, { d: it.d || cu.d });
  });
  var probe = { ctx: oc };
  var res = oc.startRendering();
  master = sv.master; sfxBus = sv.sfxBus; musicBus = sv.musicBus; comp = sv.comp; bus = sv.bus; musicIn = sv.musicIn; musicDuck = sv.musicDuck; musicFilt = sv.musicFilt; musicVer = sv.musicVer; ctx = sv.ctx; mus = sv.mus;
  return res.then(function(b){
    var d = b.getChannelData(0), pk = 0, sq = 0, i;
    for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > pk) pk = a; sq += d[i] * d[i]; }
    var rms = Math.sqrt(sq / d.length);
    return { peak: pk, rmsDb: 20 * Math.log10(rms || 1e-9), seconds: b.duration, probe: !!probe };
  });
}

V.Audio = {
  play: play,
  unlock: unlock,
  whenRunning: whenRunning,
  event: event,
  step: step,
  cueFor: cueFor,
  CUES: C, ALIAS: ALIAS, SILENT: SILENT, LADDER: LADDER,
  music: function(v){ mus.force = v === undefined ? undefined : (v || null); },   // force a version for the listening page; music() returns to auto
  get musicVersion(){ return mus.ver; },
  board: board,
  seed: function(s){ seed0 = s | 0; rs = (seed0 ^ 0x5eed1234) | 0; },
  rand: function(){ return rnd(); },
  get seedValue(){ return seed0; },
  LEVELS: LEVELS, SETTINGS_KEY: SKEY,
  settings: function(){ return clean(set); },
  setMuted: setMuted,
  get muted(){ return set.muted; },
  setMaster: function(v){ v = +v; if (!(v >= 0)) v = 0; if (v > 1) v = 1; set.master = v; applyGains(); saveSettings(); },
  // Sound / Music rows (07 s9): a level change plays the changed bus at its new level (S-511)
  setLevel: function(b, lv){
    if (!(lv in LEVELS) || (b !== 'sfx' && b !== 'music')) return false;
    set[b] = lv; if (lv !== 'off' && set.muted) set.muted = false; applyGains(); saveSettings();
    if (lv !== 'off') whenRunning(function(){ if (b === 'sfx') play('settings', { force: true }); else if (ctx && musicIn) { var t = ctx.currentTime + 0.02; mnote(mf(62), t, 0.5, 'triangle', 0.12, 1200, 0.02); mnote(mf(69), t, 0.5, 'triangle', 0.1, 1200, 0.02); } });
    return true;
  },
  reloadSettings: function(){ loadSettings(); applyGains(); return clean(set); },
  get gains(){ return { master: masterGain(), sfx: sfxGain(), music: musicGain() }; },
  get musicBus(){ return musicBus; },
  get available(){ return !!(G.AudioContext || G.webkitAudioContext); },
  setPaused: function(p){
    paused = !!p; if (!ctx) return;
    if (paused) { stopAll(); ctx.suspend().catch(function(){}); }
    else if (!(G.document && document.hidden)) { var pr = ctx.resume(); if (pr && pr.then) pr.then(function(){ play('resume', { force: true }); }, function(){}); }
  },
  renderBurst: function(spec){   // F0 shape kept: names in, peak out
    var it = (spec || ['hurt', 'levelup', 'kill', 'kill', 'kill']).map(function(n){ return { n: n, t: 0.01 }; });
    return renderMix(it, 1).then(function(r){ return r ? r.peak : null; });
  },
  renderMix: renderMix,
  get state(){ return ctx ? ctx.state : 'none'; },
  get voices(){ cleanup(); return live.length; },
  get played(){ return played; },
  get dropped(){ return dropped; },
  get merged(){ return merged; },
  get missing(){ return missing; },
  get baked(){ return bakeN; },
  get bakeMs(){ return bakeMs; },
  CAP: CAP,
  _ctxForTest: function(){ return ctx; }
};
})();
