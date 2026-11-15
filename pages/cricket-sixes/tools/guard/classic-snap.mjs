// GUARD (wheel match build, 2026-11-15): classic-mode bit-identity snapshot.
// Plays N seeded seasons of CLASSIC matches through the store of an app root and hashes every state after each command.
// Classic = an old save with NO matchMode key (variant 'nokey'), plus a few runs with matchMode 'classic' set (variant 'cls').
// Usage:  node tools/guard/classic-snap.mjs <appRoot> [out.json] [N=30]
//   or import { snap } and call snap(appRoot, N) -> { runs: [{ name, steps: [[cmd, rawHash, normHash, stage]] }] }
// normHash strips ONLY the fields the wheel build may add to a classic save: top-level matchMode, dev, wheelLog, mode, and last.wheel.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';

const canon = (x) => {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  return JSON.stringify(x === undefined ? null : x);
};
const h = (x) => createHash('sha1').update(canon(x)).digest('hex').slice(0, 16);
export const STRIP_TOP = ['matchMode', 'dev', 'wheelLog', 'mode'];
export function norm(s) {
  if (!s || typeof s !== 'object') return s;
  const o = { ...s };
  for (const k of STRIP_TOP) delete o[k];
  if (o.last && typeof o.last === 'object' && 'wheel' in o.last) { o.last = { ...o.last }; delete o.last.wheel; }
  return o;
}
export const hashes = (s) => [h(s), h(norm(s))];

async function loadStore(root) {
  const u = pathToFileURL(join(resolve(root), 'js/store/store.js')).href + '?g=' + Date.now();
  return (await import(u)).createStore;
}

/** One season-bot step (copy of test/_season-bot.mjs, with call/intent variety). Returns false at a terminal stage. */
function step(T, v, opts) {
  const s = T.get();
  const d = (c, p) => T.d(c, p);
  switch (s.stage) {
    case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
    case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
    case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); break;
    case 'bowl':
      if (opts.calls) d('MakeCall', { bowler: (s.inn1.over + v) % 6, field: (s.inn1.over + v) % 2 ? 'A' : 'P' });
      d('BowlOver'); break;
    case 'break': d('StartChase'); break;
    case 'chase': d('BowlOver', { intent: ['R', 'A', 'D'][(s.inn2.over + v) % 3] }); break;
    case 'done': d('FinishMatch'); break;
    case 'train':
      if (opts.drills) { d('SetTrainPlan', { focus: v % 2 ? 'bowl' : 'bat', effort: 'normal', coachId: s.coaches[0] && s.coaches[0].id }); d('RunNets'); }
      d('EndWeek'); break;
    case 'week': d('NextWeek'); break;
    case 'end': if (opts.seasons > 1 && s.season && s.season.n < opts.seasons) { d('NewSeason'); break; } return false;
    default: return false;
  }
  return true;
}

export async function snap(root, N = 30, cap = null) {
  const createStore = await loadStore(root);
  const runs = [];
  const play = (name, init, opts) => {
    if (cap && cap.name !== name) return;
    const steps = [];
    const st = createStore(init);
    const T = { get: st.get, d: (c, p) => { st.dispatch(c, p); if (cap && steps.length === cap.idx) cap.state = st.get(); steps.push([c, ...hashes(st.get()), st.get() && st.get().stage]); } };
    steps.push(['init', ...hashes(st.get()), st.get() && st.get().stage]);
    let g = 0;
    while (g++ < 8000 && step(T, opts.v, opts)) { /* go */ }
    runs.push({ name, steps });
  };
  for (let i = 0; i < N; i++) {
    const seed = `guard-${i}`;
    const t = createStore(null); t.dispatch('NewGame', { seed });
    const old = { ...t.get() }; delete old.matchMode; delete old.dev; // old save: no matchMode key
    const opts = { v: i, calls: i % 2 === 1, drills: i % 3 !== 2, seasons: i % 10 === 0 ? 2 : 1 };
    play(`nokey:${seed}`, JSON.parse(JSON.stringify(old)), opts);
    if (i < 5) play(`cls:${seed}`, JSON.parse(JSON.stringify({ ...old, matchMode: 'classic' })), opts);
  }
  // Step-0 friendly (main.js fallback path): NewMatch with no save.
  for (let i = 0; i < 5; i++) {
    if (cap && cap.name !== `friendly:${i}`) continue;
    const steps = []; const st = createStore(null);
    const d = (c, p) => { st.dispatch(c, p); if (cap && steps.length === cap.idx) cap.state = st.get(); steps.push([c, ...hashes(st.get()), st.get() && st.get().stage]); };
    d('NewMatch', { seed: `guard-f${i}` });
    let g = 0;
    while (g++ < 50 && st.get() && ['bowl', 'break', 'chase'].includes(st.get().stage)) {
      const s = st.get();
      if (s.stage === 'break') d('StartChase'); else d('BowlOver', { intent: ['R', 'A', 'D'][g % 3] });
    }
    runs.push({ name: `friendly:${i}`, steps });
  }
  return { root: resolve(root), N, runs };
}

/** The state of run `name` right after step `idx` (idx 0 = init is not captured; use idx >= 1). */
export async function stateAt(root, name, idx, N = 30) { const cap = { name, idx, state: undefined }; await snap(root, N, cap); return cap.state; }

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || '.'; const out = process.argv[3]; const N = +(process.argv[4] || 30);
  const r = await snap(root, N);
  const total = r.runs.reduce((a, x) => a + x.steps.length, 0);
  if (out) writeFileSync(out, JSON.stringify(r));
  console.log(`classic-snap: ${r.runs.length} runs, ${total} states hashed${out ? ' -> ' + out : ''}`);
}
