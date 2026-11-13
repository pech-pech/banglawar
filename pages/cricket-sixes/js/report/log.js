// Session event log + match records in localStorage (key sixes.report.v1). Every public call is try/catch'd:
// the report can never break play. This is the only module here that touches storage; the app core stays pure.
import { overRecord, matchResult } from './metrics.js';
import { BUILD } from './build.js';

export const KEY = 'sixes.report.v1';
export const CAPS = { matches: 24, nets: 24, spins: 60, buys: 40, feel: 40, errors: 5, sessions: 8 }; // [guess] P0-8; per-season aggregates (12 max) live outside these caps

export const blank = () => ({ v: 1, seq: 0, sessions: [], matches: [], errors: { n: 0, last: [] }, buildMatches: {} });

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
  const sid = (d.sessions.length ? d.sessions[d.sessions.length - 1].id : 0) + 1;
  d.sessions.push({ id: sid, t0: now(), build, vp: env() });
  d.sessions = d.sessions.slice(-CAP.sessions);

  const safe = (fn) => (...a) => { try { const r = fn(...a); save(); return r; } catch (e) { fail(e); return undefined; } };
  const LISTS = ['nets', 'spins', 'buys']; // optional per-feature lists: capped here, written by later report parts
  const capLists = (div = 1) => { for (const k of LISTS) if (Array.isArray(d[k])) d[k] = d[k].slice(-Math.max(1, Math.floor(CAP[k] / div))); };
  const write = () => { storage.setItem(KEY, JSON.stringify(d)); };
  /** Storage full (P0-9): trim in order, retrying after each step: per-over rows of matches older than the last 3, then halve nets/spins/buys, then drop old matches. Season aggregates, marker and last text are never touched. */
  const trims = [
    () => { for (const m of d.matches.slice(0, -3)) if (m.ov && m.ov.length) m.ov = []; },
    () => capLists(2),
    () => { d.matches = d.matches.slice(-3); },
  ];
  function save() {
    if (!storage) return;
    capLists();
    try { write(); return; } catch (e) { /* full: trim */ }
    for (const t of trims) { try { t(); d.trimmed = 1; write(); return; } catch (e) { /* next step */ } }
  }
  function fail(e) { try { d.errors.n++; d.errors.last = d.errors.last.concat(String(e && e.message || e).slice(0, 120)).slice(-CAPS.errors); } catch (_) { /* nothing */ } }
  const KIND = { league: 'L', semi: 'S', final: 'F' };
  const open = () => { const m = d.matches[d.matches.length - 1]; return m && !m.res && !m.ab ? m : null; };

  const api = {
    sid, data: () => d,
    open,
    matchStart: safe((s, resume) => {
      const prev = open();
      if (resume && prev && prev.seed === s.seed) return; // reopened mid-match: keep the open record, it is not a new start
      if (prev) { prev.ab = 1; prev.t1 = now(); }
      const fx = s.fixture || null, sn = s.season || null; // P0-6: which fixture this was
      d.matches.push({ id: ++d.seq, sid, build, seed: s.seed, vp: env(), t0: now(), t1: 0, res: null, ab: 0, stage: s.stage, k: fx ? (KIND[fx.kind] || '?') : null, r: fx ? fx.round : null, season: sn ? sn.n : null, league: sn ? sn.league : null, ov: [], scr: {}, why: 0, gl: {}, sk: 0, th: [], feel: {}, err: 0 });
      if (d.matches.length > CAP.matches) d.matches.splice(0, d.matches.length - CAP.matches);
    }),
    /** A BowlOver went from `before` to `after`. t = { th: think ms }. */
    over: safe((before, after, t) => {
      const m = open(); if (!m || !after.last) return;
      m.ov.push(overRecord(before, after, t)); m.stage = after.stage;
      if (after.stage === 'done') {
        Object.assign(m, matchResult(after)); m.t1 = now();
        d.buildMatches[m.build] = (d.buildMatches[m.build] || 0) + 1; m.nb = d.buildMatches[m.build];
      }
    }),
    /** The over panel closed; waitMs = ms from the last ball landing to the close, skipped = closed before the last ball. */
    panel: safe((waitMs, skipped) => {
      const m = d.matches[d.matches.length - 1]; const ov = m && m.ov[m.ov.length - 1]; if (!ov) return;
      ov.pw = skipped ? null : Math.max(0, Math.round(waitMs)); ov.sk = skipped ? 1 : 0; if (skipped) m.sk++;
    }),
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
      m.coins0 = e0.coins | 0; m.coins1 = e1.coins | 0; m.fans0 = e0.fans | 0; m.fans1 = e1.fans | 0;
    }),
    feel: safe((q, a) => { const m = d.matches[d.matches.length - 1]; if (m) m.feel[q] = a; }),
    error: safe((msg) => { fail(msg); }),
    clear: () => { try { storage && storage.removeItem(KEY); } catch (e) { /* ignore */ } const keep = d.sessions.slice(-1); d = blank(); d.sessions = keep; },
  };
  return api;
}
