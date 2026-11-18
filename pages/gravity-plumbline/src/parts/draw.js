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

  PL.draw = function (ctx, view, frame, state, hud) {
    view = view || { W: 360, H: 640, dpr: 1 };
    frame = frame || { scale: 1, cx: 168, cy: 250 };
    hud = hud || {};
    const W = view.W || 360, H = view.H || 640, ins = inset(view);
    const room = (state && state.room) || null;
    const sc = frame.scale || 1, cx = frame.cx || 0, cy = frame.cy || 0;
    const sx = function (x) { return (x - cx) * sc + W / 2; };
    const sy = function (y) { return (y - cy) * sc + H / 2; };
    const tick = state && state.t || 0;

    // ctx is already scaled by dpr (ui.js); draw in CSS px
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    if (room) {
      const rw = room.w || 336, rh = room.h || 500;
      // paper under the room + grid ticks
      ctx.fillStyle = PAPER2;
      ctx.fillRect(sx(0), sy(0), rw * sc, rh * sc);
      ctx.strokeStyle = GRID; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 0; gx <= rw; gx += 28) { ctx.moveTo(sx(gx), sy(0)); ctx.lineTo(sx(gx), sy(rh)); }
      for (let gy = 0; gy <= rh; gy += 28) { ctx.moveTo(sx(0), sy(gy)); ctx.lineTo(sx(rw), sy(gy)); }
      ctx.stroke();

      // crumbles (dashed)
      const cr = room.crumbles || [];
      for (let i = 0; i < cr.length; i++) {
        const st = state.crumbleS && state.crumbleS[i] ? state.crumbleS[i].st : 0;
        if (st === 2) continue;
        const r = cr[i];
        ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.fillStyle = st === 1 ? 'rgba(192,57,43,0.25)' : 'rgba(31,36,48,0.18)';
        ctx.fillRect(sx(r[0]), sy(r[1]), r[2] * sc, r[3] * sc);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(sx(r[0]), sy(r[1]), r[2] * sc, r[3] * sc);
        ctx.setLineDash([]);
      }
      // walls
      ctx.fillStyle = INK;
      const ws = room.walls || [];
      for (let i = 0; i < ws.length; i++) ctx.fillRect(sx(ws[i][0]), sy(ws[i][1]), ws[i][2] * sc, ws[i][3] * sc);

      // gates: thin bar + arrow
      const gs = room.gates || [];
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i], r = g.r, d = (PL.DIRS || [[0, -1], [1, 0], [0, 1], [-1, 0]])[g.dir | 0] || [0, -1];
        ctx.fillStyle = 'rgba(176,141,46,0.35)';
        ctx.fillRect(sx(r[0]), sy(r[1]), r[2] * sc, r[3] * sc);
        ctx.strokeStyle = BRASS; ctx.lineWidth = 2;
        ctx.strokeRect(sx(r[0]), sy(r[1]), r[2] * sc, r[3] * sc);
        // direction chevrons along the gate's long axis, pointing the way through
        const horizG = r[2] >= r[3], longL = horizG ? r[2] : r[3];
        const cnt = Math.max(1, Math.min(4, Math.round(longL / 22))), stp = longL / cnt, a = 7 * sc;
        ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'miter';
        for (let k = 0; k < cnt; k++) {
          const along = (k + 0.5) * stp;
          const mx = sx(horizG ? r[0] + along : r[0] + r[2] / 2), my = sy(horizG ? r[1] + r[3] / 2 : r[1] + along);
          ctx.beginPath();
          ctx.moveTo(mx - d[1] * a - d[0] * a * 0.6, my + d[0] * a - d[1] * a * 0.6);
          ctx.lineTo(mx + d[0] * a * 0.6, my + d[1] * a * 0.6);
          ctx.lineTo(mx + d[1] * a - d[0] * a * 0.6, my - d[0] * a - d[1] * a * 0.6);
          ctx.stroke();
        }
      }
      // crushers: track line + body at current time
      const cs = room.crushers || [];
      const tsec = tick / 120;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i], r = c.r, amp = c.amp || 0;
        const o = Math.sin(TAU * tsec / 2.4 + (c.phase || 0)) * amp;
        ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(sx(r[0] + r[2] / 2 - (c.ax ? amp : 0)), sy(r[1] + r[3] / 2 - (c.ay ? amp : 0)));
        ctx.lineTo(sx(r[0] + r[2] / 2 + (c.ax ? amp : 0)), sy(r[1] + r[3] / 2 + (c.ay ? amp : 0)));
        ctx.stroke(); ctx.setLineDash([]);
        const x = r[0] + (c.ax ? o : 0), y = r[1] + (c.ay ? o : 0);
        ctx.fillStyle = '#7a2b2b';
        ctx.fillRect(sx(x), sy(y), r[2] * sc, r[3] * sc);
        ctx.strokeStyle = RED; ctx.lineWidth = 2;
        ctx.strokeRect(sx(x), sy(y), r[2] * sc, r[3] * sc);
      }
      // spikes: triangle row
      const sp = room.spikes || [];
      ctx.fillStyle = RED;
      for (let i = 0; i < sp.length; i++) {
        const r = sp[i].r, dir = spikeDir(room, r), horiz = dir === 0 || dir === 2;
        const len = horiz ? r[2] : r[3], hgt = Math.min(horiz ? r[3] : r[2], len);
        const cnt = Math.max(1, Math.round(len / 12)), step = len / cnt;
        for (let k = 0; k < cnt; k++) {
          const a0 = k * step, a1 = (k + 1) * step, am = (k + 0.5) * step;
          ctx.beginPath();
          if (dir === 0) { ctx.moveTo(sx(r[0] + a0), sy(r[1] + r[3])); ctx.lineTo(sx(r[0] + am), sy(r[1] + r[3] - hgt)); ctx.lineTo(sx(r[0] + a1), sy(r[1] + r[3])); }
          else if (dir === 2) { ctx.moveTo(sx(r[0] + a0), sy(r[1])); ctx.lineTo(sx(r[0] + am), sy(r[1] + hgt)); ctx.lineTo(sx(r[0] + a1), sy(r[1])); }
          else if (dir === 1) { ctx.moveTo(sx(r[0]), sy(r[1] + a0)); ctx.lineTo(sx(r[0] + hgt), sy(r[1] + am)); ctx.lineTo(sx(r[0]), sy(r[1] + a1)); }
          else { ctx.moveTo(sx(r[0] + r[2]), sy(r[1] + a0)); ctx.lineTo(sx(r[0] + r[2] - hgt), sy(r[1] + am)); ctx.lineTo(sx(r[0] + r[2]), sy(r[1] + a1)); }
          ctx.closePath(); ctx.fill();
        }
      }
      // exit ring
      if (room.exit) {
        ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx(room.exit.x), sy(room.exit.y), 18 * sc, 0, TAU); ctx.stroke();
        ctx.strokeStyle = BRASS; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx(room.exit.x), sy(room.exit.y), 11 * sc, 0, TAU); ctx.stroke();
      }
    }

    // death replay trail (faded polyline)
    if (Array.isArray(hud.trail) && hud.trail.length > 1) {
      const tr = hud.trail, from = Math.max(0, tr.length - 240);
      ctx.strokeStyle = 'rgba(192,57,43,0.45)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = from; i < tr.length; i++) { if (i === from) ctx.moveTo(sx(tr[i].x), sy(tr[i].y)); else ctx.lineTo(sx(tr[i].x), sy(tr[i].y)); }
      ctx.stroke();
    }

    // predicted path (dotted, every 4 ticks)
    if (hud.pathOn && state && !state.dead && !state.won) {
      const pts = PL.predictPath(state, 0.8);
      ctx.fillStyle = BRASS;
      for (let i = 1; i < pts.length; i++) {
        ctx.beginPath(); ctx.arc(sx(pts[i].x), sy(pts[i].y), 3.5, 0, TAU); ctx.fill();
      }
    }

    // dust
    const fx = hud.reduced ? [] : (hud.fx || []);
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i], a = Math.max(0, 1 - (f.age || 0) / 0.4);
      if (a <= 0) continue;
      ctx.fillStyle = 'rgba(31,36,48,' + (0.35 * a).toFixed(3) + ')';
      for (let k = 0; k < 5; k++) {
        const ang = k * 1.26, d = (4 + (f.age || 0) * 60) * sc;
        ctx.beginPath(); ctx.arc(sx(f.x) + Math.cos(ang) * d, sy(f.y) + Math.sin(ang) * d, 2.5 * a * sc + 1, 0, TAU); ctx.fill();
      }
    }

    // bob + plumbline
    if (state) {
      const bx = sx(state.x || 0), by = sy(state.y || 0), R = 11 * sc;
      const d = (PL.DIRS || [[0, -1], [1, 0], [0, 1], [-1, 0]])[state.g == null ? 2 : state.g] || [0, 1];
      const dead = state.dead > 0;
      ctx.strokeStyle = BRASS; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + d[0] * 48 * sc, by + d[1] * 48 * sc); ctx.stroke();
      ctx.fillStyle = dead ? RED : INK;
      ctx.beginPath(); ctx.arc(bx, by, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = BRASS; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, R, 0, TAU); ctx.stroke();
    }

    // bottom 40% control strip tint
    ctx.fillStyle = STRIP;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);
    ctx.strokeStyle = 'rgba(31,36,48,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H * 0.6); ctx.lineTo(W, H * 0.6); ctx.stroke();

    // restart ring
    if (hud.ring > 0) {
      ctx.strokeStyle = RED; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.8, 36, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, hud.ring)); ctx.stroke();
    }

    // bottom edge: tiny seed/fps line, and the control hint on the first attempt only,
    // only when it sits fully below the room box (never over walls)
    const botY = H - ins.b - 6;
    if (hud.tuning && hud.tuning.open) text(ctx, 'seed ' + (hud.seed != null ? hud.seed : 1) + (hud.fps ? '  ' + Math.round(hud.fps) + ' fps' : ''), ins.l + 8, botY, 14, 'rgba(31,36,48,0.6)');
    if (room && (hud.attempt == null || hud.attempt <= 1) && !hud.hideHint) {
      const hintY = botY - 24, roomBottom = sy(room.h || 500);
      if (roomBottom + 6 < hintY - 12) text(ctx, 'swipe = flip   tap = dive   hold = restart', W / 2, hintY, 14, 'rgba(31,36,48,0.6)', 'center');
    }

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
