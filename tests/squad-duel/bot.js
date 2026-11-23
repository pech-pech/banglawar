#!/usr/bin/env node
'use strict';
// Squad Duel build bot (checker 1). Runs the BUILD-BRIEF "Bot gates" on the SHIPPED engine (pages/squad-duel/js/*).
// Every move is executed through SD.engine.playAttack / playDefend. Policies only CHOOSE.
//   skilled : port of bot.js match5 'dp' policy (getDP6 value tables, hand-aware) for the continuation value, with the
//             immediate duel odds taken from SD.engine.previewAttack / previewDefend (so traits, Signatures, nodes show in the choice).
//   random  : random card, random action / stance (own rng, never touches the match streams)
//   ro      : lazy role-owner (Playmaker owns Pass/Through, Winger Dribble, Striker Shoot; Anchor defends), best EV inside that rule
//   staller : skilled until ahead, then Pass every turn Pass is legal
// Usage: node tests/squad-duel/bot.js [--n=1000] [--lift=1500] [--chip=20000] [--only=odds,wins,...] [--no-write]
// Output: docs/squad-duel/BOT-GATES.md (table above the <!-- FINDINGS --> marker is regenerated; text below it is kept).
const fs = require('fs');
const path = require('path');
const { load } = require('./load.js');

const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const N_GATE = +ARGS.n || 3000;      // seeds for win-rate gates (SE of a win rate about 1.5 points)
const N_LIFT = +ARGS.lift || 4000;   // paired seeds for each fx lift (paired SE about 1 point)
const N_CHIP = +ARGS.chip || 20000;  // seeded duels per chip state
const ONLY = ARGS.only ? String(ARGS.only).split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);

const L = load();
const SD = globalThis.SD;
const OUT = path.resolve(__dirname, '../../docs/squad-duel/BOT-GATES.md');

// ------------------------------------------------------------------ independent duel maths (NOT from SD.odds)
const ACT = ['pass', 'dribble', 'through', 'shoot'];
function attW(gap, a, b, tie, N) {
  if (a === N && b === 1) return true;
  if (a === 1 && b === N) return false;
  const d = gap + a - b; return tie ? d >= 0 : d > 0;
}
const enumCache = new Map();
function enumP(gap, tie, N) {
  N = N || 6; const k = gap + '|' + (tie ? 1 : 0) + '|' + N; let v = enumCache.get(k);
  if (v === undefined) { let w = 0; for (let a = 1; a <= N; a++) for (let b = 1; b <= N; b++) if (attW(gap, a, b, tie, N)) w++; v = w / (N * N); enumCache.set(k, v); }
  return v;
}
const sMod = (a, s) => (a === 'dribble' ? (s === 'press' ? -1 : 1) : a === 'through' ? (s === 'press' ? 1 : -1) : 0);

