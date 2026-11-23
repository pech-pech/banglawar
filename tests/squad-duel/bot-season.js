#!/usr/bin/env node
'use strict';
// Squad Duel SEASON build bot (build sq-season-1, maker "bot"). Runs the BUILD-BRIEF "Bot gates" 1-7 on the REAL engine:
// every move goes through SD.engine.playAttack / playDefend / use; seasons through SD.season; shootouts through SD.shootout;
// pulls through SD.gacha.pull; pay through SD.progress.applyMatch. Policies only CHOOSE.
//   skilled : port of tests/squad-duel/bot.js 'dp' policy (getDP6 value tables, hand-aware; immediate odds from previewAttack / previewDefend).
//             New: Call for Ball (Orlo) via SD.engine.attackCards, Twin Run second Shoot, Second Look (A3) used like Sharp Eye.
//   random  : random card, random action / stance;  rc : random card, best action;  ro : lazy role-owner;  staller.
// Usage: node tests/squad-duel/bot-season.js [--only=sig,nodes3,lvl4,roar,ruler,ladder,retune,ladderN,season,season2,pulls,odds,resolve,chip,replay,player]
//          [--n=2000] [--lift=1500] [--liftmax=4000] [--chip=4000] [--seasons=4000] [--rows=/tmp/sd-bot/rows] [--no-write] [--report]
//   Each experiment saves its rows to <rows>/<key>.json; `--report` (or a run without --only) writes docs/squad-duel/sq-season-1/BOT-SEASON.md from all saved rows.
const fs = require('fs');
const path = require('path');
const { load } = require('./load.js');

const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const N_WIN = +ARGS.n || 2000;          // seeds for win-rate rows (SE of a win rate about 1.1 points)
const N_LIFT = +ARGS.lift || 1500;      // paired seeds for each lift (first pass)
const N_LIFTMAX = +ARGS.liftmax || 4000; // borderline lifts are re-run at this size
const N_CHIP = +ARGS.chip || 4000;
const N_SEASONS = +ARGS.seasons || 4000;
const ROWS_DIR = ARGS.rows || '/tmp/sd-bot/rows';
const ONLY = ARGS.only ? String(ARGS.only).split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);

const L = load();
const SD = globalThis.SD;
const OUT = path.resolve(__dirname, '../../docs/squad-duel/sq-season-1/BOT-SEASON.md');

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

// ------------------------------------------------------------------ setup builders (real data, real progress.statsOf, real season.clubFor)
const ORDER_CLUBS = ['grimsby', 'reading', 'bolton', 'stockport', 'rotherham', 'wycombe', 'lincoln'];
const HOME_OF = (md) => (SD.data.SEASON ? SD.data.SEASON.home[md - 1] : [true, true, false, true, false, true, false][md - 1]);
const HARD = { // SEASON-SPEC section 3 HARD rows [def, keeper, atk]; compared with data.js in the clubstats check
  grimsby: [5, 7, 7], reading: [5, 9, 9], bolton: [6, 7, 10], stockport: [7, 10, 9], rotherham: [10, 9, 10], wycombe: [9, 10, 10], lincoln: [8, 10, 10] };
const BAND = [60, 52, 52, 50, 48, 46, 42];
const DEFAULT_L = () => ({ keeper: 'ondra', outfield: ['kessan', 'mirelle', 'pip', 'tavo'], bench: ['barro', 'sunniva'] });
const hardT = (extra) => Object.assign({}, SD.data.TWEAK_DEFAULTS, { difficulty: 2 }, extra || {});

function mkP(id, level, stars, T) {
  const S = { owned: { [id]: { stars: stars || 0, level: level || 1 } } };
  return SD.progress.statsOf(S, id, T);
}
function clubAt(clubId, md, T, seasonNo) {
  const S = { seed: 1, season: { no: seasonNo || 1, md: md - 1, results: [], cup: {}, tieOrder: [] } };
  return SD.season.clubFor(S, clubId, T, md);
}
// cfg: {seed, club (id), md (1..7, 8 = Cup), mode ('home'|'away'|'neutral'; default from the fixture list), cup, seasonNo, formation, swap:[pid], benchSwap:[pid],
//       pitchLevel, benchLevel, swapLevel (default 1), lvl:{pid:level}, stars:{pid:n}, nodes, captain, T (extra tweak keys), fxOff, difficulty}
function mkSetup(cfg) {
  const md = cfg.md || Math.max(1, ORDER_CLUBS.indexOf(cfg.club) + 1);
  const cup = !!cfg.cup || md === 8;
  const mode = cfg.mode || (cup ? 'neutral' : HOME_OF(md) ? 'home' : 'away');
  const T = hardT(Object.assign({}, cfg.T || {}, cfg.difficulty != null ? { difficulty: cfg.difficulty } : {}));
  T.fxOff = Object.assign({}, cfg.fxOff || {});
  const lu = cfg.lineup ? JSON.parse(JSON.stringify(cfg.lineup)) : DEFAULT_L();
  (cfg.swap || []).forEach((pid) => {
    const d = SD.data.byId(pid);
    if (d.role === 'Keeper') { lu.keeper = pid; return; }
    const slot = lu.outfield.findIndex((x) => SD.data.byId(x).role === d.role);
    if (slot >= 0) lu.outfield[slot] = pid; else lu.outfield[0] = pid;
  });
  (cfg.benchSwap || []).forEach((pid) => { const d = SD.data.byId(pid); const i = lu.bench.findIndex((x) => SD.data.byId(x).role === d.role); lu.bench[i >= 0 ? i : 0] = pid; });
  const swapped = new Set((cfg.swap || []).concat(cfg.benchSwap || []));
  const pitch = new Set([lu.keeper].concat(lu.outfield));
  const lvl = (pid) => (cfg.lvl && cfg.lvl[pid]) || (swapped.has(pid) ? (cfg.swapLevel || 1) : pitch.has(pid) ? (cfg.pitchLevel || 1) : (cfg.benchLevel || 1));
  const stars = (pid) => (cfg.stars && cfg.stars[pid]) || 0;
  const club = cfg.clubObj || clubAt(cfg.club, md, T, cfg.seasonNo);
  const homeSide = mode === 'home' ? 'me' : mode === 'away' ? 'opp' : 'none';
  return {
    seed: cfg.seed, matchNo: md, season: cfg.seasonNo || 1, md, mode, homeSide, cup, captain: cfg.captain || null,
    club, formation: cfg.formation || 'Wall',
    keeper: mkP(lu.keeper, lvl(lu.keeper), stars(lu.keeper), T), outfield: lu.outfield.map((id) => mkP(id, lvl(id), stars(id), T)), bench: lu.bench.map((id) => mkP(id, lvl(id), stars(id), T)),
    nodes: (cfg.nodes || []).slice(), T,
  };
}

