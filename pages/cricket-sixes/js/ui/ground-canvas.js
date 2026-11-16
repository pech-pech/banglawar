/* ground-canvas: the hub's "living ground" (Hub L2). drawGround(host, opts) paints one pixel-sharp canvas behind the hub DOM
   (grass, scoreboard posts, oval + pitch + tiny players, trees, and the real kit buildings in the six slots) and adds the
   transparent tap buttons. Kit globals SPR / ISO / PAL come from kit/*.js like club-canvas.js. Still frame, no timers.
   host   = .hb-ground. It measures .hb-board, .hb-field, .hb-bubble and each .hb-slot (.hb-bld + .hb-plate).
   opts   = { levels: econ.fac (0..5), locked: { workshop, fans }, onTap(id, name, level) }
   returns { scale, rects, redraw(), destroy() } (scale/rects are live getters), or null when there is no window/canvas.
   layoutField(field, sc) is pure: see below. Slot props (board / workshop / tent) come from ground-props.js. */
import { drawProp, propSize } from './ground-props.js';

/* Pixel bbox of each kit building drawn at gx=gy=0: [x0, x1, y0, y1] relative to the ISO origin (measured from kit/sprites.js, levels 1..5).
   Keep in step with kit/sprites.js if the art changes. */
const BB = {
  stands: [[-16, 32, -9, 24], [-16, 32, -13, 24], [-18, 34, -26, 24], [-18, 34, -30, 24], [-18, 39, -30, 24]],
  shop: [[-20, 20, -17, 17], [-20, 20, -20, 17], [-20, 20, -23, 17], [-20, 20, -27, 17], [-20, 20, -31, 17]],
  academy: [[-20, 28, -18, 20], [-20, 28, -27, 20], [-20, 28, -32, 20], [-20, 31, -37, 24], [-20, 31, -47, 24]],
  nets: [[-17, 25, -13, 20], [-17, 25, -13, 20], [-17, 25, -13, 20], [-18, 26, -16, 20], [-18, 26, -16, 20]],
  gym: [[-18, 18, -18, 17], [-18, 18, -21, 17], [-18, 18, -28, 17], [-18, 22, -32, 19], [-18, 22, -36, 19]],
  scout: [[-20, 17, -26, 17], [-20, 17, -31, 17], [-20, 17, -36, 17], [-20, 18, -41, 17], [-20, 18, -46, 17]],
  pitch: [[-47, 14, 0, 31], [-47, 14, 0, 31], [-55, 14, 0, 35], [-55, 14, -17, 46], [-55, 14, -17, 46]],
};
const FIELD_IDS = ['pitch', 'scout', 'gym', 'nets'];
const NAMES = { pitch: 'Pitch', nets: 'Nets', gym: 'Gym', scout: 'Scout' };
const MIN_TAP = 56;       // css px
const BUBBLE_ZONE = 60;   // css px: bottom of the field, right half, kept free of facility taps (the fan bubble sits there)

const lvOf = (levels, id) => Math.max(1, Math.min(5, Number(levels && levels[id]) | 0 || 1));
function box(id, lv) { // art size of a building at a level
  const b = BB[id][lv - 1];
  return { w: b[1] - b[0] + 1, h: b[3] - b[2] + 1, cx: (b[0] + b[1]) / 2, y1: b[3] + 1 };
}
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r, f) => r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h;
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
function rectOf(r) { // accepts {x,y,w,h} | {left,top,width,height}
  return { x: num(r.x, num(r.left, 0)), y: num(r.y, num(r.top, 0)), w: num(r.w, num(r.width, 0)), h: num(r.h, num(r.height, 0)) };
}

/** @deprecated (H2) replaced by drawBanner; kept exported one release for the hub-l2.test pure tests, then deleted. */
/** Plan the four live field facilities. All maths in art px; field/avoid are css rects, output css rects (x,y,w,h = art * sc).
 *  Returns { items: [{ id, lv, cx, by, art:{x,y,w,h}, tap:{x,y,w,h} }], ok, clean } (art coordinates). */
