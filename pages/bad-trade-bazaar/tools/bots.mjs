// Bot gate for Bad Trade Bazaar btb-lessons-1 (CONTRACT-lessons-1 section 6).
// node tools/bots.mjs [markets=200] [days=6] [--quick] [--selftest]      --quick = 40 markets
// Drives core.js only through its exported API. Ported from sim-lessons.mjs / attack.mjs (design sim).
// Gates: G-A no gain by losing on purpose | G-B shop lifts strong bot | G-C farmer < 100 | G-D fee-lesson monotone | G-E G-A on fast tiers + bust path.
import * as C from '../core.js';
const { mkConfig, newProfile, newDay, endDay, newStall, tick, buy, sell, canBuy, lotsOf, freeLots, setPick, unlockedGoods, toggleLesson, togglePerk,
  canBuyPerk, buyPerk, perkPrice, dayCash, mulberry32, hash } = C;

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const nums = args.filter((a) => !a.startsWith('--')).map(Number);
const QUICK = flags.includes('--quick'), SELFTEST = flags.includes('--selftest');
const MARKETS = nums[0] || (QUICK ? 40 : 200), DAYS = nums[1] || 6;
const EPS = 1e-9;
const f2 = (x) => x.toFixed(2), f0 = (x) => x.toFixed(0), pc = (x) => (100 * x).toFixed(0) + '%';
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

// ---------------- bots: factories (fresh state per day). buy(i,t,p,mk,r) sell(i,t,p,lot,mk,r); P0 = good base price
const botDefs = {
  strong: { tier: 'high', make: () => { const peak = [0, 0, 0]; return {
    buy: (i, t, p, mk) => { const ok = t >= 3 && t < 170 && p > mk[i][t - 3] * 1.04 && p > mk[i][t - 1]; if (ok) peak[i] = p; return ok; },
    sell: (i, t, p, lot) => { peak[i] = Math.max(peak[i], p); return p <= peak[i] * 0.97 && p >= lot.buyPrice; } }; } },
  skilled: { tier: 'high', make: (P0) => ({
    buy: (i, t, p, mk) => t < 165 && p < P0[i] * 0.93 && t >= 2 && p > mk[i][t - 2],
    sell: (i, t, p, lot) => p >= P0[i] * 1.03 || p <= lot.buyPrice * 0.90 }) },
  casual: { tier: 'low', make: () => ({
    buy: (i, t, p, mk, r) => t < 150 && r() < 0.10,
    sell: (i, t, p, lot) => p >= lot.buyPrice * 1.03 }) },
  human: { tier: 'low', make: () => ({
    buy: (i, t, p, mk) => t >= 3 && t < 165 && p > mk[i][t - 3] * 1.01,
    sell: (i, t, p, lot) => p >= lot.buyPrice * 1.06 || p <= lot.buyPrice * 0.95 }) },
  farmer: { tier: 'low', make: () => ({ buy: (i, t) => t < 170, sell: () => true }) }, // dumps every lot next tick to farm scars
  churn: { tier: 'low', make: () => ({ buy: (i, t) => t < 170, sell: (i, t, p, lot) => t - lot.t >= 2 }) }
};

