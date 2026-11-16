// @ts-check
// Defaults for the save keys added without a VERSION bump (VERSION stays 7). Wheels SPEC s13, coach-weekly SPEC s9, CONTRACT-A s6.
// Data only. save-migrate.js fills each missing key with a deep clone of these; present values are never overwritten
// (a value of the wrong type is replaced). A null default means "none": any present value is kept, the reader clamps it.

/** `s.wheels`: per-wheel STOP records, Pep ring offset and slot, Scout cards, per-wheel tap stats. Inner maps start empty
 * (absent entry = unspun / offset 0 / regenerated from the season seed / `{n:0,careful:0,early:0,late:0,taps:[]}` via statsOf). */
export const WHEELS_DEFAULT = Object.freeze({ stops: {}, pepRingOffset: {}, pepSlot: {}, scoutCards: {}, stats: {} });

/** `s.clinic`: this week's Clinic data (CONTRACT-B s1). The fill derives three values from the state instead of these placeholders:
 * `week` = weekKey(s), `slots` = MAX_COACHES, `netsDone` = training.netsWeek === training.week. */
export const CLINIC_DEFAULT = Object.freeze({
  week: 0, slots: 0, netsDone: false, pending: null, spins: [], boost: {},
  stats: { slices: { S: 0, M: 0, L: 0, JP: 0 }, boostedGain: 0, jackpotRuns: 0, pointsGross: 0, netGain: 0 },
});

/** New fields merged into the existing `s.scout` record ({n, signed, passed}, training.js), which is kept as it is. */
export const SCOUT_DEFAULT = Object.freeze({ bonusNames: 0, extraThisSeason: 0 });

/** New per-coach fields, merged into each staff coach in `s.coaches`. `jobWeek` = weekKey of `job`, null = none. */
export const COACH_FIELDS_DEFAULT = Object.freeze({ xp: 0, xpTotal: 0, job: 'study', jobWeek: null, stepUpPending: 0, stepsXp: 0, stepsCourse: 0 });

/** `s.report.jobs`: coach-weeks per job, XP paid per job, scout names added, courses cut by the cap (report only, CONTRACT-B s1). */
export const REPORT_JOBS_DEFAULT = Object.freeze({ nets: 0, match: 0, wins: 0, study: 0, scout: 0, away: 0, xp: { nets: 0, match: 0, study: 0, scout: 0 }, scoutNames: 0, courseCut: 0 });
