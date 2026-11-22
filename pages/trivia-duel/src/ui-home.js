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

  function buildHome() {
    var s = $('scr-home'), save = S();
    if (!s) return;
    s.innerHTML = '';
    // header: emblem + title + settings
    var emb = (TD.avatar && TD.avatar.emblem) ? TD.avatar.emblem(44) : el('div');
    var settings = el('button', { class: 'btn btn-seal', id: 'btn-settings', title: 'Settings', type: 'button', text: '⚙' });
    st('width:48px;height:48px;border-radius:14px;border:0;background:#1b1245;color:#fff;font-size:24px;font-weight:800;cursor:pointer', settings);
    s.appendChild(st('display:flex;align-items:center;gap:10px', el('div', { class: 'home-head' }, [
      emb,
      st('flex:1;margin:0;font-size:28px;font-weight:900;color:#ffd23f', el('h1', { class: 'home-title', text: 'Candle Duel' })), // working name
      settings
    ])));

    // name + seal
    var inName = el('input', { id: 'in-name', type: 'text', maxlength: '14', placeholder: 'Your name' });
    inName.value = save.name || '';
    st('flex:1;min-width:0;height:44px;border-radius:12px;border:0;padding:0 12px;font-size:18px;font-weight:700;color:#1c1540;background:#fff', inName);
    inName.addEventListener('input', function () { S().name = inName.value.slice(0, 14); persist(); });
    var sw = el('div', { class: 'swatches' });
    st('display:flex;gap:10px', sw);
    SEALS.forEach(function (col, i) {
      var b = el('div', { class: 'swatch' + (i === save.seal ? ' sel' : ''), 'data-i': String(i) });
      st('width:34px;height:34px;border-radius:50%;cursor:pointer;border:3px solid ' + (i === save.seal ? '#ffd23f' : 'transparent') + ';background:' + col, b);
      b.addEventListener('click', function () {
        S().seal = i; persist();
        var all = sw.querySelectorAll('.swatch');
        for (var j = 0; j < all.length; j++) {
          all[j].classList.toggle('sel', j === i);
          all[j].style.borderColor = j === i ? '#ffd23f' : 'transparent';
        }
      });
      sw.appendChild(b);
    });
    s.appendChild(st('display:flex;flex-direction:column;gap:10px;background:#3a2a8a;border-radius:16px;padding:12px', el('div', { class: 'card col' }, [
      st('display:flex;gap:10px', el('div', { class: 'row' }, [inName])),
      st('display:flex;align-items:center;gap:12px', el('div', { class: 'row' }, [
        st('font-size:13px;font-weight:700;color:#cfc8ff', el('span', { text: 'Seal' })), sw]))
    ])));

    // mode + read-to stepper
    var bm = el('button', { class: 'btn grow', id: 'btn-mode-movie', type: 'button', text: 'Movie fan' });
    var bb = el('button', { class: 'btn grow', id: 'btn-mode-book', type: 'button', text: 'Book reader' });
    var minus = el('button', { class: 'btn', id: 'btn-rt-minus', type: 'button', text: '−' });
    var plus = el('button', { class: 'btn', id: 'btn-rt-plus', type: 'button', text: '+' });
    var rt = el('input', { id: 'in-readto', type: 'text', inputmode: 'numeric', maxlength: '1' });
    rt.readOnly = true;
    st('width:48px;height:44px;text-align:center;border:0;border-radius:10px;font-size:20px;font-weight:800;color:#1c1540;background:#fff', rt);
    [bm, bb].forEach(function (b) { st('flex:1;height:44px;border:0;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer', b); });
    [minus, plus].forEach(function (b) { st('width:44px;height:44px;border:0;border-radius:12px;font-size:22px;font-weight:900;background:#fff;color:#1c1540;cursor:pointer', b); });
    function setMode(m) { S().mode = m; persist(); renderHome(); }
    function setRt(v) { S().readUpTo = Math.max(1, Math.min(7, v)); persist(); renderHome(); }
    bm.addEventListener('click', function () { setMode('movie'); });
    bb.addEventListener('click', function () { setMode('book'); });
    minus.addEventListener('click', function () { setRt(S().readUpTo - 1); });
    plus.addEventListener('click', function () { setRt(S().readUpTo + 1); });
    s.appendChild(st('display:flex;flex-direction:column;gap:10px;background:#3a2a8a;border-radius:16px;padding:12px', el('div', { class: 'card col' }, [
      st('display:flex;gap:10px', el('div', { class: 'row' }, [bm, bb])),
      st('display:flex;align-items:center;gap:10px', el('div', { class: 'row', id: 'readto-row' }, [
        st('flex:1;font-size:14px;font-weight:700', el('span', { class: 'grow', text: 'Read up to book' })), minus, rt, plus]))
    ])));

    // topics
    var tiles = st('display:flex;gap:8px', el('div', { class: 'row', id: 'topic-row' }));
    (TD.TOPICS || []).forEach(function (t) {
      var b = el('button', { class: 'btn btn-topic topic-tile', type: 'button', 'data-topic': t.id });
      st('flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border:0;border-radius:14px;color:#1c1540;font-weight:800;cursor:pointer', b); // face + 6px lip from buttons.css
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

    var play = el('button', { class: 'btn btn-seal btn-play', id: 'btn-play', type: 'button', text: 'DUEL' });
    st('height:64px;border:0;border-radius:18px;background:#ff7a1a;color:#fff;font-size:34px;font-weight:900;letter-spacing:.08em;box-shadow:0 6px 0 #b8500a;cursor:pointer', play);
    s.appendChild(play);
    s.appendChild(st('font-size:11px;color:#cfc8ff;text-align:center', el('div', { class: 'small muted', id: 'home-build' })));
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
    for (var w = 0; w < sws.length; w++) {
      sws[w].classList.toggle('sel', w === save.seal);
      sws[w].style.borderColor = w === save.seal ? '#ffd23f' : 'transparent';
    }
    $('btn-mode-movie').classList.toggle('sel', save.mode === 'movie');
    $('btn-mode-book').classList.toggle('sel', save.mode === 'book');
    [['btn-mode-movie', 'movie'], ['btn-mode-book', 'book']].forEach(function (p) {
      var b = $(p[0]), on = save.mode === p[1];
      b.style.background = on ? '#2f7bff' : '#fff';
      b.style.color = on ? '#fff' : '#1c1540';
    });
    $('in-readto').value = String(save.readUpTo);
    var tiles = document.querySelectorAll('.btn-topic');
    for (var i = 0; i < tiles.length; i++) {
      var id = tiles[i].getAttribute('data-topic');
      var xp = (save.topicXp && save.topicXp[id]) || 0;
      var lv = TD.engine.levelOf(xp, c);
      tiles[i].textContent = '';
      if (TD.avatar && TD.avatar.topic) tiles[i].appendChild(TD.avatar.topic(id, 44));
      var nm = el('div', { text: label(id) }); nm.style.fontSize = '15px';
      var sub = el('div', { class: 'small', text: 'Lv ' + lv + ' · ' + xp + ' XP' });
      sub.style.cssText = 'font-size:12px;font-weight:700;color:#6d5bd0';
      tiles[i].appendChild(nm); tiles[i].appendChild(sub);
      var sel = id === save.picked;
      tiles[i].classList.toggle('sel', sel);
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
