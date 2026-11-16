#!/usr/bin/env node
// B6.2 parity: coach curve (coach-weekly SPEC s3a, s12). Simulates coach steps over 12 seasons with the REAL pure modules
// (coach-xp payXp/netsXp/matchXp, coach-jobs setJob/jobOf, coach-steps endWeekPay/courseCap/canStartCourse, coach-scout,
// training scoutList/startCoach/stopLanding/carefulTapTime, coach-weekly constants) and compares the mean coach step at
// season end to SPEC s3a (+-0.3 step) and the S+ share of careers. Model of the career (calendar, hire, course pick, job mix)
// is a port of 2026-11-16-coach-weekly/sim/coach_weekly_sim.py, NEW arm (01-COACH-WEEKLY.md s2, s3). No constant is changed here.
// Run: node tools/coach-curve.mjs [careers=200] [--variants] [--seed0=4242]
import { payXp, netsXp, matchXp } from '../js/core/coach-xp.js';
import { setJob, jobOf } from '../js/core/coach-jobs.js';
import { endWeekPay, courseCap, canStartCourse } from '../js/core/coach-steps.js';
import { scoutNameGain, seasonReset } from '../js/core/coach-scout.js';
import { scoutList, startCoach, courseWheel, spinResult, FOCUSES } from '../js/core/training.js';
import { XP_MAX_STEP, COURSES_PER_SEASON, SCOUT_NAMES_MAX_SEASON } from '../js/data/coach-weekly.js';
import { TRAIN2 } from '../js/data/training.js';
import { SEASON } from '../js/data/season.js';
import { makeRng } from '../js/core/rng.js';

const CO = TRAIN2.coach;
// ---- SPEC s3a target (01 s3 NEW avg) and S+ share
const TARGET = [6.5, 8.3, 9.9, 11.7, 13.0, 14.1, 14.4, 14.9, 15.8, 17.2, 17.8, 18.6];
const SPLUS = [0, 0, 0, 0, 0, 0, 0.01, 0.08, 0.25, 0.43, null, null]; // 01 s3 also gives 64% / 81% at 11 / 12 (not a SPEC row)
const SPLUS_01 = [0, 0, 0, 0, 0, 0, 0.01, 0.08, 0.25, 0.43, 0.64, 0.81];
const TOL = 0.3;

// ---- model inputs: live code where it exists, else the sim (01 s2) [EST] values
const M = {
  SEASONS: 12,
  LEAGUE_WEEKS: SEASON.leagueMatches,          // live: 9
  FINALS_W: [0.30, 0.35, 0.35],                // sim: 0 / 1 / 2 finals weeks
  WIN_RATE: 0.55,                              // sim [EST]
  FOCUS_MIX: [['bat', 0.4], ['bowl', 0.4], ['bal', 0.2]], // sim [EST]
  SEASONS_PER_LEAGUE: 2.8,                     // sim [D]
  SLOTS: (league) => (league < 3 ? 2 : 3),     // SPEC COACH_SLOTS: 2 to about season 6, 3 after (sim rule). Live CO.slots = 3 flat
  COURSE_SHARE: [1.0, 0.7, 0.7, 0.7, 1.0, 1.0, 1.0, 1.0, 0.7, 0.7, 0.7, 0.7], // sim [EST], fitted by the designer
  COURSE_TAPPER_CAREFUL: 0.6,                  // sim [EST]: 60% careful, 40% random
  TWO_SLOT_JOB_SHARE: 0.25,                    // sim [EST]: lone idle coach takes Study/Scout instead of Match
  IDLE_STUDY_SHARE: 0.5,                       // sim [EST]: 50% Study, 50% Scout
  HIRE_MARGIN: 2,                              // sim: replace the worst coach when a name is >= 2 steps better
};

// ---- NEW Course ladder (2026-11-16-wheels-like-match SPEC s4, as in the sim's COURSE_SLICES), on the LIVE wheel engine
const LADDER = [[4, 0.12], [1, 0.1043], [3, 0.08], [1, 0.1043], [2, 0.035], [1, 0.1043], [2, 0.035], [1, 0.1043], [1, 0.1043], [1, 0.1043], [1, 0.1043]];
const ladderWheel = { slices: LADDER.map((x) => x[0]), widths: LADDER.map((x) => x[1] * 10), jackpotIndex: 0, phys: { W0: 36, D: 2, J: 1.2, SD: 0.11 } };

// ---- variants (levers / model gaps), all default off
const BASEOPT = { liveSlots: false, simCoursePool: false, liveCourseWheel: false, noMidScout: false };

