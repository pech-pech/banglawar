// light.js - PL.Light: lighting layers for the dusk observatory (S8). Canvas 2D only, no ctx.filter,
// never reads or writes game state. All sprites are baked once (init / resize), drawing allocates nothing
// per frame except 3 aurora gradients-free bars (sprites). Own seeded RNG (PL.vfxRand).
// API: init(w,h,dpr,opts) resize(w,h,dpr) update(dtReal,events,hero,g) drawBack(ctx,cam) drawFront(ctx,cam,hook)
//      setQuality('full'|'lite'|'off') setReduced(b) setRoom(room) setHazards(rects) setBackdrop(far,near) stats()
// cam = { scale, cx, cy } (the camera frame draw.js already receives). Room units are world px.
const PL = (globalThis.PL = globalThis.PL || {});

(function () {
  const TAU = Math.PI * 2;
  // art-bible palette (matches UI-UX-PLAN tokens; tokens.js is owned by another slice)
  const C = { dusk: '#232a5c', night: '#151a3d', plum: '#2e2350', cream: '#f4efe0', brass: '#e8bd5a', teal: '#5fe0c8', violet: '#8b6cff', blue: '#4fb8ff', amber: '#ffb45a' };
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  if (!PL.vfxRand) {
    PL.vfxRand = function (seed) {
      let a = (seed >>> 0) || 1;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
  }

  function mk(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let c;
    if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
    else c = { getContext: function () { return PL.vfxFakeCtx ? PL.vfxFakeCtx() : null; } };
    c.width = w; c.height = h;
    return c;
  }
  function fin(n, d) { return typeof n === 'number' && isFinite(n) ? n : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- baked sprites ----------
  function glowSprite(size, r, g, b, tight) {
    const c = mk(size, size), x = c.getContext('2d'), h = size / 2;
    const gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    gr.addColorStop(tight ? 0.12 : 0.2, 'rgba(' + r + ',' + g + ',' + b + ',0.55)');
    gr.addColorStop(tight ? 0.4 : 0.5, 'rgba(' + r + ',' + g + ',' + b + ',0.14)');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, size, size);
    return c;
  }
  // aurora curtain bar: 16 x 128, soft sides, rises to a bright lower fringe then fades
  function barSprite(r, g, b) {
    const c = mk(16, 128), x = c.getContext('2d');
    const v = x.createLinearGradient(0, 0, 0, 128);
    v.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    v.addColorStop(0.45, 'rgba(' + r + ',' + g + ',' + b + ',0.35)');
    v.addColorStop(0.72, 'rgba(' + r + ',' + g + ',' + b + ',0.95)');
    v.addColorStop(0.9, 'rgba(' + r + ',' + g + ',' + b + ',0.25)');
    v.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = v; x.fillRect(0, 0, 16, 128);
    // soft sides: multiply alpha by a horizontal ramp
    x.globalCompositeOperation = 'destination-in';
    const hz = x.createLinearGradient(0, 0, 16, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.5, 'rgba(0,0,0,1)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = hz; x.fillRect(0, 0, 16, 128);
    return c;
  }
  // light shaft: teal on the left shoulder, violet on the right (tinted so the haze never reads grey)
  function shaftSprite() {
    const c = mk(128, 512), x = c.getContext('2d');
    const hz = x.createLinearGradient(0, 0, 128, 0);
    hz.addColorStop(0, 'rgba(90,230,225,0)'); hz.addColorStop(0.3, 'rgba(90,235,225,0.7)');
    hz.addColorStop(0.5, 'rgba(185,215,255,1)'); hz.addColorStop(0.7, 'rgba(150,120,255,0.7)'); hz.addColorStop(1, 'rgba(130,100,255,0)');
    x.fillStyle = hz; x.fillRect(0, 0, 128, 512);
    x.globalCompositeOperation = 'destination-in';
    const vt = x.createLinearGradient(0, 0, 0, 512);
    vt.addColorStop(0, 'rgba(0,0,0,0.9)'); vt.addColorStop(0.35, 'rgba(0,0,0,0.5)'); vt.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = vt; x.fillRect(0, 0, 128, 512);
    return c;
  }
  // 1-D rim glow strip, bright edge at the bottom of the sprite (facing: 0 up,1 right,2 down,3 left = outward normal)
  function rimSprite(face) {
    const horiz = face === 0 || face === 2;
    const c = mk(horiz ? 4 : 12, horiz ? 12 : 4), x = c.getContext('2d');
    let gr;
    if (face === 0) gr = x.createLinearGradient(0, 0, 0, 12);
    else if (face === 2) gr = x.createLinearGradient(0, 12, 0, 0);
    else if (face === 1) gr = x.createLinearGradient(12, 0, 0, 0);
    else gr = x.createLinearGradient(0, 0, 12, 0);
    // for faces 0 and 3 gradient runs outward -> edge; stops ordered outer (transparent) to edge (bright)
    if (face === 1) { gr = x.createLinearGradient(0, 0, 12, 0); gr.addColorStop(0, 'rgba(255,196,90,1)'); gr.addColorStop(1, 'rgba(255,196,90,0)'); }
    else if (face === 3) { gr = x.createLinearGradient(0, 0, 12, 0); gr.addColorStop(0, 'rgba(255,196,90,0)'); gr.addColorStop(1, 'rgba(255,196,90,1)'); }
    else if (face === 0) { gr = x.createLinearGradient(0, 0, 0, 12); gr.addColorStop(0, 'rgba(255,196,90,0)'); gr.addColorStop(1, 'rgba(255,196,90,1)'); }
    else { gr = x.createLinearGradient(0, 0, 0, 12); gr.addColorStop(0, 'rgba(255,196,90,1)'); gr.addColorStop(1, 'rgba(255,196,90,0)'); }
    x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ---------- procedural dusk observatory ----------
  function arch(x, x0, y0, w, h) {
    x.beginPath();
    x.moveTo(x0, y0 + h); x.lineTo(x0, y0 + w / 2);
    x.arc(x0 + w / 2, y0 + w / 2, w / 2, Math.PI, 0);
    x.lineTo(x0 + w, y0 + h); x.closePath();
  }
  function bakeFar(w, h, s, rng, dome) {
    const mx = 0.06 * w, my = 0.03 * h, cw = w + mx * 2, ch = h + my * 2;
    const c = mk(cw * s, ch * s), x = c.getContext('2d');
    x.scale(s, s); x.translate(mx, my);
    // tower wall
    const wl = x.createLinearGradient(0, -my, 0, h + my);
    wl.addColorStop(0, '#101435'); wl.addColorStop(0.3, '#1d2354'); wl.addColorStop(0.62, '#262a5f'); wl.addColorStop(1, '#3a2d62');
    x.fillStyle = wl; x.fillRect(-mx, -my, cw, ch);
    // stone courses
    x.strokeStyle = 'rgba(160,170,255,0.05)'; x.lineWidth = 1; x.beginPath();
    for (let yy = 0, row = 0; yy < h; yy += 22, row++) {
      x.moveTo(-mx, yy + 0.5); x.lineTo(w + mx, yy + 0.5);
      for (let xx = (row % 2) * 24; xx < w; xx += 48) { x.moveTo(xx + 0.5, yy); x.lineTo(xx + 0.5, yy + 22); }
    }
    x.stroke();
    // tower ribs: curved pillars sweeping up into the dome
    const dcx = dome.cx * w, dcy = dome.cy * h, drx = dome.rx * w, dry = dome.ry * h;
    x.strokeStyle = 'rgba(232,189,90,0.16)'; x.lineWidth = 2;
    for (let i = -4; i <= 4; i++) {
      const bx = w / 2 + i * w * 0.15;
      x.beginPath(); x.moveTo(bx, h + 20);
      x.bezierCurveTo(bx, h * 0.55, dcx + i * drx * 0.25, dcy + dry * 1.4, dcx + i * drx * 0.2, dcy + dry * 0.9);
      x.stroke();
    }
    // dome: sky + stars + rim
    x.save(); x.beginPath(); x.ellipse(dcx, dcy, drx, dry, 0, 0, TAU); x.clip();
    const sky = x.createRadialGradient(dcx, dcy + dry * 0.3, 4, dcx, dcy, drx);
    sky.addColorStop(0, '#1a5a86'); sky.addColorStop(0.45, '#1d3c86'); sky.addColorStop(0.8, '#2d2a7a'); sky.addColorStop(1, '#1a1a52');
    x.fillStyle = sky; x.fillRect(dcx - drx, dcy - dry, drx * 2, dry * 2);
    for (let i = 0; i < 90; i++) {
      const sx = dcx + (rng() * 2 - 1) * drx, sy = dcy + (rng() * 2 - 1) * dry, sz = 0.4 + rng() * 1.1;
      x.fillStyle = 'rgba(244,239,224,' + (0.3 + rng() * 0.6).toFixed(2) + ')';
      x.fillRect(sx, sy, sz, sz);
    }
    x.restore();
    // dome frame: stone band + brass ring + ribs
    x.lineWidth = 12; x.strokeStyle = '#1b2050';
    x.beginPath(); x.ellipse(dcx, dcy, drx + 6, dry + 6, 0, 0, TAU); x.stroke();
    x.lineWidth = 3; x.strokeStyle = 'rgba(232,189,90,0.85)';
    x.beginPath(); x.ellipse(dcx, dcy, drx, dry, 0, 0, TAU); x.stroke();
    x.lineWidth = 1.5; x.strokeStyle = 'rgba(232,189,90,0.35)';
    x.beginPath(); x.ellipse(dcx, dcy, drx + 12, dry + 12, 0, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(232,189,90,0.45)'; x.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      x.beginPath(); x.moveTo(dcx + i * drx * 0.32, dcy - dry * Math.sqrt(Math.max(0, 1 - (i * 0.32) * (i * 0.32))));
      x.quadraticCurveTo(dcx + i * drx * 0.12, dcy, dcx + i * drx * 0.04, dcy + dry);
      x.stroke();
    }
    // arched windows with a sunset valley
    const wins = [[0.07, 0.3, 0.17, 0.26], [0.76, 0.3, 0.17, 0.26], [0.415, 0.4, 0.17, 0.3], [0.1, 0.72, 0.16, 0.24], [0.74, 0.74, 0.16, 0.22], [0.42, 0.78, 0.16, 0.2]];
    for (let i = 0; i < wins.length; i++) {
      const wx = wins[i][0] * w, wy = wins[i][1] * h, ww = wins[i][2] * w, wh = wins[i][3] * h;
      x.save(); arch(x, wx, wy, ww, wh); x.clip();
      const g = x.createLinearGradient(0, wy, 0, wy + wh);
      g.addColorStop(0, '#2a2e78'); g.addColorStop(0.45, '#5b3b86'); g.addColorStop(0.72, '#c0647a'); g.addColorStop(0.85, '#ff9b6b'); g.addColorStop(1, '#3a2850');
      x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
      for (let k = 0; k < 9; k++) { x.fillStyle = 'rgba(244,239,224,0.6)'; x.fillRect(wx + rng() * ww, wy + rng() * wh * 0.4, 1, 1); }
      x.fillStyle = '#2b2760'; x.beginPath(); x.moveTo(wx, wy + wh);
      const mo = wy + wh * 0.72;
      x.lineTo(wx, mo + 10); x.lineTo(wx + ww * 0.3, mo - wh * 0.06 - rng() * 8); x.lineTo(wx + ww * 0.55, mo + 6); x.lineTo(wx + ww * 0.8, mo - wh * 0.04 - rng() * 8); x.lineTo(wx + ww, mo + 8); x.lineTo(wx + ww, wy + wh); x.fill();
      x.fillStyle = '#1b1c47'; x.fillRect(wx, wy + wh * 0.9, ww, wh * 0.1);
      x.restore();
      x.lineWidth = 3; x.strokeStyle = '#141838'; arch(x, wx, wy, ww, wh); x.stroke();
      x.lineWidth = 1.5; x.strokeStyle = 'rgba(232,189,90,0.55)'; arch(x, wx - 3, wy - 3, ww + 6, wh + 3); x.stroke();
      x.strokeStyle = 'rgba(20,24,56,0.9)'; x.lineWidth = 2; x.beginPath();
      x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh);
      x.moveTo(wx, wy + wh * 0.4); x.lineTo(wx + ww, wy + wh * 0.4);
      x.moveTo(wx, wy + wh * 0.68); x.lineTo(wx + ww, wy + wh * 0.68); x.stroke();
    }
    // star-chart banners
    const bn = [[0.0, 0.34, 0.07], [0.93, 0.34, 0.07]];
    for (let i = 0; i < bn.length; i++) {
      const bx = bn[i][0] * w, by = bn[i][1] * h, bw = bn[i][2] * w, bh = h * 0.2;
      x.fillStyle = '#16205a'; x.fillRect(bx, by, bw, bh);
      x.strokeStyle = 'rgba(232,189,90,0.5)'; x.lineWidth = 1; x.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      x.fillStyle = 'rgba(232,189,90,0.7)';
      for (let k = 0; k < 7; k++) x.fillRect(bx + 4 + rng() * (bw - 8), by + 6 + rng() * (bh - 12), 1.5, 1.5);
    }
    return { canvas: c, mx: mx, my: my, s: s };
  }
  function bakeNear(w, h, s) {
    const mx = 0.1 * w, cw = w + mx * 2;
    const c = mk(cw * s, h * s), x = c.getContext('2d');
    x.scale(s, s); x.translate(mx, 0);
    // side columns / buttresses with gold edge light
    const cols = [[-mx, 0.06 * w + mx], [w - 0.06 * w, 0.06 * w + mx]];
    for (let i = 0; i < 2; i++) {
      const x0 = cols[i][0], cw2 = cols[i][1];
      const g = x.createLinearGradient(x0, 0, x0 + cw2, 0);
      if (i === 0) { g.addColorStop(0, 'rgba(10,12,34,0.96)'); g.addColorStop(1, 'rgba(24,28,70,0.9)'); }
      else { g.addColorStop(0, 'rgba(24,28,70,0.9)'); g.addColorStop(1, 'rgba(10,12,34,0.96)'); }
      x.fillStyle = g; x.fillRect(x0, 0, cw2, h);
      x.fillStyle = 'rgba(232,189,90,0.35)';
      x.fillRect(i === 0 ? x0 + cw2 - 2 : x0, 0, 2, h);
    }
    // hanging brass lamp arms
    x.strokeStyle = 'rgba(232,189,90,0.5)'; x.lineWidth = 2;
    for (let i = 0; i < 2; i++) { const bx = i === 0 ? 0.06 * w : w - 0.06 * w; x.beginPath(); x.moveTo(bx, h * 0.25); x.lineTo(bx + (i === 0 ? 14 : -14), h * 0.25); x.stroke(); }
    // bottom arcade
    x.fillStyle = 'rgba(12,14,40,0.55)';
    for (let k = 0; k < 4; k++) { const ax = w * (0.04 + k * 0.25); arch(x, ax, h * 0.9, w * 0.2, h * 0.2); x.fill(); }
    return { canvas: c, mx: mx, s: s };
  }

  function bakeImage(img, w, h, s, parMx) {
    // cover-fit the supplied art into an offscreen at DPR-capped size, with parallax margin
    const mx = parMx * w, my = 0.03 * h, cw = w + mx * 2, ch = h + my * 2;
    const c = mk(cw * s, ch * s), x = c.getContext('2d');
    const iw = img.naturalWidth || img.width || 1, ih = img.naturalHeight || img.height || 1;
    const k = Math.max(cw / iw, ch / ih), dw = iw * k, dh = ih * k;
    x.drawImage(img, (cw - dw) / 2 * s, (ch - dh) / 2 * s, dw * s, dh * s);
    return { canvas: c, mx: mx, my: my, s: s };
  }

  // ---------- state ----------
  const S = {
    W: 360, H: 640, dpr: 1, q: 'full', reduced: false, t: 0, seed: 1, rng: null, inited: false,
    hero: { x: 0, y: 0, vx: 0, vy: 0, g: 2, dead: false, has: false },
    drift: { x: 0, y: 1 }, driftTarget: { x: 0, y: 1 },
    room: null, hazards: [], swept: [], dyn: null, hazExtra: [], lb: null, lanterns: [], swing: 0,
    dome: { cx: 0.5, cy: 0.12, rx: 0.46, ry: 0.145 },
    far: null, near: null, imgFar: null, imgNear: null, backdropKind: 'procedural',
    sp: null, motes: null, sky: null, skyKey: '', skyDirty: true, cel: 0, celT: 0, boost: 0, desat: 0, noise: 0, noiseT: 0, noiseTarget: 0,
    bloom: null, vign: null, grade: null, cost: 0, auroraT: 0, camx: 0, camy: 0,
    strips: null, domePath: null, scrim: null, rimBaked: false, glowDone: false, frame: 0, bloomAmt: null, shaftAlpha: 0.14
  };
  const MOTES = 24;

  // static far light: the four shafts are baked into the backdrop once (teal/violet, about half the old alpha)
  const SHAFTS = [[0.3, -0.24, 0], [0.45, -0.08, 1.3], [0.58, 0.1, 2.4], [0.72, 0.27, 3.6]];
  function shaftGeom(i, W, H, t) {
    const sh = SHAFTS[i], sway = Math.sin(t / 9 * TAU + sh[2]) * 0.026;
    return { ox: sh[0] * W, oy: S.dome.cy * H + S.dome.ry * H * 0.55, a: sh[1] + sway, len: H * 0.95, wi: W * (0.2 + 0.03 * (i % 2)) };
  }
  function bakeShaftsInto(far, s) {
    if (!far || !far.canvas || !far.canvas.getContext) return;
    const x = far.canvas.getContext('2d'); if (!x) return;
    x.save(); x.setTransform(s, 0, 0, s, far.mx * s, (far.my || 0) * s);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < SHAFTS.length; i++) {
      const g = shaftGeom(i, S.W, S.H, 0);
      x.save(); x.translate(g.ox, g.oy); x.rotate(g.a); x.globalAlpha = S.shaftAlpha; x.drawImage(S.sp.shaft, -g.wi / 2, 0, g.wi, g.len); x.restore();
    }
    x.restore();
  }
  // aurora: 3 pre-rendered curtain strips (soft bars + fine streaks); per frame they only slide / breathe / shimmer
  const AUR = [
    { sp: 0.11, ph: 0.0, f1: 1.3, f2: 2.7, a1: 0.035, a2: 0.012, y: 0.0, len: 0.17, al: 0.85, col: 0, bars: 46 },
    { sp: 0.08, ph: 2.1, f1: 1.0, f2: 3.1, a1: 0.04, a2: 0.015, y: 0.035, len: 0.19, al: 0.7, col: 1, bars: 46 },
    { sp: 0.14, ph: 4.2, f1: 1.7, f2: 2.3, a1: 0.03, a2: 0.01, y: 0.07, len: 0.15, al: 0.6, col: 2, bars: 46 }
  ];
  function bakeStrips(W, H) {
    const q = 0.5, sw = Math.ceil(W * 1.5 * q), sh = Math.ceil(H * 0.3 * q), r = PL.vfxRand(S.seed + 91);
    S.strips = [];
    for (let k = 0; k < AUR.length; k++) {
      const A = AUR[k], c = mk(sw, sh), x = c.getContext('2d'), bar = S.sp.bars[A.col];
      x.scale(q, q); x.globalCompositeOperation = 'lighter';
      const SW = W * 1.5, nb = A.bars;
      for (let i = 0; i < nb; i++) {
        const u = i / (nb - 1), px = u * SW, bw = SW / (nb - 1) * 1.7;
        const y = (0.04 + Math.sin(u * A.f1 * TAU + A.ph) * A.a1 * 2 + Math.sin(u * A.f2 * TAU) * A.a2 * 2) * H;
        const len = A.len * H * (0.75 + 0.25 * Math.sin(u * 9 + A.ph));
        x.globalAlpha = clamp(A.al * (0.45 + 0.55 * Math.abs(Math.sin(i * 0.9 + A.ph * 3))), 0, 1);
        x.drawImage(bar, px - bw / 2, y, bw, len);
      }
      for (let i = 0; i < 38; i++) { // fine streaks
        const px = r() * SW, y = (0.03 + r() * 0.07) * H, len = (0.08 + r() * 0.2) * H;
        x.globalAlpha = 0.25 + r() * 0.35; x.drawImage(bar, px, y, 2 + r() * 3, len);
      }
      S.strips.push(c);
    }
    if (typeof Path2D === 'function') { try { const p = new Path2D(); p.ellipse(S.dome.cx * W, S.dome.cy * H, S.dome.rx * W, S.dome.ry * H, 0, 0, TAU); S.domePath = p; } catch (e) { S.domePath = null; } } else S.domePath = null;
  }
  function bakeScrim() {
    const c = mk(48, 72), x = c.getContext('2d');
    x.translate(24, 36); x.scale(1, 1.5);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 24);
    g.addColorStop(0, 'rgba(6,8,28,0.5)'); g.addColorStop(0.55, 'rgba(6,8,28,0.34)'); g.addColorStop(1, 'rgba(6,8,28,0)');
    x.fillStyle = g; x.fillRect(-24, -36, 48, 72);
    S.scrim = c;
  }

  function bakeAll() {
    const W = S.W, H = S.H, s = Math.min(S.dpr, 1.5);
    const r = PL.vfxRand(S.seed + 17);
    if (!S.sp) {
      S.sp = {
        warm: glowSprite(128, 255, 176, 80), gold: glowSprite(160, 255, 226, 150), goldTight: glowSprite(64, 255, 214, 110, true), teal: glowSprite(128, 95, 224, 200),
        mote: glowSprite(24, 220, 255, 245, true),
        bars: [barSprite(70, 255, 170), barSprite(170, 110, 255), barSprite(60, 230, 230)],
        shaft: shaftSprite(), rim: [rimSprite(0), rimSprite(1), rimSprite(2), rimSprite(3)]
      };
    }
    const sf = s; S.far = S.imgFar ? bakeImage(S.imgFar, W, H, sf, 0.06) : bakeFar(W, H, sf, r, S.dome);
    S.near = S.imgNear ? bakeImage(S.imgNear, W, H, s, 0.1) : (S.imgFar ? null : bakeNear(W, H, s));
    S.backdropKind = S.imgFar ? 'image' : 'procedural';
    bakeShaftsInto(S.far, sf);
    bakeStrips(W, H);
    bakeScrim();
    // vignette (half res, drawn stretched)
    const vw = Math.ceil(W / 2), vh = Math.ceil(H / 2);
    S.vign = mk(vw, vh);
    let x = S.vign.getContext('2d');
    x.translate(vw / 2, vh / 2); x.scale(1, vh / vw);
    let g = x.createRadialGradient(0, 0, vw * 0.38, 0, 0, vw * 0.95);
    g.addColorStop(0, 'rgba(10,12,34,0)'); g.addColorStop(0.65, 'rgba(10,12,34,0.2)'); g.addColorStop(1, 'rgba(10,12,34,0.5)');
    x.fillStyle = g; x.fillRect(-vw, -vw * (vh / vw) * 1.6, vw * 2, vw * 3.2);
    // dusk grade folded into the same overlay (one source-over full-screen draw instead of vignette + soft-light)
    const tint = x.createLinearGradient(0, -vh / 2, 0, vh / 2);
    tint.addColorStop(0, 'rgba(70,110,255,0.10)'); tint.addColorStop(0.55, 'rgba(150,110,200,0.02)'); tint.addColorStop(1, 'rgba(255,150,90,0.12)');
    x.fillStyle = tint; x.fillRect(-vw, -vh, vw * 2, vh * 2);
    S.skyDirty = true;
    // bloom buffers: 1/6 and 1/12 of the css-px canvas (independent of dpr), refreshed every 2nd frame
    S.bloom = { w4: Math.max(8, Math.ceil(W / 6)), h4: Math.max(8, Math.ceil(H / 6)) };
    S.bloom.c4 = mk(S.bloom.w4, S.bloom.h4); S.bloom.x4 = S.bloom.c4.getContext('2d');
    S.bloom.w8 = Math.max(4, Math.ceil(W / 12)); S.bloom.h8 = Math.max(4, Math.ceil(H / 12));
    S.bloom.c8 = mk(S.bloom.w8, S.bloom.h8); S.bloom.x8 = S.bloom.c8.getContext('2d');
  }

  function seedMotes() {
    const r = S.rng; S.motes = [];
    for (let i = 0; i < MOTES; i++) S.motes.push({ x: r(), y: r(), s: 0.5 + r(), ph: r() * TAU, sp: 0.6 + r() * 0.8 });
  }

  const L = (PL.Light = {});
  L.palette = C;

  L.init = function (w, h, dpr, opts) {
    opts = opts || {};
    S.W = Math.max(1, fin(w, 360)); S.H = Math.max(1, fin(h, 640));
    S.dpr = clamp(fin(dpr, 1), 1, 2);
    S.seed = (opts.seed == null ? 1 : opts.seed) >>> 0 || 1;
    S.rng = PL.vfxRand(S.seed);
    if (opts.dome) S.dome = opts.dome;
    S.t = 0; S.cel = 0; S.celT = 0; S.boost = 0; S.desat = 0;
    S.sp = null; S.inited = true;
    bakeAll(); seedMotes();
    if (typeof matchMedia === 'function') { try { S.reduced = !!matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ } }
  };
  L.resize = function (w, h, dpr) {
    if (!S.inited) return L.init(w, h, dpr);
    S.W = Math.max(1, fin(w, S.W)); S.H = Math.max(1, fin(h, S.H));
    S.dpr = clamp(fin(dpr, S.dpr), 1, 2);
    bakeAll();
  };
  L.setQuality = function (q) { if (q === 'full' || q === 'lite' || q === 'off') { S.q = q; S.skyDirty = true; } };
  L.setReduced = function (b) { S.reduced = !!b; S.skyDirty = true; };
  L.setBackdrop = function (far, near, opts) {
    S.imgFar = far || null; S.imgNear = near || null;
    if (opts && opts.dome) S.dome = opts.dome;   // dome ellipse in screen fractions, applied before the bake
    if (S.inited) bakeAll();
  };
  L.setLanterns = function (list) { S.lanterns = (list || []).slice(0, 6).map(function (l, i) { return { x: fin(l.x, 0), y: fin(l.y, 0), ph: fin(l.ph, i * 1.7) }; }); };
  // current crusher boxes (world rects, already padded by the caller or not: +6 added here). Replaces the swept
// fallback so the exclusion follows the moving block instead of its whole travel.
L.setDynamicHazards = function (rects) {
  if (!rects) { S.dyn = null; return; }
  S.dyn = rects.map(function (r) { return [r[0] - 6, r[1] - 6, r[2] + 12, r[3] + 12]; });
};
L.setHazards = function (rects) { S.hazExtra = Array.isArray(rects) ? rects : []; };
  // brightness pulse requests come through Vfx's flash limiter; Light only stores the value
  L.celebrate = function () { if (!S.reduced) S.celT = 1.4; };
  L.pulse = function (a) { if (!S.reduced) S.boost = Math.max(S.boost, clamp(fin(a, 0.1), 0, 0.25)); };
  L.desaturate = function (a) { if (!S.reduced) S.desat = Math.max(S.desat, clamp(fin(a, 0.4), 0, 0.6)); };

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
  L.spikeDir = spikeDir;

  L.setRoom = function (room) {
    S.room = room || null; S.hazards = []; S.swept = []; S.dyn = null;
    if (!room) { S.lanterns = []; return; }
    const hz = S.hazards, pad = 6;
    (room.spikes || []).forEach(function (s) { hz.push([s.r[0] - pad, s.r[1] - pad, s.r[2] + pad * 2, s.r[3] + pad * 2]); });
    (room.gates || []).forEach(function (g) { hz.push([g.r[0] - pad, g.r[1] - pad, g.r[2] + pad * 2, g.r[3] + pad * 2]); });
    S.swept = [];
    (room.crushers || []).forEach(function (c) {
      const a = c.amp || 0, r = c.r;
      S.swept.push([r[0] - (c.ax ? a : 0) - pad, r[1] - (c.ay ? a : 0) - pad, r[2] + (c.ax ? a * 2 : 0) + pad * 2, r[3] + (c.ay ? a * 2 : 0) + pad * 2]);
    });
    S.dyn = null;
    // auto lanterns: tops of the largest walls, deterministic
    if (room.lanterns && room.lanterns.length) L.setLanterns(room.lanterns);
    else {
      const ws = (room.walls || []).filter(function (w) { return w[2] >= 36 && w[3] >= 12; }).sort(function (a, b) { return b[2] * b[3] - a[2] * a[3]; }).slice(0, 4);
      L.setLanterns(ws.map(function (w, i) { return { x: w[0] + (i % 2 ? w[2] - 14 : 14), y: w[1] - 22, ph: i * 2.1 }; }));
    }
  };

  // world -> screen helpers read cam each call
  function frame(cam) {
    const sc = (cam && cam.scale) || 1;
    return { sc: sc, cx: fin(cam && cam.cx, 168), cy: fin(cam && cam.cy, 250), W: (cam && cam.W) || S.W, H: (cam && cam.H) || S.H };
  }

  L.update = function (dt, events, hero, g) {
    dt = fin(dt, 0);
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);
    S.t += dt;
    const rm = S.reduced;
    if (hero && fin(hero.x, NaN) === hero.x && fin(hero.y, NaN) === hero.y) {
      const h = S.hero;
      if (h.has) {
        let vx = (hero.x - h.x) / dt, vy = (hero.y - h.y) / dt;
        if (Math.hypot(hero.x - h.x, hero.y - h.y) > 160) { vx = 0; vy = 0; } // teleport / room change
        h.vx += (vx - h.vx) * Math.min(1, dt * 14); h.vy += (vy - h.vy) * Math.min(1, dt * 14);
      }
      h.x = hero.x; h.y = hero.y; h.has = true; h.dead = hero.dead > 0 || hero.dead === true;
    }
    const gi = g == null ? (hero && hero.g != null ? hero.g : 2) : g;
    const d = DIRS[gi | 0] || DIRS[2];
    if (S.hero.g !== (gi | 0)) { S.hero.g = gi | 0; S.swing = rm ? 0 : 1; }
    S.driftTarget.x = d[0]; S.driftTarget.y = d[1];
    const k = Math.min(1, dt / 0.4);
    S.drift.x += (S.driftTarget.x - S.drift.x) * k; S.drift.y += (S.driftTarget.y - S.drift.y) * k;
    S.swing *= Math.exp(-dt / 0.45);
    if (S.celT > 0) { S.celT -= dt; S.cel = Math.min(1, S.cel + dt / 0.6); } else S.cel = Math.max(0, S.cel - dt / 1.2);
    S.boost = Math.max(0, S.boost - dt / 0.25);
    S.desat = Math.max(0, S.desat - dt / 0.5);
    // smooth noise for lantern flicker
    S.noiseT -= dt;
    if (S.noiseT <= 0) { S.noiseT = 1 / 8; S.noiseTarget = S.rng() * 2 - 1; }
    S.noise += (S.noiseTarget - S.noise) * Math.min(1, dt * 18);
    if (S.q === 'full' && !rm) {
      const mv = S.motes;
      for (let i = 0; i < mv.length; i++) {
        const m = mv[i], sp = 0.012 * m.sp;
        m.x += (S.drift.x * sp + Math.sin(S.t * 0.7 + m.ph) * 0.004) * dt * 6;
        m.y += (S.drift.y * sp + Math.cos(S.t * 0.5 + m.ph) * 0.004) * dt * 6;
        if (m.x < -0.05) m.x += 1.1; else if (m.x > 1.05) m.x -= 1.1;
        if (m.y < -0.05) m.y += 1.1; else if (m.y > 1.05) m.y -= 1.1;
      }
    }
  };


  function hazardClip(ctx, W, H, f) {
    // clip = whole canvas minus hazard hitboxes (+6 px). evenodd. returns true if a clip was set.
    const hz = S.hazards, ex = S.hazExtra, dy = S.dyn || S.swept;
    if (!hz.length && !ex.length && !dy.length) return false;
    ctx.beginPath(); ctx.rect(-20, -20, W + 40, H + 40);
    for (let i = 0; i < hz.length; i++) rectPath(ctx, hz[i], f);
    for (let i = 0; i < dy.length; i++) rectPath(ctx, dy[i], f);
    for (let i = 0; i < ex.length; i++) rectPath(ctx, ex[i], f);
    ctx.clip('evenodd');
    return true;
  }
  function rectPath(ctx, r, f) {
    const x = (r[0] - f.cx) * f.sc + f.W / 2, y = (r[1] - f.cy) * f.sc + f.H / 2;
    // counter-wound so evenodd always punches a hole even where hazards overlap pairwise
    ctx.rect(x, y, r[2] * f.sc, r[3] * f.sc);
  }

  // ---------- drawBack: backdrop, parallax, aurora, shafts, motes ----------
  function drawBackdrop(ctx, f) {
    const W = f.W, H = f.H, rw = (S.room && S.room.w) || 336, rh = (S.room && S.room.h) || 500;
    const ox = S.reduced ? 0 : clamp((f.cx - rw / 2) * 1, -rw, rw), oy = S.reduced ? 0 : clamp((f.cy - rh / 2) * 1, -rh, rh);
    const far = S.far;
    if (far) {
      const px = clamp(ox * 0.05, -far.mx, far.mx), py = clamp(oy * 0.03, -far.my || 0, far.my || 0);
      ctx.drawImage(far.canvas, -far.mx - px, -(far.my || 0) - py, W + far.mx * 2, H + (far.my || 0) * 2);
    }
  }
  function drawNear(ctx, f) {
    const W = f.W, H = f.H, rw = (S.room && S.room.w) || 336;
    const nr = S.near;
    if (!nr) return;
    const ox = S.reduced ? 0 : clamp((f.cx - rw / 2), -rw, rw);
    const px = clamp(ox * 0.18, -nr.mx, nr.mx);
    ctx.drawImage(nr.canvas, -nr.mx - px, 0, W + nr.mx * 2, H);
  }

  function drawMotes(ctx, W, H, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < S.motes.length; i++) {
      const m = S.motes[i], px = m.x * W, py = m.y * H;
      let cover = 0;
      for (let s = 0; s < SHAFTS.length; s++) {
        const g = shaftGeom(s, W, H, t), dx = px - g.ox, dy = py - g.oy;
        const along = dx * -Math.sin(g.a) + dy * Math.cos(g.a);
        if (along < 0 || along > g.len) continue;
        const lat = dx * Math.cos(g.a) + dy * Math.sin(g.a), hw = g.wi * 0.3 + along * 0.1;
        cover = Math.max(cover, 1 - Math.abs(lat) / hw);
      }
      if (cover <= 0) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * 1.6 * m.sp + m.ph), sz = 5 + 5 * m.s;
      ctx.globalAlpha = clamp(cover * tw * 0.9, 0, 1);
      ctx.drawImage(S.sp.mote, px - sz / 2, py - sz / 2, sz, sz);
    }
    ctx.restore();
  }

  function auroraTime() { return S.reduced ? 2.3 : (S.q === 'full' ? S.t : 2.3 + Math.sin(S.t * 0.05)); }
  // three slow additive strips (pre-rendered): slide, breathe and shimmer. Clipped to the dome ellipse.
  function drawAuroraStrips(ctx, f) {
    if (!S.strips) return;
    const W = f.W, H = f.H, k = auroraTime(), gain = 1 + 0.2 * S.cel, dm = S.dome;
    ctx.save();
    if (S.domePath && f.W === S.W && f.H === S.H) ctx.clip(S.domePath);
    else { ctx.beginPath(); ctx.ellipse(dm.cx * W, dm.cy * H, dm.rx * W, dm.ry * H, 0, 0, TAU); ctx.clip(); }
    ctx.globalCompositeOperation = 'lighter';
    const top = (dm.cy - dm.ry * 0.92) * H, sw = W * 1.5, sh = H * 0.3;
    for (let r = 0; r < S.strips.length; r++) {
      const A = AUR[r], ox = -W * 0.25 + Math.sin(k * A.sp * TAU + A.ph) * W * 0.22;
      const br = 1 + 0.1 * Math.sin(k * (0.9 + r * 0.35) + A.ph), y = top + A.y * H * 2 + Math.sin(k * A.sp * 3 + A.ph) * H * 0.012;
      ctx.globalAlpha = clamp(0.62 * gain * (0.78 + 0.22 * Math.sin(k * 1.3 + A.ph * 2)), 0, 1);
      ctx.drawImage(S.strips[r], ox, y, sw, sh * br);
    }
    ctx.restore();
  }
  // two live shafts sway on top of the baked ones (full quality only)
  function drawLiveShafts(ctx, W, H, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i <= 2; i++) {
      const g = shaftGeom(i, W, H, t);
      ctx.save(); ctx.translate(g.ox, g.oy); ctx.rotate(g.a);
      ctx.globalAlpha = 0.045 + 0.02 * Math.sin(t * 0.5 + i * 1.7);
      ctx.drawImage(S.sp.shaft, -g.wi / 2, 0, g.wi, g.len);
      ctx.restore();
    }
    ctx.restore();
  }

  L.drawBack = function (ctx, cam) {
    if (!S.inited || !ctx) return;
    const t0 = now();
    const f = frame(cam), W = f.W, H = f.H;
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    drawBackdrop(ctx, f);
    drawNear(ctx, f);
    if (S.q !== 'off') {
      // play-area scrim: the room centre stays darker than the platforms and hazards that sit on it
      if (S.scrim && S.room) {
        const rw = S.room.w || 336, rh = S.room.h || 500, x0 = (0 - f.cx) * f.sc + W / 2, y0 = (0 - f.cy) * f.sc + H / 2;
        ctx.drawImage(S.scrim, x0 - rw * f.sc * 0.12, y0 - rh * f.sc * 0.1, rw * f.sc * 1.24, rh * f.sc * 1.2);
      }
      drawAuroraStrips(ctx, f);
      if (S.q === 'full' && !S.reduced) { drawLiveShafts(ctx, W, H, S.t); drawMotes(ctx, W, H, S.t); }
    }
    ctx.restore();
    S.cost += (now() - t0 - S.cost) * 0.1;
  };

  // ---------- drawFront: rim, lanterns, hero light, [particles hook], bloom, vignette, grade ----------
  function edgeBright(wall, face, h, d) {
    // face 0 up,1 right,2 down,3 left (outward normal). standing surface = faces away from gravity
    const n = DIRS[face], stand = n[0] === -d[0] && n[1] === -d[1];
    let b = stand ? 1 : 0.22;
    if (h.has && !S.reduced && S.q === 'full') {
      const nx = clamp(h.x, wall[0], wall[0] + wall[2]), ny = clamp(h.y, wall[1], wall[1] + wall[3]);
      b += clamp(1 - Math.hypot(h.x - nx, h.y - ny) / 120, 0, 1) * 0.3 * (stand ? 1 : 1.4);
    }
    return b;
  }
  function drawRim(ctx, f, k) {
    const room = S.room;
    if (!room || !room.walls) return;
    const ws = room.walls, d = DIRS[S.hero.g] || DIRS[2], h = S.hero, sc = f.sc;
    const th = Math.max(4, 7 * sc);
    for (let i = 0; i < ws.length && i < 40; i++) {
      const w = ws[i], x = (w[0] - f.cx) * sc + f.W / 2, y = (w[1] - f.cy) * sc + f.H / 2, ww = w[2] * sc, hh = w[3] * sc;
      if (x > f.W + 20 || x + ww < -20 || y > f.H + 20 || y + hh < -20) continue;
      for (let face = 0; face < 4; face++) {
        const b = edgeBright(w, face, h, d) * k;
        if (b < 0.05) continue;
        ctx.globalAlpha = clamp(0.32 * b, 0, 1);
        const spr = S.sp.rim[face];
        if (face === 0) ctx.drawImage(spr, x, y - th, ww, th);
        else if (face === 2) ctx.drawImage(spr, x, y + hh, ww, th);
        else if (face === 1) ctx.drawImage(spr, x + ww, y, th, hh);
        else ctx.drawImage(spr, x - th, y, th, hh);
        ctx.globalAlpha = clamp(0.7 * b, 0, 1);
        ctx.fillStyle = C.brass;
        if (face === 0) ctx.fillRect(x, y - 1, ww, 2);
        else if (face === 2) ctx.fillRect(x, y + hh - 1, ww, 2);
        else if (face === 1) ctx.fillRect(x + ww - 1, y, 2, hh);
        else ctx.fillRect(x - 1, y, 2, hh);
      }
    }
  }
  // glow sprites are drawn at world positions; lantern pools follow the eased gravity drift so they hang with the body
  function drawLanternPools(ctx, f, k) {
    const ls = S.lanterns, calm = S.q !== 'full' || S.reduced;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      const lx = (l.x + S.drift.x * 12 - f.cx) * f.sc + f.W / 2, ly = (l.y + S.drift.y * 12 - f.cy) * f.sc + f.H / 2;
      let fl = 1;
      if (!calm) fl = 1 - 0.12 * (0.5 + 0.5 * (0.5 * Math.sin(S.t * TAU * 5 + l.ph) + 0.3 * Math.sin(S.t * TAU * 7.3 + l.ph * 2) + 0.2 * S.noise));
      const sz = 170 * f.sc * (0.95 + 0.05 * fl);
      ctx.globalAlpha = clamp(0.7 * fl * k, 0, 1);
      ctx.drawImage(S.sp.warm, lx - sz / 2, ly - sz / 2, sz, sz);
    }
  }
  function drawHeroGlow(ctx, f, k) {
    const h = S.hero;
    if (!h.has || h.dead) return;
    const hx = (h.x - f.cx) * f.sc + f.W / 2, hy = (h.y - f.cy) * f.sc + f.H / 2;
    const pulse = S.reduced ? 1 : 0.94 + 0.06 * Math.sin(S.t * 3);
    let sz = 150 * f.sc;
    ctx.globalAlpha = clamp(0.22 * k * pulse, 0, 1);
    ctx.drawImage(S.sp.gold, hx - sz / 2, hy - sz / 2, sz, sz);
    sz = 64 * f.sc;   // the soft gold disc right behind the body
    ctx.globalAlpha = clamp(0.62 * k * pulse, 0, 1);
    ctx.drawImage(S.sp.goldTight, hx - sz / 2, hy - sz / 2, sz, sz);
  }

  // bloom: 1/6 res, rebuilt every 2nd frame from the glow sprites and the glowing particles, two shrink/grow round trips
  function bakeBloom(ctx, f, hook) {
    const B = S.bloom, x4 = B.x4, x8 = B.x8;
    if (!x4 || !x8) return;
    x4.setTransform(1, 0, 0, 1, 0, 0);
    x4.globalCompositeOperation = 'source-over'; x4.globalAlpha = 1;
    x4.clearRect(0, 0, B.w4, B.h4);
    x4.save();
    x4.scale(B.w4 / f.W, B.h4 / f.H);
    x4.globalCompositeOperation = 'lighter';
    drawLanternPools(x4, f, 1); drawHeroGlow(x4, f, 1);
    if (hook) hook(x4, f, true);
    x4.restore();
    x8.globalCompositeOperation = 'copy'; x8.imageSmoothingEnabled = true; x8.drawImage(B.c4, 0, 0, B.w8, B.h8);
    x4.globalCompositeOperation = 'copy'; x4.imageSmoothingEnabled = true; x4.drawImage(B.c8, 0, 0, B.w4, B.h4);
    x4.globalCompositeOperation = 'source-over'; x4.globalAlpha = 1;
  }

  // lantern pools, hero light disc and bloom. Draw BEFORE the hazards so additive light never washes a hazard out.
  L.drawGlow = function (ctx, cam) {
    if (!S.inited || !ctx || S.q === 'off') return;
    const t0 = now(), f = frame(cam);
    S.glowDone = true;
    ctx.save();
    if (!S.rimBaked) { ctx.save(); hazardClip(ctx, f.W, f.H, f); ctx.globalCompositeOperation = 'lighter'; drawRim(ctx, f, S.q === 'full' ? 1 : 0.75); ctx.restore(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    drawLanternPools(ctx, f, 1);
    drawHeroGlow(ctx, f, 1);
    if (S.q === 'full') {
      ctx.globalAlpha = clamp(0.3 + S.boost * 0.8, 0, 0.45) * (S.bloomAmt == null ? 1 : S.bloomAmt);
      ctx.drawImage(S.bloom.c4, 0, 0, f.W, f.H);
    }
    ctx.restore();
    S.cost += (now() - t0 - S.cost) * 0.1;
  };

  // particles (inside the hazard clip), bloom refresh, vignette, desaturate
  L.drawFront = function (ctx, cam, hook) {
    if (!S.inited || !ctx) return;
    const t0 = now();
    const f = frame(cam), W = f.W, H = f.H;
    if (S.q === 'off') { S.glowDone = false; return; }
    if (!S.glowDone) L.drawGlow(ctx, cam);
    S.glowDone = false;
    ctx.save();
    if (hook) {
      ctx.save();
      hazardClip(ctx, W, H, f);
      ctx.globalCompositeOperation = 'lighter';
      hook(ctx, f, false);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
    S.frame++;
    if (S.q === 'full' && (S.frame & 1) === 0) bakeBloom(ctx, f, hook);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(S.vign, 0, 0, W, H);
    if (S.desat > 0.01) {
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = clamp(S.desat, 0, 0.6);
      ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    S.cost += (now() - t0 - S.cost) * 0.1;
  };

  // ---- public options replacing the skin's old private pokes ----
  L.clipHazards = function (ctx, cam) { if (!S.inited || !ctx) return false; const f = frame(cam); return hazardClip(ctx, f.W, f.H, f); };
  L.setDome = function (d) { if (d && isFinite(d.cx) && isFinite(d.cy) && isFinite(d.rx) && isFinite(d.ry)) { S.dome = { cx: d.cx, cy: d.cy, rx: d.rx, ry: d.ry }; if (S.inited) bakeAll(); } };
  L.setBloom = function (a) { S.bloomAmt = clamp(fin(a, 1), 0, 1.5); };
  L.setRimBaked = function (b) { S.rimBaked = !!b; };   // true when the skin bakes the static rim light into its own plate
  L.setShaftAlpha = function (a) { S.shaftAlpha = clamp(fin(a, 0.14), 0, 0.5); if (S.inited) bakeAll(); };
  L.driftVec = function () { return { x: S.drift.x, y: S.drift.y }; };   // eased gravity direction (for hanging things)

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  L.stats = function () {
    return { quality: S.q, reduced: S.reduced, backdrop: S.backdropKind, t: S.t, costMs: S.cost, lanterns: S.lanterns.length, hazards: S.hazards.length + S.hazExtra.length + (S.dyn || S.swept).length, motes: S.motes ? S.motes.length : 0, bloom: S.q === 'full', dpr: S.dpr };
  };
  L._S = S; // test hook
})();
