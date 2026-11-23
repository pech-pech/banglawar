(function () { 'use strict';
  // OWNER: shootui maker (sq-season-1). U7 Cup Final shootout screen. SD.ui.shootout = { render(el) }.
  // Logic lives in SD.shootout (js/shootout.js, pure). This file only draws and drives it.
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {};

  const ROLE_STAT = { SHO: 'SHO', PAS: 'PAS' };
  const ROLES_SHORT = { Striker: 'Striker', Winger: 'Winger', Playmaker: 'Playmaker', Anchor: 'Anchor', Keeper: 'Keeper' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function app() { return SD.app || {}; }
  function T() { return app().T || (SD.data && SD.data.TWEAK_DEFAULTS) || {}; }
  function quick() { return !!(app().reduced || app().fast); }
  function pct(p) { return Math.round((p || 0) * (p > 1 ? 1 : 100)) + '%'; }
  function clubLabel(m) { const c = (m && m.club) || {}; return String(c.label || c.name || 'CLUB').toUpperCase(); }

  function render(el) {
    const A = app();
    el.innerHTML = '';
    const root = document.createElement('div');
    root.id = 'shootout';
    el.appendChild(root);

    const SH = SD.shootout;
    if (!SH || !SH.start || !A.m) {
      root.innerHTML = '<div class="sh-fallback"><p>The shootout rules are not loaded in this build, so the final cannot be settled.</p>' +
        '<button type="button" id="btn-sh-done">Back to hub</button></div>';
      root.querySelector('#btn-sh-done').addEventListener('click', () => { if (A.go) A.go('hub'); });
      return;
    }
    const m = A.m, t = T();
    let sh = A.sh;
    if (!sh) { sh = SH.start(m, t); A.sh = sh; }

    // ---- view state (UI only) ----
    let shown = (sh.kicks || []).length;      // kicks already revealed on the board
    let sel = null, busy = false, timer = 0;
    let lines = [];                           // last two result lines
    let dice = { a: null, b: null, rolling: false, who: null };
    let alive = true;

    const meName = 'PRESTON', opName = clubLabel(m);
    const cards = (m.setup.outfield || []).concat(m.setup.bench || []);
    const byPid = {}; cards.forEach((p) => { byPid[p.id] = p; });
    const keeper = m.setup.keeper || {};

    const who = () => (SH.whoKicks ? SH.whoKicks(sh) : null);
    const isDone = () => !!sh.done && shown >= (sh.kicks || []).length;
    const opts = () => { try { return (SH.options && SH.options(sh)) || []; } catch (e) { return []; } };

    // ---- board data from revealed kicks only (no spoilers while dice roll) ----
    function rowsOf(side) { return (sh.kicks || []).slice(0, shown).filter((k) => k.side === side).map((k) => !!k.scored); }
    function scoreOf(side) { return rowsOf(side).filter(Boolean).length; }

    function circles(side) {
      const r = rowsOf(side), mine = side === 'me';
      const w = who(), live = !isDone() && !busy && w === side;
      let n = Math.max(3, r.length + (live || (busy && false) ? 1 : 0));
      const items = [];
      for (let i = 0; i < n; i++) {
        if (i < r.length) items.push(r[i] ? '<i class="ci g" aria-label="goal">&#10003;</i>' : '<i class="ci x" aria-label="saved">&#10007;</i>');
        else if (i === r.length && live) items.push('<i class="ci now" aria-label="this kick">' + (i + 1) + '</i>');
        else items.push('<i class="ci" aria-label="to come">' + (i + 1) + '</i>');
      }
      if (n === 3 && r.length <= 3) items.push('<i class="ci sd" aria-label="sudden death">+</i>');
      return '<span class="cs">' + items.slice(-4).join('') + '</span>';
    }

    function labelText() {
      let l = '';
      try { l = SH.label ? SH.label(sh) : ''; } catch (e) { l = ''; }
      return l;
    }

    function cardHTML(o) {
      const P = byPid[o.pid] || {};
      const on = sel === o.pid;
      const best = o.best;
      return '<button type="button" class="sh-card' + (on ? ' on' : '') + (o.ruleR ? ' read' : '') + '" data-pid="' + esc(o.pid) + '" aria-pressed="' + on + '"' + (busy || isDone() || who() !== 'me' ? ' disabled' : '') +
        ' aria-label="' + esc((o.name || P.name) + ', ' + o.role + ', ' + o.kind + ' ' + o.stat + ', goal chance ' + pct(o.p) + (o.ruleR ? ', keeper reads this role' : '')) + '">' +
        '<span class="nm"><i class="gem ' + esc(String(P.rarity || 'common').toLowerCase()) + '"></i>' + esc(o.name || P.name) + '</span>' +
        '<span class="rl">' + esc(ROLES_SHORT[o.role] || o.role || '') + (o.ruleR ? ' <u>keeper reads</u>' : '') + '</span>' +
        '<span class="ln"><span class="st"><em>' + esc(ROLE_STAT[o.kind] || o.kind) + '</em><b>' + esc(o.stat) + '</b></span>' +
        '<span class="odds' + (on ? ' top' : '') + '">' + pct(o.p) + '</span></span></button>';
    }
    function usedHTML(pid, k) {
      const P = byPid[pid] || {};
      return '<div class="sh-card used" data-pid="' + esc(pid) + '" data-used="1"><span class="tag ' + (k && k.scored ? 'goal' : 'saved') + '">' + (k && k.scored ? 'GOAL' : 'SAVED') + '</span>' +
        '<span class="nm"><i class="gem ' + esc(String(P.rarity || 'common').toLowerCase()) + '"></i>' + esc(P.name || pid) + '</span>' +
        '<span class="rl">' + esc(P.role || '') + '</span><span class="ln"><span class="st dim">used</span></span></div>';
    }

    function defaultPick(list) {
      let b = null;
      list.forEach((o) => { if (!b || o.p > b.p) b = o; });   // admin default: best chance, first in list on a tie
      return b ? b.pid : null;
    }

    // ---- duel panel numbers ----
    function sides() {
      const w = who();
      if (w === 'opp') {
        const kb = (t.oppKickBonus == null ? 2 : t.oppKickBonus);
        const base = ((m.club && m.club.def) || 0) + kb;
        return { l1: opName, l2: 'ATTACK', ls: base, r1: 'YOUR KEEPER', rs: keeper.def, p: SH.oddsOpp ? SH.oddsOpp(sh) : null };
      }
      const o = opts().find((x) => x.pid === sel);
      return { l1: o ? o.name : 'YOU', l2: o ? (o.kind + ' ' + o.stat) : '', ls: null, r1: 'KEEPER', rs: m.club && m.club.keeper && m.club.keeper.def, p: o ? o.p : null };
    }

    function face(v, cls) { return '<i class="die ' + cls + (dice.rolling ? ' roll' : '') + '" aria-label="die">' + (v == null || dice.rolling ? '?' : v) + '</i>'; }

    function ruleText() {
      const rr = opts().find((o) => o.ruleR);
      let s = 'Each side adds one d6. A tie goes to the kicker. A natural 6 v 1 always wins.';
      return s;
    }

    function draw() {
      if (!alive) return;
      const w = who(), done = isDone(), list = opts();
      if (w === 'me' && !busy && !done && (!sel || !list.some((o) => o.pid === sel))) sel = defaultPick(list);
      const S = sides();
      const rr = list.find((o) => o.ruleR);
      const usedKicks = {}; (sh.kicks || []).slice(0, shown).forEach((k) => { if (k.side === 'me' && k.pid) usedKicks[k.pid] = k; });
      // grid: keep the card order stable (lineup order); used cards stay visible
      const grid = cards.map((P) => {
        const o = list.find((x) => x.pid === P.id);
        // a card is "used" if options() no longer lists it (all six used resets the cycle, then all are fresh)
        return o ? cardHTML(o) : usedHTML(P.id, usedKicks[P.id]);
      }).join('');
      const first = sh.first === 'opp' ? opName : meName;
      const winner = sh.winner;
      const resLine = done
        ? '<b class="fin ' + (winner === 'me' ? 'w' : 'l') + '">' + (winner === 'me' ? 'PRESTON WIN ' : opName + ' WIN ') + scoreOf('me') + '-' + scoreOf('opp') + ' ON KICKS</b>'
        : (lines.length ? lines.map((l, i) => '<span class="rs' + (i === lines.length - 1 ? ' last' : '') + '">' + esc(l) + '</span>').join('') : '<span class="rule">' + esc(ruleText()) + '</span>');
      const lab = labelText();
      const turnTxt = done ? 'FINISHED' : (w === 'me' ? 'YOURS' : 'THEIRS');
      const rChip = rr && w === 'me' && !done ? '<span class="rchip">Keeper reads ' + esc(rr.role) + '</span>' : '';
      let btn, btnCls = 'go';
      if (done) btn = '<button type="button" id="btn-sh-done" class="go">' + (winner === 'me' ? 'Continue' : 'Continue') + '</button>';
      else if (w === 'me') { const o = list.find((x) => x.pid === sel); btn = '<button type="button" id="sh-kick" class="go"' + (busy || !o ? ' disabled' : '') + '>' + (busy ? 'Kicking...' : 'Kick with ' + esc(o ? o.name : '...')) + '</button>'; }
      else btn = '<button type="button" id="sh-kick" class="go"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Their kick...' : 'Their kick') + '</button>';
      const left = list.length ? list.length : 0;
      root.innerHTML =
        '<div class="sh-band"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 20h8"/></svg>' +
        '<div><b>CUP FINAL: SHOOTOUT</b><small>Coin toss: ' + esc(first) + ' kick first &middot; No Roar</small></div></div>' +
        '<div class="sh-board" id="sh-score" aria-live="polite">' +
          '<div class="rw me"><span class="tn">' + meName + '</span>' + circles('me') + '<span class="sc">' + scoreOf('me') + '</span></div>' +
          '<div class="rw opp"><span class="tn">' + esc(opName) + '</span>' + circles('opp') + '<span class="sc">' + scoreOf('opp') + '</span></div>' +
          '<div class="cap"><span id="sh-label">' + esc(lab) + '</span><span class="who">' + turnTxt + '</span></div></div>' +
        '<div class="sh-duel' + (w === 'opp' ? ' theirs' : '') + '">' +
          '<div class="sd-l"><small>' + (w === 'opp' ? 'THEIR KICK' : 'YOU') + '</small><b>' + esc(S.l1) + '</b><span>' + esc(S.l2) + (S.ls != null ? ' ' + S.ls : '') + '</span>' + face(dice.a, 'a') + '</div>' +
          '<div class="sd-c"><div class="chip"><b>' + (S.p == null ? '--' : pct(S.p)) + '</b><small>GOAL CHANCE</small></div>' + rChip + '</div>' +
          '<div class="sd-r"><small>' + esc(S.r1) + '</small><b>' + (S.rs == null ? '' : esc(S.rs)) + '</b><span>' + (w === 'opp' ? 'DEF' : 'THEIR STAT') + '</span>' + face(dice.b, 'b') + '</div>' +
          '<div class="res" id="sh-res">' + resLine + '</div></div>' +
        '<div class="sh-pick"><span class="hd">' + (done ? 'ALL KICKS TAKEN' : w === 'opp' ? 'THEY KICK NOW' : 'PICK YOUR KICKER &middot; EACH CARD ONCE &middot; ' + left + ' LEFT') + '</span><div class="grid">' + grid + '</div></div>' +
        '<div class="sh-bar">' + btn + '</div>';
      wire();
    }

    function wire() {
      root.querySelectorAll('.sh-card[data-pid]:not(.used)').forEach((b) => b.addEventListener('click', () => {
        if (busy || who() !== 'me') return;
        sel = b.getAttribute('data-pid'); draw();
      }));
      const k = root.querySelector('#sh-kick');
      if (k) k.addEventListener('click', () => { if (!busy) kick(); });
      const d = root.querySelector('#btn-sh-done');
      if (d) d.addEventListener('click', () => {
        alive = false; clearTimeout(timer);
        const s = sh; A.sh = null;
        if (A.endShootout) A.endShootout(s);
      });
    }

    function resultLine(ev) {
      const P = ev.pid ? byPid[ev.pid] : null;
      const nm = ev.side === 'me' ? ((P && P.name) || 'You') : opName;
      const a = (ev.stat || 0) + (ev.dA || 0), b = (ev.vs || 0) + (ev.dB || 0);
      const keeperTxt = ev.side === 'me' ? 'keeper' : 'your keeper';
      let s = nm + ' ' + (ev.stat || 0) + '+' + (ev.dA || 0) + ' = ' + a + ' v ' + keeperTxt + ' ' + (ev.vs || 0) + '+' + (ev.dB || 0) + ' = ' + b + ': ' + (ev.scored ? 'GOAL' : 'SAVED');
      if (ev.chips && ev.chips.length) s += ' (' + ev.chips.join(', ') + ')';
      return s;
    }

    // play one kick: logic runs now, the board reveals after the dice settle
    function play(fn) {
      let ev;
      try { ev = fn(); } catch (e) { ev = null; }
      if (!ev) { busy = false; draw(); return; }
      busy = true;
      const delay = quick() ? 0 : 600;
      const reveal = () => {
        if (!alive) return;
        dice = { a: ev.dA, b: ev.dB, rolling: false, who: ev.side };
        shown = (sh.kicks || []).length;
        lines.push(resultLine(ev)); lines = lines.slice(-2);
        try { if (A.save) A.save(); } catch (e) { /* ignore */ }
        busy = false;
        draw();
        const pause = quick() ? 0 : 950;
        if (!isDone() && who() === 'opp') {
          busy = true; draw();
          if (pause) timer = setTimeout(() => { busy = false; step(); }, pause); else { busy = false; step(); }
        } else if (isDone()) draw();
      };
      if (delay) { dice = { a: null, b: null, rolling: true, who: ev.side }; draw(); timer = setTimeout(reveal, delay); }
      else reveal();
    }

    function kick() {
      const w = who();
      if (w === 'me') { if (!sel || !SH.kickMe) return; const pid = sel; play(() => SH.kickMe(sh, pid)); }
      else if (w === 'opp' && SH.kickOpp) play(() => SH.kickOpp(sh));
    }
    function step() { if (!alive) return; if (!isDone() && who() === 'opp') kick(); else draw(); }

    draw();
    // club kicks first (coin) or resume on their turn: short pause, then auto
    if (!isDone() && who() === 'opp') {
      busy = true; draw();
      const pause = quick() ? 0 : 900;
      if (pause) timer = setTimeout(() => { busy = false; step(); }, pause); else { busy = false; step(); }
    }
  }

  SD.ui.shootout = { render };
})();
