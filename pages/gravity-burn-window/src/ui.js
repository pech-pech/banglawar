// Burn Window UI: DOM overlay screens (title, how-to, pause, settings, best times, run end, sector result panels).
// Exposes BW.ui. game.js sets BW.ui.host = {...} (see HOST below) and reads BW.ui.settings. No sim/render access.
// Look: UI-TOKENS (brass chart). Every target >= 56 px. Reduced motion: no animation anywhere.
(function () {
  'use strict';
  const BW = window.BW = window.BW || {};
  const KEY = 'bw_settings', HOWTO_KEY = 'bw_howto_seen';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const DEF = { reduced: false, haptics: true, drag: true, warp: true, seedMode: 'daily', customSeed: '' };
  const settings = Object.assign({}, DEF);
  try { const o = JSON.parse(lsGet(KEY) || 'null'); if (o && typeof o === 'object') for (const k in DEF) if (typeof o[k] === typeof DEF[k]) settings[k] = o[k]; } catch (e) {}
  function setSetting(k, v) { settings[k] = v; lsSet(KEY, JSON.stringify(settings)); try { ui.host.onSettings && ui.host.onSettings(k, v); } catch (e) {} }

  // HOST (set by game.js): seed(), isDaily(), launch(), retry(btn,e), quit(), copy(btn), getMuted(), setMuted(b), getWarp(), setWarp(b),
  // status() -> {sector,count,fuel,par}, runSummary() -> {medal,eff,seed,rows:[{used,par}]}, bestList() -> [{i,fuel,par}],
  // ghostOn(i), setGhost(i,on), eraseSaves(), tick(), onSettings(k,v), nextBtn
  const ui = { settings: settings, set: setSetting, host: {}, stack: [] };
  let root = null, styleEl = null, curSec = null;
  const stackNames = () => ui.stack.map(s => s.name);

  const CSS = '.bwu{position:fixed;inset:0;z-index:30;background:#0a1214 radial-gradient(ellipse at 50% 40%,rgba(63,184,168,.06),rgba(0,0,0,.35));color:#e8e2cf;font:600 16px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums;touch-action:manipulation;overflow:hidden}' +
    '.bwu *{box-sizing:border-box;margin:0}.bwu canvas{position:absolute;inset:0;width:100%;height:100%;z-index:0}' +
    '.bwu .grid{position:absolute;inset:0;z-index:0;background-image:linear-gradient(rgba(201,162,74,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(201,162,74,.07) 1px,transparent 1px);background-size:34px 34px}' +
    '.bwu .scr{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));gap:12px}' +
    '.bwu .scroll{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:8px 8px 2px;touch-action:pan-y;-webkit-overflow-scrolling:touch}' +
    '.bwu .bot{display:flex;flex-direction:column;gap:10px;flex:none}' +
    '.bwu h1{font-size:34px;font-weight:700;letter-spacing:.04em;color:#c9a24a;text-align:center;line-height:1.1}.bwu h2{font-size:22px;font-weight:700;color:#e8d9a8}' +
    '.bwu .sub{color:#7d8a86;font-weight:600;font-size:14px}.bwu .lbl{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7d8a86}' +
    '.bwu .panel,.bwsec .panel{position:relative;background:rgba(16,32,36,.92);border:2px solid #c9a24a;border-radius:2px;padding:12px}' +
    '.bwu .panel i,.bwsec .panel i{position:absolute;width:8px;height:8px;border:0 solid #c9a24a}' +
    'i.c1{left:-6px;top:-6px;border-width:0 2px 2px 0!important}i.c2{right:-6px;top:-6px;border-width:0 0 2px 2px!important}i.c3{left:-6px;bottom:-6px;border-width:2px 2px 0 0!important}i.c4{right:-6px;bottom:-6px;border-width:2px 0 0 2px!important}' +
    '.bwu .btn,.bwsec .btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;height:56px;border-radius:8px;border:1px solid #c9a24a;background:#102024;color:#e8d9a8;font:700 16px system-ui,sans-serif;cursor:pointer;padding:0 12px;touch-action:manipulation}' +
    '.bwu .btn.p,.bwsec .btn.p{background:#3fb8a8;color:#0a1214;border-color:#3fb8a8}.bwu .btn.d{color:#d9694f;border-color:#d9694f}.bwu .btn[disabled]{opacity:.45}' +
    '.bwu .row{display:flex;gap:10px}.bwu .row>*{flex:1;min-width:0}' +
    '.bwu .tg{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:56px;padding:0 4px 0 12px;border:1px solid rgba(201,162,74,.35);border-radius:8px;background:rgba(16,32,36,.92);color:#e8d9a8;font:700 16px system-ui,sans-serif;text-align:left;cursor:pointer}' +
    '.bwu .tg small{display:block;color:#7d8a86;font-weight:600;font-size:14px}.bwu .tg em{font-style:normal;color:#3fb8a8;margin-right:4px}' +
    '.bwu .sw{flex:none;width:56px;height:56px;display:flex;align-items:center;justify-content:center}.bwu .sw b{width:48px;height:28px;border-radius:14px;border:1px solid #c9a24a;background:#102024;position:relative}' +
    '.bwu .sw b:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#7d8a86}' +
    '.bwu .on .sw b,.bwu .sw.on b{background:#3fb8a8;border-color:#3fb8a8}.bwu .on .sw b:after,.bwu .sw.on b:after{left:23px;background:#0a1214}' +
    '.bwu .seg{display:flex;border:1px solid #c9a24a;border-radius:8px;overflow:hidden}.bwu .seg button{flex:1;height:56px;border:0;background:#102024;color:#e8d9a8;font:700 16px system-ui,sans-serif;cursor:pointer}.bwu .seg .on{background:#3fb8a8;color:#0a1214}' +
    '.bwu input{width:100%;height:56px;border:1px solid #c9a24a;border-radius:8px;background:#0a1214;color:#e8d9a8;font:700 20px system-ui,sans-serif;letter-spacing:.1em;padding:0 12px}' +
    '.bwu .chip,.bwsec .chip{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 10px;border-radius:14px;font-size:14px;font-weight:700;border:1px solid}' +
    '.m-gold{color:#e6c04a;border-color:#e6c04a}.m-silver{color:#c0c8cc;border-color:#c0c8cc}.m-bronze{color:#b87333;border-color:#b87333}.m-none{color:#7d8a86;border-color:rgba(125,138,134,.5)}' +
    '.bwu .bt{display:flex;align-items:center;gap:10px;min-height:44px;border-bottom:1px solid rgba(201,162,74,.3)}.bwu .bt .n{width:22px;color:#c9a24a;font-size:20px;font-weight:700}.bwu .bt .v{flex:1}.bwu .bt .v{line-height:1.15}.bwu .bt .v b{display:block;font-size:17px}' +
    '.bwu .bt .g{flex:none;width:64px;height:56px;margin:-6px 0;border:0;background:none;color:#3fb8a8;font:700 12px system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer}.bwu .bt .g.off{color:#7d8a86}' +
    '.bwsec{position:fixed;left:0;right:0;z-index:9;padding:12px;pointer-events:auto;font:600 16px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums;color:#e8e2cf}.bwsec *{box-sizing:border-box;margin:0}' +
    '.bwsec h2{font-size:22px;font-weight:700}.bwsec .dim{color:#7d8a86;font-size:14px}.bwsec .teal{color:#3fb8a8}.bwsec .red{color:#d9694f}.bwsec .brass{color:#c9a24a}' +
    '@media (prefers-reduced-motion:reduce){.bwu *,.bwsec *{animation:none!important;transition:none!important}}';

  function h(tag, cls, text, kids) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (kids) kids.forEach(k => k && e.appendChild(k));
    return e;
  }
  function corners(p) { ['c1', 'c2', 'c3', 'c4'].forEach(c => p.appendChild(h('i', c))); return p; }
  function panel(kids, st) { const p = corners(h('div', 'panel', null, kids)); if (st) p.style.cssText = st; return p; }
  function btn(label, cls, fn) {
    const b = h('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.setAttribute('data-bw', '1');
    b.addEventListener('pointerdown', () => { b._d = (window.performance && performance.now) ? performance.now() : Date.now(); });
    b.addEventListener('click', e => { e.stopPropagation(); try { ui.host.tick && ui.host.tick(); } catch (x) {} fn(b, e); });
    return b;
  }
  function sw(on) { return h('span', 'sw' + (on ? ' on' : ''), null, [h('b')]); }
  // toggle row: get() -> bool, put(bool), optional valueText(bool)
  function toggle(label, sub, get, put, vt) {
    const b = h('button', 'tg' + (get() ? ' on' : '')); b.type = 'button'; b.setAttribute('data-bw', '1'); b.setAttribute('role', 'switch');
    const left = h('div', null, label); if (sub) left.appendChild(h('small', null, sub));
    const em = vt ? h('em', null, vt(get())) : null, s = sw(get());
    const right = h('div', null, null, [em, s]); right.style.cssText = 'display:flex;align-items:center';
    b.appendChild(left); b.appendChild(right); b.setAttribute('aria-checked', String(!!get()));
    b.addEventListener('click', e => {
      e.stopPropagation(); try { ui.host.tick && ui.host.tick(); } catch (x) {}
      put(!get()); const v = !!get();
      b.classList.toggle('on', v); s.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); if (em) em.textContent = vt(v);
    });
    return b;
  }
  function screen(kids, cls) { return h('div', 'scr' + (cls ? ' ' + cls : ''), null, kids); }

  // seeded starfield (same look as in-game bg)
  function stars(cv) {
    const w = innerWidth, hh = innerHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
    const x = cv.getContext('2d'); if (!x) return; x.scale(d, d);
    const r = BW.sim && BW.sim.mulberry32 ? BW.sim.mulberry32(42) : Math.random;
    for (let i = 0; i < 110; i++) { x.globalAlpha = 0.15 + r() * 0.4; x.fillStyle = r() < 0.2 ? '#c9a24a' : '#e8e2cf'; x.beginPath(); x.arc(r() * w, r() * hh, (0.5 + r() * 1.1) / 1.2, 0, 6.3); x.fill(); }
  }
  function ensure() {
    if (!styleEl) { styleEl = h('style', null, CSS); document.head.appendChild(styleEl); }
    if (!root) { root = h('div', 'bwu'); root.style.display = 'none'; document.body.appendChild(root); window.addEventListener('resize', () => { if (!ui.stack.length) return; const cv = root.querySelector('canvas'); if (cv) { const c = cv.getContext('2d'); try { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); stars(cv); } catch (e) {} } }); }
  }

  // ---- stack ----
  function render() {
    ensure();
    const top = ui.stack[ui.stack.length - 1];
    while (root.firstChild) root.removeChild(root.firstChild);
    if (!top) { root.style.display = 'none'; return; }
    const cv = h('canvas'); root.appendChild(cv); root.appendChild(h('div', 'grid'));
    try { stars(cv); } catch (e) {}
    root.appendChild(SCREENS[top.name](top.opts || {}));
    root.style.display = 'block';
    try { ui.host.onUi && ui.host.onUi(); } catch (e) {}
  }
  ui.show = function (name, opts) { ui.stack.push({ name: name, opts: opts, t: Date.now() }); render(); };
  ui.replace = function (name, opts) { ui.stack.pop(); ui.show(name, opts); };
  ui.back = function () { ui.stack.pop(); render(); };
  ui.closeAll = function () { ui.stack.length = 0; render(); };
  ui.open = function () { return ui.stack.length > 0; };
  ui.is = function (n) { return ui.stack.some(s => s.name === n); };
  // true when the sim must not run (everything but the run-end card)
  ui.blocking = function () { return ui.stack.some(s => s.name !== 'runend'); };
  ui.endStack = function () { return ui.stack.length && ui.stack[0].name === 'runend'; };

  // ---- screens ----
  const SCREENS = {};
  SCREENS.title = function () {
    const H = ui.host, daily = H.isDaily && H.isDaily(), sd = H.seed();
    let txt = '#' + sd;
    if (daily) { const s = String(sd); txt = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); }
    const art = h('div'); art.style.cssText = 'height:120px;width:120px';
    art.innerHTML = '<svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="#c9a24a" stroke-opacity=".5" stroke-dasharray="2 5"/><circle cx="60" cy="60" r="32" fill="none" stroke="#3fb8a8" stroke-opacity=".5"/><circle cx="60" cy="60" r="14" fill="#c9a24a"/><circle cx="60" cy="60" r="14" fill="none" stroke="#e8e2cf" stroke-opacity=".4"/><circle cx="92" cy="60" r="5" fill="#3fb8a8"/><circle cx="26" cy="38" r="4" fill="#e8e2cf"/><path d="M60 5v8M60 107v8M5 60h8M107 60h8" stroke="#c9a24a" stroke-opacity=".6"/></svg>';
    const sc = h('div', 'scroll', null, [art, h('h1', null, 'BURN WINDOW'), h('div', 'sub', 'Hold. Ease. Dock.'),
      panel([h('div', 'lbl', daily ? 'Daily seed' : 'Custom seed'), (() => { const v = h('div', null, txt + (daily ? ' · #' + sd : '')); v.style.cssText = 'font-size:22px;font-weight:700;color:#e8d9a8;margin-top:2px'; return v; })()], 'min-width:230px;text-align:center')]);
    sc.style.cssText += ';justify-content:center;align-items:center;text-align:center;gap:14px';
    return screen([sc, h('div', 'bot', null, [
      btn('Launch', 'p', launchFlow),
      h('div', 'row', null, [btn('Best times', '', () => ui.show('besttimes')), btn('How to play', '', () => ui.show('howto'))]),
      btn('Settings', '', () => ui.show('settings'))])]);
  };
  function launchFlow() {
    if (lsGet(HOWTO_KEY) !== '1') return ui.show('howto', { first: true });
    ui.closeAll(); ui.host.launch();
  }
  SCREENS.howto = function (o) {
    const step = (svg, t, d) => { const ic = h('div'); ic.style.cssText = 'flex:none;width:64px'; ic.innerHTML = svg; const tx = h('div', null, null, [h('div', null, t), h('div', 'sub', d)]); tx.firstChild.style.cssText = 'font-size:16px;color:#e8d9a8;font-weight:700'; return panel([ic, tx], 'display:flex;gap:12px;align-items:center'); };
    const sc = h('div', 'scroll', null, [
      step('<svg width="64" height="56" viewBox="0 0 64 56"><circle cx="32" cy="26" r="16" fill="#3fb8a8" fill-opacity=".25" stroke="#3fb8a8" stroke-width="2"/><path d="M32 18v16M25 27l7-9 7 9" stroke="#3fb8a8" stroke-width="2" fill="none"/><path d="M8 50h48" stroke="#c9a24a" stroke-opacity=".5"/></svg>', '1. HOLD to burn', 'Press and hold to fire the engine. Release to coast.'),
      step('<svg width="64" height="56" viewBox="0 0 64 56"><rect x="28" y="4" width="8" height="48" rx="4" fill="none" stroke="#c9a24a"/><circle cx="32" cy="22" r="8" fill="#3fb8a8"/><path d="M52 14l-4-6-4 6M52 42l-4 6-4-6" stroke="#e8d9a8" stroke-width="2" fill="none"/></svg>', '2. Drag up or down', 'Slide while burning to ease the throttle.'),
      step('<svg width="64" height="56" viewBox="0 0 64 56"><path d="M4 46h56" stroke="#c9a24a" stroke-width="2"/><path d="M22 44v-6M42 44v-6" stroke="#c9a24a" stroke-width="2"/><path d="M32 8l6 12h-12z" fill="#3fb8a8"/><path d="M32 24v14" stroke="#3fb8a8" stroke-dasharray="2 3"/><text x="32" y="54" fill="#7d8a86" font-size="8" text-anchor="middle" font-family="system-ui">&lt; 90 px/s</text></svg>', '3. Dock under 90 px/s', 'Arrive slow, with fuel left in the tank.')]);
    sc.style.justifyContent = 'center'; sc.style.gap = '16px';
    const t = h('h2', null, 'How to play'); t.style.cssText = 'text-align:center;padding-top:4px';
    return screen([t, sc, h('div', 'bot', null, [btn(o.first ? 'Got it' : 'Back', 'p', () => {
      lsSet(HOWTO_KEY, '1');
      if (o.first) { ui.closeAll(); ui.host.launch(); } else ui.back();
    })])]);
  };
  SCREENS.pause = function () {
    const H = ui.host, s = H.status ? H.status() : null;
    const list = [];
    list.push(btn('Resume', 'p', () => ui.closeAll()));
    list.push(btn('Retry sector', '', (b, e) => { ui.closeAll(); H.retry(b, e); }));
    if (settings.warp) list.push(toggle('Warp', null, () => H.getWarp(), v => H.setWarp(v), v => 'x' + (v ? 3 : 1)));
    list.push(toggle('Sound', null, () => !H.getMuted(), v => H.setMuted(!v), v => (v ? 'On' : 'Off')));
    list.push(btn('Settings', '', () => ui.show('settings')));
    list.push(btn('Copy report', '', b => H.copy(b)));
    list.push(btn('Quit to title', '', () => { ui.closeAll(); H.quit(); }));
    const t = h('h1', null, 'PAUSED'), sub = h('div', 'sub', s ? 'Sector ' + s.sector + ' / ' + s.count + ' · Fuel ' + s.fuel.toFixed(1) + ' · Par ' + s.par.toFixed(1) : '');
    sub.style.textAlign = 'center';
    const sc = h('div', 'scroll', null, [panel([t, sub, (() => { const l = h('div', null, null, list); l.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:12px'; return l; })()])]);
    sc.style.justifyContent = 'center';
    return screen([sc]);
  };
  SCREENS.settings = function () {
    const H = ui.host;
    const fld = h('input'); fld.type = 'text'; fld.setAttribute('inputmode', 'numeric'); fld.setAttribute('autocomplete', 'off'); fld.value = settings.customSeed || String(H.seed());
    fld.style.display = settings.seedMode === 'custom' ? 'block' : 'none';
    const dailyTxt = h('div', 'sub', 'Daily seed ' + dailySeedText()); dailyTxt.style.display = settings.seedMode === 'daily' ? 'block' : 'none';
    const msgEl = h('div', 'sub', ''); msgEl.style.cssText = 'min-height:0;color:#d9694f';
    const bD = h('button', settings.seedMode === 'daily' ? 'on' : '', 'Daily'), bC = h('button', settings.seedMode === 'custom' ? 'on' : '', 'Custom');
    [bD, bC].forEach(b => { b.type = 'button'; b.setAttribute('data-bw', '1'); });
    const pick = m => { setSetting('seedMode', m); bD.className = m === 'daily' ? 'on' : ''; bC.className = m === 'custom' ? 'on' : ''; fld.style.display = m === 'custom' ? 'block' : 'none'; dailyTxt.style.display = m === 'daily' ? 'block' : 'none'; };
    bD.onclick = e => { e.stopPropagation(); pick('daily'); }; bC.onclick = e => { e.stopPropagation(); pick('custom'); };
    const apply = btn('Apply seed and restart', '', () => {
      let url = location.pathname;
      if (settings.seedMode === 'custom') {
        const n = parseInt(String(fld.value).replace(/[^0-9-]/g, ''), 10);
        if (!isFinite(n)) { msgEl.textContent = 'Enter a whole number.'; return; }
        setSetting('customSeed', String(n)); url += '?seed=' + (n | 0) + '&menu=1';
      }
      try { location.href = url; } catch (e) {}
    });
    const confirm = panel([h('div', null, 'Erase all best times and ghosts?'), h('div', 'row', null, [btn('Erase', 'd', () => { H.eraseSaves(); confirm.style.display = 'none'; erased.textContent = 'Saves erased.'; }), btn('Cancel', '', () => { confirm.style.display = 'none'; })])], 'display:none;gap:10px;flex-direction:column');
    const erased = h('div', 'sub', ''); erased.style.textAlign = 'center';
    const sc = h('div', 'scroll', null, [
      toggle('Sound', 'Engine and cues', () => !H.getMuted(), v => H.setMuted(!v)),
      toggle('Reduced motion', 'No shake, particles or flicker', () => settings.reduced, v => setSetting('reduced', v)),
      toggle('Haptics', 'Vibrate on dock and crash', () => settings.haptics, v => setSetting('haptics', v)),
      toggle('Throttle drag', 'Drag to ease thrust', () => settings.drag, v => setSetting('drag', v)),
      toggle('Warp button', 'Show time-warp', () => settings.warp, v => { setSetting('warp', v); }),
      panel([h('div', 'lbl', 'Seed'), (() => { const g = h('div', 'seg', null, [bD, bC]); g.style.margin = '8px 0'; return g; })(), dailyTxt, fld, msgEl, (() => { const a = apply; a.style.marginTop = '8px'; return a; })()]),
      h('div', 'row', null, [btn('Reset saves', 'd', () => { confirm.style.display = 'flex'; erased.textContent = ''; }), btn('Copy report', '', b => H.copy(b))]),
      confirm, erased]);
    const t = h('h2', null, 'Settings'); t.style.cssText = 'text-align:center;padding-top:4px';
    return screen([t, sc, h('div', 'bot', null, [btn('Back', 'p', () => ui.back())])]);
  };
  function dailySeedText() { const s = String(ui.host.daily ? ui.host.daily() : ''); return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6) : s; }
  function medalOf(par, fuel) { const e = fuel > 0 ? par / fuel : 0; return e >= 0.75 ? 'Gold' : e >= 0.55 ? 'Silver' : 'Bronze'; }
  SCREENS.besttimes = function () {
    const H = ui.host, list = H.bestList(), rows = h('div'); let tf = 0, tp = 0, cnt = 0;
    list.forEach(r => {
      const row = h('div', 'bt'); row.appendChild(h('div', 'n', String(r.i + 1)));
      const v = h('div', 'v', null, [h('b', null, r.fuel != null ? r.fuel.toFixed(1) : '--'), h('span', 'sub', r.par != null ? 'par ' + r.par.toFixed(1) : (r.fuel != null ? 'par --' : 'not flown'))]); row.appendChild(v);
      if (r.fuel != null) { cnt++; tf += r.fuel; tp += r.par || 0; const m = r.par != null ? medalOf(r.par, r.fuel) : 'Bronze'; row.appendChild(h('span', 'chip m-' + m.toLowerCase(), m)); }
      if (r.fuel != null) {
        const g = h('button', 'g' + (H.ghostOn(r.i) ? '' : ' off')); g.type = 'button'; g.setAttribute('data-bw', '1'); g.setAttribute('role', 'switch');
        const s = sw(H.ghostOn(r.i)); g.appendChild(s); g.appendChild(h('span', null, 'Ghost'));
        g.setAttribute('aria-checked', String(H.ghostOn(r.i)));
        g.onclick = e => { e.stopPropagation(); const on = !H.ghostOn(r.i); H.setGhost(r.i, on); s.classList.toggle('on', on); g.classList.toggle('off', !on); g.setAttribute('aria-checked', String(on)); };
        row.appendChild(g);
      }
      rows.appendChild(row);
    });
    const tot = h('div', null, null, [h('span', null, 'TOTAL '), h('span', 'sub', cnt + ' / ' + list.length + ' sectors')]);
    const tr = h('div', null, cnt ? tf.toFixed(1) : '--'); if (cnt) tr.appendChild(h('span', 'sub', ' / par ' + tp.toFixed(1)));
    const totRow = h('div', null, null, [tot, tr]); totRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;min-height:56px';
    const hd = h('div', null, null, [h('h1', null, 'BEST TIMES'), (() => { const s = h('span', 'sub', 'Seed #' + H.seed()); return s; })()]);
    hd.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline'; hd.firstChild.style.fontSize = '26px';
    const sc = h('div', 'scroll', null, [panel([rows], 'padding:0 12px')]);
    const tp2 = panel([totRow], 'padding:0 12px;flex:none;margin:0 8px 6px');
    return screen([hd, sc, tp2, h('div', 'bot', null, [btn('Back', 'p', () => ui.back())])]);
  };
  const MEDAL = { Gold: ['#e6c04a', '#a8841e'], Silver: ['#c0c8cc', '#7d8a86'], Bronze: ['#b87333', '#7a4a1f'] };
  SCREENS.runend = function () {
    const H = ui.host, R = H.runSummary(), mc = MEDAL[R.medal] || MEDAL.Bronze;
    const svg = h('div'); svg.style.cssText = 'flex:none;width:96px;height:104px';
    svg.innerHTML = '<svg width="96" height="104" viewBox="0 0 96 104" aria-label="' + R.medal + ' medal"><path d="M24 0h16l12 42H36z" fill="#c9a24a"/><path d="M72 0H56L44 42h16z" fill="#8a6c2a"/><circle cx="48" cy="68" r="32" fill="' + mc[0] + '" stroke="#e8e2cf" stroke-width="3"/><circle cx="48" cy="68" r="24" fill="none" stroke="' + mc[1] + '" stroke-width="2"/><path d="M48 52l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="' + mc[1] + '"/></svg>';
    const nm = h('div', null, R.medal.toUpperCase()); nm.style.cssText = 'font-size:22px;font-weight:700;color:' + mc[0];
    const pc = h('div', null, Math.round(R.eff * 100) + '%'); pc.style.cssText = 'font-size:30px;font-weight:700';
    const hd = h('div', null, null, [h('h2', null, 'Run complete'), h('span', 'sub', 'Seed ' + R.seed)]); hd.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline';
    const medalP = panel([svg, h('div', null, null, [nm, pc, h('div', 'sub', 'overall efficiency')])], 'display:flex;align-items:center;gap:14px;padding:8px 12px');
    const rule = h('div', 'sub', 'Gold needs 75% · Silver 55% · Bronze = finish'); rule.style.textAlign = 'center';
    const rows = h('div'); { const x = h('div', null, null, [h('span', 'lbl', 'Sector'), h('span', 'lbl', 'Fuel used / par')]); x.style.cssText = 'display:flex;justify-content:space-between;height:24px;align-items:center'; rows.appendChild(x); }
    R.rows.forEach((r, i) => { const x = h('div', null, null, [h('span', 'sub', 'Sector ' + (i + 1)), h('span', null, r.used != null ? r.used.toFixed(1) + ' / ' + r.par.toFixed(1) : '--')]); x.style.cssText = 'display:flex;justify-content:space-between;height:28px;align-items:center;font-size:15px'; rows.appendChild(x); });
    const sc = h('div', 'scroll', null, [medalP, rule, panel([rows], 'padding:4px 12px 10px')]); sc.style.padding = '8px 8px 12px';
    // "New run" (primary) is game.js's persistent Next button, stacked above this bottom row.
    const bot = h('div', 'bot', null, [h('div', null), h('div', 'row', null, [btn('Copy report', '', b => H.copy(b)), btn('Title', '', (b, e) => { if (!H.pressOk(b, e)) return; ui.closeAll(); H.quit(); })])]);
    bot.firstChild.style.height = '66px';
    return screen([hd, sc, bot]);
  };

  // ---- sector result panels (non-blocking, bottom/top docked over the canvas) ----
  ui.sectorHide = function () { if (curSec && curSec.parentNode) curSec.parentNode.removeChild(curSec); curSec = null; };
  // kind 'docked' {used,par,eff,best,last} | 'failed' {title,text} ; place 'top'|'bottom'
  ui.sector = function (kind, o) {
    ensure(); ui.sectorHide();
    // Sits in the free band under the playfield (bottom 96 px at 475x638); Next (game.js bNext) overlays the right 150 px.
    const w = h('div', 'bwsec'); w.setAttribute('data-bw', '1'); w.style.bottom = '0'; w.style.padding = '8px 12px 12px';
    let left;
    if (kind === 'docked') {
      left = h('div', null, null, [h('div', null, null, [h('b', 'teal', 'DOCKED'), o.best ? h('span', 'chip', 'New best') : null]),
        h('div', null, null, [h('span', null, o.used.toFixed(1) + ' / ' + o.par.toFixed(1)), h('span', 'dim', ' fuel \u00b7 '), h('span', 'brass', Math.round(o.eff * 100) + '%')])]);
      left.firstChild.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:20px';
      if (o.best) left.firstChild.lastChild.style.cssText = 'position:absolute;top:-13px;left:12px;height:22px;font-size:12px;padding:0 8px;color:#3fb8a8;border-color:#3fb8a8;background:#102024';
      left.lastChild.style.cssText = 'font-size:16px;margin-top:2px;white-space:nowrap';
      w.appendChild(panel([left], 'display:flex;align-items:center;justify-content:space-between;min-height:76px;padding:8px'));
      left.style.flex = '1';
    } else {
      left = h('div', null, null, [h('b', 'red', o.title), h('div', 'dim', o.text)]); left.firstChild.style.fontSize = '20px'; left.style.flex = '1';
      const rb = btn('Retry', 'p', (b, e) => { if (ui.host.pressOk(b, e)) ui.host.retry(b, e); }); rb.style.cssText = 'width:150px;flex:none';
      w.appendChild(panel([left, rb], 'display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:76px;padding:8px'));
    }
    document.body.appendChild(w); curSec = w;
  };

  ui.pause = function () { if (!ui.open()) ui.show('pause'); };
  ui.launch = launchFlow;
  BW.ui = ui;
})();
