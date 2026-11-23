(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: match-acts maker. Rows 5 (tile part), 7, 8, 9, 11, 12, 17.
  function drawTell(U) {
    const m = U.m, box = U.q('tell');
    if (U.ev) { box.innerHTML = playedTell(U); return; }   // row 12: the turn just played, not the next one
    if (m.phase === 'defend') { box.innerHTML = defendTell(U); return; }
    if (m.phase === 'halftime' || m.phase === 'full') { return; }
    const tl = tellOf(m), d = tl.defender || { name: '?', zone: m.zone, press: 0 };
    const act = U.act, keeperAct = act === 'shoot';
    const defVal = keeperAct ? (m.cs && m.cs.keeper) : (m.cs && m.cs.def);
    const defName = keeperAct && m.club.keeper ? m.club.keeper.name : d.name;
    const P = Math.round((tl.pressW != null ? tl.pressW : d.press) * 100), D = 100 - P;
    const showBar = m.zone < 2 && act !== 'pass' && act !== 'shoot';
    let bar = '';
    if (showBar) {
      if (tl.exact) bar = '<div class="stance one" role="img" aria-label="Stance known: ' + tl.exact + '"><div class="seg ' + tl.exact + '">' + esc(d.name) + (tl.exact === 'press' ? ' presses' : ' drops') + ' (read)</div></div>';
      else if (P <= 0 || P >= 100) bar = '<div class="stance one"><div class="seg ' + (P >= 100 ? 'press' : 'drop') + '">' + (P >= 100 ? 'Presses 100%' : 'Drops 100%') + '</div></div>';
      else bar = '<div class="stance" style="grid-template-columns:minmax(max-content,' + P + 'fr) minmax(max-content,' + D + 'fr)" role="img" aria-label="' + esc(d.name) + ' presses ' + P + ' percent of the time, drops ' + D + '"><div class="seg press" style="grid-column:1">Presses ' + P + '%</div><div class="seg drop">Drops ' + D + '%</div></div>';
    }
    let tags = '';
    if (tl.clubPick) tags += '<span class="df tg">Club plays: ' + esc((ACTS[tl.clubPick] || { label: tl.clubPick }).label) + '</span>';
    box.innerHTML = '<div class="who"><span class="k">Facing</span><span><span class="nn">' + esc(ZN[d.zone] != null ? ZN[d.zone] : '') + '</span>' + esc(defName) + '</span><span class="df">' + (keeperAct ? 'SAVE ' : 'DEF ') + esc(defVal) + '</span>' + tags + '</div>' + bar;
  }


  const cap1 = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  // Row 12 + row 8: Facing row of a result = the duel just played (ev), never the next turn.
  function playedTell(U) {
    const m = U.m, ev = U.ev;
    if (ev.side === 'me') {
      const keeperAct = ev.action === 'shoot';
      let d = { name: '?', zone: ev.zone };
      try { d = SD.clubAI.defender(m.club, ev.zone) || d; } catch (e) { /* keep fallback */ }
      const nm = keeperAct && m.club.keeper ? m.club.keeper.name : d.name;
      const st = ev.clubStance;
      let bar = '';
      if (!keeperAct && st) bar = '<div class="stance one" role="img" aria-label="' + esc(d.name) + ' ' + esc(st === 'press' ? 'pressed' : 'dropped') + '"><div class="seg ' + st + '">' + esc(d.name) + (st === 'press' ? ' pressed' : ' dropped') + '</div></div>';
      return '<div class="who"><span class="k">' + (keeperAct ? 'Keeper' : 'Facing') + '</span><span>' + (keeperAct ? '' : '<span class="nn">' + esc(ZN[ev.zone] != null ? ZN[ev.zone] : '') + '</span>') + esc(nm) + '</span><span class="df">' + (keeperAct ? 'SAVE ' : 'DEF ') + esc(ev.oppScore) + '</span></div>' + bar;
    }
    const keeperShot = !ev.pid;
    const act = (ACTS[ev.action] || { label: ev.action }).label.replace(' ball', '');
    let bar = '';
    if (!keeperShot && ev.stance) bar = '<div class="stance wb" style="grid-template-columns:1fr 1fr" role="img" aria-label="Club played ' + esc(act) + ', you played ' + esc(ev.stance) + '"><div class="seg w-' + esc(ev.action) + '">Club: ' + esc(act) + '</div><div class="seg ' + (ev.stance === 'press' ? 'press' : 'drop') + '" style="justify-content:flex-end">You: ' + esc(cap1(ev.stance)) + '</div></div>';
    else if (keeperShot) bar = '<div class="stance one" role="img" aria-label="Club shot, keeper answered"><div class="seg w-shoot">Club shot: keeper answered</div></div>';
    return '<div class="who"><span class="k">' + (keeperShot ? 'Keeper' : 'Club attack') + '</span><span>' + esc(keeperShot ? nameOf(m, m.keeper && m.keeper.id) : clubShort(m)) + '</span><span class="df">' + (keeperShot ? 'SAVE ' : 'ATK ') + esc(keeperShot ? ev.myScore : ev.oppScore) + '</span></div>' + bar;
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
        if (v > 0) { cols.push('minmax(0,' + v + 'fr)'); segs += '<div class="seg w-' + a + '">' + esc(ACTS[a].label.replace('Through ball', 'Thru').replace(' ball', '')) + ' ' + v + '%</div>'; }
      });
    }
    const bar = segs ? '<div class="stance wb" style="grid-template-columns:' + cols.join(' ') + '" role="img" aria-label="' + esc(text) + '">' + segs + '</div>' : '<div class="who">' + esc(text) + '</div>';
    let tags = '';
    if (tl.clubPick) tags += '<span class="df tg">Club plays: ' + esc((ACTS[tl.clubPick] || { label: tl.clubPick }).label) + '</span>';
    return '<div class="who"><span class="k ck">Club picks</span><span>' + esc(clubShort(m)) + '</span><span class="df">ATK ' + esc(m.cs && m.cs.atk) + '</span>' + tags + '</div>' + bar;
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
        const dn = (tellOf(m).defender || {}).name || 'he';
        split = '<div class="ln dim split"><span>If ' + esc(dn) + ' presses (' + Math.round(c.pressW * 100) + '% likely): <b>' + pctText(m, c.pPress) + '</b></span><span>If he drops: <b>' + pctText(m, c.pDrop) + '</b></span></div>';
      }
      const tags = (pv.tags || []).map((t) => '<span class="df tg">' + esc(t) + '</span>').join('');
      return '<div class="chip"><div class="rows"><div class="ln">' + pl.line + '</div><div class="ln">' + oppTxt + '</div>' +
        (capNote ? '<div class="ln capn"><b>' + esc(capNote) + '</b>' + (pl.cap ? ' (' + pl.cap + ')' : '') + '</div>' : '') + split + (tags ? '<div class="ln">' + tags + '</div>' : '') +
        '</div><div class="od"><b id="odds">' + esc(pctText(m, c.p)) + '</b><small>to win</small></div></div>';
    }
    const pv = SD.engine.previewDefend(m, U.sel, U.stance);
    const pl = partsLine(pv.parts, pv.myDef);
    const rows = (pv.rows || []).map((r) => '<span>If ' + esc((ACTS[r.action] || { label: r.action }).label.replace(' ball', '')) + ' ' + Math.round((r.w || 0) * 100) + '%: <b>' + pctText(m, r.p) + '</b></span>').join('<span>·</span>');
    const tags = (pv.tags || []).map((t) => '<span class="df tg">' + esc(t) + '</span>').join('');
    return '<div class="chip"><div class="rows"><div class="ln">' + pl.line + '</div><div class="ln">v <b>' + esc(clubShort(m)) + ' ATK ' + esc(m.cs && m.cs.atk) + '</b></div>' +
      (rows ? '<div class="ln dim">' + rows + '</div>' : '') + (tags ? '<div class="ln">' + tags + '</div>' : '') +
      '</div><div class="od"><b id="odds">' + esc(pctText(m, pv.chip.p)) + '</b><small>to hold</small></div></div>';
  }

  // ---- row 5 (tile), 7, 8, 11: action / stance tiles
  const ROLE_FOR = { pass: 'Playmaker', through: 'Playmaker', dribble: 'Winger', shoot: 'Striker' };
  const CLUB_ACT = (a) => (ACTS[a] || { label: a }).label.replace(' ball', '');
  const num = (p) => Math.round(p * 100);

  function strip(U) {
    const m = U.m, z = m.zone;
    const labs = ['Def', 'Mid', 'Att'];
    const trk = '<div id="zone-track" role="img" aria-label="' + (m.phase === 'defend' ? 'Club attack is in ' : 'Ball is in ') + esc(ZN[z]) + '">' +
      labs.map((l, i) => '<span class="zt' + (i === z ? ' on' : '') + (i < z ? ' past' : '') + '">' + l + '</span>').join('<i aria-hidden="true">&gt;</i>') + '</div>';
    let note = '';
    if (m.phase === 'defend') {
      const at = U.el.querySelector('#match').dataset.keeper;
      let keeper = at === '1';
      if (at == null) { try { keeper = SD.clubAI.weights(m.club, m.zone, m.score.opp < m.score.me, m.T || {}).shoot > 0; } catch (e) { keeper = false; } }
      if (keeper && m.keeper) note = '<div id="keeper-note">If they shoot, keeper <b>' + esc(m.keeper.name) + ' ' + esc(m.keeper.def) + '</b> answers: your card and stance do not matter.</div>';
    }
    return '<div id="act-strip">' + trk + note + '</div>';
  }

  function drawActs(U) {
    const m = U.m, box = U.q('acts');
    const has = !!U.sel;
    let G = { rows: {}, top: null };
    try { G = oddsGrid(U); } catch (e) { console.error('oddsGrid', e); }
    if (m.phase === 'defend') {
      box.className = 'two'; box.style.gridTemplateColumns = '';
      const pid = U.sel || (G.top && G.top.pid) || Object.keys(G.rows)[0];
      const pv = {};
      ['press', 'drop'].forEach((s) => { try { if (pid) pv[s] = SD.engine.previewDefend(m, pid, s); } catch (e) { pv[s] = null; } });
      const pp = {};
      ['press', 'drop'].forEach((s) => {
        if (has && pv[s]) pp[s] = pv[s].chip.p;
        else { let b = null; Object.keys(G.rows).forEach((k) => { const v = G.rows[k].opts[s]; if (v != null && (b == null || v > b)) b = v; }); pp[s] = b; }
      });
      const diff = (pp.press != null && pp.drop != null) ? num(pp.press) - num(pp.drop) : null;
      box.innerHTML = strip(U) + ['press', 'drop'].map((s) => {
        const on = U.stance === s, o = s === 'press' ? 'drop' : 'press';
        const pc = pp[s] != null ? pctText(m, pp[s]) : '--';
        let dl = '';
        if (diff != null) dl = diff === 0 ? '<span class="dl same">Same odds</span>' : '<span class="dl ' + ((s === 'press' ? diff : -diff) > 0 ? 'up' : 'dn') + '">' + ((s === 'press' ? diff : -diff) > 0 ? '+' : '-') + Math.abs(diff) + ' v ' + (o === 'press' ? 'Press' : 'Drop') + '</span>';
        const all = pv[s] && pv[s].rows ? pv[s].rows : [];
        let rows = all.filter((r) => r.action === 'dribble' || r.action === 'through');
        if (rows.length < 2) rows = all.slice().sort((a, b) => b.w - a.w).slice(0, 2);
        const vs = rows.map((r) => esc(CLUB_ACT(r.action)) + ' <b>' + num(r.p) + '</b>').join(' · ');
        return '<button class="act' + (on ? ' on' : '') + (has ? '' : ' dis') + '" id="st-' + s + '" data-st="' + s + '" aria-pressed="' + on + '" aria-disabled="' + !has + '">' +
          '<span class="an">' + (s === 'press' ? 'Press' : 'Drop') + '</span><span class="pc">' + (on ? CHK : '') + esc(pc) + dl + '</span>' +
          '<span class="as">' + (s === 'press' ? 'Beats Dribble' : 'Beats Through') + '</span>' +
          '<span class="vs" title="' + (s === 'press' ? 'Loses to Through' : 'Loses to Dribble') + '">' + vs + '</span></button>';
      }).join('');
      return;
    }
    if (m.phase !== 'attack') { box.innerHTML = ''; return; }
    const list = legalFor(U, U.sel);
    const row = has ? G.rows[U.sel] : null;
    const P = has && m.cards ? m.cards[U.sel] : null;
    // close call: the top two options of the picked card are within 5 points -> dot on both
    let closeSet = {};
    if (row && row.close) Object.keys(row.opts).sort((x, y) => row.opts[y] - row.opts[x]).slice(0, 2).forEach((k) => { closeSet[k] = 1; });
    box.className = 'four'; box.style.gridTemplateColumns = '';
    box.innerHTML = strip(U) + ['pass', 'dribble', 'through', 'shoot'].map((a) => {
      const A = ACTS[a], on = U.act === a, legal = list.includes(a);
      let p = null;
      if (legal) {
        if (row) p = row.opts[a];
        else { Object.keys(G.rows).forEach((k) => { const v = G.rows[k].opts[a]; if (v != null && (p == null || v > p)) p = v; }); }
      }
      const pc = p != null ? pctText(m, p) : '--';
      if (!legal) {
        const sub = a === 'shoot' ? 'Att only' : 'Def/Mid';
        return '<button class="act dis lock" id="act-' + a + '" aria-pressed="false" aria-disabled="true" aria-label="' + esc(A.label) + (a === 'shoot' ? ': from Attack' : ': not in Attack') + '"><span class="an">' + A.label.replace(' ball', '') + '</span><span class="pc">--</span><span class="as">' + sub + '</span></button>';
      }
      const role = P && P.role === ROLE_FOR[a];
      return '<button class="act' + (on ? ' on' : '') + (has ? '' : ' dis') + (closeSet[a] ? ' close' : '') + '" id="act-' + a + '" data-a="' + a + '" aria-pressed="' + on + '" aria-disabled="' + !has + '">' +
        (closeSet[a] ? '<i class="cc" title="Close call: next best option is within 5 points" aria-label="close call"></i>' : '') +
        (role ? '<span class="rb">+1 role</span>' : '') +
        '<span class="an">' + A.label.replace(' ball', '') + '</span><span class="pc">' + (on ? CHK : '') + esc(pc) + '</span><span class="as">' + A.sub + '</span></button>';
    }).join('');
  }

  // ---- row 17: abilities say what they do, once / used; flash after use
  const ABIL_TXT = { A1: 'see stance', S1: 'redraw hand' };
  function abilUsed(m, id) {
    try { const inst = m.fx.find((x) => x.id === id); return !!(inst && SD.engine.onceUsed && SD.engine.onceUsed(m, inst)); } catch (e) { return false; }
  }
  function drawAbil(U) {
    const m = U.m, ab = U.q('abil');
    let acts = [];
    try { acts = SD.engine.actives ? SD.engine.actives(m) : []; } catch (e) { acts = []; }
    const canUse = !U.ev && (m.phase === 'attack' || m.phase === 'defend');
    const fl = U.acts_flash;
    ab.innerHTML = acts.map((a) => {
      const used = abilUsed(m, a.id), ok = a.can && canUse;
      const hint = ABIL_TXT[a.id] || 'special';
      const flashing = fl && fl.id === a.id;
      const sm = flashing ? fl.html : used ? 'used' : ok ? '<span class="w">' + esc(hint) + ' · </span>once' : (m.phase === 'defend' && a.id === 'A1' ? '<span class="w">attack turns </span>only' : 'not now');
      return '<button class="ab' + (used ? ' used' : '') + (flashing ? ' flash' : '') + '" title="' + esc(a.label + ': ' + hint + ', once per match') + '" id="' + (ABIL_ID[a.id] || 'ab-' + String(a.id).toLowerCase()) + '" data-id="' + esc(a.id) + '" aria-disabled="' + !ok + '"><span class="abn">' + esc(a.label) + '</span><span class="abs">' + sm + '</span></button>';
    }).join('');
    ab.hidden = !acts.length;
  }

  function click(U, btn) {
    if (!btn.classList.contains('ab') || !U.api || !U.api.useAbility) return false;
    if (U.busy || U.over || U.ev) return true;
    const id = btn.dataset.id, m = U.m;
    const a = SD.engine.actives(m).find((x) => x.id === id);
    if (!a || !a.can) return true;
    const before = m.hand.slice();
    U.api.useAbility(U, id);
    let text = 'used';
    if (id === 'S1') {
      const nw = m.hand.filter((p) => !before.includes(p)).map((p) => nameOf(m, p));
      text = nw.length ? 'Redrawn<span class="w">: ' + esc(nw.join(', ')) + '</span>' : 'Hand redrawn';
    } else if (id === 'A1') {
      const st = tellOf(m).exact;
      text = st ? 'Stance: ' + esc(cap1(st)) : 'Stance seen';
    }
    U.acts_flash = { id, html: text };
    clearTimeout(U.acts_flashT);
    U.acts_flashT = setTimeout(() => { U.acts_flash = null; if (!U.ev && U.el.isConnected && U.api.draw) U.api.draw(U); }, 2600);
    if (U.api.draw) U.api.draw(U);
    return true;
  }

  SD.ui.mp.acts = { drawTell, chipHTML, partsLine, drawActs, drawAbil, click };
})();