export function planField(field, sc, levels, avoidCss, softCss) {
  sc = Math.max(1, Math.floor(sc) || 1);
  const f = rectOf(field);
  const F = { x: Math.ceil(f.x / sc), y: Math.ceil(f.y / sc) };
  F.w = Math.floor((f.x + f.w) / sc) - F.x; F.h = Math.floor((f.y + f.h) / sc) - F.y;
  const toArt = (r) => { const q = rectOf(r), x = Math.floor(q.x / sc), y = Math.floor(q.y / sc); return { x, y, w: Math.ceil((q.x + q.w) / sc) - x, h: Math.ceil((q.y + q.h) / sc) - y }; };
  const zh = Math.ceil(BUBBLE_ZONE / sc);
  const hard = [{ x: F.x + Math.floor(F.w / 2), y: F.y + F.h - zh, w: F.w - Math.floor(F.w / 2), h: zh }].concat((avoidCss || []).map(toArt));
  const soft = hard.concat((softCss || []).map(toArt));
  const minA = Math.ceil(MIN_TAP / sc);
  const lvs = levels || (field && field.levels) || {};
  const items = FIELD_IDS.map((id) => {
    const lv = lvOf(lvs, id), b = box(id, lv);
    const tw = Math.max(b.w, minA), th = minA;
    return { id, lv, b, tw, th };
  });
  const M = 2;
  let placed = [], out = [], ok = true, clean = true;
  const mk = (it, ax, ay) => { // ax, ay = art rect top-left
    const art = { x: ax, y: ay, w: it.b.w, h: it.b.h };
    const tx = Math.round(ax + it.b.w / 2 - it.tw / 2);
    return { art, tap: { x: tx, y: ay + it.b.h - it.th, w: it.tw, h: it.th } };
  };
  const anchors = {
    pitch: (it) => [[F.x + Math.round((F.w - it.b.w) / 2), F.y + Math.round((F.h - it.b.h) / 2)]],
    scout: (it) => [[F.x + M, F.y + M]],
    gym: (it) => [[F.x + F.w - it.b.w - M, F.y + M]],
    nets: (it) => [[F.x + M, F.y + F.h - it.b.h - M]],
  };
  const run = (order) => {
  placed = []; out = []; ok = true; clean = true; let score = 0;
  order.forEach((id) => {
    const it = items.find((q) => q.id === id);
    const a0 = anchors[id](it)[0];
    const okAt = (ax, ay, relaxed) => {
      const c = mk(it, ax, ay);
      if (!inside(c.tap, F)) return null;
      if (hard.some((h) => hit(c.tap, h))) return null;
      if (placed.some((p) => hit(c.tap, p.tap))) return null;
      // the pitch (strip, rope ends, player spots) is a hard keep-out for every other facility's art, at every relax level
      if (placed.some((p) => (id === 'pitch' || p.id === 'pitch') && hit(c.art, { x: p.art.x - 2, y: p.art.y - 2, w: p.art.w + 4, h: p.art.h + 4 }))) return null;
      if (relaxed < 3 && !inside(c.art, F)) return null;
      if (relaxed < 2 && placed.some((p) => hit(c.art, p.art))) return null;
      if (relaxed < 1 && soft.some((h) => hit(c.art, h))) return null;
      return c;
    };
    let got = null, soft1 = true;
    for (const relaxed of [0, 1, 2, 3]) {
      got = okAt(a0[0], a0[1], relaxed);
      for (const step of got ? [] : [3, 1]) {
        let best = 1e12;
        for (let y = F.y - it.b.h; y <= F.y + F.h; y += step) for (let x = F.x; x <= F.x + F.w - it.b.w; x += step) {
          const d = (x - a0[0]) * (x - a0[0]) + (y - a0[1]) * (y - a0[1]);
          if (d >= best) continue;
          const c = okAt(x, y, relaxed);
          if (c) { best = d; got = c; }
        }
        if (got) break;
      }
      if (got) { soft1 = relaxed === 0; score += relaxed; break; }
    }
    if (!got) { ok = false; return; }
    if (!soft1) clean = false;
    placed.push({ id, art: got.art, tap: got.tap });
    out.push({ id, lv: it.lv, b: it.b, art: got.art, tap: got.tap });
  });
  return ok ? score : 1e9;
  };
  const sB = run(['pitch', 'scout', 'gym', 'nets']), resB = { placed, out, ok, clean };
  const sA = run(['scout', 'gym', 'nets', 'pitch']);
  if (sB <= sA) { placed = resB.placed; out = resB.out; ok = resB.ok; clean = resB.clean; }
  if (!ok) { // guaranteed fallback: min-size taps in one row along the top of the field, clear of the bubble zone
    const order = ['scout', 'nets', 'pitch', 'gym'], n = order.length, w = minA, rowY = F.y + Math.max(0, Math.min(F.h - zh, F.h) - minA);
    const gap = Math.max(0, Math.floor((F.w - n * w) / (n + 1)));
    out.length = 0;
    order.forEach((id, i) => {
      const it = items.find((q) => q.id === id), x = F.x + gap + i * (w + gap), tap = { x, y: Math.max(F.y, Math.min(rowY, F.y + F.h - minA)), w, h: minA };
      const tw = Math.min(it.tw, w);
      out.push({ id, lv: it.lv, b: it.b, art: { x: Math.round(x + w / 2 - it.b.w / 2), y: tap.y + tap.h - it.b.h, w: it.b.w, h: it.b.h }, tap: { x: tap.x, y: tap.y, w: Math.max(tw, w), h: tap.h } });
    });
    clean = false;
  }
  return { items: out, ok, clean, F };
}

