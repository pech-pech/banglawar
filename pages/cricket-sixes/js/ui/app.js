import * as sel from '../store/selectors.js';
import * as bowl from './bowl-view.js';
import * as brk from './break-view.js';
import * as chase from './chase-view.js';
import * as result from './result-view.js';
import { playOverPanel } from './over-panel.js';

const STAGES = {
  bowl: [bowl, 'bowlVM'],
  break: [brk, 'breakVM'],
  chase: [chase, 'chaseVM'],
  done: [result, 'resultVM'],
};

export function mount(el, store) {
  let lastStage = null;
  let holding = false; // the over panel is open: do not draw the next screen yet
  function render() {
    if (holding) return;
    const s = store.get();
    const entry = STAGES[s.stage];
    try {
      if (!entry) throw new Error('Unknown stage: ' + s.stage);
      const [view, vmName] = entry;
      const vm = sel[vmName](s);
      view.render(el, vm, (cmd, payload) => dispatch(cmd, payload));
    } catch (err) {
      console.error(err);
      el.innerHTML = '';
      const p = document.createElement('pre');
      p.className = 'app-error';
      p.setAttribute('role', 'alert');
      p.textContent = 'Render error (stage ' + (s && s.stage) + '): ' + (err && err.stack || err);
      el.appendChild(p);
    }
    if (s.stage !== lastStage) { lastStage = s.stage; window.scrollTo(0, 0); }
  }
  store.subscribe(render);
  render();

  /** BowlOver: apply it, then show the panel; the next screen draws only when Next is pressed. */
  function dispatch(cmd, payload) {
    if (holding) return;
    if (cmd !== 'BowlOver') { store.dispatch(cmd, payload); return; }
    const before = store.get();
    holding = true;
    store.dispatch(cmd, payload);
    const s = store.get();
    if (s === before || !s.last || !s.last.balls || !s.last.balls.length) { holding = false; render(); return; }
    const first = before.stage === 'bowl';
    const inn = first ? s.inn1 : s.inn2;
    const bats = (first ? s.rival : s.me).players, bowls = (first ? s.me : s.rival).players;
    const bowler = bowls[s.last.bowler];
    const balls = s.last.balls.map((b) => ({ ...b, batName: bats[b.batter] ? bats[b.batter].name : 'The batter', bowlName: bowler ? bowler.name : 'the bowler', bowlType: bowler && bowler.bowl }));
    const nextLabel = s.stage === 'done' ? 'See result' : s.stage === 'break' ? 'Innings break' : first ? 'Next bowler' : 'Next over';
    const summaryLines = [];
    if (balls.length < 6) summaryLines.push(!first && s.result === 'won' ? 'Target reached: you win!' : first ? '5th wicket: their innings is over.' : '5th wicket: your innings is over.');
    playOverPanel({ title: 'Over ' + s.last.over, balls, score: { runs: inn.runs, wk: inn.wk }, nextLabel, summaryLines,
      onDone() { holding = false; render(); } });
  }
  return dispatch;
}
