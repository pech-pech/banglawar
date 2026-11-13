// @ts-check
// Match-day tuning keys (SPEC 2026-11-13 section 10 line 1). Same names as the spec. Edit here to dial it; no rebuild of logic.
export const MD = {
  SETTLED_K: 0.42, SETTLED_MAX_BALLS: 25,
  ROAR_BASE: 0.05, ROAR_FANS_ADD: 0.25, ROAR_FANS_REF: 4000, ROAR_CAP: 0.30, ROAR_BOOST: 0.05,
  HYPE_LEVELS: ['low', 'med', 'high', 'nuts'],
  HYPE_PERF: { low: 0.02, med: 0.04, high: 0.06, nuts: 0.10 },
  HYPE_ODDS: [35, 35, 20, 10],
  HYPE_TILT_CAP: 0.20, HYPE_FANS_TILT: 0.12, HYPE_FANS_REF: 4000,
  HYPE_ACT_CAP: 0.15, HYPE_ACT_DECAY: [1, 0.5, 0.25],
  HYPE_ODDS_SLOPE: [-80, -20, 40, 60],
  HYPE_FAN_MULT: [1, 1.1, 1.25, 1.5],
  TOSS_BOOST: 0.05, PEP_BOOST: 0.05, RMAX: 99,
  WHY_SHOW_SETTLED: false, AUTO_MATCHDAY_DEFAULT: false, MATCHDAY_FIRST_N_SHOWN: 3,
  ROAR_OVERS: 20,
};
