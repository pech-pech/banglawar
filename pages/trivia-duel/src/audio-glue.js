var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
// audio-glue.js: wires TD.audio to the UI (screens, hooks, mute button). Loaded last. Never throws.
(function () {
  var attached = false, wanted = null, lastScreen = '', unlocked = false;
  var lastSec = null, wagerCued = false, btn = null;

  function A() { return TD.audio || null; }
  function safe(fn) { try { return fn(); } catch (e) {} }
  function play(n, o) { safe(function () { if (A() && A().play) A().play(n, o); }); }
  function levels() { safe(function () { if (A() && TD.tweak) A().setLevels(TD.tweak.cfg); }); }

  function setBgm(mode) {
    wanted = mode;
    if (unlocked) safe(function () { A().bgm(mode); });
  }

  function onUnlockGesture() {
    if (unlocked) return;
    unlocked = true;
    safe(function () { A().unlock(); });
    levels();
    safe(function () { A().bgm(wanted); });
  }

  function activeScreen() {
    var el = document.querySelector('#app .screen.active');
    return el ? el.id : '';
  }

  function resultKind() {
    var r = safe(function () { return TD.tweak.lastState.result; });
    if (r === 'win') return 'win';
    if (r === 'draw') return 'draw';
    return 'lose';
  }

  function onScreen() {
    var id = activeScreen();
    if (!id || id === lastScreen) return;
    var prev = lastScreen;
    lastScreen = id;
    if (id !== 'scr-wager') wagerCued = false;
    if (id === 'scr-home' || id === 'scr-settings' || id === 'scr-vs') {
      setBgm('menu');
      if (id === 'scr-vs' && prev !== 'scr-vs') play('vs');
    } else if (id === 'scr-duel' || id === 'scr-wager') {
      setBgm('duel');
    } else if (id === 'scr-result') {
      wanted = null;
      safe(function () { if (unlocked) A().stopBgm(0.4); });
      var k = resultKind();
      safe(function () { if (TD.music && TD.music.sting) TD.music.sting(k); });
      play(k);
    }
  }

  function wrap(obj, name, before, after) {
    var orig = obj && obj[name];
    if (typeof orig !== 'function' || orig.__audioWrapped) return;
    var w = function () {
      var args = arguments;
      if (before) safe(function () { before.apply(null, args); });
      var r = orig.apply(this, args);
      if (after) safe(function () { after.apply(null, args); });
      return r;
    };
    w.__audioWrapped = true;
    obj[name] = w;
  }

  function wrapHooks() {
    var ui = TD.ui;
    if (!ui) return;
    wrap(ui, 'renderQuestion', function () { lastSec = null; play('qstart'); });
    wrap(ui, 'renderReveal', function (st, info) {
      info = info || {};
      play(info.pos < 0 ? 'timeout' : (info.pRight ? 'correct' : 'wrong'));
      if (info.pPts > 0) play('pointsUp', { big: info.pPts >= 70 });
    });
    wrap(ui, 'renderRivalAnswered', function () { play('rivalSeal'); });
    wrap(ui, 'renderTimer', function (frac, secLeft) {
      if (typeof secLeft !== 'number') return;
      var f = Math.floor(secLeft);
      if (f !== lastSec) {
        var prevSec = lastSec;
        lastSec = f;
        if (prevSec !== null && secLeft <= 5 && secLeft > 0) play('tick', { urgent: secLeft <= 2 });
      }
    });
    wrap(ui, 'renderWager', function () {
      if (!wagerCued) { wagerCued = true; play('wager'); }
    });
  }

  function iconText() {
    var c = safe(function () { return TD.tweak.cfg; }) || {};
    return (c.musicOn || c.sfxOn) ? '🔊' : '🔇';
  }
  function refreshBtn() {
    if (!btn) return;
    var on = iconText() === '🔊';
    btn.textContent = iconText();
    btn.setAttribute('aria-label', 'Sound ' + (on ? 'on' : 'off'));
  }

  function wrapTweak() {
    var tw = TD.tweak;
    if (!tw || typeof tw.set !== 'function' || tw.set.__audioWrapped) return;
    var orig = tw.set;
    var w = function () {
      var r = orig.apply(this, arguments);
      levels();
      refreshBtn();
      return r;
    };
    w.__audioWrapped = true;
    tw.set = w;
  }

  function addButton() {
    if (document.getElementById('btn-audio')) return;
    var st = document.createElement('style');
    st.textContent = '#btn-audio{position:fixed;bottom:calc(env(safe-area-inset-bottom,0px) + 2px);right:2px;z-index:9999;' +
      'min-width:32px;min-height:32px;width:32px;height:32px;border-radius:16px;border:1px solid rgba(255,255,255,.35);' +
      'background:rgba(20,16,30,.65);color:#fff;font-size:15px;line-height:1;padding:0;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent}#btn-audio:active{transform:scale(.94)}';
    document.head.appendChild(st);
    btn = document.createElement('button');
    btn.id = 'btn-audio';
    btn.type = 'button';
    btn.addEventListener('click', function () {
      var c = TD.tweak.cfg;
      var on = (c.musicOn || c.sfxOn) ? 0 : 1;
      TD.tweak.set('musicOn', on);
      TD.tweak.set('sfxOn', on);
    });
    document.body.appendChild(btn);
    refreshBtn();
  }

  function attach() {
    if (attached) return;
    attached = true;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var muted = safe(function () { return /[?&]mute=1(&|$)/.test(location.search); });
    if (muted || !A()) return;
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, onUnlockGesture, { capture: true, once: true });
    });
    wrapTweak();
    wrapHooks();
    safe(addButton);
    levels();
    var app = document.getElementById('app');
    if (app && typeof MutationObserver !== 'undefined') {
      new MutationObserver(onScreen).observe(app, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    onScreen();
    var x2 = document.getElementById('btn-x2');
    // delegated clicks (btn-x2 is built later, so delegate)
    document.addEventListener('click', function (e) {
      safe(function () {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#btn-audio')) return;
        if (t.closest('#btn-x2')) play('wagerX2');
        if (t.closest('.btn-ans')) play('select');
        else if (t.closest('.btn, .btn-topic, .swatch, button')) play('tap');
      });
    }, true);
    void x2;
  }

  TD.audioGlue = { version: 'td-audio-1', attach: attach };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
    else attach();
  }
})();
if (typeof module !== 'undefined') module.exports = TD.audioGlue;
