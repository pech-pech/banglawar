// @ts-check
// Data flags (M picks, 2026-11-12). Lucky Pad off in the game (M 07:16); on only in parity tests.
// r9 flags (matchday, settled, roar, activities, freePick) default OFF: all off = identical to the 500 frozen vectors.
export const FLAGS = { luckyPad: false, burst: false, rivalGoodShare: 0.7, matchday: false, settled: false, roar: false, activities: false, freePick: false,
  wheelMeta: false }; // Spokes, tally, Workshop, tree effects, aimable dials and reels. OFF here so tests stay frozen; main.js sets it from s.wheelFeatures (missing = on).
