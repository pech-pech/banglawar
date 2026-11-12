/* beats: P10 match "beats". Stepped, code-drawn (kit SPR / ISO / PAL are page globals), no image files, no sound.
   Spec: look/mockups/p10-beats/BEATS.md. Beats are pictures only: they never touch the store or the match result.
   Every beat is a list of held frames (steps, in ms). Positions are whole pixels; nothing rotates or tweens.
   Nothing flashes: where the mock flashed twice, a beat changes state once (single pulse, then holds).
   Reduced motion (prefers-reduced-motion): one calm end frame, held `rm` ms, no bob, confetti or cheering arms.
   The over panel calls attachBeats(slot, opts) and ball(o); result and end views call winBeat / promoBeat.
   Two values stay hooks for NUMBERS (economy not built): HOOKS.crowdFill and HOOKS.quirks. Audio: HOOKS.sfx is null. */

/* ---------- hooks (stubs) ---------- */
export const DEFAULT_FILL = 0.75; // stand-in density for match scenes, as in the mock; NUMBERS replaces it through HOOKS.crowdFill
export const HOOKS = {
  crowdFill: null,    // NUMBERS: (fans) => 0..1 share of seats filled. Null = DEFAULT_FILL for every Fans value.
  quirks: null,       // NUMBERS: player quirk traits (cap, headband, beard...). Nothing is drawn until they exist.
  drawQuirk: null,    // SCREENS: (ctx, x, y, playerId) after each SPR.player, once QUIRKS exist.
  sfx: null,          // (cueName) => void. No audio exists yet; cue names are kept so the table matches the spec.
  reduceMotion: null, // optional () => bool for an in-game toggle (none exists yet); OR-ed with the media query.
};
export function crowdFill(fans) {
  const f = HOOKS.crowdFill ? Number(HOOKS.crowdFill(fans)) : NaN;
  return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : DEFAULT_FILL;
}

/* ---------- event mapping (the mock's names -> real engine data) ----------
   onBall            -> an over ball {o}: o === 'W' wicket, 6 six, 4 four (the engine has no wides or no-balls)
   onMatchEnd(win)   -> stage 'done' with result 'won' (result view)
   onPromotion       -> endVM result.promoted on the season-over screen
   onDrillResult     -> drillResultVM (already live from P7: player-sheet stepCount + tr-pulse; unchanged here)
   onBuildingUpgrade, onFansChanged -> no engine event yet (economy not built): playBeat('upgrade'|'crowd') is ready, unwired. */
export function beatFor(o) { return o === 'W' ? 'wicket' : o === 6 ? 'six' : o === 4 ? 'four' : null; }

/* ---------- frame tables ---------- */
const rep = (n, ms) => Array.from({ length: n }, () => ms);
export const BEATS = {
  upgrade: { steps: rep(6, 100), rm: 600, cues: { 0: 'sfx_upgrade_pop', 1: 'sfx_spark' } },
  crowd: { steps: [...rep(8, 80), 300, 300], rm: 600, cues: { 0: 'sfx_crowd_swell' } },
  win: { steps: rep(12, 100), rm: 1200, cues: { 0: 'sfx_win_fanfare' } },
  promo: { steps: rep(3, 100), rm: 300, cues: { 0: 'sfx_win_fanfare', 2: 'sfx_trophy_stamp' } },   // trophy stamp inside the Promoted card
  wicket: { steps: rep(5, 80), rm: 400, cues: { 0: 'sfx_wicket_clatter', 1: 'sfx_crowd_gasp' } },
  six: { steps: rep(5, 80), rm: 400, cues: { 0: 'sfx_bat_crack', 4: 'sfx_six_roar' } },
  four: { steps: rep(5, 80), rm: 400, cues: { 0: 'sfx_bat_crack', 3: 'sfx_four_rope' } },
};
export const beatMs = (name) => BEATS[name].steps.reduce((a, b) => a + b, 0);

