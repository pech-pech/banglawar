// Ridgeline HUD (slice 5). DOM only, no imports.
export function createHud(rootEl, handlers) {
  const h = handlers || {};
  const CSS = `
.rlh{position:absolute;inset:0;overflow:hidden;box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;-webkit-user-select:none;user-select:none;pointer-events:none;
 padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0)}
.rlh *{box-sizing:border-box}
.rlh [hidden]{display:none!important}
.rlh-panel{background:rgba(8,14,28,.72);border:1px solid rgba(255,255,255,.35);border-radius:14px;padding:10px 14px;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.rlh-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;
 padding-top:calc(16px + env(safe-area-inset-top,0px));padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));pointer-events:auto;background:rgba(6,10,20,.45);touch-action:manipulation;overflow-y:auto}
.rlh-box{width:100%;max-width:360px;max-height:100%;min-height:0;margin:auto 0;display:flex;flex-direction:column;gap:12px;align-items:stretch;text-align:center}
.rlh-title{font-size:clamp(30px,11vw,48px);font-weight:800;letter-spacing:.08em;margin:0;line-height:1.1}
.rlh-how{font-size:15px;line-height:1.35;margin:0}
.rlh-best{font-size:14px;opacity:.9;margin:0}
.rlh-btn{pointer-events:auto;min-height:56px;min-width:56px;width:100%;border:0;border-radius:14px;background:var(--rl-accent,#ff8a1f);color:var(--rl-ink,#1a0e00);font:700 18px system-ui,sans-serif;cursor:pointer;touch-action:manipulation;padding:0 12px}
.rlh-btn.alt{background:rgba(255,255,255,.92);color:#0b1220}
.rlh-btn:active{filter:brightness(.85)}
.rlh-row{display:flex;gap:10px}
.rlh-row .rlh-btn{flex:1 1 0;min-width:0}
.rlh-run{position:absolute;inset:0;pointer-events:none}
.rlh-top{position:absolute;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top,0px));display:flex;gap:8px;justify-content:space-between;align-items:stretch}
.rlh-top .rlh-panel{flex:1 1 0;min-width:0;text-align:center;padding:6px 8px}
.rlh-k{font-size:11px;opacity:.8;letter-spacing:.06em;text-transform:uppercase}
.rlh-v{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.rlh-bar{position:absolute;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:6px;align-items:center}
.rlh-track{width:100%;height:16px;border-radius:8px;background:rgba(8,14,28,.72);border:2px solid rgba(255,255,255,.85);overflow:hidden}
.rlh-fill{height:100%;width:0;background:#7fd4ff;transition:none}
.rlh-fill.ready{background:var(--rl-accent,#ff8a1f)}
.rlh-box>*{flex-shrink:0}
.rlh-box>.rlh-theme{flex:0 1 auto;min-height:0}
.rlh-box>.rlh-theme.open{flex:1 1 auto}
.rlh-theme{display:flex;flex-direction:column;gap:8px}
.rlh-themebody{flex:1 1 auto;min-height:120px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.rlh-box.pick .rlh-how,.rlh-box.pick .rlh-best{display:none}
.rlh-hint{font-size:20px;font-weight:800;letter-spacing:.06em;padding:6px 14px;background:rgba(8,14,28,.8);border:1px solid rgba(255,255,255,.35);border-radius:12px;color:#ffb35a;max-width:100%;text-align:center}
.rlh-fps{position:absolute;left:10px;top:calc(76px + env(safe-area-inset-top,0px));font-size:11px;opacity:.85;padding:2px 6px;background:rgba(8,14,28,.6);border:1px solid rgba(255,255,255,.35);border-radius:6px;font-variant-numeric:tabular-nums}
.rlh-dev{position:absolute;right:10px;top:calc(76px + env(safe-area-inset-top,0px));font-size:12px;font-weight:800;padding:2px 8px;background:#c0262d;border-radius:6px;letter-spacing:.08em}
.rlh-toast{position:absolute;left:50%;top:calc(120px + env(safe-area-inset-top,0px));transform:translateX(-50%);max-width:calc(100% - 24px);padding:8px 14px;border-radius:12px;background:rgba(8,14,28,.88);border:1px solid rgba(255,255,255,.35);font-size:15px;text-align:center;opacity:0;transition:opacity .2s;pointer-events:none}
.rlh-toast.on{opacity:1}
.rlh-res{font-size:clamp(26px,9vw,38px);font-weight:800;margin:0}
.rlh-stats{display:flex;flex-direction:column;gap:4px;font-size:18px;font-variant-numeric:tabular-nums}
`;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const btn = (label, cls, parent, fn) => {
    const b = el('button', 'rlh-btn' + (cls ? ' ' + cls : ''), parent, label);
    b.type = 'button';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(ev); });
    return b;
  };
  const call = (n, a) => { if (typeof h[n] === 'function') h[n](a); };

  const root = el('div', 'rlh', rootEl);

  // Start screen
  const start = el('div', 'rlh-screen', root);
  const sb = el('div', 'rlh-box', start);
  el('h1', 'rlh-title', sb, 'RIDGELINE');
  el('p', 'rlh-how rlh-panel', sb, 'Drag to carve. Ride close to rocks to charge. Lift to boost.');
  const bestEl = el('p', 'rlh-best rlh-panel', sb, '');
  const verEl = el('p', 'rlh-ver', sb, '');
  verEl.style.cssText = 'margin:6px 0 0;font-size:12px;opacity:.7;text-align:center';
  btn('Daily run', '', sb, () => call('onStart', 'daily'));
  btn('Random run', 'alt', sb, () => call('onStart', 'random'));
  btn('Settings', 'alt', sb, () => call('onSettings'));
  const themeWrap = el('div', 'rlh-theme', sb);
  const themeBtn = btn('Theme', 'alt', themeWrap, () => {
    themeMount.hidden = !themeMount.hidden;
    sb.classList.toggle('pick', !themeMount.hidden);
    themeWrap.classList.toggle('open', !themeMount.hidden);
    themeBtn.setAttribute('aria-expanded', themeMount.hidden ? 'false' : 'true');
  });
  themeBtn.setAttribute('aria-expanded', 'false');
  const themeMount = el('div', 'rlh-themebody', themeWrap);
  themeMount.hidden = true;
  function setThemeLabel(name) {
    themeBtn.dataset.name = name; themeBtn.textContent = 'Theme: ' + name + (themeMount.hidden ? ' \u25BE' : ' \u25B4'); }
  themeBtn.addEventListener('click', () => setThemeLabel(themeBtn.dataset.name || ''));

  // Run HUD
  const run = el('div', 'rlh-run', root);
  const top = el('div', 'rlh-top', run);
  const mk = (k) => {
    const p = el('div', 'rlh-panel', top);
    el('div', 'rlh-k', p, k);
    return el('div', 'rlh-v', p, '');
  };
  const vTime = mk('Time'), vSpeed = mk('Speed'), vGates = mk('Gates');
  const fpsEl = el('div', 'rlh-fps', run, '');
  const devEl = el('div', 'rlh-dev', run, 'DEV');
  devEl.hidden = true;
  const bar = el('div', 'rlh-bar', run);
  const hint = el('div', 'rlh-hint', bar, 'RELEASE TO BOOST');
  hint.hidden = true;
  const track = el('div', 'rlh-track', bar);
  const fill = el('div', 'rlh-fill', track);
  const toastEl = el('div', 'rlh-toast', run, '');

  // End screen
  const end = el('div', 'rlh-screen', root);
  const eb = el('div', 'rlh-box', end);
  const resEl = el('h2', 'rlh-res', eb, '');
  const stats = el('div', 'rlh-stats rlh-panel', eb);
  const sTime = el('div', '', stats), sGates = el('div', '', stats), sExtra = el('div', '', stats);
  let endAt = 0;
  const gated = (fn) => () => { if (performance.now() - endAt >= 600) fn(); };
  btn('Retry', '', eb, gated(() => call('onRetry')));
  const r2 = el('div', 'rlh-row', eb);
  btn('Menu', 'alt', r2, gated(() => showStart(lastInfo)));
  btn('Copy report', 'alt', r2, gated(() => call('onCopyReport')));

  let lastInfo = null, devOn = false, toastT = 0;
  const cache = { t: '', s: '', g: '', f: '', w: -1, rdy: null, fps: '' };

  function mode(m) {
    start.hidden = m !== 'start';
    run.hidden = m !== 'run';
    end.hidden = m !== 'end';
  }
  function showStart(info) {
    lastInfo = info || null;
    const b = info && info.best;
    if (b != null && b !== '') {
      bestEl.hidden = false;
      bestEl.textContent = 'Best: ' + (typeof b === 'number' ? b.toFixed(2) + ' s' : String(b));
    } else bestEl.hidden = true;
    if (info && info.build) verEl.textContent = 'build ' + info.build;
    mode('start');
  }
  function showRun() {
    cache.t = cache.s = cache.g = cache.fps = ''; cache.w = -1; cache.rdy = null;
    hint.hidden = true;
    mode('run');
  }
  function update(state, fps) {
    if (!state || run.hidden) return;
    const t = (state.t || 0).toFixed(1) + ' s';
    if (t !== cache.t) { cache.t = t; vTime.textContent = t; }
    const s = Math.round(state.speed || 0) + ' m/s';
    if (s !== cache.s) { cache.s = s; vSpeed.textContent = s; }
    const g = (state.gatesPassed | 0) + ' / ' + (state.gatesMissed | 0) + ' miss';
    if (g !== cache.g) { cache.g = g; vGates.textContent = g; }
    const b = Math.max(0, Math.min(1, state.boost || 0));
    const w = Math.round(b * 100);
    if (w !== cache.w) { cache.w = w; fill.style.width = w + '%'; }
    const rdy = b >= 0.25;
    if (rdy !== cache.rdy) { cache.rdy = rdy; hint.hidden = !rdy; fill.classList.toggle('ready', rdy); }
    const f = fps ? Math.round(fps) + ' fps' : '';
    if (f !== cache.fps) { cache.fps = f; fpsEl.textContent = f; }
  }
  function showEnd(result) {
    const r = result || {};
    resEl.textContent = r.crashed ? 'CRASHED' : (r.finished === false ? 'RUN OVER' : 'FINISHED');
    sTime.textContent = 'Time: ' + (r.t != null ? Number(r.t).toFixed(2) + ' s' : '-');
    sGates.textContent = 'Gates: ' + (r.gatesPassed | 0) + ' passed, ' + (r.gatesMissed | 0) + ' missed';
    if (r.crashed && r.z != null) { sExtra.hidden = false; sExtra.textContent = 'Crashed at ' + Math.round(r.z) + ' m'; }
    else sExtra.hidden = true;
    endAt = performance.now();
    mode('end');
  }
  function setDev(on) { devOn = !!on; devEl.hidden = !devOn; }
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('on'), 1800);
  }

  showStart(null);
  return { showStart, showRun, update, showEnd, setDev, toast, themeMount, setThemeLabel };
}
