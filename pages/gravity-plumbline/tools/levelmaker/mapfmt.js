/*
 * Starfall map format v1 (see games-design/plumbline/2026-11-20-endless/MAP-FORMAT.md).
 * Converts 13x20 ASCII grids into engine room objects and back through report text.
 * Browser: window.MapFmt. Node: module.exports.
 */
(function (global) {
  'use strict';

  var COLS = 13;
  var ROWS = 20;
  var CELL = 24;
  var BORDER = 12;
  var BOX_X0 = 12;
  var BOX_Y0 = 12;
  var BOX_X1 = 324;
  var BOX_Y1 = 488;
  var PIECE_CHARS = '.#^v><~=XSE';
  var REPORT_HEADER = 'STARFALL MAP REPORT v1';
  var BORDER_WALLS = [
    [0, 0, 336, 12],
    [0, 488, 336, 12],
    [0, 0, 12, 500],
    [324, 0, 12, 500]
  ];

  function repeat(ch, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  function emptyGrid() {
    var g = [];
    for (var r = 0; r < ROWS; r++) g.push(repeat('.', COLS));
    return g;
  }

  function cellAt(rows, c, r) {
    var line = rows[r];
    if (typeof line !== 'string') return '.';
    return line.charAt(c) || '.';
  }

  // Unclamped cell box in engine px.
  function cellBox(c, r) {
    var x0 = BORDER + c * CELL;
    var y0 = BORDER + r * CELL;
    return { x0: x0, y0: y0, x1: x0 + CELL, y1: y0 + CELL };
  }

  function clampBox(b) {
    var x0 = Math.max(BOX_X0, Math.min(BOX_X1, b.x0));
    var y0 = Math.max(BOX_Y0, Math.min(BOX_Y1, b.y0));
    var x1 = Math.max(BOX_X0, Math.min(BOX_X1, b.x1));
    var y1 = Math.max(BOX_Y0, Math.min(BOX_Y1, b.y1));
    return [x0, y0, x1 - x0, y1 - y0];
  }

  // Merge runs of ch: horizontal runs per row, then (if vertical) equal runs stacked vertically.
  // Returns clamped [x,y,w,h] rects.
  // insetTop/insetBottom (px within the cell) let gates use their half-cell band.
  function mergeRects(rows, ch, vertical, insetTop, insetBottom) {
    var top = insetTop || 0;
    var bottom = insetBottom === undefined ? CELL : insetBottom;
    var out = [];
    var active = {};
    for (var r = 0; r < ROWS; r++) {
      var next = {};
      var c = 0;
      while (c < COLS) {
        if (cellAt(rows, c, r) !== ch) { c++; continue; }
        var c0 = c;
        while (c < COLS && cellAt(rows, c, r) === ch) c++;
        var x0 = BORDER + c0 * CELL;
        var x1 = BORDER + c * CELL;
        var key = x0 + ':' + x1;
        var y0 = BORDER + r * CELL + top;
        var y1 = BORDER + r * CELL + bottom;
        var idx = vertical ? active[key] : undefined;
        if (idx !== undefined && out[idx].y1 === y0) {
          out[idx].y1 = y1;
          next[key] = idx;
        } else {
          out.push({ x0: x0, y0: y0, x1: x1, y1: y1 });
          next[key] = out.length - 1;
        }
      }
      active = next;
    }
    return out.map(clampBox);
  }

  function spikeRect(ch, c, r) {
    var b = cellBox(c, r);
    var x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1;
    if (ch === '^') {
      // bottom 12 px of the (clamped) cell; never shrink below 12 px
      y1 = Math.min(b.y1, BOX_Y1);
      y0 = y1 - 12;
    } else if (ch === 'v') y1 = b.y0 + 12;  // top half
    else if (ch === '>') x1 = b.x0 + 12;     // left half
    else if (ch === '<') x0 = b.x0 + 12;     // right half
    return clampBox({ x0: x0, y0: y0, x1: x1, y1: y1 });
  }

  function gridToRoom(rows, name) {
    var start = null;
    var exit = null;
    var spikes = [];
    var crushers = [];
    var gates = [];
    var r, c, ch;

    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        ch = cellAt(rows, c, r);
        var b = cellBox(c, r);
        var bottom = Math.min(b.y1, BOX_Y1);
        var cy = (b.y0 + bottom) / 2;
        var cx = (b.x0 + b.x1) / 2;
        if (ch === 'S' && start === null) {
          start = { x: cx, y: bottom - 11, g: 2 };
        } else if (ch === 'E' && exit === null) {
          exit = { x: cx, y: cy };
        } else if (ch === '^' || ch === 'v' || ch === '>' || ch === '<') {
          spikes.push({ r: spikeRect(ch, c, r) });
        }
      }
    }

    gates = mergeRects(rows, '=', false, 6, 18).map(function (rect) {
      return { r: rect, dir: 2 };
    });

    // Crushers: 4-neighbour connected components of 'X', one bbox each.
    var seen = {};
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        if (cellAt(rows, c, r) !== 'X' || seen[r * COLS + c]) continue;
        var stack = [[c, r]];
        seen[r * COLS + c] = true;
        var minc = c, maxc = c, minr = r, maxr = r;
        while (stack.length) {
          var p = stack.pop();
          var pc = p[0], pr = p[1];
          minc = Math.min(minc, pc); maxc = Math.max(maxc, pc);
          minr = Math.min(minr, pr); maxr = Math.max(maxr, pr);
          var nbrs = [[pc + 1, pr], [pc - 1, pr], [pc, pr + 1], [pc, pr - 1]];
          for (var n = 0; n < nbrs.length; n++) {
            var nc = nbrs[n][0], nr = nbrs[n][1];
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
            if (seen[nr * COLS + nc] || cellAt(rows, nc, nr) !== 'X') continue;
            seen[nr * COLS + nc] = true;
            stack.push([nc, nr]);
          }
        }
        crushers.push({
          r: clampBox({
            x0: BORDER + minc * CELL,
            y0: BORDER + minr * CELL,
            x1: BORDER + (maxc + 1) * CELL,
            y1: BORDER + (maxr + 1) * CELL
          }),
          ax: 0,
          ay: 1,
          amp: 48,
          phase: 0
        });
      }
    }

    return {
      name: name == null ? '' : String(name),
      start: start,
      exit: exit,
      walls: mergeRects(rows, '#', true),
      spikes: spikes,
      crumbles: mergeRects(rows, '~', true),
      gates: gates,
      crushers: crushers
    };
  }

  function withBorder(room) {
    var copy = JSON.parse(JSON.stringify(room));
    copy.walls = BORDER_WALLS.map(function (w) { return w.slice(); }).concat(copy.walls);
    return copy;
  }

  function validate(rows) {
    var warnings = [];
    if (!Array.isArray(rows) || rows.length !== ROWS) {
      warnings.push('expected ' + ROWS + ' rows, got ' + (Array.isArray(rows) ? rows.length : 0));
    }
    var sCount = 0;
    var eCount = 0;
    var lines = Array.isArray(rows) ? rows : [];
    for (var r = 0; r < lines.length; r++) {
      var line = typeof lines[r] === 'string' ? lines[r] : '';
      if (line.length !== COLS) {
        warnings.push('row ' + (r + 1) + ': expected ' + COLS + ' chars, got ' + line.length);
      }
      for (var c = 0; c < line.length; c++) {
        var ch = line.charAt(c);
        if (PIECE_CHARS.indexOf(ch) < 0) {
          warnings.push('row ' + (r + 1) + ' col ' + (c + 1) + ': bad char ' + JSON.stringify(ch));
        }
        if (ch === 'S') sCount++;
        if (ch === 'E') eCount++;
      }
    }
    if (sCount !== 1) warnings.push('expected exactly one S, found ' + sCount);
    if (eCount !== 1) warnings.push('expected exactly one E, found ' + eCount);
    return warnings;
  }

  function rowString(rows, r) {
    var s = '';
    for (var c = 0; c < COLS; c++) s += cellAt(rows, c, r);
    return s;
  }

  function buildReport(maps) {
    var lines = [
      REPORT_HEADER,
      'grid ' + COLS + 'x' + ROWS + ' cell ' + CELL + ' border ' + BORDER,
      'maps ' + maps.length
    ];
    maps.forEach(function (m, i) {
      lines.push('=== MAP ' + (i + 1) + ' "' + m.name + '" ' + m.time + ' ===');
      for (var r = 0; r < ROWS; r++) lines.push(rowString(m.rows, r));
      lines.push('JSON ' + JSON.stringify(gridToRoom(m.rows, m.name)));
    });
    return lines.join('\n') + '\n';
  }

  function parseReport(text) {
    var headerRe = /^===\s*MAP\s+\d+\s+"(.*)"\s+(\S+)\s*===$/;
    var rowRe = /^[.#^v><~=XSE]+$/;
    var maps = [];
    var cur = null;
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var m = headerRe.exec(line);
      if (m) {
        cur = { name: m[1], time: m[2], rows: [] };
        maps.push(cur);
        continue;
      }
      if (!cur) continue;
      if (line.indexOf('===') === 0 || line.indexOf('JSON ') === 0) {
        // JSON is redundant with the ASCII rows; ASCII wins, so it is ignored.
        cur = null;
        continue;
      }
      if (line && cur.rows.length < ROWS && rowRe.test(line)) cur.rows.push(line);
    }
    return maps;
  }

  var api = {
    emptyGrid: emptyGrid,
    gridToRoom: gridToRoom,
    withBorder: withBorder,
    validate: validate,
    buildReport: buildReport,
    parseReport: parseReport
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.MapFmt = api;
  else if (global) global.MapFmt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