// ------------------------------------------------------------------ the "expected squad" of each matchday (E-bot-season section 3, extended for the new content)
// pitch / bench Level: MD1 1/1, MD2-3 2/1, MD4-7 3/2, Cup 4/2 (Level 4 = XP 150, reached after MD7 [A-systems e arithmetic]).
// SP floor 3, 4, 6, 7, 9, 10, 12 (A-systems f: 3 opening + 1.5 a match, floored). Nodes bought in the order below while they fit.
const LV = { 1: [1, 1], 2: [2, 1], 3: [2, 1], 4: [3, 2], 5: [3, 2], 6: [3, 2], 7: [3, 2], 8: [4, 2] };
const SP_AT = { 1: 0, 2: 3, 3: 4, 4: 6, 5: 7, 6: 9, 7: 10, 8: 12 };
const NODE_ORDER = [['D1', 1], ['D2', 2], ['S1', 1], ['S2', 2], ['A1', 1], ['D3', 3], ['A3', 3], ['S3', 3]];
function nodesFor(md, sp) {
  let left = sp === undefined ? SP_AT[md] : sp; const out = [];
  for (const [id, c] of NODE_ORDER) { if (c <= left) { out.push(id); left -= c; } }
  return out;
}
const BEST_FORM = { 1: 'Wall', 2: 'Diamond', 3: 'Spear', 4: 'Diamond', 5: 'Wall', 6: 'Wall', 7: 'Diamond', 8: 'Diamond' }; // E-bot-season table; re-selected by selectForm()
// variant: 'expected' (E median pull path), 'never' (levels + nodes only), 'bare' (Level 1, no nodes, no pulls)
function squadFor(md, variant) {
  const [pl, bl] = LV[md];
  if (variant === 'bare') return { pitchLevel: 1, benchLevel: 1, nodes: [] };
  const cfg = { pitchLevel: pl, benchLevel: bl, nodes: nodesFor(md), lvl: {}, stars: {}, swap: [] };
  if (variant === 'never') return cfg;
  if (md >= 2) { cfg.swap.push('lio'); cfg.lvl.lio = md >= 5 ? 3 : md >= 3 ? 2 : 1; }
  if (md >= 7) { cfg.swap.push('zefa'); cfg.lvl.zefa = md === 8 ? 2 : 1; }
  if (md >= 3) cfg.stars.lio = 1; if (md >= 4) cfg.stars.ondra = 1; if (md >= 5) cfg.stars.mirelle = 1; if (md >= 6) cfg.stars.sunniva = 1; if (md === 8) cfg.stars.ondra = 2;
  return cfg;
}
function cfgFor(md, club, variant, extra) {
  const sq = squadFor(md, variant);
  return Object.assign({ club, md, formation: BEST_FORM[md] }, sq, extra || {});
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
    if ((x.id === 'A1' || x.id === 'A3') && m.phase === 'attack') {
      const tl = SD.engine.tell(m); if (tl.exact) continue;
      const opts = attackOptions(ctx, m.hand, tl), tw = twOf(tl);
      const cur = evA(bestOf(opts, (o) => evA(o, tw)), tw);
      const withInfo = tw[0] * evA(bestOf(opts, (o) => evA(o, [1, 0])), [1, 0]) + tw[1] * evA(bestOf(opts, (o) => evA(o, [0, 1])), [0, 1]);
      if (withInfo - cur >= (ctx.pol.a1thr === undefined ? 0.012 : ctx.pol.a1thr)) { if (SD.engine.use(m, x.id)) ctx.stat.used[x.id] = (ctx.stat.used[x.id] || 0) + 1; }
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
  const m = ctx.m, pol = ctx.pol, cands = SD.engine.attackCards ? SD.engine.attackCards(m, true).slice() : m.hand.slice();
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
function twinDeclines(ctx) {
  const m = ctx.m, M = ctx.M, L1 = Math.max(0, m.T.halfTurns - m.turn);
  const hm = mask(M, m.hand), dm = mask(M, m.deck), hn = m.hand.length; let best = -1;
  for (const pid of m.hand) {
    if (!SD.engine.legal(m, pid).includes('shoot')) continue;
    const p = SD.engine.previewAttack(m, pid, 'shoot').chip.p;
    const w = 1 + nextVal(M, 'O', L1, 1, 0, hm, dm, pid, hn, true), l = nextVal(M, 'O', L1, 0, 0, hm, dm, pid, hn, true);
    best = Math.max(best, p * w + (1 - p) * l);
  }
  const stay = hn === M.hs ? stateVal(M, 'M', L1, 2, 0, hm, dm) : M.FM[(Math.min(M.H, L1) * 3 + 2) * 3];
  return best < stay;
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
  skilledDecl: { atk: 'dp', def: 'dp', twinDecline: true }, // Twin Run taken only when the Shoot is worth more than keeping the ball (needs a decline the API does not offer: sets m.played)
};

// ------------------------------------------------------------------ one match through the real engine
function runMatch(cfg, polName, hooks) {
  const setup = mkSetup(cfg), pol = POLS[polName];
  const m = SD.engine.newMatch(setup);
  const ctx = { m, pol, M: null, pr: mulberry((cfg.seed ^ 0x77777777) >>> 0), stat: { previews: 0, used: {} } };
  const rec = { picks: [], defs: [], events: [], roars: new Set(), kick1: m.holder, kick2: null, twin: 0, orlo: 0 };
  let guard = 0;
  while (m.phase !== 'full') {
    if (++guard > 300) throw new Error('match loop did not end (phase ' + m.phase + ') seed ' + cfg.seed);
    if (m.phase === 'halftime') { SD.engine.startHalf2(m); rec.kick2 = m.holder; continue; }
    if (!ctx.M) ctx.M = getModel(m);
    useActives(ctx);
    if (hooks && hooks.before) hooks.before(m, ctx);
    let ev;
    if (m.phase === 'attack') {
      const ch = chooseAttack(ctx); const wasHand = m.hand.includes(ch.pid); ev = SD.engine.playAttack(m, ch.pid, ch.a);
      if (!ev) throw new Error('playAttack refused ' + JSON.stringify(ch) + ' seed ' + cfg.seed + ' turn ' + m.turnNo + ' hand ' + m.hand.join(','));
      rec.picks.push({ pid: ch.pid, a: ch.a, zone: ev.zone }); if (!wasHand) rec.orlo++;
      rec.events.push(ev);
      let g2 = 0;
      while (m.flags.extraShoot && g2++ < 2) {
        if (pol.twinDecline && twinDeclines(ctx)) { m.flags.extraShoot = false; m.played = true; rec.twinDeclined = (rec.twinDeclined || 0) + 1; break; } // Twin Run: a second play this turn, a hand card as Shoot only (no turn spent)
        let best = null, bp = -1;
        for (const pid of m.hand) { if (!SD.engine.legal(m, pid).includes('shoot')) continue; const p = SD.engine.previewAttack(m, pid, 'shoot').chip.p; if (p > bp) { bp = p; best = pid; } }
        if (!best) break;
        const e2 = SD.engine.playAttack(m, best, 'shoot'); if (!e2) break;
        rec.twin++; rec.picks.push({ pid: best, a: 'shoot', zone: e2.zone, extra: true }); rec.events.push(e2); ev = e2;
      }
    } else {
      const ch = chooseDefend(ctx); ev = SD.engine.playDefend(m, ch.pid, ch.stance);
      if (!ev) throw new Error('playDefend refused ' + JSON.stringify(ch) + ' seed ' + cfg.seed + ' turn ' + m.turnNo + ' hand ' + m.hand.join(','));
      rec.defs.push({ pid: ev.pid, stance: ch.stance, action: ev.action });
      rec.events.push(ev);
    }
    if (m.roar) rec.roars.add(m.roar);
    if (hooks && hooks.after) hooks.after(m, ev, ctx);
    SD.engine.nextPhase(m);
  }
  return { m, sum: SD.engine.summary(m), rec, ctx };
}

// ------------------------------------------------------------------ shootout (real SD.shootout), policies choose the kicker only
const STAT_OF = (o) => o.stat;
function pickKicker(sh, pol, pr) {
  const opts = SD.shootout.options(sh); if (!opts.length) return null;
  if (pol === 'rand') return opts[Math.floor(pr() * opts.length)].pid;
  if (pol === 'strong') { let b = opts[0]; for (const o of opts) if (o.stat > b.stat) b = o; return b.pid; } // strongest first, blind to rule R
  if (pol === 'greedy') { let b = opts[0]; for (const o of opts) if (o.pFx > b.pFx + 1e-12 || (Math.abs(o.pFx - b.pFx) < 1e-12 && o.stat > b.stat)) b = o; return b.pid; }
  // 'best': enumerate orders of the kicks still to come in the first n (or the next one in sudden death), maximise expected goals with rule R chained
  const n = sh.cfg.n, mine = sh.kicks.filter((k) => k.side === 'me').length;
  const left = Math.max(1, n - mine), vs = sh.cfg.club.keeper;
  let bestV = -1, bestFirst = opts[0].pid;
  const rec = (avail, last, k, acc, first) => {
    if (k === 0 || !avail.length) { if (acc > bestV + 1e-12) { bestV = acc; bestFirst = first; } return; }
    for (let i = 0; i < avail.length; i++) {
      const c = avail[i], tie = !(sh.cfg.ruleR && last && last === c.role);
      const p = (sh.fxLeft.indexOf('T_STRIKER:' + c.pid) >= 0 ? SD.shootout.pairOddsStrike : SD.shootout.pairOdds)(c.stat, vs, tie);
      const rest = avail.slice(0, i).concat(avail.slice(i + 1));
      rec(rest, c.role, k - 1, acc + p, first === null ? c.pid : first);
    }
  };
  rec(opts.map((o) => ({ pid: o.pid, role: o.role, stat: o.stat })), sh.lastRole, left, 0, null);
  return bestFirst;
}
function playShootout(m, T, pol, seed, pr) {
  const mm = Object.assign({}, m, { seed: seed >>> 0 });
  const sh = SD.shootout.start(mm, Object.assign({}, T || {}));
  let g = 0;
  while (!sh.done && g++ < 400) {
    if (SD.shootout.whoKicks(sh) === 'me') { const pid = pickKicker(sh, pol, pr || Math.random); if (pid == null || !SD.shootout.kickMe(sh, pid)) throw new Error('kickMe refused ' + pid); }
    else SD.shootout.kickOpp(sh);
  }
  if (!sh.done) throw new Error('shootout did not end');
  return sh;
}

// ------------------------------------------------------------------ aggregate a batch
function batch(cfgBase, polName, seeds, extraHooks, keep) {
  const R = { n: seeds.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, z0: 0, acts: { pass: 0, dribble: 0, through: 0, shoot: 0 }, cards: {}, atk: 0, fx: {}, used: {}, wins: new Uint8Array(seeds.length),
    pts: new Float64Array(seeds.length), res: [], level: [], turns: 0, twin: 0, orlo: 0, roar: { me: 0, opp: 0 }, k1: { me: 0, opp: 0 }, k2: { me: 0, opp: 0 } };
  seeds.forEach((seed, i) => {
    const r = runMatch(Object.assign({}, cfgBase, { seed }), polName, extraHooks);
    const s = r.sum.score; R.gf += s.me; R.ga += s.opp; R.res.push([s.me, s.opp]);
    if (r.sum.res === 'W') { R.w++; R.wins[i] = 1; R.pts[i] = 1; } else if (r.sum.res === 'D') { R.d++; R.pts[i] = 0.5; } else R.l++;
    if (s.me === 0 && s.opp === 0) R.z0++;
    if (keep && s.me === s.opp) R.level.push(r.m);
    r.rec.picks.forEach((p) => { R.acts[p.a]++; R.cards[p.pid] = (R.cards[p.pid] || 0) + 1; R.atk++; });
    r.sum.fxUsed.forEach((id) => { R.fx[id] = (R.fx[id] || 0) + 1; });
    Object.keys(r.ctx.stat.used).forEach((k) => { R.used[k] = (R.used[k] || 0) + r.ctx.stat.used[k]; });
    R.twin += r.rec.twin; R.orlo += r.rec.orlo;
    r.rec.roars.forEach((x) => { R.roar[x]++; }); R.k1[r.rec.kick1]++; if (r.rec.kick2) R.k2[r.rec.kick2]++;
  });
  R.winPct = 100 * R.w / R.n; R.drawPct = 100 * R.d / R.n; R.z0Pct = 100 * R.z0 / R.n; R.lossPct = 100 * R.l / R.n;
  return R;
}
const wdl = (R) => `W ${R.winPct.toFixed(1)} D ${R.drawPct.toFixed(1)} L ${R.lossPct.toFixed(1)}`;
function pairedLift(A, B) { // A = with, B = without (same seeds)
  const n = A.n; const d = new Float64Array(n); for (let i = 0; i < n; i++) d[i] = A.wins[i] - B.wins[i];
  const mu = mean(Array.from(d)); let v = 0; for (let i = 0; i < n; i++) v += (d[i] - mu) * (d[i] - mu); v /= (n - 1);
  return { lift: 100 * mu, se: 100 * Math.sqrt(v / n) };
}
// paired lift with a borderline re-run: first pass N_LIFT, bigger pass N_LIFTMAX when within 2 se of a band edge
function liftOf(tag, cfgOn, cfgOff, lo, hi, pol) {
  pol = pol || 'skilled';
  const run = (n) => { const seeds = seedList(tag, n); const on = batch(cfgOn, pol, seeds), off = batch(cfgOff, pol, seeds); return Object.assign(pairedLift(on, off), { on, off, n }); };
  let r = run(N_LIFT);
  const edge = (x) => Math.abs(x.lift - lo) < 2 * x.se || Math.abs(x.lift - hi) < 2 * x.se;
  if (edge(r) && N_LIFTMAX > N_LIFT) r = run(N_LIFTMAX);
  return r;
}

// ------------------------------------------------------------------ gate table
const ROWS = [];
let CUR_G = 0;
function add(gate, target, measured, seeds, status, note) {
  ROWS.push({ g: CUR_G, gate, target, measured, seeds, status, note: note || '' });
  console.log(`[${status}] G${CUR_G} ${gate} | target ${target} | ${measured} | seeds ${seeds}${note ? ' | ' + note : ''}`);
}
const inRange = (x, lo, hi) => x >= lo && x <= hi;
const hit = (ok) => (ok ? 'HIT' : 'MISS');
function guard(name, fn) { try { fn(); } catch (e) { add(name, 'runs without error', 'ERROR: ' + (e && e.message), '-', 'MISS', 'engine/fx/bot exception: ' + String(e && e.stack || e).split('\n').slice(0, 4).join(' / ')); } }
const sgn = (x, d) => (x >= 0 ? '+' : '') + x.toFixed(d === undefined ? 1 : d);

// formation selection on independent seeds (cheap on this engine)
function selectForm(cfg, tag, n) {
  const seeds = seedList('sel' + tag, n || 400); let best = null, bv = -1; const t = {};
  for (const f of ['Wall', 'Diamond', 'Spear']) { const R = batch(Object.assign({}, cfg, { formation: f }), 'skilled', seeds); t[f] = R.winPct; if (R.winPct > bv) { bv = R.winPct; best = f; } }
  return { best, t };
}

const NOTES = {}; // saved with the rows, printed under the table
const KV = {};     // numbers other experiments read (state.json)
const readKV = () => { try { return JSON.parse(fs.readFileSync(path.join(ROWS_DIR, 'state.json'), 'utf8')); } catch (e) { return {}; } };

// ================================================================== GATE 1: new content, one item at a time, 2 clubs
const CLUB2 = [['grimsby', 1], ['reading', 2]];
const baseCfg = (club, md, extra) => Object.assign({ club, md, formation: BEST_FORM[md], pitchLevel: 2 }, extra || {});
const SIGS = [
  { id: 'SIG_DESSA', pid: 'dessa', move: 'Sidestep' }, { id: 'SIG_YENNA', pid: 'yenna', move: 'Hold Up' }, { id: 'SIG_RUVO', pid: 'ruvo', move: 'Follow Up' },
  { id: 'SIG_VESKA', pid: 'veska', move: 'Twin Run' }, { id: 'SIG_BRANNIK', pid: 'brannik', move: 'Second Tackle' }, { id: 'SIG_TOBBIN', pid: 'tobbin', move: 'Quick Throw', hi: 6 },
  { id: 'SIG_MAELIS', pid: 'maelis', move: 'Cold Finish' }, { id: 'SIG_ORLO', pid: 'orlo', move: 'Call for Ball' },
];
function expSig() {
  CUR_G = 1;
  const only = ARGS.fx ? String(ARGS.fx).split(',') : null;
  for (const t of SIGS) {
    if (only && !only.includes(t.id)) continue;
    guard('Signature ' + t.move, () => {
      const per = [];
      for (const [club, md] of CLUB2) {
        const on = baseCfg(club, md, { swap: [t.pid] }), off = Object.assign({}, on, { fxOff: { [t.id]: true } });
        const r = liftOf('sig' + t.id + club, on, off, 2, t.hi || 12);
        const dec = t.id === 'SIG_VESKA' ? liftOf('sigdec' + t.id + club, on, off, 2, 12, 'skilledDecl') : null;
        per.push({ club, r, dec, fired: (r.on.fx[t.id] || 0) / r.on.n, twin: r.on.twin / r.on.n, orlo: r.on.orlo / r.on.n });
      }
      const hi = t.hi || 12, okL = per.every((x) => x.r.lift >= 2 && x.r.lift <= hi), okF = per.every((x) => x.fired >= 0.2);
      const txt = per.map((x) => `${x.club} ${sgn(x.r.lift)} (se ${x.r.se.toFixed(1)}, fires ${pct(x.fired, 0)}%)`).join(', ');
      const extra = t.id === 'SIG_VESKA' ? ` second Shoots ${per.map((x) => x.twin.toFixed(2)).join('/')} a match; IF the second Shoot could be declined (bot sets m.played, API has no decline): ${per.map((x) => x.club + ' ' + sgn(x.dec.lift) + ' (se ' + x.dec.se.toFixed(1) + ')').join(', ')}` : t.id === 'SIG_ORLO' ? ` Orlo played from deck/discard ${per.map((x) => x.orlo.toFixed(2)).join('/')} a match` : '';
      add(`Signature ${t.move} (${t.pid}) alone`, `lift +2 to +${hi}, fires in >= 20% of matches, both clubs`, txt + extra, per.map((x) => x.r.n).join('+') + ' paired x 2 clubs', hit(okL && okF),
        okL && okF ? '' : (!okL ? 'lift outside +2..+' + hi + ' on ' + per.filter((x) => !(x.r.lift >= 2 && x.r.lift <= hi)).map((x) => x.club).join(', ') : '') + (!okF ? ' fires under 20% on ' + per.filter((x) => x.fired < 0.2).map((x) => x.club).join(', ') : ''));
    });
  }
}

function expPlayer() {
  CUR_G = 1;
  const n = Math.min(N_LIFT, 800), lines = [], bad = [];
  for (const t of SIGS) {
    const parts = [];
    for (const [club, md] of CLUB2) {
      const seeds = seedList('plr' + t.pid + club, n);
      const base = baseCfg(club, md);
      const a = batch(Object.assign({}, base, { swap: [t.pid], swapLevel: 2 }), 'skilled', seeds), b = batch(base, 'skilled', seeds); const l = pairedLift(a, b).lift;
      parts.push(`${club} ${sgn(l)}`); if (l < 3 || l > 12) bad.push(t.pid + ' ' + club + ' ' + sgn(l));
    }
    lines.push(`${t.pid}: ${parts.join(', ')}`);
  }
  add('Whole new player v default lineup (stats + Trait + move, Level 2), each of the 8', 'B-economy g row 8: +3 to +12, none over +12', lines.join(' | '), n + ' paired x 2 clubs x 8', hit(!bad.length), bad.length ? 'outside the band: ' + bad.join('; ') : '');
}

function expNodes3() {
  CUR_G = 1;
  const T3 = [
    { id: 'A3', label: 'Second Look (A3)', nodes: ['A1', 'A2', 'A3'], note: 'A-systems f flags it as weak (a regret rule)' },
    { id: 'D3', label: 'Press Master (D3)', nodes: ['D1', 'D2', 'D3'] },
    { id: 'S3', label: 'Captain (S3), captain Tavo (Second Strike)', nodes: ['S1', 'S2', 'S3'], captain: 'tavo' },
  ];
  for (const t of T3) guard(t.label, () => {
    const per = [];
    for (const [club, md] of CLUB2) {
      const on = baseCfg(club, md, { nodes: t.nodes, captain: t.captain || null }), off = Object.assign({}, on, { fxOff: { [t.id]: true } });
      const r = liftOf('n3' + t.id + club, on, off, 2, 12);
      per.push({ club, r, fired: (r.on.fx[t.id] || 0) / r.on.n, used: r.on.used });
    }
    const ok = per.every((x) => x.r.lift >= 2 && x.r.lift <= 12);
    add(`Tier-3 node ${t.label} alone (other nodes of its lane owned in both arms)`, 'lift +2 to +12 (admin default band), both clubs',
      per.map((x) => `${x.club} ${sgn(x.r.lift)} (se ${x.r.se.toFixed(1)}, fires ${pct(x.fired, 0)}%)`).join(', '), per.map((x) => x.r.n).join('+') + ' paired x 2 clubs', hit(ok),
      (ok ? '' : 'outside +2..+12 on ' + per.filter((x) => !(x.r.lift >= 2 && x.r.lift <= 12)).map((x) => x.club).join(', ') + '. ') + (t.note || ''));
  });
}

function expLvl4() {
  CUR_G = 1;
  guard('Level 4', () => {
    const per = [];
    for (const [club, md] of CLUB2) {
      const on = baseCfg(club, md, { pitchLevel: 4, benchLevel: 1 }), off = baseCfg(club, md, { pitchLevel: 3, benchLevel: 1 });
      const r = liftOf('lvl4' + club, on, off, 2, 12); per.push({ club, r });
    }
    // data check: statsOf Level 4 rule on the five starters (A-systems e)
    const chk = ['mirelle', 'tavo', 'pip', 'kessan', 'ondra'].map((pid) => { const a = mkP(pid, 3), b = mkP(pid, 4), d = ['pac', 'pas', 'sho', 'def'].filter((k) => b[k] !== a[k]); return pid + '+1 ' + d.join(''); }).join(' ');
    const ok = per.every((x) => x.r.lift >= 2 && x.r.lift <= 12);
    add('Level 4 on the 5 pitch players (v Level 3, same lineup)', 'lift +2 to +12 (admin default band), both clubs', per.map((x) => `${x.club} ${sgn(x.r.lift)} (se ${x.r.se.toFixed(1)})`).join(', ') + '; stat rise: ' + chk,
      per.map((x) => x.r.n).join('+') + ' paired x 2 clubs', hit(ok), ok ? '' : 'outside +2..+12');
  });
}

function expRoar() {
  CUR_G = 1;
  guard('Club-side Roar', () => {
    const rows = []; let struct = [];
    const cases = [['grimsby', 1, 'expected'], ['reading', 2, 'expected'], ['lincoln', 7, 'expected']];
    for (const [club, md, variant] of cases) {
      const seeds = seedList('roar' + club, Math.max(N_LIFT, 2000));
      const mk = (mode) => batch(cfgFor(md, club, variant, { mode, formation: BEST_FORM[md], T: {} }), 'skilled', seeds);
      const neu = mk('neutral'), away = mk('away'), home = mk('home');
      const dA = pairedLift(away, neu), dH = pairedLift(home, neu);
      rows.push({ club, md, dA, dH, away, home, neu });
      struct.push(`${club}: roar seen away me/opp ${away.roar.me}/${away.roar.opp}, home ${home.roar.me}/${home.roar.opp}, neutral ${neu.roar.me}/${neu.roar.opp}; kick-off half1 away ${JSON.stringify(away.k1)} home ${JSON.stringify(home.k1)} neutral ${JSON.stringify(neu.k1)}, half2 away ${JSON.stringify(away.k2)}`);
    }
    const mirror = rows.every((r) => r.away.roar.me === 0 && r.away.roar.opp > 0 && r.home.roar.opp === 0 && r.home.roar.me > 0 && r.neu.roar.me === 0 && r.neu.roar.opp === 0);
    const kick = rows.every((r) => r.away.k1.opp === r.away.n && r.away.k2.me === r.away.n && r.home.k1.me === r.home.n && r.home.k2.opp === r.home.n && r.neu.k1.me === r.neu.n);
    add('Club-side Roar mirror in the engine (m.roar, kick-off by home side)', 'away: only the club gets Roar, club kicks off half 1; home: only Preston; neutral: nobody', 'Roar ' + (mirror ? 'mirrored correctly' : 'WRONG') + ', kick-off ' + (kick ? 'correct' : 'WRONG') + '. ' + struct.join(' | '), rows.map((r) => r.away.n).join('+') + ' x 3 modes', hit(mirror && kick));
    const two = rows.slice(0, 2);
    const okA = two.every((r) => r.dA.lift <= -1 && r.dA.lift >= -6);
    add('Club-side Roar cost to Preston: skilled, Preston away v neutral ground (Grimsby, Reading squads of MD1 and MD2)', 'about -2 to -4 (SEASON-SPEC S4 expectation); HIT if -6 to -1', two.map((r) => `${r.club} away ${sgn(r.dA.lift)} (se ${r.dA.se.toFixed(1)}), Preston Roar at home ${sgn(r.dH.lift)}`).join(', '),
      two.map((r) => r.away.n).join('+') + ' paired', hit(okA), 'Preston own Roar worth about +2 (E-bot-season s5) is the home column');
    const r3 = rows[2];
    add('Club-side Roar on a real away day: Lincoln MD7 squad, away v neutral', 'information (expect -2 to -4)', `away ${sgn(r3.dA.lift)} (se ${r3.dA.se.toFixed(1)}), win % away ${r3.away.winPct.toFixed(1)} v neutral ${r3.neu.winPct.toFixed(1)} v home ${r3.home.winPct.toFixed(1)}`, r3.away.n + ' paired', 'INFO');
  });
}

// ---- shootout, rule R, Cup squad
function cupBatch(club, variant, n, tag, extra) {
  return batch(cfgFor(8, club, variant, Object.assign({ formation: BEST_FORM[8] }, extra || {})), 'skilled', seedList('cup' + tag + club, n), null, true);
}
function shootRate(levelMs, T, pol, tag, reps) {
  let w = 0, tot = 0; const pr = mulberry(strHash('shp' + tag));
  levelMs.forEach((m, i) => { for (let v = 0; v < reps; v++) { const sh = playShootout(m, T, pol, strHash(tag + '|' + i + '|' + v), pr); tot++; if (sh.winner === 'me') w++; } });
  return { pct: 100 * w / tot, n: tot };
}
function expRuleR() {
  CUR_G = 1;
  guard('Rule R', () => {
    const out = [];
    for (const club of ['lincoln', 'wycombe']) {
      const cb = cupBatch(club, 'expected', Math.max(N_WIN, 1500), 'r');
      const reps = 8, lv = cb.level;
      const on = { best: shootRate(lv, { ruleR: true }, 'best', 'a' + club, reps), strong: shootRate(lv, { ruleR: true }, 'strong', 'a' + club, reps), greedy: shootRate(lv, { ruleR: true }, 'greedy', 'a' + club, reps), rand: shootRate(lv, { ruleR: true }, 'rand', 'a' + club, reps) };
      const off = { best: shootRate(lv, { ruleR: false }, 'best', 'a' + club, reps), strong: shootRate(lv, { ruleR: false }, 'strong', 'a' + club, reps), rand: shootRate(lv, { ruleR: false }, 'rand', 'a' + club, reps) };
      const cupWin = (cb.winPct + cb.drawPct * on.best.pct / 100);
      out.push({ club, cb, on, off, cupWin });
    }
    const gapOk = out.every((o) => o.on.best.pct - o.on.strong.pct >= 3);
    add('Shootout order is a real puzzle under rule R: best order (look-ahead over the 6 cards) v strongest-first', 'at least 3 points apart (SEASON-SPEC band), both clubs',
      out.map((o) => `${o.club}: best ${o.on.best.pct.toFixed(1)}, greedy ${o.on.greedy.pct.toFixed(1)}, strongest-first ${o.on.strong.pct.toFixed(1)}, random ${o.on.rand.pct.toFixed(1)} (best - strongest ${sgn(o.on.best.pct - o.on.strong.pct)})`).join(' | '),
      out.map((o) => o.on.best.n + ' shootouts').join(' + '), hit(gapOk), 'A-systems d predicted 7.8 points');
    const lift = out.map((o) => ({ club: o.club, dBest: o.on.best.pct - o.off.best.pct, dStrong: o.on.strong.pct - o.off.strong.pct, dRand: o.on.rand.pct - o.off.rand.pct }));
    add('Rule R lift on the Cup shootout (R on v off, same level matches and dice streams), 2 clubs', 'R should cost a blind order and a good order little: report. Expect strongest-first to fall most',
      lift.map((x) => `${x.club}: best order ${sgn(x.dBest)}, strongest-first ${sgn(x.dStrong)}, random ${sgn(x.dRand)}`).join(' | '), out.map((o) => o.on.best.n).join('+') + ' shootouts', 'INFO',
      'rule R is a puzzle, not a power item: a lift near 0 for the best order is the intended shape');
    const cupOk = out.map((o) => o.cupWin);
    add('Cup Final win when reached (real 6+6 neutral match + real shootout, best order), by opponent', '40-55 (SEASON-SPEC band)',
      out.map((o) => `v ${o.club}: ${o.cupWin.toFixed(1)} (90 min W ${o.cb.winPct.toFixed(1)} D ${o.cb.drawPct.toFixed(1)} L ${o.cb.lossPct.toFixed(1)}; shootout ${o.on.best.pct.toFixed(1)})`).join(' | '), out.map((o) => o.cb.n).join('+') + ' matches', hit(cupOk.every((x) => x >= 40 && x <= 55)), 'opponent-weighted figure is in gate 4');
  });
}

function expFire() {
  CUR_G = 1;
  guard('Fire rates', () => {
    const lines = [];
    for (const [club, md] of CLUB2) {
      const seeds = seedList('fire' + club, 800);
      const R = batch(baseCfg(club, md, { swap: SIGS.map((s) => s.pid).filter((p) => p !== 'tobbin' && p !== 'veska' && p !== 'dessa' && p !== 'ruvo'), nodes: ['A1', 'A3', 'D1', 'D2', 'D3', 'S1', 'S2', 'S3'], captain: 'tavo' }), 'skilled', seeds);
      lines.push(club + ': ' + Object.keys(R.fx).sort().map((k) => k + ' ' + pct(R.fx[k] / R.n, 0)).join(' '));
    }
    add('Fire rate table (full-new-content lineup, Hard, skilled)', 'information', lines.join(' | '), '800 x 2 clubs', 'INFO');
  });
}

// ================================================================== GATE 2 / 3: the club ladder
function clubStatCheck(difficulty) {
  const bad = [];
  ORDER_CLUBS.forEach((id, i) => {
    const md = i + 1, T = hardT({ difficulty }), c = clubAt(id, md, T, 1), h = HARD[id];
    const drop = difficulty === 2 ? 0 : (md >= 2 ? 1 : 0) + (difficulty === 0 ? 1 : 0);
    const exp = [Math.max(1, h[0] - drop), Math.max(1, h[1] - drop), h[2]];
    if (c.def !== exp[0] || c.keeper.def !== exp[1] || c.atk !== exp[2]) bad.push(`${id} MD${md} got ${c.def}/${c.keeper.def}/${c.atk} want ${exp.join('/')}`);
    const m = SD.engine.newMatch(mkSetup({ seed: 5, club: id, md, T: {}, difficulty, formation: 'Wall' }));
    if (m.cs.def !== c.def || m.cs.keeper !== c.keeper.def || m.cs.atk !== c.atk) bad.push(`${id} engine m.cs ${m.cs.def}/${m.cs.keeper}/${m.cs.atk} differs from clubFor ${c.def}/${c.keeper.def}/${c.atk}`);
  });
  return bad;
}
const LADDER = {}; // difficulty -> { md: {sk, rc, form} }
function ladder(difficulty, nSk, nRc, selN) {
  const res = {};
  ORDER_CLUBS.forEach((club, i) => {
    const md = i + 1;
    const cfg0 = cfgFor(md, club, 'expected', { difficulty });
    const sel = selectForm(cfg0, 'L' + difficulty + md, selN);
    const cfg = Object.assign({}, cfg0, { formation: sel.best });
    const sk = batch(cfg, 'skilled', seedList('lad' + difficulty + md, nSk));
    const rc = batch(cfg, 'rc', seedList('ladrc' + difficulty + md, nRc));
    res[md] = { club, sk, rc, form: sel.best, spread: Math.max(...Object.values(sel.t)) - Math.min(...Object.values(sel.t)) };
  });
  return res;
}
function ladderRows(res, label, withBands) {
  const lines = [];
  for (let md = 1; md <= 7; md++) {
    const r = res[md], t = BAND[md - 1], x = r.sk.winPct;
    const ok = md === 1 ? (inRange(x, t - 5, t + 5) || inRange(x, 51, 57)) : inRange(x, t - 5, t + 5);
    if (withBands) {
      add(`${label} MD${md} ${r.club} (${HOME_OF(md) ? 'H' : 'A'}), skilled, expected squad, ${r.form}`, md === 1 ? `${t} +-5 (MD1 may sit about 54)` : `${t} +-5`,
        `${wdl(r.sk)}; GF ${(r.sk.gf / r.sk.n).toFixed(2)} GA ${(r.sk.ga / r.sk.n).toFixed(2)}; 0-0 ${r.sk.z0Pct.toFixed(1)}%; random-card W ${r.rc.winPct.toFixed(1)}`, r.sk.n + ' (+' + r.rc.n + ' rc)', hit(ok), ok ? '' : (x < t - 5 ? (t - 5 - x).toFixed(1) + ' under the band' : (x - t - 5).toFixed(1) + ' over the band'));
    } else lines.push(`MD${md} ${r.club}: skilled ${wdl(r.sk)}, 0-0 ${r.sk.z0Pct.toFixed(1)}%, random-card ${r.rc.winPct.toFixed(1)}`);
  }
  return lines;
}
function expLadder() {
  CUR_G = 2;
  guard('Hard ladder', () => {
    const bad = clubStatCheck(2);
    const dataBad = ORDER_CLUBS.filter((id) => { const c = SD.data.CLUBS[id]; const h = HARD[id]; return !(c.def === h[0] && c.keeper.def === h[1] && c.atk === h[2]); });
    add('data.js club rows = SEASON-SPEC section 3 HARD table (Grimsby 5 / 7 / 7 ... Lincoln 8 / 10 / 10), clubFor Hard = data, engine m.cs = club', 'no difference',
      bad.length || dataBad.length ? (dataBad.length ? 'data differs: ' + dataBad.join(', ') + '. ' : '') + bad.join('; ') : '0 differences (7 clubs, Hard, data -> clubFor -> engine)', '-', hit(!bad.length && !dataBad.length));
    const res = ladder(2, N_WIN, 1500, 400); LADDER[2] = res;
    ladderRows(res, 'Hard', true);
    const rcOk = []; for (let md = 1; md <= 7; md++) rcOk.push(res[md].rc.winPct < res[md].sk.winPct / 2);
    add('Random-card bot under half of skilled at every matchday (Hard)', 'rc W < skilled W / 2 at all 7',
      [1, 2, 3, 4, 5, 6, 7].map((md) => `MD${md} ${res[md].rc.winPct.toFixed(1)} v ${res[md].sk.winPct.toFixed(1)}`).join(', '), '1500 each', hit(rcOk.every(Boolean)), rcOk.every(Boolean) ? '' : 'MD' + rcOk.map((x, i) => (x ? 0 : i + 1)).filter(Boolean).join(', MD'));
    const z = [1, 2, 3, 4, 5, 6, 7].map((md) => res[md].sk.z0Pct);
    add('0-0 at full time under 20% at every matchday (expected squad, Hard)', '< 20 each', [1, 2, 3, 4, 5, 6, 7].map((md, i) => `MD${md} ${z[i].toFixed(1)}`).join(', '), N_WIN + ' each', hit(z.every((x) => x < 20)), 'max ' + Math.max(...z).toFixed(1));
    // diagnostic: the squad E-bot-season used (7 SP cap = no tier-3, no new content) on the same clubs
    const e7 = {};
    ORDER_CLUBS.forEach((club, i) => { const md = i + 1; const cfg = cfgFor(md, club, 'expected', { formation: res[md].form, nodes: nodesFor(md, Math.min(SP_AT[md], 7)) }); e7[md] = batch(cfg, 'skilled', seedList('lade7' + md, 1500)); });
    add('Diagnostic: same ladder with the E-bot-season squad (SP capped at 7, so no tier-3 nodes), Hard', 'information (where the bands were tuned)', [1, 2, 3, 4, 5, 6, 7].map((md) => `MD${md} ${e7[md].winPct.toFixed(1)} (${sgn(res[md].sk.winPct - e7[md].winPct)} with tier 3)`).join(', '), '1500 each', 'INFO', 'difference = what tier-3 nodes add (MD7 only: D3 bought at SP 10; at SP 9 nothing new fits)');
    NOTES.ladder = 'Formation per matchday chosen on 400 selection seeds each (independent of the measure seeds): ' + [1, 2, 3, 4, 5, 6, 7].map((md) => `MD${md} ${res[md].form} (spread ${res[md].spread.toFixed(1)})`).join(', ') + '.';
  });
}

function expRetune() {
  CUR_G = 2;
  guard('Rotherham retune', () => {
    const md = 5, club = 'rotherham';
    const mk = (d, k, a, form, n, tag) => batch(cfgFor(md, club, 'expected', { formation: form, T: { c_rotherham_def: d, c_rotherham_keeper: k, c_rotherham_atk: a } }), 'skilled', seedList(tag, n));
    const cur = mk(10, 9, 10, 'Wall', N_WIN, 'rothcur');
    const grid = [];
    for (const d of [8, 9, 10, 11, 12]) for (const k of [9, 10, 11, 12]) for (const a of [6, 7, 8]) { const R = mk(d, k, a, 'Wall', 300, 'rothg' + d + k + a); grid.push({ d, k, a, w: R.winPct, z0: R.z0Pct }); }
    const land = (g) => inRange(g.w, 43, 53);
    // formation matters (Wall v Spear moves MD5 by several points): top 8 cells by closeness to 48 are re-run in all 3 formations at 1000 seeds
    const near = grid.slice().sort((x, y) => Math.abs(x.w - 48) - Math.abs(y.w - 48)).slice(0, 8);
    const full = []; near.forEach((g) => ['Wall', 'Diamond', 'Spear'].forEach((f) => { const R = mk(g.d, g.k, g.a, f, 1000, 'rothf' + g.d + g.k + g.a + f); full.push({ d: g.d, k: g.k, a: g.a, f, w: R.winPct, z0: R.z0Pct }); }));
    const A = full.filter(land).sort((x, y) => x.z0 - y.z0 || y.a - x.a)[0] || null;       // lands the band, lowest 0-0
    const B = grid.filter((g) => g.z0 < 20).sort((x, y) => Math.abs(x.w - 48) - Math.abs(y.w - 48) || y.a - x.a)[0] || null; // 0-0 under 20, closest to 48 (Wall)
    const both = full.filter((g) => land(g) && g.z0 < 20).sort((x, y) => y.a - x.a || (x.d + x.k) - (y.d + y.k))[0] || null;
    const cand = both || A || B;
    const conf = (g) => { const form = g.f || selectForm(cfgFor(md, club, 'expected', { T: { c_rotherham_def: g.d, c_rotherham_keeper: g.k, c_rotherham_atk: g.a } }), 'rothform' + g.d + g.k + g.a, 400).best;
      const R = mk(g.d, g.k, g.a, form, N_WIN, 'rothfin' + g.d + g.k + g.a);
      const rc = batch(cfgFor(md, club, 'expected', { formation: form, T: { c_rotherham_def: g.d, c_rotherham_keeper: g.k, c_rotherham_atk: g.a } }), 'rc', seedList('rothrc', 1500));
      return { g, form, R, rc }; };
    add('Rotherham MD5 as in data.js (10 / 9 / 10: attack 10 breaks its slow-attack style), skilled, Wall', '48 +-5, attack <= 8', `${wdl(cur)}; 0-0 ${cur.z0Pct.toFixed(1)}%`, N_WIN, hit(inRange(cur.winPct, 43, 53)), 'current data row; attack is 10, not <= 8');
    const ok = !!both, rows = [];
    for (const [name, g] of [['best that lands AND has 0-0 under 20', both], ['lands in 43-53 (best formation, 1000 seeds) with the lowest 0-0', A], ['0-0 under 20 and closest to 48', B]]) {
      if (!g || (name !== 'best that lands AND has 0-0 under 20' && both && g === both)) continue;
      const c = conf(g); rows.push([name, c]);
    }
    if (!rows.length) add('Rotherham RETUNE SUGGESTION', 'MD5 skilled within 5 of 48 with DEF up to 12 and attack <= 8', 'no grid cell found', '-', 'MISS');
    rows.forEach(([name, c], idx) => {
      const g = c.g, good = inRange(c.R.winPct, 43, 53) && c.R.z0Pct < 20 && c.rc.winPct < c.R.winPct / 2;
      add(`Rotherham RETUNE SUGGESTION ${idx + 1} (${name}): DEF ${g.d} / keeper ${g.k} / attack ${g.a} (${c.form})`, 'MD5 skilled within 5 of 48 (43-53), DEF up to 12, attack <= 8, 0-0 < 20, random-card < half',
        `${wdl(c.R)}; 0-0 ${c.R.z0Pct.toFixed(1)}%; GF ${(c.R.gf / c.R.n).toFixed(2)} GA ${(c.R.ga / c.R.n).toFixed(2)}; random-card ${c.rc.winPct.toFixed(1)}`, N_WIN + ' (+1500 rc)', hit(good),
        good ? 'set c_rotherham_def=' + g.d + ', c_rotherham_keeper=' + g.k + ', c_rotherham_atk=' + g.a + ' in data.js TWEAK_DEFAULTS' : (inRange(c.R.winPct, 43, 53) ? 'lands in the band but 0-0 is ' + c.R.z0Pct.toFixed(1) + '% (over 20)' : 'win % ' + c.R.winPct.toFixed(1) + ' is outside 43-53'));
    });
    NOTES.retune = `Grid (Wall, MD5 expected squad, 300 seeds a cell; DEF 8-12 x keeper 9-12 x attack 6-8; W% / 0-0%): ` + grid.sort((x, y) => Math.abs(x.w - 48) - Math.abs(y.w - 48)).slice(0, 14).map((g) => `${g.d}/${g.k}/${g.a} ${g.w.toFixed(1)}/${g.z0.toFixed(1)}`).join(', ') + '. ' +
      (both ? 'A cell lands the band with 0-0 under 20.' : 'NO cell with attack <= 8 lands in 43-53 AND keeps 0-0 under 20 (checked in all 3 formations at 1000 seeds for the 8 closest cells): the expected squad is too strong for a low-attack club unless 0-0 is allowed above 20 (see suggestion rows).');
    if (cand) KV.rotherham = { def: cand.d, keeper: cand.k, atk: cand.a };
  });
}

function expLadderN() {
  CUR_G = 3;
  guard('Normal and Easy ladder', () => {
    for (const [d, name] of [[1, 'Normal'], [0, 'Easy']]) {
      const bad = clubStatCheck(d);
      add(`${name} stats: MD2-7 DEF and keeper -${d === 1 ? 1 : 2} v Hard (MD1 ${d === 1 ? 'same' : '-1'}), engine m.cs = club`, 'SEASON-SPEC S10', bad.length ? bad.join('; ') : '0 differences', '-', hit(!bad.length));
      const res = ladder(d, Math.max(1000, Math.floor(N_WIN / 1.5)), 800, 300); LADDER[d] = res;
      const hard = LADDER[2] || ladder(2, 1000, 400, 300);
      for (let md = 1; md <= 7; md++) {
        const r = res[md];
        add(`${name} MD${md} ${r.club} (${HOME_OF(md) ? 'H' : 'A'}), skilled, expected squad, ${r.form}`, 'no band (never measured): report; Hard band ' + BAND[md - 1], `${wdl(r.sk)}; 0-0 ${r.sk.z0Pct.toFixed(1)}%; random-card W ${r.rc.winPct.toFixed(1)}; vs Hard ${sgn(r.sk.winPct - hard[md].sk.winPct)}`, r.sk.n + ' (+' + r.rc.n + ' rc)', 'INFO',
          r.rc.winPct < r.sk.winPct / 2 ? '' : 'random-card is not under half of skilled');
      }
      const z = [1, 2, 3, 4, 5, 6, 7].map((md) => res[md].sk.z0Pct);
      add(`${name}: 0-0 under 20% at every matchday`, '< 20 each', [1, 2, 3, 4, 5, 6, 7].map((md, i) => `MD${md} ${z[i].toFixed(1)}`).join(', '), '-', hit(z.every((x) => x < 20)));
      const avg = mean([1, 2, 3, 4, 5, 6, 7].map((md) => res[md].sk.winPct)), avgH = mean([1, 2, 3, 4, 5, 6, 7].map((md) => hard[md].sk.winPct));
      add(`${name} mean skilled win % MD1-7 v Hard`, 'information (M\'s first season tells where Normal should sit)', `${name} ${avg.toFixed(1)} v Hard ${avgH.toFixed(1)} (${sgn(avg - avgH)})`, '-', 'INFO');
    }
  });
}

// ================================================================== GATE 4 / 5: the season
function seasonBatches(variant, difficulty, seasonNo, nPer, extraCfg, tag) {
  const out = [];
  ORDER_CLUBS.forEach((club, i) => {
    const md = i + 1;
    const cfg = cfgFor(md, club, variant, Object.assign({ difficulty, seasonNo }, extraCfg || {}));
    if (!extraCfg || !extraCfg.formation) cfg.formation = (LADDER[2] && LADDER[2][md] && variant === 'expected') ? LADDER[2][md].form : BEST_FORM[md];
    out.push(batch(cfg, 'skilled', seedList('sb' + tag + md, nPer)));
  });
  return out;
}
function simSeasons(byMd, cupFor, nSeasons, T, tag) {
  const st = { n: nSeasons, top2: 0, champ: {}, top2by: {}, reached: 0, cupWon: 0, cupLost: 0, pts: 0, cupOpp: {}, cupOppWin: {}, shootN: 0, shootW: 0, pos: Array(9).fill(0) };
  const cupCache = {};
  for (let i = 0; i < nSeasons; i++) {
    const S = { seed: (i + 1) * 7919 + strHash(tag) % 1000, coins: 0, nodes: [], cupsWon: 0 };
    S.season = SD.season.newSeason(S, 1);
    const R = mulberry(strHash(tag + '|' + i));
    for (let md = 1; md <= 7; md++) { const b = byMd[md - 1]; const r = b.res[Math.floor(R() * b.res.length)]; SD.season.recordMatchday(S, r[0], r[1], T); }
    const tab = SD.season.table(S), me = tab.find((r) => r.me);
    st.pts += me.Pts; st.pos[me.pos]++; st.champ[tab[0].id] = (st.champ[tab[0].id] || 0) + 1; tab.slice(0, 2).forEach((r) => { st.top2by[r.id] = (st.top2by[r.id] || 0) + 1; });
    const g = SD.season.cupGate(S);
    if (me.pos <= 2) st.top2++;
    if (g.reached) {
      st.reached++; st.cupOpp[g.opp] = (st.cupOpp[g.opp] || 0) + 1;
      const cb = cupCache[g.opp] || (cupCache[g.opp] = cupFor(g.opp));
      const r = cb.res[Math.floor(R() * cb.res.length)]; let shoot = null;
      if (r[0] === r[1]) {
        const lm = cb.level[Math.floor(R() * cb.level.length)];
        const sh = playShootout(lm, { ruleR: true }, 'best', strHash(tag + '|so|' + i), R); shoot = { me: sh.score.me, opp: sh.score.opp }; st.shootN++; if (sh.winner === 'me') st.shootW++;
      }
      const c = SD.season.recordCup(S, r[0], r[1], shoot);
      if (c.won) { st.cupWon++; st.cupOppWin[g.opp] = (st.cupOppWin[g.opp] || 0) + 1; } else st.cupLost++;
    }
  }
  return st;
}
function expSeason() {
  CUR_G = 4;
  guard('Season 1', () => {
    const T = hardT(), n = N_SEASONS;
    const nPer = Math.max(1200, N_WIN);
    const cupFor = (variant, diff) => (opp) => cupBatch(opp, variant, 700, 's1' + variant + diff, { difficulty: diff });
    const exp = simSeasons(seasonBatches('expected', 2, 1, nPer, null, 'e'), cupFor('expected', 2), n, T, 'expS1');
    const nev = simSeasons(seasonBatches('never', 2, 1, nPer, null, 'n'), cupFor('never', 2), n, T, 'nevS1');
    const bare = seasonBatches('bare', 2, 1, 600, null, 'b');
    const pc = (x, d) => pct(x, d);
    const cupWhenReached = exp.cupWon / Math.max(1, exp.reached);
    KV.cupWinS1 = exp.cupWon / n; KV.top2S1 = exp.top2 / n;
    add('Season 1 top 2, skilled, expected squad, Hard (real SD.season table + other results, Preston results sampled from engine batches)', '45-60 %', `${pc(exp.top2 / n)} %; mean pts ${(exp.pts / n).toFixed(1)}; champion ${Object.keys(exp.champ).sort((a, b) => exp.champ[b] - exp.champ[a]).map((k) => k + ' ' + pc(exp.champ[k] / n, 0)).join(', ')}`, n + ' seasons from ' + nPer + ' matches x 7 MDs', hit(inRange(100 * exp.top2 / n, 45, 60)));
    add('Season 1 top 2, never pulls (levels and nodes only), Hard', 'at least 20 %', `${pc(nev.top2 / n)} %; mean pts ${(nev.pts / n).toFixed(1)}`, n + ' seasons', hit(100 * nev.top2 / n >= 20));
    add('Cup Final win when reached (real neutral match + real shootout, best order), skilled expected squad, Hard', '40-55 %', `${pc(cupWhenReached)} % (${exp.cupWon} of ${exp.reached}); opponent share ${Object.keys(exp.cupOpp).sort((a, b) => exp.cupOpp[b] - exp.cupOpp[a]).map((k) => k + ' ' + pc(exp.cupOpp[k] / exp.reached, 0) + ' (win ' + pc((exp.cupOppWin[k] || 0) / exp.cupOpp[k], 0) + ')').join(', ')}; shootouts won ${pc(exp.shootW / Math.max(1, exp.shootN), 0)} % of ${exp.shootN}`, exp.reached + ' finals', hit(inRange(100 * cupWhenReached, 40, 55)));
    add('Cup Final reached AND won per season (information)', 'information', `reached ${pc(exp.reached / n)} %, won ${pc(exp.cupWon / n)} % of seasons; never-pull reached ${pc(nev.reached / n)} %, won ${pc(nev.cupWon / n)} %`, n + ' seasons', 'INFO');
    const lin = exp.top2by.lincoln / n;
    add('Lincoln top 2 in the 8-club table (skilled Preston)', '50-75 %', pc(lin) + ' % (never-pull Preston: ' + pc((nev.top2by.lincoln || 0) / n) + ' %)', n + ' seasons', hit(inRange(100 * lin, 50, 75)));
    const champMax = Math.max(...Object.keys(exp.champ).map((k) => exp.champ[k] / n));
    add('No club wins the league over 60 % (skilled Preston)', '<= 60 % each', Object.keys(exp.champ).sort((a, b) => exp.champ[b] - exp.champ[a]).map((k) => k + ' ' + pc(exp.champ[k] / n)).join(', '), n + ' seasons', hit(champMax <= 0.6));
    const z = LADDER[2] ? [1, 2, 3, 4, 5, 6, 7].map((md) => LADDER[2][md].sk.z0Pct) : null;
    const zb = bare.map((b) => b.z0Pct);
    add('0-0 under 20 % with the expected squad (all 7 MDs, Hard)', '< 20 each', z ? z.map((x, i) => `MD${i + 1} ${x.toFixed(1)}`).join(', ') : 'see gate 2 ladder rows (run ladder first)', z ? N_WIN + ' each' : '-', z ? hit(z.every((x) => x < 20)) : 'INFO', 'a bare (never levels, no nodes, no pulls) squad: ' + zb.map((x, i) => `MD${i + 1} ${x.toFixed(1)}`).join(', ') + ' (expected to miss at the late clubs: E-bot-season)');
  });
}

// squad from real pulls for season 2 (S8 rule: every club +1 DEF, keeper, attack)
function pullPath(idx, n1, n2) {
  const S = SD.progress.newState(1000 + idx * 131); const T = hardT(); S.coins = 100 * (n1 + n2);
  const tag = {};
  for (let k = 0; k < n1 + n2; k++) { const r = SD.gacha.pull(S, T); if (r.error) break; if (!tag[r.pid]) tag[r.pid] = k < n1 ? 1 : 2; }
  const own = Object.keys(S.owned), tot = (pid) => { const d = SD.data.byId(pid); return d.pac + d.pas + d.sho + d.def + (d.rarity === 'Legend' ? 3 : d.rarity === 'Epic' ? 2 : d.rarity === 'Rare' ? 1 : 0) + (S.owned[pid].stars || 0); };
  const best = (role, ex) => own.filter((p) => SD.data.byId(p).role === role && !ex.includes(p)).sort((a, b) => tot(b) - tot(a))[0];
  const used = []; const keeper = best('Keeper', []); used.push(keeper);
  const outfield = ['Anchor', 'Playmaker', 'Winger', 'Striker'].map((r) => { const p = best(r, used); used.push(p); return p; });
  const bench = own.filter((p) => !used.includes(p) && SD.data.byId(p).role !== 'Keeper').sort((a, b) => tot(b) - tot(a)).slice(0, 2);
  const lvl = {}, stars = {}; [keeper].concat(outfield, bench).forEach((p) => { lvl[p] = outfield.includes(p) || p === keeper ? (tag[p] === 2 ? 3 : 4) : (tag[p] === 2 ? 2 : 3); stars[p] = S.owned[p].stars || 0; });
  return { lineup: { keeper, outfield, bench }, lvl, stars, owned: own.length, S };
}
function expSeason2() {
  CUR_G = 5;
  guard('Season 2', () => {
    const T = hardT(), kv = readKV(), PATHS = 16, perPath = Math.ceil(Math.min(N_SEASONS, 4000) / PATHS), nPer = 150;
    const all = { n: 0, top2: 0, reached: 0, cupWon: 0, pts: 0, champ: {}, top2by: {}, owned: 0 };
    for (let p = 0; p < PATHS; p++) {
      const pp = pullPath(p, 6, 6);
      const nodes = ['D1', 'D2', 'S1', 'S2', 'A1', 'D3', 'A3', 'S3'];
      const extra = { lineup: pp.lineup, lvl: pp.lvl, stars: pp.stars, nodes, pitchLevel: 4, benchLevel: 3, captain: pp.lineup.keeper };
      const byMd = ORDER_CLUBS.map((club, i) => batch(cfgFor(i + 1, club, 'never', Object.assign({ difficulty: 2, seasonNo: 2, formation: BEST_FORM[i + 1] }, extra)), 'skilled', seedList('s2p' + p + 'm' + i, nPer)));
      const st = simSeasons(byMd, (opp) => batch(cfgFor(8, opp, 'never', Object.assign({ difficulty: 2, seasonNo: 2, formation: BEST_FORM[8] }, extra)), 'skilled', seedList('s2c' + p + opp, 300), null, true), perPath, T, 's2p' + p);
      all.n += st.n; all.top2 += st.top2; all.reached += st.reached; all.cupWon += st.cupWon; all.pts += st.pts; all.owned += pp.owned;
      Object.keys(st.champ).forEach((k) => { all.champ[k] = (all.champ[k] || 0) + st.champ[k]; }); Object.keys(st.top2by).forEach((k) => { all.top2by[k] = (all.top2by[k] || 0) + st.top2by[k]; });
    }
    const pc = (x) => pct(x);
    const p1 = kv.cupWinS1 != null ? kv.cupWinS1 : null;
    const p2 = all.cupWon / all.n;
    add('Season 2 under S8 (clubs +1 DEF, keeper, attack, max 12): Preston top 2, skilled, squad = 12 real pulls, Level 4, all 8 nodes, Hard', 'no band yet: report',
      `top 2 ${pc(all.top2 / all.n)} %; Cup reached ${pc(all.reached / all.n)} %, won ${pc(p2)} % of seasons, won when reached ${pc(all.cupWon / Math.max(1, all.reached))} %; mean pts ${(all.pts / all.n).toFixed(1)}; champion ${Object.keys(all.champ).sort((a, b) => all.champ[b] - all.champ[a]).map((k) => k + ' ' + pc(all.champ[k] / all.n)).join(', ')}; pull players owned after 12 pulls ${(all.owned / PATHS - 7).toFixed(1)} of 13`,
      all.n + ' seasons over ' + PATHS + ' pull paths', 'INFO', 'Season 2 is NOT tuned (SEASON-SPEC S8)');
    add('Cup within 2 seasons, skilled (S1 Cup win + S2 Cup win)', '55-75 % (old band, MISS 90.8 % under the v0 rule; no band for S8)', p1 == null ? 'season 1 Cup win rate not stored: run --only=season first' : `${pc(p1 + (1 - p1) * p2)} % (S1 ${pc(p1)} %, S2 ${pc(p2)} %)`, 'season 1 sim + ' + all.n, p1 == null ? 'INFO' : hit(inRange(100 * (p1 + (1 - p1) * p2), 55, 75)), 'not a gate under S8; shown against the old band for comparison');
  });
}

// ================================================================== GATE 6: pulls
function newPullState(seed, startStars) {
  const S = SD.progress.newState(seed); S.coins = 1e9;
  if (startStars) Object.keys(S.owned).forEach((id) => { S.owned[id].stars = startStars(id); });
  return S;
}
function expPulls() {
  CUR_G = 6;
  guard('Pulls', () => {
    const T = hardT(), POOLIDS = SD.data.POOL, rarityOf = (p) => SD.data.byId(p).rarity;
    // rows 1-5 in one sweep: careers of 120 pulls, first pull is the Starter pull
    const CAREERS = 2000, PER = 100; const tiers = { Common: 0, Rare: 0, Epic: 0, Legend: 0 }; let total = 0;
    let runE = 0, runL = 0, maxE = 0, maxL = 0, forcedN = 0, forcedBad = 0, normRolls = 0; const share = {}; POOLIDS.forEach((p) => { share[p] = 0; });
    let commonBad = 0, commonN = 0, commonPay = 0, commonPip = 0, allMaxedCareers = 0;
    for (let c = 0; c < CAREERS; c++) {
      const allMax = c % 4 === 3; // a quarter of the careers start with every starter at 5 pips
      const S = newPullState(5000 + c * 17, allMax ? () => 5 : (c % 4 === 2 ? (id) => (id === 'tavo' ? 5 : 2) : null));
      runE = 0; runL = 0; if (allMax) allMaxedCareers++;
      for (let k = 1; k <= PER; k++) {
        const pre = JSON.parse(JSON.stringify(S.owned)), mx = SD.data.PULL && SD.data.PULL.maxStars || 5;
        const r = SD.gacha.pull(S, T); if (r.error) throw new Error('pull refused ' + r.why);
        if (k >= 2) { tiers[r.rarity]++; total++; }
        const isEL = r.rarity === 'Epic' || r.rarity === 'Legend';
        runE = isEL ? 0 : runE + 1; runL = r.rarity === 'Legend' ? 0 : runL + 1; if (runE > maxE) maxE = runE; if (runL > maxL) maxL = runL;
        if (r.forced) { forcedN++; const fresh = POOLIDS.filter((p) => rarityOf(p) === r.rarity && !pre[p]); if (fresh.length && !r.isNew) forcedBad++; }
        else if (k >= 2 && r.rarity !== 'Common') { share[r.pid]++; normRolls++; }
        if (r.rarity === 'Common') {
          commonN++;
          const starters = Object.keys(pre).filter((id) => SD.data.byId(id).starter), under = starters.filter((id) => (pre[id].stars || 0) < mx);
          if (under.length) { if (!((pre[r.pid].stars || 0) < mx) || r.dupeCoins) commonBad++; else commonPip++; }
          else { if (r.dupeCoins !== 25) commonBad++; else commonPay++; }
        }
      }
    }
    const pctT = (t) => (100 * tiers[t] / total);
    const okT = inRange(pctT('Common'), 50, 54) && inRange(pctT('Rare'), 27, 30) && inRange(pctT('Epic'), 13.5, 16) && inRange(pctT('Legend'), 4.2, 5.6);
    add('Tier frequency over seeded pulls from pull 2, pity on', 'Common 50-54, Rare 27-30, Epic 13.5-16, Legend 4.2-5.6 (SIM 52.0 / 28.4 / 14.8 / 4.9)', `Common ${pctT('Common').toFixed(1)}, Rare ${pctT('Rare').toFixed(1)}, Epic ${pctT('Epic').toFixed(1)}, Legend ${pctT('Legend').toFixed(1)}`, total + ' pulls (' + CAREERS + ' careers)', hit(okT));
    add('Pity: longest run of pulls with no Epic or Legend; with no Legend', 'never over 10; never over 30', `Epic+ run ${maxE}, Legend run ${maxL}`, total + ' pulls', hit(maxE <= 10 && maxL <= 30));
    add('Pity pull picks an unowned player when one exists in that rarity', '100 % of pity pulls', `${forcedN - forcedBad} of ${forcedN} (${forcedBad} breaches)`, forcedN + ' pity pulls', hit(forcedBad === 0 && forcedN > 100), forcedN <= 100 ? 'too few pity pulls to judge' : '');
    const byR = { Rare: POOLIDS.filter((p) => rarityOf(p) === 'Rare'), Epic: POOLIDS.filter((p) => rarityOf(p) === 'Epic'), Legend: POOLIDS.filter((p) => rarityOf(p) === 'Legend') };
    const worst = []; let okS = true;
    for (const r of Object.keys(byR)) { const tt = byR[r].reduce((a, p) => a + share[p], 0); byR[r].forEach((p) => { const sh = 100 * share[p] / tt, eq = 100 / byR[r].length; worst.push(`${p} ${sh.toFixed(1)}`); if (Math.abs(sh - eq) > 1) okS = false; }); }
    add('Each Rare / Epic / Legend player\'s share inside its rarity over normal (non-pity) rolls', 'each within 1 point of equal (Rare 20, Epic 20, Legend 33.3)', worst.join(', '), normRolls + ' non-pity non-Common rolls', hit(okS));
    add('Common roll never lands on a 5-pip starter while another is under 5; pays 25 only when all 7 are maxed', '0 breaches', `${commonBad} breaches in ${commonN} Common rolls (${commonPip} pips, ${commonPay} paid 25; ${allMaxedCareers} all-maxed careers)`, commonN + ' Common rolls', hit(commonBad === 0 && commonPay > 0 && commonPip > 0));

    // row 6 season 1 pulls through the real pay path
    const econ = (mix, seedBase, nC, forced) => {
      const counts = [];
      for (let c = 0; c < nC; c++) {
        const S = SD.progress.newState(seedBase + c * 31); S.season = SD.season.newSeason(S, 1); let pulls = 0;
        const pullAll = () => { while (SD.gacha.canPull(S, T).ok) { SD.gacha.pull(S, T); pulls++; } };
        const R = mulberry(strHash('econ' + seedBase + '|' + c));
        for (let md = 1; md <= 7; md++) {
          const u = R(), res = forced ? forced[md - 1] : (u < mix[0] ? 'W' : u < mix[0] + mix[1] ? 'D' : 'L'), g = R() < 0.5 ? 0 : 1;
          const me = res === 'W' ? g + 1 : g, opp = res === 'L' ? g + 1 : g;
          SD.season.recordMatchday(S, me, opp, T);
          SD.progress.applyMatch(S, { season: 1, md, club: ORDER_CLUBS[md - 1], score: { me, opp }, res, stats: {}, cup: false, level: me === opp }, T);
          pullAll();
        }
        const gate = SD.season.cupGate(S);
        if (gate.reached) {
          const res = R() < (mix[0] / (mix[0] + mix[2] || 1)) ? 'W' : 'L', me = res === 'W' ? 1 : 0, opp = res === 'W' ? 0 : 1;
          SD.season.recordCup(S, me, opp, null); SD.progress.applyMatch(S, { season: 1, md: 'cup', club: gate.opp, score: { me, opp }, res, stats: {}, cup: true, level: false }, T);
        }
        SD.season.endSeason(S, T); pullAll(); counts.push(pulls);
      }
      return counts;
    };
    const m1 = econ([0.55, 0.25, 0.20], 7000, 2000), m2 = econ([0.40, 0.30, 0.30], 9000, 2000), m3 = econ([0.20, 0.30, 0.50], 11000, 2000);
    const ls = econ(null, 13000, 1, ['L', 'L', 'L', 'L', 'L', 'L', 'L']);
    add('Season 1 pulls with results mix 55/25/20 and 40/30/30 (real applyMatch pay, recordMatchday, Cup gate + Cup pay, endSeason E4); loss streak of 7', 'mean 6-8 each; loss streak of 7 gives exactly 4 pulls',
      `55/25/20 ${mean(m1).toFixed(2)}, 40/30/30 ${mean(m2).toFixed(2)} (20/30/50 info ${mean(m3).toFixed(2)}); 7 losses -> ${ls[0]} pulls`, '2000 seasons x 3 mixes + 1', hit(inRange(mean(m1), 6, 8) && inRange(mean(m2), 6, 8) && ls[0] === 4),
      'Cup result is a coin at the mix win share; E-bot-season measured a median of 5 pulls by the Cup (SEASON-SPEC E9 MISS 6-8): this row re-checks it through the real pay code');

    // row 10 save and replay
    let diff = 0, nChecked = 0;
    for (let s = 0; s < 100; s++) {
      const mk = () => { const S = SD.progress.newState(40000 + s * 13); S.coins = 100 * 30; return S; };
      const A = mk(); for (let k = 0; k < 24; k++) SD.gacha.pull(A, T);
      const B = mk(); for (let k = 0; k < 11; k++) SD.gacha.pull(B, T);
      const B2 = JSON.parse(JSON.stringify(B)); for (let k = 0; k < 13; k++) SD.gacha.pull(B2, T); // save, reload (JSON round trip), continue
      const strip = (X) => JSON.stringify({ o: X.owned, c: X.coins, p: X.pity, n: X.pulls, l: X.pullLog });
      nChecked++; if (strip(A) !== strip(B2)) diff++;
    }
    add('Save and replay: pull n = rng(seed, n); same pulls after a JSON save and reload; Coins, pity, owned, pull log restored', 'identical over 100 seeds', `${diff} of ${nChecked} differ`, nChecked + ' seeds x 24 pulls', hit(diff === 0));
  });
}

// ================================================================== GATE 7: slice rules still apply (d6 table, chip = 36-pair enumeration, cap +3, hand size) + replay
function expOdds() {
  CUR_G = 7;
  const exp = [2.8, 8.3, 16.7, 27.8, 41.7, 58.3, 72.2, 83.3, 91.7, 97.2];
  const tab = SD.odds.table(6), bad = [];
  tab.forEach((r, i) => { if (Math.abs(r.p * 100 - exp[i]) > 0.06 || r.gap !== i - 4) bad.push(`gap ${r.gap}: ${(r.p * 100).toFixed(2)}`); });
  if (tab.length !== 10) bad.push('table length ' + tab.length);
  let pairs = 0, mism = 0;
  for (let gap = -8; gap <= 9; gap++) for (const tie of [false, true]) {
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) { pairs++; if (SD.odds.attWins(gap, a, b, tie, 6) !== attW(gap, a, b, tie, 6)) mism++; }
    if (Math.abs(SD.odds.duel(gap, tie, 6) - enumP(gap, tie, 6)) > 1e-12) mism++;
  }
  add('d6 table reproduced from the 36 pairs (SD.odds.table, 10 gaps)', '2.8 8.3 16.7 27.8 41.7 58.3 72.2 83.3 91.7 97.2', bad.length ? bad.join(', ') : 'all 10 equal; ' + tab.map((r) => (r.p * 100).toFixed(1)).join(' '), '36 pairs', hit(!bad.length));
  add('SD.odds.attWins / duel v independent rule (nat 6 v 1 wins, nat 1 v 6 loses, ties to defender)', '0 mismatches', mism + ' mismatches in ' + pairs + ' pair-checks (gap -8..9, both tie flags)', '36 pairs x 36 gaps', hit(!mism));
  // shootout chip: pairOdds v independent enumeration of the halved gap
  let sm = 0;
  for (let st = 1; st <= 12; st++) for (let vs = 1; vs <= 12; vs++) for (const tie of [true, false]) {
    const g = Math.trunc((st - vs) / 2); let w = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) { if (a === 6 && b === 1) w++; else if (a === 1 && b === 6) continue; else { const d = g + a - b; if (tie ? d >= 0 : d > 0) w++; } }
    if (Math.abs(SD.shootout.pairOdds(st, vs, tie) - w / 36) > 1e-12) sm++;
  }
  add('Shootout kick chip (SD.shootout.pairOdds) v 36-pair enumeration, gap halved toward zero, tie to kicker unless rule R', '0 mismatches', sm + ' mismatches in 288 stat pairs x 2 tie rules', '36 pairs', hit(!sm));
}

