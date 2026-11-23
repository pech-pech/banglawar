(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {};

  const ACTS = {
    pass:    { label: 'Pass',         stat: 'pas', sub: 'Build +1' },
    dribble: { label: 'Dribble',      stat: 'pac', sub: 'Advance' },
    through: { label: 'Through ball', stat: 'pas', sub: 'Advance' },
    shoot:   { label: 'Shoot',        stat: 'sho', sub: 'Goal' }
  };
  const ZN = ['Defence', 'Midfield', 'Attack'];
  const STATS = ['pac', 'pas', 'sho', 'def'];
  const CHK = '<svg class="chk" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="9" fill="#2cf0ff"/><path d="M4.8 9.4l2.8 2.8 5.6-5.8" fill="none" stroke="#031018" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const UNDO = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#dfe8ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-4"/></svg>';
  const ABIL_ID = { A1: 'ab-sharp', S1: 'ab-fresh' };   // admin default: other actives get ab-<id lowercase>

  let cur = null;   // the live screen instance; stale handlers/timers compare against it

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const app = () => SD.app || {};
  const isFast = () => !!app().fast;
  const isReduced = () => !!app().reduced;

  function pctText(m, p) {
    if (m.T && m.T.coarseChip && SD.odds && SD.odds.coarse) return SD.odds.coarse(p);
    return SD.odds && SD.odds.pct ? SD.odds.pct(p) : Math.round(p * 100) + '%';
  }
  const pctNum = (p) => Math.round(p * 100) + '%';
  const sum = (a) => a.reduce((s, x) => s + (+x.v || 0), 0);
  function pdata(m, pid) {
    const P = (m.cards && m.cards[pid]) || (m.keeper && m.keeper.id === pid ? m.keeper : null) || { id: pid, name: pid, role: '', rarity: 'Common', pac: 0, pas: 0, sho: 0, def: 0, level: 1 };
    const d = SD.data && SD.data.byId ? SD.data.byId(pid) : null;
    return { P, num: d ? d.num : '' };
  }
  function nameOf(m, pid) { return pdata(m, pid).P.name || pid; }
  function clubShort(m) { const l = (m.club && (m.club.label || m.club.name)) || 'Club'; return l.charAt(0) + l.slice(1).toLowerCase(); }
  function die(n, col) {
    const g = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[Math.min(6, Math.max(1, n | 0))];
    return '<svg width="36" height="36" viewBox="0 0 36 36" role="img" aria-label="die showing ' + n + '"><rect x="2" y="2" width="32" height="32" rx="7" fill="#12315e" stroke="' + col + '" stroke-width="2.4"/>' +
      g.map(([x, y]) => '<circle cx="' + (9 + 9 * (x - 1)) + '" cy="' + (9 + 9 * (y - 1)) + '" r="2.8" fill="#fff"/>').join('') + '</svg>';
  }
  function pips(n, max) {
    let o = '<span class="pp" aria-hidden="true">';
    for (let i = 0; i < max; i++) o += '<i class="' + (i < n ? 'f' : '') + '"></i>';
    return o + '</span>';
  }

  function defCards(m) {
    try { if (SD.engine.defendCards) { const r = SD.engine.defendCards(m, true); if (Array.isArray(r) && r.length) return r; } } catch (e) { /* fall back to hand */ }
    return m.hand.slice();   // admin default: defend with the hand (engine may offer more via SD.engine.defendCards)
  }

  function render(el) {
    const m = SD.engine.newMatch(app().matchSetup());
    app().m = m; SD.app = SD.app || {}; SD.app.m = m;
    const U = { m, el, sel: null, act: null, stance: null, ev: null, busy: false, over: null, timer: null, newIds: [], prevHand: null };
    cur = U;
    el.innerHTML =
      '<div id="match">' +
      '<section id="info" aria-label="Match info"></section>' +
      '<main id="scene"></main>' +
      '<section id="tell" aria-label="Opponent tell"></section>' +
      '<section id="band" aria-live="polite"></section>' +
      '<div class="hd" id="h1"><span id="h1t"></span><span class="cnt"><span id="deckcount"></span> · <span id="disccount"></span></span></div>' +
      '<section id="hand"></section>' +
      '<div class="hd" id="h2"></div>' +
      '<section id="acts"></section>' +
      '<footer id="foot"><div id="abil"></div><button id="btn-back" aria-label="Undo last pick" hidden>' + UNDO + '</button><div id="sum"></div>' +
      '<button id="btn-confirm" aria-disabled="true">Confirm</button><button id="btn-next" hidden>Next turn</button></footer>' +
      '<div id="halftime" class="ov" hidden><div class="ovp"><small>Half time</small><h2 id="ht-score"></h2><p id="ht-sub"></p><button id="btn-half">Start 2nd half</button></div></div>' +
      '<div id="fulltime" class="ov" hidden><div class="ovp"><small>Full time</small><h2 id="ft-score"></h2><div id="ft-stamp" class="stamp"></div><p id="ft-sub"></p><button id="btn-ft">Continue</button></div></div>' +
      '</div>';
    const q = (id) => el.querySelector('#' + id);
    U.q = q;
    try { if (SD.ui.scene && SD.ui.scene.mount) SD.ui.scene.mount(q('scene')); } catch (e) { console.error('scene.mount', e); }

    // ---- events (delegated; every handler ignores taps while animating or on overlays)
    el.querySelector('#match').addEventListener('click', (e) => {
      if (cur !== U) return;
      const t = e.target.closest('button'); if (!t) return;
      const id = t.id;
      if (id === 'btn-half') return startHalf2(U);
      if (id === 'btn-ft') return finish(U);
      if (U.busy || U.over) return;
      if (t.classList.contains('card')) return pickCard(U, t.dataset.pid);
      if (t.classList.contains('act') && t.dataset.a) return pickAct(U, t.dataset.a);
      if (t.classList.contains('act') && t.dataset.st) return pickStance(U, t.dataset.st);
      if (t.classList.contains('ab')) return useAbility(U, t.dataset.id);
      if (id === 'btn-back') return undo(U);
      if (id === 'btn-confirm') return confirm(U);
      if (id === 'btn-next') return next(U);
    });
    draw(U);
  }

  // ---- interaction
  function legalFor(U, pid) {
    const m = U.m;
    if (!pid) return m.zone === 2 ? ['pass', 'shoot'] : ['pass', 'dribble', 'through'];
    return SD.engine.legal(m, pid);
  }
  function pickCard(U, pid) {
    if (U.ev || !U.m.hand.concat(defCards(U.m)).includes(pid)) return;
    U.sel = pid;
    if (U.m.phase === 'attack' && U.act && !legalFor(U, pid).includes(U.act)) U.act = null;
    draw(U);
  }
  function pickAct(U, a) {
    if (U.ev || U.m.phase !== 'attack' || !U.sel) return;
    if (!legalFor(U, U.sel).includes(a)) return;
    U.act = a; draw(U);
  }
  function pickStance(U, s) {
    if (U.ev || U.m.phase !== 'defend' || !U.sel) return;
    U.stance = s; draw(U);
  }
  function undo(U) {
    if (U.ev) return;
    if (U.m.phase === 'attack' && U.act) U.act = null;
    else if (U.m.phase === 'defend' && U.stance) U.stance = null;
    else U.sel = null;
    draw(U);
  }
  function useAbility(U, fxId) {
    if (U.ev) return;
    const a = SD.engine.actives(U.m).find((x) => x.id === fxId);
    if (!a || !a.can) return;
    SD.engine.use(U.m, fxId);
    if (U.sel && !U.m.hand.includes(U.sel)) { U.sel = null; U.act = null; U.stance = null; }
    draw(U);
  }
  const ready = (U) => U.sel && (U.m.phase === 'attack' ? U.act : U.stance);

  function confirm(U) {
    const m = U.m;
    if (U.ev || U.busy || !ready(U)) return;
    U.busy = true;
    U.prevHand = m.hand.slice();
    const ev = m.phase === 'attack' ? SD.engine.playAttack(m, U.sel, U.act) : SD.engine.playDefend(m, U.sel, U.stance);
    if (!ev) { U.busy = false; U.sel = null; U.act = null; U.stance = null; draw(U); return; }   // invalid play: engine returned null
    U.ev = ev;
    U.newIds = m.hand.filter((p) => !(ev.hand || []).includes(p));
    const done = () => {
      if (cur !== U) return;
      U.busy = false;
      try { if (SD.ui.scene && SD.ui.scene.update) SD.ui.scene.update(m); } catch (e) { console.error('scene.update', e); }
      draw(U);
      scheduleNext(U);
    };
    let p = null;
    if (!isFast() && !isReduced() && SD.ui.scene && SD.ui.scene.play) {
      try { p = SD.ui.scene.play(ev); } catch (e) { console.error('scene.play', e); }
    }
    if (p && p.then) {
      let fired = false;
      const once = () => { if (!fired) { fired = true; done(); } };
      p.then(once, once);
      setTimeout(once, 1500);   // safety net so a stuck animation never freezes the match
    } else done();
  }
  function scheduleNext(U) {
    const T = U.m.T || {};
    if (T.autoNext === false) return;
    clearTimeout(U.timer);
    const wait = isFast() ? 0 : 1200;
    U.timer = setTimeout(() => { if (cur === U && U.ev && !U.busy) next(U); }, wait);
  }
  function next(U) {
    const m = U.m;
    if (!U.ev || U.busy) return;
    clearTimeout(U.timer);
    U.ev = null; U.sel = null; U.act = null; U.stance = null; U.newIds = []; U.prevHand = null;
    SD.engine.nextPhase(m);
    draw(U);
  }
  function startHalf2(U) {
    if (U.m.phase !== 'halftime') return;
    SD.engine.startHalf2(U.m);
    U.sel = null; U.act = null; U.stance = null;
    draw(U);
  }
  function finish(U) {
    if (U.finished) return;
    U.finished = true;
    app().endMatch(U.m);
  }

  // ---- drawing
  function draw(U) {
    const m = U.m, q = U.q;
    U.over = m.phase === 'halftime' ? 'half' : m.phase === 'full' ? 'full' : null;
    try { if (app().setScorebug) app().setScorebug({ home: 'Proud Preston', away: (m.club && m.club.name) || 'Opponent', hs: m.score.me, as: m.score.opp }); } catch (e) { /* optional */ }
    drawInfo(U); drawTell(U); drawBand(U); drawHand(U); drawActs(U); drawFoot(U); drawOverlays(U);
    if (!U.ev) { try { if (SD.ui.scene && SD.ui.scene.update) SD.ui.scene.update(m); } catch (e) { console.error('scene.update', e); } }
    q('deckcount').textContent = 'Deck ' + m.deck.length;
    q('disccount').textContent = 'Discard ' + m.discard.length;
  }

  function drawInfo(U) {
    const m = U.m, T = m.T || {}, roarN = T.roarAt || 3, bMax = T.buildMax || 2;
    const f = SD.data && SD.data.FORMATIONS && SD.data.FORMATIONS[m.setup && m.setup.formation];
    const fname = (m.setup && m.setup.formation) || '';
    const bside = m.holder === 'me' ? 'me' : 'opp';
    U.q('info').innerHTML =
      '<span class="turn">H' + m.half + ' T' + Math.min(m.turn, T.halfTurns || 6) + '/' + (T.halfTurns || 6) + '</span>' +
      (f ? '<span class="tag"><b>' + esc(fname.toUpperCase()) + ':</b> ' + esc(f.text) + '</span>' : '') + '<i class="brk"></i>' +
      '<div class="gb' + (m.roarReady ? ' ready' : '') + '" id="roar">Home Roar ' + pips(m.roarReady ? roarN : m.crowd, roarN) + (m.roarReady ? '<span>+1</span>' : '') + '</div>' +
      '<div class="gb bd" id="build">' + (bside === 'me' ? 'Build ' : esc(clubShort(m)) + ' build ') + pips(m.build[bside], bMax) + '<span class="dim">max ' + bMax + '</span></div>';
  }

  function tellOf(m) { try { return SD.engine.tell(m) || {}; } catch (e) { console.error('tell', e); return {}; } }

  function drawTell(U) {
    const m = U.m, box = U.q('tell');
    if (m.phase === 'defend' || (U.ev && U.ev.side === 'opp')) { box.innerHTML = defendTell(U); return; }
    if (m.phase === 'halftime' || m.phase === 'full') { return; }
    const tl = tellOf(m), d = tl.defender || { name: '?', zone: m.zone, press: 0 };
    const act = U.act, keeperAct = act === 'shoot';
    const defVal = keeperAct ? (m.cs && m.cs.keeper) : (m.cs && m.cs.def);
    const defName = keeperAct && m.club.keeper ? m.club.keeper.name : d.name;
    const P = Math.round((tl.pressW != null ? tl.pressW : d.press) * 100), D = 100 - P;
    const showBar = m.zone < 2 && act !== 'pass' && act !== 'shoot';
    let bar = '';
    if (showBar) {
      if (tl.exact) bar = '<div class="stance one" role="img" aria-label="Stance known: ' + tl.exact + '"><div class="seg ' + tl.exact + '">' + (tl.exact === 'press' ? 'Press' : 'Drop') + ' (read)</div></div>';
      else if (P <= 0 || P >= 100) bar = '<div class="stance one"><div class="seg ' + (P >= 100 ? 'press' : 'drop') + '">' + (P >= 100 ? 'Press 100' : 'Drop 100') + '</div></div>';
      else bar = '<div class="stance" style="grid-template-columns:minmax(max-content,' + P + 'fr) minmax(max-content,' + D + 'fr)" role="img" aria-label="Facing defender stance: Press ' + P + ', Drop ' + D + '"><div class="seg press" style="grid-column:1">Press ' + P + '</div><div class="seg drop">Drop ' + D + '</div></div>';
    }
    let tags = '';
    if (tl.clubPick) tags += '<span class="df tg">Club plays: ' + esc((ACTS[tl.clubPick] || { label: tl.clubPick }).label) + '</span>';
    box.innerHTML = '<div class="who"><span class="k">Facing</span><span><span class="nn">' + esc(ZN[d.zone] != null ? ZN[d.zone] : '') + '</span>' + esc(defName) + '</span><span class="df">' + (keeperAct ? 'SAVE ' : 'DEF ') + esc(defVal) + '</span>' + tags + '</div>' + bar;
  }

  function defendTell(U) {
    const m = U.m, T = m.T || {};
    const trailing = m.score.opp < m.score.me;
    let w = null, text = '';
    try { if (SD.clubAI) { w = SD.clubAI.weights(m.club, m.zone, trailing, T); text = SD.clubAI.attackTell(m.club, m.zone, trailing, T); } } catch (e) { console.error('clubAI', e); }
    const tl = U.ev ? {} : tellOf(m);
    let segs = '', cols = [];
    if (w) {
      ['pass', 'dribble', 'through', 'shoot'].forEach((a) => {
        const v = Math.round((w[a] || 0) * 100);
        if (v > 0) { cols.push('minmax(max-content,' + v + 'fr)'); segs += '<div class="seg w-' + a + '">' + esc(ACTS[a].label.replace(' ball', '')) + ' ' + v + '</div>'; }
      });
    }
    const bar = segs ? '<div class="stance wb" style="grid-template-columns:' + cols.join(' ') + '" role="img" aria-label="' + esc(text) + '">' + segs + '</div>' : '<div class="who">' + esc(text) + '</div>';
    let tags = '';
    if (tl.clubPick) tags += '<span class="df tg">Club plays: ' + esc((ACTS[tl.clubPick] || { label: tl.clubPick }).label) + '</span>';
    return '<div class="who"><span class="k">Club attack</span><span>' + esc(clubShort(m)) + '</span><span class="df">ATK ' + esc(m.cs && m.cs.atk) + '</span>' + tags + '</div>' + bar;
  }

  function partsLine(parts, total) {
    // parts must sum to the shown total; a negative Cap part (or any mismatch) is shown as "bonus N" + cap note
    if (!parts || !parts.length) return { line: '', cap: '' };
    const capP = parts.find((p) => p.k === 'Cap');
    const real = parts.filter((p) => p.k !== 'Cap');
    const stat = real[0], bon = real.slice(1);
    const sl = String(stat.k).split(' ').slice(-1)[0];
    const sKey = /^(PAC|PAS|SHO|DEF|ATK)$/.test(sl) ? sl : stat.k;
    if (!capP && (sum(real) === total || !bon.length)) {
      return { line: esc(sKey) + ' <b>' + stat.v + '</b>' + bon.map((p) => ' + ' + esc(p.k) + ' <b>' + p.v + '</b>').join('') + ' <span class="eq">= <b>' + total + '</b></span>', cap: '' };
    }
    const bt = total - stat.v;
    return { line: esc(sKey) + ' <b>' + stat.v + '</b> + bonus <b>' + bt + '</b> <span class="eq">= <b>' + total + '</b></span>', cap: bon.map((p) => esc(p.k) + ' ' + p.v).join(' + ') + ' = ' + sum(bon) };
  }

  function chipHTML(U) {
    const m = U.m, T = m.T || {};
    if (m.phase === 'attack') {
      const pv = SD.engine.previewAttack(m, U.sel, U.act);
      const pl = partsLine(pv.parts, pv.myScore);
      const capNote = pv.capNote ? 'bonus capped at +' + String(pv.capNote).replace(/[^0-9]/g, '') : (pl.cap ? 'bonus capped at +' + (T.cap || 3) : '');
      const opp = pv.oppParts || [];
      const oppTxt = opp.length ? 'v <b>' + opp.map((p) => esc(p.k) + ' ' + p.v).join(' + ') + '</b>' + (opp.length > 1 ? ' = ' + pv.oppScore : '') : 'v <b>' + pv.oppScore + '</b>';
      let split = '';
      const c = pv.chip || {};
      if ((U.act === 'dribble' || U.act === 'through') && c.pPress != null && c.pressW > 0 && c.pressW < 1) {
        split = '<div class="ln dim"><span>Press ' + Math.round(c.pressW * 100) + '%: <b>' + pctNum(c.pPress) + '</b></span><span>·</span><span>Drop ' + Math.round((1 - c.pressW) * 100) + '%: <b>' + pctNum(c.pDrop) + '</b></span></div>';
      }
      const tags = (pv.tags || []).map((t) => '<span class="df tg">' + esc(t) + '</span>').join('');
      return '<div class="chip"><div class="rows"><div class="ln">' + pl.line + '</div><div class="ln">' + oppTxt + '</div>' +
        (capNote ? '<div class="ln capn"><b>' + esc(capNote) + '</b>' + (pl.cap ? ' (' + pl.cap + ')' : '') + '</div>' : '') + split + (tags ? '<div class="ln">' + tags + '</div>' : '') +
        '</div><div class="od"><b id="odds">' + esc(pctText(m, c.p)) + '</b><small>to win</small></div></div>';
    }
    const pv = SD.engine.previewDefend(m, U.sel, U.stance);
    const pl = partsLine(pv.parts, pv.myDef);
    const rows = (pv.rows || []).map((r) => '<span>' + esc((ACTS[r.action] || { label: r.action }).label.replace(' ball', '')) + ' ' + Math.round((r.w || 0) * 100) + '%: <b>' + pctNum(r.p) + '</b></span>').join('<span>·</span>');
    const tags = (pv.tags || []).map((t) => '<span class="df tg">' + esc(t) + '</span>').join('');
    return '<div class="chip"><div class="rows"><div class="ln">' + pl.line + '</div><div class="ln">v <b>' + esc(clubShort(m)) + ' ATK ' + esc(m.cs && m.cs.atk) + '</b></div>' +
      (rows ? '<div class="ln dim">' + rows + '</div>' : '') + (tags ? '<div class="ln">' + tags + '</div>' : '') +
      '</div><div class="od"><b id="odds">' + esc(pctText(m, pv.chip.p)) + '</b><small>to hold</small></div></div>';
  }

  function resultTotals(U) {
    const m = U.m, ev = U.ev, mine = ev.side === 'me';
    const myDie = mine ? ev.dice.att : ev.dice.def, opDie = mine ? ev.dice.def : ev.dice.att;
    const myTot = ev.myScore != null ? ev.myScore + myDie : null, opTot = ev.oppScore != null ? ev.oppScore + opDie : null;
    const keeperMe = !mine && !ev.pid;   // club shot: my keeper answers
    const myName = mine ? nameOf(m, ev.pid) : (keeperMe ? 'Keeper' : nameOf(m, ev.pid));
    const opName = mine ? (ev.action === 'shoot' ? 'Keeper' : clubShort(m) + (ev.stance ? ' ' + ev.stance : '')) : clubShort(m);
    return { myDie, opDie, myTot, opTot, myName, opName };
  }
  function stampOf(ev) {
    if (ev.goal === 'me') return { t: 'Goal', c: 'win' };
    if (ev.goal === 'opp') return { t: 'Conceded', c: 'lose' };
    if (ev.save) return { t: 'Saved', c: 'win' };
    return ev.meWon ? { t: 'Won', c: 'win' } : { t: 'Lost', c: 'lose' };
  }

  function drawBand(U) {
    const m = U.m, box = U.q('band');
    if (U.ev) {
      const r = resultTotals(U), st = stampOf(U.ev);
      box.innerHTML = '<div class="res"><div class="side you">' + die(r.myDie, '#2cf0ff') + '<div class="tx"><small>' + esc(r.myName.toUpperCase()) + '</small><b>' + (r.myTot == null ? '' : r.myTot) + '</b><small>die ' + r.myDie + '</small></div></div>' +
        '<div class="stamp ' + st.c + '">' + st.t + '</div>' +
        '<div class="side opp">' + die(r.opDie, '#ff8aa0') + '<div class="tx"><small>' + esc(r.opName.toUpperCase()) + '</small><b>' + (r.opTot == null ? '' : r.opTot) + '</b><small>die ' + r.opDie + '</small></div></div></div>';
      return;
    }
    if (m.phase === 'attack' && U.sel && U.act) box.innerHTML = chipHTML(U);
    else if (m.phase === 'defend' && U.sel && U.stance) box.innerHTML = chipHTML(U);
    else if (m.phase === 'attack') box.innerHTML = '<div class="hint">' + (U.sel ? 'Choose an action. Odds are exact.' : 'Your turn. Pick a player, then an action. Odds are exact.') + '</div>';
    else if (m.phase === 'defend') box.innerHTML = '<div class="hint">' + esc(clubShort(m)) + ' attack: pick a defender card and a stance</div>';
    else box.innerHTML = '';
  }

  function cardHTML(U, pid) {
    const m = U.m, { P, num } = pdata(m, pid);
    const on = pid === U.sel, isNew = U.ev && U.newIds.includes(pid);
    let lit = '';
    if (m.phase === 'defend' || (U.ev && U.ev.side === 'opp')) lit = on || (U.ev && U.ev.pid === pid) ? 'def' : '';
    else if (on && U.act) lit = ACTS[U.act].stat;
    let tag = '';
    const TR = SD.data && SD.data.TRAITS && SD.data.TRAITS[P.role];
    if (P.level >= 2 && TR) tag += '<span class="tg">' + esc(TR.name) + '</span>';
    if (P.sig && P.sig.name) tag += '<span class="tg sg">' + esc(P.sig.name) + '</span>';
    let xpbar = '';
    try {
      const S = app().S, o = S && S.owned && S.owned[pid];
      if (o && SD.progress && SD.progress.xpNext) {
        const n = SD.progress.xpNext(o.xp); xpbar = '<span class="xp" role="img" aria-label="XP"><i style="width:' + (n.need ? Math.min(100, n.into / n.need * 100) : 100) + '%"></i></span>';
      }
    } catch (e) { xpbar = ''; }
    return '<button class="card' + (on ? ' on' : '') + '" data-pid="' + esc(pid) + '" aria-pressed="' + on + '" aria-label="' + esc(P.name) + ', ' + esc(P.role) + ', level ' + (P.level || 1) + '">' +
      '<span class="nm2">' + esc(P.name) + '</span>' +
      '<span class="rl"><i class="sb">' + esc(num) + '</i><span>' + esc(P.role) + '</span><span class="r2">' + esc(P.rarity) + '</span></span>' +
      '<span class="rar"><i class="gem ' + esc(String(P.rarity).toLowerCase()) + '"></i><span>' + esc(P.rarity) + '</span>' + (on ? CHK : '') + '</span>' +
      '<span class="st">' + STATS.map((s) => '<span class="' + (lit === s ? 'hl' : '') + '"><em>' + s.toUpperCase() + '</em><b>' + P[s] + '</b></span>').join('') + '</span>' +
      '<span class="lv"><u>LV ' + (P.level || 1) + '</u>' + xpbar + (isNew ? '<u class="gain">NEW</u>' : '') + '</span>' + (tag ? '<span class="tags">' + tag + '</span>' : '') +
      '</button>';
  }

  function drawHand(U) {
    const m = U.m, hand = U.q('hand');
    const ids = m.phase === 'defend' && !U.ev ? defCards(m) : m.hand;
    hand.className = 'h' + ids.length;
    hand.style.gridTemplateColumns = '';
    hand.innerHTML = ids.map((p) => cardHTML(U, p)).join('');
    const h1 = U.q('h1t'), h2 = U.q('h2');
    if (U.ev) {
      const ev = U.ev;
      const out = ev.pid ? nameOf(m, ev.pid) + ' out' : 'Card kept';
      const inn = U.newIds.length ? ' · ' + U.newIds.map((p) => nameOf(m, p)).join(', ') + ' in' : '';
      h1.innerHTML = '<b>Your hand</b> · ' + esc(out + inn);
      h2.innerHTML = '<b>Why</b> · cause line';
    } else if (m.phase === 'defend') {
      h1.innerHTML = '<b>Your hand</b> · pick your defender';
      h2.innerHTML = '<b>2</b> · Choose a stance';
    } else {
      h1.innerHTML = '<b>Your hand</b> · pick who takes the ball';
      h2.innerHTML = '<b>2</b> · Choose an action' + (m.zone === 2 ? ' · Shoot is open' : '');
    }
  }

  function drawActs(U) {
    const m = U.m, box = U.q('acts');
    if (U.ev) {
      box.className = '';
      box.style.gridTemplateColumns = '';
      box.innerHTML = '<div class="cause"><div class="k">Cause</div><p><span id="cause">' + esc(U.ev.cause || '') + '</span></p></div>';
      return;
    }
    const has = !!U.sel;
    if (m.phase === 'defend') {
      box.className = 'two'; box.style.gridTemplateColumns = '';
      box.innerHTML = ['press', 'drop'].map((s) => {
        const on = U.stance === s;
        let pc = '--';
        if (has) { const pv = SD.engine.previewDefend(m, U.sel, s); pc = pctText(m, pv.chip.p); }
        return '<button class="act' + (on ? ' on' : '') + (has ? '' : ' dis') + '" id="st-' + s + '" data-st="' + s + '" aria-pressed="' + on + '" aria-disabled="' + !has + '">' +
          '<span class="an">' + (s === 'press' ? 'Press' : 'Drop') + '</span><span class="pc">' + (on ? CHK : '') + esc(pc) + '</span><span class="as">' + (s === 'press' ? 'Good v Dribble' : 'Good v Through') + '</span></button>';
      }).join('');
      return;
    }
    if (m.phase !== 'attack') { box.innerHTML = ''; return; }
    const list = legalFor(U, U.sel);
    box.className = list.length === 2 ? 'two' : '';
    box.style.gridTemplateColumns = list.length > 3 ? 'repeat(' + list.length + ',minmax(0,1fr))' : '';
    box.innerHTML = list.map((a) => {
      const A = ACTS[a], on = U.act === a;
      let pc = '--';
      if (has) { const pv = SD.engine.previewAttack(m, U.sel, a); pc = pctText(m, pv.chip.p); }
      return '<button class="act' + (on ? ' on' : '') + (has ? '' : ' dis') + '" id="act-' + a + '" data-a="' + a + '" aria-pressed="' + on + '" aria-disabled="' + !has + '">' +
        '<span class="an">' + A.label + '</span><span class="pc">' + (on ? CHK : '') + esc(pc) + '</span><span class="as">' + A.sub + '</span></button>';
    }).join('');
  }

  function drawFoot(U) {
    const m = U.m, q = U.q;
    const ok = q('btn-confirm'), nx = q('btn-next'), back = q('btn-back'), sumEl = q('sum'), ab = q('abil');
    // abilities
    let acts = [];
    try { acts = SD.engine.actives ? SD.engine.actives(m) : []; } catch (e) { acts = []; }
    const canUse = !U.ev && (m.phase === 'attack' || m.phase === 'defend');
    ab.innerHTML = acts.map((a) => '<button class="ab" id="' + (ABIL_ID[a.id] || 'ab-' + String(a.id).toLowerCase()) + '" data-id="' + esc(a.id) + '" aria-disabled="' + !(a.can && canUse) + '"><span>' + esc(a.label) + '</span></button>').join('');
    ab.hidden = !acts.length;
    if (U.ev) {
      const ev = U.ev;
      let line;
      if (ev.goal) line = 'Goal! ' + ev.score.me + '-' + ev.score.opp + '.';
      else if (ev.save) line = 'Saved. Ball stays with Preston.';
      else if (ev.after && ev.after.holder === ev.side && ev.after.zone === ev.zone) line = 'Ball stays in ' + ZN[ev.zone] + (ev.side === 'me' && ev.action === 'pass' ? '. Build +1.' : '.');
      else if (ev.after) line = (ev.after.holder === 'me' ? 'Preston' : clubShort(m)) + ' ball in ' + ZN[ev.after.zone] + '.';
      else line = '';
      const st = stampOf(ev);
      sumEl.innerHTML = '<small>' + st.t + ' · ' + esc((ACTS[ev.action] || { label: ev.action }).label.toUpperCase()) + '</small><b class="sent">' + esc(line) + '</b>';
      ok.hidden = true; nx.hidden = false; back.hidden = true;
      return;
    }
    nx.hidden = true; ok.hidden = false;
    const isReady = !!ready(U) && !U.over;
    back.hidden = !U.sel || !!U.over;
    ok.setAttribute('aria-disabled', isReady ? 'false' : 'true');
    if (isReady) {
      const nm = nameOf(m, U.sel);
      if (m.phase === 'attack') {
        const pv = SD.engine.previewAttack(m, U.sel, U.act);
        sumEl.innerHTML = '<small>' + esc(nm.toUpperCase()) + ' · ' + esc(ACTS[U.act].label.toUpperCase()) + '</small><b>' + esc(pctText(m, pv.chip.p)) + ' to win</b>';
      } else {
        const pv = SD.engine.previewDefend(m, U.sel, U.stance);
        sumEl.innerHTML = '<small>' + esc(nm.toUpperCase()) + ' · ' + U.stance.toUpperCase() + '</small><b>' + esc(pctText(m, pv.chip.p)) + ' to hold</b>';
      }
    } else if (m.phase === 'attack' || m.phase === 'defend') {
      const step = U.sel ? 2 : 1;
      sumEl.innerHTML = '<small>Step ' + step + ' of 3</small><b class="plain">' + (U.sel ? (m.phase === 'attack' ? 'Choose an action' : 'Choose a stance') : (m.phase === 'attack' ? 'Pick a player' : 'Pick a defender')) + '</b>';
    } else sumEl.innerHTML = '';
  }

  function drawOverlays(U) {
    const m = U.m, q = U.q, club = clubShort(m);
    const sc = 'Preston ' + m.score.me + ' - ' + m.score.opp + ' ' + club;
    q('halftime').hidden = m.phase !== 'halftime';
    q('fulltime').hidden = m.phase !== 'full';
    if (m.phase === 'halftime') {
      q('ht-score').textContent = sc;
      q('ht-sub').textContent = club + ' kick off';
    } else if (m.phase === 'full') {
      let res = 'D';
      try { res = SD.engine.summary(m).res; } catch (e) { res = m.score.me > m.score.opp ? 'W' : m.score.me < m.score.opp ? 'L' : 'D'; }
      q('ft-score').textContent = sc;
      const s = q('ft-stamp');
      s.textContent = res === 'W' ? 'WIN' : res === 'L' ? 'LOSS' : 'DRAW';
      s.className = 'stamp ' + (res === 'L' ? 'lose' : 'win');
      q('ft-sub').textContent = res === 'W' ? 'Three points to Preston.' : res === 'L' ? club + ' take it.' : 'Honours even.';
    }
  }

  SD.ui.match = { render };
})();
