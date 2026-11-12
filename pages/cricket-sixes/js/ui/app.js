import * as sel from '../store/selectors.js';
import * as bowl from './bowl-view.js';
import * as brk from './break-view.js';
import * as chase from './chase-view.js';
import * as result from './result-view.js';

const STAGES = {
  bowl: [bowl, 'bowlVM'],
  break: [brk, 'breakVM'],
  chase: [chase, 'chaseVM'],
  done: [result, 'resultVM'],
};

export function mount(el, store) {
  let lastStage = null;
  function render() {
    const s = store.get();
    const entry = STAGES[s.stage];
    try {
      if (!entry) throw new Error('Unknown stage: ' + s.stage);
      const [view, vmName] = entry;
      const vm = sel[vmName](s);
      view.render(el, vm, (cmd, payload) => store.dispatch(cmd, payload));
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
}