function wpick(rng, pairs) { let r = rng.random(), a = 0; for (const [k, p] of pairs) { a += p; if (r < a) return k; } return pairs[pairs.length - 1][0]; }
const leagueOf = (s0) => Math.min(5, 1 + Math.floor(s0 / M.SEASONS_PER_LEAGUE));
const coachRow = (c, id) => ({ id, name: c.name || id, step: c.step, strong: c.strong.slice(), away: 0, courseSeason: null, xp: 0, xpTotal: 0, job: 'study' });

function courseGain(rng, opt, careful) {
  if (opt.liveCourseWheel) return spinResult(rng, courseWheel(), careful).gain; // live wheel today: +1 x5, +2 x4, +3 jackpot
  return spinResult(rng, ladderWheel, careful).gain;
}

function signBest(st, cands, slots, idGen) {
  for (const cd of cands.slice().sort((a, b) => b.step - a.step)) {
    if (st.coaches.length < slots) { st.coaches.push(coachRow(cd, idGen())); continue; }
    let worst = st.coaches[0]; for (const c of st.coaches) if (c.step < worst.step) worst = c;
    if (cd.step >= worst.step + M.HIRE_MARGIN) { st.coaches.splice(st.coaches.indexOf(worst), 1, coachRow(cd, idGen())); } // release worst (XP lost), sign
  }
}

function career(seed, opt) {
  const rng = makeRng(`coach-curve|${seed}`);
  let nid = 0; const idGen = () => `k${++nid}`;
  const st = { seed: `cc${seed}`, coaches: [coachRow(startCoach('k0', 'Start'), 'k0')], training: {}, clinic: {}, scout: {}, report: {}, season: { n: 1, league: 1 } };
  const out = [];
  for (let s0 = 0; s0 < M.SEASONS; s0++) {
    const league = leagueOf(s0), slots = opt.liveSlots ? CO.slots : M.SLOTS(league);
    st.season = { n: s0 + 1, league }; st.clinic.slots = slots; st.scout = { ...st.scout, n: undefined };
    const W = M.LEAGUE_WEEKS + wpick(rng, M.FINALS_W.map((p, i) => [i, p]));
    signBest(st, scoutList(st), slots, idGen); // live scout list (CO.scoutSize / scoutCentre / scoutSpread)
    // 1 course a season, club wide (COURSES_PER_SEASON); best coach with COURSE_SHARE, else a random other
    const courseWeek = new Map();
    for (let k = 0; k < Math.min(COURSES_PER_SEASON, st.coaches.length); k++) {
      const order = st.coaches.slice().sort((a, b) => b.step - a.step);
      const pool = order.filter((c) => !courseWeek.has(c.id) && (opt.simCoursePool ? c.step < XP_MAX_STEP : canStartCourse(c).ok));
      if (!pool.length) break;
      const t = rng.random() < M.COURSE_SHARE[s0] || pool.length === 1 ? pool[0] : pool[1 + Math.floor(rng.random() * (pool.length - 1))];
      courseWeek.set(t.id, Math.floor(rng.random() * W));
    }
    let extraFound = 0;
    for (let w = 0; w < W; w++) {
      const focus = wpick(rng, M.FOCUS_MIX), won = rng.random() < M.WIN_RATE;
      for (const c of st.coaches) c.away = courseWeek.get(c.id) === w ? 1 : 0;
      const home = st.coaches.filter((c) => !c.away);
      const best = (xs) => xs.reduce((b, c) => (b && b.step >= c.step ? b : c), null);
      const nets = best(home.filter((c) => c.strong.includes(focus))) || best(home);
      st.training = { focus, coach_id: nets ? nets.id : null, last_plan: { focus, effort: 'normal', coachId: nets ? nets.id : null } };
      // jobs: idle coaches sorted by step; first is Match coach (2-slot: 25% take Study/Scout instead), rest Study/Scout 50/50
      const idle = home.filter((c) => c !== nets).sort((a, b) => b.step - a.step);
      let mc = idle[0] || null, rest = idle.slice(1);
      if (idle.length === 1 && slots < 3 && rng.random() < M.TWO_SLOT_JOB_SHARE) { rest = [mc]; mc = null; }
      let n = st;
      if (mc) { n.training.matchCoachId = mc.id; n = setJob(n, mc.id, 'match'); }
      for (const c of rest) n = setJob(n, c.id, rng.random() < M.IDLE_STUDY_SHARE ? 'study' : 'scout');
      Object.assign(st, n);
      // week order: match, nets, EndWeek (SPEC s4)
      const mcNow = st.coaches.find((c) => !c.away && jobOf(st, c.id) === 'match');
      if (mcNow) payXp(st, mcNow.id, matchXp(won), 'match');
      if (nets) payXp(st, nets.id, netsXp(st, nets.id), 'nets');
      const { paid } = endWeekPay(st, { week: w + 1, weekKey: (s0 + 1) * 100 + w + 1 });
      for (const p of paid) {
        if (p.job !== 'scout' || scoutNameGain(st, p.coachId) <= 0 || opt.noMidScout) continue;
        // sim: the extra name joins the list at once (live: queued for the next list, dropped at season end)
        if (extraFound < SCOUT_NAMES_MAX_SEASON) {
          extraFound++;
          const cs = Math.max(1, Math.min(CO.maxStep, CO.scoutCentre[league - 1] + Math.floor(rng.random() * (2 * CO.scoutSpread + 1)) - CO.scoutSpread));
          const strong = rng.shuffle(FOCUSES.slice()).slice(0, 1 + Math.floor(rng.random() * 2));
          signBest(st, [{ step: cs, strong }], slots, idGen);
        }
      }
      // course result at the end of the away week (sim order); cap via courseCap (COURSE_MAX_STEP 19)
      for (const c of st.coaches) if (c.away) {
        const g = courseGain(rng, opt, rng.random() < M.COURSE_TAPPER_CAREFUL);
        c.step = opt.liveCourseWheel ? Math.min(XP_MAX_STEP, c.step + g) : courseCap(c.step, g).to;
        if (c.step >= XP_MAX_STEP) c.xp = 0;
        c.courseSeason = s0 + 1; c.away = 0;
      }
    }
    seasonReset(st);
    const steps = st.coaches.map((c) => c.step);
    out.push({ avg: steps.reduce((a, b) => a + b, 0) / steps.length, best: Math.max(...steps), splus: steps.some((x) => x >= XP_MAX_STEP) });
  }
  return out;
}