// ------------------------------------------------------------------ seeds / helpers
function strHash(s) { let h = 0x811C9DC5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
const seedList = (tag, n) => { const t = strHash(tag); const o = []; for (let i = 0; i < n; i++) o.push((Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(t | 1, 0x85EBCA6B) ^ 0xC0FFEE) >>> 0); return o; };
const pct = (x, d) => (100 * x).toFixed(d === undefined ? 1 : d);
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ setup builders (shipped data only)
const DEFAULT_L = () => ({ keeper: 'ondra', outfield: ['kessan', 'mirelle', 'pip', 'tavo'], bench: ['barro', 'sunniva'] });
function mkP(id, level) {
  const d = SD.data.byId(id);
  return { id: d.id, name: d.name, role: d.role, rarity: d.rarity, pac: d.pac, pas: d.pas, sho: d.sho, def: d.def, level: level || 1, sig: d.sig || null };
}
// cfg: {seed, matchNo, club, formation, swap:[pid], pitchLevel:1|2, nodes:[], fxOff:{}, T:{}, benchSwap:[pid]}
function mkSetup(cfg) {
  const lu = DEFAULT_L();
  (cfg.swap || []).forEach((pid) => {
    const d = SD.data.byId(pid);
    if (d.role === 'Keeper') { lu.keeper = pid; return; }
    const slot = lu.outfield.findIndex((x) => SD.data.byId(x).role === d.role);
    if (slot >= 0) lu.outfield[slot] = pid; else lu.outfield[0] = pid;
  });
  (cfg.benchSwap || []).forEach((pid) => { const d = SD.data.byId(pid); const i = lu.bench.findIndex((x) => SD.data.byId(x).role === d.role); lu.bench[i >= 0 ? i : 0] = pid; });
  const lvl = (pid) => ((cfg.swap || []).includes(pid) || (cfg.benchSwap || []).includes(pid) ? 1 : (cfg.pitchLevel || 1));
  const T = Object.assign({}, SD.data.TWEAK_DEFAULTS, cfg.T || {}, { fxOff: Object.assign({}, cfg.fxOff || {}) });
  return {
    seed: cfg.seed, matchNo: cfg.matchNo || 1, club: SD.data.CLUBS[cfg.club], formation: cfg.formation || 'Wall',
    keeper: mkP(lu.keeper, lvl(lu.keeper)), outfield: lu.outfield.map((id) => mkP(id, lvl(id))), bench: lu.bench.map((id) => mkP(id, 1)),
    nodes: (cfg.nodes || []).slice(), T,
  };
}

// ------------------------------------------------------------------ skilled model: getDP6 value tables (port of bot.js match5)
const MODELS = new Map();
const NXT = new Map();
function nextSt(hm, dm, ci) {
  const key = (hm << 12) | (dm << 6) | ci; let o = NXT.get(key); if (o) return o;
  const h1 = hm & ~(1 << ci); let disc = 63 & ~hm & ~dm; disc |= 1 << ci; let dk = dm;
  if (dk === 0) { dk = disc; disc = 0; }
  o = []; for (let d = 0; d < 6; d++) if (dk & (1 << d)) o.push(((h1 | (1 << d)) << 6) | (dk & ~(1 << d)));
  NXT.set(key, o); return o;
}
const ix6 = (L, z, b, s) => ((L * 3 + z) * 3 + b) * 4096 + s;
function popc(x) { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; }

function getModel(m) {
  const s = m.setup, T = m.T;
  const ids = s.outfield.map((p) => p.id).concat(s.bench.map((p) => p.id));
  const cards = ids.map((id) => m.cards[id]);
  const club = m.club, cs = m.cs;
  const zw = [0, 1, 2].map((z) => SD.clubAI.weights(club, z, false, T));
  const tellP = [0, 1, 2].map((z) => SD.clubAI.pressChance(club, z, T));
  const FORM = SD.data.FORMATIONS[m.formation];
  const hs = m.handSize;
  const key = JSON.stringify([hs, cards.map((c) => [c.id, c.role, c.pac, c.pas, c.sho, c.def]), m.formation, club.id, cs, T.cap, T.passBonus, T.buildMax, T.formCounter, T.die, zw, tellP, m.keeper.def, T.halfTurns]);
  let M = MODELS.get(key); if (M) return M;
  const idx = {}; ids.forEach((id, i) => { idx[id] = i; });
  const H = Math.max(6, T.halfTurns);
  const win = (g) => enumP(g, false, T.die);
  const fbAtt = (a) => (FORM.att && FORM.att[a]) || 0;
  const fbDef = (a) => (FORM.defVs && FORM.defVs[a] ? T.formCounter : 0);
  const stat = (c, a) => (a === 'shoot' ? c.sho : a === 'dribble' ? c.pac : c.pas);
  const role = (c, a) => (((a === 'pass' || a === 'through') && c.role === 'Playmaker') || (a === 'dribble' && c.role === 'Winger') || (a === 'shoot' && c.role === 'Striker') ? 1 : 0);
  const attScore = (c, a, b) => stat(c, a) + Math.min(T.cap, role(c, a) + fbAtt(a) + (a === 'pass' ? T.passBonus : b));
  const defOpp = (a) => (a === 'shoot' ? cs.keeper : cs.def);
  const clubScore = (a, b) => cs.atk + Math.min(T.cap, a === 'pass' ? T.passBonus : b);
  const defVal = (c, a) => (a === 'shoot' ? m.keeper.def : c.def + (c.role === 'Anchor' ? 1 : 0) + fbDef(a));
  const VM = new Float64Array((H + 1) * 9 * 4096), VO = new Float64Array((H + 1) * 9 * 4096);
  const states = [];
  for (let hm = 0; hm < 64; hm++) { if (popc(hm) !== hs) continue; const rest = 63 & ~hm; for (let dm = rest; ; dm = (dm - 1) & rest) { states.push([hm, dm]); if (dm === 0) break; } }
  const cont = (tbl, L1, z, b, hm, dm, ci, add) => {
    const ns = nextSt(hm, dm, ci); let t = 0; for (const s2 of ns) t += tbl[ix6(L1, z, b, s2)]; return add + t / ns.length;
  };
  for (let Lr = 1; Lr <= H; Lr++) for (let z = 0; z < 3; z++) for (let b = 0; b < 3; b++) {
    const legal = z < 2 ? ['pass', 'dribble', 'through'] : ['pass', 'shoot'], w = zw[z];
    const tw = [tellP[z], 1 - tellP[z]];
    for (const [hm, dm] of states) {
      let best = -1e9, bd = -1e9;
      for (let ci = 0; ci < 6; ci++) {
        if (!(hm & (1 << ci))) continue; const c = cards[ci];
        for (const a of legal) {
          const gap = attScore(c, a, b) - defOpp(a); let e = 0;
          for (let st = 0; st < 2; st++) {
            const p = win(gap + sMod(a, st ? 'drop' : 'press'));
            const cw = a === 'shoot' ? cont(VO, Lr - 1, 1, 0, hm, dm, ci, 1) : a === 'pass' ? cont(VM, Lr - 1, z, Math.min(T.buildMax, b + 1), hm, dm, ci, 0) : cont(VM, Lr - 1, z + 1, 0, hm, dm, ci, 0);
            const cl = a === 'shoot' ? cont(VO, Lr - 1, 0, 0, hm, dm, ci, 0) : cont(VO, Lr - 1, 1, 0, hm, dm, ci, 0);
            e += tw[st] * (p * cw + (1 - p) * cl);
          }
          if (e > best) best = e;
        }
        for (let st = 0; st < 2; st++) {
          const stn = st ? 'drop' : 'press'; let e = 0;
          for (const a of ACT) {
            if (!(w[a] > 0)) continue;
            const gap = clubScore(a, b) - defVal(c, a) + sMod(a, stn), p = win(gap);
            let cw, cl2;
            if (a === 'shoot') { cw = -1 + VM[ix6(Lr - 1, 1, 0, (hm << 6) | dm)]; cl2 = VM[ix6(Lr - 1, 0, 0, (hm << 6) | dm)]; }
            else { cw = cont(VO, Lr - 1, a === 'pass' ? z : z + 1, a === 'pass' ? Math.min(T.buildMax, b + 1) : 0, hm, dm, ci, 0); cl2 = cont(VM, Lr - 1, 1, 0, hm, dm, ci, 0); }
            e += w[a] * (p * cw + (1 - p) * cl2);
          }
          if (e > bd) bd = e;
        }
      }
      VM[ix6(Lr, z, b, (hm << 6) | dm)] = best; VO[ix6(Lr, z, b, (hm << 6) | dm)] = bd;
    }
  }
  // flat (state-averaged) tables, used when the hand is not 3 cards or the card is not in the hand
  const flat = (V) => { const F = new Float64Array((H + 1) * 9); for (let Lr = 0; Lr <= H; Lr++) for (let z = 0; z < 3; z++) for (let b = 0; b < 3; b++) { let t = 0; for (const [hm, dm] of states) t += V[ix6(Lr, z, b, (hm << 6) | dm)]; F[(Lr * 3 + z) * 3 + b] = t / states.length; } return F; };
  M = { idx, VM, VO, FM: flat(VM), FO: flat(VO), H, ids, hs };
  MODELS.set(key, M); return M;
}

// ------------------------------------------------------------------ policy plumbing
const mask = (M, arr) => arr.reduce((x, pid) => x | (M.idx[pid] === undefined ? 0 : 1 << M.idx[pid]), 0);
function hasFx(m, id) { return m.fx.some((f) => f.id === id) && !(m.T.fxOff && m.T.fxOff[id]); }
function nextVal(M, which, L1, z, b, hm, dm, pid, handN, inHand) {
  const V = which === 'M' ? M.VM : M.VO, F = which === 'M' ? M.FM : M.FO;
  L1 = Math.max(0, Math.min(M.H, L1)); z = Math.max(0, Math.min(2, z)); b = Math.max(0, Math.min(2, b));
  if (handN === M.hs && inHand && M.idx[pid] !== undefined) {
    const ns = nextSt(hm, dm, M.idx[pid]); let t = 0; for (const s2 of ns) t += V[ix6(L1, z, b, s2)]; return t / ns.length;
  }
  return F[(L1 * 3 + z) * 3 + b];
}
function stateVal(M, which, L, z, b, hm, dm) { // value of being in hand/deck state hm,dm with L turns left (incl. this one)
  const V = which === 'M' ? M.VM : M.VO; return V[ix6(Math.min(M.H, L), z, b, (hm << 6) | dm)];
}

function attackOptions(ctx, cands, tl) {
  const m = ctx.m, M = ctx.M, T = m.T, out = [];
  const L1 = Math.max(0, T.halfTurns - m.turn), z = m.zone, b = m.build.me;
  const hm = mask(M, m.hand), dm = mask(M, m.deck), hn = m.hand.length;
  for (const pid of cands) {
    const legal = SD.engine.legal(m, pid);
    for (const a of legal) {
      const pv = SD.engine.previewAttack(m, pid, a);
      ctx.stat.previews++;
      const pP = pv.chip.pPress !== undefined ? pv.chip.pPress : pv.chip.p, pD = pv.chip.pDrop !== undefined ? pv.chip.pDrop : pv.chip.p;
      const adv = a === 'dribble' && hasFx(m, 'SIG_ZEFA') && pid === 'zefa' ? 2 : 1;
      const inH = m.hand.includes(pid);
      const w = a === 'shoot' ? 1 + nextVal(M, 'O', L1, 1, 0, hm, dm, pid, hn, inH) : a === 'pass' ? nextVal(M, 'M', L1, z, Math.min(T.buildMax, b + 1), hm, dm, pid, hn, inH) : nextVal(M, 'M', L1, Math.min(2, z + adv), 0, hm, dm, pid, hn, inH);
      const l = a === 'shoot' ? nextVal(M, 'O', L1, 0, 0, hm, dm, pid, hn, inH) : nextVal(M, 'O', L1, 1, 0, hm, dm, pid, hn, inH);
      out.push({ pid, a, pP, pD, w, l, pv });
    }
  }
  return out;
}
const twOf = (tl) => (tl.exact === 'press' ? [1, 0] : tl.exact === 'drop' ? [0, 1] : [tl.pressW, 1 - tl.pressW]);
const evA = (o, tw) => tw[0] * (o.pP * o.w + (1 - o.pP) * o.l) + tw[1] * (o.pD * o.w + (1 - o.pD) * o.l);
function bestOf(list, f) { let b = null, bv = -1e18; for (const o of list) { const v = f(o); if (b === null || v > bv + 1e-12) { b = o; bv = v; } } return b; }

function defendOptions(ctx, cands, tl) {
  const m = ctx.m, M = ctx.M, T = m.T, out = [];
  const L1 = Math.max(0, T.halfTurns - m.turn), z = m.zone, bc = m.build.opp;
  const hm = mask(M, m.hand), dm = mask(M, m.deck), hn = m.hand.length;
  for (const pid of cands) {
    const inH = m.hand.includes(pid);
    for (const stance of ['press', 'drop']) {
      const pv = SD.engine.previewDefend(m, pid, stance); ctx.stat.previews++;
      let rows = pv.rows;
      if (tl.clubPick) { const r = rows.filter((x) => x.action === tl.clubPick); if (r.length) rows = r.map((x) => Object.assign({}, x, { w: 1 })); }
      const tw = rows.reduce((x, r) => x + r.w, 0) || 1; let e = 0;
      for (const r of rows) {
        const pc = enumP(r.gap, false, T.die); let cw, cl;
        if (r.action === 'shoot') { cw = -1 + nextVal(M, 'M', L1, 1, 0, hm, dm, null, hn, false); cl = nextVal(M, 'M', L1, 0, 0, hm, dm, null, hn, false); }
        else {
          cw = r.action === 'pass' ? nextVal(M, 'O', L1, z, Math.min(T.buildMax, bc + 1), hm, dm, pid, hn, inH) : nextVal(M, 'O', L1, z + 1, 0, hm, dm, pid, hn, inH);
          cl = nextVal(M, 'M', L1, 1, 0, hm, dm, pid, hn, inH);
        }
        e += (r.w / tw) * (pc * cw + (1 - pc) * cl);
      }
      out.push({ pid, stance, ev: e, pv });
    }
  }
  return out;
}

function defendCandidates(m) {
  const c = m.hand.slice();
  if (hasFx(m, 'SIG_JOSS') && !m.once['SIG_JOSS:joss'] && !c.includes('joss') && (m.deck.includes('joss') || m.discard.includes('joss'))) c.push('joss');
  return c;
}

function useActives(ctx) {
  const m = ctx.m, M = ctx.M; if (ctx.pol.noActives) return;
  const act = SD.engine.actives(m).filter((x) => x.can);
  for (const x of act) {
    if (x.id === 'A1' && m.phase === 'attack') {
      const tl = SD.engine.tell(m); if (tl.exact) continue;
      const opts = attackOptions(ctx, m.hand, tl), tw = twOf(tl);
      const cur = evA(bestOf(opts, (o) => evA(o, tw)), tw);
      const withInfo = tw[0] * evA(bestOf(opts, (o) => evA(o, [1, 0])), [1, 0]) + tw[1] * evA(bestOf(opts, (o) => evA(o, [0, 1])), [0, 1]);
      if (withInfo - cur >= (ctx.pol.a1thr === undefined ? 0.012 : ctx.pol.a1thr)) { if (SD.engine.use(m, 'A1')) ctx.stat.used.A1 = (ctx.stat.used.A1 || 0) + 1; }
    }
  }
  // Fresh Hand: compare hand state value with the expected value of a fresh hand drawn from the deck
  if (act.some((x) => x.id === 'S1') && m.hand.length === M.hs && m.deck.length >= M.hs && !ctx.pol.noFresh) {
    const hm = mask(M, m.hand), dm = mask(M, m.deck);
    const which = m.phase === 'attack' ? 'M' : 'O', z = m.zone, b = m.phase === 'attack' ? m.build.me : m.build.opp;
    const Lr = Math.max(1, m.T.halfTurns - m.turn + 1);
    const cur = stateVal(M, which, Lr, z, b, hm, dm);
    let t = 0, n = 0;
    const rec = (start, picked) => {
      if (picked.length === M.hs) { const h2 = mask(M, picked); t += stateVal(M, which, Lr, z, b, h2, dm & ~h2); n++; return; }
      for (let i = start; i < m.deck.length; i++) { picked.push(m.deck[i]); rec(i + 1, picked); picked.pop(); }
    };
    rec(0, []);
    if (n && t / n > cur + (ctx.pol.s1thr === undefined ? 0.015 : ctx.pol.s1thr)) { if (SD.engine.use(m, 'S1')) ctx.stat.used.S1 = (ctx.stat.used.S1 || 0) + 1; }
  }
}

const OWNS = (role, a) => (a === 'pass' || a === 'through' ? role === 'Playmaker' : a === 'dribble' ? role === 'Winger' : role === 'Striker');

function chooseAttack(ctx) {
  const m = ctx.m, pol = ctx.pol, cands = m.hand.slice();
  const tl = SD.engine.tell(m), tw = twOf(tl);
  if (pol.atk === 'rand') {
    const pid = cands[Math.floor(ctx.pr() * cands.length)], lg = SD.engine.legal(m, pid);
    return { pid, a: lg[Math.floor(ctx.pr() * lg.length)] };
  }
  const opts = attackOptions(ctx, cands, tl);
  let pool = opts;
  if (pol.atk === 'rc') { const pid = cands[Math.floor(ctx.pr() * cands.length)]; pool = opts.filter((o) => o.pid === pid); }
  if (pol.atk === 'ro') {
    const owns = (o) => OWNS(m.cards[o.pid].role, o.a);
    pool = opts.filter((o) => owns(o) || !cands.some((c) => OWNS(m.cards[c].role, o.a)));
  } else if (pol.atk === 'stall' && m.score.me > m.score.opp) {
    const p = opts.filter((o) => o.a === 'pass'); if (p.length) pool = p;
  }
  const ch = bestOf(pool, (o) => evA(o, tw));
  return { pid: ch.pid, a: ch.a };
}
function chooseDefend(ctx) {
  const m = ctx.m, pol = ctx.pol, cands = defendCandidates(m);
  if (pol.def === 'rand') return { pid: cands[Math.floor(ctx.pr() * cands.length)], stance: ctx.pr() < 0.5 ? 'press' : 'drop' };
  const tl = SD.engine.tell(m);
  let opts = defendOptions(ctx, cands, tl);
  if (pol.def === 'rc') { const pid = cands[Math.floor(ctx.pr() * cands.length)]; opts = opts.filter((o) => o.pid === pid); }
  if (pol.def === 'ro') { const an = opts.filter((o) => m.cards[o.pid].role === 'Anchor'); if (an.length) opts = an; }
  const ch = bestOf(opts, (o) => o.ev);
  return { pid: ch.pid, stance: ch.stance };
}
const POLS = {
  skilled: { atk: 'dp', def: 'dp', a1thr: ARGS.a1thr === undefined ? undefined : +ARGS.a1thr, s1thr: ARGS.s1thr === undefined ? undefined : +ARGS.s1thr },
  random: { atk: 'rand', def: 'rand', noActives: true },
  rc: { atk: 'rc', def: 'rc', noActives: true },
  ro: { atk: 'ro', def: 'ro' },
  staller: { atk: 'stall', def: 'dp' },
  skilledNoAct: { atk: 'dp', def: 'dp', noActives: true },
};

// ------------------------------------------------------------------ one match through the shipped engine
function runMatch(cfg, polName, hooks) {
  const setup = mkSetup(cfg), pol = POLS[polName];
  const m = SD.engine.newMatch(setup);
  const ctx = { m, pol, M: null, pr: mulberry((cfg.seed ^ 0x77777777) >>> 0), stat: { previews: 0, used: {} } };
  const rec = { picks: [], defs: [], events: [] };
  let guard = 0;
  while (m.phase !== 'full') {
    if (++guard > 200) throw new Error('match loop did not end (phase ' + m.phase + ') seed ' + cfg.seed);
    if (m.phase === 'halftime') { SD.engine.startHalf2(m); continue; }
    if (!ctx.M) ctx.M = getModel(m);
    useActives(ctx);
    if (hooks && hooks.before) hooks.before(m, ctx);
    let ev;
    if (m.phase === 'attack') {
      const ch = chooseAttack(ctx); ev = SD.engine.playAttack(m, ch.pid, ch.a);
      if (!ev) throw new Error('playAttack refused ' + JSON.stringify(ch) + ' seed ' + cfg.seed + ' turn ' + m.turnNo + ' hand ' + m.hand.join(','));
      rec.picks.push({ pid: ch.pid, a: ch.a, zone: ev.zone });
    } else {
      const ch = chooseDefend(ctx); ev = SD.engine.playDefend(m, ch.pid, ch.stance);
      if (!ev) throw new Error('playDefend refused ' + JSON.stringify(ch) + ' seed ' + cfg.seed + ' turn ' + m.turnNo + ' hand ' + m.hand.join(','));
      rec.defs.push({ pid: ev.pid, stance: ch.stance, action: ev.action });
    }
    rec.events.push(ev);
    SD.engine.nextPhase(m);
  }
  return { m, sum: SD.engine.summary(m), rec, ctx };
}

// ------------------------------------------------------------------ aggregate a batch
function batch(cfgBase, polName, seeds, extraHooks) {
  const R = { n: seeds.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, z0: 0, acts: { pass: 0, dribble: 0, through: 0, shoot: 0 }, cards: {}, atk: 0, fx: {}, used: {}, wins: new Uint8Array(seeds.length), pts: new Float64Array(seeds.length), turns: 0 };
  seeds.forEach((seed, i) => {
    const r = runMatch(Object.assign({}, cfgBase, { seed }), polName, extraHooks);
    const s = r.sum.score; R.gf += s.me; R.ga += s.opp;
    if (r.sum.res === 'W') { R.w++; R.wins[i] = 1; R.pts[i] = 1; } else if (r.sum.res === 'D') { R.d++; R.pts[i] = 0.5; } else R.l++;
    if (s.me === 0 && s.opp === 0) R.z0++;
    r.rec.picks.forEach((p) => { if (p.a === 'shoot' && p.zone < 2) R.midShoot = (R.midShoot || 0) + 1; R.acts[p.a]++; R.cards[p.pid] = (R.cards[p.pid] || 0) + 1; R.atk++; });
    r.sum.fxUsed.forEach((id) => { R.fx[id] = (R.fx[id] || 0) + 1; });
    Object.keys(r.ctx.stat.used).forEach((k) => { R.used[k] = (R.used[k] || 0) + r.ctx.stat.used[k]; });
  });
  R.winPct = 100 * R.w / R.n; R.drawPct = 100 * R.d / R.n; R.z0Pct = 100 * R.z0 / R.n;
  return R;
}
const wdl = (R) => `W ${R.winPct.toFixed(1)} D ${R.drawPct.toFixed(1)} L ${(100 * R.l / R.n).toFixed(1)}`;
function pairedLift(A, B) { // A = with, B = without (same seeds). returns {lift, se}
  const n = A.n; const d = new Float64Array(n); for (let i = 0; i < n; i++) d[i] = A.wins[i] - B.wins[i];
  const mu = mean(Array.from(d)); let v = 0; for (let i = 0; i < n; i++) v += (d[i] - mu) * (d[i] - mu); v /= (n - 1);
  return { lift: 100 * mu, se: 100 * Math.sqrt(v / n) };
}

// ------------------------------------------------------------------ gate table
const ROWS = [];
function add(gate, target, measured, seeds, status, note) { ROWS.push({ gate, target, measured, seeds, status, note: note || '' }); console.log(`[${status}] ${gate} | target ${target} | ${measured} | seeds ${seeds}${note ? ' | ' + note : ''}`); }
const inRange = (x, lo, hi) => x >= lo && x <= hi;
const stat = (ok) => (ok ? 'PASS' : 'MISS');
function guard(name, fn) { try { fn(); } catch (e) { add(name, 'runs without error', 'ERROR: ' + (e && e.message), '-', 'MISS', 'engine/fx/bot exception: ' + String(e && e.stack || e).split('\n').slice(0, 4).join(' / ')); } }

const CLUBS = ['grimsby', 'reading'];
const BEST = {};           // best formation per club (skilled, bare)
const DATA = {};           // shared batches

// ================================================================== experiments
function expDefaults() {
  const SHEET = { tavo: ['Striker', 'Common', 4, 3, 6, 2], mirelle: ['Playmaker', 'Common', 4, 6, 4, 3], pip: ['Winger', 'Common', 6, 4, 3, 3], sunniva: ['Winger', 'Common', 5, 5, 3, 4],
    kessan: ['Anchor', 'Common', 3, 3, 2, 6], barro: ['Anchor', 'Common', 3, 4, 2, 5], ondra: ['Keeper', 'Common', 3, 3, 1, 6],
    lio: ['Striker', 'Rare', 5, 4, 7, 3], joss: ['Anchor', 'Rare', 4, 4, 3, 8], zefa: ['Winger', 'Epic', 8, 5, 5, 3], hadro: ['Playmaker', 'Epic', 5, 7, 6, 4], ysolde: ['Keeper', 'Legend', 4, 6, 3, 9] };
  const bad = [];
  Object.keys(SHEET).forEach((id) => {
    const p = SD.data.byId(id); if (!p) { bad.push(id + ' missing'); return; }
    const got = [p.role, p.rarity, p.pac, p.pas, p.sho, p.def].join('/'), exp = SHEET[id].join('/');
    if (got !== exp) bad.push(`${id} ${got} != sheet ${exp}`);
  });
  if (SD.data.PLAYERS.length !== 12) bad.push('PLAYERS.length ' + SD.data.PLAYERS.length);
  const dl = SD.data.DEFAULT_LINEUP; if (JSON.stringify(dl) !== JSON.stringify(DEFAULT_L())) bad.push('DEFAULT_LINEUP ' + JSON.stringify(dl));
  const cl = SD.data.CLUBS, cexp = { grimsby: [4, 7, 7, 0.30, 0.50, 0.20], reading: [5, 8, 7, 0.20, 0.25, 0.55] };
  Object.keys(cexp).forEach((k) => { const c = cl[k], e = cexp[k], g = [c.def, c.keeper.def, c.atk, c.weights.pass, c.weights.dribble, c.weights.through]; if (g.join() !== e.join()) bad.push(k + ' club ' + g.join() + ' != ' + e.join()); });
  const T = SD.data.TWEAK_DEFAULTS, texp = { die: 6, halfTurns: 6, handSize: 3, cap: 3, passBonus: 2, buildMax: 2, formCounter: 3, roarAt: 3, grimsbyDef: 4, grimsbyKeeper: 7, grimsbyAtk: 7, readingDef: 5, readingKeeper: 8, readingAtk: 7, trailShift: 0.1, flatterStarters: false };
  Object.keys(texp).forEach((k) => { if (T[k] !== texp[k]) bad.push('T.' + k + '=' + T[k] + ' != ' + texp[k]); });
  add('Default stats shipped equal CONTENT-SHEET s1 (12 players, lineup, clubs, T defaults)', 'no difference', bad.length ? bad.join('; ') : '0 differences (12 players, lineup, 2 clubs, 16 tweak keys)', '-', stat(!bad.length));
}

function expOdds() {
  // d6 table from the 36 pairs
  const exp = [2.8, 8.3, 16.7, 27.8, 41.7, 58.3, 72.2, 83.3, 91.7, 97.2];
  const tab = SD.odds.table(6), bad = [];
  tab.forEach((r, i) => { if (Math.abs(r.p * 100 - exp[i]) > 0.06 || r.gap !== i - 4) bad.push(`gap ${r.gap}: ${(r.p * 100).toFixed(2)}`); });
  if (tab.length !== 10) bad.push('table length ' + tab.length);
  // every pair x gap x tie flag against the independent rule, and duel() against independent enumeration
  let pairs = 0, mism = 0;
  for (let gap = -8; gap <= 9; gap++) for (const tie of [false, true]) {
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) { pairs++; if (SD.odds.attWins(gap, a, b, tie, 6) !== attW(gap, a, b, tie, 6)) mism++; }
    if (Math.abs(SD.odds.duel(gap, tie, 6) - enumP(gap, tie, 6)) > 1e-12) mism++;
  }
  add('d6 table reproduced from the 36 pairs (SD.odds.table, 10 gaps)', '2.8 8.3 16.7 27.8 41.7 58.3 72.2 83.3 91.7 97.2', bad.length ? bad.join(', ') : 'all 10 equal; ' + tab.map((r) => (r.p * 100).toFixed(1)).join(' '), '36 pairs', stat(!bad.length));
  add('SD.odds.attWins / duel v independent rule (nat 6 v 1 wins, nat 1 v 6 loses, ties to defender)', '0 mismatches', mism + ' mismatches in ' + pairs + ' pair-checks (gap -8..9, both tie flags)', '36 pairs x 36 gaps', stat(!mism));
}

