/* Chart school calibration shim (browser init script, passed to the gate via --shim).
 * Defines window.__test from OUTSIDE the app (pages/chart-school is not gated and is never edited):
 *   ready    Promise: resolves when document.body.dataset.screen is set (app booted)
 *   states() fixed-order list, discovered once per page by a dry replay (seed 1):
 *            desk, reading-<type> / marked-<type> for the first reads, call, outcome-mid,
 *            outcome-end, summary, plus a second chart's reads (types vary by seed order)
 *   goto(n)  restarts with the app's own newRun(seed) + go('desk'), then replays UI clicks
 *            (open-sheet, answer, submit, next, horizon, Buy, confirm-call, advance, finish)
 *            until state n is reached. No reload, no localStorage clearing.
 *   seed(n)  remembers n; newRun(n + 38) is used (offset picks a seed whose charts include the Support read).
 * CALIBRATION-ONLY TAGGING: a MutationObserver adds data-layout="mark" to X/O glyphs
 * (svg[data-cell] circle and path: the X and O glyphs) and data-layout="fill" to each
 * P&F chart svg and its direct wrapper, so text-over-mark and fill-empty run on an app
 * that carries no tags. A real gated game must author these tags itself.
 */
(function () {
  'use strict';
  var seedV = 1, cache = null;
  // admin default: gate seeds with 1; app seed 39 is the first seed whose 2 charts cover R2 (support), R2b, R6, R7, S1, S2 (needed to show the PR 126 support label).
  var SEED_BASE = 38;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var raf2 = function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); };
  var vis = function (e) { return !!e && !e.closest('[hidden]') && (e.offsetWidth > 0 || e.offsetHeight > 0 || e.getClientRects().length > 0); };
  function q(sel) { var l = document.querySelectorAll(sel); for (var i = 0; i < l.length; i++) if (vis(l[i])) return l[i]; return null; }
  async function act(n) {
    var e = null;
    for (var i = 0; i < 60 && !(e = q('[data-act="' + n + '"]')); i++) await sleep(50);
    if (!e) throw new Error('shim: no [data-act=' + n + '] visible (screen=' + document.body.dataset.screen + ')');
    e.click(); await raf2(); await sleep(30);
  }
  var scr = function () { return document.body.dataset.screen; };
  function curType() { try { return window.curRead().type; } catch (e) { return 'x'; } }

  // Walk the app from a fresh run; onState(name) returns true to stop. Max 2 charts (~16 states, bounded time).
  async function drive(onState) {
    if (typeof window.newRun === 'function') window.newRun(seedV + SEED_BASE);
    if (typeof window.go === 'function') window.go('desk');
    if (typeof window.render === 'function') window.render();
    await raf2();
    if (await onState('desk')) return;
    for (var c = 0; c < 2; c++) {
      await act('open-sheet');
      for (var i = 0; i < 3; i++) {
        var ty = curType();
        if (await onState('reading-' + ty)) return;
        var opt = q('#main [data-opt]');
        if (opt) { opt.click(); await raf2(); } else await act('step-up');
        await act('submit');
        if (await onState('marked-' + ty)) return;
        await act('next');
      }
      var h = document.getElementById('horizon');
      if (h) { h.value = '6'; h.dispatchEvent(new Event('input', { bubbles: true })); }
      var buy = q('#main [data-opt="Buy"]'); if (buy) { buy.click(); await raf2(); }
      if (await onState(c ? 'call-2' : 'call')) return;
      await act('confirm-call');
      var g = 0;
      while (scr() === 'outcome' && !q('[data-act="finish"]') && g++ < 12) {
        if (g === 3 && !c && await onState('outcome-mid')) return;
        await act('advance');
      }
      if (await onState(c ? 'outcome-end-2' : 'outcome-end')) return;
      await act('finish');
      if (scr() === 'runend') { if (await onState('runend')) return; break; }
      if (await onState(c ? 'summary-2' : 'summary')) return;
    }
  }

  function tag() {
    try {
      document.querySelectorAll('svg[data-cell]').forEach(function (s) {
        if (s.getAttribute('data-layout') !== 'fill') s.setAttribute('data-layout', 'fill');
        var p = s.parentElement;
        if (p && p.id !== 'main' && p.tagName !== 'BODY' && !p.getAttribute('data-layout')) p.setAttribute('data-layout', 'fill');
        s.querySelectorAll('circle, path').forEach(function (m) {
          if (!m.getAttribute('data-layout')) m.setAttribute('data-layout', 'mark');
        });
      });
    } catch (e) {}
  }
  function startTagging() {
    tag();
    new MutationObserver(tag).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startTagging); else startTagging();

  var ready = new Promise(function (res) {
    (function w() { if (document.body && document.body.dataset.screen && typeof window.newRun === 'function') res(true); else setTimeout(w, 50); })();
  });

  window.__test = {
    ready: ready,
    seed: function (n) { seedV = (n | 0) || 1; cache = null; },
    states: async function () {
      await ready;
      if (cache) return cache.slice();
      var names = [];
      await drive(function (n) { names.push(n); return false; });
      cache = names.filter(function (n, i) { return names.indexOf(n) === i; });
      return cache.slice();
    },
    goto: async function (name) {
      await ready;
      var hit = false;
      await drive(function (n) { if (n === name) { hit = true; return true; } return false; });
      if (!hit) throw new Error('shim: state not reached: ' + name);
      await raf2();
    }
  };
})();
