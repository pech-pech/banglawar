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
    hz.addColorStop(0, 'rgba(70,235,190,0)'); hz.addColorStop(0.28, 'rgba(70,235,195,0.8)');
    hz.addColorStop(0.5, 'rgba(110,200,235,0.95)'); hz.addColorStop(0.72, 'rgba(150,100,255,0.85)'); hz.addColorStop(1, 'rgba(140,90,255,0)');
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

  // hero hotspot on a platform edge: 128 long, soft ends, bright at the edge (face as rimSprite)
  function hotSprite(face) {
    const horiz = face === 0 || face === 2, c = mk(horiz ? 128 : 16, horiz ? 16 : 128), x = c.getContext('2d');
    const e = [255, 200, 96];
    let gr;
    if (face === 0) gr = x.createLinearGradient(0, 0, 0, 16);
    else if (face === 2) gr = x.createLinearGradient(0, 16, 0, 0);
    else if (face === 1) gr = x.createLinearGradient(16, 0, 0, 0);
    else gr = x.createLinearGradient(0, 0, 16, 0);
    gr.addColorStop(0, 'rgba(' + e + ',0)'); gr.addColorStop(0.7, 'rgba(' + e + ',0.5)'); gr.addColorStop(1, 'rgba(255,236,170,1)');
    x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    const lg = horiz ? x.createLinearGradient(0, 0, 128, 0) : x.createLinearGradient(0, 0, 0, 128);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.5, 'rgba(0,0,0,1)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = lg; x.fillRect(0, 0, c.width, c.height);
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
    strips: null, domePath: null, scrim: null, ll: null, llx: null, hzMask: null, hzBoxes: [], hzVer: 0, litVer: 0, litLive: null, litTmp: null, litStill: null, maskKey: null, noHz: false, domeShade: null, domeTint: null, grade: null, par: { x: 0, y: 0, tx: 0, ty: 0 }, sg: null, aBoost: 0, aBoostT: 0, lAng: 2, lVel: 0, lReady: false, rimBaked: false, glowDone: false, frame: 0, bloomAmt: null, shaftAlpha: 0.14
  };
  const LANG = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];   // lantern hang angle per gravity (matches draw.js GANG)
  const AURA = 1.2;   // aurora strip strength
  const MOTES = 36, BLOOM = false;   // bloom blurred already-soft sprites for no visible gain: off (code kept behind the flag)

  // god rays: 4 live shafts drawn ABOVE the room scrim. Geometry is cached once per frame (no allocation); sway +-1.5 deg, own phase each.
  const SHAFTS = [[0.3, -0.24, 0, 9], [0.45, -0.08, 1.3, 11], [0.58, 0.1, 2.4, 8], [0.72, 0.27, 3.6, 10]];
  function shaftGeom(i, W, H, t) {
    const sh = SHAFTS[i], sway = Math.sin(t / sh[3] * TAU + sh[2]) * 0.026;
    if (!S.sg) { S.sg = []; for (let k = 0; k < SHAFTS.length; k++) S.sg.push({ ox: 0, oy: 0, a: 0, len: 0, wi: 0, al: 1, sn: 0, cs: 1 }); }
    const g = S.sg[i];
    g.ox = sh[0] * W; g.oy = S.dome.cy * H + S.dome.ry * H * 0.55; g.a = sh[1] + sway; g.len = H * 0.82; g.wi = W * (0.2 + 0.03 * (i % 2));
    g.sn = Math.sin(g.a); g.cs = Math.cos(g.a);
    g.al = 0.82 + 0.18 * Math.sin(t * 0.5 + i * 1.7);
    return g;
  }
  function updateShafts(W, H, t) { for (let i = 0; i < SHAFTS.length; i++) shaftGeom(i, W, H, t); }
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
      x.scale(q, q); x.globalCompositeOperation = 'source-over';   // overlapping bars keep their hue (additive overlap bleaches to white)
      const SW = W * 1.5, nb = A.bars;
      for (let i = 0; i < nb; i++) {
        const u = i / (nb - 1), px = u * SW, bw = SW / (nb - 1) * 1.7;
        const y = (0.04 + Math.sin(u * A.f1 * TAU + A.ph) * A.a1 * 2 + Math.sin(u * A.f2 * TAU) * A.a2 * 2) * H;
        const len = A.len * H * (0.75 + 0.25 * Math.sin(u * 9 + A.ph));
        x.globalAlpha = clamp(A.al * (0.45 + 0.55 * Math.abs(Math.sin(i * 0.9 + A.ph * 3))), 0, 1);
        x.drawImage(bar, px - bw / 2, y, bw, len);
      }
      for (let i = 0; i < 90; i++) { // fine streaks
        const px = r() * SW, y = (0.0 + r() * 0.06) * H, len = (0.1 + r() * 0.2) * H;
        x.globalAlpha = 0.45 + r() * 0.5; x.drawImage(bar, px, y, 2 + r() * 4, len);
      }
      S.strips.push(c);
    }
    // dome shade: a violet-navy wash baked once, drawn under the strips so the green / violet ribbons stand off the art's cyan
    const dw = Math.ceil(S.dome.rx * W * 2), dh = Math.ceil(S.dome.ry * H * 2);
    S.domeShade = mk(8, dh); { const x = S.domeShade.getContext('2d'), g = x.createLinearGradient(0, 0, 0, dh);
      g.addColorStop(0, 'rgba(40,24,110,0.42)'); g.addColorStop(0.6, 'rgba(24,40,120,0.26)'); g.addColorStop(1, 'rgba(20,30,90,0.12)'); x.fillStyle = g; x.fillRect(0, 0, 8, dh); }
    // dome tint: violet on the flanks, green in the middle left, teal left alone (the art's own colour); fades toward the rim
    { const tw = 64; S.domeTint = mk(tw, dh); const x = S.domeTint.getContext('2d'), g = x.createLinearGradient(0, 0, tw, 0);
      g.addColorStop(0, 'rgba(150,80,255,0.9)'); g.addColorStop(0.22, 'rgba(110,255,100,0.0)'); g.addColorStop(0.36, 'rgba(110,255,90,0.8)'); g.addColorStop(0.55, 'rgba(60,220,200,0)');
      g.addColorStop(0.75, 'rgba(160,90,255,0.9)'); g.addColorStop(1, 'rgba(130,70,255,0.45)');
      x.fillStyle = g; x.fillRect(0, 0, tw, dh); x.globalCompositeOperation = 'destination-in';
      const v = x.createLinearGradient(0, 0, 0, dh); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.55, 'rgba(0,0,0,0.75)'); v.addColorStop(1, 'rgba(0,0,0,0.25)');
      x.fillStyle = v; x.fillRect(0, 0, tw, dh); }
    if (typeof Path2D === 'function') { try { const p = new Path2D(); p.ellipse(S.dome.cx * W, S.dome.cy * H, S.dome.rx * W, S.dome.ry * H, 0, 0, TAU); S.domePath = p; } catch (e) { S.domePath = null; } } else S.domePath = null;
  }
  // play-area scrim: light vertical gradient (clear at the top, a little denser low) so the backdrop windows and rays read through the room
  function bakeScrim() {
    const c = mk(8, 96), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, 'rgba(8,10,34,0)'); g.addColorStop(0.3, 'rgba(8,10,34,0.07)'); g.addColorStop(1, 'rgba(8,10,34,0.24)');
    x.fillStyle = g; x.fillRect(0, 0, 8, 96);
    S.scrim = c;
  }

  function bakeAll() {
    const W = S.W, H = S.H, s = Math.min(S.dpr, 1.5);
    const r = PL.vfxRand(S.seed + 17);
    if (!S.sp) {
      S.sp = {
        warm: glowSprite(128, 255, 176, 80), gold: glowSprite(160, 255, 226, 150), goldTight: glowSprite(64, 255, 214, 110, true), teal: glowSprite(128, 95, 224, 200),
        mote: glowSprite(24, 220, 255, 245, true),
        bars: [barSprite(130, 255, 70), barSprite(165, 85, 255), barSprite(60, 230, 230)],
        shaft: shaftSprite(), rim: [rimSprite(0), rimSprite(1), rimSprite(2), rimSprite(3)], hot: [hotSprite(0), hotSprite(1), hotSprite(2), hotSprite(3)]
      };
    }
    const sf = s; S.far = S.imgFar ? bakeImage(S.imgFar, W, H, sf, 0.06) : bakeFar(W, H, sf, r, S.dome);
    S.near = S.imgNear ? bakeImage(S.imgNear, W, H, s, 0.1) : (S.imgFar ? null : bakeNear(W, H, s));
    S.backdropKind = S.imgFar ? 'image' : 'procedural';
    bakeStrips(W, H);
    bakeScrim();
    // vignette: navy edges only (half res, one source-over draw; multiply is slow on software canvases)
    const vw = Math.ceil(W / 2), vh = Math.ceil(H / 2);
    S.vign = mk(vw, vh);
    let x = S.vign.getContext('2d');
    x.translate(vw / 2, vh / 2); x.scale(1, vh / vw);
    let g = x.createRadialGradient(0, 0, vw * 0.42, 0, 0, vw * 1.0);
    g.addColorStop(0, 'rgba(10,12,40,0)'); g.addColorStop(0.6, 'rgba(10,12,40,0.08)'); g.addColorStop(1, 'rgba(10,12,40,0.28)');
    x.fillStyle = g; x.fillRect(-vw, -vw * (vh / vw) * 1.8, vw * 2, vw * 3.6);
    // dusk grade (additive, drawn under the world art): cool at the top, warm up-glow from the floor
    S.grade = mk(vw, vh); x = S.grade.getContext('2d');
    const tint = x.createLinearGradient(0, 0, 0, vh);
    tint.addColorStop(0, 'rgba(70,110,255,0.14)'); tint.addColorStop(0.5, 'rgba(110,90,210,0.0)'); tint.addColorStop(1, 'rgba(255,150,80,0.16)');
    x.fillStyle = tint; x.fillRect(0, 0, vw, vh);
    x.save(); x.translate(vw / 2, vh); x.scale(1, 0.9);
    const up = x.createRadialGradient(0, 0, 0, 0, 0, vw * 0.75);
    up.addColorStop(0, 'rgba(255,150,70,0.20)'); up.addColorStop(0.5, 'rgba(255,120,80,0.07)'); up.addColorStop(1, 'rgba(255,110,80,0)');
    x.fillStyle = up; x.fillRect(-vw, -vh * 1.4, vw * 2, vh * 2.8); x.restore();
    // half-res light layer (masked glows) and the hazard feather mask share one size
    S.ll = mk(Math.ceil(W / 2), Math.ceil(H / 2)); S.llx = S.ll.getContext('2d'); S.hzMask = null; S.maskKey = null; S.litVer++; S.litLive = null; S.litStill = null;
    S.skyDirty = true;
    // bloom buffers: 1/6 and 1/12 of the css-px canvas (independent of dpr), refreshed every 2nd frame
    if (!BLOOM) { S.bloom = null; return; }
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

  // ---------- hazard feather mask (baked once per room / camera, half res) ----------
  // Additive light (shafts, lantern, hero, rim, floor glow) fades to nothing toward each hazard through this soft mask:
  // 20 css px feather, no hard edge, no dark pad. Applied with destination-out on a half-res light layer.
  const FEATHER = 16;   // half-res px (= 32 css px)
  function bakeMask(f) {
    const W = f.W, H = f.H, mw = Math.ceil(W / 2), mh = Math.ceil(H / 2);
    if (!S.hzMask || S.hzMask.width !== mw || S.hzMask.height !== mh) S.hzMask = mk(mw, mh);
    const x = S.hzMask.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, mw, mh);
    S.hzBoxes.length = 0;
    S.maskKey = { ver: S.hzVer, cx: f.cx, cy: f.cy, sc: f.sc, W: W, H: H };
    if (S.noHz) return;
    x.globalCompositeOperation = 'lighter';
    const F = FEATHER, k = f.sc * 0.5;
    for (let n = 0; n < 3; n++) {
      const list = n === 0 ? S.hazards : n === 1 ? S.hazExtra : S.swept;
      for (let i = 0; i < list.length; i++) {
        const r = list[i], X = Math.round(((r[0] - f.cx) * f.sc + W / 2) * 0.5), Y = Math.round(((r[1] - f.cy) * f.sc + H / 2) * 0.5), w = Math.round(r[2] * k), h = Math.round(r[3] * k);   // integer rects: no AA seams between core and feather
        S.hzBoxes.push([(X - F) * 2, (Y - F) * 2, (X + w + F) * 2, (Y + h + F) * 2]);
        x.fillStyle = '#000'; x.fillRect(X, Y, w, h);
        const edge = function (x0, y0, x1, y1, rx, ry, rw, rh) {   // gradient runs from the hazard edge (opaque) outward (clear)
          const g = x.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.15, 'rgba(0,0,0,0.94)'); g.addColorStop(0.3, 'rgba(0,0,0,0.78)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(0.7, 'rgba(0,0,0,0.22)'); g.addColorStop(0.85, 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.fillRect(rx, ry, rw, rh);
        };
        edge(0, Y, 0, Y - F, X, Y - F, w, F); edge(0, Y + h, 0, Y + h + F, X, Y + h, w, F);
        edge(X, 0, X - F, 0, X - F, Y, F, h); edge(X + w, 0, X + w + F, 0, X + w, Y, F, h);
        const corner = function (cx, cy, rx, ry) {
          const g = x.createRadialGradient(cx, cy, 0, cx, cy, F);
          g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.15, 'rgba(0,0,0,0.94)'); g.addColorStop(0.3, 'rgba(0,0,0,0.78)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(0.7, 'rgba(0,0,0,0.22)'); g.addColorStop(0.85, 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.fillRect(rx, ry, F, F);
        };
        corner(X, Y, X - F, Y - F); corner(X + w, Y, X + w, Y - F); corner(X, Y + h, X - F, Y + h); corner(X + w, Y + h, X + w, Y + h);
      }
    }
    x.globalCompositeOperation = 'source-over';
  }
  function ensureMask(f) {
    const k = S.maskKey;
    if (k && k.ver === S.hzVer && k.W === f.W && k.H === f.H && Math.abs(k.cx - f.cx) < 0.6 && Math.abs(k.cy - f.cy) < 0.6 && Math.abs(k.sc - f.sc) < 0.003) return;
    if (k && k.ver === S.hzVer && S.frame - (k.at || 0) < 40 && k.W === f.W && k.H === f.H) return;   // camera still settling: keep the stale mask
    bakeMask(f); S.maskKey.at = S.frame;
  }
  function hzHit(x0, y0, x1, y1) {
    const b = S.hzBoxes;
    for (let i = 0; i < b.length; i++) if (x1 > b[i][0] && x0 < b[i][2] && y1 > b[i][1] && y0 < b[i][3]) return true;
    return false;
  }
  // soft distance falloff (world units) used for the hero rim hotspot
  function hzFade(x, y) {
    if (S.noHz) return 1;
    let m = 1;
    for (let n = 0; n < 3; n++) {
      const list = n === 0 ? S.hazards : n === 1 ? S.hazExtra : S.swept;
      for (let i = 0; i < list.length; i++) {
        const r = list[i], dx = Math.max(r[0] - x, 0, x - r[0] - r[2]), dy = Math.max(r[1] - y, 0, y - r[1] - r[3]);
        let t = Math.hypot(dx, dy) / 28; if (t >= 1) continue;
        t = t * t * (3 - 2 * t); if (t < m) m = t;
      }
    }
    return m;
  }
  // additive sprite drawn straight when clear of hazards, else through the half-res layer with the feather mask cut out
  function maskedGlow(ctx, spr, cx, cy, w, h, a) {
    const x0 = cx - w / 2, y0 = cy - h / 2;
    if (!S.hzBoxes.length || !hzHit(x0, y0, x0 + w, y0 + h)) { ctx.globalAlpha = a; ctx.drawImage(spr, x0, y0, w, h); return; }
    const LL = S.ll, hx = Math.max(0, Math.floor(x0 / 2)), hy = Math.max(0, Math.floor(y0 / 2)), hx1 = Math.min(LL.width, Math.ceil((x0 + w) / 2)), hy1 = Math.min(LL.height, Math.ceil((y0 + h) / 2));
    if (hx1 <= hx || hy1 <= hy) return;
    const lx = S.llx, rw = hx1 - hx, rh = hy1 - hy;
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.globalAlpha = 1; lx.clearRect(Math.max(0, hx - 1), Math.max(0, hy - 1), rw + 2, rh + 2);   // 1 px margin: the bilinear blit samples just outside its source rect
    lx.setTransform(0.5, 0, 0, 0.5, 0, 0); lx.globalAlpha = a; lx.drawImage(spr, x0, y0, w, h);
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalAlpha = 1; lx.globalCompositeOperation = 'destination-out'; lx.drawImage(S.hzMask, hx, hy, rw, rh, hx, hy, rw, rh);
    lx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1; ctx.drawImage(LL, hx, hy, rw, rh, hx * 2, hy * 2, rw * 2, rh * 2);
  }

  // ---------- lit backdrop cache: scrim + grade + dome shade + vignette (+ frozen aurora and still shafts for LITE / reduced) baked into one canvas ----------
  function ensureLit(f, still) {
    const far = S.far; if (!far || !far.canvas || !far.canvas.getContext) return null;
    const slot = still ? 'litStill' : 'litLive', cur = S[slot];
    if (cur && cur.ver === S.litVer) {
      if (cur.W === f.W && cur.H === f.H && Math.abs(cur.cx - f.cx) < 0.6 && Math.abs(cur.cy - f.cy) < 0.6 && Math.abs(cur.sc - f.sc) < 0.003) return cur.canvas;
      if (S.frame - cur.at < 40) return cur.canvas;   // camera still settling: keep the stale bake
    }
    ensureMask(f);
    const W = S.W, H = S.H, s = far.s, my = far.my || 0, dm = S.dome;
    // reuse the previous canvas of this slot when the size is unchanged (no allocation while the camera settles)
    const c = cur && cur.canvas.width === far.canvas.width && cur.canvas.height === far.canvas.height ? cur.canvas : mk(far.canvas.width, far.canvas.height), x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, c.width, c.height);
    x.drawImage(far.canvas, 0, 0);
    x.save(); x.setTransform(s, 0, 0, s, far.mx * s, my * s);
    x.save(); x.beginPath(); x.ellipse(dm.cx * W, dm.cy * H, dm.rx * W, dm.ry * H, 0, 0, TAU); x.clip();
    x.drawImage(S.domeShade, (dm.cx - dm.rx) * W, (dm.cy - dm.ry) * H, dm.rx * W * 2, dm.ry * H * 2);
    x.drawImage(S.domeTint, (dm.cx - dm.rx) * W, (dm.cy - dm.ry) * H, dm.rx * W * 2, dm.ry * H * 2);
    if (still) auroraPass(x, W, H, 2.3, 1, 0, 0, true);
    x.restore();
    if (S.scrim && S.room) {
      const rw = S.room.w || 336, rh = S.room.h || 500, x0 = (0 - f.cx) * f.sc + W / 2, y0 = (0 - f.cy) * f.sc + H / 2;
      x.drawImage(S.scrim, x0 - rw * f.sc * 0.03, y0 - rh * f.sc * 0.03, rw * f.sc * 1.06, rh * f.sc * 1.06);
    }
    // grade = low-frequency cool top / warm floor glow: NOT cut around hazards (a rect-shaped cut read as a dark box)
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = 0.45; x.drawImage(S.grade, -far.mx, -my, W + far.mx * 2, H + my * 2); x.globalAlpha = 1;   // grade strength 0.45: stronger lowered hazard contrast below -5% on the room-3 spikes
    if (still) {   // LITE / reduced: four still shafts through a temp layer with the feathered hazard mask cut out (shafts are faint and high-frequency)
      const t = S.litTmp && S.litTmp.width === c.width && S.litTmp.height === c.height ? S.litTmp : (S.litTmp = mk(c.width, c.height)), tx = t.getContext('2d');
      tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 1; tx.clearRect(0, 0, c.width, c.height);
      tx.setTransform(s, 0, 0, s, far.mx * s, my * s); tx.globalCompositeOperation = 'lighter';
      updateShafts(W, H, 0);
      for (let i = 0; i < 4; i++) { const g = S.sg[i]; tx.save(); tx.translate(g.ox, g.oy); tx.rotate(g.a); tx.globalAlpha = S.shaftAlpha * 0.63 * 4; tx.drawImage(S.sp.shaft, -g.wi / 2, 0, g.wi, g.len); tx.restore(); }
      tx.globalAlpha = 1; tx.globalCompositeOperation = 'destination-out'; tx.drawImage(S.hzMask, 0, 0, W, H);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.25; x.drawImage(t, 0, 0); x.restore();
    }
    x.globalCompositeOperation = 'source-over';
    x.drawImage(S.vign, -far.mx, -my, W + far.mx * 2, H + my * 2);
    x.restore();
    S[slot] = { canvas: c, ver: S.litVer, W: f.W, H: f.H, cx: f.cx, cy: f.cy, sc: f.sc, at: S.frame };
    return c;
  }

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
L.setHazards = function (rects) { S.hazExtra = Array.isArray(rects) ? rects : []; S.hzVer++; };
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
    S.room = room || null; S.hazards = []; S.swept = []; S.dyn = null; S.hzVer++; S.litVer++;
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
    // lantern pendulum: same spring as the skin's lantern bodies (draw.js drawLanterns) so the pool sits on the swinging flame
    const tgt = LANG[S.hero.g] != null ? LANG[S.hero.g] : 0;
    if (!S.lReady || rm) { S.lAng = tgt; S.lVel = 0; S.lReady = true; }
    else {
      let da = tgt - S.lAng; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      const hh = Math.min(dt, 0.033); S.lVel += (da * 70 - S.lVel * 5.5) * hh; S.lAng += S.lVel * hh;
    }
    // slow parallax from the hero position (eased, a few px; off in reduced motion)
    if (rm) { S.par.tx = 0; S.par.ty = 0; }
    else if (S.hero.has) {
      const rw = (S.room && S.room.w) || 336, rh = (S.room && S.room.h) || 500;
      S.par.tx = clamp((S.hero.x - rw / 2) / (rw / 2), -1, 1); S.par.ty = clamp((S.hero.y - rh / 2) / (rh / 2), -1, 1);
    }
    const pk = 1 - Math.exp(-dt * 2.2);
    S.par.x += (S.par.tx - S.par.x) * pk; S.par.y += (S.par.ty - S.par.y) * pk;
    // aurora brightens briefly on a dive (events: 'dive' string or {type|k:'dive'})
    if (events && events.length && !rm) {
      for (let i = 0; i < events.length; i++) { const e = events[i]; if (e === 'dive' || (e && (e.type === 'dive' || e.k === 'dive'))) S.aBoostT = 1.0; }
    }
    S.aBoostT = Math.max(0, S.aBoostT - dt);
    S.aBoost += ((S.aBoostT > 0 ? 1 : 0) - S.aBoost) * Math.min(1, dt / (S.aBoostT > 0 ? 0.25 : 0.7));
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
    const W = f.W, H = f.H, far = S.far;
    if (far) {
      const px = S.reduced ? 0 : S.par.x * far.mx * 0.4, py = S.reduced ? 0 : S.par.y * (far.my || 0) * 0.6;
      S.px = px; S.py = py;
      let src = far.canvas;
      if (S.q !== 'off') { const lit = ensureLit(f, S.q !== 'full' || S.reduced); if (lit) src = lit; }
      ctx.drawImage(src, -far.mx - px, -(far.my || 0) - py, W + far.mx * 2, H + (far.my || 0) * 2);
    }
  }
  function drawNear(ctx, f) {
    const W = f.W, H = f.H;
    const nr = S.near;
    if (!nr) return;
    const px = S.reduced ? 0 : clamp(S.par.x * nr.mx * 0.5, -nr.mx, nr.mx);
    ctx.drawImage(nr.canvas, -nr.mx - px, 0, W + nr.mx * 2, H);
  }

  // dust motes drift inside the live shafts (pooled, cached shaft geometry: no allocation)
  function drawMotes(ctx, W, H, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const sg = S.sg, ms = S.motes, spr = S.sp.mote;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i], px = m.x * W, py = m.y * H;
      let cover = 0;
      for (let s = 0; s < sg.length; s++) {
        const g = sg[s], dx = px - g.ox, dy = py - g.oy;
        const along = dx * -g.sn + dy * g.cs;
        if (along < 0 || along > g.len) continue;
        const lat = dx * g.cs + dy * g.sn, hw = g.wi * 0.3 + along * 0.1, c = 1 - Math.abs(lat) / hw;
        if (c > cover) cover = c;
      }
      if (cover <= 0) continue;
      if (S.hzBoxes.length && hzHit(px - 4, py - 4, px + 4, py + 4)) continue;   // motes also stay out of the hazard feather
      const tw = 0.6 + 0.4 * Math.sin(t * 1.6 * m.sp + m.ph), sz = 5 + 5 * m.s;
      ctx.globalAlpha = clamp(cover * tw * 0.95, 0, 1);
      ctx.drawImage(spr, px - sz / 2, py - sz / 2, sz, sz);
    }
    ctx.restore();
  }

  function auroraTime() { return S.reduced ? 2.3 + S.t * 0.25 : S.t; }
  // three slow additive strips (pre-rendered): slide, breathe and shimmer, each with its own slow colour-weight drift
  // (periods ~60-110 s) so the green / teal / violet balance wanders and never visibly loops. Clipped to the dome ellipse.
  function auroraPass(ctx, W, H, k, gain, px, py, still) {
    const dm = S.dome;
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath(); ctx.ellipse(dm.cx * W, dm.cy * H, dm.rx * W, dm.ry * H, 0, 0, TAU); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const top = (dm.cy - dm.ry * 0.92) * H - H * 0.045, sw = W * 1.5, sh = H * 0.3;
    for (let r = 0; r < S.strips.length; r++) {
      const A = AUR[r], ox = -W * 0.25 + Math.sin(k * A.sp * TAU + A.ph) * W * 0.22;
      const br = 1 + 0.1 * Math.sin(k * (0.9 + r * 0.35) + A.ph), y = top + A.y * H * 2 + Math.sin(k * A.sp * 3 + A.ph) * H * 0.012;
      const hue = still ? 0.9 : 0.72 + 0.28 * Math.sin(k * (0.058 + r * 0.021) + A.ph * 2.7);
      ctx.globalCompositeOperation = r === 2 ? 'lighter' : 'source-over';   // green and violet are painted (not added) so they shift the art's cyan instead of washing to white
      ctx.globalAlpha = clamp(AURA * (r === 2 ? 0.3 : 1) * gain * hue * (0.8 + 0.2 * Math.sin(k * 1.3 + A.ph * 2)), 0, 1);
      ctx.drawImage(S.strips[r], ox, y, sw, sh * br);
    }
    ctx.restore();
  }
  function drawAuroraStrips(ctx, f) {
    if (!S.strips) return;
    auroraPass(ctx, f.W, f.H, auroraTime(), 1 + 0.2 * S.cel + 0.12 * S.aBoost, S.px || 0, S.py || 0, false);
  }
  // four live shafts (full quality): half-res layer with the hazard feather cut out, one upscaled additive blit
  function drawLiveShafts(ctx, W, H, t) {
    updateShafts(W, H, t);
    const base = S.shaftAlpha * 0.7, px = (S.px || 0) * 0.7, py = (S.py || 0) * 0.7;
    if (!S.hzBoxes.length) {
      ctx.save(); ctx.translate(px, py);
      for (let i = 0; i < 4; i++) { const g = S.sg[i]; ctx.save(); ctx.translate(g.ox, g.oy); ctx.rotate(g.a); ctx.globalAlpha = base * g.al; ctx.drawImage(S.sp.shaft, -g.wi / 2, 0, g.wi, g.len); ctx.restore(); }
      ctx.restore(); return;
    }
    const lx = S.llx, LL = S.ll;
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.globalAlpha = 1; lx.clearRect(0, 0, LL.width, LL.height);
    lx.setTransform(0.5, 0, 0, 0.5, px * 0.5, py * 0.5); lx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { const g = S.sg[i]; lx.save(); lx.translate(g.ox, g.oy); lx.rotate(g.a); lx.globalAlpha = base * g.al * 4; lx.drawImage(S.sp.shaft, -g.wi / 2, 0, g.wi, g.len); lx.restore(); }
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalAlpha = 1; lx.globalCompositeOperation = 'destination-out'; lx.drawImage(S.hzMask, 0, 0);
    lx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.25; ctx.drawImage(LL, 0, 0, W, H);   // layer holds 4x alpha (finer 8-bit steps for the faint shafts)
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalAlpha = 1; lx.clearRect(0, 0, LL.width, LL.height);   // leave the layer empty: stale shaft light bled into the glow blits as hairlines at region edges
  }

  L.drawBack = function (ctx, cam) {
    if (!S.inited || !ctx) return;
    const t0 = now();
    const f = frame(cam), W = f.W, H = f.H;
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ensureMask(f);
    drawBackdrop(ctx, f);
    drawNear(ctx, f);
    if (S.q === 'full' && !S.reduced) {
      drawAuroraStrips(ctx, f);
      ctx.globalCompositeOperation = 'lighter';
      drawLiveShafts(ctx, W, H, S.t);
      drawMotes(ctx, W, H, S.t);
      ctx.globalCompositeOperation = 'source-over';
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
  // lantern pools sit on the swinging flame: art is 64x128 hung from the chain, flame at 55% height, drawn at 1.15 x 20 px wide
  // => 25.3 world units along the pendulum (same spring as draw.js drawLanterns, so reduced motion and all 4 gravities agree)
  const FLAME = 25.3;
  function drawLanternPools(ctx, f, k) {
    const ls = S.lanterns, calm = S.q !== 'full' || S.reduced, sa = Math.sin(S.lAng), ca = Math.cos(S.lAng);
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      const lx = (l.x - FLAME * sa - f.cx) * f.sc + f.W / 2, ly = (l.y + FLAME * ca - f.cy) * f.sc + f.H / 2;
      let fl = 1;
      if (!calm) { const t = S.t; fl = 1 - 0.12 * (0.5 - 0.5 * (0.5 * Math.sin(t * 7 + l.ph) + 0.3 * Math.sin(t * 11.3 + l.ph * 2) + 0.2 * S.noise)); }
      const sz = 190 * f.sc * (0.96 + 0.04 * fl);
      if (!calm) maskedGlow(ctx, S.sp.warm, lx, ly, sz * 1.6, sz * 1.7, clamp(0.2 * fl * k, 0, 1));   // wall wash: wider, faint (full only)
      maskedGlow(ctx, S.sp.warm, lx, ly, sz, sz, clamp(0.9 * fl * k, 0, 1));
    }
  }
  // hero light rolls along the platform edge standing against gravity: gold hotspot, brightest right under the hero, fades by ~120 px
  function drawHeroRim(ctx, f) {
    const room = S.room, h = S.hero;
    if (!room || !room.walls || !h.has || h.dead) return;
    const ws = room.walls, face = ((S.hero.g | 0) + 2) & 3, sc = f.sc, th = 12 * sc, len = 120 * sc, spr = S.sp.hot[face], n = DIRS[face];
    for (let i = 0; i < ws.length && i < 40; i++) {
      const w = ws[i], nx = clamp(h.x, w[0], w[0] + w[2]), ny = clamp(h.y, w[1], w[1] + w[3]);
      const d = Math.hypot(h.x - nx, h.y - ny);
      if (d > 120) continue;
      if (d > 0 && ((h.x - nx) * n[0] + (h.y - ny) * n[1]) < 0.3 * d) continue;   // hero must be on the outward side of this face
      const a = (1 - d / 120) * hzFade(nx, ny);
      if (a < 0.02) continue;
      const x = (w[0] - f.cx) * sc + f.W / 2, y = (w[1] - f.cy) * sc + f.H / 2, ww = w[2] * sc, hh = w[3] * sc;
      const px = (nx - f.cx) * sc + f.W / 2, py = (ny - f.cy) * sc + f.H / 2;
      ctx.globalAlpha = clamp(0.95 * a * a * 0.5 + 0.5 * a, 0, 1);
      if (face === 0) ctx.drawImage(spr, clamp(px - len / 2, x - len / 2, x + ww - len / 2), y - th, len, th);
      else if (face === 2) ctx.drawImage(spr, clamp(px - len / 2, x - len / 2, x + ww - len / 2), y + hh, len, th);
      else if (face === 1) ctx.drawImage(spr, x + ww, clamp(py - len / 2, y - len / 2, y + hh - len / 2), th, len);
      else ctx.drawImage(spr, x - th, clamp(py - len / 2, y - len / 2, y + hh - len / 2), th, len);
    }
  }
  function drawHeroGlow(ctx, f, k) {
    const h = S.hero;
    if (!h.has || h.dead) return;
    const hx = (h.x - f.cx) * f.sc + f.W / 2, hy = (h.y - f.cy) * f.sc + f.H / 2;
    const pulse = S.reduced ? 1 : 0.94 + 0.06 * Math.sin(S.t * 3);
    let sz = 170 * f.sc;
    maskedGlow(ctx, S.sp.gold, hx, hy, sz, sz, clamp(0.3 * k * pulse, 0, 1));
    sz = 64 * f.sc;   // the soft gold disc right behind the body
    maskedGlow(ctx, S.sp.goldTight, hx, hy, sz, sz, clamp(0.62 * k * pulse, 0, 1));
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
    ensureMask(f);
    ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    if (!S.rimBaked) drawRim(ctx, f, S.q === 'full' ? 1 : 0.75);
    drawLanternPools(ctx, f, 1);
    drawHeroGlow(ctx, f, 1);
    if (S.rimBaked && S.q === 'full' && !S.reduced) drawHeroRim(ctx, f);
    if (BLOOM && S.q === 'full' && S.bloom) {
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
    if (BLOOM && S.bloom && S.q === 'full' && (S.frame & 1) === 0) bakeBloom(ctx, f, hook);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
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
    return { quality: S.q, reduced: S.reduced, backdrop: S.backdropKind, t: S.t, costMs: S.cost, lanterns: S.lanterns.length, hazards: S.hazards.length + S.hazExtra.length + (S.dyn || S.swept).length, motes: S.motes ? S.motes.length : 0, bloom: BLOOM && S.q === 'full', dpr: S.dpr };
  };
  L._S = S; // test hook
})();
