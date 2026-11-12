// Z1-Z6 playtest lines: first session and training. Pure: (log data, save state) -> numbers and words. No DOM, no storage, no clock.
// Z1 time to first Start match | Z2 screen where each session ended | Z3 '?' share | Z4 drills per week | Z5 unspent TP | Z6 last week's training effect.
// The save's top-level me and rival are the last match's squads; the report calls them lastMatch.
import { DRILLS } from '../data/training.js';

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
  const t = s.training, weeksDone = Math.max(0, (t.week | 0) - 1), drills = t.drillCount | 0, ws = t.weekSummary || null;
  const lm = s.me && s.rival ? lastMatchOf(s) : null;
  return {
    stage: s.stage, week: t.week | 0, tp: t.tp | 0, drills, weeksDone, perWeek: weeksDone ? r1(drills / weeksDone) : null,
    drillsThisWeek: Object.keys(t.drilled || {}).length, canDrill: Math.floor((t.tp | 0) / (DRILLS.costTp || 15)), cost: DRILLS.costTp || 15,
    squad: squad.length, hidden, hiddenShare: squad.length ? Math.round((100 * hidden) / squad.length) : null,
    last: ws ? { week: ws.week, gain: sum((ws.gains || []).map((g) => g.total | 0)), drilled: (ws.gains || []).length, reveals: (ws.reveals || []).length } : null,
    lastMatch: lm,
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
const ENDS = { hub: 'club screen', squad: 'pick six', plan: 'over plan', bowl: 'bowling', break: 'innings break', chase: 'batting', done: 'result', train: 'training', week: 'week summary', end: 'season end', coach: 'coach pick', runend: 'run end', semi: 'club screen', final: 'club screen' };

/** Summary lines Z1-Z6 (plain words, no codes). Each returns text or null. @param {any} data stored log @param {any} save saveOf() result or null */
export function zLines(data, save) {
  const ss = sessionStats(data), out = [];
  if (ss.n) {
    out.push(`First session: time from opening the game to Start match: ${ss.firstMed == null ? 'no match started yet' : 'median ' + ss.firstMed + ' s, longest ' + ss.firstMax + ' s'}` + (ss.neverStarted ? `; ${plural(ss.neverStarted, 'session')} never started a match.` : '.'));
    out.push('Each session ended on: ' + Object.entries(ss.ends).map(([k, v]) => (ENDS[k] || k) + (v > 1 ? ' x' + v : '')).join(', ') + '.');
  }
  if (!save) { out.push('Training: no save in this report, so drills, points and ? share are missing.'); return out; }
  out.push(`? share: ${save.hidden} of ${save.squad} players still show ? (potential grade not known yet), ${save.hiddenShare == null ? '-' : save.hiddenShare + '%'}.`);
  out.push(`Drills per week: ${save.perWeek == null ? 'no week finished yet' : save.perWeek + ' on average (' + plural(save.drills, 'drill') + ' in ' + plural(save.weeksDone, 'week') + ')'}; this week ${save.drillsThisWeek} so far.`);
  out.push(`Unspent training points: ${save.tp} now, enough for ${plural(save.canDrill, 'drill')} at ${save.cost} each.`);
  if (save.last) out.push(`Training effect, week ${save.last.week}: ${plural(save.last.drilled, 'player')} drilled, +${save.last.gain} rating points in all, ${plural(save.last.reveals, 'potential grade')} found.`);
  const m = save.lastMatch;
  if (m) out.push(`lastMatch (the save's me and rival): ${m.us} vs ${m.them}, ${m.result || 'no result'}${m.usRuns != null ? ', ' + m.usRuns + ' to ' + m.themRuns : ''}` + (m.topBat ? `; top bat ${m.topBat.n} ${m.topBat.v}` : '') + (m.topBowl ? `; top bowler ${m.topBowl.n} ${m.topBowl.v} wickets` : '') + '.');
  return out;
}
