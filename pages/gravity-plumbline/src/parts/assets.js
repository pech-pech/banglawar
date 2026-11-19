// assets.js - PL.Assets: shipped beta art (assets/*.webp), loader, and canvas helpers.
// Plain script (inlined in an IIFE). Works from file:// and https (plain <img>, no fetch, no network beyond same-folder files).
// Never throws: a missing file => get() returns null, draw helpers return false (caller draws its code fallback).
const PL = (globalThis.PL = globalThis.PL || {});

(function () {
  const BASE = 'assets/';
  // name: [file, w, h, anchorX, anchorY]  (anchor = fraction of w/h that sits on the draw point)
  const M = [
    ['platCapL', 'platform-capL.webp', 47, 96, 0, 0],
    ['platMid', 'platform-mid.webp', 93, 96, 0, 0],
    ['platCapR', 'platform-capR.webp', 47, 96, 0, 0],
    ['platFull', 'platform-full.webp', 293, 96, 0, 0],
    ['ledge', 'ledge-crumble.webp', 160, 30, 0, 0],
    ['spikes', 'spikes-row4.webp', 70, 48, 0, 0],
    ['crusher', 'crusher-head.webp', 160, 233, 0.5, 0],
    ['gate', 'gate-aurora.webp', 95, 200, 0, 0],
    ['portal', 'portal-moon.webp', 103, 128, 0.5, 0.5],
    ['pipFull', 'pip-full.webp', 50, 48, 0.5, 0.5],
    ['pipEmpty', 'pip-empty.webp', 50, 48, 0.5, 0.5],
    ['bgPortrait', 'bg-portrait-720x1280.webp', 720, 1280, 0, 0],
    ['bgLandscape', 'bg-landscape-1280x720.webp', 1280, 720, 0, 0],
    ['keyart', 'keyart-720x1280.webp', 720, 1280, 0, 0],
    // hero bodies (flame removed; draw the teal trail with particles). anchor = body centre
    ['heroIdle', 'hero-idle.webp', 182, 192, 0.5, 0.5],
    ['heroLand', 'hero-land.webp', 192, 117, 0.5, 0.5],
    ['heroHurt', 'hero-hurt.webp', 182, 192, 0.5, 0.5],
    ['heroWin', 'hero-win.webp', 174, 192, 0.5, 0.5],
    // full-flame menu art
    ['heroIdleFlame', 'hero-idle-flame.webp', 256, 256, 0.5, 0.5],
    ['heroWinFlame', 'hero-win-flame.webp', 256, 256, 0.5, 0.5]
  ].map(function (r) { return { name: r[0], file: r[1], w: r[2], h: r[3], ax: r[4], ay: r[5] }; });

  const byName = {};
  M.forEach(function (m) { byName[m.name] = m; });
  const imgs = {};            // name -> loaded image
  const failed = {};          // name -> reason
  let attempted = false, loading = null;

  const S = {
    TILE_H: 36,               // on-screen height of a full platform course (96 art px) in game px
    TOP_SRC: 40,              // art rows used as the top course of a tall block (gold bar + first brick row)
    STONE: '#ddd0d6',         // flat moonstone fill under the top course (mean of platform-mid)
    LINE: 'rgba(118,100,128,0.30)',
    LIGHT: 'rgba(255,255,255,0.22)'
  };

  function mkImage() { return (typeof Image === 'function') ? new Image() : null; }
  const api = (PL.Assets = {
    manifest: M, byName: byName, settings: S, base: BASE,
    // load every file; resolves (never rejects) when all settled. opts: {base, timeout, only:[names], makeImage}
    load: function (opts) {
      opts = opts || {};
      const base = opts.base != null ? opts.base : BASE, to = opts.timeout || 6000;
      const make = opts.makeImage || mkImage;
      attempted = true;
      const list = opts.only ? M.filter(function (m) { return opts.only.indexOf(m.name) >= 0; }) : M;
      loading = Promise.all(list.map(function (m) {
        return new Promise(function (res) {
          let done = false, timer = null, im = null;
          function fin(ok, why) {
            if (done) return; done = true; if (timer) clearTimeout(timer);
            if (ok) { imgs[m.name] = im; delete failed[m.name]; } else { failed[m.name] = why; }
            res(ok);
          }
          try {
            im = make();
            if (!im) { fin(false, 'no Image'); return; }
            im.onload = function () { fin(true); };
            im.onerror = function () { fin(false, 'error'); };
            timer = setTimeout(function () { fin(false, 'timeout'); }, to);
            im.src = base + m.file;
          } catch (e) { fin(false, 'throw'); }
        });
      })).then(function () { return api.missing(); });
      return loading;
    },
    get: function (name) { return imgs[name] || null; },
    has: function (name) { return !!imgs[name]; },
    // names not available (before load(): everything). UI shows an "ART: fallback" chip when length > 0.
    missing: function () { return M.filter(function (m) { return !imgs[m.name]; }).map(function (m) { return m.name; }); },
    reasons: function () { return failed; },
    attempted: function () { return attempted; },
    _reset: function () { for (const k in imgs) delete imgs[k]; for (const k in failed) delete failed[k]; attempted = false; },
    _inject: function (name, img) { imgs[name] = img; }
  });

  // ---- maths (pure, tested) ----
  // plan for a platform of w x h: course height, cap width, how many mid tiles (last one cropped), vertical fill
  api.platformPlan = function (w, h) {
    w = Math.max(0, w); h = Math.max(0, h);
    const tall = h > S.TILE_H * 1.25;
    const courseH = tall ? S.TOP_SRC * S.TILE_H / 96 : h;          // dest height of the top course
    const srcH = tall ? S.TOP_SRC : 96;                             // art rows used
    const sc = courseH / srcH;                                      // uniform scale of the course
    const capW = Math.min(47 * sc, w / 2);
    const midW = Math.max(0, w - 2 * capW), tileW = 93 * sc;
    const full = tileW > 0 ? Math.floor(midW / tileW + 1e-9) : 0;
    const rem = midW - full * tileW;                                // cropped last tile width (dest px)
    return { tall: tall, courseH: courseH, srcH: srcH, sc: sc, capW: capW, tileW: tileW, midW: midW, full: full, rem: rem,
             fillY: courseH, fillH: tall ? h - courseH : 0 };
  };
  // rotation for 4 gravity sides: dir = where the shards point. up=0, right=PI/2, down=PI, left=-PI/2
  api.dirAngle = function (dir) {
    switch (dir) {
      case 'right': case 1: return Math.PI / 2;
      case 'down': case 2: return Math.PI;
      case 'left': case 3: return -Math.PI / 2;
      default: return 0;
    }
  };
  api.spikePlan = function (rect, dir) {
    const vert = (dir === 'left' || dir === 'right' || dir === 1 || dir === 3);
    const len = vert ? rect.h : rect.w, th = vert ? rect.w : rect.h;
    const unit = th * 70 / 48;
    const n = Math.max(1, Math.round(len / unit));
    return { vert: vert, len: len, th: th, n: n, cell: len / n };
  };

  function safe(fn) { try { return fn(); } catch (e) { return false; } }

  // ---- drawing helpers (all return true when art was drawn, false => caller uses its fallback) ----
  api.drawSprite = function (ctx, name, x, y, w, h) {
    const im = imgs[name]; if (!im) return false;
    return safe(function () { ctx.drawImage(im, x, y, w, h); return true; });
  };
  // draw at anchor point (cx, cy) with height h (width by aspect), optional flipX / angle(rad) / alpha
  api.drawAt = function (ctx, name, cx, cy, h, o) {
    const im = imgs[name], m = byName[name]; if (!im || !m) return false;
    o = o || {};
    return safe(function () {
      const k = h / m.h, w = m.w * k;
      ctx.save(); ctx.translate(cx, cy);
      if (o.angle) ctx.rotate(o.angle);
      if (o.flip) ctx.scale(-1, 1);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.drawImage(im, -w * m.ax, -h * m.ay, w, h);
      ctx.restore(); return true;
    });
  };
  // D3: soft dark drop shadow under the hero so it separates from moonstone. cx,cy = hero centre, h = sprite height.
  api.drawShadow = function (ctx, cx, cy, h, a) {
    return safe(function () {
      ctx.save(); ctx.globalAlpha = a == null ? 0.38 : a; ctx.fillStyle = '#080a1e';
      ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.42, h * 0.36, h * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return true;
    });
  };
  // body height for a hero pose: body-only sprites are sized by body (D2) -> pass the on-screen body height
  api.drawHero = function (ctx, pose, cx, cy, h, o) {
    const nm = { idle: 'heroIdle', land: 'heroLand', hurt: 'heroHurt', win: 'heroWin',
                 fall: 'heroIdle', dive: 'heroIdle' }[pose] || 'heroIdle';
    o = o || {};
    if (!imgs[nm]) return false;
    if (o.shadow) api.drawShadow(ctx, cx, cy, h, o.shadowAlpha);
    if ((pose === 'fall' || pose === 'dive') && !o.noStretch) {   // game stretches the idle body in code
      const sx = pose === 'dive' ? 0.62 : 0.8, sy = pose === 'dive' ? 1.35 : 1.18, m = byName[nm];
      return safe(function () {
        ctx.save(); ctx.translate(cx, cy); if (o.angle) ctx.rotate(o.angle); ctx.scale(sx, sy);
        const w = m.w * h / m.h; ctx.drawImage(imgs[nm], -w / 2, -h / 2, w, h); ctx.restore(); return true;
      });
    }
    return api.drawAt(ctx, nm, cx, cy, h, o);
  };

  // nine-slice-ish platform: capL | mid tiles | capR on the top course; tall blocks fill flat moonstone + brick lines.
  api.drawPlatform = function (ctx, x, y, w, h) {
    const L = imgs.platCapL, Mi = imgs.platMid, R = imgs.platCapR;
    if (!L || !Mi || !R || w <= 0 || h <= 0) return false;
    return safe(function () {
      const p = api.platformPlan(w, h);
      const ch = p.courseH, sh = p.srcH;
      if (p.tall) {                       // flat body first so the course overlaps it
        const fy = y + ch - 1, fh = p.fillH + 1;
        ctx.fillStyle = S.STONE; ctx.fillRect(x + 1, fy, w - 2, fh);
        const row = ch * 0.9;             // brick row height ~ one course row
        ctx.fillStyle = S.LINE;
        let r = 0;
        for (let yy = fy + row; yy < y + h - 1; yy += row, r++) {
          ctx.fillRect(x + 1, Math.round(yy), w - 2, 1);
          const off = (r % 2) * row * 1.1;
          for (let xx = x + 3 + off; xx < x + w - 2; xx += row * 2.2) ctx.fillRect(Math.round(xx), Math.round(yy - row), 1, Math.round(row));
        }
        ctx.fillStyle = S.LIGHT; ctx.fillRect(x + 1, fy, 1, fh); ctx.fillRect(x + w - 2, fy, 1, fh);
        ctx.fillStyle = 'rgba(40,30,60,0.28)'; ctx.fillRect(x + 1, y + h - 2, w - 2, 2);
      }
      ctx.drawImage(L, 0, 0, 47, sh, x, y, p.capW, ch);
      let cx = x + p.capW;
      for (let i = 0; i < p.full; i++) { ctx.drawImage(Mi, 0, 0, 93, sh, cx, y, p.tileW, ch); cx += p.tileW; }
      if (p.rem > 0.5) ctx.drawImage(Mi, 0, 0, 93 * p.rem / p.tileW, sh, cx, y, p.rem, ch);
      ctx.drawImage(R, 0, 0, 47, sh, x + w - p.capW, y, p.capW, ch);
      return true;
    });
  };

  // spikes: rect = the hazard box; dir = where the shards point ('up'|'right'|'down'|'left' or 0..3)
  api.drawSpikes = function (ctx, rect, dir) {
    const im = imgs.spikes; if (!im || !rect) return false;
    return safe(function () {
      const p = api.spikePlan(rect, dir);
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2); ctx.rotate(api.dirAngle(dir));
      const x0 = -p.len / 2, y0 = -p.th / 2;
      for (let i = 0; i < p.n; i++) ctx.drawImage(im, x0 + i * p.cell, y0, p.cell, p.th);
      ctx.restore(); return true;
    });
  };

  // crusher: head faces `dir` (default 'down'); piston stem stretches to fill the rect.
  api.drawCrusher = function (ctx, rect, dir) {
    const im = imgs.crusher; if (!im || !rect) return false;
    return safe(function () {
      const vert = (dir === 'left' || dir === 'right' || dir === 1 || dir === 3);
      // local frame: art points down; local width = across, local height = along the push
      const across = vert ? rect.h : rect.w, along = vert ? rect.w : rect.h;
      const ang = { up: Math.PI, right: -Math.PI / 2, left: Math.PI / 2, down: 0, 0: Math.PI, 1: -Math.PI / 2, 2: 0, 3: Math.PI / 2 }[dir == null ? 'down' : dir] || 0;
      ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2); ctx.rotate(ang);
      const HEAD = 62, headH = Math.min(along, across * (233 - HEAD) / 160), stemH = along - headH;
      const x0 = -across / 2, y0 = -along / 2;
      if (stemH > 0.5) ctx.drawImage(im, 0, 0, 160, 40, x0, y0, across, stemH + 1);
      ctx.drawImage(im, 0, HEAD, 160, 233 - HEAD, x0, y0 + stemH, across, headH);
      ctx.restore(); return true;
    });
  };

  // crumbling ledge: alpha fades it as it breaks. h optional (default keeps >= 18 px at 100 wide)
  api.drawLedge = function (ctx, x, y, w, h, alpha) {
    const im = imgs.ledge; if (!im) return false;
    return safe(function () {
      const hh = h || Math.max(18, w * 30 / 160);
      ctx.save(); if (alpha != null) ctx.globalAlpha = alpha; ctx.drawImage(im, x, y, w, hh); ctx.restore(); return true;
    });
  };

  // gate: open in [0,1] shrinks the curtain upward; rect is the full gate box
  api.drawGate = function (ctx, rect, open, t) {
    const im = imgs.gate; if (!im || !rect) return false;
    return safe(function () {
      const o = open || 0;
      ctx.save();
      if (o > 0) ctx.globalAlpha = 1 - 0.65 * o;
      ctx.drawImage(im, rect.x, rect.y, rect.w, rect.h);
      ctx.restore(); return true;
    });
  };

  // portal: code glow hook (D4). opts.glow(ctx, cx, cy, r, t) overrides the default additive teal-white halo.
  api.glow = function (ctx, cx, cy, r, t) {
    const pulse = 0.85 + 0.15 * Math.sin((t || 0) * 2.4);
    const g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r * pulse);
    g.addColorStop(0, 'rgba(210,255,248,0.55)'); g.addColorStop(0.5, 'rgba(90,220,210,0.22)'); g.addColorStop(1, 'rgba(60,200,200,0)');
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
    ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
    ctx.globalCompositeOperation = prev;
  };
  api.drawPortal = function (ctx, cx, cy, h, t, opts) {
    opts = opts || {};
    if (!imgs.portal) return false;
    return safe(function () {
      (opts.glow || api.glow)(ctx, cx, cy, h * 0.9, t);
      return api.drawAt(ctx, 'portal', cx, cy, h, { alpha: opts.alpha });
    });
  };

  // cover-fit backdrop: portrait art when h >= w, else landscape; falls back to the other one if only one loaded
  api.coverPlan = function (iw, ih, w, h) {
    const k = Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  };
  api.drawBackdrop = function (ctx, w, h) {
    const nm = (h >= w ? ['bgPortrait', 'bgLandscape'] : ['bgLandscape', 'bgPortrait']).filter(function (n) { return imgs[n]; })[0];
    if (!nm) return false;
    return safe(function () { const m = byName[nm], p = api.coverPlan(m.w, m.h, w, h); ctx.drawImage(imgs[nm], p.x, p.y, p.w, p.h); return true; });
  };
  api.drawPip = function (ctx, cx, cy, size, full) {
    const nm = full ? 'pipFull' : 'pipEmpty';
    return api.drawAt(ctx, nm, cx, cy, size);
  };
})();
