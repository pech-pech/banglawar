// @ts-check
// Hype half-dial and Find slot reel (aimable), plus reveal-only spins (Toss, Pep, Scout, Finals). Pure: no DOM, no clock,
// no Math.random; every roll uses the rng handed in. Port of 03-DIAL-REEL-AIM.md sections 1-6 + dial_reel_aim_sim.py.
//
// Shared rule: SPIN draws a start phase PHI (uniform over the loop) so a random tapper lands on a slice with probability
// width/total at any tap time. STOP (live from 0.8 s, auto at 3.0 s) glides G = 0.5 s: dist = V*G/3 (cubic ease-out) plus a
// wobble e in (-J, +J) through 3u^2-2u^3. Landing phase = PHI + V*t + dist + e. No snap, no hidden roll.
//
// Tree effects: pass `mods` (see neutralMods / modsFor). modsFor reads Agent A's wheelmeta effective(s) once it exists.
import { DR } from '../data/dialreel.js';
import { MD } from '../data/matchday.js';
import { hypeOdds } from './matchday.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const gauss = (g1, g2) => Math.sqrt(-2 * Math.log(Math.max(1e-12, g1))) * Math.cos(2 * Math.PI * g2);

// ---------------------------------------------------------------- tree modifiers (adapter)
/** Neutral per-wheel modifiers. goldAdd/rareAdd in the old wheel units (Widener, Top Name, Trophy Polish / Big Voice, Coin Weight, Pep Voice, Sharp Eyes). */
export const neutralMods = () => ({ goldAdd: 0, rareAdd: 0, extra: 0, floor: 0, hfloor: 0, sfloor: 0, cons: 0, nb: 0, cheer: 0, bch: 0, bval: 1 });

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
  return m;
}

/** Sim E from owned ranks {nodeId: rank} (sim node ids). Only the keys the dial/reel/reveal wheels read. @param {Record<string,number>} own */
export function simFromRanks(own) {
  const r = (id) => (own && own[id]) | 0;
  const E = { jw: 0.02 * r('f_wide'), jw_by: /** @type {any} */ ({ scout: 0.1 * r('sp_sct_n'), finals: 0.1 * r('sp_fin_n') }), rw_by: /** @type {any} */ ({ hype: 0.08 * r('sp_hyp_n'), toss: 0.1 * r('sp_tos_n'), pep: 0.08 * r('sp_pep_n'), find: 0.06 * r('sp_fnd_n') }),
    bch: Math.min(1, 0.2 * r('f_boost')), bval: 1 + r('f_bigb'), extra: r('f_extra'), floor: r('f_floor'), hfloor: r('sp_hyp_r'), sfloor: r('sp_sct_r'),
    cons: r('sp_tos_r') ? 1 : 0, nb: /** @type {any} */ ({ pep: r('sp_pep_r'), finals: r('sp_fin_r') }), cheer: r('sp_fnd_r') ? 1 : 0 };
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
  return m;
}

// ---------------------------------------------------------------- shared stop maths
/** STOP time as the game takes it: clamped to 0.8..3.0 s (a press before 0.8 s is ignored by the UI; this keeps the maths safe). */
export const clampStop = (t) => clamp(+t || 0, DR.STOP_FROM, DR.COAST);

/** Triangle fold of a phase onto the dial arc 0..L. */
export function tri(p, L) { const q = ((p % (2 * L)) + 2 * L) % (2 * L); return q <= L ? q : 2 * L - q; }

/** Tap time (s) at which the landing phase hits a target (mod period), the one nearest 2.0 s; COAST when none in range (sim solve_ideal). */
export function idealTap(targets, period, V, G, phi) {
  const off = V * G / 3 + phi; let best = null;
  for (const q of targets) {
    const k0 = Math.floor((V * DR.STOP_FROM + off - q) / period) - 1, kn = k0 + 2 + Math.floor((V * (DR.COAST - DR.STOP_FROM)) / period) + 3;
    for (let k = k0; k < kn; k++) {
      const t = (q + k * period - off) / V;
      if (t >= DR.STOP_FROM && t <= DR.COAST && (best === null || Math.abs(t - DR.WIN_MID) < Math.abs(best - DR.WIN_MID))) best = t;
    }
  }
  return best === null ? DR.COAST : best;
}

