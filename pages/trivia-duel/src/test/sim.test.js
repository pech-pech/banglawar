'use strict';
// node sim.test.js  -- hard checks exit 1; tuning table never fails.
global.TD = global.TD || {};
require('../q-spells.js'); require('../q-creatures.js'); require('../q-places.js'); require('../engine.js');
var TD = global.TD, E = TD.engine, Q = TD.QUESTIONS;
var TOPICS = ['spells', 'creatures', 'places'];
var byId = {}; Q.forEach(function (q) { byId[q.id] = q; });
var fails = [];
function check(ok, msg) { if (!ok) { fails.push(msg); if (fails.length <= 25) console.log('FAIL: ' + msg); } }
function cfgWith(o) { return Object.assign({}, TD.DEFAULTS, o || {}); }
function player(o) { return Object.assign({ acc: 0.7, tSec: 6, tSpread: 1.5, wager: 'smart' }, o || {}); }
function sim(seed, topic, mem, pl, cfg, mode, up) {
  return E.simDuel({ questions: Q, cfg: cfg, seed: seed, mode: mode || 'book', readUpTo: up || 7,
    pickedTopic: topic, memory: mem, player: pl });
}

// ---- pool sizes
console.log('Pool sizes (mode/readUpTo: spells creatures places):');
['movie', 'book'].forEach(function (m) {
  for (var u = 1; u <= 7; u++) {
    var p = E.pool(Q, { mode: m, readUpTo: u });
    console.log('  ' + m + ' up' + u + ': ' + TOPICS.map(function (t) { return p.filter(function (q) { return q.topic === t; }).length; }).join(' '));
  }
});

// ---- hard checks
var CAREERS = 20, DUELS = 20; // 400 duels
var cfg0 = cfgWith();
// (a)(b)
var aBad = 0, bBad = 0;
for (var s = 1; s <= 400; s++) {
  var t = TOPICS[s % 3];
  var r1 = sim(s, t, E.newMemory(), player(), cfg0), r2 = sim(s, t, E.newMemory(), player(), cfg0);
  if (JSON.stringify(r1) !== JSON.stringify(r2)) aBad++;
  var r3 = sim(s, t, E.newMemory(), player({ acc: 0.3, tSec: 11, wager: 'x1' }), cfg0);
  var l1 = r1.log, l3 = r3.log, same = l1.length === l3.length;
  for (var i = 0; same && i < l1.length; i++) if (l1[i].rRight !== l3[i].rRight || l1[i].rT !== l3[i].rT) same = false;
  if (!same) bBad++;
}
check(aBad === 0, '(a) determinism: ' + aBad + '/400 seeds differ');
check(bBad === 0, '(b) rival independent of player: ' + bBad + '/400 seeds differ');

// (c)(d)(e)(f)
var minGap = Infinity, dupBad = 0, negBad = 0, thrown = 0, gapBad = 0, filmBad = 0, bookBad = 0;
for (var c = 0; c < CAREERS; c++) {
  var topic = TOPICS[c % 3], mem = E.newMemory(), last = {};
  for (var d = 0; d < DUELS; d++) {
    var poolT = E.pool(Q, { mode: 'book', readUpTo: 7 }).filter(function (q) { return q.topic === topic; });
    var unseen = poolT.filter(function (q) { return !mem.seen[q.id]; }).length;
    var res;
    try { res = sim(10000 + c * 1000 + d, topic, mem, player(), cfg0); } catch (e) { thrown++; continue; }
    var ids = res.ids;
    if (new Set(ids).size !== ids.length) dupBad++;
    if (res.pScore < 0 || res.rScore < 0) negBad++;
    ids.forEach(function (id) {
      var q = byId[id]; if (!q || q.topic !== topic) return;
      if (last[id] !== undefined) {
        var gap = d - last[id]; if (gap < minGap) minGap = gap;
        if (gap < 2 && unseen >= 5) gapBad++;
      }
      last[id] = d;
    });
  }
}
check(dupBad === 0, '(c) duplicate ids within a duel: ' + dupBad);
check(negBad === 0, '(e) negative score: ' + negBad);
check(gapBad === 0, '(d) picked-topic id repeated in consecutive duels with unseen>=5: ' + gapBad);
// (f)
[['movie', 7], ['book', 2]].forEach(function (mu) {
  var th = 0, bad = 0, n = 0;
  for (var s2 = 0; s2 < 400; s2++) {
    try {
      var r = sim(50000 + s2, TOPICS[s2 % 3], E.newMemory(), player(), cfg0, mu[0], mu[1]); n++;
      r.ids.forEach(function (id) {
        var q = byId[id];
        if (!q || (mu[0] === 'movie' && !q.filmKnown) || (mu[0] === 'book' && q.book > mu[1])) bad++;
      });
    } catch (e) { th++; }
  }
  check(bad === 0, '(f) ' + mu[0] + ' up' + mu[1] + ' drew ' + bad + ' disallowed questions');
  console.log('  (f) ' + mu[0] + ' up' + mu[1] + ': ok duels ' + n + ', threw ' + th + ', bad draws ' + bad);
});
console.log('Hard: thrown(book up7)=' + thrown + ', min gap between repeats of picked-topic id=' + (minGap === Infinity ? 'none' : minGap));

