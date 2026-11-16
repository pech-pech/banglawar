// @ts-check
// Find big wheel in the store (fan activity; wa1 slice A, agent "find"). S0 Z1 split of js/store/wmstore.js (owner T4).
import { ACT } from '../../data/activities.js';
import { makeRng } from '../../core/rng.js';
import { effective, recordSpin } from '../../core/wheelmeta.js';
import * as WMF from '../../core/wheelmeta.js'; // wa1 find: tokens on the Find wheel (tokenOptions / useToken / tokenLeft)
import { pityFind, findWheel, findWheelResult } from '../../core/wheels/find.js'; // wa1 find: Find big wheel
import { modsFor } from '../../core/wheels/common.js';
import { activityOptions, roundKey } from '../../core/activities.js';
import { pickActivity as pickActFind } from '../../core/activities.js'; // wa1 find: a token find is paid by re-running the pick
import { clone, on, rngFor, seasonN, stopOf, otherSpeed } from './common.js';

const WORD = { coins: 'Coins', player: 'Player', coach: 'Coach', nothing: 'Nothing' };
const rowOf = (/** @type {string} */ id) => ACT.TABLE.find((/** @type {any} */ r) => r.id === id) || null;
/** The Find big wheel for activity `id` with the tree (Widener, Sharp Eyes, Extra Gold, Booster, Second Cheer; Control: Slow, Steady, Guide). @param {any} s @param {string} id */
export const findWheelOf = (/** @type {any} */ s, /** @type {string} */ id) => { const row = rowOf(id); if (!row) return null; const E2 = effective(s); return findWheel(row, modsFor(E2, 'find'), otherSpeed(E2.find || {}, s)); };
export const findReelOf = findWheelOf; // old name (wa1: Find is a big wheel now)
const findKey = (/** @type {any} */ s, /** @type {string} */ id) => `${roundKey(s)}|${id}`;
// wa1 findtune: Second Cheer = one free re-spin after a no-find, max 1 a season, no token, never chains (wheelMeta.cheerUsed{season}; missing = 0)
export const cheerLeft = (/** @type {any} */ s) => !((((s && s.wheelMeta && s.wheelMeta.cheerUsed) || {})[seasonN(s)]) | 0);
const noCheer = (/** @type {any} */ w) => (w && w.mods && w.mods.cheer ? { ...w, mods: { ...w.mods, cheer: 0 } } : w);
const actRngOf = (/** @type {any} */ s) => makeRng(`${String(s.season.seed).replace(/\|s\d+$/, '')}|act|${roundKey(s)}|${s.salt}`); // the same stream commands.js pickAct uses