/* ---------- runner: one beat at a time, a new beat cancels the running one, taps are never blocked ---------- */
export function reduced(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  const mq = !!(w && w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return mq || !!(HOOKS.reduceMotion && HOOKS.reduceMotion());
}
/** deps: { set, clear, rm: () => bool }. draw(k, rm): k = frame, k === steps.length is the settled rest frame. */
export function createRunner(deps) {
  const set = (deps && deps.set) || ((f, ms) => setTimeout(f, ms)), clear = (deps && deps.clear) || ((t) => clearTimeout(t));
  const isRm = (deps && deps.rm) || (() => reduced());
  let timer = null, running = false;
  const cue = (n) => { if (n && HOOKS.sfx) HOOKS.sfx(n); };
  const api = {
    get running() { return running; },
    stop() { if (timer !== null) clear(timer); timer = null; running = false; },
    play(name, draw, done) {
      api.stop();
      const b = BEATS[name], n = b.steps.length, rm = isRm();
      running = true;
      const end = () => { running = false; timer = null; draw(n, false); if (done) done(); };   // rest frame: still, no popup, no confetti
      cue(b.cues[0]);
      if (rm) { draw(0, true); timer = set(end, b.rm); return; }
      let k = 0;
      (function step() {
        cue(b.cues[k]); draw(k, false);
        timer = set(() => { k++; if (k < n) step(); else end(); }, b.steps[k]);
      })();
    },
  };
  return api;
}

/* ---------- scene geometry (pure): a 150x100 stand-and-oval picture, drawn at scale 2 = 300x200 ---------- */
const STAMP = 20;
export const W = 150, H = 100, SC = 2;
const BAND_TOP = 4, BAND_BOT = 28, LOW_H = 20, LOW_TOP = H - LOW_H;
export function geo() {
  const A0 = Math.floor(W / 2) - 3, B = Math.max(10, Math.min(Math.round(A0 / 2), Math.floor((LOW_TOP - BAND_BOT - 6) / 2)));
  const A = Math.min(A0, Math.round(B * 2.4)), cx = Math.round(W / 2), cy = Math.round((BAND_BOT + LOW_TOP) / 2), ox = cx, oy = cy - 48;
  const at = (gx, gy) => ({ x: Math.round(ox + (gx - gy) * 8), y: Math.round(oy + (gx + gy) * 4) });
  return { A, B, cx, cy, ox, oy, at, bat: at(6.8, 8.6), stumps: at(6, 9.5), far: at(6, 2.6), lowTop: LOW_TOP, bandBot: BAND_BOT, ang: 0.35 };
}
const G = geo();

/* crowd rows: x, baseline y, seats, seed (the rows the kit's match scene uses, one seat per call so density can vary) */
export const ROWS = (() => {
  const n = Math.floor(W / 4), rows = [];
  for (let r = 0; r < 3; r++) rows.push({ x: r & 1 ? 2 : 0, y: BAND_TOP + 7 + 8 * r, n, seed: 3 + r * 7 });
  for (let r = 0; r < 2; r++) rows.push({ x: r & 1 ? 0 : 2, y: LOW_TOP + 8 + 8 * r + (r === 1 ? 2 : 0), n, seed: 11 + 6 * r });
  return rows;
})();
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/** Seeded seat rank: the same Fans always gives the same crowd, and seats fill scattered, not left to right. */
export const SEAT_RANK = (() => { const r = rng(1207); return ROWS.map((row) => Array.from({ length: row.n }, () => r())); })();

/* the rope: one ring, drawn white in the background and gold (same points) while a four lands, so the flash never sits off the rope */
export function ropePoints(a0, a1, step) {
  const out = [];
  for (let a = a0; a <= a1; a += step || 0.01) out.push([Math.round(G.cx + (G.A - 1) * Math.cos(a)), Math.round(G.cy + (G.B - 1) * Math.sin(a))]);
  return out;
}
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
/** Six: ball arc in 5 held frames (400 ms, one ball slot) from the bat to the near stand. k 0..4; null once landed. */
export function sixPoint(k) {
  if (k < 0 || k > 4) return null;
  const t = (k + 1) / 5, sx = G.bat.x + 4, sy = G.bat.y - 8, ex = 104, ey = G.lowTop + 8;
  const gy = sy + (ey - sy) * t;
  return { x: lerp(sx, ex, t), y: Math.round(gy - 30 * Math.sin(Math.PI * t) - 6 * (1 - t)), ground: Math.round(gy), onGrass: gy < G.lowTop - 2 };
}
export const SIX_REST = { x: 104, y: G.lowTop + 8 };
const HOP = [0, 2, 0, 1, 0];
const UP_DY = [-3, -5, -2, 0, -1, 0], SPARK_R = [0, 18, 24, 28, 31, 33], SPARK_S = [0, 2, 2, 2, 1, 1];
export function fourPoint(k) {
  const ex = Math.round(G.cx + (G.A - 1) * Math.cos(G.ang)) - 2, ey = Math.round(G.cy + (G.B - 1) * Math.sin(G.ang));
  const sx = G.bat.x + 6, sy = G.bat.y - 2, t = k >= 4 ? 1 : (k + 1) / 5;
  return { x: lerp(sx, ex, t), y: lerp(sy, ey, t), hop: k >= 4 ? 0 : HOP[k], atRope: k >= 4 };
}
/** Wicket: [lean per stump, bail positions relative to the stumps] per frame. */
const WK = [[[0, 0, 0], null], [[-1, 0, 2], [[-3, -13], [2, -14]]], [[-2, 1, 3], [[-6, -17], [5, -18]]], [[-3, 1, 4], [[-8, -15], [8, -16]]], [[-3, 1, 4], [[-1, 6], [6, 4]]]];
export const wicketFrame = (k, rm) => WK[rm || k >= 4 ? 4 : k];   // 5 held frames, 80 ms each
/** The chip and the number show on frame 0 (the instant the ball lands) and stay until the next ball. */
export function chipFor(name) {
  if (name === 'wicket') return { text: 'Wicket', kind: 'warn' };
  if (name === 'six') return { text: 'Six +6', kind: 'new' };
  if (name === 'four') return { text: 'Four +4', kind: 'plain' };
  return null;
}
/** Rope colour for a four: turns gold once from frame 3 and stays (a single change, not a flash). */
export const ropeGold = (k, rm) => rm || k >= 3;
/** Confetti: 24 squares, deterministic. Frame k 0..11. Returns [{x, y, c, edge}] on screen only. */
const CONF = (() => {
  const r = rng(77), cols = ['gold', 'kitA1', 'kitB1', 'white', 'accent', 'danger', 'water'], a = [];
  for (let i = 0; i < 24; i++) a.push({ x: 6 + Math.floor(r() * (W - 12)), y: -Math.floor(r() * 40), v: 8 + Math.floor(r() * 5), c: cols[i % cols.length], ph: i % 2 });
  return a;
})();
export function confettiAt(k) {
  const out = [];
  CONF.forEach((q) => { const y = q.y + q.v * k, x = q.x + ((k + q.ph) % 2 ? 1 : -1); if (y >= -3 && y <= H) out.push({ x, y, c: q.c, edge: (k + q.ph) % 2 === 0 }); });
  return out;
}
export const confettiCount = () => CONF.length;
/** Trophy stamp in the Promoted card: drops in over 3 frames (y offsets in art px), dust on the last. */
export const STAMP_DY = [-6, -3, 0];
export const stampDy = (k, rm) => (rm || k >= 3 ? 0 : STAMP_DY[k]);

/* ---------- drawing (browser only) ---------- */
const kitGlobals = () => (typeof window !== 'undefined' && window.SPR && window.ISO && window.PAL ? window : null);

/* 5x7 popup glyphs, drawn by the beats (the kit's 3x5 "4" reads as "y", its 6 as S/G). Rows of 5, 7 rows. */
export const GLYPH = {
  '4': '...1...11..1.1.1..1.11111...1....1.', '6': '..11..1...1....1111.1...11...1.111.',
  '2': '.111.1...1....1...1...1...1...11111', U: '1...11...11...11...11...11...1.111.', P: '1111.1...11...11111.1....1....1....',
};
export function bigText(ctx, x, y, str, colour, cell) {
  const w = window, c = cell || 2, out = w.PAL.outline;
  const total = str.length * 6 * c - c;
  let gx = Math.round(x - total / 2);
  for (const ch of str) {
    const g = GLYPH[ch]; if (g) {
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 35; i++) if (g[i] === '1') {
        const px = gx + (i % 5) * c, py = y + Math.floor(i / 5) * c;
        if (pass === 0) { ctx.fillStyle = out; ctx.fillRect(px - 1, py - 1, c + 2, c + 2); } else { ctx.fillStyle = colour; ctx.fillRect(px, py, c, c); }
      }
    }
    gx += 6 * c;
  }
}