// ---- tuning
function run(over, pl, n) {
  n = n || 400; var cfg = cfgWith(over), w = 0, d = 0, secs = 0, k = 0, mem;
  for (var i = 0; i < n; i++) {
    if (i % DUELS === 0) mem = E.newMemory();
    var r;
    try { r = sim(90000 + i, TOPICS[Math.floor(i / DUELS) % 3], mem, pl, cfg); } catch (e) { continue; }
    k++; if (r.result === 'win') w++;
    var ts = 0; (r.log || []).forEach(function (l) { ts += E.readTime(byId[l.id], cfg) + (l.pT != null ? l.pT : pl.tSec) + 2.5; });
    secs += ts;
  }
  return { win: 100 * w / (k || 1), secs: secs / (k || 1), n: k };
}
function band(v, lo, hi) { return (v >= lo && v <= hi ? 'PASS' : 'MISS') + ' [' + lo + '-' + hi + ']'; }
function table(label, over) {
  console.log('\n== TUNING ' + label + ' ==');
  var st = {};
  for (var s = 1; s <= 5; s++) {
    st[s] = run(Object.assign({ rivalStep: s }, over), player());
    var b = s === 1 ? band(st[s].win, 55, 70) : s === 5 ? band(st[s].win, 25, 40) : '';
    console.log('(1) step ' + s + ' smart win% ' + st[s].win.toFixed(1) + ' ' + b);
  }
  [1, 3].forEach(function (s) {
    var o = Object.assign({ rivalStep: s }, over);
    var x1 = run(o, player({ wager: 'x1' })).win, x2 = run(o, player({ wager: 'x2' })).win, sm = run(o, player({ wager: 'smart' })).win;
    console.log('(2) step ' + s + ' x1 ' + x1.toFixed(1) + ' x2 ' + x2.toFixed(1) + ' smart ' + sm.toFixed(1) +
      ' ' + ((sm - Math.max(x1, x2) >= 3) ? 'PASS' : 'MISS') + ' [smart >= best+3]');
  });
  var slow = run(Object.assign({ rivalStep: 1 }, over), player({ tSec: 9 }));
  var drop = st[1].win - slow.win;
  console.log('(3) tSec 9 vs 6 at step 1: ' + slow.win.toFixed(1) + ' vs ' + st[1].win.toFixed(1) + ' drop ' + drop.toFixed(1) + ' ' + (drop <= 10 ? 'PASS' : 'MISS') + ' [<=10]');
  console.log('(4) avg duel secs (sum readTime + pT + 2.5/q) step1 ' + st[1].secs.toFixed(0) + ' ' + band(st[1].secs, 100, 140) + ' target ~120');
}
table('default (wagerMissCost 50)', {});
table('variant wagerMissCost 100', { wagerMissCost: 100 });

if (fails.length) { console.log('\nHARD CHECKS FAILED: ' + fails.length); process.exit(1); }
console.log('\nHard checks OK');
