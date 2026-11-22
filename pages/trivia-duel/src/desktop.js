// desktop.js: keyboard shortcuts + desktop key hints. No layout (CSS lives in desktop-*.css).
(function () {
  if (typeof document === 'undefined') return;
  var CSS = '.hc-keyhint{display:none}@media (min-width:900px) and (min-aspect-ratio:1/1){.hc-keyhint{display:block;text-align:center;font-size:13px;color:#cfc8ff;opacity:.85}}';
  function $(id) { return document.getElementById(id); }
  function vis(el) { return !!(el && el.offsetParent !== null && el.style.display !== 'none' && !el.disabled); }
  function active() { return document.querySelector('.screen.active'); }
  function typing() {
    var a = document.activeElement;
    if (!a) return false;
    var t = (a.tagName || '').toLowerCase();
    return t === 'input' || t === 'textarea' || t === 'select' || a.isContentEditable;
  }
  function click(el) { if (vis(el)) { el.click(); return true; } return false; }

  function hint(parent, after, text) {
    if (!parent || parent.querySelector('.hc-keyhint')) return;
    var d = document.createElement('div');
    d.className = 'hc-keyhint';
    d.textContent = text;
    if (after && after.parentNode === parent) parent.insertBefore(d, after.nextSibling);
    else parent.appendChild(d);
  }
  function inject() {
    var home = $('scr-home');
    if (home) hint(home, home.querySelector('.hc-duelrow'), 'Keys: ← → pick topic · Enter duel');
    var duel = $('scr-duel');
    if (duel) hint(duel, null, '1-4 or A-D to answer · Enter next');
  }
  var st = document.createElement('style');
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);

  var pending = false;
  function sched() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; inject(); }, 0);
  }
  function start() {
    inject();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].type === 'childList') {
            var t = muts[i].target;
            if (t.id === 'app' || (t.classList && t.classList.contains('screen'))) { sched(); return; }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (typing()) return;
    var scr = active(); if (!scr) return;
    var id = scr.id, k = e.key, K = k.length === 1 ? k.toUpperCase() : k, done = false;
    if (id === 'scr-home') {
      if (k === 'ArrowLeft') done = click($('btn-topic-prev'));
      else if (k === 'ArrowRight') done = click($('btn-topic-next'));
      else if (k === 'Enter') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.id !== 'btn-play') return; done = click($('btn-play')); }
      else if (K === 'G') done = click($('btn-gender'));
    } else if (id === 'scr-duel') {
      var n = '1234'.indexOf(k); if (n < 0) n = 'ABCD'.indexOf(K);
      if (n >= 0 && k.length === 1) {
        var btns = scr.querySelectorAll('.btn-ans'), vb = [];
        for (var i = 0; i < btns.length; i++) if (btns[i].offsetParent !== null) vb.push(btns[i]);
        if (vb[n]) { vb[n].click(); done = true; }
      } else if (k === 'Enter' || k === ' ') done = click($('btn-next'));
    } else if (id === 'scr-wager') {
      var tb = scr.querySelectorAll('.btn-wtopic');
      if (k === 'Enter' || k === ' ') { var b = scr.querySelector('.btn-mult.sel') || $('btn-x1'); done = click(b); }
      else if (k === '1' || k === '2') done = click($(k === '1' ? 'btn-x1' : 'btn-x2')) ;
    } else if (id === 'scr-result') {
      if (K === 'R') done = click($('btn-rematch'));
      else if (K === 'H' || k === 'Escape') done = click($('btn-home'));
    } else if (id === 'scr-vs') {
      if (k === 'Enter' || k === ' ') { var sk = scr.querySelector('button'); done = click(sk); }
    }
    if (done) e.preventDefault();
  });
})();
