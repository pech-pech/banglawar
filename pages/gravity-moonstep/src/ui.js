/* Moonstep ui.js: all DOM screens (title, how-to, install, HUD, pause, settings, results, records, medals).
   MoonUI.create(host) -> api. Host (game.js) owns state, storage and the loop. Medal bands come from host.bands() at runtime. */
(function (root) {
  'use strict';
  var NUM = ['I', 'II', 'III'];
  var ICONS = {
    play: '<svg class="u-ico" viewBox="0 0 24 24"><path d="M7 4l12 8-12 8z" fill="currentColor" stroke="none"/></svg>',
    dice: '<svg class="u-ico" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/></svg>',
    book: '<svg class="u-ico" viewBox="0 0 24 24"><path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v13"/></svg>',
    back: '<svg class="u-ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg class="u-ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    copy: '<svg class="u-ico" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>',
    check: '<svg class="u-ico" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
    cal: '<svg class="u-ico" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    retry: '<svg class="u-ico" viewBox="0 0 24 24"><path d="M4 12a8 8 0 108-8 8 8 0 00-6 3M4 4v4h4"/></svg>',
    gear: '<svg class="u-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
    pause: '<svg class="u-ico" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>',
    down: '<svg class="u-ico" viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M12 4v15M6 13l6 6 6-6"/></svg>',
    medal: '<svg class="u-ico" viewBox="0 0 24 24"><circle cx="12" cy="14" r="6"/><path d="M8 3l4 6 4-6"/></svg>'
  };

  function h(tag, cls, parent, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  }
  function ico(parent, name) { var s = h('span', 'u-i', parent); s.innerHTML = ICONS[name]; return s; }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
  function ago(ts) {
    if (!ts) return '';
    var m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 1440) return Math.round(m / 60) + 'h ago';
    return Math.round(m / 1440) + 'd ago';
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateLabel() { var d = new Date(); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  var DEFS = '<svg class="u-defs" aria-hidden="true" focusable="false"><defs>' +
    '<filter id="u-wob" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="3.2"/></filter>' +
    '<filter id="u-wob2" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="9"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>' +
    '<filter id="u-wob3" x="-2%" y="-100%" width="104%" height="300%"><feTurbulence type="fractalNoise" baseFrequency=".03 .12" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="14"/></filter>' +
    '<filter id="u-wobs" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="2"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter>' +
    '<radialGradient id="u-pearl" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#bcd0ee"/></radialGradient>' +
    '<radialGradient id="u-glow"><stop offset="0" stop-color="#aac4ee" stop-opacity=".6"/><stop offset=".5" stop-color="#bed0ee" stop-opacity=".22"/><stop offset="1" stop-color="#c8d7f0" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="u-wash" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#e2e8f4"/><stop offset=".55" stop-color="#8e98b0"/><stop offset="1" stop-color="#343a4e"/></radialGradient>' +
    '<pattern id="u-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><line x1="0" y1="0" x2="0" y2="3" stroke="#15171f" stroke-width=".8" opacity=".6"/></pattern>' +
    '</defs></svg>';

  var ART = '<svg class="u-art" viewBox="0 0 344 340" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<g fill="none" stroke="#15171f" stroke-opacity=".38" stroke-width="1.3" stroke-dasharray="1 6" stroke-linecap="round" filter="url(#u-wobs)"><circle cx="172" cy="150" r="140"/><circle cx="172" cy="150" r="105" stroke-opacity=".25"/></g>' +
    '<g filter="url(#u-wobs)"><circle cx="172" cy="150" r="150" fill="url(#u-glow)"/><circle cx="172" cy="150" r="68" fill="url(#u-wash)" stroke="#15171f" stroke-width="2.4"/>' +
    '<ellipse cx="148" cy="143" rx="19" ry="15" fill="url(#u-hatch)" stroke="#15171f" stroke-width="1.1"/><ellipse cx="192" cy="174" rx="15" ry="12" fill="url(#u-hatch)" stroke="#15171f" stroke-width="1.1"/><ellipse cx="179" cy="116" rx="10" ry="8" fill="url(#u-hatch)" stroke="#15171f" stroke-width="1"/></g>' +
    '<path d="M92 320 Q 70 262 112 226" fill="none" stroke="#15171f" stroke-width="2.2" stroke-dasharray="1 8" stroke-linecap="round" opacity=".85"/>' +
    '<g transform="translate(112 226)"><circle r="28" fill="url(#u-glow)"/><circle r="9" fill="url(#u-pearl)" stroke="#15171f" stroke-width="2.2"/><circle r="15" fill="none" stroke="#8a5a14" stroke-opacity=".75" stroke-width="2"/></g>' +
    '<g filter="url(#u-wobs)"><circle cx="296" cy="280" r="14" fill="url(#u-wash)" stroke="#15171f" stroke-width="1.8"/></g>' +
    '<g stroke="#8a5a14" stroke-width="3" stroke-linecap="round"><path d="M172 74v-12M228 112l9-7M116 112l-9-7"/></g></svg>';

  function create(host) {
    var store = host.store;
    var api = {};
    var wrap = h('div', 'u-root', document.body);
    wrap.insertAdjacentHTML('beforeend', DEFS);
    var screens = {}, stack = [], modals = [], lastFocus = null;

    function bands() { return host.bands(); }
    function bandIdx(name) { var b = bands(); for (var i = 0; i < b.length; i++) if (b[i].name === name) return i; return -1; }
    function seal(parent, name, size, cls) {
      var s = h('span', 'u-seal', parent);
      if (size) s.style.setProperty('--sz', size + 'px');
      var i = bandIdx(name), n = bands().length;
      if (!name || i < 0) { s.className += ' none'; }
      else if (i === n - 1 && i >= 3) { s.className += ' sx'; }
      else { s.className += ' s' + Math.min(i, 3); if (i < 3) s.textContent = NUM[i]; else s.className += ''; }
      if (i === n - 1 && i < 3) { /* fewer than 4 bands: last is still a numeral */ }
      if (cls) s.className += ' ' + cls;
      s.setAttribute('role', 'img'); s.setAttribute('aria-label', name || 'no medal');
      return s;
    }
    function btn(parent, label, cls, fn, opt) {
      var b = h('button', 'u-btn' + (cls ? ' ' + cls : ''), parent);
      b.type = 'button';
      opt = opt || {};
      if (opt.icon) ico(b, opt.icon);
      if (label) h('span', null, b, label);
      if (opt.sub) h('small', 'u-num', b, opt.sub);
      if (opt.aria) b.setAttribute('aria-label', opt.aria);
      if (fn) b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(b, ev); });
      return b;
    }
    function screen(name, cls) {
      var s = h('section', 'u-scr ' + (cls || ''), wrap);
      s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', name); s.dataset.screen = name;
      screens[name] = s; return s;
    }
    function head(parent, title, onBack, backIcon) {
      var hd = h('div', 'u-head', parent);
      if (onBack) btn(hd, '', 'circ', onBack, { icon: backIcon || 'back', aria: backIcon === 'close' ? 'Close' : 'Back' }); else h('span', 'u-sp', hd);
      h('h2', null, hd, title);
      h('span', 'u-sp', hd);
      return hd;
    }
    function row(parent, title, sub, on, fn) {
      var r = h('button', 'u-row', parent); r.type = 'button';
      r.setAttribute('role', 'switch'); r.setAttribute('aria-checked', on ? 'true' : 'false');
      var t = h('span', 't', r); h('b', null, t, title); h('i', null, t, sub);
      h('span', 'u-tog', r);
      r.addEventListener('click', function (ev) { ev.stopPropagation(); var v = r.getAttribute('aria-checked') !== 'true'; r.setAttribute('aria-checked', v ? 'true' : 'false'); fn(v); });
      return r;
    }
    function seg(parent, cur, fn) {
      var d = h('div', 'u-seg', parent), items = [[0.75, 'calm'], [1, 'steady'], [1.25, 'swift']], bs = [];
      d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Tide speed');
      items.forEach(function (it) {
        var b = h('button', null, d); b.type = 'button';
        h('span', null, b, String(it[0])); h('small', null, b, it[1]);
        b.setAttribute('aria-pressed', cur === it[0] ? 'true' : 'false');
        b.addEventListener('click', function (ev) { ev.stopPropagation(); bs.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); fn(it[0]); });
        bs.push(b);
      });
      return d;
    }

    // ---------- navigation ----------
    function blocking() { return stack.length > 0 || modals.length > 0; }
    function notify() { if (host.onBlock) host.onBlock(blocking(), api.current()); }
    function render(keep) {
      var top = stack.length ? stack[stack.length - 1] : null;
      Object.keys(screens).forEach(function (k) { screens[k].classList.toggle('open', !!top && top.name === k); });
      var hudOn = !blocking();
      hudEl.style.display = hudOn ? '' : 'none';
      if (top && !keep) {
        var d = builders[top.name](top.data || {});
        var f = screens[top.name].querySelector('[data-focus]');
        if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 0);
        return d;
      }
    }
    api.current = function () { return stack.length ? stack[stack.length - 1].name : (modals.length ? 'modal' : null); };
    api.open = function (name, data) { stack.push({ name: name, data: data }); render(); notify(); };
    api.openRoot = function (name, data) { stack = [{ name: name, data: data }]; render(); notify(); };
    api.back = function () { if (stack.length) { stack.pop(); render(); notify(); } };
    api.closeAll = function () { stack = []; closeModals(); render(); notify(); };
    api.blocking = blocking;
    api.hasBack = function () { var c = api.current(); return c && c !== 'title' && c !== 'results' && c !== 'pause'; };
    function popTo(name) { while (stack.length && stack[stack.length - 1].name !== name) stack.pop(); }

    // ---------- modals ----------
    function modal(cls) { var m = h('div', 'u-modal ' + (cls || ''), wrap); return m; }
    function openModal(m) { m.classList.add('open'); if (modals.indexOf(m) < 0) modals.push(m); hudEl.style.display = 'none'; notify(); }
    function closeModal(m) { m.classList.remove('open'); var i = modals.indexOf(m); if (i >= 0) modals.splice(i, 1); render(true); notify(); }
    function closeModals() { modals.slice().forEach(function (m) { m.classList.remove('open'); }); modals = []; }

    // ---------- how-to ----------
    var builders = {};
    screen('howto', 'has-tide');
    builders.howto = function (d) {
      var s = clear(screens.howto);
      function done() { store.flags.howto = true; host.save(); if (d.startSeed != null) host.start(d.startSeed); else api.back(); }
      head(s, 'How to play', function () { store.flags.howto = true; host.save(); if (d.startSeed != null) api.back(); else api.back(); });
      h('div', 'u-sub', s, 'step from moon to moon, ahead of the tide');
      var body = h('div', 'u-body', s);
      [['Hold', 'Press and hold. A gold ring charges as the pearl gathers power.'], ['Aim', 'Drag to bend the dotted arc. The silver ring marks where you would land.'], ['Release', 'Let go to launch. Catch the next moon’s pull and keep climbing.']].forEach(function (x, i) {
        var c = h('div', 'u-step', body); h('span', 'n u-num', c, String(i + 1));
        var t = h('div', null, c); h('b', null, t, x[0]); h('p', null, t, x[1]);
        h('div', 'u-gap', body);
      });
      var r1 = h('div', 'u-rule', body); h('b', null, r1, 'Flick'); r1.appendChild(document.createTextNode('Quick flick reverses your orbit direction.'));
      var r2 = h('div', 'u-rule v', body); h('b', null, r2, 'Drag down'); r2.appendChild(document.createTextNode('Drag back below your thumb to cancel the shot.'));
      var f = h('div', 'u-foot', s);
      var g = btn(f, 'Got it', 'primary', done); g.setAttribute('data-focus', '1');
      h('div', 'u-tide', s, 'hold · aim · release');
    };

    // ---------- title ----------
    var installSheet = null;
    function canInstall() { return host.installState && host.installState(); }
    screen('title', 'u-title');
    builders.title = function () {
      var s = clear(screens.title);
      var th = h('div', 'u-th', s);
      h('div', 'eb', th, 'a climb by moonlight');
      h('h1', null, th, 'Moonstep');
      h('div', 'u-dot', th);
      var g = btn(s, '', 'circ u-gear', function () { api.open('settings'); }, { icon: 'gear', aria: 'Settings' });
      var best = host.bestOverall();
      var bc = h('div', 'u-bestchip', s);
      if (best.h > 0) {
        seal(bc, best.medal, 26);
        h('span', 'u-cap', bc, 'best'); h('b', null, bc, fmt(best.h)); h('i', 'u-cap', bc, 'm');
        if (best.medal) h('span', 'u-cap', bc, '· ' + best.medal);
      } else { bc.classList.add('empty'); h('span', 'u-cap', bc, 'no climb yet'); }
      var is = canInstall();
      if (is && !store.flags.installDismissed) {
        var chip = h('div', 'u-chip', s);
        var o = h('button', null, chip, 'Add Moonstep to your home screen'); o.type = 'button';
        o.addEventListener('click', function () { openInstall(); });
        var x = h('button', 'x', chip, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss');
        x.addEventListener('click', function () { store.flags.installDismissed = true; host.save(); builders.title(); });
      }
      var art = h('div', null, s); art.style.cssText = 'flex:1;min-height:0;display:flex'; art.innerHTML = ART;
      var m = h('div', 'u-menu', s);
      var sr = h('div', 'u-seedrow', m);
      var lb = h('label', null, sr, 'seed'); lb.setAttribute('for', 'u-seed');
      var fld = h('div', 'u-field', sr);
      var inp = h('input', null, fld); inp.id = 'u-seed'; inp.maxLength = 24; inp.value = host.seed(); inp.spellcheck = false; inp.autocomplete = 'off';
      inp.setAttribute('aria-label', 'Seed');
      btn(sr, '', 'circ', function () { inp.value = host.randSeed(); }, { icon: 'dice', aria: 'New random seed' });
      function go() { var v = (inp.value || '').trim().slice(0, 24); host.setLastSeed && host.setLastSeed(v); api.startFlow(v || host.randSeed()); }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); e.stopPropagation(); });
      var cl = btn(m, 'Climb', 'primary', go, { icon: 'play' });
      var pr = h('div', 'u-pair', m);
      var dd = host.dailyInfo();
      btn(pr, 'Daily seed', 'stack', function () { api.startFlow(dd.seed); }, { sub: dd.done != null ? 'done · ' + fmt(dd.done) + ' m' : dateLabel() });
      btn(pr, 'Records', 'stack', function () { api.open('records', { tab: 'best' }); }, { sub: 'last 20' });
      btn(m, 'How to play', 'ghost', function () { api.open('howto', {}); }, { icon: 'book' });
      h('div', 'u-tide', s).innerHTML = '<span class="u-num">v0.1</span> &nbsp;·&nbsp; ?seed= shares a climb';
    };
    api.startFlow = function (seed) {
      if (!store.flags.howto) api.open('howto', { startSeed: seed });
      else host.start(seed);
    };

    // ---------- install ----------
    var imodal = modal('bottom');
    function openInstall() {
      clear(imodal);
      var st = host.installState();
      var sh = h('div', 'u-sheet', imodal);
      sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Install');
      h('div', 'u-appico', sh);
      h('h3', null, sh, 'Keep Moonstep');
      h('p', null, sh, 'on your home screen. Plays offline, opens full screen.');
      if (st === 'ios') h('p', null, sh, 'Tap Share, then Add to Home Screen.');
      else h('p', null, sh, 'Android or desktop: use the button below.');
      if (st !== 'ios') btn(sh, 'Install', 'primary', function () { closeModal(imodal); host.install(); });
      btn(sh, st === 'ios' ? 'Got it' : 'Not now', 'ghost', function () { closeModal(imodal); if (st === 'ios') { store.flags.installDismissed = true; host.save(); } if (stack.length && stack[stack.length - 1].name === 'title') builders.title(); });
      openModal(imodal);
    }
    imodal.addEventListener('click', function (e) { if (e.target === imodal) closeModal(imodal); });

    // ---------- settings ----------
    screen('settings');
    var confirmM = modal();
    builders.settings = function () {
      var s = clear(screens.settings);
      head(s, 'Settings', function () { api.back(); });
      var body = h('div', 'u-body', s);
      row(body, 'Sound', 'chimes, tide, medals', store.set.sound, function (v) { host.setSet('sound', v); });
      row(body, 'Assist arc', 'dotted line to where you land', store.set.assist, function (v) { host.setSet('assist', v); });
      var tc = h('div', 'u-card', body);
      h('b', null, tc, 'Tide speed'); var sb = h('div', 'u-cap', tc, 'how fast the dark rises (next run)'); sb.style.margin = '2px 0 8px';
      seg(tc, store.set.tide, function (v) { host.setSet('tide', v); });
      row(body, 'Reduce motion', 'no pulses, no ripples', !!store.set.reduce, function (v) { host.setSet('reduce', v); });
      var rs = btn(body, 'Reset best scores and history', 'danger', function () { openConfirm(); });
      rs.style.width = '100%';
      var f = h('div', 'u-foot', s);
      btn(f, 'Done', 'primary', function () { api.back(); });
    };
    function openConfirm() {
      clear(confirmM);
      var sh = h('div', 'u-sheet', confirmM);
      sh.setAttribute('role', 'alertdialog'); sh.setAttribute('aria-label', 'Confirm reset');
      h('h3', null, sh, 'Wipe the ink?');
      h('div', 'u-dot', sh);
      h('p', null, sh, 'All best-by-seed scores and the last 20 attempts will be erased. Settings stay.');
      btn(sh, 'Erase everything', 'verm', function () { host.reset(); closeModal(confirmM); });
      var keep = btn(sh, 'Keep my scores', 'primary', function () { closeModal(confirmM); });
      openModal(confirmM);
      setTimeout(function () { try { keep.focus(); } catch (e) {} }, 0);
    }

    // ---------- pause ----------
    screen('pause', 'dim u-pause');
    builders.pause = function () {
      var s = clear(screens.pause);
      var card = h('div', 'u-paper', s);
      h('h2', null, card, 'Paused'); h('div', 'u-dot', card);
      var st = host.runInfo();
      var at = h('div', 'at', card); h('i', null, at, 'at '); h('b', null, at, fmt(st.h)); at.appendChild(document.createTextNode(' m' + (st.medal ? ' · ' + st.medal : '')));
      var body = h('div', 'u-body', card);
      row(body, 'Assist arc', 'dotted aim line', store.set.assist, function (v) { host.setSet('assist', v); });
      row(body, 'Sound', 'chimes and tide', store.set.sound, function (v) { host.setSet('sound', v); });
      h('div', 'u-lab', body, 'Tide speed (next run)');
      seg(body, store.set.tide, function (v) { host.setSet('tide', v); });
      h('div', 'u-lab', body, 'Seed');
      var sr = h('div', 'u-seedrow', body); sr.style.marginBottom = '8px';
      var fld = h('div', 'u-field', sr);
      var inp = h('input', null, fld); inp.maxLength = 24; inp.value = host.seed(); inp.spellcheck = false; inp.setAttribute('aria-label', 'Seed'); inp.autocomplete = 'off';
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
      var cb = btn(sr, '', 'circ', function () { host.copyText(inp.value); cb.firstChild.innerHTML = ICONS.check; setTimeout(function () { cb.firstChild.innerHTML = ICONS.copy; }, 1200); }, { icon: 'copy', aria: 'Copy seed' });
      var dd = host.dailyInfo();
      btn(body, 'Daily seed', 'sm', function () { host.start(dd.seed); }, { icon: 'cal', sub: dateLabel() }).style.width = '100%';
      var f = h('div', 'u-foot', card);
      var rs = btn(f, 'Resume', 'primary', function () { host.resume(); }, { icon: 'play' }); rs.setAttribute('data-focus', '1');
      var pr = h('div', 'u-pair', f);
      btn(pr, 'Retry', null, function () { host.start((inp.value || '').trim().slice(0, 24) || host.seed()); }, { icon: 'retry' });
      btn(pr, 'Settings', null, function () { api.open('settings'); }, { icon: 'gear' });
      btn(f, 'Quit to menu', 'quiet', function () { host.quit(); });
    };

    // ---------- results ----------
    screen('results');
    builders.results = function (d) {
      var built = performance.now();
      var s = clear(screens.results);
      h('div', 'u-eyebrow', s, 'Run over');
      var c = h('div', 'u-card u-res', s);
      seal(c, d.medal, 96, d.newBest ? 'halo' : '');
      h('div', 'nm', c, d.medal || 'No medal yet');
      var ht = h('div', 'ht', c); h('b', 'u-num', ht, fmt(d.h)); h('i', null, ht, 'm');
      h('div', 'u-dot', c);
      h('div', 'u-cause' + (d.cause === 'tide' ? '' : ' lost'), c, d.cause === 'tide' ? 'Swallowed by the tide — the ink rose past you.' : 'Lost in space — you drifted out of every pull.');
      if (d.newBest) { h('div', 'u-stamp', c, 'New best'); h('div', 'u-prev', c, d.prev > 0 ? 'Previous ' + fmt(d.prev) + ' m on this seed' : 'First climb on this seed'); }
      else h('div', 'u-prev', c, 'Best on this seed ' + fmt(d.best) + ' m');
      var nx = d.next;
      var nm = h('div', 'u-nextm', c);
      if (nx) {
        var l = h('div', 'l', nm); h('span', null, l, 'Next: ' + nx.name); var r = h('span', null, l); h('b', null, r, fmt(nx.min - d.h)); r.appendChild(document.createTextNode(' m to go'));
        var bar = h('div', 'u-bar', nm); var fi = h('i', null, bar); fi.style.width = Math.max(2, Math.min(100, d.h / nx.min * 100)) + '%';
      } else if (d.medal && d.medal === (bands().slice(-1)[0] || {}).name) h('div', 'u-prev', nm, 'Every medal earned. The moon is yours.').style.paddingBottom = '4px';
      var ch = h('div', 'u-chips', s);
      var sc = h('span', 'u-chipb mono', ch); h('span', null, sc, d.seed);
      var dbg = false; try { dbg = /[?&]debug\b/.test(location.search); } catch (e) {}
      var vb = h('button', 'u-chipb', ch); vb.type = 'button'; vb.setAttribute('aria-label', 'Verify replay');
      var sr = h('span', 'u-sr', ch); // OK result stays in the DOM (screen readers, tests) but shows only with ?debug
      function vtxt() {
        clear(vb); clear(sr); var r = host.verify(); // null: run not finished, nothing to verify
        var show = !!r && (dbg || r === 'FAIL');
        vb.style.display = show ? '' : 'none';
        if (show) { h('span', null, vb, 'Replay:'); h('span', r === 'OK' ? 'ok' : 'bad', vb, r); }
        else if (r) sr.textContent = 'Replay: ' + r;
      }
      vb.addEventListener('click', function (e) { e.stopPropagation(); vtxt(); });
      vtxt();
      var f = h('div', 'u-foot', s); f.style.marginTop = '6px';
      var enable = [];
      var wait = Math.max(0, 600 - (performance.now() - (d.at || d.overAt || built)));
      enable.push(btn(f, 'Retry same seed', 'primary', function () { host.start(d.seed); }));
      var pr = h('div', 'u-pair', f);
      enable.push(btn(pr, 'New seed', null, function () { host.start(host.randSeed()); }));
      var cp = btn(pr, 'Copy report', null, function () { host.copyReport(function () { cp.firstChild.textContent = 'Copied'; setTimeout(function () { cp.firstChild.textContent = 'Copy report'; }, 1400); }); });
      enable.push(cp);
      enable.push(btn(f, 'All results ›', 'sm', function () { api.open('records', { tab: 'best', from: 'results' }); }));
      enable.forEach(function (b) { b.disabled = true; });
      function arm() { enable.forEach(function (b) { b.disabled = false; }); try { enable[0].focus(); } catch (e) {} }
      if (wait > 0) setTimeout(arm, wait); else { enable.forEach(function (b) { b.disabled = false; }); }
    };

    // ---------- records ----------
    screen('records');
    builders.records = function (d) {
      var s = clear(screens.records);
      var hd = head(s, d.tab === 'attempts' ? 'Attempts' : 'Best by seed', function () { api.back(); });
      var sp = hd.lastChild;
      var mb = btn(hd, 'Medals', 'circ lab', function () { api.open('medals', { from: d.from }); }, { icon: 'medal', aria: 'Medals' });
      hd.replaceChild(mb, sp);
      var tabs = h('div', 'u-tabs', s); tabs.setAttribute('role', 'tablist');
      [['best', 'Best by seed'], ['attempts', 'Attempts']].forEach(function (t) {
        var b = h('button', null, tabs); b.type = 'button'; b.setAttribute('role', 'tab'); h('span', null, b, t[1]);
        b.setAttribute('aria-selected', d.tab === t[0] ? 'true' : 'false');
        b.addEventListener('click', function () { if (d.tab !== t[0]) { stack[stack.length - 1].data.tab = t[0]; render(); } });
      });
      var fr = h('div', 'u-paper fit', s);
      var ul = h('div', 'u-list', fr);
      var f = h('div', 'u-foot', s);
      if (d.tab === 'attempts') {
        var at = store.attempts.slice().reverse();
        if (!at.length) h('div', 'u-empty', ul, 'No attempts yet. Climb a little and they will appear here.');
        var allTide = at.every(function (a) { return a.cause === 'tide'; });
        at.forEach(function (a, i) {
          var li = h('div', 'u-li', ul);
          h('span', 'ix', li, String(i + 1));
          seal(li, host.medalOf(a.height), 34);
          h('span', 'th u-num', li, fmt(a.height) + ' m');
          var m = h('div', 'm', li); h('b', null, m, a.seed); h('span', null, m, ago(a.ts));
          if (!allTide) h('span', 'u-tag' + (a.cause === 'tide' ? '' : ' lost'), li, a.cause === 'tide' ? 'tide' : 'lost');
        });
        var cp = btn(f, 'Copy report', 'primary', function () { host.copyReport(function () { cp.firstChild.textContent = 'Copied'; setTimeout(function () { cp.firstChild.textContent = 'Copy report'; }, 1400); }); });
      } else {
        var ks = Object.keys(store.best).sort(function (a, b) { return store.best[b] - store.best[a]; });
        if (!ks.length) h('div', 'u-empty', ul, 'No climbs yet. Your best height on every seed is kept here.');
        ks.forEach(function (k, i) {
          var li = h('button', 'u-li' + (i === 0 ? ' top' : ''), ul); li.type = 'button';
          seal(li, host.medalOf(store.best[k]), 38);
          var hh = h('span', 'h u-num', li, fmt(store.best[k])); h('i', null, hh, 'm');
          var m = h('div', 'm', li); var daily = /^D\d{8}$/.test(k);
          h('b', daily ? 'dly' : null, m, daily ? 'Daily ' + (+k.slice(7)) + ' ' + MONTHS[(+k.slice(5, 7) - 1) % 12] : k);
          var n = (store.cnt && store.cnt[k]) || 1;
          h('span', null, m, n + (n === 1 ? ' attempt' : ' attempts'));
          h('span', 'chev', li, '›');
          li.addEventListener('click', function () { host.start(k); });
        });
        if (ks.length) h('div', 'u-cap', f, 'Tap a seed to play it again').style.textAlign = 'center';
        var dd = host.dailyInfo();
        btn(f, 'Play daily seed', 'primary', function () { host.start(dd.seed); });
      }
    };

    // ---------- medal sheet ----------
    screen('medals');
    builders.medals = function (d) {
      var s = clear(screens.medals);
      head(s, 'Medals', function () { api.back(); }, 'close');
      h('div', 'u-sub', s, 'Climb past each height to earn a seal');
      var fr = h('div', 'u-paper', s); fr.style.flex = 'none';
      var bs = bands(), top = host.bestOverall(), bi = bandIdx(top.medal);
      bs.forEach(function (b, i) {
        var li = h('div', 'u-li' + (i === bi ? ' hl' : ''), fr);
        seal(li, b.name, 52, i > bi && bi >= 0 ? '' : (top.h <= 0 || i > bi ? 'locked' : ''));
        var m = h('div', 'm', li); h('b', null, m, b.name).style.cssText = 'font:700 21px Georgia,serif;letter-spacing:0';
        var n = (store.medals && store.medals[b.name]) || 0;
        var st = i === bi ? 'Best medal so far' : i < bi ? (n ? 'Earned ' + n + (n === 1 ? ' time' : ' times') : 'Earned') : i === bi + 1 ? fmt(b.min - top.h) + ' m to go' : 'Not yet reached';
        h('span', 'st', m, st);
        var th = h('span', 'th u-num', li, fmt(b.min)); h('i', null, th, ' m').style.cssText = 'font:italic 13px Georgia,serif';
      });
      h('div', 'u-sub', s, 'Heights are the same on every seed.').style.marginTop = '12px';
      h('div', null, s).style.flex = '1';
      var f = h('div', 'u-foot', s);
      btn(f, d.from === 'results' ? 'Back to results' : 'Back', 'primary', function () { api.back(); });
    };

    // ---------- report modal ----------
    var repM = modal(), repTa;
    api.showReport = function (txt) {
      clear(repM);
      var sh = h('div', 'u-sheet', repM);
      h('h3', null, sh, 'Report');
      h('p', null, sh, 'Clipboard blocked. Select all and copy.');
      repTa = h('textarea', null, sh); repTa.readOnly = true; repTa.value = txt;
      btn(sh, 'Close', 'primary', function () { closeModal(repM); });
      openModal(repM);
      setTimeout(function () { repTa.focus(); repTa.select(); }, 0);
    };

    // ---------- HUD ----------
    var hudEl = h('div', 'u-hud', wrap);
    var scrim = h('div', 'u-scrim', hudEl);
    var glow = h('div', 'u-glow', hudEl);
    var bP = btn(hudEl, '', 'circ p', function () { host.pause(); }, { icon: 'pause', aria: 'Pause' });
    var bC = btn(hudEl, '', 'circ c', function () { host.copyReport(function () { cbi.innerHTML = ICONS.check; setTimeout(function () { cbi.innerHTML = ICONS.copy; }, 1200); }); }, { icon: 'copy', aria: 'Copy report' });
    var cbi = bC.firstChild;
    var top = h('div', 'top', hudEl);
    var pill = h('div', 'u-pill', top), pH = h('b', 'u-num', pill), pM = h('i', null, pill, 'm'), pS = h('span', null, pill);
    var nxt = h('div', 'u-next', top), bar = h('div', 'u-bar', top), barF = h('i', null, bar); h('u', null, bar);
    var meta = h('div', 'u-meta', hudEl);
    var cL = h('div', 'u-beads', meta); h('span', null, cL, 'chain');
    var beads = []; for (var bi2 = 0; bi2 < 5; bi2++) beads.push(h('span', 'u-bead', cL));
    var cX = h('b', 'u-num', cL);
    var sd = h('div', null, meta); h('span', null, sd, 'seed '); var sdc = h('span', 'u-seedc', sd);
    var tchip = h('div', 'u-tchip', hudEl); var tArrow = h('span', 'u-i', tchip); tArrow.innerHTML = ICONS.down; var tTxt = h('span', null, tchip); var tNum = h('b', 'u-num', tchip);
    var padEl = h('div', 'u-thumb', hudEl); h('span', 'u-ring', padEl);
    var hint = h('div', 'u-hint', hudEl, 'hold · aim · release');
    var hk = '', tk = '', tyLast = -1;
    api.hud = function (d) {
      var key = [d.h, d.chain, d.seed, d.medal, d.next ? d.next.min : 0].join('|');
      if (key !== hk) {
        hk = key;
        pH.textContent = fmt(d.h);
        clear(pS); if (d.medal) seal(pS, d.medal, 28);
        clear(nxt);
        if (d.next) {
          nxt.appendChild(document.createTextNode('next · ')); h('b', null, nxt, d.next.name);
          nxt.appendChild(document.createTextNode(' ' + fmt(d.next.min) + ' m · +' + fmt(d.next.min - d.h) + ' m'));
          barF.style.width = Math.min(100, d.h / d.next.min * 100) + '%'; bar.style.display = '';
        } else { nxt.textContent = 'every medal earned'; bar.style.display = 'none'; }
        var n = Math.min(5, d.chain);
        beads.forEach(function (b, i) { b.className = 'u-bead' + (i < n ? ' on' : ''); });
        cX.textContent = d.chain > 0 ? '×' + d.chain : '';
        sdc.textContent = d.seed;
      }
      var warn = d.gap < 15, t = (warn ? 'Tide close ' : 'Tide rising ') + '|' + Math.max(0, Math.round(d.gap));
      if (t !== tk) {
        tk = t; tTxt.textContent = warn ? 'Tide close' : 'Tide rising'; tNum.textContent = Math.max(0, Math.round(d.gap)) + ' m';
        tchip.className = 'u-tchip' + (warn ? ' warn' : ''); glow.className = 'u-glow' + (warn ? ' on' : '');
      }
      hint.style.display = d.hint ? '' : 'none';
    };
    api.setReduced = function (on) { document.documentElement.classList.toggle('u-rm', !!on); };

    api.refresh = function () { if (stack.length) render(); };
    api.popTo = popTo;
    api.stackNames = function () { return stack.map(function (e) { return e.name; }); };
    render();
    return api;
  }
  root.MoonUI = { create: create };
})(typeof window !== 'undefined' ? window : this);
