(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  const ROLE_ICON = {
    Striker: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z',
    Playmaker: 'M4 12h16M14 6l6 6-6 6',
    Winger: 'M3 17l6-10 4 6 3-4 5 8z',
    Anchor: 'M12 3v14M7 8h10M5 14a7 7 0 0 0 14 0',
    Keeper: 'M6 20V9a2 2 0 0 1 4 0v-3a2 2 0 0 1 4 0v3a2 2 0 0 1 4 0v11z'
  };
  // row 25: slot captions dropped (position is cosmetic, engine ignores it); only used for aria labels
  const SLOT_LABEL = { k: 'Keeper slot', o0: 'Pitch slot 1', o1: 'Pitch slot 2', o2: 'Pitch slot 3', o3: 'Pitch slot 4', b0: 'Bench slot 1', b1: 'Bench slot 2' };
  // row 25: role job in one word (two words do not fit 72px cards). admin default wording
  const ROLE_JOB = { Striker: 'Shoots', Playmaker: 'Passes', Winger: 'Dribbles', Anchor: 'Defends', Keeper: 'Saves' };
  // row 27: one-line trait effect (short form of SD.data.TRAITS text; admin default wording)
  const TRAIT_LINE = {
    T_PLAYMAKER: 'Won Pass: draw 1 extra card',
    T_WINGER: 'Dribble ignores Press once',
    T_STRIKER: 'Once a match, reroll a Shoot die',
    T_ANCHOR: 'First lost duel each match, ball stays',
    T_KEEPER: 'Once a match, reroll a shot against me'
  };
  // row 26: shorter formation copy (admin default wording)
  const FORM_LINE = { Wall: 'Stops Dribble: +3 defend', Diamond: 'Stops Through ball: +3 defend, +1 Pass', Spear: '+1 Dribble, +1 Shoot' };
  const MOVE_WORD = { dribble: 'dribble', through: 'through ball', pass: 'pass', shoot: 'shoot' };
  const STAT_KEYS = ['pac', 'pas', 'sho', 'def'];

  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function icon(role) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '16'); s.setAttribute('height', '16');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ri');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ROLE_ICON[role] || ROLE_ICON.Striker);
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round');
    s.appendChild(p); return s;
  }
  function cap(s) { s = String(s || ''); return s.charAt(0) + s.slice(1).toLowerCase(); }

  function playerOf(pid) {
    const S = SD.app.S, T = SD.app.T;
    let P = null;
    try { P = SD.progress.statsOf(S, pid, T); } catch (e) { P = null; }
    if (!P) P = Object.assign({}, SD.data.byId(pid));
    const own = (S.owned && S.owned[pid]) || {};
    P.level = P.level || own.level || 1;
    P.isNew = !!own.isNew;
    P.rarity = P.rarity || (SD.data.byId(pid) || {}).rarity || 'Common';
    return P;
  }
  function topStat(P) {
    if (P.role === 'Keeper') return { k: 'DEF', v: P.def };
    let best = 'pac';
    STAT_KEYS.forEach(k => { if (P[k] > P[best]) best = k; });
    return { k: best.toUpperCase(), v: P[best] };
  }
  function traitName(P) {
    const t = SD.data.TRAITS && SD.data.TRAITS[P.role];
    return t ? t.name : 'Trait';
  }

  function traitLine(P) {
    const t = SD.data.TRAITS && SD.data.TRAITS[P.role];
    return (t && TRAIT_LINE[t.id]) || (t ? t.text : '');
  }
  // row 26: formation whose defence bonus names the first move the scout mentions (tag only, never auto-picks)
  function fitFormation(club) {
    const sc = String(club.scout || '').toLowerCase();
    let best = null, at = 1e9;
    Object.keys(SD.data.FORMATIONS).forEach(n => {
      const dv = SD.data.FORMATIONS[n].defVs || {};
      Object.keys(dv).forEach(k => {
        const i = sc.indexOf(MOVE_WORD[k] || k);
        if (i >= 0 && i < at) { at = i; best = n; }
      });
    });
    return best;
  }

  function miniCard(P, kind) {
    const ts = topStat(P);
    const rar = String(P.rarity || 'Common').toLowerCase();
    const c = h('span', { class: 'mc r-' + rar }, [
      h('span', { class: 'mc-top' }, [icon(P.role), h('span', { class: 'mc-role', text: ROLE_JOB[P.role] || P.role })]),
      h('span', { class: 'mc-name', text: P.name }),
      h('span', { class: 'mc-stat' }, [h('b', { text: ts.k + ' ' + ts.v })])
    ]);
    const bd = h('span', { class: 'mc-badges' });
    if (P.isNew) bd.appendChild(h('span', { class: 'badge-new', text: 'NEW' }));
    if (P.level >= 2) bd.appendChild(h('span', { class: 'badge-trait', title: traitName(P) + ': ' + traitLine(P), text: traitName(P) }));
    if (bd.firstChild) c.appendChild(bd);
    return c;
  }

  function render(el) {
    const S = SD.app.S;
    const T = SD.app.T;
    // opponent: season fixture (league) or cup opponent; fallback to shipped FIXTURES list
    let opp = null;
    try {
      const sea = SD.season, cs = S.season;
      if (sea && cs && cs.md === 7 && !(cs.cup && cs.cup.played) && sea.cupGate) {
        const g = sea.cupGate(S);
        if (g && g.reached && g.opp) opp = { md: 8, cup: true, clubId: g.opp, mode: 'neutral' };
      }
      if (!opp && sea && sea.fixtureFor) {
        const f = sea.fixtureFor(S);
        if (f) opp = { md: f.md, cup: false, clubId: f.clubId, mode: f.mode || (f.home ? 'home' : 'away') };
      }
    } catch (e) { opp = null; }
    if (!opp) {
      const mn = (SD.progress && SD.progress.matchNo ? SD.progress.matchNo(S) : 1) || 1;
      opp = { md: mn, cup: false, clubId: SD.data.FIXTURES[mn - 1] || SD.data.FIXTURES[0], mode: 'home' };
    }
    let club = null;
    try { if (SD.season && SD.season.clubFor) club = SD.season.clubFor(S, opp.clubId, T, opp.md); } catch (e) { club = null; }
    if (!club) club = SD.data.CLUBS[opp.clubId];
    const matchNo = opp.md;
    let selected = null; // slot being swapped
    let flash = null;    // { slots: [..], msg } after a swap (row 24)
    let flashTimer = 0;
    let detailPid = SD.app.openCard || null; SD.app.openCard = null; // U10 card detail overlay (jump=card sets openCard)

    el.innerHTML = '';
    const root = h('div', { id: 'mgr' });
    el.appendChild(root);

    function paint() {
      root.innerHTML = '';
      const L = S.lineup;
      const slotPid = { k: L.keeper, o0: L.outfield[0], o1: L.outfield[1], o2: L.outfield[2], o3: L.outfield[3], b0: L.bench[0], b1: L.bench[1] };

      const back = h('button', { type: 'button', id: 'btn-mgr-back', 'aria-label': 'Back to hub' }, [h('span', { 'aria-hidden': 'true', text: '‹' })]);
      back.addEventListener('click', () => { SD.app.save(); if (SD.app.toHub) SD.app.toHub(); else SD.app.go('hub'); });
      const modeWord = opp.mode === 'neutral' ? 'NEUTRAL' : opp.mode === 'away' ? 'AWAY' : 'HOME';
      const subTx = opp.cup ? 'Cup Final · pick five' : 'Matchday ' + matchNo + ' of 7 · pick five';
      root.appendChild(h('div', { class: 'mgr-head' }, [
        back,
        h('div', { class: 'mgr-title' }, [h('span', { class: 'mgr-club', text: 'PROUD PRESTON' }), h('span', { class: 'mgr-sub', text: subTx })])
      ]));
      root.appendChild(h('div', { class: 'mgr-chips' }, [
        h('span', { class: 'chip mode m-' + opp.mode, id: 'mgr-mode', text: modeWord }),
        h('span', { class: 'mgr-vs', id: 'mgr-vs', text: 'v ' + String(club.name || club.label).toUpperCase() })
      ]));
      if (club.hint) root.appendChild(h('div', { class: 'mgr-chips' }, [h('span', { class: 'chip hint', id: 'mgr-hint', text: club.hint })]));
      root.appendChild(h('p', { id: 'scout', text: club.scout }));

      // Captain pick (Squad tier 3 node S3 only)
      if ((S.nodes || []).indexOf('S3') >= 0) {
        const lu = S.lineup, ids = [lu.keeper].concat(lu.outfield);
        const row = h('div', { id: 'captain-pick', role: 'group', 'aria-label': 'Captain' });
        ids.forEach(pid => {
          const P = playerOf(pid), on = S.captain === pid;
          const b = h('button', { type: 'button', class: 'cap' + (on ? ' on' : ''), 'data-pid': pid, 'aria-pressed': on ? 'true' : 'false' }, [
            h('small', { text: on ? 'CAPTAIN' : 'Captain?' }), h('b', { text: P.name })
          ]);
          b.addEventListener('click', () => {
            if (SD.progress && SD.progress.setCaptain) SD.progress.setCaptain(S, pid); else S.captain = pid;
            SD.app.save(); paint();
          });
          row.appendChild(b);
        });
        root.appendChild(h('h3', { class: 'mgr-h', text: 'Captain: Trait + Signature reset at half-time' }));
        root.appendChild(row);
      }

      // row 23: new pull strip
      const newIds = Object.keys(S.owned || {}).filter(pid => S.owned[pid] && S.owned[pid].isNew && SD.data.byId(pid));
      if (newIds.length) {
        const np = playerOf(newIds[0]), nts = topStat(np);
        const fieldBtn = h('button', { type: 'button', id: 'btn-field-new', 'data-pid': np.id || newIds[0] }, ['Field him']);
        fieldBtn.addEventListener('click', () => {
          const lu = S.lineup;
          const cur = np.role === 'Keeper' ? 'k' : (lu.outfield.map((p, i) => ({ p, i })).filter(o => playerOf(o.p).role === np.role)[0] || { i: 0 }).i;
          selected = typeof cur === 'string' ? cur : 'o' + cur;
          paint();
        });
        root.appendChild(h('div', { id: 'new-strip', role: 'status' }, [
          h('span', { class: 'ns-tx' }, [h('span', { class: 'badge-new', text: 'NEW' }), h('b', { text: np.name + ', ' + np.role + ', ' + nts.k + ' ' + nts.v })]),
          fieldBtn
        ]));
      }

      function slotBtn(sl, kind) {
        const pid = slotPid[sl];
        const P = playerOf(pid);
        const b = h('button', { type: 'button', class: 'slot' + (selected === sl ? ' sel' : '') + (flash && flash.slots.indexOf(sl) >= 0 ? ' flash' : ''), 'data-slot': sl, 'data-pid': pid, 'aria-label': SLOT_LABEL[sl] + ': ' + P.name + '. Tap to swap.' }, [
          miniCard(P, kind)
        ]);
        b.addEventListener('click', () => { selected = sl; paint(); });
        return b;
      }
      const pitch = h('div', { id: 'mgr-pitch', 'aria-label': 'On the pitch' }, [
        h('div', { class: 'row r-k' }, [slotBtn('k')]),
        h('div', { class: 'row r-o' }, ['o0', 'o1', 'o2', 'o3'].map(s => slotBtn(s)))
      ]);
      const bench = h('div', { id: 'mgr-bench', 'aria-label': 'Bench' }, [slotBtn('b0'), slotBtn('b1')]);
      const squadCol = h('div', { class: 'mgr-col a' }, [
        h('h3', { class: 'mgr-h', text: 'Pitch · tap a player to swap' }), pitch,
        h('h3', { class: 'mgr-h', text: 'Bench (in your hand)' }), bench
      ]);

      const forms = h('div', { id: 'mgr-forms', role: 'group', 'aria-label': 'Formation' });
      const fit = fitFormation(club);
      [['Wall', 'form-wall'], ['Diamond', 'form-diamond'], ['Spear', 'form-spear']].forEach(([n, id]) => {
        const f = SD.data.FORMATIONS[n];
        const on = S.formation === n;
        const b = h('button', { type: 'button', id, class: 'form' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false' }, [
          h('b', {}, [n, fit === n ? h('em', { class: 'fit', text: 'Fits this scout' }) : null]), h('span', { text: FORM_LINE[n] || f.text })
        ]);
        b.addEventListener('click', () => { S.formation = n; SD.app.save(); paint(); });
        forms.appendChild(b);
      });
      const kick = h('button', { type: 'button', id: 'btn-kickoff' }, [h('span', { text: (opp.cup ? 'Cup Final v ' : 'Kick off v ') + cap(club.label || club.name) }), h('i', { 'aria-hidden': 'true', text: '›' })]);
      kick.addEventListener('click', () => { SD.app.save(); SD.app.go('match'); });
      const ctrlCol = h('div', { class: 'mgr-col b' }, [h('h3', { class: 'mgr-h', text: 'Formation' }), forms]);

      const body = h('div', { class: 'mgr-body' }, [squadCol, ctrlCol]);
      root.appendChild(body);
      root.appendChild(h('div', { class: 'mgr-foot' }, [kick]));

      if (flash) root.appendChild(h('div', { id: 'swap-toast', role: 'status', text: flash.msg }));
      if (selected) root.appendChild(panel(selected, slotPid));
      if (detailPid) root.appendChild(detail(detailPid));
    }

    // U10 player card detail: stats old -> new (risen stat in neon), Trait, Signature, Close
    function detail(pid) {
      const base = SD.data.byId(pid) || {}, P = playerOf(pid), own = (S.owned && S.owned[pid]) || {};
      const lvl = P.level || 1, stars = own.stars || 0;
      const maxS = (SD.data.PULL && SD.data.PULL.maxStars) || 5;
      const rar = String(P.rarity || 'Common').toLowerCase();
      const stats = h('div', { class: 'cd-stats' });
      STAT_KEYS.forEach(k => {
        const o = base[k], n = P[k], up = n > o;
        stats.appendChild(h('div', { class: 'cd-stat' + (up ? ' up' : '') }, [
          h('span', { class: 'k', text: k.toUpperCase() }),
          h('span', { class: 'v', text: up ? o + ' → ' + n : String(n) })
        ]));
      });
      const tr = SD.data.TRAITS && SD.data.TRAITS[P.role];
      const tbox = h('div', { class: 'cd-box' + (lvl >= 2 ? '' : ' dim') }, tr ? (lvl >= 2
        ? [h('b', { text: 'Trait: ' + tr.name }), h('span', { text: traitLine(P) })]
        : [h('b', { text: 'Level 2 gives a Trait' })]) : [h('b', { text: 'No Trait' })]);
      const sg = P.sig || base.sig;
      const sbox = h('div', { class: 'cd-box sig' }, sg
        ? [h('b', { text: 'Signature: ' + sg.name }), h('span', { text: sg.text || '' })]
        : [h('b', { text: 'No Signature move' })]);
      const close = h('button', { type: 'button', id: 'btn-cd-close' }, ['Close']);
      close.addEventListener('click', () => { detailPid = null; paint(); });
      const pips = '★'.repeat(stars) + '☆'.repeat(Math.max(0, maxS - stars));
      return h('div', { id: 'card-detail', role: 'dialog', 'aria-label': P.name + ' details' }, [
        h('div', { class: 'cd-card r-' + rar }, [
          h('div', { class: 'cd-top' }, [icon(P.role), h('div', { class: 'cd-title' }, [
            h('b', { text: P.name }), h('small', { text: P.rarity + ' ' + P.role + ' · Level ' + lvl + ' · ' + pips })])]),
          stats, tbox, sbox
        ]),
        close
      ]);
    }

    function panel(sl, slotPid) {
      const isK = sl === 'k';
      const cur = slotPid[sl];
      const where = {};
      where[S.lineup.keeper] = 'Pitch';
      S.lineup.outfield.forEach(p => { where[p] = 'Pitch'; });
      S.lineup.bench.forEach(p => { where[p] = 'Bench'; });
      const ids = Object.keys(S.owned || {}).filter(pid => {
        const d = SD.data.byId(pid); if (!d) return false;
        return isK ? d.role === 'Keeper' : d.role !== 'Keeper';
      });
      // current slot first, then pitch, bench, rest
      // row 23: NEW first, then current slot, pitch, bench, rest
      const isNewP = pid => !!(S.owned[pid] && S.owned[pid].isNew);
      const rank = pid => isNewP(pid) ? -1 : pid === cur ? 0 : where[pid] === 'Pitch' ? 1 : where[pid] === 'Bench' ? 2 : 3;
      ids.sort((a, b) => rank(a) - rank(b));
      const curP = playerOf(cur);
      const msg = h('p', { class: 'sq-msg', id: 'sq-msg', role: 'status', text: 'Tap a player to swap with ' + curP.name + '.' });
      const list = h('div', { class: 'sq-list' });
      ids.forEach(pid => {
        const P = playerOf(pid), ts = topStat(P);
        const isCur = pid === cur;
        const b = h('button', { type: 'button', class: 'sq-main', 'data-pid': pid, 'aria-label': P.name + (isCur ? ' (here now)' : '') }, [
          h('span', { class: 'sq-ic' }, [icon(P.role)]),
          h('span', { class: 'sq-tx' }, [
            h('b', { text: P.name }),
            h('small', { text: P.role + ' · ' + P.rarity + ' · L' + P.level })
          ]),
          P.level >= 2 ? h('span', { class: 'sq-trait', text: traitName(P) + ': ' + traitLine(P) }) : null,
          h('span', { class: 'sq-st', text: 'PAC ' + P.pac + ' PAS ' + P.pas + ' SHO ' + P.sho + ' DEF ' + P.def }),
          h('span', { class: 'sq-tags' }, [
            P.isNew ? h('span', { class: 'badge-new', text: 'NEW' }) : null,
            h('span', { class: 'sq-where', text: isCur ? 'Here now' : (where[pid] || 'Squad') })
          ])
        ]);
        b.addEventListener('click', () => {
          if (isCur) { selected = null; paint(); return; }
          const r = SD.progress.swap(S, sl, pid);
          if (r && r.ok === false) { const m = document.getElementById('sq-msg'); if (m) m.textContent = r.why || 'Cannot swap.'; return; }
          if (S.owned[pid]) S.owned[pid].isNew = false;
          const from = Object.keys(slotPid).find(k => slotPid[k] === pid);
          flash = { slots: [sl].concat(from && from !== sl ? [from] : []), msg: P.name + ' in, ' + curP.name + ' out' };
          clearTimeout(flashTimer);
          flashTimer = setTimeout(() => {
            flash = null;
            root.querySelectorAll('.flash').forEach(e => e.classList.remove('flash'));
            const t = document.getElementById('swap-toast'); if (t) t.remove();
          }, 1400);
          SD.app.save(); selected = null; paint();
        });
        const info = h('button', { type: 'button', class: 'sq-info', 'data-pid': pid, 'aria-label': 'Card details for ' + P.name }, [h('span', { text: 'Card' })]);
        info.addEventListener('click', () => { detailPid = pid; paint(); });
        const row = h('div', { class: 'sq-card' + (isCur ? ' cur' : '') + (isNewP(pid) ? ' isnew' : ''), 'data-pid': pid }, [b, info]);
        list.appendChild(row);
      });
      const close = h('button', { type: 'button', id: 'btn-sq-close', class: 'sq-close' }, ['Close']);
      close.addEventListener('click', () => { selected = null; paint(); });
      return h('div', { id: 'mgr-squad', role: 'dialog', 'aria-label': 'Choose player' }, [
        h('div', { class: 'sq-head' }, [h('b', { text: isK ? 'Choose keeper' : 'Choose player' }), close]),
        msg, list
      ]);
    }
    paint();
  }

  SD.ui = SD.ui || {};
  SD.ui.manager = { render };
})();
