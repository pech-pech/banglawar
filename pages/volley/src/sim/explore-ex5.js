// F0 agent D: fix search (ex5), rerun with: node src/sim/explore-ex5.js
var M = require('./model.js'), N = 400;
var LCOST = [10,10,10,10,10,10,10,28,28,28,28,28,28,36,36,36,36,36,36,36,36,61,61,61,61,61,62,62,62,62,62,100,100,100,100,100,100,100,100,100];
var cost = function (l) { return LCOST[l - 1] * 0.97; };
var C = M.chapter(1, { gear: [1.3 * 0.85, 1.3 * 0.85] }), C0 = M.chapter(1);
function r(o, c) { return M.rate(M.sweep(c || C0, Object.assign({ allOpen: true, cost: cost, dmgScale: 1.25 }, o), N, 1)); }
[[[0.5,0.75,1],1,1],[[0.25,0.4,0.6],1,1],[[0.25,0.4,0.6],0.5,1],[[0.25,0.4,0.6],0.5,0.6]].forEach(function (p) {
  M.CFG.revive = p[0]; M.CFG.hullSetK = p[1]; M.U.forEach(function(u){ if (u.fam==='Hul' && u.kind!=='revive') u.v = u.v0 = (u.v0||u.v), u.v = u.v0 * p[2]; });
  var fr = {}; M.FAMS.forEach(function (f) { fr[f] = r({ policy: { fam: f } }, C).toFixed(2); });
  console.log(JSON.stringify(p), 'human', r({}).toFixed(3), 'greedy', r({ policy: 'greedy' }).toFixed(3), JSON.stringify(fr));
});
