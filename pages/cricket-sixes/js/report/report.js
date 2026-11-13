// Report v2 text (r9): header H + sections T M E C S F, each with 1-3 plain lines and one machine line, then a JSON block. Pure: (data, env) -> strings.
// Every line serves a design question (Q1-Q8, see REPORT-V2-SPEC); the section title names them. Records may lack any r9 field: every read tolerates that.
// Marks: [sim] from the 400-seed sweep, [guess] our estimate (see bands.js).
import { avoidablePoor } from './metrics.js';
import { BANDS, LUCK_LABEL } from './bands.js';
import { FLAG_DEFAULTS } from './build.js';
import { zLines } from './z.js';

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
    mu: { n: bo.length, G: pct(bo.filter((o) => o.mu === 'G').length, bo.length), P: pct(bo.filter((o) => o.mu === 'P').length, bo.length), O: pct(bo.filter((o) => o.mu === 'O').length, bo.length), U: pct(bo.filter((o) => o.mu !== 'G' && o.mu !== 'O' && o.mu !== 'P').length, bo.length) }, // P0-10: no preview (U) is its own bucket, not OK
    rpoField: { A: per(bo, 'f', 'A'), P: per(bo, 'f', 'P') }, rpoIntent: { D: per(co, 'i', 'D'), R: per(co, 'i', 'R'), A: per(co, 'i', 'A') },
    rpoMu: { G: per(bo, 'mu', 'G'), O: per(bo, 'mu', 'O'), P: per(bo, 'mu', 'P') }, // P2 M9 previewTruth: Good must beat Poor
    thinkMed: median(think), thinkMax: think.length ? Math.max(...think) : null, thinkFast: pct(think.filter((t) => t < 1500).length, think.length),
    why: sum(matches.map((m) => m.why)), whyBy: matches.filter((m) => m.why).map((m) => 'M' + m.id + ' ' + m.why), gloss: matches.reduce((a, m) => { for (const k in (m.gl || {})) a[k] = (a[k] || 0) + m.gl[k]; return a; }, {}),
    skips: sum(matches.map((m) => m.sk)), overs: all.length, instant: pct(waits.filter((w) => w < 1000).length, waits.length),
    xScored: r1(sum(dco.map((o) => o.xr))), scored, xConc: r1(sum(dbo.map((o) => o.xr))), conc, xWkLost: r1(sum(dco.map((o) => o.xw))), wkLost: sum(dco.map((o) => o.w)),
    xWkTook: r1(sum(dbo.map((o) => o.xw))), wkTook: sum(dbo.map((o) => o.w)),
    seconds: done.length ? Math.round(sum(done.map((m) => (m.t1 - m.t0) / 1000)) / done.length) : null,
  };
}

const luckOf = (m) => { const f = (k) => sum(m.ov.filter((o) => o.s === 'c').map((o) => o[k])); return r1(f('r') - f('xr')); }; // runs scored minus expected, our chase (the band's definition)

