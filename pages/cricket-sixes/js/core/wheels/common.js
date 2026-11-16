// @ts-check
// Shared dial / reel / reveal maths (S0 Z1 split of js/core/dialreel.js). Pure: no DOM, no clock, no Math.random; every roll uses the rng handed in.
// Port of 03-DIAL-REEL-AIM.md sections 1-6 + dial_reel_aim_sim.py.
//
// Shared rule: SPIN draws a start phase PHI (uniform over the loop) so a random tapper lands on a slice with probability
// width/total at any tap time. STOP (live from 0.8 s, auto at 3.0 s) glides G = 0.5 s: dist = V*G/3 (cubic ease-out) plus a
// wobble e in (-J, +J) through 3u^2-2u^3. Landing phase = PHI + V*t + dist + e. No snap, no hidden roll.
//
// Tree effects: pass `mods` (see neutralMods / modsFor). modsFor reads Agent A's wheelmeta effective(s) once it exists.
// Per-wheel files (hype, find, reveal, toss, pep, scout, finals) import this file only, never js/core/dialreel.js (the barrel).
import { DR } from '../../data/dialreel.js';

/** @param {number} x @param {number} lo @param {number} hi */
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/** @param {number[]} a */
export const sum = (a) => a.reduce((x, y) => x + y, 0);
/** @param {number} g1 @param {number} g2 */
export const gauss = (g1, g2) => Math.sqrt(-2 * Math.log(Math.max(1e-12, g1))) * Math.cos(2 * Math.PI * g2);

// ---------------------------------------------------------------- tree modifiers (adapter)
/** Neutral per-wheel modifiers. goldAdd/rareAdd in the old wheel units (Widener, Top Name, Trophy Polish / Coin Weight, Pep Voice, Sharp Eyes). warmCrowd 0|1 = Warm Crowd on Hype (HIGH +6 pays +7; no width). */
// wa1: Control too (w0Mult = Slow Spin speed factor, jMult = Steady Axle wobble factor, guide 0|1 = Aim Guide). hypeDial applies them; reveal wheels ignore them (feel only).
export const neutralMods = () => ({ goldAdd: 0, rareAdd: 0, extra: 0, floor: 0, hfloor: 0, sfloor: 0, cons: 0, nb: 0, cheer: 0, bch: 0, bval: 1, w0Mult: 1, jMult: 1, guide: 0 }); // warmCrowd absent (= 0) on purpose: wheels in state carry mods, a 0 key drifts the T19 classic hash

/**
 * Modifiers for one wheel from the sim-style effective(owned) object (E: jw, jw_by, rw_by, bch, bval, extra, floor, hfloor, sfloor, cons, nb, cheer).
 * Exact port of how wheel_meta_sim_v2.py build()/one_spin() read E per wheel.
 * @param {any} E @param {string} wheelId
 */
export function modsFromSim(E, wheelId) {
  const m = neutralMods(); if (!E) return m;
  m.goldAdd = (E.jw || 0) + ((E.jw_by && E.jw_by[wheelId]) || 0);
  m.rareAdd = (E.rw_by && E.rw_by[wheelId]) || 0;
  m.extra = wheelId === 'toss' ? 0 : (E.extra | 0);
  m.floor = wheelId === 'hype' || wheelId === 'toss' ? (E.floor || 0) : 0;
  m.hfloor = wheelId === 'hype' ? (E.hfloor ? 1 : 0) : 0;
  m.sfloor = wheelId === 'scout' ? (E.sfloor ? 1 : 0) : 0;
  m.cons = wheelId === 'toss' ? (E.cons || 0) : 0;
  m.nb = (wheelId === 'pep' || wheelId === 'finals') && E.nb && E.nb[wheelId] ? 1 : 0;
  m.cheer = wheelId === 'find' ? (E.cheer || 0) : 0;
  m.bch = clamp(E.bch || 0, 0, 1); m.bval = E.bval || 1;
  m.w0Mult = E.w0 != null ? E.w0 : 1; m.jMult = E.wob != null ? E.wob : 1; m.guide = E.guide ? 1 : 0;
  if (wheelId === 'hype' && E.warmCrowd) /** @type {any} */ (m).warmCrowd = 1; // WC Warm Crowd (absent = 0)
  return m;
}

