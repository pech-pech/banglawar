// @ts-check
// Wheel meta w2 in the store: Hype dial, Toss and Pep reveals, Find reel, Scout and Finals reveals. Resolution + the plain data the views need.
// All of it is a no-op / null when FLAGS.wheelMeta is false (r9 behaviour). Every roll is seeded `<season seed>|wm|<wheel>|<key>`; never Math.random.
// Results are written to the state the moment the player taps (the view only animates to getPending()), so a reload shows the same result.
// Imports core only (commands.js and selectors.js both import this; it must not import them).
import { FLAGS } from '../data/flags.js';
import { MD } from '../data/matchday.js';
import { ACT } from '../data/activities.js';
import { ECON as E } from '../data/economy.js';
import { makeRng } from '../core/rng.js';
import { effective, recordSpin } from '../core/wheelmeta.js';
import { hypeDialFor, dialResult, findReel, reelResult, pityFind, revealWheel, revealResult, modsFor } from '../core/dialreel.js';
import { activityOptions, actLedger, roundKey } from '../core/activities.js';

const clone = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x));
const on = () => !!FLAGS.wheelMeta;
const HYPE_LABEL = { low: 'Quiet', med: 'Good', high: 'Big', nuts: 'Wild' };
const COIN_FACES = [{ label: 'Won toss', w: 1 }, { label: 'Good sport', w: 1 }];

/** The player's STOP from a command payload: {stop:{t,phi,e}} (the view), careful:true (synthetic careful tap), else a random tap. @param {any} p */
export function stopOf(p) {
  const o = p && p.stop;
  if (o && typeof o === 'object' && Number.isFinite(o.t)) return { t: o.t, phi: o.phi, e: o.e };
  return !!(p && p.careful);
}
const fixtureKey = (/** @type {any} */ s) => `${s.fixture.kind}|${s.fixture.round}|${s.salt}`;
const rngFor = (/** @type {any} */ s, /** @type {string} */ tag, /** @type {string} */ key) => makeRng(`${s.season.seed}|wm|${tag}|${key}`);
const seasonN = (/** @type {any} */ s) => (s.season && s.season.n) || 1;
export const actLedgerFor = (/** @type {any} */ s) => (FLAGS.activities && s.econ && s.econ.act ? actLedger(s) : []);

// ---------------------------------------------------------------- match day: Hype dial, Toss, Pep
/** The Hype dial for this fixture's match day (Fans, activity ledger, tree). @param {any} s */
export function hypeDialOf(s) { return hypeDialFor(s.econ ? s.econ.fans : 0, actLedgerFor(s), modsFor(effective(s), 'hype')); }
export const tossWheelOf = (/** @type {any} */ s) => revealWheel('toss', modsFor(effective(s), 'toss'));
export const pepWheelOf = (/** @type {any} */ s) => revealWheel('pep', modsFor(effective(s), 'pep'));

/** Is this wheel of the match day already spun? @param {any} s @param {'hype'|'toss'|'pep'} which */
export const mdSpun = (s, which) => !!(s && s.fixture && s.fixture.md && s.fixture.md.wm && s.fixture.md.wm[which]);

/** Command guard: the match-day screen is open with a rolled day and this wheel is not spun yet. @param {any} s @param {string} which */
export const canMdSpin = (s, which) => on() && FLAGS.matchday && !!s.season && !!s.fixture && s.stage === 'matchday' && !!s.fixture.md && !mdSpun(s, /** @type {any} */ (which));

/**
 * Resolve one match-day wheel and write it to fixture.md (+ recordSpin). stop: see stopOf. No stage guard (settleMd uses it too).
 * md fields written: hype/hypeIdx/hypeFanMult/hypePerf, toss/tossBoost, pepSlot/pepSlots, wm.<which> = the shown result.
 * @param {any} s @param {'hype'|'toss'|'pep'} which @param {boolean|{t:number,phi?:number,e?:number}} stop @param {any[]} [six]
 */
export function mdSpin(s, which, stop, six) {
  const n = clone(s), m = n.fixture.md; m.wm = { ...(m.wm || {}) };
  const rng = rngFor(n, which, fixtureKey(n)), eff = effective(n);
  let t = n, opts = {};
  if (which === 'hype') {
    const r = dialResult(rng, hypeDialOf(n), stop);
    m.hype = r.level; m.hypeIdx = r.levelIdx; m.hypeFanMult = r.fanMult; m.hypePerf = r.perf;
    m.wm.hype = { index: r.index, level: r.level, pts: r.pts, boosted: r.boosted };
  } else if (which === 'toss') {
    const w = revealWheel('toss', modsFor(eff, 'toss')), r = revealResult(rng, w), tb = +r.fx.tossb || 0;
    m.toss = r.id === 'won' ? 'won' : 'lost'; m.tossBoost = tb / 100;
    m.wm.toss = { index: r.id === 'won' ? 0 : 1, id: r.id, boostPct: tb };
    opts = { sportSlice: r.id === 'sport' };
  } else {
    const w = revealWheel('pep', modsFor(eff, 'pep')), r = revealResult(rng, w);
    m.pepSlots = r.slots.slice(); m.pepSlot = r.slots[0];
    const ids = six || (n.clubs && n.clubs[0] ? n.clubs[0].six : []);
    m.pepIds = r.slots.map((x) => (ids[x - 1] != null ? ids[x - 1] : null)).filter((x) => x != null); m.pepId = m.pepIds.length ? m.pepIds[0] : null;
    m.wm.pep = { index: r.slots[0] - 1, slots: r.slots.slice(), id: r.id };
  }
  return recordSpin(t, which, opts);
}

