// jitter-bot.js: replays the loosest found route (window-probe.js) with human-like noise.
//  plan run : each input shifted by uniform +-40 ms (= +-4.8 ticks, rounded) and, for every input after the first,
//             3% chance of a wrong key (a random other action: flip 0-3 or dive). 200 seeds per template, mirrored
//             and crusher-phase variants cycled. Pad model: no swipe lag (arrow pad), so only timing + wrong key.
//  no-plan  : same with +-80 ms. REPORTED ONLY (not a gate).
// Gate: plan run first-try clear >= 80%. Also reports clear with one retry (a fresh draw after a death).
// Also: static feature check (every hazard/gate/crumble/crusher/wall dimension and every gap between solids
//       >= 10 px at scale 0.84 on a 475x638 screen = 11.9 room units) and exit-not-adjacent-to-spikes.
// Usage: node jitter-bot.js [ids...] ; env SEEDS=200 N override; env JSON=path writes machine-readable results.
const fs = require('fs');
const wp = require('./window-probe.js');
const { PL, routesFor, variants } = wp;
const NS = +(process.env.NSEEDS || 200);
const MIN_FEATURE = 10 / 0.84; // 11.9 room units

function featureIssues(room) {
  const out = [];
  const small = (r) => Math.min(r[2], r[3]) < MIN_FEATURE - 1e-9;
  room.spikes.forEach((s) => { if (small(s.r)) out.push('spike ' + s.r); });
  room.gates.forEach((g) => { if (small(g.r)) out.push('gate ' + g.r); });
  room.crumbles.forEach((r) => { if (small(r)) out.push('crumble ' + r); });
  room.crushers.forEach((c) => { if (small(c.r)) out.push('crusher ' + c.r); });
  room.walls.slice(4).forEach((r) => { if (small(r)) out.push('wall ' + r); });
  // slivers: facing gap between two solids that overlap in projection, 0 < gap < MIN_FEATURE
  const solids = [...room.walls, ...room.crumbles, ...room.gates.map((g) => g.r), ...room.crushers.map((c) => c.r), ...room.spikes.map((s) => s.r)];
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
    const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
    if (ox > 0) { const g = Math.max(a[1], b[1]) - Math.min(a[1] + a[3], b[1] + b[3]); if (g > 0 && g < MIN_FEATURE) out.push(`gap ${g.toFixed(1)} between ${a} and ${b}`); }
    if (oy > 0) { const g = Math.max(a[0], b[0]) - Math.min(a[0] + a[2], b[0] + b[2]); if (g > 0 && g < MIN_FEATURE) out.push(`gap ${g.toFixed(1)} between ${a} and ${b}`); }
  }
  // exit not adjacent to spikes: exit centre at least one bob (22) from every spike rect
  const e = room.exit;
  for (const s of room.spikes) {
    const r = s.r, dx = Math.max(r[0] - e.x, 0, e.x - (r[0] + r[2])), dy = Math.max(r[1] - e.y, 0, e.y - (r[1] + r[3]));
    if (Math.hypot(dx, dy) < 22) out.push('exit within 22 of spike ' + r);
  }
  return out;
}