function expResolve() {
  CUR_G = 7;
  let n = 0, badWin = 0, badSum = 0, badCap = 0, rerolled = 0, badChipE = 0, nChip = 0, handBad = 0, nM = 0;
  const seeds = seedList('resolve', 300), samples = [];
  for (const mode of ['home', 'away', 'neutral']) for (const [club, form] of [['grimsby', 'Wall'], ['reading', 'Diamond'], ['lincoln', 'Spear']]) {
    for (const seed of seeds.slice(0, 40)) {
      nM++;
      const r = runMatch({ seed, club, mode, formation: form, pitchLevel: 1 }, 'skilled');
      r.rec.events.forEach((e) => {
        n++;
        if (e.rerolls.length || e.tieBy) rerolled++; else if (attW(e.gap, e.dice.att, e.dice.def, false, 6) !== e.win) { badWin++; if (samples.length < 3) samples.push(`win ${mode}/${club} turn ${e.turnNo || '?'} gap ${e.gap} dice ${JSON.stringify(e.dice)}`); }
        const sumP = e.parts.reduce((x, p) => x + p.v, 0);
        if (sumP !== e.myScore) { badSum++; if (samples.length < 6) samples.push(`sum ${mode}/${club} ${e.side} ${e.action} parts ${JSON.stringify(e.parts)} myScore ${e.myScore}`); }
        if (e.oppParts.reduce((x, p) => x + p.v, 0) !== e.oppScore) { badSum++; if (samples.length < 6) samples.push(`oppsum ${mode}/${club} ${e.side} ${e.action} oppParts ${JSON.stringify(e.oppParts)} oppScore ${e.oppScore}`); }
        if (e.side === 'me') { if (e.myScore - e.parts[0].v > 3) badCap++; const sm = e.stance ? sMod(e.action, e.stance) : 0; if (e.myScore - e.oppScore + sm !== e.gap) badSum++; }
        else { const sm = sMod(e.action, e.stance); if (e.oppScore - e.myScore + sm !== e.gap) badSum++; }
        if (e.hand.length !== 3) handBad++;
        if (e.side === 'me' && e.chip.pressW !== undefined && !e.extra) {
          nChip++; const g0 = e.myScore - e.oppScore;
          const ex = e.chip.pressW * enumP(g0 + sMod(e.action, 'press'), false, 6) + (1 - e.chip.pressW) * enumP(g0 + sMod(e.action, 'drop'), false, 6);
          if (Math.abs(ex - e.chip.p) > 1e-9) badChipE++;
        }
      });
    }
  }
  const tot = nM + ' matches (home / away / neutral x 3 clubs)';
  add('Every resolved duel re-derived from its Event: win = rule(gap, dice) (Level 1, no nodes; fx-altered duels skipped)', '0 mismatches', `${badWin} of ${n - rerolled} (${rerolled} fx-altered skipped)`, tot, hit(!badWin), samples.filter((s) => s.startsWith('win')).join('; '));
  add('Chip parts sum to the shown total, gap = total - opp total (+stance), both sides, all 3 modes (club-side Roar included)', '0 mismatches', `${badSum} in ${n} events`, tot, hit(!badSum), samples.filter((s) => !s.startsWith('win')).slice(0, 3).join('; '));
  add('Attack chip equals 36-pair enumeration of its own gap and Press weight (exact, 1e-9)', '0 mismatches', `${badChipE} of ${nChip} shown chips`, tot, hit(!badChipE));
  add('Cap +3 on d6 respected on every attack (bonus over stat <= 3, incl. Pass +2 and Roar)', 'max +3', badCap + ' breaches in ' + n + ' events', tot, hit(!badCap));
  add('Hand is 3 cards on every turn without Fourth Card (and Twin Run second plays keep 3)', '3', handBad + ' turns with another size', tot, hit(!handBad));
}

