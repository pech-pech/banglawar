// Windward Line - layout-gate test hook (M10). Sets window.__test per tools/layout-gate/CONTRACT.md s4.
// No timers except requestAnimationFrame. Everything deterministic from the seed.
import { applyAction } from './plan.js';
import { startRun, step, finishRun, queueCallin, runToEnd, hashState } from './sim.js';

const STATES = ['plan-empty', 'plan-built', 'plan-stage2', 'run-early', 'run-mid', 'run-paused',
  'callin-armed', 'result-win', 'result-fail', 'unlock', 'settings-open'];

export function installTestHook(WL) {
  let seedN = 1;
  const raf2 = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
  const S = () => WL.state;

  function closeOverlays() {
    try { WL.ui && WL.ui.hideOverlays && WL.ui.hideOverlays(); } catch (e) { /* ignore */ }
    try { WL.api && WL.api.closeSettings && WL.api.closeSettings(); } catch (e) { /* ignore */ }
    try { WL.setOverlay && WL.setOverlay({ preview: null, armed: null, aim: null, selectBuilding: null }); } catch (e) { /* ignore */ }
  }

  // Fresh state for a stage, straight through WL.newState (works even if the stage is not unlocked).
  function fresh(stage) {
    const r = WL.newState(stage, seedN);
    if (r && typeof r === 'object' && r !== WL.state) { try { WL.state = r; } catch (e) { /* getter only */ } }
    return S();
  }

  function nearestBuildings(state, zone, n) {
    const zx = zone.x + zone.w / 2, zy = zone.y + zone.h / 2;
    return state.map.buildings.slice()
      .map((b) => ({ b, d: Math.hypot(b.x + b.w / 2 - zx, b.y + b.h / 2 - zy) }))
      .sort((a, c) => a.d - c.d || a.b.id - c.b.id)
      .slice(0, n).map((o) => o.b);
  }

  // Fixed bot plan: one shelter over the town road grid, two breaks across the north of town, 2 crews.
  function botPlan(state) {
    const t = state.map.town;
    const zone = { t: 'zone', x: t.x + Math.floor(t.w / 2) - 8, y: t.y + 4, w: 16, h: 14 };
    const by = t.y - 6, half = Math.floor(t.w / 2);
    applyAction(state, zone);
    applyAction(state, { t: 'break', x0: t.x, y0: by, x1: t.x + half - 1, y1: by, width: 2 });
    applyAction(state, { t: 'break', x0: t.x + half, y0: by, x1: t.x + t.w - 1, y1: by, width: 2 });
    for (const b of nearestBuildings(state, zone, 2)) applyAction(state, { t: 'crew', buildingId: b.id });
  }

  function refresh(state) {
    try { WL.render && WL.render(); } catch (e) { /* ignore */ }
    try { WL.ui && WL.ui.update && WL.ui.update(state); } catch (e) { /* ignore */ }
  }

  function stepN(state, n) { for (let i = 0; i < n && state.phase === 'run'; i++) step(state); }

  function fireFront(state) {
    const g = state.grid, W = state.map.w;
    let best = -1;
    for (let i = 0; i < g.burn.length; i++) if (g.burn[i] > 0 && (best < 0 || ((i / W) | 0) > ((best / W) | 0))) best = i; // southmost = nearest town
    if (best < 0) return { x: state.map.town.x + state.map.town.w / 2, y: state.map.town.y - 10 };
    return { x: best % W, y: (best / W) | 0 };
  }

  function buildRun(ticks) {
    const s = fresh(1); botPlan(s); startRun(s); stepN(s, ticks); return s;
  }

  function buildResult(win) {
    const stage = win ? 1 : 2;
    const s = fresh(stage);
    if (win) botPlan(s); // fail: idle plan on stage 2
    startRun(s); runToEnd(s, 20000);
    const r = s.result;
    if (win && !(r && r.win)) {
      // admin default fallback: force a representative win so the result sheet is always reachable.
      s.result = { win: true, pct: 62, stars: 1, cause: 'Held: 62% alive', hash: 0, sec: 88 };
      s.phase = 'result';
    } else if (!win && (!r || r.win)) {
      // admin default fallback: force a representative fail.
      s.result = { win: false, pct: 12, stars: 0, cause: 'Wind shift hit west break at 1:04', hash: 0, sec: 104 };
      s.phase = 'result';
    }
    return s;
  }

  async function goto(name) {
    closeOverlays();
    let s;
    switch (name) {
      case 'plan-empty': s = fresh(1); break;
      case 'plan-built': s = fresh(1); botPlan(s); break;
      case 'plan-stage2': s = fresh(2); botPlan(s); break;
      case 'run-early': s = buildRun(40); s.paused = true; break; // integrator: paused so gate frames are exact
      case 'run-mid': s = buildRun(240); s.paused = true; break;
      case 'run-paused': s = buildRun(240); try { WL.api.pause(true); } catch (e) { s.paused = true; } break;
      case 'callin-armed': {
        s = buildRun(40); s.paused = true;
        try { WL.api.armCallin('bomber'); } catch (e) { /* ignore */ }
        const f = fireFront(s);
        WL.setOverlay({ preview: null, armed: 'bomber', aim: { x: f.x, y: f.y }, selectBuilding: null });
        break;
      }
      case 'result-win': s = buildResult(true); break;
      case 'result-fail': s = buildResult(false); break;
      case 'unlock': s = buildResult(true); break;
      case 'settings-open': s = fresh(1); botPlan(s); break;
      default: throw new Error('unknown state: ' + name);
    }
    if (s.phase === 'result') { try { WL.resultShown = true; } catch (e) { /* ignore */ } } // no auto unlock card over result-win
    refresh(s);
    if (name === 'result-win' || name === 'result-fail' || name === 'unlock') {
      try { WL.ui.showResult(s); } catch (e) { /* ignore */ }
    }
    if (name === 'unlock') { try { WL.ui.showUnlock('Call it in during a run to cut a fuel neck. Lands 10 s after you aim.'); } catch (e) { /* ignore */ } }
    if (name === 'settings-open') { try { WL.api.openSettings(); } catch (e) { /* ignore */ } }
    await raf2();
  }

  window.__test = {
    ready: raf2(),
    states: () => STATES.slice(),
    goto,
    seed(n) { seedN = (n | 0) || 1; },
    hash: () => hashState(WL.state),
  };
  return window.__test;
}
