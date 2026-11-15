// @ts-check
// Data flags (M picks, 2026-11-12). Lucky Pad off in the game (M 07:16); on only in parity tests.
// r9 flags (matchday, settled, roar, activities, freePick) default OFF: all off = identical to the 500 frozen vectors.
export const FLAGS = { luckyPad: false, burst: false, rivalGoodShare: 0.7, matchday: false, settled: false, roar: false, activities: false, freePick: false,
  wheelMeta: false, whyInline: true, callHint: true, wheelMatch: false }; // Spokes, tally, Workshop, tree effects, aimable dials and reels. OFF here so tests stay frozen; main.js sets it from s.wheelFeatures (missing = on).
// wheelMatch (2026-11-15): NewGame sets matchMode 'wheel' when on. OFF here so old tests (which play by BowlOver) stay classic; main.js sets it true.
