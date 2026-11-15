// @ts-check
// Wheel match mode, store side (2026-11-15 wheel-match CONTRACT "Store"). Pure: no Math.random, no Date, no DOM.
// The maths (segments, physics, sampled overs) is in core/wheelmatch.js (ENGINE). This file holds the store rules:
// bowler legality with reasons, the rival boost, Settings / Dev commands and the wheel screen view model.
import { eligibleBowlers, phaseOf } from '../core/match.js';
import { pickBowler } from '../core/ai.js';
import { makeRng } from '../core/rng.js';
import { roarAt } from '../core/matchday.js';
import { MD } from '../data/matchday.js';
import { FLAGS } from '../data/flags.js';
import { DEV_DEFAULTS } from '../data/wheelmatch.js';
import { matchModeOf, devClamp, matchPhys, ctrlOf, wheelOverModel } from '../core/wheelmatch.js';
import { planProblem } from './commands.js';

export { matchModeOf };
/** The running match is a wheel match (mode frozen on the match record; missing = classic). @param {any} s */
export const isWheelMatch = (s) => !!(s && s.mode === 'wheel');
/** Stages where a match runs: Settings changes to the mode wait for the next match. */
export const MATCH_STAGES = ['bowl', 'break', 'chase', 'done'];
export const NEXT_MATCH_TEXT = 'Applies next match';

// ---------------------------------------------------------------- rival boost
/** Wheel mode only: the rival as the engine plays him (+WHEEL_RIVAL_BOOST on bp, bs, spd, bsk, cap 99). The save keeps raw ratings. */
export { boostedRival, rivalBoostOf } from '../core/wheelmatch.js';

// ---------------------------------------------------------------- bowler rule (live pick, plan validator)
const OVERS = 10;
/** The bowler of each over bowled so far in innings 1 (from inn.overs). @param {any} inn */
const historyOf = (inn) => (inn.overs || []).map((o) => o.bowler);

/** A legal completion of the 10-over plan after `hist` (bowler per over so far), or null. Checked by planProblem, the plan screen's validator. @param {number[]} hist @param {number} six */
export function completePlan(hist, six) {
  const cnt = Array(six).fill(0);
  hist.forEach((b) => cnt[b]++);
  const out = hist.slice();
  const go = (last) => {
    const o = out.length;
    if (o === OVERS) return cnt.every((c) => c >= 1);
    const need = cnt.filter((c) => c === 0).length;
    if (need > OVERS - o) return false;
    for (let b = 0; b < six; b++) {
      if (b === last || cnt[b] >= 2) continue;
      cnt[b]++; out.push(b);
      if (go(b)) return true;
      cnt[b]--; out.pop();
    }
    return false;
  };
  if (!go(hist.length ? hist[hist.length - 1] : -1)) return null;
  return planProblem(out) ? null : out;
}

/** Bowler chips for the BOWL OVER screen: {idx, name, role, overs, ok, reason}. reason '' when ok. @param {any} s */
export function bowlerChips(s) {
  const inn = s.inn1, me = s.me.players;
  const el = eligibleBowlers(me, inn.over, inn.last), hist = historyOf(inn);
  return me.map((p, i) => {
    let reason = '';
    if (i === inn.last) reason = 'Bowled last over';
    else if (p.overs >= 2) reason = 'Bowled 2 overs';
    else if (!el.includes(i)) reason = 'Others must bowl first';
    else if (!completePlan([...hist, i], me.length)) reason = 'Leaves no legal plan';
    return { idx: i, name: p.name, role: p.bowl, overs: p.overs, ok: !reason, reason };
  });
}
/** Legal bowler indexes this over. @param {any} s */
export const legalBowlers = (s) => bowlerChips(s).filter((c) => c.ok).map((c) => c.idx);
/** The plan's bowler for this over when legal, else the first legal one (-1 if none). @param {any} s */
export function suggestedBowler(s) {
  const legal = legalBowlers(s);
  if (!legal.length) return -1;
  const planned = s.season && s.plan && Array.isArray(s.plan.overs) ? s.plan.overs[s.inn1.over - 1] : null;
  return legal.includes(planned) ? planned : legal[0];
}
/** The chase: the rival's bowler for this over, deterministic (careless pick, its own stream), known before the spin. @param {any} s */
export function rivalBowler(s) {
  const inn = s.inn2;
  const batters = [s.me.players[inn.crease[0]], s.me.players[inn.crease[1]]];
  return pickBowler(s.rival.players, inn, batters, makeRng(`${s.seed}|chase|${inn.over}`), false);
}

