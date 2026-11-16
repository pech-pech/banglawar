// @ts-check
// Hype half-dial (aimable). Pure: every roll uses the rng handed in. S0 Z1 split of js/core/dialreel.js (owner T3).
import { DR } from '../../data/dialreel.js';
import { MD } from '../../data/matchday.js';
import { hypeOdds } from '../matchday.js';
import { neutralMods, sum, tri, clampStop, carefulTap, landingPhase, cellAt } from './common.js';

/**
 * Hype dial from the tilted odds (percent [low, med, high, nuts], as hypeOdds returns). Order med, low, nuts, high. Tree: nuts width + goldAdd + rareAdd (old-wheel units),
 * second nuts (Extra Gold, 0.75 width) after Medium, Kind Floor +1 to Low, Home Crowd Low pays as Medium; widths then rescaled to the 10-unit arc.
 * J = 1.2 x main nuts width. @param {number[]} odds @param {any} [mods] @param {number} [tilt]
 */
export function hypeDial(odds, mods = neutralMods(), tilt = 0) {
  const D = DR.DIAL, m = { ...neutralMods(), ...mods }, key = /** @type {Record<string,number>} */ ({ low: odds[0], med: odds[1], high: odds[2], nuts: odds[3] });
  const wu = (/** @type {string} */ k) => key[k] * D.C0 / 100 + (k === 'nuts' ? m.goldAdd + m.rareAdd : 0);
  const raw = D.ORDER.map((/** @type {string} */ k) => (/** @type {any} */ ({ kind: k, wu: wu(k) })));
  const ni = raw.findIndex((/** @type {any} */ c) => c.kind === 'nuts');
  const nutsRaw = raw[ni].wu;
  for (let e = 0; e < m.extra; e++) raw.splice(1 + e, 0, { kind: 'nuts', wu: nutsRaw * DR.EXTRA_W, second: true });
  const tot = sum(raw.map((/** @type {any} */ c) => c.wu));
  let x = 0;
  const slices = raw.map((/** @type {any} */ c, /** @type {number} */ i) => {
    const w = D.L * c.wu / tot, a = x; x += w;
    let pts = DR.HYPE_PTS[c.kind], level = c.kind;
    if (c.kind === 'low') { pts += m.floor * DR.UNIT.hype; if (m.hfloor) { pts = Math.max(pts, 4); level = 'med'; } }
    return { index: i, kind: c.kind, level, id: c.kind + (c.second ? '2' : ''), label: c.kind, w, a, b: x, pts, gold: c.kind === 'nuts', low: c.kind === 'low', second: !!c.second };
  });
  slices[slices.length - 1].b = D.L; // exact end
  const main = slices.find((/** @type {any} */ s) => s.kind === 'nuts' && !s.second);
  const targets = []; for (const s of slices) if (s.gold) { const c = (s.a + s.b) / 2; targets.push(c, 2 * D.L - c); }
  // wa1 Control on the dial (02 s5): V = 16 x w0Mult, J = 1.2 x widest Nuts x jMult, careful tap sd x 0.727 with Aim Guide
  const sd = DR.SD_AVG * (m.guide ? DR.GUIDE_SD_FACTOR : 1);
  return { kind: 'dial', wheel: 'hype', L: D.L, V: D.V * m.w0Mult, G: D.G, J: D.J_PER_NUTS * (main ? main.w : 1) * m.jMult, sd, guide: !!m.guide, slices, targets, mods: m, tilt };
}

/** Aim Guide tick: needle x (0..L) where a STOP pressed at wheel time `now` would land, wobble left out. Draw it only when dial.guide. @param {any} dial @param {number} phi @param {number} now */
export function dialGuideX(dial, phi, now) { const t = clampStop(now); return tri(phi + dial.V * t + dial.V * dial.G / 3, dial.L); }

/** Hype dial straight from Fans and the activity ledger (hypeOdds). @param {number} fans @param {any[]} actLedger @param {any} [mods] */
export function hypeDialFor(fans, actLedger, mods) { const h = hypeOdds(fans, actLedger); return hypeDial(h.odds, mods, h.t); }

/** Where a STOP = {t, phi, e} lands on the dial: {t, e, base, dist, q, x (needle, folded), index}. @param {any} dial @param {any} stop */
export function dialLanding(dial, stop) {
  const l = landingPhase(dial, stop), x = tri(l.q, dial.L);
  return { ...l, phi: stop.phi, x, index: cellAt(dial.slices, x) };
}

/**
 * Hype result. stop = {t, phi?, e?} (the player's STOP; missing parts are drawn), true = careful synthetic tap (reduced motion / auto play),
 * false = random tap. Always draws 7 numbers. Booster rolls here (own draws); do not roll it again in afterResult for this wheel.
 * Returns {index, level, levelIdx, pts, perf, fanMult, boosted, t, phi, e, x}. perf is a fraction (0.06), pts percent points (6).
 * @param {{random:()=>number}} rng @param {any} dial @param {boolean|{t:number,phi?:number,e?:number}} [stop]
 */
