import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../pages/ridgeline');

// Minimal AudioContext stub: every node is a permissive proxy-ish object.
function node() {
  const n = { connect() {}, start() {}, stop() {}, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
  return new Proxy(n, { get: (t, k) => (k in t ? t[k] : (t[k] = typeof k === 'string' && /^(gain|frequency|Q|detune|threshold|ratio|attack|release|pan|playbackRate)$/.test(k) ? node() : undefined)), set: (t, k, v) => { t[k] = v; return true; } });
}
class StubAC {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = node(); }
  resume() {} close() {}
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
  createGain() { return node(); } createOscillator() { return node(); } createBiquadFilter() { return node(); }
  createDynamicsCompressor() { return node(); } createBufferSource() { return node(); } createStereoPanner() { return node(); }
  createMediaElementSource() { return node(); } createWaveShaper() { return node(); } createDelay() { return node(); }
}

const { audioState, AUDIO_DEF, AUDIO_META, createAudioGlue } = await import(path.join(root, 'src/audioglue.js'));
const { EVENT_MAP } = await import(path.join(root, 'src/audio.js'));
const { DEFAULTS, META } = await import(path.join(root, 'src/config.js'));

test('audioState maps mode/tAir/diving/boost and always passes gap', () => {
  const a = audioState({ mode: 'air', tAir: 1.2, diving: true, boost: 0.5, speed: 40, grounded: false, gap: 55 });
  assert.equal(a.airborne, true); assert.equal(a.tumbling, false); assert.equal(a.airT, 1.2);
  assert.equal(a.diving, true); assert.equal(a.boost, 0.5); assert.equal(a.gap, 55); assert.equal(a.speed, 40);
  const t = audioState({ mode: 'tumble', speed: 33, tAir: 9, grounded: false });
  assert.equal(t.tumbling, true); assert.equal(t.tumbleSpeed, 33); assert.equal(t.airborne, false); assert.equal(t.airT, 0);
  const g = audioState({ mode: 'ground', speed: 20, grounded: true, tAir: 3 });
  assert.equal(g.airborne, false); assert.equal(g.tumbling, false); assert.equal(g.tumbleSpeed, 0); assert.equal(g.airT, 0);
  assert.equal(g.grounded, true); assert.equal(g.boost, 0); assert.equal(g.diving, false);
  assert.ok('gap' in g); assert.ok(Number.isNaN(g.gap));
  assert.equal(audioState({ mode: 'ground', gap: 0 }).gap, 0);
  assert.ok(Number.isNaN(audioState({ mode: 'air', gap: Infinity }).gap));
  assert.ok(Number.isNaN(audioState({ mode: 'air', gap: 'x' }).gap));
});

test('AUDIO_DEF / AUDIO_META keys match, group Audio, present in config', () => {
  assert.deepEqual(Object.keys(AUDIO_DEF).sort(), Object.keys(AUDIO_META).sort());
  for (const k of Object.keys(AUDIO_DEF)) {
    assert.equal(AUDIO_META[k].group, 'Audio', k);
    assert.ok(k in DEFAULTS, `DEFAULTS has ${k}`);
    assert.equal(DEFAULTS[k], AUDIO_DEF[k]);
    assert.ok(META[k], `META has ${k}`);
    assert.equal(META[k].group, 'Audio');
  }
});

test('glue is a safe no-op before unlock()', () => {
  const g = createAudioGlue(() => ({ ...AUDIO_DEF }));
  assert.equal(g.audio, null);
  assert.doesNotThrow(() => {
    g.step({ mode: 'air' }); g.event({ type: 'land' }); g.silence(); g.bgm('run'); g.applyLevels(); g.ui();
  });
  assert.equal(g.audio, null);
});

test('glue with stubbed AudioContext unlocks and forwards calls', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const hadAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  globalThis.window = { AudioContext: StubAC };
  globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} };
  try {
    const g = createAudioGlue(() => ({ ...AUDIO_DEF }));
    g.bgm('run');
    assert.equal(g.unlock(), true);
    assert.ok(g.audio);
    assert.doesNotThrow(() => {
      g.step({ mode: 'air', tAir: 0.5, speed: 30, gap: 80 }); g.step({ mode: 'ground' });
      g.event({ type: 'land', grade: 'clean' }); g.event({ type: 'unknown_evt' });
      g.silence(); g.applyLevels(); g.ui(); g.bgm('menu'); g.bgm(null);
    });
    assert.equal(g.audio.st.speed, 0); // silenceLoops/step applied to state
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;
    if (hadAudio) Object.defineProperty(globalThis, 'Audio', hadAudio); else delete globalThis.Audio;
  }
});

test('sled events are mapped or intentionally ignored', () => {
  const sledEvents = ['launch', 'air', 'dive_end', 'land', 'tumble_start', 'tumble_rest', 'recover_start', 'recover_end', 'run_over', 'run_start', 'hull_unlock', 'zone_enter', 'gate', 'miss', 'graze', 'boost'];
  const ignored = sledEvents.filter(t => typeof EVENT_MAP[t] !== 'function');
  assert.deepEqual(ignored, ['air', 'run_start']);
  for (const t of ['night_stage', 'gap_hit', 'caught', 'milestone', 'prop_hit']) assert.equal(typeof EVENT_MAP[t], 'function', t);
});

test('sw.js FILES lists audio sources and mp3s, all exist', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = sw.match(/const FILES = \[([\s\S]*?)\n\];/);
  assert.ok(m, 'FILES found');
  const files = [...m[1].replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map(x => x[1]);
  for (const f of ['./src/audio.js', './src/audioglue.js', './audio/bgm-wanderlust.mp3', './audio/bgm-pink-navy.mp3']) assert.ok(files.includes(f), f);
  for (const f of files) if (f !== './') assert.ok(fs.existsSync(path.join(root, f)), `exists ${f}`);
});
