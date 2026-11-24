// Bad Trade Bazaar core: pure game rules. No DOM, no clock, no Math.random. Runs in Node and browser.
// Rules ported from the lessons sim (core-lots.mjs lots/sell, core-lessons.mjs carry cash + perks bought from carried cash).
export const BUILD = 'btb-lessons-1';
export const SLOTS = ['Calm', 'Middle', 'Wild'];
export const TIERS = ['Dune Lane', 'Copper Row', 'Saffron Court', 'Pearl Gate'];
export const GOODS = [
  { id: 0, name: 'Dune Millet', kind: 'food', tier: 1, slot: 0, base: 10 }, { id: 1, name: 'Lantern Oil', kind: 'fuel', tier: 1, slot: 1, base: 25 }, { id: 2, name: 'Ember Pepper', kind: 'spice', tier: 1, slot: 2, base: 60 },
  { id: 3, name: 'Hill Wool', kind: 'cloth', tier: 2, slot: 0, base: 30 }, { id: 4, name: 'Tinker Copper', kind: 'metal', tier: 2, slot: 1, base: 75 }, { id: 5, name: 'Peacock Dye', kind: 'dye', tier: 2, slot: 2, base: 180 },
  { id: 6, name: 'Kiln Tiles', kind: 'craft', tier: 3, slot: 0, base: 90 }, { id: 7, name: 'Brass Lanterns', kind: 'metal craft', tier: 3, slot: 1, base: 220 }, { id: 8, name: 'Sun Saffron', kind: 'spice', tier: 3, slot: 2, base: 540 },
  { id: 9, name: 'Moon Silver', kind: 'metal', tier: 4, slot: 0, base: 250 }, { id: 10, name: 'Amber Resin', kind: 'incense', tier: 4, slot: 1, base: 650 }, { id: 11, name: 'Sea Pearls', kind: 'gem', tier: 4, slot: 2, base: 1600 }
];
export const SCARS = [
  { type: 0, slot: 0, big: false, name: 'Calm Nick' }, { type: 1, slot: 0, big: true, name: 'Calm Shield' }, { type: 2, slot: 1, big: false, name: 'Middle Nick' },
  { type: 3, slot: 1, big: true, name: 'Middle Shield' }, { type: 4, slot: 2, big: false, name: 'Wild Nick' }, { type: 5, slot: 2, big: true, name: 'Wild Shield' }
];
export const PERKS = [
  { key: 'seed', name: 'Bigger Purse-Belt', scope: 'global' }, { key: 'fee', name: 'Friendly Tax-Man', scope: 'global' }, { key: 'scales', name: 'Lucky Scales', scope: 'global' },
  { key: 'streak', name: 'Hot Streak', scope: 'global' }, { key: 'clean', name: 'Clean Slate', scope: 'global' }, { key: 'tycoon', name: 'Patient Merchant', scope: 'global' },
  { key: 'spec0', name: 'Calm Specialist', scope: 0 }, { key: 'spec1', name: 'Middle Specialist', scope: 1 }, { key: 'wild', name: 'Wild Specialist', scope: 2 }
];
export const DEFAULTS = {
  runSec: 180, tickMs: 1000, buyLockMs: 300, longPressMs: 450, startCash: 100, lots: 3, maxPerGood: 3,
  slotVol: [0.010, 0.018, 0.030], tierVol: [1, 1.15, 1.30, 1.45], volScale: 1, K: 0.08, M: 0.8, regimeMin: 10, regimeMax: 25, pUp: 0.35, pDown: 0.35,
  saleCut: 0.015, lossLine: 0.04, holdSec: 15, endScar: true, dumpSec: 3,
  lessonRate: 0.5, stopLine: [0.04, 0.06, 0.08], lessonSlots: 2, lessonsOn: true,
  perkSlots: 3, shopOn: true, priceScale: 0.7, streakMax: 4,
  perkVal: { seed: 8, fee: 0.5, scales: 0.25, streak: 0.15, clean: 0.35, tycoon: 0.6, spec0: 0.8, spec1: 0.8, wild: 0.8 },
  price: { seed: 20, fee: 20, scales: 35, streak: 40, clean: 45, tycoon: 50, spec0: 25, spec1: 30, wild: 40 },
  tierUnlock: [0, 200, 500, 1200], bustCash: 5,
  run1Seed: 'btb-run1-s1', sameMarkets: true, protoMinTrades: 4, protoTarget: 1.30
};

