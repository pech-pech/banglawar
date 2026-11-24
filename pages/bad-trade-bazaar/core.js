// Bad Trade Bazaar core: pure game rules. No DOM, no clock, no Math.random. Runs in Node and browser.
// Reproduces work/sim/sim-spare.js mode A, cap 10.
export const BUILD = 'btb-slice-1';

export const DEFAULTS = {
  runSec: 180, tickMs: 1000, startCash: 100, slots: 3, stackCap: 2,
  base: [10, 25, 60], vol: [0.010, 0.018, 0.030], volScale: 1,
  K: 0.08, M: 0.8, regimeMin: 10, regimeMax: 25, pUp: 0.35, pDown: 0.35,
  saleCut: 0.015, lossLine: 0.04, holdSec: 15, endScar: true,
  spareCash: 1, spareCap: 10, buyLockMs: 300,
  perk: [0.30, 8, 0.02, 0.30, 1.0, 0.8],
  run1Seed: 'btb-run1-s1' // admin default: searched so a 2% dip within 25 s of an early buy exists in run 1
};

export const STOCKS = ['Calm', 'Middle', 'Wild'];
export const SCARS = [
  { type: 0, name: 'Penny Nick',  stock: 0, big: false, kind: 'gain',   only: -1 },
  { type: 1, name: 'Deep Cut',    stock: 0, big: true,  kind: 'cash' },
  { type: 2, name: 'Sharp Eye',   stock: 1, big: false, kind: 'disc' },
  { type: 3, name: 'Cushion',     stock: 1, big: true,  kind: 'refund' },
  { type: 4, name: 'Wild Streak', stock: 2, big: false, kind: 'gain',   only: 2 },
  { type: 5, name: 'Tycoon',      stock: 2, big: true,  kind: 'hold' }
];

const round2 = (x) => Math.round(x * 100) / 100;
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const num = (x) => `${Math.round(x * 100) / 100}`;

export function mkConfig(config) {
  const c = { ...DEFAULTS, ...(config || {}) };
  for (const k of Object.keys(DEFAULTS)) if (Array.isArray(DEFAULTS[k])) c[k] = (Array.isArray(c[k]) ? c[k] : DEFAULTS[k]).slice();
  return c;
}

export function perkText(type, config) {
  const c = mkConfig(config);
  const v = c.perk[type];
  switch (type) {
    case 0: return `Wins pay +${pct(v)}`;
    case 1: return `Start run +$${num(v)}`;
    case 2: return `Buys ${pct(v)} cheaper`;
    case 3: return `Losses refund ${pct(v)}`;
    case 4: return `Wild wins pay +${pct(v)}`;
    case 5: return `Wins held ${c.holdSec}s+ pay +${pct(v)}`;
    default: return '';
  }
}

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

export function newProfile(salt) {
  return { v: 1, salt: String(salt), collection: [0, 0, 0, 0, 0, 0], build: Array(DEFAULTS.slots).fill(null), sparesNext: 0, runs: [] };
}

export function runSeed(profile, config) {
  const c = mkConfig(config);
  if (profile.runs.length === 0) return c.run1Seed;
  return `btb-${profile.salt}-r${profile.runs.length + 1}`;
}

function series(seed, i, c) {
  const r = mulberry32(hash(seed + ':stock' + i));
  const p0 = c.base[i], vol = c.vol[i] * c.volScale;
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
    p = Math.max(0.5, Math.round(p * (1 + ret) * 100) / 100);
    out.push(p);
  }
  return out;
}

function perkSum(build, c) {
  const e = { gain: [0, 0, 0], hold: 0, disc: 0, cash: 0, refund: 0 };
  for (const ty of build) {
    if (ty == null) continue;
    const s = SCARS[ty], v = c.perk[ty];
    if (s.kind === 'gain') { for (let i = 0; i < 3; i++) if (s.only < 0 || s.only === i) e.gain[i] += v; }
    else e[s.kind] += v;
  }
  return e;
}