// ---------------- harness
const viol = { sale: 0, invariant: 0, saleMsgs: [] };
// every sale goes through here: per-sale asserts (G-C): a losing sale never returns more than its cost; refund never exceeds cover held before the sale
function sellChecked(s, i, which = 'best') {
  const lots = lotsOf(s, i); if (!lots.length) return null;
  const pv = C.sellPreview(s, i, which);
  const lot = (pv && lots.find((l) => l.id === pv.lotId)) || lots[0];
  const cash0 = s.cash, cov0 = s.cover.slice(); // exact values (sell() results are rounded to 2 decimals)
  const r = sell(s, i, which); if (!r) return null;
  const proceeds = s.cash - cash0, drain = cov0.reduce((a, v, k) => a + v - s.cover[k], 0);
  if (r.loss && proceeds > lot.cost + EPS) { viol.sale++; viol.saleMsgs.push(`losing sale proceeds ${proceeds} > cost ${lot.cost}`); }
  if (s.cover.some((v) => v < -EPS) || drain < -EPS) { viol.sale++; viol.saleMsgs.push(`refund beyond cover (cover now ${s.cover.map(f2)})`); }
  return r;
}
// picks: record array to fill (clean twin); replay: clean twin's picks for this day (loss twin: same good if unlocked for it, else highest unlocked of the slot)
function pickGoods(profile, c, tier, record, replay) {
  for (let slot = 0; slot < 3; slot++) {
    const g = unlockedGoods(profile, c).filter((x) => x.slot === slot).sort((a, b) => a.tier - b.tier);
    let id = (tier === 'high' ? g[g.length - 1] : g[0]).id;
    if (replay) id = g.some((x) => x.id === replay[slot]) ? replay[slot] : g[g.length - 1].id;
    setPick(profile, slot, id, c);
    if (record) record[slot] = id;
  }
}
function slotLessons(profile, c) { // two highest cover (owned, cover > 0)
  const want = [0, 1, 2, 3, 4, 5].filter((t) => profile.owned[t] === 1 && profile.cover[t] > 0.005).sort((a, b) => profile.cover[b] - profile.cover[a]).slice(0, c.lessonSlots);
  for (const t of [...profile.lessons]) if (!want.includes(t)) toggleLesson(profile, t, c);
  for (const t of want) if (!profile.lessons.includes(t)) toggleLesson(profile, t, c);
}
function slotPerks(profile, c, rank) {
  const want = rank.filter((k) => profile.perksOwned.includes(k)).slice(0, c.perkSlots);
  for (const k of [...profile.perks]) if (!want.includes(k)) togglePerk(profile, k, c);
  for (const k of want) if (!profile.perks.includes(k)) togglePerk(profile, k, c);
}
const specKeys = ['spec0', 'spec1', 'wild'];
function rankFor(tally) { // strict order: scales, spec of most-traded slot, tycoon, fee, clean, streak, seed, rest
  const top = tally.slotTrades.indexOf(Math.max(...tally.slotTrades));
  const spec = specKeys[top];
  const out = ['scales', spec, 'tycoon', 'fee', 'clean', 'streak', 'seed', ...specKeys];
  return out.filter((k, i) => out.indexOf(k) === i);
}
// shop between days. replay = list of keys to buy exactly (loss twin copies clean twin); else strict rank bot, buy when cash - price >= 100.
function shopDay(profile, c, tally, replay) {
  const bought = [];
  if (!c.shopOn) return bought;
  if (replay) { for (const k of replay) { if (profile.perksOwned.includes(k)) continue; if (canBuyPerk(profile, k, c) && buyPerk(profile, k, c)) bought.push(k); else tally.replayMiss++; } return bought; }
  for (const k of rankFor(tally)) {
    if (profile.perksOwned.includes(k)) continue;
    if (profile.perksOwned.length >= c.perkSlots) break;
    if (dayCash(profile, c) - perkPrice(k, c) < 100 || !canBuyPerk(profile, k, c)) break; // strict: never skip ahead
    if (!buyPerk(profile, k, c)) break; bought.push(k);
  }
  return bought;
}
// the injected loss must not change the bot's own day: only inject when the bot would buy nothing now (any good) nor the injected good next tick
const quiet = (s, bot, g, t) => {
  for (let i = 0; i < 3; i++) if (!lotsOf(s, i).length && (bot.buy(i, t, s.px[i][t], s.px, () => 1) || (i === g && bot.buy(i, t + 1, s.px[i][t + 1], s.px, () => 1)))) return false;
  return true;
};
// inj = {g, state:'pending'|'open'|'done', t0}: one deliberate instant loss (buy, sell next tick at a lower price) on good g, day 1
function playDay(profile, c, name, tally, inj, trace, picks, replayPicks) {
  const def = botDefs[name];
  pickGoods(profile, c, def.tier, picks, replayPicks); slotLessons(profile, c);
  const s = newDay(profile, c);
  const bot = def.make(s.goods.map((g) => g.base));
  const r = mulberry32(hash(s.seed + ':bot:' + name));
  while (!s.over) {
    const t = s.t;
    if (inj && inj.state === 'open' && t === inj.t0 + 1) { // sell the injected lot
      const x = sellChecked(s, inj.g, 'best'); inj.state = 'done'; inj.lost = !!(x && x.loss); tally.slotTrades[inj.g]++;
    } else if (inj && inj.state === 'pending' && t >= 5 && t < 150 && s.px[inj.g][t + 1] < s.px[inj.g][t] && lotsOf(s, inj.g).length === 0 && canBuy(s, inj.g) && quiet(s, bot, inj.g, t)) {
      if (buy(s, inj.g)) { inj.state = 'open'; inj.t0 = t; }
    }
    for (let i = 0; i < 3; i++) {
      if (inj && inj.g === i && (inj.state === 'open' || (inj.state === 'done' && t === inj.t0 + 1))) continue; // bot leaves the injected good alone for those two ticks
      const p = s.px[i][t], held = lotsOf(s, i);
      if (held.length) { if (bot.sell(i, t, p, held[0], s.px, r)) { const x = sellChecked(s, i, 'best'); if (x) { tally.slotTrades[i]++; if (trace) trace.push(`t${t} sell g${i} @${f2(p)} pnl ${f2(x.pnl)}`); } } }
      else if (canBuy(s, i) && bot.buy(i, t, p, s.px, r)) { const l = buy(s, i); if (l && trace) trace.push(`t${t} buy g${i} @${f2(p)} cost ${f2(l.cost)}`); }
    }
    tick(s);
  }
  return endDay(profile, s);
}
// career: n-th market, bot, config; opts {inj, replay:[[keys per day]]} -> result
function career(n, name, cfg, opts = {}) {
  const c = mkConfig({ ...cfg, run1Seed: 'btb-m' + n });
  const profile = newProfile('m' + n);
  const tally = { slotTrades: [0, 0, 0], replayMiss: 0 };
  const inj = opts.inj ? { g: 0, state: 'pending' } : null;
  const purchases = [], pickLog = [], rates = [], ends = []; let busts = 0, trace = opts.trace ? [] : null;
  for (let d = 0; d < DAYS; d++) {
    purchases.push(shopDay(profile, c, tally, opts.replay ? opts.replay[d] || [] : null));
    slotPerks(profile, c, rankFor(tally));
    const dp = []; pickLog.push(dp);
    const sum = endDayWrap(profile, c, name, tally, d === 0 ? inj : null, trace, dp, opts.replayPicks ? opts.replayPicks[d] : null);
    rates.push(sum.rate); ends.push(sum.endCash);
    if (sum.bust) { busts++; newStall(profile, c); }
  }
  const L = profile.ledger;
  if (L.paid > L.coverGranted + EPS || L.coverGranted > 0.5 * L.lossCash + EPS) { viol.invariant++; viol.saleMsgs.push(`INVARIANT ${name} m${n} ${JSON.stringify(L)}`); }
  return { n, name, picks: pickLog, cash: ends[ends.length - 1], rates, ends, purchases, injected: !!(inj && inj.state === 'done' && inj.lost), ledger: { ...L }, busts, replayMiss: tally.replayMiss, trace, profile, c };
}
const endDayWrap = playDay;

