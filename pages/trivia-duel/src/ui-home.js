var TD = (typeof window!=='undefined'?(window.TD=window.TD||{}):(global.TD=global.TD||{})); TD.ui = TD.ui || {};
// ui-home.js: home + settings screens (look A "Arena"). Hooks: buildHome, renderHome, buildSettings.
(function () {
  'use strict';
  var ui = TD.ui;
  // admin default: seal colours match avatar.player fallback (blue/teal/purple/green)
  var SEALS = ['#2f7bff', '#14b8a6', '#a855f7', '#22c55e'];
  var homeBuilt = false;

  // admin default: TD.ui.save is the live save object (mutated in place, never replaced)
  function S() { return ui.save; }
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    if (ui.h) return ui.h(tag, attrs, kids);
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function persist() { if (ui.persist) ui.persist(); }
  function cfg() { return ui.cfg ? ui.cfg() : (TD.tweak ? TD.tweak.cfg : TD.DEFAULTS); }
  function label(id) { return ui.topicLabel ? ui.topicLabel(id) : id; }
  function st(css, e) { e.style.cssText = css; return e; }

  // admin default: TD.ui.icon comes from home-art.js; fall back to a text span if it is missing
  var GLYPH = { 'ico-boy': '♂', 'ico-girl': '♀', 'ico-gear': '⚙', 'ico-minus': '−', 'ico-plus': '+', 'ico-flame': '🕯', 'ico-film': '🎬', 'ico-book': '📖' };
  function ic(name, px) {
    if (ui.icon) return ui.icon(name, px);
    var sp = el('span', { class: 'hc-ico hc-ico-fb', text: GLYPH[name] || '' });
    return sp;
  }
  function gender() {
    if (ui.gender) return ui.gender();
    return S().gender === 'g' ? 'g' : 'b';
  }
  function playerAv(px) {
    return TD.avatar && TD.avatar.player ? TD.avatar.player(S().name || 'You', S().seal || 0, px) : el('div');
  }
  function renderPav() {
    var p = $('home-pav');
    if (!p) return;
    p.innerHTML = '';
    p.appendChild(playerAv(64));
  }
  function paintGender() {
    var g = gender(), b = $('btn-gender');
    if (!b) return;
    b.setAttribute('data-g', g);
    b.setAttribute('aria-label', g === 'g' ? 'Girl' : 'Boy');
    b.innerHTML = '';
    b.appendChild(ic(g === 'g' ? 'ico-girl' : 'ico-boy', 40));
  }

  function buildHome() {
    var s = $('scr-home'), save = S();
    if (!s) return;
    s.innerHTML = '';
    s.classList.add('hc-home');
    if (TD.ART && TD.ART.bgArena) s.style.setProperty('--hc-bg', 'url(' + TD.ART.bgArena + ')');
    // header: emblem + title + settings
    var emb = (TD.avatar && TD.avatar.emblem) ? TD.avatar.emblem(44) : el('div');
    var settings = el('button', { class: 'hc-gear', id: 'btn-settings', title: 'Settings', type: 'button' }, [ic('ico-gear', 28)]);
    s.appendChild(el('div', { class: 'home-head hc-head' }, [
      emb,
      el('h1', { class: 'home-title hc-title', text: 'Candle Duel' }), // working name
      settings
    ]));

    // player card: avatar + name + gender, seals
    var inName = el('input', { id: 'in-name', type: 'text', maxlength: '14', placeholder: 'Your name' });
    inName.value = save.name || '';
    inName.addEventListener('input', function () { S().name = inName.value.slice(0, 14); persist(); });
    var gbtn = el('button', { class: 'hc-gender', id: 'btn-gender', type: 'button' });
    gbtn.addEventListener('click', function () {
      S().gender = gender() === 'g' ? 'b' : 'g'; persist();
      paintGender(); renderPav();
    });
    var sw = el('div', { class: 'swatches hc-seals' });
    sw.appendChild(el('span', { text: 'Seal' }));
    SEALS.forEach(function (col, i) {
      var b = el('div', { class: 'swatch hc-gem' + (i === save.seal ? ' sel' : ''), 'data-i': String(i) }, [ic('gem-' + i, 34)]);
      b.addEventListener('click', function () {
        S().seal = i; persist();
        var all = sw.querySelectorAll('.swatch');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('sel', j === i);
        renderPav();
      });
      sw.appendChild(b);
    });
    var corners = ['tl', 'tr', 'bl', 'br'].map(function (c) {
      return el('span', { class: 'hc-corner hc-c-' + c }, [ic('fil-corner', 22)]);
    });
    s.appendChild(el('div', { class: 'card col hc-card hc-pcard' }, corners.concat([
      el('div', { class: 'row hc-prow' }, [el('div', { id: 'home-pav', class: 'hc-pav' }), inName, gbtn]),
      sw
    ])));

    // mode + read-to stepper
    var bm = el('button', { class: 'btn grow', id: 'btn-mode-movie', type: 'button' }, [ic('ico-film', 20), document.createTextNode('Movie fan')]);
    var bb = el('button', { class: 'btn grow', id: 'btn-mode-book', type: 'button' }, [ic('ico-book', 20), document.createTextNode('Book reader')]);
    var minus = el('button', { class: 'btn', id: 'btn-rt-minus', type: 'button', 'aria-label': 'Fewer books' }, [ic('ico-minus', 36)]);
    var plus = el('button', { class: 'btn', id: 'btn-rt-plus', type: 'button', 'aria-label': 'More books' }, [ic('ico-plus', 36)]);
    var rt = el('input', { id: 'in-readto', type: 'text', inputmode: 'numeric', maxlength: '1' });
    rt.readOnly = true;
    function setMode(m) { S().mode = m; persist(); renderHome(); }
    function setRt(v) { S().readUpTo = Math.max(1, Math.min(7, v)); persist(); renderHome(); }
    bm.addEventListener('click', function () { setMode('movie'); });
    bb.addEventListener('click', function () { setMode('book'); });
    minus.addEventListener('click', function () { setRt(S().readUpTo - 1); });
    plus.addEventListener('click', function () { setRt(S().readUpTo + 1); });
    s.appendChild(el('div', { class: 'card col hc-card hc-mode' }, [
      el('div', { class: 'row hc-pill' }, [bm, bb]),
      el('div', { class: 'row hc-step', id: 'readto-row' }, [
        el('span', { class: 'grow', text: 'Read up to book' }), minus, rt, plus])
    ]));

    // topics
    var tiles = el('div', { class: 'row hc-grid', id: 'topic-row' });
    (TD.TOPICS || []).forEach(function (t) {
      var b = el('button', { class: 'btn btn-topic topic-tile hc-tile', type: 'button', 'data-topic': t.id });
      b.addEventListener('click', function () { S().picked = t.id; persist(); renderHome(); });
      tiles.appendChild(b);
    });
    s.appendChild(tiles);

    // rival card
    s.appendChild(st('display:flex;align-items:center;gap:12px;background:#3a2a8a;border-radius:16px;padding:12px', el('div', { class: 'card row', id: 'home-rival' }, [
      el('div', { id: 'home-rival-av' }),
      st('display:flex;flex-direction:column;gap:2px;flex:1;min-width:0', el('div', { class: 'col grow' }, [
        st('font-size:12px;font-weight:700;color:#cfc8ff', el('div', { class: 'small muted', text: 'Your rival' })),
        st('font-size:18px;font-weight:800', el('div', { id: 'home-rival-name' })),
        st('font-size:13px;font-weight:700;color:#ff7a1a', el('div', { id: 'home-rival-step', class: 'small' })),
        st('font-size:12px;color:#ffd23f', el('div', { id: 'home-warn', class: 'small' }))
      ]))
    ])));

    var play = el('button', { class: 'btn btn-seal btn-play hc-duel', id: 'btn-play', type: 'button', text: 'DUEL' });
    s.appendChild(el('div', { class: 'hc-duelrow' }, [ic('ico-flame', 28), play, ic('ico-flame', 28)]));
    s.appendChild(el('div', { class: 'small muted hc-build', id: 'home-build' }));
    // admin default: core binds #btn-play/#btn-settings by id after build (contract); no listeners added here
    homeBuilt = true;
  }

  function renderHome() {
    if (!homeBuilt) return;
    var save = S(), c = cfg();
    // keep name + seal in sync with the save (e.g. after Reset progress)
    var inName = $('in-name');
    if (inName && document.activeElement !== inName && inName.value !== (save.name || '')) inName.value = save.name || '';
    var sws = document.querySelectorAll('#scr-home .swatch');
    for (var w = 0; w < sws.length; w++) sws[w].classList.toggle('sel', w === save.seal);
    paintGender();
    renderPav();
    [['btn-mode-movie', 'movie'], ['btn-mode-book', 'book']].forEach(function (p) {
      var b = $(p[0]), on = save.mode === p[1];
      b.classList.toggle('sel', on);
      b.classList.toggle('on', on);
    });
    $('in-readto').value = String(save.readUpTo);
    var tiles = document.querySelectorAll('.btn-topic');
    for (var i = 0; i < tiles.length; i++) {
      var id = tiles[i].getAttribute('data-topic');
      var xp = (save.topicXp && save.topicXp[id]) || 0;
      var lv = TD.engine.levelOf(xp, c);
      tiles[i].textContent = '';
      var tic = el('div', { class: 'hc-tic' });
      if (TD.avatar && TD.avatar.topic) tic.appendChild(TD.avatar.topic(id, 40));
      tiles[i].appendChild(tic);
      tiles[i].appendChild(el('div', { class: 'hc-tnm', text: label(id) }));
      tiles[i].appendChild(el('div', { class: 'small hc-tlv', text: 'Lv ' + lv + ' · ' + xp + ' XP' }));
      tiles[i].classList.toggle('sel', id === save.picked);
    }
    var rv = ui.rivalOf(save.rivalStep);
    var av = $('home-rival-av');
    av.innerHTML = '';
    if (TD.avatar && TD.avatar.rival) av.appendChild(TD.avatar.rival(rv.step, 64));
    $('home-rival-name').textContent = rv.name;
    $('home-rival-step').textContent = 'Rival ' + rv.step + '/5';
    var pool = ui.poolFor ? ui.poolFor() : [];
    var n = pool.filter(function (x) { return x.topic === save.picked; }).length;
    $('home-warn').textContent = n < 7 ? ('Only ' + n + ' ' + label(save.picked) + ' questions here. Duel will mix topics.') : '';
    $('home-build').textContent = 'build ' + TD.BUILD;
    if (ui.refreshBadge) ui.refreshBadge();
  }

  function buildSettings() {
    var s = $('scr-settings');
    if (!s) return;
    s.innerHTML = '';
    s.appendChild(st('margin:0;font-size:26px;font-weight:900;color:#ffd23f', el('h2', { text: 'Settings' })));
    var seed = el('input', { id: 'in-seed', type: 'text', inputmode: 'numeric', placeholder: 'random' });
    st('width:120px;height:40px;border:0;border-radius:10px;padding:0 10px;font-size:16px;font-weight:700;color:#1c1540;background:#fff', seed);
    s.appendChild(st('display:flex;align-items:center;gap:10px', el('div', { class: 'row' }, [
      st('flex:1;font-size:14px;font-weight:700', el('span', { class: 'small grow', text: 'Seed (blank = random)' })), seed])));
    s.appendChild(el('div', { id: 'tweak-root' }));
    var reset = el('button', { class: 'btn', id: 'btn-reset-progress', type: 'button', text: 'Reset progress' });
    var back = el('button', { class: 'btn btn-seal', id: 'btn-back', type: 'button', text: 'Back' });
    st('flex:1;height:48px;border:0;border-radius:14px;background:#ef4444;color:#fff;font-size:16px;font-weight:800;cursor:pointer', reset);
    st('flex:1;height:48px;border:0;border-radius:14px;background:#ff7a1a;color:#fff;font-size:18px;font-weight:900;cursor:pointer', back);
    s.appendChild(st('display:flex;gap:10px', el('div', { class: 'row foot' }, [reset, back])));
    // admin default: core binds #btn-back / #btn-reset-progress by id (contract); core's handler does reset + rebuild.
  }

  ui.buildHome = buildHome;
  ui.renderHome = renderHome;
  ui.buildSettings = buildSettings;
})();
