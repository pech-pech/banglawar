// Run: node mapfmt.test.js
'use strict';
var assert = require('assert');
var M = require('./mapfmt.js');

var tests = [];
function test(name, fn) { tests.push([name, fn]); }

// Set one cell in a grid (grid is an array of row strings).
function set(g, c, r, ch) {
  g[r] = g[r].slice(0, c) + ch + g[r].slice(c + 1);
  return g;
}

function sampleMaps() {
  var g1 = M.emptyGrid();
  set(g1, 0, 0, '#'); set(g1, 1, 0, '#'); set(g1, 2, 0, '#');
  set(g1, 3, 3, '^'); set(g1, 4, 3, '~'); set(g1, 5, 3, '=');
  set(g1, 6, 3, 'X'); set(g1, 6, 4, 'X');
  set(g1, 2, 10, 'S'); set(g1, 9, 2, 'E');
  var g2 = M.emptyGrid();
  set(g2, 1, 19, 'S'); set(g2, 11, 5, 'E'); set(g2, 0, 0, 'v');
  return [
    { name: 'alpha', time: '2026-11-20T10:50', rows: g1 },
    { name: 'beta', time: '2026-11-20T10:51', rows: g2 }
  ];
}

test('emptyGrid is 20 rows of 13 dots', function () {
  var g = M.emptyGrid();
  assert.strictEqual(g.length, 20);
  g.forEach(function (row) { assert.strictEqual(row, '.............'); });
});

test('empty grid gives empty pieces and null start/exit', function () {
  var room = M.gridToRoom(M.emptyGrid(), 'empty');
  assert.deepStrictEqual(room, {
    name: 'empty', start: null, exit: null, walls: [], spikes: [],
    crumbles: [], gates: [], crushers: []
  });
});

test('2x2 wall block merges to one rect', function () {
  var g = M.emptyGrid();
  set(g, 2, 4, '#'); set(g, 3, 4, '#'); set(g, 2, 5, '#'); set(g, 3, 5, '#');
  var room = M.gridToRoom(g, 'w');
  assert.deepStrictEqual(room.walls, [[60, 108, 48, 48]]);
});

test('walls merge vertically only when runs match', function () {
  var g = M.emptyGrid();
  set(g, 0, 0, '#'); set(g, 1, 0, '#'); set(g, 2, 0, '#');
  set(g, 0, 1, '#'); set(g, 1, 1, '#');
  var room = M.gridToRoom(g, 'w');
  assert.deepStrictEqual(room.walls, [[12, 12, 72, 24], [12, 36, 48, 24]]);
});

test('spike half-cell rects per direction', function () {
  var g = M.emptyGrid();
  set(g, 0, 0, 'v');   // top half of cell (0,0)
  set(g, 0, 1, '>');   // left half
  set(g, 2, 1, '<');   // right half
  set(g, 1, 2, '^');   // bottom half
  var room = M.gridToRoom(g, 's');
  assert.deepStrictEqual(room.spikes, [
    { r: [12, 12, 24, 12] },
    { r: [12, 36, 12, 24] },
    { r: [72, 36, 12, 24] },
    { r: [36, 72, 24, 12] }
  ]);
});

test('row 19 is clamped to floor 488', function () {
  var g = M.emptyGrid();
  set(g, 0, 19, '^');
  set(g, 1, 19, '#');
  set(g, 2, 19, 'S');
  set(g, 5, 19, 'E');
  var room = M.gridToRoom(g, 'bottom');
  assert.deepStrictEqual(room.spikes, [{ r: [12, 476, 24, 12] }]);
  assert.deepStrictEqual(room.walls, [[36, 468, 24, 20]]);
  assert.deepStrictEqual(room.start, { x: 72, y: 477, g: 2 });
  assert.deepStrictEqual(room.exit, { x: 144, y: 478 });
});

test('every rect stays inside the inner box', function () {
  var g = M.emptyGrid();
  for (var c = 0; c < 13; c++) { set(g, c, 19, '#'); set(g, c, 0, '~'); }
  var room = M.gridToRoom(g, 'box');
  function check(rect) {
    assert.ok(rect[0] >= 12 && rect[1] >= 12, 'origin in box: ' + rect);
    assert.ok(rect[0] + rect[2] <= 324 && rect[1] + rect[3] <= 488, 'end in box: ' + rect);
  }
  room.walls.forEach(check);
  room.crumbles.forEach(check);
});

test('crushers: 4-neighbour components, bbox each', function () {
  var g = M.emptyGrid();
  set(g, 0, 0, 'X'); set(g, 1, 0, 'X'); set(g, 1, 1, 'X'); // one blob
  set(g, 0, 5, 'X');                                        // single
  set(g, 1, 6, 'X');                                        // diagonal to (0,5): separate
  var room = M.gridToRoom(g, 'c');
  assert.deepStrictEqual(room.crushers, [
    { r: [12, 12, 48, 48], ax: 0, ay: 1, amp: 48, phase: 0 },
    { r: [12, 132, 24, 24], ax: 0, ay: 1, amp: 48, phase: 0 },
    { r: [36, 156, 24, 24], ax: 0, ay: 1, amp: 48, phase: 0 }
  ]);
});

