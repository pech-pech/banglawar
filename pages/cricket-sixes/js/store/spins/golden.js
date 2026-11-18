// Golden Over (Captain's Over) commands: GoldenStart, GoldenTap, GoldenCal (CONTRACT-GO s3). Pure. ctx = SPIN_CTX (commands.js helpers).
// s.golden = { seed, inn1, inn2 }, slot = null | { over, bowler, taps:[{e, g}], done }. `seed` ties it to the match (a new match = a new seed = empty).
// The over is committed when the taps cover every ball the over really has (6, or fewer when the innings ends first).
import { goldenReplay, windowFor, gradeOf } from '../../core/golden-over.js';
import { batPart, bowlPart } from '../../core/ability.js';
import { FLAGS } from '../../data/flags.js';
import { MATCH_SPOKES_PER_SPIN } from '../../data/wheelmatch.js';
import { emptyWheelMeta } from '../../core/save-migrate.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const slotKey = (s) => (s.stage === 'bowl' ? 'inn1' : 'inn2');
/** The golden record of the running match (empty when none or from another match). */
export const goldOf = (s) => (s && s.golden && s.golden.seed === s.seed ? s.golden : {});
/** The golden slot of the current innings, or null. */
export const goldSlot = (s) => (s && (s.stage === 'bowl' || s.stage === 'chase') ? goldOf(s)[slotKey(s)] || null : null);
/** A golden over is under way (locked, not finished): WheelOver is refused meanwhile. */
export const goldenActive = (s) => { const g = goldSlot(s); return !!(g && !g.done); };
const sideOf = (s) => (s.stage === 'bowl' ? 'bowl' : 'bat');
const innOf = (s) => (s.stage === 'bowl' ? s.inn1 : s.inn2);

/** Raw rating that sets the window of the next ball: striker's batting (bat) or M's bowler's bowling (bowl), and the preview of the whole over. */
export function goldenNext(s, slot) {
  const side = sideOf(s), n = structuredClone(s);
  const balls = goldenReplay(n, side, slot.bowler, slot.taps.map((t) => t.g));
  const k = slot.taps.length;
  const b = balls[k];
  const raw = !b ? null : side === 'bat' ? batPart(s.me.players[b.batter]) : bowlPart(s.me.players[slot.bowler]);
  return { balls, raw, total: balls.length };
}

export function goldenStart(s, p, ctx) {
  const { isWheelMatch, legalBowlers, suggestedBowler, rivalBowler } = ctx;
  if (!isWheelMatch(s) || (s.stage !== 'bowl' && s.stage !== 'chase')) return s;
  const inn = innOf(s), key = slotKey(s);
  if (inn.done) return s;
  const g = goldOf(s);
  if (g[key]) return s; // once per innings
  let bowler;
  if (s.stage === 'bowl') {
    bowler = p && Number.isInteger(p.bowler) ? p.bowler : suggestedBowler(s);
    if (!legalBowlers(s).includes(bowler)) return s;
  } else bowler = rivalBowler(s);
  if (!(bowler >= 0)) return s;
  const n = structuredClone(s);
  const rec = { over: inn.over, bowler, taps: [], done: false, xr: null, win: null };
  try { rec.xr = ctx.modelOf(s, s.stage === 'bowl' ? 'bowl' : 'bat', bowler).expect.xr; } catch (e) { /* no model: report shows none */ }
  const nx = goldenNext(s, rec); rec.win = nx.raw == null ? null : windowFor(nx.raw);
  n.golden = { seed: s.seed, inn1: g.inn1 || null, inn2: g.inn2 || null, [key]: rec };
  return n;
}

export function goldenTap(s, p, ctx) {
  const slot = goldSlot(s);
  if (!slot || slot.done || !p) return s;
  const miss = !!p.miss || p.err == null;
  if (!miss && !isNum(p.err)) return s;
  const off = s.goldCal && isNum(s.goldCal.offset) ? s.goldCal.offset : 0;
  const { raw, total } = goldenNext(s, slot);
  if (raw == null || slot.taps.length >= total) return s;
  const e = miss ? null : Math.round((p.err - off) * 100) / 100;
  const g = gradeOf(e, windowFor(raw));
  const n = structuredClone(s), key = slotKey(s);
  const ns = n.golden[key];
  ns.taps.push({ e, g });
  const nw = goldenNext(n, ns).raw; if (nw != null) ns.win = windowFor(nw);
  const after = goldenNext(n, ns); // grades known up to here fix the end of the over
  if (ns.taps.length < after.total) return n;
  return commit(n, ns, key, ctx);
}

/** wheelOver's tail for the golden over: real replay on `n`, then last / roar / book / stage / result. */
function commit(n, slot, key, ctx) {
  const { markRoar, countBook, summarise, defaultCall, NEUTRAL_INTENT, NEUTRAL_FIELD } = ctx;
  const bowlSide = n.stage === 'bowl', side = bowlSide ? 'bowl' : 'bat', innIdx = bowlSide ? 0 : 1;
  const inn = bowlSide ? n.inn1 : n.inn2, over = inn.over;
  const balls = goldenReplay(n, side, slot.bowler, slot.taps.map((t) => t.g));
  const bats = bowlSide ? n.rival.players : n.me.players, bowls = bowlSide ? n.me.players : n.rival.players;
  n.last = { balls, over, bowler: slot.bowler, intent: NEUTRAL_INTENT, field: NEUTRAL_FIELD, golden: true, taps: slot.taps.map((t) => ({ e: t.e, g: t.g })) };
  markRoar(n, innIdx, over);
  countBook(n, balls, bats, bowls);
  inn.overs[inn.overs.length - 1].gold = true;
  const runs = balls.reduce((a, b) => a + (typeof b.o === 'number' ? b.o : 0), 0), wk = balls.filter((b) => b.o === 'W').length;
  (n.wheelLog ||= []).push({ inn: innIdx + 1, over, segId: null, label: 'Captain', t: null, auto: false, bucket: null, careful: false, runs, wk, xr: Number.isFinite(slot.xr) ? slot.xr : null, xw: null, guide: false, golden: true });
  if (FLAGS.wheelMeta && n.season) { const m = (n.wheelMeta ||= emptyWheelMeta()); m.spokes = (m.spokes | 0) + MATCH_SPOKES_PER_SPIN; }
  slot.done = true;
  if (bowlSide) {
    if (inn.done) { n.stage = 'break'; n.call = null; n.inn1Summary = summarise(n); } else n.call = defaultCall(n);
  } else if (inn.done) {
    n.stage = 'done';
    n.result = inn.runs > n.inn1.runs ? 'won' : inn.runs === n.inn1.runs ? 'tied' : 'lost';
  }
  return n;
}

export function goldenCal(s, p) {
  if (!p || !isNum(p.offset)) return s;
  const n = isNum(p.n) ? Math.max(0, Math.round(p.n)) : 0;
  const cur = s.goldCal;
  if (cur && cur.offset === p.offset && cur.n === n) return s;
  return { ...s, goldCal: { offset: Math.round(p.offset * 100) / 100, n } };
}
