import * as sel from '../store/selectors.js';
import * as bowl from './bowl-view.js';
import * as brk from './break-view.js';
import * as chase from './chase-view.js';
import * as result from './result-view.js';
import { playOverPanel } from './over-panel.js';
import * as hub from './hub-view.js';
import * as end from './end-view.js';
import { bindActs } from './dom.js';
import { attachReport } from '../report/hooks.js';

/* Stage table: s.stage -> [view module or file name, selector name]. A file name is loaded on first use
   (other parts' views), so a view that has not landed yet shows "Loading" instead of breaking boot. */
const STAGES = {
  coach: ['coachpick-view', 'coachPickVM'],
  hub: [hub, 'clubVM'],
  semi: [hub, 'clubVM'],   // semi and final: the hub shows the knockout fixture (hubVM.phaseWord)
  final: [hub, 'clubVM'],
  squad: ['squad-view', 'squadVM'],
  plan: ['plan-view', 'planVM'],
  bowl: [bowl, 'bowlVM'],
  break: [brk, 'breakVM'],
  chase: [chase, 'chaseVM'],
  done: [result, 'resultVM'],
  train: ['training-view', 'trainingVM'],
  week: ['week-view', 'weekVM'],
  end: [end, 'endVM'],
  runend: ['runend-view', 'runEndVM'],
};

/* Sheets opened by data-act="sheet:<name>" (view state only, never saved). vm: [selector, how to turn the data-arg into args]. */
const idOf = (a) => (a && typeof a === 'object' ? (a.id != null ? a.id : a.playerId) : a);
const SHEETS = {
  table: { file: 'table-sheet', vm: ['tableVM', () => []] },
  player: { file: 'player-sheet', vm: ['playerVM', (a) => [idOf(a)]] },
  tree: { file: 'tree-sheet', vm: ['treeVM', (a) => [idOf(a), a && a.side]] },
  result: { file: 'player-sheet', fn: 'openResult', vm: ['drillResultVM', (a) => [idOf(a)]] },
  coaches: { file: 'coaches-sheet', vm: ['coachesVM', () => []] },
  traininghelp: { file: 'training-view', fn: 'openHelp', vm: null },
  save: { file: 'save-sheet', vm: null },
  glossary: { file: 'glossary-sheet', fn: 'openGlossary', vm: null },
  team: { file: 'six-sheet', fn: 'openTeam', vm: ['teamVM', () => []] },
};
const mods = {}, loading = {};

export function mount(el, store) {
  let lastStage = null;
  const rep = attachReport(el, store); // playtest report: observes only, never throws
  let holding = false; // the over panel is open: do not draw the next screen yet
  /** Load a view file once; null until it has arrived, then re-render. */
  function need(file) {
    if (mods[file]) return mods[file];
    if (!loading[file]) loading[file] = import('./' + file + '.js').then((m) => { mods[file] = m; render(); }, (err) => { mods[file] = { error: err }; render(); });
    return null;
  }
  function openByName(name, arg) {
    const def = SHEETS[name];
    if (!def || holding) return;
    import('./' + def.file + '.js').then((m) => {
      const fn = m[def.fn || 'open'] || m[Object.keys(m).find((k) => /^open/.test(k))];
      if (typeof fn !== 'function') throw new Error('No open function in ' + def.file);
      const s = store.get();
      const vm = def.vm ? sel[def.vm[0]](s, ...def.vm[1](arg)) : arg;
      fn(vm, (cmd, payload) => dispatch(cmd, payload), openByName, arg, () => (def.vm ? sel[def.vm[0]](store.get(), ...def.vm[1](arg)) : arg)); // sheets: open(vm, dispatch, open, arg, refresh)
    }).catch((err) => console.error(err));
  }
  bindActs(el, (cmd, payload) => dispatch(cmd, payload), openByName); // one click handler for every view
  function render() {
    if (holding) return;
    const s = store.get();
    const entry = STAGES[s.stage];
    try {
      if (!entry) throw new Error('Unknown stage: ' + s.stage);
      const [ref, vmName] = entry;
      const view = typeof ref === 'string' ? need(ref) : ref;
      if (!view) { el.innerHTML = '<p class="ss-loading" role="status">Loading</p>'; return; }
      if (view.error) throw view.error;
      if (typeof sel[vmName] !== 'function') throw new Error('No view model yet: ' + vmName);
      const vm = sel[vmName](s);
      view.render(el, vm, (cmd, payload) => dispatch(cmd, payload), openByName); // views: render(el, vm, dispatch, open)
    } catch (err) {
      console.error(err);
      el.innerHTML = '';
      const p = document.createElement('pre');
      p.className = 'app-error';
      p.setAttribute('role', 'alert');
      p.textContent = 'Render error (stage ' + (s && s.stage) + '): ' + (err && err.stack || err);
      el.appendChild(p);
    }
    rep.rendered(s);
    if (s.stage !== lastStage) { lastStage = s.stage; window.scrollTo(0, 0); }
  }
  store.subscribe(render);
  render();

  /** BowlOver: apply it, then show the panel; the next screen draws only when Next is pressed. */
  function dispatch(cmd, payload) {
    if (holding) return;
    if (cmd !== 'BowlOver') { const b = store.get(); store.dispatch(cmd, payload); rep.dispatched(cmd, payload, b, store.get()); return; }
    const before = store.get();
    holding = true;
    store.dispatch(cmd, payload);
    const s = store.get();
    rep.dispatched(cmd, payload, before, s);
    if (s === before || !s.last || !s.last.balls || !s.last.balls.length) { holding = false; render(); return; }
    const first = before.stage === 'bowl';
    const inn = first ? s.inn1 : s.inn2;
    const bats = (first ? s.rival : s.me).players, bowls = (first ? s.me : s.rival).players;
    const bowler = bowls[s.last.bowler];
    const balls = s.last.balls.map((b) => ({ ...b, batName: bats[b.batter] ? bats[b.batter].name : 'The batter', bowlName: bowler ? bowler.name : 'the bowler', bowlType: bowler && bowler.bowl }));
    const nextLabel = s.stage === 'done' ? 'See result' : s.stage === 'break' ? 'Innings break' : first ? 'Next bowler' : 'Next over';
    const summaryLines = [];
    if (balls.length < 6) summaryLines.push(!first && s.result === 'won' ? 'Target reached: you win!' : first ? '5th wicket: their innings is over.' : '5th wicket: your innings is over.');
    rep.panelOpen();
    playOverPanel({ title: 'Over ' + s.last.over, balls, score: { runs: inn.runs, wk: inn.wk }, nextLabel, summaryLines, batKit: first ? 'B' : 'A',
      onDone() { rep.panelDone(balls.length); holding = false; render(); } });
  }
  return dispatch;
}
