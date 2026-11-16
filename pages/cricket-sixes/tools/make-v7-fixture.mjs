// Regenerates test/fixtures/v7-save.json: a mid-season-2 v7 save from the season bot, dumped as the game stores it.
//   node tools/make-v7-fixture.mjs            (writes test/fixtures/v7-save.json)
// Seed 'v7fix', policy 'skilled' (draws no bot rng), the app's feature flags on (as js/main.js sets them), Classic match mode.
// Season 1 played whole, NewSeason, then season 2 until 30 results are in; then token nodes + cheap nodes bought, a Spotlight
// spin taken, a coach signed, and play resumes into a fixture in progress (stage 'bowl', 3 overs bowled).
// The file is JSON.stringify(save.exportText-style wrap(state)) = exactly what js/platform/save.js writes to localStorage.
import { writeFileSync } from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
for (const k of ['matchday', 'settled', 'roar', 'activities', 'freePick', 'wheelMeta']) FLAGS[k] = true;
const { playSeason, policyByName } = await import('./season-bot.mjs');
const { applyCommand: A } = await import('../js/store/commands.js');
const { wrap } = await import('../js/core/save-migrate.js');
const { NODES } = await import('../js/data/wheelmeta.js');
const { scoutList } = await import('../js/core/training.js');

export const SEED = 'v7fix';
const pol = policyByName('skilled');
function run(s, stop) {
  for (let g = 0; g < 600; g++) {
    const r = playSeason(SEED, pol, { from: s, stopAt: (x) => x.stage === 'matchday' || x.stage === 'freepick' || stop(x) });
    s = r.state;
    if (stop(s)) return s;
    if (s.stage === 'matchday') { const n = A(s, 'MatchdayGo', {}); if (n === s) throw new Error('matchday stuck'); s = n; }
    else if (s.stage === 'freepick') s = A(s, 'TakeFreePick', { what: 'nets' });
    else throw new Error('stopped at ' + s.stage);
  }
  throw new Error('no end');
}

export function build() {
  let s = A(A(null, 'NewGame', { seed: SEED }), 'Reseed', { salt: '' });
  s = run(s, (x) => x.stage === 'end');
  s = A(s, 'NewSeason', {});
  s = run(s, (x) => x.stage === 'train' && x.wheelMeta.tally >= 52); // tier 3 (tally 50) opens the token nodes
  for (const id of ['f_respin', 'f_nudge', 'f_respin']) s = A(s, 'BuyNode', { id }); // tokens first
  for (const n of NODES.slice().sort((a, b) => a.tier - b.tier || a.cost[0] - b.cost[0])) s = A(s, 'BuyNode', { id: n.id });
  s = A(s, 'SetTrainPlan', { focus: 'bal', effort: 'normal', spotlightId: s.clubs[0].squad[0].id });
  s = A(s, 'Spin', {});
  const cand = scoutList(s)[0];
  if (cand) s = A(s, 'SignCoach', { coachId: cand.id });
  // resume into a fixture in progress: finish the week, then stop mid-match
  s = run(s, (x) => x.stage === 'bowl' && x.inn1 && Array.isArray(x.inn1.overs) ? x.inn1.overs.length >= 3 : false);
  return s;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = build();
  const out = new URL('../test/fixtures/v7-save.json', import.meta.url);
  writeFileSync(out, JSON.stringify(wrap(s))); // = createSave().save(): JSON.stringify(wrap(state)) under localStorage 'cs.save.1'
  console.log('wrote', out.pathname, s.stage, 'season', s.season.n);
}
