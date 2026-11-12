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
  carry: { legendPct: 60, coachLevel: 2 },
};
