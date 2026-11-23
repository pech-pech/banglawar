(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: match-frame maker. Rows 6, 14, 18, 20, 22 (+ ui/scene.js, css/match.css, css/scene.css).
  const ACT_NAME = { pass: 'Pass', dribble: 'Dribble', through: 'Through', shoot: 'Shoot' };
  // short, readable form of the formation effect (full sentence stays in title / aria-label)
  function shortFx(f) {
    const o = [];
    Object.keys(f.defVs || {}).forEach((k) => o.push('+' + f.defVs[k] + ' v ' + (ACT_NAME[k] || k)));
    Object.keys(f.att || {}).forEach((k) => o.push('+' + f.att[k] + ' ' + (ACT_NAME[k] || k)));
    return o.join(' ');
  }
  // which side the screen is about right now: result of a play wins over phase
  function sideOf(U) {
    const m = U.m;
    if (U.ev) return U.ev.side === 'opp' ? 'opp' : 'me';
    return m.phase === 'defend' ? 'opp' : 'me';
  }
  function keeperOf(U) {
    const m = U.m;
    if (U.ev) return U.ev.side === 'opp' && !U.ev.pid;
    if (m.phase !== 'defend') return false;
    try { return SD.clubAI.weights(m.club, m.zone, m.score.opp < m.score.me, m.T).shoot > 0; } catch (e) { return false; }
  }
  function turnPips(m, U) {
    const per = (m.T && m.T.halfTurns) || 6;
    let done = m.phase === 'full' ? per * 2 : m.phase === 'halftime' ? per : (m.turnNo || m.turn) - 1 + (U && U.ev ? 1 : 0);
    const cur = (m.phase === 'halftime' || m.phase === 'full' || (U && U.ev)) ? -1 : done;
    let o = '<span class="tp" id="turn-pips" aria-hidden="true">';
    for (let i = 0; i < per * 2; i++) o += '<i class="' + (i < done ? 'f' : i === cur ? 'c' : '') + (i === per ? ' hs' : '') + '"></i>';
    return o + '</span>';
  }
  function drawInfo(U) {
    const m = U.m, T = m.T || {}, roarN = T.roarAt || 3, bMax = T.buildMax || 2, per = T.halfTurns || 6;
    const f = SD.data && SD.data.FORMATIONS && SD.data.FORMATIONS[m.setup && m.setup.formation];
    const fname = (m.setup && m.setup.formation) || '';
    const bside = m.holder === 'me' ? 'me' : 'opp';
    const club = clubShort(m), side = sideOf(U), mm = U.q('match') || U.el.querySelector('#match');
    if (mm) { mm.dataset.side = side; mm.dataset.keeper = keeperOf(U) ? '1' : '0'; }
    const over = m.phase === 'halftime' || m.phase === 'full';
    const label = m.phase === 'halftime' ? 'HALF TIME' : m.phase === 'full' ? 'FULL TIME'
      : (m.half === 2 ? '2ND' : '1ST') + ' HALF, TURN ' + Math.min(m.turn, per) + ' OF ' + per;
    const rib = over ? (m.phase === 'halftime' ? 'Half time' : 'Full time')
      : side === 'opp' ? 'DEFEND: ' + club + ' have the ball' : 'ATTACK: Preston have the ball';
    const mode = (m.setup && m.setup.mode) ? String(m.setup.mode).toUpperCase() : '';
    const ful = f ? fname.toUpperCase() + ': ' + f.text : '';
    const inf = U.q('info');
    inf.className = mode ? 'hm' : '';
    inf.innerHTML =
      '<span class="turn" id="turn-label">' + esc(label) + '</span>' + turnPips(m, U) +
      '<span class="' + (over ? 'neu' : side) + '" id="ribbon">' + esc(rib) + '</span><span id="mode-label"' + (mode ? '' : ' hidden') + '>' + esc(mode) + '</span>' +
      (f ? '<span class="tag" title="' + esc(ful) + '" aria-label="' + esc(ful) + '"><b>' + esc(fname.toUpperCase()) + '</b> ' + esc(shortFx(f)) + '</span>' : '<span class="tag"></span>') +
      '<div class="gb' + (m.roarReady ? ' ready' : '') + '" id="roar"><span class="lbl"><span class="hm">Home </span>Roar</span> ' + pips(m.roarReady ? roarN : m.crowd, roarN) + (m.roarReady ? '<span>+1</span>' : '') + '</div>' +
      '<div class="gb bd" id="build" aria-label="' + (bside === 'me' ? 'Your' : esc(club)) + ' build"><span class="lbl">Build</span> ' + pips(m.build[bside], bMax) + '<span class="dim mx">max ' + bMax + '</span></div>';
  }

  function drawOverlays(U) {
    const m = U.m, q = U.q, club = clubShort(m);
    const sc = 'Preston ' + m.score.me + ' - ' + m.score.opp + ' ' + club;
    q('halftime').hidden = m.phase !== 'halftime';
    q('fulltime').hidden = m.phase !== 'full';
    let d = 0, sv = 0;
    try { Object.keys(m.stats || {}).forEach((k) => { d += m.stats[k].duelsWon || 0; sv += m.stats[k].saves || 0; }); } catch (e) { /* summary is optional */ }
    const line = (pre) => pre + d + ' duel' + (d === 1 ? '' : 's') + ' won, ' + sv + ' save' + (sv === 1 ? '' : 's') + '.';
    const setP = (id, t) => { const e = q(id); if (e) e.textContent = t; };
    if (m.phase === 'halftime') {
      q('ht-score').textContent = sc;
      q('ht-sub').textContent = club + ' kick off, so you defend first. ' + line('1st half: ');
    } else if (m.phase === 'full') {
      let res = 'D';
      try { res = SD.engine.summary(m).res; } catch (e) { res = m.score.me > m.score.opp ? 'W' : m.score.me < m.score.opp ? 'L' : 'D'; }
      q('ft-score').textContent = sc;
      const s = q('ft-stamp');
      s.textContent = res === 'W' ? 'WIN' : res === 'L' ? 'LOSS' : 'DRAW';
      s.className = 'stamp ' + (res === 'L' ? 'lose' : 'win');
      q('ft-sub').textContent = (res === 'W' ? 'Three points to Preston. ' : res === 'L' ? club + ' take it. ' : 'Honours even. ') + line('Match: ');
    }
  }

  SD.ui.mp.frame = { drawInfo, drawOverlays, click: null };
})();
