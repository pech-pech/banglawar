// M5 quality tiers: max / showcase / lean. Frame EMA under 40 fps for 3 s steps down one tier; never up within a run.
export const TIERS = ['max', 'showcase', 'lean'];

export const KEYS = {
  lookTier: { def: 0, min: 0, max: 2, step: 1, label: 'Quality tier (0 max, 1 showcase, 2 lean)' },
};

// tier -> consumer settings (integrator reads these; setQuality(tier) per module still gets the tier name)
export const TIER_SETTINGS = {
  max: { post: true, bloom: true, grade: true, msaa: 4, trackMap: 512, stars: 1, particles: 1, dprCap: 2 },
  showcase: { post: true, bloom: false, grade: true, msaa: 4, trackMap: 512, stars: 0.7, particles: 0.75, dprCap: 1.75 },
  lean: { post: false, bloom: false, grade: false, msaa: 0, trackMap: 256, stars: 0.4, particles: 0.4, dprCap: 1.5 },
};
// pixel ratio per tier: max = the existing cap, showcase = min(cap, 1.5), lean = 1
export function pixelRatioFor(tier, cap) {
  const c = Math.max(1, +cap || 1);
  return tier === 'max' ? c : tier === 'showcase' ? Math.min(c, 1.5) : 1;
}
export const settingsFor = (tier) => TIER_SETTINGS[tier] || TIER_SETTINGS.lean;
export const tierFromIndex = (i) => TIERS[Math.max(0, Math.min(2, Math.round(+i || 0)))];

export const FPS_FLOOR = 40, STEP_SECONDS = 3, EMA_TAU = 0.5;

export function createQuality(opts) {
  const o = opts || {};
  const onTier = o.onTier || null;
  let start = TIERS.includes(o.tier) ? o.tier : 'max';
  let idx = TIERS.indexOf(start), ema = 60, low = 0, runSeconds = 0, steps = 0;
  const log = [];
  function set(i, reason) {
    if (i === idx) return;
    log.push({ from: TIERS[idx], to: TIERS[i], reason, t: runSeconds });
    idx = i;
    if (onTier) onTier(TIERS[idx], reason);
  }
  return {
    // call once per rendered frame with real frame dt (s); returns new tier name if it stepped down, else null
    update(dt) {
      if (!(dt > 0) || dt > 1) return null; // skip stalls (tab hidden, load hitches)
      runSeconds += dt;
      const fps = 1 / dt, a = 1 - Math.exp(-dt / EMA_TAU);
      ema += (fps - ema) * a;
      if (ema < FPS_FLOOR) low += dt; else low = 0;
      if (low >= STEP_SECONDS && idx < TIERS.length - 1) {
        low = 0; steps++; set(idx + 1, 'fps ' + Math.round(ema));
        ema = 60; // give the new tier a fair window
        return TIERS[idx];
      }
      return null;
    },
    // new run: restart from the user's chosen tier (never carry a step-down across runs), clear EMA
    resetRun(tier) {
      const t = TIERS.includes(tier) ? tier : start;
      start = t; idx = TIERS.indexOf(t); ema = 60; low = 0; runSeconds = 0; steps = 0;
    },
    // user picks a tier in Tweak (allowed any time; becomes the run-start tier)
    setUser(tier) { if (TIERS.includes(tier)) { start = tier; set(TIERS.indexOf(tier), 'user'); low = 0; } },
    get tier() { return TIERS[idx]; },
    get fps() { return ema; },
    get steps() { return steps; },
    get log() { return log; },
    settings() { return settingsFor(TIERS[idx]); },
    // 'Vis: tier max, fps 58, post 2.9 ms, stamp 0.4 ms, gpu 11.2 ms, steps 0'
    probeLine(p) {
      const q = p || {};
      const f = (v) => (typeof v === 'number' && isFinite(v) ? v.toFixed(1) : 'n/a');
      return 'Vis: tier ' + TIERS[idx] + ', fps ' + Math.round(ema) + ', post ' + f(q.postMs) + ' ms, stamp ' + f(q.stampMs) + ' ms, gpu ' + f(q.gpuMs) + ' ms, steps ' + steps + (typeof q.dpr === 'number' ? ', dpr ' + q.dpr.toFixed(2).replace(/\.?0+$/, '') : '');
    },
  };
}