/** Careful synthetic tap (port line 8, also reduced motion): t = clamp(t_ideal + gauss(0, 0.11), 0.8, 3.0). g1, g2 uniform draws. */
export function carefulTap(targets, period, V, G, phi, g1, g2, sd = DR.SD_AVG) {
  return clamp(idealTap(targets, period, V, G, phi) + gauss(g1, g2) * sd, DR.STOP_FROM, DR.COAST);
}

/** Start phase and wobble drawn at SPIN (the UI keeps them; e is already scaled by J). @param {{random:()=>number}} rng @param {any} widget dial or reel */
export function newAim(rng, widget) {
  const period = widget.kind === 'dial' ? 2 * widget.L : widget.C;
  return { phi: rng.random() * period, e: (rng.random() * 2 - 1) * widget.J };
}

/** Landing of a stop = {t, phi, e}: base phase, glide distance, final phase q (before folding). */
function landingPhase(w, stop) {
  const t = clampStop(stop.t), e = clamp(stop.e, -w.J, w.J), base = stop.phi + w.V * t, dist = w.V * w.G / 3;
  return { t, e, base, dist, q: base + dist + e };
}
const cellAt = (cells, x) => { for (let i = 0; i < cells.length; i++) if (x >= cells[i].a && x < cells[i].b) return i; return cells.length - 1; };

/**
 * Frame helper (port line 5). Needle/offset position at wheel time `now` (s since SPIN). stop = {t, phi, e} once pressed, else null.
 * Returns {q, x, glide, done}: x is the dial needle 0..L or the reel offset 0..C. Use the STOP event time for stop.t, not the frame time.
 * @param {any} w dial or reel @param {number} phi @param {number} now @param {{t:number,e:number}|null} [stop]
 */
export function sweepAt(w, phi, now, stop = null) {
  const fold = (q) => (w.kind === 'dial' ? tri(q, w.L) : ((q % w.C) + w.C) % w.C);
  if (!stop || now <= stop.t) { const q = phi + w.V * Math.min(now, stop ? stop.t : now); return { q, x: fold(q), glide: 0, done: false }; }
  const u = Math.min((now - stop.t) / w.G, 1), e = clamp(stop.e, -w.J, w.J), dist = w.V * w.G / 3;
  const q = phi + w.V * stop.t + dist * (1 - Math.pow(1 - u, 3)) + e * (3 * u * u - 2 * u * u * u);
  return { q, x: fold(q), glide: u, done: u >= 1 };
}

// ---------------------------------------------------------------- Hype half-dial
/**
 * Hype dial from the tilted odds (percent [low, med, high, nuts], as hypeOdds returns). Order med, low, nuts, high. Tree: nuts width + goldAdd + rareAdd (old-wheel units),
 * second nuts (Extra Gold, 0.75 width) after Medium, Kind Floor +1 to Low, Home Crowd Low pays as Medium; widths then rescaled to the 10-unit arc.
 * J = 1.2 x main nuts width. @param {number[]} odds @param {any} [mods] @param {number} [tilt]
 */
export function hypeDial(odds, mods = neutralMods(), tilt = 0) {
  const D = DR.DIAL, m = { ...neutralMods(), ...mods }, key = { low: odds[0], med: odds[1], high: odds[2], nuts: odds[3] };
  const wu = (k) => key[k] * D.C0 / 100 + (k === 'nuts' ? m.goldAdd + m.rareAdd : 0);
  const raw = D.ORDER.map((k) => ({ kind: k, wu: wu(k) }));
  const ni = raw.findIndex((c) => c.kind === 'nuts');
  const nutsRaw = raw[ni].wu;
  for (let e = 0; e < m.extra; e++) raw.splice(1 + e, 0, { kind: 'nuts', wu: nutsRaw * DR.EXTRA_W, second: true });
  const tot = sum(raw.map((c) => c.wu));
  let x = 0;
  const slices = raw.map((c, i) => {
    const w = D.L * c.wu / tot, a = x; x += w;
    let pts = DR.HYPE_PTS[c.kind], level = c.kind;
    if (c.kind === 'low') { pts += m.floor * DR.UNIT.hype; if (m.hfloor) { pts = Math.max(pts, 4); level = 'med'; } }
    return { index: i, kind: c.kind, level, id: c.kind + (c.second ? '2' : ''), label: c.kind, w, a, b: x, pts, gold: c.kind === 'nuts', low: c.kind === 'low', second: !!c.second };
  });
  slices[slices.length - 1].b = D.L; // exact end
  const main = slices.find((s) => s.kind === 'nuts' && !s.second);
  const targets = []; for (const s of slices) if (s.gold) { const c = (s.a + s.b) / 2; targets.push(c, 2 * D.L - c); }
  return { kind: 'dial', wheel: 'hype', L: D.L, V: D.V, G: D.G, J: D.J_PER_NUTS * (main ? main.w : 1), slices, targets, mods: m, tilt };
}

