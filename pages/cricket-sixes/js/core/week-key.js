// @ts-check
// weekKey (coach-weekly SPEC s3/s9, CONTRACT-B s2): season.n x 100 + training.week. Pure. training.week is run-cumulative (never reset per
// season), so keys rise strictly within a run. Re-exported by save-migrate.js.

const int = (x, d) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Math.trunc(Number(x)) : d);

/** @param {number} season @param {number} week */
export const weekKeyOf = (season, week) => int(season, 1) * 100 + int(week, 0);

/** The weekKey of a state (missing season reads 1, as seasonOf; missing week reads 0; never throws). @param {any} s */
export function weekKey(s) {
  const se = s && typeof s === 'object' && s.season && typeof s.season === 'object' ? s.season : {};
  const tr = s && typeof s === 'object' && s.training && typeof s.training === 'object' ? s.training : {};
  return weekKeyOf(se.n, tr.week);
}
