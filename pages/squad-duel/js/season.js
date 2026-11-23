(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // ---- fallbacks (admin default: used only when SD.data.SEASON / CLUBS / T keys are missing) ----
  const FB_ORDER = ['grimsby', 'reading', 'bolton', 'stockport', 'rotherham', 'wycombe', 'lincoln'];
  const FB_HOME = [true, true, false, true, false, true, false];
  const FB_CLUBS = ['preston'].concat(FB_ORDER);
  const FB_NAMES = { preston: ['Proud Preston', 'PRESTON'], grimsby: ['Iron Grimsby', 'GRIMSBY'], reading: ['Restless Reading', 'READING'],
    bolton: ['Bold Bolton', 'BOLTON'], stockport: ['Stormy Stockport', 'STOCKPORT'], rotherham: ['Steel Rotherham', 'ROTHERHAM'],
    wycombe: ['Wild Wycombe', 'WYCOMBE'], lincoln: ['Royal Lincoln', 'LINCOLN'] };
  // SEASON-SPEC section 3 TS column; Preston is never simulated (admin default 5)
  const FB_TS = { preston: 5, grimsby: 2, reading: 5, bolton: 4, stockport: 5, rotherham: 6, wycombe: 8, lincoln: 9 };
  // HARD rows (SEASON-SPEC section 3): def, keeper, atk
  const FB_STATS = { grimsby: [5, 7, 7], reading: [5, 9, 9], bolton: [6, 7, 10], stockport: [7, 10, 9], rotherham: [10, 9, 10],
    wycombe: [9, 10, 10], lincoln: [8, 10, 10] };
  const FB_FIX = [ // A-systems a: [h, a] x4, Preston first
    [['preston', 'grimsby'], ['reading', 'lincoln'], ['wycombe', 'bolton'], ['rotherham', 'stockport']],
    [['preston', 'reading'], ['bolton', 'grimsby'], ['stockport', 'lincoln'], ['wycombe', 'rotherham']],
    [['bolton', 'preston'], ['reading', 'stockport'], ['grimsby', 'rotherham'], ['lincoln', 'wycombe']],
    [['preston', 'stockport'], ['rotherham', 'bolton'], ['wycombe', 'reading'], ['grimsby', 'lincoln']],
    [['rotherham', 'preston'], ['stockport', 'wycombe'], ['bolton', 'lincoln'], ['reading', 'grimsby']],
    [['preston', 'wycombe'], ['lincoln', 'rotherham'], ['grimsby', 'stockport'], ['bolton', 'reading']],
    [['lincoln', 'preston'], ['wycombe', 'grimsby'], ['rotherham', 'reading'], ['stockport', 'bolton']]
  ];
  const FB_T = { seasonGrow: 1, clubMax: 12, otherBase: 0.30, otherTS: 0.03, otherHome: 0.04, otherChances: 4, otherMin: 0.05,
    otherMax: 0.75, normalDrop: 1, easyDrop: 1, cupWinPay: 300, cupLossPay: 100, place34Pay: 50, difficulty: 1 };
  const FB_CUPLINE = 'Cup Final: neutral ground, so no crowd for either side. One match, and someone must win.';

  function dataSeason() { return (SD.data && SD.data.SEASON) || null; }
  function order() { const s = dataSeason(); return (s && s.order) || FB_ORDER; }
  function homeList() { const s = dataSeason(); return (s && s.home) || FB_HOME; }
  function clubIds() { const s = dataSeason(); return (s && s.clubs) || FB_CLUBS; }
  function fixtureTable() {
    const s = dataSeason();
    if (s && s.fixtures && s.fixtures.length === 7) return s.fixtures;
    return FB_FIX.map((md) => md.map((p) => ({ h: p[0], a: p[1] })));
  }
  function tw(T, k) {
    if (T && T[k] != null) return T[k];
    const d = SD.data && SD.data.TWEAK_DEFAULTS;
    if (d && d[k] != null) return d[k];
    return FB_T[k];
  }
  function dclub(id) { return (SD.data && SD.data.CLUBS && SD.data.CLUBS[id]) || null; }
  function nameOf(id) { const c = dclub(id); return (c && c.name) || (FB_NAMES[id] && FB_NAMES[id][0]) || id; }
  function labelOf(id) { const c = dclub(id); return (c && c.label) || (FB_NAMES[id] && FB_NAMES[id][1]) || String(id).toUpperCase(); }
  function tsOf(id) { const c = dclub(id); return (c && c.ts != null) ? c.ts : (FB_TS[id] != null ? FB_TS[id] : 5); }
  function H(...p) { return SD.rng.hash(...p); }

  function ensure(S) {
    if (!S.season) S.season = newSeason(S, 1);
    return S.season;
  }

  // ---- season object ----
  function newSeason(S, no) {
    no = no || 1;
    const seed = H(S.seed, 'season', no);
    const ids = clubIds();
    // S2 rule 5: fixed order drawn once, ascending hash(save seed, season no, club no)
    const tieOrder = ids.map((id, i) => ({ id, h: H(S.seed, no, i) })).sort((a, b) => a.h - b.h || (a.id < b.id ? -1 : 1)).map((x) => x.id);
    return { no, md: 0, seed, tieOrder, results: [], cup: { opp: null, played: false, me: null, them: null, shoot: null, won: null }, done: false, paid: false };
  }

  // ---- fixtures ----
  function fixtureFor(S) {
    const se = ensure(S);
    if (se.md >= 7) return null;
    const md = se.md + 1, i = md - 1;
    const home = homeList()[i];
    return { md, clubId: order()[i], home: !!home, mode: home ? 'home' : 'away' };
  }

  // ---- club stats per season and difficulty ----
  function clubFor(S, clubId, T, md) {
    const se = ensure(S);
    const base = dclub(clubId);
    if (!base) return null;
    const c = JSON.parse(JSON.stringify(base));
    const fb = FB_STATS[clubId] || [c.def, c.keeper && c.keeper.def, c.atk];
    const get = (suffix, dflt) => { const v = T && T['c_' + clubId + '_' + suffix]; return v != null ? v : (dflt != null ? dflt : fb[suffix === 'def' ? 0 : suffix === 'keeper' ? 1 : 2]); };
    let def = get('def', c.def), kdef = get('keeper', c.keeper && c.keeper.def), atk = get('atk', c.atk);
    const grow = (se.no - 1) * tw(T, 'seasonGrow'), max = tw(T, 'clubMax');
    def = Math.min(max, def + grow); kdef = Math.min(max, kdef + grow); atk = Math.min(max, atk + grow);
    if (md == null) md = se.md + 1;
    const diff = tw(T, 'difficulty');
    let drop = 0;
    if (diff <= 1 && md >= 2) drop += tw(T, 'normalDrop');          // Normal: MD 2-7 and Cup (md 8)
    if (diff === 0) drop += tw(T, 'easyDrop');                       // Easy: a further drop (admin default: also on MD1)
    c.def = Math.max(1, def - drop);
    c.keeper = Object.assign({}, c.keeper, { def: Math.max(1, kdef - drop) });
    c.atk = Math.max(1, atk);
    return c;
  }

  // ---- table ----
  function emptyRow(id) { return { id, name: nameOf(id), label: labelOf(id), P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0, me: id === 'preston', pos: 0 }; }
  function tableFrom(se, upto) {
    const rows = {};
    clubIds().forEach((id) => { rows[id] = emptyRow(id); });
    for (let m = 0; m < Math.min(upto, se.results.length); m++) {
      for (const f of se.results[m]) {
        const h = rows[f.h], a = rows[f.a];
        h.P++; a.P++; h.GF += f.hs; h.GA += f.as; a.GF += f.as; a.GA += f.hs;
        if (f.hs > f.as) { h.W++; a.L++; h.Pts += 3; } else if (f.hs < f.as) { a.W++; h.L++; a.Pts += 3; } else { h.D++; a.D++; h.Pts++; a.Pts++; }
      }
    }
    const list = Object.keys(rows).map((k) => { const r = rows[k]; r.GD = r.GF - r.GA; return r; });
    const tie = (id) => se.tieOrder.indexOf(id);
    list.sort((x, y) => (y.Pts - x.Pts) || (y.GD - x.GD) || (y.GF - x.GF) ||
      ((y.id === 'preston') - (x.id === 'preston')) || (tie(x.id) - tie(y.id)));
    list.forEach((r, i) => { r.pos = i + 1; });
    return list;
  }
  function table(S) { const se = ensure(S); return tableFrom(se, se.results.length); }
  function place(S) { const r = table(S).find((x) => x.me); return { pos: r.pos, pts: r.Pts }; }

  // ---- other results (S3) ----
  function simOther(se, md, no, h, a, T) {
    const R = SD.rng.make(H(se.seed, se.no, md, no));
    const n = tw(T, 'otherChances');
    const base = tw(T, 'otherBase'), k = tw(T, 'otherTS'), hb = tw(T, 'otherHome'), lo = tw(T, 'otherMin'), hi = tw(T, 'otherMax');
    const clamp = (v) => Math.max(lo, Math.min(hi, v));
    const ph = clamp(base + k * (tsOf(h) - tsOf(a)) + hb), pa = clamp(base + k * (tsOf(a) - tsOf(h)));
    let hs = 0, as = 0;
    for (let i = 0; i < n; i++) if (R.next() < ph) hs++;
    for (let i = 0; i < n; i++) if (R.next() < pa) as++;
    return { h, a, hs, as };
  }

  function recordMatchday(S, me, opp, T) {
    const se = ensure(S);
    if (se.md >= 7) return null;
    const md = se.md + 1;
    const fx = fixtureTable()[md - 1];
    const before = {}; table(S).forEach((r) => { before[r.id] = r.pos; });
    const mineSlot = fx.findIndex((f) => f.h === 'preston' || f.a === 'preston');
    const home = fx[mineSlot].h === 'preston';
    const mine = { h: fx[mineSlot].h, a: fx[mineSlot].a, hs: home ? me : opp, as: home ? opp : me };
    const others = [];
    let n = 0;
    fx.forEach((f, i) => { if (i === mineSlot) return; n++; others.push(simOther(se, md, n, f.h, f.a, T)); });
    se.results.push([mine].concat(others));
    se.md = md;
    const after = {}; table(S).forEach((r) => { after[r.id] = r.pos; });
    return { md, mine, others, before, after, ptsGained: me > opp ? 3 : me === opp ? 1 : 0 };
  }

  // ---- cup ----
  function cupGate(S) {
    const se = ensure(S);
    if (se.md < 7) return { reached: false, opp: null, pos: place(S).pos };
    const t = table(S), mine = t.find((r) => r.me);
    if (mine.pos > 2) return { reached: false, opp: null, pos: mine.pos };
    const other = t.find((r) => r.pos <= 2 && !r.me);
    return { reached: true, opp: other.id, pos: mine.pos };
  }
  function recordCup(S, me, them, shoot) {
    const se = ensure(S), c = se.cup;
    if (!c.opp) { const g = cupGate(S); c.opp = g.opp; }
    c.played = true; c.me = me; c.them = them; c.shoot = shoot || null;
    c.won = me > them || (me === them && !!shoot && shoot.me > shoot.opp);
    if (c.won) S.cupsWon = (S.cupsWon || 0) + 1;
    se.done = true;
    return c;
  }

  // ---- pay (E4) ----
  function seasonPay(S, T) {
    const se = ensure(S);
    if (se.pay) return se.pay;
    const c = se.cup;
    if (c.played) return c.won ? { coins: tw(T, 'cupWinPay'), why: 'Cup won' } : { coins: tw(T, 'cupLossPay'), why: 'Cup Final reached' };
    const p = place(S).pos;
    if (p === 3 || p === 4) return { coins: tw(T, 'place34Pay'), why: 'Finished ' + (p === 3 ? '3rd' : '4th') };
    const o = (p % 100 >= 11 && p % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][p % 10] || 'th');
    return { coins: 0, why: 'Finished ' + p + o };
  }
  function endSeason(S, T) {
    const se = ensure(S);
    if (se.paid) return se.pay || { coins: 0, why: 'Already paid' };
    const pay = seasonPay(S, T);
    S.coins = (S.coins || 0) + pay.coins;
    se.pay = { coins: pay.coins, why: pay.why }; se.paid = true; se.done = true;
    return se.pay;
  }
  function nextSeason(S) {
    const no = ensure(S).no;
    S.seasonsPlayed = (S.seasonsPlayed || 0) + 1;
    S.season = newSeason(S, no + 1);
    return S.season;
  }

  // ---- report (D-ux 6) ----
  function pullName(r) { const p = r && r.pid && SD.data && SD.data.byId && SD.data.byId(r.pid); return (r && (r.name || (p && p.name))) || (r && r.pid) || '?'; }
  function reportLines(S, T) {
    const se = ensure(S), L = [];
    L.push('SEASON s' + se.no + ' seed ' + S.seed + ' build ' + (S.build || '?'));
    if (se.md > 0) {
      L.push('TABLE after MD' + se.md + ': ' + table(S).map((r) => r.pos + ' ' + r.label + ' ' + r.Pts + ' (' + (r.GD >= 0 ? '+' : '') + r.GD + ')').join(' | '));
    }
    se.results.forEach((fx, i) => {
      const m = fx[0], home = m.h === 'preston', me = home ? m.hs : m.as, th = home ? m.as : m.hs;
      const opp = home ? m.a : m.h;
      const res = me > th ? 'W' : me < th ? 'L' : 'D';
      L.push('MD' + (i + 1) + ' ' + (home ? 'H' : 'A') + ' ' + labelOf(opp) + ' ' + res + ' ' + me + '-' + th + ' | others: ' +
        fx.slice(1).map((f) => labelOf(f.h) + ' ' + f.hs + '-' + f.as + ' ' + labelOf(f.a)).join(', '));
    });
    const log = (S.pullLog || []).slice(0, 5);
    let pity = '';
    if (SD.gacha && SD.gacha.pity) { try { const p = SD.gacha.pity(S, T); pity = ' | pity E ' + p.epic.n + '/' + p.epic.of + ' L ' + p.legend.n + '/' + p.legend.of; } catch (e) { /* ignore */ } }
    L.push('PULLS: ' + (log.length ? log.map((r) => pullName(r) + ' ' + String(r.rarity || r.tier || '?')[0] + (r.isNew === false || r.dupe ? ' dupe' : ' new')).join(' | ') : 'none') + pity + ' | total ' + (S.pulls || 0));
    L.push('ECON: Coins ' + (S.coins || 0) + ' | SP ' + (S.sp || 0) + ' | nodes ' + (S.nodes ? S.nodes.length : 0));
    const c = se.cup;
    if (c.played) {
      L.push('CUP: ' + (c.won ? 'WON' : 'LOST') + ' v ' + labelOf(c.opp) + ' ' + c.me + '-' + c.them + (c.shoot ? ' | shootout ' + c.shoot.me + '-' + c.shoot.opp : '') +
        (c.kicks && c.kicks.length ? ' | kicks: ' + c.kicks.join(', ') : ''));
    } else if (se.md >= 7) L.push('CUP: not reached');
    else L.push('CUP: not reached yet');
    if (se.paid && se.pay) L.push('SEASON PAY: +' + se.pay.coins + ' (' + se.pay.why + ')');
    return L;
  }

  SD.season = { newSeason, fixtureFor, clubFor, table, place, recordMatchday, cupGate, recordCup, seasonPay, endSeason, nextSeason, reportLines,
    cupLine: () => (dataSeason() && dataSeason().cupLine) || FB_CUPLINE };
})();
