// Season bot: plays whole seasons through applyCommand ONLY (no DOM, no storage). Shared by tools/season-sweep.mjs
// and test/determinism-m0.test.mjs. Policies: idle, careless, rote grid (field x intent), skilled, noisy-skilled.
// Every bot decision draws from makeRng(`${seed}|policy`), never from the game's own streams.
import { applyCommand } from '../js/store/commands.js';
import { bowlVM, chaseVM, endVM } from '../js/store/selectors.js';
import { RUN } from '../js/data/run.js';
import { runScore } from '../js/core/run.js';
import { makeRng } from '../js/core/rng.js';
import { skilledBowler, skilledField, skilledIntent } from '../js/core/skilled.js';
import { capSum } from '../js/core/ability.js';

export const ME = 'c0';
const RATINGS = ['bp', 'bs', 'spd', 'bsk'];
const ROLE_RANK = { Opener: 0, Middle: 1, Lower: 2 };
const SIX = 6, OVERS = 10, MAX_STEPS = 4000;

/** True when the store already speaks the season contract (NewGame -> stage 'hub' with a season (p7-first: no coach screen first)). */
export function seasonReady() {
  try {
    const s = applyCommand(null, 'NewGame', { seed: 'probe' });
    return !!(s && s.season && s.stage === 'hub' && Array.isArray(s.clubs));
  } catch (e) { return false; }
}

const mySquad = (s) => s.clubs.find((c) => c.id === ME).squad;
const rsum = (p) => p.bp + p.bs + p.spd + p.bsk;
const bowlPow = (p) => p.spd + p.bsk;

function bestSixIds(s) {
  const six = mySquad(s).slice().sort((a, b) => rsum(b) - rsum(a) || (a.id < b.id ? -1 : 1)).slice(0, SIX);
  six.sort((a, b) => (ROLE_RANK[a.bat] ?? 1) - (ROLE_RANK[b.bat] ?? 1) || (b.bp + b.bs) - (a.bp + a.bs) || (a.id < b.id ? -1 : 1));
  return six.map((p) => p.id);
}

/** Legal plan: the four strongest bowlers of the six get 2 overs, the other two 1; never twice in a row. */
function strongPlan(s, ids, fields) {
  const byId = new Map(mySquad(s).map((p) => [p.id, p]));
  const rank = ids.map((id, i) => i).sort((a, b) => bowlPow(byId.get(ids[b])) - bowlPow(byId.get(ids[a])) || a - b);
  const [b0, b1, b2, b3, b4, b5] = rank;
  return { overs: [b0, b1, b2, b3, b4, b5, b0, b1, b2, b3], fields };
}
const defaultPlan = () => ({ overs: [0, 1, 2, 3, 4, 5, 0, 1, 2, 3], fields: ['A', 'A', 'A'] });
function randomPlan(rng) {
  for (let t = 0; t < 200; t++) {
    const o = rng.shuffle([0, 0, 1, 1, 2, 2, 3, 3, 4, 5]);
    if (o.every((v, i) => i === 0 || v !== o[i - 1])) return { overs: o, fields: [0, 1, 2].map(() => rng.pick(['A', 'P'])) };
  }
  return defaultPlan();
}

/** @typedef {{name:string, rnd?:boolean, six:(s:any,r:any)=>string[], plan:(s:any,r:any,ids:string[])=>any, bowl:(s:any,r:any)=>any, intent:(s:any,r:any)=>string|null, train:'none'|'random'|'all'}} Policy */
const el = (vm) => vm.bowlers.filter((b) => b.eligible);

/** @type {Policy} */
const idle = {
  name: 'idle', six: (s) => mySquad(s).slice(0, SIX).map((p) => p.id), plan: () => defaultPlan(),
  bowl: () => null, intent: () => null, train: 'none',
};
/** @type {Policy} */
const careless = {
  name: 'careless', rnd: true,
  six: (s, r) => r.shuffle(mySquad(s).map((p) => p.id)).slice(0, SIX), plan: (s, r) => randomPlan(r),
  bowl: (s, r) => ({ bowler: r.pick(el(bowlVM(s))).i, field: r.pick(['A', 'P']) }),
  intent: (s, r) => r.pick(['D', 'R', 'A']), train: 'random',
};
/** Fixed field x intent, best six by rating sum, accepts the pre-filled bowling plan (only the field is its own), plays whatever the plan says. */
const rote = (f, i) => /** @type {Policy} */ ({
  name: `rote ${f}/${i}`, six: bestSixIds, plan: (s) => ({ overs: s.plan.overs.slice(), fields: [f, f, f] }), // the game's pre-filled matchup plan, fields as the policy says
  bowl: (s) => (s.call ? { bowler: s.call.bowler, field: f } : null), intent: () => i, train: 'none',
});
/** @type {Policy} */
const skilled = {
  name: 'skilled', six: bestSixIds, plan: (s, r, ids) => strongPlan(s, ids, ['A', 'P', 'A']),
  bowl: (s) => ({ bowler: skilledBowler(s, bowlVM(s)), field: skilledField(s) }),
  intent: (s) => skilledIntent(s, chaseVM(s)), train: 'all',
};
/** @type {Policy} */
const noisy = {
  name: 'noisy-skilled (20%)', rnd: true, six: bestSixIds, plan: skilled.plan,
  bowl: (s, r) => (r.random() < 0.2 ? { bowler: r.pick(el(bowlVM(s))).i, field: r.pick(['A', 'P']) } : skilled.bowl(s, r)),
  intent: (s, r) => (r.random() < 0.2 ? r.pick(['D', 'R', 'A']) : skilled.intent(s, r)), train: 'all',
};

