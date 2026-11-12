// Bands for the report, from build/report/bands.json (bot sweep, 2,000 matches per policy, seeds sweep-0..1999; see BANDS.md).
// [sim] = measured with bots. [guess] = our estimate. Only the bands BANDS.md says to show are kept here.
export const BANDS = {
  win: { idle: 42, rote: 48, skilled: 53 },                                  // [sim] win %, footer only
  runs: { us: [34, 96], them: [44, 109] },                                    // [sim] usual range (p10-p90), skilled bot
  fit: { noisy: '85-90', random: { bowler: 27, field: 50, intent: 33 } },     // [sim] % of calls equal to the skilled call
  matchup: { skilled: [50, 31, 19], random: [34, 33, 33] },                   // [sim] Good/OK/Poor share of bowler picks
  luck: [-14, 15],                                                            // [sim] p10-p90 of (actual - expected runs) in our chase, skilled bot
  rpo: { field: { A: 9.5, P: 8.7 }, intent: { D: 7.4, R: 8.7, A: 10.3 } },   // [sim] runs per over, pooled fixed-choice bots
};
export const inRange = (v, [lo, hi]) => (v == null ? 'no band' : v < lo ? 'below' : v > hi ? 'above' : 'ok');
