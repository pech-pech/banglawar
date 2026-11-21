// B4 M7: end card (ported from mock endcard.js). DOM sheet, pure helpers testable in node.
export const TAP_GUARD_S = 0.6;
export const SHEET_MAX_VH = 50;
export const CAUSE = { caught: 'Night caught you', run_over: 'Wrecked on a rock', wreck: 'Wrecked on a rock', finish: 'Course complete' }; // B4 integrator glue: finite-course finish
export const HULL_UNLOCKS = [['Kite', 2800], ['Anvil', 5500], ['Barge', 8500], ['Spindle', 13500]];

/** Pure guard: taps are ignored until `guard` seconds after the card opened. */
export function tapAllowed(openedAt, now, guard = TAP_GUARD_S) { return (now - openedAt) >= guard - 1e-9; }

export function nextHull(dist) {
  for (const [name, at] of HULL_UNLOCKS) if (dist < at) return { name, at, left: Math.ceil(at - dist), pct: Math.max(0, Math.min(100, dist / at * 100)) };
  return null;
}
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Pure view-model from run summary o {cause, dist, best, top, landings, newBest}. */
export function endModel(o = {}) {
  const dist = o.dist || 0, best = Math.max(o.best || 0, dist);
  // NEW BEST only when a previous best existed (> 0) and this run beat it; first ever run never shows it
  const prev = o.best || 0;
  return { cause: CAUSE[o.cause] || CAUSE.caught, dist, best, newBest: prev > 0 && dist > prev,
    top: Math.round(o.top || 0), landings: o.landings | 0, next: nextHull(dist) };
}

const CSS = `
body.b4-end .rlh{display:none!important}
.b4ec{position:absolute;inset:0;pointer-events:none;z-index:30;font-family:ui-rounded,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#3a2350}
.b4ec *{box-sizing:border-box}
.b4ec-sheet>*{flex-shrink:0}
.b4ec-sheet{position:absolute;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;max-height:${SHEET_MAX_VH}%;overflow:hidden;pointer-events:auto;touch-action:manipulation;display:flex;flex-direction:column;
 padding:10px calc(16px + env(safe-area-inset-right,0px)) calc(12px + env(safe-area-inset-bottom,0px)) calc(16px + env(safe-area-inset-left,0px));border-radius:26px 26px 0 0;
 background:linear-gradient(180deg,#fffaf0,#fff4df);box-shadow:0 -10px 30px rgba(92,46,98,.38);animation:b4rise .7s cubic-bezier(.34,1.45,.5,1) both}
.b4ec-cause{margin:0;text-align:center;font-size:13px;line-height:16px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#e84433}
.b4ec-dist{margin:0;text-align:center;font-size:40px;line-height:40px;font-weight:900;font-variant-numeric:tabular-nums}
.b4ec-dist small{font-size:20px;opacity:.7;margin-left:4px}
.b4ec-ribbon{align-self:center;padding:2px 12px;border-radius:7px;background:#ff5a4a;color:#fff;font-size:12px;line-height:20px;font-weight:900;letter-spacing:.16em}
.b4ec-stats{display:flex;gap:6px;margin-top:4px}
.b4ec-stat{flex:1 1 0;min-width:0;text-align:center;padding:5px 2px;border-radius:12px;background:rgba(255,233,196,.7)}
.b4ec-stat b{display:block;font-size:15px;font-weight:900;white-space:nowrap}
.b4ec-stat span{display:block;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.65}
.b4ec-prog{margin-top:6px;font-size:11px;font-weight:800;display:flex;justify-content:space-between;gap:8px}
.b4ec-line{position:relative;height:6px;margin-top:4px;border-radius:3px;background:rgba(58,35,80,.16)}
.b4ec-line i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,#ffb070,#ff5a4a)}
.b4ec button{font:inherit;color:#3a2350;border:0;cursor:pointer;touch-action:manipulation;min-width:56px}
.b4ec button.b4ec-run{color:#fff;width:100%;height:60px;min-height:60px;margin-top:10px;border-radius:18px;font-size:22px;font-weight:900;letter-spacing:.14em;color:#fff;background:linear-gradient(180deg,#ff7260,#ff5a4a);box-shadow:0 4px 0 #b8281c}
.b4ec-btns{display:flex;gap:8px;margin-top:6px}
.b4ec-btn{flex:1 1 0;min-width:56px;height:56px;min-height:56px;border-radius:16px;font-size:12px;font-weight:800;letter-spacing:.06em;white-space:nowrap;background:#ffe9c4;box-shadow:0 3px 0 rgba(58,35,80,.38)}
.b4ec.arming .b4ec-sheet button{pointer-events:none;opacity:.7}
@keyframes b4rise{0%{transform:translateY(105%)}100%{transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){.b4ec-sheet{animation:none}}
@media (max-width:380px){.b4ec .b4ec-btn{font-size:12px;letter-spacing:.02em;padding:0 2px}} /* B4 integrator glue: COPY REPORT clipped at 344 px */
`;

