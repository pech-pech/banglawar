'use strict';
var assert = require('assert');
var listeners = {}, resumeCalls = 0, suspendCalls = 0, ctxs = [];
function param() { return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }; }
function node() { return { connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', onended: null }; }
function FakeAC() {
  this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); ctxs.push(this);
  this.createGain = node; this.createOscillator = node; this.createBiquadFilter = node;
  this.createDynamicsCompressor = node; this.createBufferSource = node;
  this.createBuffer = function (c, n) { var a = new Float32Array(n); return { getChannelData() { return a; } }; };
  this.resume = function () { resumeCalls++; return Promise.resolve(); };
  this.suspend = function () { suspendCalls++; return Promise.resolve(); };
}
global.window = { AudioContext: FakeAC };
global.document = { hidden: false, addEventListener: function (t, f, cap) { (listeners[t] = listeners[t] || []).push({ f: f, cap: !!cap }); } };
var timers = [];
global.setTimeout = function (f) { timers.push(f); return 0; }; // never fire: voices stay held
var a = require('../src/audio.js');

a.init();
assert(listeners.pointerdown && listeners.pointerdown[0].cap === true, 'pointerdown capture');
assert(listeners.keydown, 'keydown registered');
assert(listeners.visibilitychange, 'visibilitychange registered');
listeners.pointerdown[0].f();
assert.strictEqual(ctxs.length, 1); assert(resumeCalls >= 1, 'resume called');
listeners.keydown[0].f(); assert.strictEqual(ctxs.length, 1, 'ctx created once');

for (var i = 0; i < 60; i++) a.tick();
assert.strictEqual(a._voices(), 9, 'ticks capped below reserve: ' + a._voices());
a.dock(); a.crash(); a.crash(); a.dock();
assert.strictEqual(a._voices(), 12, 'hard cap 12');
for (i = 0; i < 60; i++) { a.tick(); a.dock(); a.crash(); }
assert.strictEqual(a._voices(), 12, 'cap holds under flood');

a.hum(160); a.burn(true, 1); a.burn(false, 0);
a.mute(true); assert.strictEqual(a.isMuted(), true); a.mute(false);

document.hidden = true; listeners.visibilitychange[0].f();
assert.strictEqual(suspendCalls, 1, 'suspend on hidden');
var before = resumeCalls; document.hidden = false; listeners.visibilitychange[0].f();
assert.strictEqual(resumeCalls, before + 1, 'resume on visible');

assert(a._peakEstimate() < 0.9, 'peak ' + a._peakEstimate());
console.log('audio tests passed (peak est ' + a._peakEstimate().toFixed(3) + ')');
