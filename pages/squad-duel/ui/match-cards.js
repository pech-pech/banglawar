(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: match-cards maker. Rows 4, 5 (card part), 10 (Winger note, FROM DECK), 15, 16, 21.
  const JOB = { Striker: '+1 Shoot', Winger: '+1 Dribble', Playmaker: '+1 Pass, Thru', Anchor: '+1 Defend' };
  const ALAB = { pass: 'Pass', dribble: 'Dribble', through: 'Through', shoot: 'Shoot', press: 'Press', drop: 'Drop' };
  const STATK = { pass: 'pas', dribble: 'pac', through: 'pas', shoot: 'sho', press: 'def', drop: 'def' };

  function fxInst(m, id, pid) { return (m.fx || []).find((i) => i.id === id && (i.pid || null) === (pid || null)); }
  function usedOf(m, inst) { try { return !!(inst && SD.engine.onceUsed && SD.engine.onceUsed(m, inst)); } catch (e) { return false; } }
  function benchIds(m) { return ((m.setup && m.setup.bench) || []).map((p) => p.id); }

  function cardHTML(U, pid, G) {
    const m = U.m, { P, num } = pdata(m, pid);
    const on = pid === U.sel, isNew = U.ev && U.newIds.includes(pid);
    const row = G && G.rows && G.rows[pid];
    const defTurn = m.phase === 'defend' || (U.ev && U.ev.side === 'opp');
    let lit = '', soft = '';
    if (defTurn) lit = on || (U.ev && U.ev.pid === pid) ? 'def' : '';
    else if (on && U.act) lit = ACTS[U.act].stat;
    if (!lit && row && row.best) soft = STATK[row.best.k] || '';
    // tags: bench, from deck, trait / signature with what they do and "used"
    let tag = '';
    if (benchIds(m).indexOf(pid) >= 0) tag += '<span class="tg bench">BENCH</span>';
    if (!U.ev && m.phase === 'defend' && m.hand.indexOf(pid) < 0) tag += '<span class="tg fd">' + ((m.deck || []).indexOf(pid) >= 0 ? 'FROM DECK' : 'FROM DISCARD') + '</span>';
    const TR = SD.data && SD.data.TRAITS && SD.data.TRAITS[P.role];
    const D = SD.fxDefs || {};
    const fxTag = (id, cls) => {
      const inst = fxInst(m, id, pid), d = D[id];
      const used = usedOf(m, inst);
      const txt = (d && d.short) || id;
      return '<span class="tg ' + cls + (used ? ' used' : '') + '" title="' + esc(txt) + '">' + esc(txt) + (used ? ' <u>used</u>' : '') + '</span>';
    };
    if (P.level >= 2 && TR) tag += fxTag(TR.id, P.role === 'Winger' && !U.ev && m.phase === 'attack' ? 'tr wn' : 'tr');
    if (P.sig && P.sig.id) tag += fxTag(P.sig.id, 'sg');
    else if (P.sig && P.sig.name) tag += '<span class="tg sg">' + esc(P.sig.name) + '</span>';
    let xpbar = '';
    try {
      const S = app().S, o = S && S.owned && S.owned[pid];
      if (o && SD.progress && SD.progress.xpNext) {
        const n = SD.progress.xpNext(o.xp); xpbar = '<span class="xp" role="img" aria-label="XP"><i style="width:' + (n.need ? Math.min(100, n.into / n.need * 100) : 100) + '%"></i></span>';
      }
    } catch (e) { xpbar = ''; }
    const jobOn = P.role === 'Anchor' ? defTurn : !defTurn;
    const job = JOB[P.role] && jobOn ? '<span class="role-job"><i>' + esc(P.role) + ' </i>' + esc(JOB[P.role]) + '</span>' : '';
    let odds = '';
    if (row && row.best) {
      const isTop = G.top && G.top.pid === pid;
      odds = '<span class="odds' + (isTop ? ' top' : '') + '" data-p="' + row.best.p + '">' + (isTop ? '<s aria-label="best pick">&#9733;</s>' : '') + esc((ALAB[row.best.k] || row.best.k) + ' ' + pctText(m, row.best.p)) + '</span>';
    }
    else if (U.ev) odds = '<span class="odds ph" aria-hidden="true">&nbsp;</span>';   // keeps the card height steady on the result
    const isTop = G && G.top && G.top.pid === pid;
    const newLabel = isNew ? (U.newIds.indexOf(pid) > 0 ? '+1 CARD' : 'NEW') : '';
    return '<button class="card' + (on ? ' on' : '') + (isTop ? ' best' : '') + (isNew ? ' fresh' : '') + '" data-pid="' + esc(pid) + '" aria-pressed="' + on + '" aria-label="' + esc(P.name) + ', ' + esc(P.role) + ', level ' + (P.level || 1) + (row && row.best ? ', best ' + (ALAB[row.best.k] || row.best.k) + ' ' + pctNum(row.best.p) : '') + '">' +
      (newLabel ? '<u class="gain">' + newLabel + '</u>' : '') +
      '<span class="nm2">' + esc(P.name) + '</span>' +
      '<span class="rl"><i class="sb">' + esc(num) + '</i><span>' + esc(P.role) + '</span><span class="r2">' + esc(P.rarity) + '</span>' + job + '</span>' +
      '<span class="rar"><i class="gem ' + esc(String(P.rarity).toLowerCase()) + '"></i><span>' + esc(P.rarity) + '</span>' + (on ? CHK : '') + '</span>' +
      odds +
      '<span class="st">' + STATS.map((s) => '<span class="' + (lit === s ? 'hl' : soft === s ? 'hl soft' : '') + '"><em>' + s.toUpperCase() + '</em><b>' + P[s] + '</b></span>').join('') + '</span>' +
      '<span class="lv"><u>LV ' + (P.level || 1) + '</u>' + xpbar + '</span>' + '<span class="tags">' + tag + '</span>' +
      '</button>';
  }

  // result: the drawn card takes the slot the played card left
  function slotOrder(U, ids) {
    try {
      const ev = U.ev, prev = U.prevHand;
      if (!ev || !ev.pid || !prev || !U.newIds.length) return ids;
      const slot = prev.indexOf(ev.pid);
      if (slot < 0) return ids;
      const fresh = U.newIds.filter((p) => ids.indexOf(p) >= 0), keep = ids.filter((p) => fresh.indexOf(p) < 0);
      const out = keep.slice(), pos = Math.min(slot, out.length);
      if (!fresh.length || keep.some((p) => prev.indexOf(p) < 0)) return ids;
      out.splice(pos, 0, fresh[0]);
      fresh.slice(1).forEach((p) => out.push(p));
      return out.length === ids.length ? out : ids;
    } catch (e) { return ids; }
  }

  function names(m, list) {
    return list.map((p) => nameOf(m, p)).sort((a, b) => a.localeCompare(b));
  }

  function sheet(U) {
    const host = U.q('match') || U.el;
    const el = U.q('deck-sheet') || (function () {
      const d = document.createElement('div'); d.id = 'deck-sheet'; d.className = 'ov'; d.hidden = true;
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Deck contents');
      host.appendChild(d); return d;
    })();
    return el;
  }
  function drawSheet(U) {
    const el = sheet(U), m = U.m;
    el.hidden = !U.cards_open;
    if (!U.cards_open) return;
    const row = (t, l) => '<div class="dk-row"><small>' + t + ' (' + l.length + ')</small><p>' + (l.length ? names(m, l).map(esc).join(', ') : 'none') + '</p></div>';
    el.innerHTML = '<div class="ovp dk"><small>Who is left</small>' + row('In deck', m.deck || []) + row('Discard', m.discard || []) +
      '<p class="dk-note">Names A to Z. The draw order stays hidden.</p><button id="deck-close" type="button">Close</button></div>';
  }

  function drawHand(U) {
    const m = U.m, hand = U.q('hand');
    let ids = m.phase === 'defend' && !U.ev ? defCards(m) : m.hand;
    if (U.ev) ids = slotOrder(U, ids.slice());
    let G = null;
    if (!U.ev && (m.phase === 'attack' || m.phase === 'defend')) { try { G = oddsGrid(U); } catch (e) { console.error('cards odds', e); } }
    hand.className = 'h' + ids.length;
    hand.style.gridTemplateColumns = '';
    hand.innerHTML = ids.map((p) => cardHTML(U, p, G)).join('');
    const h1 = U.q('h1t'), h2 = U.q('h2');
    // deck button wraps the deck count (core still writes #deckcount)
    const dc = U.q('deckcount');
    if (dc && !U.q('btn-deck')) {
      const b = document.createElement('button'); b.id = 'btn-deck'; b.type = 'button'; b.setAttribute('aria-label', 'Show who is left in the deck');
      dc.parentNode.insertBefore(b, dc); b.appendChild(dc);
      const hint = document.createElement('small'); hint.textContent = 'tap to view'; b.appendChild(hint);
    }
    if (U.ev) {
      const ev = U.ev;
      const out = ev.pid ? nameOf(m, ev.pid) + ' out' : 'Card kept';
      const inn = U.newIds.length ? ' · ' + U.newIds.map((p) => nameOf(m, p)).join(', ') + ' in' : '';
      h1.innerHTML = '<span><b>Your hand</b> · ' + esc(out + inn) + '</span>';
      h2.innerHTML = '<span><b>Why</b> · cause line</span>';
    } else if (m.phase === 'defend') {
      h1.innerHTML = '<span><b>Your hand</b> · pick your defender</span>';
      h2.innerHTML = '<span><b>2</b> · Choose a stance</span>';
    } else {
      h1.innerHTML = '<span><b>Your hand</b> · pick who takes the ball</span>';
      h2.innerHTML = '<span><b>2</b> · Choose an action' + (m.zone === 2 ? ' · Shoot is open' : '') + '</span>';
    }
    drawSheet(U);
  }

  function click(U, btn) {
    if (!btn) return false;
    if (btn.id === 'btn-deck' || (btn.closest && btn.closest('#btn-deck'))) { U.cards_open = !U.cards_open; drawSheet(U); return true; }
    if (btn.id === 'deck-close') { U.cards_open = false; drawSheet(U); return true; }
    return false;
  }

  SD.ui.mp.cards = { cardHTML, drawHand, click };
})();