export function validateBuild(profile, config) {
  const c = mkConfig(config);
  const used = Array(SCARS.length).fill(0);
  const out = [];
  for (let s = 0; s < c.slots; s++) {
    const ty = profile.build && profile.build[s] != null ? profile.build[s] : null;
    if (ty != null && ty >= 0 && ty < SCARS.length && used[ty] < Math.min(c.stackCap, profile.collection[ty] || 0)) { used[ty]++; out.push(ty); }
    else out.push(null);
  }
  profile.build = out;
  return out;
}

export function setSlot(profile, slotIndex, type, config) {
  const c = mkConfig(config);
  if (!(slotIndex >= 0 && slotIndex < c.slots)) return false;
  validateBuild(profile, c);
  if (type == null) { profile.build[slotIndex] = null; return true; }
  if (!(type >= 0 && type < SCARS.length)) return false;
  let used = 0;
  profile.build.forEach((b, s) => { if (s !== slotIndex && b === type) used++; });
  if (used >= Math.min(c.stackCap, profile.collection[type] || 0)) return false;
  profile.build[slotIndex] = type;
  return true;
}

export function newRun(profile, config) {
  const c = mkConfig(config);
  const build = validateBuild(profile, c).slice();
  const perks = perkSum(build, c);
  const seed = runSeed(profile, c);
  const startCash = c.startCash + perks.cash + (profile.sparesNext || 0);
  return {
    config: c, seed, t: 0, runSec: c.runSec, cash: startCash, startCash,
    px: [0, 1, 2].map((i) => series(seed, i, c)),
    pos: [null, null, null], over: false, firstTap: null, trades: 0, losing: 0, deliberate: 0,
    drops: [], log: [], build, perks,
    owned: profile.collection.slice(), ended: false
  };
}

function flat(state) { return state.pos.filter((x) => !x).length; }

export function buyPreview(state, i) {
  const n = flat(state);
  return { lot: n ? state.cash / n : 0 };
}

export function canBuy(state, i) {
  if (state.over || state.t >= state.runSec || state.pos[i]) return false;
  return buyPreview(state, i).lot > 1;
}

export function buy(state, i) {
  if (!canBuy(state, i)) return null;
  const p = state.px[i][state.t];
  const lot = buyPreview(state, i).lot;
  const qty = lot / (p * (1 - state.perks.disc));
  state.pos[i] = { qty, buyPrice: p, cost: lot, t: state.t };
  state.cash -= lot;
  if (state.firstTap == null) state.firstTap = state.t;
  const ev = { kind: 'buy', t: state.t, i, price: p, lot };
  state.log.push(ev);
  return ev;
}

function evalSell(state, i, auto) {
  const x = state.pos[i];
  if (!x) return null;
  const c = state.config, e = state.perks;
  const p = state.px[i][state.t];
  let proceeds = x.qty * p * (1 - c.saleCut);
  const gain = proceeds - x.cost;
  const loss = p < x.buyPrice;
  let perkTag = null;
  if (loss) {
    if (gain < 0) proceeds += -gain * e.refund;
  } else {
    const g = Math.max(0, gain);
    const held = state.t - x.t >= c.holdSec;
    const extra = g * (e.gain[i] + (held ? e.hold : 0));
    proceeds += extra;
    if (extra > 0) {
      if (held && e.hold > 0) perkTag = 'Tycoon';
      else if (i === 2 && state.build.includes(4)) perkTag = 'Wild Streak';
      else if (state.build.includes(0)) perkTag = 'Penny Nick';
    }
  }
  let scar = null;
  if (loss && (!auto || c.endScar)) {
    const type = i * 2 + ((x.buyPrice - p) / x.buyPrice >= c.lossLine ? 1 : 0);
    const spare = Math.min(c.stackCap, state.owned[type]) >= c.stackCap;
    scar = { type, name: SCARS[type].name, spare };
  }
  return { x, p, proceeds, pnl: proceeds - x.cost, loss, scar, perkTag };
}

export function sellPreview(state, i) {
  const r = evalSell(state, i, false);
  if (!r) return null;
  return { pnl: round2(r.pnl), loss: r.loss, scar: r.scar, perkTag: r.perkTag };
}

