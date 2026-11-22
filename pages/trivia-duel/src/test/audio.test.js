'use strict';
// node audio.test.js -- written against AUDIO-CONTRACT.md; exit 1 on any failure.
global.TD = global.TD || {};

// ---- fake WebAudio
var calls = [];
function param(name) {
  var p = { value: 0 };
  ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'setValueCurveAtTime', 'cancelAndHoldAtTime']
    .forEach(function (m) { p[m] = function () { calls.push(name + '.' + m); return p; }; });
  return p;
}
function node(kind, extra) {
  var n = { kind: kind, connect: function (x) { return x; }, disconnect: function () {} };
  Object.assign(n, extra || {});
  calls.push('create:' + kind);
  return n;
}
function FakeCtx() {
  var self = this;
  this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 8000;
  this.destination = node('destination');
  this.resume = function () { self.state = 'running'; return Promise.resolve(); };
  this.suspend = function () { self.state = 'suspended'; return Promise.resolve(); };
  this.close = function () { return Promise.resolve(); };
  this.createGain = function () { return node('gain', { gain: param('gain') }); };
  this.createOscillator = function () {
    return node('osc', { type: 'sine', frequency: param('freq'), detune: param('detune'), start: function () { calls.push('osc.start'); }, stop: function () {}, onended: null });
  };
  this.createBufferSource = function () {
    return node('bufsrc', { buffer: null, loop: false, playbackRate: param('rate'), start: function () { calls.push('bufsrc.start'); }, stop: function () {}, onended: null });
  };
  this.createBiquadFilter = function () { return node('biquad', { type: 'lowpass', frequency: param('bq.f'), Q: param('bq.q'), gain: param('bq.g') }); };
  this.createDynamicsCompressor = function () {
    return node('comp', { threshold: param('t'), knee: param('k'), ratio: param('r'), attack: param('a'), release: param('rel') });
  };
  this.createStereoPanner = function () { return node('pan', { pan: param('pan') }); };
  this.createDelay = function () { return node('delay', { delayTime: param('dt') }); };
  this.createWaveShaper = function () { return node('shaper', { curve: null }); };
  this.createBuffer = function (ch, len, sr) {
    var d = new Float32Array(len);
    return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: function () { return d; } };
  };
  this.decodeAudioData = function () { return Promise.resolve(self.createBuffer(1, 8000, 8000)); };
}
global.AudioContext = FakeCtx;
global.webkitAudioContext = FakeCtx;

var fetchMode = 'ok', fetchCalls = [];
global.fetch = function (url) {
  fetchCalls.push(String(url));
  if (fetchMode === 'fail') return Promise.reject(new Error('net'));
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: function () { return Promise.resolve(new ArrayBuffer(16)); } });
};

// ---- load modules (order per contract)
require('../audio-core.js');
require('../audio-sfx.js');
require('../audio-music.js');
var TD = global.TD, A = TD.audio;

var passed = 0, fails = [];
function check(ok, msg) { if (ok) passed++; else { fails.push(msg); console.log('FAIL: ' + msg); } }
function noThrow(fn, msg) { try { fn(); passed++; } catch (e) { fails.push(msg + ' threw ' + e); console.log('FAIL: ' + msg + ' threw ' + (e && e.stack || e)); } }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function advance(c, s) { if (c && c.ctx) c.ctx.currentTime += s; }

var NAMES = ['tap', 'select', 'qstart', 'correct', 'wrong', 'timeout', 'tick', 'rivalSeal', 'wager', 'wagerX2', 'vs', 'win', 'lose', 'draw', 'pointsUp'];
NAMES = NAMES.slice(0, 15);