let BG = {};
function matchBG(kit) {
  const k = kitGlobals(); if (!k) return null;
  if (BG[kit]) return BG[kit];
  const { SPR, ISO, PAL: P } = k, c = document.createElement('canvas'), sc = ISO.makeScene(c, { internalW: W, internalH: H, scale: 1 }), ctx = sc.ctx;
  ctx.fillStyle = P.sky1; ctx.fillRect(0, 0, W, BAND_TOP);
  ctx.fillStyle = P.grass3; ctx.fillRect(0, BAND_TOP, W, H - BAND_TOP);
  ISO.px(ctx, 0, BAND_TOP, W, BAND_BOT - BAND_TOP, P.stone2);
  for (let y = BAND_TOP + 8; y < BAND_BOT; y += 8) ISO.px(ctx, 0, y, W, 1, P.stone1);
  ISO.px(ctx, 0, BAND_BOT, W, 1, P.outline); ISO.px(ctx, 0, BAND_BOT + 1, W, 2, P.grass3);
  ISO.px(ctx, 0, LOW_TOP, W, LOW_H, P.stone2); ISO.px(ctx, 0, LOW_TOP, W, 1, P.outline);
  for (let r = 0; r < 2; r++) ISO.px(ctx, 0, LOW_TOP + 9 + 8 * r, W, 1, P.stone1);
  sc.setOrigin(G.ox, G.oy);
  ISO.ellipseField(ctx, 6, 6, 0, 0, { radiusX: G.A, radiusY: G.B });
  ISO.tiles(ctx, 5, 2, 2, 8, (i, j) => (j === 0 || j === 7 ? P.pitch2 : P.pitch1));
  const a = G.at(5, 3), b = G.at(7, 3), cc = G.at(5, 9), d = G.at(7, 9);
  ISO.line(ctx, a.x, a.y, b.x, b.y, P.white); ISO.line(ctx, cc.x, cc.y, d.x, d.y, P.white);
  ropePoints(0, Math.PI * 2, 0.02).forEach((p, i) => { if (i % 2 === 0) ISO.px(ctx, p[0], p[1], 1, 1, P.white); });   // the rope, white dots
  SPR.stumps(ctx, G.far.x, G.far.y);
  SPR.player(ctx, G.far.x + 7, G.far.y + 5, { kit: kit === 'A' ? 'B' : 'A', pose: 'bowl', hat: 'cap', facing: 'r', skin: 2, hair: 1 });
  BG[kit] = c; return c;
}