/** Hype dial straight from Fans and the activity ledger (hypeOdds). @param {number} fans @param {any[]} actLedger @param {any} [mods] */
export function hypeDialFor(fans, actLedger, mods) { const h = hypeOdds(fans, actLedger); return hypeDial(h.odds, mods, h.t); }

/** Where a STOP = {t, phi, e} lands on the dial: {t, e, base, dist, q, x (needle, folded), index}. */
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
  const t = o && Number.isFinite(o.t) ? o.t : stop === true ? carefulTap(dial.targets, 2 * dial.L, dial.V, dial.G, phi, 1 - d[3], d[4]) : DR.STOP_FROM + d[1] * (DR.COAST - DR.STOP_FROM);
  const L = dialLanding(dial, { t, phi, e }), s = dial.slices[L.index];
  let pts = s.pts, boosted = false;
  const m = dial.mods;
  if (m.bch && d[5] < m.bch) {
    const cand = dial.slices.filter((c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[6] * cand.length))];
    if (bi && bi.index === L.index) { pts += m.bval * DR.UNIT.hype; boosted = true; }
  }
  const levelIdx = MD.HYPE_LEVELS.indexOf(s.level);
  return { index: L.index, level: s.level, levelIdx, pts, perf: pts / 100, fanMult: MD.HYPE_FAN_MULT[levelIdx], boosted, t: L.t, phi, e: L.e, x: L.x };
}

// ---------------------------------------------------------------- Find reel
/**
 * Find reel for an activity {find: percent, mix: {coins, player, coach}} (js/data/activities.js ACT.TABLE row). 12-unit loop, N F N F N F N F:
 * find shares split (largest halved) until 4 find cells, order Coach, Coins, Player. Tree: find cells + rareAdd (Sharp Eyes), first Coins cell + goldAdd (Widener),
 * Extra Gold = one more Coins cell (0.75 of the first) at the end of the loop (no extra Nothing cell, so finds rise); the loop is rescaled to 12 units. Cell: {index,type,find,w,a,b,gold}.
 * @param {{find:number,mix:Record<string,number>}} act @param {any} [mods]
 */
export function findReel(act, mods = neutralMods()) {
  const R = DR.REEL, m = { ...neutralMods(), ...mods }, f = (act.find || 0) / 100;
  let sh = Object.entries(act.mix || {}).filter(([, v]) => v > 0).map(([k, v]) => [k, v / 100]);
  if (!sh.length) sh = [['coins', 1]];
  // ties: Player, then Coins, then Coach is halved first
  while (sh.length < R.CELLS) { sh.sort((a, b) => b[1] - a[1] || R.ORDER.indexOf(b[0]) - R.ORDER.indexOf(a[0])); const [k, v] = sh.shift(); sh.push([k, v / 2], [k, v / 2]); }
  sh.sort((a, b) => R.ORDER.indexOf(a[0]) - R.ORDER.indexOf(b[0]));
  const nothing = (1 - f) * R.C / R.CELLS, raw = [];
  let goldDone = false;
  for (const [type, v] of sh) {
    raw.push({ type: 'nothing', find: false, w: nothing });
    const gold = type === 'coins' && !goldDone; if (gold) goldDone = true;
    raw.push({ type, find: true, gold, w: f * R.C * v + m.rareAdd * R.RARE_K + (gold ? m.goldAdd * R.GOLD_K : 0) });
  }
  const g0 = raw.find((c) => c.gold);
  for (let e = 0; e < m.extra && g0; e++) { raw.push({ type: 'coins', find: true, gold: false, second: true, w: g0.w * DR.EXTRA_W }); }
  const tot = sum(raw.map((c) => c.w)); let x = 0;
  const cells = raw.map((c, i) => { const w = R.C * c.w / tot, a = x; x += w; return { index: i, type: c.type, find: c.find, gold: !!c.gold, second: !!c.second, w, a, b: x }; });
  cells[cells.length - 1].b = R.C;
  return { kind: 'reel', wheel: 'find', C: R.C, V: R.V, G: R.G, J: R.J, cells, targets: cells.filter((c) => c.find).map((c) => (c.a + c.b) / 2), mods: m, actFind: act.find };
}

