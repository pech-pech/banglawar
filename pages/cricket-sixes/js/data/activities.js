// @ts-check
// Fan activities (r9, fans-matchday SPEC s2). Numbers are DEFAULTs from the spec; M may retune. Names are original.
// mix = share of a find: coins / player / coach (sum 100). Sponsor share is parked (move 10 points of Coins to Sponsor later).
export const ACT = {
  source: '2026-11-13-fans-matchday/SPEC.md s2 + M answers 18:28 (Q3: Fans scale with the league Fans multiplier)',
  TABLE: [
    { id: 'street', name: 'Street Game', blurb: 'Tennis-ball cricket outside the gate', coins: 15, fans: 10, tilt: 0.02, find: 8, mix: { coins: 80, player: 20, coach: 0 } },
    { id: 'clinic', name: 'Chalk and Cones Clinic', blurb: 'A school visit', coins: 30, fans: 16, tilt: 0.03, find: 14, mix: { coins: 40, player: 60, coach: 0 } },
    { id: 'signing', name: 'Bat Signing Table', blurb: 'Sign bats for the fans', coins: 40, fans: 22, tilt: 0.04, find: 16, mix: { coins: 60, player: 0, coach: 40 } },
    { id: 'tea', name: 'Rope-Side Tea', blurb: 'A supporters afternoon', coins: 55, fans: 28, tilt: 0.05, find: 18, mix: { coins: 30, player: 20, coach: 50 } },
    { id: 'sixhit', name: 'Six-Hit Challenge', blurb: 'A charity fun hit', coins: 70, fans: 36, tilt: 0.06, find: 22, mix: { coins: 40, player: 40, coach: 20 } },
    { id: 'banner', name: 'Banner Night', blurb: 'Flags and drums', coins: 85, fans: 44, tilt: 0.08, find: 26, mix: { coins: 40, player: 30, coach: 30 } },
  ],
  ACT_FANS_LEAGUE_SCALE: 1, // 1 = activity Fans use the league Fans mult (M Q3); 0 = flat
  ACT_REPEAT_FACTOR: 0.5,   // same activity two rounds running: this share of Fans, no find roll
  ACT_PITY_WEEKS: 5,        // after this many rolled picks with no find, the next non-repeat pick finds
  ACT_COIN_FIND: [0.8, 1.6],// Coins find = cost x U(lo, hi)
  TILT_WINDOW: 3,           // rounds counted for the hype tilt: this, last, the one before
  SQUAD_MAX_FROM: 'js/data/run.js SQUAD.size',
};
