// Regenerates fixtures/good (copied from the built data) and fixtures/bad (planted). Usage: node src/fixtures/make-fixtures.js
'use strict';
var path = require('path'), fs = require('fs');
globalThis.V = globalThis.V || {};
require(path.join(__dirname, '..', 'parts', 'data-stages.js'));
var D = globalThis.V.Data;
function w(dir, name, o) { fs.writeFileSync(path.join(__dirname, dir, name + '.json'), JSON.stringify(o, null, 1) + '\n'); }
// good: the 3 built combat shapes with a built stage row each
[['R01', 1], ['R02', 8], ['R03', 6]].forEach(function (p) {
  var row = D.stages.ch1[p[1] - 1], r = D.rooms[p[0]];
  w('good', p[0] + '-stage' + p[1], { id: 'good-' + p[0], kind: row.kind, stage: row.stage, room: JSON.parse(JSON.stringify(r)), spawns: row.spawns });
});
// bad: build rows 1-10 from ASCII; marks 'e' added on spawn tiles
function mk(rows, spawns) {
  var g = ['####D####'].concat(rows, ['.........', '.........', '.........', '....S....']);
  if (g.length !== 15) throw new Error('rows');
  spawns.forEach(function (s) { var x = Math.floor(s.x), y = Math.floor(s.y); if (g[y][x] === '.') g[y] = g[y].slice(0, x) + 'e' + g[y].slice(x + 1); });
  return { name: 'Fixture', cover: 'block', grid: g, spawns: spawns.map(function (s) { return { type: s.type, x: s.x, y: s.y }; }) };
}
function bad(file, check, reason, kind, stage, rows, spawns) { var room = mk(rows, spawns); w('bad', file, { id: file, expect: { check: check, reason: reason }, kind: kind, stage: stage, room: room, spawns: spawns }); }
var OPEN = '.........', Z = [];
function E(t, x, y, extra) { var o = { type: t, x: x, y: y, t: 0 }; for (var k in (extra || {})) o[k] = extra[k]; return o; }
function rowsWith(m) { var r = []; for (var i = 1; i <= 10; i++) r.push(m[i] || OPEN); return r; }
var four = [E('E-01', 1.5, 2.5), E('E-01', 7.5, 2.5), E('E-01', 2.5, 8.5), E('E-01', 6.5, 8.5)];
bad('01-door-blocked', 'C1', 'door', 'combat', 12, rowsWith({ 1: '#########' }), four);
bad('02-x1-spawn-on-route', 'X1', 'only 2-wide', 'combat', 12, rowsWith({ 6: '###...###', 7: '###...###' }),
  [E('E-01', 4.5, 6.5), E('E-01', 1.5, 2.5), E('E-01', 7.5, 2.5), E('E-01', 1.5, 9.5)]);
bad('03-widen-trap-slot-in-cover', 'C3', 'inside cover', 'combat', 12, rowsWith({ 6: '#........' }),
  [E('E-01', 1.5, 6.5), E('E-01', 3.5, 2.5), E('E-01', 7.5, 2.5), E('E-01', 6.5, 9.5)]);
bad('04-no-shield-pocket', 'C4', 'no shield pocket', 'combat', 12, rowsWith({ 7: '#........' }),
  [E('E-02', 8.5, 2.5), E('E-02', 8.5, 4.5), E('E-02', 8.5, 6.5), E('E-02', 8.5, 9.5)]);
bad('05-sniper-corner-line', 'C5', 'corner tile', 'combat', 12, rowsWith({ 4: '...###...', 5: '...###...', 6: '...###...' }),
  [E('E-03', 0.5, 10.5), E('E-01', 3.5, 1.5), E('E-01', 1.5, 2.5), E('E-01', 7.5, 2.5)]);
bad('06-route-one-tile-wide', 'C2', '2-wide', 'combat', 12, rowsWith({ 5: '####.####' }),
  [E('E-01', 1.5, 7.5), E('E-01', 7.5, 7.5), E('E-01', 2.5, 9.5), E('E-01', 6.5, 9.5)]);
(function () { var sp = [], xs = [0.5, 2.5, 6.5, 8.5], ys = [1.5, 3.5, 5.5, 7.5]; ys.forEach(function (y, j) { xs.forEach(function (x, i) { if (sp.length < 13) sp.push(E('E-01', x, y, { wave: 1 + Math.floor(sp.length / 6) })); }); });
  bad('07-thirteen-machines', 'C6', '13 machines', 'combat', 14, rowsWith({}), sp); })();
(function () { var room = D.rooms.CA1, sp = JSON.parse(JSON.stringify(D.stages.ch1[8].spawns)); sp[0].elite = true;
  w('bad', '08-elite-in-cache', { id: '08-elite-in-cache', expect: { check: 'C6', reason: 'elite in a cache' }, kind: 'cache', stage: 19, room: JSON.parse(JSON.stringify(room)), spawns: sp }); })();
bad('09-hazard-31pct', 'C8', 'hazard', 'combat', 12, rowsWith({ 2: '^^^...^^^', 4: '^^^...^^^', 6: '^^^...^^^', 8: '^^^...^^^', 10: '^^.....^^' }),
  [E('E-01', 1.5, 1.5), E('E-01', 7.5, 1.5), E('E-01', 2.5, 5.5), E('E-01', 6.5, 7.5)]);
bad('10-unintroduced-machine', 'C6', 'not introduced', 'combat', 4, rowsWith({ 4: '..##.##..', 5: '..##.##..' }),
  [E('E-05', 4.5, 6.5), E('E-01', 1.5, 2.5), E('E-02', 7.5, 2.5)]);
// extra planted rooms for the checks the spec list does not cover
bad('11-c7-long-lane', 'C7', 'bounded open run', 'combat', 12, rowsWith({ 5: '#.......#' }), four);
bad('12-x2-ring-heavy-hazard', 'X2', 'heavy-hazard', 'combat', 12, rowsWith({ 2: '.^^...^^.', 4: '.^^...^^.', 6: '.^^...^^.', 8: '.^^...^^.' }),
  [E('E-02', 1.5, 3.5), E('E-02', 7.5, 3.5), E('E-04', 2.5, 5.5), E('E-01', 5.5, 1.5)]);
bad('13-x3-charger-lane', 'X3', 'charger lane', 'combat', 12, rowsWith({ 6: '###...###', 7: '###...###' }),
  [E('E-05', 4.5, 3.5), E('E-01', 1.5, 2.5), E('E-01', 7.5, 2.5), E('E-01', 1.5, 9.5)]);
bad('14-x4-chaser-alcove', 'X4', 'no side exit', 'combat', 12, rowsWith({ 3: '..#.#....' }),
  [E('E-01', 3.5, 3.5), E('E-01', 7.5, 6.5), E('E-01', 1.5, 8.5), E('E-01', 6.5, 9.5)]);
console.log('fixtures written');