function expReplay() {
  const seeds = seedList('replay', 30); let diff = 0, same = 0, checked = 0;
  for (const club of CLUBS) for (const pol of ['skilled', 'random', 'ro', 'staller']) {
    for (const seed of seeds.slice(0, 8)) {
      const cfg = { seed, club, formation: 'Spear', pitchLevel: 2, nodes: ['A1', 'D1', 'S1'] };
      const a = runMatch(cfg, pol), b = runMatch(cfg, pol); checked++;
      const key = (r) => JSON.stringify(r.m.log.map((e) => [e.pid, e.action, e.stance, e.dice, e.win, e.cause, e.rerolls, e.score])) + JSON.stringify(r.sum);
      if (key(a) !== key(b)) diff++;
    }
  }
  const x = runMatch({ seed: seeds[0], club: 'grimsby' }, 'skilled'), y = runMatch({ seed: seeds[1], club: 'grimsby' }, 'skilled');
  if (JSON.stringify(x.m.log.map((e) => e.cause)) !== JSON.stringify(y.m.log.map((e) => e.cause))) same = 1;
  add('A seed replays identically (full event log + summary, 4 policies x 2 clubs, fx on)', 'identical', diff + ' of ' + checked + ' replays differ' + (same ? '' : '; different seeds gave same log (BAD)'), checked + ' seeds x2', stat(!diff && same));
}

