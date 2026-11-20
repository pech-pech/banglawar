// verify.js: endless-mode room verifier. Thin adapter over src/test (shaft-check search, window-probe routes, jitter-bot noise).
// verifyRoom(room, {tier, seeds=200, budgetMs, maxInputs=5 (<=8; >5 sets MAXDEPTH, beam width 120, search deadline 120 s)}) -> {solvable, inputs, minWindowTicks, windowOk, jitterClear(0-1), jitterOk, features[], ms}
// verifyRoom.fast(room, {tier}) = seeds 20, fewer route candidates. budgetMs is soft: checked between stages and inside the
// jitter loop (the beam search itself is synchronous and not interruptible); on overrun result.timedOut = true.
const path = require('path');
const T = path.join(__dirname, '..', '..', 'src', 'test');
const wp = require(path.join(T, 'window-probe.js')); // sets PROBE, loads core/rooms/tpl via shaft-check
const jb = require(path.join(T, 'jitter-bot.js'));
const { PL, bestRoute, BANDS } = wp;
const JITTER_BAR = { 1: 0.60, 2: 0.45, 3: 0.35 };

function attempt(room, log, rng, jMs) {
  const r = PL.replay(room, jb.noisy(log, rng, jMs, 0.03));
  return r.state.won && !r.state.dead;
}

function verifyRoom(room, { tier = 1, seeds = 200, budgetMs = Infinity, jitterMs = 40, maxCand, maxInputs = 5, searchMs = 120000 } = {}) {
  const t0 = Date.now(), over = () => Date.now() - t0 > budgetMs;
  const out = { solvable: false, inputs: null, minWindowTicks: 0, windowOk: false, jitterClear: 0, jitterOk: false, features: [], ms: 0 };
  out.features = jb.featureIssues(room);
  let b = null;
  const oldD = process.env.MAXDEPTH, oldW = process.env.BEAMW;
  const mi = Math.max(1, Math.min(8, maxInputs | 0));
  if (mi > 5) { process.env.MAXDEPTH = String(mi); process.env.BEAMW = process.env.BEAMW || '120'; wp.search.deadline = Date.now() + Math.min(searchMs, isFinite(budgetMs) ? budgetMs : searchMs); wp.search.timedOut = false; }
  try { b = bestRoute(room, maxCand ? { maxCand } : undefined); } catch (e) { out.error = String(e && e.message || e); }
  finally { wp.search.deadline = 0; if (oldD === undefined) delete process.env.MAXDEPTH; else process.env.MAXDEPTH = oldD; if (oldW === undefined) delete process.env.BEAMW; else process.env.BEAMW = oldW; }
  if (wp.search.timedOut) out.timedOut = true;
  if (b) {
    out.solvable = true; out.inputs = b.n; out.minWindowTicks = b.min;
    out.windowOk = b.min >= (BANDS[tier] ?? 12);
    // same noise model as jitter-bot "plan" run (+-40 ms, 3% wrong key), fixed rng seeds => deterministic
    let clear = 0, n = 0;
    for (let k = 0; k < seeds; k++) {
      if (over()) { out.timedOut = true; break; }
      n++;
      if (attempt(room, b.log, PL.mulberry32(k * 104729 + 7), jitterMs)) clear++;
    }
    out.jitterClear = n ? clear / n : 0;
    out.jitterOk = n > 0 && out.jitterClear >= (JITTER_BAR[tier] ?? 0.6);
    out.route = wp.fmt(b.log);
  }
  if (over()) out.timedOut = true;
  out.ms = Date.now() - t0;
  return out;
}
verifyRoom.fast = (room, o = {}) => verifyRoom(room, { ...o, seeds: 20, maxCand: 6 });
module.exports = { verifyRoom, JITTER_BAR, PL };