function chipRun(fx) {
  const lv = fx ? 2 : 1, nd = fx ? ['A1', 'D1'] : [];
  const stateSeeds = seedList('chipstate', 60);
  function reach(cfg, polName, targetTurn) {
    const setup = mkSetup(cfg), pol = POLS[polName];
    const m = SD.engine.newMatch(setup); const ctx = { m, pol, M: null, pr: mulberry(1), stat: { previews: 0, used: {} } };
    let g = 0;
    while (m.phase !== 'full' && g++ < 100) {
      if (m.phase === 'halftime') { SD.engine.startHalf2(m); continue; }
      if (!ctx.M) ctx.M = getModel(m);
      if (m.turnNo === targetTurn) return { m, ctx };
      useActives(ctx);
      if (m.phase === 'attack') { const c = chooseAttack(ctx); SD.engine.playAttack(m, c.pid, c.a); } else { const c = chooseDefend(ctx); SD.engine.playDefend(m, c.pid, c.stance); }
      if (m.flags.extraShoot) return null; // skip twin-run states
      SD.engine.nextPhase(m);
    }
    return null;
  }
  const picks = []; let si = 0;
  for (const mode of ['home', 'away', 'neutral']) for (const [club, form] of [['grimsby', 'Wall'], ['reading', 'Diamond']]) {
    const cfg0 = { club, formation: form, pitchLevel: lv, nodes: nd, mode };
    let have = 0;
    for (let tries = 0; tries < 300 && have < 4; tries++) {
      const seed = (stateSeeds[si++ % stateSeeds.length] + tries * 7919) >>> 0, turnNo = 1 + Math.floor(mulberry(seed)() * 12);
      const R = reach(Object.assign({ seed }, cfg0), 'skilled', turnNo); if (!R) continue;
      picks.push({ club, form, mode, seed, turnNo, side: R.m.phase }); have++;
    }
  }
  let worst = 0, nStates = 0, fails = 0; const lines = [];
  for (const P of picks) {
    const cfg = { seed: P.seed, club: P.club, formation: P.form, pitchLevel: lv, nodes: nd, mode: P.mode };
    const R0 = reach(cfg, 'skilled', P.turnNo); if (!R0) continue; const m0 = R0.m;
    let move, shown;
    if (P.side === 'attack') { const c = chooseAttack(R0.ctx); move = c; shown = SD.engine.previewAttack(m0, c.pid, c.a).chip.p; }
    else { const c = chooseDefend(R0.ctx); move = c; shown = SD.engine.previewDefend(m0, c.pid, c.stance).chip.p; }
    let ok = 0; const trials = seedList('chiptrial' + P.seed + P.turnNo, N_CHIP);
    for (let j = 0; j < N_CHIP; j++) {
      const R = reach(cfg, 'skilled', P.turnNo), m = R.m, rr = mulberry(trials[j]);
      m.roll = { ua: rr(), us: rr(), da: 1 + Math.floor(rr() * 6), db: 1 + Math.floor(rr() * 6) };
      m.rng.fxr = SD.rng.make((trials[j] ^ 0x5EED5EED) >>> 0);
      if (P.side === 'attack') { const ev = SD.engine.playAttack(m, move.pid, move.a); if (ev.win) ok++; }
      else { const ev = SD.engine.playDefend(m, move.pid, move.stance); if (ev.meWon) ok++; }
    }
    const emp = ok / N_CHIP, d = 100 * Math.abs(emp - shown);
    nStates++; if (d > worst) worst = d; if (d > 1.2) fails++;
    lines.push(`${P.mode}/${P.club}/T${P.turnNo}/${P.side}: chip ${pct(shown)} v ${pct(emp)} (d ${d.toFixed(2)})`);
    if (nStates >= 18) break;
  }
  NOTES['chip' + (fx ? 'Fx' : '')] = 'Chip states (' + (fx ? 'Level 2 Traits + A1 D1' : 'Level 1, no nodes') + '): ' + lines.join('; ');
  if (!fx) add('Every odds chip within 1.2 points of ' + N_CHIP + ' seeded duels (attack and defence states, home / away / neutral, Level 1, no nodes: no reroll effects)', 'max |chip - freq| <= 1.2 pt (SE of a ' + N_CHIP + '-trial freq is 0.8 pt)', `${nStates} states, worst ${worst.toFixed(2)} pt, ${fails} over 1.2`, nStates + ' states x ' + N_CHIP, hit(!fails && nStates >= 14), nStates < 14 ? 'too few states reached' : lines.filter((x) => /d (1\.[2-9]|[2-9]|\d\d)/.test(x)).slice(0, 4).join('; '));
  else add('Same chips with Level 2 Traits and nodes A1 D1 owned (once-per-match rerolls: Second Strike, Big Read, Rebound, Hold Firm ...)', 'information: the chip is the base 36-pair odds; rerolls add on top', `${nStates} states, worst ${worst.toFixed(2)} pt, ${fails} over 1.2; states off by over 1.2: ` + (lines.filter((x) => /d (1\.[2-9]|[2-9]|\d\d)/.test(x)).slice(0, 5).join('; ') || 'none'), nStates + ' states x ' + N_CHIP, 'INFO', 'if the shipped design says the chip must include rerolls this is a MISS; slice chip text counts base odds only');
}
function expChip() { CUR_G = 7; chipRun(false); chipRun(true); }
function expReplay() {
  CUR_G = 7;
  guard('Replay', () => {
    const seeds = seedList('replay', 30); let diff = 0, checked = 0, resumeDiff = 0, rChecked = 0, shDiff = 0, shN = 0;
    const key = (r) => JSON.stringify(r.m.log.map((e) => [e.pid, e.action, e.stance, e.dice, e.win, e.cause, e.rerolls, e.score])) + JSON.stringify(r.sum);
    for (const [club, mode] of [['grimsby', 'home'], ['reading', 'away'], ['lincoln', 'neutral']]) for (const pol of ['skilled', 'random', 'ro', 'staller']) {
      for (const seed of seeds.slice(0, 6)) {
        const cfg = { seed, club, mode, formation: 'Spear', pitchLevel: 2, nodes: ['A1', 'D1', 'S1', 'A3', 'D3'], swap: ['orlo', 'veska', 'brannik'], cup: mode === 'neutral' };
        const a = runMatch(cfg, pol), b = runMatch(cfg, pol); checked++; if (key(a) !== key(b)) diff++;
      }
    }
    // save and resume: the saved setup (plain JSON) + recorded inputs replay to the same match (S9 resume rule)
    for (const [club, mode] of [['grimsby', 'home'], ['bolton', 'away'], ['lincoln', 'neutral']]) for (const seed of seeds.slice(0, 8)) {
      const cfg = { seed, club, mode, formation: 'Diamond', pitchLevel: 3, nodes: ['A1', 'D1', 'D2', 'S1', 'A3'], swap: ['orlo', 'tobbin', 'maelis'], cup: mode === 'neutral', md: club === 'grimsby' ? 1 : club === 'bolton' ? 3 : 8 };
      const calls = [], _use = SD.engine.use, _pa = SD.engine.playAttack, _pd = SD.engine.playDefend, _sh = SD.engine.startHalf2, _np = SD.engine.nextPhase;
      let r1;
      try {
        SD.engine.use = (m, id) => { const ok = _use(m, id); if (ok) calls.push(['use', id]); return ok; };
        SD.engine.playAttack = (m, p, a) => { const e = _pa(m, p, a); if (e) calls.push(['atk', p, a]); return e; };
        SD.engine.playDefend = (m, p, s) => { const e = _pd(m, p, s); if (e) calls.push(['def', p, s]); return e; };
        SD.engine.startHalf2 = (m) => { calls.push(['half']); return _sh(m); };
        SD.engine.nextPhase = (m) => { calls.push(['next']); return _np(m); };
        r1 = runMatch(cfg, 'skilled');
      } finally { SD.engine.use = _use; SD.engine.playAttack = _pa; SD.engine.playDefend = _pd; SD.engine.startHalf2 = _sh; SD.engine.nextPhase = _np; }
      const saved = JSON.parse(JSON.stringify(mkSetup(cfg)));
      const m2 = SD.engine.newMatch(saved);
      calls.forEach((c) => { if (c[0] === 'use') SD.engine.use(m2, c[1]); else if (c[0] === 'atk') SD.engine.playAttack(m2, c[1], c[2]); else if (c[0] === 'def') SD.engine.playDefend(m2, c[1], c[2]); else if (c[0] === 'half') SD.engine.startHalf2(m2); else SD.engine.nextPhase(m2); });
      rChecked++;
      if (JSON.stringify(m2.log.map((e) => [e.pid, e.action, e.stance, e.dice, e.win, e.cause, e.score])) !== JSON.stringify(r1.m.log.map((e) => [e.pid, e.action, e.stance, e.dice, e.win, e.cause, e.score])) || JSON.stringify(SD.engine.summary(m2)) !== JSON.stringify(r1.sum)) resumeDiff++;
      if (r1.sum.cup && r1.sum.level) { shN++; const a = playShootout(r1.m, {}, 'best', 99, mulberry(1)), b = playShootout(r1.m, {}, 'best', 99, mulberry(1)); if (JSON.stringify(a) !== JSON.stringify(b)) shDiff++; }
    }
    add('A seed replays identically (full event log + summary; 3 modes x 4 policies, new Signatures, tier-3 nodes, Orlo, Veska fielded)', 'identical', diff + ' of ' + checked + ' replays differ', checked + ' seeds x2', hit(!diff));
    add('Save and reload identical: setup as plain JSON + recorded inputs replays the same match (home / away / neutral Cup)', 'identical', `${resumeDiff} of ${rChecked} differ; shootout replay ${shDiff} of ${shN} differ`, rChecked + ' matches', hit(!resumeDiff && !shDiff));
  });
}