/** @deprecated (H2) replaced by drawBanner; kept exported one release for the hub-l2.test pure tests, then deleted. */
/** PURE. field = { x, y, w, h } (css px, same space as the result; also accepts left/top/width/height; optional levels {id:0..5}).
 *  sc = css px per art px (whole number). Returns [{ id, x, y, w, h }] css rects for pitch, scout, gym, nets:
 *  each >= 56x56, inside the field, no overlaps, and clear of the bottom 60 css px of the right half (the fan bubble). */
export function layoutField(field, sc) {
  sc = Math.max(1, Math.floor(sc) || 1);
  const p = planField(field, sc, null, null, null);
  return p.items.map((q) => ({ id: q.id, x: q.tap.x * sc, y: q.tap.y * sc, w: q.tap.w * sc, h: q.tap.h * sc }));
}

function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/** @deprecated (H2) replaced by drawBanner; kept exported one release for the hub-l2.test pure tests, then deleted. */
export function drawGround(host, opts) {
  const w = typeof window !== 'undefined' ? window : null;
  if (!host || !w || !w.SPR || !w.ISO || !w.PAL || typeof document === 'undefined' || typeof host.querySelector !== 'function') return null;
  opts = opts || {};
  if (host.__ground) host.__ground.destroy();
  const state = { scale: 2, rects: [], ro: null, raf: 0, dead: false, key: '' };

  function measure() {
    const hr = host.getBoundingClientRect();
    const rel = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - hr.left - (host.clientLeft || 0), y: r.top - hr.top - (host.clientTop || 0), w: r.width, h: r.height }; };
    const slots = [].map.call(host.querySelectorAll('.hb-slot'), (s) => {
      const plate = s.querySelector('.hb-plate');
      return { slot: s.getAttribute('data-slot') || '', bld: rel(s.querySelector('.hb-bld')), plate: rel(plate), act: plate ? plate.getAttribute('data-act') : null, plateEl: plate };
    }).filter((s) => s.bld);
    return { W: host.clientWidth, H: host.clientHeight, slots, field: rel(host.querySelector('.hb-field')), board: rel(host.querySelector('.hb-board')), bubble: rel(host.querySelector('.hb-bubble')) };
  }

  /* what is drawn in each slot: [kind, id, level] */
  function slotArt(slot, levels, locked) {
    const tier = lvOf(levels, 'stands');
    switch (slot) {
      case 'table': return { prop: 'board', tier };
      case 'stadium': return { bld: 'stands', lv: lvOf(levels, 'stands') };
      case 'extras': return { bld: 'shop', lv: lvOf(levels, 'shop') };
      case 'book': return { bld: 'academy', lv: lvOf(levels, 'academy') };
      case 'workshop': return { prop: 'workshop', tier, locked: !!(locked && locked.workshop) };
      case 'fans': return { prop: 'tent', tier, locked: !!(locked && locked.fans) };
      default: return null;
    }
  }
  function artSize(a) {
    if (a.bld) { const b = box(a.bld, a.lv); return { w: b.w, h: b.h }; }
    return propSize(a.prop, a.tier);
  }

  function plan(m, sc) {
    const levels = opts.levels || {};
    const slots = m.slots.map((s) => {
      const a = slotArt(s.slot, levels, opts.locked);
      if (!a) return null;
      const sz = artSize(a), by = Math.round((s.plate ? s.plate.y : s.bld.y + s.bld.h) / sc);
      const cx = Math.round((s.bld.x + s.bld.w / 2) / sc);
      return { s, a, sz, cx, by, art: { x: cx - Math.floor(sz.w / 2), y: by - sz.h, w: sz.w, h: sz.h } };
    }).filter(Boolean);
    const F = m.field || { x: 0, y: 0, w: m.W, h: m.H };
    const softCss = slots.map((q) => ({ x: q.art.x * sc, y: q.art.y * sc, w: q.art.w * sc, h: q.art.h * sc }));
    const avoid = m.bubble ? [m.bubble] : [];
    const fp = planField(Object.assign({}, F, { levels: opts.levels }), sc, opts.levels, avoid, softCss);
    const slotsFit = slots.every((q) => q.sz.w * sc <= q.s.bld.w && q.sz.h * sc <= q.s.bld.h + (['table', 'stadium', 'extras'].includes(q.s.slot) ? Math.max(0, q.s.bld.y - (m.board ? m.board.y + m.board.h : 0) - 2) : q.s.bld.h * 0.48));
    return { slots, fp, slotsFit };
  }

  function redraw() { // never throws: a failed paint leaves the DOM plates working
    try { paint(); } catch (e) {
      state.key = '';
      if (!state.warned && typeof console !== 'undefined') { state.warned = true; console.warn('ground-canvas: draw skipped', e && e.message); }
    }
  }
  function paint() {
    if (state.dead) return;
    const m = measure();
    if (!m.W || !m.H) return;
    const key = JSON.stringify([m.W, m.H, m.slots.map((s) => [s.bld.x, s.bld.y, s.bld.w, s.plate && s.plate.y, s.act]), m.field, m.board, m.bubble]);
    if (key === state.key) return;
    state.key = key;
    const { SPR, ISO, PAL: P } = w;
    let sc = 2, pl = null;
    const tries = (m.W >= 600 ? [3, 2] : [2]);
    for (const t of tries) { const c = plan(m, t); if (c.fp.ok && (t !== 3 || c.slotsFit)) { sc = t; pl = c; break; } }
    if (!pl) { sc = 2; pl = plan(m, 2); }
    state.scale = sc;
    const AW = Math.ceil(m.W / sc), AH = Math.ceil(m.H / sc);
    let cv = host.querySelector('canvas.hb-gcv');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'hb-gcv'; cv.setAttribute('aria-hidden', 'true'); host.insertBefore(cv, host.firstChild); }
    cv.style.cssText = 'position:absolute;left:0;top:0;z-index:0;pointer-events:none;image-rendering:pixelated;display:block';
    const scn = ISO.makeScene(cv, { internalW: AW, internalH: AH, scale: sc });
    const ctx = scn.ctx;
    host.classList.toggle('is-roomy', sc >= 3);

    // grass with a light dither
    scn.clear(P.grass2);
    for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) { const q = hash(x, y); if (q < 0.025) ISO.px(ctx, x, y, 1, 1, P.grass3); else if (q < 0.045) ISO.px(ctx, x, y, 1, 1, P.grass1); }
    // scoreboard posts under the board
    if (m.board) {
      const bx = Math.round(m.board.x / sc), br = Math.round((m.board.x + m.board.w) / sc), bb = Math.round((m.board.y + m.board.h) / sc);
      [bx + 8, br - 10].forEach((x) => { ISO.px(ctx, x - 1, bb - 2, 4, 16, P.outline); ISO.px(ctx, x, bb - 2, 2, 16, P.wood); });
    }
    // field oval (centre of the field) + pitch + players
    const F = pl.fp.F, ocx = F.x + Math.round(F.w / 2), ocy = F.y + Math.round(F.h / 2);
    const stripeB = SPR.mix ? SPR.mix(P.grass1, P.grass2, 0.3) : P.grass2;
    ISO.setOrigin(ocx, ocy);
    ISO.ellipseField(ctx, 0, 0, 4, 4, { radiusX: Math.max(10, Math.floor(F.w / 2) - 1), radiusY: Math.max(6, Math.floor(F.h / 2) - 1), a: P.grass1, b: stripeB, band: 10 });

    const it = {}; pl.fp.items.forEach((q) => { it[q.id] = q; });
    const place = (id, lv, cx, by) => { const b = box(id, lv); ISO.setOrigin(Math.round(cx - b.cx), Math.round(by - b.y1)); SPR.building(id, ctx, 0, 0, lv); };
    const at = (depth, fn) => ISO.add({ gx: 0, gy: 0, w: 0, d: 0, depth, draw: fn });
    const keepOut = pl.fp.items.map((q) => q.art).concat(pl.slots.map((q) => q.art));
    if (m.bubble) keepOut.push({ x: Math.floor(m.bubble.x / sc), y: Math.floor(m.bubble.y / sc), w: Math.ceil(m.bubble.w / sc) + 1, h: Math.ceil(m.bubble.h / sc) + 6 });
    const free = (r) => !keepOut.some((k) => hit(r, k)) && r.x >= 0 && r.x + r.w <= AW;

    // the pitch is flat: draw it straight away; the rest is depth sorted
    const pi = it.pitch;
    if (pi) {
      place('pitch', pi.lv, pi.art.x + pi.art.w / 2, pi.art.y + pi.art.h);
      const b = box('pitch', pi.lv), ox = Math.round(pi.art.x + pi.art.w / 2 - b.cx), oy = Math.round(pi.art.y + pi.art.h - b.y1), pcx = ox - 16, pcy = oy + 16;
      [[pcx + 6, pcy - 4, 'A', 'bat', 'helmet', 1], [pcx - 12, pcy + 8, 'B', 'bowl', 'cap', 2]].forEach((q) => {
        at(q[1], (c) => SPR.player(c, q[0], q[1], { kit: q[2], pose: q[3], hat: q[4], skin: q[5], hair: 1, facing: 'r', frame: 0 }));
      });
    }
    // fielders round the oval, skipping anything that would sit on a building or the bubble
    const rx = Math.floor(F.w / 2) - 10, ry = Math.floor(F.h / 2) - 8;
    for (let k = 0; k < 9; k++) {
      const ang = (k / 9) * Math.PI * 2 + 0.4, x = Math.round(ocx + Math.cos(ang) * rx * 0.86), y = Math.round(ocy + Math.sin(ang) * ry * 0.86) + 6;
      const r = { x: x - 7, y: y - 20, w: 14, h: 22 };
      if (pi && hit(r, { x: pi.art.x - 2, y: pi.art.y - 2, w: pi.art.w + 4, h: pi.art.h + 4 })) continue;
      if (!free(r)) continue;
      at(y, (c) => SPR.player(c, x, y, { kit: 'B', pose: 'idle', hat: k % 2 ? 'cap' : 'none', skin: 1 + (k % 3), hair: 1 + (k % 2), facing: 'r', frame: 0 }));
    }
    // trees at the edges of the field
    [[6, F.y + Math.round(F.h * 0.55), 0], [AW - 7, F.y + Math.round(F.h * 0.4), 0], [4, F.y - 4, 1], [AW - 5, F.y - 2, 1]].forEach((t) => {
      const s = t[2] ? 1 : 1, r = { x: t[0] - 9, y: t[1] - 22, w: 18, h: 24 };
      if (t[1] < 20 || !free(r)) return;
      at(t[1], (c) => SPR.tree(c, t[0], t[1], { size: s }));
    });
    // buildings: facilities + slot art, all depth sorted by their bottom edge
    ['scout', 'gym', 'nets'].forEach((id) => { const q = it[id]; if (q) at(q.art.y + q.art.h, () => place(id, q.lv, q.art.x + q.art.w / 2, q.art.y + q.art.h)); });
    pl.slots.forEach((q) => {
      at(q.by, (c) => {
        if (q.a.bld) place(q.a.bld, q.a.lv, q.cx, q.by);
        else { ISO.setOrigin(0, 0); drawProp(c, q.a.prop, q.cx, q.by, { tier: q.a.tier, locked: q.a.locked, P }); }
      });
    });
    ISO.flush(ctx);

    // buttons
    [].forEach.call(host.querySelectorAll('button.hb-fac'), (b) => b.remove());
    const rects = [];
    pl.fp.items.forEach((q) => {
      const r = { id: q.id, x: q.tap.x * sc, y: q.tap.y * sc, w: q.tap.w * sc, h: q.tap.h * sc };
      rects.push(r);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hb-fac'; b.setAttribute('data-id', q.id);
      const lv = Math.max(0, Number(opts.levels && opts.levels[q.id]) | 0);
      b.setAttribute('aria-label', NAMES[q.id] + ', ' + (lv > 0 ? 'level ' + lv : 'not built'));
      b.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px';
      if (opts.onTap) b.addEventListener('click', () => opts.onTap(q.id, NAMES[q.id], lv));
      host.appendChild(b);
    });
    pl.slots.forEach((q) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hb-fac'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true');
      b.setAttribute('data-slot', q.s.slot);
      if (q.s.act) b.setAttribute('data-act', q.s.act);
      b.style.cssText = 'left:' + q.s.bld.x + 'px;top:' + q.s.bld.y + 'px;width:' + q.s.bld.w + 'px;height:' + q.s.bld.h + 'px';
      host.appendChild(b);
    });
    state.rects = rects;
  }

  function schedule() {
    if (state.raf || state.dead) return;
    const raf = w.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
    state.raf = raf(() => { state.raf = 0; redraw(); });
  }
  const api = {
    get scale() { return state.scale; }, get rects() { return state.rects.slice(); },
    redraw() { state.key = ''; redraw(); },
    destroy() { state.dead = true; if (state.ro) state.ro.disconnect(); if (host.__ground === api) host.__ground = null; },
  };
  host.__ground = api;
  redraw();
  if (typeof w.ResizeObserver === 'function') {
    state.ro = new w.ResizeObserver(schedule);
    state.ro.observe(host);
    const f = host.querySelector('.hb-field'); if (f) state.ro.observe(f);
  }
  return api;
}

