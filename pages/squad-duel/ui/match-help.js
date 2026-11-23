(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
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
  function legalFor(U, pid) {
    const m = U.m;
    if (!pid) return m.zone === 2 ? ['pass', 'shoot'] : ['pass', 'dribble', 'through'];
    return SD.engine.legal(m, pid);
  }
  function tellOf(m) { try { return SD.engine.tell(m) || {}; } catch (e) { console.error('tell', e); return {}; } }

  const ready = (U) => U.sel && (U.m.phase === 'attack' ? U.act : U.stance);

  // oddsGrid: exact win/hold odds for every card in view, per legal action (attack) or stance (defend).
  // { rows: { pid: { opts: { key: p }, best: { k, p }, close: bool } }, top: { pid, k, p } | null }
  function oddsGrid(U) {
    const m = U.m, rows = {};
    let top = null;
    const ids = m.phase === 'defend' ? defCards(m) : m.phase === 'attack' ? m.hand.slice() : [];
    ids.forEach((pid) => {
      const opts = {};
      try {
        if (m.phase === 'attack') legalFor(U, pid).forEach((a) => { opts[a] = SD.engine.previewAttack(m, pid, a).chip.p; });
        else ['press', 'drop'].forEach((s) => { opts[s] = SD.engine.previewDefend(m, pid, s).chip.p; });
      } catch (e) { console.error('oddsGrid', e); }
      const ks = Object.keys(opts).sort((a, b) => opts[b] - opts[a]);
      const best = ks.length ? { k: ks[0], p: opts[ks[0]] } : null;
      const close = ks.length > 1 && opts[ks[0]] - opts[ks[1]] <= 0.05;
      rows[pid] = { opts, best, close };
      if (best && (!top || best.p > top.p)) top = { pid, k: best.k, p: best.p };
    });
    return { rows, top };
  }

  SD.ui.mh = { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf };
})();
