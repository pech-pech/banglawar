// Golden Over beat: short synthesized blips (synth is the design; no sound files). Never throws.
let ac = null;

function ctx() {
  return ac;
}

function blip(freq, vol = 0.15, dur = 0.05, when = 0, type = 'sine') {
  try {
    const c = ctx();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime + Math.max(0, when);
    o.start(t);
    o.stop(t + dur);
  } catch (e) { /* silent */ }
}

export const beat = {
  /** Call from a user gesture (pointerdown/click). Creates and resumes the AudioContext. */
  prime() {
    try {
      if (!ac) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        ac = new AC();
      }
      if (ac.state === 'suspended' && ac.resume) {
        const p = ac.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { ac = null; }
  },
  /** 'pre' = the two lead-in ticks, 'cross' = the beat on the crossing. */
  tick(kind) {
    blip(kind === 'cross' ? 880 : 660, 0.15, kind === 'cross' ? 0.07 : 0.05);
  },
  /** Result blip: 'P' bright double, 'G' single mid, 'M' low dull. */
  hit(grade) {
    if (grade === 'P') { blip(1175, 0.15, 0.06); blip(1568, 0.12, 0.09, 0.06); }
    else if (grade === 'G') blip(880, 0.13, 0.07);
    else blip(180, 0.12, 0.12, 0, 'triangle');
  },
};
