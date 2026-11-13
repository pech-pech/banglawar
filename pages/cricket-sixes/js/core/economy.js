// @ts-check
// Club economy (P8): Coins, Fans, Medals, stadium + facilities, wages, arrears, finals, sinks, Medal shop, Legacy, transfer value.
// Pure: every function returns a new state (s.econ is cloned); no clock, no Math.random, no DOM, no storage.
// Reads (never writes) s.season.league / s.season.n, s.clubs[0].squad / .six, s.retired (array). Numbers: js/data/economy.js.
import { ECON as E } from '../data/economy.js';

export const newEconomy = () => ({
  coins: E.START_COINS, fans: 0, medals: 0, stadium: 1, fac: { ...E.FAC_START }, build: null,
  arrears: 0, missed: 0, sinks: {}, legacy: 0, ledger: [],
});

const clone = (/** @type {any} */ o) => JSON.parse(JSON.stringify(o));
const econOf = (/** @type {any} */ s) => s.econ || newEconomy();
const withEcon = (/** @type {any} */ s, /** @type {any} */ e) => ({ ...s, econ: e });
const league = (/** @type {any} */ s) => Math.min(5, Math.max(1, Math.round(s.season?.league ?? s.league ?? 1)));
const seasonN = (/** @type {any} */ s) => s.season?.n ?? s.seasonN ?? 1;
const club = (/** @type {any} */ s) => s.clubs?.[0] || null;
const squad = (/** @type {any} */ s) => club(s)?.squad || s.squad || [];
const coinMult = (/** @type {any} */ s) => E.COIN_MULT[league(s) - 1];
const fanMult = (/** @type {any} */ s) => E.FAN_MULT[league(s) - 1];
const rd = Math.round;
const note = (/** @type {any} */ e, /** @type {any} */ row) => { e.ledger.push(row); if (e.ledger.length > E.LEDGER_MAX) e.ledger.splice(0, e.ledger.length - E.LEDGER_MAX); };
const sumLevels = (/** @type {any} */ e) => E.FAC.reduce((a, k) => a + (e.fac[k] || 0), 0);
const inArrears = (/** @type {any} */ e) => e.arrears > 0;