/** The stand-and-oval picture for one frame. o: { kit, fill, t (cheer ms), bob, stumps(x,y), under(ctx), over(ctx), dy } */
function sceneFrame(ctx, o) {
  const k = kitGlobals(), { SPR, ISO, PAL: P } = k, kit = o.kit || 'B', bg = matchBG(kit);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save(); if (o.dy) { ctx.fillStyle = P.sky1; ctx.fillRect(0, 0, W, 1); ctx.translate(0, o.dy); }
  ctx.drawImage(bg, 0, 0);
  const d = o.fill == null ? DEFAULT_FILL : o.fill;
  ROWS.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) if (SEAT_RANK[ri][i] < d) {
      const up = o.bob !== undefined && (i + ri + o.bob) % 2 === 0 ? 1 : 0;
      SPR.crowdRow(ctx, row.x + i * 4, row.y - up, 1, row.seed * 97 + i, o.t);
    }
  });
  SPR.floodlight(ctx, 8, BAND_BOT, { h: 20 }); SPR.floodlight(ctx, W - 8, BAND_BOT, { h: 20 });    // after the crowd, so the poles stay in view
  if (o.stumps) o.stumps(G.stumps.x, G.stumps.y); else SPR.stumps(ctx, G.stumps.x, G.stumps.y);
  SPR.player(ctx, G.bat.x, G.bat.y, { kit, pose: 'bat', hat: 'cap', facing: 'r', skin: 1, hair: 2 });
  if (HOOKS.quirks && HOOKS.drawQuirk) HOOKS.drawQuirk(ctx, G.bat.x, G.bat.y, 'striker');
  if (o.over) o.over(ctx);
  ctx.restore();
}
function stumpsScatter(ctx, x, y, lean, bails) {
  const { SPR, ISO, PAL: P } = kitGlobals(), px = ISO.px;
  SPR.shadow(ctx, x, y, 9);
  [-2, 0, 2].forEach((d, s) => { for (let row = 0; row < 9; row++) { const o = Math.round(lean[s] * (9 - row) / 9); px(ctx, x + d + o - 1, y - row - 1, 3, 1, P.outline); } });
  [-2, 0, 2].forEach((d, s) => { for (let row = 0; row < 8; row++) { const o = Math.round(lean[s] * (9 - row) / 9); px(ctx, x + d + o, y - row - 1, 1, 1, P.cream); } });
  bails.forEach((b) => { px(ctx, b[0] - 1, b[1] - 1, 5, 3, P.outline); px(ctx, b[0], b[1], 3, 1, P.wood); });
}
function trophyCanvas() {
  const { PAL: P } = kitGlobals(), c = document.createElement('canvas'); c.width = 17; c.height = 16; const g = c.getContext('2d');
  const B = (x, y, w, h, col) => { g.fillStyle = P.outline; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = col; g.fillRect(x, y, w, h); };
  B(1, 2, 3, 4, P.gold); B(13, 2, 3, 4, P.gold); g.fillStyle = P.outline; g.fillRect(2, 3, 1, 2); g.fillRect(14, 3, 1, 2);
  B(4, 1, 9, 7, P.gold); g.fillStyle = P.roof1; g.fillRect(10, 1, 3, 7); g.fillStyle = P.white; g.fillRect(5, 2, 1, 3);
  B(6, 9, 5, 1, P.gold); B(7, 10, 3, 1, P.gold); B(5, 12, 7, 3, P.wood); g.fillStyle = P.gold; g.fillRect(7, 13, 3, 1);
  return c;
}
let TROPHY = null;