/** createEndCard(root, nowFn) -> {open(o, cbs), close(), isOpen(), press(action, now)} ; DOM optional (node-safe). */
export function createEndCard(root, nowFn = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0)) {
  let el = null, openedAt = -1e9, cbs = {}, open = false;
  const doc = typeof document !== 'undefined' ? document : null;
  function press(action, now = nowFn()) {
    if (!open || !tapAllowed(openedAt, now)) return false;
    const f = { again: cbs.onRideAgain, home: cbs.onHome, photo: cbs.onPhoto, copy: cbs.onCopyReport }[action];
    if (typeof f === 'function') f();
    return true;
  }
  function show(o, c) {
    cbs = c || {}; openedAt = nowFn(); open = true;
    if (!root || !doc) return endModel(o);
    close(true); open = true;
    if (!doc.getElementById('b4-endcard')) { const s = doc.createElement('style'); s.id = 'b4-endcard'; s.textContent = CSS; doc.head.appendChild(s); }
    doc.body.classList.add('b4-end');
    const m = endModel(o);
    el = doc.createElement('div'); el.className = 'b4ec arming';
    el.innerHTML = `<div class="b4ec-sheet" role="dialog" aria-label="Run over">${m.newBest ? '<div class="b4ec-ribbon">NEW BEST</div>' : ''}
<p class="b4ec-cause">${esc(m.cause)}</p><p class="b4ec-dist">${fmt(m.dist)}<small>m</small></p>
<div class="b4ec-stats"><div class="b4ec-stat"><b>${fmt(m.best)} m</b><span>Best</span></div><div class="b4ec-stat"><b>${m.top} m/s</b><span>Top speed</span></div><div class="b4ec-stat"><b>${m.landings}</b><span>Clean landings</span></div></div>
${m.next ? `<div class="b4ec-prog"><span>${esc(m.next.name)} hull at ${fmt(m.next.at)} m</span><span>${fmt(m.next.left)} m to go</span></div><div class="b4ec-line"><i style="width:${m.next.pct.toFixed(1)}%"></i></div>` : ''}
<button class="b4ec-run" data-a="again">RIDE AGAIN</button>
<div class="b4ec-btns"><button class="b4ec-btn" data-a="home">HOME</button><button class="b4ec-btn" data-a="photo">PHOTO</button><button class="b4ec-btn" data-a="copy">COPY REPORT</button></div></div>`;
    el.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-a]'); if (b) press(b.dataset.a); });
    root.appendChild(el);
    setTimeout(() => { if (el) el.classList.remove('arming'); }, TAP_GUARD_S * 1000);
    return m;
  }
  function close(keepFlag) {
    open = false;
    if (el) { el.remove(); el = null; }
    if (!keepFlag && doc) doc.body.classList.remove('b4-end');
  }
  return { open: show, close, isOpen: () => open, press, openedAt: () => openedAt };
}