const ACTS = [{ k: 'flip', dir: 0 }, { k: 'flip', dir: 1 }, { k: 'flip', dir: 2 }, { k: 'flip', dir: 3 }, { k: 'dive' }];
function noisy(log, rng, jMs, pWrong) {
  const J = jMs / 1000 * 120;
  const out = log.map((e, i) => {
    let a = { k: e.k, dir: e.dir };
    if (i > 0 && rng() < pWrong) {
      const o = ACTS.filter((x) => !(x.k === a.k && x.dir === a.dir));
      a = o[Math.floor(rng() * o.length)];
    }
    return { tick: Math.max(0, e.tick + Math.round((rng() * 2 - 1) * J)), k: a.k, dir: a.dir };
  });
  return out.sort((a, b) => a.tick - b.tick);
}
function attempt(room, log, rng, jMs, lead) {
  const r = PL.replay(room, noisy(log, rng, jMs, 0.03));
  return r.state.won && !r.state.dead ? (r.state.t - lead) / 120 : null;
}
function runTemplate(t) {
  const vs = variants(t);
  const routes = routesFor(t).map(({ v, b }) => (b ? { v, b } : null));
  const res = { id: t.id, tier: t.tier, nVar: vs.length, unsolved: routes.filter((x) => !x).length };
  const ok = routes.filter(Boolean);
  if (!ok.length) return res;
  res.minWindow = Math.min(...ok.map((x) => x.b.min));
  res.inputs = Math.max(...ok.map((x) => x.b.n));
  res.routes = ok.map((x) => ({ mir: x.v.mir, sd: x.v.sd, min: x.b.min, w: x.b.w, log: wp.fmt(x.b.log) }));
  let hs = 0;
  for (const c of t.id) hs = (hs * 31 + c.charCodeAt(0)) >>> 0;
  for (const [name, jMs] of [['plan', 40], ['noplan', 80]]) {
    let first = 0, retry = 0; const times = [];
    for (let k = 0; k < NS; k++) {
      const rt = ok[k % ok.length];
      const f0 = rt.b.log[0].tick; // lead-in removed from the reported time: crusher rooms keep the 0-2.4 s phase wait, others start 0.2 s before the first input
      const lead = rt.v.room.crushers.length ? Math.floor(f0 / 288) * 288 : Math.max(0, f0 - 24);
      const rng = PL.mulberry32(k * 104729 + hs);
      const t1 = attempt(rt.v.room, rt.b.log, rng, jMs, lead);
      if (t1 !== null) { first++; retry++; times.push(t1); } else if (attempt(rt.v.room, rt.b.log, rng, jMs, lead) !== null) retry++;
    }
    times.sort((a, b) => a - b);
    res[name] = { first: first / NS, retry: retry / NS, medianS: times.length ? times[times.length >> 1] : null };
  }
  const feat = new Set();
  for (const v of vs.slice(0, 1)) for (const i of featureIssues(v.room)) feat.add(i);
  res.features = [...feat];
  return res;
}
// Medal bands: bot median clear time per template (plan run) summed over the rooms of seeded shafts (seeds 1..400).
// env BANDS=a.json,b.json (files written by JSON=...). Prints median/p10/p90 bot total per shaft length and the proposed bands.
function bands(rows) {
  const med = {}; for (const r of rows) if (r.plan && r.plan.medianS != null) med[r.id] = r.plan.medianS;
  const PER_ROOM_OVERHEAD = 4; // seconds per room a human spends reading the room before the first input (ASSUMPTION, no human data)
  const MULT = { top: 1.0, gold: 1.5, silver: 2.2, bronze: 3.5 }; // multipliers on (bot total + overhead): ASSUMPTIONS, to retune on a real playtest
  for (const n of [5, 7]) {
    const tot = [];
    for (let sd = 1; sd <= 400; sd++) tot.push(PL.buildShaft(sd, n).reduce((a, r) => a + (med[r.templateId] ?? 0), 0));
    tot.sort((a, b) => a - b);
    const q = (p) => tot[Math.floor(p * (tot.length - 1))];
    const base = q(0.5) + n * PER_ROOM_OVERHEAD;
    console.log(`n=${n}: bot median total ${q(0.5).toFixed(1)} s (p10 ${q(0.1).toFixed(1)}, p90 ${q(0.9).toFixed(1)}); + ${PER_ROOM_OVERHEAD} s x ${n} rooms = base ${base.toFixed(1)} s; bands top ${Math.round(base * MULT.top)} gold ${Math.round(base * MULT.gold)} silver ${Math.round(base * MULT.silver)} bronze ${Math.round(base * MULT.bronze)}`);
  }
}
module.exports = { featureIssues, runTemplate, noisy, bands };

if (require.main === module) {
  const only = process.argv.slice(2);
  const rows = [];
  console.log('id   tier minWin inputs | plan(+-40ms,3% wrong) first retry medS | noplan(+-80ms) first retry | features');
  for (const t of PL.TEMPLATES) {
    if (only.length && !only.includes(t.id)) continue;
    const r = runTemplate(t); rows.push(r);
    const f = (x) => (x * 100).toFixed(0).padStart(3) + '%';
    console.log(`${t.id.padEnd(5)}${String(t.tier).padEnd(5)}${String(r.minWindow ?? '-').padEnd(7)}${String(r.inputs ?? '-').padEnd(7)}| ${r.plan ? f(r.plan.first) + ' ' + f(r.plan.retry) + ' ' + (r.plan.medianS ?? 0).toFixed(2) + 's' : 'UNSOLVED'} | ${r.noplan ? f(r.noplan.first) + ' ' + f(r.noplan.retry) : ''} | ${r.features ? (r.features.length ? r.features.join('; ') : 'ok') : ''}${r.unsolved ? ' UNSOLVED variants ' + r.unsolved : ''}`);
  }
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(rows, null, 1));
  if (process.env.BANDS) bands(process.env.BANDS.split(',').flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8'))));
}