export function dialResult(rng, dial, stop = false) {
  const d = Array.from({ length: 7 }, () => rng.random()), o = stop && typeof stop === 'object' ? stop : null;
  const phi = o && Number.isFinite(o.phi) ? /** @type {number} */ (o.phi) : d[0] * 2 * dial.L;
  const e = o && Number.isFinite(o.e) ? /** @type {number} */ (o.e) : (d[2] * 2 - 1) * dial.J;
  const t = o && Number.isFinite(o.t) ? o.t : stop === true ? carefulTap(dial.targets, 2 * dial.L, dial.V, dial.G, phi, 1 - d[3], d[4], dial.sd || DR.SD_AVG) : DR.STOP_FROM + d[1] * (DR.COAST - DR.STOP_FROM);
  const L = dialLanding(dial, { t, phi, e }), s = dial.slices[L.index];
  let pts = s.pts, boosted = false;
  const m = dial.mods;
  if (m.bch && d[5] < m.bch) {
    const cand = dial.slices.filter((/** @type {any} */ c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[6] * cand.length))];
    if (bi && bi.index === L.index) { pts += m.bval * DR.UNIT.hype; boosted = true; }
  }
  const levelIdx = MD.HYPE_LEVELS.indexOf(s.level);
  return { index: L.index, level: s.level, levelIdx, pts, perf: pts / 100, fanMult: MD.HYPE_FAN_MULT[levelIdx], boosted, t: L.t, phi, e: L.e, x: L.x };
}

// ---- T3 ring API (CONTRACT-A s5/s7): slice-row ring + stop by sliceId. Old dial functions above stay as they are. ----
// TODO(T3-after-T1): gold widening (goldAdd), Extra Gold second NUTS and ring splitting need T1's wheel-ring.js (not merged); not done here.
import { hypeSlicesFor } from '../../data/wheels/hype.js';
import { applyWarmCrowd, warmCrowdOwned } from '../perks/warm-crowd.js';

/** Level of a ring row: 'nuts'|'high'|'med'|'low' (row.level, else read from the label). @param {any} row */
export function HYPE_LEVEL_OF(row) {
  if (row && row.level) return row.level;
  const w = String((row && row.label) || '').split(' ')[0].toLowerCase();
  return w === 'nuts' || w === 'high' || w === 'med' || w === 'low' ? w : 'med';
}

/** Hype ring rows for tilt. Order: Kind Floor / Home Crowd (LOW lifts), then Warm Crowd. @param {any} [mods] @param {number} [tilt] */
export function hypeRing(mods = neutralMods(), tilt = 0) {
  const m = { ...neutralMods(), ...mods };
  const rows = hypeSlicesFor(tilt).map((/** @type {any} */ r) => {
    const level = HYPE_LEVEL_OF(r);
    if (level !== 'low') return { ...r, level };
    let value = r.value + m.floor * DR.UNIT.hype, lv = 'low', label = r.label;
    if (m.hfloor) { value = Math.max(value, 4); lv = 'med'; }
    if (value !== r.value) label = '+' + value;
    return { ...r, value, level: lv, label };
  });
  return applyWarmCrowd(rows, warmCrowdOwned(m));
}

/**
 * Hype result from a ring stop. stop = {sliceId, tInCycle?, t?, phi?, e?, x?}. Always draws 7 numbers in dialResult's order (d[5], d[6] drive the Booster).
 * Same shape as dialResult. @param {{random:()=>number}} rng @param {any[]} ring @param {any} stop @param {any} [mods]
 */
export function hypeAtStop(rng, ring, stop, mods = neutralMods()) {
  const d = Array.from({ length: 7 }, () => rng.random()), m = { ...neutralMods(), ...mods }, st = stop || {};
  const index = ring.findIndex((/** @type {any} */ r) => r.id === st.sliceId), i = index < 0 ? 0 : index, s = ring[i];
  let pts = s.value, boosted = false;
  if (m.bch && d[5] < m.bch) {
    const cand = ring.filter((/** @type {any} */ c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[6] * cand.length))];
    if (bi && bi.id === s.id) { pts += m.bval * DR.UNIT.hype; boosted = true; }
  }
  const level = HYPE_LEVEL_OF(s), levelIdx = MD.HYPE_LEVELS.indexOf(level), num = (/** @type {any} */ v) => (Number.isFinite(v) ? v : 0);
  return { index: s.id, level, levelIdx, pts, perf: pts / 100, fanMult: MD.HYPE_FAN_MULT[levelIdx], boosted, t: num(st.tInCycle ?? st.t), phi: num(st.phi), e: num(st.e), x: num(st.x) };
}