function expResolveAndCap() {
  // every played duel re-derived from the event: win === attWins(gap, dice, tieAtt) unless an fx rerolled/tied; parts add up; cap respected
  let n = 0, badWin = 0, badSum = 0, badCap = 0, rerolled = 0, badChipE = 0, badChipRel = 0, nChip = 0, handBad = 0;
  const seeds = seedList('resolve', 400);
  for (const club of CLUBS) for (const lvl of [1]) for (const form of ['Wall', 'Diamond', 'Spear']) {
    for (const seed of seeds.slice(0, 100)) {
      const r = runMatch({ seed, club, formation: form, pitchLevel: lvl }, 'skilled');
      r.rec.events.forEach((e) => {
        n++;
        if (e.rerolls.length || e.tieBy) { rerolled++; } else {
          const attWon = e.side === 'me' ? e.win : e.win; // event.win = attacker won in both directions
          if (attW(e.gap, e.dice.att, e.dice.def, false, 6) !== attWon) badWin++;
        }
        const sumP = e.parts.reduce((x, p) => x + p.v, 0);
        if (e.side === 'me') {
          if (sumP !== e.myScore) badSum++;
          if (e.oppParts.reduce((x, p) => x + p.v, 0) !== e.oppScore) badSum++;
          const stat0 = e.parts[0].v; if (e.myScore - stat0 > 3) badCap++;
          const sm = e.stance ? sMod(e.action, e.stance) : 0; if (e.myScore - e.oppScore + sm !== e.gap) badSum++;
        } else {
          if (sumP !== e.myScore) badSum++;
          if (e.oppParts.reduce((x, p) => x + p.v, 0) !== e.oppScore) badSum++;
          const sm = sMod(e.action, e.stance); if (e.oppScore - e.myScore + sm !== e.gap) badSum++;
        }
        if (e.hand.length !== 3) handBad++;
        // chip v enumeration of the shown gap (no fx at level 1, no nodes)
        if (e.side === 'me' && e.chip.pressW !== undefined) {
          nChip++;
          const gapNoStance = e.myScore - e.oppScore;
          const exp = e.chip.pressW * enumP(gapNoStance + sMod(e.action, 'press'), false, 6) + (1 - e.chip.pressW) * enumP(gapNoStance + sMod(e.action, 'drop'), false, 6);
          if (Math.abs(exp - e.chip.p) > 1e-9) badChipE++;
        }
      });
    }
  }
  add('Every resolved duel re-derived from its Event: win = rule(gap, dice) (Level 1, no nodes, so no fx duel is skipped)', '0 mismatches', `${badWin} of ${n - rerolled} (${rerolled} fx-altered duels skipped)`, '600 matches', stat(!badWin));
  add('Chip parts sum to the shown total, gap = total - opp total (+stance), both sides, both clubs, 3 formations', '0 mismatches', `${badSum} in ${n} events`, '600 matches', stat(!badSum));
  add('Attack chip equals 36-pair enumeration of its own gap and Press weight (exact, 1e-9)', '0 mismatches', `${badChipE} of ${nChip} shown chips`, '600 matches', stat(!badChipE));
  add('Cap +3 on d6 respected on every attack (bonus over stat <= 3, incl. Pass +2)', 'max +3', badCap + ' breaches in ' + n + ' events', '600 matches', stat(!badCap));
  add('Hand is 3 cards on every turn without Fourth Card', '3', handBad + ' turns with another size', '600 matches', stat(!handBad));
}

