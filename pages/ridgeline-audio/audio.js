// Ridgeline audio pack: procedural Web Audio SFX + ambience + free-music BGM. No sample files for SFX (0 KB).
// Usage:  import { RidgelineAudio } from './audio.js';
//   const au = new RidgelineAudio({ bgmBase: './audio/' });   // bgmBase = folder holding bgm-*.mp3
//   au.unlock();                       // call inside a tap/click handler (browsers block audio until a gesture)
//   au.play('gate', { link: 3 });      // one-shots, see CUES
//   au.setState({ speed, grounded, boost, airborne });   // call every frame (cheap) to drive wind/sand/hum
//   au.bgm('run'|'menu'|null);         // crossfades
//   au.setLevels({ master, sfx, amb, bgm, muted });      // 0..1 each; persisted by the caller (Tweak rows)
// All randomness here is audio-only (Math.random is fine: it never touches the seeded sim).
export const CUES = ['uiTap', 'uiToggle', 'countBeep', 'go', 'gate', 'gateCentred', 'gateMiss', 'graze', 'boost', 'flowUp', 'flowDrop',
  'launch', 'diveStart', 'diveEnd', 'land', 'tumbleStart', 'tumbleRest', 'propHit', 'crash', 'finish',
  'medalBronze', 'medalSilver', 'medalGold', 'medalSummit'];
