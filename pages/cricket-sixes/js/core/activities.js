// @ts-check
// Fan activities and the trial find (r9, fans-matchday SPEC s2, M Q1). Pure: every function returns a new state; the same state object when refused.
// Once a round (league, semi or final) the club may pick one activity (Coins -> Fans now, a hype tilt for the next matches, a find roll) or rest (free).
// Finds: Coins, a trial Player or a trial Coach (s.trial, Sign or Decline). Find rolls use their own rng stream (seed + round + id), never the match rng.
import { ECON as E } from '../data/economy.js';
import { ACT } from '../data/activities.js';
import { FLAGS } from '../data/flags.js';
import { SQUAD } from '../data/run.js';
import { SEASON } from '../data/season.js';
import { leagueOf } from '../data/leagues.js';
import { SURNAMES } from '../data/names.js';
import { makeRng } from './rng.js';
import { rollPotential } from './ability.js';
import { canAfford, reserveLow, wageOf, RESERVE_WARNING } from './economy.js';
import { coachList, MAX_COACHES } from './training.js';

const rd = Math.round;
const clone = (/** @type {any} */ o) => JSON.parse(JSON.stringify(o));
const league = (/** @type {any} */ s) => Math.min(5, Math.max(1, Math.round(s.season?.league ?? s.league ?? 1)));
const rowOf = (/** @type {string} */ id) => ACT.TABLE.find((r) => r.id === id) || null;
const histOf = (/** @type {any} */ s) => (s.econ && s.econ.act && Array.isArray(s.econ.act.hist) ? s.econ.act.hist : []);

/** Round number inside the run: league rounds 1..9, semi 10, final 11, anything later 12. Stride 12 per season. @param {any} s */
export function roundIdx(s) {
  const se = s.season || {}, n = se.n || 1, ph = se.phase || 'league';
  const r = ph === 'league' ? Math.min(9, Math.max(1, se.round || 1)) : ph === 'semi' ? 10 : ph === 'final' ? 11 : 12;
  return (n - 1) * 12 + r;
}
/** Stable text key of the round (rng seed + once-a-round guard). @param {any} s */
export const roundKey = (s) => `${s.season?.n || 1}.${roundIdx(s)}`;

/** Raw hype tilts of this round, last round and the round before: [t0, t1, t2], 0 where nothing was picked (rest = 0). Newest first; the engine applies HYPE_ACT_DECAY and the cap. @param {any} s */
export function actLedger(s) {
  const cur = roundIdx(s), h = histOf(s);
  return Array.from({ length: ACT.TILT_WINDOW }, (_, d) => { const r = h.find((/** @type {any} */ x) => x.idx === cur - d); return r ? r.tilt : 0; });
}
const lastRound = (/** @type {any} */ s) => histOf(s).find((/** @type {any} */ x) => x.idx === roundIdx(s) - 1) || null;
const fansMultFor = (/** @type {any} */ s) => Math.pow(E.FAN_MULT[league(s) - 1], ACT.ACT_FANS_LEAGUE_SCALE);
const costOf = (/** @type {any} */ s, /** @type {any} */ row) => rd(row.coins * E.COIN_MULT[league(s) - 1]);
const fansOf = (/** @type {any} */ s, /** @type {any} */ row, /** @type {boolean} */ repeat) => rd(row.fans * fansMultFor(s) * (repeat ? ACT.ACT_REPEAT_FACTOR : 1));

/** The pending trial find, or null. @param {any} s */
export const trialOf = (s) => (s.trial && (s.trial.player || s.trial.coach) ? s.trial : null);

/**
 * This week's offer. open = flag on, a playable round, nothing picked yet. Each row: cost (x Coin mult), Fans (x Fans mult, halved on a repeat), hype tilt, find %.
 * A repeat pick never rolls a find (findPct 0). ok is false when unaffordable or in arrears; warn is set (never blocks) when the wage reserve gets low.
 * @param {any} s
 */