// ---------------- gates
const results = [];
function gate(id, pass, text) { results.push(pass); console.log(`${id} ${pass ? 'PASS' : 'FAIL'} ${text}`); }
const markets = Array.from({ length: MARKETS }, (_, n) => n);

function gateA(cfg, label) { // returns {bad, total, perBot}
  let bad = 0, total = 0, miss = 0, strict = 0; const per = [];
  for (const name of ['strong', 'skilled', 'human']) {
    let b = 0, t = 0, dsum = 0;
    for (const n of markets) {
      const clean = career(n, name, cfg);
      const loss = career(n, name, cfg, { inj: true, replay: clean.purchases, replayPicks: clean.picks });
      miss += loss.replayMiss;
      if (!loss.injected) continue;
      t++; dsum += loss.cash - clean.cash;
      if (loss.cash >= clean.cash - 0) strict++;
      // clean bar = best of own picks and the loss twin's picks (a loss gives no pick option the clean player lacks)
      const alt = career(n, name, cfg, { replay: clean.purchases, replayPicks: loss.picks });
      if (loss.cash >= Math.max(clean.cash, alt.cash)) b++;
    }
    per.push(`${name} ${b}/${t} (mean d6 ${f2(t ? dsum / t : 0)})`); bad += b; total += t;
  }
  return { bad, total, miss, strict, text: `${label}${per.join(', ')}; replay misses ${miss}` };
}

if (SELFTEST) {
  const r = career(0, 'strong', {}, { trace: true });
  console.log('selftest strong market 0 day 1 trace:'); for (const l of r.trace.slice(0, 80)) console.log('  ' + l);
  console.log('rates', r.rates.map(pc).join(' '), 'cash', f2(r.cash), 'invariant viol', viol.invariant, 'sale viol', viol.sale);
  process.exit(0);
}

console.log(`bots ${C.BUILD} markets=${MARKETS} days=${DAYS}`);
// G-A
const A = gateA({}, ''); // loss twin day-6 cash >= clean twin must be 0
gate('G-A', A.bad === 0 && viol.invariant === 0, `loss twin >= clean twin in ${A.bad}/${A.total} markets (need 0); ${A.text}; invariant viol ${viol.invariant}`);

