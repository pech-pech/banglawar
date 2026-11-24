// PGS shared update helper (pgs-update-1). See CONTRACT-pwa-update.md section 4.
// Registers sw.js, shows the build badge, reloads or toasts when a newer build is found.
(function () {
  'use strict';
  try {
    var PLACEHOLDER = '__PGS_BUILD__';
    var BUILD = 'dev';
    try {
      var m = document.querySelector('meta[name=pgs-build]');
      if (m && m.content) BUILD = m.content;
    } catch (_) {}
    window.PGS_BUILD = BUILD;

    // admin default values; games may override via window.PGS_UPDATE_CFG
    var CFG = Object.assign({ autoReloadWindowMs: 15000, hiddenReloadMs: 300000, pollMs: 900000 },
      window.PGS_UPDATE_CFG || {});
    var state = { reg: null, newBuild: null, toast: false, reloads: 0 };
    var loadedAt = Date.now();
    var hiddenAt = 0;
    var hiddenLong = false;
    var hadController = false;
    var swTimer = null;

    // ---- build badge ----
    function paint() {
      try {
        var els = document.querySelectorAll('[data-pgs-build]');
        var t = 'build ' + BUILD;
        for (var i = 0; i < els.length; i++) if (els[i].textContent !== t) els[i].textContent = t;
      } catch (_) {}
    }
    try {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
      else paint();
      if (window.MutationObserver) {
        // Stays alive for the whole session (games redraw headers late). Cheap: one paint per frame,
        // and paint() only writes when text differs, so our own edits do not loop.
        var queued = false;
        var later = window.requestAnimationFrame ? function (f) { requestAnimationFrame(f); } : function (f) { setTimeout(f, 50); };
        var mo = new MutationObserver(function () {
          if (queued) return;
          queued = true;
          later(function () { queued = false; paint(); });
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
      }
    } catch (_) {}

    // ---- toast ----
    function reload() { try { location.reload(); } catch (_) {} }
    function showToast() {
      try {
        if (state.toast || document.getElementById('pgs-update-toast')) return;
        if (!document.body) { document.addEventListener('DOMContentLoaded', showToast); return; }
        state.toast = true;
        var box = document.createElement('div');
        box.id = 'pgs-update-toast';
        box.setAttribute('role', 'status');
        box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom));' +
          'z-index:2147483647;display:flex;align-items:center;gap:8px;padding:4px 4px 4px 14px;border-radius:12px;' +
          'background:rgba(17,17,17,.92);color:#fff;font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
          'box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:calc(100vw - 24px)';
        var txt = document.createElement('span');
        txt.textContent = 'New version ready';
        var btn = document.createElement('button');
        btn.id = 'pgs-update-reload';
        btn.type = 'button';
        btn.textContent = 'Reload';
        btn.style.cssText = 'min-width:44px;min-height:44px;padding:0 14px;border:0;border-radius:8px;background:#fff;' +
          'color:#111;font:600 14px system-ui,sans-serif;cursor:pointer';
        btn.addEventListener('click', reload);
        var x = document.createElement('button');
        x.id = 'pgs-update-dismiss';
        x.type = 'button';
        x.setAttribute('aria-label', 'Dismiss');
        x.textContent = '✕';
        x.style.cssText = 'min-width:44px;min-height:44px;border:0;background:transparent;color:#fff;font:16px system-ui,sans-serif;cursor:pointer';
        x.addEventListener('click', function () {
          try { box.remove(); } catch (_) {}
          state.toast = false;
        });
        box.appendChild(txt); box.appendChild(btn); box.appendChild(x);
        document.body.appendChild(box);
      } catch (_) {}
    }

    // ---- reload / decide ----
    function reloadOnce() {
      try {
        var k = 'pgs-reloaded-' + (state.newBuild || 'sw');
        var done = false;
        try { done = !!sessionStorage.getItem(k); } catch (_) {}
        if (done) { showToast(); return; }
        try { sessionStorage.setItem(k, '1'); } catch (_) {}
        state.reloads++;
        location.reload();
      } catch (_) {}
    }
    function decide() {
      try {
        if (swTimer) { clearTimeout(swTimer); swTimer = null; }
        if (Date.now() - loadedAt < CFG.autoReloadWindowMs || hiddenLong) reloadOnce();
        else showToast();
      } catch (_) {}
    }

    // ---- service worker ----
    var swOk = false;
    try { swOk = ('serviceWorker' in navigator) && window.isSecureContext; } catch (_) {}
    if (swOk) {
      try { hadController = !!navigator.serviceWorker.controller; } catch (_) {}
      try {
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (hadController) decide();
          hadController = true; // after first install the controller is ours
        });
      } catch (_) {}
      try {
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
          state.reg = reg;
        }).catch(function () {});
      } catch (_) {}
    }

    // ---- check ----
    function check() {
      var p = Promise.resolve();
      try {
        if (state.reg) p = p.then(function () { return state.reg.update(); }).catch(function () {});
        p = p.then(function () {
          return fetch('version.json', { cache: 'no-store' }).then(function (r) { return r.json(); });
        }).then(function (j) {
          var b = j && j.build;
          if (!b || b === BUILD || BUILD === PLACEHOLDER || BUILD === 'dev') return;
          state.newBuild = b;
          var reg = state.reg;
          if (reg && reg.waiting) { try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {} }
          var hasSw = swOk && (navigator.serviceWorker.controller || (reg && (reg.active || reg.installing || reg.waiting)));
          if (!hasSw) { decide(); return; }
          // SW should swap and fire controllerchange; if not within 8 s, ask the user.
          if (!swTimer) swTimer = setTimeout(function () { swTimer = null; showToast(); }, 8000);
        }).catch(function () {});
      } catch (_) {}
      return p;
    }

    // ---- triggers ----
    try {
      document.addEventListener('visibilitychange', function () {
        try {
          if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
          hiddenLong = !!hiddenAt && (Date.now() - hiddenAt >= CFG.hiddenReloadMs);
          hiddenAt = 0;
          check();
        } catch (_) {}
      });
      window.addEventListener('online', function () { check(); });
      window.addEventListener('load', function () { check(); });
      setInterval(check, CFG.pollMs);
    } catch (_) {}

    window.PGS_UPDATE = { build: BUILD, check: check, state: state, showToast: showToast };
  } catch (_) {}
})();