export function activityOptions(s) {
  const key = roundKey(s), done = s.econ && s.econ.act && s.econ.act.doneKey === key;
  const phase = s.season?.phase || 'league';
  const on = !!FLAGS.activities;
  let why = '';
  if (!on) why = 'off'; else if (!s.econ) why = 'none'; else if (!['league', 'semi', 'final'].includes(phase)) why = 'closed'; else if (done) why = 'done';
  const open = !why;
  const prev = lastRound(s);
  const dry = (s.econ && s.econ.act && s.econ.act.dry) | 0;
  const rows = ACT.TABLE.map((r) => {
    const cost = costOf(s, r), repeat = !!(prev && prev.id === r.id);
    const bad = !open ? why : !canAfford(s, cost) ? (s.econ.arrears > 0 ? 'Pay the wages first' : `Needs ${cost} Coins`) : '';
    return { id: r.id, name: r.name, blurb: r.blurb, coins: cost, fans: fansOf(s, r, repeat), tilt: r.tilt, findPct: repeat ? 0 : r.find, repeat, ok: !bad, why: bad, warn: !bad && reserveLow(s, cost) ? RESERVE_WARNING : '' };
  });
  return { on, open, why, key, picked: done ? s.econ.act.lastId : null, pity: dry >= ACT.ACT_PITY_WEEKS, dry, rest: { id: 'rest', ok: open }, rows };
}

/** The find rng: seed + round + activity, so a reload gives the same find. @param {any} s @param {string} id */
export const activityRng = (s, id) => makeRng(`${s.seed || 'sixes'}|act|${roundKey(s)}|${id}`);

/** @param {any} s @param {any} rng @param {number} cost */
function rollPlayer(s, rng) {
  const L = league(s), se = s.season || {}, n = se.n || 1, mean = leagueOf(L).ratingMean + (s.econ.fac?.scout || 0);
  const rate = () => Math.round(Math.min(99, Math.max(1, rng.normalish(mean, E_SD))));
  const names = new Set((s.clubs?.[0]?.squad || []).map((/** @type {any} */ p) => p.name));
  const pool = SURNAMES.filter((x) => !names.has(x));
  const roles = Object.entries(SEASON.roles).flatMap(([k, c]) => Array(/** @type {number} */ (c)).fill(k));
  const types = Object.entries(SEASON.types).flatMap(([k, c]) => Array(/** @type {number} */ (c)).fill(k));
  const p = { id: `t${roundKey(s).replace('.', '-')}`, name: rng.pick(pool.length ? pool : SURNAMES), bat: rng.pick(roles), bowl: rng.pick(types), bp: rate(), bs: rate(), spd: rate(), bsk: rate(), potential: 0, drillsHere: 0, nodes: { bat: 0, bowl: 0 } };
  p.potential = rollPotential(rng, { league: L, academy: Math.max(1, s.econ.fac?.academy || 1), minCapSum: p.bp + p.bs + p.spd + p.bsk + SEASON.capRoom });
  return p;
}
const E_SD = 8;

/**
 * Pick an activity (or 'rest'). Pays Coins, adds Fans, records the tilt, rolls a find on its own stream. Refused (same state) when closed, unknown, done or unaffordable.
 * Fixed draw order on rng: find roll, find kind, Coins amount, then the player draw. Coach with no free slot, or a trial already waiting, turns into Coins.
 * Wheel meta: `force` = the Find reel's result {find, kind, bonus} replaces the percent roll (the draws are still taken, so the stream keeps its order).
 * @param {any} s @param {string} id @param {{random:()=>number, normalish:Function, pick:Function}} [rng] @param {{find:boolean, kind:string|null, bonus?:number}|null} [force]
 */