// G-B
{
  const ratioOf = (r) => (r.rates[0] > 0 && r.rates.length >= 5 ? med(r.rates.slice(2, 5)) / r.rates[0] : NaN);
  const on = markets.map((n) => ratioOf(career(n, 'strong', {}))).filter((x) => !isNaN(x));
  const off = markets.map((n) => ratioOf(career(n, 'strong', { shopOn: false }))).filter((x) => !isNaN(x));
  const mOn = med(on), mOff = med(off);
  gate('G-B', mOn >= 1.30, `strong ratio med(d3-5 rate)/d1 rate, shop on: median ${pc(mOn)} (need >= 130%, ${on.length} markets)`);
  console.log(`G-B-off INFO tier unlocks = capital buys dearer goods: shopOn:false (tiers on) median ${pc(mOff)} (${off.length} markets)`);
  const flat = markets.map((n) => ratioOf(career(n, 'strong', { shopOn: false, tierUnlock: [0, 1e9, 1e9, 1e9] }))).filter((x) => !isNaN(x));
  const mFlat = med(flat);
  gate('G-B-off-flat', mFlat >= 0.85 && mFlat <= 1.15, `control, shopOn:false + tiers off: median ${pc(mFlat)} (need 85%..115%, ${flat.length} markets)`);
}

// G-C
{
  const e = markets.map((n) => career(n, 'farmer', {}).cash);
  const m = med(e); const before = viol.sale;
  gate('G-C', m < 100 && viol.sale === 0, `farmer median day-${DAYS} cash ${f2(m)} (need < 100); per-sale asserts violated ${viol.sale} (${viol.saleMsgs.slice(0, 2).join('; ')})`);
  void before;
}

// G-D: fee-lesson fix. With a scar slotted at cover 50, return of a sale is non-decreasing in sale price across buy price scan 0.9..1.1
{
  const c = mkConfig({ run1Seed: 'btb-gd' }); let worst = 0, cases = 0, badCases = 0;
  const setups = [[0], [1], [2], [3], [4], [5], [0, 1], [2, 3], [4, 5]];
  for (const types of setups) for (let i = 0; i < 3; i++) {
    if (!types.every((ty) => Math.floor(ty / 2) === i) && types.length === 2) continue; // pair test only on its own slot
    if (types.length === 1 && Math.floor(types[0] / 2) !== i) continue;
    let prev = -Infinity; let bad = false;
    for (let k = 0; k <= 200; k++) {
      const m = 0.9 + k * 0.001;
      const profile = newProfile('gd'); for (const ty of types) { profile.cover[ty] = 50; profile.owned[ty] = 1; }
      for (const ty of types) toggleLesson(profile, ty, c);
      const s = newDay(profile, c); for (let q = 0; q < 6; q++) tick(s);
      const lot = buy(s, i); tick(s); s.px[i][s.t] = lot.buyPrice * m;
      const cash0 = s.cash; sell(s, i, 'best'); const ret = s.cash - cash0; // exact cash returned for this lot
      const price = s.px[i][s.t];
      if (ret < prev - 1e-9 * Math.max(1, lot.cost)) { bad = true; worst = Math.max(worst, prev - ret); void price; }
      prev = ret;
    }
    cases++; if (bad) badCases++;
  }
  gate('G-D', badCases === 0, `monotone return across 0.9..1.1 x buy: ${badCases}/${cases} setups drop (largest dip ${worst.toExponential(2)})`);
}

// G-E
{
  const fast = { tierUnlock: [0, 110, 130, 150] };
  const before = viol.invariant;
  const E = gateA(fast, 'fast tiers: ');
  // bust path: force cash 4, play an idle day, summary.bust, newStall -> cash 100, cover 0
  let bustBad = 0, bustN = 0;
  for (const n of markets) {
    const c = mkConfig({ ...fast, run1Seed: 'btb-m' + n }); const profile = newProfile('b' + n);
    profile.cash = 4; profile.cover = [1, 2, 3, 4, 5, 6]; profile.owned = [1, 1, 1, 1, 1, 1];
    const s = newDay(profile, c); while (!s.over) tick(s);
    const sum = endDay(profile, s); bustN++;
    const st0 = profile.stall;
    profile.cash = 4; newStall(profile, c);
    const ok = sum.bust === true && dayCash(profile, c) === 100 && profile.cover.every((v) => v === 0) && profile.stall === st0 + 1;
    if (!ok) bustBad++;
  }
  console.log(`G-E-strict INFO ${E.strict}/${E.total} (tier-4 vol, not scar pay)`);
  const inv = viol.invariant - before;
  gate('G-E', E.bad === 0 && bustBad === 0 && inv === 0, `${E.text}; gain cases ${E.bad}/${E.total} (need 0); bust path bad ${bustBad}/${bustN}; invariant viol ${inv}`);
}

// info line
{
  const row = [];
  for (const name of Object.keys(botDefs)) row.push(`${name} ${f0(med(markets.slice(0, Math.min(40, MARKETS)).map((n) => career(n, name, {}).cash)))}`);
  console.log(`info median day-${DAYS} cash (first ${Math.min(40, MARKETS)} markets): ${row.join(', ')}`);
}
process.exit(results.every(Boolean) ? 0 : 1);
