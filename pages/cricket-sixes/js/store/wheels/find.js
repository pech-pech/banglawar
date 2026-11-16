// @ts-check
// Find big wheel in the store (fan activity; wa1 slice A, agent "find"). S0 Z1 split of js/store/wmstore.js (owner T4).
// Wheels-like-match SPEC s5, 11a, 11b, 13: rate ring, result decided at STOP (kept on s.findSpin, so a reload shows the same slice), STOP written to wheels.stops.find,
// FIND offers no token and no Nudge, Second Cheer = one free aimed re-spin after a no-find (FindCheer command), max 1 a season, no token.
import { ACT } from '../../data/activities.js';
import { makeRng } from '../../core/rng.js';
import { effective, recordSpin } from '../../core/wheelmeta.js';
import * as WMF from '../../core/wheelmeta.js'; // wa1 find: tokens on the Find wheel (tokenOptions / useToken / tokenLeft)
import { pityFind, findWheel, findWheelResult } from '../../core/wheels/find.js'; // wa1 find: Find big wheel
import { normWheels } from '../../core/save-migrate.js';
import { modsFor } from '../../core/wheels/common.js';
import { activityOptions, roundKey } from '../../core/activities.js';
import { pickActivity as pickActFind } from '../../core/activities.js'; // wa1 find: a token find is paid by re-running the pick
import { clone, on, rngFor, seasonN, stopOf, otherSpeed } from './common.js';

const rowOf = (/** @type {string} */ id) => ACT.TABLE.find((/** @type {any} */ r) => r.id === id) || null;
/** The Find big wheel for activity `id` with the tree (Widener, Sharp Eyes, Extra Gold, Booster, Second Cheer; Control: Slow, Steady, Guide). @param {any} s @param {string} id */
export const findWheelOf = (/** @type {any} */ s, /** @type {string} */ id) => { const row = rowOf(id); if (!row) return null; const E2 = effective(s); return findWheel(row, modsFor(E2, 'find'), otherSpeed(E2.find || {}, s)); };
export const findReelOf = findWheelOf; // old name (wa1: Find is a big wheel now)
const findKey = (/** @type {any} */ s, /** @type {string} */ id) => `${roundKey(s)}|${id}`;
// Second Cheer = one free aimed re-spin after a no-find, max 1 a season, no token, never chains (wheelMeta.cheerUsed{season}; missing = 0)
export const cheerLeft = (/** @type {any} */ s) => !((((s && s.wheelMeta && s.wheelMeta.cheerUsed) || {})[seasonN(s)]) | 0);
const markCheer = (/** @type {any} */ n) => { const m = n.wheelMeta || (n.wheelMeta = clone(WMF.metaOf(n))); m.cheerUsed = { ...(m.cheerUsed || {}), [seasonN(n)]: 1 }; };
/** Local stand-in for T1's recordStop(n, 'find', spinKey, rec) (js/core/wheel-stops.js, not landed): same save shape (CONTRACT-A s6). Swap the body for the import when it lands. */
function recordFindStop(/** @type {any} */ n, /** @type {string} */ key, /** @type {any} */ r, /** @type {number} */ respin) {
  normWheels(n);
  const t = Number.isFinite(r.t) ? Math.max(0, r.t) : 0, cycle = Math.floor(t / 6) + 1, tIn = t - 6 * (cycle - 1), value = r.find ? 1 : 0;
  const W = n.wheels, rec = (W.stops.find ||= {})[key] || (W.stops.find[key] = { stops: [], kept: 0, spent: false });
  rec.stops.push({ stopT: Math.round(t * 1000), cycle, tInCycle: tIn, sliceId: r.index | 0, value, auto: false, respin });
  rec.kept = rec.stops.reduce((b, x, i) => (x.value > rec.stops[b].value ? i : b), 0); // higher value kept, a tie keeps the first
  if (respin) rec.spent = true;
  const st = W.stats.find || (W.stats.find = { n: 0, careful: 0, early: 0, late: 0, taps: [] });
  st.n++; if (value > 0) st.careful++; if (tIn < 3.2) st.early++; else if (tIn > 3.8) st.late++;
  st.taps.push({ cycle, tInCycle: tIn }); if (st.taps.length > 200) st.taps.splice(0, st.taps.length - 200);
}
const actRngOf = (/** @type {any} */ s) => makeRng(`${String(s.season.seed).replace(/\|s\d+$/, '')}|act|${roundKey(s)}|${s.salt}`); // the same stream commands.js pickAct uses