export const POLICIES = [idle, careless, ...['A', 'P'].flatMap((f) => ['D', 'R', 'A'].map((i) => rote(f, i))), skilled, noisy];
export const policyByName = (n) => POLICIES.find((p) => p.name === n);

/** Training week: drill (lowest rating that has room) then buy nodes. Returns the new state. */
function trainWeek(s, pol, r) {
  if (pol.train === 'none') return s;
  const squad = mySquad(s);
  const order = pol.train === 'random' ? r.shuffle(squad.map((p) => p.id)) : squad.slice().sort((a, b) => rsum(a) - rsum(b)).map((p) => p.id);
  for (const id of order) {
    const p = mySquad(s).find((x) => x.id === id);
    const drills = pol.train === 'random' ? r.shuffle(RATINGS.slice()) : RATINGS.slice().sort((a, b) => p[a] - p[b]);
    for (const d of drills) {
      const n = applyCommand(s, 'Drill', { playerId: id, drillId: d });
      if (n !== s) { s = n; break; }
    }
  }
  if (pol.train === 'all') {
    for (const id of order.slice().reverse()) {
      const p = mySquad(s).find((x) => x.id === id);
      const owned = p.nodes || { bat: 0, bowl: 0 };
      for (const side of ['bat', 'bowl']) {
        const n = applyCommand(s, 'UnlockNode', { playerId: id, side, node: (owned[side] || 0) + 1 });
        if (n !== s) { s = n; break; }
      }
    }
  }
  return s;
}

/**
 * Play one whole season. Returns {state, steps, matches, errors[], saveChecks, ...metrics}. Never throws for game faults:
 * a thrown error or an unmoving command is recorded in errors and the season stops.
 * @param {string} seed @param {Policy} pol
 * @param {{from?:any, wrap?:Function, unwrap?:Function, stopAt?:(s:any)=>boolean, onState?:(s:any)=>void}} [hooks]
 */
export function playSeason(seed, pol, hooks = {}) {
  const r = makeRng(`${seed}|policy`);
  const errors = [];
  let matches = 0, steps = 0, saveChecks = 0, minTp = Infinity;
  let s = null;
  const cmd = (c, p = {}) => { const n = applyCommand(s, c, p); const moved = n !== s; s = n; return moved; };
  try {
    if (hooks.from) s = hooks.from; // resume a reloaded save (the bot's own rng restarts, so use a policy that draws none)
    else { s = applyCommand(null, 'NewGame', { seed }); s = applyCommand(s, 'Reseed', { salt: '' }); }
    while (s.stage !== 'end' && steps++ < MAX_STEPS) {
      if (hooks.stopAt && hooks.stopAt(s)) break;
      const stage = s.stage, before = s;
      if (s.training && typeof s.training.tp === 'number') minTp = Math.min(minTp, s.training.tp);
      switch (stage) {
        case 'coach': { const c = s.coaches.find((x) => x.candidate); cmd('PickCoach', { coachId: c && c.id }); break; }
        case 'hub': case 'semi': case 'final': cmd('OpenSquad', {}); break;
        case 'squad': cmd('SetSix', { ids: pol.six(s, r) }); break;
        case 'plan': {
          const ids = s.clubs.find((c) => c.id === ME).six && s.clubs.find((c) => c.id === ME).six.length === SIX ? s.clubs.find((c) => c.id === ME).six : null;
          if (!cmd('SetPlan', pol.plan(s, r, ids || bestSixIds(s)))) break;
          if (cmd('NewMatch', {})) matches++;
          break;
        }
        case 'bowl': {
          const c = pol.bowl(s, r);
          if (c) cmd('MakeCall', c);
          cmd('BowlOver', {});
          break;
        }
        case 'break': cmd('StartChase', {}); break;
        case 'chase': cmd('BowlOver', { intent: pol.intent(s, r) || 'R' }); break;
        case 'done': cmd('FinishMatch', {}); break;
        case 'train': s = trainWeek(s, pol, r); cmd('EndWeek', {}); break;
        case 'week':
          if (hooks.wrap && hooks.unwrap) {
            const back = hooks.unwrap(JSON.stringify(hooks.wrap(s)));
            saveChecks++;
            if (!back.ok || JSON.stringify(back.state) !== JSON.stringify(s)) errors.push(`save round trip differs at week ${s.training && s.training.week}`);
          }
          cmd('NextWeek', {});
          break;
        default: errors.push(`unknown stage ${stage}`); steps = MAX_STEPS;
      }
      if (hooks.onState) hooks.onState(s);
      if (s === before && stage !== 'plan') { errors.push(`command did not move stage ${stage} (invalid pick?)`); break; }
      if (s === before && stage === 'plan') { errors.push('SetPlan or NewMatch rejected a plan the bot thought legal'); break; }
    }
    if (s.stage !== 'end' && !(hooks.stopAt && hooks.stopAt(s))) errors.push(`season did not end (stage ${s.stage}, steps ${steps})`);
  } catch (e) { errors.push(`threw: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`); }
  return { state: s, steps, matches, errors, saveChecks, minTp, ...(s && s.season ? checkSeason(s, errors) : {}) };
}

