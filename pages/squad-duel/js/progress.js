(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  const KEY = 'squadDuel.v1';
  const STEPS = ['manager1', 'match1', 'result1', 'tree', 'pull', 'manager2', 'match2', 'result2', 'end'];
  const STATS = ['pac', 'pas', 'sho', 'def'];
  // admin default: fallbacks used only when SD.data is missing a field (data.js wins when present)
  const FALLBACK_T = { openingCoins: 100, openingSP: 3, respecCost: 50, xpGoal: 10, xpDuel: 3, xpWin: 20, flatterStarters: false };
  const FALLBACK_XP = { duelWon: 3, goal: 10, assist: 5, save: 8, win: 20, draw: 12, loss: 12, benchShare: 0.5, levels: [0, 30, 80, 150] };
  const FALLBACK_PAY = { opening: { coins: 100, sp: 3 }, later: { W: { coins: 100, sp: 2 }, D: { coins: 70, sp: 1 }, L: { coins: 50, sp: 1 } } };
  const ROLE_STAT = { Striker: 'sho', Playmaker: 'pas', Winger: 'pac', Anchor: 'def', Keeper: 'def' };

  const D = () => SD.data || {};
  const XPT = () => Object.assign({}, FALLBACK_XP, D().XP || {});
  const PAY = () => D().PAY || FALLBACK_PAY;
  const TT = (T) => Object.assign({}, FALLBACK_T, D().TWEAK_DEFAULTS || {}, (SD.app && SD.app.T) || {}, T || {});
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const bad = (why) => ({ ok: false, why });

  function storage() { try { return globalThis.localStorage || null; } catch (e) { return null; } }

  function newState(seed) {
    const owned = {};
    (D().PLAYERS || []).forEach((p) => { if (p.starter) owned[p.id] = { stars: 0, xp: 0, level: 1, isNew: false }; });
    const dl = D().DEFAULT_LINEUP || { keeper: null, outfield: [], bench: [] };
    return {
      v: 1, build: 'sq-slice-1', seed: seed == null ? 1 : seed, step: 'manager1',
      coins: 0, sp: 0, owned, lineup: clone(dl), formation: 'Wall', nodes: [],
      spent: { attack: 0, defence: 0, squad: 0 }, pulls: 0, pity: { epic: 0, legend: 0 },
      lastPull: null, results: [], reports: []
    };
  }

  function load() {
    try {
      const ls = storage(); if (!ls) return null;
      const raw = ls.getItem(KEY); if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object' || typeof s.v !== 'number' || !s.owned || !s.lineup) return null;
      return s;
    } catch (e) { return null; }
  }

  function save(S) {
    try {
      const ls = storage(); if (!ls || !S) return false;
      let cur = null;
      try { cur = JSON.parse(ls.getItem(KEY) || 'null'); } catch (e) { cur = null; }
      if (cur && typeof cur.v === 'number' && cur.v > S.v) return false; // never overwrite a higher version
      ls.setItem(KEY, JSON.stringify(S));
      return true;
    } catch (e) { return false; }
  }

  function wipe() {
    try { const ls = storage(); if (ls) ls.removeItem(KEY); return true; } catch (e) { return false; }
  }

  function levelOf(xp) {
    const lv = XPT().levels; let l = 1;
    for (let i = 1; i < lv.length; i++) if (xp >= lv[i]) l = i + 1;
    return l;
  }

  function xpNext(xp) {
    const lv = XPT().levels, level = levelOf(xp);
    if (level >= lv.length) return { level, into: xp - lv[lv.length - 1], need: 0, nextLabel: 'Max level' };
    const labels = { 2: 'Level 2: Trait', 3: 'Level 3: +1 top stat', 4: 'Level 4: +1 second stat' };
    return { level, into: xp - lv[level - 1], need: lv[level] - lv[level - 1], nextLabel: labels[level + 1] || ('Level ' + (level + 1)) };
  }

  function topStat(p) {
    let max = -1; STATS.forEach((k) => { if (p[k] > max) max = p[k]; });
    const pref = ROLE_STAT[p.role];
    if (pref && p[pref] === max) return pref; // admin default: ties go to the role's own stat, else first of PAC/PAS/SHO/DEF
    return STATS.find((k) => p[k] === max);
  }

  function statsOf(S, pid, T) {
    const t = TT(T), base = D().byId ? D().byId(pid) : null;
    if (!base) return null;
    const o = (S && S.owned && S.owned[pid]) || { stars: 0, level: 1 };
    const P = { id: base.id, name: base.name, role: base.role, rarity: base.rarity,
      pac: base.pac, pas: base.pas, sho: base.sho, def: base.def, sig: base.sig || null };
    const fl = t.flatterStarters && D().FLATTER && D().FLATTER[pid];
    if (fl) STATS.forEach((k) => { P[k] = fl[k]; });
    const top = topStat(P);
    let bump = 0;
    if ((o.level || 1) >= 3) bump += 1;
    if ((o.stars || 0) >= 2) bump += 1;
    if ((o.stars || 0) >= 4) bump += 1;
    P[top] = Math.min(10, P[top] + bump);
    P.level = o.level || 1; P.stars = o.stars || 0;
    return P;
  }

  const matchNo = (S) => (['manager1', 'match1', 'result1'].indexOf(S.step) >= 0 ? 1 : 2);

  function applyMatch(S, summary, T) {
    const t = TT(T), X = XPT(), pay = PAY();
    const reward = { coins: 0, sp: 0, xp: {}, levelUps: [], opening: false };
    if (!summary) return reward;
    const mNo = summary.matchNo || matchNo(S);
    if ((S.results || []).some((r) => r.matchNo === mNo)) return reward; // admin default: a match pays once
    const res = summary.res;
    const resXP = res === 'W' ? t.xpWin : (res === 'D' ? X.draw : X.loss);
    const pitch = [S.lineup.keeper].concat(S.lineup.outfield || []);
    const bench = S.lineup.bench || [];
    const st = summary.stats || {};
    const gain = {};
    pitch.forEach((pid) => {
      const e = st[pid] || {};
      gain[pid] = (e.duelsWon || 0) * t.xpDuel + (e.goals || 0) * t.xpGoal + (e.assists || 0) * X.assist + (e.saves || 0) * X.save + resXP;
    });
    bench.forEach((pid) => { gain[pid] = Math.floor(resXP * X.benchShare); });
    const opening = mNo === 1;
    Object.keys(gain).forEach((pid) => {
      const o = S.owned[pid]; if (!o) return;
      const before = o.level || 1, xp0 = o.xp || 0;
      o.xp = xp0 + gain[pid];
      if (opening && pitch.indexOf(pid) >= 0 && o.xp < X.levels[1]) o.xp = X.levels[1]; // Opening day: pitch players reach Level 2
      reward.xp[pid] = o.xp - xp0; // XP actually credited, incl. Opening day top-up
      o.level = levelOf(o.xp);
      if (o.level > before) {
        const b = D().byId ? D().byId(pid) : null;
        const tr = b && D().TRAITS ? D().TRAITS[b.role] : null;
        reward.levelUps.push({ pid, level: o.level, trait: o.level === 2 ? (tr || null) : null });
      }
    });
    if (opening) { reward.opening = true; reward.coins = t.openingCoins; reward.sp = t.openingSP; }
    else {
      const p = (pay.later && pay.later[res]) || FALLBACK_PAY.later[res] || { coins: 0, sp: 0 };
      reward.coins = p.coins; reward.sp = p.sp;
    }
    S.coins += reward.coins; S.sp += reward.sp;
    S.results.push({ matchNo: mNo, club: summary.club, me: summary.score.me, opp: summary.score.opp, res });
    return reward;
  }

  function nodeDef(id) { return (D().NODES || []).find((n) => n.id === id) || null; }

  function canBuy(S, id) {
    const n = nodeDef(id);
    if (!n) return bad('Unknown node');
    if (S.nodes.indexOf(id) >= 0) return bad('Already owned');
    if (n.req && S.nodes.indexOf(n.req) < 0) return bad('Needs ' + n.req + ' first');
    if (n.fork && (D().NODES || []).some((o) => o.id !== id && o.fork === n.fork && S.nodes.indexOf(o.id) >= 0)) return bad('Other fork path chosen: respec to switch');
    if (S.sp < n.cost) return bad('Need ' + n.cost + ' Skill Points');
    return { ok: true, why: '' };
  }

  function buy(S, id) {
    const c = canBuy(S, id); if (!c.ok) return c;
    const n = nodeDef(id);
    S.sp -= n.cost; S.spent[n.tab] = (S.spent[n.tab] || 0) + n.cost; S.nodes.push(id);
    return { ok: true, why: '' };
  }

  function respec(S, tab, T) {
    const t = TT(T);
    const mine = S.nodes.filter((id) => { const n = nodeDef(id); return n && n.tab === tab; });
    if (!mine.length) return bad('Nothing to respec');
    if (S.coins < t.respecCost) return bad('Need ' + t.respecCost + ' Coins');
    const refund = S.spent[tab] || 0;
    S.coins -= t.respecCost; S.sp += refund; S.spent[tab] = 0;
    S.nodes = S.nodes.filter((id) => mine.indexOf(id) < 0); // frees the fork too
    return { ok: true, why: '', refund, cost: t.respecCost };
  }

  function setLineup(S, lu) {
    if (!lu || !lu.keeper || !Array.isArray(lu.outfield) || !Array.isArray(lu.bench)) return bad('Lineup shape');
    if (lu.outfield.length !== 4) return bad('Need 4 outfield players');
    if (lu.bench.length !== 2) return bad('Need 2 on the bench');
    const all = [lu.keeper].concat(lu.outfield, lu.bench);
    if (new Set(all).size !== all.length) return bad('A player is used twice');
    for (const pid of all) {
      if (!S.owned[pid]) return bad('Not owned: ' + pid);
      if (!D().byId || !D().byId(pid)) return bad('Unknown player: ' + pid);
    }
    if (D().byId(lu.keeper).role !== 'Keeper') return bad('Keeper slot needs a Keeper');
    const nk = lu.outfield.concat(lu.bench).find((pid) => D().byId(pid).role === 'Keeper');
    if (nk) return bad('Only the keeper slot takes a Keeper');
    S.lineup = { keeper: lu.keeper, outfield: lu.outfield.slice(), bench: lu.bench.slice() };
    return { ok: true, why: '' };
  }

  function swap(S, slot, pid) {
    const L = S.lineup;
    const get = (s) => (s === 'k' ? L.keeper : s[0] === 'o' ? L.outfield[+s.slice(1)] : s[0] === 'b' ? L.bench[+s.slice(1)] : undefined);
    const put = (lu, s, v) => { if (s === 'k') lu.keeper = v; else if (s[0] === 'o') lu.outfield[+s.slice(1)] = v; else lu.bench[+s.slice(1)] = v; };
    if (!/^(k|o[0-3]|b[0-1])$/.test(String(slot))) return bad('Unknown slot');
    if (!S.owned[pid]) return bad('Not owned');
    const lu = { keeper: L.keeper, outfield: L.outfield.slice(), bench: L.bench.slice() };
    const old = get(slot);
    const from = ['k', 'o0', 'o1', 'o2', 'o3', 'b0', 'b1'].find((s) => get(s) === pid);
    put(lu, slot, pid);
    if (from && from !== slot) put(lu, from, old); // swaps with wherever pid was
    return setLineup(S, lu);
  }

  const squadCount = (S) => ({ have: Object.keys(S.owned).length, of: 12 });

  SD.progress = { STEPS, KEY, newState, load, save, wipe, levelOf, xpNext, statsOf, matchNo, applyMatch,
    canBuy, buy, respec, setLineup, swap, squadCount };
})();