/** Where a STOP = {t, phi, e} lands on the reel: {t, e, base, dist, q, x (offset 0..C), index}. */
export function reelLanding(reel, stop) {
  const l = landingPhase(reel, stop), x = ((l.q % reel.C) + reel.C) % reel.C;
  return { ...l, phi: stop.phi, x, index: cellAt(reel.cells, x) };
}

/**
 * Find result (same stop forms as dialResult). Always draws 8 numbers. Second Cheer: a Nothing landing gets one more random pick by width. Booster: +10 x value Coins
 * when the hidden boosted non-gold cell lands. Returns {index, type: 'coins'|'player'|'coach'|null, find, second, boosted, coinsBonus, t, phi, e, x}.
 * Coins/Player/Coach themselves are resolved by the caller as in fans-matchday SPEC s2.
 * @param {{random:()=>number}} rng @param {any} reel @param {boolean|{t:number,phi?:number,e?:number}} [stop]
 */
export function reelResult(rng, reel, stop = false) {
  const d = Array.from({ length: 8 }, () => rng.random()), o = stop && typeof stop === 'object' ? stop : null;
  const phi = o && Number.isFinite(o.phi) ? /** @type {number} */ (o.phi) : d[0] * reel.C;
  const e = o && Number.isFinite(o.e) ? /** @type {number} */ (o.e) : (d[2] * 2 - 1) * reel.J;
  const t = o && Number.isFinite(o.t) ? o.t : stop === true ? carefulTap(reel.targets, reel.C, reel.V, reel.G, phi, 1 - d[3], d[4]) : DR.STOP_FROM + d[1] * (DR.COAST - DR.STOP_FROM);
  const L = reelLanding(reel, { t, phi, e }), m = reel.mods;
  let cell = reel.cells[L.index], second = false;
  if (!cell.find && m.cheer) { const c2 = reel.cells[cellAt(reel.cells, d[5] * reel.C)]; if (c2.find) { cell = c2; second = true; } }
  let coinsBonus = 0, boosted = false;
  if (m.bch && d[6] < m.bch) {
    const cand = reel.cells.filter((c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[7] * cand.length))];
    if (bi && bi.index === L.index) { coinsBonus = m.bval * DR.UNIT.find; boosted = true; }
  }
  return { index: L.index, type: cell.find ? cell.type : null, find: cell.find, second, boosted, coinsBonus, t: L.t, phi, e: L.e, x: L.x };
}

/** Pity find: a reveal-only pick among the find cells only, by width (no aim, one draw). @param {{random:()=>number}} rng @param {any} reel */
export function pityFind(rng, reel) {
  const fc = reel.cells.filter((c) => c.find), tot = sum(fc.map((c) => c.w)); let x = rng.random() * tot;
  for (const c of fc) { if (x < c.w) return { index: c.index, type: c.type }; x -= c.w; }
  const c = fc[fc.length - 1]; return { index: c.index, type: c.type };
}