const round2 = (x) => Math.round(x * 100) / 100;
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const num = (x) => `${Math.round(x * 100) / 100}`;
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

function clone(x) {
  if (Array.isArray(x)) return x.map(clone);
  if (isObj(x)) { const o = {}; for (const k of Object.keys(x)) o[k] = clone(x[k]); return o; }
  return x;
}
function merge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v === undefined) continue;
    if (Array.isArray(v)) dst[k] = clone(v);
    else if (isObj(v)) { if (!isObj(dst[k])) dst[k] = {}; merge(dst[k], v); }
    else dst[k] = v;
  }
  return dst;
}
export function mkConfig(partial) { return merge(clone(DEFAULTS), partial || {}); }
const cfg = (c) => (c && isObj(c.perkVal) && isObj(c.price) ? c : mkConfig(c));

export function hash(str) {
  let h = 2166136261;
  for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const perkOf = (key) => PERKS.find((p) => p.key === key);

export function perkPrice(key, c) { c = cfg(c); return round2(c.price[key] * c.priceScale); }

export function perkText(key, c) {
  c = cfg(c);
  const v = c.perkVal[key];
  switch (key) {
    case 'seed': return `Start each day +$${num(v)}`;
    case 'fee': return `Sale fee on wins cut by ${pct(v)}`;
    case 'scales': return `Every win pays +${pct(v)}`;
    case 'streak': return `Each win in a row adds +${pct(v)}, up to ${c.streakMax} wins`;
    case 'clean': return `A day with no losing sale: wins pay +${pct(v)}`;
    case 'tycoon': return `Wins held ${c.holdSec}s or more pay +${pct(v)}`;
    case 'spec0': return `Wins on the Calm good pay +${pct(v)}`;
    case 'spec1': return `Wins on the Middle good pay +${pct(v)}`;
    case 'wild': return `Wins on the Wild good pay +${pct(v)}`;
    default: return '';
  }
}

export function scarText(type, c) {
  c = cfg(c);
  const s = SCARS[type];
  if (!s) return '';
  return s.big ? `Losing ${SLOTS[s.slot]} sale past ${pct(c.stopLine[s.slot])}: rest paid back` : `Losing ${SLOTS[s.slot]} sale: fee waived`;
}

export function newProfile(salt) {
  return {
    v: 2, salt: String(salt), cash: null, day: 0, stall: 1, maxTier: 1, picks: [0, 1, 2], cover: [0, 0, 0, 0, 0, 0], owned: [0, 0, 0, 0, 0, 0],
    lessons: [], perksOwned: [], perks: [], days: [], ledger: { lossCash: 0, coverGranted: 0, paid: 0 }
  };
}

export function dayCash(profile, c) { c = cfg(c); return profile.cash == null ? c.startCash : profile.cash; }
export function unlockedGoods(profile, c) { return GOODS.filter((g) => g.tier <= profile.maxTier); }

export function setPick(profile, slot, goodId, c) {
  const g = GOODS[goodId];
  if (!g || g.slot !== slot || g.tier > profile.maxTier) return false;
  profile.picks[slot] = goodId;
  return true;
}

export function togglePerk(profile, key, c) {
  c = cfg(c);
  if (!profile.perksOwned.includes(key)) return false;
  const at = profile.perks.indexOf(key);
  if (at >= 0) { profile.perks.splice(at, 1); return true; }
  if (profile.perks.length >= c.perkSlots) return false;
  profile.perks.push(key);
  return true;
}

export function toggleLesson(profile, type, c) {
  c = cfg(c);
  if (!(type >= 0 && type < SCARS.length) || profile.owned[type] !== 1) return false;
  const at = profile.lessons.indexOf(type);
  if (at >= 0) { profile.lessons.splice(at, 1); return true; }
  if (profile.lessons.length >= c.lessonSlots) return false;
  profile.lessons.push(type);
  return true;
}

export function canBuyPerk(profile, key, c) {
  c = cfg(c);
  if (!c.shopOn || !perkOf(key) || profile.perksOwned.includes(key)) return false;
  return dayCash(profile, c) - perkPrice(key, c) >= c.bustCash; // admin default: shopping can never bust you
}

export function buyPerk(profile, key, c) {
  c = cfg(c);
  if (!canBuyPerk(profile, key, c)) return false;
  profile.cash = dayCash(profile, c) - perkPrice(key, c);
  profile.perksOwned.push(key);
  if (profile.perks.length < c.perkSlots) profile.perks.push(key);
  return true;
}

export function daySeed(profile, c) {
  c = cfg(c);
  return (c.sameMarkets || profile.day === 0) ? c.run1Seed : `btb-${profile.salt}-d${profile.day + 1}`;
}

function series(seed, i, p0, vol, c) {
  const r = mulberry32(hash(seed + ':stock' + i));
  let p = p0, left = 0, dir = 0;
  const out = [p];
  for (let t = 1; t <= c.runSec; t++) {
    if (left <= 0) {
      left = c.regimeMin + Math.floor(r() * (c.regimeMax - c.regimeMin + 1));
      const u = r();
      dir = u < c.pUp ? 1 : u < c.pUp + c.pDown ? -1 : 0;
    }
    left--;
    const noise = (r() + r() - 1);
    const ret = dir * c.M * vol + c.K * Math.log(p0 / p) + vol * noise;
    p = Math.max(0.005 * p0, round2(p * (1 + ret))); // admin default floor
    out.push(p);
  }
  return out;
}

export function newDay(profile, c) {
  c = cfg(c);
  const seed = daySeed(profile, c);
  const perkKeys = c.shopOn ? profile.perks.slice(0, c.perkSlots) : [];
  const has = (k) => perkKeys.includes(k);
  const startCash = dayCash(profile, c) + (has('seed') ? c.perkVal.seed : 0);
  const goods = [0, 1, 2].map((slot) => {
    let g = GOODS[profile.picks[slot]];
    if (!g || g.slot !== slot || g.tier > profile.maxTier) g = GOODS.find((x) => x.slot === slot && x.tier <= profile.maxTier); // admin default: bad pick falls back to lowest tier
    return g;
  });
  const px = goods.map((g, i) => series(seed, i, g.base, c.slotVol[i] * c.tierVol[g.tier - 1] * c.volScale, c));
  if (!Array.isArray(profile.cover)) profile.cover = [0, 0, 0, 0, 0, 0];
  return {
    c, seed, day: profile.day + 1, stall: profile.stall, t: 0, cash: startCash, startCash, goods, px, lots: [], nextLotId: 1, over: false,
    trades: 0, losing: 0, deliberate: 0, has, perkKeys, lessons: c.lessonsOn ? profile.lessons.slice(0, c.lessonSlots) : [],
    cover: profile.cover, earned: [0, 0, 0, 0, 0, 0], drops: [], streak: 0, lostToday: false, paid: 0, lossCash: 0, events: []
  };
}

export const lotsOf = (s, i) => s.lots.filter((x) => x.good === i);
export const freeLots = (s) => s.c.lots - s.lots.length;
export function canBuy(s, i) {
  return !s.over && s.t < s.c.runSec && freeLots(s) > 0 && lotsOf(s, i).length < s.c.maxPerGood && s.cash / freeLots(s) > 1;
}
export function buyPreview(s, i) { return canBuy(s, i) ? s.cash / freeLots(s) : 0; }
export function buy(s, i) {
  if (!canBuy(s, i)) return null;
  const price = s.px[i][s.t], cost = s.cash / freeLots(s);
  const lot = { id: s.nextLotId++, good: i, qty: cost / price, buyPrice: price, cost, t: s.t };
  s.lots.push(lot);
  s.cash -= cost;
  s.events.push({ k: 'buy', i, cost });
  return lot;
}

// best = highest simple result, worst = lowest; ties by lot id
function pick(s, i, which) {
  const ls = lotsOf(s, i);
  if (!ls.length) return null;
  const p = s.px[i][s.t], res = (x) => x.qty * p * (1 - s.c.saleCut) - x.cost;
  ls.sort((a, b) => (which === 'worst' ? res(a) - res(b) : res(b) - res(a)) || a.id - b.id);
  return ls[0];
}

// pure: work out one sale without touching state
function evalSell(s, x, auto) {
  const i = x.good, c = s.c, v = c.perkVal, p = s.px[i][s.t];
  const loss = p < x.buyPrice;
  const cut = (!loss && s.has('fee')) ? c.saleCut * (1 - v.fee) : c.saleCut;
  let proceeds = x.qty * p * (1 - cut);
  const gain = proceeds - x.cost;
  const refunds = []; let refund = 0, net = 0, scarType = null;
  if (loss) {
    const cashLoss = Math.max(0, -gain);
    const small = i * 2, big = i * 2 + 1;
    if (cashLoss > 0 && s.lessons.includes(small)) { // fee lesson (fix: never refunds more than the price drop itself)
      const r = Math.min(x.qty * p * c.saleCut, x.qty * (x.buyPrice - p) * (1 - c.saleCut), cashLoss - refund, s.cover[small]); // admin default: (1-saleCut) keeps sale return non-decreasing in price
      if (r > 0) { refunds.push({ type: small, amount: r }); refund += r; }
    }
    const linePrice = x.buyPrice * (1 - c.stopLine[i]);
    if (cashLoss > 0 && s.lessons.includes(big) && p < linePrice) { // stop lesson: loss past the line paid back from cover
      const r = Math.min(x.qty * (linePrice - p) * (1 - c.saleCut), cashLoss - refund, s.cover[big]); // admin default: same monotone fix
      if (r > 0) { refunds.push({ type: big, amount: r }); refund += r; }
    }
    proceeds += refund;
    net = cashLoss - refund;
    if (!auto || c.endScar) scarType = i * 2 + ((x.buyPrice - p) / x.buyPrice >= c.lossLine ? 1 : 0);
  } else {
    const g = Math.max(0, gain); let m = 0; // gains only on cash profit after the cut
    if (g > 0) {
      if (s.has('scales')) m += v.scales;
      if (s.has('wild') && i === 2) m += v.wild;
      if (s.has('spec0') && i === 0) m += v.spec0;
      if (s.has('spec1') && i === 1) m += v.spec1;
      if (s.has('tycoon') && s.t - x.t >= c.holdSec) m += v.tycoon;
      if (s.has('streak')) m += v.streak * Math.min(c.streakMax, s.streak);
      if (s.has('clean') && !s.lostToday) m += v.clean;
      proceeds += g * m;
    }
  }
  return { loss, won: !loss && gain > 0, proceeds, pnl: proceeds - x.cost, refund, refunds, net, scarType, lotId: x.id };
}

export function sellPreview(s, i, which = 'best') {
  if (s.over) return null;
  const x = pick(s, i, which);
  if (!x) return null;
  const r = evalSell(s, x, false);
  return { pnl: round2(r.pnl), loss: r.loss, refund: round2(r.refund), scarType: r.scarType, lotId: r.lotId };
}

function doSell(s, x, auto) {
  if (!x) return null;
  const r = evalSell(s, x, auto);
  for (const f of r.refunds) { s.cover[f.type] -= f.amount; s.events.push({ k: 'paid', type: f.type, amount: round2(f.amount) }); }
  s.paid += r.refund;
  s.cash += r.proceeds;
  s.lots.splice(s.lots.indexOf(x), 1);
  s.trades++;
  if (r.loss) {
    s.lossCash += r.net;
    s.losing++; s.streak = 0; s.lostToday = true;
    if (!auto && s.t - x.t < s.c.dumpSec) s.deliberate++;
    if (r.scarType != null) {
      s.earned[r.scarType] += s.c.lessonRate * r.net;
      s.drops.push({ type: r.scarType, net: r.net, t: s.t });
      s.events.push({ k: 'drop', type: r.scarType, net: round2(r.net) });
    }
  } else if (r.won) {
    s.streak++;
  }
  s.events.push({ k: 'sell', i: x.good, pnl: round2(r.pnl), loss: r.loss });
  return { loss: r.loss, pnl: round2(r.pnl), refund: round2(r.refund), scarType: r.scarType, lotId: x.id };
}

export function sell(s, i, which = 'best') {
  if (s.over) return null;
  return doSell(s, pick(s, i, which), false);
}

export function tick(s) {
  if (s.over) return false;
  s.t++;
  if (s.t >= s.c.runSec) {
    s.events.push({ k: 'bell' });
    for (let i = 0; i < 3; i++) while (lotsOf(s, i).length) doSell(s, pick(s, i, 'best'), true);
    s.over = true;
  }
  return s.over;
}

export function endDay(profile, s) {
  if (s.summary) return s.summary;
  const c = s.c;
  const ownedBefore = profile.owned.slice();
  const grew = [], newScars = [];
  let granted = 0;
  for (let ty = 0; ty < 6; ty++) {
    if (s.earned[ty] > 0) {
      if (ownedBefore[ty] === 1) grew.push({ type: ty, add: round2(s.earned[ty]) });
      profile.cover[ty] += s.earned[ty]; profile.owned[ty] = 1; granted += s.earned[ty];
    }
  }
  for (const d of s.drops) {
    if (ownedBefore[d.type] !== 1 && !newScars.includes(d.type)) newScars.push(d.type);
    profile.owned[d.type] = 1;
  }
  profile.ledger.lossCash += s.lossCash; profile.ledger.coverGranted += granted; profile.ledger.paid += s.paid;
  const startCash = s.startCash, endCash = s.cash;
  profile.cash = endCash; // no floor, never adds cash
  profile.day++;
  const unlocked = [];
  for (let k = 2; k <= 4; k++) if (endCash >= c.tierUnlock[k - 1] && profile.maxTier < k) { profile.maxTier = k; unlocked.push(k); }
  const summary = {
    day: s.day, stall: s.stall, seed: s.seed, goods: s.goods.map((g) => g.name), startCash: round2(startCash), endCash: round2(endCash),
    profit: round2(endCash - startCash), rate: startCash > 0 ? (endCash - startCash) / startCash : 0, trades: s.trades, losing: s.losing, deliberate: s.deliberate,
    paid: round2(s.paid), drops: s.drops.map((d) => ({ type: d.type, net: round2(d.net) })), grew, newScars, unlocked, bust: endCash < c.bustCash,
    perks: s.perkKeys.slice(), lessons: s.lessons.slice(), coverAfter: profile.cover.map(round2)
  };
  profile.days.push(summary);
  s.summary = summary;
  return summary;
}

export function newStall(profile, c) {
  profile.cash = null;
  profile.stall++;
  profile.maxTier = 1;
  profile.picks = [0, 1, 2];
  profile.perksOwned = []; profile.perks = [];
  for (let k = 0; k < profile.cover.length; k++) profile.cover[k] = 0; // in place: keeps live refs
  return profile;
}