export function pickActivity(s, id, rng, force = null) {
  const o = activityOptions(s);
  if (!o.open) return s;
  const e = clone(s.econ); e.act = e.act || { hist: [], dry: 0, doneKey: null };
  const idx = roundIdx(s);
  if (id === 'rest') {
    e.act.hist = [{ idx, key: o.key, id: 'rest', tilt: 0, coins: 0, fans: 0, find: null }, ...e.act.hist].slice(0, 6);
    e.act.doneKey = o.key; e.act.lastId = 'rest';
    return { ...s, econ: e };
  }
  const row = rowOf(id), line = o.rows.find((r) => r.id === id);
  if (!row || !line || !line.ok) return s;
  const r = rng || activityRng(s, id);
  const cost = line.coins, fans = line.fans;
  e.coins -= cost; e.fans += fans;
  const ledger = (/** @type {any} */ x) => { e.ledger.push(x); if (e.ledger.length > E.LEDGER_MAX) e.ledger.splice(0, e.ledger.length - E.LEDGER_MAX); };
  ledger({ k: 'act', id, coins: cost, fans });
  let find = null, trial = null, rolled = false;
  const uFind = r.random(), uKind = r.random(), uCoins = r.random();
  if (!line.repeat) {
    rolled = true;
    const pity = e.act.dry >= ACT.ACT_PITY_WEEKS;
    if (force ? force.find : (pity || uFind * 100 < row.find)) {
      const m = row.mix, t = uKind * (m.coins + m.player + m.coach);
      let kind = force && force.kind ? force.kind : t < m.coins ? 'coins' : t < m.coins + m.player ? 'player' : 'coach';
      const lo = ACT.ACT_COIN_FIND[0], hi = ACT.ACT_COIN_FIND[1], gain = rd(cost * (lo + (hi - lo) * uCoins));
      const taken = trialOf(s) != null;
      if (kind === 'player' && (taken)) kind = 'coins';
      if (kind === 'coach' && (taken || coachList(s).length >= MAX_COACHES)) kind = 'coins';
      if (kind === 'coins') { e.coins += gain; find = { type: 'coins', coins: gain }; ledger({ k: 'actfind', id, coins: gain }); }
      else if (kind === 'player') { const p = rollPlayer({ ...s, econ: e }, r); trial = { kind: 'player', player: p, wage: wageOf(p), from: id, key: o.key }; find = { type: 'player', id: p.id }; }
      else {
        const L = league(s), n = s.season?.n || 1, step = Math.max(1, Math.min(21, 5 + 3 * (L - 1) + Math.floor(r.random() * 5) - 2));
        const used = new Set((s.coaches || []).map((/** @type {any} */ c) => c.name));
        const pool = SURNAMES.filter((x) => !used.has(x));
        const runNo = (s.run && s.run.no) || 1; // r9 L4: the run number keeps ids unique across runs (a carried coach keeps his id)
        const coach = { id: `tc${runNo}.${n}-${roundIdx(s)}`, name: r.pick(pool.length ? pool : SURNAMES), step, strong: r.random() < 0.5 ? ['bat'] : ['bowl'], away: 0, courseSeason: null };
        trial = { kind: 'coach', coach, wage: 0, from: id, key: o.key }; find = { type: 'coach', id: coach.id };
      }
      e.act.dry = 0;
      if (force && force.bonus) { e.coins += force.bonus; ledger({ k: 'actfind', id, coins: force.bonus, bonus: true }); }
    } else e.act.dry = (e.act.dry | 0) + 1;
  }
  e.act.hist = [{ idx, key: o.key, id, tilt: row.tilt, coins: cost, fans, find, rolled }, ...e.act.hist].slice(0, 6);
  e.act.doneKey = o.key; e.act.lastId = id;
  const out = { ...s, econ: e };
  return trial ? { ...out, trial } : out;
}

/** Sign the waiting trial find: a player needs a free squad place (the squad max applies), a coach a free coach slot. Same state when it cannot. @param {any} s */
export function signTrial(s) {
  const t = trialOf(s); if (!t) return s;
  const n = clone(s); delete n.trial;
  const e = n.econ; e.ledger.push({ k: 'trial', what: t.kind, id: (t.player || t.coach).id, name: (t.player || t.coach).name, wage: t.wage, signed: true });
  if (t.kind === 'player') {
    const c = n.clubs[0];
    if (c.squad.length >= SQUAD.size || c.squad.some((/** @type {any} */ x) => x.id === t.player.id)) return s;
    c.squad.push(clone(t.player));
  } else {
    if (coachList(s).length >= MAX_COACHES || (s.coaches || []).some((/** @type {any} */ c) => c.id === t.coach.id)) return s; // r9 L4: never two coaches with one id
    n.coaches = (n.coaches || []).concat([clone(t.coach)]);
  }
  if (e.ledger.length > E.LEDGER_MAX) e.ledger.splice(0, e.ledger.length - E.LEDGER_MAX);
  return n;
}
/** Decline the trial find (always allowed, free). @param {any} s */
export function declineTrial(s) {
  const t = trialOf(s); if (!t) return s;
  const n = clone(s); delete n.trial;
  n.econ.ledger.push({ k: 'trial', what: t.kind, id: (t.player || t.coach).id, name: (t.player || t.coach).name, wage: t.wage, signed: false });
  if (n.econ.ledger.length > E.LEDGER_MAX) n.econ.ledger.splice(0, n.econ.ledger.length - E.LEDGER_MAX);
  return n;
}
/** Can the waiting trial be signed? { ok, why } for the card (squad full -> release first). @param {any} s */
export function canSignTrial(s) {
  const t = trialOf(s); if (!t) return { ok: false, why: 'none' };
  if (t.kind === 'player') return s.clubs[0].squad.length >= SQUAD.size ? { ok: false, why: SQUAD.fullText } : { ok: true, why: '' };
  if ((s.coaches || []).some((/** @type {any} */ c) => c.id === t.coach.id)) return { ok: false, why: 'Already on your staff' };
  return coachList(s).length >= MAX_COACHES ? { ok: false, why: 'Coach slots full: release one first' } : { ok: true, why: '' };
}
