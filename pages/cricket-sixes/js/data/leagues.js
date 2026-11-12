// Leagues 1-5. Source: 2026-11-12/data/tuning.json ladder.leagues.list (rival_avg) and ladder.leagues.rival_rating_sd; TP multiplier
// tuning.json training.training_points.tp_league_multiplier = 1 for every league (parts/07-training.md s6).
export const LEAGUES = {
  source: '2026-11-12/data/tuning.json ladder.leagues.list[0..4].rival_avg, ladder.leagues.rival_rating_sd; tp_league_multiplier 1',
  max: 5,
  ratingSd: 8,
  list: [
    { number: 1, ratingMean: 30, tpMultiplier: 1 },
    { number: 2, ratingMean: 38, tpMultiplier: 1 },
    { number: 3, ratingMean: 46, tpMultiplier: 1 },
    { number: 4, ratingMean: 54, tpMultiplier: 1 },
    { number: 5, ratingMean: 62, tpMultiplier: 1 },
  ],
};
/** League row for a league number, clamped to 1..5. @param {number} n */
export const leagueOf = (n) => LEAGUES.list[Math.min(LEAGUES.max, Math.max(1, Math.round(n || 1))) - 1];

// Bridge lever (NUMBERS bridge_lever.json): from run season 2, each weekly drill runs floor(m) + (rng < frac(m)) times and costs no TP.
export const BRIDGE_DRILL_MULT = 1.1; // remove when economy lands
