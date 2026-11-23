(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: match-result maker. Rows 1, 2, 3, 10 (stamp strip), 13. Exports below are the contract.
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
    if (m.phase === 'attack' && U.sel && U.act) box.innerHTML = SD.ui.mp.acts.chipHTML(U);
    else if (m.phase === 'defend' && U.sel && U.stance) box.innerHTML = SD.ui.mp.acts.chipHTML(U);
    else if (m.phase === 'attack') box.innerHTML = '<div class="hint">' + (U.sel ? 'Choose an action. Odds are exact.' : 'Your turn. Pick a player, then an action. Odds are exact.') + '</div>';
    else if (m.phase === 'defend') box.innerHTML = '<div class="hint">' + esc(clubShort(m)) + ' attack: pick a defender card and a stance</div>';
    else box.innerHTML = '';
  }

  function drawCause(U) {
    const box = U.q('acts');
    box.className = '';
    box.style.gridTemplateColumns = '';
    box.innerHTML = '<div class="cause"><div class="k">Cause</div><p><span id="cause">' + esc(U.ev.cause || '') + '</span></p></div>';
  }

  function drawFoot(U) {
    const m = U.m, q = U.q;
    const ok = q('btn-confirm'), nx = q('btn-next'), back = q('btn-back'), sumEl = q('sum');
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

  SD.ui.mp.result = { resultTotals, stampOf, drawBand, drawCause, drawFoot, click: null };
})();
