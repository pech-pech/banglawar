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
.rlh-track{width:calc(100% - var(--rl-flow-slot,64px) - 8px);align-self:flex-start;height:16px;border-radius:8px;background:rgba(8,14,28,.72);border:2px solid rgba(255,255,255,.85);overflow:hidden}
.rlh-fill{height:100%;width:0;background:#7fd4ff;transition:none}
.rlh-fill.ready{background:var(--rl-accent,#ff8a1f)}
.rlh-flow{position:absolute;right:0;bottom:0;width:var(--rl-flow-slot,64px);display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.rlh-flow-k{font:800 9px/1 system-ui,sans-serif;letter-spacing:.1em;opacity:.85}
.rlh-pips{display:flex;gap:3px}
.rlh-pip{width:8px;height:8px;border-radius:2px;border:1.5px solid rgba(255,255,255,.85);background:rgba(8,14,28,.72)}
.rlh-pip.lit{background:var(--rl-accent,#ff8a1f)}
.rlh-pips.pulse{animation:rlhpulse .3s ease-out}
.rlh-fbar{width:52px;height:4px;border-radius:2px;border:1px solid rgba(255,255,255,.85);background:rgba(8,14,28,.72);overflow:hidden}
.rlh-fbar>i{display:block;height:100%;width:0;background:var(--rl-accent,#ff8a1f)}
body.rl-paper .rlh .rlh-flow{text-shadow:none;color:#24406e}
body.rl-paper .rlh .rlh-flow-k{opacity:1;font-weight:900}
body.rl-paper .rlh .rlh-pip{border:2px solid #24406e;background:#fff;border-radius:3px;box-shadow:1px 1px 0 #24406e}
body.rl-paper .rlh .rlh-pip.lit{background:var(--rl-accent,#1f6fd0)}
body.rl-paper .rlh .rlh-fbar{border:2px solid #24406e;background:#fff;box-shadow:1px 1px 0 #24406e}
body.rl-paper .rlh .rlh-fbar>i{background:var(--rl-accent,#1f6fd0)}
.rlh-razor{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-size:clamp(26px,9vw,40px);font-weight:900;letter-spacing:.14em;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.7),0 0 12px var(--rl-accent,#ff8a1f);opacity:0;pointer-events:none;white-space:nowrap}
.rlh-razor.on{opacity:1;animation:rlhrazor .6s ease-out}
body.rl-paper .rlh .rlh-razor{color:#24406e;text-shadow:none;-webkit-text-stroke:0;background:#fff;border:3px solid #24406e;border-radius:12px;padding:2px 12px;box-shadow:3px 3px 0 #24406e}
@keyframes rlhpulse{0%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes rlhrazor{0%{transform:translate(-50%,-50%) scale(.7);opacity:0}20%{transform:translate(-50%,-50%) scale(1.15);opacity:1}100%{transform:translate(-50%,-70%) scale(1);opacity:0}}
@media (prefers-reduced-motion:reduce){.rlh-pips.pulse,.rlh-razor.on{animation:none}}
.rlh-box>*{flex-shrink:0}
.rlh-box>.rlh-theme{flex:0 1 auto;min-height:0}
.rlh-box>.rlh-theme.open{flex:1 1 auto}
.rlh-theme{display:flex;flex-direction:column;gap:8px}
.rlh-themebody{flex:1 1 auto;min-height:120px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.rlh-box.pick .rlh-how,.rlh-box.pick .rlh-best{display:none}
.rlh-hint{font-size:20px;font-weight:800;letter-spacing:.06em;padding:6px 14px;background:rgba(8,14,28,.8);border:1px solid rgba(255,255,255,.35);border-radius:12px;color:#ffb35a;max-width:100%;text-align:center}
.rlh-fps{position:absolute;left:10px;top:calc(76px + env(safe-area-inset-top,0px));font-size:11px;opacity:.85;padding:2px 6px;background:rgba(8,14,28,.6);border:1px solid rgba(255,255,255,.35);border-radius:6px;font-variant-numeric:tabular-nums}
.rlh-dev{position:absolute;right:10px;top:calc(76px + env(safe-area-inset-top,0px));font-size:12px;font-weight:800;padding:2px 8px;background:#c0262d;border-radius:6px;letter-spacing:.08em}
.rlh-word{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);font-size:clamp(24px,8vw,36px);font-weight:900;letter-spacing:.12em;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.7),0 0 12px var(--rl-accent,#ff8a1f);opacity:0;pointer-events:none;white-space:nowrap}
.rlh-word.on{opacity:1;animation:rlhrazor .9s ease-out}
.rlh-lift{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);opacity:0;pointer-events:none;white-space:nowrap;transition:opacity .15s}
.rlh-lift.on{opacity:1}
body.rl-paper .rlh .rlh-word{color:#24406e;text-shadow:none;background:#fff;border:3px solid #24406e;border-radius:12px;padding:2px 12px;box-shadow:3px 3px 0 #24406e}
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
  const loadEl = el('p', 'rlh-best rlh-panel', sb, 'Loading physics...');
  const dailyBtn = btn('Daily run', '', sb, () => call('onStart', 'daily'));
  const randBtn = btn('Random run', 'alt', sb, () => call('onStart', 'random'));
  function setLoading(state, msg) { // 'loading' | 'ready' | 'error'
    const off = state !== 'ready';
    dailyBtn.disabled = off; randBtn.disabled = off;
    dailyBtn.style.opacity = randBtn.style.opacity = off ? '.5' : '';
    loadEl.hidden = state === 'ready';
    loadEl.textContent = state === 'error' ? 'Physics failed to load: ' + (msg || 'unknown error') : 'Loading physics...';
  }
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
  const flowEl = el('div', 'rlh-flow', bar);
  el('div', 'rlh-flow-k', flowEl, 'FLOW');
  const pipsEl = el('div', 'rlh-pips', flowEl);
  const pips = [0, 1, 2, 3, 4].map(() => el('div', 'rlh-pip', pipsEl));
  const fbar = el('div', 'rlh-fbar', flowEl);
  const fbarFill = el('i', '', fbar);
  const razorEl = el('div', 'rlh-razor', run, 'RAZOR');
  const toastEl = el('div', 'rlh-toast', run, '');
  const wordEl = el('div', 'rlh-word', run, '');
  const liftEl = el('div', 'rlh-hint rlh-lift', run, 'LIFT TO DIVE');
  let wordT = 0, liftT = 0, flights = 0;

  // End screen
  const end = el('div', 'rlh-screen', root);
  const eb = el('div', 'rlh-box', end);
  const resEl = el('h2', 'rlh-res', eb, '');
  const stats = el('div', 'rlh-stats rlh-panel', eb);
  const sTime = el('div', '', stats), sGates = el('div', '', stats), sExtra = el('div', '', stats);
  const sMedal = el('div', '', stats), sFlow = el('div', '', stats);
  let endAt = 0;
  const gated = (fn) => () => { if (performance.now() - endAt >= 600) fn(); };
  btn('Retry', '', eb, gated(() => call('onRetry')));
  const r2 = el('div', 'rlh-row', eb);
  btn('Menu', 'alt', r2, gated(() => showStart(lastInfo)));
  btn('Copy report', 'alt', r2, gated(() => call('onCopyReport')));

  let lastInfo = null, devOn = false, toastT = 0, razorT = 0;
  const cache = { t: '', s: '', g: '', f: '', w: -1, rdy: null, fps: '', fl: -1, fw: -1 };

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
    cache.t = cache.s = cache.g = cache.fps = ''; cache.w = -1; cache.rdy = null; cache.fl = -1; cache.fw = -1;
    hint.hidden = true;
    clearTimeout(wordT); wordEl.classList.remove('on'); liftEl.classList.remove('on');
    clearTimeout(razorT); razorEl.classList.remove('on'); pipsEl.classList.remove('pulse');
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
    const fl = Math.max(0, Math.min(5, state.flow | 0));
    if (fl !== cache.fl) { cache.fl = fl; for (let i = 0; i < 5; i++) pips[i].classList.toggle('lit', i < fl); }
    const fw = fl > 0 && state.flowWin > 0 ? Math.round(Math.max(0, Math.min(1, (state.flowT || 0) / state.flowWin)) * 50) : 0;
    if (fw !== cache.fw) { cache.fw = fw; fbarFill.style.width = fw * 2 + '%'; }
    const f = fps ? Math.round(fps) + ' fps' : '';
    if (f !== cache.fps) { cache.fps = f; fpsEl.textContent = f; }
  }
  function event(ev) {
    if (!ev || run.hidden) return;
    if (ev.type === 'graze' && ev.tier === 'razor') {
      razorEl.classList.remove('on'); void razorEl.offsetWidth; razorEl.classList.add('on');
      clearTimeout(razorT);
      razorT = setTimeout(() => razorEl.classList.remove('on'), 600);
    } else if (ev.type === 'launch') {
      if (flights++ < 3) {
        liftEl.classList.add('on'); clearTimeout(liftT);
        liftT = setTimeout(() => liftEl.classList.remove('on'), 1600);
      }
    } else if (ev.type === 'dive_start' || (ev.type === 'land' && !ev.hop)) {
      liftEl.classList.remove('on');
      if (ev.type === 'land') {
        const g = ev.grade;
        const w = g === 'wreck' ? 'WIPEOUT' : g === 'slam' ? 'THUD' : g === 'rough' ? 'SCUFF' : (g === 'clean' ? (ev.dive ? 'PERFECT DROP' : 'STUCK') : '');
        if (w) {
          wordEl.textContent = w;
          wordEl.classList.remove('on'); void wordEl.offsetWidth; wordEl.classList.add('on');
          clearTimeout(wordT);
          wordT = setTimeout(() => wordEl.classList.remove('on'), 900);
        }
      }
    } else if (ev.type === 'flowUp' || ev.type === 'flowDrop') {
      pipsEl.classList.remove('pulse'); void pipsEl.offsetWidth; pipsEl.classList.add('pulse');
    }
  }
  function showEnd(result) {
    const r = result || {};
    resEl.textContent = r.crashed ? 'CRASHED' : (r.finished === false ? 'RUN OVER' : 'FINISHED');
    sTime.textContent = 'Time: ' + ((r.time ?? r.t) != null ? Number(r.time ?? r.t).toFixed(2) + ' s' : '-');
    sGates.textContent = 'Gates: ' + (r.gatesPassed | 0) + ' passed, ' + (r.gatesMissed | 0) + ' missed';
    if (r.crashed && r.z != null) { sExtra.hidden = false; sExtra.textContent = 'Crashed at ' + Math.round(r.z) + ' m'; }
    else sExtra.hidden = true;
    const m = r.medal;
    if (!m || r.crashed) sMedal.hidden = true;
    else {
      sMedal.hidden = false;
      const g = m.gap != null && m.next ? ' - ' + Number(m.gap).toFixed(1) + ' s to ' + m.next : '';
      sMedal.textContent = m.hidden ? 'Medal: off (DEV)' : m.name ? 'Medal: ' + m.name + g : 'No medal' + g;
    }
    if (r.flowPeak != null) { sFlow.hidden = false; sFlow.textContent = 'Flow peak ' + (r.flowPeak | 0); }
    else sFlow.hidden = true;
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

  // B4 VIS begin: spring HUD (body.b4-hud) replaces the top cards / boost bar / flow; landing words, hints, toast stay.
  // b4(m): 'home' | 'garage' hide every old screen; 'end' keeps the run layer for the toast (spring end card is the end screen).
  try {
    if (!document.getElementById('rlh-b4')) {
      const st = document.createElement('style'); st.id = 'rlh-b4';
      st.textContent = 'body.b4-end .rlh.rlh{display:block!important}body.b4-end .rlh-top,body.b4-end .rlh-bar,body.b4-end .rlh-word,body.b4-end .rlh-lift,body.b4-end .rlh-razor,body.b4-end .rlh-fps{display:none!important}.rlh-toast{z-index:40}';
      document.head.appendChild(st);
    }
  } catch (e) { /* ignore */ }
  function b4(m) {
    start.hidden = true; end.hidden = true;
    run.hidden = !(m === 'run' || m === 'end');
    try { document.body.classList.add('b4-hud'); } catch (e) { /* ignore */ }
  }
  // B4 VIS end
  showStart(null);
  return { showStart, showRun, update, event, showEnd, setDev, toast, setLoading, themeMount, setThemeLabel, b4 };
}