// ================================================================== rows persistence, doc, main
const KEYS = [['sig', 1, expSig], ['nodes3', 1, expNodes3], ['lvl4', 1, expLvl4], ['roar', 1, expRoar], ['ruler', 1, expRuleR], ['fire', 1, expFire], ['player', 1, expPlayer],
  ['ladder', 2, expLadder], ['retune', 2, expRetune], ['ladderN', 3, expLadderN], ['season', 4, expSeason], ['season2', 5, expSeason2], ['pulls', 6, expPulls],
  ['odds', 7, expOdds], ['resolve', 7, expResolve], ['chip', 7, expChip], ['replay', 7, expReplay]];
function saveRows(key, from) {
  fs.mkdirSync(ROWS_DIR, { recursive: true });
  const mine = ROWS.slice(from);
  fs.writeFileSync(path.join(ROWS_DIR, key + '.json'), JSON.stringify({ key, stamp: new Date().toISOString(), rows: mine, notes: NOTES }));
  const st = readKV(); Object.assign(st, KV); fs.writeFileSync(path.join(ROWS_DIR, 'state.json'), JSON.stringify(st));
}
const esc = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
const GATE_TITLE = { 1: 'Gate 1: new content, one item at a time (8 Signatures, 3 tier-3 nodes, Level 4, club-side Roar, rule R, fire rates)', 2: 'Gate 2: club ladder on HARD (SEASON-SPEC section 3), Grimsby DEF 5, Rotherham retune',
  3: 'Gate 3: NORMAL and EASY (never measured before)', 4: 'Gate 4: season 1 (real table, real shootout)', 5: 'Gate 5: season 2 under S8', 6: 'Gate 6: pulls (B-economy section g rows 1-6 and 10)', 7: 'Gate 7: slice gates that still apply, replay and save / reload' };