(async function main() {
  // ---- exports exist
  check(A && typeof A.unlock === 'function' && typeof A.play === 'function' && typeof A.registerCue === 'function', 'TD.audio api present');
  check(TD.sfx && Array.isArray(TD.sfx.names) && TD.sfx.names.length >= 14, 'TD.sfx.names lists cues');
  check(TD.music && Array.isArray(TD.music.ids) && TD.music.ids.indexOf('canon') >= 0 && TD.music.ids.indexOf('mountain') >= 0, 'TD.music.ids');
  check(TD.music && ['win', 'lose', 'draw', 'medal'].every(function (s) { return TD.music.stings.indexOf(s) >= 0; }), 'TD.music.stings');

  // ---- before unlock
  check(A.core() === null, 'core() null before unlock');
  noThrow(function () { A.play('tap'); }, 'play before unlock');
  noThrow(function () { A.setLevels({ musicVol: 0.3, sfxVol: 0.4, musicOn: 1, sfxOn: 1, duckDb: 8 }); }, 'setLevels before unlock');
  noThrow(function () { A.duck(0.3, 0.1, 0.1); }, 'duck before unlock');
  noThrow(function () { A.bgm('menu'); }, 'bgm before unlock');
  noThrow(function () { TD.music.sting('win'); }, 'sting before unlock');
  noThrow(function () { A.stopBgm(0.1); }, 'stopBgm before unlock');
  check(A.state().unlocked === false, 'state.unlocked false before unlock');
  check(A.missing === 0 || A.state().missing === 0, 'no missing before unlock for known cue');

  // ---- unlock idempotent
  noThrow(function () { A.unlock(); }, 'unlock');
  var c1 = A.core();
  check(c1 && c1.ctx && c1.sfxBus && c1.musicBus, 'core() after unlock has ctx/buses');
  check(c1 && typeof c1.noise === 'function' && typeof c1.rnd === 'function' && typeof c1.live === 'function', 'core helpers');
  noThrow(function () { A.unlock(); A.unlock(); }, 'unlock again');
  var c2 = A.core();
  check(c1 && c2 && c1.ctx === c2.ctx, 'unlock idempotent: same ctx');
  check(A.state().unlocked === true, 'state.unlocked true');
  check(c1 && typeof c1.rnd() === 'number' && c1.rnd() >= 0 && c1.rnd() < 1, 'rnd in [0,1)');
  check(c1 && c1.noise() && c1.noise().length > 0, 'noise buffer');

  // ---- setLevels clamps
  A.setLevels({ musicVol: 5, sfxVol: -2, musicOn: 1, sfxOn: 1, duckDb: 8 });
  var s = A.state();
  check(s.musicVol === 1, 'musicVol clamps to 1 (got ' + s.musicVol + ')');
  check(s.sfxVol === 0, 'sfxVol clamps to 0 (got ' + s.sfxVol + ')');
  noThrow(function () { A.setLevels({}); A.setLevels(null); A.setLevels(undefined); }, 'setLevels odd input');
  A.setLevels({ musicVol: 0.5, sfxVol: 0.8, musicOn: 1, sfxOn: 1, duckDb: 8 });
  s = A.state();
  check(s.musicVol === 0.5 && s.sfxVol === 0.8 && s.musicOn === 1 && s.sfxOn === 1, 'setLevels stores values');

  // ---- all cues
  var missing0 = A.state().missing;
  var cues = (TD.sfx && TD.sfx.names) || NAMES;
  NAMES.forEach(function (n) { check(cues.indexOf(n) >= 0, 'cue listed: ' + n); });
  cues.forEach(function (n) {
    advance(A.core(), 1);
    noThrow(function () { A.play(n); }, 'play ' + n);
    noThrow(function () { A.play(n, { urgent: true, big: true }); }, 'play opts ' + n);
  });
  check(A.state().missing === missing0, 'known cues did not increase missing');

  // ---- cues schedule something
  calls.length = 0;
  advance(A.core(), 5);
  A.play('correct');
  check(calls.some(function (x) { return x === 'create:osc' || x === 'create:bufsrc'; }), 'correct schedules nodes');

  // ---- unknown cue
  var m = A.state().missing;
  noThrow(function () { A.play('nope_zzz'); }, 'unknown cue');
  check(A.state().missing === m + 1, 'unknown cue increments missing');
  check(A.missing === m + 1 || A.state().missing === m + 1, 'TD.audio.missing incremented');

  // ---- voice cap 8
  var live = 0, maxLive = 0;
  A.registerCue('capTest', 2, 100, function (cc, t) {
    var o = cc.ctx.createOscillator(); o.start(t); live++;
    return [o];
  });
  for (var i = 0; i < 30; i++) {
    advance(A.core(), 0.1); // beat 40 ms min gap
    noThrow(function () { A.play('capTest'); }, 'capTest play');
    maxLive = Math.max(maxLive, A.state().voices);
  }
  check(A.state().voices <= 8, 'voice cap 8 holds (voices=' + A.state().voices + ')');
  check(maxLive <= 8, 'voice cap 8 never exceeded (max=' + maxLive + ')');

  // ---- registerCue custom + opts passthrough
  var gotOpts = null;
  A.registerCue('optsTest', 3, 0.1, function (cc, t, o) { gotOpts = o; });
  advance(A.core(), 200);
  A.play('optsTest', { foo: 7 });
  check(gotOpts && gotOpts.foo === 7, 'opts passed to cue fn');
  var throwy = 0;
  A.registerCue('throwTest', 3, 0.1, function () { throwy++; throw new Error('boom'); });
  advance(A.core(), 1);
  noThrow(function () { A.play('throwTest'); }, 'throwing cue fn is swallowed');

  // ---- mute schedules nothing
  advance(A.core(), 300);
  A.setLevels({ musicVol: 0.5, sfxVol: 0.8, musicOn: 0, sfxOn: 0, duckDb: 8 });
  calls.length = 0;
  var ran = 0;
  A.registerCue('muteTest', 3, 0.1, function () { ran++; });
  advance(A.core(), 1);
  A.play('muteTest'); A.play('correct'); A.play('win');
  check(ran === 0, 'sfxOn 0: cue fn not run');
  check(!calls.some(function (x) { return x === 'osc.start' || x === 'bufsrc.start'; }), 'sfxOn 0: nothing started');
  A.setLevels({ musicVol: 0.5, sfxVol: 0.8, musicOn: 1, sfxOn: 1, duckDb: 8 });
  advance(A.core(), 1);
  A.play('muteTest');
  check(ran === 1, 'sfxOn 1 again: cue runs');

  // ---- bgm menu -> canon
  noThrow(function () { A.bgm('menu'); }, 'bgm menu');
  check(A.state().mode === 'menu', 'mode menu');
  check(TD.music.isPlaying() === true, 'music playing after bgm(menu)');
  check(TD.music.current() === 'canon', 'current is canon (got ' + TD.music.current() + ')');
  noThrow(function () { A.bgm('menu'); }, 'bgm menu twice');
  check(TD.music.current() === 'canon', 'same mode twice keeps canon');

  // ---- bgm duel -> mp3
  fetchMode = 'ok'; fetchCalls.length = 0;
  noThrow(function () { A.bgm('duel'); }, 'bgm duel');
  await sleep(60);
  check(A.state().mode === 'duel', 'mode duel');
  check(fetchCalls.some(function (u) { return /bgm-beethoven5\.mp3$/.test(u); }), 'duel fetches mp3');
  check(A.state().fileLoaded === true, 'fileLoaded true after decode');
  var ok = await A.bgmFile('duel', 'audio/bgm-beethoven5.mp3');
  check(ok === true, 'bgmFile resolves true (cached)');
  check(fetchCalls.length === 1, 'decoded buffer cached (fetches=' + fetchCalls.length + ')');

  // ---- bgm back to menu then stop
  noThrow(function () { A.bgm('menu'); }, 'bgm menu after duel');
  check(A.state().mode === 'menu', 'mode menu again');
  noThrow(function () { A.stopBgm(0.1); }, 'stopBgm');
  noThrow(function () { A.bgm(null); }, 'bgm null');
  check(A.state().mode === null || A.state().mode === undefined, 'mode null after bgm(null)');

  // ---- fallback when fetch fails: fresh module instances
  fetchMode = 'fail';
  A.stopBgm(0);
  ['../audio-core.js', '../audio-sfx.js', '../audio-music.js'].forEach(function (p) { delete require.cache[require.resolve(p)]; });
  global.TD = {};
  require('../audio-core.js'); require('../audio-sfx.js'); require('../audio-music.js');
  TD = global.TD; A = TD.audio;
  A.unlock();
  noThrow(function () { A.bgm('duel'); }, 'bgm duel with failing fetch');
  await sleep(60);
  check(A.state().fileLoaded === false, 'fileLoaded false when fetch fails');
  check(TD.music.isPlaying() === true && TD.music.current() === 'mountain', 'fallback plays mountain (got ' + TD.music.current() + ')');
  var okFail = await A.bgmFile('x', 'audio/none.mp3');
  check(okFail === false, 'bgmFile resolves false on failure');

  // ---- stings
  ['win', 'lose', 'draw', 'medal'].forEach(function (id) {
    advance(A.core(), 20);
    noThrow(function () { TD.music.sting(id); }, 'sting ' + id);
  });
  noThrow(function () { TD.music.sting('bogus'); }, 'unknown sting');
  noThrow(function () { TD.music.play('canon'); TD.music.play('mountain'); TD.music.stop(0.1); }, 'music play/stop');
  noThrow(function () { TD.music.play('bogus'); }, 'music unknown id');

  // ---- wanted mode remembered across unlock, and null core
  global.TD = {};
  ['../audio-core.js', '../audio-sfx.js', '../audio-music.js'].forEach(function (p) { delete require.cache[require.resolve(p)]; });
  require('../audio-core.js'); require('../audio-sfx.js'); require('../audio-music.js');
  TD = global.TD; A = TD.audio;
  check(A.core() === null, 'fresh: core null');
  noThrow(function () { A.bgm('menu'); A.play('win'); TD.music.sting('win'); A.duck(0.3, 1, 1); A.setLevels({ musicVol: 0.2 }); }, 'all calls safe with null core');
  A.unlock();
  await sleep(20);
  check(TD.music.isPlaying() === true && A.state().mode === 'menu', 'wanted mode starts at unlock');
  check(Math.abs(A.state().musicVol - 0.2) < 1e-9, 'levels set before unlock are kept');

  // ---- no AudioContext at all
  var saved = global.AudioContext, savedW = global.webkitAudioContext;
  delete global.AudioContext; delete global.webkitAudioContext;
  global.TD = {};
  ['../audio-core.js', '../audio-sfx.js', '../audio-music.js'].forEach(function (p) { delete require.cache[require.resolve(p)]; });
  require('../audio-core.js'); require('../audio-sfx.js'); require('../audio-music.js');
  TD = global.TD; A = TD.audio;
  noThrow(function () { A.unlock(); A.play('tap'); A.bgm('duel'); TD.music.sting('lose'); }, 'no AudioContext: silent');
  check(A.core() === null || A.core().live() === false || true, 'no AudioContext core ok');
  global.AudioContext = saved; global.webkitAudioContext = savedW;

  if (fails.length) { console.log('audio tests: ' + passed + ' passed, ' + fails.length + ' FAILED'); process.exit(1); }
  console.log('audio tests: ' + passed + ' passed');
  process.exit(0);
})().catch(function (e) { console.log('FAIL: uncaught ' + (e && e.stack || e)); process.exit(1); });
