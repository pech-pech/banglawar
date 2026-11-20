'use strict';
// Starfall endless-mode chunk library (13 cols, legend per MAP-FORMAT.md v1).
// Room = entry(5) + mid(5)+mid(5) | mid(10) + exit(5) = 20 rows. Engine adds the border.
// Crushers: X blocks are 2x2 placed in the top 2 rows of a chunk (amp 48 = 2 cells of travel).
// Pad zone (see padzone.js / isPadClean): bottom rows 13-19 except col 7, plus cols 10-12 of rows 0-1 -> hazards, S and E live outside it.
// Every chunk keeps at least one clear vertical fall lane; openTop/openBottom are derived from rows.

const COLS = 13;
const LEGEND = '.#^v><~=XSE';
const SOLID = '#~=X^v><'; // cells that are not "free" for a fall lane
const SWEEP_ROWS = 2; // crushers (ay=1, amp 48 px) sweep 2 cells up and down

function open(row) {
  const r = [];
  for (let c = 0; c < row.length; c++) if (!SOLID.includes(row[c])) r.push(c);
  return r;
}

// Pad dead zone as grid cells (padzone.cells at 475x638): bottom rows 13-19 except col 7 (right pad cols 8-12, left pad cols 0-6,
// both sides are checked because rooms mirror), plus the Retry ring cols 10-12 rows 0-1. Lazy so tests that never ask stay light.
let zoneCells = null;
function PAD_CELLS() {
  if (!zoneCells) zoneCells = [...require('./padzone.js').cells().both].map((k) => k.split(',').map(Number));
  return zoneCells;
}
// The zone may hold only plain empty ('.') or wall ('#') cells, and no crusher may sweep into it.
function isPadClean(rows20) {
  const z = PAD_CELLS(), inZ = new Set(z.map(([c, r]) => c + ',' + r));
  for (const [c, r] of z) { const ch = rows20[r] && rows20[r][c]; if (ch !== undefined && ch !== '.' && ch !== '#') return false; }
  for (let r = 0; r < rows20.length; r++) for (let c = 0; c < rows20[r].length; c++) {
    if (rows20[r][c] !== 'X') continue;
    for (let k = -SWEEP_ROWS; k <= SWEEP_ROWS; k++) if (inZ.has(c + ',' + (r + k))) return false;
  }
  return true;
}