/* ---------- stage: a canvas (+ an optional chip) in a host element ---------- */
export function createStage(host, o) {
  const k = kitGlobals(); if (!k || !host) return null;
  o = o || {};
  const wrap = document.createElement('div'); wrap.className = 'bt-stage' + (o.cls ? ' ' + o.cls : '');
  wrap.innerHTML = '<canvas class="bt-cv" aria-hidden="true"></canvas><span class="c-tag bt-chip" aria-hidden="true" hidden></span>';
  host.appendChild(wrap);
  const cv = wrap.querySelector('canvas'), chip = wrap.querySelector('.bt-chip');
  const sc = k.ISO.makeScene(cv, { internalW: W, internalH: H, scale: SC }), ctx = sc.ctx;
  const stage = {
    wrap, cv, ctx, kit: o.kit || 'B', runner: createRunner(),
    setChip(c) { if (!c) { chip.hidden = true; return; } chip.hidden = false; chip.textContent = c.text; chip.className = 'c-tag bt-chip' + (c.kind === 'warn' ? ' c-tag--warn' : c.kind === 'new' ? ' c-tag--new' : ''); },
    rest() { sceneFrame(ctx, { kit: stage.kit }); stage.setChip(null); },
    destroy() { stage.runner.stop(); wrap.remove(); },
  };
  return stage;
}

