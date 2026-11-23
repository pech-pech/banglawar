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

  function renderPull(el) {
    if (!el) return;
    const root = h('section', null, null, { id: 'pull' });
    if (reduced()) root.classList.add('rm');
    el.textContent = '';
    el.appendChild(root);
    const ui = { busy: false };

    const left = h('div', 'mb-left');
    root.appendChild(left);
    // head: coins
    const head = h('div', 'mb-head');
    const coinsB = h('div', 'mb-coins');
    coinsB.appendChild(h('span', 'lbl', 'Coins'));
    coinsB.appendChild(h('b', null, '0', { id: 'coins' }));
    head.appendChild(coinsB);
    head.appendChild(h('span', 'mb-title', 'Pull a player'));
    left.appendChild(head);

    // odds
    const odds = h('div', 'mb-odds');
    odds.appendChild(h('div', 'mb-oddslabel', '', { id: 'odds-label' }));
    odds.appendChild(h('div', 'mb-oddstable', null, { id: 'odds-table' }));
    left.appendChild(odds);

    // pity
    const pity = h('div', 'mb-pity', null, { id: 'pity' });
    const pt = h('div', 'mb-pityrow');
    pt.appendChild(h('span', 'pt-epic', '', { id: 'pity-text' }));
    pt.appendChild(h('span', 'pt-leg', '', { id: 'pity-leg' }));
    pity.appendChild(pt);
    const pbar = h('div', 'mb-bar pity-bar'); const pfill = h('i'); pbar.appendChild(pfill); pity.appendChild(pbar);
    left.appendChild(pity);

    // reveal
    const revWrap = h('div', 'mb-revwrap');
    const rev = h('div', 'mb-reveal', null, { id: 'pull-reveal' });
    revWrap.appendChild(rev);
    const cmpBox = h('div', 'mb-cmpbox');
    cmpBox.appendChild(h('div', 'mb-cmp', '', { id: 'pull-cmp', 'aria-live': 'polite' }));
    cmpBox.appendChild(h('div', 'mb-note', '', { id: 'pull-note', 'aria-live': 'polite' }));
    left.appendChild(cmpBox);
    root.appendChild(revWrap);

    // grid
    const g = buildGrid(state(), (pid) => showDetail(root, pid), { fillLabel: true });
    g.wrap.classList.add('area-grid');
    root.appendChild(g.wrap);

    // actions
    const acts = h('div', 'mb-actions');
    const bPull = h('button', 'mb-btn pullbtn', 'Pull ' + pullCost(), { type: 'button', id: 'btn-pull' });
    const bNext = h('button', 'mb-btn', 'Pick lineup', { type: 'button', id: 'btn-pull-next' });
    acts.appendChild(bPull); acts.appendChild(bNext);
    root.appendChild(acts);

    function paintOdds(S) {
      let o = null;
      try { o = SD.gacha.oddsFor(S, tw()); } catch (e) {}
      const D = SD.data && SD.data.PULL;
      if (!o) o = { label: 'Normal odds', table: D ? D.normal : {} };
      const lab = o.label || '';
      root.querySelector('#odds-label').textContent = /^Starter/i.test(lab) ? 'Starter pull: Rare or better' : lab;
      const t = root.querySelector('#odds-table'); t.textContent = '';
      ['Common', 'Rare', 'Epic', 'Legend'].forEach((r) => {
        const c = h('div', 'od ' + rcls(r));
        c.appendChild(h('span', 'k', r));
        c.appendChild(h('b', 'v', pct(o.table ? o.table[r] : null)));
        t.appendChild(c);
      });
    }
    function paintPity(S) {
      const T = tw(); const D = (SD.data && SD.data.PULL) || {};
      const eMax = T.pityEpic || D.pityEpic || 10; const lMax = T.pityLegend || D.pityLegend || 30;
      const pe = (S.pity && S.pity.epic) || 0; const pl = (S.pity && S.pity.legend) || 0;
      let txt;
      try { txt = SD.gacha.pityText(S, T); } catch (e) { txt = 'Epic pity ' + pe + '/' + eMax; }
      const left = Math.max(1, eMax - pe);
      root.querySelector('#pity-text').textContent = 'Epic guaranteed in ' + left;
      root.querySelector('#pity-text').setAttribute('title', txt);
      root.querySelector('#pity-leg').textContent = 'Legend ' + pl + '/' + lMax;
      pfill.style.width = Math.min(100, Math.round(pe / eMax * 100)) + '%';
    }
    function canPull(S) {
      try { return SD.gacha.canPull(S, tw()); } catch (e) { return { ok: (S.coins || 0) >= pullCost(), need: pullCost(), have: S.coins || 0 }; }
    }
    function paint() {
      const S = state(); if (!S) return;
      root.querySelector('#coins').textContent = String(S.coins || 0);
      paintOdds(S); paintPity(S);
      g.fill(S);
      const can = canPull(S);
      bPull.disabled = ui.busy || !can.ok;
      const done = (S.pulls || 0) > 0;
      bNext.disabled = ui.busy || !(done || !can.ok);
      bPull.classList.toggle('primary', !bNext.classList.contains('primary'));
      // primary = the button that moves the game forward
      const nextPrimary = done || !can.ok;
      bNext.classList.toggle('primary', nextPrimary);
      bPull.classList.toggle('primary', !nextPrimary);
      // Row 42: the greyed Pull button says why, on one line
      const need = can.need || pullCost(); const hv = can.have != null ? can.have : S.coins || 0;
      bPull.textContent = can.ok ? 'Pull ' + need : hv + ' of ' + need + ' Coins';
      bPull.classList.toggle('short', !can.ok);
      const note = root.querySelector('#pull-note');
      note.textContent = can.ok ? '' : hv + ' of ' + need + ' Coins' + (done ? '. Pick lineup to continue.' : '.');
    }
    function showPlaceholder() {
      rev.textContent = '';
      const c = revealCard(null, null); c.classList.add('down', 'static'); rev.appendChild(c);
      root.querySelector('#pull-cmp').textContent = '';
    }
    function showResult(res, animate) {
      const S = state();
      rev.textContent = '';
      const c = revealCard(res.pid, res);
      rev.appendChild(c);
      const p = pid2(res.pid);
      const cmp = root.querySelector('#pull-cmp');
      cmp.textContent = '';
      if (res.isNew) {
        const cl = compareLine(S, p);
        if (cl) {
          cmp.appendChild(document.createTextNode(cl.pre));
          if (cl.stat) cmp.appendChild(h('b', cl.better ? 'up' : '', cl.stat));
        } else cmp.textContent = 'New player: ' + (p ? p.name : '') + '. Squad grows.';
      } else cmp.textContent = 'Duplicate: ' + (p ? p.name : '') + ' reaches Star ' + (res.stars || starsOf(owned(S, res.pid))) + '.';
      if (animate && !reduced() && !fast()) {
        c.classList.add('down');
        void c.offsetWidth;
        requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('down')));
        ui.busy = true;
        setTimeout(() => { ui.busy = false; paint(); }, 700);
      }
    }

    bPull.addEventListener('click', () => {
      const S = state(); if (!S || ui.busy) return;
      const can = canPull(S);
      if (!can.ok) { toast(can.why || 'Not enough Coins'); paint(); return; }
      let res = null;
      try { res = SD.gacha.pull(S, tw()); } catch (e) { toast('Pull failed'); return; }
      if (!res || res.error) { toast((res && res.why) || 'Not enough Coins'); paint(); return; }
      ui.last = res;
      try { app().save && app().save(); } catch (e) {}
      showResult(res, true);
      paint();
    });
    bNext.addEventListener('click', () => {
      if (bNext.disabled) return;
      try { app().go && app().go('manager2'); } catch (e) {}
    });

    // initial
    const S0 = state();
    if (S0 && S0.lastPull && (S0.pulls || 0) > 0 && S0.lastPull.pid) { ui.last = S0.lastPull; showResult(S0.lastPull, false); }
    else showPlaceholder();
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
  SD.ui.end = { render: renderEnd };
})();
