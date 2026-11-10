(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Tuning knobs. V.TUNE is the live copy the drawer mutates; the sim reads S.tune every step.
V.TUNE_DEFAULTS = {
  // enemies / scaling (DESIGN 11)
  ENEMY_HP_GLOBAL: 0.82, HP_SLOPE: 0.036, DMG_SLOPE: 0.08,
  ENEMY_DMG_MULT: 1.1, ENEMY_SHOT_SPEED_MULT: 2, TELL_MULT: 0.85,
  // hero (D1 2)
  HERO_HP: 600, HERO_ATK: 150, CRIT_CHANCE: 0.05, CRIT_MULT: 2,
  MOVE_SPEED: 4.5, BRACE_DELAY: 0.15, FIRE_INTERVAL: 0.8, FIRE_FLOOR: 0.2,
  ROUND_SPEED: 14, ROUND_R: 0.12, INVULN: 0.6, PICKUP_R: 0.9,
  // run
  CARDS_OFFERED: 3, ENDLESS: false, TIME_SCALE: 1, PICK_DELAY: 1.0, SPAWN_T: 0.6,
  // feel / input (shell side)
  HITSTOP_MS: 50, DEADZONE_ENTER: 14, DEADZONE_EXIT: 8, HAPTICS: true, SOUND: true
};
V.TUNE = {};
for (var k in V.TUNE_DEFAULTS) V.TUNE[k] = V.TUNE_DEFAULTS[k];
})();