/** Wrap to about 70 characters; continuation lines are indented two spaces. (Kept for callers; the v2 report prints one line per fact.) */
export function wrap(text, width = 70) {
  const out = []; let line = '';
  for (const w of String(text).split(' ')) {
    if (line && (line + ' ' + w).length > width) { out.push(line); line = '  ' + w; } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  return out.join('\n');
}

/** The five r9 features are a player switch (M 18:37): they are a build KIND (features on/off), never "flags changed". */
export const FEATURE_FLAGS = ['matchday', 'settled', 'roar', 'activities', 'freePick'];
const featOn = (m) => Array.isArray(m.fl) && m.fl.some((n) => FEATURE_FLAGS.includes(n));
const bOf = (r) => r.b || r.build;

/** CLEAN rule (game-computed). `matches` = the window's records of every build (P0-3); other builds only add "mixed builds".
 *  env: build, flags, features, fixedSeed, errors, tuningSha + tuningPinned, trimmed, save.migrated. Empty window = NO. */
export function cleanOf(matches, env) {
  const why = [], e = env || {};
  const cur = e.build && e.build !== '?' ? matches.filter((m) => m.build === e.build) : matches;
  if (new Set(matches.map((m) => m.build)).size > 1 || cur.length < matches.length) why.push('mixed builds');
  if (!cur.length) why.push('no match played');
  if (e.tuningSha && e.tuningPinned && e.tuningSha !== e.tuningPinned) why.push('tuning changed');
  const flags = e.flags || FLAG_DEFAULTS, bad = Object.keys(FLAG_DEFAULTS).filter((k) => !FEATURE_FLAGS.includes(k) && (flags[k] ?? FLAG_DEFAULTS[k]) !== FLAG_DEFAULTS[k]); // features are a kind, not a flag change
  if (bad.length) why.push('flags changed: ' + bad.join(', '));
  if (cur.some((m) => !m.res && !m.ab)) why.push('match in progress');
  if (e.errors > 0) why.push('errors');
  if (e.fixedSeed) why.push('fixed seed');
  if (new Set(cur.map((m) => m.seed)).size < cur.length) why.push('repeated seed');
  if (e.migrated || (e.save && e.save.migrated)) why.push('migrated save');
  if (e.trimmed) why.push('trimmed');
  const kinds = new Set(cur.filter((m) => Array.isArray(m.fl)).map((m) => (featOn(m) ? 1 : 0)));
  if (kinds.size > 1) why.push('features switched');
  return { ok: !why.length, why };
}

export function envOf(env = {}, data = null) {
  return { trimmed: !!(env.trimmed || (data && data.trimmed)), fixedSeed: !!env.fixedSeed, tuningSha: env.tuningSha, tuningPinned: env.tuningPinned, migrated: !!env.migrated, build: env.build || '?', now: env.now || Date.now(), vp: env.vp || '?', errors: env.errors || 0, lastError: env.lastError || '', flags: env.flags, features: env.features, win: env.win, rid: env.rid, save: env.save || null };
}

/** Per-word open counts, most opened first (ties by name). */
export const wordsOf = (gloss) => Object.entries(gloss || {}).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
/** "Words opened: Burst 3, Line 2 (top 8), +N more"; null when none. */
export function wordsLine(gloss) {
  const w = wordsOf(gloss); if (!w.length) return null;
  const cap = (k) => k.charAt(0).toUpperCase() + k.slice(1), rest = w.slice(8).reduce((n, e) => n + e[1], 0);
  return 'Words opened: ' + w.slice(0, 8).map(([k, v]) => cap(k) + ' ' + v).join(', ') + (rest ? `, +${rest} more` : '') + '.';
}

/** The report window [W]: records after the marker, of the running build; other builds counted as dropped (W3/W4). Matches of every build in range kept as `range` for CLEAN. */
export function windowOf(data, env) {
  if (env.win && Array.isArray(env.win.matches)) { // RPT-LOG window (hooks env.win): already after the marker and of the running build
    const W = env.win, dr = W.dropped ? Array.from({ length: W.dropped.n }, () => ({ build: W.dropped.build, res: 'won', seed: null })) : [];
    return { range: W.matches.concat(dr), ms: W.matches, nets: W.nets || [], spins: W.spins || [], buys: W.buys || [], weeks: W.weeks || [], feel: W.feel || [], since: W.since || null, dropped: W.dropped || null, rid: env.rid || ((data.rid | 0) + 1) };
  }
  const mk = data.marker || null, seq = mk ? mk.matchSeq | 0 : 0, ev = mk ? mk.evSeq | 0 : 0, at = mk ? mk.atMs | 0 : 0;
  const okB = (r) => env.build === '?' || !bOf(r) || bOf(r) === env.build;
  const after = (r) => (r.q != null && mk && mk.evSeq != null ? r.q > ev : (r.t || r.t1 || 0) > at || !mk);
  const range = (data.matches || []).filter((m) => m.id > seq);
  const list = (k) => (data[k] || []).filter((r) => okB(r) && after(r));
  const other = range.filter((m) => !okB(m));
  const dropped = other.length ? { n: other.length, build: bOf(other[other.length - 1]) } : null;
  return { range, ms: range.filter(okB), nets: list('nets'), spins: list('spins'), buys: list('buys'), weeks: list('weeks'), feel: list('feelLog'), since: mk ? { rid: mk.rid | 0, atMs: at } : null, dropped, rid: env.rid || ((data.rid | 0) + 1) };
}

// ---- string helpers for the machine lines and JSON ----
const EFF = { easy: 'E', normal: 'N', push: 'P' }, FOC = { bat: 'Bt', bowl: 'Bw', bal: 'Ba' };
const cnt = (xs, f) => xs.filter(f).length;
const verdict = (watch) => (watch ? 'WATCH' : 'OK');
const utc = (t) => (Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : '1970-01-01T00:00').slice(5, 16).replace('T', ' ') + 'Z';
const bowlOvs = (m) => (m.ov || []).filter((o) => o.s === 'b'), chaseOvs = (m) => (m.ov || []).filter((o) => o.s === 'c');
const str = (os, k) => os.map((o) => o[k] || '-').join('');
const closeBand = ' [sim r7: ' + BANDS.close.skilled + '% of matches]';
const fitOf = (m) => { const v = (m.ov || []).flatMap((o) => o.fit || []).filter((x) => x != null); return v.length ? pct(sum(v), v.length) : null; };
const thinkOf = (m) => { const v = (m.ov || []).map((o) => o.th).filter((x) => x != null); const md = median(v); return md == null ? null : r1(md / 1000); };
const avoidOf = (os) => { const v = os.map(avoidablePoor).filter((x) => x != null); return { n: v.length, bad: sum(v) }; };

// ---- sections: each returns { key, title, h: human lines, m: machine line, j: json part, short: one line } or null when it has no data ----
function secT(w, env) {
  const R = w.nets, S = w.spins, W = w.weeks;
  const title = 'TRAINING [W] Q1 Q5';
  if (!R.length && !S.length && !W.length) return { key: 'T', title, h: ['none in window'], m: 't:none', j: {}, short: 'TRAINING none in window' };
  const eff = (e) => cnt(R, (r) => r.eff === e), foc = (f) => cnt(R, (r) => r.foc === f), co = cnt(R, (r) => r.co);
  const rolls = (e) => [0, 1, 2].map((i) => sum(R.filter((r) => r.eff === e).map((r) => (r.r || [])[i] | 0)));
  const rn = rolls('normal'), rp = rolls('push'), cant = sum(R.map((r) => r.cant | 0));
  const nr = sum(rn) + sum(rp);
  const h = [`${R.length} nets runs: Easy ${eff('easy')} / Normal ${eff('normal')} / Push ${eff('push')}. Focus Bal ${foc('bal')}, Bat ${foc('bat')}, Bowl ${foc('bowl')}. Coach used ${co}.`];
  // WATCH: 3+ runs in a row on one focus with cant_gain > 2
  let streak = 0, best = 0, prev = null; for (const r of R) { if (r.foc === prev && (r.cant | 0) > 2) streak++; else streak = (r.cant | 0) > 2 ? 1 : 0; prev = r.foc; best = Math.max(best, streak); }
  h[0] += ' ' + verdict(best >= 3);
  h.push(`Rolls Okay/Good/Great: Normal ${rn.join('/')}, Push ${rp.join('/')}. ${cant} could not gain.${nr < 20 ? ' n small' : ''}  [sim N 60/30/10, P 30/40/30]`);
  const gains = R.map((r) => r.gain).filter((x) => x != null), pl = (env.save && env.save.squad) || 8;
  if (gains.length) h.push(`Six gain ${r1(sum(gains) / gains.length / pl)} pts/player/run (internal) [sim ~1.5 at Normal].`);
  const tpIn = sum(W.map((x) => x.tpIn | 0)), tpOut = sum(R.map((r) => Math.max(0, (r.tp0 | 0) - (r.tp1 | 0)))), pool = W.length ? W[W.length - 1].tpEnd : (R.length ? R[R.length - 1].tp1 : null);
  const over100 = cnt(W, (x) => x.tpEnd > 100), aff = cnt(W, (x) => x.aff), hint = cnt(W, (x) => x.hint);
  if (W.length || R.length) h.push(`TP spent ${tpOut}, pool ${pool == null ? '-' : pool}. Push affordable ${aff} of ${W.length} weeks. Pool over 100: ${over100} of ${W.length}. Locked hint shown ${hint}. ${verdict(over100 > 2)}`);
  const sp = { n: S.length, st: ['c', 'e', 'l', 'o'].map((k) => cnt(S, (x) => x.bk === k)), jp: cnt(S, (x) => x.jp) };
  const cg = S.filter((x) => x.careful).map((x) => x.g), og = S.filter((x) => !x.careful).map((x) => x.g);
  const gx = cg.length && og.length && sum(og) ? r1((sum(cg) / cg.length) / (sum(og) / og.length)) : null, jpPct = pct(sp.jp, sp.n);
  if (S.length) h.push(`Wheel: ${S.length} spins. Stops careful ${sp.st[0]} / early ${sp.st[1]} / late ${sp.st[2]} / coast ${sp.st[3]}. Careful gain ${gx == null ? '-' : gx + 'x of other'}. Jackpot ${jpPct}%.${S.length < 20 ? ' n small' : ' ' + verdict((gx != null && (gx < 1.3 || gx > 1.7)) || jpPct > 25)} [sim careful 1.5x, random 1.3x]`);
  const stops = S.map((x) => (x.ms == null ? null : r1(x.ms / 1000)));
  const m = ['t:' + R.length, [eff('easy'), eff('normal'), eff('push')].join(','), [foc('bal'), foc('bat'), foc('bowl')].join(','), rn.join(',') + ';' + rp.join(','), cant, tpOut, pool, [aff, W.length].join('/'), sp.st.join(','), sp.jp].join('|');
  const j = { runs: R.map((r) => [EFF[r.eff] || '?', FOC[r.foc] || '?', r.co ? 1 : 0, r.r || [0, 0, 0], r.cant | 0, null, r.gain == null ? null : r.gain]), wk: W.map((x) => [x.tpEnd, x.aff ? 1 : 0, x.hint ? 1 : 0]), tpIn, tpOut, pool, nodes: 0, wh: { n: sp.n, st: sp.st, jp: sp.jp, gx, stops } };
  return { key: 'T', title, h, m, j, short: `TRAINING ${R.length} nets runs (N${eff('normal')} P${eff('push')}), ${S.length} spins, pool ${pool == null ? '-' : pool} TP` };
}

const resLetter = (m) => (m.ab ? 'quit' : m.res === 'won' ? 'W' : m.res === 'lost' ? 'L' : 'T');
function matchRow(m) {
  const b = bowlOvs(m), c = chaseOvs(m);
  const f = (k) => b.filter((o) => o.f === k).length, i = (k) => c.filter((o) => o.i === k).length;
  const att = c.filter((o) => o.i === 'A'), early = att.filter((o) => o.o <= 7).length;
  const mu = (k) => b.filter((o) => o.mu === k).length, mg = m.res ? (m.res === 'won' ? m.m.n + 'wk' : m.res === 'lost' ? m.m.n + 'runs' : '0') : '';
  const av = avoidOf(b), fit = fitOf(m), th = thinkOf(m), fsw = switches(b.map((o) => o.f)), isw = switches(c.map((o) => o.i));
  const L = m.res ? `luck ${sgn(luckOf(m))} ${LUCK_LABEL}` : 'luck -';
  const txt = `M${m.id} ${m.k || '?'} ${resLetter(m)} ${m.us ?? '-'}-${m.them ?? '-'}${mg ? ' by ' + mg : ''} | field A${f('A')} P${f('P')} sw${fsw} | intent D${i('D')} R${i('R')} A${i('A')} sw${isw} | att early ${early}/7 | att wkts ${sum(att.map((o) => o.w | 0))} in ${att.length} ov | pick G${mu('G')} O${mu('O')} P${mu('P')} U${b.length - mu('G') - mu('O') - mu('P')} | fit ${fit == null ? '-' : fit + '%'} | ${L}${th == null ? '' : ' | think ' + th + ' s'}${m.touched != null ? ' | touched ' + m.touched + '/10' : ''}${m.m && m.res && m.dec != null ? ' | decided over ' + m.dec : ''}`;
  const rb = b.map((o) => o.r | 0), rc = c.map((o) => o.r | 0);
  const j = { id: m.id, k: m.k || null, r: m.r ?? null, res: resLetter(m), us: m.us ?? null, th: m.them ?? null, mg: m.m ? [m.m.k, m.m.n] : null, f: str(b, 'f'), fs: fsw, i: str(c, 'i'), is: isw, g: str(b, 'mu'), gx: av.bad, wc: sum(att.map((o) => o.w | 0)), tc: att.length, fit, rb, rc, lk: m.res ? luckOf(m) : null, tk: th, cn: m.touched ?? null, dec: m.dec ?? null };
  if (m.md) j.md = m.md; if (Array.isArray(m.settled)) j.st = m.settled.length;
  return { txt, j };
}

function secM(w) {
  const title = 'MATCH CALLS [W] Q2';
  const rows = w.ms.filter((m) => m.res || m.ab);
  if (!rows.length) return { key: 'M', title, h: ['none in window'], m: 'm:none', j: [], old: null, short: 'MATCH none in window' };
  const shown = rows.slice(-3), older = rows.slice(0, -3);
  const old = older.length ? { n: older.length, W: cnt(older, (m) => m.res === 'won'), L: cnt(older, (m) => m.res === 'lost'), T: cnt(older, (m) => m.res === 'tied') } : null;
  const h = []; if (old) h.push(`and ${old.n} earlier: ${old.W}W ${old.L}L${old.T ? ' ' + old.T + 'T' : ''}`);
  const rr = shown.map(matchRow); for (const r of rr) h.push(r.txt);
  const nRows = rr.length + (old ? 1 : 0);
  const fin = rows.filter((m) => m.res), a = aggregate(w.ms), cb = ov(rows);
  const attAll = rows.flatMap((m) => chaseOvs(m).filter((o) => o.i === 'A')), cOv = rows.flatMap(chaseOvs);
  const attEarly = cOv.filter((o) => o.i === 'A' && o.o <= 7).length, attShare = pct(attEarly, cOv.length);
  const awk = attAll.length ? r1(sum(attAll.map((o) => o.w | 0)) / attAll.length) : null;
  const sameF = a.roteF.n >= 3 || a.n >= 3 ? a.roteF.n && a.roteF.rote / a.roteF.n >= 0.9 : false;
  const av = avoidOf(rows.flatMap(bowlOvs)), avPct = pct(av.bad, av.n);
  const weak = rows.flatMap(bowlOvs).filter((o) => o.o <= 3 && o.mu === 'P'), weakKept = pct(weak.length, rows.flatMap(bowlOvs).filter((o) => o.o <= 3).length);
  h.push(`Calls: Attack in overs 1-7 ${P(attShare)} of batting overs. Attack wkts/over ${awk ?? '-'}. Same field 90%+: ${sameF ? 'yes' : 'no'}. Weak pick kept in overs 1-3: ${P(weakKept)}. ${fin.length < 3 ? 'n small' : verdict((attShare != null && attShare > 33) || sameF || (weakKept != null && weakKept > 50))} [sim 0.8 wkts per Attack over]`);
  h.push(`Matchup picks Good ${P(a.mu.G)}, OK ${P(a.mu.O)}, Poor ${P(a.mu.P)}, no preview ${P(a.mu.U)} [sim r7 season: ${BANDS.matchup.skilled.join('/')} skilled, ${BANDS.matchup.random.join('/')} random]. Avoidable Poor in overs 1-7: ${P(avPct)}${av.n ? ' of ' + av.n : ''} (skilled ${BANDS.avoidablePoor.skilled}%, random ${BANDS.avoidablePoor.random}% [sim r7]).`);
  if (fin.length) {
    const near = (v, r) => v != null && Math.abs(v - r) <= 10, ft = [['bowler', a.fitB], ['field', a.fitF], ['intent', a.fitI]].filter(([k, v]) => near(v, BANDS.fit.random[k])).map(([k]) => k);
    h.push(`Close finishes ${cnt(fin, (m) => m.close)} of ${fin.length}${closeBand}. Fit with skilled bot ${P(a.fitB)}/${P(a.fitF)}/${P(a.fitI)}${ft.length ? ': near random for ' + ft.join(', ') + ' (field choice not readable?)' : ''}.`);
  }
  if (fin.length) { const L = BANDS.luckBy, g = (v) => (v > 0 ? '+' : '') + v; h.push(`Luck ${LUCK_LABEL}: scored ${a.scored} vs exp ${a.xScored}, rival ${a.conc} vs ${a.xConc}; wkts lost ${a.wkLost} vs ${a.xWkLost}, taken ${a.wkTook} vs ${a.xWkTook}. Per match win ${L.won[0]}..${g(L.won[1])}, loss ${L.lost[0]}..${g(L.lost[1])} [sim r7].${fin.length < 10 ? ' n small' : ''}`); }
  const mds = rows.filter((m) => m.md);
  if (mds.length) h.push(`Match day: hype ${mds.map((m) => m.md.hype || '-').join('/')}, toss won ${cnt(mds, (m) => m.md.toss === 'won')} of ${mds.length}, roar overs ${sum(mds.map((m) => (m.md.roar || []).length))}${rows.some((m) => Array.isArray(m.settled)) ? ', settled wickets ' + sum(rows.map((m) => (m.settled || []).length)) : ''}.`);
  const mach = 'm:' + rows.map((m) => m.id + resLetter(m)).join(',') + '|A' + a.fA + 'P' + a.fP + '|D' + a.iD + 'R' + a.iR + 'A' + a.iA + '|att' + P(attShare) + '|pick' + [a.mu.G, a.mu.O, a.mu.P, a.mu.U].join('/') + '|avP' + (avPct ?? '-') + '|fit' + [a.fitB, a.fitF, a.fitI].join('/') + '|close' + cnt(fin, (m) => m.close) + '/' + fin.length;
  return { key: 'M', title, h, nRows, m: mach, j: rr.map((r) => r.j), old, short: `MATCH ${cnt(fin, (m) => m.res === 'won')}W ${cnt(fin, (m) => m.res === 'lost')}L, fit ${P(a.fitB)}/${P(a.fitF)}/${P(a.fitI)}, avoidable Poor ${P(avPct)}` };
}
const ov = (ms) => ms.flatMap((m) => m.ov || []);

function secE(w, env) {
  const title = 'ECONOMY [W] Q3';
  const fin = w.ms.filter((m) => m.res && m.coins0 != null), B = w.buys, sv = env.save || {};
  if (!fin.length && !B.length) return { key: 'E', title, h: ['none in window'], m: 'e:none', j: {}, short: 'ECONOMY none in window' };
  const eco = fin.map((m) => m.eco || null), has = eco.filter(Boolean);
  const gi = (k) => sum(has.map((e) => e[k] | 0));
  const inn = { base: gi('gate'), win: gi('win'), stars: gi('shop') }, out = { wage: gi('wage'), up: gi('up'), bld: sum(B.map((b) => b.price | 0)) };
  const c0 = fin.length ? fin[0].coins0 : null, c1 = fin.length ? fin[fin.length - 1].coins1 : null, net = sum(fin.map((m) => m.coins1 - m.coins0));
  const oth = has.length === fin.length ? net - (inn.base + inn.win + inn.stars - out.wage - out.up) : null;
  const income = inn.base + inn.win + inn.stars, f0 = fin.length ? fin[0].fans0 | 0 : 0, f1 = fin.length ? fin[fin.length - 1].fans1 | 0 : 0;
  const h = [];
  if (fin.length) h.push(`Coins ${c0} -> ${c1}: in ${income} (gate ${inn.base}, win bonus ${inn.win}, shop ${inn.stars}), out ${out.wage + out.up} (wages ${out.wage}, upkeep ${out.up})${oth ? ', other ' + oth : ''}. Buys out ${out.bld}. Fans +${sum(fin.map((m) => (m.fans1 | 0) - (m.fans0 | 0)))} (${f1}). TP pay ${sum(fin.map((m) => (m.pay && m.pay.total) | 0))}. Wages ${income ? Math.round(100 * out.wage / income) : '-'}% of income [sim 32-43%].`);
  const nets = has.map((e, i) => [fin[i].res, e.net | 0]);
  const wn = nets.filter((x) => x[0] === 'won').map((x) => x[1]), ls = nets.filter((x) => x[0] === 'lost').map((x) => x[1]);
  let worst = 0, run = 0; for (const [r, n] of nets) { if (r === 'lost') { run += n; worst = Math.min(worst, run); } else run = 0; }
  if (has.length) h.push(`Net per win +${wn.length ? Math.round(sum(wn) / wn.length) : '-'} (${wn.length}), per loss ${ls.length ? Math.round(sum(ls) / ls.length) : '-'} (${ls.length}). Worst losing run ${worst}. ${verdict(worst < 0)} [sim L1 +78 win, +8 loss].`);
  const arrears = cnt(has, (e) => e.arr > 0);
  if (B.length || arrears) {
    const last = B.slice(-2).map((b) => `${b.item} ${b.price} at ${b.c0} Coins (${b.alt == null ? '-' : b.alt} other buys affordable)`).join('; ');
    const warnB = cnt(B, (b) => b.warn);
    h.push(`Buys ${B.length}${last ? ': ' + last : ''}. Reserve warning, bought while shown ${warnB}. Arrears ${arrears} matches, missed paydays ${sv.missed | 0}. ${verdict(warnB >= 2)}`);
  }
  if (sv.migrated) h.push('Economy partly from a migrated save.');
  const j = { c0, c1, in: inn, out, oth, fans: [f0, f1], nw: wn.length ? Math.round(sum(wn) / wn.length) : null, nl: ls.length ? Math.round(sum(ls) / ls.length) : null, buy: B.map((b) => [b.item, b.price, b.c0, b.alt]), arr: arrears, warn: [cnt(B, (b) => b.warn), cnt(B, (b) => b.warn)], bf: sv.migrated ? 1 : 0 };
  return { key: 'E', title, h, m: `e:${c0}|${c1}|${income}|${out.wage + out.up}|${oth ?? '-'}|f${f1 - f0}|b${B.length}|arr${arrears}`, j, short: `ECONOMY Coins ${c0 ?? '-'} -> ${c1 ?? '-'}, ${B.length} buys, Fans +${f1 - f0}` };
}

function secC(w, env) {
  const title = 'COACHES [W] Q4';
  const R = w.nets, W = w.weeks, own = (env.save && env.save.coaches) || [], courses = w.buys.filter((b) => b.k === 'course');
  if (!R.length && !courses.length) return { key: 'C', title, h: ['none in window'], m: 'c:none', j: {}, short: 'COACHES none in window' };
  const used = cnt(R, (r) => r.co), idle = cnt(W, (x) => x.cidle), weeks = W.length || R.length, c = own[0];
  const h = [`${c ? 'Coach ' + c[0] + (c[2] ? ' (' + c[2] + ')' : '') + ': ' : 'Coach: '}used ${used} of ${weeks} weeks, idle ${idle}. ${weeks >= 3 ? verdict(used * 2 < weeks) : 'n small'}`];
  const gains = courses.map((b) => b.gn).filter((x) => x != null), best = Math.max(0, ...own.map((x) => x[1] | 0));
  h.push(`Courses bought ${courses.length} (${sum(courses.map((b) => b.price | 0))} Coins)${gains.length ? ', wheel +' + sum(gains) + ' step' : ''}. Best coach step ${best} of 21.`);
  return { key: 'C', title, h, m: `c:${c ? c[0] : '-'}|u${used}|w${weeks}|i${idle}|crs${courses.length}|best${best}`, j: { own, use: [used, idle, weeks], course: [courses.length, sum(courses.map((b) => b.price | 0)), gains], best }, short: `COACHES used ${used} of ${weeks} weeks, ${courses.length} courses` };
}

function secS(w, env) {
  const title = 'SEASON [S] Q3 Q6 Q7';
  const sv = env.save, SS = (w.seasons || []), cur = sv && sv.rec ? sv : null;
  if (!cur && !SS.length) return { key: 'S', title, h: ['none in window'], m: 's:none', j: {}, short: 'SEASON none in window' };
  const h = [], g = cur ? cur.gate : {}, rec = cur ? cur.rec : null;
  if (rec) h.push(`Record ${rec.w}-${rec.l}, table ${rec.pos == null ? '-' : rec.pos}, ${rec.pts} pts. Promotion: top 2 ${g.top2 ? 'yes' : 'no'}, Stadium L${g.stad} ${g.built ? 'built' : 'not built'}, Fans ${g.fans} of ${g.need == null ? '-' : g.need}.`);
  const lgs = {}; for (const x of SS) for (const k in (x.lgs || {})) lgs[k] = Math.min(lgs[k] || 99, x.lgs[k]);
  const lastS = SS[SS.length - 1], leg = SS.reduce((a, x) => a || x.leg, 0);
  if (SS.length) h.push(`League path: ${Object.entries(lgs).map(([k, v]) => k + ' s' + v).join(', ') || 'L1'}. ${SS.length} seasons logged. Legacy ${leg ? 'bought' : 'not yet'}. [sim League 5 by s10-12].`);
  const m6 = lastS && lastS.m6 ? lastS.m6 : [null, null], now = cur && cur.sixMean != null ? cur.sixMean : m6[1], pool = cur ? cur.tp : (lastS ? lastS.pool : null);
  if (now != null || m6[0] != null) h.push(`Six mean ${m6[0] ?? '-'} -> ${now ?? '-'}. At cap ${lastS && lastS.cap != null ? lastS.cap : '-'} of 6. TP pool ${pool ?? '-'}.${pool > 600 ? ' WATCH' : ''}`);
  const closed = SS.filter((x) => !x.open && x.cin), ci = closed.length ? closed[closed.length - 1] : null;
  if (ci) { const inc = sum(Object.values(ci.cin || {})); h.push(`Income last closed season (L${ci.lg}): ${inc} Coins (careful band ${[1865, 3454, 5222, 7153, 9290][(ci.lg || 1) - 1]} [sim]).`); }
  return { key: 'S', title, h, m: `s:${rec ? rec.w + '-' + rec.l : '-'}|${rec ? rec.pos : '-'}|${rec ? rec.pts : '-'}|g[${g.top2 ? 1 : 0},${g.stad},${g.fans},${g.need ?? '-'}]|m6${m6[0] ?? '-'}>${now ?? '-'}|pool${pool ?? '-'}`, j: { w: rec && rec.w, l: rec && rec.l, pos: rec && rec.pos, pts: rec && rec.pts, gate: g, lp: lgs, lg: cur && cur.league, m6: [m6[0], now], cap: lastS ? lastS.cap : null, pool, sg: SS.length, inc: ci ? sum(Object.values(ci.cin || {})) : null }, short: `SEASON ${rec ? rec.w + '-' + rec.l + ', table ' + rec.pos : SS.length + ' seasons logged'}` };
}

function secF(w, data) {
  const title = 'FEEL [W] Q1 Q2 Q3 Q5 Q8';
  const F = w.feel, fin = w.ms.filter((m) => m.res), asked = F.length, ans = cnt(F, (x) => x.v && !['sk', 'n/a', 'off'].includes(x.v)), sk = cnt(F, (x) => x.v === 'sk');
  const by = (c) => { const l = F.filter((x) => x.f === c); return l.length ? l[l.length - 1].v : null; };
  const ansM = cnt(fin, (m) => m.feel && Object.values(m.feel).some((v) => v !== '-'));
  const h = [`Feel ${ansM}/${fin.length} matches answered. Asked ${asked}, answered ${ans}, skipped ${sk}. Training "${by('tr') ?? '-'}". Wheel "${by('wh') ?? '-'}". Spend "${by('ec') ?? '-'}". Picks "${by('pk') ?? '-'}".`];
  const gl = glossOf(data, w.ms), tot = sum(Object.values(gl));
  if (tot > 3) h.push(`Letter words tapped ${tot}.`);
  return { key: 'F', title, h, m: `f:tr${by('tr') ?? '-'}|wh${by('wh') ?? '-'}|ec${by('ec') ?? '-'}|pk${by('pk') ?? '-'}|${ans}/${asked}`, j: { ask: F.map((x) => [x.f, x.id, x.v]), words: tot }, short: `FEEL ${ansM}/${fin.length} matches, asked ${asked}, answered ${ans}` };
}

/** Word opens: per-match counts plus the session buckets se.gl (opens outside a match, P0-5). */
function glossOf(data, ms) {
  const g = aggregate(ms).gloss;
  for (const s of data.sessions || []) for (const k in (s.gl || {})) g[k] = (g[k] || 0) + s.gl[k];
  return g;
}

/** Everything the layout needs: header lines, sections, JSON top level. */
export function reportParts(data, env0) {
  const env = envOf(env0, data), w = windowOf(data, env); w.seasons = (data.seasons || []).slice(-12);
  const clean = cleanOf(w.range, env), sv = env.save || {}, fin = w.ms.filter((m) => m.res || m.ab);
  const on = w.ms.filter((m) => Array.isArray(m.fl)).length ? w.ms.some(featOn) : (env.features === true || env.features === 'on');
  const t0 = w.since ? w.since.atMs : (w.ms[0] ? w.ms[0].t0 : env.now);
  const rid = w.rid;
  const h1 = `CR ${env.build} | CLEAN: ${clean.ok ? 'YES' : 'NO ' + clean.why.join(', ')} | features ${on ? 'on' : 'off'} | save v${sv.v || '?'} | S${sv.season || '?'} R${sv.round || '?'}/${sv.rounds || 9} L${sv.league || '?'} | #${rid} | ${env.vp}`;
  const h2 = `Window: ${fin.length} matches, ${w.nets.length} nets runs, since ${w.since ? '#' + w.since.rid : 'start'} (${utc(t0)} to ${utc(env.now)}). [W] window [S] season [G] save`;
  const h3 = w.dropped ? `Dropped ${w.dropped.n} records from ${w.dropped.build}` : null;
  const secs = [secT(w, env), secM(w), secE(w, env), secC(w, env), secS(w, env), secF(w, data)];
  return { env, w, clean, on, rid, h: [h1, h2, h3].filter(Boolean), secs, drop: w.dropped ? w.dropped.n : 0 };
}

const LIM = { full: 2500, short: 1000, json: 4000 };
const lineOf = (s, mach) => [s.title, ...s.h.map((l) => ' ' + l), mach ? ' ' + s.m : null].filter(Boolean).join('\n');

/** Full text: header + sections with machine lines. Overflow (5 order): fold older matches, drop machine lines, print `trimmed`. Never cuts header, CLEAN or FEEL. */
export function buildText(data, env) {
  const P_ = reportParts(data, env);
  const make = (mach, foldTo) => {
    const parts = P_.secs.map((s) => {
      if (s.key === 'M' && foldTo != null && s.nRows > foldTo) { const rows = s.h.slice(0, s.nRows), fold = s.old ? s.old.n + (s.nRows - 1 - foldTo) + 0 : s.nRows - foldTo; return { ...s, h: ['and ' + fold + ' earlier folded (see JSON)'].concat(rows.slice(-foldTo), s.h.slice(s.nRows)) }; } // overflow rule 1: fold older matches
      return s;
    });
    return P_.h.concat(parts.map((s) => lineOf(s, mach))).join('\n');
  };
  let t = make(true);
  if (t.length > LIM.full) t = make(true, 1);
  if (t.length > LIM.full) t = make(false, 1) + '\ntrimmed';
  if (t.length > LIM.full) t = t.replace(/ \[sim[^\]]*\]/g, ''); // last resort: band notes go (the bands are in bands.js)
  return t;
}

