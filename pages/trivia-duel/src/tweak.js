var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));

var tweak = (function () {
  var CFG_KEY = 'td.cfg', PRE_KEY = 'td.presets';

  function defaults() { return TD.DEFAULTS || {}; }
  function ls() { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; } }
  function load(key, fallback) {
    try { var s = ls(); var raw = s && s.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) { try { var s = ls(); if (s) s.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var cfg = {};
  (function init() {
    var d = defaults(), k;
    for (k in d) cfg[k] = d[k];
    var saved = load(CFG_KEY, {});
    if (saved && typeof saved === 'object') {
      for (k in saved) if (k in d && typeof saved[k] === 'number' && isFinite(saved[k])) cfg[k] = saved[k];
    }
  })();

  function diffs() {
    var d = defaults(), out = {}, k;
    for (k in d) if (cfg[k] !== d[k]) out[k] = cfg[k];
    return out;
  }
  function isDev() { return Object.keys(diffs()).length > 0; }

  function refreshBadge() {
    try {
      if (typeof document === 'undefined') return;
      var b = document.getElementById('dev-badge');
      if (b) { b.style.display = ''; b.classList.toggle('on', isDev()); }
    } catch (e) {}
  }

  function set(key, value) {
    var v = Number(value);
    if (!isFinite(v)) return;
    cfg[key] = v;
    save(CFG_KEY, diffs());
    refreshBadge();
  }

  function report(state) {
    state = state || {};
    var rivals = TD.RIVALS || [];
    var step = state.rivalStep, rname = '?';
    for (var i = 0; i < rivals.length; i++) if (rivals[i].step === step) rname = rivals[i].name;
    var df = diffs(), dk = Object.keys(df);
    var lines = [];
    lines.push('Build: ' + (TD.BUILD || '?') + '  PGS: ' + (window.PGS_BUILD || 'dev'));
    lines.push('Seed: ' + state.seed + '  Mode: ' + state.mode + '  ReadUpTo: ' + state.readUpTo);
    lines.push('Picked topic: ' + state.pickedTopic + '  Wager topic: ' + state.wagerTopic);
    lines.push('Rival: step ' + step + ' ' + rname);
    lines.push('Cfg diffs: ' + (dk.length ? dk.map(function (k) { return k + '=' + df[k]; }).join(', ') : 'none'));
    (state.log || []).forEach(function (e) {
      lines.push('Q' + e.n + ' ' + e.id + ' ' + e.tier + '/' + e.topic +
        ' | you ' + (e.pRight ? 'R' : 'W') + ' ' + fmt(e.pT) + 's ' + e.pPts +
        ' | rival ' + (e.rRight ? 'R' : 'W') + ' ' + fmt(e.rT) + 's ' + e.rPts);
    });
    lines.push('Mults: player x' + state.pMult + ', rival x' + state.rMult);
    lines.push('Scores: you ' + state.pScore + ', rival ' + state.rScore + ' -> ' + state.result);
    var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || 'n/a';
    var sz = (typeof window !== 'undefined' && window.innerWidth) ? (window.innerWidth + 'x' + window.innerHeight) : 'n/a';
    lines.push('UA: ' + ua);
    lines.push('Viewport: ' + sz);
    return lines.join('\n');
  }
  function fmt(t) { return (typeof t === 'number') ? t.toFixed(1) : String(t); }

  function copy(text) {
    function fallback() {
      return new Promise(function (resolve, reject) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          ok ? resolve() : reject(new Error('copy failed'));
        } catch (e) { reject(e); }
      });
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(fallback);
      }
    } catch (e) {}
    return fallback();
  }

  function encode(obj) {
    var json = JSON.stringify(obj);
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(json)));
    return Buffer.from(json, 'utf8').toString('base64');
  }
  function decode(code) {
    var json = (typeof atob === 'function') ? decodeURIComponent(escape(atob(code.trim()))) : Buffer.from(code.trim(), 'base64').toString('utf8');
    return JSON.parse(json);
  }

  function open(container, onChange) {
    if (typeof document === 'undefined' || !container) return;
    var d = defaults();
    var presets = load(PRE_KEY, {});
    function changed() { refreshBadge(); if (typeof onChange === 'function') onChange(cfg); }
    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    function btn(label, fn) {
      var b = el('button', 'btn small', label);
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    }
    function flash(b, msg) {
      var old = b.textContent; b.textContent = msg;
      setTimeout(function () { b.textContent = old; }, 1200);
    }
    function applyDiffs(df) {
      var k;
      for (k in d) cfg[k] = d[k];
      for (k in df) if (k in d && typeof df[k] === 'number' && isFinite(df[k])) cfg[k] = df[k];
      save(CFG_KEY, diffs());
    }

    function render() {
      container.innerHTML = '';
      var panel = el('div', 'tweak-panel');

      Object.keys(d).forEach(function (k) {
        var row = el('div', 'tweak-row');
        var lab = el('label', 'grow small', k);
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.step = Math.abs(d[k]) < 1 ? '0.01' : (Number.isInteger(d[k]) ? '1' : '0.5');
        inp.value = cfg[k];
        inp.setAttribute('inputmode', 'decimal');
        inp.addEventListener('change', function () {
          if (inp.value === '' || !isFinite(Number(inp.value))) { inp.value = cfg[k]; return; }
          set(k, inp.value);
          changed();
        });
        row.appendChild(lab); row.appendChild(inp);
        panel.appendChild(row);
      });

      panel.appendChild(btn('Reset all', function () {
        applyDiffs({}); changed(); render();
      }));

      var nameIn = document.createElement('input');
      nameIn.type = 'text'; nameIn.placeholder = 'Preset name'; nameIn.maxLength = 24;
      var r1 = el('div', 'tweak-row'); r1.appendChild(nameIn); panel.appendChild(r1);

      var r2 = el('div', 'tweak-row');
      r2.appendChild(btn('Save preset', function () {
        var n = nameIn.value.trim();
        if (!n) return;
        presets[n] = diffs(); save(PRE_KEY, presets); render();
      }));
      var cb = btn('Copy report', function () {
        copy(report(tweak.lastState)).then(function () { flash(cb, 'Copied'); }, function () { flash(cb, 'Failed'); });
      });
      r2.appendChild(cb);
      panel.appendChild(r2);

      Object.keys(presets).forEach(function (n) {
        var r = el('div', 'tweak-row');
        r.appendChild(el('span', 'grow small', n));
        r.appendChild(btn('Load', function () { applyDiffs(presets[n]); changed(); render(); }));
        r.appendChild(btn('Delete', function () { delete presets[n]; save(PRE_KEY, presets); render(); }));
        panel.appendChild(r);
      });

      var cc = btn('Copy preset code', function () {
        copy(encode(diffs())).then(function () { flash(cc, 'Copied'); }, function () { flash(cc, 'Failed'); });
      });
      panel.appendChild(cc);

      var ta = document.createElement('textarea');
      ta.rows = 2; ta.placeholder = 'Paste preset code';
      panel.appendChild(ta);
      var ap = btn('Apply code', function () {
        try { applyDiffs(decode(ta.value)); changed(); render(); } catch (e) { flash(ap, 'Bad code'); }
      });
      panel.appendChild(ap);

      container.appendChild(panel);
    }
    render();
  }

  return {
    cfg: cfg,
    isDev: isDev,
    set: set,
    open: open,
    diffs: diffs,
    lastState: null,
    report: report,
    copy: copy
  };
})();

TD.tweak = tweak;
if (typeof module !== 'undefined') module.exports = tweak;
