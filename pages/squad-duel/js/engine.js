(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // ------------------------------------------------------------------
  // Lazy lookups + local fallbacks (contract formulas). Fallbacks are harmless: the real modules win.
  // ------------------------------------------------------------------
  const DEF_T = { die: 6, halfTurns: 6, handSize: 3, cap: 3, passBonus: 2, buildMax: 2, formCounter: 3, roarAt: 3,
    tellOn: true, coarseChip: false, flatterStarters: false, reducedMotion: false, autoNext: true,
    
    trailShift: 0.1, fxOff: {} };
  const FORM = {
    Wall: { defVs: { dribble: 3 }, att: {} },
    Diamond: { defVs: { through: 3 }, att: { pass: 1 } },
    Spear: { defVs: {}, att: { dribble: 1, shoot: 1 } } };
  const TRAIT_IDS = { Playmaker: 'T_PLAYMAKER', Winger: 'T_WINGER', Striker: 'T_STRIKER', Anchor: 'T_ANCHOR', Keeper: 'T_KEEPER' };

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    if (SD.rng && SD.rng.make) return SD.rng.make(seed >>> 0);
    const f = mulberry(seed >>> 0);
    return { next: f, int: (n) => Math.floor(f() * n), d6: () => 1 + Math.floor(f() * 6),
      shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; } };
  }
  const O = {
    attWins(gap, da, db, tieAtt, dieN) {
      if (SD.odds && SD.odds.attWins) return SD.odds.attWins(gap, da, db, tieAtt, dieN);
      const N = dieN || 6;
      if (da === N && db === 1) return true;
      if (da === 1 && db === N) return false;
      const d = gap + da - db; return tieAtt ? d >= 0 : d > 0;
    },
    duel(gap, tieAtt, dieN) {
      if (SD.odds && SD.odds.duel) return SD.odds.duel(gap, tieAtt, dieN);
      const N = dieN || 6; let w = 0;
      for (let a = 1; a <= N; a++) for (let b = 1; b <= N; b++) if (O.attWins(gap, a, b, tieAtt, N)) w++;
      return w / (N * N);
    },
    stanceMod(action, stance) {
      if (SD.odds && SD.odds.stanceMod) return SD.odds.stanceMod(action, stance);
      if (action === 'dribble') return stance === 'press' ? -1 : stance === 'drop' ? 1 : 0;
      if (action === 'through') return stance === 'press' ? 1 : stance === 'drop' ? -1 : 0;
      return 0;
    },
    attackChip(gap, action, pressW, opts) {
      if (SD.odds && SD.odds.attackChip) return SD.odds.attackChip(gap, action, pressW, opts);
      opts = opts || {}; let w = pressW == null ? 0.5 : pressW;
      if (opts.exactStance === 'press') w = 1; else if (opts.exactStance === 'drop') w = 0;
      const pPress = O.duel(gap + (opts.ignorePress ? 0 : O.stanceMod(action, 'press')), opts.tieAtt, opts.dieN);
      const pDrop = O.duel(gap + O.stanceMod(action, 'drop'), opts.tieAtt, opts.dieN);
      return { p: w * pPress + (1 - w) * pDrop, pPress, pDrop, pressW: w };
    },
    defendChip(rows, opts) {
      if (SD.odds && SD.odds.defendChip) return SD.odds.defendChip(rows, opts);
      let tw = 0, tp = 0; const acc = {};
      rows.forEach((r) => { const w = r.w == null ? 1 : r.w, pd = 1 - O.duel(r.gap, r.tieAtt, opts && opts.dieN); tw += w; tp += w * pd; acc[r.action] = pd; });
      return { p: tw ? tp / tw : 0, byAction: acc };
    },
    pct(p) { return SD.odds && SD.odds.pct ? SD.odds.pct(p) : Math.round(p * 100) + '%'; } };

  const C = {
    stats(club, T) {
      if (SD.clubAI && SD.clubAI.clubStats) return SD.clubAI.clubStats(club, T);
      const id = club.id, up = id.charAt(0).toUpperCase() + id.slice(1);
      return { def: T[id + 'Def'] != null ? T[id + 'Def'] : club.def, keeper: T[id + 'Keeper'] != null ? T[id + 'Keeper'] : club.keeper.def,
        atk: T[id + 'Atk'] != null ? T[id + 'Atk'] : club.atk, _: up };
    },
    weights(club, zone, trailing, T) {
      if (SD.clubAI && SD.clubAI.weights) return SD.clubAI.weights(club, zone, trailing, T);
      let wp = club.weights.pass, wd = club.weights.dribble, wt = club.weights.through;
      if (trailing) { wd += T.trailShift; wt += T.trailShift; wp = Math.max(0, wp - 2 * T.trailShift); }
      const s = wp + wd + wt; wp /= s; wd /= s; wt /= s;
      return zone < 2 ? { pass: wp, dribble: wd, through: wt, shoot: 0 } : { pass: wp, dribble: 0, through: 0, shoot: 1 - wp };
    },
    pick(w, ua) {
      if (SD.clubAI && SD.clubAI.pickAction) return SD.clubAI.pickAction(w, ua);
      const order = ['pass', 'dribble', 'through', 'shoot']; let acc = 0, act = 0;
      for (let a = 0; a < 4; a++) { acc += w[order[a]]; if (ua < acc) { act = a; break; } act = a; }
      if (w[order[act]] === 0) act = w.shoot > 0 ? 3 : 0;
      return order[act];
    },
    defender(club, z) { return SD.clubAI && SD.clubAI.defender ? SD.clubAI.defender(club, z) : club.defenders[z]; },
    pressChance(club, z, T) {
      if (SD.clubAI && SD.clubAI.pressChance) return SD.clubAI.pressChance(club, z, T);
      return T.tellOn ? club.defenders[z].press : club.offPress;
    },
    stance(p, us) { return SD.clubAI && SD.clubAI.stance ? SD.clubAI.stance(p, us) : (us < p ? 'press' : 'drop'); },
    tellText(club, z, T) {
      if (SD.clubAI && SD.clubAI.tellText) return SD.clubAI.tellText(club, z, T);
      const d = club.defenders[z], p = Math.round(C.pressChance(club, z, T) * 100);
      return d.name + ' (' + ['Defence', 'Midfield', 'Attack'][z] + '): Press ' + p + ' / Drop ' + (100 - p);
    },
    attackTell(club, z, tr, T) {
      if (SD.clubAI && SD.clubAI.attackTell) return SD.clubAI.attackTell(club, z, tr, T);
      const w = C.weights(club, z, tr, T);
      return club.label + ' attack: ' + ['pass', 'dribble', 'through', 'shoot'].filter((k) => w[k] > 0)
        .map((k) => k.charAt(0).toUpperCase() + k.slice(1) + ' ' + Math.round(w[k] * 100)).join(' / ');
    } };

  const ACTIONS = ['pass', 'dribble', 'through', 'shoot'];
  const ACT_NAME = { pass: 'Pass', dribble: 'Dribble', through: 'Through', shoot: 'Shoot' };
  const STAT_KEY = { pass: 'pas', through: 'pas', dribble: 'pac', shoot: 'sho' };
  const STAT_LABEL = { pass: 'PAS', through: 'PAS', dribble: 'PAC', shoot: 'SHO' };
  const ZONE_NAME = ['Defence', 'Midfield', 'Attack'];
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const other = (s) => (s === 'me' ? 'opp' : 'me');
  const sgn = (v) => (v >= 0 ? '+' + v : '' + v);

  function defs() { return SD.fxDefs || {}; }

  // ------------------------------------------------------------------
  // fx dispatcher
  // ------------------------------------------------------------------
  function run(m, hook, ctx) {
    const D = defs();
    for (let i = 0; i < m.fx.length; i++) {
      const inst = m.fx[i];
      if (m.T.fxOff && m.T.fxOff[inst.id] === true) continue;
      const def = D[inst.id];
      if (!def || !def.hooks || typeof def.hooks[hook] !== 'function') continue;
      m._cur = inst;
      const pw = ctx.win, pda = ctx.da, pdb = ctx.db, pt = ctx.tieAtt;
      def.hooks[hook](m, ctx, inst);
      if (hook === 'roll') {
        if (!pt && ctx.tieAtt && !m.turnFx.tieBy) m.turnFx.tieBy = inst.id;
        if (!pw && ctx.win && ctx.tie && pda === ctx.da && pdb === ctx.db && !m.turnFx.tieBy) m.turnFx.tieBy = inst.id;
      }
    }
    m._cur = null;
    return ctx;
  }
  function onceKey(inst) { return inst.id + ':' + (inst.pid || ''); }
  function onceUsed(m, inst) { return !!m.once[onceKey(inst)]; }
  function markOnce(m, inst) { m.once[onceKey(inst)] = true; }
  function onceHalfUsed(m, inst) { return !!(m.onceHalf && m.onceHalf[onceKey(inst)]); }
  function markOnceHalf(m, inst) { (m.onceHalf = m.onceHalf || {})[onceKey(inst)] = true; }
  function fire(m, ctx, inst, text) {
    if (ctx && ctx.preview) { if (text) (ctx.tags = ctx.tags || []).push(text); return; }
    const t = m.turnFx;
    if (t.fired.indexOf(inst.id) < 0) t.fired.push(inst.id);
    if (text) t.causes.push(text);
  }

  function collectFx(m, setup) {
    const fx = [], D = defs();
    (setup.nodes || []).forEach((id) => fx.push({ id, pid: null }));
    const TR = (SD.data && SD.data.TRAITS) || null;
    const pitch = [setup.keeper].concat(setup.outfield || []), bench = setup.bench || [];
    pitch.concat(bench).forEach((P) => {
      if (!P) return;
      if ((P.level || 1) >= 2) {
        const role = P === setup.keeper ? 'Keeper' : P.role;
        const tid = TR && TR[role] ? TR[role].id : TRAIT_IDS[role];
        if (tid) fx.push({ id: tid, pid: P.id });
      }
      if (P.sig && P.sig.id) fx.push({ id: P.sig.id, pid: P.id });
    });
    return fx.filter((i) => !(m.T.fxOff && m.T.fxOff[i.id] === true));
  }

  // ------------------------------------------------------------------
  // deck helpers
  // ------------------------------------------------------------------
  function drawTo(m, n) {
    if (n == null) n = m.handSize;
    while (m.hand.length < n) {
      if (!m.deck.length) {
        if (!m.discard.length) break;
        m.deck = m.rng.deck.shuffle(m.discard); m.discard = [];
      }
      m.hand.push(m.deck.pop());
    }
  }
  function discardHand(m) { while (m.hand.length) m.discard.push(m.hand.shift()); }
  function playCard(m, pid, side) {
    const hi = m.hand.indexOf(pid);
    if (hi >= 0) m.hand.splice(hi, 1);
    else { // pulled from deck or discard (Sweep Across)
      let i = m.deck.indexOf(pid);
      if (i >= 0) m.deck.splice(i, 1); else { i = m.discard.indexOf(pid); if (i >= 0) m.discard.splice(i, 1); }
    }
    m.discard.push(pid);
    drawTo(m, m.handSize);
    run(m, 'onPlay', { pid, side: side || 'me' });
  }

  // ------------------------------------------------------------------
  // newMatch / turn flow
  // ------------------------------------------------------------------
  function newMatch(setup) {
    const T = Object.assign({}, DEF_T, (SD.data && SD.data.TWEAK_DEFAULTS) || {}, setup.T || {});
    const cards = {};
    setup.outfield.concat(setup.bench).forEach((P) => { cards[P.id] = P; });
    const seed = setup.seed >>> 0;
    const mode = setup.mode || 'home';
    const homeSide = setup.homeSide || (mode === 'neutral' ? 'none' : mode === 'away' ? 'opp' : 'me');
    const m = {
      seed, setup, club: setup.club, cs: C.stats(setup.club, T), T, half: 1, turn: 1, turnNo: 1,
      holder: homeSide === 'opp' ? 'opp' : 'me', zone: 1, score: { me: 0, opp: 0 }, crowd: 0, roarReady: false, build: { me: 0, opp: 0 },
      mode, homeSide, cup: !!setup.cup, roar: null, roarClub: !!(homeSide === 'opp' || (setup.club && setup.club.roar)), onceHalf: {},
      deck: [], hand: [], discard: [], handSize: T.handSize, cards, keeper: setup.keeper,
      fx: [], once: {}, flags: {}, log: [], phase: 'attack', played: false, formation: setup.formation,
      rng: { main: makeRng(seed), deck: makeRng((seed ^ 0xA5A5A5A5) >>> 0), fxr: makeRng((seed ^ 0x5EED5EED) >>> 0) },
      stats: {}, lastAssist: null, turnFx: null, roll: null };
    m.kick1 = m.holder;
    m.fx = collectFx(m, setup);
    const hs = { size: T.handSize }; run(m, 'handSize', hs); m.handSize = hs.size;
    m.deck = m.rng.deck.shuffle(setup.outfield.map((p) => p.id).concat(setup.bench.map((p) => p.id)));
    drawTo(m, m.handSize);
    [setup.keeper].concat(setup.outfield, setup.bench).forEach((P) => { m.stats[P.id] = { duelsWon: 0, goals: 0, assists: 0, saves: 0 }; });
    beginTurn(m);
    return m;
  }
  function beginTurn(m) {
    const R = m.rng.main;
    m.roll = { ua: R.next(), us: R.next(), da: R.d6(), db: R.d6() };
    m.turnFx = { fired: [], causes: [], tieBy: null };
    if (m.flags.keptNote) { m.turnFx.causes.push(m.flags.keptNote); m.turnFx.keptTag = m.flags.keptNote; if (m.turnFx.fired.indexOf('A2') < 0) m.turnFx.fired.push('A2'); m.flags.keptNote = null; }
    m.played = false; m.flags.extraShoot = false;
    m.phase = m.holder === 'me' ? 'attack' : 'defend';
    if (m.phase === 'defend') m._clubAct = null;
  }
  const trailing = (m) => m.score.opp < m.score.me;
  function clubAction(m) {
    const w = C.weights(m.club, m.zone, trailing(m), m.T);
    return { w, act: C.pick(w, m.roll.ua) };
  }
  function clubStance(m) { return C.stance(C.pressChance(m.club, m.zone, m.T), m.roll.us); }

  function legal(m, pid) {
    const actions = m.zone < 2 ? ['pass', 'dribble', 'through'] : ['pass', 'shoot'];
    const ctx = { pid, zone: m.zone, actions };
    run(m, 'legal', ctx);
    if (m.flags.extraShoot) return ctx.actions.indexOf('shoot') >= 0 ? ['shoot'] : [];
    return ctx.actions;
  }
  function attackCards(m, preview) {
    if (m.flags.extraShoot) return m.hand.slice();   // Twin Run: a hand card only
    const ctx = { cards: m.hand.slice(), preview: preview !== false };
    run(m, 'attackCards', ctx);
    return ctx.cards;
  }

  function tell(m) {
    const ctx = { exact: null, clubPick: null, pressW: null, peek: { stance: null, clubAction: null }, preview: true, tags: [], tag: null };
    let out;
    if (m.holder === 'me') {
      const d = C.defender(m.club, m.zone);
      ctx.pressW = C.pressChance(m.club, m.zone, m.T);
      ctx.peek.stance = clubStance(m);
      run(m, 'tell', ctx);
      out = { defender: { name: d.name, zone: d.zone, press: d.press }, pressW: ctx.pressW, exact: ctx.exact, clubPick: null, clubW: null,
        text: C.tellText(m.club, m.zone, m.T) };
      if (ctx.exact) out.text += ' | ' + cap1(ctx.exact) + ' this turn';
    } else {
      const ca = clubAction(m);
      ctx.peek.clubAction = ca.act;
      run(m, 'tell', ctx);
      out = { defender: null, pressW: null, exact: null, clubPick: ctx.clubPick, clubW: ca.w,
        text: C.attackTell(m.club, m.zone, trailing(m), m.T) };
      if (ctx.clubPick) out.text += ' | Pick: ' + ACT_NAME[ctx.clubPick];
    }
    out.tags = ctx.tags.slice(); if (ctx.tag && out.tags.indexOf(ctx.tag) < 0) out.tags.push(ctx.tag);
    return out;
  }

  // ------------------------------------------------------------------
  // score building
  // ------------------------------------------------------------------
  function attackParts(m, P, action) {
    const T = m.T, parts = [{ k: P.name + ' ' + STAT_LABEL[action], v: P[STAT_KEY[action]] }];
    const bon = [];
    const role = ((action === 'pass' || action === 'through') && P.role === 'Playmaker') || (action === 'dribble' && P.role === 'Winger') ||
      (action === 'shoot' && P.role === 'Striker') ? 1 : 0;
    if (role) bon.push({ k: P.role, v: 1 });
    const fa = (FORM[m.formation] || FORM.Wall).att[action] || 0;
    if (fa) bon.push({ k: m.formation, v: fa });
    if (action === 'pass') bon.push({ k: 'Pass', v: T.passBonus });
    else if (m.build.me) bon.push({ k: 'Build', v: m.build.me });
    if (m.roar === 'me') bon.push({ k: 'Roar', v: 1 });
    const sum = bon.reduce((a, b) => a + b.v, 0), used = Math.min(T.cap, sum);
    bon.forEach((b) => parts.push(b));
    let capNote = null;
    if (sum > T.cap) { parts.push({ k: 'Cap', v: T.cap - sum }); capNote = 'cap +' + T.cap; }
    return { parts, capNote, myScore: P[STAT_KEY[action]] + used, bonus: used };
  }
  function oppDefParts(m, action) {
    const cr = m.roar === 'opp' ? 1 : 0;
    if (action === 'shoot') {
      const parts = [{ k: m.club.keeper.name + ' save', v: m.cs.keeper }]; if (cr) parts.push({ k: 'Roar', v: 1 });
      return { oppParts: parts, oppScore: m.cs.keeper + cr, oppName: m.club.keeper.name };
    }
    const d = C.defender(m.club, m.zone);
    const parts = [{ k: d.name + ' DEF', v: m.cs.def }]; if (cr) parts.push({ k: 'Roar', v: 1 });
    return { oppParts: parts, oppScore: m.cs.def + cr, oppName: d.name };
  }
  function nodeChips(m) {
    const out = [], D = defs();
    if (m.turnFx && m.turnFx.keptTag) out.push(m.turnFx.keptTag);
    m.fx.forEach((inst) => {
      const d = D[inst.id]; if (!d || d.kind !== 'node' || !d.short) return;
      if (d.active) { if (!m.played && d.active.can(m, inst)) out.push(d.short); }
      else if (d.hooks && d.hooks.handSize) out.push(d.short);
    });
    return out;
  }

  function previewAttack(m, pid, action) {
    const P = m.cards[pid], T = m.T;
    const ap = attackParts(m, P, action), od = oppDefParts(m, action);
    const tl = tell(m);
    const pre = { side: 'me', pid, action, stance: tl.exact || undefined, ignorePress: false, tieAtt: false, preview: true, tags: [] };
    run(m, 'preRoll', pre);
    const gap = ap.myScore - od.oppScore;
    const chip = O.attackChip(gap, action, tl.pressW, { exactStance: tl.exact || undefined, tieAtt: pre.tieAtt, ignorePress: pre.ignorePress, dieN: T.die });
    const tags = nodeChips(m).concat(tl.tags, pre.tags);
    if (tl.exact && !tags.length) tags.push(cap1(tl.exact));
    return { parts: ap.parts, capNote: ap.capNote, myScore: ap.myScore, oppParts: od.oppParts, oppScore: od.oppScore, gap, chip, tags };
  }

  function defendRowInfo(m, P, action, stance, real) {
    const T = m.T, parts = [];
    let myDef;
    if (action === 'shoot') {
      parts.push({ k: m.keeper.name + ' DEF', v: m.keeper.def });
      myDef = m.keeper.def;
    } else {
      parts.push({ k: P.name + ' DEF', v: P.def }); myDef = P.def;
      if (P.role === 'Anchor') { parts.push({ k: 'Anchor', v: 1 }); myDef += 1; }
      const fc = (FORM[m.formation] || FORM.Wall).defVs[action];
      if (fc) { parts.push({ k: m.formation, v: T.formCounter }); myDef += T.formCounter; }
    }
    if (m.roar === 'me') { parts.push({ k: 'Roar', v: 1 }); myDef += 1; }
    const clubScore = m.cs.atk + Math.min(T.cap, (action === 'pass' ? T.passBonus : m.build.opp) + (m.roar === 'opp' ? 1 : 0));
    const dm = { action, stance, mod: O.stanceMod(action, stance), preview: !real, tags: [] };
    run(m, 'defStance', dm);
    const gap = clubScore - myDef + dm.mod;
    return { parts, myDef, clubScore, gap, mod: dm.mod, tags: dm.tags };
  }
  function clubAtkParts(m, action, build, roar) {
    const T = m.T, parts = [{ k: m.club.label + ' ATK', v: m.cs.atk }];
    const b = action === 'pass' ? T.passBonus : build, r = roar ? 1 : 0;
    if (b) parts.push({ k: action === 'pass' ? 'Pass' : 'Build', v: b });
    if (r) parts.push({ k: 'Roar', v: 1 });
    if (b + r > T.cap) parts.push({ k: 'Cap', v: T.cap - b - r });
    return parts;
  }

  function defendCards(m, preview) {
    const ctx = { cards: m.hand.slice(), preview: preview !== false };
    run(m, 'defendCards', ctx);
    return ctx.cards;
  }

  function previewDefend(m, pid, stance) {
    const P = m.cards[pid], w = clubAction(m).w;
    const rows = [];
    ACTIONS.forEach((a) => {
      if (!(w[a] > 0)) return;
      const r = defendRowInfo(m, P, a, stance);
      rows.push({ action: a, w: w[a], gap: r.gap, myDef: r.myDef, parts: r.parts, tags: r.tags });
    });
    const dc = O.defendChip(rows.map((r) => ({ action: r.action, w: r.w, gap: r.gap })), { dieN: m.T.die });
    rows.forEach((r) => { r.p = dc.byAction && dc.byAction[r.action] != null ? dc.byAction[r.action] : 1 - O.duel(r.gap, false, m.T.die); });
    const top = rows.slice().sort((a, b) => b.w - a.w)[0];
    const tl = tell(m);
    const dtags = []; rows.forEach((r) => (r.tags || []).forEach((t) => { if (dtags.indexOf(t) < 0) dtags.push(t); }));
    return { rows, chip: { p: dc.p }, myDef: top ? top.myDef : 0, parts: top ? top.parts : [], tags: nodeChips(m).concat(tl.tags, dtags) };
  }

  // ------------------------------------------------------------------
  // resolve one duel (shared by attack and defence)
  // ------------------------------------------------------------------
  function mkReroll(m, ctx) {
    ctx.reroll = function (who) {
      const from = who === 'att' ? ctx.da : ctx.db, to = m.rng.fxr.d6();
      if (who === 'att') ctx.da = to; else ctx.db = to;
      m.turnFx.rerolls.push({ who, from, to, by: m._cur ? m._cur.id : null });
      return to;
    };
    ctx.recompute = function () {
      ctx.tie = ctx.gap + ctx.da - ctx.db === 0 && !((ctx.da === m.T.die && ctx.db === 1) || (ctx.da === 1 && ctx.db === m.T.die));
      ctx.win = O.attWins(ctx.gap, ctx.da, ctx.db, ctx.tieAtt, m.T.die);
      return ctx.win;
    };
  }

  function finish(m, side, pid, action, win, extra) {
    // applies outcome. side = attacker. returns {goal, after}
    const T = m.T, next = { holder: m.holder, zone: m.zone, build: { me: m.build.me, opp: m.build.opp } };
    let goal = null;
    if (win) {
      if (action === 'shoot') { goal = side; next.build = { me: 0, opp: 0 }; next.holder = other(side); next.zone = 1; }
      else if (action === 'pass') next.build[side] = Math.min(T.buildMax, m.build[side] + 1);
      else { next.zone = Math.min(2, m.zone + 1); next.build[side] = 0; }
    } else { next.holder = other(side); next.zone = action === 'shoot' ? 0 : 1; next.build = { me: 0, opp: 0 }; }
    const ctx = { side, pid, action, win, next, extraDraw: 0, preview: false, keepBall: false, keepTurn: false, extraShoot: false };
    run(m, 'after', ctx);
    const nx = ctx.next;
    // Hold Up: my lost attack in Defence/Midfield keeps the ball in that zone. Idempotent with hooks that wrote next directly.
    if (side === 'me' && !win && action !== 'shoot' && ctx.keepBall) { nx.holder = 'me'; nx.zone = m.zone; }
    // Follow Up: my Shoot saved, I keep the ball in Attack
    if (side === 'me' && !win && action === 'shoot' && ctx.keepTurn) { nx.holder = 'me'; nx.zone = 2; }
    // Quick Throw: after my keeper saves, my ball starts in the zone the hook names (default Defence)
    if (side === 'opp' && !win && action === 'shoot') {
      const sz = { zone: 0, startZone: null, preview: false }; run(m, 'saveZone', sz);
      const z = typeof sz.startZone === 'number' ? sz.startZone : sz.zone;
      if (typeof z === 'number') nx.zone = Math.max(0, Math.min(2, z));
    }
    return { goal, ctx, next: nx };
  }

  function resolve(m, o) {
    // o: {side, pid, action, gap, tieAtt, card(pid played or null), myScoreParts..., }
    const T = m.T, R = m.roll;
    const ctx = { side: o.side, pid: o.pid, action: o.action, da: R.da, db: R.db, gap: o.gap, tieAtt: !!o.tieAtt, win: false, tie: false, preview: false };
    m.turnFx.rerolls = [];
    mkReroll(m, ctx);
    ctx.recompute();
    const baseWin = ctx.win;
    run(m, 'roll', ctx);
    const win = !!ctx.win;
    return { win, da: ctx.da, db: ctx.db, daOrig: R.da, dbOrig: R.db, tieAtt: ctx.tieAtt, baseWin };
  }

  function crowdStep(m, meWon) {
    const T = m.T;
    m.roar = null; m.roarReady = false;
    if (m.homeSide === 'none') return;   // neutral ground: no crowd for either side
    const homeWon = m.homeSide === 'me' ? meWon : !meWon;
    m.crowd = homeWon ? Math.min(T.roarAt, m.crowd + 1) : Math.max(0, m.crowd - 1);
    if (m.crowd >= T.roarAt) { m.roar = m.homeSide; m.roarReady = m.roar === 'me'; m.crowd = 0; }
  }

  function outcomeText(m, side, action, win, next, goal) {
    if (goal) return 'GOAL for ' + (goal === 'me' ? 'Preston' : m.club.label);
    if (action === 'shoot') return win ? 'goal' : 'saved';
    if (win) {
      if (action === 'pass') return 'Build ' + next.build[side];
      return 'to ' + ZONE_NAME[next.zone];
    }
    return 'ball lost';
  }

  function applyNext(m, next, extraDraw) {
    // Keep the Thread: Build kept by a lost attack survives the club's possession and returns when I next hold the ball
    if (m.holder === 'me' && next.holder === 'opp' && next.build.me > 0) { m.flags.keptBuild = next.build.me; next.build.me = 0; }
    else if (m.holder === 'opp' && next.holder === 'me' && m.flags.keptBuild > 0) {
      next.build.me = Math.max(next.build.me, m.flags.keptBuild); m.flags.keptNote = 'Keep the Thread: Build kept (' + m.flags.keptBuild + ')'; m.flags.keptBuild = 0;
    }
    m.holder = next.holder; m.zone = next.zone; m.build = { me: next.build.me, opp: next.build.opp };
    if (extraDraw > 0) drawTo(m, m.hand.length + extraDraw);
  }

  function baseEvent(m, side) {
    return { turnNo: m.turnNo, half: m.half, turn: m.turn, side, zone: m.zone, hand: m.hand.slice(), deck: m.deck.length, discard: m.discard.length };
  }

  function playAttack(m, pid, action) {
    if (m.phase !== 'attack' || m.played || attackCards(m, false).indexOf(pid) < 0) return null;
    if (legal(m, pid).indexOf(action) < 0) return null;
    const P = m.cards[pid], T = m.T, R = m.roll;
    const ev = baseEvent(m, 'me');
    const wasExtra = !!m.flags.extraShoot;
    if (wasExtra) { m.flags.extraShoot = false; ev.extra = true; }
    const ap = attackParts(m, P, action), od = oppDefParts(m, action);
    const tl = tell(m);
    const pw = tl.pressW;
    const stance = clubStance(m);
    // odds shown (before fx that were spent)
    const pre0 = { side: 'me', pid, action, stance: tl.exact || undefined, ignorePress: false, tieAtt: false, preview: true, tags: [] };
    run(m, 'preRoll', pre0);
    const chip0 = O.attackChip(ap.myScore - od.oppScore, action, pw, { exactStance: tl.exact || undefined, tieAtt: pre0.tieAtt, ignorePress: pre0.ignorePress, dieN: T.die });
    const pre = { side: 'me', pid, action, stance, ignorePress: false, tieAtt: false, preview: false, tags: [] };
    run(m, 'preRoll', pre);
    let mod = O.stanceMod(action, stance);
    if (pre.ignorePress && stance === 'press' && mod < 0) mod = 0;
    const gap = ap.myScore - od.oppScore + mod;
    const r = resolve(m, { side: 'me', pid, action, gap, tieAtt: pre.tieAtt });
    const win = r.win;
    const meWon = win;
    // stats
    const st = m.stats[pid];
    if (win) { st.duelsWon++; }
    let goal = null;
    const fin = finish(m, 'me', pid, action, win);
    goal = fin.goal;
    playCard(m, pid, 'me');
    if (goal === 'me') {
      st.goals++; m.score.me++;
      if (m.lastAssist && m.lastAssist !== pid) m.stats[m.lastAssist].assists++;
    }
    if (win && action !== 'shoot' && (action === 'pass' || action === 'through')) m.lastAssist = pid;
    if (!win || goal || fin.next.holder !== 'me') m.lastAssist = null;
    applyNext(m, fin.next, fin.ctx.extraDraw);
    crowdStep(m, meWon);
    const mySum = ap.myScore + 0, oppTot = od.oppScore + r.db - mod * 0;
    const bonus = ap.bonus, st1 = P[STAT_KEY[action]];
    const fx = m.turnFx;
    const dMy = r.da, dOp = r.db;
    const modTxt = mod ? ' ' + sgn(mod) + ' ' + cap1(stance) : (pre.ignorePress && stance === 'press' ? ' (Press ignored)' : '');
    let cause = P.name + ' ' + ACT_NAME[action] + ' ' + st1 + sgn(bonus) + modTxt + ' +d' + dMy + ' = ' + (mySum + mod + dMy) +
      ' v ' + od.oppName + ' ' + od.oppScore + ' +d' + dOp + ' = ' + (od.oppScore + dOp) + ': ' + (win ? 'won' : 'lost');
    if ((dMy === T.die && dOp === 1) || (dMy === 1 && dOp === T.die)) cause += ' (natural ' + dMy + ' v ' + dOp + ')';
    cause += ', ' + outcomeText(m, 'me', action, win, fin.next, goal);
    if (fx.causes.length) cause += '. ' + fx.causes.join('; ');
    Object.assign(ev, { pid, action, stance, parts: ap.parts, oppParts: od.oppParts, myScore: ap.myScore, oppScore: od.oppScore, gap,
      chip: { p: chip0.p, pPress: chip0.pPress, pDrop: chip0.pDrop, pressW: chip0.pressW }, dice: { att: r.da, def: r.db },
      rerolls: fx.rerolls.slice(), tieBy: fx.tieBy, win, meWon, goal, save: action === 'shoot' && !win, cause,
      tags: nodeChips(m).concat(tl.tags, pre0.tags), fxFired: fx.fired.slice(), score: { me: m.score.me, opp: m.score.opp },
      after: { holder: m.holder, zone: m.zone, build: { me: m.build.me, opp: m.build.opp } }, club: m.club.id, clubStance: stance,
      capNote: ap.capNote, formation: m.formation, handNames: ev.hand.map((id) => m.cards[id].name) });
    m.played = true; m.log.push(ev);
    // Twin Run: after a won Dribble the turn goes on; the next play must be a hand card as Shoot, no turn spent
    if (win && action === 'dribble' && fin.ctx.extraShoot && !wasExtra && m.zone === 2 && m.holder === 'me' && m.hand.length) {
      const X = m.rng.fxr;
      m.roll = { ua: X.next(), us: X.next(), da: X.d6(), db: X.d6() };
      m.turnFx = { fired: [], causes: [], tieBy: null };
      m.flags.extraShoot = true; m.played = false; ev.extraNext = true;
    }
    return ev;
  }

  function playDefend(m, pid, stance) {
    if (m.phase !== 'defend' || m.played) return null;
    const ca = clubAction(m), action = ca.act;
    const cardsOk = defendCards(m, false);
    const usesCard = action !== 'shoot';
    if (usesCard && (cardsOk.indexOf(pid) < 0 || !m.cards[pid])) return null;
    if (stance !== 'press' && stance !== 'drop') return null;
    const P = usesCard ? m.cards[pid] : null, T = m.T, R = m.roll;
    const ev = baseEvent(m, 'opp');
    const tl = tell(m);
    // odds shown to me (all-actions weighted), as previewDefend did
    let chipP = null;
    if (usesCard) chipP = previewDefend(m, pid, stance).chip.p;
    else chipP = 1 - O.duel(defendRowInfo(m, null, 'shoot', stance).gap, false, T.die);
    const info = defendRowInfo(m, P, action, stance, true);
    const r = resolve(m, { side: 'opp', pid: usesCard ? pid : null, action, gap: info.gap, tieAtt: false });
    const clubWin = r.win, meWon = !clubWin;
    let goal = null, save = false;
    const fin = finish(m, 'opp', usesCard ? pid : null, action, clubWin);
    goal = fin.goal;
    if (usesCard) { if (meWon) m.stats[pid].duelsWon++; playCard(m, pid, 'opp'); }
    if (action === 'shoot') {
      if (goal) m.score.opp++; else { save = true; m.stats[m.keeper.id].saves++; }
    }
    m.lastAssist = null;
    applyNext(m, fin.next, fin.ctx.extraDraw);
    crowdStep(m, meWon);
    const fx = m.turnFx;
    const holderName = usesCard ? P.name : m.keeper.name;
    const modTxt = info.mod ? ' ' + sgn(info.mod) + ' my ' + cap1(stance) : '';
    let cause = m.club.label + ' ' + ACT_NAME[action] + ' ' + info.clubScore + modTxt + ' +d' + r.da + ' = ' + (info.clubScore + info.mod + r.da) +
      ' v ' + holderName + ' ' + info.myDef + ' +d' + r.db + ' = ' + (info.myDef + r.db) + ': ' + (clubWin ? m.club.label + ' won' : 'I held') +
      ', ' + (goal ? 'GOAL against' : action === 'shoot' ? 'saved' : clubWin ? (action === 'pass' ? 'Build ' + fin.next.build.opp : 'to ' + ZONE_NAME[fin.next.zone]) : 'ball won');
    if ((r.da === T.die && r.db === 1) || (r.da === 1 && r.db === T.die)) cause += ' (natural ' + r.da + ' v ' + r.db + ')';
    if (fx.causes.length) cause += '. ' + fx.causes.join('; ');
    Object.assign(ev, { pid: usesCard ? pid : null, action, stance, parts: info.parts, oppParts: [],
      myScore: info.myDef, oppScore: info.clubScore, gap: info.gap, chip: { p: chipP }, dice: { att: r.da, def: r.db },
      rerolls: fx.rerolls.slice(), tieBy: fx.tieBy, win: clubWin, meWon, goal, save, cause,
      tags: nodeChips(m).concat(tl.tags), fxFired: fx.fired.slice(), score: { me: m.score.me, opp: m.score.opp },
      after: { holder: m.holder, zone: m.zone, build: { me: m.build.me, opp: m.build.opp } }, club: m.club.id,
      formation: m.formation, handNames: ev.hand.map((id) => m.cards[id].name) });
    m.played = true; m.log.push(ev);
    return ev;
  }
  // note: clubAtkParts reads m.build.opp AFTER the turn; fix by computing before applying. (handled in wrapper below)

  function nextPhase(m) {
    if (!m.played) return m.phase;
    if (m.phase === 'halftime' || m.phase === 'full') return m.phase;
    if (m.turn >= m.T.halfTurns) {
      m.phase = m.half === 1 ? 'halftime' : 'full';
      m.played = false;
      return m.phase;
    }
    m.turn++; m.turnNo++;
    beginTurn(m);
    return m.phase;
  }
  function startHalf2(m) {
    if (m.phase !== 'halftime') return m.phase;
    m.half = 2; m.turn = 1; m.turnNo = m.T.halfTurns + 1;
    m.holder = other(m.kick1 || 'me'); m.zone = 1; m.build = { me: 0, opp: 0 }; m.lastAssist = null; m.flags.keptBuild = 0;
    m.onceHalf = {};
    beginTurn(m);
    run(m, 'halfTime', { preview: false });
    return m.phase;
  }

  function actives(m) {
    const out = [], D = defs();
    m.fx.forEach((inst) => {
      const d = D[inst.id];
      if (!d || !d.active) return;
      if (m.T.fxOff && m.T.fxOff[inst.id] === true) return;
      let can = false;
      try { can = (m.phase === 'attack' || m.phase === 'defend') && !m.played && !!d.active.can(m, inst); } catch (e) { can = false; }
      out.push({ id: inst.id, label: d.active.label || d.name, can });
    });
    return out;
  }
  function use(m, fxId) {
    const D = defs();
    for (let i = 0; i < m.fx.length; i++) {
      const inst = m.fx[i];
      if (inst.id !== fxId) continue;
      const d = D[fxId];
      if (!d || !d.active || m.played || !(m.phase === 'attack' || m.phase === 'defend') || !d.active.can(m, inst)) return false;
      m._cur = inst; d.active.use(m, inst); m._cur = null;
      return true;
    }
    return false;
  }

  // Second Look (A3, admin default): once spent this turn, the club's real stance is shown (no duel rng moved), so the pick can be redone.
  function secondLookPeek(m) {
    if (m.phase !== 'attack' || !m.flags || m.flags.secondLookTurn !== m.turnNo) return null;
    return { stance: clubStance(m), turnNo: m.turnNo };
  }
  function summary(m) {
    const fired = [];
    m.log.forEach((e) => (e.fxFired || []).forEach((id) => { if (fired.indexOf(id) < 0) fired.push(id); }));
    const s = m.score;
    return { matchNo: m.setup.matchNo, club: m.club.id, score: { me: s.me, opp: s.opp }, res: s.me > s.opp ? 'W' : s.me < s.opp ? 'L' : 'D',
      stats: JSON.parse(JSON.stringify(m.stats)), fxUsed: fired,
      mode: m.mode, cup: m.cup, level: s.me === s.opp, season: m.setup.season, md: m.setup.md };
  }

  // Event oppParts for defence must use the build BEFORE the turn: wrap playDefend.
  const _playDefend = playDefend;
  function playDefendW(m, pid, stance) {
    const bOpp = m.build.opp, rOpp = m.roar === 'opp', ca = m.phase === 'defend' && !m.played ? clubAction(m).act : null;
    const ev = _playDefend(m, pid, stance);
    if (ev && ca) {
      ev.oppParts = clubAtkParts(m, ca, bOpp, rOpp);
    }
    return ev;
  }

  SD.engine = { newMatch, legal, tell, previewAttack, previewDefend, playAttack, playDefend: playDefendW, nextPhase, startHalf2,
    actives, use, summary, drawTo, discardHand, playCard, onceUsed, markOnce, onceHalfUsed, markOnceHalf, fire, defendCards, attackCards, secondLookPeek, run };

  // ------------------------------------------------------------------
  // Self-test (Node: `node engine.js`)
  // ------------------------------------------------------------------
  if (typeof module !== 'undefined' && typeof require !== 'undefined' && require.main === module) selfTest();

  function selfTest() {
    const assert = require('assert'), path = require('path');
    ['rng', 'data', 'odds', 'club-ai', 'fx-nodes', 'fx-players'].forEach((f) => { try { require(path.join(__dirname, f + '.js')); } catch (e) { console.log('skip ' + f + ': ' + e.message); } });
    const have = ['rng', 'data', 'odds', 'clubAI'].map((k) => k + ':' + !!SD[k]).join(' ');
    console.log('modules', have, 'fxDefs', Object.keys(SD.fxDefs || {}).length);
    const E = SD.engine;
    const K = (id, name, role, pac, pas, sho, def, level) => ({ id, name, role, rarity: 'Common', pac, pas, sho, def, level: level || 1, sig: null });
    const CL = (SD.data && SD.data.CLUBS) || {
      grimsby: { id: 'grimsby', name: 'Iron Grimsby', label: 'GRIMSBY', def: 4, keeper: { name: 'Garrick', def: 7 }, atk: 7, weights: { pass: .3, dribble: .5, through: .2 }, offPress: .3,
        defenders: [{ name: 'Brogan', zone: 0, press: .3 }, { name: 'Dunmar', zone: 1, press: .6 }, { name: 'Corwin', zone: 2, press: .2 }] } };
    const mk = (seed, form, extra) => Object.assign({ seed, matchNo: 1, club: CL.grimsby, formation: form || 'Wall',
      keeper: K('ondra', 'Ondra', 'Keeper', 3, 3, 1, 6),
      outfield: [K('kessan', 'Kessan', 'Anchor', 3, 3, 2, 6), K('mirelle', 'Mirelle', 'Playmaker', 4, 6, 4, 3), K('pip', 'Pip', 'Winger', 6, 4, 3, 3), K('tavo', 'Tavo', 'Striker', 4, 3, 6, 2)],
      bench: [K('barro', 'Barro', 'Anchor', 3, 4, 2, 5), K('sunniva', 'Sunniva', 'Winger', 5, 5, 3, 4)], nodes: [], T: {} }, extra || {});
    // scripted policy: pure function of (hand, zone, turnNo, legal)
    const polA = (hand, zone, turnNo, lg) => ({ ci: 0, a: lg[(zone + turnNo) % lg.length] });
    const polD = (hand, zone, turnNo) => ({ ci: 0, st: turnNo % 2 ? 'press' : 'drop' });
    function playEngine(setup, record) {
      const m = E.newMatch(setup); let guard = 0;
      for (;;) {
        if (++guard > 100) throw new Error('loop');
        if (m.phase === 'halftime') { E.startHalf2(m); continue; }
        if (m.phase === 'full') break;
        if (m.phase === 'attack') { const lg = E.legal(m, m.hand[0]); const p = polA(m.hand, m.zone, m.turnNo, lg); E.playAttack(m, m.hand[p.ci], p.a); }
        else { const p = polD(m.hand, m.zone, m.turnNo); const cs = E.defendCards(m); const pid = m.hand[p.ci]; if (!E.playDefend(m, pid, p.st)) throw new Error('def fail'); }
        E.nextPhase(m);
      }
      return m;
    }
    // ---- inline match5 clone (RULE5.H2, no mark), Grimsby, Wall, no fx ----
    const FB = { Wall: { att: [0, 0, 0, 0], def: [0, 3, 0, 0] } };
    function match5(setup) {
      const seed = setup.seed, r = mulberry(seed), rK = mulberry((seed ^ 0xA5A5A5A5) >>> 0);
      const sh = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rK() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
      const cs = [...setup.outfield, ...setup.bench]; let deck = sh(cs.slice()), hand = [deck.pop(), deck.pop(), deck.pop()], disc = [];
      const play = (c) => { hand.splice(hand.indexOf(c), 1); disc.push(c); if (!deck.length) { deck = sh(disc); disc = []; } hand.push(deck.pop()); };
      const cl = { def: 4, gk: 7, atk: 7, att: [.3, .5, .2], press: [.3, .6, .2] };
      const goals = [0, 0], build = [0, 0]; let holder = 0, zone = 1, crowd = 0, roar = 0;
      const A = ['pass', 'dribble', 'through', 'shoot'];
      const sm = (a, s) => (a === 1 ? (s === 0 ? -1 : 1) : a === 2 ? (s === 0 ? 1 : -1) : 0);
      const aw = (g, a, b) => (a === 6 && b === 1 ? true : a === 1 && b === 6 ? false : g + a - b > 0);
      for (let hf = 0; hf < 2; hf++) {
        if (hf) { holder = 1; zone = 1; build[0] = build[1] = 0; }
        for (let t = 0; t < 6; t++) {
          const turnNo = hf * 6 + t + 1, h = holder;
          const ua = r(), us = r(), da = 1 + Math.floor(r() * 6), db = 1 + Math.floor(r() * 6);
          let win, act, used;
          if (h === 0) {
            const lg = zone < 2 ? [0, 1, 2] : [0, 3];
            const c = hand[0]; act = lg[(zone + turnNo) % lg.length]; used = c;
            const stat = act === 3 ? c.sho : act === 1 ? c.pac : c.pas;
            const rb = ((act === 0 || act === 2) && c.role === 'Playmaker') || (act === 1 && c.role === 'Winger') || (act === 3 && c.role === 'Striker') ? 1 : 0;
            const b = rb + (act === 0 ? 0 : build[0]) + roar + (act === 0 ? 2 : 0);
            const gap = stat + Math.min(3, b) - (act === 3 ? cl.gk : cl.def);
            const stance = us < cl.press[zone] ? 0 : 1;
            win = aw(gap + sm(act, stance), da, db);
          } else {
            let wp = cl.att[0], wd = cl.att[1], wt = cl.att[2];
            if (goals[1] < goals[0]) { wd += .1; wt += .1; wp = Math.max(0, wp - .2); }
            const s = wp + wd + wt; wp /= s; wd /= s; wt /= s;
            const w = zone < 2 ? [wp, wd, wt, 0] : [wp, 0, 0, 1 - wp];
            let acc = 0; act = 0; for (let a = 0; a < 4; a++) { acc += w[a]; if (ua < acc) { act = a; break; } act = a; }
            if (w[act] === 0) act = w[3] > 0 ? 3 : 0;
            const c = hand[0], st = turnNo % 2 ? 0 : 1;
            used = act === 3 ? null : c;
            const myDef = act === 3 ? 6 + roar : c.def + (c.role === 'Anchor' ? 1 : 0) + roar + (act === 1 ? 3 : 0);
            const gap = cl.atk + Math.min(3, act === 0 ? 2 : build[1]) - myDef + sm(act, st);
            win = aw(gap, da, db);
          }
          if (used) play(used);
          const meWon = h === 0 ? win : !win;
          roar = 0; crowd = meWon ? Math.min(3, crowd + 1) : Math.max(0, crowd - 1); if (crowd >= 3) { roar = 1; crowd = 0; }
          if (win) { if (act === 3) { goals[h]++; build[0] = build[1] = 0; holder = 1 - h; zone = 1; } else if (act === 0) build[h] = Math.min(2, build[h] + 1); else { zone++; build[h] = 0; } }
          else { holder = 1 - h; zone = act === 3 ? 0 : 1; build[0] = build[1] = 0; }
        }
      }
      return goals;
    }
    const withFxOff = (o) => Object.assign(o, { T: { fxOff: { T_PLAYMAKER: true, T_WINGER: true, T_STRIKER: true, T_ANCHOR: true, T_KEEPER: true } } });
    // (1) replay
    const a1 = playEngine(mk(777)), a2 = playEngine(mk(777));
    assert.deepStrictEqual(a1.log.map((e) => e.cause), a2.log.map((e) => e.cause));
    assert.strictEqual(a1.log.length, 12);
    console.log('replay OK; sample:', a1.log[0].cause, '|', a1.log[1].cause);
    // (2) parity
    let ge = [0, 0], gc = [0, 0], mism = 0;
    for (let s = 1; s <= 300; s++) {
      const setup = mk(s * 7919 + 13); const mm = playEngine(setup); const c = match5(setup);
      ge[0] += mm.score.me; ge[1] += mm.score.opp; gc[0] += c[0]; gc[1] += c[1];
      if (mm.score.me !== c[0] || mm.score.opp !== c[1]) mism++;
    }
    console.log('parity goals engine', ge, 'clone', gc, 'per-seed mismatches', mism);
    assert.deepStrictEqual(ge, gc); assert.strictEqual(mism, 0);
    // (3) fx hooks get called (stub defs, independent of fx files)
    const saved = SD.fxDefs; const calls = {};
    SD.fxDefs = {};
    ['handSize', 'legal', 'tell', 'preRoll', 'roll', 'after', 'defendCards', 'onPlay'].forEach((h) => { calls[h] = 0; });
    SD.fxDefs.STUB = { id: 'STUB', kind: 'node', name: 'Stub', short: 'stub', hooks: {}, active: { label: 'Stub', can: () => true, use(m, i) { m.flags.stub = 1; E.fire(m, {}, i, 'Stub: used'); } } };
    Object.keys(calls).forEach((h) => { SD.fxDefs.STUB.hooks[h] = () => { calls[h]++; }; });
    const ms = playEngine(mk(5, 'Wall', { nodes: ['STUB'] }));
    Object.keys(calls).forEach((h) => assert(calls[h] > 0, 'hook not called ' + h));
    const m2 = E.newMatch(mk(5, 'Wall', { nodes: ['STUB'] }));
    assert.strictEqual(E.actives(m2)[0].can, true); assert.strictEqual(E.use(m2, 'STUB'), true);
    E.playAttack(m2, m2.hand[0], E.legal(m2, m2.hand[0])[0]);
    assert(m2.log[0].cause.indexOf('Stub: used') > 0 && m2.log[0].fxFired.indexOf('STUB') >= 0);
    console.log('stub hooks OK', JSON.stringify(calls));
    SD.fxDefs = saved;
    // (4) phases
    const mp = E.newMatch(mk(9)); let sawHalf = false;
    for (let i = 0; i < 6; i++) { if (mp.phase === 'attack') E.playAttack(mp, mp.hand[0], 'pass'); else E.playDefend(mp, mp.hand[0], 'press'); E.nextPhase(mp); }
    assert.strictEqual(mp.phase, 'halftime'); sawHalf = true;
    E.startHalf2(mp); assert.strictEqual(mp.half, 2); assert.strictEqual(mp.holder, 'opp'); assert.strictEqual(mp.zone, 1); assert.strictEqual(mp.turnNo, 7);
    for (let i = 0; i < 6; i++) { if (mp.phase === 'attack') E.playAttack(mp, mp.hand[0], 'pass'); else E.playDefend(mp, mp.hand[0], 'press'); E.nextPhase(mp); }
    assert.strictEqual(mp.phase, 'full'); const sm = E.summary(mp); assert(['W', 'D', 'L'].indexOf(sm.res) >= 0);
    console.log('phases OK', JSON.stringify(sm));
    // real fx files present: run many seeds across formations/nodes/traits/sigs with real defs, check invariants
    if (Object.keys(SD.fxDefs || {}).length) {
      const sigK = { id: 'ysolde', name: 'Ysolde', role: 'Keeper', pac: 3, pas: 3, sho: 1, def: 8, level: 2, sig: { id: 'SIG_YSOLDE', name: 'Last Hand' } };
      let n = 0, fxc = {};
      for (let s = 1; s <= 200; s++) {
        const o = mk(s, ['Wall', 'Diamond', 'Spear'][s % 3], { nodes: ['A1', 'A2', 'D1', 'D2', 'S1', 'S2'], keeper: sigK });
        o.outfield[0].level = 2; o.outfield[1].level = 2; o.outfield[2].level = 2; o.outfield[3].level = 2;
        o.outfield[3].sig = { id: 'SIG_LIO' }; o.outfield[1].sig = { id: 'SIG_HADRO' };
        const m = E.newMatch(o); let g = 0;
        while (m.phase !== 'full') {
          if (++g > 80) throw new Error('loop2');
          if (m.phase === 'halftime') { E.startHalf2(m); continue; }
          E.actives(m).forEach((a) => { if (a.can && (m.turnNo + s) % 3 === 0) E.use(m, a.id); });
          if (m.phase === 'attack') { const pid = m.hand[s % m.hand.length]; const lg = E.legal(m, pid); const a = lg[(s + m.turnNo) % lg.length]; E.previewAttack(m, pid, a); assert(E.playAttack(m, pid, a)); }
          else { const pid = m.hand[0]; E.previewDefend(m, pid, 'drop'); assert(E.playDefend(m, pid, 'drop')); }
          E.nextPhase(m);
        }
        assert(m.hand.length >= 3 && m.hand.length <= 5);
        const all = m.hand.concat(m.deck, m.discard); assert.strictEqual(new Set(all).size, all.length); assert.strictEqual(all.length, 6);
        m.log.forEach((e) => e.fxFired.forEach((id) => { fxc[id] = (fxc[id] || 0) + 1; }));
        n++;
      }
      console.log('real fx run OK over', n, 'matches; fired', JSON.stringify(fxc));
    }
    console.log('engine self-test OK');
  }
})();