// Rapier CONTRACT.md events -> cues. Call au.event(name, payload) straight from the sim event stream.
// launch{speed}, air{t}(ignored: use setState airT), dive_start, dive_end, land{grade,impact}, tumble_start{cause}, tumble_rest,
// prop_hit{kind,impulse}, graze{tier}, gate{centred}, miss, flow_up{level}, flow_drop, boost, finish, medal{tier}
export const EVENT_MAP = {
  launch: (a, e) => a.play('launch', { power: Math.min(1, (e.speed || 30) / 55) }),
  dive_start: a => a.play('diveStart'), dive_end: a => a.play('diveEnd'),
  land: (a, e) => a.play('land', { grade: e.grade, impact: e.impact }),
  tumble_start: a => { a.play('crash'); a.setState({ tumbling: true }); },
  tumble_rest: a => { a.setState({ tumbling: false }); a.play('tumbleRest'); },
  prop_hit: (a, e) => a.play('propHit', { kind: e.kind, impulse: e.impulse }),
  graze: (a, e) => a.play('graze', { tier: e.tier }),
  gate: (a, e) => a.play(e.centred ? 'gateCentred' : 'gate', { link: a._link || 0 }),
  miss: a => a.play('gateMiss'), flow_up: (a, e) => { a._link = e.level || 0; a.play('flowUp', { tier: (e.level || 1) - 1 }); },
  flow_drop: a => { a._link = 0; a.play('flowDrop'); }, boost: a => a.play('boost'), finish: a => a.play('finish'),
  medal: (a, e) => a.play('medal' + ({ bronze: 'Bronze', silver: 'Silver', gold: 'Gold', summit: 'Summit' }[String(e.tier).toLowerCase()] || 'Bronze'))
};
const PENTA = [0, 2, 4, 7, 9]; // major pentatonic: gate chain climbs and never sounds sour
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export class RidgelineAudio {
  constructor(o = {}) {
    this.bgmBase = o.bgmBase || './audio/';
    this.tracks = { run: 'bgm-wanderlust.mp3', menu: 'bgm-pink-navy.mp3' };
    this.lv = { master: 0.8, sfx: 0.9, amb: 0.7, bgm: 0.5, muted: false };
    this.ctx = null; this.st = { speed: 0, grounded: true, boost: 0, airborne: false, airT: 0, diving: false, tumbling: false, tumbleSpeed: 0 };
    this._bgmName = null; this._bgmEl = null; this._bgmGain = null; this._last = {};
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      this.ctx = new AC({ latencyHint: 'interactive' }); this._build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  _build() {
    const c = this.ctx;
    this.master = c.createGain(); this.sfxBus = c.createGain(); this.ambBus = c.createGain(); this.bgmBus = c.createGain();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.sfxBus.connect(this.master); this.ambBus.connect(this.master); this.bgmBus.connect(this.master);
    this.master.connect(comp); comp.connect(c.destination);
    // shared noise buffer (2 s white) for wind, sand, impacts
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    const loop = (type, f, q) => {
      const s = c.createBufferSource(); s.buffer = n; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.ambBus); s.start();
      return { fl, g };
    };
    this.wind = loop('bandpass', 400, 0.6);      // air rush, rises with speed
    this.roll = loop('lowpass', 400, 0.8);       // tumble rumble (sled rolling, only while tumbling)
    this.sand = loop('highpass', 2500, 0.5);     // sand hiss, only on the ground
    this.hum = { o: c.createOscillator(), o2: c.createOscillator(), g: c.createGain(), fl: c.createBiquadFilter() };
    this.hum.o.type = 'sawtooth'; this.hum.o2.type = 'sine'; this.hum.fl.type = 'lowpass'; this.hum.fl.frequency.value = 500; this.hum.g.gain.value = 0;
    this.hum.o.connect(this.hum.fl); this.hum.o2.connect(this.hum.fl); this.hum.fl.connect(this.hum.g); this.hum.g.connect(this.ambBus);
    this.hum.o.start(); this.hum.o2.start();
    this.setLevels({});
  }
  setLevels(l) {
    Object.assign(this.lv, l); if (!this.ctx) return; const t = this.ctx.currentTime, m = this.lv.muted ? 0 : 1;
    this.master.gain.setTargetAtTime(this.lv.master * m, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.lv.sfx * 1.6, t, 0.03); this.ambBus.gain.setTargetAtTime(this.lv.amb, t, 0.03);
    this.bgmBus.gain.setTargetAtTime(this.lv.bgm * 0.8, t, 0.03);
  }
  // per-frame drive. speed in m/s (about 20-50), boost 0..1
  setState(s) {
    Object.assign(this.st, s); if (!this.ctx) return; const t = this.ctx.currentTime, k = 0.08;
    const v = Math.min(1, this.st.speed / 50), air = this.st.airborne ? Math.min(1, 0.4 + (this.st.airT || 0) / 2) : 0, gr = this.st.grounded && !air ? 1 : 0, b = this.st.boost || 0;
    const dv = this.st.diving ? 0.25 : 0;
    this.wind.g.gain.setTargetAtTime(0.05 + 0.35 * v * v + 0.15 * b + 0.2 * air + dv, t, k);
    this.wind.fl.frequency.setTargetAtTime(300 + 1700 * v + 900 * b + 1200 * air + 1500 * dv, t, k);
    const tu = this.st.tumbling ? 1 : 0, ts = Math.min(1, (this.st.tumbleSpeed || v * 50) / 40);
    this.roll.g.gain.setTargetAtTime(tu * (0.1 + 0.4 * ts), t, 0.06); this.roll.fl.frequency.setTargetAtTime(250 + 700 * ts, t, 0.08);
    this.sand.g.gain.setTargetAtTime(gr * (0.02 + 0.22 * v), t, k * 1.5);
    this.sand.fl.frequency.setTargetAtTime(2200 + 2500 * v, t, k);
    this.hum.o.frequency.setTargetAtTime(55 + 70 * v + 40 * b, t, 0.1); this.hum.o2.frequency.setTargetAtTime(110 + 140 * v + 60 * b, t, 0.1);
    this.hum.fl.frequency.setTargetAtTime(300 + 900 * v + 1200 * b, t, 0.1);
    this.hum.g.gain.setTargetAtTime(this.st.speed > 0.5 && !tu ? 0.05 + 0.05 * v : 0, t, 0.15);
  }
  silenceLoops() { if (this.ctx) this.setState({ speed: 0, boost: 0, airborne: false, airT: 0, diving: false, tumbling: false }); }
  event(name, e = {}) { const f = EVENT_MAP[name]; if (f) f(this, e); }
  // BGM: streamed <audio> element through the bgm bus, crossfaded; loops. null fades out.
  bgm(name) {
    if (!this.ctx || name === this._bgmName) return; this._bgmName = name; const c = this.ctx, t = c.currentTime;
    const old = this._bgmEl, oldG = this._bgmGain;
    if (old) { oldG.gain.cancelScheduledValues(t); oldG.gain.setValueAtTime(oldG.gain.value, t); oldG.gain.linearRampToValueAtTime(0, t + 1.8); setTimeout(() => { old.pause(); old.src = ''; }, 2000); }
    this._bgmEl = this._bgmGain = null; if (!name || !this.tracks[name]) return;
    const el = new Audio(this.bgmBase + this.tracks[name]); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 2.5);
    c.createMediaElementSource(el).connect(g); g.connect(this.bgmBus); el.play().catch(() => {});
    this._bgmEl = el; this._bgmGain = g;
  }
  duck(amount = 0.35, dur = 0.8) { if (!this.ctx) return; const t = this.ctx.currentTime, p = this.bgmBus.gain; const base = this.lv.bgm * 0.8; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(base * amount, t + 0.05); p.linearRampToValueAtTime(base, t + dur); }

  // ---- one-shots ----
  play(name, o = {}) {
    if (!this.ctx || this.lv.muted) return; const c = this.ctx, now = c.currentTime;
    if (this._last[name] && now - this._last[name] < 0.04) return; this._last[name] = now; // de-dup bursts
    const fn = this['_' + name]; if (fn) fn.call(this, now, o);
  }
  _tone(t, f, dur, { type = 'sine', gain = 0.3, a = 0.005, f2 = null, bus = this.sfxBus, detune = 0 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05); return g;
  }
  _burst(t, dur, { type = 'lowpass', f = 1000, f2 = null, q = 0.7, gain = 0.4, a = 0.003, bus = this.sfxBus } = {}) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; s.loop = true;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _thud(t, f, dur, gain) { this._tone(t, f, dur, { type: 'sine', gain, f2: f * 0.45, a: 0.002 }); }
  _uiTap(t) { this._tone(t, 880, 0.07, { type: 'triangle', gain: 0.18 }); }
  _uiToggle(t, o) { this._tone(t, o.on === false ? 520 : 780, 0.09, { type: 'triangle', gain: 0.18 }); this._tone(t + 0.05, o.on === false ? 400 : 1040, 0.1, { type: 'triangle', gain: 0.14 }); }
  _countBeep(t) { this._tone(t, 523, 0.18, { type: 'sine', gain: 0.25 }); }
  _go(t) { this._tone(t, 784, 0.35, { type: 'sine', gain: 0.28 }); this._tone(t, 1175, 0.35, { type: 'sine', gain: 0.14 }); }
  // gate: bell-ish pair, root climbs the pentatonic with flow link count (o.link 0..), razor adds sparkle
  _gate(t, o) {
    const i = Math.max(0, o.link | 0), deg = PENTA[i % 5] + 12 * Math.min(2, Math.floor(i / 5)), m = 64 + deg;
    this._tone(t, mtof(m), 0.7, { type: 'sine', gain: 0.3 }); this._tone(t, mtof(m + 12), 0.5, { type: 'sine', gain: 0.1 });
    this._tone(t, mtof(m) * 2.76, 0.18, { type: 'sine', gain: 0.05 });
  }
  _gateCentred(t, o) { this._gate(t, o); this._tone(t + 0.05, mtof(88), 0.3, { gain: 0.07 }); }
  _gateMiss(t) { this._thud(t, 150, 0.25, 0.28); this._burst(t, 0.15, { f: 600, gain: 0.12 }); }
  // graze tiers: outer = soft air tick, inner = brighter ping, razor = sharp glassy zing
  _graze(t, o) {
    const r = o.tier === 'razor' ? 2 : o.tier === 'inner' ? 1 : 0;
    this._burst(t, 0.07 + 0.03 * r, { type: 'bandpass', f: 2200 + 1400 * r, q: 2, gain: 0.12 + 0.08 * r });
    if (r) this._tone(t, mtof(84 + PENTA[r * 2]), 0.2 + 0.1 * r, { gain: 0.09 + 0.05 * r });
  }
  _boost(t) { this._burst(t, 0.9, { type: 'bandpass', f: 300, f2: 3500, q: 1.2, gain: 0.45, a: 0.12 }); this._tone(t, 110, 0.7, { type: 'sawtooth', gain: 0.1, f2: 330, a: 0.1 }); }
  _flowUp(t, o) { const m = 72 + PENTA[Math.min(4, o.tier | 0)]; this._tone(t, mtof(m), 0.5, { gain: 0.16 }); this._tone(t + 0.07, mtof(m + 7), 0.5, { gain: 0.14 }); }
  _flowDrop(t) { this._tone(t, 330, 0.35, { type: 'triangle', gain: 0.18, f2: 160 }); }
  _launch(t, o) { const p = Math.min(1, (o.power || 0.6)); this._burst(t, 0.45, { type: 'bandpass', f: 500, f2: 1800, q: 0.9, gain: 0.2 + 0.2 * p, a: 0.08 }); this._tone(t, 180, 0.3, { gain: 0.12 * p, f2: 360 }); }
  _diveStart(t) { this._burst(t, 0.35, { type: 'bandpass', f: 3000, f2: 700, q: 1.1, gain: 0.3, a: 0.02 }); }
  _diveEnd(t) { this._burst(t, 0.25, { type: 'bandpass', f: 700, f2: 2500, q: 1.1, gain: 0.18, a: 0.05 }); }
  // landing by grade. o.grade clean|rough|slam|wreck, o.impact 0..1 (normalised by the sim)
  _land(t, o) {
    const g = o.grade || 'rough', k = Math.max(0.05, Math.min(1, o.impact == null ? 0.5 : o.impact));
    if (g === 'clean') { this._burst(t, 0.3, { f: 1500, f2: 500, gain: 0.12 + 0.1 * k }); this._thud(t, 120, 0.15, 0.1 + 0.15 * k); this._tone(t + 0.03, mtof(79), 0.35, { gain: 0.07 }); return; }
    if (g === 'rough') { this._thud(t, 100, 0.25, 0.25 + 0.3 * k); this._burst(t, 0.4, { f: 1800, f2: 350, gain: 0.2 + 0.25 * k }); return; }
    if (g === 'slam') { this._thud(t, 75, 0.5, 0.45 + 0.35 * k); this._burst(t, 0.55, { f: 1400, f2: 200, gain: 0.35 + 0.2 * k }); this._tone(t, 160, 0.4, { type: 'square', gain: 0.05, f2: 70 }); this.duck(0.55, 0.8); return; }
    this._crash(t); // wreck
  }
  _tumbleStart(t, o) { this._crash(t, o); }
  _tumbleRest(t) { this._thud(t, 85, 0.3, 0.25); this._burst(t, 0.5, { f: 900, f2: 200, gain: 0.15 }); }
  // props: kind post | flag | cairn | boulder. o.impulse ~0..1+ (normalised by the sim); louder + lower when harder
  _propHit(t, o) {
    const k = Math.max(0.1, Math.min(1.2, o.impulse == null ? 0.5 : o.impulse)), kind = o.kind || 'post';
    if (kind === 'flag') { this._burst(t, 0.18, { type: 'bandpass', f: 1800, f2: 900, q: 1, gain: 0.25 * k }); return; }
    if (kind === 'post') { this._tone(t, 260, 0.18, { type: 'triangle', gain: 0.3 * k, f2: 150 }); this._burst(t, 0.05, { type: 'highpass', f: 2500, gain: 0.2 * k }); return; }
    if (kind === 'cairn') { for (let i = 0; i < 4; i++) { const d = i * 0.05 + Math.random() * 0.03; this._tone(t + d, 600 + Math.random() * 900, 0.08, { type: 'square', gain: 0.06 * k }); this._burst(t + d, 0.06, { type: 'bandpass', f: 1500, q: 3, gain: 0.15 * k }); } this._thud(t, 110, 0.2, 0.25 * k); return; }
    this._thud(t, 65, 0.45, 0.55 * k); this._burst(t, 0.35, { f: 900, f2: 180, gain: 0.3 * k }); // boulder
  }
  _crash(t) {
    this._thud(t, 70, 0.6, 0.7); this._burst(t, 0.12, { type: 'highpass', f: 2500, gain: 0.5 }); this._burst(t, 0.7, { f: 1200, f2: 150, gain: 0.5 });
    for (let i = 0; i < 5; i++) this._tone(t + 0.04 + i * 0.05 + Math.random() * 0.03, 220 + Math.random() * 500, 0.06, { type: 'square', gain: 0.06 }); // debris ticks
    this.duck(0.3, 1.4);
  }
  _finish(t) { [0, 4, 7, 12].forEach((s, k) => this._tone(t + k * 0.1, mtof(60 + s), 0.9, { gain: 0.2 })); }
  _medal(t, notes, shine) {
    notes.forEach((s, k) => { this._tone(t + k * 0.13, mtof(67 + s), 0.8, { gain: 0.22 }); this._tone(t + k * 0.13, mtof(79 + s), 0.5, { gain: 0.06, type: 'triangle' }); });
    if (shine) for (let i = 0; i < 6; i++) this._tone(t + 0.5 + i * 0.07, mtof(91 + PENTA[i % 5]), 0.3, { gain: 0.05 });
    this.duck(0.4, 1.8);
  }
  _medalBronze(t) { this._medal(t, [0, 4], false); }
  _medalSilver(t) { this._medal(t, [0, 4, 7], false); }
  _medalGold(t) { this._medal(t, [0, 4, 7, 12], true); }
  _medalSummit(t) { this._medal(t, [0, 4, 7, 12, 16, 19], true); }
}
