// Run length, promotion rule, score, chapters and carryover. Source: 2026-11-12/data/incoming/run_score.json (score, carryover),
// parts/10-pace-milestones.md s5-s6 (chapters). RUN.seasons and RUN.promoteTop are OPEN (M's card): A 12/2, B 12/4, C 8/2.
export const RUN = {
  source: '2026-11-12/data/incoming/run_score.json; parts/09-run-score.md s2, s4; parts/10-pace-milestones.md s5-s6',
  seasons: 12,
  promoteTop: 2,
  score: {
    max: 9999,
    roundTo: 10,
    // pending: no game source yet (fans, S grads, club build come with the economy and stadium); they count 0 and show a row.
    inputs: [
      { key: 'titles', label: 'League titles', weight: 1900, full: 5 },
      { key: 'league', label: 'Highest league', weight: 1800, full: 5 },
      { key: 'sgrads', label: 'S-grade graduates', weight: 1400, full: 4, pending: true },
      { key: 'fans', label: 'Fans', weight: 1600, full: 10, pending: true },
      { key: 'best_player', label: 'Best player', weight: 1000, full: 180, floor: 60 },
      { key: 'club_build', label: 'Club build', weight: 1400, full: 43, pending: true },
      { key: 'finals', label: 'Finals reached', weight: 900, full: 10 },
    ],
  },
  // feat kinds: wins (league wins this run), finals (seasons in the top 4), titles, league (highest league). Totals to date, so a missed feat can be claimed later.
  chapters: [
    { season: 3, name: 'Kickoff Crest', coins: 120, tp: 100, medals: 1, feat: { kind: 'wins', target: 15, text: 'Win 15 league matches' } },
    { season: 6, name: 'Name a Stand', coins: 200, tp: 150, medals: 1, feat: { kind: 'finals', target: 4, text: 'Reach the finals 4 times' } },
    { season: 9, name: 'Trophy Shelf', coins: 300, tp: 200, medals: 1, feat: { kind: 'titles', target: 2, text: 'Win 2 league titles' } },
    { season: 12, name: 'Legends Banner Day', coins: 400, tp: 250, medals: 1, feat: { kind: 'league', target: 5, text: 'Reach League 5' } },
  ],
  carry: { legendPct: 60, coachLevel: 2, coachStep: 10 }, // coachStep = min(21, 4 + 3 x level 2): the coach carries at C- at most (SPEC s9 / CONTRACT old->new map)
};

// P11 match pay (SPEC s5) and squad of 8 (SPEC s6, s7). Hand-written: data/season.js is generated and must not carry these.
export const PAY = {
  source: '2026-11-13-training/SPEC.md s5',
  base: 45, win: 15, tie: 7, gapSlope: 0.04, gapMin: 0.5, gapMax: 1.5,
  starTp: 4, starCap: 8,
  bat: [15, 30], // runs for 1 and 2 Stars
  bowl: [1, 2], // wickets for 1 and 2 Stars
  // plain words for the gap, rival six average minus ours (raw 1-99): [upper bound, words]
  notes: [[-6, 'we are much stronger'], [-2, 'we are a little stronger'], [2, 'an even match'], [6, 'rival a little stronger'], [Infinity, 'rival much stronger']],
};
export const SQUAD = {
  source: '2026-11-13-training/SPEC.md s6, s7',
  size: 8, min: 6, startSlots: [0, 1, 2, 3, 4, 5, 8, 9], // slots 1-6 plus 9 and 10
  // WAGE_K 7.0 lives in data/economy.js (wageOf); not repeated here.
  fullText: 'Squad full: release one first',
};
/** s1 squad skew + squad 9 (2026-11-14-squad-skew/SPEC.md, M vrf 03:44-03:47). New games only: s.rules = { squadSkew: 1, squadMax: 9 }. */
export const SKEW = {
  source: '2026-11-14-squad-skew/SPEC.md',
  opener: { bat: 8, bowl: -8, pot: 16 }, middle: { bat: 0, bowl: 0, pot: 0 }, lower: { bat: -8, bowl: 8, pot: -16 },
  squadMax: 9, squadStart: 8,
  minBowlers: 2, bowlFloor: 50, // NUMBERS default 04:05: at least 2 starters bowl 50+ (bowlPart), else the best of the rest is lifted to 50
  recruitFee: [0, 0, 0, 0, 0], // Coins by league; held at 0 until M's fee card (NUMBERS 04:05)
  recruits: ['Opener', 'Middle', 'Lower'], // season-end list: one of each batting type
};