/** Table sums, TP, ratings, caps. Pushes faults into errors; returns the metrics. */
export function checkSeason(s, errors) {
  const T = s.season.table;
  const sum = (k) => T.reduce((a, r) => a + r[k], 0);
  const league = (s.season.results || []).filter((x) => x.kind === 'league');
  if (league.length !== 45) errors.push(`league results ${league.length}, want 45`);
  if (s.stage === 'end') {
    if (sum('p') !== 90) errors.push(`table p sums to ${sum('p')}, want 90`);
    if (sum('pts') !== 90) errors.push(`table pts sums to ${sum('pts')}, want 90`);
    if (sum('w') !== sum('l')) errors.push(`wins ${sum('w')} != losses ${sum('l')}`);
    if (sum('w') + sum('l') + sum('t') !== sum('p')) errors.push('w+l+t != p');
    if (sum('rf') !== sum('ra')) errors.push(`rf ${sum('rf')} != ra ${sum('ra')}`);
  }
  if (s.training && s.training.tp < 0) errors.push(`TP below 0: ${s.training.tp}`);
  for (const c of s.clubs) for (const p of c.squad) {
    for (const k of RATINGS) if (!Number.isInteger(p[k]) || p[k] < 1 || p[k] > 99) errors.push(`${p.id} ${k}=${p[k]} outside 1..99`);
    if (c.id === ME && rsum(p) > capSum(p.potential)) errors.push(`${p.id} sum ${rsum(p)} above cap ${capSum(p.potential)}`);
  }
  const order = T.slice().sort((a, b) => b.pts - a.pts || (b.rf - b.ra) - (a.rf - a.ra) || b.w - a.w || (a.id < b.id ? -1 : 1));
  const place = order.findIndex((x) => x.id === ME) + 1;
  const me = T.find((x) => x.id === ME);
  const played = (s.season.results || []).filter((x) => x.a === ME || x.b === ME).length;
  return { place, pts: me ? me.pts : 0, wins: me ? me.w : 0, top4: place >= 1 && place <= 4, champion: s.season.champion === ME, myMatches: played };
}

/**
 * Play a whole run (RUN.seasons seasons) through applyCommand only: season, end screen, NewSeason, ... RunEnd.
 * Each season's bot draws come from `${seed}|r<n>`. Returns {state, seasons[{n, league, place, promoted}], reachedL5, bestLeague, score, errors[]}.
 * @param {string} seed @param {Policy} pol
 */
export function playRun(seed, pol) {
  const errors = [], seasons = [];
  let s = null;
  for (let n = 1; n <= 40; n++) {
    const r = playSeason(`${seed}|r${n}`, pol, s ? { from: s } : {});
    errors.push(...r.errors);
    s = r.state;
    if (r.errors.length || !s || s.stage !== 'end') break;
    const e = endResult(s);
    seasons.push({ n: s.season.n, league: s.season.league, place: e.place, promoted: e.promoted });
    const next = applyCommand(s, s.season.n >= (s.run ? RUN.seasons : 0) ? 'RunEnd' : 'NewSeason', {});
    if (next === s) { errors.push(`end screen did not move at season ${s.season.n}`); break; }
    s = next;
    if (s.stage === 'runend') break;
  }
  const run = s && s.run;
  return { state: s, seasons, reachedL5: !!run && run.best >= 5, bestLeague: run ? run.best : 0, score: s && s.stage === 'runend' ? runScore(s).score : null, errors };
}
const endResult = (s) => { const v = endVM(s); return { place: v.result.place, promoted: v.result.promoted }; };
