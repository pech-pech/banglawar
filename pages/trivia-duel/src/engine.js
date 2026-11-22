var TD = (typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (global.TD = global.TD || {}));
(function () {
  TD.BUILD = 'td-proto-2b';
  TD.DEFAULTS = {
    timerSec: 15, basePts: 60, speedPts: 20,
    readCps: 18, readBaseSec: 1.0,
    graceOn: 1,
    q7Hard: 1,
    wagerMissCost: 50,
    wagerMult: 2,
    rivalWagers: 0,
    rivalStep: 1,
    acc1: 0.72, acc2: 0.73, acc3: 0.74, acc4: 0.80, acc5: 0.85,
    time1: 6.2, time2: 6.2, time3: 6.3, time4: 5.5, time5: 4.5,
    tierAccE: 0.10, tierAccH: -0.15,
    rivalTimeSpread: 1.5,
    rivalReadFloor: 1,
    pickedPerDuel: 4,
    xpWin: 30, xpLoss: 15, xpDraw: 20, xpPerLevel: 100
  };
  TD.RIVALS = [
    { step: 1, name: 'Neville Longbottom', look: { hair: '#5a3b22', hairStyle: 'short', face: 'round', glasses: 0, freckles: 0, hat: 0, robe: '#2b2b33' } },
    { step: 2, name: 'Ron Weasley', look: { hair: '#c4511f', hairStyle: 'short', face: 'long', glasses: 0, freckles: 1, hat: 0, robe: '#2b2b33' } },
    { step: 3, name: 'Ginny Weasley', look: { hair: '#c4511f', hairStyle: 'long', face: 'oval', glasses: 0, freckles: 1, hat: 0, robe: '#2b2b33' } },
    { step: 4, name: 'Hermione Granger', look: { hair: '#6b4426', hairStyle: 'bushy', face: 'oval', glasses: 0, freckles: 0, hat: 0, robe: '#2b2b33' } },
    { step: 5, name: 'Professor McGonagall', look: { hair: '#1c1c1c', hairStyle: 'bun', face: 'long', glasses: 'square', freckles: 0, hat: 'pointed', robe: '#1f4a2e' } }
  ];
  TD.TOPICS = [{ id: 'spells', label: 'Spells' }, { id: 'creatures', label: 'Creatures' }, { id: 'places', label: 'Places' }];

  var engine = {};

  engine.rng = function (seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  engine.readTime = function (q, cfg) {
    var n = q.q.length;
    for (var i = 0; i < q.a.length; i++) n += q.a[i].length;
    return cfg.readBaseSec + n / cfg.readCps;
  };

  engine.pool = function (questions, o) {
    o = o || {};
    var up = o.readUpTo == null ? 7 : o.readUpTo;
    return questions.filter(function (q) {
      if (o.mode === 'movie' && !q.filmKnown) return false;
      return q.book <= up;
    });
  };

  engine.newMemory = function () { return { seen: {}, missed: {} }; };

  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function pickOne(list, rnd) { return list[Math.floor(rnd() * list.length)]; }

  engine.drawQuestion = function (pool, topic, tier, memory, rnd, excludeIds) {
    var ex = excludeIds || new Set();
    var avail = pool.filter(function (q) { return !ex.has(q.id); });
    if (!avail.length) return null;
    var cands = avail.filter(function (q) { return q.topic === topic; });
    var unseen = cands.filter(function (q) { return !memory.seen[q.id]; });
    var set;
    if (cands.length && !unseen.length) {
      pool.forEach(function (q) { if (q.topic === topic) delete memory.seen[q.id]; });
      var missed = cands.filter(function (q) { return memory.missed[q.id]; });
      var mt = missed.filter(function (q) { return q.tier === tier; });
      var ct = cands.filter(function (q) { return q.tier === tier; });
      set = mt.length ? mt : missed.length ? missed : ct.length ? ct : cands;
      return pickOne(set, rnd);
    }
    if (cands.length) {
      var t = unseen.filter(function (q) { return q.tier === tier; });
      return pickOne(t.length ? t : unseen, rnd);
    }
    var other = avail;
    var ou = other.filter(function (q) { return !memory.seen[q.id]; });
    var base = ou.length ? ou : other;
    var bt = base.filter(function (q) { return q.tier === tier; });
    return pickOne(bt.length ? bt : base, rnd);
  };

  engine.planDuel = function (pool, pickedTopic, memory, rnd, cfg) {
    var tiers = shuffle(['e', 'e', 'm', 'm', 'm', 'h'], rnd);
    var others = TD.TOPICS.map(function (t) { return t.id; }).filter(function (id) { return id !== pickedTopic; });
    var np = Math.max(0, Math.min(6, cfg.pickedPerDuel));
    var topics = [], i;
    for (i = 0; i < np; i++) topics.push(pickedTopic);
    for (i = 0; i < 6 - np; i++) topics.push(others[i % others.length]);
    shuffle(topics, rnd);
    var ex = new Set(), out = [];
    for (i = 0; i < 6; i++) {
      var q = engine.drawQuestion(pool, topics[i], tiers[i], memory, rnd, ex);
      if (q) { out.push(q); ex.add(q.id); }
    }
    return out;
  };

  engine.drawQ7 = function (pool, wagerTopic, memory, rnd, cfg, excludeIds) {
    return engine.drawQuestion(pool, wagerTopic, cfg.q7Hard ? 'h' : 'm', memory, rnd, excludeIds);
  };

  engine.shuffleAnswers = function (q, rnd) {
    var order = shuffle([0, 1, 2, 3], rnd);
    return { order: order, correctPos: order.indexOf(0) };
  };

  engine.scoreAnswer = function (correct, tSec, q, cfg, mult, isQ7) {
    if (!correct) return (isQ7 && mult > 1) ? -cfg.wagerMissCost : 0;
    var g = cfg.graceOn ? Math.min(engine.readTime(q, cfg), cfg.timerSec - 1) : 0;
    var f = 1 - (tSec - g) / (cfg.timerSec - g);
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    return Math.round((cfg.basePts + cfg.speedPts * f) * mult);
  };

  engine.rivalAnswer = function (q, cfg, rnd) {
    var r1 = rnd(), r2 = rnd();
    var s = cfg.rivalStep;
    var acc = cfg['acc' + s] + (q.tier === 'e' ? cfg.tierAccE : q.tier === 'h' ? cfg.tierAccH : 0);
    acc = Math.max(0.05, Math.min(0.98, acc));
    var correct = r1 < acc;
    var t = cfg['time' + s] + (r2 * 2 - 1) * cfg.rivalTimeSpread;
    if (cfg.rivalReadFloor) t = Math.max(t, engine.readTime(q, cfg));
    if (t >= cfg.timerSec) { correct = false; t = cfg.timerSec; }
    return { correct: correct, tSec: t };
  };

  engine.rivalWager = function (playerScore, rivalScore, cfg) {
    return (cfg.rivalWagers && rivalScore < playerScore) ? cfg.wagerMult : 1;
  };

  engine.applyScore = function (total, pts) { return Math.max(0, total + pts); };

  engine.result = function (p, r) { return p > r ? 'win' : p < r ? 'loss' : 'draw'; };

  engine.xpFor = function (res, cfg) {
    return res === 'win' ? cfg.xpWin : res === 'loss' ? cfg.xpLoss : cfg.xpDraw;
  };
  engine.levelOf = function (xp, cfg) { return 1 + Math.floor(xp / cfg.xpPerLevel); };

  engine.markAnswered = function (memory, q, correct) {
    memory.seen[q.id] = true;
    if (correct) delete memory.missed[q.id]; else memory.missed[q.id] = true;
  };

  engine.simDuel = function (opts) {
    var cfg = opts.cfg || TD.DEFAULTS;
    var seed = opts.seed | 0;
    var rnd = engine.rng(seed);
    var prnd = engine.rng(seed ^ 0x9e3779b9);
    var memory = opts.memory || engine.newMemory();
    var pl = opts.player || { acc: 0.7, tSec: 6, tSpread: 2, wager: 'x1' };
    var pool = engine.pool(opts.questions, { mode: opts.mode, readUpTo: opts.readUpTo });
    var topic = opts.pickedTopic;
    var plan = engine.planDuel(pool, topic, memory, rnd, cfg);
    var ex = new Set(plan.map(function (q) { return q.id; }));
    var pScore = 0, rScore = 0, pRight = 0, log = [], ids = [];
    var n = plan.length;
    for (var i = 0; i <= n; i++) {
      var isQ7 = i === n, q;
      if (isQ7) {
        q = engine.drawQ7(pool, topic, memory, rnd, cfg, ex);
        if (!q) break;
        ex.add(q.id);
      } else q = plan[i];
      engine.shuffleAnswers(q, rnd);
      var ra = engine.rivalAnswer(q, cfg, rnd);
      var c1 = prnd(), c2 = prnd();
      var pOk = c1 < pl.acc;
      var pT = pl.tSec + (c2 * 2 - 1) * pl.tSpread;
      pT = Math.max(0.5, pT);
      if (pT >= cfg.timerSec) { pOk = false; pT = cfg.timerSec; }
      var pM = 1, rM = 1;
      if (isQ7) {
        var w = pl.wager;
        if (w === 'x2' || (w === 'smart' && pScore <= rScore)) pM = cfg.wagerMult;
        rM = engine.rivalWager(pScore, rScore, cfg);
      }
      var pPts = engine.scoreAnswer(pOk, pT, q, cfg, pM, isQ7);
      var rPts = engine.scoreAnswer(ra.correct, ra.tSec, q, cfg, rM, isQ7);
      pScore = engine.applyScore(pScore, pPts);
      rScore = engine.applyScore(rScore, rPts);
      if (pOk) pRight++;
      engine.markAnswered(memory, q, pOk);
      ids.push(q.id);
      log.push({ n: i + 1, id: q.id, tier: q.tier, topic: q.topic, pRight: pOk, pT: pT, pPts: pPts,
        rRight: ra.correct, rT: ra.tSec, rPts: rPts, pMult: pM, rMult: rM });
    }
    return { pScore: pScore, rScore: rScore, result: engine.result(pScore, rScore), pRight: pRight, log: log, ids: ids };
  };

  TD.engine = engine;
  if (typeof module !== 'undefined') module.exports = engine;
})();
