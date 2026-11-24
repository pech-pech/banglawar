/* Squad Duel season screens: U1 start, U2 hub, U3+U5 table/fixtures, U4 matchday results, U6 cup intro, U8 season end.
   Owner: seasonui. Each module = { render(el) }. Reads SD.app (S, T, go, play, afterResult, nextSeason, toHub, save, setScorebug),
   SD.season, SD.progress, SD.data. Every dependency is guarded; a missing one falls back to plain data. */
(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {};
  const doc = globalThis.document;

  // ---------- helpers ----------
  function h(tag, cls, text, attrs) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function btn(id, label, cls, fn) {
    const b = h('button', 'sx-btn' + (cls ? ' ' + cls : ''), label, { type: 'button' });
    if (id) b.id = id;
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  const app = () => SD.app || {};
  const S = () => app().S;
  const T = () => { try { return app().T || (SD.data && SD.data.TWEAK_DEFAULTS) || {}; } catch (e) { return {}; } };
  const D = () => SD.data || {};
  const CLUBS = () => D().CLUBS || {};
  const club = (id) => CLUBS()[id] || { id, name: String(id || '?'), label: String(id || '?').toUpperCase() };
  const label = (id) => String(club(id).label || String(id).toUpperCase());
  const SEAS = () => D().SEASON || { order: ['grimsby', 'reading', 'bolton', 'stockport', 'rotherham', 'wycombe', 'lincoln'], home: [true, true, false, true, false, true, false] };
  const seasonOf = (s) => (s && s.season) || { no: 1, md: 0, results: [], cup: { opp: null, played: false, won: null }, done: false };
  const seasonNo = (s) => seasonOf(s).no || 1;
  function ord(n) { const v = n % 100; if (v >= 11 && v <= 13) return n + 'th'; return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
  function seasonResults(s) {
    const no = seasonNo(s);
    return ((s && s.results) || []).filter((r) => (r.season == null ? 1 : r.season) === no);
  }
  function resultFor(s, md) { return seasonResults(s).find((r) => r.md === md) || null; }
  function tableRows(s) { try { if (SD.season && SD.season.table) return SD.season.table(s) || []; } catch (e) { console.error(e); } return []; }
  function myRow(s) { return tableRows(s).find((r) => r.me) || null; }
  function placeOf(s) {
    try { if (SD.season && SD.season.place) return SD.season.place(s); } catch (e) {}
    const r = myRow(s); return r ? { pos: r.pos, pts: r.Pts } : { pos: 0, pts: 0 };
  }
  function nextFixture(s) {
    try { if (SD.season && SD.season.fixtureFor) return SD.season.fixtureFor(s); } catch (e) { console.error(e); }
    const sn = seasonOf(s), i = sn.md, sc = SEAS();
    if (i >= 7) return null;
    return { md: i + 1, clubId: sc.order[i], home: !!sc.home[i], mode: sc.home[i] ? 'home' : 'away' };
  }
  function cupGate(s) {
    try { if (SD.season && SD.season.cupGate) return SD.season.cupGate(s) || { reached: false }; } catch (e) { console.error(e); }
    const p = placeOf(s); return { reached: seasonOf(s).md >= 7 && p.pos > 0 && p.pos <= 2, opp: null, pos: p.pos };
  }
  function cupOppId(s, gate) {
    const o = (gate && gate.opp) || seasonOf(s).cup.opp;
    return o && typeof o === 'object' ? o.id : o;
  }
  function scoutLine(c, short) {
    let t = (short && c.hint) || c.scout || c.hint || '';
    t = String(t).replace(/^[^:]{2,30}:\s*/, '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
  function setBug(text) { try { if (app().setScorebug) app().setScorebug(text); } catch (e) {} }
  function chipText(s) { const sn = seasonOf(s); return 'S' + sn.no + (sn.done ? ' END' : sn.md >= 7 ? ' CUP' : ' MD' + (sn.md + 1)); }
  function tellBug(s) { setBug('SQUAD DUEL · ' + chipText(s)); }
  function guard(root, ms) { // stray tap guard (skipped under ?fast=1)
    const shownAt = Date.now();
    let fast = false; try { fast = app().fast; } catch (e) {}
    ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach((n) => root.addEventListener(n, (ev) => {
      if (fast) return;
      if (Date.now() - shownAt < (ms || 500)) { ev.stopPropagation(); ev.preventDefault(); }
    }, true));
  }
  function haChip(home, neutral) {
    const t = neutral ? 'NEUTRAL' : home ? 'HOME' : 'AWAY';
    return h('span', 'sx-ha ' + (neutral ? 'neu' : home ? 'home' : 'away'), t);
  }

  const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
  const EQ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
  const SILH = '<svg viewBox="0 0 40 48" aria-hidden="true"><circle cx="20" cy="14" r="8" fill="currentColor"/><path d="M4 46c0-10 7-17 16-17s16 7 16 17z" fill="currentColor"/></svg>';
  const LOCK = '<g transform="translate(36 36)"><rect x="0" y="8" width="16" height="13" rx="2.5" fill="#0a1330" stroke="#a9b8d8" stroke-width="2"/><path d="M3.5 8V5a4.5 4.5 0 019 0v3" fill="none" stroke="#a9b8d8" stroke-width="2"/><circle cx="8" cy="14.5" r="1.8" fill="#a9b8d8"/></g>';
  // state: 'open' (gold), 'locked' (grey + lock), 'won' (gold fill)
  function cupSvg(state) {
    const grey = state === 'locked';
    const st = grey ? '#a9b8d8' : '#ffc83a';
    const fill = state === 'won' ? 'rgba(255,200,58,.55)' : 'rgba(169,184,216,.28)';
    return '<svg viewBox="0 0 56 64" aria-hidden="true" class="cup ' + state + '">' +
      '<path d="M15 6h26v16c0 10-5.6 16-13 16S15 32 15 22z" fill="' + fill + '" stroke="' + st + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M15 11H8c0 9 3.4 13.5 9 15.5M41 11h7c0 9-3.4 13.5-9 15.5" fill="none" stroke="' + st + '" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M28 13l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="' + st + '" opacity=".85"/>' +
      '<rect x="25" y="38" width="6" height="9" fill="rgba(169,184,216,.5)" stroke="' + st + '" stroke-width="2"/>' +
      '<path d="M16 58l3-11h18l3 11z" fill="' + fill + '" stroke="' + st + '" stroke-width="2.4" stroke-linejoin="round"/>' + (grey ? LOCK : '') + '</svg>';
  }
  function resMark(res) { return res === 'W' ? TICK : res === 'D' ? EQ : CROSS; }
  const resWord = (res) => (res === 'W' ? 'Win' : res === 'D' ? 'Draw' : 'Loss');
  const resCls = (res) => (res === 'W' ? 'win' : res === 'D' ? 'draw' : 'loss');

  function clip(text, done) {
    function fb() {
      try {
        const ta = doc.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;'; doc.body.appendChild(ta); ta.select();
        const ok = doc.execCommand && doc.execCommand('copy'); doc.body.removeChild(ta); return !!ok;
      } catch (e) { return false; }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => done(true), () => done(fb()));
    } catch (e) {}
    done(fb());
  }

  function mount(el, id, extra) {
    el.textContent = '';
    const root = h('section', 'sx' + (extra ? ' ' + extra : ''), null, { id });
    el.appendChild(root);
    return root;
  }
  function noteText(s) {
    const rows = tableRows(s), sn = seasonOf(s);
    if (!sn.md) return 'Next goal: finish in the top 2 to reach the Cup Final.';
    const me = rows.find((r) => r.me); if (!me) return '';
    const pos = me.pos;
    if (pos <= 2) {
      const third = rows[2];
      const gap = third ? me.Pts - third.Pts : 0;
      const g = pos === 1 && rows[1] ? me.Pts - rows[1].Pts : gap;
      return 'You are ' + ord(pos) + (g > 0 ? ', ' + g + ' point' + (g === 1 ? '' : 's') + ' clear of ' + (pos === 1 ? '2nd' : '3rd') + '.' : ', level on points with ' + (pos === 1 ? '2nd' : '3rd') + '.');
    }
    const second = rows[1];
    const behind = second ? second.Pts - me.Pts : 0;
    return 'You are ' + ord(pos) + ', ' + behind + ' point' + (behind === 1 ? '' : 's') + ' behind the Cup Final line.';
  }

  // =====================================================================
  // U1 Start
  // =====================================================================
  function renderStart(el) {
    const a = app();
    setBug('SQUAD DUEL');
    const saved = a.saved && a.saved.step ? a.saved : null;
    const root = mount(el, 'start', 'sx-start');
    root.appendChild(h('h1', null, 'SQUAD DUEL'));
    root.appendChild(h('div', 'sub', 'Proud Preston'));
    let line = 'Seven league matches, then the Cup Final.';
    let eraseWhat = 'Erase your save?';
    if (saved) {
      const sn = saved.season;
      if (sn) {
        const stateTxt = sn.done ? 'season over' : sn.md >= 7 ? 'Cup Final next' : 'matchday ' + (sn.md + 1) + ' of 7';
        line = 'Season ' + sn.no + ', ' + stateTxt;
        eraseWhat = 'Erase season ' + sn.no + '?';
      } else line = 'Saved game';
    }
    root.appendChild(h('p', 'tag', line, { id: 'start-line' }));
    const btns = h('div', 'btns');
    if (saved) btns.appendChild(btn('btn-continue', 'Continue', 'primary', () => {
      a.S = a.saved; a.saved = null; a.go(a.S.step);
    }));
    const nb = btn('btn-new', 'New game', saved ? '' : 'primary', () => {
      if (!saved) return a.newGame();
      sheet.hidden = false; keep.focus();
    });
    btns.appendChild(nb);
    root.appendChild(btns);
    root.appendChild(h('div', null, 'build ' + (a.build || 'sq-season-1'), { id: 'build-id' }));
    // confirm sheet
    const sheet = h('div', 'sx-sheet', null, { role: 'dialog', 'aria-label': eraseWhat });
    sheet.hidden = true;
    const card = h('div', 'sx-sheet-card glass');
    card.appendChild(h('div', 'sx-sheet-t', eraseWhat));
    card.appendChild(h('p', 'sx-sheet-p', 'A new game starts from the first matchday. This cannot be undone.'));
    const row = h('div', 'sx-foot');
    const keep = btn('btn-keep', 'Keep', '', () => { sheet.hidden = true; });
    const erase = btn('btn-erase', 'Erase', 'danger', () => { sheet.hidden = true; a.newGame(); });
    row.append(keep, erase);
    card.appendChild(row); sheet.appendChild(card); root.appendChild(sheet);
  }

  // =====================================================================
  // U2 Hub
  // =====================================================================
  function minNodeCost() {
    try {
      const sp = S().sp, owned = new Set(S().nodes || []);
      const costs = (D().NODES || []).filter((n) => !owned.has(n.id) && n.cost != null).map((n) => n.cost);
      return costs.length ? Math.min.apply(null, costs) : 1;
    } catch (e) { return 1; }
  }
  function renderHub(el) {
    const s = S(), a = app();
    const sn = seasonOf(s), t = T();
    const root = mount(el, 'hub');
    tellBug(s);
    const pl = placeOf(s);
    const rows = tableRows(s);
    const me = rows.find((r) => r.me);
    // season line
    const top = h('div', 'sx-head');
    top.appendChild(h('span', 'sx-ttl', 'Season ' + sn.no));
    top.appendChild(h('span', 'sx-sub', sn.md ? ord(pl.pos) + ' · ' + (me ? me.Pts : pl.pts) + ' pts' : 'Place: -', { id: 'hub-place' }));
    root.appendChild(top);

    // 8-cell trophy track
    const track = h('div', 'sx-track', null, { id: 'hub-track', role: 'list' });
    const gate = cupGate(s);
    for (let md = 1; md <= 7; md++) {
      const r = resultFor(s, md);
      const cell = h('div', 'sx-cell', null, { role: 'listitem', 'data-md': md });
      const mark = h('span', 'mk');
      if (r) { cell.classList.add('done', resCls(r.res)); mark.innerHTML = resMark(r.res); cell.setAttribute('aria-label', 'Matchday ' + md + ': ' + resWord(r.res).toLowerCase()); }
      else if (md === sn.md + 1 && !sn.done) { cell.classList.add('next'); mark.appendChild(h('i', 'dot')); cell.setAttribute('aria-label', 'Matchday ' + md + ': next'); }
      else { mark.appendChild(h('i', 'empty')); cell.setAttribute('aria-label', 'Matchday ' + md + ': not played'); }
      cell.append(mark, h('span', 'n', String(md)));
      track.appendChild(cell);
    }
    const cup = sn.cup || {};
    const cupCell = h('div', 'sx-cell cupc', null, { role: 'listitem', 'data-md': 'cup' });
    const cmark = h('span', 'mk');
    let cstate = 'locked';
    if (cup.played) { cstate = cup.won ? 'won' : 'open'; cupCell.classList.add('done', cup.won ? 'win' : 'loss'); }
    else if (sn.md >= 7 && gate.reached) { cstate = 'open'; cupCell.classList.add('next'); }
    else if (sn.md >= 7) cupCell.classList.add('out');
    cmark.innerHTML = cupSvg(cstate);
    cupCell.setAttribute('aria-label', 'Cup Final: ' + (cup.played ? (cup.won ? 'won' : 'lost') : sn.md >= 7 && gate.reached ? 'ready' : 'locked'));
    cupCell.append(cmark, h('span', 'n', 'Cup'));
    track.appendChild(cupCell);
    root.appendChild(track);

    // next opponent card
    const card = h('div', 'sx-card glass', null, { id: 'hub-opp' });
    let playLabel = 'Play', cupMode = false;
    const fx = sn.md < 7 ? nextFixture(s) : null;
    if (fx) {
      const c = club(fx.clubId);
      const r1 = h('div', 'sx-row');
      r1.appendChild(h('span', 'sx-sub', 'Next: matchday ' + fx.md + ' of 7'));
      r1.appendChild(haChip(fx.home));
      card.appendChild(r1);
      card.appendChild(h('div', 'sx-nm', String(c.name || c.label).toUpperCase(), { id: 'hub-opp-name' }));
      if (c.style) card.appendChild(h('div', 'sx-style', c.style));
      const sc = scoutLine(c);
      if (sc) card.appendChild(h('div', 'sx-scout', sc));
    } else if (!sn.done && !cup.played && gate.reached) {
      cupMode = true; playLabel = 'Cup Final';
      const oid = cupOppId(s, gate), c = club(oid);
      const r1 = h('div', 'sx-row');
      r1.appendChild(h('span', 'sx-sub gold', 'Cup Final'));
      r1.appendChild(haChip(false, true));
      card.appendChild(r1);
      card.appendChild(h('div', 'sx-nm', oid ? String(c.name || c.label).toUpperCase() : 'The other finalist', { id: 'hub-opp-name' }));
      const sc = oid ? scoutLine(c) : '';
      card.appendChild(h('div', 'sx-scout', (sc ? sc + ' ' : '') + 'No crowd for either side.'));
    } else if (sn.done || cup.played) {
      playLabel = 'Season end';
      card.appendChild(h('div', 'sx-sub', 'Season over'));
      card.appendChild(h('div', 'sx-nm', cup.played ? (cup.won ? 'CUP WON' : 'CUP FINAL LOST') : 'NO FINAL THIS YEAR', { id: 'hub-opp-name' }));
      card.appendChild(h('div', 'sx-scout', 'See how the season ended and start the next one.'));
    } else {
      playLabel = 'No final this year';
      card.appendChild(h('div', 'sx-sub', 'Season over'));
      card.appendChild(h('div', 'sx-nm', 'NO FINAL THIS YEAR', { id: 'hub-opp-name' }));
      card.appendChild(h('div', 'sx-scout', 'Only the top 2 play the Cup Final. You finished ' + ord(pl.pos) + '.'));
    }
    root.appendChild(card);
    const note = noteText(s);
    if (note && fx) root.appendChild(h('div', 'sx-note', note, { id: 'hub-note' }));

    // chips
    const chips = h('div', 'sx-chips');
    const cc = h('button', 'sx-chip', null, { type: 'button', 'aria-label': 'Coins ' + s.coins + ', open Pull' });
    cc.append(h('span', 'lbl', 'Coins'), h('b', null, String(s.coins)));
    cc.addEventListener('click', () => a.go('pull'));
    const sc2 = h('button', 'sx-chip sp', null, { type: 'button', 'aria-label': 'Skill Points ' + s.sp + ', open Tree' });
    sc2.append(h('span', 'lbl', 'Skill Points'), h('b', null, String(s.sp)));
    sc2.addEventListener('click', () => a.go('tree'));
    chips.append(cc, sc2);
    root.appendChild(chips);

    // button grid
    const pullCost = typeof t.pullCost === 'number' ? t.pullCost : 100;
    const grid = h('div', 'sx-grid4');
    const bL = btn('hub-lineup', 'Lineup', '', () => a.go('manager'));
    const bT = btn('hub-tree', 'Tree', s.sp >= minNodeCost() ? 'glow' : '', () => a.go('tree'));
    const bP = btn('hub-pull', 'Pull', s.coins >= pullCost ? 'glow' : '', () => a.go('pull'));
    const bB = btn('hub-table', 'Table', '', () => { if (SD.ui.table) SD.ui.table._tab = 'table'; a.go('table'); });
    grid.append(bL, bT, bP, bB);
    root.appendChild(grid);

    const foot = h('div', 'sx-foot');
    const play = btn('hub-play', playLabel, 'primary' + (cupMode ? ' gold' : ''), () => { if (a.play) a.play(); });
    foot.appendChild(play);
    root.appendChild(foot);
  }

  // =====================================================================
  // U3 table + U5 fixtures (one screen, two tabs)
  // =====================================================================
  const gdTxt = (n) => (n > 0 ? '+' + n : String(n));
  function renderTable(el) {
    const s = S(), a = app();
    const root = mount(el, 'table');
    tellBug(s);
    const view = { tab: (SD.ui.table && SD.ui.table._tab) || 'table' };
    function draw() {
      root.textContent = '';
      const sn = seasonOf(s);
      const isTab = view.tab === 'table';
      const head = h('div', 'sx-head');
      head.appendChild(h('span', 'sx-ttl', isTab ? 'League table' : 'Fixtures'));
      head.appendChild(h('span', 'sx-sub', sn.md ? 'After matchday ' + sn.md + ' of 7' : 'Season ' + sn.no + ' · before matchday 1'));
      root.appendChild(head);
      if (isTab) drawTable(); else drawFixtures();
      const foot = h('div', 'sx-foot tabs');
      const tt = btn('tab-table', 'Table', isTab ? 'on' : '', () => { view.tab = 'table'; if (SD.ui.table) SD.ui.table._tab = 'table'; draw(); });
      const tf = btn('tab-fix', 'Fixtures', !isTab ? 'on' : '', () => { view.tab = 'fix'; if (SD.ui.table) SD.ui.table._tab = 'fix'; draw(); });
      tt.setAttribute('aria-pressed', String(isTab)); tf.setAttribute('aria-pressed', String(!isTab));
      foot.append(tt, tf, btn('btn-hub', 'Back to hub', 'primary', () => { if (a.toHub) a.toHub(); else a.go('hub'); }));
      root.appendChild(foot);
    }
    function drawTable() {
      const sn = seasonOf(s);
      const rows = tableRows(s);
      const box = h('div', 'sx-tbl glass');
      const hd = h('div', 'tr h');
      ['#', 'CLUB', 'P', 'W', 'D', 'L', 'GD', 'PTS'].forEach((t, i) => hd.appendChild(h('span', i === 1 ? 'club' : i === 7 ? 'pts' : '', t)));
      box.appendChild(hd);
      const body = h('div', 'rows', null, { id: 'tbl-rows' });
      rows.forEach((r, i) => {
        const tr = h('div', 'tr tbl-row' + (r.me ? ' me' : '') + (i >= 2 ? ' out' : ''), null, { 'data-id': r.id });
        tr.appendChild(h('span', 'pl', String(r.pos || i + 1)));
        tr.appendChild(h('span', 'club', String(r.label || label(r.id))));
        [r.P, r.W, r.D, r.L].forEach((v) => tr.appendChild(h('span', null, String(v || 0))));
        tr.appendChild(h('span', null, gdTxt(r.GD || 0)));
        tr.appendChild(h('span', 'pts', String(r.Pts || 0)));
        body.appendChild(tr);
        if (i === 1) {
          const cut = h('div', 'cutline'); cut.append(h('i'), h('b', null, 'CUP FINAL LINE'), h('i'));
          body.appendChild(cut);
        }
      });
      box.appendChild(body);
      root.appendChild(box);
      root.appendChild(h('div', 'sx-note n3', sn.md ? noteText(s) : 'Table starts after matchday 1. Top 2 play the Cup Final.', { id: 'tbl-note' }));
      const fx = sn.md < 7 ? nextFixture(s) : null;
      const st = h('div', 'sx-card glass strip');
      if (fx) {
        const c = club(fx.clubId);
        const r1 = h('div', 'sx-row'); r1.append(h('span', 'sx-sub', 'Next: matchday ' + fx.md + ' of 7'), haChip(fx.home));
        st.append(r1, h('div', 'sx-nm', String(c.name || c.label).toUpperCase()));
        const sc = scoutLine(c, true); if (sc) st.appendChild(h('div', 'sx-scout', sc));
      } else {
        const gate = cupGate(s);
        st.appendChild(h('div', 'sx-sub', 'Season: all 7 matchdays played'));
        st.appendChild(h('div', 'sx-nm', gate.reached ? 'CUP FINAL' : 'NO FINAL THIS YEAR'));
      }
      root.appendChild(st);
    }
    function drawFixtures() {
      const sn = seasonOf(s), sc = SEAS();
      const list = h('div', 'sx-fix', null, { id: 'fix-rows' });
      for (let md = 1; md <= 7; md++) {
        const id = sc.order[md - 1], home = !!sc.home[md - 1];
        const r = resultFor(s, md);
        const row = h('div', 'fx-row' + (r ? ' done ' + resCls(r.res) : md === sn.md + 1 && !sn.done ? ' next' : ''), null, { 'data-md': md });
        row.appendChild(h('span', 'no', 'MD' + md));
        row.appendChild(haChip(home));
        row.appendChild(h('span', 'cl', label(id)));
        const rs = h('span', 'rs');
        if (r) { rs.innerHTML = '<span class="ic">' + resMark(r.res) + '</span>'; rs.appendChild(h('b', null, r.me + '-' + r.opp)); row.setAttribute('aria-label', 'Matchday ' + md + ' ' + label(id) + ': ' + resWord(r.res).toLowerCase()); }
        else if (md === sn.md + 1 && !sn.done) rs.appendChild(h('b', 'nx', 'NEXT'));
        else rs.appendChild(h('i', 'empty'));
        row.appendChild(rs);
        list.appendChild(row);
      }
      const gate = cupGate(s), cup = sn.cup || {};
      const cr = h('div', 'fx-row cupr' + (cup.played ? ' done ' + (cup.won ? 'win' : 'loss') : sn.md >= 7 && gate.reached ? ' next' : ' locked'), null, { 'data-md': 'cup' });
      const ic = h('span', 'cupic'); ic.innerHTML = cupSvg(cup.played ? (cup.won ? 'won' : 'open') : sn.md >= 7 && gate.reached ? 'open' : 'locked');
      cr.appendChild(ic);
      const tx = h('span', 'cl');
      tx.appendChild(h('b', null, 'CUP FINAL'));
      let sub = 'Top 2 after matchday 7';
      const oid = cupOppId(s, gate);
      if (cup.played) sub = (cup.won ? 'Won ' : 'Lost ') + (cup.me != null ? cup.me + '-' + cup.them : '') + (cup.shoot ? ' (kicks ' + cup.shoot.me + '-' + cup.shoot.opp + ')' : '');
      else if (sn.md >= 7) sub = gate.reached ? (oid ? 'vs ' + label(oid) + ', neutral ground' : 'You are in') : 'Not reached: you finished ' + ord(placeOf(s).pos);
      tx.appendChild(h('span', 'sub', sub));
      cr.appendChild(tx);
      list.appendChild(cr);
      root.appendChild(list);
    }
    guard(root, 250);
    draw();
  }

  // =====================================================================
  // U4 Matchday results
  // =====================================================================
  function renderMdres(el) {
    const s = S(), a = app();
    const root = mount(el, 'mdres');
    tellBug(s);
    const md = a.lastMd || null;
    const sn = seasonOf(s);
    if (!md || !md.mine) {
      root.appendChild(h('div', 'sx-head', null)).appendChild(h('span', 'sx-ttl', 'Matchday results'));
      root.appendChild(h('div', 'sx-note', 'No matchday to show yet.'));
      const f0 = h('div', 'sx-foot'); f0.appendChild(btn('btn-hub', 'Back to hub', 'primary', () => (a.toHub ? a.toHub() : a.go('hub')))); root.appendChild(f0);
      return;
    }
    const first = md.md === 1;
    const head = h('div', 'sx-head');
    head.appendChild(h('span', 'sx-ttl', 'Matchday ' + md.md + ' results'));
    head.appendChild(h('span', 'sx-sub', 'of 7'));
    root.appendChild(head);

    // my row
    const m = md.mine, home = m.h === 'preston';
    const myG = home ? m.hs : m.as, opG = home ? m.as : m.hs;
    const res = myG > opG ? 'W' : myG < opG ? 'L' : 'D';
    const oid = home ? m.a : m.h;
    const mine = h('div', 'sx-mine glass ' + resCls(res), null, { id: 'mdres-mine' });
    const mr = h('div', 'sx-row'); mr.append(h('span', 'sx-sub', 'Your match'), haChip(home));
    mine.appendChild(mr);
    const sb = h('div', 'sx-score');
    sb.appendChild(h('span', 'tm me', 'PRESTON'));
    sb.appendChild(h('span', 'sc', myG + ' - ' + opG));
    sb.appendChild(h('span', 'tm', label(oid)));
    mine.appendChild(sb);
    const st = h('div', 'sx-stamp ' + resCls(res));
    st.innerHTML = '<span class="ic">' + resMark(res) + '</span>';
    st.appendChild(h('b', null, resWord(res).toUpperCase()));
    mine.appendChild(st);
    root.appendChild(mine);

    // other fixtures
    const oth = h('div', 'sx-others glass', null, { id: 'mdres-others' });
    (md.others || []).forEach((f) => {
      const r = h('div', 'ot');
      r.append(h('span', 'l', label(f.h)), h('span', 'sc', f.hs + ' - ' + f.as), h('span', 'r', label(f.a)));
      oth.appendChild(r);
    });
    root.appendChild(oth);

    // table with move arrows (tall screens) and a one-line summary (short screens)
    const rows = tableRows(s);
    const meNow = rows.find((r) => r.me);
    const gained = md.ptsGained != null ? md.ptsGained : (res === 'W' ? 3 : res === 'D' ? 1 : 0);
    const before = md.before || {}, after = md.after || {};
    const pBefore = before.preston, pAfter = after.preston != null ? after.preston : (meNow && meNow.pos);
    const summ = h('div', 'sx-sum', null, { id: 'mdres-sum' });
    const moved = !first && pBefore != null && pAfter != null ? (pBefore - pAfter) : 0;
    summ.appendChild(h('b', null, ord(pAfter || 0) + (first ? '' : moved > 0 ? ' (up from ' + ord(pBefore) + ')' : moved < 0 ? ' (down from ' + ord(pBefore) + ')' : ' (same)')));
    summ.appendChild(h('span', null, (meNow ? meNow.Pts : '') + ' pts · +' + gained + ' this matchday'));
    root.appendChild(summ);
    const box = h('div', 'sx-mini glass', null, { id: 'mdres-table' });
    rows.forEach((r, i) => {
      const d = (!first && before[r.id] != null && after[r.id] != null) ? before[r.id] - after[r.id] : 0;
      const tr = h('div', 'mr' + (r.me ? ' me' : '') + (i >= 2 ? ' out' : ''), null, { 'data-id': r.id });
      tr.appendChild(h('span', 'pl', String(r.pos || i + 1)));
      tr.appendChild(h('span', 'club', String(r.label || label(r.id))));
      const ar = h('span', 'ar ' + (first ? 'none' : d > 0 ? 'up' : d < 0 ? 'down' : 'same'));
      ar.textContent = first ? '' : d > 0 ? '▲ ' + d : d < 0 ? '▼ ' + (-d) : '–';
      if (!first) ar.setAttribute('aria-label', d > 0 ? 'up ' + d : d < 0 ? 'down ' + (-d) : 'same place');
      tr.appendChild(ar);
      tr.appendChild(h('span', 'pts', String(r.Pts || 0)));
      box.appendChild(tr);
      if (i === 1) box.appendChild(h('div', 'cut'));
    });
    root.appendChild(box);
    if (first) root.appendChild(h('div', 'sx-note first', 'First table of the season.'));

    // earned
    const rw = a.lastReward || {};
    const chips = h('div', 'sx-chips two');
    const cc = h('div', 'sx-chip static'); cc.append(h('span', 'lbl', 'Coins'), h('b', null, '+' + (rw.coins || 0)));
    const sc = h('div', 'sx-chip static sp'); sc.append(h('span', 'lbl', 'Skill Points'), h('b', null, '+' + (rw.sp || 0)));
    chips.append(cc, sc);
    root.appendChild(chips);

    const foot = h('div', 'sx-foot');
    foot.appendChild(btn('btn-hub', 'Back to hub', 'primary', () => (a.toHub ? a.toHub() : a.go('hub'))));
    root.appendChild(foot);
    guard(root, 400);
  }

  // =====================================================================
  // U6 Cup intro
  // =====================================================================
  function renderCupIntro(el) {
    const s = S(), a = app();
    const root = mount(el, 'cupintro');
    setBug('SQUAD DUEL · CUP FINAL');
    const gate = cupGate(s);
    const oid = cupOppId(s, gate), c = club(oid);
    const hero = h('div', 'ci-hero');
    const cupw = h('div', 'ci-cup'); cupw.innerHTML = cupSvg('open');
    const tx = h('div', 'ci-tx');
    tx.appendChild(h('div', 'ci-tag', 'CUP FINAL'));
    tx.appendChild(h('div', 'ci-big', 'Neutral ground'));
    tx.appendChild(h('p', 'ci-p', 'No Roar for either side. One match, and someone must win.'));
    hero.append(cupw, tx);
    root.appendChild(hero);
    const card = h('div', 'sx-card glass', null, { id: 'cup-opp' });
    const r1 = h('div', 'sx-row'); r1.append(h('span', 'sx-sub', 'Your opponent'), haChip(false, true));
    card.appendChild(r1);
    card.appendChild(h('div', 'sx-nm', oid ? String(c.name || c.label).toUpperCase() : 'The other finalist'));
    if (c.style) card.appendChild(h('div', 'sx-style', c.style));
    const sc = oid ? scoutLine(c) : '';
    if (sc) card.appendChild(h('div', 'sx-scout', sc));
    root.appendChild(card);
    root.appendChild(h('div', 'sx-note gold', 'Level at full time: a shootout decides it.', { id: 'cup-rule' }));
    const foot = h('div', 'sx-foot');
    // admin default: Kick off goes through the Manager (lineup check before the final)
    foot.append(btn('btn-cup-lineup', 'Lineup', '', () => a.go('manager')), btn('btn-cup-kick', 'Kick off', 'primary gold', () => a.go('manager')));
    root.appendChild(foot);
    guard(root, 400);
  }

  // =====================================================================
  // U8 Cup won / season end
  // =====================================================================
  function renderSeasonEnd(el) {
    const s = S(), a = app(), t = T();
    const root = mount(el, 'season-end');
    tellBug(s);
    const sn = seasonOf(s), cup = sn.cup || {};
    const me = myRow(s) || { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0, pos: placeOf(s).pos };
    const won = !!(cup.played && cup.won), lost = !!(cup.played && !cup.won);
    root.classList.add(won ? 'won' : lost ? 'lost' : 'nofinal');
    let pay = { coins: 0, why: '' };
    try { if (SD.season && SD.season.seasonPay) pay = SD.season.seasonPay(s, t) || pay; } catch (e) { console.error(e); }

    const hero = h('div', 'se-hero');
    const cw = h('div', 'se-cup'); cw.innerHTML = cupSvg(won ? 'won' : lost ? 'open' : 'locked');
    const ht = h('div', 'se-ht');
    ht.appendChild(h('div', 'se-title', won ? 'CUP WON' : lost ? 'CUP FINAL LOST' : 'NO FINAL THIS YEAR'));
    let sub = '';
    if (won) sub = 'Season ' + sn.no + ' champions' + (cup.shoot ? ' on kicks ' + cup.shoot.me + '-' + cup.shoot.opp : cup.me != null ? ', ' + cup.me + '-' + cup.them : '') + '.';
    else if (lost) sub = 'Beaten' + (cup.shoot ? ' on kicks ' + cup.shoot.me + '-' + cup.shoot.opp : cup.me != null ? ', ' + cup.me + '-' + cup.them : '') + '. Next year.';
    else sub = 'Only the top 2 play the Cup Final. You finished ' + ord(me.pos) + '.';
    ht.appendChild(h('div', 'se-sub', sub));
    hero.append(cw, ht);
    root.appendChild(hero);

    const mid = h('div', 'se-mid');
    const stats = h('div', 'se-stats glass', null, { id: 'se-stats' });
    const line = (k, v, cls) => { const r = h('div', 'r' + (cls ? ' ' + cls : '')); r.append(h('span', 'k', k), h('b', null, String(v))); stats.appendChild(r); };
    line('Final place', ord(me.pos) + ' · ' + me.Pts + ' pts');
    line('Played W D L', me.P + ' · ' + me.W + ' ' + me.D + ' ' + me.L);
    line('Goals', me.GF + ' for, ' + me.GA + ' against');
    line('Season pay', (pay.coins ? '+' + pay.coins : '0') + ' Coins', 'gold');
    if (pay.why) stats.lastChild.appendChild(h('span', 'why', pay.why));
    line('Pulls so far', s.pulls || 0);
    mid.appendChild(stats);

    // squad mini grid (4 rows x 5 columns)
    const players = D().PLAYERS || [];
    const owned = s.owned || {};
    const count = players.filter((p) => owned[p.id]).length;
    const sq = h('div', 'se-squad glass', null, { id: 'se-squad' });
    sq.appendChild(h('div', 'sx-sub', 'Squad ' + count + '/20'));
    const g = h('div', 'se-grid');
    for (let i = 0; i < 20; i++) {
      const p = players[i];
      const own = p && owned[p.id];
      const cell = h('div', 'cell r-' + String((p && p.rarity) || 'common').toLowerCase() + (own ? ' own' : ' no'));
      if (own) cell.appendChild(h('span', 'nm', p.name));
      else { const sil = h('span', 'sil'); sil.innerHTML = SILH; cell.appendChild(sil); }
      g.appendChild(cell);
    }
    sq.appendChild(g);
    mid.appendChild(sq);
    root.appendChild(mid);

    if (won) root.appendChild(h('div', 'sx-note gold', 'Defend the Cup: season ' + (sn.no + 1) + ' clubs are one step stronger.', { id: 'se-defend' }));
    else root.appendChild(h('div', 'sx-note', 'Next season every club gains +1 DEF, keeper and attack. Your squad, tree and Coins carry over.', { id: 'se-next' }));

    const foot = h('div', 'sx-foot');
    const cp = btn('btn-copy-report', 'Copy report', '', () => {
      let txt = '';
      try { if (SD.season && SD.season.reportLines) txt = SD.season.reportLines(s, t).join('\n'); } catch (e) {}
      if (!txt) { try { if (SD.tweak && SD.tweak.report) txt = SD.tweak.report(); } catch (e) {} }
      clip(txt || 'SEASON ' + sn.no, (ok) => { cp.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { cp.textContent = 'Copy report'; }, 1500); });
    });
    foot.append(cp, btn('btn-next-season', 'Next season', 'primary' + (won ? ' gold' : ''), () => { if (a.nextSeason) a.nextSeason(); }));
    root.appendChild(foot);
    guard(root, 600);
  }

  SD.ui.start = { render: renderStart };
  SD.ui.hub = { render: renderHub };
  SD.ui.table = { render: renderTable, _tab: 'table' };
  SD.ui.mdres = { render: renderMdres };
  SD.ui.cupintro = { render: renderCupIntro };
  SD.ui.seasonEnd = { render: renderSeasonEnd };
})();
