(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// V.Widen: stepped rooms (pick 43 / R42, FULLSCREEN-LAYOUT section 2). Builds a C-column room (C = 9, 11, 13, 15) from a
// 9-column template by rule; nothing is hand-authored per width. Pure functions, no rng, no DOM. Works in Node and the browser.
//   V.Widen.room(roomDef, C) -> { grid, spawns, w, h, k, boss, fill, name, cover }
//   V.Widen.spawns(list, C, roomDef) -> stage spawn list in C-column tile coords (same fields, x moved)
//   V.Widen.cols(v) -> v snapped to a column class (odd, 9..15); anything else -> 9
// Rules (k = (C - 9) / 2 columns added on each side):
//   core: every template cell shifts right by k (door, start tile and mirror line stay on the centre column);
//   side-attached cells: a '#', '^' or '~' cell in template column 0 (8) is repeated through the added left (right) columns.
//     This covers both "side-attached solids stay on the wall" and "wall-to-wall runs extend, gaps keep width and place";
//   row 0 (wall row) is wall across the added columns;
//   spawn slots in template columns 1 and 7 move outward by floor(k / 2) (grid 'e' marks and spawn x alike);
//   fill cover from 13 columns: one 1 x 2 post per added band, rows 5-6, mirrored, 2+ open tiles from the core cover
//     (only rooms that have interior cover and enemies; none for R01 Open Yard, CA1, SD (R45 a) or boss arenas);
//   boss arenas (grid has 'B'): every piece centre-anchored (shift k), no fill, no slot spread;
//   pads 'P', crate 'C': centre-anchored (shift k). Nothing is placed in the bottom 3 x 3 corners by these rules.
var TW = 9, TH = 15;
var SIDE = { '#':1, '^':1, '~':1 };
var FILL_ROWS = [5, 6];            // spec: rows 5 and 6
var FILL_GAP = 2;                  // spec: 2 open tiles between the post and the core cover

function cols(v){ v = Math.round(+v); if (!(v >= 9)) return 9; if (v > 15) v = 15; if (v % 2 === 0) v++; return v > 15 ? 15 : v; }
function isBoss(def){
  if (!def || !def.grid) return false;
  for (var y = 0; y < def.grid.length; y++) if (def.grid[y].indexOf('B') >= 0) return true;
  return false;
}
// outward shift of a template column for spawn slots: columns 1 and 7 only (template coords)
function slotShift(tx, k, boss){
  if (boss || k <= 0) return 0;
  var s = Math.floor(k / 2);
  if (tx === 1) return -s;
  if (tx === TW - 2) return s;
  return 0;
}
function hasCover(grid){
  for (var y = 1; y < grid.length; y++) if (grid[y].indexOf('#') >= 0) return true;
  return false;
}
// leftmost core cover column (template coords) in the fill rows, else in any floor row
function leftCover(grid){
  var best = 99, y, x;
  for (var i = 0; i < FILL_ROWS.length; i++) { y = FILL_ROWS[i]; x = grid[y].indexOf('#'); if (x >= 0 && x < best) best = x; }
  if (best < 99) return best;
  for (y = 1; y < grid.length; y++) { x = grid[y].indexOf('#'); if (x >= 0 && x < best) best = x; }
  return best;
}

// a room with no spawn slots and no spawns has no enemies (SD supply room): no fill cover there (R45 a)
function hasEnemies(def){
  if (def.spawns && def.spawns.length) return true;
  for (var y = 1; y < def.grid.length; y++) if (def.grid[y].indexOf('e') >= 0) return true;
  return false;
}
function widenGrid(def, C){
  var g = def.grid, k = (C - TW) / 2, boss = isBoss(def), out = [], y, x;
  for (y = 0; y < g.length; y++) {
    var row = g[y], a = new Array(C);
    for (x = 0; x < TW; x++) a[x + k] = row[x];
    var lc = y === 0 ? '#' : (SIDE[row[0]] && !boss ? row[0] : '.');
    var rc = y === 0 ? '#' : (SIDE[row[TW - 1]] && !boss ? row[TW - 1] : '.');
    for (x = 0; x < k; x++) { a[x] = lc; a[C - 1 - x] = rc; }
    out.push(a);
  }
  // spawn slot marks in template columns 1 and 7 move outward
  if (!boss && Math.floor(k / 2) > 0) {
    for (y = 1; y < g.length; y++) {
      [1, TW - 2].forEach(function(tx){
        if (g[y][tx] !== 'e') return;
        var nx = tx + k + slotShift(tx, k, boss);
        if (out[y][nx] === '.') { out[y][tx + k] = '.'; out[y][nx] = 'e'; }
      });
    }
  }
  // fill cover from 13 columns
  var fill = [];
  if (!boss && C >= 13 && hasCover(g) && hasEnemies(def)) { // R45 (a): no fill in rooms without enemies (SD)
    var lcx = leftCover(g) + k, px = Math.min(lcx - FILL_GAP - 1, k - 1);
    if (px >= 0) {
      var ok = true;
      for (var i = 0; i < FILL_ROWS.length; i++) { y = FILL_ROWS[i]; if (out[y][px] !== '.' || out[y][C - 1 - px] !== '.') ok = false; }
      if (ok) {
        for (i = 0; i < FILL_ROWS.length; i++) { y = FILL_ROWS[i]; out[y][px] = '#'; out[y][C - 1 - px] = '#'; }
        fill.push({ x:px, y:FILL_ROWS[0], w:1, h:FILL_ROWS.length }, { x:C - 1 - px, y:FILL_ROWS[0], w:1, h:FILL_ROWS.length });
      }
    }
  }
  return { grid:out.map(function(a){ return a.join(''); }), fill:fill, boss:boss, k:k };
}

function widenSpawns(list, C, def){
  C = cols(C);
  var k = (C - TW) / 2, boss = def === true || isBoss(def), out = [];
  for (var i = 0; i < (list || []).length; i++) {
    var s = list[i], o = {};
    for (var key in s) o[key] = s[key];
    if (k > 0) o.x = s.x + k + slotShift(Math.floor(s.x), k, boss);
    out.push(o);
  }
  return out;
}

function room(def, C){
  C = cols(C);
  if (!def || !def.grid || def.grid.length !== TH || def.grid[0].length !== TW) {
    // not a 9-column template: hand it back unchanged
    return { grid:def ? def.grid : null, spawns:widenSpawns(def && def.spawns, 9, def), w:def && def.grid ? def.grid[0].length : TW,
      h:def && def.grid ? def.grid.length : TH, k:0, boss:isBoss(def), fill:[], name:def && def.name, cover:def && def.cover };
  }
  var r = widenGrid(def, C);
  return { grid:r.grid, spawns:widenSpawns(def.spawns, C, def), w:C, h:TH, k:r.k, boss:r.boss, fill:r.fill, name:def.name, cover:def.cover };
}

V.Widen = { hasEnemies:hasEnemies, room:room, spawns:widenSpawns, cols:cols, isBoss:isBoss, slotShift:slotShift, TEMPLATE_W:TW, TEMPLATE_H:TH };
if (typeof module !== 'undefined' && module.exports) module.exports = V.Widen;
})();