/** Match start: any of the three wheels not yet spun gets a random tap (the game never blocks). Makes the md if there is none. @param {any} s @param {(s:any, six:any[])=>any} mdFor */
export function settleMd(s, mdFor) {
  if (!on() || !FLAGS.matchday || !s || !s.season || !s.fixture) return s;
  let t = s;
  if (!t.fixture.md) { const md = mdFor(t, t.clubs[0].six); if (!md) return s; t = { ...t, fixture: { ...t.fixture, md } }; }
  for (const w of /** @type {const} */ (['hype', 'toss', 'pep'])) if (!mdSpun(t, w)) t = mdSpin(t, w, false, t.clubs[0].six);
  return t;
}

/** The three spin widgets for the match-day screen. null with the flag off or no md. pending = the stored result (or null). @param {any} s */
export function mdSpinVM(s) {
  if (!on() || !FLAGS.matchday || !s.fixture || !s.fixture.md || !s.season) return null;
  const md = s.fixture.md, wm = md.wm || {}, E2 = effective(s);
  const d = hypeDialOf(s);
  const slices = d.slices.map((c) => ({ label: HYPE_LABEL[c.level], sub: '+' + c.pts + '%', w: c.w, gold: !!c.gold }));
  const hp = wm.hype ? { index: wm.hype.index, jackpot: wm.hype.level === 'nuts', level: wm.hype.level, pts: wm.hype.pts } : null;
  const sixN = [0, 1, 2, 3, 4, 5].map((i) => ({ label: String(i + 1), w: 1 }));
  return {
    hype: { slices, pending: hp, guide: !!(E2.hype && E2.hype.guide), spun: !!wm.hype },
    toss: { slices: COIN_FACES.map((c) => ({ ...c })), pending: wm.toss ? { index: wm.toss.index, boostPct: wm.toss.boostPct, sport: wm.toss.id === 'sport' } : null, spun: !!wm.toss },
    pep: { slices: sixN, pending: wm.pep ? { index: wm.pep.index, slots: wm.pep.slots.slice() } : null, spun: !!wm.pep },
  };
}

// ---------------------------------------------------------------- Find reel (fan activity)
const WORD = { coins: 'Coins', player: 'Player', coach: 'Coach', nothing: 'Nothing' };
const rowOf = (/** @type {string} */ id) => ACT.TABLE.find((r) => r.id === id) || null;
export const findReelOf = (/** @type {any} */ s, /** @type {string} */ id) => { const row = rowOf(id); return row ? findReel(row, modsFor(effective(s), 'find')) : null; };
const findKey = (/** @type {any} */ s, /** @type {string} */ id) => `${roundKey(s)}|${id}`;

/** What the reel decided for picking activity `id` now: {find, kind, bonus, index, pity, boosted} or null (flag off, repeat week, rest, refused). @param {any} s @param {string} id @param {any} p */
export function findForce(s, id, p) {
  if (!on() || !s.season || !s.econ) return null;
  const o = activityOptions(s), line = o.rows.find((r) => r.id === id), reel = findReelOf(s, id);
  if (!o.open || !line || !line.ok || line.repeat || !reel) return null;
  const rng = rngFor(s, 'find', findKey(s, id));
  if (o.pity) { const r = pityFind(rng, reel); return { find: true, kind: r.type, bonus: 0, index: r.index, pity: true, boosted: false }; }
  const r = reelResult(rng, reel, stopOf(p));
  return { find: r.find, kind: r.type, bonus: r.coinsBonus || 0, index: r.index, pity: false, boosted: r.boosted };
}
/** After pickActivity: tally + the pending reel result kept on s.findSpin. @param {any} s @param {string} id @param {any} force */
export function afterFind(s, id, force) {
  const n = clone(recordSpin(s, 'find'));
  n.findSpin = { key: roundKey(s), id, index: force.index, type: force.kind, find: !!force.find, pity: !!force.pity, boosted: !!force.boosted };
  return n;
}
/** Reel props for one activity's Find (before the pick) + the stored result of the pick just made. null with the flag off / a repeat week. @param {any} s @param {string} id */
export function findSpinVM(s, id) {
  if (!on() || !s.season || !s.econ) return null;
  const reel = findReelOf(s, id); if (!reel) return null;
  const cells = reel.cells.map((c) => ({ label: WORD[c.type], w: c.w, find: c.find, tone: c.find ? (c.gold ? 'gold' : c.type) : 'none', gold: c.gold }));
  const fs = s.findSpin && s.findSpin.id === id ? s.findSpin : null;
  const E2 = effective(s);
  return { cells, guide: !!(E2.find && E2.find.guide), pending: fs ? { index: fs.index, type: fs.type, find: fs.find, pity: fs.pity, jackpot: !!(fs.find && reel.cells[fs.index] && reel.cells[fs.index].gold) } : null, pityNext: activityOptions(s).pity };
}

