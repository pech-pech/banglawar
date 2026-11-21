var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
(function () {
  'use strict';
  var ui = {};
  var SEALS = ['#8e1b1b', '#1f4a2e', '#1f3a6b', '#5b2a6b'];
  var save = null;
  var D = null; // current duel
  var inputLockUntil = 0;
  var rafId = 0, autoT = 0;

  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('data-') === 0 || k === 'type' || k === 'id' || k === 'maxlength' || k === 'placeholder' || k === 'inputmode' || k === 'title') e.setAttribute(k, attrs[k]);
      else e[k] = attrs[k];
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function cfg() { return TD.tweak ? TD.tweak.cfg : TD.DEFAULTS; }
  function rivalOf(step) { return TD.RIVALS[Math.max(1, Math.min(5, step)) - 1]; }
  function topicLabel(id) { var t = TD.TOPICS.filter(function (x) { return x.id === id; })[0]; return t ? t.label : id; }

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
  function persist() {
    try { localStorage.setItem('td.save', JSON.stringify(save)); } catch (e) {}
  }

  // ---------- portrait ----------
  function drawPortrait(canvas, look, sizePx) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = canvas.height = Math.round(sizePx * dpr);
    canvas.style.width = canvas.style.height = sizePx + 'px';
    var c = canvas.getContext('2d');
    if (!c) return;
    c.setTransform(canvas.width / 100, 0, 0, canvas.height / 100, 0, 0);
    c.clearRect(0, 0, 100, 100);
    look = look || {};
    var skin = '#e8c7a2', hair = look.hair || '#4a3020', robe = look.robe || '#2b2b33';
    c.save();
    c.beginPath(); c.arc(50, 50, 47, 0, 7); c.clip();
    c.fillStyle = '#15110c'; c.fillRect(0, 0, 100, 100);
    var g = c.createRadialGradient(50, 40, 5, 50, 50, 55);
    g.addColorStop(0, 'rgba(217,164,65,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 100, 100);
    var st = look.hairStyle;
    var fw = look.face === 'round' ? 20 : look.face === 'long' ? 17 : 18.5;
    var fh = look.face === 'round' ? 20 : look.face === 'long' ? 25 : 22;
    var fy = 50;
    // back hair
    c.fillStyle = hair;
    if (st === 'long') { c.beginPath(); c.ellipse(50, 56, fw + 6, 34, 0, 0, 7); c.fill(); }
    if (st === 'bushy') { c.beginPath(); c.ellipse(50, 48, fw + 11, 31, 0, 0, 7); c.fill(); }
    if (st === 'bun') { c.beginPath(); c.arc(50, 18, 9, 0, 7); c.fill(); }
    // robe
    c.fillStyle = robe; c.beginPath(); c.ellipse(50, 104, 40, 26, 0, 0, 7); c.fill();
    c.fillStyle = skin; c.fillRect(44, 66, 12, 14);
    // face
    c.beginPath(); c.ellipse(50, fy, fw, fh, 0, 0, 7); c.fill();
    // front hair
    c.fillStyle = hair;
    c.beginPath(); c.ellipse(50, fy - 3, fw + 1.5, fh - 2, 0, Math.PI, 0); c.fill();
    if (st === 'short') { c.fillStyle = skin; c.beginPath(); c.ellipse(50, fy + 1, fw - 3, fh - 12, 0, Math.PI, 0); c.fill(); c.fillStyle = hair; c.fillRect(fw > 0 ? 50 - fw - 1 : 0, fy - 4, 3, 8); c.fillRect(50 + fw - 2, fy - 4, 3, 8); }
    else if (st === 'long' || st === 'bun') { c.fillStyle = skin; c.beginPath(); c.ellipse(50, fy + 1, fw - 3.5, fh - 11, 0, Math.PI, 0); c.fill(); }
    else if (st === 'bushy') { c.fillStyle = skin; c.beginPath(); c.ellipse(50, fy + 2, fw - 2.5, fh - 9, 0, Math.PI, 0); c.fill(); }
    // hat
    if (look.hat === 'pointed') {
      c.fillStyle = '#16140f';
      c.beginPath(); c.moveTo(30, 34); c.lineTo(52, -6); c.lineTo(70, 34); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(50, 34, 28, 5, 0, 0, 7); c.fill();
    }
    // eyes, brows, mouth
    c.fillStyle = '#2a1d10';
    c.beginPath(); c.arc(43, fy + 1, 1.8, 0, 7); c.fill();
    c.beginPath(); c.arc(57, fy + 1, 1.8, 0, 7); c.fill();
    c.strokeStyle = '#2a1d10'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(40, fy - 4); c.lineTo(46, fy - 4.5); c.moveTo(54, fy - 4.5); c.lineTo(60, fy - 4); c.stroke();
    c.strokeStyle = '#8a3a2a'; c.lineWidth = 1.4;
    c.beginPath(); c.arc(50, fy + 10, 5, 0.2, Math.PI - 0.2); c.stroke();
    if (look.freckles) {
      c.fillStyle = 'rgba(140,80,40,0.7)';
      [[41, 8], [44, 10], [39, 11], [56, 10], [59, 8], [61, 11], [47, 7], [53, 7]].forEach(function (p) {
        c.beginPath(); c.arc(p[0], fy + p[1] - 2, 0.9, 0, 7); c.fill();
      });
    }
    if (look.glasses) {
      c.strokeStyle = '#d9a441'; c.lineWidth = 1.4;
      c.strokeRect(36.5, fy - 4, 11, 9); c.strokeRect(52.5, fy - 4, 11, 9);
      c.beginPath(); c.moveTo(47.5, fy); c.lineTo(52.5, fy); c.stroke();
    }
    c.restore();
    c.lineWidth = 3.2; c.strokeStyle = '#d9a441';
    c.beginPath(); c.arc(50, 50, 47, 0, 7); c.stroke();
  }
  ui.drawPortrait = drawPortrait;

  // ---------- screens ----------
  function show(id) {
    var list = document.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('active');
    $(id).classList.add('active');
    if (id === 'scr-result') inputLockUntil = Date.now() + 400;
    window.scrollTo && window.scrollTo(0, 0);
  }
  function refreshBadge() {
    var b = $('dev-badge');
    if (b) { b.style.display = ''; b.classList.toggle('on', !!(TD.tweak && TD.tweak.isDev())); }
  }
  ui.refreshBadge = refreshBadge;

  function poolFor() {
    return TD.engine.pool(TD.QUESTIONS || [], { mode: save.mode, readUpTo: save.readUpTo });
  }
  function sealDot(cls) {
    var d = h('div', { class: 'chip ' + (cls || '') });
    d.style.background = SEALS[save.seal] || SEALS[0];
    d.style.borderRadius = '50%'; d.style.width = '34px'; d.style.height = '34px';
    d.style.display = 'inline-flex'; d.style.alignItems = 'center'; d.style.justifyContent = 'center';
    d.textContent = (save.name || 'Y').charAt(0).toUpperCase();
    return d;
  }

  function buildHome() {
    var s = $('scr-home');
    s.innerHTML = '';
    s.appendChild(h('div', { class: 'row' }, [
      h('h1', { class: 'gold grow', text: 'Candle Duel' }),
      h('button', { class: 'btn btn-seal', id: 'btn-settings', title: 'Settings', text: '⚙' })
    ]));
    var inName = h('input', { id: 'in-name', type: 'text', maxlength: '14', placeholder: 'Your name' });
    inName.value = save.name || '';
    inName.addEventListener('input', function () { save.name = inName.value.slice(0, 14); persist(); });
    var sw = h('div', { class: 'row' });
    SEALS.forEach(function (col, i) {
      var b = h('div', { class: 'swatch' + (i === save.seal ? ' sel' : ''), 'data-i': String(i) });
      b.style.background = col;
      b.addEventListener('click', function () {
        save.seal = i; persist();
        var all = sw.querySelectorAll('.swatch');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('sel', j === i);
      });
      sw.appendChild(b);
    });
    s.appendChild(h('div', { class: 'card col' }, [inName, h('div', { class: 'row' }, [h('span', { class: 'small muted', text: 'Seal' }), sw])]));

    var bm = h('button', { class: 'btn grow', id: 'btn-mode-movie', text: 'Movie fan' });
    var bb = h('button', { class: 'btn grow', id: 'btn-mode-book', text: 'Book reader' });
    var minus = h('button', { class: 'btn', id: 'btn-readto-minus', text: '−' });
    var plus = h('button', { class: 'btn', id: 'btn-readto-plus', text: '+' });
    var rt = h('input', { id: 'in-readto', type: 'text', inputmode: 'numeric', maxlength: '1' });
    rt.readOnly = true; rt.style.width = '56px'; rt.style.textAlign = 'center';
    function setMode(m) { save.mode = m; persist(); refreshHome(); }
    function setRt(v) { save.readUpTo = Math.max(1, Math.min(7, v)); persist(); refreshHome(); }
    bm.addEventListener('click', function () { setMode('movie'); });
    bb.addEventListener('click', function () { setMode('book'); });
    minus.addEventListener('click', function () { setRt(save.readUpTo - 1); });
    plus.addEventListener('click', function () { setRt(save.readUpTo + 1); });
    s.appendChild(h('div', { class: 'card col' }, [
      h('div', { class: 'row' }, [bm, bb]),
      h('div', { class: 'row' }, [h('span', { class: 'grow small', text: 'Read up to book' }), minus, rt, plus])
    ]));

    var tiles = h('div', { class: 'row', id: 'topic-row' });
    TD.TOPICS.forEach(function (t) {
      var b = h('button', { class: 'btn topic-tile btn-topic grow', 'data-topic': t.id });
      b.addEventListener('click', function () { save.picked = t.id; persist(); refreshHome(); });
      tiles.appendChild(b);
    });
    s.appendChild(tiles);

    var cv = h('canvas', { id: 'home-rival-cv' });
    s.appendChild(h('div', { class: 'card row' }, [cv, h('div', { class: 'col grow', style: 'gap:2px' }, [
      h('div', { class: 'small muted', text: 'Your rival' }),
      h('div', { id: 'home-rival-name' }),
      h('div', { id: 'home-rival-step', class: 'small' }),
      h('div', { id: 'home-warn', class: 'small' })
    ])]));
    s.appendChild(h('button', { class: 'btn btn-seal', id: 'btn-play', text: 'Duel' }));
    s.appendChild(h('div', { class: 'small muted', id: 'home-build' }));
    $('btn-play').addEventListener('click', startDuel);
    $('btn-settings').addEventListener('click', openSettings);
  }

  function refreshHome() {
    var q = $('btn-mode-movie'), b = $('btn-mode-book');
    q.classList.toggle('sel', save.mode === 'movie');
    b.classList.toggle('sel', save.mode === 'book');
    $('in-readto').value = String(save.readUpTo);
    var book = save.mode === 'book';
    $('in-readto').parentNode.style.opacity = '1';
    var tiles = document.querySelectorAll('.btn-topic');
    for (var i = 0; i < tiles.length; i++) {
      var id = tiles[i].getAttribute('data-topic');
      var xp = save.topicXp[id] || 0, c = cfg();
      var lv = TD.engine.levelOf(xp, c);
      tiles[i].textContent = '';
      tiles[i].appendChild(h('div', { text: topicLabel(id) }));
      tiles[i].appendChild(h('div', { class: 'small', text: 'Lv ' + lv + ' · ' + xp + ' XP' }));
      tiles[i].classList.toggle('sel', id === save.picked);
    }
    var rv = rivalOf(save.rivalStep);
    drawPortrait($('home-rival-cv'), rv.look, 60);
    $('home-rival-name').textContent = rv.name;
    $('home-rival-step').textContent = 'Rival ' + rv.step + '/5';
    var pool = poolFor();
    var n = pool.filter(function (x) { return x.topic === save.picked; }).length;
    $('home-warn').textContent = n < 7 ? ('Only ' + n + ' ' + topicLabel(save.picked) + ' questions here. Duel will mix topics.') : '';
    $('home-build').textContent = 'build ' + TD.BUILD + (book ? '' : '');
    refreshBadge();
  }

  function buildDuel() {
    var s = $('scr-duel');
    s.innerHTML = '';
    s.appendChild(h('div', { class: 'topbar row' }, [
      h('div', { class: 'row', id: 'top-p' }),
      h('div', { class: 'grow', style: '' }, [h('div', { id: 'q-num', class: 'gold', text: 'Q 1/7' })]),
      h('div', { class: 'row', id: 'top-r' })
    ]));
    $('q-num').parentNode.style.textAlign = 'center';
    var bar = h('div', { id: 'timer-bar' }, [h('div', { id: 'timer-fill' })]);
    s.appendChild(bar);
    s.appendChild(h('div', { class: 'row', id: 'chips-row' }));
    s.appendChild(h('div', { class: 'card', id: 'q-text' }));
    var ans = h('div', { class: 'col', id: 'ans-wrap' });
    for (var i = 0; i < 4; i++) {
      (function (pos) {
        var b = h('button', { class: 'btn btn-ans', 'data-pos': String(pos) });
        b.addEventListener('click', function () { onAnswer(pos); });
        ans.appendChild(b);
      })(i);
    }
    s.appendChild(ans);
    s.appendChild(h('div', { class: 'small', id: 'q-fact' }));
    var nx = h('button', { class: 'btn btn-seal', id: 'btn-next', text: 'Next' });
    nx.addEventListener('click', goNext);
    s.appendChild(nx);
  }

  function buildWager() {
    var s = $('scr-wager');
    s.innerHTML = '';
    s.appendChild(h('h2', { class: 'gold', text: 'Final question' }));
    s.appendChild(h('div', { class: 'small', id: 'wager-scores' }));
    s.appendChild(h('div', { class: 'small muted', text: 'Pick the topic for question 7' }));
    var row = h('div', { class: 'row' });
    TD.TOPICS.forEach(function (t) {
      var b = h('button', { class: 'btn topic-tile grow', 'data-wt': t.id, text: t.label });
      b.addEventListener('click', function () { D.wagerTopic = t.id; refreshWager(); });
      row.appendChild(b);
    });
    s.appendChild(row);
    var x1 = h('button', { class: 'btn grow', id: 'btn-x1', text: 'x1 safe' });
    var x2 = h('button', { class: 'btn grow', id: 'btn-x2', text: 'x2 wager' });
    x1.addEventListener('click', function () { D.pMult = 1; refreshWager(); });
    x2.addEventListener('click', function () { D.pMult = cfg().wagerMult; refreshWager(); });
    s.appendChild(h('div', { class: 'row' }, [x1, x2]));
    s.appendChild(h('div', { class: 'small', id: 'wager-note' }));
    var go = h('button', { class: 'btn btn-seal', id: 'btn-wager-go', text: 'Go' });
    go.addEventListener('click', startQ7);
    s.appendChild(go);
  }
  function refreshWager() {
    var c = cfg();
    $('wager-scores').textContent = 'You ' + D.pScore + '  ·  ' + rivalOf(D.rivalStep).name + ' ' + D.rScore;
    var t = document.querySelectorAll('#scr-wager [data-wt]');
    for (var i = 0; i < t.length; i++) t[i].classList.toggle('sel', t[i].getAttribute('data-wt') === D.wagerTopic);
    $('btn-x1').classList.toggle('sel', D.pMult === 1);
    $('btn-x2').classList.toggle('sel', D.pMult !== 1);
    $('wager-note').textContent = 'Right on x' + c.wagerMult + ' scores double. Miss on x' + c.wagerMult + ' loses ' + c.wagerMissCost + ' points.';
  }

  function buildResult() {
    var s = $('scr-result');
    s.innerHTML = '';
    s.appendChild(h('h2', { class: 'gold', id: 'res-k' }));
    s.appendChild(h('div', { id: 'res-banner', class: 'card' }));
    s.appendChild(h('div', { id: 'res-scores' }));
    s.appendChild(h('div', { id: 'res-xp', class: 'small' }));
    s.appendChild(h('div', { id: 'res-lv', class: 'small' }));
    s.appendChild(h('div', { id: 'res-seed', class: 'small muted' }));
    var rm = h('button', { class: 'btn btn-seal', id: 'btn-rematch', text: 'Rematch' });
    var hm = h('button', { class: 'btn', id: 'btn-home', text: 'Home' });
    var rp = h('button', { class: 'btn', id: 'btn-report', text: 'Copy report' });
    rm.addEventListener('click', function () { if (Date.now() < inputLockUntil) return; startDuel(); });
    hm.addEventListener('click', function () { if (Date.now() < inputLockUntil) return; goHome(); });
    rp.addEventListener('click', function () {
      if (Date.now() < inputLockUntil) return;
      try {
        TD.tweak.copy(TD.tweak.report(TD.tweak.lastState)).then(function () { rp.textContent = 'Copied'; }, function () { rp.textContent = 'Copy failed'; });
      } catch (e) { rp.textContent = 'Copy failed'; }
    });
    s.appendChild(h('div', { class: 'col' }, [rm, hm, rp]));
  }

  function buildSettings() {
    var s = $('scr-settings');
    s.innerHTML = '';
    s.appendChild(h('h2', { class: 'gold', text: 'Settings' }));
    s.appendChild(h('div', { class: 'row' }, [h('span', { class: 'small grow', text: 'Seed (blank = random)' }),
      h('input', { id: 'in-seed', type: 'text', inputmode: 'numeric', placeholder: 'random' })]));
    s.appendChild(h('div', { id: 'tweak-root' }));
    s.appendChild(h('div', { class: 'row foot' }, [
      h('button', { class: 'btn', id: 'btn-reset-progress', text: 'Reset progress' }),
      h('button', { class: 'btn btn-seal', id: 'btn-back', text: 'Back' })
    ]));
    $('btn-back').addEventListener('click', goHome);
    $('btn-reset-progress').addEventListener('click', function () {
      var ok = true;
      try { ok = window.confirm('Reset all progress?'); } catch (e) {}
      if (!ok) return;
      var keep = { mode: save.mode, readUpTo: save.readUpTo };
      save = defSave(); save.mode = keep.mode; save.readUpTo = keep.readUpTo;
      try { TD.tweak.set('rivalStep', 1); } catch (e) {}
      persist(); buildHome(); refreshHome();
    });
  }
  function openSettings() {
    show('scr-settings');
    var root = $('tweak-root');
    root.innerHTML = '';
    try { TD.tweak.open(root, function () { refreshBadge(); }); } catch (e) { root.textContent = 'Tweak panel unavailable'; }
  }
  function goHome() {
    stopTimers();
    // pick up any rivalStep tweak edits
    var rs = Math.max(1, Math.min(5, Math.round(+cfg().rivalStep || 1)));
    save.rivalStep = rs; persist();
    refreshHome();
    show('scr-home');
  }

  // ---------- duel ----------
  function stopTimers() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (autoT) { clearTimeout(autoT); autoT = 0; }
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
      pMult: 1, rMult: 1, rivalStep: step, log: [], pScore: 0, rScore: 0, result: null,
      pool: pool, rnd: rnd, plan: plan, n: 0, q: null, ex: null
    };
    D.exclude = new Set(plan.map(function (q) { return q.id; }));
    // topbar
    var tp = $('top-p'), tr = $('top-r');
    tp.innerHTML = ''; tr.innerHTML = '';
    tp.appendChild(sealDot()); tp.appendChild(h('span', { id: 'p-score', class: 'gold', text: '0' }));
    var mc = h('canvas', {});
    drawPortrait(mc, rivalOf(step).look, 44);
    tr.appendChild(mc); tr.appendChild(h('span', { class: 'rname', text: rivalOf(step).name.split(' ').pop() })); tr.appendChild(h('span', { id: 'r-score', class: 'gold', text: '0' }));
    nextQuestion();
    show('scr-duel');
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
    D.locked = false;
    D.rvShown = false;
    $('q-num').textContent = 'Q ' + D.n + '/7';
    $('q-text').textContent = q.q;
    var btns = document.querySelectorAll('#scr-duel .btn-ans');
    for (var i = 0; i < 4; i++) {
      btns[i].textContent = q.a[D.sh.order[i]];
      btns[i].className = 'btn btn-ans';
      btns[i].disabled = false;
    }
    $('q-fact').textContent = '';
    $('chips-row').innerHTML = '';
    $('btn-next').style.display = 'none';
    $('timer-fill').style.width = '100%';
    $('p-score').textContent = D.pScore;
    $('r-score').textContent = D.rScore;
    D.t0 = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function tick() {
    if (!D || D.locked) return;
    var c = cfg();
    var el = (performance.now() - D.t0) / 1000;
    var left = Math.max(0, 1 - el / c.timerSec);
    $('timer-fill').style.width = (left * 100).toFixed(1) + '%';
    if (!D.rvShown && el >= D.rv.tSec) {
      D.rvShown = true;
      var chip = h('span', { class: 'chip', id: 'chip-rival-ans', text: rivalOf(D.rivalStep).name.split(' ').pop() + ' answered' });
      $('chips-row').appendChild(chip);
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
    var btns = document.querySelectorAll('#scr-duel .btn-ans');
    for (var i = 0; i < 4; i++) {
      btns[i].disabled = true;
      if (i === D.sh.correctPos) btns[i].classList.add('ans-right');
      else if (i === pos) btns[i].classList.add('ans-wrong');
      else btns[i].classList.add('ans-dim');
    }
    var row = $('chips-row'); row.innerHTML = '';
    var rn = rivalOf(D.rivalStep).name.split(' ').pop();
    row.appendChild(h('span', { class: 'chip', text: 'You ' + (pos < 0 ? 'timed out' : pT.toFixed(1) + 's') }));
    row.appendChild(h('span', { class: 'chip', text: rn + ' ' + (D.rv.correct ? 'right' : 'wrong') + ' ' + D.rv.tSec.toFixed(1) + 's' }));
    row.appendChild(h('span', { class: 'chip pop', text: (pPts >= 0 ? '+' : '') + pPts }));
    if (rPts) row.appendChild(h('span', { class: 'chip pop', text: rn + ' +' + rPts }));
    $('p-score').textContent = D.pScore;
    $('r-score').textContent = D.rScore;
    if (!pRight) $('q-fact').textContent = q.fact;
    var nx = $('btn-next');
    nx.style.display = '';
    nx.textContent = D.n === 7 ? 'Result' : (D.n === 6 ? 'To the wager' : 'Next');
    if (pRight) {
      var myN = D.n;
      autoT = setTimeout(function () { autoT = 0; if (D && D.n === myN && D.locked) goNext(); }, 2500);
    }
  }

  function goNext() {
    if (!D || !D.locked) return;
    if (autoT) { clearTimeout(autoT); autoT = 0; }
    D.locked = false; // prevent double advance
    D.q = null;
    if (D.n < 6) { nextQuestion(); }
    else if (D.n === 6) { buildWagerAndShow(); }
    else finish();
  }

  function buildWagerAndShow() {
    D.pMult = 1;
    refreshWager();
    show('scr-wager');
  }
  function startQ7() {
    if (!D) return;
    nextQuestion();
    show('scr-duel');
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
    var k = D.log.filter(function (l) { return l.pRight; }).length;
    $('res-k').textContent = 'You got ' + k + ' of 7';
    var b = $('res-banner');
    b.className = 'card ' + (D.result === 'win' ? 'banner-win' : D.result === 'loss' ? 'banner-loss' : 'banner-draw');
    b.textContent = D.result === 'win' ? 'Victory!' : D.result === 'loss' ? 'Defeated' : 'A draw';
    $('res-scores').textContent = 'You ' + D.pScore + '  ·  ' + rivalOf(D.rivalStep).name + ' ' + D.rScore;
    $('res-xp').textContent = '+' + xp + ' XP in ' + topicLabel(D.pickedTopic) + (D.result === 'win' && step > D.rivalStep ? ' · Next rival unlocked' : '');
    var tot = save.topicXp[D.pickedTopic];
    $('res-lv').textContent = topicLabel(D.pickedTopic) + ' level ' + E.levelOf(tot, c) + ' (' + (tot % c.xpPerLevel) + '/' + c.xpPerLevel + ' XP)';
    $('res-seed').textContent = 'Seed ' + D.seed;
    $('btn-report').textContent = 'Copy report';
    refreshBadge();
    show('scr-result');
  }

  // ---------- start ----------
  function start() {
    var app = $('app');
    if (!app) return;
    app.innerHTML = '';
    ['home', 'duel', 'wager', 'result', 'settings'].forEach(function (n) {
      app.appendChild(h('section', { class: 'screen', id: 'scr-' + n }));
    });
    var badge = h('div', { id: 'dev-badge', text: 'DEV' });
    badge.style.display = 'none';
    document.body.appendChild(badge);
    save = loadSave();
    try {
      if (TD.tweak && TD.tweak.set && save.rivalStep !== TD.tweak.cfg.rivalStep) TD.tweak.set('rivalStep', save.rivalStep);
    } catch (e) {}
    buildHome(); buildDuel(); buildWager(); buildResult(); buildSettings();
    refreshHome();
    show('scr-home');
    refreshBadge();
  }
  ui.start = start;

  TD.ui = ui;
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  if (typeof module !== 'undefined') module.exports = ui;
})();
