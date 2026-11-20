'use strict';
// Endless-room stitcher: builds one 13x20 room from seeded chunk picks.
// Chunks come from ./chunks.js unless opts.chunks is given (array, or module-like {CHUNKS, isPadClean}).
// Map helpers (gridToRoom, withBorder) come from ../levelmaker/mapfmt.js, loaded only by roomFor.

const W = 13;
const H = 20;

// Copy of PL.mulberry32 from src/parts/rooms.js (that file is a browser script, so it is not required here).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tierPoolFor(depth) {
  if (depth <= 5) return [1];
  if (depth <= 12) return [1, 2];
  if (depth <= 25) return [2, 3];
  return [3];
}

function resolveChunks(opts) {
  const src = opts && opts.chunks;
  const real = () => require('./chunks.js');
  if (Array.isArray(src)) {
    return {
      CHUNKS: src,
      isPadClean: (opts.isPadClean) || ((rows) => real().isPadClean(rows)),
    };
  }
  const mod = src || real();
  return {
    CHUNKS: mod.CHUNKS,
    isPadClean: opts && opts.isPadClean ? opts.isPadClean : ((rows) => mod.isPadClean(rows)),
  };
}

// Blocked seam: a top-row wall cell. A seam is fine when at least one openBottom column of the
// chunk above is not blocked by the next chunk's top row.
function seamOk(above, below) {
  const top = below.rows[0];
  return above.openBottom.some((c) => top[c] !== '#');
}

const SWAP = { '<': '>', '>': '<' };

function stitchOnce(rng, depth, opts) {
  const { CHUNKS, isPadClean } = resolveChunks(opts || {});
  const pool = tierPoolFor(depth);
  const tierPicked = pool[Math.floor(rng() * pool.length)];

  const usable = CHUNKS.filter((c) => c.tier <= tierPicked && c.h >= 1);
  const entries = usable.filter((c) => c.kind === 'entry' && c.h === 5);
  const exits = usable.filter((c) => c.kind === 'exit' && c.h === 5);
  const mids = usable.filter((c) => c.kind === 'mid');
  if (!entries.length || !exits.length) return null;

  const pickOf = (arr) => arr[Math.floor(rng() * arr.length)];

  // One pick: entry + mids + exit summing to H rows. Returns null when the mids cannot fill the gap.
  const buildOnce = () => {
    const entry = pickOf(entries);
    const exit = pickOf(exits);
    let remaining = H - entry.h - exit.h;
    const seq = [entry];
    while (remaining > 0) {
      const cand = mids.filter((c) => c.h <= remaining && !(c.notLast && c.h === remaining));
      if (!cand.length) return null;
      const m = pickOf(cand);
      seq.push(m);
      remaining -= m.h;
    }
    seq.push(exit);
    return seq;
  };

  const seamsHold = (seq) => {
    for (let i = 0; i + 1 < seq.length; i++) {
      if (!seamOk(seq[i], seq[i + 1])) return false;
    }
    return true;
  };
  const hasPicked = (seq) => seq.some((c) => c.tier === tierPicked);

  // Up to 30 picks: want seams ok and a chunk at the picked tier. Fall back to seams-only, then any.
  let best = null;
  let seamsOnly = null;
  let anyPick = null;
  for (let t = 0; t < 30; t++) {
    const seq = buildOnce();
    if (!seq) continue;
    if (!anyPick) anyPick = seq;
    if (!seamsHold(seq)) continue;
    if (!seamsOnly) seamsOnly = seq;
    if (hasPicked(seq)) { best = seq; break; }
  }
  const seq = best || seamsOnly || anyPick;
  if (!seq) return null;

  const mirrored = rng() < 0.5;
  const flip = (r) => r.split('').reverse().map((ch) => SWAP[ch] || ch).join('');
  // Chunks flagged noMirror (exits: E sits in the one pad-free column) keep their orientation when the rest mirrors.
  let rows = [];
  for (const c of seq) rows = rows.concat(mirrored && !c.noMirror ? c.rows.map(flip) : c.rows);
  if (rows.length !== H || rows.some((r) => r.length !== W)) return null;
  // Mirroring can break a seam next to a noMirror chunk: re-check those on the final grid.
  if (mirrored) {
    let y = 0;
    for (let i = 0; i + 1 < seq.length; i++) {
      y += seq[i].h;
      if (seq[i].noMirror === seq[i + 1].noMirror) continue;
      const above = rows[y - 1], below = rows[y];
      let ok = false;
      for (let c = 0; c < W; c++) if (!'#~=X^v><'.includes(above[c]) && below[c] !== '#') ok = true;
      if (!ok) return null;
    }
  }
  if (!isPadClean(rows)) return null;

  return { rows, chunkIds: seq.map((c) => c.id), mirrored, tierPicked };
}

// A pad break (or a seam broken by mirroring) is a re-roll reason for the stitch itself: draw again from the same rng stream.
const STITCH_TRIES = 24;
function stitchRoom(seed, depth, opts) {
  const rng = mulberry32((seed * 1000003 + depth) >>> 0);
  for (let t = 0; t < STITCH_TRIES; t++) {
    const st = stitchOnce(rng, depth, opts);
    if (st) { st.stitchRerolls = t; return st; }
  }
  return null;
}

function roomFor(seed, depth, opts) {
  const st = stitchRoom(seed, depth, opts);
  if (!st) return null;
  const { gridToRoom, withBorder } = require('../levelmaker/mapfmt.js');
  const room = withBorder(gridToRoom(st.rows, 'gen-' + depth));
  return Object.assign(room, {
    meta: { seed, depth, chunkIds: st.chunkIds, mirrored: st.mirrored, tierPicked: st.tierPicked },
  });
}

module.exports = { stitchRoom, roomFor };
