// node src/test/audio.test.js   (audio.js + music-data.js + music.js against a fake AudioContext)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), cp = require('child_process');
const P = path.join(__dirname, '../parts/');
const rd = (n) => fs.readFileSync(P + n, 'utf8');

function load(opts) {
  opts = opts || {};
  const log = { osc: 0, src: 0, ctx: 0, gains: [], filters: [], oscs: [], stops: 0, suspends: 0, resumes: 0, vib: [], maxAhead: 0, curves: [], intervals: [] };
  const g = { console, Math, Float32Array, Object, JSON, Number };
  g.setInterval = (f) => { log.intervals.push(f); return log.intervals.length; };
  g.clearInterval = () => {};
  g.navigator = { vibrate: (ms) => { log.vib.push(ms); } };
  const param = (v, tag) => ({
    value: v, calls: [],
    setValueAtTime(x, t) { this.calls.push(['set', x, t]); },
    exponentialRampToValueAtTime(x, t) { this.calls.push(['exp', x, t]); },
    linearRampToValueAtTime(x, t) { this.calls.push(['lin', x, t]); },
    cancelScheduledValues() {}, setValueCurveAtTime(a, t, d) { log.curves.push({ p: this, a: Array.from(a), t, d }); this.value = a[a.length - 1]; }
  });
  if (opts.ctx !== false) g.AudioContext = function () {
    const c = this; log.ctx++; log.last = c;
    c.currentTime = 0; c.state = 'suspended'; c.destination = {}; c.sampleRate = 8000;
    c.resume = () => { c.state = 'running'; log.resumes++; return Promise.resolve(); };
    c.suspend = () => { c.state = 'suspended'; log.suspends++; return Promise.resolve(); };
    c.createGain = () => { const n = { gain: param(1), connect() {}, disconnect() {} }; log.gains.push(n); return n; };
    c.createOscillator = () => {
      log.osc++;
      const o = { type: '', frequency: param(0), detune: { value: 0 }, connect() {}, start(t) { log.maxAhead = Math.max(log.maxAhead, t - c.currentTime); }, stop() { log.stops++; } };
      log.oscs.push(o); return o;
    };
    c.createBiquadFilter = () => { const f = { type: '', frequency: param(0), Q: { value: 1 }, connect() {} }; log.filters.push(f); return f; };
    c.createBuffer = (ch, n) => { const d = new Float32Array(n); return { getChannelData: () => d }; };
    c.createBufferSource = () => { log.src++; return { buffer: null, loop: false, connect() {}, start(t) { log.maxAhead = Math.max(log.maxAhead, t - c.currentTime); }, stop() { log.stops++; } }; };
    c.createStereoPanner = () => ({ pan: { value: 0 }, connect() {} });
  };
  g.globalThis = g; vm.createContext(g);
  for (const f of opts.parts || ['audio.js']) vm.runInContext(rd(f), g);
  return { PL: g.PL, log, g, adv(dt) { log.last.currentTime += dt; }, sounds() { return log.osc + log.src; } };
}
const ALL = ['audio.js', 'music-data.js', 'music.js'];
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

