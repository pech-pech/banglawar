// Coach weekly constants (SPEC s3, s5). Pure data, no DOM, no rng.
export const COACH_JOBS = Object.freeze(['nets', 'match', 'study', 'scout']);
export const XP_NETS = 10;
export const XP_NETS_WEAK = 5;
export const XP_MATCH = 6;
export const XP_WIN_MULT = 2;
export const XP_STUDY = 12;
export const XP_SCOUT = 8;
// XP_PER_STEP[k-1] = XP to go from step k to k+1: 60 + 14k for k 1..17, then 230 x3.
export const XP_PER_STEP = Object.freeze([
  ...Array.from({ length: 17 }, (_, i) => 60 + 14 * (i + 1)),
  230, 230, 230,
]);
export const XP_MAX_STEP = 21;
export const COURSE_MAX_STEP = 19;
export const COURSES_PER_SEASON = 1;
export const SCOUT_NAMES_PER_JOB = 1;
export const SCOUT_NAMES_MAX_SEASON = 2;
