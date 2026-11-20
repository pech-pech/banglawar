// draw.js - canvas drawing only (no input, no loop). Node-loadable with a fake ctx.
const PL = (globalThis.PL = globalThis.PL || {});

(function () {
  const INK = '#1f2430', PAPER = '#f2ecdc', PAPER2 = '#e7dfc8', RED = '#c0392b', BRASS = '#b08d2e',
        GRID = 'rgba(31,36,48,0.08)', STRIP = 'rgba(31,36,48,0.06)', FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';
  const TAU = Math.PI * 2, BTN_SIZE = 56, GAP = 8;

  function inset(view) {
    const i = (view && view.inset) || {};
    return { t: i.t || 0, b: i.b || 0, l: i.l || 0, r: i.r || 0 };
  }
  // hit rects in CSS px, top-right, below the safe-area inset
  function btnRect(view, idx) {
    const W = (view && view.W) || 360, i = inset(view);
    const x = W - i.r - 8 - BTN_SIZE * (idx + 1) - GAP * idx;
    return { x: x, y: i.t + 8, w: BTN_SIZE, h: BTN_SIZE };
  }
  PL.BTN = {
    copy: function (view) { return btnRect(view, 1); },
    path: function (view) { return btnRect(view, 0); },
    snd: function (view) { return btnRect(view, 2); }
  };

  const PP = { t: null, room: null, g: null, x: null, y: null, pts: [], scratch: null, cs: [] };
  PL.predictPath = function (state, seconds) {
    if (!state || !state.room || typeof PL.step !== 'function') return [];
    const secs = seconds || 0.8;
    if (PP.t === state.t && PP.room === state.room && PP.g === state.g && PP.x === state.x && PP.y === state.y && PP.secs === secs) return PP.pts;
    const pts = PP.pts; pts.length = 0;
    const s = PP.scratch || (PP.scratch = {});
    for (const k in s) delete s[k];
    Object.assign(s, state);
    s.events = [];
    s.pending = null;
    const src = state.crumbleS || [];
    s.crumbleS = PP.cs; PP.cs.length = src.length;
    for (let i = 0; i < src.length; i++) PP.cs[i] = { st: src[i].st, timer: src[i].timer };
    const DT = (PL.C && PL.C.DT) || 1 / 120;
    const n = Math.min(Math.max(1, Math.round(secs / DT)), 96);
    pts.push({ x: s.x, y: s.y });
    for (let k = 0; k < n; k++) {
      s.events.length = 0;
      PL.step(s, []);
      if (k % 4 === 3) pts.push({ x: s.x, y: s.y });
      const ev = s.events;
      if (s.dead || s.won || ev.indexOf('death') >= 0 || ev.indexOf('win') >= 0 || (k >= 3 && (ev.indexOf('land') >= 0 || s.grounded))) {
        pts.push({ x: s.x, y: s.y });
        break;
      }
    }
    PP.t = state.t; PP.room = state.room; PP.g = state.g; PP.x = state.x; PP.y = state.y; PP.secs = secs;
    return pts;
  };

  // direction spikes point (0 up,1 right,2 down,3 left); base is along the rect's long side
  function spikeDir(room, r) {
    const horiz = r[2] >= r[3], walls = room.walls || [];
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (horiz && r[0] < w[0] + w[2] && r[0] + r[2] > w[0]) {
        if (Math.abs(w[1] - (r[1] + r[3])) < 2) return 0;
        if (Math.abs(w[1] + w[3] - r[1]) < 2) return 2;
      }
      if (!horiz && r[1] < w[1] + w[3] && r[1] + r[3] > w[1]) {
        if (Math.abs(w[0] - (r[0] + r[2])) < 2) return 3;
        if (Math.abs(w[0] + w[2] - r[0]) < 2) return 1;
      }
    }
    if (horiz) return 0;
    return r[0] + r[2] / 2 < (room.w || 336) / 2 ? 1 : 3;
  }

  function text(ctx, s, x, y, px, color, align, bold) {
    ctx.font = (bold ? '700 ' : '500 ') + Math.max(14, px) + 'px ' + FONT;
    ctx.fillStyle = color || INK;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(s), x, y);
  }
  function fmtT(t) {
    t = +t || 0;
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function button(ctx, r, label, on) {
    ctx.fillStyle = on ? INK : PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 5, 14, on ? PAPER : INK, 'center', true);
  }

  // =====================================================================================
  // STARFALL SKIN (beta slice A): the play-field renderer. World only: no HUD, no pad (ui.js / PL.Screens own those).
  // Static things are baked once per room into two offscreen "plates" (back: platforms, brick, gold edges, brackets, rim light;
  // front: spike crystals + coral glow, gate bodies) plus a floor reflection; per frame only blits plus moving things are drawn.
  // Order: Vfx.drawBack (backdrop, far light, scrim, aurora) -> back plate + floor band -> Vfx.drawGlow (lantern pools, hero disc, bloom)
  //        -> lantern bodies -> crumbles -> exit portal -> front plate -> gate flow -> crushers -> hero flame ribbon -> hero -> Vfx.drawFront.
  // Every drawn art piece grows from its physics rect (hit rects: Tweak SKIN_DEBUG=1 or PL.Skin.setDebug(true)).
  // Art missing => clean code shapes in the Starfall palette. Never throws (whole frame is wrapped).
  // =====================================================================================
  const UIC = (PL.UI && PL.UI.C) || {};
  const P = { coral: UIC.coral || '#ff7a6b', coralDeep: UIC.coralDeep || '#9c2f3a', cream: UIC.cream || '#f4efe0', teal: UIC.teal || '#5fe0c8',
              brass: UIC.brass || '#e8bd5a', ink: UIC.ink || '#1c2048', night: '#151a3d', stone: '#ddd0d6', stoneDk: '#8f84a6' };
  const SK = { lanterns: [], inited: false, W: 0, H: 0, dpr: 0, room: null, last: 0, ev: [], live: null, q: -1, red: null, bg: '', heroAng: 0, heroReady: false,
               landUntil: 0, ms: 0, frames: 0, debug: false, errs: 0, wrapped: false, nowT: 0, plates: null, spr: null, lAng: 0, lVel: 0, lReady: false, rods: null };
  const TWK = [['SKIN_DEBUG', 'Show hit rects (0/1)', 0, 1], ['FX_QUALITY', 'FX quality 0 auto 1 full 2 lite 3 off', 0, 3]];
  try {
    if (PL.Tweak && PL.Tweak.register) TWK.forEach(function (t) { if (!PL.Tweak.has(t[0])) PL.Tweak.register(t[0], { group: 'Look', label: t[1], def: 0, min: 0, max: t[3], step: 1 }); });
  } catch (e) { /* tweak optional */ }
  function tw(id, d) { try { return PL.Tweak && PL.Tweak.has(id) ? PL.Tweak.get(id) : d; } catch (e) { return d; } }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapPI(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const GANG = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];   // upright art, feet toward gravity g
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // step() sim runs up to 5 times per frame and clears state.events each step: collect them for the live state so no FX is lost.
  function wrapStep() {
    if (SK.wrapped || typeof PL.step !== 'function' || PL.step.__skin) return;
    const orig = PL.step;
    const w = function (s) {
      const r = orig.apply(this, arguments);
      if (s === SK.live && s.events && s.events.length) for (let i = 0; i < s.events.length && SK.ev.length < 40; i++) SK.ev.push(s.events[i]);
      return r;
    };
    w.__skin = true; PL.step = w; SK.wrapped = true;
  }

  // cover-fit the backdrop art into a canvas the size Light bakes (W*1.12 x H*1.06), anchored at the top, + the dome ellipse in screen fractions
  function topAnchored(img, W, H, dpr) {
    if (!img || typeof document === 'undefined' || !document.createElement) return null;
    const iw = img.naturalWidth || img.width || 1, ih = img.naturalHeight || img.height || 1, sS = Math.min(dpr || 1, 1.5);
    const cw = W * 1.12, ch = H * 1.06, k = Math.max(cw / iw, ch / ih), c = document.createElement('canvas');
    c.width = Math.ceil(cw * sS); c.height = Math.ceil(ch * sS);
    const x = c.getContext('2d'); if (!x) return null;
    x.drawImage(img, (cw - iw * k) / 2 * sS, 0, iw * k * sS, ih * k * sS);
    const land = iw > ih, myPx = 0.03 * H;
    const cyA = land ? -0.03 : -0.012, ryA = land ? 0.205 : 0.14, rxA = land ? 0.5 : 0.47;
    return { canvas: c, dome: { cx: 0.5, cy: (-myPx + cyA * ih * k) / H, rx: Math.min(0.62, rxA * iw * k / W), ry: ryA * ih * k / H } };
  }

  function envSetup(view, state, hud, room) {
    const A = PL.Assets, V = PL.Vfx, W = view.W || 360, H = view.H || 640, dpr = view.dpr || 1;
    if (A && A.load && A.attempted && !A.attempted() && typeof Image === 'function') { try { A.load(); } catch (e) { /* ignore */ } }
    if (V && V.init) {
      if (!SK.inited) { V.init(W, H, dpr, { seed: hud.seed != null ? hud.seed : 1, bloom: 0.55 }); SK.inited = true; SK.q = -1; SK.red = null; SK.bg = ''; SK.room = null; SK.plates = null; }
      else if (W !== SK.W || H !== SK.H || dpr !== SK.dpr) { V.resize(W, H, dpr); SK.bg = ''; SK.plates = null; }
      SK.W = W; SK.H = H; SK.dpr = dpr;
      // backdrop art: portrait/landscape by viewport, other as fallback; none => PL.Light procedural dome
      let nm = '';
      if (A && A.has) { const order = H >= W ? ['bgPortrait', 'bgLandscape'] : ['bgLandscape', 'bgPortrait']; nm = order.filter(function (n) { return A.has(n); })[0] || ''; }
      const key = nm + (nm && H >= W ? 'P' : 'L');
      if (key !== SK.bg) {
        SK.bg = key;
        try {
          const cv = nm ? topAnchored(A.get(nm), W, H, dpr) : null;   // art pinned to the top so the aurora dome stays in view on tall phones
          V.setBackdrop(cv ? cv.canvas : (nm ? A.get(nm) : null), null, cv ? { dome: cv.dome } : null);   // public option: procedural aurora follows the art's dome
          if (V.setBloom) V.setBloom(0.55);                                                              // public option: bloom tuned down so moonstone + trail keep detail
        } catch (e) { /* ignore */ }
      }
      const qn = hud.quality != null ? hud.quality : ['auto', 'full', 'lite', 'off'][clamp(tw('FX_QUALITY', 0) | 0, 0, 3)];
      if (qn !== SK.q) { SK.q = qn; V.setQuality(qn); }
      const red = !!hud.reduced;
      if (red !== SK.red) { SK.red = red; V.setReduced(red); }
      if (room && room !== SK.room) {
        SK.room = room; SK.heroReady = false; SK.plates = null; SK.rods = null;
        V.setRoom(room, { skinGates: true, spikeScale: SPIKE_K });   // skin draws the gates (pass-direction chevrons) and the spike crystals; glints follow
        SK.lanterns = pickLanterns(room);
        if (PL.Light && PL.Light.setLanterns) PL.Light.setLanterns(SK.lanterns);   // Light's auto pick sits on ledge tops (on top of the hero start)
      }
    }
    if (state !== SK.live) { SK.live = state; SK.ev.length = 0; SK.heroReady = false; SK.lReady = false; }
    wrapStep();
  }
  // ---------- code fallbacks (Starfall palette) ----------
  function fbPlatform(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#efe6ec'); g.addColorStop(1, '#a99cbd');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = P.brass; ctx.fillRect(x, y, w, Math.max(2, Math.min(4, h * 0.3)));
    ctx.fillStyle = 'rgba(40,30,70,0.25)'; ctx.fillRect(x, y + h - 2, w, 2);
  }
  function fbSpikes(ctx, x, y, w, h, dir) {
    const horiz = dir === 0 || dir === 2, len = horiz ? w : h, th = horiz ? h : w;
    const n = Math.max(1, Math.round(len / (th * 1.1))), st = len / n;
    ctx.fillStyle = P.coral; ctx.strokeStyle = '#ffe9dd'; ctx.lineWidth = 1.5; ctx.lineJoin = 'miter';
    for (let k = 0; k < n; k++) {
      const a0 = k * st, a1 = a0 + st, am = a0 + st / 2;
      ctx.beginPath();
      if (dir === 0) { ctx.moveTo(x + a0, y + h); ctx.lineTo(x + am, y); ctx.lineTo(x + a1, y + h); }
      else if (dir === 2) { ctx.moveTo(x + a0, y); ctx.lineTo(x + am, y + h); ctx.lineTo(x + a1, y); }
      else if (dir === 1) { ctx.moveTo(x, y + a0); ctx.lineTo(x + w, y + am); ctx.lineTo(x, y + a1); }
      else { ctx.moveTo(x + w, y + a0); ctx.lineTo(x, y + am); ctx.lineTo(x + w, y + a1); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  function fbCrusher(ctx, x, y, w, h) {
    ctx.fillStyle = '#b4893a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = P.coral; ctx.fillRect(x, y + h * 0.38, w, h * 0.24);
    ctx.strokeStyle = '#ffe9dd'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  function starPath(ctx, r, inner) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * inner : r;
      if (k) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function fbHero(ctx, h, hurt) {
    const r = h * 0.56;
    starPath(ctx, r + 1.5, 0.5); ctx.fillStyle = P.cream; ctx.fill();
    starPath(ctx, r, 0.5); ctx.fillStyle = hurt ? '#f0a070' : '#f5c04a'; ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.fillRect(-r * 0.32, -r * 0.08, r * 0.16, r * 0.2); ctx.fillRect(r * 0.16, -r * 0.08, r * 0.16, r * 0.2);
    ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1, r * 0.08); ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.3); ctx.quadraticCurveTo(0, r * 0.42, r * 0.28, r * 0.24); ctx.stroke();
  }
  function fbPortal(ctx, cx, cy, r, t) {
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.9); g.addColorStop(0, 'rgba(120,255,235,0.45)'); g.addColorStop(1, 'rgba(95,224,200,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#242a66'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = P.teal; ctx.stroke();
    ctx.fillStyle = P.cream; ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, TAU); ctx.fill();
    ctx.fillStyle = '#242a66'; ctx.beginPath(); ctx.arc(cx + r * 0.28, cy - r * 0.1, r * 0.52, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------- baked sprites (once) ----------
  function cvs(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c.getContext && c.getContext('2d') ? c : null;
  }
  function radial(size, r, g, b) {
    const c = cvs(size, size); if (!c) return null;
    const x = c.getContext('2d'), h = size / 2, gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)'); gr.addColorStop(0.3, 'rgba(' + r + ',' + g + ',' + b + ',0.45)'); gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, size, size); return c;
  }
  function bakeSprites() {
    const o = {};
    o.coral = radial(64, 255, 100, 90); o.teal = radial(64, 95, 224, 200); o.warm = radial(48, 255, 190, 100);
    // chevron pointing +x, dark under-stroke + white stroke (reads on any backdrop)
    let c = cvs(28, 28), x;
    if (c) { x = c.getContext('2d'); x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(9, 6); x.lineTo(19, 14); x.lineTo(9, 22);
      x.strokeStyle = '#0f3a52'; x.lineWidth = 4.6; x.stroke(); x.strokeStyle = '#eafffb'; x.lineWidth = 2.6; x.stroke(); }
    o.chev = c;
    // brass piston rod: 12 across x 16 along (stretched along its length)
    c = cvs(12, 16);
    if (c) { x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 12, 0);
      g.addColorStop(0, '#4a3512'); g.addColorStop(0.18, '#a98233'); g.addColorStop(0.42, '#f6dc8c'); g.addColorStop(0.6, '#d3a845'); g.addColorStop(1, '#4f3913');
      x.fillStyle = g; x.fillRect(0, 0, 12, 16); x.fillStyle = 'rgba(30,20,6,0.5)'; x.fillRect(0, 0, 1, 16); x.fillRect(11, 0, 1, 16); }
    o.rod = c;
    // wall flange: 28 x 9 brass collar with bolts
    c = cvs(56, 18);
    if (c) { x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 18);
      g.addColorStop(0, '#f2d27c'); g.addColorStop(0.5, '#b98d36'); g.addColorStop(1, '#5a3f14');
      x.fillStyle = '#2a1d08'; x.fillRect(0, 0, 56, 18); x.fillStyle = g; x.fillRect(2, 2, 52, 14);
      x.fillStyle = '#3d2a0c'; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(8 + k * 13.3, 9, 2.4, 0, TAU); x.fill(); }
      x.fillStyle = 'rgba(255,240,180,0.7)'; x.fillRect(2, 2, 52, 2); }
    o.flange = c;
    // brass lantern hanging from its ring at the top centre (logical 20 x 34, baked 3x)
    c = cvs(60, 102);
    if (c) {
      x = c.getContext('2d'); x.scale(3, 3);
      x.strokeStyle = '#8a6a2a'; x.lineWidth = 1.4; x.beginPath(); x.arc(10, 2.2, 2, 0, TAU); x.stroke();            // ring
      const cap = x.createLinearGradient(0, 4, 0, 10); cap.addColorStop(0, '#f2d27c'); cap.addColorStop(1, '#a37a2c');
      x.fillStyle = cap; x.beginPath(); x.moveTo(8, 4); x.lineTo(12, 4); x.lineTo(16, 10); x.lineTo(4, 10); x.closePath(); x.fill();   // cap
      x.fillStyle = '#5a3f14'; x.fillRect(4, 10, 12, 1.2);
      const gl = x.createRadialGradient(10, 18, 0.5, 10, 18, 9); gl.addColorStop(0, 'rgba(255,248,210,1)'); gl.addColorStop(0.35, 'rgba(255,205,110,0.95)'); gl.addColorStop(1, 'rgba(255,140,50,0.82)');
      x.fillStyle = gl; x.beginPath(); x.moveTo(5, 11.2); x.lineTo(15, 11.2); x.lineTo(14, 25); x.lineTo(6, 25); x.closePath(); x.fill();   // glass
      x.fillStyle = '#fff6d0'; x.beginPath(); x.moveTo(10, 13.5); x.quadraticCurveTo(12.6, 18, 10, 22); x.quadraticCurveTo(7.4, 18, 10, 13.5); x.fill();  // flame
      x.strokeStyle = '#b98d36'; x.lineWidth = 1.1; x.beginPath(); x.moveTo(5, 11.2); x.lineTo(6, 25); x.moveTo(15, 11.2); x.lineTo(14, 25); x.moveTo(10, 11.2); x.lineTo(10, 13); x.stroke();  // frame bars
      x.fillStyle = '#a37a2c'; x.beginPath(); x.moveTo(5.5, 25); x.lineTo(14.5, 25); x.lineTo(12.5, 29); x.lineTo(7.5, 29); x.closePath(); x.fill(); // base
      x.fillStyle = '#e8bd5a'; x.fillRect(5.5, 25, 9, 1); x.beginPath(); x.arc(10, 30.4, 1.4, 0, TAU); x.fill();   // finial
    }
    o.lantern = c;
    // soft violet-teal floor glow for the band under the room (8 x 64, stretched)
    c = cvs(8, 64);
    if (c) { x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(255,196,110,0.30)'); g.addColorStop(0.12, 'rgba(130,120,235,0.20)'); g.addColorStop(0.6, 'rgba(70,110,200,0.08)'); g.addColorStop(1, 'rgba(60,90,190,0)');
      x.fillStyle = g; x.fillRect(0, 0, 8, 64); }
    o.band = c;
    return o;
  }
  function spr() { return SK.spr || (SK.spr = bakeSprites()); }

  // ---------- static art painters. origin = room origin, 1 unit = 1 css px (world * sc) ----------
  function inWall(room, wx, wy, skip) {
    if (wx < 0 || wy < 0 || wx > (room.w || 336) || wy > (room.h || 500)) return true;   // outside the room frame: nothing to light
    const ws = room.walls || [];
    for (let i = 0; i < ws.length; i++) { if (i === skip) continue; const w = ws[i]; if (wx > w[0] && wx < w[0] + w[2] && wy > w[1] && wy < w[1] + w[3]) return true; }
    return false;
  }
  function nearHaz(room, wx, wy) {
    const e = 14, hz = [];
    (room.spikes || []).forEach(function (s) { hz.push(s.r); }); (room.gates || []).forEach(function (g) { hz.push(g.r); });
    (room.crushers || []).forEach(function (c) { const a = c.amp || 0; hz.push([c.r[0] - (c.ax ? a : 0), c.r[1] - (c.ay ? a : 0), c.r[2] + (c.ax ? 2 * a : 0), c.r[3] + (c.ay ? 2 * a : 0)]); });
    for (let i = 0; i < hz.length; i++) { const r = hz[i]; if (wx > r[0] - e && wx < r[0] + r[2] + e && wy > r[1] - e && wy < r[1] + r[3] + e) return true; }
    return false;
  }
  function bracket(c2, X, Y, sx, sy, lim) {
    const arm = Math.max(4, Math.min(10, lim)), t3 = Math.min(3.4, arm * 0.4), ov = 1.5;
    const hx = sx > 0 ? X + ov - arm : X - ov, hy = sy > 0 ? Y + ov - t3 : Y - ov, vx = sx > 0 ? X + ov - t3 : X - ov, vy = sy > 0 ? Y + ov - arm : Y - ov;
    c2.fillStyle = '#3a2808'; c2.fillRect(hx - 1, hy - 1, arm + 2, t3 + 2); c2.fillRect(vx - 1, vy - 1, t3 + 2, arm + 2);
    c2.fillStyle = '#d6a843'; c2.fillRect(hx, hy, arm, t3); c2.fillRect(vx, vy, t3, arm);
    c2.fillStyle = '#fff0b0'; c2.fillRect(hx, sy > 0 ? hy : hy, arm, 1); c2.fillRect(vx, vy, 1, arm);
    c2.fillStyle = '#6b4a14'; c2.beginPath(); c2.arc(sx > 0 ? X - t3 / 2 + ov : X + t3 / 2 - ov, sy > 0 ? Y - t3 / 2 + ov : Y + t3 / 2 - ov, 1, 0, TAU); c2.fill();
  }
  // ---- moonstone plates: one material for ledges, tall blocks and room walls (outer walls: darker, bigger bricks) ----
  function stoneRng(s) {   // local mulberry32: fixed seed, never the game RNG
    let a = s >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const WARM = [186, 172, 160], COOL = [156, 152, 184];   // cream <-> lilac-grey moonstone (luma ~0.67 / 0.62: below hero gold 0.76)
  function stoneTile() { const A = PL.Assets; return A && A.get ? (A.get('stoneTile') || A.get('stone-tile') || null) : null; }   // optional seamless 128 px tile
  function paintStone(c2, x, y, w, h, outer, seed, set) {
    const BH = outer ? 11 : 9, BW = outer ? 27 : 20, rng = stoneRng(seed * 7919 + 17), n = Math.max(1, Math.round(h / BH)), bh = h / n, dk = outer ? 0.84 : 1, bricks = [];
    c2.save(); c2.beginPath(); c2.rect(x, y, w, h); c2.clip();
    c2.fillStyle = outer ? (set.WALL || '#8b82a3') : (set.STONE || '#b0a6c2'); c2.fillRect(x, y, w, h);
    for (let r = 0; r < n; r++) {
      const yy = Math.round(y + r * bh), yh = Math.round(y + (r + 1) * bh) - yy, off = (r & 1) ? BW / 2 : 0;
      for (let bx = x - off - Math.floor(rng() * 3); bx < x + w; bx += BW) {
        const t = rng(), v = (1 + (rng() - 0.5) * 0.14) * dk, X = Math.round(bx);   // warm<->cool mix, +-7% value
        const cr = Math.round((WARM[0] + (COOL[0] - WARM[0]) * t) * v), cg = Math.round((WARM[1] + (COOL[1] - WARM[1]) * t) * v), cb = Math.round((WARM[2] + (COOL[2] - WARM[2]) * t) * v);
        c2.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')'; c2.fillRect(X, yy, BW, yh);
        bricks.push(X, yy, yh);
      }
    }
    const tl = stoneTile();   // real texture when an art tile is present: soft-light over the brick tones at native scale
    if (tl) { try { const pt = c2.createPattern(tl, 'repeat'); if (pt) { c2.save(); c2.globalCompositeOperation = 'soft-light'; c2.globalAlpha = 0.55; c2.fillStyle = pt; c2.fillRect(x, y, w, h); c2.restore(); } } catch (e) { /* procedural only */ } }
    for (let k = 0; k < bricks.length; k += 3) {   // per-brick bevel: light top-left, dark bottom-right (the dark edge doubles as the mortar joint)
      const X = bricks[k], yy = bricks[k + 1], yh = bricks[k + 2];
      c2.fillStyle = 'rgba(255,250,240,0.26)'; c2.fillRect(X, yy, BW, 1); c2.fillRect(X, yy, 1, yh);
      c2.fillStyle = 'rgba(34,24,60,0.5)'; c2.fillRect(X, yy + yh - 1, BW, 1); c2.fillRect(X + BW - 1, yy, 1, yh);
    }
    const g = c2.createLinearGradient(0, y, 0, y + h);   // soft vertical shade: tall blocks darken toward the bottom
    g.addColorStop(0, 'rgba(30,20,64,0)'); g.addColorStop(0.35, 'rgba(30,20,64,0.04)'); g.addColorStop(1, 'rgba(30,20,64,' + (outer ? 0.42 : 0.34) + ')');
    c2.fillStyle = g; c2.fillRect(x, y, w, h);
    c2.restore();
  }
  // decor corbel under the free end of a thin ledge: curved brass console hanging 9 px below the rect (d = distance inboard from the end)
  function corbel(c2, xe, yb, dir) {
    const X = function (d) { return xe - dir * d; };
    c2.save(); c2.beginPath();
    c2.moveTo(X(2), yb - 0.5); c2.lineTo(X(2), yb + 9); c2.lineTo(X(5.5), yb + 9); c2.lineTo(X(5.5), yb + 6.5); c2.quadraticCurveTo(X(7), yb + 2.5, X(16), yb - 0.5); c2.closePath();
    c2.lineJoin = 'round'; c2.strokeStyle = '#3a2808'; c2.lineWidth = 2.4; c2.stroke();
    c2.fillStyle = '#d6a843'; c2.fill();
    c2.strokeStyle = '#fff0b0'; c2.lineWidth = 1; c2.beginPath(); c2.moveTo(X(3), yb + 1); c2.lineTo(X(3), yb + 8); c2.stroke();
    c2.fillStyle = '#6b4a14'; c2.beginPath(); c2.arc(X(3.8), yb + 3, 0.9, 0, TAU); c2.fill();
    c2.restore();
  }
  // brass end cap on a thin ledge's free end (inside the rect)
  function endCap(c2, xe, y, h, dir) {
    const x = dir > 0 ? xe - 4 : xe;
    c2.fillStyle = '#3a2808'; c2.fillRect(x, y, 4, h); c2.fillStyle = '#d6a843'; c2.fillRect(x + (dir > 0 ? 0 : 1), y + 1, 3, h - 2);
    c2.fillStyle = '#fff0b0'; c2.fillRect(x + (dir > 0 ? 0 : 1), y + 1, 1, h - 2);
    c2.fillStyle = '#6b4a14'; c2.beginPath(); c2.arc(x + 2, y + h / 2, 0.9, 0, TAU); c2.fill();
  }
  function paintWalls(c2, room, sc, only) {
    const A = PL.Assets, ws = room.walls || [], set = (A && A.settings) || {}, rw = room.w || 336, rh = room.h || 500;
    const lo = only == null ? 0 : only, hi = only == null ? ws.length : only + 1;
    const isOuter = function (w) { return w[0] <= 0.5 || w[1] <= 0.5 || w[0] + w[2] >= rw - 0.5 || w[1] + w[3] >= rh - 0.5; };
    const isFloor = function (w) { return w[1] + w[3] >= rh - 0.5 && w[2] > rw * 0.5; };
    for (let i = lo; i < hi; i++) {
      const w = ws[i], x0 = R(w[0] * sc), y0 = R(w[1] * sc), x1 = R((w[0] + w[2]) * sc), y1 = R((w[1] + w[3]) * sc);
      paintStone(c2, x0, y0, x1 - x0, y1 - y0, isOuter(w), i + 1, set);
    }
    // gold only on walkable tops (4 px band + highlight + dark line + 8 px warm glow); 2 px brass trim on exposed sides/bottoms of inner blocks
    const STEP = 6, th = 8;
    for (let i = lo; i < hi; i++) {
      const w = ws[i], outer = isOuter(w), thin = !outer && w[3] * sc <= 30 && w[2] * sc >= 40;
      if (outer) {   // inner edge shadow: 12 px gradient onto the interior from the faces that look into the room (baked once)
        const ax = w[0] * sc, ay = w[1] * sc, bx = (w[0] + w[2]) * sc, by = (w[1] + w[3]) * sc, d = 12;
        const side = isFloor(w) ? 0 : (w[1] <= 0.5 && w[2] > rw * 0.5) ? 2 : (w[0] <= 0.5 ? 1 : 3);
        let gr;
        if (side === 1) gr = c2.createLinearGradient(bx, 0, bx + d, 0); else if (side === 3) gr = c2.createLinearGradient(ax, 0, ax - d, 0);
        else if (side === 2) gr = c2.createLinearGradient(0, by, 0, by + d); else gr = c2.createLinearGradient(0, ay, 0, ay - d);
        gr.addColorStop(0, 'rgba(10,6,34,0.55)'); gr.addColorStop(1, 'rgba(10,6,34,0)');
        c2.fillStyle = gr;
        if (side === 1) c2.fillRect(bx, ay, d, by - ay); else if (side === 3) c2.fillRect(ax - d, ay, d, by - ay);
        else if (side === 2) c2.fillRect(ax, by, bx - ax, d); else c2.fillRect(ax, ay - d, bx - ax, d);
      }
      for (let f = 0; f < 4; f++) {
        if (outer && !(f === 0 && isFloor(w))) continue;   // room frame: masonry only, no gold outline
        const horiz = f === 0 || f === 2, len = horiz ? w[2] : w[3], nx = f === 1 ? 1 : f === 3 ? -1 : 0, ny = f === 2 ? 1 : f === 0 ? -1 : 0;
        const fx = f === 1 ? w[0] + w[2] : w[0], fy = f === 2 ? w[1] + w[3] : w[1];
        let run = -1;
        const flush = function (end) {
          if (run < 0) return;
          const a0 = run * STEP, a1 = Math.min(len, end * STEP), X = (horiz ? fx + a0 : fx) * sc, Y = (horiz ? fy : fy + a0) * sc, L = (a1 - a0) * sc;
          const top = f === 0;
          if (top && !nearHazRun) {   // warm glow above the walkable top
            const gr = c2.createLinearGradient(0, Y - th, 0, Y); gr.addColorStop(0, 'rgba(255,196,90,0)'); gr.addColorStop(1, 'rgba(255,196,90,0.42)');
            c2.fillStyle = gr; c2.fillRect(X, Y - th, L, th);
          }
          if (top) {
            c2.fillStyle = '#d9a63e'; c2.fillRect(X, Y, L, 4); c2.fillStyle = '#f0c860'; c2.fillRect(X, Y + 1, L, 1.5); c2.fillStyle = '#fff4c0'; c2.fillRect(X, Y, L, 1);
            c2.fillStyle = '#5e4010'; c2.fillRect(X, Y + 4, L, 1);
          } else {     // 2 px brass trim inside the rect, with a darker inner line
            c2.fillStyle = '#cf9f3c';
            if (f === 2) c2.fillRect(X, Y - 2, L, 2); else if (f === 1) c2.fillRect(X - 2, Y, 2, L); else c2.fillRect(X, Y, 2, L);
            c2.fillStyle = 'rgba(255,230,150,0.75)';
            if (f === 2) c2.fillRect(X, Y - 2, L, 1); else if (f === 1) c2.fillRect(X - 2, Y, 1, L); else c2.fillRect(X + 1, Y, 1, L);
            c2.fillStyle = 'rgba(70,48,10,0.6)';
            if (f === 2) c2.fillRect(X, Y, L, 1); else if (f === 1) c2.fillRect(X - 3, Y, 1, L); else c2.fillRect(X + 2, Y, 1, L);
          }
          run = -1;
        };
        let nearHazRun = false;
        for (let k = 0; k * STEP < len; k++) {
          const a = Math.min(len, k * STEP + STEP / 2), px = horiz ? fx + a : fx, py = horiz ? fy : fy + a;
          const covered = inWall(room, px + nx * 2, py + ny * 2, i), nh = nearHaz(room, px, py);
          if (covered || nh !== nearHazRun) { flush(k); }
          if (!covered && run < 0) { run = k; nearHazRun = nh; }
        }
        flush(Math.ceil(len / STEP));
      }
      if (outer) continue;
      if (thin) {   // brass end caps + decor corbel under each free end (not near hazards or other walls)
        for (let e = 0; e < 2; e++) {
          const wx = e ? w[0] + w[2] : w[0], dir = e ? 1 : -1, by = w[1] + w[3];
          if (inWall(room, wx + dir * 2, w[1] + w[3] / 2, i)) continue;
          endCap(c2, wx * sc, w[1] * sc + 1, w[3] * sc - 1, dir);
          if (!inWall(room, wx - dir * 8, by + 6, i) && !nearHaz(room, wx - dir * 6, by + 4)) corbel(c2, wx * sc, by * sc, dir);
        }
        continue;
      }
      for (let q = 0; q < 4; q++) {   // brass corner brackets on tall blocks
        const sx = q & 1 ? 1 : -1, sy = q & 2 ? 1 : -1, cx = (q & 1 ? w[0] + w[2] : w[0]), cy = (q & 2 ? w[1] + w[3] : w[1]);
        if (inWall(room, cx + sx * 2.5, cy + sy * 2.5, i) || inWall(room, cx + sx * 2.5, cy - sy * 2.5, i) || inWall(room, cx - sx * 2.5, cy + sy * 2.5, i)) continue;
        bracket(c2, cx * sc, cy * sc, sx, sy, Math.min(w[2], w[3]) * sc * 0.42);
      }
    }
  }
  // spikes: chunky coral crystals drawn in code inside the hit rect (+2 px at the tips only); hit rect unchanged (see debug overlay)
  const SPIKE_K = 1;   // glint scale handed to Vfx: art no longer exceeds the hit rect by more than SPIKE_EXT
  const SPIKE_EXT = 4, SPIKE_WIDEN = 1.0;
  const SPIKE_H = [1, 0.6, 0.84, 0.5, 0.94, 0.68, 0.56, 0.88];   // fixed tall/short pattern (no RNG)
  function spikeArt(room, s, sc, k) {
    const r = s.r, dir = dirOfSpike(room, r), e = SPIKE_EXT * sc; let x = r[0] * sc, y = r[1] * sc, w = r[2] * sc, h = r[3] * sc;
    if (dir === 0) { y -= e; h += e; } else if (dir === 2) h += e; else if (dir === 1) w += e; else { x -= e; w += e; }
    return { x: x, y: y, w: w, h: h, dir: dir };
  }
  function paintSpikes(c2, room, sc, only) {
    const sp = room.spikes || [], ANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    for (let i = only == null ? 0 : only, hi = only == null ? sp.length : only + 1; i < hi; i++) {
      const a = spikeArt(room, sp[i], sc, SPIKE_K), horiz = a.dir === 0 || a.dir === 2, L = horiz ? a.w : a.h, T = horiz ? a.h : a.w;
      const bar = Math.max(2 * sc, Math.min(4 * sc, T * 0.24)), pitch0 = Math.max(6.5 * sc, Math.min(12 * sc, T * 0.72));
      const n = Math.max(1, Math.round(L / pitch0)), pitch = L / n, bw = pitch * 1.06;
      c2.save(); c2.translate(a.x + a.w / 2, a.y + a.h / 2); c2.rotate(ANG[a.dir]);   // local: tips toward -y, wall (base) at +y, length along x
      const im = PL.Assets && PL.Assets.get && PL.Assets.get('spikes');
      if (im && im.width > 0) {
        // shipped art, natural size read from the image, stretched along the row (SPIKE_WIDEN) into a whole number of tiles: fewer, chunkier crystals
        const asp = im.width / im.height, cw0 = T * asp * SPIKE_WIDEN, nt = Math.max(1, Math.round(L / cw0)), cw = L / nt;
        for (let k = 0; k < nt; k++) c2.drawImage(im, -L / 2 + k * cw, -T / 2, cw, T);
        c2.fillStyle = '#5a3f14'; c2.fillRect(-L / 2, T / 2 - Math.max(1.5, 1.6 * sc), L, Math.max(1.5, 1.6 * sc));   // mounting edge line (the art carries its own brass base)
        c2.restore(); continue;
      }
      const yb = T / 2 - bar * 0.7;   // crystal feet sink slightly into the bar
      c2.lineJoin = 'round';
      for (let k = 0; k < n; k++) {
        const cx = -L / 2 + (k + 0.5) * pitch, ht = (T - bar * 0.7 - 0.5 * sc) * SPIKE_H[(k + i * 3) % SPIKE_H.length], tip = yb - ht;
        const sh = ht * 0.42;
        c2.beginPath(); c2.moveTo(cx - bw / 2, yb); c2.lineTo(cx - bw * 0.4, yb - sh); c2.lineTo(cx, tip); c2.lineTo(cx + bw * 0.4, yb - sh); c2.lineTo(cx + bw / 2, yb); c2.closePath();
        c2.fillStyle = '#ff7f70'; c2.fill();
        c2.beginPath(); c2.moveTo(cx, tip); c2.lineTo(cx + bw * 0.4, yb - sh); c2.lineTo(cx + bw / 2, yb); c2.lineTo(cx, yb); c2.closePath();
        c2.fillStyle = '#c52f40'; c2.fill();
        c2.beginPath(); c2.moveTo(cx - bw * 0.12, yb - ht * 0.3); c2.lineTo(cx - bw * 0.02, tip + ht * 0.28); c2.lineTo(cx - bw * 0.02, yb - ht * 0.3); c2.closePath();
        c2.fillStyle = 'rgba(255,225,205,0.75)'; c2.fill();
        c2.beginPath(); c2.moveTo(cx - bw / 2, yb); c2.lineTo(cx - bw * 0.4, yb - sh); c2.lineTo(cx, tip); c2.lineTo(cx + bw * 0.4, yb - sh); c2.lineTo(cx + bw / 2, yb);
        c2.strokeStyle = 'rgba(122,26,44,0.7)'; c2.lineWidth = Math.max(0.7, 0.7 * sc); c2.stroke();
      }
      // brass base bar (wider than the crystal feet, sits on the wall face)
      const bg = c2.createLinearGradient(0, T / 2 - bar, 0, T / 2); bg.addColorStop(0, '#f2d27c'); bg.addColorStop(1, '#8a6420');
      c2.fillStyle = bg; c2.fillRect(-L / 2, T / 2 - bar, L, bar);
      c2.fillStyle = '#4a3512'; c2.fillRect(-L / 2, T / 2 - bar, L, Math.max(0.6, 0.8 * sc));
      c2.restore();
    }
  }
  function paintGateBodies(c2, room, sc, only) {
    const gs = room.gates || [];
    for (let i = only == null ? 0 : only, hi = only == null ? gs.length : only + 1; i < hi; i++) {
      const r = gs[i].r, x = r[0] * sc, y = r[1] * sc, w = r[2] * sc, h = r[3] * sc, horiz = r[2] >= r[3], L = horiz ? w : h, A = horiz ? h : w;
      c2.save(); c2.translate(x + w / 2, y + h / 2); if (!horiz) c2.rotate(Math.PI / 2);   // local: ribbon along x, orbs toward -y
      // aurora ribbon: dark teal underlay (so chevrons read on any backdrop), bright teal core, static wavy streaks
      c2.fillStyle = 'rgba(6,44,66,0.55)'; c2.fillRect(-L / 2, -A / 2, L, A);
      const gr = c2.createLinearGradient(0, -A / 2, 0, A / 2);
      gr.addColorStop(0, 'rgba(60,190,200,0.30)'); gr.addColorStop(0.5, 'rgba(120,245,225,0.72)'); gr.addColorStop(1, 'rgba(60,190,200,0.30)');
      c2.fillStyle = gr; c2.fillRect(-L / 2, -A / 2, L, A);
      c2.save(); c2.beginPath(); c2.rect(-L / 2, -A / 2, L, A); c2.clip();
      const nseg = Math.max(8, Math.round(L / 4));
      for (let l = 0; l < 3; l++) {
        c2.beginPath();
        for (let k = 0; k <= nseg; k++) { const u = k / nseg, yy = (l - 1) * A * 0.24 + Math.sin((u * 6 + l * 0.37) * Math.PI) * A * 0.12; if (k) c2.lineTo(-L / 2 + u * L, yy); else c2.moveTo(-L / 2, yy); }
        c2.strokeStyle = l === 1 ? 'rgba(210,255,246,0.45)' : 'rgba(170,255,235,0.28)'; c2.lineWidth = Math.max(1, 1.3 * sc); c2.stroke();
      }
      c2.restore();
      c2.fillStyle = 'rgba(150,240,230,0.6)'; c2.fillRect(-L / 2, -A / 2, L, Math.max(0.8, 0.9 * sc)); c2.fillRect(-L / 2, A / 2 - Math.max(0.8, 0.9 * sc), L, Math.max(0.8, 0.9 * sc));
      // two slim brass posts with teal-white glass orb caps (never gold stars)
      const pw = Math.max(5 * sc, A * 0.4), ov = 3.5 * sc, orb = Math.max(4.6 * sc, A * 0.4);
      for (let e = 0; e < 2; e++) {
        const px = e ? L / 2 - pw : -L / 2;
        const bgd = c2.createLinearGradient(px, 0, px + pw, 0); bgd.addColorStop(0, '#6a4b18'); bgd.addColorStop(0.35, '#f2d27c'); bgd.addColorStop(0.65, '#c9993a'); bgd.addColorStop(1, '#5a3f14');
        c2.fillStyle = bgd; c2.fillRect(px, -A / 2 - ov, pw, A + ov * 2);
        c2.fillStyle = '#4a3512'; c2.fillRect(px - 0.5 * sc, A / 2 + ov - 1.4 * sc, pw + 1 * sc, 1.4 * sc);   // foot
        const ox = px + pw / 2, oy = -A / 2 - ov - orb * 0.55;
        c2.fillStyle = '#8a6420'; c2.fillRect(ox - pw * 0.62, -A / 2 - ov - 1.2 * sc, pw * 1.24, 1.6 * sc);   // collar
        const og = c2.createRadialGradient(ox - orb * 0.3, oy - orb * 0.3, orb * 0.1, ox, oy, orb);
        og.addColorStop(0, '#ffffff'); og.addColorStop(0.45, '#b6f6ee'); og.addColorStop(1, '#3fb0b8');
        c2.fillStyle = og; c2.beginPath(); c2.arc(ox, oy, orb, 0, TAU); c2.fill();
        c2.strokeStyle = 'rgba(30,90,110,0.9)'; c2.lineWidth = Math.max(0.8, 0.8 * sc); c2.stroke();
      }
      c2.restore();
    }
  }
  // crusher danger lane (baked): coral gradient strongest at the slam end, solid landing bar there, faint brass guide rails on the sides
  function paintLane(c2, x, y, w, h, face, sc) {
    const horiz = face === 1 || face === 3, end = face === 1 || face === 2 ? 1 : 0;   // end: slam end is at the high-coordinate side
    const g = horiz ? c2.createLinearGradient(x, 0, x + w, 0) : c2.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,120,110,' + (end ? 0 : 0.35) + ')'); g.addColorStop(1, 'rgba(255,120,110,' + (end ? 0.35 : 0) + ')');
    c2.fillStyle = g; c2.fillRect(x, y, w, h);
    const rl = Math.max(1, sc);
    c2.fillStyle = 'rgba(214,172,80,0.5)';
    if (horiz) { c2.fillRect(x, y, w, rl); c2.fillRect(x, y + h - rl, w, rl); } else { c2.fillRect(x, y, rl, h); c2.fillRect(x + w - rl, y, rl, h); }
    const bt = Math.max(3, 3 * sc);
    c2.fillStyle = '#ff6b5e';
    if (horiz) c2.fillRect(end ? x + w - bt : x, y, bt, h); else c2.fillRect(x, end ? y + h - bt : y, w, bt);
  }

  // ---------- room plates: everything static baked once per room + camera scale ----------
  const PAD = 20, REFL = 150;
  // one small canvas per wall / spike row / gate (not one room-sized canvas): transparent space costs fill rate, tiles do not.
  function tile(css, sc, pr, paint) {   // css = [x, y, w, h] in room css px; paint(ctx) draws in room css coordinates
    const w = Math.ceil(css[2] + PAD * 2), h = Math.ceil(css[3] + PAD * 2), c = cvs(w * pr, h * pr);
    if (!c) return null;
    const x = c.getContext('2d'); x.scale(pr, pr); x.translate(PAD - css[0], PAD - css[1]); paint(x);
    return { c: c, x: css[0] - PAD, y: css[1] - PAD, w: w, h: h };
  }
  function bakePlates(room, sc, pr, view) {
    const rw = room.w || 336, rh = room.h || 500, ws = room.walls || [], sp = room.spikes || [], gs = room.gates || [];
    const back = [], front = [];
    for (let i = 0; i < ws.length; i++) { const w = ws[i], t = tile([w[0] * sc, w[1] * sc, w[2] * sc, w[3] * sc], sc, pr, function (x) { paintWalls(x, room, sc, i); }); if (!t) return null; back.push(t); }
    for (let i = 0; i < sp.length; i++) { const a = spikeArt(room, sp[i], sc, SPIKE_K), t = tile([a.x, a.y, a.w, a.h], sc, pr, function (x) { paintSpikes(x, room, sc, i); }); if (!t) return null; t.haz = 1; front.push(t); }
    for (let i = 0; i < gs.length; i++) { const r = gs[i].r, t = tile([r[0] * sc, r[1] * sc, r[2] * sc, r[3] * sc], sc, pr, function (x) { paintGateBodies(x, room, sc, i); }); if (!t) return null; front.push(t); }
    (room.crushers || []).forEach(function (c) {
      const am = c.amp || 0; if (am <= 0) return;
      const lx = (c.r[0] - (c.ax ? am : 0)) * sc, ly = (c.r[1] - (c.ay ? am : 0)) * sc, lw = (c.r[2] + (c.ax ? am * 2 : 0)) * sc, lh = (c.r[3] + (c.ay ? am * 2 : 0)) * sc, fc = crusherFace(room, c);
      const t = tile([lx, ly, lw, lh], sc, pr, function (x) { paintLane(x, lx, ly, lw, lh, fc, sc); }); if (t) { t.haz = 1; back.push(t); }
    });
    const P = { room: room, sc: sc, pr: pr, back: back, front: front, refl: null, w: Math.ceil(rw * sc + PAD * 2), h: Math.ceil(rh * sc + PAD * 2), rebuild: 0 };
    // soft floor reflection of the lowest REFL px of the room, faded; hazards (spikes, crusher lanes: t.haz) are left out so coral stays only on real danger; fills the band under the room on tall screens
    const tmp = cvs(P.w * pr, P.h * pr), rf = cvs(P.w * pr, REFL * pr);
    if (tmp && rf) {
      const tx = tmp.getContext('2d'); tx.scale(pr, pr);
      for (let i = 0; i < back.length; i++) if (!back[i].haz) tx.drawImage(back[i].c, back[i].x + PAD, back[i].y + PAD, back[i].w, back[i].h);
      for (let i = 0; i < front.length; i++) if (!front[i].haz) tx.drawImage(front[i].c, front[i].x + PAD, front[i].y + PAD, front[i].w, front[i].h);
      const x = rf.getContext('2d'), srcH = Math.min(REFL, rh * sc) * pr, srcY = (PAD + rh * sc) * pr - srcH;
      x.save(); x.translate(0, REFL * pr); x.scale(1, -1); x.drawImage(tmp, 0, srcY, tmp.width, srcH, 0, 0, tmp.width, srcH); x.restore();
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(70,60,150,0.5)'; x.fillRect(0, 0, rf.width, rf.height);
      x.globalCompositeOperation = 'destination-in';
      const g = x.createLinearGradient(0, 0, 0, rf.height); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.5, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, rf.width, rf.height);
      P.refl = rf; tmp.width = 1; tmp.height = 1;   // release the temporary composite
    }
    return P;
  }
  function ensurePlates(room, S, view, vq) {
    const pr = Math.min(view.dpr || 1, vq === 'full' ? 2 : 1.5), sc = S.sc;
    let P = SK.plates;
    if (P && P.room === room && P.pr === pr) {
      const ratio = sc / P.sc;
      if (Math.abs(ratio - 1) < 0.002) { P.rebuild = 0; return P; }
      if (Math.abs(ratio - 1) < 0.06 && P.rebuild++ < 14) return P;   // camera zoom spring still moving: stretch the tiles, rebuild once it settles
    }
    try { P = SK.plates = bakePlates(room, sc, pr, view); } catch (e) { P = SK.plates = null; SK.errs++; }
    try { if (PL.Vfx && PL.Vfx.setRimBaked) PL.Vfx.setRimBaked(!!P); } catch (e) { /* ignore */ }
    return P;
  }
  function blitTiles(ctx, list, P, S, dpr) {
    const k = S.sc / P.sc, ox = S.sx(0), oy = S.sy(0), snap = Math.abs(k - 1) < 0.002;
    for (let i = 0; i < list.length; i++) {
      const t = list[i]; let x = ox + t.x * k, y = oy + t.y * k;
      if (snap) { x = Math.round(x * dpr) / dpr; y = Math.round(y * dpr) / dpr; }
      ctx.drawImage(t.c, x, y, t.w * k, t.h * k);
    }
  }

  // ---------- world pieces (per frame) ----------
  function R(v) { return Math.round(v); }
  function drawFloorBand(ctx, room, P, S, dpr, quality) {
    const y0 = S.sy(room.h || 500);
    if (y0 > S.H - 6) return;
    const sp = spr(), k = S.sc / P.sc;
    ctx.save();
    if (sp.band && quality !== 'off') { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sp.band, 0, y0, S.W, S.H - y0); ctx.globalCompositeOperation = 'source-over'; }
    if (P.refl) ctx.drawImage(P.refl, S.sx(0) - PAD * k, y0, P.w * k, REFL * k);
    ctx.restore();
  }
  function drawWallsDirect(ctx, room, S) { ctx.save(); ctx.translate(S.sx(0), S.sy(0)); paintWalls(ctx, room, S.sc); ctx.restore(); }

  function crackPts(i, n) { // deterministic zigzag, unit box
    const pts = []; let a = (i * 2654435761 + 12345) >>> 0;
    for (let k = 0; k <= n; k++) { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; pts.push([k / n, 0.15 + 0.7 * ((a >>> 8) & 255) / 255]); }
    return pts;
  }
  // lanterns hang on the border walls, clear of the hero start, exit and hazards (3 max)
  function pickLanterns(room) {
    const rw = room.w || 336, rh = room.h || 500, st = room.start || { x: 0, y: 0 }, ex = room.exit || { x: -999, y: -999 }, out = [];
    const bad = [];
    (room.spikes || []).forEach(function (s) { bad.push(s.r); });
    (room.crushers || []).forEach(function (c) { const a = c.amp || 0; bad.push([c.r[0] - (c.ax ? a : 0), c.r[1] - (c.ay ? a : 0), c.r[2] + (c.ax ? 2 * a : 0), c.r[3] + (c.ay ? 2 * a : 0)]); });
    (room.gates || []).forEach(function (g) { bad.push(g.r); });
    const walls = room.walls || [];
    const free = function (x, y) {
      if (Math.hypot(x - st.x, y - st.y) < 70 || Math.hypot(x - ex.x, y - ex.y) < 70) return false;
      for (let i = 0; i < bad.length; i++) { const r = bad[i]; if (x > r[0] - 40 && x < r[0] + r[2] + 40 && y > r[1] - 40 && y < r[1] + r[3] + 40) return false; }
      for (let i = 0; i < walls.length; i++) { const w = walls[i]; if (x > w[0] - 6 && x < w[0] + w[2] + 6 && y > w[1] - 6 && y < w[1] + w[3] + 6) return false; }
      return true;
    };
    const cand = [[21, 0.2], [rw - 21, 0.42], [21, 0.62], [rw - 21, 0.78], [21, 0.4], [rw - 21, 0.22], [21, 0.85]];
    for (let i = 0; i < cand.length && out.length < 3; i++) {
      const x = cand[i][0], y = rh * cand[i][1];
      if (!free(x, y)) continue;
      if (out.some(function (o) { return Math.hypot(o.x - x, o.y - y) < 130; })) continue;   // overlapping additive glows bloom into hard-edged blotches
      out.push({ x: x, y: y, ph: i * 1.9 });
    }
    return out;
  }
  function drawLanterns(ctx, S, t, state, dt) {
    const ls = SK.lanterns || [], sp = spr(), g = state && state.g != null ? state.g : 2, tgt = GANG[g], rw = (SK.room && SK.room.w) || 336;
    // pendulum: the lantern body hangs toward the current gravity; a flip lets it swing over with a damped overshoot
    if (!SK.lReady || S.reduced) { SK.lAng = tgt; SK.lVel = 0; SK.lReady = true; }
    else {
      const d = wrapPI(tgt - SK.lAng), h = Math.min(dt, 0.033);
      SK.lVel += (d * 70 - SK.lVel * 5.5) * h; SK.lAng += SK.lVel * h;
    }
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], x = S.sx(l.x), y = S.sy(l.y), k = S.sc;
      if (x < -30 || x > S.W + 30 || y < -30 || y > S.H + 30) continue;
      const fl = S.reduced ? 1 : 0.86 + 0.14 * (0.5 * Math.sin(t * 7 + l.ph) + 0.3 * Math.sin(t * 11.3 + l.ph * 2) + 0.2);
      const sway = S.reduced ? 0 : Math.sin(t * 1.7 + l.ph) * 0.03;
      const wallX = l.x < rw / 2 ? S.sx(l.x - 8) : S.sx(l.x + 8);
      ctx.fillStyle = '#8a6a2a'; ctx.fillRect(Math.min(x, wallX), y - 1.2 * k, Math.abs(wallX - x), 2.4 * k);
      ctx.fillStyle = '#e8bd5a'; ctx.fillRect(wallX - 1.5 * k, y - 4 * k, 3 * k, 8 * k);
      ctx.save(); ctx.translate(x, y); ctx.rotate(SK.lAng + sway); ctx.scale(k * 1.15, k * 1.15);
      const la = PL.Assets && PL.Assets.get && PL.Assets.get('lantern'), lh = la ? 20 * la.height / la.width : 34, fy = la ? lh * 0.55 : 18.5;   // art: 64x128 hung from the chain at top centre; flame ~60% down
      if (la) ctx.drawImage(la, -10, 0, 20, lh); else if (sp.lantern) ctx.drawImage(sp.lantern, -10, 0, 20, 34);
      if (sp.warm) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85 * fl; ctx.drawImage(sp.warm, -13, fy - 13, 26, 26); }
      ctx.restore();
    }
  }
  function drawCrumbles(ctx, room, state, S, t) {
    const A = PL.Assets, cr = room.crumbles || [], K = state.K || PL.C || {};
    for (let i = 0; i < cr.length; i++) {
      const cs = state.crumbleS && state.crumbleS[i], st = cs ? cs.st : 0;
      if (st === 2) continue;
      const r = cr[i], tot = K.CRUMBLE_TICKS || 42, p = st === 1 ? clamp(1 - cs.timer / tot, 0, 1) : 0;
      const jit = st === 1 && !S.reduced ? Math.sin(t * 70 + i) * 1.2 * p * S.sc : 0;
      const x = R(S.sx(r[0]) + jit), y = R(S.sy(r[1])), w = R(S.sc * r[2]), h = R(S.sc * r[3]);
      if (x + w < -8 || x > S.W + 8) continue;
      ctx.save();
      const alpha = 1 - 0.4 * p;
      const ins = Math.min(R(2 * S.sc), Math.floor(w / 4));   // art sits inside the hit rect (inset, never past it)
      if (!(A && A.drawLedge && A.drawLedge(ctx, x + ins, y, w - 2 * ins, h, alpha))) {
        ctx.globalAlpha = alpha; ctx.fillStyle = P.cream; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#9fe6dc'; ctx.fillRect(x, y + h - 3, w, 3);
        ctx.strokeStyle = '#6fb7c8'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.setLineDash([]);
      }
      // crack stages: hairline -> forked -> shattering. Pale (never coral: coral is danger only)
      const stage = st === 0 ? 0 : p < 0.34 ? 1 : p < 0.67 ? 2 : 3;
      if (stage > 0) {
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        for (let c = 0; c < stage + 1; c++) {
          const pts = crackPts(i * 7 + c, 5 + stage * 2), ox = x + w * (0.2 + 0.3 * c), span = w * (0.5 / (c + 1));
          ctx.beginPath();
          for (let k = 0; k < pts.length; k++) { const px = ox + (pts[k][0] - 0.5) * span, py = y + pts[k][1] * h; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.strokeStyle = 'rgba(30,40,90,0.85)'; ctx.lineWidth = 1.6 + 1.4 * p; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.7 + 0.5 * p; ctx.stroke();
        }
        if (stage === 3 && !S.reduced) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(210,255,248,' + (0.25 * (0.5 + 0.5 * Math.sin(t * 12.57))).toFixed(3) + ')'; ctx.fillRect(x, y, w, h); }
      }
      ctx.restore();
    }
  }
  function drawGateFlow(ctx, room, S, t) {
    const gs = room.gates || [], quiet = S.reduced, sp = spr();
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i], r = g.r, d = DIRV[g.dir | 0] || DIRV[2];
      const x = S.sx(r[0]), y = S.sy(r[1]), w = r[2] * S.sc, h = r[3] * S.sc;
      if (x + w < -20 || x > S.W + 20 || y + h < -20 || y > S.H + 20) continue;
      const horiz = r[2] >= r[3], along = horiz ? w : h, across = horiz ? h : w;
      // soft parallel waves slide along the ribbon (body + posts are in the front plate); normal blend, never crossing
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.strokeStyle = 'rgba(205,255,246,0.34)'; ctx.lineWidth = Math.max(1, 1.3 * S.sc);
      const n = Math.max(12, Math.min(90, Math.round(along / 4)));
      for (let l = 0; l < 2; l++) {
        ctx.beginPath();
        for (let s = 0; s <= n; s++) {
          const u = s / n, wv = Math.sin((u * 6 + (quiet ? 0 : t * 0.9)) * Math.PI) * across * 0.12 + (l ? 0.3 : -0.3) * across * 0.5 * 0.9;
          const px = horiz ? x + u * along : x + w / 2 + wv, py = horiz ? y + h / 2 + wv : y + u * along;
          if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      // chevrons point the way through (d) and flow along d across the line; they spill past the thin ribbon so they read
      if (sp.chev) {
        const cnt = Math.max(2, Math.min(12, Math.round(along / 34))), size = clamp(across * 1.05 + 4, 8, 14) * (S.sc > 0.7 ? 1 : 0.85), cyc = (quiet ? 0.5 : (t * 0.7) % 1), ang = Math.atan2(d[1], d[0]);
        const q = size * 1.7;
        for (let k = 0; k < cnt; k++) {
          const u = (k + 0.5) / cnt, cx = horiz ? x + u * along : x + w / 2, cy = horiz ? y + h / 2 : y + u * along;
          for (let rep = 0; rep < 2; rep++) {
            const ph = (cyc + rep * 0.5) % 1, off = (ph - 0.5) * size * 2.6;
            ctx.globalAlpha = 0.95 * Math.sin(Math.PI * ph);
            ctx.save(); ctx.translate(cx + d[0] * off, cy + d[1] * off); ctx.rotate(ang); ctx.drawImage(sp.chev, -q / 2, -q / 2, q, q); ctx.restore();
          }
        }
        ctx.globalAlpha = 1;
      }
    }
  }
  function drawPortalArt(ctx, room, state, S, t) {
    const ex = room.exit; if (!ex) return;
    const A = PL.Assets, K = state.K || PL.C || {}, rad = K.EXIT_R || 18, cx = S.sx(ex.x), cy = S.sy(ex.y);
    if (cx < -60 || cx > S.W + 60 || cy < -60 || cy > S.H + 60) return;
    const h = rad * 2.55 * S.sc;   // ring diameter of the art ~ 2*EXIT_R
    if (!(A && A.drawPortal && A.drawPortal(ctx, cx, cy - h * 0.03, h, t, { glow: function () { /* PL.Vfx.drawFront adds the breathing crescent glow */ } }))) fbPortal(ctx, cx, cy, rad * S.sc, t);
  }
  function dirOfSpike(room, r) { return (PL.Light && PL.Light.spikeDir) ? PL.Light.spikeDir(room, r) : spikeDir(room, r); }
  function crusherFace(room, c) { // head faces away from the nearest border (the piston comes from that wall)
    const rw = room.w || 336, rh = room.h || 500, r = c.r;
    if (c.ay) return (r[1] + r[3] / 2) < rh / 2 ? 2 : 0;
    return (r[0] + r[2] / 2) < rw / 2 ? 1 : 3;
  }
  // world coordinate of the wall face the piston is mounted on (cached per room)
  function rodMount(room, c, face) {
    const ws = room.walls || [], r = c.r, a = c.amp || 0;
    let best = face === 2 ? 0 : face === 0 ? (room.h || 500) : face === 1 ? 0 : (room.w || 336);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (face === 2 || face === 0) {
        if (r[0] + r[2] / 2 < w[0] || r[0] + r[2] / 2 > w[0] + w[2]) continue;
        if (face === 2 && w[1] + w[3] <= r[1] - a + 2) best = Math.max(best, w[1] + w[3]);
        if (face === 0 && w[1] >= r[1] + r[3] + a - 2) best = Math.min(best, w[1]);
      } else {
        if (r[1] + r[3] / 2 < w[1] || r[1] + r[3] / 2 > w[1] + w[3]) continue;
        if (face === 1 && w[0] + w[2] <= r[0] - a + 2) best = Math.max(best, w[0] + w[2]);
        if (face === 3 && w[0] >= r[0] + r[2] + a - 2) best = Math.min(best, w[0]);
      }
    }
    return best;
  }
  // head at its natural aspect, rotated to face the travel direction; front face flush with the hit rect, any extra length overhangs backwards along the rod.
  // body width factor is measured once from the image's opaque (non-white-sticker) pixels, cached; 1.03 if the pixels cannot be read.
  function headFactor(im) {
    if (SK.headK && SK.headKim === im) return SK.headK;
    let k = 1.03;
    try {
      const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, c = cvs(w, h);
      if (c) {
        const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, w, h).data; let lo = w, hi = -1;
        for (let yy = Math.floor(h * 0.3); yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          const o = (yy * w + xx) * 4; if (d[o + 3] < 128 || (d[o] > 235 && d[o + 1] > 235 && d[o + 2] > 235)) continue;
          if (xx < lo) lo = xx; if (xx > hi) hi = xx;
        }
        if (hi > lo) k = w / (hi - lo + 1);
      }
    } catch (e) { /* tainted or no canvas: keep the default */ }
    SK.headK = k; SK.headKim = im; return k;
  }
  function drawCrusherHead(ctx, A, x, y, w, h, face, sp) {
    const im = A && A.get && A.get('crusher'); if (!im) return false;
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height; if (!iw || !ih) return false;
    const vert = face === 1 || face === 3, across = vert ? h : w, along = vert ? w : h, ang = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][face];
    const hw = across * headFactor(im), headH = hw * ih / iw, fy = along / 2;   // art points down: front edge at +along/2
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(ang);
    if (headH < along - 0.5 && sp && sp.rod) { const rw = hw * 0.3; ctx.drawImage(sp.rod, -rw / 2, -fy, rw, along - headH + 1); }   // rod fills the rest of the rect behind the head
    ctx.drawImage(im, 0, 0, iw, ih, -hw / 2, fy - headH, hw, headH);
    ctx.restore(); return true;
  }
  function drawCrushers(ctx, room, state, S, t) {
    const A = PL.Assets, cs = room.crushers || [], sp = spr();
    if (!SK.rods) SK.rods = cs.map(function (c) { return rodMount(room, c, crusherFace(room, c)); });
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], r = PL.crusherRect ? PL.crusherRect(c, state.t, state.K) : c.r, amp = c.amp || 0, face = crusherFace(room, c);
      // swept lane + telegraph: the lane warms toward coral as the block nears the end of its stroke
      const k = state.K || PL.C || {}, per = k.CRUSHER_PERIOD || 2.4;
      const sn = amp > 0 ? Math.abs(Math.sin(TAU * (state.t / 120) / per + (c.phase || 0))) : 0, hot = sn * sn * sn;
      const lx = S.sx(c.r[0] - (c.ax ? amp : 0)), ly = S.sy(c.r[1] - (c.ay ? amp : 0)), lw = (c.r[2] + (c.ax ? amp * 2 : 0)) * S.sc, lh = (c.r[3] + (c.ay ? amp * 2 : 0)) * S.sc;
      if (lx + lw < -10 || lx > S.W + 10 || ly + lh < -10 || ly > S.H + 10) continue;
      let jx = 0, jy = 0;
      if (hot > 0.93 && !S.reduced) { const q = (hot - 0.93) / 0.07; jx = Math.sin(t * 95 + i) * 1.6 * q * S.sc; jy = Math.cos(t * 83 + i) * 1.6 * q * S.sc; }   // slam shudder
      const x = S.sx(r[0]) + jx, y = S.sy(r[1]) + jy, w = r[2] * S.sc, h = r[3] * S.sc;
      ctx.save();
      if (amp > 0) {
        if (!SK.plates) paintLane(ctx, lx, ly, lw, lh, face, S.sc);   // baked tile normally; direct only if the bake failed
      }
      ctx.restore();
      // brass piston rod from the wall to the head, with a flange collar at the wall
      const wl = SK.rods[i], rodW = clamp((c.ay ? r[2] : r[3]) * 0.2, 7, 13) * S.sc;
      let x0, y0, x1, y1;
      if (face === 2) { x0 = x1 = x + w / 2; y0 = S.sy(wl); y1 = y + 2; } else if (face === 0) { x0 = x1 = x + w / 2; y0 = S.sy(wl); y1 = y + h - 2; }
      else if (face === 1) { y0 = y1 = y + h / 2; x0 = S.sx(wl); x1 = x + 2; } else { y0 = y1 = y + h / 2; x0 = S.sx(wl); x1 = x + w - 2; }
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (sp.rod && len > 1) {
        const ra = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
        ctx.save(); ctx.translate((x0 + x1) / 2, (y0 + y1) / 2); ctx.rotate(ra); ctx.drawImage(sp.rod, -rodW / 2, -len / 2, rodW, len); ctx.restore();
        if (sp.flange) { const fw = rodW * 2.3; ctx.save(); ctx.translate(x0, y0); ctx.rotate(ra); ctx.drawImage(sp.flange, -fw / 2, -1, fw, fw * 0.32); ctx.restore(); }
      }
      const ok = drawCrusherHead(ctx, A, x, y, w, h, face, sp);
      if (!ok) fbCrusher(ctx, x, y, w, h);
    }
  }

  // ---------- hero ----------
  const HERO_K = 1.5;   // body drawn at 1.5x the physics box (hit box unchanged)
  function drawHero(ctx, state, S, dt, now) {
    const A = PL.Assets, V = PL.Vfx, K = state.K || PL.C || {}, half = K.HALF || 11;
    const df = (V && V.heroDeform) ? V.heroDeform() : { sx: 1, sy: 1, ang: 0, bobX: 0, bobY: 0, blink: false, vanish: 0, dx: 0, dy: 0, alpha: 1 };
    const g = state.g == null ? 2 : state.g, dead = state.dead > 0, won = !!state.won;
    // eased turn so the feet swing to the new gravity side (shortest way round)
    const tgt = GANG[g];
    if (!SK.heroReady || S.reduced) { SK.heroAng = tgt; SK.heroReady = true; }
    else {
      let diff = wrapPI(tgt - SK.heroAng); if (Math.abs(diff) > Math.PI - 0.01) diff = Math.PI;
      SK.heroAng += diff * (1 - Math.exp(-dt * 16));
    }
    const grounded = state.grounded !== false, landing = now < SK.landUntil && grounded && !dead && !won;
    const pose = dead ? 'hurt' : won ? 'win' : landing ? 'land' : 'idle';
    const boxPx = half * 2 * S.sc, hh = boxPx * HERO_K;
    const hx = S.sx(state.x + (df.dx || 0)) + df.bobX * S.sc, hy = S.sy(state.y + (df.dy || 0)) + df.bobY * S.sc;
    let alpha = df.alpha == null ? 1 : df.alpha;
    if (dead) alpha *= clamp(state.dead / (K.DEAD_TICKS || 36) * 1.8, 0, 1);
    if (alpha <= 0.01 || (df.sx <= 0.02 && !dead)) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(hx, hy);
    if (pose === 'idle' && !won) {
      let sx = df.sx, sy = df.sy;
      if (state.diveBoost > 0) { sx *= 1.18; sy *= 0.86; }   // dive = idle body stretched along velocity
      ctx.rotate(df.ang); ctx.scale(sx, sy); ctx.rotate(-df.ang);
    } else if (won) ctx.scale(df.sx, df.sy);
    ctx.rotate(SK.heroAng);
    ctx.translate(0, -(hh - boxPx) / 2);   // oversized body stands on the box floor: feet stay at the hit box edge, the head rises
    const sh = grounded ? 0.34 : 0.16;
    let drawn = false;
    if (A && A.drawHero) {
      if (pose === 'land') { const hl = hh * 117 / 192; ctx.translate(0, (hh - hl) / 2 - hh * 0.04); drawn = A.drawHero(ctx, 'land', 0, 0, hl, { shadow: true, shadowAlpha: 0.3 }); }
      else drawn = A.drawHero(ctx, pose, 0, 0, hh, { shadow: !dead, shadowAlpha: sh });
    }
    if (!drawn) fbHero(ctx, hh, dead);
    else if (df.blink && pose === 'idle' && !dead) {   // eyelids over the two eyes
      const wsp = hh * 182 / 192;
      ctx.fillStyle = '#f2bf55';
      for (let e = 0; e < 2; e++) { ctx.beginPath(); ctx.ellipse((e ? 0.12 : -0.17) * wsp, hh * 0.06, wsp * 0.085, hh * 0.05, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#2b2350'; ctx.fillRect(-0.255 * wsp, hh * 0.06, wsp * 0.17, 1); ctx.fillRect(0.035 * wsp, hh * 0.06, wsp * 0.17, 1);
    }
    ctx.restore();
  }

  // ---------- debug overlay: TRUE hit rects (art is bigger than some of them) ----------
  // ---------- debug overlay ----------
  function drawDebug(ctx, room, state, S) {
    const K = state.K || PL.C || {};
    ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([]);
    const box = function (r, col) { ctx.strokeStyle = col; ctx.strokeRect(S.sx(r[0]) + 0.5, S.sy(r[1]) + 0.5, r[2] * S.sc, r[3] * S.sc); };
    (room.walls || []).forEach(function (r) { box(r, '#00e5ff'); });
    (room.spikes || []).forEach(function (s) { box(s.r, '#ff00d0'); });
    (room.gates || []).forEach(function (g) { box(g.r, '#7dff4a'); });
    (room.crumbles || []).forEach(function (r, i) { if (!state.crumbleS || state.crumbleS[i].st !== 2) box(r, '#ffe14a'); });
    (room.crushers || []).forEach(function (c) { box(PL.crusherRect ? PL.crusherRect(c, state.t, state.K) : c.r, '#ff9a00'); });
    const hs = (K.HALF || 11) * S.sc; ctx.strokeStyle = '#ffffff'; ctx.strokeRect(S.sx(state.x) - hs, S.sy(state.y) - hs, hs * 2, hs * 2);
    if (room.exit) { ctx.strokeStyle = '#7dff4a'; ctx.beginPath(); ctx.arc(S.sx(room.exit.x), S.sy(room.exit.y), (K.EXIT_R || 18) * S.sc, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  function drawFallbackBack(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2250'); g.addColorStop(0.6, '#2b2a63'); g.addColorStop(1, '#4a2f5f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  PL.draw = function (ctx, view, frame, state, hud) {
    const t0 = nowMs();
    view = view || { W: 360, H: 640, dpr: 1 }; frame = frame || { scale: 1, cx: 168, cy: 250 }; hud = hud || {};
    const W = view.W || 360, H = view.H || 640, room = (state && state.room) || null, dpr = view.dpr || 1;
    ctx.save();
    try {
      const V = PL.Vfx, sc = frame.scale || 1, cx = frame.cx || 0, cy = frame.cy || 0;
      let dt = SK.last ? (t0 - SK.last) / 1000 : 1 / 60; SK.last = t0;
      if (!(dt > 0) || dt > 0.25) dt = 1 / 60;
      envSetup(view, state, hud, room);
      const S = { W: W, H: H, sc: sc, reduced: !!hud.reduced, sx: function (x) { return (x - cx) * sc + W / 2; }, sy: function (y) { return (y - cy) * sc + H / 2; } };
      const t = V && V.clock ? V.clock() : t0 / 1000;
      const ev = hud.events || SK.ev;
      if (V && V.update && state) {
        V.update(dt, ev, state, state.g);
        for (let i = 0; i < ev.length; i++) if (ev[i] === 'land') SK.landUntil = t0 + 140;
      }
      SK.ev.length = 0;
      const cam = { scale: sc, cx: cx, cy: cy, W: W, H: H };
      const fx = V && V.cameraFx ? V.cameraFx() : null;
      if (fx && !hud.reduced && (fx.shx || fx.shy || fx.tilt || fx.zoom !== 1)) {
        ctx.translate(W / 2, H / 2); ctx.rotate(fx.tilt || 0); ctx.scale(fx.zoom || 1, fx.zoom || 1); ctx.translate(-W / 2 + (fx.shx || 0), -H / 2 + (fx.shy || 0));
      }
      const ql = V && V.quality ? V.quality() : 'full';
      if (V && SK.inited && V.drawBack) V.drawBack(ctx, cam);
      else if (!(PL.Assets && PL.Assets.drawBackdrop && PL.Assets.drawBackdrop(ctx, W, H))) drawFallbackBack(ctx, W, H);
      if (room && state) {
        const PLT = ensurePlates(room, S, view, ql);
        if (PLT) { blitTiles(ctx, PLT.back, PLT, S, dpr); drawFloorBand(ctx, room, PLT, S, dpr, ql); } else drawWallsDirect(ctx, room, S);
        if (V && SK.inited && V.drawGlow) V.drawGlow(ctx, cam);
        drawLanterns(ctx, S, t, state, dt);
        drawCrumbles(ctx, room, state, S, t);
        drawPortalArt(ctx, room, state, S, t);
        if (PLT) blitTiles(ctx, PLT.front, PLT, S, dpr); else { ctx.save(); ctx.translate(S.sx(0), S.sy(0)); paintSpikes(ctx, room, sc); paintGateBodies(ctx, room, sc); ctx.restore(); }
        drawGateFlow(ctx, room, S, t);
        drawCrushers(ctx, room, state, S, t);
        // death replay trail
        if (Array.isArray(hud.trail) && hud.trail.length > 1) {
          const tr = hud.trail, from = Math.max(0, tr.length - 240);
          ctx.save(); ctx.strokeStyle = 'rgba(255,122,107,0.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
          for (let i = from; i < tr.length; i++) { if (i === from) ctx.moveTo(S.sx(tr[i].x), S.sy(tr[i].y)); else ctx.lineTo(S.sx(tr[i].x), S.sy(tr[i].y)); }
          ctx.stroke(); ctx.restore();
        }
        // predicted path (teal dots, fading)
        if (hud.pathOn && !state.dead && !state.won) {
          const pts = PL.predictPath(state, tw('PATH_S', 0.8)); ctx.save();
          for (let i = 1; i < pts.length; i++) { ctx.globalAlpha = 0.9 * (1 - i / (pts.length + 2)); ctx.fillStyle = P.teal; ctx.beginPath(); ctx.arc(S.sx(pts[i].x), S.sy(pts[i].y), 3, 0, TAU); ctx.fill(); }
          ctx.restore();
        }
        if (V && SK.inited && V.drawHeroTrail) V.drawHeroTrail(ctx, cam);
        drawHero(ctx, state, S, dt, t0);
      }
      if (V && SK.inited && V.drawFront) V.drawFront(ctx, cam);
      if (room && state && (hud.debug || tw('SKIN_DEBUG', 0) >= 1 || SK.debug)) drawDebug(ctx, room, state, S);
    } catch (e) {
      SK.errs++; if (SK.errs < 4 && typeof console !== 'undefined') console.warn('skin draw', e);
    }
    ctx.restore();
    SK.frames++; SK.ms += (nowMs() - t0 - SK.ms) * 0.05;
    if (hud.legacyHud) PL.drawHudLegacy(ctx, view, frame, state, hud);
  };
  PL.Skin = { setDebug: function (b) { SK.debug = !!b; }, stats: function () { return { drawMs: SK.ms, frames: SK.frames, errors: SK.errs, bg: SK.bg }; }, _SK: SK };

  // ---------- legacy HUD (paper look). Off unless hud.legacyHud; kept only until ui.js draws via PL.Screens ----------
  PL.drawHudLegacy = function (ctx, view, frame, state, hud) {
    const W = view.W || 360, H = view.H || 640, ins = inset(view), room = (state && state.room) || null;
    const sc = frame.scale || 1, cy = frame.cy || 0;
    const sy = function (y) { return (y - cy) * sc + H / 2; };
    // HUD band (compact): paper under all HUD text; hudTop from camera frame when present
    const bandH = Math.max(frame.hudTop || 0, 84 + ins.t, ins.t + 72);
    ctx.fillStyle = 'rgba(242,236,220,0.92)';
    ctx.fillRect(0, 0, W, bandH);
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, bandH + 0.5); ctx.lineTo(W, bandH + 0.5); ctx.stroke();

    const left = ins.l + 12, top = ins.t;
    const n = hud.roomIdx != null ? hud.roomIdx + 1 : 1, nTot = hud.nRooms || 3;
    // reserve the width of the buttons (Snd/Copy/Path): text must stay left of them
    const maxTxt = Math.max(60, PL.BTN.snd(view).x - 8 - left);
    const mw = function (t, px, bold) {
      ctx.font = (bold ? '700 ' : '500 ') + px + 'px ' + FONT;
      return ctx.measureText ? (ctx.measureText(t).width || t.length * px * 0.55) : t.length * px * 0.55;
    };
    let title = n + '/' + nTot + ' ' + (hud.roomName || ''), tpx = 16;
    if (mw(title, tpx, true) > maxTxt) tpx = 14;
    while (title.length > 4 && mw(title, tpx, true) > maxTxt) title = title.slice(0, -2).replace(/\s+$/, '') + '\u2026';
    text(ctx, title, left, top + 26, tpx, INK, 'left', true);
    let stats = fmtT(hud.timeS) + '  flips ' + (hud.flips || 0) + '  deaths ' + (hud.deaths || 0);
    if (mw(stats, 14, false) > maxTxt) stats = fmtT(hud.timeS) + '  F' + (hud.flips || 0) + '  D' + (hud.deaths || 0);
    text(ctx, stats, left, top + 48, 14, INK);
    const ch = state && state.charges != null ? state.charges : 0, maxc = (PL.C && PL.C.CHARGES) || 2;
    for (let i = 0; i < maxc; i++) {
      const px = left + 8 + i * 22, py = top + 66;
      ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU);
      if (i < ch) { ctx.fillStyle = BRASS; ctx.fill(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    }

    // buttons
    button(ctx, PL.BTN.snd(view), hud.muted ? 'Muted' : 'Sound', !!hud.muted);
    button(ctx, PL.BTN.copy(view), 'Copy', false);
    button(ctx, PL.BTN.path(view), 'Path', !!hud.pathOn);

    // teach banner: never over the room. Goes below the room box when it fits,
    // else sits just above the footer line (bottom thumb zone), translucent.
    if (hud.teach && hud.roomAgeS != null && hud.roomAgeS < 4) {
      const fade = Math.max(0, Math.min(1, (4 - hud.roomAgeS) / 0.5));
      const maxW = W - ins.l - ins.r - 40;
      ctx.font = '600 14px ' + FONT;
      const tw2 = function (t) { return ctx.measureText ? (ctx.measureText(t).width || t.length * 7) : t.length * 7; };
      const words = String(hud.teach).split(/\s+/), lines = [];
      let cur = '';
      for (let i = 0; i < words.length; i++) {
        const t = cur ? cur + ' ' + words[i] : words[i];
        if (cur && tw2(t) > maxW) { lines.push(cur); cur = words[i]; } else cur = t;
      }
      if (cur) lines.push(cur);
      let pw = 0;
      for (let i = 0; i < lines.length; i++) pw = Math.max(pw, tw2(lines[i]));
      pw = Math.min(pw + 24, W - 16);
      const ph = lines.length * 20 + 12, pxx = W / 2 - pw / 2;
      const floorY = H - ins.b - 12, rb = room ? sy(room.h || 500) : 0;
      let pyy = rb + 10, a = 1;
      if (pyy + ph > floorY) { pyy = floorY - ph; a = 0.8; }
      ctx.globalAlpha = fade * a;
      ctx.fillStyle = INK; ctx.fillRect(pxx, pyy, pw, ph);
      for (let i = 0; i < lines.length; i++) text(ctx, lines[i], W / 2, pyy + 21 + i * 20, 14, PAPER, 'center', true);
      ctx.globalAlpha = 1;
    }

    // toast
    if (hud.toast) {
      ctx.font = '700 14px ' + FONT;
      const tw = ctx.measureText ? (ctx.measureText(hud.toast).width || 120) : 120;
      const bw = tw + 24, bx = W / 2 - bw / 2, by = H * 0.55 - 20;
      ctx.fillStyle = INK; ctx.fillRect(bx, by, bw, 32);
      text(ctx, hud.toast, W / 2, by + 21, 14, PAPER, 'center', true);
    }

    // tuning panel
    const tu = hud.tuning;
    if (tu && tu.open) {
      const rows = PL.tuningLayout(view, tu.rows || []);
      const py0 = bandH + 8, last = rows.length ? rows[rows.length - 1].label : { y: py0, h: 0 };
      ctx.fillStyle = PAPER;
      ctx.fillRect(8, py0, W - 16, last.y + last.h + 12 - py0);
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.strokeRect(8, py0, W - 16, last.y + last.h + 12 - py0);
      text(ctx, 'Tuning', 20, py0 + 22, 16, INK, 'left', true);
      if (tu.dirty) {
        ctx.fillStyle = RED; ctx.fillRect(W - 96, py0 + 6, 76, 24);
        text(ctx, 'TUNED', W - 58, py0 + 23, 14, PAPER, 'center', true);
      }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        text(ctx, r.label_text + '  ' + r.value, r.label.x, r.label.y + r.label.h / 2 + 5, 16, INK, 'left', true);
        button(ctx, r.minus, '-', false);
        button(ctx, r.plus, '+', false);
      }
    }

    // complete screen
    const cp = hud.completeScreen;
    if (cp) {
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
      const y0 = Math.max(ins.t + 96, H * 0.22);
      const medal = cp.medal && cp.medal !== 'none' ? String(cp.medal).toUpperCase() : 'NO MEDAL';
      text(ctx, 'Survey complete', W / 2, y0, 28, INK, 'center', true);
      text(ctx, 'Time ' + fmtT(cp.timeS), W / 2, y0 + 40, 18, INK, 'center');
      text(ctx, 'Flips ' + (cp.flips || 0) + '   Deaths ' + (cp.deaths || 0), W / 2, y0 + 66, 18, INK, 'center');
      text(ctx, 'Medal: ' + medal + (cp.flipStar ? '   ★ flip star' : ''), W / 2, y0 + 98, 20, BRASS, 'center', true);
      let yy = y0 + 124;
      if (cp.newBest) { text(ctx, 'New best!', W / 2, yy, 18, RED, 'center', true); yy += 26; }
      if (cp.best) {
        text(ctx, 'Best ' + fmtT(cp.best.timeS) + '  ' + (cp.best.flips || 0) + ' flips' + (cp.best.medal && cp.best.medal !== 'none' ? '  ' + cp.best.medal : ''), W / 2, yy, 14, 'rgba(31,36,48,0.8)', 'center');
        yy += 22;
      }
      const seed = cp.seed != null ? cp.seed : (hud.seed != null ? hud.seed : 1);
      text(ctx, (cp.mode ? cp.mode + '  ' : '') + 'seed ' + seed + (cp.nRooms ? '  ' + cp.nRooms + ' rooms' : ''), W / 2, yy, 14, 'rgba(31,36,48,0.7)', 'center');
      text(ctx, 'tap to continue', W / 2, yy + 36, 18, RED, 'center', true);
      button(ctx, PL.BTN.copy(view), 'Copy', false);
    }
  };

  // ---- menu ----
  PL.menuLayout = function (view, items) {
    const W = (view && view.W) || 360, H = (view && view.H) || 640, i = inset(view);
    items = items || [];
    const w = Math.min(Math.max(240, Math.min(W - 32, 320)), W - 8), h = 64, gap = 16;
    const total = items.length * h + Math.max(0, items.length - 1) * gap;
    let y = i.t + 100;
    if (y + total > H * 0.6) y = Math.max(i.t + 90, H * 0.6 - total);
    const x = (W - w) / 2;
    return items.map(function (it, k) {
      return Object.assign({}, it, { rect: { x: x, y: y + k * (h + gap), w: w, h: h } });
    });
  };
  PL.drawMenu = function (ctx, view, menu) {
    view = view || { W: 360, H: 640 }; menu = menu || {};
    const W = view.W || 360, H = view.H || 640, ins = inset(view);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    text(ctx, menu.title || 'Plumbline', W / 2, ins.t + 48, 36, INK, 'center', true);
    if (menu.sub) text(ctx, menu.sub, W / 2, ins.t + 68, 14, 'rgba(31,36,48,0.7)', 'center');
    const items = PL.menuLayout(view, menu.items || []);
    for (let k = 0; k < items.length; k++) {
      const r = items[k].rect;
      ctx.fillStyle = PAPER2; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h);
      text(ctx, items[k].label, r.x + r.w / 2, r.y + (items[k].sub ? 28 : r.h / 2 + 6), 18, INK, 'center', true);
      if (items[k].sub) text(ctx, items[k].sub, r.x + r.w / 2, r.y + 50, 14, 'rgba(31,36,48,0.7)', 'center');
    }
    let y = items.length ? items[items.length - 1].rect.y + items[items.length - 1].rect.h + 28 : ins.t + 120;
    const bl = menu.bestLines || [];
    for (let k = 0; k < bl.length && y < H - ins.b - 30; k++, y += 20) text(ctx, bl[k], W / 2, y, 14, 'rgba(31,36,48,0.8)', 'center');
    if (menu.hint) text(ctx, menu.hint, W / 2, H - ins.b - 28, 14, 'rgba(31,36,48,0.6)', 'center');
    if (menu.seed != null) text(ctx, 'seed ' + menu.seed, ins.l + 8, H - ins.b - 6, 14, 'rgba(31,36,48,0.6)');
  };

  // ---- tuning panel layout ----
  PL.tuningLayout = function (view, rows) {
    const W = (view && view.W) || 360, i = inset(view);
    rows = rows || [];
    const bandH = 84 + i.t, px = 16, pw = W - 32, rowH = 64;
    const plusX = px + pw - 12 - 56, minusX = plusX - 8 - 56;
    return rows.map(function (r, k) {
      const y = bandH + 8 + 36 + k * rowH;
      return Object.assign({}, r, {
        label_text: r.label,
        label: { x: px + 12, y: y, w: Math.max(40, minusX - 8 - (px + 12)), h: 56 },
        minus: { x: minusX, y: y, w: 56, h: 56 },
        plus: { x: plusX, y: y, w: 56, h: 56 }
      });
    });
  };
})();