// chip v 20,000 seeded duels. States are reached by replaying a seed; each trial re-reaches the state, then replaces the turn's four
// draws (ua, us, da, db) and the reroll stream with a fresh seed (m.roll / m.rng.fxr), then plays the SAME move through playAttack/playDefend.
function expChip() {
  const stateSeeds = seedList('chipstate', 60);
  function reach(cfg, polName, targetTurn, side) {
    // play with policy until turnNo === targetTurn and phase matches; return the live match (not yet played)
    const setup = mkSetup(cfg), pol = POLS[polName];
    const m = SD.engine.newMatch(setup); const ctx = { m, pol, M: null, pr: mulberry(1), stat: { previews: 0, used: {} } };
    let g = 0;
    while (m.phase !== 'full' && g++ < 100) {
      if (m.phase === 'halftime') { SD.engine.startHalf2(m); continue; }
      if (!ctx.M) ctx.M = getModel(m);
      if (m.turnNo === targetTurn) return { m, ctx };
      useActives(ctx);
      if (m.phase === 'attack') { const c = chooseAttack(ctx); SD.engine.playAttack(m, c.pid, c.a); } else { const c = chooseDefend(ctx); SD.engine.playDefend(m, c.pid, c.stance); }
      SD.engine.nextPhase(m);
    }
    return null;
  }
  const picks = [];
  // choose a spread of states: attack in zones 0,1,2 with Pass/Dribble/Through/Shoot, defence turns; both clubs; formations
  const wantA = { 0: ['dribble', 'through', 'pass'], 1: ['dribble', 'through', 'pass'], 2: ['shoot', 'pass'] };
  let si = 0;
  for (const club of CLUBS) for (const form of ['Wall', 'Spear', 'Diamond']) {
    const cfg0 = { club, formation: form, pitchLevel: 1 };
    for (let tries = 0; tries < 400 && picks.length < 40; tries++) {
      const seed = stateSeeds[si++ % stateSeeds.length] + tries * 7919 >>> 0;
      const turnNo = 1 + Math.floor(mulberry(seed)() * 12);
      const R = reach(Object.assign({ seed }, cfg0), 'skilled', turnNo);
      if (!R) continue;
      const m = R.m, side = m.phase;
      const key = side === 'attack' ? 'A' + m.zone : 'D';
      const have = picks.filter((p) => p.key === key && p.club === club).length;
      if (have >= (side === 'attack' ? 3 : 4)) continue;
      picks.push({ key, club, form, seed, turnNo, side });
      if (picks.filter((p) => p.club === club && p.form === form).length >= 7) break;
    }
  }
  let worst = 0, nStates = 0, fails = 0; const lines = [];
  for (const P of picks) {
    const cfg = { seed: P.seed, club: P.club, formation: P.form, pitchLevel: 1 };
    const R0 = reach(cfg, 'skilled', P.turnNo); const m0 = R0.m;
    let move, shown;
    if (P.side === 'attack') { const c = chooseAttack(R0.ctx); move = c; shown = SD.engine.previewAttack(m0, c.pid, c.a).chip.p; }
    else { const c = chooseDefend(R0.ctx); move = c; shown = SD.engine.previewDefend(m0, c.pid, c.stance).chip.p; }
    let hit = 0;
    const trials = seedList('chiptrial' + P.seed + P.turnNo, N_CHIP);
    for (let j = 0; j < N_CHIP; j++) {
      const R = reach(cfg, 'skilled', P.turnNo); const m = R.m, rr = mulberry(trials[j]);
      m.roll = { ua: rr(), us: rr(), da: 1 + Math.floor(rr() * 6), db: 1 + Math.floor(rr() * 6) };
      m.rng.fxr = SD.rng.make((trials[j] ^ 0x5EED5EED) >>> 0);
      if (P.side === 'attack') { const ev = SD.engine.playAttack(m, move.pid, move.a); if (ev.win) hit++; }
      else { const ev = SD.engine.playDefend(m, move.pid, move.stance); if (ev.meWon) hit++; }
    }
    const emp = hit / N_CHIP, d = 100 * Math.abs(emp - shown);
    nStates++; if (d > worst) worst = d; if (d > 1) fails++;
    lines.push(`${P.club}/${P.form}/T${P.turnNo}/${P.side}${P.side === 'attack' ? ' Z' + m0.zone + ' ' + move.a : ' Z' + m0.zone + ' ' + move.stance}: chip ${pct(shown)} v ${pct(emp)} (d ${d.toFixed(2)})`);
    if (nStates >= 24) break;
  }
  DATA.chipLines = lines;
  add('Every odds chip within 1 point of ' + N_CHIP + ' seeded duels (attack and defence states)', 'max |chip - freq| <= 1.0 pt', `${nStates} states, worst ${worst.toFixed(2)} pt, ${fails} over 1.0`, nStates + ' states x ' + N_CHIP, stat(!fails && nStates >= 20), nStates < 20 ? 'too few states reached' : '');
}