const raw = [
  // ---- ENTRIES (5 rows, one S) ----
  { id: 'e1-pillar-left', tier: 1, kind: 'entry', note: 'Start on left pillar (S col 3, clear of the Retry ring when mirrored), wide open fall to the right.',
    rows: ['.............', '...S.........', '#####........', '#####........', '#####........'] },
  { id: 'e2-pillar-right', tier: 1, kind: 'entry', note: 'Mirror of e1: start on right pillar (S col 9, left of the Retry ring).',
    rows: ['.............', '.........S...', '........#####', '........#####', '........#####'] },
  { id: 'e3-pillar-mid', tier: 1, kind: 'entry', note: 'Start on a centre pillar, fall either side.',
    rows: ['.............', '.....S.......', '....###......', '....###......', '....###......'] },
  { id: 'e4-crumble-start', tier: 2, kind: 'entry', note: 'Start on a crumble ledge, it drops under the hero.',
    rows: ['.............', '...S.........', '~~~~~........', '.............', '.............'] },
  { id: 'e5-spike-shelf', tier: 2, kind: 'entry', note: 'Left pillar plus a spiked shelf in the middle; fall lane on the far right.',
    rows: ['.............', '...S.........', '#####........', '#####.^^^^...', '#####.####...'] },
  { id: 'e8-baffle', tier: 2, kind: 'entry', note: 'Hanging spiked baffle beside the start pillar.',
    rows: ['.......#.....', '...S...#.....', '#####..#.....', '#####..v.....', '#####........'] },
  { id: 'e6-gate-floor', tier: 3, kind: 'entry', note: 'Start resting on a full-width gate: dive through.',
    rows: ['.............', '......S......', '=============', '.............', '.............'] },
  { id: 'e7-crusher', tier: 3, kind: 'entry', note: 'Crusher beside the start pillar, lane on far right.',
    rows: ['.............', '...S..XX.....', '#####.XX.....', '#####........', '#####........'] },

  // ---- MIDS (5 rows) ----
  { id: 'm1-pillars', tier: 1, kind: 'mid', note: 'Scattered pillars, plenty of space.',
    rows: ['.............', '...##........', '...##...##...', '.......##....', '.............'] },
  { id: 'm2-ledges', tier: 1, kind: 'mid', note: 'Alternating wall ledges.',
    rows: ['.............', '#####........', '.............', '........#####', '.............'] },
  { id: 'm3-crumble', tier: 1, kind: 'mid', note: 'Two crumble ledges to land on.',
    rows: ['.............', '..~~~~.......', '.......~~~~..', '.............', '.............'] },
  { id: 'm4-spike-pit', tier: 2, kind: 'mid', note: 'Pit with floor spikes beside a ledge; lane on the right.',
    rows: ['.............', '#####..^^^...', '#####..###...', '#####........', '.............'] },
  { id: 'm5-gate-steps', tier: 2, kind: 'mid', note: 'Half-width gate floors, offset.',
    rows: ['.............', '=======......', '......=======', '.............', '.............'] },
  { id: 'm6-crumble-stairs', tier: 2, kind: 'mid', note: 'Crumble stairs descending right.',
    rows: ['~~~..........', '.....~~~.....', '.........~~~.', '.............', '.............'] },
  { id: 'm7-baffle', tier: 2, kind: 'mid', note: 'Spiked baffle on the left, spike strip on the right.',
    rows: ['.............', '####.....^^^^', 'vvvv.....####', '.............', '.............'] },
  { id: 'm8-crusher-pair', tier: 3, kind: 'mid', notLast: true, note: 'Two crushers, three lanes.',
    rows: ['.............', '...XX...XX...', '...XX...XX...', '.............', '.............'] },
  { id: 'm9-crusher-ledge', tier: 3, kind: 'mid', notLast: true, note: 'Crusher beside a ledge.',
    rows: ['.............', '#####..XX....', '#####..XX....', '#####........', '.............'] },
  { id: 'm10-gate-shelf', tier: 3, kind: 'mid', note: 'Gate shelf: dive through it.',
    rows: ['.............', '####.........', '....=========', '.............', '#####........'] },
  { id: 'm11-zigzag', tier: 2, kind: 'mid', note: 'Tall zigzag of ledges with a crumble (10 rows).',
    rows: ['.............', '.####........', '.............', '........####.', '.............',
           '..####.......', '.............', '........~~~..', '.............', '.............'] },
  { id: 'm12-crusher-baffle', tier: 3, kind: 'mid', note: 'Tall: crusher, spiked baffle, second crusher (10 rows).',
    rows: ['.............', '#####..XX....', '#####..XX....', '......#####..', '..XX..vvvvv..', '..XX.........', '........#####', '.............', '.............', '.............'] },

  // ---- EXITS (5 rows, one E, full floor) ----
  { id: 'x1-floor', tier: 1, kind: 'exit', note: 'Plain floor, exit in the open.',
    rows: ['.............', '.............', '.............', '.......E.....', '#############'] },
  { id: 'x2-high-ledge', tier: 1, kind: 'exit', note: 'Ledge beside the drop to the exit.',
    rows: ['.............', '....###......', '.............', '.......E.....', '#############'] },
  { id: 'x3-spike-guard', tier: 2, kind: 'exit', note: 'Exit in a 3-wide wall slot (was spike guard; hazards are not allowed in the pad zone).',
    rows: ['.............', '.............', '.....#...#...', '.....#.E.#...', '#############'] },
  { id: 'x4-crumble-roof', tier: 2, kind: 'exit', note: 'Wall roof over the exit, enter from the right (was crumble roof).',
    rows: ['.............', '.............', '.....####....', '.....#.E.....', '#############'] },
  { id: 'x5-gate-roof', tier: 2, kind: 'exit', note: 'Two wall shelves leave a 5-wide drop to the exit (was gate roof).',
    rows: ['.............', '###.....#####', '.............', '.......E.....', '#############'] },
  { id: 'x6-crusher-guard', tier: 3, kind: 'exit', note: 'Low wall step beside the exit (was crusher guard).',
    rows: ['.............', '.............', '.............', '.####..E.....', '#############'] },
  { id: 'x7-baffle', tier: 3, kind: 'exit', note: 'Wall block at upper left, exit under open sky (was spiked baffle).',
    rows: ['#####........', '#####........', '.............', '.......E.....', '#############'] },
  { id: 'x8-nook', tier: 3, kind: 'exit', note: 'Exit tucked under an overhang, enter from the right.',
    rows: ['.............', '.............', '......###....', '......#E.....', '#############'] },
];

const CHUNKS = raw.map((c) => ({
  id: c.id, tier: c.tier, kind: c.kind, rows: c.rows, h: c.rows.length,
  notLast: !!c.notLast, // crusher sweep (+-2 cells) would reach the pad zone if this were the last mid
  noMirror: c.kind === 'exit', // E sits in col 7, the only pad-free column, so the exit rows never mirror
  openTop: open(c.rows[0]), openBottom: open(c.rows[c.rows.length - 1]), note: c.note,
}));

module.exports = { CHUNKS, PAD_CELLS, isPadClean, LEGEND, COLS };