// ---------------------------------------------------------------- reveal-only wheels (Toss, Pep, Scout, Finals)
/**
 * Reveal wheel for 'toss' | 'pep' | 'scout' | 'finals' with the tree applied (port of sim build()): gold/rare widths, Extra Gold (not Toss; Finals second gold pays 40 Coins),
 * Kind Floor (Toss low slice +1%), Good Sport (Toss consolation +2.5%), Scout's Eye (Extra name +1 step). Slice: {index,id,label,w,a,b,gold,rare,low,fx,slot?}.
 * @param {string} kind @param {any} [mods]
 */
export function revealWheel(kind, mods = neutralMods()) {
  const src = DR.WHEELS[kind]; if (!src) throw new Error('revealWheel: unknown kind ' + kind);
  const m = { ...neutralMods(), ...mods };
  let sl = src.map((s) => ({ ...s, fx: { ...s.fx }, gold: !!s.gold, rare: !!s.rare, low: !!s.low }));
  for (const s of sl) { if (s.gold) s.w += m.goldAdd; if (s.rare) s.w += m.rareAdd; }
  const g0 = sl.findIndex((s) => s.gold);
  if (g0 >= 0 && kind !== 'toss') {
    const pk = { pep: 'pep', scout: 'steps', finals: 'coins' }[kind];
    for (let e = 0; e < m.extra; e++) {
      const cand = []; sl.forEach((s, i) => { if (!s.gold && i >= 3 && (s.fx[pk] || 0) >= 2) cand.push(i); });
      const pos = cand.length ? cand[e % cand.length] + 1 + e : Math.round(sl.length * (e + 1) / (m.extra + 1)) + e;
      const g = sl[g0], copy = { ...g, fx: { ...g.fx }, w: g.w * DR.EXTRA_W, rare: false, second: true };
      if (kind === 'finals') Object.assign(copy, { id: DR.FINALS_SECOND.id, label: DR.FINALS_SECOND.label, fx: { ...DR.FINALS_SECOND.fx } });
      sl.splice(pos, 0, copy);
    }
  }
  if (kind === 'toss') {
    for (const s of sl) if (s.low) { if (m.floor) s.fx.tossb = (s.fx.tossb || 0) + m.floor * DR.UNIT.toss; if (m.cons) { s.fx.tossb = 2.5; s.label = 'Good sport +1 Spoke +2.5%'; } }
  }
  if (kind === 'scout' && m.sfloor) for (const s of sl) if (s.low) { s.fx.steps = Math.max(s.fx.steps || 0, 1); s.label = 'Extra name +1 step'; }
  let x = 0;
  const slices = sl.map((s, i) => { const a = x; x += s.w; return { ...s, index: i, a, b: x }; });
  return { kind, wheel: kind, widget: DR.REVEAL[kind].widget, slices, total: x, mods: m, widths: slices.map((s) => s.w) };
}

/**
 * Reveal result: the pre-drawn pick by width (an honest free spin), always 6 draws. Booster adds a unit to the boosted non-gold slice when it lands (Pep: 0.5 per value, as a
 * 50%-per-value extra player). Pep Rally: 50% the next slot is pepped too (expected x1.5). Prize Pair: Finals Coins/TP/Fans x1.5 (rounded), never Medals.
 * Returns {index, id, label, fx, boosted, slot, slots (pep), neighbour (pep)}.
 * @param {{random:()=>number}} rng @param {any} wheel from revealWheel
 */
