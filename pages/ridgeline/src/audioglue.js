// B5: glue between the sim and the audio pack (src/audio.js). One tiny surface for main.js.
// Audio levels live in cfg.audio* (Tweak group Audio). They never touch the seeded sim.
import { RidgelineAudio } from './audio.js';

export const AUDIO_KEYS = ['audioMaster', 'audioSfx', 'audioAmb', 'audioBgm', 'audioMute'];
export const AUDIO_DEF = { audioMaster: 0.8, audioSfx: 0.9, audioAmb: 0.7, audioBgm: 0.5, audioMute: 0 };
export const AUDIO_META = {
  audioMaster: { min: 0, max: 1, step: 0.05, label: 'Master volume', group: 'Audio' },
  audioSfx: { min: 0, max: 1, step: 0.05, label: 'Effects volume', group: 'Audio' },
  audioAmb: { min: 0, max: 1, step: 0.05, label: 'Wind / sand volume', group: 'Audio' },
  audioBgm: { min: 0, max: 1, step: 0.05, label: 'Music volume', group: 'Audio' },
  audioMute: { min: 0, max: 1, step: 1, label: 'Mute all', group: 'Audio' },
};
export const isAudioKey = (k) => k.startsWith('audio');

// Pure: sled state -> audio setState payload. gap is passed EVERY step (the night drone and pulse are gap-driven).
export function audioState(s) {
  const air = s.mode === 'air';
  const tumb = s.mode === 'tumble';
  return {
    speed: s.speed || 0, grounded: !!s.grounded, airborne: air, airT: air ? (s.tAir || 0) : 0, diving: !!s.diving,
    tumbling: tumb, tumbleSpeed: tumb ? (s.speed || 0) : 0, boost: s.boost || 0,
    gap: typeof s.gap === 'number' && isFinite(s.gap) ? s.gap : NaN,
  };
}

export function createAudioGlue(getCfg, opts = {}) {
  let au = null, mode = null, wanted = null;
  const make = () => { if (!au) { try { au = new RidgelineAudio({ bgmBase: opts.base || './audio/' }); } catch (e) { au = null; } } return au; };
  const levels = () => { const c = getCfg(); return { master: c.audioMaster, sfx: c.audioSfx, amb: c.audioAmb, bgm: c.audioBgm, muted: !!c.audioMute }; };
  return {
    // first user gesture (pointerdown / key): browsers block audio before this
    unlock() { const a = make(); if (!a) return false; try { const ok = a.unlock(); a.setLevels(levels()); if (wanted) a.bgm(wanted); return ok; } catch (e) { return false; } },
    applyLevels() { if (au) try { au.setLevels(levels()); } catch (e) { /* ignore */ } },
    bgm(name) { wanted = name; if (au && mode !== name) { mode = name; try { au.bgm(name); } catch (e) { /* ignore */ } } },
    step(s) { if (au) try { au.setState(audioState(s)); } catch (e) { /* ignore */ } },
    event(ev) { if (au) try { au.event(ev.type, ev); } catch (e) { /* ignore */ } },
    silence() { if (au) try { au.silenceLoops(); } catch (e) { /* ignore */ } },
    ui() { if (au) try { au.play('uiTap'); } catch (e) { /* ignore */ } },
    get audio() { return au; },
  };
}
