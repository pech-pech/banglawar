'use strict';
// proto-run.js: endless generator prototype run. Usage:
//   node proto-run.js shard <idx> <nShards> <runFrom> <runTo> <depths csv>   -> out/shard-<idx>.json
//   node proto-run.js merge <nShards>                                         -> out/PROTO-TABLE.md
const fs = require('fs'), path = require('path'), vm = require('vm');
const OUT = path.join(__dirname, 'out');
const MAXTRY = 8;
const TAG = process.env.TAG ? '-' + process.env.TAG : ''; // TAG=run2 -> shard-run2-<i>.json, PROTO-TABLE-run2.md (run 1 files stay)

const { roomBreaks } = require('./padzone.js');
const tierOf = (d) => (d <= 5 ? 1 : d <= 12 ? 2 : d <= 25 ? 3 : 3);

function shard(idx, nSh, r0, r1, depths) {
  const { stitchRoom, roomFor } = require('./stitch.js');
  const { verifyRoom, PL } = require('./verify.js');
  const recs = [];
  for (let rs = r0; rs <= r1; rs++) {
    if (rs % nSh !== idx) continue;
    for (const depth of depths) {
      const rec = { runSeed: rs, depth, tier: tierOf(depth), firstOk: false, rerolls: 0, fallback: false, genMs: [], verifyMs: [], padBreaks: 0, chunkIds: null, tries: [], reasons: [] };
      for (let t = 0; t < MAXTRY; t++) {
        const seed = rs + t;
        const g0 = process.hrtime.bigint();
        let room = null, st = null;
        try { st = stitchRoom(seed, depth); room = st ? roomFor(seed, depth) : null; } catch (e) { room = null; }
        // time stitch only (roomFor re-stitches; measure a standalone stitch call)
        const g1 = process.hrtime.bigint();
        const s0 = process.hrtime.bigint(); try { stitchRoom(seed, depth); } catch (e) {} const s1 = process.hrtime.bigint();
        rec.genMs.push(Number(s1 - s0) / 1e6);
        const why = [];
        let v = null, padN = 0, pk = [];
        if (!room) why.push('stitch-null');
        else {
          const pb = roomBreaks(room); padN = pb.length; pk = pb;
          const t0 = Date.now();
          try { v = verifyRoom.fast(room, { tier: tierOf(depth) }); } catch (e) { why.push('verify-throw'); }
          rec.verifyMs.push(Date.now() - t0);
          if (v) {
            if (!v.solvable) why.push('unsolvable');
            else { if (!v.windowOk) why.push('window'); if (!v.jitterOk) why.push('jitter'); }
            for (const f of v.features || []) why.push('feature:' + (typeof f === 'string' ? f : JSON.stringify(f)).slice(0, 60));
          }
        }
        const chunkIds = st ? st.chunkIds : null;
        rec.tries.push({ seed, chunkIds, why, pad: pk });
        if (!why.length || t === MAXTRY - 1) { rec.padBreaks = padN; rec.padKinds = pk; }
        if (!why.length) { rec.rerolls = t; rec.firstOk = t === 0; rec.chunkIds = chunkIds; rec.accepted = { rows: st.rows, inputs: v.inputs, route: v.route }; break; }
        if (t === 0) rec.reasons = why;
        if (t === MAXTRY - 1) { rec.fallback = true; rec.rerolls = MAXTRY; rec.chunkIds = chunkIds; }
      }
      recs.push(rec);
      process.stderr.write(`[${idx}] seed ${rs} d${depth} rerolls=${rec.rerolls}${rec.fallback ? ' FALLBACK' : ''}\n`);
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `shard${TAG}-${idx}.json`), JSON.stringify(recs));
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const max = (a) => (a.length ? Math.max(...a) : 0);
const pct = (n, d) => (d ? (100 * n / d).toFixed(1) + '%' : 'n/a');
function top(map, n) { return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v})`).join('; ') || 'none'; }

function merge(nSh) {
  const all = [];
  for (let i = 0; i < nSh; i++) { const f = path.join(OUT, `shard${TAG}-${i}.json`); if (fs.existsSync(f)) all.push(...JSON.parse(fs.readFileSync(f, 'utf8'))); }
  const groups = [[1], [2], [3], [1, 2, 3]];
  const lines = ['# Endless generator proto: results'+(TAG?' ('+TAG.slice(1)+')':''), '', `Rooms: ${all.length} (runSeeds x depths), verifyRoom.fast, up to ${MAXTRY} tries (seed+1 re-roll), then fallback.`, ''];
  const chunkTry = new Map(), chunkFail = new Map();
  for (const r of all) for (const t of r.tries) for (const id of new Set(t.chunkIds || [])) {
    chunkTry.set(id, (chunkTry.get(id) || 0) + 1);
    if (t.why.length) chunkFail.set(id, (chunkFail.get(id) || 0) + 1);
  }
  for (const g of groups) {
    const rs = all.filter((r) => g.includes(r.tier));
    const name = g.length === 1 ? `Tier ${g[0]}` : 'Total';
    const reasons = new Map(), allTries = rs.flatMap((r) => r.tries);
    allTries.forEach((t) => t.why.forEach((w) => reasons.set(w, (reasons.get(w) || 0) + 1)));
    const gen = rs.flatMap((r) => r.genMs), ver = rs.flatMap((r) => r.verifyMs);
    const pads = rs.reduce((a, r) => a + r.padBreaks, 0), padRooms = rs.filter((r) => r.padBreaks).length, pk = new Map(); rs.forEach((r) => (r.padKinds || []).forEach((k) => pk.set(k, (pk.get(k) || 0) + 1)));
    lines.push(`## ${name} (${rs.length} rooms, ${allTries.length} attempts)`, '', '| metric | value |', '|---|---|',
      `| solvable+ok first try | ${pct(rs.filter((r) => r.firstOk).length, rs.length)} |`,
      `| accepted within ${MAXTRY} tries | ${pct(rs.filter((r) => !r.fallback).length, rs.length)} (${rs.filter((r) => r.fallback).length} fallback) |`,
      `| re-rolls mean / max | ${mean(rs.map((r) => r.rerolls)).toFixed(2)} / ${max(rs.map((r) => r.rerolls))} |`,
      `| stitch ms mean / max | ${mean(gen).toFixed(2)} / ${max(gen).toFixed(2)} |`,
      `| verify s mean / max (offline) | ${(mean(ver) / 1000).toFixed(2)} / ${(max(ver) / 1000).toFixed(2)} |`,
      `| pad-zone breaks (final room; rooms affected) | ${pads} (${padRooms} rooms; ${top(pk, 6)}) |`,
      `| top fail reasons (attempt count) | ${top(reasons, 6)} |`, '');
  }
  const cs = [...chunkTry.keys()].map((id) => ({ id, n: chunkTry.get(id), f: chunkFail.get(id) || 0 })).filter((c) => c.n >= 5).sort((a, b) => b.f / b.n - a.f / a.n);
  lines.push('## Chunks by fail rate (attempts containing the chunk that failed; min 5 attempts)', '', '| chunk | attempts | fails | rate |', '|---|---|---|---|');
  cs.slice(0, 15).forEach((c) => lines.push(`| ${c.id} | ${c.n} | ${c.f} | ${(100 * c.f / c.n).toFixed(1)}% |`));
  lines.push('', '## Pass bar', '');
  const tot = all.filter(() => true);
  const okRate = tot.filter((r) => !r.fallback).length / (tot.length || 1);
  const stitchMax = max(tot.flatMap((r) => r.genMs)), stitchMean = mean(tot.flatMap((r) => r.genMs));
  const pads = tot.reduce((a, r) => a + r.padBreaks, 0);
  lines.push(`- 95%+ within ${MAXTRY} re-rolls: ${(100 * okRate).toFixed(1)}% -> ${okRate >= 0.95 ? 'PASS' : 'FAIL'}`, `- 0 pad breaks: ${pads} -> ${pads === 0 ? 'PASS' : 'FAIL'}`, `- stitch < 30 ms: mean ${stitchMean.toFixed(2)}, max ${stitchMax.toFixed(2)} -> ${stitchMax < 30 ? 'PASS' : 'FAIL'}`, '- verify is offline (seconds per room), reported separately above.', '');
  for (const tr of [1, 2, 3]) {
    const r = all.find((x) => x.tier === tr && x.accepted);
    if (!r) { lines.push(`## Sample tier ${tr}: none accepted`, ''); continue; }
    lines.push(`## Sample accepted room, tier ${tr} (run ${r.runSeed}, depth ${r.depth}, re-rolls ${r.rerolls})`, '', `Chunks: ${r.chunkIds.join(', ')}  |  solver route input count: ${r.accepted.inputs}`, '', '```', ...r.accepted.rows, '```', '', `Route: ${JSON.stringify(r.accepted.route).slice(0, 300)}`, '');
  }
  fs.writeFileSync(path.join(OUT, `PROTO-TABLE${TAG}.md`), lines.join('\n') + '\n');
  console.log(lines.slice(0, 40).join('\n'));
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'shard') shard(+a[0], +a[1], +a[2], +a[3], a[4].split(',').map(Number));
else if (cmd === 'merge') merge(+a[0]);
else console.log('usage: shard <idx> <n> <runFrom> <runTo> <depths> | merge <n>');