// ---- players: wage, fee, transfer value ----
const avgOf = (/** @type {any} */ p) => (p.bp + p.bs + p.spd + p.bsk) / 4;
const revealed = (/** @type {any} */ p) => (p.drillsHere || 0) >= E.REVEAL_AFTER_DRILLS;
/** Linear between points, flat outside. @param {number} pot */
function potFactor(pot) {
  const t = E.POT_FACTOR;
  if (pot <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (pot <= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y0 + (y1 - y0) * (pot - x0) / (x1 - x0); }
  return t[t.length - 1][1];
}
/** Wage a match, whole Coins, no league multiplier. Potential factor only once P is revealed. @param {any} p */
export function wageOf(p) {
  const w = E.WAGE_FLOOR + E.WAGE_K * Math.pow(avgOf(p) / E.WAGE_REF, E.WAGE_P);
  return rd(revealed(p) ? w * potFactor(p.potential) : w);
}
/** Signing fee = 6 x shown sum x max(1, avg/50). @param {any} p */
export const feeOf = (p) => { const sum = p.bp + p.bs + p.spd + p.bsk; return rd(E.FEE_PER_POINT * sum * Math.max(1, sum / 4 / E.WAGE_REF)); };
/** Coins for selling/releasing. Revealed: 50% x 6 x capSum(P) x max(1, capAvg/50). Hidden: 50% of the fee. @param {any} p */
export function transferValue(p) {
  if (!revealed(p) && p.bp != null) return rd(E.RELEASE_REFUND * feeOf(p));
  const capAvg = 1 + (p.potential - 20) * 98 / 180, capSum = rd(4 * capAvg);
  return rd(E.TRANSFER_PCT * E.FEE_PER_POINT * capSum * Math.max(1, capAvg / E.WAGE_REF));
}
const holidayOn = (/** @type {any} */ s, /** @type {any} */ e) => e.sinks.wageHolidaySeason === seasonN(s);
const wageTotal = (/** @type {any} */ s, /** @type {any} */ e) => { const t = squad(s).reduce((a, p) => a + wageOf(p), 0); return holidayOn(s, e) ? rd(t / 2) : t; };

// ---- match income ----
export const seatsOf = (/** @type {any} */ e) => E.CAP[e.stadium] * (1 + E.STANDS_CAP_PCT[e.fac.stands] / 100);
/** @param {any} s @param {{win?:boolean, tie?:boolean}} result */
export function matchIncome(s, result = {}) {
  const e = econOf(s), m = coinMult(s), seats = seatsOf(e);
  const fill = Math.min(E.FILL_MAX, E.FILL_BASE + E.FILL_PER_FAN * e.fans / seats);
  const gate = rd(seats * fill * E.TICKET);
  const winBonus = result.win ? rd(E.WIN_BONUS * m) : 0;
  const shop = rd(E.SHOP[e.fac.shop] * m);
  const wages = wageTotal(s, e);
  const upkeep = rd(E.UPKEEP * m * (sumLevels(e) + 2 * (e.stadium - 1)));
  const fans = rd((result.win ? E.FAN_WIN : E.FAN_LOSS) * fanMult(s)) + E.FAN_STANDS[e.fac.stands];
  return { gate, winBonus, shop, wages, upkeep, net: gate + winBonus + shop - wages - upkeep, fans };
}
/** Pay one match: earn, then pay upkeep + wages + old arrears. Short = arrears build; two missed in a row sells best-paid outside the six (never below 6). */
export function applyMatch(s, result = {}) {
  const inc = matchIncome(s, result), e = clone(econOf(s));
  e.fans += inc.fans; e.coins += inc.gate + inc.winBonus + inc.shop;
  const due = inc.wages + inc.upkeep + e.arrears;
  if (e.coins >= due) { e.coins -= due; e.arrears = 0; e.missed = 0; } else { e.arrears = due - e.coins; e.coins = 0; e.missed += 1; }
  note(e, { k: 'match', win: !!result.win, ...inc, arrears: e.arrears });
  let out = withEcon(s, e);
  if (e.missed >= E.MISSED_FOR_SALE) out = boardSale(out);
  return out;
}
function boardSale(/** @type {any} */ s) {
  const c = club(s); if (!c || c.squad.length <= E.MIN_SQUAD) return s;
  const out = c.squad.filter((/** @type {any} */ p) => !c.six.includes(p.id));
  if (!out.length) return s;
  const p = out.slice().sort((a, b) => wageOf(b) - wageOf(a) || (a.id < b.id ? -1 : 1))[0];
  const v = transferValue(p), e = clone(s.econ);
  e.coins += v; const pay = Math.min(e.coins, e.arrears); e.coins -= pay; e.arrears -= pay; e.missed = 0;
  note(e, { k: 'sale', id: p.id, name: p.name, value: v });
  const sq = (/** @type {any} */ a) => Array.isArray(a) ? a.filter((/** @type {any} */ x) => (x?.id ?? x) !== p.id) : a;
  const nc = { ...c, squad: sq(c.squad), six: sq(c.six) };
  if (c.bench) nc.bench = sq(c.bench);
  return { ...s, econ: e, clubs: [nc, ...s.clubs.slice(1)] };
}

// ---- finals ----
/** @param {any} s @param {'semi'|'runner'|'champ'} kind */
export function finalsReward(s, kind) {
  if (!E.FIN_COINS[kind]) return s;
  const e = clone(econOf(s)), coins = rd(E.FIN_COINS[kind] * coinMult(s)), fans = rd(E.FAN_FIN[kind] * fanMult(s));
  e.coins += coins; e.fans += fans; e.medals += E.MEDALS[kind];
  note(e, { k: 'finals', kind, coins, fans, medals: E.MEDALS[kind] });
  return withEcon(s, e);
}
/** TP for a finals result (TP lives outside s.econ; the caller adds it). */
export const finalsTp = (/** @type {string} */ kind) => E.TP_FIN[kind] || 0;

// ---- wallet gates ----
/** Coins in hand and no arrears (building, recruiting, training freeze in arrears). */
export const canAfford = (/** @type {any} */ s, /** @type {number} */ coins) => { const e = econOf(s); return !inArrears(e) && e.coins >= coins; };
/** Wage reserve (3 paydays) + next season's recruit envelope + 5 paydays of wages + upkeep. */
export function reserveNeeded(/** @type {any} */ s) {
  const e = econOf(s), inc = matchIncome(s, {});
  return E.RESERVE_WAGE_PAYDAYS * inc.wages + E.RECRUIT[league(s) - 1] + E.RESERVE_PAYDAYS * (inc.wages + inc.upkeep);
}
export const reserveOk = (/** @type {any} */ s, /** @type {number} */ price) => canAfford(s, price) && econOf(s).coins - price >= reserveNeeded(s);

// ---- courses ----
export const courseFactor = (/** @type {any} */ s) => E.COURSE_FACTOR[league(s) - 1];
/** Coins for a course at coach step: (24 + 6 x step) x league factor. */
export const courseCoins = (/** @type {any} */ s, /** @type {number} */ step) => rd((E.COURSE_BASE + E.COURSE_PER_STEP * step) * courseFactor(s));
export function payCourse(/** @type {any} */ s, /** @type {number} */ coins) {
  if (!(coins >= 0) || !canAfford(s, coins)) return s;
  const e = clone(econOf(s)); e.coins -= coins; note(e, { k: 'course', coins });
  return withEcon(s, e);
}

// ---- stadium + facilities ----
export const netsLevel = (/** @type {any} */ s) => econOf(s).fac.nets;
export const gymTp = (/** @type {any} */ s) => E.GYM_TP[econOf(s).fac.gym];
/** @param {any} s */
export function buildOptions(s) {
  const e = econOf(s), out = [];
  const gate = (/** @type {string} */ what, /** @type {number} */ level, /** @type {number} */ coins, /** @type {number} */ fansGate, /** @type {number} */ matches, /** @type {string|null} */ bad) => {
    let why = bad;
    if (!why && e.build && matches > 0) why = 'One big build at a time';
    if (!why && inArrears(e)) why = 'Pay the wages first';
    if (!why && e.fans < fansGate) why = 'Needs more Fans';
    if (!why && e.coins < coins) why = 'Needs more Coins';
    out.push({ what, level, coins, fansGate, matches, ok: !why, why: why || '' });
  };
  if (e.stadium < 5) { const L = e.stadium + 1; gate('stadium', L, E.STADIUM_COST[L], E.STADIUM_FANS[L], E.STADIUM_BUILD[L], null); }
  for (const k of E.FAC) {
    const cur = e.fac[k]; if (cur >= 5) continue;
    const L = cur + 1;
    gate(k, L, E.FAC_COST[k][L], 0, 0, e.stadium < E.FAC_OPEN[k] ? `Needs Stadium ${E.FAC_OPEN[k]}` : L > e.stadium ? `Needs Stadium ${L}` : null);
  }
  return out;
}
/** Stadium builds take matches (tickBuild); facility builds finish at once. */
export function startBuild(/** @type {any} */ s, /** @type {string} */ what) {
  const o = buildOptions(s).find((x) => x.what === what);
  if (!o || !o.ok) return s;
  const e = clone(econOf(s)); e.coins -= o.coins;
  if (what === 'stadium') e.build = { what, level: o.level, left: o.matches };
  else e.fac[what] = o.level;
  note(e, { k: 'build', what, level: o.level, coins: o.coins });
  return withEcon(s, e);
}
/** Call once per match played. Finishing stadium raises the level. */
export function tickBuild(/** @type {any} */ s) {
  const e0 = econOf(s); if (!e0.build) return s;
  const e = clone(e0); e.build.left -= 1;
  if (e.build.left <= 0) { if (e.build.what === 'stadium') e.stadium = e.build.level; note(e, { k: 'built', what: e.build.what, level: e.build.level }); e.build = null; }
  return withEcon(s, e);
}
/** League N+1 needs stadium N+1. League 5 has nowhere to go. */
export function canPromote(/** @type {any} */ s) {
  const e = econOf(s), L = league(s);
  if (L >= 5) return { ok: true, why: '' };
  return e.stadium >= L + 1 ? { ok: true, why: '' } : { ok: false, why: `Build Stadium ${L + 1} first` };
}

// ---- late sinks + Medal shop ----
const doneCount = (/** @type {any} */ e, /** @type {string} */ id) => e.sinks[id] || 0;
const retiredCount = (/** @type {any} */ s) => (s.retired || club(s)?.retired || []).length;
/** @param {any} s */
export function sinkOptions(s) {
  const e = econOf(s);
  return E.SINKS.map((k) => {
    const n = doneCount(e, k.id);
    let why = '';
    if (k.repeat === 'season' ? e.sinks.retreatSeason === seasonN(s) : !k.repeat && n) why = 'Done';
    if (!why && k.stadium && e.stadium < k.stadium) why = `Needs Stadium ${k.stadium}`;
    if (!why && k.needs && !doneCount(e, k.needs)) why = `Needs ${E.SINKS.find((x) => x.id === k.needs)?.name} first`;
    if (!why && k.repeat === 'retired' && n >= retiredCount(s)) why = 'Needs a retired player';
    if (!why && k.coins != null && !reserveOk(s, k.coins)) why = canAfford(s, k.coins) ? 'Keep a safety reserve' : 'Needs more Coins';
    if (!why && k.medals != null && e.medals < k.medals) why = 'Needs more Medals';
    return { id: k.id, name: k.name, coins: k.coins ?? 0, medals: k.medals ?? 0, done: n, ok: !why, why };
  });
}
export function buySink(/** @type {any} */ s, /** @type {string} */ id) {
  const o = sinkOptions(s).find((x) => x.id === id);
  if (!o || !o.ok) return s;
  const e = clone(econOf(s)); e.coins -= o.coins; e.medals -= o.medals; e.sinks[id] = (e.sinks[id] || 0) + 1;
  if (id === 'coach_retreat') e.sinks.retreatSeason = seasonN(s);
  note(e, { k: 'sink', id, coins: o.coins, medals: o.medals });
  return withEcon(s, e);
}
export function medalShop(/** @type {any} */ s) {
  const e = econOf(s);
  return E.MEDAL_SHOP.map((m) => {
    const n = doneCount(e, m.id);
    const why = m.once && n ? 'Done' : m.id === 'wage_holiday' && holidayOn(s, e) ? 'Already on this season' : e.medals < m.medals ? 'Needs more Medals' : '';
    return { id: m.id, name: m.name, medals: m.medals, owned: n, ok: !why, why };
  });
}
export function buyMedal(/** @type {any} */ s, /** @type {string} */ id) {
  const o = medalShop(s).find((x) => x.id === id);
  if (!o || !o.ok) return s;
  const e = clone(econOf(s)); e.medals -= o.medals; e.sinks[id] = (e.sinks[id] || 0) + 1;
  if (id === 'wage_holiday') e.sinks.wageHolidaySeason = seasonN(s);
  note(e, { k: 'medal', id, medals: o.medals });
  return withEcon(s, e);
}

// ---- Legacy Project + Fans bars ----
/** Needs Stadium 4 and every one-off Coin sink open at your stadium bought (halls; finishing at Stadium 5), under the reserve rule. */
export function legacyOffer(/** @type {any} */ s) {
  const e = econOf(s), L = E.LEGACY, name = L.names[e.legacy % L.names.length];
  const price = L.price[Math.min(5, Math.max(4, league(s)))];
  let why = '';
  if (e.stadium < L.gateStadium) why = `Needs Stadium ${L.gateStadium}`;
  else if (E.SINKS.some((k) => k.coins != null && !k.repeat && e.stadium >= k.stadium && !doneCount(e, k.id))) why = 'Finish the Hall and stadium extras first';
  else if (!reserveOk(s, price)) why = canAfford(s, price) ? 'Keep a safety reserve' : 'Needs more Coins';
  return { name, price, fans: L.fans, ok: !why, why };
}
export function buyLegacy(/** @type {any} */ s) {
  const o = legacyOffer(s); if (!o.ok) return s;
  const e = clone(econOf(s)); e.coins -= o.price; e.fans += o.fans; e.legacy += 1;
  note(e, { k: 'legacy', name: o.name, coins: o.price });
  return withEcon(s, e);
}
/** Bar 1 Crowd fills toward the next stadium Fans gate; when full (or Stadium 5) bar 2 Club Legend shows. No Fans number. */
export function fansBars(/** @type {any} */ s) {
  const e = econOf(s), next = e.stadium < 5 ? e.stadium + 1 : null;
  const fill = next ? Math.min(1, e.fans / E.STADIUM_FANS[next]) : 1;
  const tier = Math.floor(e.legacy / E.LEGACY.segmentsPerTier);
  return { crowd: { fill, next: next ? `Stadium ${next}` : null }, legend: { tier, name: E.TIER_NAMES[Math.min(tier, E.TIER_NAMES.length - 1)], segments: e.legacy % E.LEGACY.segmentsPerTier }, showLegend: fill >= 1 };
}
