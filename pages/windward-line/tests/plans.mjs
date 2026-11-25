// Bot plan builders for Windward Line tests (M11). Pure; uses CONTRACT API only.
import { MAP_W, MAP_H, STAGES, idx, cx, cy, defaultCfg } from '../js/contract.js';
import { createState, startRun, step, queueCallin } from '../js/sim.js';
import { applyAction } from '../js/plan.js';

export const idlePlan = (state) => [];

export const naivePlan = (state) => {
  const t = state.map.town;
  const w = 12, h = 8; // admin default: small zone, fits budget
  return [{ t: 'zone', x: Math.round(t.x + t.w / 2 - w / 2), y: Math.round(t.y + t.h / 2 - h / 2), w, h }];
};


// skilled (balance-1): one shelter holds at most cfg.zoneCapMax, so a skilled plan spreads boxes just big enough to
// fill that cap across the town (gates on the middle road), puts a hose crew in each (hydrant), then watches with
// bombers on fire nearest the homes and the dozer on the neck at the wind-shift warning (skilledInputs).
export const skilledPlan = (state) => {
  const t = state.map.town, cfg = state.cfg, money = STAGES[state.stage].money;
  let w = cfg.zoneMinSide, h = cfg.zoneMinSide; // smallest near-square box whose area holds zoneCapMax
  while (Math.floor(w * h * cfg.zoneCapPerCell) < cfg.zoneCapMax && w < t.w) { if (w <= h) w++; else h++; }
  h = Math.min(h, t.h);
  const boxCost = (2 * w + 2 * h - 4) * cfg.zoneCostPerCell;
  const n = Math.max(1, Math.min(4, Math.floor(money * 0.95 / boxCost)));
  const midY = t.y + 15; // middle town road row
  const plan = [];
  for (let k = 0; k < n; k++) {
    const zx = Math.round(t.x + t.w * (k + 0.5) / n - w / 2);
    plan.push({ t: 'zone', x: Math.max(1, zx), y: Math.round(midY - h / 2), w, h });
  }
  const zones = plan.slice();
  let left = money - n * boxCost;
  for (const z of zones) {
    const inside = state.map.buildings.filter((b) => b.x >= z.x && b.y >= z.y && b.x + b.w <= z.x + z.w && b.y + b.h <= z.y + z.h);
    const zx = z.x + z.w / 2, zy = z.y + z.h / 2;
    inside.sort((p, q) => Math.hypot(q.x - zx, q.y - zy) - Math.hypot(p.x - zx, p.y - zy) || p.id - q.id); // edge house first
    const b = inside[0], c = b ? cfg.crewBase + cfg.crewPerCell * b.cells.length : Infinity;
    if (c <= left) { plan.push({ t: 'crew', buildingId: b.id }); left -= c; }
  }
  return plan;
};

// Returns a per-tick hook fn(state). Call it every tick during the run.
export const skilledInputs = (state0) => {
  let lastBomb = -1e9, dozed = false;
  return (state) => {
    if (!dozed && state.stage === 2 && state.map.neck && state.map.neck.length &&
        state.events.some((e) => e.kind === 'wind-shift-warn')) {
      const nk = state.map.neck, c = nk[nk.length >> 1];
      const r = queueCallin(state, 'dozer', cx(c), cy(c));
      dozed = true; if (!r.ok) state.__botLog && state.__botLog.push('dozer: ' + r.reason);
    }
    if (state.tick % 4 !== 0 || state.tick - lastBomb < 40) return;
    if (state.callins.bomber.left <= 0) return;
    // bomb the burning cell south of the river closest to any home, if within 14 cells of it
    const g = state.grid.burn, homes = state.map.homes; let best = -1, bd = 1e9;
    for (let i = 0; i < g.length; i++) if (g[i] > 0) {
      const x = cx(i), y = cy(i); if (y < 74) continue;
      for (const hm of homes) { const d = Math.hypot(x - hm.x, y - hm.y); if (d < bd) { bd = d; best = i; } }
    }
    if (best >= 0 && bd <= 14) {
      const r = queueCallin(state, 'bomber', cx(best), cy(best));
      lastBomb = state.tick; if (!r.ok && state.__botLog) state.__botLog.push('bomber: ' + r.reason);
    }
  };
};

// bigbox: one max-size shelter over the town centre, nothing else (the lazy answer QA found).
// Max size = the largest box with the integrator's 23:18 shape that the stage money pays for (clamped to the town).
export const bigboxPlan = (state) => {
  const t = state.map.town, zc = state.cfg.zoneCostPerCell, money = STAGES[state.stage].money;
  let w = 4, h = 4;
  for (let W = 4; W <= t.w; W++) {
    const H = Math.min(t.h, Math.max(4, Math.round(W * 18 / 23)));
    if ((2 * W + 2 * H - 4) * zc <= money) { w = W; h = H; }
  }
  return [{ t: 'zone', x: Math.round(t.x + t.w / 2 - w / 2), y: Math.round(t.y + t.h / 2 - h / 2), w, h }];
};

export const BOTS = {
  idle: { plan: idlePlan },
  bigbox: { plan: bigboxPlan },
  naive: { plan: naivePlan },
  skilled: { plan: skilledPlan, inputs: skilledInputs },
};

// Apply plan with applyAction; rejections collected in returned log.
export function applyPlan(state, actions) {
  const rejected = [];
  for (const a of actions) {
    const r = applyAction(state, a);
    if (!r || !r.ok) rejected.push({ action: a, reason: r && r.reason });
  }
  return rejected;
}

// Full run. Returns {state, result, rejected, ticks, ms}.
export function runBot(botName, stage, seed, cfg = defaultCfg, maxTicks = 20000) {
  const bot = BOTS[botName];
  const state = createState(stage, cfg, seed);
  const rejected = applyPlan(state, bot.plan(state));
  startRun(state);
  const hook = bot.inputs ? bot.inputs(state) : null;
  const t0 = performance.now();
  let n = 0;
  while (state.phase === 'run' && n < maxTicks) { if (hook) hook(state); step(state); n++; }
  const ms = performance.now() - t0;
  return { state, result: state.result, rejected, ticks: n, ms };
}
