// F0 agent D: fix search (ex2), rerun with: node src/sim/explore-ex2.js
var M = require('./model.js'), N = 400;
var LCOST = [10,10,10,10,10,10,10,28,28,28,28,28,28,36,36,36,36,36,36,36,36,61,61,61,61,61,62,62,62,62,62,100,100,100,100,100,100,100,100,100];
var cost = function (l) { return LCOST[l - 1] * 0.97; };
function t(a) { return M.med(a.filter(function (h) { return h.win; }).map(function (h) { return h.time; })); }
var o = M.CFG.bpOff;
[[0.036, 0.30], [0.08, 0.30], [0.12, 0.30], [0.036, 0.15], [0.06, 0.15], [0.08, 0.15]].forEach(function (p) {
  M.CFG.hpSlope = p[0]; M.CFG.bpOff = p[1]; var C = M.chapter(1);
  [1.25, 1.0, 0.8].forEach(function (d) { var a = M.sweep(C, { allOpen: true, cost: cost, dmgScale: d }, N, 1);
    console.log('hpSlope', p[0], 'bpOff', p[1], 'dmg', d, 'time', t(a).toFixed(0), 'blocks', [0,1,2,3,4].map(i => M.mean(a.filter(h => h.win).map(h => h.blocks[i])).toFixed(0)).join('/'), 'clear', M.rate(a).toFixed(3)); });
});