function writeDoc() {
  const files = fs.existsSync(ROWS_DIR) ? fs.readdirSync(ROWS_DIR).filter((f) => f.endsWith('.json') && f !== 'state.json') : [];
  const all = []; const notes = {};
  files.forEach((f) => { const j = JSON.parse(fs.readFileSync(path.join(ROWS_DIR, f), 'utf8')); j.rows.forEach((r) => all.push(Object.assign({ key: j.key, stamp: j.stamp }, r))); Object.assign(notes, j.notes || {}); });
  const order = KEYS.map((k) => k[0]);
  all.sort((a, b) => a.g - b.g || order.indexOf(a.key) - order.indexOf(b.key));
  const cnt = {}; all.forEach((r) => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let md = '# BOT-SEASON: bot gates 1-7 for build sq-season-1\n\n';
  md += `Written by \`node tests/squad-duel/bot-season.js\` (maker "bot"), report run ${stamp}. Every move goes through the REAL engine (SD.engine.playAttack / playDefend / use), seasons through SD.season, shootouts through SD.shootout, pulls through SD.gacha.pull, pay through SD.progress.applyMatch. Status: HIT = inside the band, MISS = outside it (reported as a miss, not tuned away), INFO = no band exists, number reported.\n\n`;
  md += `Summary: ${Object.keys(cnt).map((k) => k + ' ' + cnt[k]).join(', ')}.\n\n`;
  const misses = all.filter((r) => r.status === 'MISS');
  md += '## Misses (top of the page)\n\n';
  md += misses.length ? misses.map((r) => `- G${r.g} ${esc(r.gate)}: ${esc(r.measured)} (target ${esc(r.target)})${r.note ? ' / ' + esc(r.note) : ''}`).join('\n') + '\n\n' : 'None.\n\n';
  if (notes.retune || all.some((r) => r.gate.indexOf('RETUNE') >= 0)) {
    const rt = all.find((r) => r.gate.indexOf('RETUNE') >= 0);
    md += '## Rotherham retune suggestion (MD5, DEF up to 12, attack <= 8, land skilled within 5 of 48 on Hard)\n\n' + (rt ? `${esc(rt.gate)}: ${esc(rt.measured)}. ${esc(rt.note)} [${rt.status}]\n\n` : '') + (notes.retune ? notes.retune + '\n\n' : '');
  }
  md += '## Gate table\n\n';
  let g = -1;
  all.forEach((r) => {
    if (r.g !== g) { g = r.g; md += `\n### ${GATE_TITLE[g] || 'Gate ' + g}\n\n| Gate | Target | Measured | Seeds | HIT/MISS | Note |\n|---|---|---|---|---|---|\n`; }
    md += `| ${esc(r.gate)} | ${esc(r.target)} | ${esc(r.measured)} | ${esc(r.seeds)} | ${r.status} | ${esc(r.note)} |\n`;
  });
  md += '\n## Method and limits\n\n';
  md += '- Policies: skilled = port of the slice `dp` policy (value tables from getDP6, odds from previewAttack / previewDefend, uses Sharp Eye and Second Look when the information is worth it, Fresh Hand, Twin Run second Shoot, Call for Ball via SD.engine.attackCards). The value tables do not model club-side Roar, Hold Up, Follow Up or Quick Throw (the engine applies them, the policy does not plan around them), so skilled is slightly below a perfect player there. random / rc / ro / staller as in tests/squad-duel/bot.js.\n';
  md += '- Shootout order policies: `best` = exhaustive order of the kicks still to come with rule R chained and Second Strike odds (maximises expected goals), `greedy` = highest chip now, `strong` = strongest first and blind to rule R, `rand`.\n';
  md += '- Expected squad per matchday = E-bot-season section 3 (Level 1/1, 2/1, 2/1, 3/2 ... Cup 4/2; Lio replaces Tavo from MD2, Zefa replaces Pip at MD7, E-bot-season star pips) with SP floor 3, 4, 6, 7, 9, 10, 12 buying D1 D2 S1 S2 A1 D3 A3 S3 in that order while they fit. Formation per matchday re-selected on independent seeds. Season sims sample Preston\'s score from engine batches and run the real SD.season table, other results, Cup gate and Cup record.\n';
  md += '- Pull-path squads for season 2 come from the real gacha (12 pulls, 16 paths), best owned per role, S1 pulls Level 4, S2 pulls Level 3.\n';
  md += '- Seeds: first pass of each lift uses ' + N_LIFT + ' paired seeds; a lift within 2 se of a band edge is re-run at ' + N_LIFTMAX + '. Win-rate rows use ' + N_WIN + '. Smallest counts that answer each row; a full sweep is for release.\n';
  md += `- Re-run: \`node tests/squad-duel/bot-season.js\` (everything) or \`--only=sig,nodes3,lvl4,roar,ruler,fire,player,ladder,retune,ladderN,season,season2,pulls,odds,resolve,chip,replay\`; \`--report\` rewrites this file from saved rows (${ROWS_DIR}).\n`;
  fs.writeFileSync(OUT, md);
  console.log('wrote ' + OUT + ' (' + all.length + ' rows)');
}

function main() {
  const t0 = Date.now();
  console.log('loaded:', L.loaded.join(' '), L.missing.length ? 'MISSING ' + L.missing.join(' ') : '', L.errors.length ? 'ERRORS ' + JSON.stringify(L.errors) : '');
  if (ARGS.report) { writeDoc(); return; }
  if (L.missing.length || L.errors.length || !SD.engine || !SD.season || !SD.shootout || !SD.fxDefs.SIG_ORLO) {
    CUR_G = 0; add('Engine and modules load (rng data odds club-ai fx-nodes fx-players engine progress gacha season shootout; SIG_ORLO defined)', 'all load', 'missing: ' + L.missing.join(' ') + ' errors: ' + L.errors.map((e) => e.file).join(' '), '-', 'MISS');
    saveRows('load', 0); writeDoc(); return;
  }
  for (const [key, g, fn] of KEYS) {
    if (!want(key)) continue;
    const from = ROWS.length; CUR_G = g;
    guard(key, fn); saveRows(key, from); console.log(`-- ${key} done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (!ARGS['no-write'] && (!ONLY || ARGS.write)) writeDoc();
  console.log('done in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
main();
