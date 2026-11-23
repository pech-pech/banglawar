(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // ---------- helpers ----------
  const STAT_KEYS = ['pac', 'pas', 'sho', 'def'];
  const ROLE_ICON = {
    Striker: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    Playmaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="17" r="2.6" fill="currentColor"/><circle cx="12" cy="6" r="2.6" fill="currentColor"/><circle cx="19" cy="17" r="2.6" fill="currentColor"/><path d="M6.4 14.8L10.6 8.3M13.4 8.3l4.2 6.5M7.6 17h8.8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    Winger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5l8 7-8 7M12 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    Anchor: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.6V21M7 11h10M4 14c0 4 3.6 7 8 7s8-3 8-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    Keeper: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11V6.5a1.5 1.5 0 013 0V10m0-4.5a1.5 1.5 0 013 0V10m0-5a1.5 1.5 0 013 0V10m0-3a1.5 1.5 0 013 0v7c0 4-3 7-6.5 7S5 18 5 14z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>'
  };
  const SILHOUETTE = '<svg viewBox="0 0 40 48" aria-hidden="true"><circle cx="20" cy="14" r="8" fill="currentColor"/><path d="M4 46c0-10 7-17 16-17s16 7 16 17z" fill="currentColor"/></svg>';
  const CUP_SVG = '<svg viewBox="0 0 56 64" aria-hidden="true" class="cup">' +
    '<path d="M15 6h26v16c0 10-5.6 16-13 16S15 32 15 22z" fill="rgba(169,184,216,.28)" stroke="#ffc83a" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M15 11H8c0 9 3.4 13.5 9 15.5M41 11h7c0 9-3.4 13.5-9 15.5" fill="none" stroke="#ffc83a" stroke-width="2.4" stroke-linecap="round"/>' +
    '<path d="M28 13l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#ffc83a" opacity=".85"/>' +
    '<rect x="25" y="38" width="6" height="9" fill="rgba(169,184,216,.5)" stroke="#ffc83a" stroke-width="2"/>' +
    '<path d="M16 58l3-11h18l3 11z" fill="rgba(169,184,216,.28)" stroke="#ffc83a" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<g transform="translate(36 36)"><rect x="0" y="8" width="16" height="13" rx="2.5" fill="#0a1330" stroke="#a9b8d8" stroke-width="2"/><path d="M3.5 8V5a4.5 4.5 0 019 0v3" fill="none" stroke="#a9b8d8" stroke-width="2"/><circle cx="8" cy="14.5" r="1.8" fill="#a9b8d8"/></g></svg>';
  const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
  const EQ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
  const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.5l-5.2 2.9L6 11.6 1.6 7.6l5.9-.7z" fill="currentColor"/></svg>';

  function h(tag, cls, text, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function svgBox(cls, markup) { const s = h('span', cls); s.innerHTML = markup; return s; } // markup = constants above only
  const rcls = (r) => 'r-' + String(r || 'Common').toLowerCase();
  const rlabel = (r) => String(r || 'Common').toUpperCase();
  function app() { return SD.app || {}; }
  function state() { return app().S || null; }
  function tw() {
    try { if (app().T) return app().T; } catch (e) {}
    try { if (SD.tweak && SD.tweak.values) return SD.tweak.values(); } catch (e) {}
    return (SD.data && SD.data.TWEAK_DEFAULTS) || {};
  }
  function fast() { return !!app().fast; }
  function reduced() {
    try {
      if (app().reduced || tw().reducedMotion) return true;
      return !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function pullCost() {
    try { return SD.gacha.cost(tw()); } catch (e) { return tw().pullCost || (SD.data && SD.data.PULL && SD.data.PULL.cost) || 100; }
  }
  function toast(m) { try { app().toast && app().toast(m); } catch (e) {} }
  function pid2(pid) { return (SD.data && SD.data.byId) ? SD.data.byId(pid) : null; }
  function players() { return ((SD.data && SD.data.PLAYERS) || []).slice(0, 12); }
  function owned(S, pid) { return S && S.owned && S.owned[pid] || null; }
  function starsOf(o) { return Math.max(1, (o && o.stars) || 0); }
  function statsOf(S, pid) {
    try { const p = SD.progress.statsOf(S, pid, tw()); if (p) return p; } catch (e) {}
    return pid2(pid) || {};
  }
  function topKey(p) { let b = 'pac', v = -1; STAT_KEYS.forEach((k) => { if ((p[k] || 0) > v) { v = p[k]; b = k; } }); return b; }
  function pips(n, max) {
    const w = h('span', 'mb-pips', null, { 'aria-label': 'Star ' + n + ' of ' + max });
    for (let i = 0; i < max; i++) w.appendChild(svgBox('mb-pip' + (i < n ? ' on' : ''), STAR));
    return w;
  }
  function pct(v) { if (v == null) return '-'; const x = v <= 1 ? v * 100 : v; return Math.round(x) + '%'; }

  // ---------- shared 4x3 grid ----------
  function buildGrid(S, onTap, opts) {
    opts = opts || {};
    const wrap = h('div', 'mb-gridwrap');
    const head = h('div', 'mb-gridhead');
    const sc = h('span', 'mb-squadcount', '', { id: 'squad-count' });
    head.appendChild(sc);
    wrap.appendChild(head);
    const grid = h('div', 'mb-grid', null, { id: 'grid' });
    wrap.appendChild(grid);
    function fill(S2) {
      grid.textContent = '';
      let have = 0, firstSil = true;
      players().forEach((p) => {
        const o = owned(S2, p.id);
        if (o) {
          have++;
          const b = h('button', 'slot12 owned ' + rcls(p.rarity), null, { type: 'button', 'data-pid': p.id, 'aria-label': p.name + ', ' + p.role + ', ' + p.rarity });
          b.appendChild(svgBox('mb-ico', ROLE_ICON[p.role] || ''));
          b.appendChild(h('span', 'mb-nm', p.name));
          b.appendChild(h('span', 'mb-role', p.role));
          const row = h('span', 'mb-sub');
          row.appendChild(pips(starsOf(o), 5));
          b.appendChild(row);
          if (o.isNew) b.appendChild(h('span', 'mb-new', 'NEW'));
          b.addEventListener('click', () => onTap(p.id));
          grid.appendChild(b);
        } else {
          const d = h('div', 'slot12 locked ' + rcls(p.rarity), null, { 'data-pid': p.id, role: 'img', 'aria-label': 'Not yet collected: ' + p.role + ', ' + p.rarity });
          d.appendChild(svgBox('mb-sil', SILHOUETTE));
          d.appendChild(svgBox('mb-ico', ROLE_ICON[p.role] || ''));
          if (opts.fillLabel && firstSil) { d.appendChild(h('span', 'mb-fill', 'Pull to fill')); d.classList.add('first'); }
          firstSil = false;
          grid.appendChild(d);
        }
      });
      sc.textContent = 'Squad ' + have + '/12';
      return have;
    }
    return { wrap, grid, fill };
  }

  // Row 39: 6-word benefit leads; rule text (data) follows, trailing "No number" fragment dropped for display.
  const SIG_BENEFIT = {
    SIG_LIO: 'Can shoot from Midfield',
    SIG_JOSS: 'Can defend from deck or discard',
    SIG_ZEFA: 'Won Dribble moves two zones',
    SIG_HADRO: "Shows opponent's pick for 2 turns",
    SIG_YSOLDE: 'Rerolls a save that would fail'
  };
  function sigRule(t) { return String(t || '').replace(/[.;,]?\s*No number\.?\s*$/i, '').replace(/\s+$/, ''); }
  const ROLE_STAT = { Striker: 'sho', Playmaker: 'pas', Winger: 'pac', Anchor: 'def', Keeper: 'def' };
  // Row 39: who does the new player replace. Returns {pre, stat, post} or null.
  function compareLine(S, p) {
    if (!S || !S.lineup || !p) return null;
    const key = ROLE_STAT[p.role] || 'def';
    const pitch = [S.lineup.keeper].concat(S.lineup.outfield || []).filter(Boolean);
    let cur = null;
    pitch.forEach((id) => {
      const q = pid2(id);
      if (!q || q.id === p.id || q.role !== p.role) return;
      if (!cur || (q[key] || 0) > (cur[key] || 0)) cur = q;
    });
    if (!cur) return { pre: 'Fills a new role: your lineup has no ' + p.role, stat: '', post: '' };
    const a = p[key] || 0, b = cur[key] || 0;
    const lbl = key.toUpperCase() + ' ' + a + ' v ' + b;
    const who = cur.name + ' (your ' + p.role + ')';
    return { pre: (a > b ? 'Better than ' : a === b ? 'Same as ' : 'Weaker than ') + who + ': ', stat: lbl, post: '', better: a > b };
  }

  function statRow(p, cls) {
    const row = h('div', 'mb-stats ' + (cls || ''));
    const top = topKey(p);
    STAT_KEYS.forEach((k) => {
      const c = h('div', 'mb-stat' + (k === top ? ' top' : ''));
      c.appendChild(h('span', 'k', k.toUpperCase()));
      c.appendChild(h('b', 'v', String(p[k] != null ? p[k] : '-')));
      row.appendChild(c);
    });
    return row;
  }

  // ---------- detail overlay (owned slot tap) ----------
  function showDetail(root, pid) {
    const S = state(); const p = pid2(pid); const o = owned(S, pid);
    if (!S || !p || !o) return;
    closeDetail(root);
    const st = statsOf(S, pid);
    const ov = h('div', 'mb-overlay mb-detail ' + rcls(p.rarity), null, { id: root.id + '-detail', role: 'dialog', 'aria-label': p.name + ' details' });
    const card = h('div', 'mb-dcard');
    const top = h('div', 'mb-dtop');
    top.appendChild(svgBox('mb-ico big', ROLE_ICON[p.role] || ''));
    const t = h('div', 'mb-dtitle');
    t.appendChild(h('h3', null, p.name));
    t.appendChild(h('span', 'mb-dsub', rlabel(p.rarity) + ' ' + p.role + (p.num ? '  #' + p.num : '')));
    top.appendChild(t);
    card.appendChild(top);
    card.appendChild(statRow(st));

    const sr = h('div', 'mb-drow');
    sr.appendChild(h('span', 'lbl', 'Stars'));
    sr.appendChild(pips(starsOf(o), (SD.data && SD.data.PULL && SD.data.PULL.maxStars) || 5));
    card.appendChild(sr);

    let lvl = o.level || 1, into = 0, need = 0, label = '';
    try { const x = SD.progress.xpNext(o.xp || 0); lvl = x.level || lvl; into = x.into || 0; need = x.need || 0; label = x.nextLabel || ''; } catch (e) {}
    const lr = h('div', 'mb-drow');
    lr.appendChild(h('span', 'lbl', 'Level ' + lvl));
    const bar = h('div', 'mb-bar');
    const fill = h('i');
    fill.style.width = (need ? Math.min(100, Math.round(into / need * 100)) : 100) + '%';
    bar.appendChild(fill);
    lr.appendChild(bar);
    lr.appendChild(h('span', 'mb-xp', need ? (o.xp || 0) + ' XP, ' + (need - into) + ' to go' : (o.xp || 0) + ' XP'));
    card.appendChild(lr);

    const tr = (SD.data && SD.data.TRAITS && SD.data.TRAITS[p.role]) || null;
    const tb = h('div', 'mb-dbox');
    if (tr) {
      tb.appendChild(h('b', null, 'Trait: ' + tr.name + (lvl >= 2 ? '' : ' (Level 2)')));
      tb.appendChild(h('span', null, lvl >= 2 ? (tr.text || '') : 'Unlocks at Level 2.'));
    } else tb.appendChild(h('b', null, 'No Trait'));
    card.appendChild(tb);
    const sb = h('div', 'mb-dbox sig');
    if (p.sig) { sb.appendChild(h('b', null, 'Signature move: ' + p.sig.name)); sb.appendChild(h('span', null, p.sig.text || '')); }
    else sb.appendChild(h('b', null, 'No Signature move'));
    card.appendChild(sb);
    ov.appendChild(card);
    const close = h('button', 'mb-btn', 'Close', { type: 'button', id: 'btn-detail-close' });
    close.addEventListener('click', () => closeDetail(root));
    const bar2 = h('div', 'mb-actions'); bar2.appendChild(close); close.classList.add('primary');
    ov.appendChild(bar2);
    root.appendChild(ov);
  }
  function closeDetail(root) { const d = root.querySelector('.mb-detail'); if (d) d.remove(); }

  // ============================================================
  // PULL
  // ============================================================
  function revealCard(pid, res) {
    const p = pid2(pid); const S = state();
    const card = h('div', 'rcard ' + rcls(p ? p.rarity : 'Common'));
    const inn = h('div', 'rc-in');
    const f = h('div', 'rc-face rc-front');
    if (p) {
      const top = h('div', 'rc-top');
      top.appendChild(h('span', 'rc-rar', rlabel(p.rarity)));
      let badge = null;
      if (res) {
        if (res.isNew) badge = h('span', 'rc-badge new', 'NEW');
        else {
          badge = h('span', 'rc-badge star');
          badge.appendChild(svgBox('mb-pip on', STAR));
          badge.appendChild(document.createTextNode('Star ' + (res.stars || starsOf(owned(S, pid)))));
        }
      } else if (S && S.owned && S.owned[pid] && S.owned[pid].isNew) badge = h('span', 'rc-badge new', 'NEW');
      if (badge) top.appendChild(badge);
      f.appendChild(top);
      const id = h('div', 'rc-id');
      id.appendChild(svgBox('mb-ico big', ROLE_ICON[p.role] || ''));
      const nm = h('div', 'rc-name');
      nm.appendChild(h('h3', null, p.name));
      nm.appendChild(h('span', null, p.role + (p.num ? '  #' + p.num : '')));
      id.appendChild(nm);
      f.appendChild(id);
      f.appendChild(statRow(p));
      const sg = h('div', 'rc-sig');
      if (p.sig) {
        sg.appendChild(h('b', null, SIG_BENEFIT[p.sig.id] || p.sig.name));
        sg.appendChild(h('span', null, p.sig.name + ': ' + sigRule(p.sig.text)));
      } else sg.appendChild(h('b', null, 'No Signature move'));
      f.appendChild(sg);
      if (res && !res.isNew && res.dupeCoins) f.appendChild(h('div', 'rc-dupe', 'Max stars: +' + res.dupeCoins + ' Coins'));
    }
    const b = h('div', 'rc-face rc-back');
    b.appendChild(h('span', 'rc-q', '?'));
    b.appendChild(h('span', 'rc-qt', 'Tap Pull'));
    inn.appendChild(f); inn.appendChild(b);
    card.appendChild(inn);
    return card;
  }

  // ---------- U9 pull screen ----------
  const OLD_SHIPPED = { tavo: 1, mirelle: 1, pip: 1, sunniva: 1, kessan: 1, barro: 1, ondra: 1, lio: 1, joss: 1, zefa: 1, hadro: 1, ysolde: 1 };
  const RANK = { Legend: 0, Epic: 1, Rare: 2, Common: 3 };
  const SLOTS = 20;
  function gridPlayers() {
    const all = ((SD.data && SD.data.PLAYERS) || []).slice(0, SLOTS);
    return all;
  }
  // pity bars: SD.gacha.pity(S,T) when present, else computed from S.pity + Tweak/data (admin default fallback)
  function pityInfo(S) {
    const T = tw(); const D = (SD.data && SD.data.PULL) || {};
    try { if (SD.gacha && SD.gacha.pity) { const p = SD.gacha.pity(S, T); if (p && p.epic && p.legend) return p; } } catch (e) {}
    const eOf = T.pityEpic || D.pityEpic || 10; const lOf = T.pityLegend || D.pityLegend || 30;
    return { epic: { n: (S.pity && S.pity.epic) || 0, of: eOf }, legend: { n: (S.pity && S.pity.legend) || 0, of: lOf } };
  }
  function pullLog(S) {
    if (S.pullLog && S.pullLog.length) return S.pullLog.slice(0, 5);
    return S.lastPull && S.lastPull.pid && (S.pulls || 0) > 0 ? [S.lastPull] : [];
  }

  function renderPull(el) {
    if (!el) return;
    const root = h('section', null, null, { id: 'pull' });
    if (reduced()) root.classList.add('rm');
    el.textContent = '';
    el.appendChild(root);
    const ui = { busy: false, dupe: {} }; // dupe: session-only gold tags {pid: {tag, from}}

    // head
    const head = h('div', 'mb-head pg-head');
    head.appendChild(h('span', 'mb-title', 'Pull a player'));
    const coinsB = h('div', 'mb-coins');
    coinsB.appendChild(h('span', 'lbl', 'Coins'));
    coinsB.appendChild(h('b', null, '0', { id: 'coins' }));
    head.appendChild(coinsB);
    root.appendChild(head);

    // odds (label is one fixed line: the starter label never changes box height)
    const odds = h('div', 'mb-odds pg-odds');
    odds.appendChild(h('div', 'mb-oddslabel', '', { id: 'odds-label' }));
    odds.appendChild(h('div', 'mb-oddstable', null, { id: 'odds-table' }));
    root.appendChild(odds);

    // both pity bars
    const pity = h('div', 'pg-pity', null, { id: 'pity' });
    [['epic', 'Epic pity', 'r-epic'], ['legend', 'Legend pity', 'r-legend']].forEach((x) => {
      const r = h('div', 'pr ' + x[2], null, { id: 'pity-' + x[0] });
      r.appendChild(h('span', 'n', x[1]));
      const bar = h('div', 'mb-bar pity-bar'); bar.appendChild(h('i')); r.appendChild(bar);
      r.appendChild(h('span', 't', ''));
      pity.appendChild(r);
    });
    root.appendChild(pity);

    // last 5 pulls
    const last = h('div', 'pg-last', null, { id: 'pull-last' });
    root.appendChild(last);

    // grid
    const gw = h('div', 'pg-gw');
    const gh = h('div', 'pg-gh');
    gh.appendChild(h('span', 'mb-gridhead', '', { id: 'squad-count' }));
    gh.appendChild(h('span', 'pg-sub', '', { id: 'grid-sub' }));
    gw.appendChild(gh);
    const grid = h('div', 'pg-grid', null, { id: 'grid' });
    gw.appendChild(grid);
    root.appendChild(gw);

    // foot
    const acts = h('div', 'mb-actions pg-foot');
    const bBack = h('button', 'mb-btn', 'Hub', { type: 'button', id: 'btn-pull-back' });
    const bPull = h('button', 'mb-btn primary pullbtn', 'Pull ' + pullCost(), { type: 'button', id: 'btn-pull' });
    acts.appendChild(bBack); acts.appendChild(bPull);
    root.appendChild(acts);

    function paintOdds(S) {
      let o = null;
      try { o = SD.gacha.oddsFor(S, tw()); } catch (e) {}
      const D = SD.data && SD.data.PULL;
      if (!o) o = { label: 'Normal odds', table: D ? D.normal : {} };
      const lab = o.label || '';
      let txt = /^Starter/i.test(lab) ? 'Starter pull: Rare or better' : (lab || 'Normal odds');
      if (!/starter/i.test(txt)) txt = txt.replace(/\.$/, '') + '. ' + pullCost() + ' Coins a pull.';
      root.querySelector('#odds-label').textContent = txt;
      const t = root.querySelector('#odds-table'); t.textContent = '';
      ['Common', 'Rare', 'Epic', 'Legend'].forEach((r) => {
        const c = h('div', 'od ' + rcls(r));
        c.appendChild(h('span', 'k', r));
        c.appendChild(h('b', 'v', pct(o.table ? o.table[r] : null)));
        t.appendChild(c);
      });
    }
    function paintPity(S) {
      const p = pityInfo(S);
      ['epic', 'legend'].forEach((k) => {
        const r = root.querySelector('#pity-' + k); const x = p[k];
        const n = Math.min(x.n, x.of);
        r.querySelector('i').style.width = Math.min(100, Math.round(n / x.of * 100)) + '%';
        r.querySelector('.t').textContent = n + '/' + x.of + ' · in ' + Math.max(1, x.of - n);
        r.setAttribute('aria-label', (k === 'epic' ? 'Epic' : 'Legend') + ' pity ' + n + ' of ' + x.of);
      });
    }
    function paintLast(S) {
      last.textContent = '';
      const log = pullLog(S);
      last.appendChild(h('span', 'lbl', log.length ? 'Last ' + log.length : 'No pulls yet'));
      log.forEach((r) => {
        const p = pid2(r.pid); if (!p) return;
        const c = h('span', 'lp ' + rcls(p.rarity));
        c.appendChild(h('span', 'nm', p.name));
        if (r.isNew) c.appendChild(h('i', 'new', null, { 'aria-label': 'new' }));
        last.appendChild(c);
      });
    }
    function cell(S, p) {
      const o = owned(S, p.id);
      const dp = ui.dupe[p.id];
      if (o) {
        const b = h('button', 'pc owned ' + rcls(p.rarity) + (dp ? ' dupe' : ''), null, { type: 'button', 'data-pid': p.id, 'aria-label': p.name + ', ' + p.role + ', ' + p.rarity + ', ' + starsOf(o) + ' stars' });
        b.classList.add('grid-cell');
        b.appendChild(svgBox('mb-ico', ROLE_ICON[p.role] || ''));
        b.appendChild(h('span', 'mb-nm', p.name));
        const pw = h('span', 'pg-pips');
        const maxS = (SD.data && SD.data.PULL && SD.data.PULL.maxStars) || 5;
        const n = starsOf(o);
        for (let i = 0; i < maxS; i++) {
          const pip = svgBox('mb-pip' + (i < n ? ' on' : '') + (dp && i === n - 1 ? ' fill' : ''), STAR);
          pw.appendChild(pip);
        }
        b.appendChild(pw);
        if (dp) b.appendChild(h('span', 'bd', dp.tag));
        else if (o.isNew) b.appendChild(h('span', 'mb-new', 'NEW'));
        b.addEventListener('click', () => showDetail(root, p.id));
        return b;
      }
      const d = h('div', 'pc locked ' + rcls(p.rarity), null, { 'data-pid': p.id, role: 'img', 'aria-label': 'Not found yet, ' + p.rarity });
      d.classList.add('grid-cell');
      d.appendChild(svgBox('mb-sil', SILHOUETTE));
      if (OLD_SHIPPED[p.id] && ROLE_ICON[p.role]) d.appendChild(svgBox('mb-ico', ROLE_ICON[p.role]));
      return d;
    }
    function paintGrid(S) {
      grid.textContent = '';
      const ps = gridPlayers();
      const have = ps.filter((p) => owned(S, p.id)).length;
      const sorted = ps.slice().sort((a, b) => {
        const oa = owned(S, a.id) ? 0 : 1, ob = owned(S, b.id) ? 0 : 1;
        return oa - ob || (RANK[a.rarity] - RANK[b.rarity]) || (ps.indexOf(a) - ps.indexOf(b));
      });
      sorted.forEach((p) => grid.appendChild(cell(S, p)));
      for (let i = sorted.length; i < SLOTS; i++) { // admin default: pad until data has 20 players
        const d = h('div', 'pc locked r-common', null, { role: 'img', 'aria-label': 'Not found yet' });
        d.appendChild(svgBox('mb-sil', SILHOUETTE)); grid.appendChild(d);
      }
      root.querySelector('#squad-count').textContent = 'Squad ' + have + '/' + SLOTS;
      const lastD = Object.keys(ui.dupe).pop();
      const q = lastD && pid2(lastD);
      root.querySelector('#grid-sub').textContent = q && owned(S, lastD) ? q.name + ': ' + starsOf(owned(S, lastD)) + (starsOf(owned(S, lastD)) === 1 ? ' Star' : ' Stars') + (ui.dupe[lastD].up ? ', stat up' : '') : '';
    }
    function canPull(S) {
      try { return SD.gacha.canPull(S, tw()); } catch (e) { return { ok: (S.coins || 0) >= pullCost(), need: pullCost(), have: S.coins || 0 }; }
    }
    function paint() {
      const S = state(); if (!S) return;
      root.querySelector('#coins').textContent = String(S.coins || 0);
      paintOdds(S); paintPity(S); paintLast(S); paintGrid(S);
      const can = canPull(S);
      const need = can.need || pullCost(); const hv = can.have != null ? can.have : S.coins || 0;
      bPull.disabled = ui.busy || !can.ok;
      bPull.textContent = can.ok ? 'Pull ' + need : 'Need ' + need + ' · you have ' + hv;
      bPull.classList.toggle('short', !can.ok);
    }

    // reveal overlay (full sheet over the grid); tap anywhere or primary closes
    function closeReveal() {
      const ov = root.querySelector('#pull-reveal'); if (!ov) return;
      ov.remove(); ui.busy = false; paint();
      try { bPull.focus(); } catch (e) {}
    }
    function showResult(res, animate) {
      const S = state(); const p = pid2(res.pid);
      const ov = h('div', 'mb-overlay pg-reveal', null, { id: 'pull-reveal', role: 'dialog', 'aria-label': 'Pull result' });
      const rv = h('div', 'mb-reveal');
      const c = revealCard(res.pid, res);
      rv.appendChild(c); ov.appendChild(rv);
      const cmp = h('div', 'mb-cmp', '', { id: 'pull-cmp', 'aria-live': 'polite' });
      if (res.isNew) {
        const cl = compareLine(S, p);
        if (cl) { cmp.appendChild(document.createTextNode(cl.pre)); if (cl.stat) cmp.appendChild(h('b', cl.better ? 'up' : '', cl.stat)); }
        else cmp.textContent = 'New player: ' + (p ? p.name : '') + '.';
      } else {
        const st = res.stars || starsOf(owned(S, res.pid));
        cmp.textContent = res.dupeCoins ? p.name + ' is at max Stars: +' + res.dupeCoins + ' Coins.' : 'Duplicate: ' + (p ? p.name : '') + ' reaches Star ' + st + '.';
      }
      ov.appendChild(cmp);
      const a = h('div', 'mb-actions');
      const ok = h('button', 'mb-btn primary', 'Nice', { type: 'button', id: 'btn-reveal-close' });
      a.appendChild(ok); ov.appendChild(a);
      root.appendChild(ov);
      ov.addEventListener('click', closeReveal);
      if (animate && !reduced() && !fast()) {
        c.classList.add('down'); void c.offsetWidth;
        requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('down')));
      }
      try { ok.focus(); } catch (e) {}
    }

    bPull.addEventListener('click', () => {
      const S = state(); if (!S || ui.busy) return;
      const can = canPull(S);
      if (!can.ok) { toast(can.why || 'Not enough Coins'); paint(); return; }
      let res = null;
      try { res = SD.gacha.pull(S, tw()); } catch (e) { toast('Pull failed'); return; }
      if (!res || res.error) { toast((res && res.why) || 'Not enough Coins'); paint(); return; }
      if (!res.isNew) { // dupe: Star pip fills, gold tag for this visit
        const st = res.stars || starsOf(owned(S, res.pid));
        ui.dupe[res.pid] = { tag: res.dupeCoins ? '+' + res.dupeCoins + ' Coins' : 'STAR +1', up: st === 2 || st === 4 };
      }
      ui.last = res; ui.busy = true;
      try { app().save && app().save(); } catch (e) {}
      paint();
      showResult(res, true);
    });
    bBack.addEventListener('click', () => {
      try { if (app().toHub) app().toHub(); else if (app().go) app().go('hub'); } catch (e) {}
    });

    paint();
  }

  // ============================================================
  // END
  // ============================================================
  function renderEnd(el) {
    if (!el) return;
    const shownAt = Date.now();
    const root = h('section', null, null, { id: 'end' });
    if (reduced()) root.classList.add('rm');
    el.textContent = '';
    el.appendChild(root);

    // stray tap guard: first 600ms after showing (skipped under ?fast=1 for tests)
    function guard(ev) {
      if (fast()) return;
      if (Date.now() - shownAt < 600) { ev.stopPropagation(); ev.preventDefault(); }
    }
    ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach((n) => root.addEventListener(n, guard, true));

    const S = state() || { owned: {}, results: [], coins: 0 };
    const head = h('div', 'mb-head');
    head.appendChild(h('span', 'mb-title', 'Slice complete'));
    root.appendChild(head);

    const g = buildGrid(S, (pid) => showDetail(root, pid));
    g.wrap.classList.add('area-grid');
    g.fill(S);
    root.appendChild(g.wrap);

    // trophy track
    const track = h('div', 'mb-track', null, { id: 'track' });
    const moreWins = (S.results || []).filter((r) => r.matchNo > 2 && r.res === 'W').length;
    const steps = (SD.data && SD.data.TROPHY) || [{ id: 'm1', label: 'League match 1' }, { id: 'm2', label: 'League match 2' }, { id: 'more', label: '4 more League matches' }, { id: 'cup', label: 'Cup Final', locked: true }];
    steps.forEach((s) => {
      const d = h('div', 'step', null, { 'data-id': s.id });
      const mark = h('span', 'mark');
      const lbl = h('span', 'lbl');
      lbl.appendChild(h('b', null, s.label));
      const mi = s.id === 'm1' ? 0 : s.id === 'm2' ? 1 : -1;
      if (mi >= 0) {
        const r = (S.results || []).find((x) => x.matchNo === mi + 1) || (S.results || [])[mi];
        if (r) {
          const res = r.res;
          d.classList.add('done', res === 'W' ? 'win' : res === 'D' ? 'draw' : 'loss');
          mark.innerHTML = res === 'W' ? TICK : res === 'D' ? EQ : CROSS;
          lbl.appendChild(h('span', 'sub', (res === 'W' ? 'Win ' : res === 'D' ? 'Draw ' : 'Loss ') + r.me + '-' + r.opp));
          d.setAttribute('aria-label', s.label + ': ' + (res === 'W' ? 'win' : res === 'D' ? 'draw' : 'loss'));
        } else { mark.appendChild(h('i', 'empty')); lbl.appendChild(h('span', 'sub', 'Not played')); }
      } else if (s.id === 'more') {
        d.classList.add('next');
        mark.appendChild(h('i', 'dot'));
        lbl.textContent = '';
        lbl.appendChild(h('b', null, 'More matches ' + moreWins + '/4'));
        lbl.appendChild(h('span', 'sub', 'Next step'));
      } else if (s.id === 'cup' || s.locked) {
        d.classList.add('locked');
        mark.innerHTML = CUP_SVG;
        lbl.appendChild(h('span', 'sub', 'Locked: win 4 more'));
        d.setAttribute('aria-label', s.label + ': locked');
      } else {
        d.classList.add('next');
        mark.appendChild(h('i', 'dot'));
        lbl.appendChild(h('span', 'sub', 'Next step'));
      }
      d.appendChild(mark); d.appendChild(lbl);
      track.appendChild(d);
    });
    root.appendChild(track);

    // goal + pull 2 bar
    const info = h('div', 'mb-info');
    // Row 35: goal text matches the track ("More matches 0/4"); the build that replaces this screen owns the real goal.
    const goal = h('div', 'mb-goalbox', null, { id: 'next-goal' });
    goal.appendChild(h('span', 'gk', 'Cup Final'));
    goal.appendChild(h('p', 'mb-goal', 'Locked: win 4 more matches (' + moreWins + '/4)'));
    const segs = h('div', 'mb-segs', null, { 'aria-hidden': 'true' });
    for (let i = 0; i < 4; i++) segs.appendChild(h('i', i < moreWins ? 'on' : ''));
    goal.appendChild(segs);
    info.appendChild(goal);
    const cost = pullCost(); const have = Math.min(S.coins || 0, cost);
    const pr = h('div', 'mb-pull2', null, { id: 'pull2' });
    pr.appendChild(h('span', 'lbl', (have >= cost ? 'Pull 2 ready: ' : 'Pull 2: ') + have + '/' + cost + ' Coins, opens next slice'));
    const bar = h('div', 'mb-bar gold'); const fl = h('i'); fl.style.width = Math.round(have / cost * 100) + '%'; bar.appendChild(fl); pr.appendChild(bar);
    info.appendChild(pr);
    root.appendChild(info);

    // actions
    const acts = h('div', 'mb-actions');
    const copy = h('button', 'mb-btn', 'Copy report', { type: 'button', id: 'btn-copy-end' });
    const rest = h('button', 'mb-btn primary', 'New game', { type: 'button', id: 'btn-restart' });
    acts.appendChild(copy); acts.appendChild(rest);
    root.appendChild(acts);

    copy.addEventListener('click', () => {
      try { if (SD.tweak && SD.tweak.copyReport) SD.tweak.copyReport(); else toast('Report not ready'); } catch (e) { toast('Copy failed'); }
    });
    rest.addEventListener('click', () => {
      if (root.querySelector('#restart-confirm')) return;
      const ov = h('div', 'mb-overlay confirm', null, { id: 'restart-confirm', role: 'alertdialog', 'aria-label': 'Confirm restart' });
      const box = h('div', 'mb-cbox');
      box.appendChild(h('h3', null, 'Start a new game?'));
      box.appendChild(h('p', null, 'This wipes your saved squad, Coins and results. It cannot be undone.'));
      ov.appendChild(box);
      const a2 = h('div', 'mb-actions');
      const no = h('button', 'mb-btn', 'Keep my save', { type: 'button', id: 'btn-restart-no' });
      const yes = h('button', 'mb-btn primary danger', 'Wipe and restart', { type: 'button', id: 'btn-restart-yes' });
      a2.appendChild(no); a2.appendChild(yes); ov.appendChild(a2);
      root.appendChild(ov);
      no.addEventListener('click', () => ov.remove());
      yes.addEventListener('click', () => {
        try { SD.progress.wipe(); } catch (e) {}
        try { location.reload(); } catch (e) {}
      });
    });
  }

  SD.ui = SD.ui || {};
  SD.ui.pull = { render: renderPull };
  // SD.ui.end (slice trophy screen) retired: the season end screen is SD.ui.seasonEnd (ui/season.js).
})();
