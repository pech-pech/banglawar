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
  PL.BTN = { copy: function (view) { return btnRect(view, 1); }, path: function (view) { return btnRect(view, 0); } };

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
      if (k % 6 === 5) pts.push({ x: s.x, y: s.y });
      const ev = s.events;
      if (s.dead || s.won || ev.indexOf('death') >= 0 || ev.indexOf('win') >= 0 || (k >= 3 && (ev.indexOf('land') >= 0 || s.grounded))) {
        pts.push({ x: s.x, y: s.y });
        break;
      }
    }
    PP.t = state.t; PP.room = state.room; PP.g = state.g; PP.x = state.x; PP.y = state.y; PP.secs = secs;
    return pts;
  };

  function spikeUp(room, r) {
    // point away from a wall touching the rect; default up
    const walls = room.walls || [];
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (r[0] < w[0] + w[2] && r[0] + r[2] > w[0]) {
        if (Math.abs(w[1] - (r[1] + r[3])) < 2) return 0;      // wall below -> point up
        if (Math.abs(w[1] + w[3] - r[1]) < 2) return 2;        // wall above -> point down
      }
      if (r[1] < w[1] + w[3] && r[1] + r[3] > w[1]) {
        if (Math.abs(w[0] - (r[0] + r[2])) < 2) return 3;      // wall right -> point left
        if (Math.abs(w[0] + w[2] - r[0]) < 2) return 1;        // wall left -> point right
      }
    }
    return 0;
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
    ctx.lineWidth = 2;
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
        const mx = sx(r[0] + r[2] / 2), my = sy(r[1] + r[3] / 2), a = 9 * sc;
        ctx.fillStyle = INK; ctx.beginPath();
        ctx.moveTo(mx + d[0] * a, my + d[1] * a);
        ctx.lineTo(mx - d[1] * a * 0.7 - d[0] * a * 0.5, my + d[0] * a * 0.7 - d[1] * a * 0.5);
        ctx.lineTo(mx + d[1] * a * 0.7 - d[0] * a * 0.5, my - d[0] * a * 0.7 - d[1] * a * 0.5);
        ctx.closePath(); ctx.fill();
      }
      // crushers: track line + body at current time
      const cs = room.crushers || [];
      const tsec = tick / 120;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i], r = c.r, amp = c.amp || 0;
        const o = Math.sin(TAU * tsec / 2.4 + (c.phase || 0)) * amp;
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(sx(r[0] + r[2] / 2 - (c.ax ? amp : 0)), sy(r[1] + r[3] / 2 - (c.ay ? amp : 0)));
        ctx.lineTo(sx(r[0] + r[2] / 2 + (c.ax ? amp : 0)), sy(r[1] + r[3] / 2 + (c.ay ? amp : 0)));
        ctx.stroke(); ctx.setLineDash([]);
        const x = r[0] + (c.ax ? o : 0), y = r[1] + (c.ay ? o : 0);
        ctx.fillStyle = '#3b4252';
        ctx.fillRect(sx(x), sy(y), r[2] * sc, r[3] * sc);
        ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.strokeRect(sx(x), sy(y), r[2] * sc, r[3] * sc);
      }
      // spikes: triangle row
      const sp = room.spikes || [];
      ctx.fillStyle = RED;
      for (let i = 0; i < sp.length; i++) {
        const r = sp[i].r, dir = spikeUp(room, r), horiz = dir === 0 || dir === 2;
        const len = horiz ? r[2] : r[3], cnt = Math.max(1, Math.round(len / 12)), step = len / cnt;
        for (let k = 0; k < cnt; k++) {
          ctx.beginPath();
          if (dir === 0) { ctx.moveTo(sx(r[0] + k * step), sy(r[1] + r[3])); ctx.lineTo(sx(r[0] + (k + 0.5) * step), sy(r[1])); ctx.lineTo(sx(r[0] + (k + 1) * step), sy(r[1] + r[3])); }
          else if (dir === 2) { ctx.moveTo(sx(r[0] + k * step), sy(r[1])); ctx.lineTo(sx(r[0] + (k + 0.5) * step), sy(r[1] + r[3])); ctx.lineTo(sx(r[0] + (k + 1) * step), sy(r[1])); }
          else if (dir === 1) { ctx.moveTo(sx(r[0]), sy(r[1] + k * step)); ctx.lineTo(sx(r[0] + r[2]), sy(r[1] + (k + 0.5) * step)); ctx.lineTo(sx(r[0]), sy(r[1] + (k + 1) * step)); }
          else { ctx.moveTo(sx(r[0] + r[2]), sy(r[1] + k * step)); ctx.lineTo(sx(r[0]), sy(r[1] + (k + 0.5) * step)); ctx.lineTo(sx(r[0] + r[2]), sy(r[1] + (k + 1) * step)); }
          ctx.closePath(); ctx.fill();
        }
      }
      // exit ring
      if (room.exit) {
        ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx(room.exit.x), sy(room.exit.y), 18 * sc, 0, TAU); ctx.stroke();
        ctx.strokeStyle = BRASS; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx(room.exit.x), sy(room.exit.y), 11 * sc, 0, TAU); ctx.stroke();
      }
    }

    // predicted path (dotted)
    if (hud.pathOn && state && !state.dead && !state.won) {
      const pts = PL.predictPath(state, 0.8);
      ctx.fillStyle = BRASS;
      for (let i = 1; i < pts.length; i++) {
        ctx.beginPath(); ctx.arc(sx(pts[i].x), sy(pts[i].y), 2.5, 0, TAU); ctx.fill();
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
    text(ctx, 'swipe = flip   tap = dive   hold = restart', W / 2, H - ins.b - 14, 14, 'rgba(31,36,48,0.55)', 'center');

    // restart ring
    if (hud.ring > 0) {
      ctx.strokeStyle = RED; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.8, 36, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, hud.ring)); ctx.stroke();
    }

    // HUD band: paper under all HUD text so room content never collides
    const bandH = ins.t + 120;
    ctx.fillStyle = 'rgba(242,236,220,0.92)';
    ctx.fillRect(0, 0, W, bandH);
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, bandH + 0.5); ctx.lineTo(W, bandH + 0.5); ctx.stroke();

    // HUD text
    const left = ins.l + 12, top = ins.t;
    const n = hud.roomIdx != null ? hud.roomIdx + 1 : 1;
    text(ctx, n + '/3 ' + (hud.roomName || ''), left, top + 24, 16, INK, 'left', true);
    text(ctx, fmtT(hud.timeS) + '  flips ' + (hud.flips || 0) + '  deaths ' + (hud.deaths || 0), left, top + 44, 14, INK);
    if (hud.teach) {
      const maxW = W - 136 - ins.r - left - 8;
      let tt = String(hud.teach);
      ctx.font = '500 14px ' + FONT;
      if (ctx.measureText && maxW > 0) {
        let guard = 200;
        while (tt.length > 1 && guard-- > 0 && ctx.measureText(tt).width > maxW) tt = tt.slice(0, -2).replace(/\s+$/, '') + '\u2026';
      }
      text(ctx, tt, left, top + 64, 14, 'rgba(31,36,48,0.75)');
    }
    text(ctx, 'seed ' + (hud.seed != null ? hud.seed : 1) + (hud.fps ? '  ' + Math.round(hud.fps) + ' fps' : ''), left, top + 84, 14, 'rgba(31,36,48,0.6)');
    // charge pips
    const ch = state && state.charges != null ? state.charges : 0, maxc = (PL.C && PL.C.CHARGES) || 2;
    for (let i = 0; i < maxc; i++) {
      const px = left + 8 + i * 22, py = top + 104;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, TAU);
      if (i < ch) { ctx.fillStyle = BRASS; ctx.fill(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    }

    // buttons
    button(ctx, PL.BTN.copy(view), 'Copy', false);
    button(ctx, PL.BTN.path(view), 'Path', !!hud.pathOn);

    // toast
    if (hud.toast) {
      ctx.font = '700 14px ' + FONT;
      const tw = ctx.measureText ? (ctx.measureText(hud.toast).width || 120) : 120;
      const bw = tw + 24, bx = W / 2 - bw / 2, by = H * 0.55 - 20;
      ctx.fillStyle = INK; ctx.fillRect(bx, by, bw, 32);
      text(ctx, hud.toast, W / 2, by + 21, 14, PAPER, 'center', true);
    }

    // complete screen
    const cp = hud.completeScreen;
    if (cp) {
      ctx.fillStyle = 'rgba(242,236,220,0.96)'; ctx.fillRect(0, 0, W, H);
      const y0 = H * 0.3;
      text(ctx, 'Survey complete', W / 2, y0, 28, INK, 'center', true);
      text(ctx, 'Time ' + fmtT(cp.timeS), W / 2, y0 + 44, 18, INK, 'center');
      text(ctx, 'Flips ' + (cp.flips || 0) + '   Deaths ' + (cp.deaths || 0), W / 2, y0 + 72, 18, INK, 'center');
      text(ctx, 'Seed ' + (hud.seed != null ? hud.seed : 1), W / 2, y0 + 100, 14, 'rgba(31,36,48,0.7)', 'center');
      text(ctx, 'Tap to restart', W / 2, y0 + 140, 18, RED, 'center', true);
      button(ctx, PL.BTN.copy(view), 'Copy', false);
    }
  };
})();
