// F0 agent D: fit enemy damage for pick 41 with 04's rising block split 27/44/54/65/70. node src/sim/fit-rising.js
var M = require('./model.js'); M.CFG.fightK = 0.8855682373046875; M.CFG.hpSlope = 0.06; M.CFG.bpOff = 0.20;
var COST = [10,10,10,10,10,10,10,28,28,28,28,28,28,63,63,63,63,63,63,63,63,112,112,112,112,112,111,111,111,111,111,148,148,148,148,148,148,148,148,148];
var C = M.chapter(1, { enemies: 260, blockW: [1, 0.80, 0.98, 1.18, 1.27] });
var o = { allOpen: true, cost: function (l) { return COST[Math.min(39, l - 1)] * 0.97; } };
var lo = 0.2, hi = 1.2; for (var i = 0; i < 16; i++) { var m = (lo + hi) / 2; if (M.rate(M.sweep(C, Object.assign({ dmgScale: m }, o), 600, 1)) > 0.9) lo = m; else hi = m; }
var k = (lo + hi) / 2, a = M.sweep(C, Object.assign({ dmgScale: k }, o), 1000, 1), w = a.filter(h => h.win);
console.log(JSON.stringify({ dmg: +k.toFixed(3), clear: M.rate(a), t: M.med(w.map(h => h.time)), blocks: [0,1,2,3,4].map(i => Math.round(M.mean(w.map(h => h.blocks[i])))), pace: [5,10,20,30,40,50].map(s => +M.mean(w.map(h => h.picksAt[s])).toFixed(1)) }));
