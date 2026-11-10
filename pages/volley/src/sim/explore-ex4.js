// F0 agent D: fix search (ex4), rerun with: node src/sim/explore-ex4.js
var M = require('./model.js'), N = 400;
var LCOST = [10,10,10,10,10,10,10,28,28,28,28,28,28,36,36,36,36,36,36,36,36,61,61,61,61,61,62,62,62,62,62,100,100,100,100,100,100,100,100,100];
var cost = function (l) { return LCOST[l - 1] * 0.97; };
var C = M.chapter(1, { gear: [1.3 * 0.85, 1.3 * 0.85] }), C0 = M.chapter(1);
function r(o, c) { return M.rate(M.sweep(c || C0, Object.assign({ allOpen: true, cost: cost, dmgScale: 1.25 }, o), N, 1)); }
[[1, 0.8, 0.6, 0.2], [1, 1, 1, 0.2], [1, 0.8, 0.6, 0.12], [1, 1, 1, 0.12], [1, 1.2, 1.2, 0.12]].forEach(function (p) {
  M.CFG.stack = p.slice(0, 3); M.CFG.bpDef = p[3];
  var fr = {}; M.FAMS.forEach(function (f) { fr[f] = r({ policy: { fam: f } }, C); });
  console.log('stack', p.slice(0,3).join('/'), 'bpDef', p[3], 'human', r({}).toFixed(3), 'greedy', r({ policy: 'greedy' }).toFixed(3), 'low-gear fam', JSON.stringify(fr));
});
