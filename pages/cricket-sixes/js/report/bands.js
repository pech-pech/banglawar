// Bands for the report. [sim r7] = re-measured 2026-11-13 on the r7 build with bots playing whole seasons (tools/season-bot.mjs playSeason, the engine behind tools/season-sweep.mjs), my league and cup matches only, seeds season-0..season-N (see build/report-p0/BANDS.md for the script and the old vs new table).
//   skilled 5,906 matches (600 seasons), idle / careless / each rote ~2,700 matches (300 seasons each), noisy-skilled 2,925 matches. Season matches include the hidden pairing layer (P4), so every number below is "season" not "step-0".
// [sim r4 step-0] = older numbers measured on single step-0 matches (centre 50, pairing off), kept only where a pinned test or a footer still uses them. [guess] = our estimate.
// [pre-P14] LUCK: "expected" runs are the sum of the per-ball probabilities the engine used (pr.p), and those already include the hidden pairing points (match.js pairPoints). So luck = actual minus expected-with-pairing; it moves with Book/pairing knowledge until P14 lands. The luck bands below are pairing-inclusive and carry this label (LUCK_LABEL).
export const LUCK_LABEL = '[pre-P14]';
export const BANDS = {
  win: { idle: 35, rote: 49, skilled: 59 },                                  // [sim r7] season win % (idle / best rote P/R / skilled), footer only
  runs: { us: [33, 99], them: [44, 110] },                                    // [sim r7] usual range (p10-p90), skilled bot, season matches
  fit: { noisy: '85-90', random: { bowler: 26, field: 50, intent: 33 } },     // [sim r7] % of calls equal to the skilled call (noisy bot 86 / 90 / 87; careless bot 26.5 / 50.1 / 33.4)
  matchup: { skilled: [50, 22, 28], random: [37, 22, 41] },                   // [sim r7] Good/OK/Poor share of bowler picks (OK includes no-preview picks), skilled bot and careless (random) bot
  luck: [-14, 14],                                                            // [sim r7] [pre-P14] p10-p90 of (actual - expected runs, expected includes pairing) in our chase, skilled bot
  luckBy: { won: [-9, 16], lost: [-18, 6] },                                   // [sim r7] [pre-P14] p10-p90 of chase luck by result, season matches, skilled bot, seeds season-*
  rpo: { field: { A: 10.4, P: 9.0 }, intent: { D: 7.7, R: 9.0, A: 10.6 } },   // [sim r7] runs per over, pooled fixed-choice (rote) bots, season matches
};
export const inRange = (v, [lo, hi]) => (v == null ? 'no band' : v < lo ? 'below' : v > hi ? 'above' : 'ok');
