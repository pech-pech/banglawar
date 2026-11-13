// Z1-Z6 playtest lines: first session and training. Pure: (log data, save state) -> numbers and words. No DOM, no storage, no clock.
// Z1 time to first Start match | Z2 screen where each session ended | Z3 '?' share | Z4 nets runs, effort, focus changes | Z5 unspent TP | Z6 last week's training effect.
// The save's top-level me and rival are the last match's squads; the report calls them lastMatch.
import { DRILLS, TRAIN2 } from '../data/training.js';
import { ECON } from '../data/economy.js';
import { letterOfStep } from '../core/letters.js';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const r1 = (x) => Math.round(x * 10) / 10;
const median = (xs) => { if (!xs.length) return null; const a = xs.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/** Z1 and Z2 from the stored sessions. @param {{sessions?:any[]}} data */
export function sessionStats(data) {
  const ss = (data && data.sessions) || [];
  const firsts = ss.map((s) => s.first).filter((v) => v != null);
  const ends = {}; for (const s of ss) { const k = s.end || 'unknown'; ends[k] = (ends[k] || 0) + 1; }
  return { n: ss.length, started: firsts.length, neverStarted: ss.length - firsts.length, firstMed: firsts.length ? Math.round(median(firsts) / 1000) : null, firstMax: firsts.length ? Math.round(Math.max(...firsts) / 1000) : null, ends };
}

/** Z3 to Z6 and lastMatch from the live save. null when there is no save. @param {any} s */
export function saveOf(s) {
  if (!s || !s.training) return null;
  const mine = (s.clubs || []).find((c) => c.id === 'c0'), squad = (mine && mine.squad) || [];
  const hidden = squad.filter((p) => (p.drillsHere | 0) < DRILLS.revealAfter).length;
  const t = s.training, effort = ['easy', 'normal', 'push'].includes(t.effort) ? t.effort : 'normal', perPlayer = TRAIN2.efforts[effort].cost, pushCost = TRAIN2.efforts.push.cost, weeksDone = Math.max(0, (t.week | 0) - 1), ws = t.weekSummary || null;
  const lm = s.me && s.rival ? lastMatchOf(s) : null;
  const se = s.season || {}, e = s.econ || {}, mineRow = (se.table || []).find((r) => r.id === 'c0'), pos = mineRow ? (se.table || []).indexOf(mineRow) + 1 : null;
  const six = (mine && mine.six ? mine.six : []).map((id) => squad.find((p) => p.id === id)).filter(Boolean);
  const sixMean = six.length ? Math.round(10 * sum(six.map((p) => (p.bp + p.bs + p.spd + p.bsk) / 4)) / six.length) / 10 : null;
  const st = e.stadium | 0, nextGate = ECON.STADIUM_FANS[st + 1] == null ? null : ECON.STADIUM_FANS[st + 1];
  return {
    v: s.v | 0, season: se.n || null, round: se.round || null, rounds: (se.fixtures && se.fixtures.length) || 9, league: se.league || null, // header H1
    rec: mineRow ? { w: mineRow.w | 0, l: mineRow.l | 0, pos, pts: mineRow.pts | 0 } : null,
    gate: { top2: pos != null && pos <= 2, stad: st, fans: e.fans | 0, need: nextGate, built: !e.build }, sixMean, arrears: e.arrears | 0, missed: e.missed | 0, legacy: e.legacy | 0,
    coaches: (s.coaches || []).filter((c) => !c.candidate).map((c) => [letterOfStep(c.step || 1), c.step | 0, Array.isArray(c.strong) ? c.strong.join('+') : '']),
    lastMatch: lm,
    stage: s.stage, week: t.week | 0, tp: t.tp | 0, weeksDone,
    netsThisWeek: t.netsWeek != null && t.netsWeek === t.week ? 1 : 0, effort, focusChanges: t.focusChanges | 0, perPlayer, runCost: perPlayer * squad.length, affordPush: squad.length > 0 && (t.tp | 0) >= pushCost * squad.length, migrated: !!s.migrated, // P0-4: cost per player is TRAIN2.efforts[effort].cost (the nets cost), not DRILLS.costTp
    squad: squad.length, hidden, hiddenShare: squad.length ? Math.round((100 * hidden) / squad.length) : null,
    last: ws ? { week: ws.week, steps: ws.steps != null ? ws.steps | 0 : sum((ws.gains || []).map((g) => g.total | 0)), letters: ws.letters | 0 } : null,
  };
}

/** The last match, from the save's me and rival (renamed lastMatch in the report). */
function lastMatchOf(s) {
  const top = (pl, f) => pl.map((p) => ({ n: p.name, v: f(p) })).sort((a, b) => b.v - a.v)[0];
  const bat = top(s.me.players, (p) => (p.inn && p.inn.r) || 0), bowl = top(s.me.players, (p) => (p.figs && p.figs.w) || 0);
  return { us: s.me.name, them: s.rival.name, result: s.result || null, usRuns: s.inn2 ? s.inn2.runs : null, themRuns: s.inn1 ? s.inn1.runs : null,
    topBat: bat && bat.v ? bat : null, topBowl: bowl && bowl.v ? bowl : null };
}

const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
export const ENDS = { hub: 'club screen', squad: 'pick six', plan: 'over plan', bowl: 'bowling', break: 'innings break', chase: 'batting', done: 'result', train: 'training', week: 'week summary', end: 'season end', coach: 'coach pick', runend: 'run end', semi: 'club screen', final: 'club screen' };

/** Summary lines Z1-Z6 (plain words, no codes). Each returns text or null. @param {any} data stored log @param {any} save saveOf() result or null */
/** Older Z1-Z6 lines (kept for tests and bots; the v2 report no longer prints them, see REPORT-V2 s6). */
export function zLines(data, save) {
  const ss = sessionStats(data), out = [];
  if (ss.n) out.push('Each session ended on: ' + Object.entries(ss.ends).map(([k, v]) => (ENDS[k] || k) + (v > 1 ? ' x' + v : '')).join(', ') + '.');
  if (!save) { out.push('Training: no save in this report, so drills, points and ? share are missing.'); return out; }
  const E = save.effort[0].toUpperCase() + save.effort.slice(1);
  out.push(`? share: ${save.hidden} of ${save.squad} players still show ? (potential grade not known yet), ${save.hiddenShare == null ? '-' : save.hiddenShare + '%'}.`);
  out.push(`Nets runs this week: ${save.netsThisWeek} · Effort: ${E} · Focus changes: ${save.focusChanges}`);
  out.push(`Unspent training points: ${save.tp} now. A Nets run on ${E} costs ${save.perPlayer} per player (${save.runCost} for ${save.squad}); Push ${save.affordPush ? 'is' : 'is not'} affordable now.`);
  if (save.last) out.push(`Last week: +${save.last.steps} steps across the squad, ${save.last.letters} ${save.last.letters === 1 ? 'letter' : 'letters'} gained`);
  const m = save.lastMatch;
  if (m) out.push(`lastMatch (the save's me and rival): ${m.us} vs ${m.them}, ${m.result || 'no result'}${m.usRuns != null ? ', ' + m.usRuns + ' to ' + m.themRuns : ''}` + (m.topBat ? `; top bat ${m.topBat.n} ${m.topBat.v}` : '') + (m.topBowl ? `; top bowler ${m.topBowl.n} ${m.topBowl.v} wickets` : '') + '.');
  return out;
}