function expFormation() {
  const seeds = seedList('form', N_GATE); const out = {};
  for (const club of CLUBS) {
    const t = {};
    for (const form of ['Wall', 'Diamond', 'Spear']) t[form] = batch({ club, formation: form, matchNo: club === 'grimsby' ? 1 : 2 }, 'skilled', seeds);
    const names = Object.keys(t).sort((a, b) => t[b].winPct - t[a].winPct);
    BEST[club] = names[0]; out[club] = { t, names, spread: t[names[0]].winPct - t[names[names.length - 1]].winPct };
  }
  DATA.form = out;
  const fmt = (c) => out[c].names.map((n) => `${n} ${out[c].t[n].winPct.toFixed(1)}`).join(' / ');
  const g = out.grimsby, r = out.reading;
  add('Formation spread v Reading (best - worst, skilled wins)', '>= 5', `${r.spread.toFixed(1)}: ${fmt('reading')}`, N_GATE + ' x 3', stat(r.spread >= 5));
  add('Formation spread v Grimsby (KNOWN MISS, report the number)', '>= 5 (expected ~1)', `${g.spread.toFixed(1)}: ${fmt('grimsby')}`, N_GATE + ' x 3', g.spread >= 5 ? 'PASS' : 'EXPECTED-FAIL', g.spread >= 5 ? 'now passes: the known miss is gone' : 'noise at this N is about 1.5 points per row');
  add('Best formation differs between the two clubs', 'differs', `Grimsby ${BEST.grimsby}, Reading ${BEST.reading}`, N_GATE + ' x 6', BEST.grimsby !== BEST.reading ? 'PASS' : 'MISS', BEST.grimsby === BEST.reading ? 'same best formation for both clubs' : '');
}

