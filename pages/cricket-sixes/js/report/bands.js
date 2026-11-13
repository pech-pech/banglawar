// Bands for the report, from build/report/bands.json (bot sweep, 2,000 matches per policy, seeds sweep-0..1999; see BANDS.md). Re-run 2026-11-12 after FIELD_CENTRE: these are step-0 matches (centre 50), so the numbers are unchanged; season (centre 30) is measured by tools/season-sweep.mjs.
// [sim] = measured with bots. [guess] = our estimate. Only the bands BANDS.md says to show are kept here.
export const BANDS = {
  win: { idle: 44, rote: 50, skilled: 53 },                                  // [sim] win %, footer only
  runs: { us: [28, 96], them: [38, 115] },                                    // [sim] usual range (p10-p90), skilled bot
  fit: { noisy: '85-90', random: { bowler: 26, field: 50, intent: 33 } },     // [sim] % of calls equal to the skilled call
  matchup: { skilled: [52, 30, 18], random: [35, 31, 34] },                   // [sim] Good/OK/Poor share of bowler picks
  luck: [-13, 14],                                                            // [sim] p10-p90 of (actual - expected runs) in our chase, skilled bot
  luckBy: { won: [-9, 18], lost: [-17, 7] },                                   // [sim] p10-p90 of chase luck by result, season L1, 6,000 matches, seeds p14c-*, skilled bot
  rpo: { field: { A: 10.0, P: 9.6 }, intent: { D: 8.0, R: 9.3, A: 10.8 } },   // [sim] runs per over, pooled fixed-choice bots
};
export const inRange = (v, [lo, hi]) => (v == null ? 'no band' : v < lo ? 'below' : v > hi ? 'above' : 'ok');
