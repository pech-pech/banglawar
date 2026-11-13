// Build label printed on the report and in every match record. Bump it with each build M plays.
export const BUILD = 'sixes-w1';
/** Tuning sha this build was checked against (NUMBERS bumps it with each tuning fold); js/data/tuning-sha.js holds the folded data's sha. Differ = CLEAN NO. */
export const TUNING_PINNED = '8724ddb6';
/** Flags the report treats as "default"; a change makes the paste CLEAN: NO (L-PV-26). Mirror js/data/flags.js. */
export const FLAG_DEFAULTS = { luckyPad: false, burst: false, rivalGoodShare: 0.7, matchday: false, settled: false, roar: false, activities: false, freePick: false, wheelMeta: false };
