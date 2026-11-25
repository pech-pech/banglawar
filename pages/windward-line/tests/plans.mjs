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

const clampX = (x) => Math.max(1, Math.min(MAP_W - 2, x));
const clampY = (y) => Math.max(1, Math.min(MAP_H - 2, y));

export const skilledPlan = (state) => {
  const m = state.map, t = m.town, st = state.stage;
  const money = STAGES[st].money;
  const plan = [];
  // zone: centred on town, scaled to ~40% of money (perimeter x cost)
  const zc = state.cfg.zoneCostPerCell;
  const budget = money * 0.4;
  // square is the most capacity per perimeter cell
  const side = Math.max(8, Math.min(t.w, t.h, Math.floor(budget / (4 * zc))));
  const w = side, h = side;
  const zx = Math.round(t.x + t.w / 2 - w / 2), zy = Math.round(t.y + t.h / 2 - h / 2);
  plan.push({ t: 'zone', x: zx, y: zy, w, h });
  const zcx = zx + w / 2, zcy = zy + h / 2;
  // breaks: north approach (above town) and west approach, width 2; short so they fit the budget
  const mx = Math.round(t.x + t.w / 2), by = clampY(t.y - 5);
  plan.push({ t: 'break', x0: clampX(mx - 14), y0: by, x1: clampX(mx + 14), y1: by, width: 2 });
  const bx = clampX(t.x - 5);
  plan.push({ t: 'break', x0: bx, y0: by, x1: bx, y1: clampY(by + 16), width: 2 });
  if (st === 2) plan.push({ t: 'break', x0: clampX(t.x - 9), y0: by, x1: clampX(t.x - 9), y1: clampY(by + 12), width: 2 });
  // crews on buildings nearest the zone
  const bs = [...m.buildings].sort((a, b) => Math.hypot(a.x - zcx, a.y - zcy) - Math.hypot(b.x - zcx, b.y - zcy));
  const crewN = st === 2 ? 4 : 2; // integrator: fits the budget (was 5/4, last ones rejected for money)
  let pumpB = null;
  if (st === 2) pumpB = bs[0];
  bs.slice(0, crewN).forEach((b) => plan.push({ t: 'crew', buildingId: b.id }));
  if (pumpB) plan.push({ t: 'pump', buildingId: pumpB.id });
  return plan;
};

// Returns a per-tick hook fn(state). Call it every tick during the run.
export const skilledInputs = (state0) => {
  let lastBomb = -1e9, dozed = false;
  return (state) => {
    const cfg = state.cfg;
    if (!dozed && state.stage === 2 && state.map.neck && state.map.neck.length &&
        state.events.some((e) => e.kind === 'wind-shift-warn')) {
      const n = state.map.neck, c = n[n.length >> 1];
      const r = queueCallin(state, 'dozer', cx(c), cy(c));
      dozed = true; if (!r.ok) state.__botLog && state.__botLog.push('dozer: ' + r.reason);
    }
    if (state.tick % 4 !== 0 || state.tick - lastBomb < 40) return;
    if (state.callins.bomber.left <= 0) return;
    const z = state.zones[0];
    const zx = z ? z.x + z.w / 2 : state.map.town.x + state.map.town.w / 2;
    const zy = z ? z.y + z.h / 2 : state.map.town.y + state.map.town.h / 2;
    const g = state.grid.burn; let best = -1, bd = 1e9;
    for (let i = 0; i < g.length; i++) if (g[i] > 0) {
      const d = Math.hypot(cx(i) - zx, cy(i) - zy); if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd <= 25) {
      const r = queueCallin(state, 'bomber', cx(best), cy(best));
      lastBomb = state.tick; if (!r.ok && state.__botLog) state.__botLog.push('bomber: ' + r.reason);
    }
  };
};

export const BOTS = {
  idle: { plan: idlePlan },
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
