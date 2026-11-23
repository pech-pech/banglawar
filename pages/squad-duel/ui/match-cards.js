(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: match-cards maker. Rows 4, 5 (card part), 10 (Winger note, FROM DECK), 15, 16, 21.
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

  SD.ui.mp.cards = { cardHTML, drawHand, click: null };
})();
