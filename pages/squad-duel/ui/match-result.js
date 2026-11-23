(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: match-result maker. Rows 1, 2, 3, 10 (stamp strip), 13. Exports below are the contract.
  const sg = (v) => (v >= 0 ? '+' + v : '-' + Math.abs(v));
  const cap1 = (s) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);
  const lc = (s) => (s || '').toLowerCase();
  function resultTotals(U) {
    const m = U.m, ev = U.ev, mine = ev.side === 'me';
    const myDie = mine ? ev.dice.att : ev.dice.def, opDie = mine ? ev.dice.def : ev.dice.att;
    // Totals rule (row 1): the attacker's total carries the Press/Drop modifier, same numbers as ev.cause
    let mod = 0, myTot = null, opTot = null, myBase = null, opBase = null;
    if (ev.myScore != null && ev.oppScore != null) {
      if (mine) { mod = ev.gap - (ev.myScore - ev.oppScore); myBase = ev.myScore + mod; opBase = ev.oppScore; }
      else { mod = ev.gap - (ev.oppScore - ev.myScore); opBase = ev.oppScore + mod; myBase = ev.myScore; }
      myTot = myBase + myDie; opTot = opBase + opDie;
    }
    const keeperMe = !mine && !ev.pid;   // club shot: my keeper answers
    const kname = (m.keeper && m.keeper.name) || 'Keeper';
    const myName = mine ? nameOf(m, ev.pid) : (keeperMe ? 'Keeper' : nameOf(m, ev.pid));
    const opShort = mine ? (ev.action === 'shoot' ? 'Keeper' : clubShort(m)) : clubShort(m);
    const opName = mine ? (ev.action === 'shoot' ? 'Keeper' : clubShort(m) + (ev.stance ? ' ' + ev.stance : '')) : clubShort(m);
    return { myDie, opDie, myTot, opTot, myBase, opBase, mod, myName, opName, opShort, kname, keeperMe, mine };
  }
  function stampOf(ev) {
    if (ev.goal === 'me') return { t: 'Goal', c: 'win' };
    if (ev.goal === 'opp') return { t: 'Conceded', c: 'lose' };
    if (ev.save) return { t: 'Saved', c: 'win' };
    if (ev.side === 'opp') return ev.meWon ? { t: 'Held', c: 'win' } : { t: 'Beaten', c: 'lose' };
    return ev.meWon ? { t: 'Won', c: 'win' } : { t: 'Lost', c: 'lose' };
  }

  // row 2: plain statement for tie / natural / stat-edge results
  function oddNote(U, r) {
    const ev = U.ev, T = (U.m.T && U.m.T.die) || 6, da = ev.dice.att, dd = ev.dice.def;
    if ((da === T && dd === 1) || (da === 1 && dd === T)) return 'Natural ' + T + ' beats all';
    if (r.myTot == null) return '';
    if (r.myTot === r.opTot) return ev.win ? 'Tie: attacker wins' : 'Tie: defender wins';
    const wd = ev.win ? da : dd, ld = ev.win ? dd : da;
    if (wd < ld) return 'Stat edge beat the higher die';
    return '';
  }
  function modNote(U, r) {
    if (!r.mod || !U.ev.stance) return '';
    const ev = U.ev, st = cap1(ev.stance);
    return ev.side === 'me' ? clubShort(U.m) + ' ' + st + ': you ' + sg(r.mod) : 'Your ' + st + ': ' + clubShort(U.m) + ' ' + sg(r.mod);
  }

  // row 10: one chip per fx that fired; rerolls show the old die struck through
  function fxChips(U) {
    const ev = U.ev, D = SD.fxDefs || {}, out = [];
    (ev.fxFired || []).forEach((id) => {
      const d = D[id] || {}, rr = (ev.rerolls || []).filter((x) => x.by === id);
      if (rr.length) {
        const f = rr[0].from, t = rr[rr.length - 1].to;
        out.push('<span class="fxc">' + esc(d.name || id) + ' reroll <s>' + f + '</s> to <b>' + t + '</b></span>');
      } else out.push('<span class="fxc">' + esc(String(d.short || d.name || id).replace(': ', ' ')) + '</span>');
    });
    return out.join('');
  }
  function rerollOld(ev, who) {
    const rr = (ev.rerolls || []).filter((x) => x.who === who);
    return rr.length ? rr[0].from : null;
  }
  function dieSub(base, die, old) {
    return (base == null ? '' : base + ' + ') + (old != null ? '<s>' + old + '</s> ' : '') + die;
  }

  function drawBand(U) {
    const m = U.m, box = U.q('band');
    if (U.ev) {
      const ev = U.ev, r = resultTotals(U), st = stampOf(ev);
      const myWho = r.mine ? 'att' : 'def', opWho = r.mine ? 'def' : 'att';
      const notes = [modNote(U, r), oddNote(U, r)].filter(Boolean);
      const chips = fxChips(U);
      box.innerHTML = '<div class="res rz"><div class="side you">' + die(r.myDie, '#2cf0ff') + '<div class="tx"><small>' + esc(r.myName.toUpperCase()) + '</small><b id="band-my-tot">' + (r.myTot == null ? '' : r.myTot) + '</b><small>' + dieSub(r.myBase, r.myDie, rerollOld(ev, myWho)) + '</small></div></div>' +
        '<div class="stamp ' + st.c + '" id="band-stamp">' + st.t + '</div>' +
        '<div class="side opp">' + die(r.opDie, '#ff8aa0') + '<div class="tx"><small>' + esc(r.opShort.toUpperCase()) + '</small><b id="band-op-tot">' + (r.opTot == null ? '' : r.opTot) + '</b><small>' + dieSub(r.opBase, r.opDie, rerollOld(ev, opWho)) + '</small></div></div></div>' +
        '<div class="rz-note" id="band-note"' + (notes.length ? '' : ' hidden') + '>' + esc(notes.join(' · ')) + '</div>' +
        '<div class="rz-fx" id="fx-strip"' + (chips ? '' : ' hidden') + '>' + chips + '</div>';
      return;
    }
    if (m.phase === 'attack' && U.sel && U.act) box.innerHTML = SD.ui.mp.acts.chipHTML(U);
    else if (m.phase === 'defend' && U.sel && U.stance) box.innerHTML = SD.ui.mp.acts.chipHTML(U);
    else if (m.phase === 'attack') box.innerHTML = '<div class="hint">' + (U.sel ? 'Choose an action. Odds count the defender\'s Press/Drop guess.' : 'Your turn. Pick a player, then an action. Odds count the defender\'s Press/Drop guess.') + '</div>';
    else if (m.phase === 'defend') box.innerHTML = '<div class="hint">' + esc(clubShort(m)) + ' attack: pick a defender card and a stance</div>';
    else box.innerHTML = '';
  }

  // row 3: plain-words cause built on screen from ev fields; ev.cause is left alone
  function sideLine(who, parts, score, tot, d, stanceTxt, old) {
    const arr = Array.isArray(parts) ? parts : [];
    const ps = arr.reduce((a, p) => a + (+p.v || 0), 0);
    let txt;
    if (arr.length && ps === score) {
      const main = arr[0], extra = arr.slice(1);
      txt = esc(String(main.k).split(' ').pop()) + ' ' + main.v;
      if (extra.length === 1) txt += ' ' + (extra[0].v < 0 ? '- ' : '+ ') + esc(lc(extra[0].k)) + ' ' + Math.abs(extra[0].v);
      else if (extra.length > 1) { const e = extra.reduce((a, p) => a + (+p.v || 0), 0); txt += ' ' + (e < 0 ? '- ' : '+ ') + 'bonus ' + Math.abs(e); }
    } else txt = 'score ' + score;
    if (stanceTxt) txt += ' ' + stanceTxt;
    txt += ' + die ' + (old != null ? '<s>' + old + '</s> ' : '') + d;
    return '<div class="ln2"><span class="who">' + esc(who) + '</span> ' + txt + ' = <b>' + tot + '</b></div>';
  }
  function drawCause(U) {
    const box = U.q('acts'), m = U.m, ev = U.ev, r = resultTotals(U);
    box.className = '';
    box.style.gridTemplateColumns = '';
    const L = (ACTS[ev.action] || { label: ev.action }).label, club = clubShort(m);
    let head, lines = '';
    const tail = String(ev.cause || '').split('. ').slice(1).join('. ');
    if (r.myTot == null) head = esc(ev.cause || '');
    else {
      const mt = r.myTot, ot = r.opTot;
      if (ev.side === 'me') head = ev.meWon ? r.myName + ' won the ' + L + ', ' + mt + ' to ' + ot + '.' : (ev.action === 'shoot' ? r.opShort + ' saved it' : club + ' stopped the ' + L) + ', ' + ot + ' to ' + mt + '.';
      else if (r.keeperMe) head = ev.meWon ? 'Keeper ' + r.kname + ' saved it, ' + mt + ' to ' + ot + '.' : club + ' scored past ' + r.kname + ', ' + ot + ' to ' + mt + '.';
      else head = ev.meWon ? r.myName + ' stopped the ' + L + ', ' + mt + ' to ' + ot + '.' : club + ' beat ' + r.myName + ' with the ' + L + ', ' + ot + ' to ' + mt + '.';
      head = esc(head);
      const stT = r.mod ? (r.mod < 0 ? '- ' : '+ ') + Math.abs(r.mod) + ' ' + cap1(ev.stance) : '', stMe = ev.side === 'me' ? stT : '', stOp = ev.side === 'opp' ? stT : '';
      const myWho = r.mine ? 'att' : 'def', opWho = r.mine ? 'def' : 'att';
      const myLbl = r.keeperMe ? 'Keeper ' + r.kname : r.myName, opLbl = ev.side === 'me' ? (ev.action === 'shoot' ? 'Keeper' : club) : club;
      lines = sideLine(myLbl, ev.parts, ev.myScore, mt, r.myDie, stMe, rerollOld(ev, myWho)) +
        sideLine(opLbl, ev.oppParts, ev.oppScore, ot, r.opDie, stOp, rerollOld(ev, opWho));
    }
    const odd = [oddNote(U, r), tail].filter(Boolean).join('. ');
    box.innerHTML = '<div class="cause rzc"><div class="k">Why</div><div class="rzp"><p class="hd"><span id="cause-plain">' + head + '</span></p>' + lines +
      (odd ? '<div class="ln2 odd">' + esc(odd) + (/[.!]$/.test(odd) ? '' : '.') + '</div>' : '') + '</div></div>';
  }

  function drawFoot(U) {
    const m = U.m, q = U.q;
    const ok = q('btn-confirm'), nx = q('btn-next'), back = q('btn-back'), sumEl = q('sum');
    if (U.ev) {
      const ev = U.ev;
      let line;
      if (ev.goal === 'opp') line = 'Conceded. ' + ev.score.me + '-' + ev.score.opp + '.';
      else if (ev.goal) line = 'Goal! ' + ev.score.me + '-' + ev.score.opp + '.';
      else if (ev.side === 'opp' && ev.after && !ev.save) line = ev.after.holder === 'opp' ? clubShort(m) + ' keep the ball' + (ev.after.zone !== ev.zone ? ' in ' + ZN[ev.after.zone] : '') + ', you defend again.' : 'You win the ball in ' + ZN[ev.after.zone] + '. Your turn to attack.';
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
