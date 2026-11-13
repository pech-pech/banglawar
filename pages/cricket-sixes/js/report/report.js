// Report text: a short plain-words summary that leads, then a compact JSON data block. Pure: (data, env) -> strings.
// Adding a metric = add one function to LINES (a line of the summary) and, if it needs a new number, one field in aggregate().
// Marks: [sim] from the 400-seed sweep, [guess] our estimate (see bands.js).
import { OVER_COLS } from './metrics.js';
import { BANDS } from './bands.js';
import { FLAG_DEFAULTS } from './build.js';
import { zLines, sessionStats } from './z.js';

export const MAX_MATCH_ROWS = 5;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);
const P = (v) => (v == null ? '-' : v + '%');
const median = (xs) => { if (!xs.length) return null; const a = xs.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const sec = (ms) => (ms == null ? '-' : r1(ms / 1000) + ' s');
const two = (n) => (n < 10 ? '0' : '') + n;
const clock = (t) => { const d = new Date(t); return two(d.getHours()) + ':' + two(d.getMinutes()); };
const switches = (xs) => xs.reduce((a, x, i) => a + (i && x !== xs[i - 1] ? 1 : 0), 0);
const sgn = (n) => (n > 0 ? '+' : '') + r1(n);

/** Numbers for the summary lines, from match records. Finished = has a result. */
export function aggregate(matches) {
  const done = matches.filter((m) => m.res);
  const ov = (side) => matches.flatMap((m) => m.ov.filter((o) => o.s === side));
  const bo = ov('b'), co = ov('c'), all = bo.concat(co);
  const fits = (i) => all.map((o) => o.fit[i]).filter((v) => v != null);
  const cnt = (xs, k) => xs.filter((o) => o === k).length;
  const innings = (m, side) => m.ov.filter((o) => o.s === side);
  const full = (m, side) => innings(m, side).length >= 5; // a rote needs a real run of overs
  const rote = (key, side) => { const inns = matches.filter((m) => full(m, side)); return { n: inns.length, rote: inns.filter((m) => new Set(innings(m, side).map((o) => o[key])).size === 1).length }; };
  const per = (os, key, k) => { const x = os.filter((o) => o[key] === k); return x.length ? r1(sum(x.map((o) => o.r)) / x.length) : null; };
  const offered = bo.filter((o) => o.gm > 0); // overs where a Good matchup was on offer
  const think = all.map((o) => o.th).filter((v) => v != null);
  const waits = all.map((o) => o.pw).filter((v) => v != null);
  const dov = (side) => done.flatMap((m) => m.ov.filter((o) => o.s === side)); // luck lines count finished matches only (a quit match adds nothing)
  const dco = dov('c'), dbo = dov('b');
  const scored = sum(dco.map((o) => o.r)), conc = sum(dbo.map((o) => o.r));
  return {
    n: matches.length, finished: done.length, quit: matches.filter((m) => m.ab).length, live: matches.some((m) => !m.res && !m.ab),
    won: cnt(done.map((m) => m.res), 'won'), lost: cnt(done.map((m) => m.res), 'lost'), tied: cnt(done.map((m) => m.res), 'tied'),
    close: done.filter((m) => m.close).length, blow: done.filter((m) => m.blow).length,
    fA: cnt(bo.map((o) => o.f), 'A'), fP: cnt(bo.map((o) => o.f), 'P'), fSw: sum(matches.map((m) => switches(innings(m, 'b').map((o) => o.f)))),
    iD: cnt(co.map((o) => o.i), 'D'), iR: cnt(co.map((o) => o.i), 'R'), iA: cnt(co.map((o) => o.i), 'A'), iSw: sum(matches.map((m) => switches(innings(m, 'c').map((o) => o.i)))),
    roteF: rote('f', 'b'), roteI: rote('i', 'c'),
    fitF: pct(sum(fits(1)), fits(1).length), fitI: pct(sum(fits(2)), fits(2).length), fitB: pct(sum(fits(0)), fits(0).length),
    goodPick: pct(offered.filter((o) => o.mu === 'G').length, offered.length), goodOffered: offered.length,
    mu: { n: bo.length, G: pct(bo.filter((o) => o.mu === 'G').length, bo.length), P: pct(bo.filter((o) => o.mu === 'P').length, bo.length), O: pct(bo.filter((o) => o.mu === 'G' || o.mu === 'P' ? false : true).length, bo.length) }, // no preview counts as OK, as in the band
    rpoField: { A: per(bo, 'f', 'A'), P: per(bo, 'f', 'P') }, rpoIntent: { D: per(co, 'i', 'D'), R: per(co, 'i', 'R'), A: per(co, 'i', 'A') },
    rpoMu: { G: per(bo, 'mu', 'G'), O: per(bo, 'mu', 'O'), P: per(bo, 'mu', 'P') }, // P2 M9 previewTruth: Good must beat Poor
    thinkMed: median(think), thinkMax: think.length ? Math.max(...think) : null, thinkFast: pct(think.filter((t) => t < 1500).length, think.length),
    why: sum(matches.map((m) => m.why)), whyBy: matches.filter((m) => m.why).map((m) => 'M' + m.id + ' ' + m.why), gloss: matches.reduce((a, m) => { for (const k in m.gl) a[k] = (a[k] || 0) + m.gl[k]; return a; }, {}),
    skips: sum(matches.map((m) => m.sk)), overs: all.length, instant: pct(waits.filter((w) => w < 1000).length, waits.length),
    xScored: r1(sum(dco.map((o) => o.xr))), scored, xConc: r1(sum(dbo.map((o) => o.xr))), conc, xWkLost: r1(sum(dco.map((o) => o.xw))), wkLost: sum(dco.map((o) => o.w)),
    xWkTook: r1(sum(dbo.map((o) => o.xw))), wkTook: sum(dbo.map((o) => o.w)),
    retryFast: pct(done.filter((m) => m.res === 'lost' && m.rt != null && m.rt <= 10000).length, done.filter((m) => m.res === 'lost' && m.rt != null).length),
    seconds: done.length ? Math.round(sum(done.map((m) => (m.t1 - m.t0) / 1000)) / done.length) : null,
  };
}

const luckOf = (m) => { const f = (k) => sum(m.ov.filter((o) => o.s === 'c').map((o) => o[k])); return r1(f('r') - f('xr')); }; // runs scored minus expected, our chase (the band's definition)
const marginTxt = (m) => (m.res === 'won' ? 'Won by ' + m.m.n + (m.m.n === 1 ? ' wicket' : ' wickets') : m.res === 'lost' ? 'Lost by ' + m.m.n + (m.m.n === 1 ? ' run' : ' runs') : 'Tied');

/** Wrap to about 70 characters; continuation lines are indented two spaces. */
export function wrap(text, width = 70) {
  const out = []; let line = '';
  for (const w of String(text).split(' ')) {
    if (line && (line + ' ' + w).length > width) { out.push(line); line = '  ' + w; } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  return out.join('\n');
}
const lines = (...ls) => ls.filter(Boolean).map((l) => wrap(l)).join('\n');

/** CLEAN rule (game-computed): one build, flags at default, no match in progress. Reasons are plain words. */
export function cleanOf(matches, env) {
  const why = [];
  if (new Set(matches.map((m) => m.build)).size > 1) why.push('mixed builds');
  const flags = (env && env.flags) || FLAG_DEFAULTS, bad = Object.keys(FLAG_DEFAULTS).filter((k) => flags[k] !== FLAG_DEFAULTS[k]);
  if (bad.length) why.push('flags changed: ' + bad.join(', '));
  if (matches.some((m) => !m.res && !m.ab)) why.push('match in progress');
  if (env && env.fixedSeed) why.push('fixed seed');
  if (new Set(matches.map((m) => m.seed)).size < matches.length) why.push('repeated seed');
  return { ok: !why.length, why };
}
const WHY_WORDS = (w) => (w === 'mixed builds' ? 'more than one build in this report' : w === 'match in progress' ? 'a match is still being played' : w === 'fixed seed' ? 'the page was opened with a fixed seed, so rolls can repeat' : w === 'repeated seed' ? 'two matches used the same seed' : w.replace('flags changed', 'game settings changed'));
const FEEL_TAG = { q1: 'picks mattered', q2: 'finish', q3: 'knew why', q4: 'ball speed' };
const feelTxt = (m) => Object.entries(m.feel || {}).map(([q, v]) => (v === '-' ? (FEEL_TAG[q] || q) + ' skipped' : (FEEL_TAG[q] || q) + ' ' + v)).join(', ');

// One function per summary line (or small group). Return text (wrapped to about 70 chars) or null to leave it out.
// ctx = { a (aggregate), ms (matches), env, clean }. Say things in plain words: no codes in the summary (the JSON keeps them).
export const LINES = [
  ({ a, env, clean }) => lines(`CRICKET REPORT ${env.build}  CLEAN: ${clean.ok ? 'YES' : 'NO'}  (${a.n} ${a.n === 1 ? 'match' : 'matches'}, ${env.errors} errors)`,
    clean.ok ? 'CLEAN: YES = one build, standard game settings, no match left half-played.' : 'CLEAN: NO because ' + clean.why.map(WHY_WORDS).join('; ') + '.',
    `Taken ${clock(env.now)} | ${env.vp}`),
  ({ a }) => lines(`What you chose (bowling): Attacking field ${a.fA} overs, Defensive field ${a.fP} overs; changed field ${a.fSw} times.`,
    `What you chose (batting): Defend ${a.iD}, Steady ${a.iR}, Attack ${a.iA} overs; changed intent ${a.iSw} times.`,
    `Same choice every over: field in ${a.roteF.rote} of ${a.roteF.n} bowling innings, intent in ${a.roteI.rote} of ${a.roteI.n} batting innings.`,
    `Runs given per over by field: Attacking ${a.rpoField.A ?? '-'}, Defensive ${a.rpoField.P ?? '-'} (bots ${BANDS.rpo.field.A} / ${BANDS.rpo.field.P} [sim]).`,
    `Runs scored per over by intent: Defend ${a.rpoIntent.D ?? '-'}, Steady ${a.rpoIntent.R ?? '-'}, Attack ${a.rpoIntent.A ?? '-'} (bots ${BANDS.rpo.intent.D} / ${BANDS.rpo.intent.R} / ${BANDS.rpo.intent.A} [sim]).`),
  ({ a }) => lines(`Same call as the skilled bot: bowler ${P(a.fitB)}, field ${P(a.fitF)}, intent ${P(a.fitI)}.`,
    `For scale: a bot that slips 1 call in 5 scores ${BANDS.fit.noisy}%; random picks score ${BANDS.fit.random.bowler} / ${BANDS.fit.random.field} / ${BANDS.fit.random.intent}% [sim].`,
    a.mu.n ? `Bowler matchup you picked: Good ${P(a.mu.G)}, OK ${P(a.mu.O)}, Poor ${P(a.mu.P)} (${a.mu.n} overs). Skilled bot ${BANDS.matchup.skilled.join('/')}, random ${BANDS.matchup.random.join('/')} [sim].` : null),
  ({ a }) => lines(`Thinking time per call: median ${sec(a.thinkMed)}, longest ${sec(a.thinkMax)}; under 1.5 s on ${P(a.thinkFast)} of calls.`,
    `Why? opened ${a.why} times${a.whyBy.length ? ' (' + a.whyBy.slice(-MAX_MATCH_ROWS).join(', ') + ')' : ''}.`,
    `Word list "?" opened ${sum(Object.values(a.gloss))} times.`,
    wordsLine(a.gloss)),
  ({ a }) => { const n = a.finished, tot = Math.round(1.28 * 11 * Math.sqrt(n)), wk = r1(1.28 * 1.95 * Math.sqrt(n)), L = BANDS.luckBy, g = (v) => (v > 0 ? '+' : '') + v; // wicket sd 1.95 a match (NUMBERS: p10-p90 -2.6..+2.4 = 2 x 1.28 x sd)
    return lines(`Luck: you scored ${a.scored} runs, expected ${a.xScored}; the rival scored ${a.conc}, expected ${a.xConc} (finished matches only; usual total over ${n} ${n === 1 ? 'match' : 'matches'}: -${tot} to +${tot}${n < 10 ? '; too few matches to call luck' : ''}).`,
      `Wickets: you lost ${a.wkLost} (expected ${a.xWkLost}), you took ${a.wkTook} (expected ${a.xWkTook}); usual wicket luck over ${n} ${n === 1 ? 'match' : 'matches'}: -${wk} to +${wk}.`,
      `In one match, luck in your chase usually lands between ${BANDS.luck[0]} and +${BANDS.luck[1]} runs; after a win ${L.won[0]} to ${g(L.won[1])}, after a loss ${L.lost[0]} to ${g(L.lost[1])} [sim].`); },
  ({ a, ms }) => lines(`Results: won ${a.won}, lost ${a.lost}, tied ${a.tied} of ${a.finished} finished; close finishes ${a.close}, big wins or losses ${a.blow}, quit ${a.quit}.`,
    `Usual range for runs in a match: you ${BANDS.runs.us.join('-')}, rival ${BANDS.runs.them.join('-')} [sim].`) +
    '\n' + ms.slice(-MAX_MATCH_ROWS).map((m) => {
      if (!m.res) return wrap(`M${m.id} ${m.ab ? 'Quit' : 'Still playing'} during ${m.stage} (${m.ov.length} overs, not counted)`);
      return wrap(`M${m.id} ${marginTxt(m)}: you ${m.us}, rival ${m.them}; close finish ${m.close ? 'yes' : 'no'} (decided over ${m.dec}); luck ${sgn(luckOf(m))} runs; ${Math.round((m.t1 - m.t0) / 1000)} s` + (m.rt != null ? `; time on result screen ${sec(m.rt)}` : ''));
    }).join('\n'),
  ({ a }) => lines(`Over panel: Next tapped within 1 s on ${P(a.instant)} of overs; closed early (skipped) ${a.skips} times.` + (a.seconds != null ? ` Average match ${a.seconds} s.` : '')),
  ({ d, env }) => { const z = zLines(d || {}, env.save || null); return z.length ? z.map((l) => wrap(l)).join('\n') : null; },
  ({ ms }) => { const f = ms.filter((m) => Object.keys(m.feel || {}).length); return f.length ? f.slice(-3).map((m) => wrap(`Feel M${m.id}: ${feelTxt(m)}`)).join('\n') : 'Feel: no answers yet'; },
  ({ a, env, clean }) => lines(`Checks: one build ${clean.why.includes('mixed builds') ? 'WARN' : 'OK'} | standard settings ${clean.why.some((w) => w.startsWith('flags')) ? 'WARN' : 'OK'} | not mid-match ${a.live ? 'WARN' : 'OK'} | errors ${env.errors}${env.lastError ? ' (' + env.lastError + ')' : ''}`),
];

// Z1-Z6 are built in z.js (first session, ? share, drills, points, training effect). Still stubs: M0 week plan, coach, balance rule; P2 M3 skillEdge needs 10+ matches
// per side; P2 M10 luckShare needs pre-match ratings; P2 M12 why-cause mix needs whyCause() per ball; P2 M15 autoplay speed-up taps need a panel hook.

export function envOf(env = {}) {
  return { build: env.build || '?', now: env.now || Date.now(), vp: env.vp || '?', errors: env.errors || 0, lastError: env.lastError || '', flags: env.flags, save: env.save || null };
}

/** Short summary text (lines joined by newline). data = the stored log, env = { build, now, vp, errors, flags }. */
/** Per-word open counts, most opened first (ties by name). */
export const wordsOf = (gloss) => Object.entries(gloss || {}).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
/** "Words opened: Burst 3, Line 2 (top 8), +N more"; null when none. */
export function wordsLine(gloss) {
  const w = wordsOf(gloss); if (!w.length) return null;
  const cap = (k) => k.charAt(0).toUpperCase() + k.slice(1), rest = w.slice(8).reduce((n, e) => n + e[1], 0);
  return 'Words opened: ' + w.slice(0, 8).map(([k, v]) => cap(k) + ' ' + v).join(', ') + (rest ? `, +${rest} more` : '') + '.';
}

export function buildSummary(data, env0) {
  const env = envOf(env0), ms = data.matches || [];
  const ctx = { a: aggregate(ms), ms, env, clean: cleanOf(ms, env), d: data };
  return LINES.map((f) => { try { return f(ctx); } catch (e) { return null; } }).filter(Boolean).join('\n');
}

/** Compact JSON for bots and the team: last 5 matches, overs as arrays in the column order given once. */
export function buildData(data, env0) {
  const env = envOf(env0), ms = (data.matches || []).slice(-MAX_MATCH_ROWS);
  const out = { report: 1, build: env.build, at: new Date(env.now).toISOString(), viewport: env.vp, errors: env.errors, flags: env.flags || FLAG_DEFAULTS,
    legend: 'overs rows follow overCols. s b=bowl innings c=chase. mu G/O/P/? Good/OK/Poor/unknown. fit=[bowler,field,intent] vs skilled bot. th think ms, pw panel wait ms, sk closed early',
    overCols: OVER_COLS,
    z: { sessions: sessionStats(data), save: env.save },
    wordsOpened: Object.fromEntries(wordsOf(aggregate(data.matches || []).gloss)),
    matches: ms.map((m) => ({ id: m.id, sid: m.sid, build: m.build, seed: m.seed, vp: m.vp, res: m.res || (m.ab ? 'quit' : 'live'), us: m.us, them: m.them, wkUs: m.wkUs, wkThem: m.wkThem,
      margin: m.m, close: m.close, blow: m.blow, secs: m.t1 ? Math.round((m.t1 - m.t0) / 1000) : null, screenMs: m.scr, why: m.why, gloss: m.gl, skips: m.sk, retryMs: m.rt, feel: m.feel,
      overs: m.ov.map((o) => OVER_COLS.map((k) => o[k])) })) };
  return JSON.stringify(out);
}

export const buildFull = (data, env) => buildSummary(data, env) + '\nFull data (JSON, last ' + Math.min((data.matches || []).length, MAX_MATCH_ROWS) + (((data.matches || []).length === 1) ? ' match' : ' matches') + ') follows.\n\n' + buildData(data, env);
