// Windward Line - render.js (SHELL). Look A + smooth motion. Thin shell: owns the canvas, builds the reused frame context f, calls the layers.
// Layers (js/r/*.js) keep their own state on r.terrain / r.built / r.fire / r.people / r.callins / r.hud.
import { MAP_W, MAP_H, CELL_PX, windVec, fmtTime } from './contract.js'; // fmtTime kept for parity with look A imports
import { BG } from './r/util.js';
import { initTerrain, drawTerrain } from './r/terrain.js';
import { initBuilt, drawBuilt } from './r/built.js';
import { initFire, drawFire, drawEmbers } from './r/fire.js';
import { initPeople, drawPeople } from './r/people.js';
import { initCallins, drawCallins } from './r/callins.js';
import { initHud, drawHud } from './r/hud.js';

// result mark: state.firstBreach {x,y,tick,kind}, else the first 'first-loss' event. Shared with ui.js (See on map).
export function resultMark(state) {
  if (!state || state.phase !== 'result') return null;
  const fb = state.firstBreach;
  if (fb && fb.x != null) return { x: fb.x, y: fb.y, tick: fb.tick, label: 'first breach' };
  const fl = (state.events || []).find((e) => e.kind === 'first-loss');
  return fl && fl.x != null ? { x: fl.x, y: fl.y, tick: fl.tick, label: 'first loss' } : null;
}

export function initRender(canvas) {
  const r = {
    canvas, ctx: canvas.getContext('2d'), dpr: 1, w: 0, h: 0, lastMs: 0,
    dbg: { maxJump: 0, fireMaxDelta: 0, fireCells: 0, snaps: 0 },
    // shell frame tracking
    _state: null, _stage: undefined, _phase: '', _tick: -1, _prevNow: 0, _time: 0,
    // reused frame context (one object, mutated per draw)
    f: null,
  };
  const wv = { x: 0, y: 0 };
  const f = {
    r, ctx: r.ctx, state: null, view: null, overlay: null, g: null, cfg: null,
    S: 1, ox: 0, oy: 0, vw: 0, vh: 0, MW: 0, MH: 0,
    sx: null, sy: null,
    tick: 0, alpha: 0, now: 0, dt: 0, time: 0,
    run: false, paused: false, result: false, calm: false,
    tickChanged: false, reset: false, wv,
  };
  f.sx = (x) => x * f.S - f.ox; // closures read the live f: no per-frame allocation
  f.sy = (y) => y * f.S - f.oy;
  r.f = f;
  initTerrain(r); initBuilt(r); initFire(r); initPeople(r); initCallins(r); initHud(r);
  return r;
}

export function screenToCell(view, px, py) {
  const s = CELL_PX * view.scale;
  return { x: (px + view.ox) / s, y: (py + view.oy) / s };
}

export function fitView(viewW, viewH) {
  // admin default: fill the free height. Scale = full map width visible; if the map is then shorter than the view,
  // grow to fill the height (crops a little width, pan for the rest). Bottom-anchored when taller so the town (south) is in view; pan up for the rest.
  const scale = Math.max(viewW / (MAP_W * CELL_PX), viewH / (MAP_H * CELL_PX));
  const mw = MAP_W * CELL_PX * scale, mh = MAP_H * CELL_PX * scale;
  return { scale, ox: -(viewW - mw) / 2, oy: mh <= viewH ? -(viewH - mh) / 2 : mh - viewH };
}

function resize(r) {
  const c = r.canvas, dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1); // single dpr owner (main.js does not touch the backing store)
  const w = c.clientWidth || c.width / dpr || 300, h = c.clientHeight || c.height / dpr || 300;
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  r.dpr = dpr; r.w = w; r.h = h;
}

export function draw(r, state, view, overlay) {
  const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
  resize(r);
  const ctx = r.ctx, dpr = r.dpr, vw = r.w, vh = r.h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, vw, vh);
  if (!state || !state.grid) return;
  overlay = overlay || {};
  const f = r.f, now = t0;

  const dt = r._prevNow ? Math.min(0.05, Math.max(0, (now - r._prevNow) / 1000)) : 0;
  r._prevNow = now;
  const tick = state.tick | 0, phase = state.phase;
  const run = phase === 'run', paused = !!overlay.paused;
  const stage = state.stage != null ? state.stage : (state.cfg && state.cfg.stage);
  const newState = r._state !== state || r._stage !== stage || r._phase !== phase;
  const back = tick < r._tick;
  const reset = newState || back;
  const tickChanged = reset || tick !== r._tick;
  r._state = state; r._stage = stage; r._phase = phase; r._tick = tick;
  if (run && !paused) r._time += dt;

  r.bld = (state.map && state.map.buildings) || state.buildings || []; // hud selection outline (integrator)
  f.state = state; f.view = view; f.overlay = overlay; f.g = state.grid; f.cfg = state.cfg || {};
  const S = CELL_PX * view.scale;
  f.S = S; f.ox = view.ox; f.oy = view.oy; f.vw = vw; f.vh = vh; f.MW = MAP_W * S; f.MH = MAP_H * S;
  f.tick = tick; f.alpha = overlay.alpha || 0; f.now = now; f.dt = dt; f.time = r._time;
  f.run = run; f.paused = paused; f.result = phase === 'result'; f.calm = !!overlay.calm;
  f.tickChanged = tickChanged; f.reset = reset;
  const w = state.wind, wv = f.wv;
  if (w) { wv.x = w.vx; wv.y = w.vy; } else { const d = windVec(0); wv.x = d.x; wv.y = d.y; }

  r.dbg.maxJump = 0; // per-frame values; layers set them, main.js accumulates the running max

  drawTerrain(f);
  drawBuilt(f);
  drawFire(f);
  drawPeople(f);
  drawEmbers(f);
  drawCallins(f);
  drawHud(f);

  r.lastMs = (typeof performance !== 'undefined') ? performance.now() - t0 : 0;
}
