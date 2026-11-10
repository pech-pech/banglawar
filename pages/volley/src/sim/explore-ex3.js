// F0 agent D: fix search (ex3), rerun with: node src/sim/explore-ex3.js
var M = require('./model.js'), N = 400;
var LCOST = [10,10,10,10,10,10,10,28,28,28,28,28,28,36,36,36,36,36,36,36,36,61,61,61,61,61,62,62,62,62,62,100,100,100,100,100,100,100,100,100];
function t(a) { return M.med(a.filter(function (h) { return h.win; }).map(function (h) { return h.time; })); }
[[205,0.06,0.3],[260,0.06,0.3],[260,0.08,0.2],[300,0.08,0.2],[300,0.06,0.3]].forEach(function (p) {
  M.CFG.hpSlope = p[1]; M.CFG.bpOff = p[2]; var C = M.chapter(1, { enemies: p[0] });
  // XP scales with enemies, so scale costs by enemies/155
  var k = p[0] / 155, cost = function (l) { return LCOST[l - 1] * 0.97 * k; };
  [1.0, 0.8, 0.65, 0.5].forEach(function (d) { var a = M.sweep(C, { allOpen: true, cost: cost, dmgScale: d }, N, 1);
    console.log(p.join('/'), 'dmg', d, 'time', t(a).toFixed(0), 'picks', M.med(a.filter(h=>h.win).map(h=>h.picks)), 'clear', M.rate(a).toFixed(3)); });
});
