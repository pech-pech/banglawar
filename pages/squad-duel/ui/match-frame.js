(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: match-frame maker. Rows 6, 14, 18, 20, 22 (+ ui/scene.js, css/match.css, css/scene.css).
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

  SD.ui.mp.frame = { drawInfo, drawOverlays, click: null };
})();
