(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});

  // ---------- helpers ----------
  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'on') { for (const ev in v) e.addEventListener(ev, v[ev]); }
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function app() { return SD.app || {}; }
  function S() { return app().S || {}; }
  function T() { return app().T || (SD.data && SD.data.TWEAK_DEFAULTS) || {}; }
  function reduced() { return !!(app().reduced || app().fast || (T() && T().reducedMotion)); }
  function pdata(pid) { return (SD.data && SD.data.byId && SD.data.byId(pid)) || { id: pid, name: pid, role: '' }; }
  function go(step) { if (app().go) app().go(step); }
  function save() { try { if (app().save) app().save(); } catch (e) { /* ignore */ } }
  function toast(m) { try { if (app().toast) app().toast(m); } catch (e) { /* ignore */ } }
  function traitOf(role) { return (SD.data && SD.data.TRAITS && SD.data.TRAITS[role]) || null; }
  // admin default: Trait text fallback when data.js has no text field
  function traitText(t) { return (t && (t.text || t.desc)) || ''; }
  // row 27/38: data.js is frozen, so player-facing one-liners live here, keyed by data name; unknown names fall back to data text
  const TRAIT_LINE = {
    'Spare Ball': 'A won Pass draws you 1 extra card',
    'Quick Feet': 'Dribble ignores Press, once a match',
    'Second Strike': 'Re-roll your Shoot die, once a match',
    'Hold Firm': 'Your first lost duel each match: ball stays',
    'Big Read': 'Re-rolls the first scoring shot against you'
  };
  function traitLine(t) { return (t && TRAIT_LINE[t.name]) || traitText(t); }
  const LOCKED_LINE = {
    'Second Look': 'Swap your card after seeing the odds',
    'Long Range': 'Anyone may shoot from Midfield, once',
    'Finisher': 'After 2 goals, +1 on Shoot',
    'Press Master': 'Press ignores the -1 vs Through, once',
    'Sweeper': 'A lost duel at the back: ball stays put',
    'Fortress': 'After a save, ball goes to your Midfield',
    'Captain': 'A Signature move can fire twice',
    'Scout Net': 'Scout line also shows their top card',
    'Big Day': 'Home Roar needs 2 Crowd, not 3'
  };
  const TAB_NAME = { attack: 'Attack', defence: 'Defence', squad: 'Squad' };

  // ================= RESULT =================
  const R = { sel: null };

  function resultStep(s) {
    return (s.step === 'result2') ? 2 : (s.step === 'result1') ? 1 : ((s.results || []).length || 1);
  }

  function lastResult(s) {
    const rs = s.results || [];
    return rs.length ? rs[rs.length - 1] : { matchNo: 1, club: 'grimsby', me: 0, opp: 0, res: 'D' };
  }

  function lvlFloor(level) {
    const L = (SD.data && SD.data.XP && SD.data.XP.levels) || [0, 30, 80, 150];
    return L[level - 1] || 0;
  }

  function xpInfo(xp) {
    if (SD.progress && SD.progress.xpNext) {
      try { return SD.progress.xpNext(xp); } catch (e) { /* fall through */ }
    }
    const L = (SD.data && SD.data.XP && SD.data.XP.levels) || [0, 30, 80, 150];
    let lv = 1; for (let i = 0; i < L.length; i++) if (xp >= L[i]) lv = i + 1;
    const lo = L[lv - 1], hi = L[lv];
    return { level: lv, into: xp - lo, need: hi === undefined ? 0 : hi - lo, nextLabel: 'Level ' + (lv + 1) };
  }

  function pct(into, need) { return need > 0 ? Math.max(0, Math.min(100, Math.round(100 * into / need))) : 100; }

  function playerRow(pid, slotTag, gain, lvUp, bench) {
    const s = S();
    const own = (s.owned && s.owned[pid]) || { xp: 0, level: 1 };
    const p = pdata(pid);
    const after = xpInfo(own.xp);
    const beforeXp = Math.max(0, own.xp - (gain || 0));
    const before = xpInfo(beforeXp);
    const leveled = after.level > before.level;
    const fillTo = pct(after.into, after.need);
    const fillFrom = leveled ? pct(before.into, before.need) : pct(before.into, before.need);
    const fill = h('i', { class: 'xp-fill', style: 'width:' + (reduced() ? fillTo : fillFrom) + '%' });
    const row = h('button', { type: 'button', class: 'prow' + (lvUp ? ' leveled' : '') + (bench ? ' bench' : '') + (R.sel === pid ? ' sel' : ''), 'data-pid': pid, 'aria-pressed': R.sel === pid ? 'true' : 'false' }, [
      h('span', { class: 'pr-top' }, [
        h('span', { class: 'pr-name', text: p.name }),
        h('span', { class: 'pr-lv', text: 'LV ' + after.level })
      ]),
      h('span', { class: 'pr-sub' }, [
        h('span', { class: 'pr-slot', text: slotTag }),
        h('span', { class: 'pr-gain', text: '+' + (gain || 0) + ' XP' })
      ]),
      h('span', { class: 'xp-bar' }, [fill]),
      h('span', { class: 'pr-to', text: after.need > 0 ? 'to LV ' + (after.level + 1) + ': ' + Math.max(0, after.need - after.into) + ' XP' : 'MAX LEVEL' }),
      lvUp ? h('span', { class: 'pr-new', text: (traitOf(p.role) || {}).name || 'NEW TRAIT' }) : null
    ]);
    // animate the bar after paint
    if (!reduced()) {
      const step2 = function () { fill.style.width = (leveled ? 100 : fillTo) + '%'; };
      requestAnimationFrame(function () { requestAnimationFrame(step2); });
      if (leveled) setTimeout(function () {
        if (!fill.isConnected) return;
        fill.style.transition = 'none'; fill.style.width = '0%';
        requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.transition = ''; fill.style.width = fillTo + '%'; }); });
      }, 700);
    }
    return row;
  }

  function detailFor(pid, levelUps) {
    const s = S();
    const own = (s.owned && s.owned[pid]) || { xp: 0, level: 1 };
    const p = pdata(pid);
    const info = xpInfo(own.xp);
    const lu = (levelUps || []).filter(function (x) { return x.pid === pid; })[0];
    const tr = traitOf(p.role) || {};
    const kids = [h('div', { class: 'dt-head' }, [
      h('b', { text: p.name }), h('span', { text: ' ' + (p.role || '') + ' - ' + own.xp + ' XP' })
    ])];
    if (info.level >= 2 || lu) {
      kids.push(h('div', { class: 'lvl-up' }, [
        h('span', { class: 'lu-k', text: 'LEVEL 2 TRAIT' }),
        h('b', { class: 'lu-n', text: ' ' + (tr.name || (lu && lu.trait && lu.trait.name) || (lu && typeof lu.trait === 'string' ? lu.trait : 'Trait')) }),
        h('span', { class: 'lu-t', text: traitLine(tr) })
      ]));
    }
    const lv3 = lvlFloor(3);
    const togo = Math.max(0, lv3 - own.xp);
    kids.push(h('div', { class: 'lvl-locked' }, [
      svgLock(), h('span', { text: 'Level 3: +1 top stat (' + togo + ' XP to go)' })
    ]));
    return kids;
  }

  function svgLock() {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '14'); s.setAttribute('height', '14');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.4');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic-lock');
    const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', '5'); r.setAttribute('y', '11'); r.setAttribute('width', '14'); r.setAttribute('height', '10'); r.setAttribute('rx', '2');
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', 'M8 11V8a4 4 0 0 1 8 0v3');
    s.appendChild(r); s.appendChild(p); return s;
  }

  function renderResult(el) {
    const s = S();
    const rew = app().lastReward || { coins: 0, sp: 0, xp: {}, levelUps: [], opening: false };
    const lr = lastResult(s);
    const mno = resultStep(s);
    const club = (SD.data && SD.data.CLUBS && SD.data.CLUBS[lr.club]) || { name: lr.club || 'Opponent', label: 'OPP' };
    const resWord = lr.res === 'W' ? 'WIN' : lr.res === 'L' ? 'LOSS' : 'DRAW';
    el.textContent = '';
    const root = h('div', { id: 'result', class: reduced() ? 'noanim' : '' });
    // row 37: the score is printed once (in the scorebox); the header just says what this screen is
    try { if (app().setScorebug) app().setScorebug('FULL TIME'); } catch (e) { /* ignore */ }

    // lineup order
    const lu = s.lineup || { keeper: null, outfield: [], bench: [] };
    const order = [];
    if (lu.keeper) order.push([lu.keeper, 'GK', false]);
    (lu.outfield || []).forEach(function (p) { order.push([p, (pdata(p).role || '').toUpperCase(), false]); });
    (lu.bench || []).forEach(function (p) { order.push([p, 'BENCH', true]); });
    const levelUps = rew.levelUps || [];
    const leveledIds = {}; levelUps.forEach(function (x) { leveledIds[x.pid] = true; });
    if (!R.sel || !order.some(function (o) { return o[0] === R.sel; })) {
      R.sel = (levelUps[0] && levelUps[0].pid) || (order[0] && order[0][0]);
    }

    const banner = rew.opening || mno === 1
      ? h('div', { id: 'opening', class: 'banner' }, [h('b', { text: 'OPENING DAY' }), h('span', { text: ' every starter on the pitch reaches Level 2' })])
      : null;

    const score = h('div', { class: 'scorebox' }, [
      h('div', { class: 'sc-teams' }, [
        h('span', { class: 'sc-t home', text: 'PRESTON' }),
        h('span', { class: 'sc-n', id: 'res-score', text: lr.me + ' - ' + lr.opp }),
        h('span', { class: 'sc-t away', text: club.label || club.name })
      ]),
      h('div', { id: 'res-stamp', class: 'stamp ' + (lr.res === 'W' ? 'w' : lr.res === 'L' ? 'l' : 'd'), text: resWord })
    ]);

    const whyPay = (rew.opening || mno === 1) ? 'Opening Day bonus' : (lr.res === 'W' ? 'Win payout' : lr.res === 'L' ? 'Loss payout' : 'Draw payout');
    function rwTile(id, cls, k, v) {
      return h('div', { id: id, class: 'rw ' + cls }, [
        h('span', { class: 'rw-top' }, [h('span', { class: 'rw-k', text: k }), h('b', { class: 'rw-v', text: '+' + (v || 0) })]),
        h('span', { class: 'rw-why', text: whyPay })
      ]);
    }
    const rewards = h('div', { class: 'rewards' }, [rwTile('rw-coins', 'coins', 'COINS', rew.coins), rwTile('rw-sp', 'sp', 'SKILL POINTS', rew.sp)]);

    const grid = h('div', { id: 'xp-list', class: 'plist' });
    const det = h('div', { id: 'pl-detail', class: 'pdetail' });
    function refreshDetail() { det.textContent = ''; detailFor(R.sel, levelUps).forEach(function (n) { det.appendChild(n); }); }
    order.forEach(function (o) {
      const row = playerRow(o[0], o[1], (rew.xp || {})[o[0]] || 0, !!leveledIds[o[0]], o[2]);
      row.addEventListener('click', function () {
        R.sel = o[0];
        Array.prototype.forEach.call(grid.children, function (c) {
          const on = c.getAttribute('data-pid') === R.sel;
          c.classList.toggle('sel', on); c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        refreshDetail();
      });
      grid.appendChild(row);
    });
    refreshDetail();

    const next = h('button', { id: 'btn-result-next', type: 'button', class: 'btn primary', text: mno >= 2 ? 'See your squad' : 'Spend SP', on: { click: function () { go(mno >= 2 ? 'end' : 'tree'); } } });
    const foot = h('div', { class: 'foot' }, [next]);

    [banner, score, rewards, grid, det, foot].forEach(function (n) { if (n) root.appendChild(n); });
    el.appendChild(root);
  }

  // ================= TREE =================
  const TR = { tab: 'attack', sel: null, confirm: false };
  const TABS = [['attack', 'Attack'], ['defence', 'Defence'], ['squad', 'Squad']];
  // admin default: fallback copy of CONTENT-SHEET 4b tiers 3-5 if SD.data.LOCKED_TREE is absent or shaped differently
  const LOCKED_FALLBACK = {
    attack: [['Second Look', 'After seeing the odds chip, swap your card for another in hand, once'], ['Long Range', 'Shoot allowed from Midfield for anyone, once'], ['Finisher', 'After 2 goals, +1 bonus on Shoot']],
    defence: [['Press Master', 'Press stance ignores the -1 vs Through once'], ['Sweeper', 'A lost duel in Defence zone moves the ball nowhere, once'], ['Fortress', 'After a save, ball goes to your Midfield']],
    squad: [['Captain', 'Pick a player: his Signature move may fire a second time at match 5+'], ['Scout Net', 'Scout line also shows the opponent top card'], ['Big Day', 'Home Roar needs 2 Crowd, not 3']]
  };

  function lockedRows(tab) {
    const out = [];
    const LT = SD.data && SD.data.LOCKED_TREE;
    try {
      if (Array.isArray(LT)) {
        LT.forEach(function (r, i) {
          if (!r) return;
          if (r.tab === tab && r.name) { out.push({ tier: r.tier, name: r.name, text: r.text || '' }); return; }
          const c = r[tab];
          if (c) out.push({ tier: r.tier || i + 3, name: typeof c === 'string' ? c.split(':')[0] : (c.name || ''), text: typeof c === 'string' ? (c.indexOf(':') > -1 ? c.slice(c.indexOf(':') + 1).trim() : '') : (c.text || '') });
        });
      } else if (LT && Array.isArray(LT[tab])) {
        LT[tab].forEach(function (c, i) { out.push({ tier: c.tier || i + 3, name: c.name, text: c.text || '' }); });
      }
    } catch (e) { out.length = 0; }
    if (out.length < 3) {
      out.length = 0;
      LOCKED_FALLBACK[tab].forEach(function (c, i) { out.push({ tier: i + 3, name: c[0], text: c[1] }); });
    }
    // row 38: player-facing copy (data text carries dev notes such as "capstone, only numeric node")
    out.forEach(function (r) { r.text = LOCKED_LINE[r.name] || String(r.text || '').replace(/\s*\([^)]*(capstone|numeric|cap \+)[^)]*\)/i, ''); });
    return out.slice(0, 3);
  }

  function nodes(tab) {
    return ((SD.data && SD.data.NODES) || []).filter(function (n) { return n.tab === tab; }).sort(function (a, b) { return a.tier - b.tier; });
  }
  function nodeById(id) { return ((SD.data && SD.data.NODES) || []).filter(function (n) { return n.id === id; })[0]; }
  function owned(id) { return (S().nodes || []).indexOf(id) > -1; }

  function forkRival(n) {
    if (!n || !n.fork) return null;
    return ((SD.data && SD.data.NODES) || []).filter(function (x) { return x.fork === n.fork && x.id !== n.id; })[0] || null;
  }
  function nodeState(n) {
    if (owned(n.id)) return 'owned';
    if (n.fork) {
      const other = ((SD.data.NODES) || []).filter(function (x) { return x.fork === n.fork && x.id !== n.id && owned(x.id); })[0];
      if (other) return 'fork-locked';
    }
    if (n.req && !owned(n.req)) return 'locked';
    return 'buyable';
  }

  function respecCost() { const t = T(); return t.respecCost !== undefined ? t.respecCost : 50; }

  function renderTree(el) {
    const s = S();
    el.textContent = '';
    if (!nodes(TR.tab).length) TR.tab = 'attack';
    if (!TR.sel || (nodeById(TR.sel) || {}).tab !== TR.tab) TR.sel = (nodes(TR.tab)[0] || {}).id;
    const root = h('div', { id: 'tree', class: reduced() ? 'noanim' : '' });

    const head = h('div', { class: 'thead' }, [
      h('div', { class: 'ttl', text: 'SKILL TREE' }),
      h('div', { class: 'tcoins' }, [h('span', { text: 'COINS ' }), h('b', { id: 'tree-coins', text: String(s.coins || 0) })]),
      h('div', { class: 'tsp' }, [h('span', { text: 'SKILL POINTS ' }), h('b', { id: 'sp', text: String(s.sp || 0) })])
    ]);

    const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(function (t) {
      const spent = (s.spent && s.spent[t[0]]) || 0;
      return h('button', { id: 'tab-' + t[0], type: 'button', role: 'tab', class: 'tab' + (TR.tab === t[0] ? ' on' : ''), 'aria-selected': TR.tab === t[0] ? 'true' : 'false', on: { click: function () { TR.tab = t[0]; TR.sel = null; TR.confirm = false; renderTree(el); } } }, [
        h('span', { text: t[1] }), spent ? h('i', { class: 'tab-spent', text: spent + ' SP in' }) : null
      ]);
    }));

    const list = h('div', { class: 'nodes' }, nodes(TR.tab).map(function (n) {
      const st = nodeState(n);
      const tag = st === 'owned' ? 'OWNED' : st === 'fork-locked' ? 'TAKEN' : st === 'locked' ? 'NEEDS T' + ((nodeById(n.req) || {}).tier || 1) : n.cost + ' SP';
      return h('button', { type: 'button', class: 'node ' + st + (TR.sel === n.id ? ' sel' : ''), 'data-id': n.id, 'data-state': st, 'aria-pressed': TR.sel === n.id ? 'true' : 'false', on: { click: function () { TR.sel = n.id; renderTree(el); } } }, [
        h('span', { class: 'nd-tier', text: 'T' + n.tier }),
        h('span', { class: 'nd-main' }, [
          h('span', { class: 'nd-name' }, [h('b', { text: n.name }), n.fork ? h('i', { class: 'nd-fork', text: '1 of 2' }) : null]),
          h('span', { class: 'nd-text', text: n.text || '' })
        ]),
        h('span', { class: 'nd-cost', text: tag })
      ]);
    }));

    const locked = h('div', { id: 'tree-locked', class: 'lockedtree' }, [h('div', { class: 'lk-head' }, [svgLock(), h('span', { text: 'Tiers 3-5: coming later' })])].concat(
      lockedRows(TR.tab).map(function (r) {
        return h('div', { class: 'lk-row', 'data-tier': r.tier }, [h('b', { text: 'T' + r.tier + ' ' + r.name }), h('span', { class: 'lk-t', text: ' ' + r.text })]);
      })));

    // detail + buy
    const sel = nodeById(TR.sel);
    const st = sel ? nodeState(sel) : 'locked';
    let why = '', canBuy = false, buyText = sel ? 'Buy ' + sel.cost + ' SP' : 'Buy', jump = null, forkNote = '';
    const rival = forkRival(sel);
    const rivalTab = rival ? (TAB_NAME[rival.tab] || rival.tab) : '';
    if (sel) {
      if (rival && st !== 'owned') {
        forkNote = st === 'fork-locked'
          ? 'Locked by ' + rival.name + ' (' + rivalTab + ' tab). Respec the ' + rivalTab + ' tab to switch.'
          : 'Choose one: ' + sel.name + ' (' + (TAB_NAME[sel.tab] || sel.tab) + ') or ' + rival.name + ' (' + rivalTab + '). Buying one locks the other.';
      }
      if (st === 'owned') { why = 'You own this.'; buyText = 'Owned'; }
      else if (st === 'fork-locked') { why = ''; buyText = 'Go to ' + rivalTab + ' tab'; jump = rival; }
      else if (st === 'locked') { why = 'Needs ' + ((nodeById(sel.req) || {}).name || sel.req) + ' first.'; buyText = 'Needs ' + ((nodeById(sel.req) || {}).name || 'T1'); }
      else {
        let cb = { ok: (s.sp || 0) >= sel.cost, why: 'Needs ' + sel.cost + ' Skill Points' };
        try { if (SD.progress && SD.progress.canBuy) cb = SD.progress.canBuy(s, sel.id); } catch (e) { /* use local */ }
        canBuy = !!cb.ok; why = cb.ok ? 'Costs ' + sel.cost + ' Skill Point' + (sel.cost > 1 ? 's' : '') + '.' : ('Needs ' + sel.cost + ' Skill Point' + (sel.cost > 1 ? 's' : '') + ', you have ' + (s.sp || 0) + '.');
        if (!canBuy) buyText = 'Need ' + Math.max(1, sel.cost - (s.sp || 0)) + ' more SP';
      }
    }
    const buy = h('button', { id: 'btn-buy', type: 'button', class: 'btn primary buy' + (jump ? ' jump' : ''), disabled: (canBuy || jump) ? null : true, text: buyText, on: { click: function () {
      if (!sel) return;
      if (jump) { TR.tab = jump.tab; TR.sel = jump.id; TR.confirm = false; renderTree(el); return; }
      try { SD.progress.buy(s, sel.id); } catch (e) { toast('Could not buy'); return; }
      save(); toast(sel.name + ' unlocked'); renderTree(el);
    } } });
    // row 33: what changes in the next match (tree is only open between matches, so the next match is match 2)
    const nextBox = sel ? h('div', { class: 'ndt-next' }, [
      h('span', { class: 'nx-k', text: st === 'owned' ? 'IN MATCH 2' : 'FROM MATCH 2' }),
      h('span', { class: 'nx-t', text: ' you will see ' }),
      sel.chip ? h('b', { class: 'nx-chip', text: sel.chip }) : h('b', { class: 'nx-chip', text: sel.name })
    ]) : null;
    const detail = h('div', { id: 'node-detail', class: 'ndetail ' + st }, [
      h('div', { class: 'ndt-text' }, [
        h('div', { class: 'ndt-name', text: sel ? sel.name : '' }),
        h('div', { class: 'ndt-desc', text: sel ? (sel.text || '') : '' }),
        nextBox,
        forkNote ? h('div', { class: 'ndt-fork', text: forkNote }) : null,
        h('div', { class: 'ndt-why', text: why })
      ]),
      buy
    ]);

    // bottom bar
    const spentTab = (s.spent && s.spent[TR.tab]) || 0;
    const rc = respecCost();
    const canRespec = spentTab > 0 && (s.coins || 0) >= rc;
    const respec = h('button', { id: 'btn-respec', type: 'button', class: 'btn ghost', disabled: canRespec ? null : true, on: { click: function () { TR.confirm = true; renderTree(el); } } }, [
      h('span', { text: 'Respec tab' }), h('i', { text: rc + ' Coins' })
    ]);
    const next = h('button', { id: 'btn-tree-next', type: 'button', class: 'btn primary', text: 'To the pull', on: { click: function () { TR.confirm = false; go('pull'); } } });
    const foot = h('div', { class: 'foot' }, [respec, next]);

    [head, tabs, list, locked, detail, foot].forEach(function (n) { root.appendChild(n); });

    if (TR.confirm) {
      const tabName = (TABS.filter(function (t) { return t[0] === TR.tab; })[0] || [0, TR.tab])[1];
      root.appendChild(h('div', { id: 'respec-confirm', class: 'confirm', role: 'dialog', 'aria-modal': 'true' }, [
        h('div', { class: 'cf-box' }, [
          h('div', { class: 'cf-ttl', text: 'Respec ' + tabName + '?' }),
          h('div', { class: 'cf-txt', text: 'You get back ' + spentTab + ' Skill Point' + (spentTab === 1 ? '' : 's') + ' and pay ' + rc + ' Coins. Every ' + tabName + ' node is cleared and the fork opens again.' }),
          h('div', { class: 'cf-btns' }, [
            h('button', { id: 'btn-respec-no', type: 'button', class: 'btn ghost', text: 'Keep it', on: { click: function () { TR.confirm = false; renderTree(el); } } }),
            h('button', { id: 'btn-respec-yes', type: 'button', class: 'btn primary', text: 'Respec', on: { click: function () {
              let r = null;
              try { r = SD.progress.respec(s, TR.tab, T()); } catch (e) { r = { ok: false }; }
              TR.confirm = false; TR.sel = null;
              if (r && r.ok === false) toast(r.why || 'Respec failed'); else { save(); toast(tabName + ' respecced'); }
              renderTree(el);
            } } })
          ])
        ])
      ]));
    }
    el.appendChild(root);
  }

  SD.ui = SD.ui || {};
  SD.ui.result = { render: function (el) { R.sel = null; renderResult(el); } };
  SD.ui.tree = { render: function (el) { TR.confirm = false; TR.sel = null; renderTree(el); } };
})();