/** What the wheel decided for picking activity `id` now: {find, kind, bonus, index, pity, boosted, second, prevAct} or null (flag off, repeat week, rest, refused). @param {any} s @param {string} id @param {any} p */
export function findForce(s, id, p) {
  if (!on() || !s.season || !s.econ) return null;
  const o = activityOptions(s), line = o.rows.find((/** @type {any} */ r) => r.id === id), wheel = findWheelOf(s, id);
  if (!o.open || !line || !line.ok || line.repeat || !wheel) return null;
  const rng = rngFor(s, 'find', findKey(s, id)), prevAct = s.econ.act ? clone(s.econ.act) : null;
  if (o.pity) { const r = pityFind(rng, wheel); return { find: true, kind: r.type, bonus: 0, index: r.index, pity: true, boosted: false, second: false, t: 0, prevAct }; }
  const r = findWheelResult(rng, wheel, stopOf(p)); // decided at STOP; Second Cheer is a separate spin (findCheer)
  return { find: r.find, kind: r.type, bonus: r.coinsBonus || 0, index: r.index, pity: false, boosted: r.boosted, second: r.second, t: r.t, prevAct };
}
/** findSpin from the state right after a pick (what was really paid: a Player / Coach cell can fall back to Coins; read from the activity history). */
function findSpinOf(/** @type {any} */ n, /** @type {any} */ key, /** @type {string} */ id, /** @type {any} */ force, /** @type {any} */ extra) {
  const h = n.econ && n.econ.act && n.econ.act.hist && n.econ.act.hist[0], real = h && h.id === id && h.find && typeof h.find === 'object' ? h.find : null;
  const bonus = real && real.type === 'coins' ? (force.bonus | 0) : 0;
  return { key, id, index: force.index, type: real ? real.type : 'none', find: !!real, coins: real && real.type === 'coins' ? (real.coins | 0) + bonus : 0, bonus, pity: !!force.pity, boosted: !!force.boosted, second: !!force.second,
    ...(real ? {} : { prevAct: force.prevAct || null }), ...extra };
}
/** After pickActivity: tally + the pending wheel result kept on s.findSpin. @param {any} s @param {string} id @param {any} force */
export function afterFind(s, id, force) {
  const n = clone(recordSpin(s, 'find'));
  n.findSpin = findSpinOf(n, roundKey(s), id, force, {});
  if (force && !force.pity) recordFindStop(n, findKey(s, id), { index: force.index, find: !!n.findSpin.find, t: force.t }, 0); // STOP on disk with the result (a pity find has no spin)
  return n;
}
/** The pending Find as core's token API reads it ({wheel, index, find, type}). null when no token can apply (no pick this round, a find, already paid on). @param {any} s */
function findPending(s) {
  const fs = s.findSpin; if (!on() || !fs || !s.econ || fs.key !== roundKey(s) || fs.find || fs.pity) return null;
  const h = s.econ.act && s.econ.act.hist && s.econ.act.hist[0]; if (!h || h.id !== fs.id || h.find || !h.rolled) return null;
  const wheel = findWheelOf(s, fs.id); if (!wheel) return null;
  // wa1 find2: every find cell counts as gold for the token guards (no Nudge onto a find = no sure find from Nothing); the spin itself uses the plain wheel
  return { wheel: { ...wheel, golds: wheel.finds.slice() }, index: fs.index, find: false, type: null, ...(fs.used ? { used: fs.used } : {}) };
}
/** Token offers on the pending Find (empty unless a no-find is waiting this round; core rules: cap 2 a season, no Lift on Find; SPEC 11a: no Nudge on Find). @param {any} s */
export function findTokens(s) { const p = findPending(s); return p && WMF.tokenOptions ? (WMF.tokenOptions(s, 'find', p, {}) || []).filter((/** @type {any} */ o) => o.kind !== 'nudge') : []; }
/** Undo this round's no-find pick (cost, Fans, ledger row, activity record) and pick again with the find forced; null when the pick cannot run. @param {any} n draft already holding the new wheelMeta @param {any} fs @param {any} force */
function rePickWithFind(n, fs, force, extra) {
  const e = n.econ, h = e.act.hist[0];
  e.coins += h.coins | 0; e.fans -= h.fans | 0;
  const li = e.ledger.length - 1; if (li >= 0 && e.ledger[li].k === 'act' && e.ledger[li].id === fs.id) e.ledger.pop();
  if (fs.prevAct) e.act = clone(fs.prevAct); else delete e.act;
  const t = pickActFind(n, fs.id, actRngOf(n), force);
  if (t === n) return null;
  const out = clone(t); out.findSpin = findSpinOf(out, fs.key, fs.id, force, extra);
  return out;
}
/**
 * UseToken {wheel:'find', kind, stop?}: a token on this round's no-find. Re-spin / Pick Two re-spin the same wheel (Booster too), no Nudge on Find,
 * a FIND result offers no token. A new find replaces the pending result before it is paid: the no-find pick is undone and the pick runs again with
 * the find forced (same activity stream as PickActivity). Same state when not allowed.
 * @param {any} s @param {any} p
 */
