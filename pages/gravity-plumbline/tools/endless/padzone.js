'use strict';
// padzone.js: real touch-pad dead zone in room coords, same logic as src/test/pad-corner.js (full pad box + Retry ring; right and left pad).
// zones(VW=475, VH=638) -> { R: [[x,y,w,h]...], L: [...], scale }. roomBreaks(room, VW, VH) -> ['start','exit','spike',...] (one entry per hit).
// cells(VW, VH) -> { R: Set of 'c,r', L: Set, both } grid cells (MAP-FORMAT: cell (c,r) = x 12+24c, y 12+24r) any zone touches.
const fs = require('fs'), path = require('path'), vm = require('vm');
let PLref = null;
function PL() {
  if (PLref) return PLref;
  const { PL: P } = require('./verify.js'); // sets up the PL global used by src/parts
  for (const f of ['camera', 'input']) vm.runInThisContext('(function(){' + fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'parts', f + '.js'), 'utf8') + '\n})()', { filename: f });
  return (PLref = P);
}
const cache = {};
function zones(VW = 475, VH = 638) {
  const key = VW + 'x' + VH;
  if (cache[key]) return cache[key];
  const P = PL();
  const fit = P.camFit({ room: { w: 336, h: 500 }, w: 336, h: 500 }, { W: VW, H: VH, mode: 'overlay' });
  const rr = fit.roomRect, sc = fit.scale;
  const toRoom = (r) => [Math.max(0, (r.x - rr.x) / sc), Math.max(0, (r.y - rr.y) / sc), r.w / sc, r.h / sc];
  const clip = (z) => [z[0], z[1], Math.min(336, z[0] + z[2]) - z[0], Math.min(500, z[1] + z[3]) - z[1]];
  const out = { scale: sc };
  for (const [side, ps] of [['R', 0], ['L', 1]]) {
    P.Tweak = { get: (id) => (id === 'PAD_SIDE' ? ps : undefined) };
    const L = P.Input.layout(VW, VH, { hand: 'right' });
    out[side] = [clip(toRoom(L.box)), clip(toRoom({ x: L.retry.x, y: L.retry.y, w: L.retry.w, h: L.retry.h }))];
  }
  P.Tweak = undefined;
  return (cache[key] = out);
}
const ov = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
function roomBreaks(room, VW, VH) {
  const Z = zones(VW, VH), HERO = 11, n = [];
  for (const side of ['R', 'L']) for (const z of Z[side]) {
    if (ov(z, [room.start.x - HERO, room.start.y - HERO, 22, 22])) n.push('start');
    if (ov(z, [room.exit.x - HERO, room.exit.y - HERO, 22, 22])) n.push('exit');
    room.spikes.forEach((s) => { if (ov(z, s.r)) n.push('spike'); });
    room.crushers.forEach((c) => { const [x, y, w, h] = c.r, a = c.amp; if (ov(z, [x - Math.abs(c.ax) * a, y - Math.abs(c.ay) * a, w + 2 * Math.abs(c.ax) * a, h + 2 * Math.abs(c.ay) * a])) n.push('crusher'); });
    room.crumbles.forEach((r) => { if (ov(z, r)) n.push('crumble'); });
    room.gates.forEach((g) => { if (ov(z, g.r)) n.push('gate'); });
  }
  return n;
}
// Cells (c 0..12, r 0..19) whose 24px box overlaps any zone. Conservative for 22px hero boxes: a cell is "in" if its box overlaps.
function cells(VW, VH) {
  const Z = zones(VW, VH), out = { R: new Set(), L: new Set(), both: new Set() };
  for (const side of ['R', 'L']) for (let r = 0; r < 20; r++) for (let c = 0; c < 13; c++) {
    if (Z[side].some((z) => ov(z, [12 + 24 * c, 12 + 24 * r, 24, 24]))) { out[side].add(c + ',' + r); out.both.add(c + ',' + r); }
  }
  return out;
}
module.exports = { zones, roomBreaks, cells };
