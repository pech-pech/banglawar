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
  // Order: PL.Vfx.drawBack (backdrop, aurora, shafts) -> moonstone platforms -> crumble ledges -> exit portal -> gates
  //        -> spikes -> crushers -> hero -> PL.Vfx.drawFront (gate/portal glints, rim light, lanterns, particles, bloom, vignette).
  // Every drawn art piece sits inside its physics rect (hit rects: Tweak SKIN_DEBUG=1 or PL.Skin.setDebug(true)).
  // Art missing => clean code shapes in the Starfall palette. Never throws (whole frame is wrapped).
  // =====================================================================================
  const UIC = (PL.UI && PL.UI.C) || {};
  const P = { coral: UIC.coral || '#ff7a6b', coralDeep: UIC.coralDeep || '#9c2f3a', cream: UIC.cream || '#f4efe0', teal: UIC.teal || '#5fe0c8',
              brass: UIC.brass || '#e8bd5a', ink: UIC.ink || '#1c2048', night: '#151a3d', stone: '#ddd0d6', stoneDk: '#8f84a6' };
  const SK = { lanterns: [], inited: false, W: 0, H: 0, dpr: 0, room: null, last: 0, ev: [], live: null, q: -1, red: null, bg: '', heroAng: 0, heroReady: false,
               landUntil: 0, ms: 0, frames: 0, debug: false, errs: 0, wrapped: false, nowT: 0 };
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
      if (!SK.inited) { V.init(W, H, dpr, { seed: hud.seed != null ? hud.seed : 1 }); SK.inited = true; SK.q = -1; SK.red = null; SK.bg = ''; SK.room = null; }
      else if (W !== SK.W || H !== SK.H || dpr !== SK.dpr) { V.resize(W, H, dpr); SK.bg = ''; }
      SK.W = W; SK.H = H; SK.dpr = dpr;
      // backdrop art: portrait/landscape by viewport, other as fallback; none => PL.Light procedural dome
      let nm = '';
      if (A && A.has) { const order = H >= W ? ['bgPortrait', 'bgLandscape'] : ['bgLandscape', 'bgPortrait']; nm = order.filter(function (n) { return A.has(n); })[0] || ''; }
      const key = nm + (nm && H >= W ? 'P' : 'L');
      if (key !== SK.bg) {
        SK.bg = key;
        try {
          const cv = nm ? topAnchored(A.get(nm), W, H, dpr) : null;   // art pinned to the top so the aurora dome stays in view on tall phones
          V.setBackdrop(cv ? cv.canvas : (nm ? A.get(nm) : null), null);
          if (cv && PL.Light && PL.Light._S) PL.Light._S.dome = cv.dome;
          if (PL.Light && PL.Light._S) PL.Light._S.bloomAmt = 0.55;   // bloom tuned down: moonstone + trail must keep their detail   // procedural aurora bars follow the art's dome
        } catch (e) { /* ignore */ }
      }
      const qn = hud.quality != null ? hud.quality : ['auto', 'full', 'lite', 'off'][clamp(tw('FX_QUALITY', 0) | 0, 0, 3)];
      if (qn !== SK.q) { SK.q = qn; V.setQuality(qn); }
      const red = !!hud.reduced;
      if (red !== SK.red) { SK.red = red; V.setReduced(red); }
      if (room && room !== SK.room) {
        SK.room = room; SK.heroReady = false;
        V.setRoom(room);
        SK.lanterns = pickLanterns(room);
        if (PL.Light && PL.Light.setLanterns) PL.Light.setLanterns(SK.lanterns);   // Light's auto pick sits on ledge tops (on top of the hero start)
        // the skin draws gates itself (chevrons show the pass direction); Vfx's own gate ribbons would fight them.
        try { if (V._V && V._V.room === room) V._V.room = Object.assign({}, room, { gates: [] }); } catch (e) { /* ignore */ }
      }
    }
    if (state !== SK.live) { SK.live = state; SK.ev.length = 0; SK.heroReady = false; }
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

  // ---------- world pieces ----------
  function R(v) { return Math.round(v); }
  function drawWalls(ctx, room, S) {
    const A = PL.Assets, ws = room.walls || [];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i], x0 = R(S.sx(w[0])), y0 = R(S.sy(w[1])), x1 = R(S.sx(w[0] + w[2])), y1 = R(S.sy(w[1] + w[3]));
      if (x1 < -8 || x0 > S.W + 8 || y1 < -8 || y0 > S.H + 8) continue;
      if (A && A.drawPlatform && A.drawPlatform(ctx, x0, y0, x1 - x0, y1 - y0)) {
        // moonstone toned toward lavender so the additive rim + bloom never blow it out to white
        ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#b8aed0'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.restore();
      } else fbPlatform(ctx, x0, y0, x1 - x0, y1 - y0);
    }
  }
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
  function drawLanterns(ctx, S, t) {
    const ls = SK.lanterns || [];
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], x = S.sx(l.x), y = S.sy(l.y), k = S.sc, fl = S.reduced ? 1 : 0.9 + 0.1 * Math.sin(t * 7 + l.ph);
      if (x < -20 || x > S.W + 20 || y < -20 || y > S.H + 20) continue;
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      ctx.strokeStyle = '#6b5524'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -6); ctx.stroke();
      ctx.fillStyle = '#c99a3a'; ctx.fillRect(-3.5, -6, 7, 2); ctx.fillRect(-3.5, 5, 7, 1.5);
      ctx.fillStyle = 'rgba(255,196,96,' + (0.85 * fl).toFixed(2) + ')'; ctx.fillRect(-2.6, -4, 5.2, 9);
      ctx.fillStyle = '#fff0c0'; ctx.fillRect(-1, -2, 2, 4);
      ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 0.8; ctx.strokeRect(-2.6, -4, 5.2, 9);
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
      if (!(A && A.drawLedge && A.drawLedge(ctx, x, y, w, h, alpha))) {
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
          ctx.strokeStyle = 'rgba(30,40,90,0.85)'; ctx.lineWidth = 1.6; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.7; ctx.stroke();
        }
        if (stage === 3 && !S.reduced) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(210,255,248,' + (0.25 * (0.5 + 0.5 * Math.sin(t * 40))).toFixed(3) + ')'; ctx.fillRect(x, y, w, h); }
      }
      ctx.restore();
    }
  }
  function drawGateFlow(ctx, room, S, t) {
    const gs = room.gates || [], quiet = S.reduced;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i], r = g.r, d = DIRV[g.dir | 0] || DIRV[2];
      const x = S.sx(r[0]), y = S.sy(r[1]), w = r[2] * S.sc, h = r[3] * S.sc;
      if (x + w < -20 || x > S.W + 20 || y + h < -20 || y > S.H + 20) continue;
      const horiz = r[2] >= r[3], along = horiz ? w : h, across = horiz ? h : w;
      // ribbon body (translucent, teal-white: a different hue from the gold hero)
      ctx.save();
      const gr = horiz ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, 'rgba(120,235,225,0.50)'); gr.addColorStop(0.5, 'rgba(225,255,250,0.85)'); gr.addColorStop(1, 'rgba(120,235,225,0.50)');
      ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(235,255,252,0.95)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // waves slide along the ribbon
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(160,255,240,0.55)'; ctx.lineWidth = 1.2;
      for (let l = 0; l < 2; l++) {
        ctx.beginPath();
        const n = Math.max(8, Math.round(along / 6));
        for (let s = 0; s <= n; s++) {
          const u = s / n, wv = Math.sin((u * 5 + (quiet ? 0 : t * 0.9) + l * 0.5) * TAU / 2) * across * 0.28;
          const px = horiz ? x + u * along : x + w / 2 + wv, py = horiz ? y + h / 2 + wv : y + u * along;
          if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      // chevrons point the way through (d) and flow along d across the gate line; they spill past the thin ribbon so they read
      const cnt = Math.max(2, Math.min(12, Math.round(along / 34))), size = clamp(across * 0.9 + 3, 6, 11) * (S.sc > 0.7 ? 1 : 0.85), cyc = (quiet ? 0.5 : (t * 0.7) % 1);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = 0; k < cnt; k++) {
        const u = (k + 0.5) / cnt, cx = horiz ? x + u * along : x + w / 2, cy = horiz ? y + h / 2 : y + u * along;
        for (let rep = 0; rep < 2; rep++) {
          const ph = (cyc + rep * 0.5) % 1, off = (ph - 0.5) * size * 2.6, al = Math.sin(Math.PI * ph);
          const px = cx + d[0] * off, py = cy + d[1] * off, a = size * 0.55;
          ctx.globalAlpha = 0.9 * al;
          ctx.beginPath();
          ctx.moveTo(px - d[1] * a - d[0] * a * 0.7, py + d[0] * a - d[1] * a * 0.7);
          ctx.lineTo(px + d[0] * a * 0.7, py + d[1] * a * 0.7);
          ctx.lineTo(px + d[1] * a - d[0] * a * 0.7, py - d[0] * a - d[1] * a * 0.7);
          ctx.strokeStyle = '#0f3a52'; ctx.lineWidth = 3.4; ctx.stroke();
          ctx.strokeStyle = '#eafffb'; ctx.lineWidth = 1.8; ctx.stroke();
        }
      }
      ctx.restore();
      // end orbs (pulse)
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const pu = 0.65 + (quiet ? 0.3 : 0.3 * Math.sin(t * 2.4 + i)), rr = Math.max(5, across * 1.1 + 3);
      for (let e = 0; e < 2; e++) {
        const ex = horiz ? (e ? x + w : x) : x + w / 2, ey = horiz ? y + h / 2 : (e ? y + h : y);
        const gg = ctx.createRadialGradient(ex, ey, 0, ex, ey, rr * 2.2); gg.addColorStop(0, 'rgba(220,255,250,' + (0.8 * pu).toFixed(2) + ')'); gg.addColorStop(1, 'rgba(95,224,200,0)');
        ctx.fillStyle = gg; ctx.fillRect(ex - rr * 2.2, ey - rr * 2.2, rr * 4.4, rr * 4.4);
      }
      ctx.restore();
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
  function drawSpikesAll(ctx, room, S, t) {
    const A = PL.Assets, sp = room.spikes || [];
    for (let i = 0; i < sp.length; i++) {
      const r = sp[i].r, dir = dirOfSpike(room, r), x = S.sx(r[0]), y = S.sy(r[1]), w = r[2] * S.sc, h = r[3] * S.sc;
      if (x + w < -30 || x > S.W + 30 || y + h < -30 || y > S.H + 30) continue;
      // coral halo spilling away from the wall: danger must be the loudest thing on screen
      const out = 24 * S.sc, pul = S.reduced ? 0.8 : 0.75 + 0.25 * Math.sin(t * 3 + i);
      const ax = dir === 1 ? x + w : dir === 3 ? x : x, ay = dir === 0 ? y : dir === 2 ? y + h : y;
      let gx0 = 0, gy0 = 0, gx1 = 0, gy1 = 0, bx = x, by = y, bw = w, bh = h;
      if (dir === 0) { gx0 = 0; gy0 = y + h; gx1 = 0; gy1 = y - out; by = y - out; bh = h + out; }
      else if (dir === 2) { gy0 = y; gy1 = y + h + out; bh = h + out; }
      else if (dir === 1) { gx0 = x; gx1 = x + w + out; bw = w + out; }
      else { gx0 = x + w; gx1 = x - out; bx = x - out; bw = w + out; }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      gg.addColorStop(0, 'rgba(255,100,90,' + (0.42 * pul).toFixed(3) + ')'); gg.addColorStop(1, 'rgba(255,100,90,0)');
      ctx.fillStyle = gg; ctx.fillRect(bx, by, bw, bh); ctx.restore();
      const ok = A && A.drawSpikes && A.drawSpikes(ctx, { x: x, y: y, w: w, h: h }, dir);
      if (!ok) fbSpikes(ctx, x, y, w, h, dir);
    }
  }
  function crusherFace(room, c) { // head faces away from the nearest border (the piston comes from that wall)
    const rw = room.w || 336, rh = room.h || 500, r = c.r;
    if (c.ay) return (r[1] + r[3] / 2) < rh / 2 ? 2 : 0;
    return (r[0] + r[2] / 2) < rw / 2 ? 1 : 3;
  }
  function drawCrushers(ctx, room, state, S, t) {
    const A = PL.Assets, cs = room.crushers || [];
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], r = PL.crusherRect ? PL.crusherRect(c, state.t, state.K) : c.r, amp = c.amp || 0;
      const x = S.sx(r[0]), y = S.sy(r[1]), w = r[2] * S.sc, h = r[3] * S.sc;
      // swept lane + telegraph: the lane warms toward coral as the block nears the end of its stroke
      const k = state.K || PL.C || {}, per = k.CRUSHER_PERIOD || 2.4;
      const sn = amp > 0 ? Math.abs(Math.sin(TAU * (state.t / 120) / per + (c.phase || 0))) : 0, hot = sn * sn * sn;
      const lx = S.sx(c.r[0] - (c.ax ? amp : 0)), ly = S.sy(c.r[1] - (c.ay ? amp : 0)), lw = (c.r[2] + (c.ax ? amp * 2 : 0)) * S.sc, lh = (c.r[3] + (c.ay ? amp * 2 : 0)) * S.sc;
      if (lx + lw < -10 || lx > S.W + 10 || ly + lh < -10 || ly > S.H + 10) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(255,107,94,' + (0.05 + 0.16 * hot).toFixed(3) + ')'; ctx.fillRect(lx, ly, lw, lh);
      ctx.strokeStyle = 'rgba(255,150,130,' + (0.4 + 0.5 * hot).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1); ctx.setLineDash([]);
      // glow around the block itself
      ctx.globalCompositeOperation = 'lighter';
      const pad = (8 + 10 * hot) * S.sc, gg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.9 + pad);
      gg.addColorStop(0, 'rgba(255,90,80,' + (0.18 + 0.3 * hot).toFixed(3) + ')'); gg.addColorStop(1, 'rgba(255,90,80,0)');
      ctx.fillStyle = gg; ctx.fillRect(x - w, y - h, w * 3, h * 3);
      ctx.restore();
      const ok = A && A.drawCrusher && A.drawCrusher(ctx, { x: x, y: y, w: w, h: h }, crusherFace(room, c));
      if (!ok) fbCrusher(ctx, x, y, w, h);
      if (hot > 0.55 && !S.reduced) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,120,100,' + (hot * 0.9).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2); ctx.restore(); }
    }
  }

  // ---------- hero ----------
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
    const hh = half * 2 * 1.18 * S.sc;                       // body fills the 2*HALF box; sticker border pokes slightly out
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
    const W = view.W || 360, H = view.H || 640, room = (state && state.room) || null;
    ctx.save();
    try {
      const V = PL.Vfx, sc = frame.scale || 1, cx = frame.cx || 0, cy = frame.cy || 0;
      let dt = SK.last ? (t0 - SK.last) / 1000 : 1 / 60; SK.last = t0;
      if (!(dt > 0) || dt > 0.25) dt = 1 / 60;
      envSetup(view, state, hud, room);
      const S = { W: W, H: H, sc: sc, reduced: !!hud.reduced, sx: function (x) { return (x - cx) * sc + W / 2; }, sy: function (y) { return (y - cy) * sc + H / 2; } };
      const t = V && V._V ? V._V.t : t0 / 1000;
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
      if (V && SK.inited && V.drawBack) V.drawBack(ctx, cam);
      else if (!(PL.Assets && PL.Assets.drawBackdrop && PL.Assets.drawBackdrop(ctx, W, H))) drawFallbackBack(ctx, W, H);
      if (room && state) {
        drawWalls(ctx, room, S);
        drawLanterns(ctx, S, t);
        drawCrumbles(ctx, room, state, S, t);
        drawPortalArt(ctx, room, state, S, t);
        drawGateFlow(ctx, room, S, t);
        drawSpikesAll(ctx, room, S, t);
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