export function useFindToken(s, p) {
  const pend = findPending(s); if (!pend || !p || typeof p.kind !== 'string' || p.kind === 'nudge' || !WMF.useToken) return s;
  const fs = s.findSpin, wheel = findWheelOf(s, fs.id) || pend.wheel, used = fs.tokUsed | 0, stop = p.stop && typeof p.stop === 'object' && Number.isFinite(p.stop.t) ? { t: p.stop.t, phi: p.stop.phi, e: p.stop.e } : p.careful === undefined ? true : !!p.careful;
  /** @type {any} */ let last = null;
  const ctx = { spin: (/** @type {any} */ rng, /** @type {any} */ st) => (last = { wheel, ...findWheelResult(rng, wheel, st) }) };
  const r = WMF.useToken(s, 'find', p.kind, pend, rngFor(s, 'findtok', `${findKey(s, fs.id)}|${p.kind}|${used}`), stop, ctx);
  if (!r || !r.pending || r.s === s) return s;
  const q = r.pending, cell = wheel.cells[q.index] || null, find = !!(cell && cell.find) || q.find === true, type = q.type || (find && cell ? cell.type : null);
  const extra = { tokUsed: used + 1, ...(q.used ? { used: q.used } : {}), ...(fs.cheerDone ? { cheerDone: true, cheerIndex: fs.cheerIndex } : {}) };
  /** @type {any} */ let out;
  if (!find) { out = clone(r.s); out.findSpin = { ...fs, index: q.index, second: !!q.second, ...extra }; } else {
    out = rePickWithFind(clone(r.s), fs, { find: true, kind: type, bonus: q.coinsBonus | 0, index: q.index, pity: false, boosted: !!q.boosted, second: !!q.second }, extra);
    if (!out) return s;
  }
  if (last) recordFindStop(out, findKey(s, fs.id), { index: last.index, find: !!last.find, t: last.t }, 1); // the token's spin
  return out;
}
/** True while the round's no-find can take its Second Cheer: owned, unused this season, a real spin (no pity), not yet taken. @param {any} s */
export function cheerOffer(s) {
  const fs = s && s.findSpin; if (!on() || !fs || !s.econ || fs.key !== roundKey(s) || fs.find || fs.pity || fs.cheerDone) return false;
  const h = s.econ.act && s.econ.act.hist && s.econ.act.hist[0]; if (!h || h.id !== fs.id || h.find || !h.rolled) return false;
  const w = findWheelOf(s, fs.id); return !!(w && w.mods && w.mods.cheer && cheerLeft(s));
}
/**
 * FindCheer {stop?, careful?}: Second Cheer, the free aimed re-spin after a no-find. Spent at once (wheelMeta.cheerUsed), no token, never chains. A find
 * replaces the no-find the same way a token find does; a miss keeps the first result and ends the offer. Same state when not offered.
 * @param {any} s @param {any} p
 */