function expWins() {
  const seeds = seedList('wins', N_GATE);
  const res = {};
  for (const club of CLUBS) for (const pol of ['skilled', 'random', 'rc', 'ro', 'staller']) res[club + '/' + pol] = batch({ club, formation: BEST[club] || 'Wall', matchNo: club === 'grimsby' ? 1 : 2 }, pol, seeds);
  DATA.wins = res;
  const g = (c, p) => res[c + '/' + p];
  add('Skilled bot, match 1 v Grimsby (default lineup, Level 1, no nodes, best formation ' + (BEST.grimsby || 'Wall') + ')', '60-70 % wins', wdl(g('grimsby', 'skilled')), N_GATE, stat(inRange(g('grimsby', 'skilled').winPct, 60, 70)));
  add('Skilled bot, match 2 v Reading (same lineup, bare: the bot5 conditions)', '40-50 % wins', wdl(g('reading', 'skilled')), N_GATE, stat(inRange(g('reading', 'skilled').winPct, 40, 50)));
  add('Random bot ("Random": random card, random action / stance), match 1', '20-45 % wins (floor and ceiling)', wdl(g('grimsby', 'random')), N_GATE, stat(inRange(g('grimsby', 'random').winPct, 20, 45)));
  add('Random-card bot ("RC": random card, best action / stance for that card), match 1', '20-45 % wins (floor and ceiling)', wdl(g('grimsby', 'rc')), N_GATE, stat(inRange(g('grimsby', 'rc').winPct, 20, 45)));
  add('Random-card bot, match 2 (information)', '20-45 reported', wdl(g('reading', 'rc')), N_GATE, 'INFO');
  add('Random bot, match 2 (information; same band reported)', '20-45 reported', wdl(g('reading', 'random')), N_GATE, 'INFO');
  add('Lazy role-owner "ro" v skilled, match 1: win points lost by following roles (the choice test)', 'ro clearly below skilled (info; > 3 pts = the pick matters)', `ro ${g('grimsby', 'ro').winPct.toFixed(1)} v skilled ${g('grimsby', 'skilled').winPct.toFixed(1)} (gap ${(g('grimsby', 'skilled').winPct - g('grimsby', 'ro').winPct).toFixed(1)})`, N_GATE, 'INFO');
  add('Lazy role-owner "ro" v skilled, match 2', 'info', `ro ${g('reading', 'ro').winPct.toFixed(1)} v skilled ${g('reading', 'skilled').winPct.toFixed(1)} (gap ${(g('reading', 'skilled').winPct - g('reading', 'ro').winPct).toFixed(1)})`, N_GATE, 'INFO');
  // 0-0, card share, advances, staller
  for (const club of CLUBS) {
    const R = g(club, 'skilled');
    add('0-0 at full time, skilled, ' + club, '<= 20 %', R.z0Pct.toFixed(1) + ' %  (draws ' + R.drawPct.toFixed(1) + ' %, GF ' + (R.gf / R.n).toFixed(2) + ' GA ' + (R.ga / R.n).toFixed(2) + ')', N_GATE, stat(R.z0Pct <= 20));
    const sh = Object.keys(R.cards).sort((a, b) => R.cards[b] - R.cards[a]).map((k) => `${k} ${(100 * R.cards[k] / R.atk).toFixed(0)}`);
    add('Top card share of attack picks, skilled, ' + club, '<= 45 %', sh.join(' / '), N_GATE + ' (' + R.atk + ' picks)', stat(100 * R.cards[Object.keys(R.cards).sort((a, b) => R.cards[b] - R.cards[a])[0]] / R.atk <= 45));
    const a = R.acts, tot = R.atk;
    const dr = 100 * a.dribble / tot, th = 100 * a.through / tot;
    add('Advance share of attack picks, skilled, ' + club + ' (Dribble, Through each)', '<= 80 % each', `Dribble ${dr.toFixed(0)} / Through ${th.toFixed(0)} / Pass ${(100 * a.pass / tot).toFixed(0)} / Shoot ${(100 * a.shoot / tot).toFixed(0)}`, N_GATE, stat(dr <= 80 && th <= 80));
  }
  // staller v skilled: points share across both clubs, paired on the same seeds. 50 = equal
  const sP = (club, pol) => mean(Array.from(g(club, pol).pts));
  const skPts = (sP('grimsby', 'skilled') + sP('reading', 'skilled')) / 2, stPts = (sP('grimsby', 'staller') + sP('reading', 'staller')) / 2;
  const share = 100 * stPts / (stPts + skPts);
  const sg = (c) => 100 * sP(c, 'staller') / (sP(c, 'staller') + sP(c, 'skilled'));
  add('Staller (skilled until ahead, then Pass whenever legal) v skilled: points share on identical seeds', '48-52 (50 = equal)', `${share.toFixed(1)}  (Grimsby ${sg('grimsby').toFixed(1)}, Reading ${sg('reading').toFixed(1)}; staller wins ${g('grimsby', 'staller').winPct.toFixed(1)} / ${g('reading', 'staller').winPct.toFixed(1)} v skilled ${g('grimsby', 'skilled').winPct.toFixed(1)} / ${g('reading', 'skilled').winPct.toFixed(1)})`, N_GATE + ' x 2 clubs', stat(inRange(share, 48, 52)), 'engine has no bot opponent, so "v skilled" = staller points / (staller + skilled points) against the same clubs, same seeds');
}

function expAsShipped() {
  // match 2 as a player will actually meet it: Level 2 Traits on the five pitch players (Opening day), plus one 3-SP node set
  const seeds = seedList('wins', N_GATE);
  const sets = [['Level 2 traits only', 2, []], ['L2 + A1,A2', 2, ['A1', 'A2']], ['L2 + D1,D2', 2, ['D1', 'D2']], ['L2 + S1,S2', 2, ['S1', 'S2']]];
  const lines = [];
  for (const club of CLUBS) for (const [label, lvl, nodes] of sets) {
    const R = batch({ club, formation: BEST[club] || 'Wall', pitchLevel: lvl, nodes, matchNo: 2 }, 'skilled', seeds);
    lines.push(`${club}: ${label} ${R.winPct.toFixed(1)}`);
  }
  add('Information: match 2 as shipped (Level 2 Traits on all 5 pitch players, one 3-SP node set), skilled wins', 'info (gate band 40-50 is on the bare line above)', lines.join(' | '), N_GATE + ' each', 'INFO');
}