/** PURE. Deterministic crowd fill: seats of the w x h art rect at (x0,y0) that hold a fan at pct (0..100).
 *  A seat is filled when hash(x,y) < pct/100, so the set only grows as pct grows. Returns [[x,y,tone 0..2]]. */
export function crowdCells(x0, y0, w, h, pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0)) / 100, out = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const q = hash(x0 + x + 7, y0 + y + 3);
    if (q < p) out.push([x0 + x, y0 + y, Math.floor(hash(x0 + x, y0 + y) * 3)]);
  }
  return out;
}

/** Hub banner (H2): grass + the current stand + a crowd filled to gate.pct + a dashed chalk ghost of the next stand.
 *  host = .hb-banner. Measures .hb-gb (tag), .hb-band and .hb-week as keep-out rects (like m.bubble before). Still frame, no timers,
 *  creates NO .hb-fac buttons (the only tap is the DOM button.hb-gb). opts = { stadium, levels, gate: fansGateVM, reducedMotion }.
 *  returns { redraw(), destroy(), rects } (rects = live keep-out css rects) or null without window/SPR. Never throws. */
export function drawBanner(host, opts) {
  try {
    const w = typeof window !== 'undefined' ? window : null;
    if (!host || !w || !w.SPR || !w.ISO || !w.PAL || typeof document === 'undefined' || typeof host.querySelector !== 'function') return null;
    opts = opts || {};
    if (host.__banner) host.__banner.destroy();
    const state = { rects: [], ro: null, raf: 0, dead: false, key: '' };
    const measure = () => {
      const hr = host.getBoundingClientRect();
      const rel = (sel) => { const el = host.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - hr.left - (host.clientLeft || 0), y: r.top - hr.top - (host.clientTop || 0), w: r.width, h: r.height }; };
      return { W: host.clientWidth, H: host.clientHeight, keep: ['.hb-gb', '.hb-band', '.hb-week'].map(rel).filter(Boolean) };
    };
    function paint() {
      if (state.dead) return;
      const m = measure();
      if (!m.W || !m.H) return;
      const key = JSON.stringify([m.W, m.H, m.keep, opts.stadium, opts.levels, opts.gate && [opts.gate.pct, opts.gate.hidden]]);
      if (key === state.key) return;
      state.key = key;
      const { SPR, ISO, PAL: P } = w;
      const sc = m.W >= 600 ? 3 : 2, AW = Math.ceil(m.W / sc), AH = Math.ceil(m.H / sc);
      let cv = host.querySelector('canvas.hb-bcv');
      if (!cv) { cv = document.createElement('canvas'); cv.className = 'hb-bcv'; cv.setAttribute('aria-hidden', 'true'); host.insertBefore(cv, host.firstChild); }
      cv.style.cssText = 'position:absolute;left:0;top:0;z-index:0;pointer-events:none;image-rendering:pixelated;display:block';
      const scn = ISO.makeScene(cv, { internalW: AW, internalH: AH, scale: sc });
      const ctx = scn.ctx;
      scn.clear(P.grass2);
      for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) { const q = hash(x, y); if (q < 0.025) ISO.px(ctx, x, y, 1, 1, P.grass3); else if (q < 0.045) ISO.px(ctx, x, y, 1, 1, P.grass1); }
      const lv = lvOf(opts.levels, 'stands'), gate = opts.gate || { pct: 0, hidden: true };
      const b = box('stands', lv);
      // keep-out in art px; the stands sit on the lowest free baseline, left of centre so the ghost fits on the right
      const keep = m.keep.map((r) => ({ x: Math.floor(r.x / sc), y: Math.floor(r.y / sc), w: Math.ceil(r.w / sc) + 1, h: Math.ceil(r.h / sc) + 1 }));
      const bandTop = keep.reduce((t, k) => (k.y > AH / 2 ? Math.min(t, k.y) : t), AH);
      const by = Math.max(b.h + 2, Math.min(AH - 2, bandTop - 2));
      const cx = Math.round(Math.max(b.w / 2 + 2, Math.min(AW - b.w / 2 - 2, AW * (gate.hidden ? 0.5 : 0.36))));
      const ox = Math.round(cx - b.cx), oy = Math.round(by - b.y1);
      ISO.setOrigin(ox, oy);
      SPR.building('stands', ctx, 0, 0, lv);
      ISO.setOrigin(0, 0);
      // crowd on the lower stand rows, filled to gate.pct
      const sx = cx - Math.floor(b.w / 2) + 3, sw = b.w - 6, sh = Math.max(4, Math.floor(b.h / 3)), sy = by - sh - 2;
      const tones = [P.white || '#fff', P.red || P.outline, P.sky || P.grass1];
      crowdCells(sx, sy, sw, sh, gate.pct).forEach((c) => ISO.px(ctx, c[0], c[1], 1, 1, tones[c[2]] || tones[0]));
      // dashed chalk ghost of the next stand
      if (!gate.hidden && lv < 5) {
        const g = box('stands', lv + 1), gx = Math.min(AW - g.w - 2, cx + Math.ceil(b.w / 2) + 4), gy = by - g.h;
        const ch = P.white || '#fff';
        for (let i = 0; i < g.w; i += 4) { ISO.px(ctx, gx + i, gy, 2, 1, ch); ISO.px(ctx, gx + i, gy + g.h - 1, 2, 1, ch); }
        for (let j = 0; j < g.h; j += 4) { ISO.px(ctx, gx, gy + j, 1, 2, ch); ISO.px(ctx, gx + g.w - 1, gy + j, 1, 2, ch); }
      }
      ISO.flush(ctx);
      state.rects = m.keep.map((r) => Object.assign({}, r));
    }
    function redraw() {
      try { paint(); } catch (e) {
        state.key = '';
        if (!state.warned && typeof console !== 'undefined') { state.warned = true; console.warn('ground-canvas: banner skipped', e && e.message); }
      }
    }
    function schedule() {
      if (state.raf || state.dead) return;
      const raf = w.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
      state.raf = raf(() => { state.raf = 0; redraw(); });
    }
    const api = {
      get rects() { return state.rects.slice(); },
      redraw() { state.key = ''; redraw(); },
      destroy() { state.dead = true; if (state.ro) state.ro.disconnect(); if (host.__banner === api) host.__banner = null; },
    };
    host.__banner = api;
    redraw();
    if (typeof w.ResizeObserver === 'function') { state.ro = new w.ResizeObserver(schedule); state.ro.observe(host); }
    return api;
  } catch (e) { return null; }
}