function doSell(state, i, auto) {
  const r = evalSell(state, i, auto);
  if (!r) return null;
  state.cash += r.proceeds;
  state.pos[i] = null;
  state.trades++;
  if (state.firstTap == null && !auto) state.firstTap = state.t;
  if (r.loss) {
    state.losing++;
    if (!auto && state.runSec - state.t >= 10) state.deliberate++;
  }
  const ev = { kind: 'sell', t: state.t, i, price: r.p, pnl: round2(r.pnl), loss: r.loss, scar: r.scar, perkTag: r.perkTag };
  if (auto) ev.auto = true;
  if (r.scar) {
    if (!r.scar.spare) state.owned[r.scar.type]++;
    state.drops.push({ type: r.scar.type, spare: r.scar.spare, t: state.t, i, pnl: round2(r.pnl) });
  }
  state.log.push(ev);
  return ev;
}

export function sell(state, i) {
  if (state.over) return null;
  return doSell(state, i, false);
}

export function tick(state) {
  if (state.over) return [];
  state.t++;
  const evs = [{ kind: 'tick', t: state.t }];
  if (state.t >= state.runSec) {
    for (let i = 0; i < 3; i++) { const ev = doSell(state, i, true); if (ev) evs.push(ev); }
    state.over = true;
    const end = { kind: 'end', t: state.t };
    state.log.push(end);
    evs.push(end);
  }
  return evs;
}

export function endRun(profile, state) {
  if (state.summary) return state.summary;
  const c = state.config;
  const types = [], build = state.build.slice();
  let spares = 0;
  for (const d of state.drops) {
    if (d.spare) spares++;
    else { types.push(d.type); profile.collection[d.type] = Math.min(c.stackCap, profile.collection[d.type] + 1); }
  }
  profile.sparesNext = Math.min(c.spareCap, spares) * c.spareCash;
  const summary = {
    n: profile.runs.length + 1, seed: state.seed, startCash: round2(state.startCash), endCash: round2(state.cash),
    trades: state.trades, losing: state.losing, deliberate: state.deliberate, scars: types, spares,
    build, firstTap: state.firstTap, cut: c.saleCut
  };
  profile.runs.push(summary);
  state.summary = summary;
  state.ended = true;
  validateBuild(profile, c);
  return summary;
}

export function protoCheck(profile) {
  const runs = profile.runs;
  const run1 = runs.length ? runs[0].endCash : null;
  const deliberateLosses = runs.reduce((a, r) => a + r.deliberate, 0);
  if (runs.length < 5) return { run1, medianR3to5: null, ratio: null, pass: null, deliberateLosses };
  const m = runs.slice(2, 5).map((r) => r.endCash).sort((a, b) => a - b)[1];
  const ratio = m / run1;
  return { run1, medianR3to5: m, ratio, pass: ratio >= 1.3, deliberateLosses };
}

export function report(profile, config) {
  const c = mkConfig(config);
  const lines = [`Bad Trade Bazaar ${BUILD} report`];
  const diffs = Object.keys(DEFAULTS).filter((k) => JSON.stringify(c[k]) !== JSON.stringify(DEFAULTS[k]));
  lines.push(diffs.length ? 'config: ' + diffs.map((k) => `${k}=${JSON.stringify(c[k])}`).join(' ') : 'config: default');
  const nm = (t) => (t == null ? '-' : SCARS[t].name);
  for (const r of profile.runs) {
    lines.push(`run ${r.n} seed ${r.seed} start ${r.startCash} end ${r.endCash} trades ${r.trades} losing ${r.losing} (deliberate ${r.deliberate}) scars [${r.scars.map(nm).join(', ')}] spares ${r.spares} build [${r.build.map(nm).join(', ')}] firstTap ${r.firstTap == null ? '-' : r.firstTap + 's'}`);
  }
  const p = protoCheck(profile);
  const verdict = p.pass == null ? 'needs 5 runs' : p.pass ? 'PASS' : 'FAIL';
  lines.push(`PROTO end cash run1 ${p.run1 == null ? '-' : p.run1}, median r3-5 ${p.medianR3to5 == null ? '-' : p.medianR3to5}, ratio ${p.ratio == null ? '-' : Math.round(p.ratio * 100) + '%'} -> ${verdict}; deliberate losses total ${p.deliberateLosses}`);
  return lines.join('\n');
}
