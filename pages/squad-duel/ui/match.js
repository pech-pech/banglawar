(function () { 'use strict';
  const SD = (globalThis.SD = globalThis.SD || {});
  SD.ui = SD.ui || {}; SD.ui.mp = SD.ui.mp || {};
  const H = SD.ui.mh;
  const { oddsGrid, ready, ACTS, ZN, STATS, CHK, UNDO, ABIL_ID, esc, app, isFast, isReduced, pctText, pctNum, sum, pdata, nameOf, clubShort, die, pips, defCards, legalFor, tellOf } = H;

  // OWNER: integrator (core). Parts live in match-*.js and register on SD.ui.mp.
  const MP = () => SD.ui.mp;
  let cur = null;

  function render(el) {
    // Save/resume (S9): S.live = {setup, inputs[]}; Continue replays the recorded inputs (engine is deterministic).
    const S = app().S, fresh = app().matchSetup();
    let live = S && S.live;
    if (!(live && live.setup && live.setup.seed === fresh.seed && Array.isArray(live.inputs))) {
      live = null;
      if (S) { S.live = { setup: JSON.parse(JSON.stringify(fresh)), inputs: [] }; }
    }
    const m = SD.engine.newMatch(live ? live.setup : fresh);
    app().m = m; SD.app = SD.app || {}; SD.app.m = m;
    const U = { m, el, sel: null, act: null, stance: null, ev: null, busy: false, over: null, timer: null, newIds: [], prevHand: null };
    cur = U;
    el.innerHTML =
      '<div id="match">' +
      '<section id="info" aria-label="Match info"></section>' +
      '<main id="scene"></main>' +
      '<section id="tell" aria-label="Opponent tell"></section>' +
      '<section id="band" aria-live="polite"></section>' +
      '<div class="hd" id="h1"><span id="h1t"></span><span class="cnt"><span id="deckcount"></span> · <span id="disccount"></span></span></div>' +
      '<section id="hand"></section>' +
      '<div class="hd" id="h2"></div>' +
      '<section id="acts"></section>' +
      '<footer id="foot"><div id="abil"></div><button id="btn-back" aria-label="Undo last pick" hidden>' + UNDO + '</button><div id="sum"></div>' +
      '<button id="btn-confirm" aria-disabled="true">Confirm</button><button id="btn-next" hidden>Next turn</button></footer>' +
      '<div id="halftime" class="ov" hidden><div class="ovp"><small>Half time</small><h2 id="ht-score"></h2><p id="ht-sub"></p><button id="btn-half">Start 2nd half</button></div></div>' +
      '<div id="fulltime" class="ov" hidden><div class="ovp"><small>Full time</small><h2 id="ft-score"></h2><div id="ft-stamp" class="stamp"></div><p id="ft-sub"></p><button id="btn-ft">Continue</button></div></div>' +
      '</div>';
    const q = (id) => el.querySelector('#' + id);
    U.q = q;
    try { if (SD.ui.scene && SD.ui.scene.mount) SD.ui.scene.mount(q('scene')); } catch (e) { console.error('scene.mount', e); }

    // ---- events (delegated; every handler ignores taps while animating or on overlays)
    el.querySelector('#match').addEventListener('click', (e) => {
      if (cur !== U) return;
      const t = e.target.closest('button'); if (!t) return;
      const id = t.id;
      for (const k of ['cards', 'acts', 'result', 'frame']) { const p = MP()[k]; if (p && p.click && p.click(U, t)) return; }
      if (id === 'btn-half') return U.api.startHalf2();
      if (id === 'btn-ft') return U.api.finish();
      if (U.busy || U.over) return;
      if (t.classList.contains('card')) return U.api.pickCard(t.dataset.pid);
      if (t.classList.contains('act') && t.dataset.a) return U.api.pickAct(t.dataset.a);
      if (t.classList.contains('act') && t.dataset.st) return U.api.pickStance(t.dataset.st);
      if (t.classList.contains('ab')) return U.api.useAbility(t.dataset.id);
      if (id === 'btn-back') return U.api.undo();
      if (id === 'btn-confirm') return U.api.confirm();
      if (id === 'btn-next') return U.api.next();
    });
    U.api = makeApi(U);
    if (live && live.inputs.length) { replay(U, live.inputs); U.replay = false; }
    draw(U);
    if (U.ev) scheduleNext(U);
  }

  // Every U.api call is recorded into S.live.inputs (except draw/finish) and autosaved after turn-level calls.
  const REC = { pickCard: 1, pickAct: 1, pickStance: 1, useAbility: 1, undo: 1, confirm: 1, next: 1, startHalf2: 1 };
  const SAVE = { confirm: 1, next: 1, useAbility: 1, startHalf2: 1 };
  function makeApi(U) {
    const raw = { draw, pickCard, pickAct, pickStance, useAbility, undo, confirm, next, startHalf2, finish };
    const api = {};
    Object.keys(raw).forEach((k) => {
      api[k] = (...a) => {
        const S = app().S;
        if (REC[k] && !U.replay && S && S.live && S.live.inputs) S.live.inputs.push({ f: k, a });
        const r = raw[k](U, ...a);
        if (SAVE[k] && !U.replay) { try { app().save && app().save(); } catch (e) { /* optional */ } }
        return r;
      };
    });
    return api;
  }
  function replay(U, inputs) {
    U.replay = true;
    const raw = { pickCard, pickAct, pickStance, useAbility, undo, confirm, next, startHalf2 };
    for (const inp of inputs) { const f = raw[inp.f]; if (f) f(U, ...(inp.a || [])); }
    U.busy = false;
  }
  // Headless rebuild of a live match (used when Continue lands on the shootout step).
  function rebuild(setup, inputs) {
    const m = SD.engine.newMatch(setup);
    replay({ m, replay: true, q: () => null, el: null, newIds: [] }, inputs || []);
    return m;
  }

  function pickCard(U, pid) {
    if (U.ev || !U.m.hand.concat(defCards(U.m)).includes(pid)) return;
    U.sel = pid;
    if (U.m.phase === 'attack' && U.act && !legalFor(U, pid).includes(U.act)) U.act = null;
    draw(U);
  }
  function pickAct(U, a) {
    if (U.ev || U.m.phase !== 'attack' || !U.sel) return;
    if (!legalFor(U, U.sel).includes(a)) return;
    U.act = a; draw(U);
  }
  function pickStance(U, s) {
    if (U.ev || U.m.phase !== 'defend' || !U.sel) return;
    U.stance = s; draw(U);
  }
  function undo(U) {
    if (U.ev) return;
    if (U.m.phase === 'attack' && U.act) U.act = null;
    else if (U.m.phase === 'defend' && U.stance) U.stance = null;
    else U.sel = null;
    draw(U);
  }
  function useAbility(U, fxId) {
    if (U.ev) return;
    const a = SD.engine.actives(U.m).find((x) => x.id === fxId);
    if (!a || !a.can) return;
    SD.engine.use(U.m, fxId);
    if (U.sel && !U.m.hand.includes(U.sel)) { U.sel = null; U.act = null; U.stance = null; }
    draw(U);
  }

  function confirm(U) {
    const m = U.m;
    if (U.ev || U.busy || !ready(U)) return;
    U.busy = true;
    U.prevHand = m.hand.slice();
    const ev = m.phase === 'attack' ? SD.engine.playAttack(m, U.sel, U.act) : SD.engine.playDefend(m, U.sel, U.stance);
    if (!ev) { U.busy = false; U.sel = null; U.act = null; U.stance = null; draw(U); return; }   // invalid play: engine returned null
    U.ev = ev;
    U.newIds = m.hand.filter((p) => !(ev.hand || []).includes(p));
    const done = () => {
      if (cur !== U) return;
      U.busy = false;
      try { if (SD.ui.scene && SD.ui.scene.update) SD.ui.scene.update(m); } catch (e) { console.error('scene.update', e); }
      draw(U);
      scheduleNext(U);
    };
    let p = null;
    if (U.replay) { U.busy = false; return; }
    if (!isFast() && !isReduced() && SD.ui.scene && SD.ui.scene.play) {
      try { p = SD.ui.scene.play(ev); } catch (e) { console.error('scene.play', e); }
    }
    if (p && p.then) {
      let fired = false;
      const once = () => { if (!fired) { fired = true; done(); } };
      p.then(once, once);
      setTimeout(once, 1500);   // safety net so a stuck animation never freezes the match
    } else done();
  }
  function scheduleNext(U) {
    if (U.replay) return;
    const T = U.m.T || {};
    if (T.autoNext === false) return;
    clearTimeout(U.timer);
    const wait = isFast() ? 0 : 1200;
    U.timer = setTimeout(() => { if (cur === U && U.ev && !U.busy) U.api.next(); }, wait);
  }
  function next(U) {
    const m = U.m;
    if (!U.ev || U.busy) return;
    clearTimeout(U.timer);
    U.ev = null; U.sel = null; U.act = null; U.stance = null; U.newIds = []; U.prevHand = null;
    SD.engine.nextPhase(m);
    draw(U);
  }
  function startHalf2(U) {
    if (U.m.phase !== 'halftime') return;
    SD.engine.startHalf2(U.m);
    U.sel = null; U.act = null; U.stance = null;
    draw(U);
  }
  function finish(U) {
    if (U.finished) return;
    U.finished = true;
    app().endMatch(U.m);
  }

  // ---- drawing
  function draw(U) {
    if (U.replay) return;
    const m = U.m, q = U.q;
    U.over = m.phase === 'halftime' ? 'half' : m.phase === 'full' ? 'full' : null;
    try { if (app().setScorebug) app().setScorebug({ home: 'Proud Preston', away: (m.club && m.club.name) || 'Opponent', hs: m.score.me, as: m.score.opp, tag: m.setup && m.setup.cup ? 'CUP FINAL' : '' }); } catch (e) { /* optional */ }
    const P = MP();
    P.frame.drawInfo(U); P.acts.drawTell(U); P.result.drawBand(U); P.cards.drawHand(U);
    if (U.ev) P.result.drawCause(U); else P.acts.drawActs(U);
    P.acts.drawAbil(U); P.result.drawFoot(U); P.frame.drawOverlays(U);
    if (!U.ev) { try { if (SD.ui.scene && SD.ui.scene.update) SD.ui.scene.update(m); } catch (e) { console.error('scene.update', e); } }
    q('deckcount').textContent = 'Deck ' + m.deck.length;
    q('disccount').textContent = 'Discard ' + m.discard.length;
  }

  SD.ui.match = { render, rebuild, cur: () => cur };
})();