function run(n, seed0, opt) {
  const res = []; for (let i = 0; i < n; i++) res.push(career(seed0 + i, opt));
  return Array.from({ length: M.SEASONS }, (_, s) => {
    const xs = res.map((r) => r[s].avg), m = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
    return { avg: m, se: sd / Math.sqrt(n), best: res.reduce((a, r) => a + r[s].best, 0) / n, splus: res.filter((r) => r[s].splus).length / n };
  });
}

function ladderMeans(N = 20000) {
  const r = makeRng('ladder'); let a = 0, b = 0;
  for (let i = 0; i < N; i++) { a += spinResult(r, ladderWheel, false).gain; b += spinResult(r, ladderWheel, true).gain; }
  return { random: a / N, careful: b / N };
}

const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), pct = (x) => `${Math.round(100 * x)}%`;
function table(rows, label) {
  const lines = [`${label}`, '| Season | target | sim mean | SE | diff | in +-0.3 | S+ target | S+ sim | best |', '|---|---|---|---|---|---|---|---|---|'];
  rows.forEach((r, i) => {
    const d = r.avg - TARGET[i];
    lines.push(`| ${i + 1} | ${f1(TARGET[i])} | ${f2(r.avg)} | ${f2(r.se)} | ${d >= 0 ? '+' : ''}${f2(d)} | ${Math.abs(d) <= TOL ? 'yes' : 'NO'} | ${SPLUS[i] == null ? `(${pct(SPLUS_01[i])})` : pct(SPLUS[i])} | ${pct(r.splus)} | ${f1(r.best)} |`);
  });
  const miss = rows.filter((r, i) => Math.abs(r.avg - TARGET[i]) > TOL).length;
  return { text: lines.join('\n'), miss };
}

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)) || 200);
const seed0 = Number((args.find((a) => a.startsWith('--seed0=')) || '--seed0=4242').split('=')[1]);
const lm = ladderMeans();
console.log(`coach-curve: ${N} careers x ${M.SEASONS} seasons, seeds ${seed0}..${seed0 + N - 1}. Course ladder on live engine: random ${f2(lm.random)}, careful ${f2(lm.careful)} steps (spec 1.59 / 2.21)`);
const main = table(run(N, seed0, BASEOPT), 'MAIN (real modules + sim career model, real canStartCourse/courseCap)');
console.log(main.text); console.log(`rows out of tolerance: ${main.miss} / 12`);
if (args.includes('--variants')) {
  for (const [k, lab] of [['simCoursePool', 'V1 sim course pool (any coach < S+ may start; course cut at 19)'], ['liveSlots', 'V2 live slots: 3 every season (CO.slots)'],
    ['noMidScout', 'V3 live scout queue: Scout names never reach a list mid-season'], ['liveCourseWheel', 'V4 live course wheel today (+1/+2/+3, cap S+, no 19 cap)']]) {
    const t = table(run(N, seed0, { ...BASEOPT, [k]: true }), lab); console.log('\n' + t.text); console.log(`rows out of tolerance: ${t.miss} / 12`);
  }
}
