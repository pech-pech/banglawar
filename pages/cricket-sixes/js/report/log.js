// Session event log + match records in localStorage (key sixes.report.v1). Every public call is try/catch'd:
// the report can never break play. This is the only module here that touches storage; the app core stays pure.
import { overRecord, matchResult } from './metrics.js';
import { BUILD } from './build.js';

export const KEY = 'sixes.report.v1';
export const CAPS = { events: 300, matches: 12, errors: 5, sessions: 8 };

export const blank = () => ({ v: 1, seq: 0, sessions: [], matches: [], events: [], errors: { n: 0, last: [] }, buildMatches: {} });

/** @param {{storage?:any, now?:()=>number, build?:string, env?:()=>any}} [o] */
export function createLog(o = {}) {
  const CAP = { ...CAPS, ...(o.caps || {}) };
  const storage = o.storage || null, now = o.now || Date.now, build = o.build || BUILD, env = o.env || (() => ({}));
  const load = () => {
    try { const r = storage && storage.getItem(KEY); if (r) { const d = JSON.parse(r); if (d && d.v === 1 && Array.isArray(d.matches) && Array.isArray(d.events)) return d; } } catch (e) { /* fresh log */ }
    return blank();
  };
  let d = load();
  const sid = (d.sessions.length ? d.sessions[d.sessions.length - 1].id : 0) + 1;
  d.sessions.push({ id: sid, t0: now(), build, vp: env() });
  d.sessions = d.sessions.slice(-CAPS.sessions);

  const safe = (fn) => (...a) => { try { const r = fn(...a); save(); return r; } catch (e) { fail(e); return undefined; } };
  function save() {
    if (!storage) return;
    try { storage.setItem(KEY, JSON.stringify(d)); }
    catch (e) { try { d.events.length = 0; d.matches = d.matches.slice(-3); storage.setItem(KEY, JSON.stringify(d)); } catch (e2) { /* storage blocked: keep in memory */ } }
  }
  function fail(e) { try { d.errors.n++; d.errors.last = d.errors.last.concat(String(e && e.message || e).slice(0, 120)).slice(-CAPS.errors); } catch (_) { /* nothing */ } }
  const open = () => { const m = d.matches[d.matches.length - 1]; return m && !m.res && !m.ab ? m : null; };

  const api = {
    sid, data: () => d,
    /** Raw trail, one tuple per fact: [seconds, type, payload]. Add any new fact here first, then derive a metric from it. */
    event: safe((type, a) => { d.events.push([Math.round(now() / 1000), type, a == null ? 0 : a]); if (d.events.length > CAPS.events) d.events.splice(0, d.events.length - CAPS.events); }),
    open,
    matchStart: safe((s, resume) => {
      const prev = open();
      if (resume && prev && prev.seed === s.seed) return; // reopened mid-match: keep the open record, it is not a new start
      const se = d.sessions[d.sessions.length - 1]; if (!resume && se && se.first == null) se.first = Math.max(0, now() - se.t0); // Z1: ms from opening the game to the first Start match (a resume is not a start)
      if (prev) { prev.ab = 1; prev.t1 = now(); }
      d.matches.push({ id: ++d.seq, sid, build, seed: s.seed, vp: env(), t0: now(), t1: 0, res: null, ab: 0, stage: s.stage, ov: [], scr: {}, why: 0, gl: {}, sk: 0, th: [], feel: {}, rt: null, err: 0 });
      if (d.matches.length > CAP.matches) d.matches.splice(0, d.matches.length - CAP.matches);
      api.event('matchStart', s.seed);
    }),
    /** A BowlOver went from `before` to `after`. t = { th: think ms }. */
    over: safe((before, after, t) => {
      const m = open(); if (!m || !after.last) return;
      m.ov.push(overRecord(before, after, t)); m.stage = after.stage;
      if (after.stage === 'done') {
        Object.assign(m, matchResult(after)); m.t1 = now();
        d.buildMatches[m.build] = (d.buildMatches[m.build] || 0) + 1; m.nb = d.buildMatches[m.build];
        api.event('matchEnd', m.res);
      }
    }),
    /** The over panel closed; waitMs = ms from the last ball landing to the close, skipped = closed before the last ball. */
    panel: safe((waitMs, skipped) => {
      const m = d.matches[d.matches.length - 1]; const ov = m && m.ov[m.ov.length - 1]; if (!ov) return;
      ov.pw = skipped ? null : Math.max(0, Math.round(waitMs)); ov.sk = skipped ? 1 : 0; if (skipped) { m.sk++; api.event('skip', ov.o); }
    }),
    stage: safe((stage) => { const se = d.sessions[d.sessions.length - 1]; if (se) se.end = stage; const m = d.matches[d.matches.length - 1]; if (m) m.stage = stage; }), // Z2: se.end = the screen the session was on last
    screen: safe((stage, ms) => { const m = d.matches[d.matches.length - 1]; if (m && ms > 0) m.scr[stage] = (m.scr[stage] || 0) + Math.round(Math.min(ms, 600000)); }),
    why: safe(() => { const m = d.matches[d.matches.length - 1]; if (m) m.why++; api.event('why', m ? m.stage : 0); }),
    gloss: safe((term) => { const m = d.matches[d.matches.length - 1]; const t = String(term || 'full list').slice(0, 24); if (m) m.gl[t] = (m.gl[t] || 0) + 1; api.event('gloss', t); }),
    retry: safe((ms) => { const m = d.matches[d.matches.length - 1]; if (m && m.res) m.rt = Math.round(ms); }),
    feel: safe((q, a) => { const m = d.matches[d.matches.length - 1]; if (m) m.feel[q] = a; }),
    error: safe((msg) => { fail(msg); }),
    clear: () => { try { storage && storage.removeItem(KEY); } catch (e) { /* ignore */ } const keep = d.sessions.slice(-1); d = blank(); d.sessions = keep; },
  };
  return api;
}
