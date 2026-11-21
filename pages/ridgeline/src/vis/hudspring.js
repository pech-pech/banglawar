// B4 M7: spring HUD cards (ported from mock hudspring.js, rewritten for the real loop). Cosmetic only; reads vs.
import { createEndCard } from './endcard.js';

export const KEYS = {
  lookHudFloor: { def: 42, min: 20, max: 100, step: 1, label: 'HUD fade floor %' },
  lookHudFloorDusk: { def: 58, min: 20, max: 100, step: 1, label: 'HUD fade floor dusk %' },
  lookHudSpring: { def: 1, min: 0, max: 2, step: 0.05, label: 'HUD spring strength' },
  lookHudMinimal: { def: 0, min: 0, max: 1, step: 1, label: 'Minimal HUD' },
};
// Warm only. Cool colours are reserved for gates.
export const PALETTE = { cream: '#fff4df', cream2: '#ffe9c4', ink: '#3a2350', plum: '#2a2358', coral: '#ff5a4a', gold: '#ffcf8a', rose: '#ff7a8a', sand: '#ffb070' };
export const GAP_FAR = 130, GAP_HEELS = 60, GAP_FULL = 150;
export const SAFE = { minTouch: 56 };

export const CARDS = [ // name, k, zeta, hold ms, stagger ms, tilt sign
  { n: 'dist', k: 190, z: 0.62, hold: 3000, d: 0, sg: -1 },
  { n: 'speed', k: 230, z: 0.58, hold: 3000, d: 35, sg: 1 },
  { n: 'gap', k: 160, z: 0.5, hold: 3500, d: 70, sg: -1 },
  { n: 'boost', k: 250, z: 0.8, hold: 2500, d: 20, sg: 1 },
  { n: 'flow', k: 200, z: 0.58, hold: 3500, d: 55, sg: 1 },
];
const LAND_AMP = [[12, 4.5], [12, 4], [11, 4.5], [14, 1.2], [10, 4]];
const GRADE = { soft: 0.35, clean: 0.5, good: 0.7, rough: 0.85, slam: 1, wreck: 1 };

/** Damped spring step (k [1/s^2], zeta). State s={x,v}. Sub-stepped for stability. */
export function springStep(s, target, k, z, dt) {
  const c = 2 * z * Math.sqrt(k);
  let left = Math.min(dt, 0.1);
  while (left > 1e-9) {
    const h = Math.min(left, 1 / 240);
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
    left -= h;
  }
  return s;
}
/** Initial velocity that makes a zero-start spring peak at `peak`. */
export function peakToV(peak, k, z) {
  const w = Math.sqrt(k), wd = w * Math.sqrt(1 - z * z), tp = Math.atan2(wd, z * w) / wd;
  return peak * w / Math.exp(-z * w * tp);
}
export function settled(s, eps = 0.01) { return Math.abs(s.x) < eps && Math.abs(s.v) < eps * 4; }

/** 'hidden' (Infinity/none) | 'far' (cream) | 'near' | 'heels' (rose + pulse). */
export function gapState(gap) {
  if (gap == null || !isFinite(gap)) return 'hidden';
  if (gap >= GAP_FAR) return 'far';
  if (gap >= GAP_HEELS) return 'near';
  return 'heels';
}
export const gapFrac = (gap) => (gap == null || !isFinite(gap) ? 0 : Math.max(0, Math.min(1, gap / GAP_FULL)));
/** Calm plate opacity floor, 0..1. Dusk (n > 0.4) raises it. */
export function fadeFloor(n, cfg) {
  const c = cfg || {};
  const lo = (c.lookHudFloor ?? KEYS.lookHudFloor.def) / 100, hi = (c.lookHudFloorDusk ?? KEYS.lookHudFloorDusk.def) / 100;
  return (n || 0) > 0.4 ? Math.max(lo, hi) : lo;
}
/** Exponential fade step: tau 350 ms down, 50 ms up (120 ms reduced down). */
export function fadeStep(f, target, dt, reduced) {
  const tau = target < f ? (reduced ? 0.12 : 0.35) : 0.05;
  return f + (target - f) * (1 - Math.exp(-dt / tau));
}
export const boostColor = (b) => { // coral -> gold
  const t = Math.max(0, Math.min(1, b)), a = [255, 90, 74], g = [255, 207, 138];
  return 'rgb(' + a.map((v, i) => Math.round(v + (g[i] - v) * t)).join(',') + ')';
};

