// Headless checks for parts/audio.js (F1 sound, spec 07; L-HB-1, L-HB-2, L-PV-10, L-TD-6). Run: node test-audio.js
// A small fake AudioContext stands in for Web Audio: it proves wiring, caps, priorities and the event map, not how anything sounds.
// The browser checks (offline-render peak and level) are in f1/A-REPORT.md.
var path = require('path');
function Param(v){ this.value = v; }
['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues'].forEach(function(k){ Param.prototype[k] = function(v, t){ if (!isFinite(v) || (t !== undefined && !isFinite(t))) throw new TypeError(k + ': non-finite'); return this; }; });
function Node(ctx){ this.ctx = ctx; this.gain = new Param(1); this.frequency = new Param(440); this.detune = new Param(0); this.Q = new Param(1); this.playbackRate = new Param(1);
  this.delayTime = new Param(0); this.threshold = new Param(0); this.knee = new Param(0); this.ratio = new Param(1); this.attack = new Param(0); this.release = new Param(0); }
Node.prototype.connect = function(n){ if (!(n instanceof Node) && !(n instanceof Param)) throw new TypeError('connect: not a node'); return n; }; Node.prototype.disconnect = function(){};
Node.prototype.start = function(t){ this.ctx.starts++; this.t0 = t; }; Node.prototype.stop = function(t){ this.t1 = t; };
function Ctx(){ this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 48000; this.starts = 0; this.resumes = 0; this.destination = new Node(this); FAKE.last = this; }
['createGain', 'createOscillator', 'createBiquadFilter', 'createBufferSource', 'createDynamicsCompressor', 'createDelay'].forEach(function(k){ Ctx.prototype[k] = function(){ return new Node(this); }; });
Ctx.prototype.createBuffer = function(ch, n){ var d = new Float32Array(n); return { getChannelData: function(){ return d; }, duration: n / 48000 }; };
Ctx.prototype.resume = function(){ var c = this; c.resumes++; return Promise.resolve().then(function(){ c.state = 'running'; }); };
Ctx.prototype.suspend = function(){ this.state = 'suspended'; return Promise.resolve(); };
var FAKE = {};
var listeners = {};
globalThis.window = globalThis;
globalThis.AudioContext = Ctx;
globalThis.addEventListener = function(k, f){ (listeners[k] = listeners[k] || []).push(f); };
globalThis.setInterval = function(){ return 1; };   // no music timer in the test (tick is not run)
var store = {}; globalThis.localStorage = { getItem: function(k){ return store[k] == null ? null : store[k]; }, setItem: function(k, v){ store[k] = String(v); }, removeItem: function(k){ delete store[k]; } };
['tune', 'rng'].forEach(function(f){ require(path.join(__dirname, 'parts', f + '.js')); });
require(path.join(__dirname, 'parts', 'audio.js'));
var V = globalThis.V, A = V.Audio;
var rows = [], fails = 0;
function check(id, what, ok, got){ rows.push([id, what, ok ? 'PASS' : 'FAIL', got === undefined ? '' : got]); if (!ok) fails++; }

