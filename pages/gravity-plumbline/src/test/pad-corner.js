// pad-corner.js: room corner rule. The touch pad (45% opacity) overlays the room's bottom-right corner (bottom-left for a
// left-hand / PAD_SIDE=1 pad). Rooms must keep that "dead zone" clear of hazards, start and exit; the hero PATH may pass
// under the pad (reported as % of path ticks inside, warn above 15%).
// Zones computed from PL.camFit + PL.Input.layout (pad box and the Retry ring + caption). Env: VW/VH view size, MD=path writes the table.
// Usage: node pad-corner.js [ids...]   exit code 1 on any hard fail.
const fs = require('fs');
const wp = require('./window-probe.js');
const { PL, routesFor } = wp;
const fs0 = require('fs'), path0 = require('path'), vm0 = require('vm');
for (const f of ['camera', 'input']) vm0.runInThisContext('(function(){' + fs0.readFileSync(path0.join(__dirname, '..', 'parts', f + '.js'), 'utf8') + '\n})()', { filename: f });
const HERO = 11; // half box of the bob
// Zones come from the live layout: pad box + Retry ring (with its 16 px caption) mapped through the camera fit (PL.camFit)
// into room coords. Right pad = pad bottom-right + Retry bottom-left; left pad (PAD_SIDE=1) = the mirror image.
const VW = +(process.env.VW || 475), VH = +(process.env.VH || 638);
function liveZones() {
  const fit = PL.camFit({ room: { w: 336, h: 500 }, w: 336, h: 500 }, { W: VW, H: VH, mode: 'overlay' });
  const rr = fit.roomRect, sc = fit.scale;
  const toRoom = (r) => { const x0 = (r.x - rr.x) / sc, y0 = (r.y - rr.y) / sc; return [Math.max(0, x0), Math.max(0, y0), r.w / sc, r.h / sc].map((v, i) => i < 2 ? v : v); };
  const clip = (z) => { const x1 = Math.min(336, z[0] + z[2]), y1 = Math.min(500, z[1] + z[3]); return [z[0], z[1], x1 - z[0], y1 - z[1]]; };
  const out = {};
  for (const [side, ps] of [['R', 0], ['L', 1]]) {
    PL.Tweak = { get: (id) => (id === 'PAD_SIDE' ? ps : undefined) };
    const L = PL.Input.layout(VW, VH, { hand: 'right' });
    const cap = { x: L.retry.x, y: L.retry.y, w: L.retry.w, h: L.retry.h + 16 };
    out[side] = { pad: clip(toRoom(L.box)), retry: clip(toRoom(cap)), keys: [...L.keys, L.dive].map((k) => clip(toRoom(k))) };
  }
  PL.Tweak = undefined;
  return { zones: out, scale: sc, roomRect: rr };
}
const LZ = liveZones();
// KEYS=1: only the 4 arrow keys + Dive (the drawn buttons) instead of the whole pad box (corners between keys are empty glass).
const zs = (z) => (process.env.KEYS ? z.keys : [z.pad]).concat([z.retry]);
const ZONES = { R: zs(LZ.zones.R), L: zs(LZ.zones.L) };
const ov = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const inPt = (x, y, z) => x >= z[0] && x <= z[0] + z[2] && y >= z[1] && y <= z[1] + z[3];
const WARN = 15;