/** What the wheel decided for picking activity `id` now: {find, kind, bonus, index, pity, boosted, second, prevAct} or null (flag off, repeat week, rest, refused). @param {any} s @param {string} id @param {any} p */
export function findForce(s, id, p) {
  if (!on() || !s.season || !s.econ) return null;
  const o = activityOptions(s), line = o.rows.find((/** @type {any} */ r) => r.id === id), wheel = findWheelOf(s, id);
  if (!o.open || !line || !line.ok || line.repeat || !wheel) return null;
  const rng = rngFor(s, 'find', findKey(s, id)), prevAct = s.econ.act ? clone(s.econ.act) : null;
  if (o.pity) { const r = pityFind(rng, wheel); return { find: true, kind: r.type, bonus: 0, index: r.index, pity: true, boosted: false, second: false, prevAct }; }
  const r = findWheelResult(rng, cheerLeft(s) ? wheel : noCheer(wheel), stopOf(p)); // wa1 findtune: cheer only while unused this season
  return { find: r.find, kind: r.type, bonus: r.coinsBonus || 0, index: r.index, pity: false, boosted: r.boosted, second: r.second, cheered: !!r.cheered, prevAct };
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
  if (force && force.cheered) { const m = n.wheelMeta || (n.wheelMeta = clone(WMF.metaOf(n))); m.cheerUsed = { ...(m.cheerUsed || {}), [seasonN(n)]: 1 }; } // wa1 findtune
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
/** Token offers on the pending Find (empty unless a no-find is waiting this round; core rules: cap 2 a season, no Lift on Find). @param {any} s */
export function findTokens(s) { const p = findPending(s); return p && WMF.tokenOptions ? WMF.tokenOptions(s, 'find', p, {}) || [] : []; }
/**
 * UseToken {wheel:'find', kind, stop?}: a token on this round's no-find. Re-spin / Pick Two re-spin the same wheel (Second Cheer and Booster too),
 * Nudge steps one cell. A new find replaces the pending result before it is paid: the no-find pick is undone (cost, Fans, ledger row, activity record)
 * and the pick runs again with the find forced (same activity stream as PickActivity). Same state when not allowed.
 * @param {any} s @param {any} p
 */
export function useFindToken(s, p) {
  const pend = findPending(s); if (!pend || !p || typeof p.kind !== 'string' || !WMF.useToken) return s;
  const fs = s.findSpin, wheel = noCheer(findWheelOf(s, fs.id) || pend.wheel), /* wa1 findtune: a token spin never cheers */ used = fs.tokUsed | 0, stop = p.stop && typeof p.stop === 'object' && Number.isFinite(p.stop.t) ? { t: p.stop.t, phi: p.stop.phi, e: p.stop.e } : p.careful === undefined ? true : !!p.careful;
  const ctx = { spin: (/** @type {any} */ rng, /** @type {any} */ st) => ({ wheel, ...findWheelResult(rng, wheel, st) }) };
  const r = WMF.useToken(s, 'find', p.kind, pend, rngFor(s, 'findtok', `${findKey(s, fs.id)}|${p.kind}|${used}`), stop, ctx);
  if (!r || !r.pending || r.s === s) return s;
  const q = r.pending, cell = wheel.cells[q.index] || null, find = !!(cell && cell.find) || q.find === true, type = q.type || (find && cell ? cell.type : null);
  const extra = { tokUsed: used + 1, ...(q.used ? { used: q.used } : {}) };
  if (!find) { const n = clone(r.s); n.findSpin = { ...fs, index: q.index, second: !!q.second, ...extra }; return n; }
  // undo the no-find pick, then pick again with the find forced
  const n = clone(r.s), e = n.econ, h = e.act.hist[0];
  e.coins += h.coins | 0; e.fans -= h.fans | 0;
  const li = e.ledger.length - 1; if (li >= 0 && e.ledger[li].k === 'act' && e.ledger[li].id === fs.id) e.ledger.pop();
  if (fs.prevAct) e.act = clone(fs.prevAct); else delete e.act;
  const force = { find: true, kind: type, bonus: q.coinsBonus | 0, index: q.index, pity: false, boosted: !!q.boosted, second: !!q.second };
  const t = pickActFind(n, fs.id, actRngOf(n), force);
  if (t === n) return s;
  const out = clone(t); out.findSpin = findSpinOf(out, fs.key, fs.id, force, extra);
  return out;
}
/** Big-wheel props for one activity's Find (before the pick) + the stored result of the pick just made. null with the flag off / a repeat week. @param {any} s @param {string} id */
export function findSpinVM(s, id) {
  if (!on() || !s.season || !s.econ) return null;
  const w = findWheelOf(s, id); if (!w) return null;
  // labels: one word per block (on its widest cell), Nothing gaps unlabelled when small
  const labels = w.cells.map((/** @type {any} */ c) => { if (!c.find) return c.w >= 1.2 ? 'Nothing' : ''; const bc = w.cells.filter((/** @type {any} */ x) => x.block === c.block), top = bc.reduce((/** @type {any} */ a, /** @type {any} */ b) => (b.w > a.w ? b : a), bc[0]); return top === c ? 'Find' : ''; });
  const cells = w.cells.map((/** @type {any} */ c) => ({ label: WORD[/** @type {'coins'} */ (c.type)], w: c.w, find: c.find, tone: c.find ? c.type : 'none', block: c.block }));
  const fs = s.findSpin && s.findSpin.id === id && s.findSpin.key === roundKey(s) ? s.findSpin : null, E2 = effective(s), X = E2.find || {};
  const left = WMF.tokenLeft ? WMF.tokenLeft(s, 'find', {}) : null;
  return { slices: w.slices.slice(), widths: w.widths.slice(), jackpotIndex: w.jackpotIndex, golds: w.finds.slice(), aims: w.aims.slice(), phys: { ...w.phys }, labels, cells,
    guide: !!X.guide, zone: +X.zone || 0, chime: !!X.chime,
    pending: fs ? { index: fs.index, type: fs.type, find: fs.find, coins: fs.coins | 0, bonus: fs.bonus | 0, pity: fs.pity, second: !!fs.second, jackpot: !!fs.find, used: fs.used || [] } : null,
    tokens: fs ? findTokens(s).map((/** @type {any} */ o) => ({ kind: o.kind, label: o.label, count: (((s.wheelMeta && s.wheelMeta.tokens) || {})[o.src]) | 0 /* wa1 fixfind: pool count, capped in spinFind */ })) : [], tokLeft: left && left.wheelLeft != null ? left.wheelLeft : null,
    pityNext: activityOptions(s).pity };
}
