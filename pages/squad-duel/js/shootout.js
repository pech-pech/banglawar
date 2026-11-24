(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // SEASON-SPEC S7 "Rule F + 2" with kick order rule R, A-systems.md section d. Pure logic, no DOM.
  // sh is plain JSON (no reference to m): everything needed is snapshotted into sh.cfg at start().
  // Every die comes from a stream hashed from sh.seed + kick index (resume-safe, no stateful rng).

  // ---- seeded dice (SD.rng when present; identical-quality local fallback otherwise) ----
  function hash() {
    if (SD.rng && SD.rng.hash) return SD.rng.hash.apply(null, arguments);
    const s = Array.prototype.join.call(arguments, '|'); let h = 0x811C9DC5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 255; h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function make(seed) {
    if (SD.rng && SD.rng.make) return SD.rng.make(seed);
    let a = seed >>> 0;
    const R = { next() { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
      d6() { return 1 + Math.floor(R.next() * 6); } };
    return R;
  }

  // ---- the duel: gap already halved toward zero; 6 v 1 and 1 v 6 hold; tie to kicker unless tieKicker false ----
  const half = (g) => Math.trunc(g / 2);
  function scores(g, a, b, tieKicker) {
    if (a === 6 && b === 1) return true;
    if (a === 1 && b === 6) return false;
    const d = g + a - b;
    return tieKicker ? d >= 0 : d > 0;
  }
  // exact 36-pair odds that the kicker scores. stat/vs raw (halving happens here).
  function pairOdds(stat, vs, tieKicker) {
    const g = half(stat - vs); let w = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (scores(g, a, b, tieKicker !== false)) w++;
    return w / 36;
  }
  // same with one reroll of the kicker die on a miss (Second Strike): exact
  function pairOddsStrike(stat, vs, tieKicker) {
    const g = half(stat - vs); let w = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      if (scores(g, a, b, tieKicker !== false)) { w += 6; continue; }
      for (let a2 = 1; a2 <= 6; a2++) if (scores(g, a2, b, tieKicker !== false)) w++;
    }
    return w / 216;
  }

  const FX_STRIKE = 'T_STRIKER', FX_BIGREAD = 'T_KEEPER', FX_HAND = 'SIG_YSOLDE', FX_REBOUND = 'D1';
  const FX_NAME = { T_STRIKER: 'Second Strike', T_KEEPER: 'Big Read', SIG_YSOLDE: 'Last Hand', D1: 'Rebound' };
  const fxKey = (id, pid) => id + ':' + (pid || '');

  function cardOf(P) {
    const sho = (P.sho || 0) + (P.role === 'Striker' ? 1 : 0), pas = P.pas || 0;
    return { pid: P.id, name: P.name, role: P.role, stat: Math.max(sho, pas), kind: sho >= pas ? 'SHO' : 'PAS' };
  }

  // ---- start ----
  function start(m, T) {
    T = Object.assign({}, (m && m.T) || {}, T || {});
    const su = m.setup || {};
    const cards = (su.outfield || []).concat(su.bench || []).slice(0, 6).map(cardOf);
    const keeper = su.keeper || m.keeper;
    const cs = m.cs || { def: m.club.def, keeper: m.club.keeper.def };
    const bonus = T.oppKickBonus != null ? T.oppKickBonus : 2;
    const seed = hash(m.seed, 'SO');
    const first = (make(hash(seed, 'coin')).next() < 0.5) ? 'me' : 'opp';
    const names = ((m.club.defenders || []).map((d) => d.name)).filter(Boolean);
    if (!names.length) names.push(m.club.keeper ? m.club.keeper.name : m.club.label || 'Club');
    // once-per-match effects still unspent and allowed here (A-systems d yes list)
    const off = T.fxOff || {}, fx = {}, fxLeft = [];
    (m.fx || []).forEach((i) => {
      if (off[i.id] === true) return;
      let ok = false;
      if (i.id === FX_STRIKE) ok = !!i.pid && cards.some((c) => c.pid === i.pid);
      else if (i.id === FX_BIGREAD || i.id === FX_HAND) ok = !!i.pid && !!keeper && keeper.id === i.pid;
      else if (i.id === FX_REBOUND) ok = true;
      if (!ok) return;
      const k = fxKey(i.id, i.pid);
      if (m.once && m.once[k]) return; // already spent in the 6+6 turns
      fx[k] = { id: i.id, pid: i.pid || null }; fxLeft.push(k);
    });
    return {
      seed, first, score: { me: 0, opp: 0 }, kicks: [], used: [], lastRole: null, done: false, winner: null, fxLeft,
      cfg: { // plain snapshot, JSON safe
        n: Math.max(1, T.shootKicks != null ? T.shootKicks : 3), ruleR: T.ruleR !== false,
        cards, myKeeper: { id: keeper ? keeper.id : null, name: keeper ? keeper.name : 'Keeper', def: keeper ? keeper.def : 0 },
        club: { id: m.club.id, label: m.club.label || m.club.name || m.club.id, kick: (cs.def || 0) + bonus, keeper: cs.keeper != null ? cs.keeper : m.club.keeper.def,
          keeperName: m.club.keeper ? m.club.keeper.name : 'Keeper', names },
        fx }
    };
  }

  // ---- order of kicks ----
  function sideAt(sh, i) { return (i % 2 === 0) === (sh.first === 'me') ? 'me' : 'opp'; }
  function whoKicks(sh) { return sh.done ? null : sideAt(sh, sh.kicks.length); }
  function counts(sh) { let me = 0, opp = 0; sh.kicks.forEach((k) => { if (k.side === 'me') me++; else opp++; }); return { me, opp }; }
  function label(sh) {
    const n = sh.cfg.n, c = counts(sh);
    if (sh.done) return 'Shootout over';
    if (sh.kicks.length >= 2 * n) return 'Sudden death, pair ' + (Math.floor((sh.kicks.length - 2 * n) / 2) + 1);
    const side = whoKicks(sh);
    return 'Kick ' + ((side === 'me' ? c.me : c.opp) + 1) + ' of ' + n;
  }

  // ---- my options ----
  function freshCards(sh) { return sh.cfg.cards.filter((c) => sh.used.indexOf(c.pid) < 0); }
  function ruleRHits(sh, card) { return !!(sh.cfg.ruleR && sh.lastRole && sh.lastRole === card.role); }
  function strikeLeft(sh, pid) { return !!sh.fxLeft && sh.fxLeft.indexOf(fxKey(FX_STRIKE, pid)) >= 0; }
  function options(sh) {
    if (!sh.cfg.cards.length) return [];
    let list = freshCards(sh);
    if (!list.length) { sh.used = []; list = freshCards(sh); } // all 6 used: fresh again
    const vs = sh.cfg.club.keeper;
    return list.map((c) => {
      const rr = ruleRHits(sh, c), tie = !rr;
      return { pid: c.pid, name: c.name, role: c.role, stat: c.stat, kind: c.kind, p: pairOdds(c.stat, vs, tie), ruleR: rr,
        strike: strikeLeft(sh, c.pid), pFx: strikeLeft(sh, c.pid) ? pairOddsStrike(c.stat, vs, tie) : pairOdds(c.stat, vs, tie) };
    });
  }
  function oddsOpp(sh) { return pairOdds(sh.cfg.club.kick, sh.cfg.myKeeper.def, true); }
  // club odds including my unspent save effects (Big Read, Last Hand, Rebound), exact
  function oddsOppFx(sh) {
    const g = half(sh.cfg.club.kick - sh.cfg.myKeeper.def), has = (id) => sh.fxLeft.indexOf(fxKey(id, id === FX_REBOUND ? '' : sh.cfg.myKeeper.id)) >= 0;
    const big = has(FX_BIGREAD), hand = has(FX_HAND), reb = has(FX_REBOUND);
    let w = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      // enumerate rerolls as a tree; each fx rerolls one die once (first scoring state spends it)
      const go = (a1, b1, bigL, handL, rebL) => {
        if (!scores(g, a1, b1, true)) return 0;
        if (bigL) { let s = 0; for (let x = 1; x <= 6; x++) s += go(x, b1, false, handL, rebL); return s / 6; }
        if (handL) { let s = 0; for (let x = 1; x <= 6; x++) s += go(a1, x, false, false, rebL); return s / 6; }
        if (rebL) { let s = 0; for (let x = 1; x <= 6; x++) s += go(a1, x, false, false, false); return s / 6; }
        return 1;
      };
      w += go(a, b, big, hand, reb);
    }
    return w / 36;
  }

  // ---- finishing logic ----
  function settle(sh) {
    const n = sh.cfg.n, c = counts(sh), s = sh.score, k = sh.kicks.length;
    let winner = null;
    if (k < 2 * n) {
      if (s.me > s.opp + (n - c.opp)) winner = 'me'; else if (s.opp > s.me + (n - c.me)) winner = 'opp';
    } else if (k % 2 === 0 && s.me !== s.opp) winner = s.me > s.opp ? 'me' : 'opp'; // pair complete
    if (winner) { sh.done = true; sh.winner = winner; }
    if (sh.used.length >= sh.cfg.cards.length) sh.used = [];
  }
  function spend(sh, id, pid) { const i = sh.fxLeft.indexOf(fxKey(id, pid)); if (i >= 0) sh.fxLeft.splice(i, 1); }
  const has = (sh, id, pid) => sh.fxLeft.indexOf(fxKey(id, pid)) >= 0;

  function kickMe(sh, pid) {
    if (sh.done || whoKicks(sh) !== 'me') return null;
    let list = freshCards(sh); if (!list.length) { sh.used = []; list = freshCards(sh); }
    const card = list.filter((c) => c.pid === pid)[0];
    if (!card) return null;
    const idx = sh.kicks.length, R = make(hash(sh.seed, 'k', idx)), rr = make(hash(sh.seed, 'k', idx, 'rr'));
    const vs = sh.cfg.club.keeper, reads = ruleRHits(sh, card), tie = !reads, g = half(card.stat - vs);
    let dA = R.d6(), dB = R.d6(), scored = scores(g, dA, dB, tie);
    const chips = [], fx = [];
    if (reads) chips.push('Keeper reads ' + card.role);
    if (!scored && has(sh, FX_STRIKE, card.pid)) { // Second Strike: reroll my missed kick once
      const from = dA; dA = rr.d6(); scored = scores(g, dA, dB, tie); spend(sh, FX_STRIKE, card.pid);
      const t = 'Second Strike: kick rerolled ' + from + ' to ' + dA + (scored ? ', scores' : ', still no');
      chips.push(t); fx.push({ id: FX_STRIKE, pid: card.pid, name: FX_NAME[FX_STRIKE], text: t });
    }
    const ev = { side: 'me', pid: card.pid, name: card.name, role: card.role, kind: card.kind, stat: card.stat, vs, dA, dB, scored, chips, fx, ruleR: reads, p: pairOdds(card.stat, vs, tie) };
    sh.used.push(card.pid); sh.lastRole = card.role;
    sh.kicks.push(ev); if (scored) sh.score.me++;
    settle(sh);
    return ev;
  }

  function kickOpp(sh) {
    if (sh.done || whoKicks(sh) !== 'opp') return null;
    const idx = sh.kicks.length, R = make(hash(sh.seed, 'k', idx)), rr = make(hash(sh.seed, 'k', idx, 'rr'));
    const cl = sh.cfg.club, kp = sh.cfg.myKeeper, g = half(cl.kick - kp.def);
    const myIdx = sh.kicks.filter((k) => k.side === 'opp').length;
    let dA = R.d6(), dB = R.d6(), scored = scores(g, dA, dB, true);
    const chips = [], fx = [];
    const note = (id, pid, t) => { chips.push(t); fx.push({ id, pid: pid || null, name: FX_NAME[id], text: t }); spend(sh, id, pid); };
    if (scored && has(sh, FX_BIGREAD, kp.id)) { // Big Read: the club's d6 is rerolled
      const f = dA; dA = rr.d6(); scored = scores(g, dA, dB, true);
      note(FX_BIGREAD, kp.id, 'Big Read: ' + cl.label + ' die rerolled ' + f + ' to ' + dA + (scored ? ', still scores' : ', no goal'));
    }
    if (scored && has(sh, FX_HAND, kp.id)) { // Last Hand: my save d6 rerolled
      const f = dB; dB = rr.d6(); scored = scores(g, dA, dB, true);
      note(FX_HAND, kp.id, 'Last Hand: save rerolled ' + f + ' to ' + dB + (scored ? ', still beaten' : ', saved'));
    }
    if (scored && has(sh, FX_REBOUND, '')) { // Rebound: reroll my d6 in the defending duel
      const f = dB; dB = rr.d6(); scored = scores(g, dA, dB, true);
      note(FX_REBOUND, null, 'Rebound: rerolled ' + f + ' to ' + dB + (scored ? ', still beaten' : ', saved'));
    }
    const ev = { side: 'opp', pid: null, name: cl.names[myIdx % cl.names.length], role: null, kind: 'DEF', stat: cl.kick, vs: kp.def, dA, dB, scored, chips, fx, ruleR: false, p: pairOdds(cl.kick, kp.def, true) };
    sh.kicks.push(ev); if (scored) sh.score.opp++;
    settle(sh);
    return ev;
  }

  function reportLines(sh) {
    const cl = sh.cfg.club, out = [];
    const mk = sh.kicks.filter((k) => k.side === 'me').length;
    out.push('Shootout: ' + (sh.first === 'me' ? 'Preston' : cl.label) + ' kicked first. ' + (sh.done ? ('Preston ' + sh.score.me + '-' + sh.score.opp + ' ' + cl.label + ', ' + (sh.winner === 'me' ? 'won' : 'lost')) : 'unfinished') + (mk ? '' : ''));
    sh.kicks.forEach((k, i) => {
      const who = k.side === 'me' ? k.name + ' (' + k.kind + ' ' + k.stat + ' v keeper ' + k.vs + ')' : k.name + ' (club ' + k.stat + ' v keeper ' + k.vs + ')';
      out.push((i + 1) + '. ' + who + ' dice ' + k.dA + ' v ' + k.dB + ': ' + (k.scored ? 'scored' : 'saved') + (k.chips.length ? ' [' + k.chips.join('; ') + ']' : ''));
    });
    return out;
  }

  SD.shootout = { start, whoKicks, label, options, kickMe, kickOpp, oddsOpp, oddsOppFx, reportLines, pairOdds, pairOddsStrike, scores, half };
})();
