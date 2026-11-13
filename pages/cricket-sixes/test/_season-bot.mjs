// Shared helper (not a test file): plays a whole season through the store with plain commands.
import { createStore } from '../js/store/store.js';

export function newGame(seed = 'bot-1') {
  const store = createStore(null);
  store.dispatch('NewGame', { seed });
  return store;
}

/** One step by stage. Returns false when the season is at 'end'. opts.drills = 0 skips the nets. */
export function step(store, opts = {}) {
  const s = store.get();
  const d = (c, p) => store.dispatch(c, p);
  switch (s.stage) {
    case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
    case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
    case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); break;
    case 'bowl': d('BowlOver'); break;
    case 'break': d('StartChase'); break;
    case 'chase': d('BowlOver', { intent: 'R' }); break;
    case 'done': d('FinishMatch'); break;
    case 'train': {
      if (opts.drills !== 0) { d('SetTrainPlan', { focus: 'bat', effort: 'normal', coachId: s.coaches[0] && s.coaches[0].id }); d('RunNets'); }
      d('EndWeek'); break;
    }
    case 'week': d('NextWeek'); break;
    default: return false;
  }
  return true;
}

export function playSeason(store, opts) {
  let g = 0;
  while (g++ < 5000 && step(store, opts)) { /* go */ }
  return store.get();
}
