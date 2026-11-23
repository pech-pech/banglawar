(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: match-acts maker. Rows 5 (tile part), 7, 8, 9, 11, 12, 17.
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

  function drawActs(U) {
    const m = U.m, box = U.q('acts');
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

  function drawAbil(U) {
    const m = U.m, ab = U.q('abil');
    let acts = [];
    try { acts = SD.engine.actives ? SD.engine.actives(m) : []; } catch (e) { acts = []; }
    const canUse = !U.ev && (m.phase === 'attack' || m.phase === 'defend');
    ab.innerHTML = acts.map((a) => '<button class="ab" id="' + (ABIL_ID[a.id] || 'ab-' + String(a.id).toLowerCase()) + '" data-id="' + esc(a.id) + '" aria-disabled="' + !(a.can && canUse) + '"><span>' + esc(a.label) + '</span></button>').join('');
    ab.hidden = !acts.length;
  }

  SD.ui.mp.acts = { drawTell, chipHTML, partsLine, drawActs, drawAbil, click: null };
})();
