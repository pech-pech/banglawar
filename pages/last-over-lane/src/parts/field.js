// Last Over Lane v2 - field painter (Canvas 2D). draw(ctx, G) is pure from G + G.now.
// Only cache: the previous field name/time (for the 500 ms field-change fade); safe to drop.
(function () {
  window.LOLParts = window.LOLParts || {};
  var FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  var INK = '#1a1400', RED = '#ff6b5b', BALL = '#d9342b', GOLD = '#ffd23f', GRN = '#7be37b';
  var LABEL = { leg: 'LEG', straight: 'STRAIGHT', off: 'OFF', loft: 'LOFT' };
  var SECT = ['leg', 'straight', 'off', 'loft'];
  var cache = { name: null, prev: null, t: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function c01(v) { return clamp(v, 0, 1); }
  function eOutCubic(k) { k = c01(k); return 1 - Math.pow(1 - k, 3); }
  function eOutQuad(k) { k = c01(k); return 1 - (1 - k) * (1 - k); }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - r); ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2); ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); ctx.closePath();
  }
  function font(ctx, px, w) { ctx.font = (w || 800) + ' ' + px + 'px ' + FONT; }

  // ---- figures -----------------------------------------------------------
  function fielder(ctx, x, y, s, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha *= alpha == null ? 1 : alpha;
    ctx.fillStyle = '#0007'; ctx.beginPath(); ctx.ellipse(0, 2, 11, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = RED; ctx.strokeStyle = '#0d1410'; ctx.lineWidth = 1.6; rr(ctx, -6.5, -17, 13, 16, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f3c9a0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -23, 5.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0d1410'; ctx.beginPath(); ctx.arc(0, -24.5, 5.5, Math.PI, 0); ctx.fill();
    // diamond badge (shape backup for colour)
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a0a08'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -14.5); ctx.lineTo(3.6, -10.5); ctx.lineTo(0, -6.5); ctx.lineTo(-3.6, -10.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function ring(ctx, x, y) {
    ctx.save(); ctx.fillStyle = 'rgba(123,227,123,.14)'; ctx.strokeStyle = GRN; ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(x, y - 2, 15, 6, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function chip(ctx, sector, guarded, cx, topY, bounds, avoid) {
    font(ctx, 12, 800);
    var t = LABEL[sector], tw = ctx.measureText(t).width, w = Math.ceil(tw + 34), h = 20;
    var x = clamp(cx - w / 2, 4, bounds.W - 4 - w), y = clamp(topY, 4, bounds.H - 4 - h);
    return { x: x, y: y, w: w, h: h, t: t, guarded: guarded };
  }
  function drawChip(ctx, c) {
    ctx.save();
    if (c.guarded) { ctx.fillStyle = RED; rr(ctx, c.x, c.y, c.w, c.h, 10); ctx.fill(); ctx.strokeStyle = '#1a0a08'; }
    else { ctx.fillStyle = 'rgba(13,20,16,.87)'; rr(ctx, c.x, c.y, c.w, c.h, 10); ctx.fill(); ctx.strokeStyle = GRN; ctx.lineWidth = 1.5; ctx.stroke(); ctx.strokeStyle = GRN; }
    ctx.lineWidth = 2.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    var gx = c.x + 9, gy = c.y + 6;
    if (c.guarded) { ctx.moveTo(gx, gy); ctx.lineTo(gx + 8, gy + 8); ctx.moveTo(gx + 8, gy); ctx.lineTo(gx, gy + 8); }
    else { ctx.moveTo(gx, gy + 5); ctx.lineTo(gx + 3.2, gy + 8.2); ctx.lineTo(gx + 9, gy + 1.8); }
    ctx.stroke();
    font(ctx, 12, 800); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = c.guarded ? '#1a0a08' : '#c6f5c6';
    ctx.fillText(c.t, c.x + 22, c.y + 14.5); ctx.restore();
  }
  function overlap(a, b, m) { m = m || 0; return a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y; }

  // ---- geometry helpers ----------------------------------------------------
  // distance along (dx,dy) from (ox,oy) to leave the rect
  function rayExit(ox, oy, dx, dy, r) {
    var t = 1e9;
    if (dx > 1e-6) t = Math.min(t, (r.x1 - ox) / dx); else if (dx < -1e-6) t = Math.min(t, (r.x0 - ox) / dx);
    if (dy > 1e-6) t = Math.min(t, (r.y1 - oy) / dy); else if (dy < -1e-6) t = Math.min(t, (r.y0 - oy) / dy);
    return Math.max(0, t);
  }

  // flight plan for a hit/caught ball: {S, E, dur, arc, perfect}
  function flight(G, W, H, geo, S, O) {
    var cur = G.cur, res = cur.res, sec = cur.tap.sector, spot = geo.spots[sec], reduced = G.reduced;
    if (res.kind === 'caught') {
      return { S: S, E: [spot[0], spot[1] - 10], dur: 480, arc: sec === 'loft' ? 60 : 0, ease: eOutQuad, caught: true, sec: sec };
    }
    var bounds = { x0: W * 0.05 + 6, x1: W * 0.95 - 6, y0: 6, y1: geo.batY };
    var dx = spot[0] - O[0], dy = spot[1] - O[1], len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    var g = res.grade, dur = g === 'perfect' ? 520 : g === 'good' ? 640 : 420, frac = g === 'perfect' ? 1 : g === 'good' ? 0.8 : 0.45;
    if (g === 'edge') {
      var a = (spot[0] >= O[0] ? 1 : -1) * 35 * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), nx = dx * c - dy * s, ny = dx * s + dy * c; dx = nx; dy = ny;
    }
    var t = rayExit(S[0], S[1], dx, dy, bounds);
    return { S: S, E: [S[0] + dx * t * frac, S[1] + dy * t * frac], dur: dur, arc: sec === 'loft' ? 60 : 0, ease: eOutCubic, perfect: g === 'perfect', sec: sec };
  }

  // ---- main ------------------------------------------------------------------
  function draw(ctx, G) {
    var cv = ctx.canvas, W = cv.clientWidth, H = cv.clientHeight, now = G.now, reduced = !!G.reduced;
    var geo = G.geom(W, H), topY = geo.topY, batY = geo.batY, cx = geo.cx, cur = G.cur, LOL = G.LOL;
    var guard = (G.field && G.field.guard) || {};
    var path = function (p) { return G.path(p, W, H); };

    // field-change cache (drop-safe)
    var fname = G.field && G.field.name;
    if (fname !== cache.name) { cache.prev = cache.name === null ? null : cache.guard; cache.name = fname; cache.t = now; cache.guard = guard; }
    cache.guard = guard;
    var fk = cache.prev ? c01((now - cache.t) / (reduced ? 200 : 500)) : 1;

    ctx.save();
    ctx.textBaseline = 'alphabetic'; ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    // background + mowing stripes
    ctx.fillStyle = '#1e3a24'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.025)';
    for (var sy = 0; sy < H; sy += H / 4.9) { if (((sy / (H / 4.9)) | 0) % 2 === 1) ctx.fillRect(0, sy, W, H / 4.9); }
    // gully walls
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(0, topY - 10, W * 0.05, H); ctx.fillRect(W * 0.95, topY - 10, W * 0.05, H);
    // lane
    ctx.fillStyle = '#c9b48a'; ctx.beginPath();
    ctx.moveTo(cx - geo.laneTopW / 2, topY); ctx.lineTo(cx + geo.laneTopW / 2, topY); ctx.lineTo(cx + geo.laneBotW / 2, H); ctx.lineTo(cx - geo.laneBotW / 2, H); ctx.fill();
    // popping crease
    var stumpTop = batY + 6, stumpBot = batY + 32;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 70, stumpBot + 4); ctx.lineTo(cx + 70, stumpBot + 4); ctx.stroke();

    // ball timing
    var hasCur = !!(cur && cur.tRel != null), span = hasCur ? (cur.tArr - cur.tRel) : 1;
    var res = hasCur ? cur.res : null, kind = res && res.kind, tap = hasCur ? cur.tap : null, stop = (hasCur && cur.stopUntil) || 0;
    var lineX = cx; if (hasCur) lineX = path(1)[0];

    // lane ticks + bat line
    if (hasCur && now >= cur.tRun) {
      [450, 300, 150].forEach(function (k) {
        var p = 1 - k / span, q = path(p), lit = now >= cur.tArr - k;
        ctx.strokeStyle = INK; ctx.globalAlpha = lit ? 1 : 0.5; ctx.lineWidth = lit ? 3 : 2; ctx.lineCap = 'butt';
        var hw = lit ? 13 : 9; ctx.beginPath(); ctx.moveTo(q[0] - hw, q[1]); ctx.lineTo(q[0] + hw, q[1]); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    // preview of path during run-up only (dashed), drawn under everything else
    if (hasCur && now >= cur.tRun && now < cur.tRel) {
      ctx.strokeStyle = 'rgba(26,20,0,.3)'; ctx.lineWidth = 2; ctx.setLineDash([6, 7]); ctx.beginPath();
      for (var pp = 0; pp <= 1.001; pp += 0.05) { var q2 = path(pp); pp ? ctx.lineTo(q2[0], q2[1]) : ctx.moveTo(q2[0], q2[1]); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(lineX - 39, batY); ctx.lineTo(lineX + 39, batY); ctx.stroke();

    // fielders (new field with 500 ms ghost/arrival), chips later
    var chips = [], figs = [];
    var caughtSec = (kind === 'caught' && tap) ? tap.sector : null;
    SECT.forEach(function (s) {
      var sp = geo.spots[s], g = !!guard[s];
      if (cache.prev && fk < 1 && cache.prev[s] && !g) { // leaving fielder: fading ghost
        ctx.save(); ctx.globalAlpha = 0.5 * (1 - fk); fielder(ctx, sp[0], sp[1], 1); ctx.restore();
      }
      if (g || s === caughtSec) {
        var arrive = cache.prev && fk < 1 && !cache.prev[s] && s !== caughtSec;
        var sc = 1, al = 1;
        if (arrive) { al = fk; if (!reduced) sc = 1 + 0.18 * Math.abs(Math.sin(fk * Math.PI * 2)); }
        figs.push({ s: s, x: sp[0], y: sp[1], sc: sc, al: al });
      } else {
        ring(ctx, sp[0], sp[1]);
      }
    });
    // flight plan (hit / caught)
    var fl = null, ballS = null;
    var Oo = [lineX, batY];
    if (hasCur && now >= cur.tRel) {
      var p0;
      if ((kind === 'hit' || kind === 'caught') && tap) {
        p0 = (tap.t - cur.tRel) / span; var S = path(p0); fl = flight(G, W, H, geo, S, Oo);
        var dt = now - stop;
        if (dt < 0) { ballS = { x: S[0], y: S[1], gy: S[1], alpha: 1 }; }
        else {
          var k = reduced ? (dt < 120 ? 0 : 1) : c01(dt / fl.dur), e = fl.ease(k);
          var bx = fl.S[0] + (fl.E[0] - fl.S[0]) * e, by = fl.S[1] + (fl.E[1] - fl.S[1]) * e, arc = fl.arc * Math.sin(k * Math.PI);
          var alpha = 1;
          if (!fl.caught && k >= 1) { var after = dt - (reduced ? 120 : fl.dur); alpha = fl.perfect ? (after < 0 ? 1 : 0) : 1 - c01((after - 250) / 150); if (fl.perfect) alpha = 0; }
          ballS = { x: bx, y: by - arc, gy: by, alpha: alpha };
        }
      } else {
        var te = now;
        if (tap) { var F = Math.max(0, stop - tap.t); te = now < tap.t ? now : now < stop ? tap.t : now - F; }
        var p = (te - cur.tRel) / span;
        if (kind === 'bowled') p = Math.min(p, 1 + 14 / Math.max(1, batY - topY));
        if (p < 1.32) { var q3 = path(p); ballS = { x: q3[0], y: q3[1], gy: q3[1], alpha: 1, p: p }; }
      }
    }

    // stumps
    var tilt = 0;
    if (kind === 'bowled' && hasCur) {
      var tb = tap ? (now < tap.t ? now : now < stop ? tap.t : now - Math.max(0, stop - tap.t)) : now;
      tilt = reduced ? (tb >= cur.tArr ? 1 : 0) : eOutQuad((tb - cur.tArr - 10) / 250);
    }
    for (var i = -1; i <= 1; i++) {
      ctx.save(); var sx = cx + i * 7; ctx.translate(sx, stumpBot);
      if (i !== 0) ctx.rotate(i * tilt * 14 * Math.PI / 180);
      ctx.fillStyle = '#f6f0dc'; ctx.strokeStyle = '#3b2f14'; ctx.lineWidth = 1; rr(ctx, -1.5, -(stumpBot - stumpTop), 3, stumpBot - stumpTop, 1); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // batter (right-hander, leg side = left)
    ctx.save(); ctx.translate(cx - 46, stumpBot);
    ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(2, 2, 16, 4, 0, 0, 7); ctx.fill();
    var swing = 0; if (tap && !reduced) swing = eOutCubic((now - tap.t) / 120);
    ctx.save(); ctx.translate(8, -40); ctx.rotate(-1.05 * swing);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#8a5a1e'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 34); ctx.stroke();
    ctx.strokeStyle = '#e0b46a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 34); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#17284a'; ctx.strokeStyle = '#9db9f2'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
    rr(ctx, -10, -26, 8, 26, 2.5); ctx.fill(); ctx.stroke(); rr(ctx, 2, -26, 8, 26, 2.5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11, -24); ctx.lineTo(11, -24); ctx.lineTo(10, -52); ctx.quadraticCurveTo(0, -56, -10, -52); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -61, 7.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0d1a33'; ctx.beginPath(); ctx.arc(0, -63, 7.5, Math.PI, 0); ctx.fill();
    ctx.restore();

    // bowler
    var bowlerY = topY - 16;
    if (hasCur && now < cur.tRel) { var kk = c01((now - cur.tRun) / Math.max(1, cur.tRel - cur.tRun)); bowlerY = topY - 38 + 22 * kk; }
    else if (hasCur) bowlerY = topY - 16;
    ctx.fillStyle = '#f0a040'; ctx.strokeStyle = '#0d1410'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, bowlerY, 12, 0, 7); ctx.fill(); ctx.stroke();
    var bname = (LOL && LOL.BOWLER && LOL.BOWLER.name) || 'Cone Kid';
    font(ctx, 12, 600); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    var ny = Math.max(12, bowlerY - 17); ctx.strokeText(bname, cx, ny); ctx.fillText(bname, cx, ny);

    // dashed catch line + fielders + rings
    if (fl && fl.caught && now >= stop) {
      var dt2 = now - stop, endAt = reduced ? 120 : fl.dur;
      if (dt2 < endAt + 600) {
        ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fl.S[0], fl.S[1]); ctx.lineTo(fl.E[0], fl.E[1]); ctx.stroke(); ctx.restore();
      }
    }
    figs.forEach(function (f) {
      var sc = f.sc, ringOn = false;
      if (f.s === caughtSec && fl && now >= stop) {
        var da = now - stop - (reduced ? 120 : fl.dur);
        if (da >= 0) { sc = reduced ? 1.5 : 1 + 0.5 * eOutCubic(da / 160); ringOn = true; }
      }
      fielder(ctx, f.x, f.y, sc, f.al);
      if (ringOn) { ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(f.x, f.y - 12 * sc, 20 * sc, 20 * sc, 0, 0, 7); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(f.x, f.y - 12 * sc, 23 * sc, 23 * sc, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    });

    // ball
    if (ballS && ballS.alpha > 0) {
      var R = 5; ctx.save(); ctx.globalAlpha = ballS.alpha;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(ballS.x, ballS.gy + R + 1.5, R * 1.2, R * 0.45, 0, 0, 7); ctx.fill();
      ctx.fillStyle = BALL; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ballS.x, ballS.y, R, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // perfect: gold burst at boundary (160 ms); reduced: static ring 300 ms
    if (fl && fl.perfect && now >= stop) {
      var after2 = now - stop - (reduced ? 120 : fl.dur);
      if (reduced) { if (after2 >= 0 && after2 < 300) { ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fl.E[0], fl.E[1], 16, 0, 7); ctx.stroke(); } }
      else if (after2 >= 0 && after2 < 160) {
        var bk = after2 / 160; ctx.save(); ctx.globalAlpha = 1 - bk; ctx.strokeStyle = GOLD; ctx.lineWidth = 4 - 2 * bk;
        ctx.beginPath(); ctx.arc(fl.E[0], fl.E[1], 6 + 30 * eOutCubic(bk), 0, 7); ctx.stroke(); ctx.restore();
      }
    }

    // chips (on top of figures)
    var fieldRect = null;
    font(ctx, 12, 800); var ftxt = 'Field: ' + (fname || ''); var fw = Math.ceil(ctx.measureText(ftxt).width + 24);
    fieldRect = { x: W - 8 - fw, y: 8, w: fw, h: 22 };
    var placed = [];
    SECT.forEach(function (s) {
      var sp = geo.spots[s], g = !!guard[s], isCatcher = s === caughtSec;
      if (isCatcher) return;
      var top = g ? sp[1] - 52 : sp[1] - 46, c = chip(ctx, s, g, sp[0], top, { W: W, H: H });
      var bad = function (cc) { return overlap(cc, fieldRect, 4) || placed.some(function (o) { return overlap(cc, o, 2); }) || cc.y < 4; };
      if (bad(c) || top < 4) { c = chip(ctx, s, g, sp[0], g ? sp[1] + 8 : sp[1] + 8, { W: W, H: H }); }
      placed.push(c); chips.push(c);
    });
    chips.forEach(function (c) { drawChip(ctx, c); });

    // tell plate (left of bowler, clear of the ball path)
    if (hasCur && LOL && LOL.DELIVERIES && LOL.DELIVERIES[cur.d]) {
      var tEnd = cur.tRel + 200, tp = now >= cur.tRun && now < tEnd;
      if (tp) {
        var a0 = reduced ? 1 : Math.min(c01((now - cur.tRun) / 120), c01((tEnd - now) / 120));
        var txt = LOL.DELIVERIES[cur.d].tell, maxW = cx - 12 - 16 - 8; font(ctx, 13, 800);
        var words = txt.split(' '), lines = [''], full = maxW - 34;
        words.forEach(function (w) { var t2 = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w; if (ctx.measureText(t2).width > full && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = t2; });
        var tw2 = 0; lines.forEach(function (l) { tw2 = Math.max(tw2, ctx.measureText(l).width); });
        var ph = 12 + lines.length * 16, pw = Math.min(maxW, Math.ceil(tw2 + 38));
        var cands = [{ x: 8, y: Math.max(8, topY - 14 - ph) }, { x: W - 8 - pw, y: Math.max(36, topY + 8) }, { x: 8, y: Math.max(8, topY + 8) }];
        var pick = cands[0];
        for (var ci = 0; ci < cands.length; ci++) {
          var rc = { x: cands[ci].x - 14, y: cands[ci].y - 14, w: pw + 28, h: ph + 28 }, hit = false;
          for (var pq = 0; pq <= 1.3; pq += 0.04) { var pt = path(pq); if (pt[0] > rc.x && pt[0] < rc.x + rc.w && pt[1] > rc.y && pt[1] < rc.y + rc.h) { hit = true; break; } }
          if (!hit) { pick = cands[ci]; break; }
        }
        ctx.save(); ctx.globalAlpha = a0; ctx.fillStyle = 'rgba(0,0,0,.82)'; ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
        rr(ctx, pick.x, pick.y, pw, ph, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = GOLD; ctx.textAlign = 'left'; font(ctx, 13, 800);
        lines.forEach(function (l, li) { ctx.fillText(l, pick.x + 28, pick.y + 20 + li * 16); });
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); var ix = pick.x + 13, iy = pick.y + ph / 2;
        if (cur.d === 'swing') { ctx.moveTo(ix - 5, iy + 6); ctx.quadraticCurveTo(ix - 6, iy - 6, ix + 5, iy - 4); ctx.stroke(); ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(ix + 7, iy - 8); ctx.lineTo(ix + 7, iy + 1); ctx.lineTo(ix - 1, iy - 3); ctx.fill(); }
        else if (cur.d === 'slower') { ctx.moveTo(ix - 3, iy - 6); ctx.lineTo(ix - 3, iy + 6); ctx.moveTo(ix + 4, iy - 6); ctx.lineTo(ix + 4, iy + 6); ctx.stroke(); }
        else { ctx.moveTo(ix, iy + 7); ctx.lineTo(ix, iy - 7); ctx.moveTo(ix - 5, iy - 2); ctx.lineTo(ix, iy - 7); ctx.lineTo(ix + 5, iy - 2); ctx.stroke(); }
        ctx.restore();
      }
    }

    // field-name chip top-right
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.strokeStyle = '#6f8f78'; ctx.lineWidth = 1.5; rr(ctx, fieldRect.x, fieldRect.y, fieldRect.w, fieldRect.h, 11); ctx.fill(); ctx.stroke();
    font(ctx, 12, 800); ctx.fillStyle = '#eef3e8'; ctx.textAlign = 'center'; ctx.fillText(ftxt, fieldRect.x + fieldRect.w / 2, fieldRect.y + 15.5);

    // banner (over break)
    var bn = G.banner;
    if (bn && now < bn.until) {
      var ba = reduced ? 1 : Math.min(c01((bn.until - now) / 150), 1); font(ctx, 22, 800);
      var bw = Math.min(W - 16, Math.ceil(ctx.measureText(bn.text).width + 40)), bh = 44, bx = (W - bw) / 2, by2 = topY + (batY - topY) * 0.4 - bh / 2;
      ctx.save(); ctx.globalAlpha = ba; ctx.fillStyle = 'rgba(0,0,0,.87)'; ctx.strokeStyle = GOLD; ctx.lineWidth = 2; rr(ctx, bx, by2, bw, bh, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.textAlign = 'center'; ctx.fillText(bn.text, W / 2, by2 + 30); ctx.restore();
    }

    // corner readout
    var st = G.stats;
    if (st) {
      var f1 = function (v) { return v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1); };
      var rd = 'Canvas 2D · frame p50 ' + f1(st.p50) + ' p95 ' + f1(st.p95) + ' max ' + (st.max == null ? '-' : Math.round(st.max)) +
        ' · taps ' + (st.n ? (Math.round(st.tapMean) + '±' + Math.round(st.tapSd) + ' (' + st.n + ')') : '-');
      font(ctx, 11, 500); if (ctx.measureText(rd).width > W - 20) rd = rd.replace('Canvas 2D \u00b7 ', '').replace('frame ', ''); var rw = Math.ceil(ctx.measureText(rd).width + 12);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, 4, H - 22, rw, 18, 6); ctx.fill();
      ctx.fillStyle = '#c2cfc3'; ctx.textAlign = 'left'; ctx.fillText(rd, 10, H - 9);
    }
    ctx.restore();
  }

  LOLParts.field = { draw: draw };
})();
