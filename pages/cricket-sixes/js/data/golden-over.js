// @ts-check
// Golden Over (A1 Captain's Over) constants. The ONLY place for them (CONTRACT-GO s2). Windows in ms: [Perfect, Good].
export const GOLDEN = {
  WINDOWS: { Wide: [80, 170], Mid: [55, 120], Tight: [40, 90] },
  WINDOW: 'Mid',
  MULT_LO: 0.75, // letter F-  (step 1)
  MULT_HI: 1.375, // letter S+ (step 21)
  STEPS: 21,
  ROLLS: 3, // x draws per ball, always
  WK_VAL: 6, // value of a wicket for the pick (batting -6, bowling +6)
  FLOOR_BAT: 1, // Perfect while batting: never 0 or W
  FLOOR_BOWL: 2, // Perfect while bowling: never 4 or 6
  CAL_TAPS: 10,
  // run-in (proto A1): ball travel by bowler type, lead before the first ball, 3-beat tick ms before the cross
  PACE: { Fast: 550, Medium: 800, Spin: 1050 },
  LEAD_MS: 900,
  BEAT_MS: [800, 400, 0],
  OVERS_PER_INNINGS: 1,
};