/** Sim E from owned ranks {nodeId: rank} (sim node ids). Only the keys the dial/reel/reveal wheels read. @param {Record<string,number>} own */
export function simFromRanks(own) {
  const r = (/** @type {string} */ id) => (own && own[id]) | 0;
  const E = { jw: 0.02 * r('f_wide'), jw_by: /** @type {any} */ ({ scout: 0.1 * r('sp_sct_n'), finals: 0.1 * r('sp_fin_n') }), rw_by: /** @type {any} */ ({ toss: 0.1 * r('sp_tos_n'), pep: 0.08 * r('sp_pep_n'), find: 0.02 * r('sp_fnd_n') }), // wa1 findtune: Sharp Eyes 0.02 a block a rank
    bch: Math.min(1, 0.2 * r('f_boost')), bval: 1 + r('f_bigb'), extra: r('f_extra'), floor: r('f_floor'), hfloor: r('sp_hyp_r'), sfloor: r('sp_sct_r'),
    cons: r('sp_tos_r') ? 1 : 0, nb: /** @type {any} */ ({ pep: r('sp_pep_r'), finals: r('sp_fin_r') }), cheer: r('sp_fnd_r') ? 1 : 0,
    w0: Math.max(0.3, 1 - 0.15 * r('c_slow')), wob: Math.max(0, 1 - 0.15 * r('c_steady')), guide: r('c_guide') ? 1 : 0, warmCrowd: r('sp_hyp_n') ? 1 : 0 }; // WC: sp_hyp_n is Warm Crowd now, no Hype width
  return E;
}

/**
 * ADAPTER. Modifiers for `wheelId` from whatever the tree layer gives: (a) the sim-style E (has jw_by), (b) Agent A's per-wheel
 * effective(s)[wheelId] object from js/core/wheelmeta.js (goldAdd, rareAdd, extraGold, floor, lowToMedium, scoutFloor, consolation, neighbourMult, cheer, booster{chance,count}),
 * (c) nothing -> neutral. Nothing else reads those names.
 * @param {any} eff @param {string} wheelId
 */
export function modsFor(eff, wheelId) {
  if (!eff) return neutralMods();
  if (eff.jw_by) return modsFromSim(eff, wheelId);
  const w = eff[wheelId]; if (!w || typeof w !== 'object') return neutralMods();
  const m = neutralMods(), b = w.booster || {};
  m.goldAdd = +w.goldAdd || 0; m.rareAdd = +w.rareAdd || 0; m.extra = wheelId === 'toss' ? 0 : (+w.extraGold || 0) | 0;
  m.floor = +w.floor || 0; m.hfloor = w.lowToMedium ? 1 : 0; m.sfloor = w.scoutFloor ? 1 : 0; m.cons = w.consolation ? 1 : 0;
  m.nb = +w.neighbourMult > 1 ? 1 : 0; m.cheer = w.cheer ? 1 : 0;
  m.bch = clamp(+b.chance || 0, 0, 1); m.bval = +(b.count ?? 1) || 1; // count = Booster value in units; the unit per wheel is DR.UNIT here
  m.w0Mult = Number.isFinite(+w.w0Mult) && w.w0Mult != null ? +w.w0Mult : 1; m.jMult = Number.isFinite(+w.jMult) && w.jMult != null ? +w.jMult : 1; m.guide = w.guide ? 1 : 0;
  if (wheelId === 'hype' && w.warmCrowd) /** @type {any} */ (m).warmCrowd = 1; // WC Warm Crowd (absent = 0)
  return m;
}

// ---------------------------------------------------------------- shared stop maths
/** STOP time as the game takes it: clamped to 0.8..3.0 s (a press before 0.8 s is ignored by the UI; this keeps the maths safe). @param {any} t */
export const clampStop = (t) => clamp(+t || 0, DR.STOP_FROM, DR.COAST);

