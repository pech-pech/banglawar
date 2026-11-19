// rooms-audit.js: static + degenerate-route audit of the shaft rooms. Usage: node rooms-audit.js   (env SHAFTS=300 N override, LOCKSEEDS=30)
// 1. static rules over SHAFTS seeded shafts per length (5, 7) + daily climbs for 30 days from 2026-11-19 (length 5).
// 2. degenerate routes: zero input / hold one direction / dive spam / one flip then nothing => must NOT win.
// 3. soft lock: 20 s of random play, alive + unfinished + moved < 20 px in the last 10 s.
// 4. hazard presence counts across shafts.
const wp = require('./window-probe.js');
const { featureIssues } = require('./jitter-bot.js');
const PL = wp.PL;
const NS = +(process.env.SHAFTS || 300), LS = +(process.env.LOCKSEEDS || 30);
let fails = 0;
const bad = (m) => { fails++; if (fails <= 60) console.log('FAIL ' + m); };
const LIVE = PL.TEMPLATES.filter((t) => !t.tutorial && !t.retired);
const PEND = new Set(['t12', 't19']);
console.log('live templates by tier: ' + [1, 2, 3].map((k) => k + ':' + LIVE.filter((t) => t.tier === k).map((t) => t.id).join(',')).join('  '));
for (const k of [1, 2, 3]) if (LIVE.filter((t) => t.tier === k).length < 4) bad('tier ' + k + ' has < 4 live templates');
const SLOTTIER = { 5: [1, 1, 2, 3, 2], 7: [1, 1, 2, 2, 3, 3, 2] };
const haz = { rooms: 0, crusher: 0, crumble: 0, gate: 0, spike: 0, none: 0 };
const perTpl = {}, slotTierViol = {}, featViol = {};
function checkShaft(label, seed, n) {
  const sh = PL.buildShaft(seed, n);
  if (sh.length !== n) bad(label + ' length ' + sh.length);
  const ids = sh.map((r) => r.templateId);
  if (new Set(ids).size !== n) bad(label + ' repeated template ' + ids);
  sh.forEach((r, i) => {
    const t = PL.TEMPLATES.find((x) => x.id === r.templateId);
    if (t.tutorial || t.retired) bad(label + ' tutorial/retired in shaft ' + r.templateId);
    if (i && ids[i] === ids[i - 1]) bad(label + ' back to back ' + ids[i]);
    if (i && sh[i - 1].family === r.family) { slotTierViol.family = (slotTierViol.family || 0) + 1; }
    const want = SLOTTIER[n] && SLOTTIER[n][i];
    if (want && r.tier !== want) { const k = n + ':slot' + i + ' wants T' + want + ' got ' + r.templateId + '(T' + r.tier + ')'; slotTierViol[k] = (slotTierViol[k] || 0) + 1; }
    for (const s of r.spikes) {
      const e = r.exit, q = s.r, dx = Math.max(q[0] - e.x, 0, e.x - (q[0] + q[2])), dy = Math.max(q[1] - e.y, 0, e.y - (q[1] + q[3]));
      if (Math.hypot(dx, dy) < 22) bad(label + ' exit near spikes ' + r.templateId);
    }
    for (const f of featureIssues(r)) { const k = r.templateId + ': ' + f; featViol[k] = (featViol[k] || 0) + 1; }
    haz.rooms++;
    const h = { crusher: r.crushers.length > 0, crumble: r.crumbles.length > 0, gate: r.gates.length > 0, spike: r.spikes.length > 0 };
    for (const k in h) if (h[k]) haz[k]++;
    if (!Object.values(h).some(Boolean)) haz.none++;
    perTpl[r.templateId] = (perTpl[r.templateId] || 0) + 1;
  });
  return ids;
}
for (const n of [5, 7]) for (let s = 1; s <= NS; s++) checkShaft('n' + n + ' seed' + s, s, n);
const d0 = new Date(Date.UTC(2026, 10, 19));
for (let d = 0; d < 30; d++) { const t = new Date(d0.getTime() + d * 864e5); const seed = t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate(); checkShaft('daily' + seed, seed, 5); }
console.log('static: ' + fails + ' hard failures');
console.log('slot-tier / family deviations (count of rooms): ' + JSON.stringify(slotTierViol));
console.log('feature violations (rooms across shafts): ' + JSON.stringify(featViol));
console.log('template use over ' + 2 * NS + ' shafts + 30 dailies: ' + JSON.stringify(perTpl));
console.log('HAZARDS rooms=' + haz.rooms + ' crusher=' + haz.crusher + ' crumble=' + haz.crumble + ' gate=' + haz.gate + ' spike=' + haz.spike + ' none=' + haz.none);

// 2/3: per template, unmirrored + mirrored
function run(room, plan, ticks) {
  const s = PL.newState(room); const pos = [];
  for (let t = 0; t < ticks && !s.won && !s.dead; t++) { const inp = plan(t, s); PL.step(s, inp || []); pos.push([s.x, s.y]); }
  return { s, pos };
}
const out = [];
for (const t of LIVE) {
  for (const mir of [false, true]) {
    for (const sd of [1, 2, 3]) {
      let room = t.make(PL.mulberry32(sd)); if (mir) room = PL.mirrorRoom(room);
      const tag = t.id + (mir ? 'm' : '') + ' phase-seed' + sd;
      const strat = { none: () => null };
      for (let d = 0; d < 4; d++) strat['hold' + d] = (tk) => (tk % 6 === 0 ? [{ k: 'flip', dir: d }] : null);
      strat.dive = (tk) => (tk % 4 === 0 ? [{ k: 'dive' }] : null);
      for (let d = 0; d < 4; d++) for (let t0 = 0; t0 < 600; t0 += 15) strat['one' + d + '@' + t0] = (tk) => (tk === t0 ? [{ k: 'flip', dir: d }] : null);
      for (const [name, f] of Object.entries(strat)) { const r = run(room, f, 3000); if (r.s.won) out.push('TRIVIAL ' + tag + ' by ' + name); }
      for (let k = 0; k < LS; k++) {
        const rng = PL.mulberry32(9000 + k * 13 + sd);
        const r = run(room, () => (rng() < 0.03 ? [rng() < 0.2 ? { k: 'dive' } : { k: 'flip', dir: Math.floor(rng() * 4) }] : null), 2400);
        if (!r.s.won && !r.s.dead && r.pos.length >= 2400) {
          const last = r.pos.slice(-1200); const xs = last.map((p) => p[0]), ys = last.map((p) => p[1]);
          const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          if (span < 20) out.push('SOFTLOCK? ' + tag + ' rng-seed ' + (9000 + k * 13 + sd) + ' span ' + span.toFixed(1) + ' at ' + r.pos.at(-1).map(Math.round));
        }
      }
    }
  }
}
const uniq = [...new Set(out)];
console.log('degenerate/softlock findings: ' + uniq.length); uniq.slice(0, 80).forEach((x) => console.log('  ' + x));
console.log(fails ? 'AUDIT FAIL' : 'AUDIT STATIC OK');
process.exit(fails ? 1 : 0);
