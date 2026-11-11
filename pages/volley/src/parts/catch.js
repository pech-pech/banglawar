(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// V.Catch: the Supply Drop catch room (pick 46, R50-R54, supply-drop-minigame/SPEC.md). Agent K.
// Pure deterministic logic: no DOM, no wall clock, no Math.random, no S.rng use (the fight stream is untouched). State lives in S.mini.
//   V.Catch.start(S, rng)         begin the room (sim.js loadStage calls it). rng = a V.Rng used only for the mini seed.
//   V.Catch.step(S, inp, dt)      one fixed step (R53: sim time; main.js feeds all real elapsed time, see V.Catch.feed).
//   V.Catch.tierOf(net)           0 Basic, 1 Good, 2 Great, 3 Perfect (edges 5/6, 12/13, 17/18 of 20).
//   V.Catch.payout(tier, ch, o)   {picks, all, repairPct, credits, schematics} (R50; o.mult = Hard x1.5, R52 point 3).
//   V.Catch.take(S, sel)          grant ONCE (sel = pad ids, or anything else = the saved defaults); returns the grant.
//   V.Catch.skip(S)               Skip (4th play on): Basic, the default pad, no sheet.
//   V.Catch.script(seed, step)    the spawn script (same for a seed); V.Catch.laneX(lane, cols) the R51 lane spread.
//   V.Catch.reach(script, cols)   reach validator (SPEC 4); V.Catch.feed(acc, dtMs) the R53 loop helper; V.Catch.hash(S).
// Events (S.events, k = 'sd:...'): start count catch dud near miss tier end pad payout.
// Every number below that SPEC does not give is a GUESS and marked so.

var STEP = 1 / 60, STEP_MS = 1000 / 60;
var CRATES = 20, ROOM_S = 10, ROWS = 15;
var EDGES = [6, 13, 18];                                // tiers by net count of 20: 30 / 65 / 90 percent (R50)
var TIER_NAMES = ['Basic', 'Good', 'Great', 'Perfect'];
var PICKS = [1, 2, 3, 3], REPAIR_PCT = [0.4, 0.4, 0.4, 0.5], SCHEM = [2, 2, 2, 3], CREDITS = [20, 24, 28];
var REPAIR_OFF = 0.05, REPAIR_PRE = 0.13;                // greyed under 5 percent missing; preselected above 13 percent missing (R50)
var Y0 = 1.5, Y1 = 10.5, HY_MIN = 3.5, HY_MAX = 10.5;    // crate fall row centres (row 1 to row 10); hero rows 3 to 10 (SPEC 4)
var CATCH_R = 0.9, DUD_R = 0.8;                          // 0.9 from SPEC; the dud radius is a guess
var SLOW_MULT = 0.5, SLOW_T = 0.7, GOLD_FALL = 0.8;      // dud: half speed 0.7 s; gold falls 25 percent faster (time x0.8)
var END_T = 0.5, GO_T = 0.2, DUD_FROM = 4.0;
var MARGIN_OPEN = (3.5 - 0.9 - Y0) / (Y1 - Y0);          // fraction of the fall after which the topmost hero row can touch a crate
var REACH_SLACK = 1.2, REACH_TOL = 0.6;                  // 20 percent slack (SPEC); x tolerance at the catch (guess)
var FEED_CAP_MS = 30000;                                 // safety cap for one frame (guess); a 10 s room never needs more
// difficulty ramp: Supply Drop number 1..5 in the chapter (SPEC 4). `walk` replaces SPEC's "pair gap 3,3,3,4,4" (see the bot note below): how many
// lanes the crate group centre may jump between groups (1,1,1,2,2, guess).
var RAMP = [null, { fall:1.8, duds:2, sway:0, walk:1 }, { fall:1.75, duds:2, sway:0, walk:1 }, { fall:1.7, duds:3, sway:0.2, walk:1 },
  { fall:1.65, duds:3, sway:0.3, walk:2 }, { fall:1.6, duds:3, sway:0.4, walk:2 }];
// Spawn times. SPEC 4 phases 0-2.5 / 2.5-5.5 / 5.5-8.2 with 4 / 8 / 8 crates. DEPARTURE (K, found by the perfect-path bot): SPEC's pairs and groups
// "at once, 3 or more lanes apart" cap a perfect-path bot at about 11 of 20 at every width (the Operator needs about 0.8 s to cross 3 lanes at 15
// columns while a crate falls faster than it walks). So a group is a TRAIL: members on adjacent lanes, STAG = 0.3 s apart (guess). Same 20 crates, same fall time.
var STAG = 0.3, T1 = [0, 0.6, 1.2, 1.8], T2 = [2.5, 3.25, 4.0, 4.75], T3 = [5.5, 6.7, 7.9], N3 = [3, 3, 2];   // last spawn 7.9 + 0.3 = 8.2, lands at 10.0 (fall 1.8)
var GAP_FACTOR = { 9:1, 11:0.8, 13:0.8, 15:0.8 };      // R51 option C fallback (M ruling after the four-width bot): lane gap x0.8 on the added widths; 9 columns is the reference layout and stays 1

function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function colsOf(S){ return (S && (S.cols || (S.room && S.room.w))) || 9; }

// ---------- lane spread (R51) ----------
// Lane k sits at column index k x (C - 1) / 8: lane 4 on the centre column, lanes 0 and 8 on the outer columns. World x = that + 0.5.
function laneX(lane, cols, factor){
  var f = factor == null ? (GAP_FACTOR[cols] == null ? 1 : GAP_FACTOR[cols]) : factor;
  return cols / 2 + (lane - 4) * (cols - 1) / 8 * f;
}

// ---------- tiers and payout (R50) ----------
function tierOf(net){ net = Math.floor(+net || 0); return net >= EDGES[2] ? 3 : (net >= EDGES[1] ? 2 : (net >= EDGES[0] ? 1 : 0)); }
function payout(tier, ch, o){
  tier = clamp(Math.floor(+tier || 0), 0, 3); ch = clamp(Math.floor(+ch || 1), 1, 3);
  var m = (o && o.mult > 0) ? o.mult : 1;
  return { tier:tier, name:TIER_NAMES[tier], picks:PICKS[tier], all:tier >= 2, repairPct:REPAIR_PCT[tier],
    credits:Math.round(CREDITS[ch - 1] * m), schematics:Math.round(SCHEM[tier] * m) };
}
function rampStep(S){
  var st = S.stage || 5, ch = S.chapter || 1;
  var inCh = ((st - 1) % 50);                              // stage inside the chapter
  var idx = Math.max(0, Math.floor((inCh - 4) / 10));      // 0 for stage 5, 4 for stage 45
  if (S.lap > 1 && !S.chapter) idx = Math.min(4, Math.floor((((S.stage - 1) + (S.lap - 1) * (V.chapterLen ? V.chapterLen(S.chNo) : 10)) - 4) / 10));   // the chapter's stage list loops: later laps ramp like later drops
  if (ch >= 2) idx = Math.min(3, idx + 1);                 // Chapter 2 and 3 start at step 2 (SPEC 4)
  return Math.min(5, idx + 1);
}

// ---------- spawn script ----------
function mixSeed(a, b){ var h = (a ^ Math.imul(b + 0x9E3779B9, 2654435761)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; return (h ^ (h >>> 13)) >>> 0; }
function mkRng(seed){ return new V.Rng(seed >>> 0); }
function buildOnce(seed, step, attempt, gapDrop){
  var R = RAMP[step], rng = mkRng(mixSeed(seed, attempt * 131 + 7));
  var fall = R.fall, ws = Math.max(1, R.walk - gapDrop), crates = [], id = 0, i, c = 4;
  function add(t, lane, gold){ crates.push({ id:id++, t0:+t.toFixed(3), lane:lane, gold:!!gold, fall:gold ? fall * GOLD_FALL : fall, kind:gold ? 'gold' : (rng.next() < 0.3 ? 'ration' : 'ammo') }); }
  function group(t, n, goldIdx){
    c = clamp(c + rng.int(2 * ws + 1) - ws, 0, 8);
    var a = clamp(c - Math.floor((n - 1) / 2), 0, 8 - (n - 1)), dir = rng.next() < 0.5 ? 1 : -1;
    for (var q = 0; q < n; q++) add(t + q * STAG, dir > 0 ? a + q : a + n - 1 - q, q === goldIdx);
    c = a + Math.floor((n - 1) / 2);
    return c;
  }
  var g2 = rng.int(T2.length), g3 = rng.int(T3.length), ctr = [];
  for (i = 0; i < T1.length; i++) group(T1[i], 1, -1);
  for (i = 0; i < T2.length; i++) group(T2[i], 2, i === g2 ? 0 : -1);
  for (i = 0; i < T3.length; i++) group(T3[i], N3[i], i === g3 ? 0 : -1);
  // duds: one in phase 2 (from 4 s), the rest in phase 3; never within 2 lanes of a crate that is in the air at the same time (>= 1.5 tiles at every width);
  // among the legal spots the nearest to the action (the crates alive around it) is drawn from, so the Operator can run into it
  var duds = [], dudBad = false, nd = R.duds, wins = [[DUD_FROM, 5.4], [5.6, 8.2], [5.6, 8.2]];
  for (i = 0; i < nd; i++) {
    var w = wins[i], cand = [];
    for (var t = w[0]; t <= w[1] + 1e-9; t += 0.2) {
      if (t + fall > ROOM_S + 1e-9) continue;
      var near = [], c2;
      for (c2 = 0; c2 < crates.length; c2++) if (t < crates[c2].t0 + crates[c2].fall && crates[c2].t0 < t + fall) near.push(crates[c2].lane);
      for (var ln = 0; ln <= 8; ln++) {
        var good = true, dmin = 99;
        for (c2 = 0; c2 < near.length; c2++) { var dd = Math.abs(near[c2] - ln); if (dd < 2) good = false; dmin = Math.min(dmin, dd); }
        for (c2 = 0; good && c2 < duds.length; c2++) if (t < duds[c2].t0 + fall && duds[c2].t0 < t + fall && Math.abs(duds[c2].lane - ln) < 2) good = false;
        if (good) cand.push([t, ln, dmin]);
      }
    }
    if (!cand.length) { cand.push([w[0] + 0.4 * i, 4 + (i % 2 ? 4 : -4), 0]); dudBad = true; }   // no legal spot: this draw is rejected by script() when another draw exists
    cand.sort(function(a, b){ return a[2] - b[2]; });
    var pool = cand.filter(function(x){ return x[2] <= cand[0][2] + 1; }), pk = pool[rng.int(pool.length)];
    duds.push({ id:i, t0:+pk[0].toFixed(2), lane:pk[1], fall:fall });
  }
  return { seed:seed, step:step, fall:fall, sway:R.sway, crates:crates, duds:duds, attempt:attempt, gapDrop:gapDrop, dudBad:dudBad };
}
var scriptCache = {};
// The script is the same every time for a seed and a step. It is authored on the 9-lane grid and checked at 9, 11, 13 and 15 columns;
// a draw that fails the strictest width is redrawn (a wider spacing in the script, never fewer crates or a slower hero: SPEC 4).
function script(seed, step){
  step = clamp(Math.floor(step || 1), 1, 5); seed = seed >>> 0;
  var key = seed + ':' + step + ':' + JSON.stringify(GAP_FACTOR);
  if (scriptCache[key]) return scriptCache[key];
  var best = null, gd, at;
  for (gd = 0; gd <= 1 && !best; gd++) for (at = 0; at < 24; at++) {
    var s = buildOnce(seed, step, at, gd);
    if (!s.dudBad && reach(s, 15).ok && reach(s, 13).ok && reach(s, 11).ok && reach(s, 9).ok) { best = s; break; }
  }
  if (!best) { best = buildOnce(seed, step, 0, 1); best.reachFail = true; }
  best.walk = Math.max(1, RAMP[step].walk - best.gapDrop);
  scriptCache[key] = best;
  var ks = Object.keys(scriptCache); if (ks.length > 400) delete scriptCache[ks[0]];
  return best;
}
// Reach validator (SPEC 4): for any two crates the hero must be able to get from one catch to the other at 4.5 tiles a second with
// 20 percent slack. A crate can be touched from fall fraction MARGIN_OPEN until it lands; the best case is catching the first as early as
// possible and the second as late as possible, either order. x only (the hero can climb while it runs; rows are not checked, guess).
function reach(sc, cols){
  var sp = 4.5 / REACH_SLACK, worst = 1e9, bad = 0, a, b;
  for (a = 0; a < sc.crates.length; a++) for (b = a + 1; b < sc.crates.length; b++) {
    var A = sc.crates[a], B = sc.crates[b], dx = Math.abs(laneX(A.lane, cols) - laneX(B.lane, cols));
    var oa = A.t0 + A.fall * MARGIN_OPEN, ca = A.t0 + A.fall, ob = B.t0 + B.fall * MARGIN_OPEN, cb = B.t0 + B.fall;
    var dt = Math.max(cb - oa, ca - ob), need = Math.max(0, dx - 2 * REACH_TOL) / sp, slack = dt - need;
    if (slack < worst) worst = slack;
    if (slack < 0) bad++;
  }
  return { ok:bad === 0, bad:bad, worst:worst };
}

// Saved fields are used ONLY when the sim was created with the save (S.useMeta, the browser game). Headless runs use S.sdPlays (default 0) and never touch V.Meta.
// ---------- plays and the saved fields (meta.js snippet: V.Meta.sdState / sdOpen / sdTake / settings().sdSkip) ----------
function meta(S){ return S && S.useMeta && V.Meta && V.Meta.sdState && V.Meta.sdOpen && V.Meta.sdTake ? V.Meta : null; }
function plays(S){ var m = meta(S); return m ? (m.sdState().plays | 0) : (S.sdPlays | 0); }
function skipSetting(S){ try { return !!(S && S.useMeta && V.Meta && V.Meta.settings && V.Meta.settings().sdSkip); } catch (e) { return false; } }
function canSkip(S){ return plays(S) >= 3; }              // from the 4th play (R50, R52)

function ev(S, o){ S.events.push(o); return o; }

// ---------- start ----------
function start(S, rng){
  var step = rampStep(S), seed = rng ? (rng.int(4294967296) >>> 0) : mixSeed(S.seed >>> 0, (S.stage || 5) * 17 + (S.lap || 1));
  var cols = colsOf(S), pl = plays(S), dot = pl < 2 ? 0.3 : 0.2;
  var sc = script(seed, step);
  var m = S.mini = { kind:'parachute', phase:'countin', t:0, ct:0, et:0, seed:seed, step:step, cols:cols, script:sc, dotT:dot, dots:0, goT:0, plays:pl,
    crates:[], duds:[], spawnI:0, dudI:0, caught:0, dudHits:0, net:0, slowUntil:0, tier:0, tierMax:0, picks:[], defaults:[], pads:[],
    taken:false, skipped:false, nSteps:0, sheetT:0, startT:S.t, hint:pl < 2, ghost:pl < 2, canSkip:pl >= 3 };
  var h = S.hero; h.x = cols / 2; h.y = HY_MAX; h.ang = -Math.PI / 2; h.moving = false; h.lockId = null; h.lockClear = false; h.burstQ = []; h.delayQ = [];
  S.enemies = []; S.rounds = []; S.shots = []; S.shells = []; S.pickups = []; S.spawnQ = [];
  S.supply = null; S.phase = 'collect';
  ev(S, { k:'sd:start', cols:cols, step:step, seed:seed, plays:pl });
  if (pl >= 3 && skipSetting(S)) skip(S);
  return m;
}

// ---------- step ----------
function crateY(c, t){ return Y0 + (Y1 - Y0) * clamp((t - c.t0) / c.fall, 0, 1); }
function moveHero(S, inp, dt){
  var h = S.hero, m = S.mini, cols = m.cols;
  var mx = inp && +inp.mx || 0, my = inp && +inp.my || 0, len = Math.hypot(mx, my);
  if (len > 1e-6) {
    mx /= len; my /= len;
    var sp = S.tune.MOVE_SPEED * (m.phase === 'play' && m.t < m.slowUntil ? SLOW_MULT : 1);   // 4.5 tiles a second at every width, no stat bonus
    h.x = clamp(h.x + mx * sp * dt, 0.5, cols - 0.5); h.y = clamp(h.y + my * sp * dt, HY_MIN, HY_MAX);
    h.moving = true;
  } else h.moving = false;
  h.ang = -Math.PI / 2; h.braced = false; h.brace01 = 0;
}
function spawnDue(S){
  var m = S.mini, sc = m.script, cols = m.cols, c, d;
  while (m.spawnI < sc.crates.length && sc.crates[m.spawnI].t0 <= m.t + 1e-9) {
    c = sc.crates[m.spawnI++]; m.crates.push({ id:c.id, lane:c.lane, x:laneX(c.lane, cols), t0:c.t0, fall:c.fall, kind:c.kind, gold:c.gold, st:'air', y:Y0, sway:sc.sway, ph:(c.id * 2.399) % 6.283 });
  }
  while (m.dudI < sc.duds.length && sc.duds[m.dudI].t0 <= m.t + 1e-9) {
    d = sc.duds[m.dudI++]; m.duds.push({ id:d.id, lane:d.lane, x:laneX(d.lane, cols), t0:d.t0, fall:d.fall, st:'air', y:Y0 });
  }
}
function updateNet(S){
  var m = S.mini; m.net = Math.max(0, m.caught - m.dudHits);
  var t = tierOf(m.net);
  if (t > m.tierMax) { m.tierMax = t; ev(S, { k:'sd:tier', tier:t, name:TIER_NAMES[t], net:m.net }); }
  m.tier = t;
}
function stepPlay(S, dt){
  var m = S.mini, h = S.hero, i;
  m.t += dt; m.nSteps++;
  spawnDue(S);
  for (i = 0; i < m.crates.length; i++) {
    var c = m.crates[i]; if (c.st !== 'air') continue;
    c.y = crateY(c, m.t);
    var d = Math.hypot(h.x - c.x, h.y - c.y);
    if (d <= CATCH_R) {
      c.st = 'caught'; c.at = m.t; m.caught++; updateNet(S);
      ev(S, { k:'sd:catch', x:c.x, y:c.y, id:c.id, kind:c.kind, caught:m.caught, net:m.net, gold:c.gold });
    } else if (m.t - c.t0 >= c.fall - 1e-9) {
      c.st = 'landed'; c.y = Y1; c.at = m.t;
      ev(S, { k:'sd:miss', x:c.x, y:Y1, id:c.id });
      if (Math.abs(h.x - c.x) < 1.6) ev(S, { k:'sd:near', x:c.x, y:Y1, id:c.id, dx:+(h.x - c.x).toFixed(2) });
    }
  }
  for (i = 0; i < m.duds.length; i++) {
    var u = m.duds[i]; if (u.st !== 'air') continue;
    u.y = crateY(u, m.t);
    if (Math.hypot(h.x - u.x, h.y - u.y) <= DUD_R) {
      u.st = 'hit'; u.at = m.t; m.dudHits++; m.slowUntil = m.t + SLOW_T; updateNet(S);
      ev(S, { k:'sd:dud', x:u.x, y:u.y, id:u.id, net:m.net, dudHits:m.dudHits });
    } else if (m.t - u.t0 >= u.fall - 1e-9) { u.st = 'landed'; u.y = Y1; u.at = m.t; }
  }
  if (m.caught >= CRATES || m.t >= ROOM_S - 1e-9) {
    m.early = m.caught >= CRATES && m.t < ROOM_S - 1e-9;
    if (m.t > ROOM_S) m.t = ROOM_S;
    m.phase = 'end'; m.et = 0;
    for (i = 0; i < m.crates.length; i++) if (m.crates[i].st === 'air') m.crates[i].st = 'faded';
    for (i = 0; i < m.duds.length; i++) if (m.duds[i].st === 'air') m.duds[i].st = 'faded';
    ev(S, { k:'sd:end', net:m.net, caught:m.caught, dudHits:m.dudHits, tier:tierOf(m.net), perfectBeat:m.early });
  }
}
function step(S, inp, dt){
  var m = S.mini; if (!m || S.phase !== 'collect') return;
  dt = dt > 0 ? dt : STEP;
  if (m.phase === 'end') {
    m.et += dt; S.hero.moving = false;
    if (m.et >= END_T - 1e-9) openSheet(S);
    return;
  }
  moveHero(S, inp, dt);
  if (m.phase === 'countin') {
    m.ct += dt;
    var n = Math.min(3, Math.floor(m.ct / m.dotT + 1e-9));
    while (m.dots < n) { m.dots++; ev(S, { k:'sd:count', n:m.dots }); }
    if (m.ct >= 3 * m.dotT - 1e-9) { m.phase = 'play'; m.t = 0; m.goT = GO_T; spawnDue(S); }   // crate 1 spawns at once on GO
  } else if (m.phase === 'play') {
    if (m.goT > 0) m.goT = Math.max(0, m.goT - dt);
    stepPlay(S, dt);
  }
}

// ---------- the sheet: pads, defaults, grant ----------
function missInfo(S){ var h = S.hero, mx = Math.max(1, h.maxHp), miss = Math.max(0, mx - h.hp); return { miss:miss, pct:miss / mx, max:mx }; }
function padsFor(S, tier){
  var ch = S.chapter || 1, pay = payout(tier, ch, { mult:S.hardMult || 1 }), mi = missInfo(S);
  var live = mi.pct >= REPAIR_OFF - 1e-9;
  var heal = Math.min(Math.floor(mi.miss + 1e-9), Math.floor(mi.max * pay.repairPct + 1e-9));
  var pads = [
    { kind:'repair', id:'repair', live:live, heal:live ? heal : 0, pct:Math.round(100 * (live ? heal : 0) / mi.max), full:!live, pctFull:Math.round(pay.repairPct * 100) },
    { kind:'credits', id:'credits', live:true, amount:pay.credits },
    { kind:'schematics', id:'schematics', live:true, n:pay.schematics }
  ];
  var defs;
  if (pay.all) defs = pads.filter(function(p){ return p.live; }).map(function(p){ return p.id; });
  else {
    var order = [];
    if (live && mi.pct > REPAIR_PRE + 1e-9) order.push('repair');
    order.push('credits', 'schematics');
    if (live && order.indexOf('repair') < 0) order.push('repair');
    defs = order.slice(0, pay.picks);
  }
  return { pay:pay, pads:pads, defaults:defs, missPct:mi.pct };
}
function openSheet(S, resumed){
  var m = S.mini, tier = resumed ? resumed.tier : tierOf(m.net);
  var P = padsFor(S, tier);
  m.tier = tier; m.pay = P.pay; m.pads = P.pads; m.defaults = resumed && resumed.defaults ? resumed.defaults.slice() : P.defaults; m.missPctAtOpen = P.missPct;
  m.picks = m.defaults.slice(); m.phase = 'sheet'; m.sheetT = 0;
  S.supply = P.pads; S.phase = 'supply';
  var st = meta(S);
  if (st && !resumed) st.sdOpen({ chapter:S.chapter || 1, stage:S.stage, tier:tier, defaults:m.defaults.slice() });   // saved when the sheet opens (R50)
  return m;
}
// Reopen the sheet from a saved sd.pending (a run restored after a kill): same tier, same defaults, nothing granted yet.
function resume(S, pending){
  if (!S.mini) return false;
  if (!pending || typeof pending.tier !== 'number' || !Array.isArray(pending.defaults)) return false;
  openSheet(S, { tier:clamp(pending.tier | 0, 0, 3), defaults:pending.defaults.filter(function(d){ return d === 'repair' || d === 'credits' || d === 'schematics'; }) });
  return true;
}
function selection(S, sel){
  var m = S.mini, pay = m.pay, ids = [];
  if (pay.all) return m.pads.filter(function(p){ return p.live; }).map(function(p){ return p.id; });
  if (!Array.isArray(sel)) return m.defaults.slice();
  sel.forEach(function(x){
    var id = typeof x === 'number' ? (m.pads[x] && m.pads[x].id) : x;
    var p = m.pads.filter(function(q){ return q.id === id; })[0];
    if (p && p.live && ids.indexOf(id) < 0) ids.push(id);
  });
  return ids.slice(0, pay.picks);
}
// Rewards are granted ONCE, here, on Take. A second call returns the first grant and changes nothing.
function take(S, sel){
  var m = S.mini; if (!m) return null;
  if (m.taken) return m.grant;
  if (m.phase !== 'sheet' && !m.skipped) return null;
  var ids = selection(S, sel), g = { tier:m.tier, picks:ids.slice(), repairHp:0, credits:0, schematics:0, repairPct:0 }, h = S.hero;
  var pay = m.pay, k;
  if (ids.indexOf('repair') >= 0) { var rp = m.pads[0]; var before = h.hp; h.hp = Math.min(h.maxHp, h.hp + rp.heal); g.repairHp = Math.round(h.hp - before); g.repairPct = pay.repairPct; }
  if (ids.indexOf('credits') >= 0) { g.credits = pay.credits; S.credits += pay.credits; }
  if (ids.indexOf('schematics') >= 0) { g.schematics = pay.schematics; S.schematics = (S.schematics | 0) + pay.schematics; }
  m.taken = true; m.grant = g; m.picks = ids.slice(); m.phase = 'done';
  var st = meta(S);
  if (st) st.sdTake({ schematics:g.schematics, chapter:S.chapter || 1, stage:S.stage }); else S.sdPlays = (S.sdPlays | 0) + 1;
  ev(S, { k:'sd:payout', tier:m.tier, picks:ids.slice(), repairPct:g.repairPct, credits:g.credits, schematics:g.schematics });
  (S.stats.sd = S.stats.sd || []).push({ stage:S.stage, chapter:S.chapter || 1, caught:m.caught, net:m.net, dudsHit:m.dudHits, tier:m.tier, tierName:TIER_NAMES[m.tier],
    padsOffered:m.pads.filter(function(p){ return p.live; }).map(function(p){ return p.id; }), padsTaken:ids.slice(), repairHp:g.repairHp, credits:g.credits, schematics:g.schematics,
    plays:m.plays + 1, roomSeconds:+(S.t - m.startT).toFixed(2), cols:m.cols, skipped:!!m.skipped, early:!!m.early });
  return g;
}
// Skip (the chip or Settings "Supply Drop game: Skip"): no sheet; the default pad (one pad, Basic) is granted at once.
function skip(S){
  var m = S.mini; if (!m || m.taken || !canSkip(S) || (m.phase !== 'countin' && m.phase !== 'play')) return null;
  m.skipped = true; m.tier = 0; m.net = 0; m.caught = 0; m.dudHits = 0;
  var P = padsFor(S, 0); m.pay = P.pay; m.pads = P.pads; m.defaults = P.defaults; m.crates = []; m.duds = [];
  return take(S, null);
}

// ---------- R53 loop helper ----------
// main.js: acc is real milliseconds not yet turned into steps. All of it is fed (no per-frame cap), so a slow frame loses no sim seconds.
function feed(acc, dtMs){
  acc += clamp(+dtMs || 0, 0, FEED_CAP_MS);
  var n = Math.floor(acc / STEP_MS + 1e-9);
  return { n:n, acc:acc - n * STEP_MS };
}

// ---------- hash (R53: a seeded hash pins the catch room on its own) ----------
function hash(S){
  var m = S.mini, h = 2166136261 >>> 0;
  function mix(v){ var s = String(v); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 124; h = Math.imul(h, 16777619) >>> 0; }
  if (!m) return '00000000';
  mix(S.frame); mix(S.phase); mix(m.phase); mix(m.nSteps); mix(m.t.toFixed(4)); mix(m.seed); mix(m.cols); mix(m.caught); mix(m.dudHits); mix(m.net); mix(m.tier);
  mix(S.hero.x.toFixed(5)); mix(S.hero.y.toFixed(5)); mix(S.hero.hp); mix(S.credits); mix(S.schematics | 0);
  m.crates.forEach(function(c){ mix(c.id); mix(c.st); mix(c.x.toFixed(4)); });
  m.duds.forEach(function(d){ mix(d.id); mix(d.st); });
  return ('00000000' + h.toString(16)).slice(-8);
}

V.Catch = { start:start, step:step, tierOf:tierOf, payout:payout, take:take, skip:skip, resume:resume, openSheet:openSheet, script:script, reach:reach, laneX:laneX, feed:feed, hash:hash,
  canSkip:canSkip, plays:plays, rampStep:rampStep, padsFor:padsFor, crateY:crateY,
  GAP_FACTOR:GAP_FACTOR, RAMP:RAMP, TIER_NAMES:TIER_NAMES, EDGES:EDGES, CRATES:CRATES, ROOM_S:ROOM_S, STEP_MS:STEP_MS,
  C:{ Y0:Y0, Y1:Y1, HY_MIN:HY_MIN, HY_MAX:HY_MAX, CATCH_R:CATCH_R, DUD_R:DUD_R, SLOW_T:SLOW_T, SLOW_MULT:SLOW_MULT, END_T:END_T, GO_T:GO_T, MARGIN_OPEN:MARGIN_OPEN } };
})();