/** Short text: header, one line per section, no machine lines or JSON; the last line says what is missing. */
export function buildSummary(data, env) {
  const p = reportParts(data, env);
  const t = p.h.concat(p.secs.map((s) => s.short)).join('\n') + '\nshort: no per-over data, use Full for Q2';
  return t.length > LIM.short ? p.h.slice(0, 1).concat(p.secs.map((s) => s.short), 'short: no per-over data, use Full for Q2').join('\n') : t;
}

/** Compact JSON for bots and the team (SPEC s4): per-system objects, per-over data as 10-char strings for the last 3 matches. */
export function buildData(data, env0) {
  const p = reportParts(data, env0), env = p.env, S = Object.fromEntries(p.secs.map((s) => [s.key, s.j]));
  const M = S.M; delete S.M;
  const out = { rid: p.rid, since: p.w.since ? p.w.since.atMs : null, at: new Date(env.now).toISOString(), b: env.build, tun: env.tuningSha || null, sv: (env.save && env.save.v) || null, vp: env.vp, clean: p.clean.ok ? 1 : 0, why: p.clean.why, feat: p.on ? 1 : 0, errs: env.errors, drop: p.drop, sz: 'f', ...S, M: Array.isArray(M) ? M : [] };
  const sec = p.secs.find((s) => s.key === 'M'); if (sec && sec.old) out.Mold = sec.old;
  let js = JSON.stringify(out);
  if (js.length > LIM.json) { for (const m of out.M) { delete m.rb; delete m.rc; } js = JSON.stringify(out); } // overflow: runs per over go first
  if (js.length > LIM.json) { for (const m of out.M) { delete m.g; delete m.f; delete m.i; } out.trimmed = 1; js = JSON.stringify(out); }
  return js;
}

/** Full copy: text then the JSON block. */
export function buildFull(data, env) {
  return buildText(data, env) + '\nJSON:\n' + buildData(data, env);
}

/** What the log must record at copy time: the text sent (kept for Copy last again). */
export const repeatText = (last) => (last && last.text ? '(repeat of #' + last.rid + ')\n' + last.text : null);

// Kept for older callers and tests: the summary lines are now the sections above.
export const LINES = [(ctx) => buildSummary(ctx.d || { matches: ctx.ms, sessions: [] }, ctx.env)];