/* ---------- beat drawers: (stage, k, rm) ---------- */
const DRAW = {
  wicket(st, k, rm) {
    const { SPR, ISO, PAL: P } = kitGlobals(), f = wicketFrame(k, rm), ctx = st.ctx;
    sceneFrame(ctx, { kit: st.kit, stumps(x, y) {
      if (!f[1]) SPR.stumps(ctx, x, y); else stumpsScatter(ctx, x, y, f[0], f[1].map((b) => [x + b[0], y + b[1]]));
      if (!rm && k < 3) SPR.ball(ctx, x + 3 + k * 4, y - 4 + k, { shadowY: y + 1 });
      if (!rm && (k === 1 || k === 2)) { ISO.px(ctx, x - 6, y - 1, 2, 1, P.stone1); ISO.px(ctx, x + 5, y - 2, 2, 1, P.stone1); }
    } });
    st.setChip(chipFor('wicket'));
  },
  six(st, k, rm) {
    const { SPR, ISO, PAL: P } = kitGlobals(), ctx = st.ctx, landed = rm || k >= 4;
    // the crowd stands up once when the ball lands (bob 0 = a fixed set of seats 1 px up) and holds; arms stay as drawn
    sceneFrame(ctx, { kit: st.kit, bob: landed ? 0 : undefined, t: landed ? 0 : undefined, over() {
      if (rm || k >= 5) {
        [0.2, 0.4, 0.6, 0.8].forEach((t) => { const q = sixPointAt(t); ISO.px(ctx, q.x - 1, q.y - 1, 4, 4, P.outline); ISO.px(ctx, q.x, q.y, 2, 2, P.white); });
        SPR.ball(ctx, SIX_REST.x, SIX_REST.y);
      } else {
        const q = sixPoint(k);
        [1, 2].forEach((b) => { const o = sixPoint(k - b); if (o) ISO.px(ctx, o.x, o.y, 1, 1, P.white); });
        SPR.ball(ctx, q.x, q.y, q.onGrass ? { shadowY: q.ground } : {});
      }
      bigText(ctx, G.bat.x, G.bat.y - 44, '6', P.gold, 2);   // the number is there from frame 0
    } });
    st.setChip(chipFor('six'));
  },
  four(st, k, rm) {
    const { SPR, ISO, PAL: P } = kitGlobals(), ctx = st.ctx, p = fourPoint(rm ? 4 : k);
    sceneFrame(ctx, { kit: st.kit, over() {
      if (ropeGold(k, rm)) ropePoints(G.ang - 0.5, G.ang + 0.5, 0.004).forEach((q) => { ISO.px(ctx, q[0], q[1], 1, 2, P.gold); });
      SPR.ball(ctx, p.x, p.y - (rm ? 0 : p.hop), { shadowY: p.y + 1 });
      bigText(ctx, p.x, p.y - 26, '4', P.gold, 2);
    } });
    st.setChip(chipFor('four'));
  },
  upgrade(st, k, rm, opts) {
    const { SPR, ISO, PAL: P } = kitGlobals(), ctx = st.ctx, dy = rm || k >= 6 ? 0 : UP_DY[k];
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = P.grass3; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(2, 0, 0, 2, -W / 2, -14); ISO.setOrigin(W / 2, 34);     // home beats are zoomed x2 (whole-number scale)
    ISO.tiles(ctx, 0, 0, 7, 7, P.grass2); ISO.tiles(ctx, 0, 6, 7, 1, P.dirt);
    const lv = (opts && opts.level) || 2, type = (opts && opts.type) || 'gym';
    ctx.setTransform(2, 0, 0, 2, -W / 2, -14 + dy * 2); SPR.building(type, ctx, 2, 2, lv);   // new level is drawn on frame 0; only the draw offset moves
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!rm && k < 6 && SPARK_S[k]) for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 - Math.PI / 2, sx = Math.round(W / 2 + Math.cos(a) * SPARK_R[k] * 2), sy = Math.round(52 + Math.sin(a) * SPARK_R[k] * 1.2), s = SPARK_S[k];
      ISO.px(ctx, sx - 1, sy - 1, s + 2, s + 2, P.outline); ISO.px(ctx, sx, sy, s, s, P.gold);
    }
    if (rm || k < 6) bigText(ctx, W / 2, 10 - (rm ? 0 : 0), 'UP', P.gold, 2);
  },
  win(st, k, rm, opts) { winFrame(st, k, rm, opts); },
  promo(st, k, rm) { stampFrame(st, k, rm); },
  crowd(st, k, rm, opts) {
    const a = crowdFill(opts && opts.from), b = crowdFill(opts && opts.to);
    const d = rm || k >= 8 ? b : a + (b - a) * (k + 1) / 8;
    sceneFrame(st.ctx, { kit: st.kit, fill: d, t: rm || k >= 10 ? undefined : k * 300 });
  },
};
function sixPointAt(t) { const sx = G.bat.x + 4, sy = G.bat.y - 8, ex = 104, ey = G.lowTop + 8, gy = sy + (ey - sy) * t; return { x: lerp(sx, ex, t), y: Math.round(gy - 30 * Math.sin(Math.PI * t) - 6 * (1 - t)) }; }
function winFrame(st, k, rm) {
  const { ISO, PAL: P } = kitGlobals(), ctx = st.ctx, done = rm || k >= 12;
  // the crowd stands once and holds (no repeating bob); confetti falls in held frames
  sceneFrame(ctx, { kit: st.kit, fill: 1, bob: 0, t: 0, over() {
    if (!rm && k < 12) confettiAt(k).forEach((q) => { ISO.px(ctx, q.x - 1, q.y - 1, 4, q.edge ? 3 : 4, P.outline); ISO.px(ctx, q.x, q.y, 2, q.edge ? 1 : 2, P[q.c]); });
  } });
}
/** Trophy stamp: a 20x20 art-px canvas inside the Promoted card. */
function stampFrame(st, k, rm) {
  const { ISO, PAL: P } = kitGlobals(), ctx = st.ctx; if (!TROPHY) TROPHY = trophyCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, STAMP, STAMP);
  const dy = stampDy(k, rm);
  ctx.drawImage(TROPHY, 0, 0, 17, 16, 1, 2 + dy, 17, 16);
  if (!rm && k === 2) [[0, 17], [2, 18], [15, 18], [17, 17]].forEach((o) => ISO.px(ctx, o[0], o[1], 2, 2, P.stone1));
}
/** Play a beat on a stage. Returns nothing; cancel with stage.runner.stop() / stage.destroy(). */
export function playBeat(stage, name, opts) {
  if (!stage || !DRAW[name]) return;
  stage.runner.play(name, (k, rm) => DRAW[name](stage, k, rm, opts), opts && opts.done);
}