(async function(){
  // ---- cue table and event coverage lint (07 s10) ----
  var C = A.CUES, names = Object.keys(C);
  check('A1', 'every cue has a recipe, an id, a bus and a length', names.every(function(n){ var c = C[n]; return typeof c.fn === 'function' && /^S-\d/.test(c.id) && 'ctu'.indexOf(c.bus) >= 0 && c.d > 0; }), names.length + ' cues');
  var ids = {}, dup = names.filter(function(n){ var d = ids[C[n].id]; ids[C[n].id] = 1; return d; });
  check('A1', 'every cue id is unique', dup.length === 0, dup.join(',') || 'ok');
  check('A1', 'about 46+ slice cues (07 s10: F1 delivers about 46)', names.length >= 46, names.length);
  var SIM = ['fire', 'hit', 'crit', 'kill', 'hurt', 'dodge', 'lock', 'unlock', 'tell', 'door', 'room', 'levelup', 'pick', 'death', 'pickup', 'land', 'supply', 'chest', 'boss', 'bossphase', 'win', 'block', 'stun', 'dot', 'reroll'];
  var SD = ['sd:start', 'sd:catch', 'sd:dud', 'sd:miss', 'sd:tier', 'sd:end', 'sd:payout'];
  var ev = { fire: {}, hit: {}, crit: {}, kill: { size: 'small' }, hurt: { src: 'E-02' }, dodge: {}, lock: {}, unlock: {}, tell: { type: 'E-02' }, door: {}, room: { kind: 'combat' }, levelup: {}, pick: {},
    death: {}, pickup: { kind: 'xp' }, land: {}, supply: {}, chest: {}, boss: {}, bossphase: {}, win: {}, block: {}, stun: {}, dot: {}, reroll: {} };
  var uncovered = SIM.concat(SD).filter(function(k){ var e = Object.assign({ k: k }, ev[k] || {}); var l = A.cueFor(e, null); return !l.length && !A.SILENT[k]; });
  check('A2', 'every sim and catch-room event has a cue or is listed silent', uncovered.length === 0, uncovered.join(',') || 'all covered');
  var badName = []; SIM.concat(SD).forEach(function(k){ A.cueFor(Object.assign({ k: k }, ev[k] || {}), null).forEach(function(c){ if (!C[c.name]) badName.push(k + '->' + c.name); }); });
  ['E-01', 'E-02', 'E-03', 'E-04', 'E-05'].forEach(function(t){ A.cueFor({ k: 'tell', type: t }, null).forEach(function(c){ if (!C[c.name]) badName.push('tell ' + t); }); });
  ['A', 'B', 'C'].forEach(function(a){ var c = A.cueFor({ k: 'tell', type: 'B-01', attack: a }, null)[0]; if (!C[c.name] || c.name !== 'warn_B-01' + a) badName.push('B-01 ' + a); });
  // step 7 (AU): new machine tells, boss attack letters (B-03V falls back to B-03), E-08 lock ping
  ['E-06', 'E-07', 'E-08'].forEach(function(t){ var c = A.cueFor({ k: 'tell', type: t }, null)[0]; if (!C[c.name] || c.name !== 'warn_' + t) badName.push('tell ' + t); });
  if (A.cueFor({ k: 'tell', type: 'E-06h' }, null)[0].name !== 'warn_E-06') badName.push('tell E-06h');
  [['B-03', 'B-03'], ['B-03V', 'B-03'], ['B-02', 'B-02'], ['B-04', 'B-04']].forEach(function(p){ ['A', 'B'].forEach(function(a){ var c = A.cueFor({ k: 'tell', type: p[0], attack: a }, null)[0]; if (!C[c.name] || c.name !== 'warn_' + p[1] + a) badName.push(p[0] + ' ' + a); }); });
  if (A.cueFor({ k: 'tell', type: 'E-08', lock: true }, null)[0].name !== 'ping_E-08') badName.push('E-08 lock');
  if (!C['pop_E-07']) badName.push('pop_E-07');
  check('A2', 'every mapped cue exists (incl. each slice tell and each B-01 attack; step 7 E-06..E-08, B-02/B-03/B-03V/B-04 A+B, E-08 ping)', badName.length === 0, badName.join(',') || 'ok');
  var hurtUse = []; SIM.concat(SD).forEach(function(k){ if (k === 'hurt') return; A.cueFor(Object.assign({ k: k }, ev[k] || {}), null).forEach(function(c){ if (/^hurt_/.test(c.name)) hurtUse.push(k); }); });
  check('A3', 'L-PV-10: no event but hero hurt uses a hurt cue (boss phase has its own)', hurtUse.length === 0 && A.cueFor({ k: 'bossphase' })[0].name === 'boss_phase', hurtUse.join(',') || 'ok');
  check('A3', 'hurt variants: hazard, blast, contact, round', A.cueFor({ k: 'hurt', src: 'spikes' })[0].name === 'hurt_hazard' && A.cueFor({ k: 'hurt', src: 'E-04' })[0].name === 'hurt_blast' &&
    A.cueFor({ k: 'hurt', src: 'E-05' })[0].name === 'hurt_contact' && A.cueFor({ k: 'hurt', src: 'E-02' })[0].name === 'hurt_round');
  var tc = A.cueFor({ k: 'tell', type: 'E-02', id: 7 }, { enemies: [{ id: 7, tellT: 0.51 }] })[0];
  check('A4', 'tell cue length = the tell time the sim shows (R31)', tc.opts.d === 0.51, tc.opts.d);
  check('A4', 'E-05 lock event -> shared lock tick', A.cueFor({ k: 'tell', type: 'E-05', lock: true })[0].name === 'lock' && C.lock.pri === 3);
  check('A5', 'F0 names still play (aliases)', ['fire', 'hit', 'kill', 'hurt', 'door', 'levelup', 'reroll'].every(function(n){ return C[n] || C[A.ALIAS[n]]; }));
  var m0 = A.missing; A.play('no_such_cue'); check('A5', 'unknown cue plays nothing and counts as missing (QA-048)', A.missing === m0 + 1, A.missing);

  // every recipe runs on a context with the right argument order (context, output, time) and finite params
  var bad = []; names.forEach(function(n){ try { var c0 = new Ctx(); C[n].fn(c0, c0.destination, 0.01, 0, { d: C[n].d }); } catch (e) { bad.push(n + ': ' + e.message); } });
  check('A1', 'every recipe builds on a context without error', bad.length === 0, bad.slice(0, 3).join('; ') || 'ok');
  // ---- seeded stream (L-TD-6, L-HB-2 item 4) ----
  A.seed(42); var a = [A.rand(), A.rand(), A.rand()]; A.seed(42); var b = [A.rand(), A.rand(), A.rand()];
  var r = new V.Rng(5), r0 = r.next(); r = new V.Rng(5); A.seed(1); for (var i = 0; i < 50; i++) A.rand(); var r1 = r.next();
  check('A6', 'audio stream repeats by seed and never moves a sim Rng', a.join() === b.join() && r0 === r1);

  // ---- unlock (L-HB-2 item 1) and resume-time sound (L-HB-1) ----
  check('A7', 'unlock listeners in capture phase: pointerdown, pointerup, touchend, click, keydown', ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].every(function(k){ return listeners[k] && listeners[k].length; }));
  listeners.keydown[0]({});   // a key press alone makes and resumes the context
  var c = FAKE.last;
  check('A7', 'keydown alone creates and resumes the context', !!c && c.resumes === 1, c ? c.resumes : 'none');
  var v0 = A.voices, p = A.play('button');
  check('A8', 'L-HB-1: a sound asked for while still suspended is scheduled, not dropped', p === true && A.voices === v0 + 1, A.state + ' voices ' + A.voices);
  await Promise.resolve(); await Promise.resolve();
  check('A8', 'context running after the resume promise', A.state === 'running', A.state);

  // ---- caps, priority and flood (L-HB-2 item 3) ----
  c.currentTime = 10; for (i = 0; i < 60; i++) { c.currentTime += 0.05; A.play('hit'); }
  check('A9', 'flood: 60 hits stay under the per-cue cap 4 and the global cap', A.voices <= 5 && A.voices <= A.CAP, 'voices ' + A.voices);
  c.currentTime = 20; var names20 = ['fire', 'hit', 'kill_s', 'kill_m', 'enemy_fire', 'xp', 'coin', 'spawn', 'dodge', 'brace', 'block', 'tab', 'button', 'count', 'results_tick', 'sd_catch', 'sd_pad', 'sd_count', 'sd_near', 'tile_pop', 'pause', 'toast', 'equip', 'sheet', 'stage_whoosh', 'snap_E-01'];
  names20.forEach(function(n){ A.play(n, { force: true }); });
  var full = A.voices;
  check('A9', 'priority 1 and 2 voices stop at 20, 4 held for priority 3', full <= A.CAP - 4, full);
  var ok3 = true, h3 = ['hurt_round', 'hurt_blast', 'lock', 'boss_phase', 'down', 'hurt_contact']; for (i = 0; i < h3.length; i++) ok3 = A.play(h3[i], { force: true }) && ok3;
  check('A9', 'priority 3 (hero hurt) always plays when the board is full', ok3 && A.voices <= A.CAP, 'voices ' + A.voices);
  c.currentTime = 30; A.play('fire', { force: true }); var d0 = A.played; A.play('fire');
  check('A10', 'a second fire inside its 60 ms gap merges', A.played === d0, 'merged ' + A.merged);

  // ---- pause keeps it quiet (07 s8, L-HB-2 item 2) ----
  A.setPaused(true); c.currentTime = 40; var pp = A.play('button');
  check('A11', 'paused: suspended and taps do not queue', c.state === 'suspended' && pp === false, c.state);
  A.setPaused(false); await Promise.resolve(); await Promise.resolve();
  check('A11', 'resume plays the resume ticks inside resume().then', A.state === 'running', A.state);

  // ---- settings (07 s9) ----
  A.setLevel('music', 'low'); A.setLevel('sfx', 'high');
  var saved = JSON.parse(store['volley.settings.v1']).audio;
  check('A12', 'levels saved at once in the settings key', saved.music === 'low' && saved.sfx === 'high', JSON.stringify(saved));
  store['volley.settings.v1'] = JSON.stringify({ haptics: false, audio: { sfx: 'loud', music: 7 } }); var rs = A.reloadSettings();
  check('A12', 'bad values reset to the default, no error', rs.sfx === 'mid' && rs.music === 'mid');
  A.setLevel('sfx', 'off'); c.currentTime = 50; check('A12', 'Off stops scheduling (not only gain 0)', A.play('button', { force: true }) === false);
  A.setLevel('sfx', 'mid');
  check('A12', 'other owners\' fields kept', JSON.parse(store['volley.settings.v1']).haptics === false);

  // ---- per-step watch: lock tick 200 ms before the attack ----
  var S = { t: 0, phase: 'play', stageKind: 'combat', hero: { x: 4, y: 12, hp: 600, maxHp: 600 }, enemies: [{ id: 3, type: 'E-02', st: 'tell', stT: 0.6, tellT: 0.6, hp: 10, x: 4, y: 3 }], shots: [], shells: [] };
  A.event({ k: 'room', stage: 2, kind: 'combat' }, S);
  c.currentTime = 60; A.event({ k: 'tell', id: 3, type: 'E-02', x: 4, y: 3 }, S);
  var before = A.played; S.enemies[0].stT = 0.3; A.step(S); var mid = A.played; S.enemies[0].stT = 0.19; A.step(S); var after = A.played; A.step(S);
  check('A13', 'lock tick fires once when the tell has 0.2 s left', mid === before && after === before + 1 && A.played === after, [before, mid, after, A.played].join('/'));
  S.shots.push({}); c.currentTime += 0.1; var bs = A.played; A.step(S); A.step(S);
  check('A13', 'a new enemy round plays one enemy-fire cue', A.played === bs + 1);
  S.hero.hp = 100; c.currentTime += 1; var hb0 = A.played; A.step(S);
  check('A14', 'heartbeat starts under 30% HP', A.played === hb0 + 1);

  // ---- step 8 home-upgrade cues (SPEC-UX s6, CONTRACT-STEP8 AU) ----
  var HOME = { tick: 0.6, latch: 0.6, spend: 0.6, rare: 0.6, epic: 0.9, deny: 0.6, unlock: 0.6 };
  var hm = Object.keys(HOME).filter(function(n){ return !C[n] || C[n].bus !== 'u' || !(C[n].d <= HOME[n]) || C[n].live; });
  check('A15', 'home cues tick latch spend rare epic deny unlock exist, ui bus, baked, length <= 600 ms (epic 900)', hm.length === 0, hm.join(',') || Object.keys(HOME).map(function(n){ return n + ' ' + Math.round(C[n].d * 1000); }).join(' '));
  // true sound end: the last scheduled stop in the recipe (minus the 30 ms safety tail tone()/noise() add) must sit inside the cue length
  var over = []; Object.keys(HOME).concat(['level_up']).forEach(function(n){
    var c0 = new Ctx(), stops = []; c0.createOscillator = c0.createBufferSource = function(){ var nd = new Node(this); stops.push(nd); return nd; };
    C[n].fn(c0, c0.destination, 0, 0, { d: C[n].d });
    var end = Math.max.apply(null, stops.map(function(nd){ return nd.t1 || 0; })) - 0.03;
    if (!(end <= C[n].d + 1e-9) || end > (HOME[n] || 0.6)) over.push(n + ' ' + Math.round(end * 1000) + 'ms');
  });
  check('A15', 'each home cue (and levelup for Common) stops inside its length and the spec cap', over.length === 0, over.join(',') || 'ok');
  check('A15', "Common reuses levelup: 'levelup' and 'level_up' both resolve to S-019 (<= 600 ms)", A.ALIAS.levelup === 'level_up' && C.level_up.id === 'S-019' && C.level_up.d <= 0.6);
  c.currentTime = 100; var hp0 = A.played, hok = Object.keys(HOME).concat(['levelup']).every(function(n, k){ return A.play(n, { delay: k * 0.001 }) === true; });
  check('A15', 'all 7 home cues + levelup play once the context is unlocked', hok && A.played === hp0 + 8, A.played - hp0);
  c.currentTime = 101; A.setLevel('sfx', 'off'); var hoff = Object.keys(HOME).every(function(n){ return A.play(n, { force: true }) === false; }); A.setLevel('sfx', 'mid');
  A.setMuted(true); c.currentTime = 102; var hmute = Object.keys(HOME).every(function(n){ return A.play(n, { force: true }) === false; }); A.setMuted(false);
  check('A15', 'sound setting gate: Off and muted schedule none of them', hoff && hmute);
  c.currentTime = 103; A.play('tick'); var tk = A.played; A.play('tick'); c.currentTime += 0.05; A.play('tick');
  check('A15', 'tick gap 40 ms: a double tap merges, a tap 50 ms later plays', A.played === tk + 1, A.played - tk);

  console.log('test-audio: ' + (rows.length - fails) + '/' + rows.length + ' pass');
  rows.forEach(function(r){ if (r[2] === 'FAIL' || process.argv.indexOf('-v') >= 0) console.log(r.join(' | ')); });
  process.exit(fails ? 1 : 0);
})();
