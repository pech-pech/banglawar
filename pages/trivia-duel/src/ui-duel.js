var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {})); TD.ui = TD.ui || {};
// ui-duel.js: scr-vs (versus intro) + scr-duel (question / timer / reveal). Look A "Arena".
// Hooks called by ui-core.js: buildVs, renderVs, buildDuel, renderQuestion, renderTimer, renderRivalAnswered, renderReveal.
(function () {
  'use strict';
  var ui = TD.ui;
  var cnt = { p: { v: 0, raf: 0 }, r: { v: 0, raf: 0 } };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text, id) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (id) e.id = id;
    return e;
  }
  function reduced() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function rivalOf(step) { return TD.RIVALS[Math.max(1, Math.min(5, step || 1)) - 1]; }
  function firstName(n) { return String(n || '').split(' ')[0]; }
  function lastName(n) { var p = String(n || '').split(' '); return p[p.length - 1]; }
  function topicLabel(id) {
    if (ui.topicLabel) return ui.topicLabel(id);
    var t = TD.TOPICS.filter(function (x) { return x.id === id; })[0];
    return t ? t.label : id;
  }
  // Player info: core sets st.name / st.seal; ui.save is the live save object (ui.state is a function returning st).
  function saveOf() { return ui.save || {}; }
  function playerName(st) {
    var s = saveOf(st);
    return (st && st.name) || s.name || 'You'; // admin default: "You" when blank
  }
  function playerSeal(st) { var s = saveOf(st); return (st && st.seal != null) ? st.seal : (s.seal || 0); }
  function topicLevel(st, id) {
    try {
      var xp = (saveOf(st).topicXp || {})[id] || 0;
      return TD.engine.levelOf(xp, TD.tweak ? TD.tweak.cfg : TD.DEFAULTS);
    } catch (e) { return 1; }
  }
  function avP(st, px) {
    if (TD.avatar && TD.avatar.player) return TD.avatar.player(playerName(st), playerSeal(st), px);
    return el('div', 'av av-player', (playerName(st).charAt(0) || 'P').toUpperCase());
  }
  function avR(st, px) {
    if (TD.avatar && TD.avatar.rival) return TD.avatar.rival(st.rivalStep, px);
    return el('div', 'av av-rival', rivalOf(st.rivalStep).name.charAt(0));
  }
  function avTopic(id, px) {
    if (TD.avatar && TD.avatar.topic) return TD.avatar.topic(id, px);
    return el('div', 'av-topic', topicLabel(id).charAt(0));
  }
  function fill(node, child) { node.innerHTML = ''; if (child) node.appendChild(child); }

  // ---------- VS screen ----------
  function buildVs() {
    var s = $('scr-vs');
    if (!s) return;
    s.innerHTML = '';
    var bg = el('div', 'vs-bg');
    var art = TD.ART && TD.ART.vsBg;
    if (art) {
      var im = new Image();
      im.alt = '';
      im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
      im.src = art;
      bg.appendChild(im);
    }
    s.appendChild(bg);
    s.appendChild(el('div', 'vs-half vs-blue'));
    s.appendChild(el('div', 'vs-half vs-orange'));
    s.appendChild(el('div', 'vs-stripe'));
    var l = el('div', 'vs-p vs-l', null, 'vs-p');
    var r = el('div', 'vs-p vs-r', null, 'vs-r');
    s.appendChild(l); s.appendChild(r);
    s.appendChild(el('div', 'vs-badge', 'VS'));
    s.appendChild(el('div', 'vs-topic', null, 'vs-topic'));
  }

  function renderVs(st) {
    if (!$('vs-p')) buildVs();
    var rv = rivalOf(st.rivalStep);
    var pt = st.pickedTopic;
    var l = $('vs-p'), r = $('vs-r'), t = $('vs-topic');
    var big = 140;
    l.innerHTML = ''; r.innerHTML = ''; t.innerHTML = '';
    l.appendChild(avP(st, big));
    l.appendChild(el('div', 'vs-name', firstName(playerName(st)) || playerName(st)));
    l.appendChild(el('div', 'vs-lv', 'Lv ' + topicLevel(st, pt)));
    r.appendChild(avR(st, big));
    r.appendChild(el('div', 'vs-name', rv.name));
    r.appendChild(el('div', 'vs-lv', 'Rival ' + rv.step + '/5'));
    t.appendChild(el('span', 'vs-topic-lbl', 'Topic'));
    var chip = el('b', 'vs-topic-chip');
    chip.appendChild(el('span', null, topicLabel(pt)));
    t.appendChild(chip);
    // 250 ms slide-in (restart animation); CSS reads .vs-in. Reduced motion: no class, instant.
    var s = $('scr-vs');
    s.classList.remove('vs-in');
    if (!reduced()) { void s.offsetWidth; s.classList.add('vs-in'); }
  }

  // ---------- duel screen ----------
  function buildDuel() {
    var s = $('scr-duel');
    if (!s) return;
    s.innerHTML = '';
    var hdr = el('div', 'hdr');
    var sl = el('div', 'side l', null, 'side-p');
    var sr = el('div', 'side r', null, 'side-r');
    var mid = el('div', 'mid');
    mid.appendChild(el('div', 'rnd', '1/7', 'q-num'));
    mid.appendChild(el('div', 'topic', '', 'q-topic'));
    // slots for avatar, name, score (rebuilt per duel in renderQuestion n==1)
    [[sl, 'p'], [sr, 'r']].forEach(function (a) {
      a[0].appendChild(el('div', 'av-slot', null, a[1] + '-av'));
      a[0].appendChild(el('div', 'nm', '', a[1] + '-name'));
      a[0].appendChild(el('div', 'sc', '0', a[1] + '-score'));
    });
    sr.appendChild(el('div', 'chip chip-answered', 'answered', 'r-answered'));
    hdr.appendChild(sl); hdr.appendChild(mid); hdr.appendChild(sr);
    s.appendChild(hdr);

    var tm = el('div', 'tm');
    var bar = el('div', 'bar', null, 'timer-bar');
    bar.appendChild(el('i', null, null, 'timer-fill'));
    tm.appendChild(bar);
    var sec = el('div', 'sec', null, 'timer-num');
    tm.appendChild(sec);
    s.appendChild(tm);

    var qc = el('div', 'qc card', null, 'q-text');
    s.appendChild(qc);

    var ans = el('div', 'ans', null, 'ans-wrap');
    for (var i = 0; i < 4; i++) {
      var b = el('button', 'btn-ans ans-c' + i);
      b.setAttribute('data-pos', String(i));
      b.setAttribute('type', 'button');
      b.appendChild(el('span', 'ans-text'));
      b.appendChild(el('span', 'mk'));
      ans.appendChild(b);
    }
    s.appendChild(ans);
    s.appendChild(el('div', 'q-fact', '', 'q-fact'));
    var nx = el('button', 'btn-next', 'Next', 'btn-next');
    nx.setAttribute('type', 'button');
    nx.style.display = 'none';
    s.appendChild(nx);
  }

  function setSec(secLeft) {
    var n = $('timer-num');
    if (!n) return;
    n.innerHTML = '';
    n.appendChild(document.createTextNode(String(Math.max(0, Math.ceil(secLeft)))));
    n.appendChild(el('small', null, 's'));
  }

  function setScore(side, v, instant) {
    var node = $(side + '-score');
    if (!node) return;
    var c = cnt[side];
    if (c.raf) { cancelAnimationFrame(c.raf); c.raf = 0; }
    if (instant || reduced() || c.v === v) { c.v = v; node.textContent = v; return; }
    var from = c.v, t0 = performance.now(), dur = 300;
    function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      c.v = Math.round(from + (v - from) * k);
      node.textContent = c.v;
      if (k < 1) c.raf = requestAnimationFrame(step); else c.raf = 0;
    }
    c.raf = requestAnimationFrame(step);
  }

  function renderQuestion(st, q, order, n) {
    if (!$('q-text')) buildDuel();
    var rv = rivalOf(st.rivalStep);
    if (n === 1 || !$('p-av').firstChild) {
      fill($('p-av'), avP(st, 52));
      fill($('r-av'), avR(st, 52));
      $('p-name').textContent = firstName(playerName(st)) || playerName(st);
      // short rival name: first name, except "Professor X" -> "X"
      $('r-name').textContent = firstName(rv.name) === 'Professor' ? lastName(rv.name) : firstName(rv.name);
    }
    setScore('p', st.pScore || 0, true);
    setScore('r', st.rScore || 0, true);
    $('q-num').textContent = n + '/7';
    $('q-topic').textContent = topicLabel(q.topic);
    var qt = $('q-text');
    qt.innerHTML = '';
    qt.appendChild(el('span', 't', 'Question ' + n));
    qt.appendChild(document.createTextNode(q.q));
    var btns = document.querySelectorAll('#scr-duel .btn-ans');
    for (var i = 0; i < btns.length; i++) {
      btns[i].className = 'btn-ans ans-c' + i;
      btns[i].disabled = false;
      btns[i].querySelector('.ans-text').textContent = q.a[order[i]];
      btns[i].querySelector('.mk').innerHTML = '';
    }
    $('q-fact').textContent = '';
    $('btn-next').style.display = 'none';
    var ra = $('r-answered'); if (ra) ra.classList.remove('on');
    var old = document.querySelectorAll('#scr-duel .pop');
    for (var j = 0; j < old.length; j++) old[j].parentNode.removeChild(old[j]);
    var bar = $('timer-bar'); if (bar) bar.classList.remove('done');
    $('scr-duel').classList.remove('revealed', 'has-fact');
    var secs = (TD.tweak ? TD.tweak.cfg : TD.DEFAULTS).timerSec;
    renderTimer(1, secs);
  }

  function renderTimer(frac, secLeft) {
    var f = $('timer-fill');
    if (!f) return;
    frac = Math.max(0, Math.min(1, frac));
    f.style.width = (frac * 100).toFixed(1) + '%';
    // green -> yellow -> red by remaining fraction (look A palette). Admin default: yellow below 50%, red below 25%.
    f.style.background = frac > 0.5 ? '#22c55e' : (frac > 0.25 ? '#facc15' : '#ef4444');
    setSec(secLeft);
  }

  function renderRivalAnswered(st) {
    var ra = $('r-answered');
    if (!ra) return;
    ra.textContent = 'answered';
    ra.classList.add('on');
  }

  function renderReveal(st, info) {
    var btns = document.querySelectorAll('#scr-duel .btn-ans');
    var pName = (playerName(st).charAt(0) || 'P').toUpperCase();
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.disabled = true;
      b.classList.remove('ans-right', 'ans-wrong', 'ans-dim');
      if (i === info.correctPos) b.classList.add('ans-right');
      else if (i === info.pos) b.classList.add('ans-wrong');
      else b.classList.add('ans-dim');
      var mk = b.querySelector('.mk');
      mk.innerHTML = '';
      if (i === info.pos) {
        var mp = el('span', 'mark-p'); mp.appendChild(avP(st, 30)); mk.appendChild(mp);
      }
      if (i === info.rivalPos) {
        var mr = el('span', 'mark-r'); mr.appendChild(avR(st, 30)); mk.appendChild(mr);
      }
    }
    var bar = $('timer-bar'); if (bar) bar.classList.add('done'); // CSS may dim the bar (look A: opacity .45)
    var ra = $('r-answered'); if (ra) ra.classList.remove('on');
    // score pops: "+74" gold, "+0" muted (.zero); negative shown as-is
    [['side-p', info.pPts], ['side-r', info.rPts]].forEach(function (a) {
      var side = $(a[0]);
      if (!side) return;
      var old = side.querySelector('.pop');
      if (old) side.removeChild(old);
      var v = a[1] || 0;
      side.appendChild(el('div', 'pop' + (v === 0 ? ' zero' : (v < 0 ? ' neg' : '')), (v >= 0 ? '+' : '') + v));
    });
    setScore('p', info.pScore != null ? info.pScore : st.pScore);
    setScore('r', info.rScore != null ? info.rScore : st.rScore);
    var showFact = !info.pRight && !!info.fact;
    $('q-fact').textContent = showFact ? info.fact : '';
    $('scr-duel').classList.add('revealed');
    $('scr-duel').classList.toggle('has-fact', showFact);
    var nx = $('btn-next');
    nx.style.display = '';
    nx.textContent = st.n === 7 || (st.log && st.log.length >= 7) ? 'Result' : ((st.n === 6 || (st.log && st.log.length === 6)) ? 'To the wager' : 'Next');
  }

  ui.buildVs = buildVs;
  ui.renderVs = renderVs;
  ui.buildDuel = buildDuel;
  ui.renderQuestion = renderQuestion;
  ui.renderTimer = renderTimer;
  ui.renderRivalAnswered = renderRivalAnswered;
  ui.renderReveal = renderReveal;
})();
if (typeof module !== 'undefined') module.exports = TD.ui;