// ---------------------------------------------------------------- Scout list
/** Command guard for ScoutSpin: flag, the list is still open, not spun this season. @param {any} s @param {()=>any[]} list */
export const canScoutSpin = (s, list) => on() && !!s.season && !(s.scoutSpin && s.scoutSpin.n === seasonN(s)) && list().length > 0;
/** One Scout spin: stores s.scoutSpin {n,index,id,steps,extra} (scoutList in core/training.js reads it) + recordSpin. @param {any} s */
export function scoutSpin(s) {
  const r = revealResult(rngFor(s, 'scout', String(seasonN(s))), revealWheel('scout', modsFor(effective(s), 'scout')));
  const n = clone(recordSpin(s, 'scout'));
  n.scoutSpin = { n: seasonN(s), index: r.index, id: r.id, steps: +r.fx.steps || 0, extra: +r.fx.extraName || 0 };
  return n;
}
/** Scout reveal props. spun = already spun this season. @param {any} s */
export function scoutSpinVM(s) {
  if (!on() || !s.season) return null;
  const w = revealWheel('scout', modsFor(effective(s), 'scout')), sp = s.scoutSpin && s.scoutSpin.n === seasonN(s) ? s.scoutSpin : null;
  return { cells: w.slices.map((c) => ({ label: c.label, w: c.w, tone: c.gold ? 'gold' : 'none', gold: !!c.gold })), spun: !!sp, pending: sp ? { index: sp.index, steps: sp.steps, extra: sp.extra, jackpot: sp.id === 'top2' } : null };
}

// ---------------------------------------------------------------- Finals prize
const finalsKey = (/** @type {any} */ s) => `${seasonN(s)}|${s.fixture.kind}|${s.fixture.round}`;
/** Command guard for FinalsSpin: result screen of a semi or final, not spun for this fixture. @param {any} s */
export const canFinalsSpin = (s) => on() && !!s.season && !!s.fixture && s.stage === 'done' && (s.fixture.kind === 'semi' || s.fixture.kind === 'final') && !(s.finalsSpin && s.finalsSpin.key === finalsKey(s));
/** One Finals reel spin: pays Coins / TP / Fans / Medal now (ledger row), keeps s.finalsSpin for a reload, recordSpin. @param {any} s */
export function finalsSpin(s) {
  const r = revealResult(rngFor(s, 'finals', finalsKey(s)), revealWheel('finals', modsFor(effective(s), 'finals'))), fx = r.fx;
  const n = clone(recordSpin(s, 'finals'));
  const coins = fx.coins | 0, tp = fx.tp | 0, fans = fx.fans | 0, medal = fx.medal | 0;
  if (n.econ) {
    n.econ.coins += coins; n.econ.fans += fans; n.econ.medals = (n.econ.medals | 0) + medal;
    n.econ.ledger.push({ k: 'finalsprize', kind: n.fixture.kind, coins, tp, fans, medals: medal });
    if (n.econ.ledger.length > E.LEDGER_MAX) n.econ.ledger.splice(0, n.econ.ledger.length - E.LEDGER_MAX);
  }
  if (tp && n.training) { n.training.tp += tp; if (n.season) n.season.tpWon += tp; }
  n.finalsSpin = { key: finalsKey(s), index: r.index, id: r.id, label: r.label, coins, tp, fans, medal };
  return n;
}
/** Finals reveal props for the result screen. due = a semi/final result is showing and the prize is not spun. null otherwise. @param {any} s */
export function finalsSpinVM(s) {
  if (!on() || !s.season || !s.fixture || s.stage !== 'done' || (s.fixture.kind !== 'semi' && s.fixture.kind !== 'final')) return null;
  const w = revealWheel('finals', modsFor(effective(s), 'finals')), fs = s.finalsSpin && s.finalsSpin.key === finalsKey(s) ? s.finalsSpin : null;
  return { due: !fs, cells: w.slices.map((c) => ({ label: c.label, w: c.w, tone: c.gold ? 'gold' : 'none', gold: !!c.gold })),
    pending: fs ? { index: fs.index, label: fs.label, coins: fs.coins, tp: fs.tp, fans: fs.fans, medal: fs.medal, jackpot: fs.medal > 0 } : null };
}