// ---------------------------------------------------------------- Settings and Dev commands
/** SetMatchMode {mode}: ignored while a match runs. @param {any} s @param {any} p */
export function setMatchMode(s, p) {
  const mode = p && p.mode;
  if (mode !== 'classic' && mode !== 'wheel') return s;
  if (MATCH_STAGES.includes(s.stage) || s.matchMode === mode) return s;
  return { ...s, matchMode: mode };
}
/** SetDev {patch}: partial s.dev, clamped. @param {any} s @param {any} p */
export function setDev(s, p) {
  const patch = p && p.patch;
  if (!patch || typeof patch !== 'object') return s;
  const cur = devClamp(s.dev), next = devClamp({ ...cur, ...patch });
  return JSON.stringify(next) === JSON.stringify(s.dev) ? s : { ...s, dev: next };
}
/** DevReset {all?}: matchW0 back to default, or all four tuning keys. Keeps `on`. @param {any} s @param {any} p */
export function devReset(s, p) {
  const cur = devClamp(s.dev);
  const keys = p && p.all ? ['matchW0', 'matchJ', 'matchD', 'otherMult'] : ['matchW0'];
  const next = { ...cur };
  for (const k of keys) next[k] = /** @type {any} */ (DEV_DEFAULTS)[k];
  return JSON.stringify(next) === JSON.stringify(s.dev) ? s : { ...s, dev: next };
}

// ---------------------------------------------------------------- view model
const ovStr = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const scoreOf = (inn) => ({ runs: inn.runs, wk: inn.wk, balls: inn.balls, overs: ovStr(inn.balls) });
/** Expected line. @param {{xr:number, xw:number}} e */
export const expectTextOf = (e) => `Expected: ${e.xr.toFixed(1)} runs, ${e.xw.toFixed(1)} wkts`;
/** Chase line. @param {number} runs @param {number} balls */
export const needTextOf = (runs, balls) => `Need ${runs} off ${balls} ball${balls === 1 ? '' : 's'}`;
/** Runs still needed to win and balls left in the chase. @param {any} s */
export function needOf(s) {
  const inn = s.inn2;
  return { runs: Math.max(0, inn.target + 1 - inn.runs), balls: Math.max(0, OVERS * 6 - inn.balls) };
}
/** Crowd roar chip for this over (known before the spin; ours only). @param {any} s @param {number} overIdx */
function roarChip(s, overIdx) {
  const md = s.match && s.match.md;
  if (!(FLAGS.roar && md && roarAt(md, overIdx))) return null;
  const text = `Crowd roar +${Math.round(MD.ROAR_BOOST * 100)}%`;
  return { on: true, text, aria: text };
}

/** The over model; the engine derives fx, centre, pairing and roar from the state exactly as bowlOver (matchOpts). @param {any} s @param {'bowl'|'bat'} side @param {number} bowler */
export const modelOf = (s, side, bowler, fresh = false) => wheelOverModel(s, side, bowler, fresh ? { fresh: true } : undefined);

/**
 * The wheel screen. null unless a wheel match is in stage bowl or chase.
 * @param {any} s @param {number} [pick] bowler the player is looking at (bowl side); default the suggested bowler
 */
export function wheelMatchVM(s, pick) {
  if (!isWheelMatch(s) || (s.stage !== 'bowl' && s.stage !== 'chase')) return null;
  const bat = s.stage === 'chase', inn = bat ? s.inn2 : s.inn1, side = bat ? 'bat' : 'bowl';
  const bowlers = bat ? [] : bowlerChips(s);
  const suggested = bat ? rivalBowler(s) : suggestedBowler(s);
  const chosen = !bat && Number.isInteger(pick) && bowlers[/** @type {number} */ (pick)] && bowlers[/** @type {number} */ (pick)].ok ? /** @type {number} */ (pick) : suggested;
  const model = chosen >= 0 ? modelOf(s, side, chosen) : null;
  const need = bat ? needOf(s) : null;
  const rb = bat ? s.rival.players[suggested] : null;
  return {
    mode: 'wheel', side, over: inn.over, phase: phaseOf(Math.min(inn.over, OVERS)), score: scoreOf(inn),
    ...(bat ? { target: inn.target + 1, need, needText: needTextOf(need.runs, need.balls), rivalBowler: { idx: suggested, name: rb.name, role: rb.bowl } } : {}),
    expect: model ? model.expect : null, expectText: model ? expectTextOf(model.expect) : '',
    segs: model ? model.segs : [], phys: matchPhys(s), ctrl: ctrlOf(s),
    bowlers, suggested, bowler: chosen,
    autoRestShown: inn.over > 1,
    autoPauseNow: bat && !inn.done && inn.over === OVERS,
    last: s.last, roar: roarChip(s, (bat ? OVERS : 0) + inn.over - 1),
    batNames: (bat ? s.me : s.rival).players.map((p) => p.name), bowlNames: (bat ? s.rival : s.me).players.map((p) => p.name),
  };
}
