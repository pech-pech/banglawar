// node src/test/audio.test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../parts/audio.js'), 'utf8');
function load(withCtx) {
  const log = { osc: 0, maxGain: 0 };
  const g = { console, Math };
  if (withCtx) g.AudioContext = function () {
    this.currentTime = 0; this.state = 'suspended'; this.destination = {};
    this.resume = () => { this.state = 'running'; };
    this.createGain = () => { const p = { value: 1, setValueAtTime(v) { log.maxGain = Math.max(log.maxGain, v); }, exponentialRampToValueAtTime() {} }; return { gain: p, connect() {} }; };
    this.createOscillator = () => { log.osc++; return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; };
  };
  g.globalThis = g; vm.createContext(g); vm.runInContext(src, g);
  return { PL: g.PL, log };
}
// no AudioContext: no-ops
let { PL } = load(false);
PL.audio.init(); PL.audio.onEvents(['flip', 'death'], {}); PL.audio.setMuted(true);
assert.strictEqual(PL.audio.isMuted(), true);
// with fake
let t = load(true); PL = t.PL;
PL.audio.init();
const names = ['flip', 'dive', 'land', 'death', 'win', 'crumble', 'ride'];
for (const n of names) {
  const before = t.log.osc;
  PL.audio.onEvents([n], { lastLandSpeed: 500 });
  assert.ok(t.log.osc > before, n + ' should play');
  const b2 = t.log.osc; PL.audio.onEvents([{ type: n }], {}); assert.ok(t.log.osc > b2, n + ' object form');
}
const b = t.log.osc; PL.audio.onEvents(['bogus', null], {}); PL.audio.onEvents(null); assert.strictEqual(t.log.osc, b);
PL.audio.setMuted(true);
PL.audio.onEvents(names, {}); assert.strictEqual(t.log.osc, b, 'mute silences');
PL.audio.setMuted(false); assert.strictEqual(PL.audio.isMuted(), false);
PL.audio.onEvents(['flip'], {}); assert.ok(t.log.osc > b);
assert.ok(PL.audio.MAX_GAIN <= 0.15);
console.log('audio.test OK');