export function revealResult(rng, wheel) {
  const d = Array.from({ length: 6 }, () => rng.random()), m = wheel.mods;
  let x = d[0] * wheel.total, i = 0;
  while (i < wheel.slices.length - 1 && x >= wheel.slices[i].b) i++;
  const s = wheel.slices[i], fx = { ...s.fx }; let boosted = false;
  if (m.bch && d[1] < m.bch) {
    const cand = wheel.slices.filter((c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[2] * cand.length))];
    if (bi && bi.index === i) {
      boosted = true; const v = m.bval;
      if (wheel.kind === 'toss') fx.tossb = (fx.tossb || 0) + v * DR.UNIT.toss;
      else if (wheel.kind === 'scout') fx.steps = (fx.steps || 0) + v * DR.UNIT.scout;
      else if (wheel.kind === 'finals') fx.coins = (fx.coins || 0) + v * DR.UNIT.finals;
      else if (wheel.kind === 'pep') fx.pep = (fx.pep || 0) + (d[3] < clamp(v * DR.UNIT.pep, 0, 1) ? 1 : 0);
    }
  }
  const out = { index: i, id: s.id, label: s.label, fx, boosted, slot: s.slot || null, slots: /** @type {number[]} */ ([]), neighbour: false };
  if (wheel.kind === 'finals' && m.nb) for (const k of ['coins', 'tp', 'fans']) if (fx[k]) fx[k] = Math.floor(fx[k] * 1.5 + 0.5);
  if (wheel.kind === 'pep') {
    const a = s.slot || 1 + Math.min(5, Math.floor(d[4] * 6)); // double pep: a random pair
    out.slots = [a];
    let b = 0;
    if (s.id === 'double' || fx.pep >= 2) { b = 1 + Math.min(4, Math.floor(d[5] * 5)); if (b >= a) b++; out.slots.push(b); }
    if (m.nb) { out.neighbour = d[5] < 0.5; if (out.neighbour) { const n = (a % 6) + 1; if (!out.slots.includes(n)) out.slots.push(n); } }
    out.fx.pep = out.slots.length;
  }
  return out;
}

/**
 * Pure timing for the UI (03 section 5, contract times: Toss and Pep 2.5 s, Scout and Finals 3 s of spin, then a 0.3 s hold). target = slice index
 * (pep: slot 0..5; toss: 0 won face, 1 lost face). Spin-up 0.2/1.5, cruise 0.6/1.5, cubic ease-out 0.7/1.5 of the spin time. Reduced motion: skip the spin, show at once.
 * Returns plain data: {kind, widget, seconds, hold, total, up, cruise, ease, target, flips?, turns?, steps?}. Use revealProgress(plan, t) for 0..1 travel.
 * @param {string} kind @param {number} [target]
 */
export function revealPlan(kind, target = 0) {
  const R = DR.REVEAL, c = R[kind]; if (!c || typeof c !== 'object') throw new Error('revealPlan: unknown kind ' + kind);
  const sec = c.seconds, plan = { kind, widget: c.widget, seconds: sec, hold: R.HOLD, total: sec + R.HOLD, up: R.UP * sec, cruise: R.CRUISE * sec, ease: R.EASE * sec, target };
  if (kind === 'toss') return { ...plan, flips: c.flips, turns: c.flips + (target === 1 ? 0.5 : 0) };
  if (kind === 'pep') return { ...plan, steps: pepSteps(target, sec) };
  return { ...plan, turns: c.turns };
}

/** Pep light chase: the lit light index (0..5) after each step and the time (s) it lights; n = 6 + target steps, d_i = 0.06 + 0.20 (i/10)^2 rescaled to `seconds`. */
export function pepSteps(slot0, seconds = DR.REVEAL.pep.seconds) {
  const R = DR.REVEAL, n = 6 + clamp(slot0 | 0, 0, 5), d = [];
  for (let i = 0; i < n; i++) d.push(R.PEP_STEP0 + R.PEP_STEP_GROW * Math.pow(i / R.PEP_STEP_REF, 2));
  const k = seconds / sum(d); let t = 0;
  return d.map((di, i) => { t += di * k; return { light: (i + 1) % 6, at: t - di * k }; }).map((s, i, a) => ({ ...s, end: i + 1 < a.length ? a[i + 1].at : seconds }));
}

/** Travel 0..1 at time t (s from the start of the spin): linear ramp up, constant cruise, cubic ease-out to rest. Reaches exactly 1 at plan.seconds. */
export function revealProgress(plan, t) {
  const { up, cruise, ease, seconds } = plan; if (t <= 0) return 0; if (t >= seconds) return 1;
  const tot = up / 2 + cruise + ease / 3; // distance in units of the cruise speed
  let dist;
  if (t < up) dist = (t * t) / (2 * up);
  else if (t < up + cruise) dist = up / 2 + (t - up);
  else { const s = (t - up - cruise) / ease; dist = up / 2 + cruise + (ease / 3) * (1 - Math.pow(1 - s, 3)); }
  return dist / tot;
}
