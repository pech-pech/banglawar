// screens.js: PL.Screens = layout(w,h,leftHand,opts) -> named rects per screen, draw.<screen>(ctx,w,h,vm,t), hit().
// Load order: strings, uikit, screens (before ui.js). No DOM. Pad rects come from padRects(); swap it for PL.Input.layout when it lands.
const PL = (globalThis.PL = globalThis.PL || {});
(function () {
  'use strict';
  const U = PL.UI, S = PL.Strings.player, C = U.C, T = U.T;
  const R = (x, y, w, h) => ({ x, y, w, h });
  const mir = (r, w) => R(w - r.x - r.w, r.y, r.w, r.h);
  const cls = (w, h) => (w > h * 1.15 ? 'C' : w < 400 ? 'B' : 'A');
  const HINT_H = 28; // strip under a scrolling list that holds the scroll chevron
  const cardW = (w) => (w < 400 ? 300 : 340);

  // ---- pad: boxes from review-ux s2 (A 291-471 x 310-490, B 82-262 x 650-830, C 606-786 x 330-510). SWAP POINT. ----
  // Returns {box, up, left, dive, right, down}; arrows are 60 cells that tile the box, dive is 56 centred (4 px gaps).
  function padRects(w, h, left) {
    const k = cls(w, h); let x0, y0;
    if (k === 'C') { x0 = w - 210; y0 = 330; } else if (k === 'B') { x0 = Math.round((w - 180) / 2); y0 = h - 232; } else { x0 = w - 184; y0 = h - 328; }
    const p = { box: R(x0, y0, 180, 180), up: R(x0 + 60, y0, 60, 60), left: R(x0, y0 + 60, 60, 60), dive: R(x0 + 62, y0 + 62, 56, 56),
      right: R(x0 + 120, y0 + 60, 60, 60), down: R(x0 + 60, y0 + 120, 60, 60) };
    p.dive = R(x0 + 62, y0 + 62, 56, 56); p.down = R(x0 + 60, y0 + 120, 60, 60);
    if (left) { const dx = w - 2 * x0 - 180; for (const n in p) p[n] = R(p[n].x + dx, p[n].y, p[n].w, p[n].h); } // shift only: arrow meanings never swap
    return p;
  }

  // ---- play-family rects (play, tutorial, death, roomClear share these) ----
  // join-beta glue: PL.Screens.padRects is the runtime swap point (ui.js points it at PL.Input.layout, which also
  // returns retry/pause/teach). opts.roomRect = the camera's fitted room rect (screen px) when the game knows it.
  // Overlay layout (Layout A, 475x638): the room fills the height under a floating HUD row (pills at y 10, 32 tall, room top 52),
  // the pad floats over the room's bottom corner (pl.box), Retry (pl.retry, 60 ring) bottom-left in the room, Pause top-right.
  // Teach strip = top of the room (tutorial only has text); Skip sits beside Retry, on the side away from the pad.
  function overlayRects(r, pl, w, h, tutorial, opts) {
    const hudTop = (PL.CAM && PL.CAM.HUD_OVERLAY) || 52, ins = (opts && opts.inset) || {}, it = ins.t || 0;
    const padRight = pl.box.x + pl.box.w / 2 > w / 2, pauseRight = pl.pause.x + pl.pause.w / 2 > w / 2;
    if (!(opts && opts.roomRect)) { const rw = w - 8, rh = h - hudTop - it - 6; r.room = R(4, hudTop + it, rw, rh); } // no camera frame yet: whole width/height under the HUD
    r.retry = pl.retry; r.pause = pl.pause;
    const y = 10 + it, row = [R(0, y, 112, 32), R(0, y, 104, 32), R(0, y, 56, 32)];
    let x = 8 + (ins.l || 0); for (const q of row) { q.x = x; x += q.w + 8; }
    r.hudRoom = row[0]; r.hudTime = row[1]; r.pips = row[2];
    r.chips = R(x, y + 4, 170, 24);
    if (!pauseRight) for (const n of ['hudRoom', 'hudTime', 'pips', 'chips']) r[n] = mir(r[n], w);
    const rm = r.room; r.teach = R(rm.x + 8, rm.y + 8, rm.w - 16, 72);
    if (tutorial) r.skip = padRight === (pl.retry.x < w / 2) ? R(pl.retry.x + (pl.retry.x < w / 2 ? pl.retry.w + 8 : -8 - 68), pl.retry.y + pl.retry.h - 56, 68, 56) : R(pl.retry.x, pl.retry.y - 64, 68, 56);
    else delete r.skip;
  }
  function playRects(w, h, left, tutorial, opts) {
    const PR = (PL.Screens && PL.Screens.padRects) || padRects;
    const k = cls(w, h), pad = PR(w, h, false), r = {};
    if (k === 'A') {
      r.room = R(4, 84, pad.box.x - 9, h - 218); r.retry = R(12, r.room.y + r.room.h + 12, 56, 56); r.pause = R(w - 64, 8, 56, 56);
      r.hudRoom = R(8, 20, 112, 32); r.hudTime = R(130, 20, 120, 32); r.pips = R(260, 20, 140, 32);
      r.teach = R(pad.box.x, 92, 180, 136); r.skip = R(pad.box.x, 236, 180, 56);
    } else if (k === 'B') {
      r.room = R(4, 84, w - 8, 510);
      r.retry = R(12, h - 222, 56, 56); r.pause = R(w - 68, 12, 56, 56);
      r.hudRoom = R(12, 16, 98, 32); r.hudTime = R(120, 16, 100, 32); r.pips = R(w - 68 - 52, 16, 48, 32);
      r.teach = R(12, r.room.y + r.room.h + 4, w - 24, 48); r.skip = R(w - 74, h - 222, 68, 56);
    } else {
      r.room = R(pad.box.x - 8 - 351, 20, 351, h - 40); r.retry = R(12, pad.box.y, 56, 56); r.pause = R(w - 68, 8, 56, 56);
      r.hudRoom = R(12, 14, 223, 28); r.hudTime = R(12, 46, 223, 28); r.pips = R(12, 78, 223, 22);
      r.teach = R(12, 108, 223, 92); r.skip = R(12, 210, 156, 56);
    }
    // DEV / ART chips: below the HUD strip, never on HUD text or Pause (CHECK #10)
    r.chips = k === 'A' ? R(8, 56, 170, 24) : k === 'B' ? R(12, 54, 170, 24) : R(12, 274, 170, 24);
    if (!tutorial) { delete r.skip; }
    if (left) for (const n in r) if (r[n]) r[n] = mir(r[n], w);
    const pl = left ? PR(w, h, true) : pad;
    if (pl.retry) { // pad source also owns Retry, Pause and the teach slot (already mirrored for the left hand)
      r.retry = pl.retry; r.pause = pl.pause;
      if (pl.teach) {
        const t = pl.teach;
        if (tutorial && k === 'A') { r.teach = R(t.x, t.y, t.w, Math.max(48, t.h - 64)); r.skip = R(t.x, r.teach.y + r.teach.h + 8, t.w, 56); }
        else r.teach = R(t.x, t.y, t.w, t.h);
      }
    }
    if (opts && opts.roomRect) { const q = opts.roomRect; r.room = R(q.x, q.y, q.w, q.h); }
    const ov = pl.mode === 'overlay' || pl.mode === 'side'; // 'side' = pre-overlay name of the same layout
    if (ov) overlayRects(r, pl, w, h, tutorial, opts);
    const tw = Math.min(r.room.w - 16, 300);
    r.toast = R(r.room.x + (r.room.w - tw) / 2, r.room.y + 8 + (ov && tutorial ? r.teach.h + 8 : 0), tw, 40);
    const out = Object.assign({}, r, { up: pl.up, left: pl.left, dive: pl.dive, right: pl.right, down: pl.down, padBox: pl.box, mode: pl.mode });
    return out;
  }
  const PLAY_TARGETS = ['pause', 'retry', 'up', 'left', 'dive', 'right', 'down', 'skip'];
  const PLAY_CONT = ['room', 'padBox'];
  const PLAY_OVER = ['toast'];

  function centred(w, h, cw, ch, dy) { return R(Math.round((w - cw) / 2), Math.round((h - ch) / 2 + (dy || 0)), cw, ch); }

  // menu geometry. Portrait: stack at the bottom (Play 64-72, others 56, 8 gaps, 220 wide); art star bottom sits 10 px above it.
  // Landscape: art on the left half, title + stack centred in the right column.
  function menuGeo(w, h, k, home) {
    if (k === 'C') {
      const cx = Math.round(w * 0.72), stack = 72 + 8 + 56 + 8 + 56, y0 = Math.round((h - (72 + 22 + stack)) / 2), py = y0 + 94;
      return { art: R(0, 0, Math.round(w * 0.58), h), title: R(cx - 150, y0, 300, 72), play: R(cx - 110, py, 220, 72), practice: R(cx - 110, py + 80, 220, 56), settings: R(cx - 110, py + 144, 220, 56), starBottom: h - 20 };
    }
    const ph = h >= 760 ? 72 : 64, stack = ph + 8 + 56 + 8 + 56, top = h - home - 8 - stack, x = Math.round((w - 220) / 2), ty = h >= 760 ? 44 : 16;
    return { art: R(0, 0, w, h), title: R(Math.round(w / 2) - 150, ty, 300, 72), play: R(x, top, 220, ph), practice: R(x, top + ph + 8, 220, 56), settings: R(x, top + ph + 72, 220, 56), starBottom: top - 12 };
  }

  function layout(w, h, left, opts) {
    opts = opts || {}; const k = cls(w, h), out = {};
    const def = (name, rects, targets, containers, overlays) => { for (const n in rects) if (!rects[n]) delete rects[n]; out[name] = { rects, targets: (targets || []).filter(n => rects[n]), containers: containers || [], overlays: overlays || [] }; };
    const home = k === 'C' ? 8 : 32; // keep clear of Android home-swipe band (portrait)

    // menu + first open share one composition: art (cover-fit) with the star clear above the button stack, title in the top zone
    const mg = menuGeo(w, h, k, home);
    def('firstOpen', { screen: R(0, 0, w, h), art: mg.art, title: mg.title, start: mg.play }, ['start', 'screen'], ['screen', 'art']);

    const pr = playRects(w, h, left, false, opts), tr = playRects(w, h, left, true, opts);
    def('play', pr, PLAY_TARGETS, PLAY_CONT, PLAY_OVER);
    def('tutorial', tr, PLAY_TARGETS, PLAY_CONT, PLAY_OVER);
    { const o = Object.assign({}, pr); const tw = 200; o.tag = R(Math.round(pr.room.x + (pr.room.w - tw) / 2), pr.room.y + 120, tw, 36);
      def('death', o, PLAY_TARGETS, PLAY_CONT, PLAY_OVER.concat('tag')); }
    { // room clear: card centred in the viewport like pause / shaft complete (not on the room column). The pad and HUD are hidden under it, so only the card is laid out.
      // opts.clearRows {best, isNew}: the Best row is left out when there is no best, and the card closes up. Default = both rows (tallest card).
      const cr = opts.clearRows || { best: true, isNew: true }, extra = (cr.best ? 1 : 0) + (cr.isNew ? 1 : 0), ch = 82 + 28 * extra + 12 + 56 + 16, cw = Math.min(w - 24, 260), c = centred(w, h, cw, ch), o = { room: pr.room };
      o.clearCard = c; o.clearHead = R(c.x + 16, c.y + 16, cw - 32, 32); o.clearTime = R(c.x + 16, c.y + 54, cw - 32, 26);
      let ry = c.y + 82; if (cr.best) { o.clearBest = R(c.x + 16, ry, cw - 32, 26); ry += 28; } if (cr.isNew) { o.clearNew = R(c.x + 16, ry, cw - 32, 26); }
      o.clearNext = R(c.x + 16, c.y + ch - 16 - 56, cw - 32, 56);
      def('roomClear', o, ['clearNext'], ['room', 'clearCard']); }

    def('menu', { art: mg.art, title: mg.title, play: mg.play, practice: mg.practice, settings: mg.settings }, ['play', 'practice', 'settings'], ['art']);

    // shaft pick
    { const tw = Math.min(w - 24, 340), x = Math.round((w - tw) / 2), y0 = k === 'C' ? 76 : 124, r = { back: R(8, 8, 88, 56), title: R(Math.round(w / 2) - 140, k === 'C' ? 12 : 72, 280, 40) };
      if (k === 'C') r.back = R(8, 8, 88, 56), r.title = R(Math.round(w / 2) - 100, 14, 200, 40);
      for (let i = 0; i < 3; i++) r['tile' + i] = R(x, y0 + i * 108, tw, 96);
      r.play = R(Math.round((w - 240) / 2), y0 + 3 * 108 + 4, 240, 80);
      def('shaftPick', r, ['back', 'tile0', 'tile1', 'tile2', 'play']); }

    // pause + confirm
    { const cw = cardW(w), c = centred(w, h, cw, 340), r = { card: c, title: R(c.x + 16, c.y + 16, cw - 32, 36) };
      ['resume', 'retry', 'settings', 'leave'].forEach((n, i) => { r[n] = R(c.x + 16, c.y + 64 + i * 68, cw - 32, 56); });
      def('pause', r, ['resume', 'retry', 'settings', 'leave'], ['card']);
      const c2 = centred(w, h, cw, 200), bw = Math.floor((cw - 32 - 12) / 2);
      def('confirm', { card: c2, msg: R(c2.x + 16, c2.y + 16, cw - 32, 72), stay: R(c2.x + 16, c2.y + 200 - 72, bw, 56), leave: R(c2.x + 16 + bw + 12, c2.y + 200 - 72, bw, 56) }, ['stay', 'leave'], ['card']); }

    // shaft complete
    { const cw = cardW(w), c = centred(w, h, cw, 380), bw = Math.floor((cw - 32 - 12) / 2);
      def('shaftComplete', { card: c, medal: R(Math.round(w / 2) - 36, c.y + 16, 72, 72), head: R(c.x + 16, c.y + 96, cw - 32, 32), total: R(c.x + 16, c.y + 130, cw - 32, 26),
        times: R(c.x + 16, c.y + 162, cw - 32, 112), note: R(c.x + 16, c.y + 278, cw - 32, 20), again: R(c.x + 16, c.y + 308, bw, 56), menu: R(c.x + 16 + bw + 12, c.y + 308, bw, 56) }, ['again', 'menu'], ['card']); }

    // settings / tweak: header + scrolling rows
    const rowsScreen = (name, ids, hdr) => {
      const rw = Math.min(w - 16, 400), x = Math.round((w - rw) / 2), ly = 72, lb = h - (k === 'C' ? 8 : home) - HINT_H, sc = opts.scroll || 0;
      const r = { back: R(8, 8, hdr.backW, 56), title: R(8 + hdr.backW + 8, 8, w - 16 - (hdr.backW + 8) * 2 - (hdr.badge ? 0 : 0), 56), list: R(0, ly, w, lb - ly) };
      if (hdr.badge) { r.title = R(8 + hdr.backW + 8, 8, w - 16 - hdr.backW - 8 - 64, 56); r.dev = R(w - 64, 24, 56, 24); }
      const vis = []; ids.forEach((id, i) => { const rr = R(x, ly + i * 66 - sc, rw, 60); if (rr.y >= ly && rr.y + 60 <= lb) { r[id] = rr; vis.push(id); } });
      def(name, r, ['back'].concat(vis), ['list']);
    };
    const SIDS = ['music', 'sounds', 'mute', 'vibration', 'hand', 'motion', 'textSize', 'quality', 'reset', 'tweak'];
    rowsScreen('settings', SIDS, { backW: 88 });
    out.settings.rowIds = SIDS;
    const nT = opts.tweakRows || 6, tids = []; for (let i = 0; i < nT; i++) tids.push('t' + i);
    rowsScreen('tweak', tids, { backW: 88, badge: true });
    // second-level confirm for settings reset reuses 'confirm'
    out.cls = k; out.w = w; out.h = h; out.left = !!left;
    return out;
  }

  // row split: label zone + control zone (control >= 56 wide, right-aligned)
  function rowParts(row, kind) {
    const cw = kind === 'slider' ? Math.round(row.w * 0.5) : kind === 'toggle' ? 72 : kind === 'seg' ? 150 : 0;
    return { label: R(row.x + 16, row.y, row.w - 32 - cw, row.h), control: R(row.x + row.w - 8 - cw, row.y, cw, row.h) };
  }

  // join-beta glue: split a row into n buttons (weights optional), 6 px gaps; each stays >= 56 tall (row height)
  function rowButtons(row, n, weights) {
    const wt = weights || Array(n).fill(1), tot = wt.reduce((a, b) => a + b, 0), gap = 6, inner = row.w - gap * (n - 1), out = [];
    let x = row.x; for (let i = 0; i < n; i++) { const bw = Math.round(inner * wt[i] / tot); out.push(R(x, row.y, i === n - 1 ? row.x + row.w - x : bw, row.h)); x += bw + gap; }
    return out;
  }

  function hit(lay, name, x, y) {
    const sc = lay[name]; if (!sc) return null; let found = null;
    for (const n of sc.targets) { const r = sc.rects[n]; if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && n !== 'screen') found = n; }
    if (!found && sc.targets.indexOf('screen') >= 0) return 'screen';
    return found;
  }

  // ---------- draw ----------
  const sc = (vm) => vm.textScale || 1;
    const press = (vm, n) => (vm.pressed === n ? 1 : 0);
  const foc = (vm, n) => vm.focus === n;

  // overlay pad: which keys sit over a spike / crusher full travel / exit ring (screen space). Cached per room object + W,H + layout + camera.
  let hazCache = { key: '', v: null }, hazRoom = null;
  function padHazKeys(r, h) {
    if (!h || !h.room) return null;
    const keys = ['up', 'left', 'right', 'down', 'dive'], key = h.W + 'x' + h.H + '|' + h.cx + ',' + h.cy + ',' + h.scale + '|' + keys.map((k) => { const q = r[k]; return q ? q.x + ',' + q.y + ',' + q.w + ',' + q.h : '-'; }).join(';');
    if (hazRoom === h.room && hazCache.key === key) return hazCache.v;
    const rm = h.room, sx = (x) => (x - h.cx) * h.scale + h.W / 2, sy = (y) => (y - h.cy) * h.scale + h.H / 2, hs = [];
    const add = (x, y, w, hh) => hs.push({ x: sx(x), y: sy(y), w: w * h.scale, h: hh * h.scale });
    (rm.spikes || []).forEach((q) => add(q.r[0], q.r[1], q.r[2], q.r[3]));
    (rm.crushers || []).forEach((c) => { const a = c.amp || 0; add(c.r[0] - (c.ax ? a : 0), c.r[1] - (c.ay ? a : 0), c.r[2] + (c.ax ? 2 * a : 0), c.r[3] + (c.ay ? 2 * a : 0)); });
    const ex = rm.exit; if (ex) add(ex.x - 18, ex.y - 18, 36, 36); // ring bbox (circle test below)
    const v = {};
    for (const k of keys) { const q = r[k]; v[k] = !!q && hs.some((z, i) => {
      if (ex && i === hs.length - 1) { const cx = Math.max(q.x, Math.min(z.x + z.w / 2, q.x + q.w)), cy = Math.max(q.y, Math.min(z.y + z.h / 2, q.y + q.h)); return Math.hypot(cx - (z.x + z.w / 2), cy - (z.y + z.h / 2)) < z.w / 2; }
      return q.x < z.x + z.w && z.x < q.x + q.w && q.y < z.y + z.h && z.y < q.y + q.h; }); }
    hazRoom = h.room; hazCache = { key, v }; return v;
  }
  function drawHud(ctx, L, vm, t, w) {
    const r = L.rects, sca = sc(vm), L2 = S.hud;
    U.hudText(ctx, r.hudRoom, { text: L2.room(vm.room || 1, vm.rooms || 5), vw: w, scale: sca }, t);
    U.hudText(ctx, r.hudTime, { text: vm.time || '0:00', glow: vm.newBest, vw: w, scale: sca }, t);
    const moves = vm.moves == null ? 2 : vm.moves, max = vm.maxMoves || 2;
    if (r.pips) U.pips(ctx, r.pips, { n: moves, max, pop: vm.pop, size: r.pips.w < 60 ? 14 : 18 }, t);
    U.pauseKey(ctx, r.pause, { pressed: press(vm, 'pause'), focus: foc(vm, 'pause') }, t);
    U.retryKey(ctx, r.retry, { pressed: press(vm, 'retry'), label: L2.retry, spin: vm.retrySpin, focus: foc(vm, 'retry') }, t);
    if (r.retry) U.text(ctx, L2.retry, r.retry.x + r.retry.w / 2, r.retry.y + r.retry.h + 4, { font: U.fontPx(14, 700), color: U.C.cream, align: 'center', maxW: 64 }); // caption under the ring
    const zero = moves <= 0;
    // overlay mode: pad drawn translucent over the room (PAD_ALPHA); a pressed key goes to max(0.9, alpha)
    const ov = r.mode === 'overlay', ta = PL.Tweak && PL.Tweak.get && PL.Tweak.get('PAD_ALPHA'), pa = ov ? (typeof ta === 'number' ? ta : 0.45) : 1;
    const hz = ov ? padHazKeys(r, vm.padHaz) : null, th = PL.Tweak && PL.Tweak.get && PL.Tweak.get('PAD_HAZ_ALPHA'), ha = Math.min(pa, typeof th === 'number' ? th : 0.2);
    const padAlpha = (n) => { const a = hz && hz[n] ? ha : pa; ctx.globalAlpha = press(vm, n) ? Math.max(0.9, a) : a; };
    ctx.save();
    for (const d of ['up', 'left', 'right', 'down']) { padAlpha(d); U.arrowKey(ctx, r[d], { dir: d, lit: vm.lit === d, pressed: press(vm, d), dim: zero, focus: foc(vm, d) }, t); }
    padAlpha('dive'); U.diveKey(ctx, r.dive, { pressed: press(vm, 'dive'), cooldown: vm.cooldown || 0, disabled: zero && vm.air, airCost: vm.air && !zero }, t);
    ctx.restore();
    if (vm.toast) U.toast(ctx, r.toast, Object.assign({ vw: w }, vm.toast), t);
    if (vm.teach && vm.teach.lines) { const tf = U.font('teach', w, sca), lh = Math.round(U.size('teach', w, sca) * 1.3); let nl = 0; for (const ln of vm.teach.lines) nl += U.wrap(ctx, ln, r.teach.w - 30, tf).length;
      const th = Math.min(r.teach.h, nl * lh + 24); U.teachSlot(ctx, R(r.teach.x, r.teach.y, r.teach.w, th), { lines: vm.teach.lines, alpha: vm.teach.alpha, vw: w, scale: sca }, t); }
    if (r.skip && vm.showSkip) { // narrow slot (344 wide, 68 px): first word only ("Skip"); the teach slot above says it is the tutorial
      const sp = S.tutorial.skip.indexOf(' '), two = r.skip.w < 120 && sp > 0;
      U.button(ctx, r.skip, { label: two ? S.tutorial.skip.slice(0, sp) : S.tutorial.skip, sub: null, vw: w, scale: sca, pressed: press(vm, 'skip') }, t);
    }
    drawChips(ctx, vm, w, r.chips);
  }
  function drawChips(ctx, vm, w, at) {
    const ins = vm.inset || { t: 0, l: 0 };
    let x = at ? at.x : 8 + (ins.l || 0), y = at ? at.y : 4 + (ins.t || 0);
    // top-left, inside safe area; below HUD text (y 4 keeps clear of Pause on the right)
    if (vm.devTuned) { U.devBadge(ctx, R(x, y, 56, 24), { label: PL.Strings.dev.badge }, 0); x += 62; }
    if (vm.artFallback && vm.tweakOn) U.artChip(ctx, R(x, y, 100, 24), {}, 0);
  }
  function backdropRoom(ctx, vm, L) { if (vm.drawRoom) vm.drawRoom(ctx, L.rects.room); }

  // key art with the star + flame clear of the title and the buttons; a few motes drift over it
  function drawMenuArt(ctx, r, mg, vm, t) {
    const a = r.art, tb = r.title.y + r.title.h;
    if (vm.drawArt) vm.drawArt(ctx, a, { bottom: mg.starBottom, top: tb, t, reduced: !!vm.reduced }); else U.scrim(ctx, a.w, a.h, 0.0);
    U.motes(ctx, R(a.x, tb, a.w, Math.max(40, mg.starBottom - tb)), t, { reduced: vm.reduced });
  }

  // scroll hint for settings / tweak: fade + chevron in the strip under the list (down while more rows are below, up at the end)
  function scrollHere(ctx, sc0, n, sc) {
    const list = sc0.rects.list, strip = R(list.x, list.y + list.h, list.w, HINT_H), max = Math.max(0, n * 66 - list.h + 8);
    U.scrollHint(ctx, list, strip, { more: sc < max - 4, less: max > 0 && sc >= max - 4 });
  }

  const draw = {
    firstOpen(ctx, w, h, vm, t) {
      const L = layout(w, h, false).firstOpen, r = L.rects, k = cls(w, h), mg = menuGeo(w, h, k, k === 'C' ? 8 : 32);
      drawMenuArt(ctx, r, mg, vm, t);
      U.titleArt(ctx, r.title, { text: S.menu.title, vw: w, reduced: vm.reduced }, t);
      const pulse = vm.reduced ? 0 : 0.5 + 0.5 * Math.sin(t * 3), g = 4 + 3 * pulse;
      U.button(ctx, r.start, { label: S.cover.start, kind: 'primary', vw: w, pressed: press(vm, 'start') }, t);
      U.sticker(ctx, R(r.start.x - g, r.start.y - g, r.start.w + 2 * g, r.start.h + 2 * g), { fill: 'rgba(0,0,0,0)', edge: C.teal, radius: 16 + g, shadow: false, disabled: true });
    },
    play(ctx, w, h, vm, t) { const L = layout(w, h, vm.leftHand, { roomRect: vm.roomRect }).play; backdropRoom(ctx, vm, L); drawHud(ctx, L, vm, t, w); },
    tutorial(ctx, w, h, vm, t) { const L = layout(w, h, vm.leftHand, { roomRect: vm.roomRect }).tutorial; backdropRoom(ctx, vm, L); drawHud(ctx, L, Object.assign({ showSkip: true }, vm), t, w); },
    death(ctx, w, h, vm, t) {
      const L = layout(w, h, vm.leftHand, { roomRect: vm.roomRect }).death; backdropRoom(ctx, vm, L); drawHud(ctx, L, vm, t, w);
      const c = vm.cause || {}, rm = L.rects.room, tw = c.iconOnly ? 44 : 220;
      const hx = c.x == null ? rm.x + rm.w / 2 : c.x, hy = c.y == null ? rm.y + 140 : c.y;
      const x = Math.max(rm.x + 6 + tw / 2, Math.min(rm.x + rm.w - 6 - tw / 2, hx)), y = Math.max(rm.y + 24, Math.min(rm.y + rm.h - 24, hy - 44));
      U.causeTag(ctx, R(x - tw / 2, y - 18, tw, 36), { kind: c.kind || 'spikes', text: c.text || S.death.spikes, age: c.age == null ? 400 : c.age, iconOnly: c.iconOnly }, t);
    },
    roomClear(ctx, w, h, vm, t) {
      const hasBest = vm.best != null && vm.best !== '-' && vm.best !== '', L = layout(w, h, vm.leftHand, { roomRect: vm.roomRect, clearRows: { best: hasBest, isNew: !!vm.isNewBest } }).roomClear, r = L.rects; backdropRoom(ctx, vm, L);
      U.card(ctx, r.clearCard, { anim: 1 }, t);
      const sca = sc(vm), f = U.font('body', w, sca), cx0 = r.clearCard.x + r.clearCard.w / 2;
      U.text(ctx, S.clear.title, cx0, r.clearHead.y + 16, { font: U.font('h2', w), color: C.brass, align: 'center', maxW: r.clearHead.w });
      U.text(ctx, S.clear.time + ' ' + (vm.time || '0:12'), cx0, r.clearTime.y + 13, { font: f, color: C.cream, align: 'center', maxW: r.clearTime.w });
      if (r.clearBest) U.text(ctx, S.clear.best + ' ' + vm.best, cx0, r.clearBest.y + 13, { font: f, color: C.muted, align: 'center', maxW: r.clearBest.w });
      if (r.clearNew) U.text(ctx, S.clear.newBest, cx0, r.clearNew.y + 13, { font: U.font('body', w, sca), color: C.teal, align: 'center', maxW: r.clearNew.w });
      U.button(ctx, r.clearNext, { label: S.clear.next, kind: 'primary', vw: w, scale: sca, pressed: press(vm, 'clearNext') }, t);
    },
    menu(ctx, w, h, vm, t) {
      const r = layout(w, h, false).menu.rects, k = cls(w, h), mg = menuGeo(w, h, k, k === 'C' ? 8 : 32);
      drawMenuArt(ctx, r, mg, vm, t);
      U.titleArt(ctx, r.title, { text: S.menu.title, vw: w, reduced: vm.reduced }, t);
      U.button(ctx, r.play, { label: S.menu.play, kind: 'primary', vw: w, pressed: press(vm, 'play'), focus: foc(vm, 'play') }, t);
      U.button(ctx, r.practice, { label: S.menu.practice, vw: w, scale: sc(vm), pressed: press(vm, 'practice') }, t);
      U.button(ctx, r.settings, { label: S.menu.settings, vw: w, scale: sc(vm), pressed: press(vm, 'settings') }, t);
      drawChips(ctx, vm, w);
    },
    shaftPick(ctx, w, h, vm, t) {
      const r = layout(w, h, false).shaftPick.rects, sca = sc(vm), sel = vm.selected == null ? 0 : vm.selected;
      U.button(ctx, r.back, { label: S.pick.back, vw: w, scale: sca, pressed: press(vm, 'back') }, t);
      U.text(ctx, S.menu.play, r.title.x + r.title.w / 2, r.title.y + 20, { font: U.font('h2', w), color: C.cream, align: 'center' });
      const names = [S.pick.short, S.pick.long, S.pick.daily], subs = [S.pick.best, S.pick.best, S.pick.dailySub];
      for (let i = 0; i < 3; i++) {
        const tr = r['tile' + i], b = (vm.best || [])[i], on = i === sel;
        U.card(ctx, tr, {}, t);
        if (on) { U.sticker(ctx, R(tr.x - 5, tr.y - 5, tr.w + 10, tr.h + 10), { fill: 'rgba(0,0,0,0)', edge: C.brass, radius: 24, shadow: false, disabled: true }); }
        U.text(ctx, names[i], tr.x + 18, tr.y + 30, { font: U.font('body', w, sca), color: C.cream, maxW: tr.w - 108 });
        U.text(ctx, b ? S.pick.best + ' ' + b.time : (i === 2 && vm.dailyNote ? subs[2] : S.pick.notPlayed), tr.x + 18, tr.y + 64, { font: U.font('small', w, sca), color: C.muted, maxW: tr.w - 108 });
        U.medal(ctx, R(tr.x + tr.w - 18 - 64, tr.y + 16, 64, 64), { tier: b ? b.tier : 'none' }, t);
      }
      U.button(ctx, r.play, { label: S.pick.play, kind: 'primary', vw: w, pressed: press(vm, 'play') }, t);
    },
    pause(ctx, w, h, vm, t) {
      const Ls = layout(w, h, vm.leftHand); // scrim: drawn once by the caller (ui.js renderPlay) with U.overlayScrim
      if (vm.confirm) return draw.confirm(ctx, w, h, { text: S.pause.confirm, no: S.pause.stay, yes: S.pause.leaveYes, danger: false, pressed: vm.pressed, textScale: vm.textScale }, t);
      const r = Ls.pause.rects, sca = sc(vm);
      U.card(ctx, r.card, { anim: vm.anim }, t);
      U.text(ctx, S.pause.title, r.title.x + r.title.w / 2, r.title.y + 18, { font: U.font('h2', w), color: C.brass, align: 'center' });
      [['resume', S.pause.resume, 'primary'], ['retry', S.pause.retry], ['settings', S.pause.settings], ['leave', S.pause.leave]].forEach(([n, lb, kd]) =>
        U.button(ctx, r[n], { label: lb, kind: kd, vw: w, scale: sca, pressed: press(vm, n), focus: foc(vm, n) || (n === 'resume' && !vm.focus) }, t));
    },
    confirm(ctx, w, h, vm, t) {
      const r = layout(w, h, false).confirm.rects, sca = sc(vm);
      U.card(ctx, r.card, {}, t);
      let y = r.msg.y + 8; for (const ln of U.wrap(ctx, vm.text, r.msg.w, U.font('body', w, sca))) { U.text(ctx, ln, r.msg.x + r.msg.w / 2, y + 12, { font: U.font('body', w, sca), color: C.cream, align: 'center' }); y += 26; }
      U.button(ctx, r.stay, { label: vm.no, kind: 'primary', vw: w, scale: sca, pressed: press(vm, 'stay') }, t);
      U.button(ctx, r.leave, { label: vm.yes, kind: vm.danger ? 'danger' : 'plain', vw: w, scale: sca, pressed: press(vm, 'leave') }, t);
    },
    shaftComplete(ctx, w, h, vm, t) {
      const r = layout(w, h, false).shaftComplete.rects, sca = sc(vm); // scrim: drawn once by the caller (ui.js renderPlay)
      const age = vm.age == null ? 99 : vm.age, clamp01 = (x) => Math.max(0, Math.min(1, x));
      U.card(ctx, r.card, {}, t);
      // medal reveal: scale pop (overshoot), two sparkle rings, total counts up from 0
      const mx = r.medal.x + r.medal.w / 2, my = r.medal.y + r.medal.h / 2, pop = age < 0.55 ? U.easeOutBack(age / 0.55) : 1;
      ctx.save(); ctx.translate(mx, my); ctx.scale(Math.max(0.01, pop), Math.max(0.01, pop)); ctx.translate(-mx, -my);
      U.medal(ctx, r.medal, { tier: vm.tier || 'gold', isNew: vm.isNew && age > 0.6, drop: 1 }, t); ctx.restore();
      if (age < 1.5) { U.sparkRing(ctx, mx, my, age - 0.2, 34, 92, 10); U.sparkRing(ctx, mx, my, age - 0.45, 30, 66, 8); }
      const lab = { gold: S.complete.gold, silver: S.complete.silver, bronze: S.complete.bronzeHint, none: S.complete.none }[vm.tier || 'gold'];
      U.text(ctx, S.complete.title, r.head.x + r.head.w / 2, r.head.y + 16, { font: U.font('h2', w), color: C.brass, align: 'center', maxW: r.head.w });
      const k = clamp01((age - 0.3) / 1.1), ease = 1 - Math.pow(1 - k, 3), shown = vm.totalS != null ? vm.totalS * ease : null, fmt = vm.fmt || ((x) => String(x));
      const totalTxt = shown != null ? fmt(shown) : vm.total || '3:41';
      U.text(ctx, S.complete.total(totalTxt) + '  ·  ' + lab, r.total.x + r.total.w / 2, r.total.y + 13, { font: U.font('body', w, sca), color: C.cream, align: 'center', maxW: r.total.w });
      // per-room list: two columns, 16 px type, 28 px rows (readable at 344 wide), rows fade in one after another
      const ts = vm.roomTimes || [], rowH = 28, colW = r.times.w / 2, per = Math.min(4, Math.ceil(ts.length / 2));
      ts.forEach((tm, i) => { const col = Math.floor(i / per), row = i % per, x = r.times.x + col * colW + 4, y = r.times.y + row * rowH + 14, a = clamp01((age - 0.5 - i * 0.09) / 0.25);
        if (a <= 0) return; ctx.save(); ctx.globalAlpha = a;
        U.text(ctx, (i + 1) + '', x + 10, y, { font: U.fontPx(16, 800), color: C.brass, align: 'center' });
        U.text(ctx, tm, x + 30, y, { font: U.font('body', w, sca), color: C.cream, maxW: colW - 40 }); ctx.restore(); });
      if (vm.tuned) U.text(ctx, PL.Strings.dev.notSaved, r.note.x + r.note.w / 2, r.note.y + 10, { font: U.fontPx(14, 700), color: C.brass, align: 'center' });
      else if (vm.isNew && age > 0.6) U.text(ctx, S.complete.newBest, r.note.x + r.note.w / 2, r.note.y + 10, { font: U.fontPx(15, 800), color: C.teal, align: 'center' });
      U.button(ctx, r.again, { label: S.complete.again, kind: 'primary', vw: w, scale: sca, pressed: press(vm, 'again'), focus: vm.focus === 'again' }, t);
      U.button(ctx, r.menu, { label: S.complete.menu, vw: w, scale: sca, pressed: press(vm, 'menu') }, t);
    },
    settings(ctx, w, h, vm, t) {
      const Ls = layout(w, h, false, { scroll: vm.scroll }), r = Ls.settings.rects, sca = sc(vm), st = S.settings, v = vm.values || {};
      if (!vm.scrimmed) U.overlayScrim(ctx, w, h);
      U.button(ctx, r.back, { label: st.back, vw: w, scale: sca, pressed: press(vm, 'back') }, t);
      U.text(ctx, st.title, r.title.x + r.title.w / 2, r.title.y + 28, { font: U.font('h2', w), color: C.cream, align: 'center', maxW: r.title.w });
      const rows = [['music', st.music, 'slider'], ['sounds', st.sounds, 'slider'], ['mute', st.mute, 'toggle'], ['vibration', st.vibration, 'toggle'], ['hand', st.hand(!!v.left), 'seg'],
        ['motion', st.motion, 'toggle'], ['textSize', st.textSize, 'seg'], ['quality', st.quality, 'seg'], ['reset', st.reset, 'link'], ['tweak', st.tweak, 'link']];
      for (const [id, lb, kd] of rows) {
        const row = r[id]; if (!row) continue;
        U.sticker(ctx, row, { fill: vm.pressed === id ? C.plumPress : C.plum, edge: C.brass, radius: 16, shadow: false });
        const p = rowParts(row, kd);
        U.text(ctx, lb, p.label.x, row.y + 30, { font: U.font('body', w, sca), color: id === 'tweak' ? C.muted : C.cream, maxW: p.label.w });
        if (kd === 'slider') U.slider(ctx, p.control, { value: v[id] == null ? 0.7 : v[id], drag: vm.drag === id }, t);
        else if (kd === 'toggle') U.toggle(ctx, p.control, { on: !!v[id] }, t);
        else if (kd === 'seg') {
          const opts = id === 'hand' ? ['R', 'L'] : id === 'quality' ? st.qualityOpts : ['1.0', '1.15', '1.3'], cur = id === 'hand' ? (v.left ? 1 : 0) : id === 'quality' ? (v.qualityIdx || 0) : (v.textIdx || 0), n = opts.length, bw = (p.control.w - 4) / n;
          opts.forEach((o, i) => { const b = R(p.control.x + i * bw + 2, row.y + 10, bw - 2, 40); U.rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.fillStyle = i === cur ? C.brass : C.night; ctx.fill();
            U.text(ctx, o, b.x + b.w / 2, b.y + 21, { font: U.fontPx(14, 800), color: i === cur ? C.ink : C.cream, align: 'center' }); });
        } else if (id === 'reset') U.chevron(ctx, row.x + row.w - 28, row.y + 30, 16, 'right', C.muted);
        else U.chevron(ctx, row.x + row.w - 28, row.y + 30, 16, 'right', C.muted);
      }
      scrollHere(ctx, Ls.settings, rows.length, vm.scroll || 0);
    },
    tweak(ctx, w, h, vm, t) {
      const Ls = layout(w, h, false, { tweakRows: (vm.rows || []).length || 6, scroll: vm.scroll }), r = Ls.tweak.rects, sca = sc(vm);
      U.scrim(ctx, w, h, 0.92);
      U.button(ctx, r.back, { label: S.settings.back, vw: w, scale: sca, pressed: press(vm, 'back') }, t);
      U.text(ctx, S.tweak.title, r.title.x + r.title.w / 2, r.title.y + 28, { font: U.font('h2', w), color: C.cream, align: 'center', maxW: r.title.w });
      U.devBadge(ctx, r.dev, { label: PL.Strings.dev.badge }, t);
      (vm.rows || []).forEach((row, i) => {
        const rr = r['t' + i]; if (!rr) return;
        if (row.kind === 'head') { // group heading: tap opens / closes the group
          U.sticker(ctx, rr, { fill: vm.pressed === 't' + i ? C.plumPress : C.night, edge: C.brass, radius: 16, shadow: false });
          U.text(ctx, row.label, rr.x + 16, rr.y + 30, { font: U.font('body', w, sca), color: C.brass, maxW: rr.w - 64 });
          U.chevron(ctx, rr.x + rr.w - 28, rr.y + 30, 16, row.open ? 'down' : 'right', C.muted); return;
        }
        if (row.kind === 'btns') { // a row of buttons (Reset all / Copy report / presets)
          const bs = rowButtons(rr, row.btns.length, row.btns.map((b) => b.weight || 1));
          row.btns.forEach((b, j) => U.button(ctx, bs[j], { label: b.label, kind: b.kind, vw: w, scale: sca, pressed: vm.pressed === b.id ? 1 : 0 }, t));
          return;
        }
        U.sticker(ctx, rr, { fill: C.plum, edge: row.dirty ? C.teal : C.brass, radius: 16, shadow: false });
        const p = rowParts(rr, 'slider');
        if (rr.w < 400) { // narrow: label on line 1, value on line 2 so neither is cut
          U.text(ctx, row.label, p.label.x, rr.y + 20, { font: U.font('body', w, sca), color: row.dirty ? C.teal : C.cream, maxW: p.label.w });
          U.text(ctx, row.valueText, p.label.x, rr.y + 42, { font: U.fontPx(14, 700), color: row.dirty ? C.teal : C.muted, maxW: p.label.w });
        } else U.text(ctx, row.label + '  ' + row.valueText, p.label.x, rr.y + 30, { font: U.font('body', w, sca), color: row.dirty ? C.teal : C.cream, maxW: p.label.w });
        U.slider(ctx, p.control, { value: row.value, drag: vm.drag === 't' + i }, t);
      });
      scrollHere(ctx, Ls.tweak, (vm.rows || []).length || 6, vm.scroll || 0);
    }
  };

  // kit sheet: every component and state (used by ui-demo for review)
  draw.kit = function (ctx, w, h, vm, t) {
    let y = 16; const col = (n) => 12 + n * 110;
    const lab = (s, x, yy) => U.text(ctx, s, x, yy, { font: U.fontPx(14, 700), color: C.muted });
    lab('Button: plain / primary / danger / disabled / pressed', 12, y); y += 14;
    [['plain', 0], ['primary', 0], ['danger', 0], ['plain', 'dis'], ['plain', 1]].forEach(([k, s], i) => U.button(ctx, R(12 + (i % 2) * 150, y + Math.floor(i / 2) * 64, 140, 56), { label: k === 'plain' && s === 'dis' ? 'Disabled' : k === 'danger' ? 'Erase' : k === 'primary' ? 'Play' : s === 1 ? 'Pressed' : 'Button', kind: k, disabled: s === 'dis', pressed: s === 1 ? 1 : 0, vw: w }, t));
    y += 3 * 64 + 8; lab('Arrow: idle / lit / pressed / dim; Dive idle / cooldown / disabled; Retry; Pause', 12, y); y += 14;
    const ks = [{ dir: 'up' }, { dir: 'left', lit: true }, { dir: 'right', pressed: 1 }, { dir: 'down', dim: true, pressed: 1 }];
    ks.forEach((k, i) => U.arrowKey(ctx, R(8 + i * 62, y, 60, 60), k, t));
    U.diveKey(ctx, R(264, y + 2, 56, 56), {}, t); U.diveKey(ctx, R(326, y + 2, 56, 56), { cooldown: 0.6 }, t); U.diveKey(ctx, R(388, y + 2, 56, 56), { disabled: true }, t);
    y += 66; U.retryKey(ctx, R(12, y, 56, 56), {}, t); U.pauseKey(ctx, R(80, y, 56, 56), {}, t);
    U.pips(ctx, R(150, y, 70, 24), { n: 2, max: 2 }, t); U.pips(ctx, R(230, y, 70, 24), { n: 1, max: 2 }, t); U.pips(ctx, R(310, y, 70, 24), { n: 0, max: 2 }, t);
    U.hudText(ctx, R(150, y + 30, 100, 28), { text: 'Room 3 of 5', vw: w }, t); U.hudText(ctx, R(260, y + 30, 70, 28), { text: '1:12', vw: w, glow: true }, t);
    y += 72; lab('Cause tag, slider, toggle, tab, medal, toast, chips', 12, y); y += 14;
    ['spikes', 'crusher', 'crystal', 'edge', 'slow'].forEach((k, i) => U.causeTag(ctx, R(12 + (i % 2) * 190, y + Math.floor(i / 2) * 42, 180, 36), { kind: k, text: S.death[k], iconOnly: i === 4 }, t));
    y += 3 * 42 + 4; U.slider(ctx, R(12, y, 200, 56), { value: 0.6 }, t); U.toggle(ctx, R(230, y, 72, 56), { on: true }, t); U.toggle(ctx, R(306, y, 72, 56), { on: false }, t);
    y += 58; U.tab(ctx, R(12, y, 110, 56), { label: 'Short', active: true }, t); U.tab(ctx, R(128, y, 110, 56), { label: 'Long' }, t);
    y += 60; ['gold', 'silver', 'bronze', 'none'].forEach((k, i) => U.medal(ctx, R(12 + i * 84, y, 72, 72), { tier: k }, t));
    y += 84; U.toast(ctx, R(12, y, 300, 40), { text: 'Saved', vw: w }, t); U.devBadge(ctx, R(324, y + 8, 56, 24), {}, t); U.artChip(ctx, R(388, y + 8, 100, 24), {}, t);
  };

  PL.Screens = { layout, padRects, rowParts, rowButtons, hit, draw, cls, NAMES: ['firstOpen', 'tutorial', 'menu', 'shaftPick', 'play', 'pause', 'confirm', 'death', 'roomClear', 'shaftComplete', 'settings', 'tweak'] };
})();