const CSS = `
.b4h{position:absolute;inset:0;pointer-events:none;z-index:20;font-family:ui-rounded,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:${PALETTE.ink}}
body.b4-hud .rlh-top,body.b4-hud .rlh-track,body.b4-hud .rlh-flow{display:none!important}
.b4h-top{position:absolute;left:calc(8px + env(safe-area-inset-left,0px));right:calc(72px + env(safe-area-inset-right,0px)); /* 56 px MENU button slot */top:calc(8px + env(safe-area-inset-top,0px));display:flex;gap:8px}
.b4h-card{flex:1 1 0;min-width:56px;min-height:56px;padding:6px 8px;border-radius:14px;text-align:center;background:rgba(255,244,223,.94);box-shadow:0 3px 0 rgba(58,35,80,.25);will-change:transform,opacity;transform-origin:50% 50%}
.b4h-k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;color:#c8452f}
.b4h-v{font-size:22px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
.b4h-card.far{background:rgba(255,244,223,.97)}
.b4h-card.near{background:rgba(255,233,196,.94)}
.b4h-card.heels{background:rgba(255,200,196,.95);animation:b4pulse .9s ease-in-out infinite}
.b4h-card.hidden{visibility:hidden}
.b4h-card.flash{box-shadow:0 0 0 3px ${PALETTE.gold},0 0 18px ${PALETTE.gold}}
.b4h-bar{position:absolute;left:calc(12px + env(safe-area-inset-left,0px));right:calc(12px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));display:flex;gap:8px;align-items:center;will-change:transform,opacity}
.b4h-tw{position:relative;flex:1;display:flex}
.b4h-lab{position:absolute;left:4px;top:50%;transform:translateY(-50%);z-index:2;font:900 10px/1 system-ui,sans-serif;letter-spacing:.1em;color:#3a2350;background:rgba(255,244,223,.94);border-radius:6px;padding:2px 6px;pointer-events:none}
body.b4-hud .rlh-bar::before{display:none!important}
.b4h-track{flex:1;height:16px;border-radius:8px;background:rgba(58,35,80,.55);overflow:hidden}
.b4h-fill{height:100%;width:0}
.b4h-flow{display:flex;gap:3px;min-width:56px;justify-content:center;will-change:transform}
.b4h-pip{width:9px;height:9px;border-radius:2px;background:rgba(58,35,80,.5)}
.b4h-pip.lit{background:${PALETTE.coral}}
.b4h-dusk{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(58,35,80,.45)}
.b4h-dusk i{position:absolute;left:0;top:0;bottom:0;background:${PALETTE.sand}}
.b4h-dusk u{position:absolute;top:-3px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:${PALETTE.gold};box-shadow:0 0 8px ${PALETTE.gold}}
.b4h.min .b4h-top .b4h-card:not(:first-child){display:none}
.b4h.min .b4h-v{font-size:16px}
@keyframes b4pulse{50%{box-shadow:0 0 0 3px ${PALETTE.rose}}}
@media (prefers-reduced-motion:reduce){.b4h-card.heels{animation:none}}
`;