// fx lifts: each node / Trait / Signature alone, on v fxOff, paired seeds, both clubs
const FX_TESTS = [
  // id, label, cfg overrides (what is fielded / owned), fxOff target ids
  { id: 'A1', label: 'Node A1 Sharp Eye', cfg: { nodes: ['A1'] } },
  { id: 'A2', label: 'Node A2 Keep the Thread (A1 owned in both arms)', cfg: { nodes: ['A1', 'A2'] } },
  { id: 'D1', label: 'Node D1 Rebound', cfg: { nodes: ['D1'] } },
  { id: 'D2', label: 'Node D2 Last Man (D1 owned in both arms)', cfg: { nodes: ['D1', 'D2'] } },
  { id: 'S1', label: 'Node S1 Fresh Hand', cfg: { nodes: ['S1'] } },
  { id: 'S2', label: 'Node S2 Fourth Card (hand of 4; S1 owned in both arms)', cfg: { nodes: ['S1', 'S2'] } },
  { id: 'T_PLAYMAKER', label: 'Trait Spare Ball (Mirelle L2)', cfg: {} },
  { id: 'T_WINGER', label: 'Trait Quick Feet (Pip L2)', cfg: {} },
  { id: 'T_STRIKER', label: 'Trait Second Strike (Tavo L2)', cfg: {} },
  { id: 'T_ANCHOR', label: 'Trait Hold Firm (Kessan L2)', cfg: {} },
  { id: 'T_KEEPER', label: 'Trait Big Read (Ondra L2)', cfg: {} },
  { id: 'SIG_LIO', label: 'Signature Dream Volley (Lio fielded)', cfg: { swap: ['lio'] } },
  { id: 'SIG_JOSS', label: 'Signature Sweep Across (Joss fielded)', cfg: { swap: ['joss'] } },
  { id: 'SIG_ZEFA', label: 'Signature Wing Switch (Zefa fielded)', cfg: { swap: ['zefa'] } },
  { id: 'SIG_HADRO', label: 'Signature Read the Run (Hadro fielded)', cfg: { swap: ['hadro'] } },
  { id: 'SIG_YSOLDE', label: 'Signature Last Hand (Ysolde in goal)', cfg: { swap: ['ysolde'] } },
];
function expLifts() {
  const seeds = seedList('lift', N_LIFT);
  const only = ARGS.fx ? String(ARGS.fx).split(',') : null;
  DATA.lifts = {};
  for (const t of FX_TESTS) {
    if (only && !only.includes(t.id)) continue;
    guard('fx ' + t.id, () => {
      const per = {};
      for (const club of CLUBS) {
        const base = Object.assign({ club, formation: BEST[club] || 'Wall', pitchLevel: 2, matchNo: 2 }, t.cfg);
        const on = batch(base, 'skilled', seeds);
        const off = batch(Object.assign({}, base, { fxOff: { [t.id]: true } }), 'skilled', seeds);
        const pl = pairedLift(on, off);
        per[club] = { on, off, lift: pl.lift, se: pl.se, fired: (on.fx[t.id] || 0) / on.n, used: on.used };
      }
      DATA.lifts[t.id] = per;
      const g = per.grimsby, r = per.reading;
      const ok = (x) => x.lift >= 2 && x.lift <= 15;
      const both = ok(g) && ok(r);
      const passive = t.id === 'S2' || t.id === 'SIG_LIO';
      const fired = t.id === 'SIG_LIO' ? `Midfield Shoot picked ${((g.on.midShoot || 0) / N_LIFT).toFixed(2)} / ${((r.on.midShoot || 0) / N_LIFT).toFixed(2)} times per match` : t.id === 'S2' ? 'passive (hand of 4 every turn)' : `fires in ${pct(g.fired, 0)} / ${pct(r.fired, 0)} % of matches`;
      const usedTxt = Object.keys(g.on.used).length ? ' ; bot used ' + JSON.stringify(g.on.used) + ' / ' + JSON.stringify(r.on.used) : '';
      const dead = (x) => x.lift === 0 && x.se === 0;
      add(t.label + ' alone lifts skilled wins', '2-15 pts, none over 15 (both clubs)', `Grimsby ${g.lift >= 0 ? '+' : ''}${g.lift.toFixed(1)} (se ${g.se.toFixed(1)}), Reading ${r.lift >= 0 ? '+' : ''}${r.lift.toFixed(1)} (se ${r.se.toFixed(1)}); ${fired}${usedTxt}`, N_LIFT + ' paired x 2 clubs', both ? 'PASS' : 'MISS', both ? '' : (g.lift > 15 || r.lift > 15 ? 'over the 15 ceiling' : (dead(g) && dead(r) ? 'IDENTICAL result in every seed: it fires but can never change an outcome' : (!passive && g.fired + r.fired === 0 ? 'never fires' : 'below the 2 floor on ' + [ok(g) ? '' : 'Grimsby', ok(r) ? '' : 'Reading'].filter(Boolean).join(' and ')))));
    });
  }
}

function expPlayerLift() {
  // information: whole-player lift (stats + Trait + move) of each pulled player v the default lineup, to separate "player" from "move"
  const seeds = seedList('lift', Math.min(N_LIFT, 800)); const lines = [];
  for (const pid of ['lio', 'joss', 'zefa', 'hadro', 'ysolde']) {
    const parts = [];
    for (const club of CLUBS) {
      const base = { club, formation: BEST[club] || 'Wall', pitchLevel: 2, matchNo: 2 };
      const a = batch(Object.assign({ swap: [pid] }, base), 'skilled', seeds), b = batch(base, 'skilled', seeds);
      parts.push(`${club} ${(a.winPct - b.winPct >= 0 ? '+' : '') + (a.winPct - b.winPct).toFixed(1)}`);
    }
    lines.push(`${pid}: ${parts.join(', ')}`);
  }
  add('Information: whole pulled player v default lineup (stats + move), skilled wins', 'info (bot5: Lio 9.2/10.5, Joss 7.9/7.0, Zefa 4.7/5.4, Hadro 1.9/3.0, Ysolde 8.5/9.6)', lines.join(' | '), Math.min(N_LIFT, 800) + ' paired', 'INFO');
}

// ================================================================== main
function writeDoc() {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const cnt = {}; ROWS.forEach((r) => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
  let md = '# Squad Duel build bot: gate table\n\n';
  md += `Build sq-slice-1, shipped engine (pages/squad-duel/js). Run ${stamp}. \`node tests/squad-duel/bot.js\` (n=${N_GATE} win-rate seeds, ${N_LIFT} paired seeds per lift, ${N_CHIP} duels per chip state).\n\n`;
  md += `Summary: ${Object.keys(cnt).map((k) => k + ' ' + cnt[k]).join(', ')}.\n\n`;
  md += 'Policies (every move goes through SD.engine.playAttack / playDefend): skilled = match5 dp port (getDP6 hand-aware value tables for the continuation, immediate odds from SD.engine.previewAttack/previewDefend, uses A1 / S1, reads Hadro and Sharp Eye tells, plays Zefa +2 zones, can pull Joss); random; ro = lazy role-owner; staller.\n\n';
  md += '| Gate | Target | Measured | Seeds | Status |\n|---|---|---|---|---|\n';
  ROWS.forEach((r) => { md += `| ${r.gate.replace(/\|/g, '/')} | ${r.target.replace(/\|/g, '/')} | ${String(r.measured).replace(/\|/g, '/')}${r.note ? ' (' + r.note.replace(/\|/g, '/') + ')' : ''} | ${r.seeds} | ${r.status} |\n`; });
  if (DATA.chipLines) md += '\nChip states checked:\n\n' + DATA.chipLines.map((l) => '- ' + l).join('\n') + '\n';
  md += '\n<!-- FINDINGS -->\n';
  let keep = '';
  try { const old = fs.readFileSync(OUT, 'utf8'); const i = old.indexOf('<!-- FINDINGS -->'); if (i >= 0) keep = old.slice(i + '<!-- FINDINGS -->\n'.length); } catch (e) { /* none */ }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md + keep);
}

function main() {
  const t0 = Date.now();
  console.log('loaded:', L.loaded.join(' '), L.missing.length ? 'MISSING ' + L.missing.join(' ') : '', L.errors.length ? 'ERRORS ' + JSON.stringify(L.errors) : '');
  if (L.missing.length || L.errors.length || !SD.engine) {
    add('Engine and modules load', 'all of rng data odds club-ai fx-nodes fx-players engine', 'missing: ' + L.missing.join(' ') + ' errors: ' + L.errors.map((e) => e.file).join(' '), '-', 'MISS');
    if (!ARGS['no-write']) writeDoc(); return;
  }
  const steps = [['defaults', expDefaults], ['odds', expOdds], ['replay', expReplay], ['resolve', expResolveAndCap], ['chip', expChip], ['form', expFormation], ['wins', expWins], ['shipped', expAsShipped], ['lifts', expLifts], ['player', expPlayerLift]];
  for (const [k, fn] of steps) {
    if (!want(k)) continue;
    if ((k === 'wins' || k === 'shipped' || k === 'lifts' || k === 'player') && !BEST.grimsby) { for (const c of CLUBS) BEST[c] = BEST[c] || 'Wall'; }
    guard(k, fn); console.log(`-- ${k} done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (!ARGS['no-write']) writeDoc();
  console.log('done in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
main();