test('gate: horizontal run merged, y+6 half cell, dir 2', function () {
  var g = M.emptyGrid();
  set(g, 3, 10, '='); set(g, 4, 10, '='); set(g, 5, 10, '=');
  var room = M.gridToRoom(g, 'g');
  assert.deepStrictEqual(room.gates, [{ r: [84, 258, 72, 12], dir: 2 }]);
});

test('crumble single cell', function () {
  var g = M.emptyGrid();
  set(g, 4, 4, '~');
  assert.deepStrictEqual(M.gridToRoom(g, 'c').crumbles, [[108, 108, 24, 24]]);
});

test('withBorder prepends the four border walls without mutating input', function () {
  var g = M.emptyGrid();
  set(g, 0, 0, '#');
  var room = M.gridToRoom(g, 'b');
  var before = JSON.stringify(room);
  var bw = M.withBorder(room);
  assert.deepStrictEqual(bw.walls.slice(0, 4), [
    [0, 0, 336, 12], [0, 488, 336, 12], [0, 0, 12, 500], [324, 0, 12, 500]
  ]);
  assert.strictEqual(bw.walls.length, room.walls.length + 4);
  assert.strictEqual(JSON.stringify(room), before);
});

test('validate: clean grid has no warnings', function () {
  var g = M.emptyGrid();
  set(g, 0, 0, 'S'); set(g, 5, 5, 'E');
  assert.deepStrictEqual(M.validate(g), []);
});

test('validate: missing S and E', function () {
  var w = M.validate(M.emptyGrid());
  assert.strictEqual(w.length, 2);
  assert.ok(w[0].indexOf('exactly one S') >= 0 && w[0].indexOf('found 0') >= 0);
  assert.ok(w[1].indexOf('exactly one E') >= 0);
});

test('validate: two S warns with count', function () {
  var g = M.emptyGrid();
  set(g, 0, 0, 'S'); set(g, 1, 0, 'S'); set(g, 2, 0, 'E');
  var w = M.validate(g);
  assert.strictEqual(w.length, 1);
  assert.ok(w[0].indexOf('found 2') >= 0);
});

test('validate: bad char, wrong row count, wrong row width', function () {
  var g = M.emptyGrid();
  set(g, 0, 0, 'S'); set(g, 1, 0, 'E'); set(g, 2, 0, 'x');
  var w = M.validate(g);
  assert.strictEqual(w.length, 1);
  assert.ok(w[0].indexOf('bad char') >= 0);

  var short = M.emptyGrid().slice(0, 19);
  assert.ok(M.validate(short).some(function (s) { return s.indexOf('expected 20 rows') >= 0; }));

  var narrow = M.emptyGrid();
  narrow[3] = '....';
  assert.ok(M.validate(narrow).some(function (s) { return s.indexOf('expected 13 chars') >= 0; }));
});

test('round trip build -> parse keeps name, time and rows', function () {
  var maps = sampleMaps();
  var text = M.buildReport(maps);
  var parsed = M.parseReport(text);
  assert.strictEqual(parsed.length, 2);
  maps.forEach(function (m, i) {
    assert.strictEqual(parsed[i].name, m.name);
    assert.strictEqual(parsed[i].time, m.time);
    assert.deepStrictEqual(parsed[i].rows, m.rows);
  });
});

test('report text has header, map count, 20 rows and JSON per map', function () {
  var text = M.buildReport(sampleMaps());
  var lines = text.split('\n');
  assert.strictEqual(lines[0], 'STARFALL MAP REPORT v1');
  assert.strictEqual(lines[1], 'grid 13x20 cell 24 border 12');
  assert.strictEqual(lines[2], 'maps 2');
  assert.strictEqual(lines[3], '=== MAP 1 "alpha" 2026-11-20T10:50 ===');
  assert.strictEqual(lines[4 + 20].indexOf('JSON '), 0);
  var json = JSON.parse(lines[4 + 20].slice(5));
  assert.strictEqual(json.name, 'alpha');
  assert.deepStrictEqual(json.walls, [[12, 12, 72, 24]]);
  assert.strictEqual(lines[4 + 21], '=== MAP 2 "beta" 2026-11-20T10:51 ===');
});

test('parseReport tolerates CRLF, leading text, extra whitespace; ASCII wins over JSON', function () {
  var g = M.emptyGrid();
  set(g, 0, 0, 'S'); set(g, 4, 4, '#');
  var block = [
    '   === MAP 7 "lvl" 2026-11-20T10:50 ===   ',
  ];
  g.forEach(function (row) { block.push('   ' + row + '   '); });
  block.push('JSON {"name":"lvl","walls":[[999,999,1,1]]}');
  var text = 'some preamble\r\n  STARFALL MAP REPORT v1 \r\n\r\n' + block.join('\r\n') + '\r\n';
  var parsed = M.parseReport(text);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].name, 'lvl');
  assert.strictEqual(parsed[0].time, '2026-11-20T10:50');
  assert.deepStrictEqual(parsed[0].rows, g);
});

test('parseReport of empty text returns no maps', function () {
  assert.deepStrictEqual(M.parseReport(''), []);
});

var failed = 0;
tests.forEach(function (t) {
  try {
    t[1]();
    console.log('ok   ' + t[0]);
  } catch (e) {
    failed++;
    console.log('FAIL ' + t[0] + '\n     ' + (e && e.message));
  }
});
console.log(tests.length - failed + '/' + tests.length + ' passed');
if (failed) process.exit(1);