/** createHud(ctx) -> {update(dt,vs), fx(ev), show(bool), endCard(o,cbs), hideEnd(), stats(), shift(), setQuality(), dispose()} */
export function createHud(ctx = {}) {
  const cfg = ctx.cfg || {};
  const doc = ctx.root && typeof document !== 'undefined' ? document : null;
  const cards = CARDS.map((c) => ({ ...c, y: { x: 0, v: 0 }, r: { x: 0, v: 0 }, s: { x: 0, v: 0 }, f: 1, awake: 0, el: null, dirty: true, last: '' }));
  const queue = []; // {at, ci, y, r, s}
  const Q_MAX = 32;
  let clock = 0, vis = true, n = 0, gstate = 'hidden', lastFlow = 0, boostRdy = false, flashT = 0, lastDraw = 0;
  let spans = null, pipEls = null, fill = null, duskFill = null, duskBead = null, host = null, el = null, ec = null;
  const gv = (k) => cfg[k] ?? KEYS[k].def;
  const reduced = (vs) => !!(cfg.lookReducedMotion === 1 || (vs && vs.reduced));
  let rm = false;

  if (doc) {
    if (!doc.getElementById('b4-hud')) { const s = doc.createElement('style'); s.id = 'b4-hud'; s.textContent = CSS; doc.head.appendChild(s); }
    host = ctx.root;
    el = doc.createElement('div'); el.className = 'b4h';
    el.innerHTML = '<div class="b4h-top"><div class="b4h-card"><div class="b4h-k">Distance</div><div class="b4h-v">0 m</div></div><div class="b4h-card"><div class="b4h-k">Speed</div><div class="b4h-v">0 m/s</div></div><div class="b4h-card hidden"><div class="b4h-k">Gap</div><div class="b4h-v">-</div></div></div>' +
      '<div class="b4h-bar"><div class="b4h-tw"><div class="b4h-track"><div class="b4h-fill"></div></div><span class="b4h-lab">BOOST</span></div><div class="b4h-flow">' + '<i class="b4h-pip"></i>'.repeat(5) + '</div></div><div class="b4h-dusk" hidden><i></i><u></u></div>';
    host.appendChild(el);
    const cs = el.querySelectorAll('.b4h-card');
    cards[0].el = cs[0]; cards[1].el = cs[1]; cards[2].el = cs[2]; cards[3].el = el.querySelector('.b4h-bar'); cards[4].el = el.querySelector('.b4h-flow');
    spans = [...cs].map((c) => c.querySelector('.b4h-v'));
    pipEls = [...el.querySelectorAll('.b4h-pip')];
    fill = el.querySelector('.b4h-fill');
    duskFill = el.querySelector('.b4h-dusk i'); duskBead = el.querySelector('.b4h-dusk u');
    doc.body.classList.add('b4-hud');
    ec = createEndCard(host);
  } else ec = createEndCard(null);

  function wake(ci) { const c = cards[ci]; c.awake = clock + c.hold / 1000; }
  function push(ci, y, r, s, delay) {
    const c = cards[ci];
    wake(ci);
    if (rm) return;
    if (gv('lookHudMinimal') && ci > 0 && ci < 3) { ci = 0; r *= 0.5; }
    if (queue.length >= Q_MAX) queue.shift();
    queue.push({ at: clock + (delay == null ? cards[ci].d : delay) / 1000, ci, y, r, s });
  }
  function kickAll(yAmp, rAmp, s) { for (let i = 0; i < 5; i++) push(i, yAmp * (i === 3 ? 1 : 1), rAmp * cards[i].sg, s || 0); }
  function applyKick(q) {
    const c = cards[q.ci], str = gv('lookHudSpring');
    if (q.y) c.y.v += peakToV(q.y * str, c.k, c.z) * Math.sign(q.y);
    if (q.r) c.r.v += peakToV(Math.abs(q.r) * str, c.k, c.z) * Math.sign(q.r);
    if (q.s) c.s.v += peakToV(Math.abs(q.s) * str, c.k, Math.max(0.2, c.z - 0.1)) * Math.sign(q.s);
  }

  function fx(ev) {
    if (!ev) return;
    switch (ev.type) {
      case 'run_start': for (let i = 0; i < 5; i++) wake(i); break;
      case 'launch': for (let i = 0; i < 5; i++) push(i, -4, 1.2 * cards[i].sg, 0); break;
      case 'land': {
        const g = GRADE[ev.grade] ?? 0.5;
        for (let i = 0; i < 5; i++) push(i, LAND_AMP[i][0] * g, LAND_AMP[i][1] * g * cards[i].sg, 0);
        if (g >= 0.85) flashT = clock + 0.35; // warm gold, never aqua
        break;
      }
      case 'flow_up': case 'flow': push(4, -3, 2, 0.12); break;
      case 'flow_drop': push(4, 6, -3, 0); break;
      case 'boost': push(3, -3, 0, 0.03); push(1, -4, 0, 0, 40); break;
      case 'miss': case 'tumble_start': case 'caught': case 'run_over': for (let i = 0; i < 5; i++) push(i, 9, 2.5 * cards[i].sg, 0); flashT = clock + 0.35; break;
      case 'milestone': case 'hull_unlock': push(0, -5, 2 * cards[0].sg, 0.08); break;
      case 'night_stage': push(2, 6, -2, 0.05); break;
      default: break;
    }
  }

  function update(dt, vs) {
    if (!vs) return;
    clock += dt; n = vs.n || 0; rm = reduced(vs);
    const min = !!gv('lookHudMinimal');
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].at <= clock) { applyKick(queue[i]); queue.splice(i, 1); }
    const boostNow = (vs.boost || 0) >= 0.25;
    if (boostNow && !boostRdy) wake(3);
    boostRdy = boostNow;
    const fl = Math.max(0, Math.min(5, vs.flow | 0));
    if (fl > lastFlow) fx({ type: 'flow_up' }); else if (fl < lastFlow) fx({ type: 'flow_drop' });
    lastFlow = fl;
    const gs = gapState(vs.gap);
    if (gs !== gstate) { if (gstate !== 'hidden') wake(2); gstate = gs; }
    if (gs === 'heels') wake(2);
    const floor = fadeFloor(n, cfg);
    let moving = false;
    for (let i = 0; i < 5; i++) {
      const c = cards[i];
      if (!rm) {
        springStep(c.y, 0, c.k, c.z, dt); springStep(c.r, 0, c.k, c.z, dt); springStep(c.s, 0, c.k, Math.max(0.2, c.z - 0.1), dt);
        if (!settled(c.y) || !settled(c.r) || !settled(c.s, 0.001)) moving = true;
        else { c.y.x = c.y.v = c.r.x = c.r.v = c.s.x = c.s.v = 0; }
      } else { c.y.x = c.r.x = c.s.x = c.y.v = c.r.v = c.s.v = 0; }
      const awake = clock < c.awake || (i === 3 && boostNow) || (i === 2 && gs === 'heels');
      c.f = fadeStep(c.f, awake ? 1 : floor, dt, rm);
    }
    if (el) draw(vs, min, gs);
    return moving;
  }

  function draw(vs, min, gs) {
    const mode = el.classList;
    mode.toggle('min', min);
    for (let i = 0; i < 5; i++) {
      const c = cards[i];
      const tf = rm ? '' : 'translate3d(0,' + c.y.x.toFixed(2) + 'px,0) rotate(' + c.r.x.toFixed(2) + 'deg) scale(' + (1 + c.s.x).toFixed(3) + ')';
      const key = tf + '|' + c.f.toFixed(3);
      if (key !== c.last) { c.last = key; c.el.style.transform = tf; c.el.style.opacity = c.f.toFixed(3); }
    }
    const t = (v, i) => { if (spans[i].textContent !== v) spans[i].textContent = v; };
    t(Math.round(vs.dist || 0).toLocaleString('en-US') + ' m', 0);
    t(Math.round(vs.speed || 0) + ' m/s', 1);
    const gc = cards[2].el;
    const gcls = gs === 'hidden' ? 'b4h-card hidden' : 'b4h-card ' + gs + (clock < flashT ? ' flash' : '');
    if (gc.className !== gcls) gc.className = gcls;
    if (gs !== 'hidden') t(Math.round(vs.gap) + ' m', 2);
    const b = Math.max(0, Math.min(1, vs.boost || 0));
    const bw = Math.round(b * 100) + '%';
    if (fill.style.width !== bw) { fill.style.width = bw; fill.style.background = boostColor(b); }
    const fl = Math.max(0, Math.min(5, vs.flow | 0));
    for (let i = 0; i < 5; i++) pipEls[i].classList.toggle('lit', i < fl);
    const duskOn = gs !== 'hidden';
    el.lastChild.hidden = !duskOn;
    if (duskOn) { const p = (gapFrac(vs.gap) * 100).toFixed(1) + '%'; duskFill.style.width = p; duskBead.style.left = p; }
  }

  function show(on) { vis = !!on; if (el) el.style.display = vis ? '' : 'none'; if (doc) doc.body.classList.toggle('b4-hud', vis); }
  return {
    update, fx, show,
    shift() {}, setQuality() {},
    endCard: (o, cbs) => { show(false); return ec.open(o, cbs); },
    hideEnd: () => { ec.close(); show(true); },
    endPress: (a, now) => ec.press(a, now),
    stats: () => ({ visible: vis, gap: gstate, pending: queue.length, floor: fadeFloor(n, cfg), cards: cards.map((c) => ({ n: c.n, y: c.y.x, r: c.r.x, s: c.s.x, f: c.f })), endOpen: ec.isOpen() }),
    dispose() { if (el) el.remove(); ec.close(); if (doc) doc.body.classList.remove('b4-hud'); },
  };
}
