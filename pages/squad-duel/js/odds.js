(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // The single resolve rule: natural max v natural 1 wins for the roller, natural 1 v max loses; else gap+da-db (>0, or >=0 if tieAtt).
  function attWins(gap, da, db, tieAtt, dieN) {
    dieN = dieN || 6;
    if (da === dieN && db === 1) return true;
    if (da === 1 && db === dieN) return false;
    const d = gap + da - db;
    return tieAtt ? d >= 0 : d > 0;
  }

  const cache = {};
  function duel(gap, tieAtt, dieN) {
    dieN = dieN || 6; tieAtt = !!tieAtt;
    const k = dieN + ':' + (tieAtt ? 1 : 0) + ':' + gap;
    if (cache[k] !== undefined) return cache[k];
    let w = 0;
    for (let a = 1; a <= dieN; a++) for (let b = 1; b <= dieN; b++) if (attWins(gap, a, b, tieAtt, dieN)) w++;
    return (cache[k] = w / (dieN * dieN));
  }

  function table(dieN) {
    const out = [];
    for (let g = -4; g <= 5; g++) out.push({ gap: g, p: duel(g, false, dieN) });
    return out;
  }

  // attacker-gap terms (+ helps attacker)
  function stanceMod(action, stance) {
    if (action === 'dribble') return stance === 'press' ? -1 : stance === 'drop' ? 1 : 0;
    if (action === 'through') return stance === 'press' ? 1 : stance === 'drop' ? -1 : 0;
    return 0;
  }

  function attackChip(gap, action, pressW, opts) {
    opts = opts || {};
    let w = pressW == null ? 0.5 : pressW;
    if (opts.exactStance === 'press') w = 1;
    else if (opts.exactStance === 'drop') w = 0;
    const mp = opts.ignorePress ? 0 : stanceMod(action, 'press');
    const md = stanceMod(action, 'drop');
    const pPress = duel(gap + mp, opts.tieAtt, opts.dieN);
    const pDrop = duel(gap + md, opts.tieAtt, opts.dieN);
    return { p: w * pPress + (1 - w) * pDrop, pPress, pDrop, pressW: w };
  }

  // rows: [{action, w, gap, tieAtt?}]; gap = club attacker gap incl. my stance mod. p = P(I, the defender, win).
  function defendChip(rows, opts) {
    opts = opts || {};
    let tw = 0, tp = 0;
    const acc = {};
    (rows || []).forEach(function (r) {
      const w = r.w == null ? 1 : r.w;
      const pd = 1 - duel(r.gap, r.tieAtt != null ? r.tieAtt : opts.tieAtt, opts.dieN);
      tw += w; tp += w * pd;
      const a = acc[r.action] || (acc[r.action] = { w: 0, s: 0 });
      a.w += w; a.s += w * pd;
    });
    const byAction = {};
    Object.keys(acc).forEach(function (k) { byAction[k] = acc[k].w > 0 ? acc[k].s / acc[k].w : 0; });
    return { p: tw > 0 ? tp / tw : 0, byAction: byAction };
  }

  // admin default: cut points at .2/.4/.6/.8 per contract; label words per contract
  function coarse(p) {
    return p < 0.2 ? 'Long shot' : p < 0.4 ? 'Tough' : p < 0.6 ? 'Even' : p < 0.8 ? 'Good' : 'Strong';
  }
  function pct(p) { return Math.round(p * 100) + '%'; }

  SD.odds = { duel: duel, table: table, attWins: attWins, stanceMod: stanceMod, attackChip: attackChip, defendChip: defendChip, coarse: coarse, pct: pct };
})();
