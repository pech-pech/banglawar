// Session event log + match records in localStorage (key sixes.report.v1). Every public call is try/catch'd:
// the report can never break play. This is the only module here that touches storage; the app core stays pure.
import { overRecord, matchResult, decidedOver, mdOf, seasonSnap, netsRecord, altCount, warnOf, sixMean, pushAffordable } from './metrics.js';
import { TUNING_SHA } from '../data/tuning-sha.js';
import { FLAGS } from '../data/flags.js';
import { BUILD } from './build.js';

export const KEY = 'sixes.report.v1';
export const CAPS = { matches: 24, nets: 24, spins: 60, buys: 40, feel: 40, weeks: 24, club: 40, errors: 5, sessions: 8, seasons: 12 }; // [guess] P0-8; per-season aggregates (12 max) live outside these caps

export const blank = () => ({ v: 1, seq: 0, sessions: [], matches: [], errors: { n: 0, last: [] }, buildMatches: {}, rid: 0, marker: null, lastText: null, builds: [], eseq: 0, seasons: [], nets: [], spins: [], weeks: [], buys: [], feelLog: [], club: [] });

/** @param {{storage?:any, now?:()=>number, build?:string, env?:()=>any}} [o] */
export function createLog(o = {}) {
  const CAP = { ...CAPS, ...(o.caps || {}) };
  const storage = o.storage || null, now = o.now || Date.now, build = o.build || BUILD, env = o.env || (() => ({}));
  const load = () => {
    try { const r = storage && storage.getItem(KEY); if (r) { const d = JSON.parse(r); if (d && d.v === 1 && Array.isArray(d.matches)) { delete d.events; return d; } } } // P0-13: the old events trail is dropped on load
    catch (e) { /* fresh log */ }
    return blank();
  };
  let d = load(), lastGl = { t: '', at: 0 };
  for (const k of Object.keys(blank())) if (d[k] === undefined) d[k] = blank()[k]; // old logs gain the r9 fields
  { // W4: a new build starts a new window; records are kept one build back, older ones go. The last copied text and the id counter stay.
    if (d.builds[d.builds.length - 1] !== build) { d.builds.push(build); d.builds = d.builds.slice(-2); if (d.marker && d.marker.build !== build) d.marker = null; }
    const keep = (r) => !r.b && !r.build ? true : d.builds.includes(r.b || r.build);
    d.matches = d.matches.filter(keep); for (const k of ['nets', 'spins', 'weeks', 'buys', 'feelLog', 'club']) d[k] = d[k].filter(keep);
  }
  const sid = (d.sessions.length ? d.sessions[d.sessions.length - 1].id : 0) + 1;
  d.sessions.push({ id: sid, t0: now(), build, vp: env() });
  d.sessions = d.sessions.slice(-CAP.sessions);

  const safe = (fn) => (...a) => { try { const r = fn(...a); save(); return r; } catch (e) { fail(e); return undefined; } };
  const LISTS = ['nets', 'spins', 'buys', 'weeks', 'feelLog', 'club'], CAPK = { feelLog: 'feel' }; // optional per-feature lists: capped here, written by later report parts
  const capLists = (div = 1) => { for (const k of LISTS) if (Array.isArray(d[k])) d[k] = d[k].slice(-Math.max(1, Math.floor(CAP[CAPK[k] || k] / div))); };
  const write = () => { storage.setItem(KEY, JSON.stringify(d)); };
  /** Storage full (P0-9): trim in order, retrying after each step: per-over rows of matches older than the last 3, then halve nets/spins/buys, then drop old matches. Season aggregates, marker and last text are never touched. */
  const trims = [
    () => { for (const m of d.matches.slice(0, -3)) if (m.ov && m.ov.length) m.ov = []; },
    () => capLists(2),
    () => { d.matches = d.matches.slice(-3); },
  ];
  function save() {
    capLists();
    if (!storage) return;
    try { write(); return; } catch (e) { /* full: trim */ }
    for (const t of trims) { try { t(); d.trimmed = 1; write(); return; } catch (e) { /* next step */ } }
  }
  function fail(e) { try { d.errors.n++; d.errors.last = d.errors.last.concat(String(e && e.message || e).slice(0, 120)).slice(-CAPS.errors); } catch (_) { /* nothing */ } }
  const flagsOn = () => Object.keys(FLAGS).filter((k) => FLAGS[k] === true); // names of flags that are on (r9: matchday, settled, roar, activities, freePick)
  /** Match-day facts and settled/roar lists from a match state; every part optional. */
  const mdInto = (m, s) => {
    try {
      const md = mdOf(s);
      if (md && !m.md) m.md = { hype: md.hype, hi: md.hypeIdx, toss: md.toss, pep: md.pepId || null, fm: md.hypeFanMult != null ? md.hypeFanMult : null, roar: (md.roar || []).map((x, i) => (x ? i : -1)).filter((i) => i >= 0) };
      const wk = (inn) => (inn && inn.wkLog) || [];
      if (s.inn1 && s.inn1.settledOn || s.inn2 && s.inn2.settledOn) m.settled = wk(s.inn1).map((w) => ({ in: 1, ...w })).concat(wk(s.inn2).map((w) => ({ in: 2, ...w })));
      const ro = (inn) => (inn && inn.roarOvers) || [];
      if (ro(s.inn1).length || ro(s.inn2).length) m.roarOvers = { 1: ro(s.inn1), 2: ro(s.inn2) };
    } catch (e) { /* feature absent */ }
  };
  const ev = (k, rec) => { d[k].push({ q: ++d.eseq, b: build, t: now(), ...rec }); };
  const KIND = { league: 'L', semi: 'S', final: 'F' };
  const open = () => { const m = d.matches[d.matches.length - 1]; return m && !m.res && !m.ab ? m : null; };

  const netsRecordAff = (before) => { try { return pushAffordable(before) ? 1 : 0; } catch (e) { return 0; } };
  const api = {
    sid, data: () => d,
    open,
    matchStart: safe((s, resume) => {
      const prev = open();
      if (resume && prev && prev.seed === s.seed) return; // reopened mid-match: keep the open record, it is not a new start
      if (prev) { prev.ab = 1; prev.t1 = now(); }
      const fx = s.fixture || null, sn = s.season || null; // P0-6: which fixture this was
      d.matches.push({ id: ++d.seq, sid, build, seed: s.seed, vp: env(), t0: now(), t1: 0, res: null, ab: 0, stage: s.stage, k: fx ? (KIND[fx.kind] || '?') : null, r: fx ? fx.round : null, season: sn ? sn.n : null, league: sn ? sn.league : null, ov: [], scr: {}, why: 0, gl: {}, sk: 0, th: [], feel: {}, err: 0, tun: TUNING_SHA, fl: flagsOn(), tc: [] });
      mdInto(d.matches[d.matches.length - 1], s);
      if (d.matches.length > CAP.matches) d.matches.splice(0, d.matches.length - CAP.matches);
    }),
    /** A BowlOver went from `before` to `after`. t = { th: think ms }. */
    over: safe((before, after, t) => {
      const m = open(); if (!m || !after.last) return;
      m.ov.push(overRecord(before, after, t)); m.stage = after.stage;
      if (after.stage === 'done') {
        Object.assign(m, matchResult(after)); m.t1 = now();
        const dec = decidedOver(m.ov, after.result); if (dec != null) m.dec = dec; // L4: not "over - 1"; the over after which the winner stayed above 90%
        m.touched = new Set(m.tc).size; mdInto(m, after);
        d.buildMatches[m.build] = (d.buildMatches[m.build] || 0) + 1; m.nb = d.buildMatches[m.build];
      }
    }),
    /** The over panel closed; waitMs = ms from the last ball landing to the close, skipped = closed before the last ball. */
    panel: safe((waitMs, skipped) => {
      const m = d.matches[d.matches.length - 1]; const ov = m && m.ov[m.ov.length - 1]; if (!ov) return;
      if (skipped) { ov.pw = null; ov.sk = 1; m.sk++; } // r9 L2: over rows carry pw/sk only for a skipped panel
    }),
    /** Copy resolved: move the window marker (W1/W2) and keep the text for "Copy last again". Call only after the clipboard write succeeded. Returns the new report id. */
    copied: safe((text, size) => {
      const rid = d.rid + 1; d.rid = rid;
      d.marker = { rid, atMs: now(), matchSeq: d.seq, evSeq: d.eseq, build };
      d.lastText = { rid, text: String(text || ''), size: size === 's' ? 's' : 'f', at: now(), build };
      return rid;
    }),
    nextRid: () => d.rid + 1,
    lastText: () => d.lastText,
    /** Records after the marker, running build only. since = marker {rid, atMs} or null. dropped = {n, build} for records of the other build kept in the log (H3). */
    window: () => {
      const mk = d.marker, ms = mk ? mk.matchSeq : 0, es = mk ? mk.evSeq : 0;
      const cur = (r) => (r.b || r.build) === build;
      const inWin = d.matches.filter((m) => m.id > ms), other = inWin.filter((m) => !cur(m));
      const evs = (k) => d[k].filter((r) => r.q > es && cur(r));
      const oth = other.length + ['nets', 'spins', 'weeks', 'buys', 'feelLog', 'club'].reduce((a, k) => a + d[k].filter((r) => r.q > es && !cur(r)).length, 0);
      return { matches: inWin.filter(cur), nets: evs('nets'), spins: evs('spins'), weeks: evs('weeks'), buys: evs('buys'), club: evs('club'), feel: evs('feelLog'), since: mk ? { rid: mk.rid, atMs: mk.atMs } : null,
        dropped: oth ? { n: oth, build: (other[0] || {}).build || (d.builds.find((x) => x !== build) || '') } : null };
    },
    stage: safe((stage) => { const se = d.sessions[d.sessions.length - 1]; if (se) se.end = stage; const m = open(); if (m) m.stage = stage; }), // P0-7: a finished record keeps its stage. Z2: se.end = the screen the session was on last
    screen: safe((stage, ms) => { const m = d.matches[d.matches.length - 1]; if (m && ms > 0) m.scr[stage] = (m.scr[stage] || 0) + Math.round(Math.min(ms, 600000)); }),
    why: safe(() => { const m = d.matches[d.matches.length - 1]; if (m) m.why++; }),
    /** A glossary word or "?" opened by a real tap. Counts into the open match, else the session bucket se.gl (never a finished record). Same word within 1 s counts once. */
    gloss: safe((term) => {
      const t = String(term || 'full list').slice(0, 24), at = now();
      if (lastGl.t === t && at - lastGl.at < 1000) return; lastGl = { t, at };
      const m = open(), se = d.sessions[d.sessions.length - 1], bucket = m ? m.gl : se && (se.gl = se.gl || {});
      if (bucket) bucket[t] = (bucket[t] || 0) + 1;
    }),
    /** FinishMatch: pay and the coin/fan change land on the match just finished (P0-6). */
    finish: safe((before, after) => {
      let m = null; for (let i = d.matches.length - 1; i >= 0; i--) if (d.matches[i].res) { m = d.matches[i]; break; }
      if (!m || m.pay || !after || !after.pay) return;
      const p = after.pay, e0 = (before && before.econ) || {}, e1 = after.econ || {};
      m.pay = { base: p.base | 0, win: p.win | 0, stars: p.stars | 0, total: p.total | 0 };
      try { const row = (e1.ledger || []).filter((r) => r.k === 'match').slice(-1)[0]; if (row) m.eco = { gate: row.gate | 0, win: row.winBonus | 0, shop: row.shop | 0, wage: row.wages | 0, up: row.upkeep | 0, net: row.net | 0, fans: row.fans | 0, arr: row.arrears | 0, ...(row.hype ? { hype: row.hype } : {}), ...(row.fanSplit ? { fs: row.fanSplit } : {}) }; } catch (e) { /* no ledger */ }
      m.coins0 = e0.coins | 0; m.coins1 = e1.coins | 0; m.fans0 = e0.fans | 0; m.fans1 = e1.fans | 0;
    }),
    feel: safe((q, a, fact) => {
      const m = d.matches[d.matches.length - 1]; if (m) m.feel[q] = a;
      const v = a === '-' || a == null ? 'sk' : a; // 3 states: answer, 'sk' skipped, 'n/a' not asked, 'off' switched off
      ev('feelLog', { id: m ? m.id : null, f: q, v, ...(fact != null ? { fact } : {}) });
    }),
    /** A MakeCall that changed the call for the over on screen (touched = overs the player changed). */
    touch: safe((before, after) => {
      const m = open(); if (!m || !before || !after || JSON.stringify(before.call) === JSON.stringify(after.call)) return;
      const inn = after.stage === 'chase' || before.stage === 'chase' ? after.inn2 : after.inn1; m.tc.push((before.stage === 'chase' ? 'c' : 'b') + (inn ? inn.over : 0));
    }),
    /** Nets run, spin, end-of-week and buy facts, read from the states around a command. Each is optional and never throws. */
    command: safe((cmd, payload, before, after) => {
      if (!before || !after || before === after) return;
      const s = after.season ? after.season.n : null, base = { s };
      if (cmd === 'RunNets') { const r = netsRecord(before, after); if (r) ev('nets', { ...base, ...r }); }
      else if (cmd === 'Spin') {
        const two = !!(payload && payload.slot === 2), k = two ? 'pending2' : 'pending', p = after.training && after.training[k];
        if (p && p.result && !(before.training && before.training[k] === p)) { const t = Number.isFinite(p.result.t) ? p.result.t : null; // seconds
          ev('spins', { ...base, wk: p.week, eff: (after.training.effort || null), careful: p.careful ? 1 : 0, ms: t == null ? null : Math.round(t * 1000), bk: t == null ? null : t >= 6 ? 'o' : t < 3.2 ? 'e' : t <= 3.8 ? 'c' : 'l', g: p.result.gain, jp: p.result.jackpot ? 1 : 0, slot: two ? 2 : 1 }); }
      } else if (cmd === 'EndWeek') {
        const T0 = before.training || {}, ran = T0.netsWeek === T0.week;
        const co = T0.coach_id ? 1 : 0, nr = d.nets.slice().reverse().find((x) => x.wk === T0.week && x.s === s), idle = co && nr && !nr.cs ? 1 : 0; // idle = a coach was set but his strong focus was not the week's (quality 0)
        ev('weeks', { ...base, wk: T0.week, tpEnd: T0.tp | 0, aff: netsRecordAff(before), nets: ran ? 1 : 0, hint: null, coach: co, cidle: idle });
      } else if (cmd === 'PickActivity' || cmd === 'SignTrial' || cmd === 'DeclineTrial' || cmd === 'TakeFreePick') {
        const a0 = before.econ || {}, a1 = after.econ || {}, h = (a1.act && a1.act.hist) || [], last = h[h.length - 1], tr = before.trial || null;
        const rec = { ...base, k: cmd === 'PickActivity' ? 'act' : cmd === 'TakeFreePick' ? 'fp' : cmd === 'SignTrial' ? 'sign' : 'decl' };
        if (cmd === 'PickActivity') Object.assign(rec, { id: payload && payload.id, coins: (a0.coins | 0) - (a1.coins | 0), fans: (a1.fans | 0) - (a0.fans | 0), find: last && last.find ? last.find : null, dry: a1.act ? a1.act.dry | 0 : null });
        else if (cmd === 'TakeFreePick') rec.what = payload && payload.what;
        else rec.who = tr ? { kind: tr.kind || (tr.coach ? 'coach' : 'player'), id: (tr.player || tr.coach || {}).id || null, wage: tr.wage | 0 } : null;
        ev('club', rec);
      } else if (cmd === 'StartBuild' || cmd === 'BuySink' || cmd === 'BuyMedal' || cmd === 'BuyLegacy' || cmd === 'RunCourse') {
        const c0 = before.econ ? before.econ.coins | 0 : 0, c1 = after.econ ? after.econ.coins | 0 : 0, price = c0 - c1;
        const item = cmd === 'BuyLegacy' ? 'legacy' : cmd === 'RunCourse' ? (payload && payload.coachId) || 'course' : (payload && (payload.what || payload.id)) || cmd;
        const k = { StartBuild: item === 'stadium' ? 'stad' : 'fac', BuySink: 'sink', BuyMedal: 'medal', BuyLegacy: 'legacy', RunCourse: 'course' }[cmd];
        if (cmd === 'BuyMedal' || price > 0 || (after.econ && JSON.stringify(after.econ.sinks) !== JSON.stringify((before.econ || {}).sinks)) || cmd === 'StartBuild') {
          const cd = after.training && after.training.courseDone;
          ev('buys', { ...base, k, item, price: Math.max(0, price), c0, alt: altCount(before, item), warn: warnOf(before, item), gn: cmd === 'RunCourse' && cd ? cd.gain : null });
        }
      }
      if (cmd === 'FinishMatch' || cmd === 'EndWeek' || cmd === 'NewSeason' || cmd === 'StartBuild' || cmd === 'BuySink' || cmd === 'BuyLegacy' || cmd === 'RunCourse' || cmd === 'NextWeek') api.season(after, cmd === 'NewSeason' ? before : null, cmd, before, after);
    }),
    /** First sight of a season (the hub render): starts its record with the Six mean at the start. */
    seen: (st) => { try { if (st && st.season && !d.seasons.some((x) => x.n === st.season.n)) api.season(st); } catch (e) { /* ignore */ } },
    /** Per-season aggregate (d.seasons, 12 max, outside the caps). Called from command() on money and week events; `closing` = the old season's state when a new one starts. */
    season: safe((st, closing, cmd, before, after) => {
      const up = (state, close) => {
        const sn = seasonSnap(state); if (!sn) return null;
        let r = d.seasons.find((x) => x.n === sn.n);
        if (!r) { r = { n: sn.n, b: build, lg: sn.lg, w: 0, l: 0, pos: null, pts: 0, top2: 0, prom: 0, stad: sn.stad, fans: sn.fans, need: sn.need, cin: { gate: 0, win: 0, shop: 0 }, cout: { wage: 0, up: 0, bld: 0 }, m6: [sixMean(state), null], cap: null, pool: sn.pool, crs: 0, leg: sn.leg, open: 1, lgs: {} }; d.seasons.push(r); if (d.seasons.length > CAP.seasons) d.seasons.splice(0, d.seasons.length - CAP.seasons); }
        Object.assign(r, { lg: sn.lg, w: sn.w, l: sn.l, pos: sn.pos, pts: sn.pts, top2: sn.top2, stad: sn.stad, fans: sn.fans, need: sn.need, cap: sn.cap, pool: sn.pool, leg: sn.leg });
        r.m6[1] = sn.m6now; if (r.m6[0] == null) r.m6[0] = sn.m6now;
        if (!d.seasons.some((x) => x.lgs && x.lgs['L' + sn.lg])) r.lgs['L' + sn.lg] = sn.n; // first season seen in this league
        if (close) { r.open = 0; const run = state.run && state.run.last; r.prom = run && run.promoted ? 1 : 0; }
        return r;
      };
      if (closing) up(closing, true);
      const r = up(st, st.stage === 'end'); if (!r) return;
      if (cmd === 'FinishMatch' && before && after) { const m = d.matches.slice(-1)[0]; if (m && m.eco) { r.cin.gate += m.eco.gate; r.cin.win += m.eco.win; r.cin.shop += m.eco.shop; r.cout.wage += m.eco.wage; r.cout.up += m.eco.up; } }
      if (cmd === 'StartBuild' && before && after) r.cout.bld += Math.max(0, (before.econ.coins | 0) - (after.econ.coins | 0));
      if (cmd === 'RunCourse') r.crs += 1;
    }),
    error: safe((msg) => { fail(msg); }),
    clear: () => { try { storage && storage.removeItem(KEY); } catch (e) { /* ignore */ } const keep = d.sessions.slice(-1); d = blank(); d.sessions = keep; },
  };
  return api;
}