export function findCheer(s, p) {
  if (!cheerOffer(s)) return s;
  const fs = s.findSpin, wheel = findWheelOf(s, fs.id); if (!wheel) return s;
  const r = findWheelResult(rngFor(s, 'findcheer', findKey(s, fs.id)), wheel, stopOf(p));
  const n = clone(s); markCheer(n);
  const extra = { ...(fs.tokUsed ? { tokUsed: fs.tokUsed } : {}), ...(fs.used ? { used: fs.used } : {}), cheerDone: true, cheerIndex: r.index };
  /** @type {any} */ let out;
  if (!r.find) { n.findSpin = { ...fs, ...extra }; out = n; } else {
    out = rePickWithFind(n, fs, { find: true, kind: r.type, bonus: r.coinsBonus || 0, index: r.index, pity: false, boosted: r.boosted, second: r.second }, extra);
    if (!out) return s;
  }
  recordFindStop(out, findKey(s, fs.id), { index: r.index, find: r.find, t: r.t }, 1);
  return out;
}
/** Big-wheel props for one activity's Find (before the pick) + the stored result of the pick just made. null with the flag off / a repeat week. @param {any} s @param {string} id */
export function findSpinVM(s, id) {
  if (!on() || !s.season || !s.econ) return null;
  const w = findWheelOf(s, id); if (!w) return null;
  // labels: one word per block (on its widest cell), Nothing gaps unlabelled when small
  const labels = w.rows.map((/** @type {any} */ r) => (r.label === 'CHEER' && r.w < 0.7 ? 'C' : r.label)); // SPEC 2f: under 7% exactly one character
  const cells = w.cells.map((/** @type {any} */ c, /** @type {number} */ i) => ({ label: labels[i], w: c.w, find: c.find, tone: c.find ? 'find' : 'none', block: c.block }));
  const fs = s.findSpin && s.findSpin.id === id && s.findSpin.key === roundKey(s) ? s.findSpin : null, E2 = effective(s), X = E2.find || {};
  const left = WMF.tokenLeft ? WMF.tokenLeft(s, 'find', {}) : null;
  return { slices: w.slices.slice(), widths: w.widths.slice(), jackpotIndex: w.jackpotIndex, golds: w.finds.slice(), aims: w.aims.slice(), phys: { ...w.phys }, labels, cells, rows: w.rows.map((/** @type {any} */ r) => ({ ...r })), rate: w.rate,
    guide: !!X.guide, zone: +X.zone || 0, chime: !!X.chime,
    pending: fs ? { index: fs.index, type: fs.type, find: fs.find, coins: fs.coins | 0, bonus: fs.bonus | 0, pity: fs.pity, second: !!fs.second, jackpot: !!fs.find, used: fs.used || [], cheer: cheerOffer(s), cheerDone: !!fs.cheerDone, cheerIndex: fs.cheerDone ? fs.cheerIndex : null } : null,
    tokens: fs ? findTokens(s).map((/** @type {any} */ o) => ({ kind: o.kind, label: o.label, count: (((s.wheelMeta && s.wheelMeta.tokens) || {})[o.src]) | 0 /* wa1 fixfind: pool count, capped in spinFind */ })) : [], tokLeft: left && left.wheelLeft != null ? left.wheelLeft : null,
    pityNext: activityOptions(s).pity };
}