// 1. no AudioContext: everything is a no-op
{
  const { PL } = load({ ctx: false });
  PL.audio.init(); PL.audio.unlock(); PL.audio.onEvents(['flip', 'death'], {}); PL.audio.setMuted(true);
  PL.audio.playMusic('menu'); PL.audio.sting('clear'); PL.audio.onVisibility(true); PL.audio.setMusicGain(0.3);
  assert.strictEqual(PL.audio.isMuted(), true);
}
// 2. nothing before unlock: no context, no nodes; music request waits for the gesture
{
  const t = load({ parts: ALL }), PL = t.PL;
  PL.audio.onEvents(['flip', 'land', 'death'], {}); PL.audio.playMusic('menu'); PL.audio.sting('clear');
  assert.strictEqual(t.log.ctx, 0, 'no AudioContext before unlock'); assert.strictEqual(t.sounds(), 0);
  PL.audio.unlock();
  assert.strictEqual(t.log.ctx, 1); assert.strictEqual(PL.audio.isUnlocked(), true);
  assert.strictEqual(PL.music.current(), 'canon', 'pending menu music starts after unlock');
  PL.audio.unlock(); assert.strictEqual(t.log.ctx, 1, 'unlock twice = one context');
}
// 3. every event id makes sound (alone and as object); bogus ids and prototype names are ignored
{
  const t = load({ parts: ALL }), PL = t.PL; PL.audio.unlock();
  assert.ok(PL.audio.events.length >= 21, 'at least 21 event ids, got ' + PL.audio.events.length);
  for (const n of ['flip', 'dive', 'land', 'death', 'win', 'crumble', 'ride']) assert.ok(PL.audio.events.indexOf(n) >= 0, 'legacy id ' + n);
  for (const n of PL.audio.events) {
    t.adv(1); const b = t.sounds();
    PL.audio.onEvents([n], { lastLandSpeed: 500, g: 0 });
    assert.ok(t.sounds() > b, n + ' should play');
    t.adv(1); const b2 = t.sounds(); PL.audio.onEvents([{ type: n }], {}); assert.ok(t.sounds() > b2, n + ' object form');
  }
  for (let g = 0; g < 4; g++) { t.adv(1); const b = t.sounds(); PL.audio.onEvents(['flip'], { g }); assert.ok(t.sounds() > b, 'flip dir ' + g); }
  const b = t.sounds(); PL.audio.onEvents(['bogus', null, 'constructor', 'toString'], {}); PL.audio.onEvents(null); assert.strictEqual(t.sounds(), b);
}
// 3b. legacy: audio.js alone (no music parts) still plays win/clear/medals
{
  const t = load(), PL = t.PL; PL.audio.unlock();
  for (const n of ['win', 'clear', 'medalGold']) { t.adv(1); const b = t.sounds(); PL.audio.onEvents([n], {}); assert.ok(t.sounds() > b, n + ' fallback'); }
}
// 4. mute and sliders
{
  const t = load({ parts: ALL }), PL = t.PL; PL.audio.unlock();
  PL.audio.playMusic('tier1'); t.log.last.currentTime = 0.05; PL.music.tick();
  PL.audio.setMuted(true);
  assert.strictEqual(t.log.gains[0].gain.value, 0, 'master 0 when muted');
  let b = t.sounds(); PL.audio.onEvents(PL.audio.events, {}); PL.audio.sting('gold');
  for (let i = 0; i < 40; i++) { t.adv(0.1); PL.music.tick(); }
  assert.strictEqual(t.sounds(), b, 'mute silences sfx, stings and music scheduling');
  PL.audio.setMuted(false); assert.strictEqual(t.log.gains[0].gain.value, PL.audio.MAX_GAIN);
  b = t.sounds(); PL.audio.onEvents(['flip'], {}); assert.ok(t.sounds() > b);
  PL.audio.setSfxGain(0); b = t.sounds(); t.adv(1); PL.audio.onEvents(['flip', 'death', 'clear'], {}); assert.strictEqual(t.sounds(), b, 'sfx slider 0 silent');
  PL.audio.setSfxGain(0.8); assert.strictEqual(t.log.gains[1].gain.value, 0.8);
  PL.audio.setMusicGain(0); assert.strictEqual(t.log.gains[2].gain.value, 0);
  b = t.sounds(); for (let i = 0; i < 40; i++) { t.adv(0.1); PL.music.tick(); } assert.strictEqual(t.sounds(), b, 'music slider 0 silent');
  PL.audio.setMusicGain(0.5); assert.strictEqual(t.log.gains[2].gain.value, 0.5);
  b = t.sounds(); for (let i = 0; i < 20; i++) { t.adv(0.1); PL.music.tick(); } assert.ok(t.sounds() > b, 'music audible again');
  PL.audio.setMusicOn(false); assert.strictEqual(t.log.gains[2].gain.value, 0); assert.strictEqual(PL.music.current(), null);
  assert.ok(PL.audio.MAX_GAIN <= 0.15);
}
// 5. voice cap 8 with priorities
{
  const t = load(), PL = t.PL; PL.audio.unlock();
  for (let i = 0; i < 40; i++) PL.audio.onEvents(['flip'], {});
  assert.ok(PL.audio.voiceCount() <= 8 && PL.audio.voiceCount() === 8, 'cap 8, got ' + PL.audio.voiceCount());
  assert.ok(t.log.stops > 0, 'oldest voice stolen');
  const u = load(), Q = u.PL; Q.audio.unlock();
  for (let i = 0; i < 20; i++) Q.audio.onEvents(['ui'], {});
  assert.ok(Q.audio.voiceCount() <= 7, 'priority 3 dropped above 6 voices, got ' + Q.audio.voiceCount());
  const w = load(), W = w.PL; W.audio.unlock();
  for (let i = 0; i < 8; i++) W.audio.onEvents(['crumble'], {});   // 8 x priority 2
  const before = w.sounds(); W.audio.onEvents(['death'], {});       // priority 1 must still play
  assert.ok(w.sounds() > before && W.audio.voiceCount() === 8, 'priority 1 steals a lower voice');
  const x = load(), X = x.PL; X.audio.unlock();
  for (let i = 0; i < 8; i++) X.audio.onEvents(['death'], {});
  const b4 = x.sounds(); X.audio.onEvents(['land'], {}); assert.strictEqual(x.sounds(), b4, 'priority 2 cannot steal priority 1');
  const r = load(), RR = r.PL; RR.audio.unlock(); RR.audio.onEvents(['ride'], {}); const rb = r.sounds(); RR.audio.onEvents(['ride'], {});
  assert.strictEqual(r.sounds(), rb, 'ride rate-limited to 1 per 90 ms'); r.adv(0.1); RR.audio.onEvents(['ride'], {}); assert.ok(r.sounds() > rb);
}
// 6. hidden tab suspends, visible resumes
{
  const t = load({ parts: ALL }), PL = t.PL; PL.audio.unlock();
  assert.strictEqual(t.log.last.state, 'running');
  PL.audio.onVisibility(true); assert.strictEqual(t.log.last.state, 'suspended'); assert.strictEqual(t.log.suspends, 1);
  PL.audio.onVisibility(false); assert.strictEqual(t.log.last.state, 'running');
}
// 7. ducking
{
  const t = load({ parts: ALL }), PL = t.PL; PL.audio.unlock();
  const duckNode = t.log.gains[3].gain, ramps = () => duckNode.calls.filter((c) => c[0] === 'lin').map((c) => c[1]);
  PL.audio.onEvents(['death'], {});
  assert.deepStrictEqual(ramps(), [0.15, 1], 'death: duck to 0.15 then back to 1');
  const c = duckNode.calls; assert.ok(near(c.find((x) => x[0] === 'set' && x[1] === 0.15).pop && c.find((x) => x[0] === 'set' && x[1] === 0.15)[2], 0.6), 'hold 0.6 s');
  const up = c.filter((x) => x[0] === 'lin')[1][2]; assert.ok(near(up, 1.0, 1e-9), 'released by 1.0 s (0.6 hold + 0.4 back)');
  duckNode.calls.length = 0; t.adv(3);
  PL.audio.onEvents(['clear'], {});
  assert.ok(near(ramps()[0], Math.pow(10, -8 / 20), 1e-9), 'default sting duck 8 dB -> ' + ramps()[0]);
  duckNode.calls.length = 0; PL.audio.setDuckDb(6); t.adv(3); PL.audio.sting('clear');
  assert.ok(near(ramps()[0], Math.pow(10, -6 / 20), 1e-9), '6 dB');
  PL.audio.setDuckDb(99); assert.ok(near(PL.audio.duckLevel(), Math.pow(10, -18 / 20)), 'duck dB clamped to 18');
}
// 8. crossfade: equal power, ends with exactly one track, outgoing sources stopped
{
  const t = load({ parts: ALL }), PL = t.PL; PL.audio.unlock();
  PL.audio.playMusic('tier1'); assert.strictEqual(PL.music.activeTracks(), 1);
  t.adv(2); PL.music.tick(); const stops0 = t.log.stops;
  assert.strictEqual(PL.audio.playMusic('tier1'), 'morning'); assert.strictEqual(PL.music.activeTracks(), 1, 'same piece: no second track');
  t.log.curves.length = 0; PL.audio.playMusic('tier3');
  assert.strictEqual(PL.music.activeTracks(), 2, 'outgoing + incoming only'); assert.strictEqual(PL.music.current(), 'mountain');
  assert.strictEqual(t.log.curves.length, 2); const cv = t.log.curves;
  assert.ok(near(cv[0].d, 1.5) && near(cv[1].d, 1.5), 'xfade 1.5 s');
  for (let i = 0; i < 33; i++) assert.ok(near(cv[0].a[i] * cv[0].a[i] + cv[1].a[i] * cv[1].a[i], 1, 1e-6), 'equal power at step ' + i);
  PL.audio.playMusic('tier2'); assert.strictEqual(PL.music.activeTracks(), 2, 'rapid switch drops the older outgoing track');
  t.adv(0.5); PL.music.tick(); assert.strictEqual(PL.music.activeTracks(), 2);
  t.adv(2); PL.music.tick(); assert.strictEqual(PL.music.activeTracks(), 1, 'crossfade ends with one source');
  assert.ok(t.log.stops > stops0, 'outgoing notes stopped');
  PL.audio.playMusic('menu'); t.log.curves.length = 0; PL.audio.playMusic('tier1'); assert.ok(near(t.log.curves[0].d, 1.0), 'menu to game 1 s');
  PL.music.setXfade(99); t.adv(3); PL.music.tick(); PL.audio.playMusic('tier3'); assert.ok(near(t.log.curves.pop().d, 4), 'xfade clamped to 4 s');
  PL.audio.stopMusic(0); assert.strictEqual(PL.music.activeTracks(), 0);
}
// 9. scheduler: lookahead 100 ms, loops, tempo ramp, stings are one-shots
{
  const t = load({ parts: ALL }), PL = t.PL; PL.audio.unlock();
  PL.audio.playMusic('tutorial'); let last = t.sounds(), grew = 0;
  for (let i = 0; i < 900; i++) { t.adv(0.05); PL.music.tick(); if (t.sounds() > last) grew++; last = t.sounds(); } // 35 s > 20.6 s piece: must loop
  assert.ok(t.log.maxAhead <= 0.1 + 0.06, 'lookahead <= 100 ms, got ' + t.log.maxAhead);
  assert.ok(grew > 20, 'music keeps scheduling across the loop point');
  const w = load({ parts: ALL }), W = w.PL; W.audio.unlock();
  W.audio.sting('plumb'); assert.strictEqual(W.music.stingCount(), 1);
  for (let i = 0; i < 400; i++) { w.adv(0.1); W.music.tick(); }
  assert.strictEqual(W.music.stingCount(), 0, 'sting is a one-shot and is cleaned up');
  const k = load({ parts: ALL }), K = k.PL; K.audio.unlock(); K.audio.playMusic('menu'); k.adv(0.2); K.music.tick();
  K.audio.sting('complete'); assert.strictEqual(K.music.activeTracks(), 1, 'bgm fading out after complete'); k.adv(2); K.music.tick();
  assert.strictEqual(K.music.current(), null, 'complete stops bgm'); assert.strictEqual(K.music.activeTracks(), 0);
}
// 10. pitch variation within limits, deterministic, off for UI / death
{
  const first = (t, ev, st) => { const b = t.log.filters.length; t.adv(1); t.PL.audio.onEvents([ev], st || {}); return t.log.filters[b]; };
  const t = load(), PL = t.PL; PL.audio.unlock();
  const seen = new Set();
  for (let i = 0; i < 300; i++) { const f = first(t, 'flip', { g: 0 }); const r = f.frequency.calls[0][1] / 400; assert.ok(r >= 0.96 - 1e-9 && r <= 1.04 + 1e-9, 'default +-4%, got ' + r); seen.add(r.toFixed(4)); }
  assert.ok(seen.size > 50, 'pitch really varies');
  PL.audio.setPitchVar(0.5);
  for (let i = 0; i < 300; i++) { const f = first(t, 'flip', { g: 0 }); const r = f.frequency.calls[0][1] / 400; assert.ok(r >= 0.94 - 1e-9 && r <= 1.06 + 1e-9, 'hard cap +-6%, got ' + r); }
  PL.audio.setPitchVar(0); for (let i = 0; i < 5; i++) assert.ok(near(first(t, 'flip', { g: 0 }).frequency.calls[0][1], 400, 1e-9));
  PL.audio.setPitchVar(0.04);
  const o0 = t.log.oscs.length; t.adv(1); PL.audio.onEvents(['ui'], {}); assert.strictEqual(t.log.oscs[o0].frequency.calls[0][1], 1200, 'UI no variation');
  const o1 = t.log.oscs.length; t.adv(1); PL.audio.onEvents(['death'], {}); assert.strictEqual(t.log.oscs[o1].frequency.calls[0][1], 523, 'death no variation');
  const run = () => { const u = load(), Q = u.PL; Q.audio.unlock(); Q.audio.seed(7); const out = []; for (let i = 0; i < 20; i++) { u.adv(1); Q.audio.onEvents(['crumble'], {}); } u.log.oscs.forEach((o) => out.push(o.frequency.calls[0][1])); return out.join(','); };
  assert.strictEqual(run(), run(), 'same seed = same sounds');
}
// 11. haptics are independent of mute, and the toggle works
{
  const t = load(), PL = t.PL; PL.audio.unlock(); PL.audio.setMuted(true);
  PL.audio.onEvents(['death', 'slam', 'padUp'], {}); assert.deepStrictEqual(t.log.vib, [25, 15, 8]);
  PL.audio.setVibration(false); PL.audio.onEvents(['death'], {}); assert.strictEqual(t.log.vib.length, 3);
}
// 12. static checks: size budget, no Math.random / network in audio parts, provenance rows
{
  let total = 0; for (const f of ALL) { const s = rd(f); total += Buffer.byteLength(s); assert.ok(!/Math\.random/.test(s.replace(/\/\/.*$/gm, '')), f + ' must not use Math.random'); assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|import\(/.test(s), f + ' no network'); }
  assert.ok(total < 80 * 1024, 'audio parts ' + total + ' bytes must be < 80 KB');
  cp.execFileSync(process.execPath, [path.join(__dirname, 'audio-size.js')], { stdio: 'pipe' });
  const t = load({ parts: ['music-data.js'] }), MD = t.PL.musicData, prov = fs.readFileSync(path.join(__dirname, '../../audio/PROVENANCE.md'), 'utf8');
  for (const id of Object.keys(MD.pieces)) assert.ok(prov.indexOf('music-data.js#' + id) >= 0, 'PROVENANCE row for ' + id);
  for (const id of Object.keys(MD.pieces)) { const p = MD.pieces[id], l = MD.len(p.tracks[0].s); assert.ok(Number.isInteger(l / p.bar), id + ' whole bars'); for (const tr of p.tracks) assert.strictEqual(MD.len(tr.s), l, id + ' track lengths'); }
  for (const k of Object.keys(MD.moments)) assert.ok(MD.pieces[MD.moments[k]], 'moment ' + k);
  console.log('size ' + total + ' bytes for 3 audio parts');
}
console.log('audio.test OK');
