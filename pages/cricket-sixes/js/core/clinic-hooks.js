// @ts-check
// Clinic listeners (CONTRACT-B s4): registered at import, like coach-hooks.js. Imported once from install.js (/* INSTALL:T6 */).
import { onHook } from './hooks.js';
import { weekKeyOf } from './week-key.js';
import { CLINIC_DEFAULT } from '../data/save-defaults.js';
import { applyBoost, jackpotRun } from './clinic-boost.js';

const isObj = (/** @type {any} */ x) => !!x && typeof x === 'object' && !Array.isArray(x);

// EndWeek: info = the CLOSING week. Clear the week's data, stamp the new weekKey (season n unchanged here: the season closes elsewhere).
onHook('endWeek', (n, info) => {
  if (!isObj(n.clinic)) n.clinic = structuredClone(CLINIC_DEFAULT);
  const c = n.clinic;
  c.spins = []; c.boost = {}; c.pending = null; c.netsDone = false;
  c.week = weekKeyOf(n.season && n.season.n, n.training && n.training.week); // draft already holds week + 1
});

// Nets ran: spins close, then the boost on the rolled lines, then the jackpot runs.
onHook('netsRun', (n, info) => {
  if (!isObj(n.clinic)) n.clinic = structuredClone(CLINIC_DEFAULT);
  const wk = info && Number.isInteger(info.weekKey) ? info.weekKey : weekKeyOf(n.season && n.season.n, n.training && n.training.week);
  if (n.clinic.week !== wk) { n.clinic.spins = []; n.clinic.boost = {}; n.clinic.pending = null; n.clinic.week = wk; } // stale block: read as default
  n.clinic.netsDone = true;
  applyBoost(n, info && info.lines);
  jackpotRun(n, info);
});
