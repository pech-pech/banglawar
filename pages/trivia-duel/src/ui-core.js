var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {})); TD.ui = TD.ui || {};
// ui-core.js: logic only (no look). Ported from ui.js with the same engine call order:
// planDuel up front; per question [Q7: drawQ7, rivalWager] shuffleAnswers, rivalAnswer.
// Rival's wrong pick uses a SEPARATE rng(seed ^ 0x5bd1e995): one draw per question (admin default), engine stream untouched.
(function () {
  'use strict';
  var ui = TD.ui;
  var save = null;           // stable object (mutated in place on reset) so other files may hold ui.save
  var D = null;              // current duel state (also the `st` passed to render hooks)
  var inputLockUntil = 0;
  var rafId = 0, autoT = 0, vsT = 0;

  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('data-') === 0 || k === 'type' || k === 'id' || k === 'maxlength' || k === 'placeholder' || k === 'inputmode' || k === 'title' || k === 'style') e.setAttribute(k, attrs[k]);
      else e[k] = attrs[k];
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function cfg() { return TD.tweak ? TD.tweak.cfg : TD.DEFAULTS; }
  function rivalOf(step) { return TD.RIVALS[Math.max(1, Math.min(5, step)) - 1]; }
  function topicLabel(id) { var t = TD.TOPICS.filter(function (x) { return x.id === id; })[0]; return t ? t.label : id; }
  function reduced() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function hook(name) {
    if (ui[name]) return ui[name].apply(ui, Array.prototype.slice.call(arguments, 1));
  }

  // ---------- save ----------
  function defSave() {
    return { v: 1, name: '', seal: 0, mode: 'movie', readUpTo: 7, topicXp: { spells: 0, creatures: 0, places: 0 },
      memory: TD.engine.newMemory(), rivalStep: 1, picked: 'spells' };
  }
  function loadSave() {
    var s = defSave();
    try {
      var raw = localStorage.getItem('td.save');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object' && !(o.v > 1)) {
          for (var k in s) if (o[k] !== undefined) s[k] = o[k];
          s.topicXp = Object.assign({ spells: 0, creatures: 0, places: 0 }, o.topicXp || {});
          if (!s.memory || !s.memory.seen) s.memory = TD.engine.newMemory();
          s.v = 1;
        }
      }
    } catch (e) {}
    return s;
  }
  function replaceSave(s) {
    Object.keys(save).forEach(function (k) { delete save[k]; });
    Object.assign(save, s);
  }
  function persist() {
    try { localStorage.setItem('td.save', JSON.stringify(save)); } catch (e) {}
  }

  // ---------- screens ----------
  function show(id) {
    var list = document.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('active');
    var el = $(id);
    if (el) el.classList.add('active');
    if (id === 'scr-result' || id === 'scr-wager') inputLockUntil = Date.now() + 400; // end screens ignore taps 400 ms
    window.scrollTo && window.scrollTo(0, 0);
  }
  function refreshBadge() {
    var b = $('dev-badge');
    if (b) { b.style.display = ''; b.classList.toggle('on', !!(TD.tweak && TD.tweak.isDev())); }
  }
  function poolFor() {
    return TD.engine.pool(TD.QUESTIONS || [], { mode: save.mode, readUpTo: save.readUpTo });
  }
  function locked() { return Date.now() < inputLockUntil; }

  function openSettings() {
    show('scr-settings');
    var root = $('tweak-root');
    if (!root) return;
    root.innerHTML = '';
    try { TD.tweak.open(root, function () { refreshBadge(); }); } catch (e) { root.textContent = 'Tweak panel unavailable'; }
  }
  function goHome() {
    stopTimers();
    var rs = Math.max(1, Math.min(5, Math.round(+cfg().rivalStep || 1))); // pick up rivalStep tweak edits
    save.rivalStep = rs; persist();
    hook('renderHome');
    refreshBadge();
    show('scr-home');
  }

  // ---------- duel ----------
  function stopTimers() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (autoT) { clearTimeout(autoT); autoT = 0; }
    if (vsT) { clearTimeout(vsT); vsT = 0; }
  }

  function startDuel() {
    stopTimers();
    var c = cfg(), E = TD.engine;
    var seedStr = ($('in-seed') && $('in-seed').value || '').trim();
    var seed = seedStr !== '' && isFinite(+seedStr) ? (Math.floor(+seedStr) >>> 0) : (Date.now() % 1e9);
    var step = Math.max(1, Math.min(5, Math.round(+c.rivalStep || save.rivalStep || 1)));
    var pool = poolFor();
    var rnd = E.rng(seed);
    var plan = E.planDuel(pool, save.picked, save.memory, rnd, c);
    D = {
      seed: seed, mode: save.mode, readUpTo: save.readUpTo, pickedTopic: save.picked, wagerTopic: save.picked,
      name: save.name || '', seal: save.seal || 0, pMult: 1, rMult: 1, rivalStep: step, log: [], pScore: 0, rScore: 0, result: null,
      pool: pool, rnd: rnd, rnd2: E.rng((seed ^ 0x5bd1e995) >>> 0), plan: plan, n: 0, q: null, sh: null, rv: null, rivalPos: -1
    };
    D.exclude = new Set(plan.map(function (q) { return q.id; }));
    show('scr-vs');
    hook('renderVs', D);
    var myD = D;
    vsT = setTimeout(function () { vsT = 0; if (D === myD) nextQuestion(); }, reduced() ? 600 : 1800);
  }

  function nextQuestion() {
    var E = TD.engine, c = cfg();
    D.n++;
    var isQ7 = D.n === 7;
    var q;
    if (isQ7) {
      q = E.drawQ7(D.pool, D.wagerTopic, save.memory, D.rnd, c, D.exclude);
      D.rMult = E.rivalWager(D.pScore, D.rScore, c);
    } else q = D.plan[D.n - 1];
    D.q = q;
    D.sh = E.shuffleAnswers(q, D.rnd);
    D.rv = E.rivalAnswer(q, c, D.rnd);
    // rival's wrong pick: separate stream, one draw per question
    var r2 = D.rnd2();
    if (D.rv.correct) D.rivalPos = D.sh.correctPos;
    else {
      var k = Math.min(2, Math.floor(r2 * 3)), p = 0, seen = 0;
      for (p = 0; p < 4; p++) { if (p === D.sh.correctPos) continue; if (seen === k) break; seen++; }
      D.rivalPos = p;
    }
    D.locked = false;
    D.rvShown = false;
    hook('renderQuestion', D, q, D.sh.order, D.n);
    D.t0 = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
    show('scr-duel');
  }

  function tick() {
    if (!D || D.locked) return;
    var c = cfg();
    var el = (performance.now() - D.t0) / 1000;
    var left = Math.max(0, c.timerSec - el);
    hook('renderTimer', Math.max(0, 1 - el / c.timerSec), left);
    if (!D.rvShown && el >= D.rv.tSec) {
      D.rvShown = true;
      hook('renderRivalAnswered', D);
    }
    if (el >= c.timerSec) { resolve(-1, c.timerSec); return; }
    rafId = requestAnimationFrame(tick);
  }

  function onAnswer(pos) {
    if (!D || D.locked || D.q == null) return;
    var el = (performance.now() - D.t0) / 1000;
    resolve(pos, Math.min(el, cfg().timerSec));
  }

  function resolve(pos, tSec) {
    var E = TD.engine, c = cfg(), q = D.q;
    D.locked = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    var isQ7 = D.n === 7;
    var pRight = pos >= 0 && pos === D.sh.correctPos;
    var pT = pos < 0 ? c.timerSec : tSec;
    var pm = isQ7 ? D.pMult : 1, rm = isQ7 ? D.rMult : 1;
    var pPts = E.scoreAnswer(pRight, pT, q, c, pm, isQ7);
    var rPts = E.scoreAnswer(D.rv.correct, D.rv.tSec, q, c, rm, isQ7);
    D.pScore = E.applyScore(D.pScore, pPts);
    D.rScore = E.applyScore(D.rScore, rPts);
    E.markAnswered(save.memory, q, pRight);
    persist();
    D.log.push({ n: D.n, id: q.id, tier: q.tier, topic: q.topic, pRight: pRight, pT: +pT.toFixed(2),
      pPts: pPts, rRight: D.rv.correct, rT: +D.rv.tSec.toFixed(2), rPts: rPts });
    hook('renderReveal', D, { pos: pos, correctPos: D.sh.correctPos, rivalPos: D.rivalPos, pPts: pPts, rPts: rPts,
      pRight: pRight, rRight: D.rv.correct, fact: q.fact, pScore: D.pScore, rScore: D.rScore, pT: pT, rT: D.rv.tSec });
    if (pRight) {
      var myN = D.n, myD = D;
      autoT = setTimeout(function () { autoT = 0; if (D === myD && D.n === myN && D.locked) goNext(); }, 2500);
    }
  }

  function goNext() {
    if (!D || !D.locked) return;
    if (autoT) { clearTimeout(autoT); autoT = 0; }
    D.locked = false; // prevent double advance
    D.q = null;
    if (D.n < 6) nextQuestion();
    else if (D.n === 6) {
      D.pMult = 1;
      hook('renderWager', D);
      show('scr-wager');
    } else finish();
  }

  function startQ7() {
    if (!D || locked() || D.n !== 6) return;
    nextQuestion();
  }

  function finish() {
    var E = TD.engine, c = cfg();
    D.result = E.result(D.pScore, D.rScore);
    var xp = E.xpFor(D.result, c);
    var before = save.topicXp[D.pickedTopic] || 0;
    save.topicXp[D.pickedTopic] = before + xp;
    var step = D.rivalStep;
    if (D.result === 'win') step = Math.min(5, step + 1);
    save.rivalStep = step;
    try { TD.tweak.set('rivalStep', step); } catch (e) {}
    persist();
    var state = { seed: D.seed, mode: D.mode, readUpTo: D.readUpTo, pickedTopic: D.pickedTopic, wagerTopic: D.wagerTopic,
      pMult: D.pMult, rMult: D.rMult, rivalStep: D.rivalStep, log: D.log, pScore: D.pScore, rScore: D.rScore, result: D.result };
    try { TD.tweak.lastState = state; } catch (e) {}
    refreshBadge();
    show('scr-result');
    hook('renderResult', D, xp, E.levelOf(save.topicXp[D.pickedTopic], c));
  }

  // ---------- binding ----------
  function on(id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); }
  function bindAll() {
    var duel = $('scr-duel');
    if (duel) duel.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      var a = t.closest('.btn-ans[data-pos]');
      if (a && duel.contains(a)) { onAnswer(+a.getAttribute('data-pos')); return; }
      var n = t.closest('#btn-next');
      if (n && duel.contains(n)) goNext();
    });
    on('btn-play', startDuel);
    on('btn-settings', openSettings);
    on('btn-back', goHome);
    on('btn-reset-progress', function () {
      var ok = true;
      try { ok = window.confirm('Reset all progress?'); } catch (e) {}
      if (!ok) return;
      var keep = { mode: save.mode, readUpTo: save.readUpTo };
      var s = defSave(); s.mode = keep.mode; s.readUpTo = keep.readUpTo;
      replaceSave(s);
      try { TD.tweak.set('rivalStep', 1); } catch (e) {}
      persist();
      hook('renderHome');
    });
    on('btn-x1', function () { if (!D || locked()) return; D.pMult = 1; hook('renderWager', D); });
    on('btn-x2', function () { if (!D || locked()) return; D.pMult = cfg().wagerMult; hook('renderWager', D); });
    var wt = document.querySelectorAll('.btn-wtopic[data-topic]');
    for (var i = 0; i < wt.length; i++) (function (b) {
      b.addEventListener('click', function () { if (!D || locked()) return; D.wagerTopic = b.getAttribute('data-topic'); hook('renderWager', D); });
    })(wt[i]);
    on('btn-wager-go', startQ7);
    on('btn-rematch', function () { if (!locked()) startDuel(); });
    on('btn-home', function () { if (!locked()) goHome(); });
    on('btn-report', function () {
      if (locked()) return;
      var rp = $('btn-report');
      try {
        TD.tweak.copy(TD.tweak.report(TD.tweak.lastState)).then(function () { rp.textContent = 'Copied'; }, function () { rp.textContent = 'Copy failed'; });
      } catch (e) { rp.textContent = 'Copy failed'; }
    });
  }

  // ---------- start ----------
  function start() {
    var app = $('app');
    if (!app) return;
    app.innerHTML = '';
    ['home', 'vs', 'duel', 'wager', 'result', 'settings'].forEach(function (n) {
      app.appendChild(h('section', { class: 'screen', id: 'scr-' + n }));
    });
    if (!$('dev-badge')) {
      var badge = h('div', { id: 'dev-badge', text: 'DEV' });
      badge.style.display = 'none';
      document.body.appendChild(badge);
    }
    if (!save) save = loadSave(); else replaceSave(loadSave());
    ui.save = save;
    try {
      if (TD.tweak && TD.tweak.set && save.rivalStep !== TD.tweak.cfg.rivalStep) TD.tweak.set('rivalStep', save.rivalStep);
    } catch (e) {}
    ['buildHome', 'buildSettings', 'buildVs', 'buildDuel', 'buildWager', 'buildResult'].forEach(function (f) { if (ui[f]) ui[f](); });
    bindAll();
    hook('renderHome');
    show('scr-home');
    refreshBadge();
  }

  save = loadSaveSafe();
  function loadSaveSafe() { try { return typeof localStorage !== 'undefined' && TD.engine ? loadSave() : defSaveLazy(); } catch (e) { return defSaveLazy(); } }
  function defSaveLazy() { return TD.engine ? defSave() : {}; }

  ui.$ = $; ui.h = h; ui.cfg = cfg; ui.rivalOf = rivalOf; ui.topicLabel = topicLabel;
  ui.save = save; ui.persist = persist; ui.show = show; ui.refreshBadge = refreshBadge; ui.poolFor = poolFor;
  ui.goHome = goHome; ui.openSettings = openSettings; ui.startDuel = startDuel; ui.nextQuestion = nextQuestion;
  ui.onAnswer = onAnswer; ui.goNext = goNext; ui.finish = finish;
  ui.state = function () { return D; };   // function: returns current duel state (st) or null
  ui.start = start;

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    // ui-home/duel/end load after this file: defer start to DOMContentLoaded (or a tick later if already loaded).
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else setTimeout(start, 0);
  }
  if (typeof module !== 'undefined') module.exports = ui;
})();