function fullTravel(c) { // swept rect of a crusher over its whole amplitude
  const [x, y, w, h] = c.r, a = c.amp;
  return [x - Math.abs(c.ax) * a, y - Math.abs(c.ay) * a, w + 2 * Math.abs(c.ax) * a, h + 2 * Math.abs(c.ay) * a];
}
function hardFails(room, side) {
  const out = [];
  for (const z of ZONES[side]) hardOne(room, z, out);
  return out;
}
function hardOne(room, z, out) {
  if (ov(z, [room.start.x - HERO, room.start.y - HERO, 22, 22])) out.push('start');
  if (ov(z, [room.exit.x - HERO, room.exit.y - HERO, 22, 22])) out.push('exit');
  room.spikes.forEach((s) => { if (ov(z, s.r)) out.push('spike ' + s.r); });
  room.crushers.forEach((c) => { if (ov(z, fullTravel(c))) out.push('crusher ' + c.r); });
  room.crumbles.forEach((r) => { if (ov(z, r)) out.push('crumble ' + r); });
  room.gates.forEach((g) => { if (ov(z, g.r)) out.push('gate ' + g.r); });
}
function pathPct(room, log) {
  const s = PL.newState(room), L = log.slice().sort((a, b) => a.tick - b.tick);
  let i = 0, n = 0, inR = 0, inL = 0, first = null;
  // skip the lead-in (before the first input) so waiting at the start does not skew the share
  const t0 = L.length ? Math.max(0, L[0].tick - 24) : 0;
  while (s.t < 4000 && !s.won && !s.dead) {
    const inp = [];
    while (i < L.length && L[i].tick <= s.t) { inp.push({ k: L[i].k, dir: L[i].dir }); i++; }
    PL.step(s, inp);
    if (s.t < t0) continue;
    n++; if (ZONES.R.some((z) => inPt(s.x, s.y, z))) inR++; if (ZONES.L.some((z) => inPt(s.x, s.y, z))) inL++;
  }
  return { n, R: n ? 100 * inR / n : 0, L: n ? 100 * inL / n : 0, won: s.won && !s.dead };
}

const rows = [];
const only = process.argv.slice(2);
for (const t of PL.TEMPLATES) {
  if (only.length && !only.includes(t.id)) continue;
  const rt = process.env.STATIC ? wp.variants(t).map((v) => ({ v, b: null })) : routesFor(t); // [{v:{mir,sd,room}, b}]
  const byMir = [0, 1].map((m) => rt.filter((x) => x.v.mir === m));
  for (const m of [0, 1]) {
    const set = byMir[m];
    const fails = { R: new Set(), L: new Set() }; let pR = 0, pL = 0, unsolved = 0, sampled = 0;
    for (const { v, b } of set) {
      for (const side of ['R', 'L']) hardFails(v.room, side).forEach((f) => fails[side].add(f));
      if (process.env.STATIC) continue; if (!b) { unsolved++; continue; }
      const p = pathPct(v.room, b.log); sampled++;
      if (!p.won) unsolved++;
      pR = Math.max(pR, p.R); pL = Math.max(pL, p.L);
    }
    rows.push({ id: t.id, tier: t.tier, mir: m, fR: [...fails.R], fL: [...fails.L], pR, pL, unsolved, sampled });
  }
}
const fmtF = (a) => (a.length ? 'FAIL ' + a.join('; ') : 'ok');
const lines = ['| room | mirror | right pad hazards | left pad hazards | path in R zone % | path in L zone % | flag |', '|---|---|---|---|---|---|---|'];
let hard = 0;
for (const r of rows) {
  const flags = [];
  if (r.fR.length || r.fL.length) { flags.push('HARD'); hard++; }
  if (r.pR > WARN) flags.push('warn R path'); if (r.pL > WARN) flags.push('warn L path');
  if (r.unsolved) flags.push('unsolved variants ' + r.unsolved);
  lines.push(`| ${r.id} (T${r.tier}) | ${r.mir ? 'M' : 'U'} | ${fmtF(r.fR)} | ${fmtF(r.fL)} | ${r.pR.toFixed(1)} | ${r.pL.toFixed(1)} | ${flags.join(', ') || 'ok'} |`);
}
const zf = (z) => z.map((q) => '[' + q.map((v) => v.toFixed(0)).join(',') + ']').join(' + ');
console.log(`live zones at ${VW}x${VH} (scale ${LZ.scale.toFixed(3)}), room x,y,w,h: right pad ${zf(ZONES.R)}; left pad ${zf(ZONES.L)}; warn path > ${WARN}%`);
console.log(lines.join('\n'));
console.log(hard ? `PAD CORNER FAIL: ${hard} room/mirror rows with hard fails` : 'PAD CORNER OK');
if (process.env.MD) fs.writeFileSync(process.env.MD, lines.join('\n') + '\n');
process.exit(hard ? 1 : 0);