/** Triangle fold of a phase onto the dial arc 0..L. @param {number} p @param {number} L */
export function tri(p, L) { const q = ((p % (2 * L)) + 2 * L) % (2 * L); return q <= L ? q : 2 * L - q; }

/** Tap time (s) at which the landing phase hits a target (mod period), the one nearest 2.0 s; COAST when none in range (sim solve_ideal). @param {number[]} targets @param {number} period @param {number} V @param {number} G @param {number} phi */
export function idealTap(targets, period, V, G, phi) {
  const off = V * G / 3 + phi; /** @type {number|null} */ let best = null;
  for (const q of targets) {
    const k0 = Math.floor((V * DR.STOP_FROM + off - q) / period) - 1, kn = k0 + 2 + Math.floor((V * (DR.COAST - DR.STOP_FROM)) / period) + 3;
    for (let k = k0; k < kn; k++) {
      const t = (q + k * period - off) / V;
      if (t >= DR.STOP_FROM && t <= DR.COAST && (best === null || Math.abs(t - DR.WIN_MID) < Math.abs(best - DR.WIN_MID))) best = t;
    }
  }
  return best === null ? DR.COAST : best;
}

/** Careful synthetic tap (port line 8, also reduced motion): t = clamp(t_ideal + gauss(0, 0.11), 0.8, 3.0). g1, g2 uniform draws.
 * @param {number[]} targets @param {number} period @param {number} V @param {number} G @param {number} phi @param {number} g1 @param {number} g2 @param {number} [sd] */
export function carefulTap(targets, period, V, G, phi, g1, g2, sd = DR.SD_AVG) {
  return clamp(idealTap(targets, period, V, G, phi) + gauss(g1, g2) * sd, DR.STOP_FROM, DR.COAST);
}

/** Start phase and wobble drawn at SPIN (the UI keeps them; e is already scaled by J). @param {{random:()=>number}} rng @param {any} widget dial or reel */
export function newAim(rng, widget) {
  const period = widget.kind === 'dial' ? 2 * widget.L : widget.C;
  return { phi: rng.random() * period, e: (rng.random() * 2 - 1) * widget.J };
}

/** Landing of a stop = {t, phi, e}: base phase, glide distance, final phase q (before folding). @param {any} w @param {any} stop */
export function landingPhase(w, stop) {
  const t = clampStop(stop.t), e = clamp(stop.e, -w.J, w.J), base = stop.phi + w.V * t, dist = w.V * w.G / 3;
  return { t, e, base, dist, q: base + dist + e };
}
/** Index of the cell holding x (cells sorted, [a, b)); the last cell when none. @param {any[]} cells @param {number} x */
export const cellAt = (cells, x) => { for (let i = 0; i < cells.length; i++) if (x >= cells[i].a && x < cells[i].b) return i; return cells.length - 1; };

/**
 * Frame helper (port line 5). Needle/offset position at wheel time `now` (s since SPIN). stop = {t, phi, e} once pressed, else null.
 * Returns {q, x, glide, done}: x is the dial needle 0..L or the reel offset 0..C. Use the STOP event time for stop.t, not the frame time.
 * @param {any} w dial or reel @param {number} phi @param {number} now @param {{t:number,e:number}|null} [stop]
 */
export function sweepAt(w, phi, now, stop = null) {
  const fold = (/** @type {number} */ q) => (w.kind === 'dial' ? tri(q, w.L) : ((q % w.C) + w.C) % w.C);
  if (!stop || now <= stop.t) { const q = phi + w.V * Math.min(now, stop ? stop.t : now); return { q, x: fold(q), glide: 0, done: false }; }
  const u = Math.min((now - stop.t) / w.G, 1), e = clamp(stop.e, -w.J, w.J), dist = w.V * w.G / 3;
  const q = phi + w.V * stop.t + dist * (1 - Math.pow(1 - u, 3)) + e * (3 * u * u - 2 * u * u * u);
  return { q, x: fold(q), glide: u, done: u >= 1 };
}