/* ---------- over panel hook ---------- */
/** slot: an element inside the over panel. opts: { kit: 'A'|'B' (the batting side's kit) }. Always returns an object (no-ops if the kit is missing). */
export function attachBeats(slot, opts) {
  const st = createStage(slot, { kit: (opts && opts.kit) || 'B' });
  if (!st) return { ball() {}, stop() {}, stage: null };
  st.rest();
  return {
    stage: st,
    /** A ball has landed live (not part of a skip). The picture is reset first, so a chip never stays beside a later ball; a wicket, four or six then plays its short beat (one 400 ms slot, chip and number from frame 0). */
    ball(o) {
      st.runner.stop(); st.rest();
      const name = beatFor(o);
      if (name) playBeat(st, name);
      return name;
    },
    stop() { st.destroy(); },
  };
}

/* ---------- result / end hooks ---------- */
/** Win: a cheering crowd with confetti between the hero and the scores, and the "You" score counting up in 6 ticks. */
export function winBeat(screen, o) {
  o = o || {};
  const hero = screen && screen.querySelector(o.after || '.res-hero');
  if (!hero) return null;
  const host = document.createElement('div'); host.className = 'bt-inline';
  const st = createStage(host, { kit: 'A', cls: 'bt-win' });
  if (!st) return null;
  hero.after(host);
  playBeat(st, 'win');   // the score shows its final value at once
  return st;
}
/** Promotion: a small trophy stamp inside the Promoted card (no overlay, nothing is covered). Reduced motion: the stamped trophy at once. */
export function promoBeat(screen, o) {
  o = o || {};
  const card = screen && screen.querySelector(o.after || '.rn-result');
  if (!card || !kitGlobals()) return null;
  const cv = document.createElement('canvas'); cv.className = 'bt-stamp'; cv.setAttribute('aria-hidden', 'true');
  card.classList.add('has-stamp'); card.appendChild(cv);
  const sc = window.ISO.makeScene(cv, { internalW: STAMP, internalH: STAMP, scale: 2 });
  const st = { ctx: sc.ctx, runner: createRunner() };
  playBeat(st, 'promo');
  return { destroy() { st.runner.stop(); cv.remove(); } };
}
/** Upgrade / Fans: no engine event yet. Kept callable so the economy can wire them: playStandBeat(host, 'crowd', {from, to}). */
export function playStandBeat(host, name, opts) { const st = createStage(host, { kit: 'B' }); if (st) playBeat(st, name, opts); return st; }
/** Paint one frame without timers (QA stills and tests): k = frame, k === steps.length is the rest frame. */
export function drawFrame(stage, name, k, rm, opts) { if (stage && DRAW[name]) DRAW[name](stage, k, !!rm, opts); }
