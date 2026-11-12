import test from 'node:test';
import assert from 'node:assert/strict';

let C = null, S = null;
try { C = await import('../js/store/commands.js'); S = await import('../js/store/store.js'); } catch (e) { C = null; }

test('same seed + same calls -> identical state JSON', (t) => {
  if (!C || !S) return t.skip('js/store/commands.js or store.js not present yet');
  const run = (seed) => {
    const store = S.createStore(null);
    store.dispatch('NewMatch', { seed });
    let guard = 0;
    while (store.get().stage !== 'done' && guard++ < 100) {
      const st = store.get();
      if (st.stage === 'bowl') {
        const vm = st.inn1.over;
        const bowlers = st.me.players.map((p, i) => i).filter((i) => st.me.players[i].overs < 2 && i !== st.inn1.last);
        store.dispatch('MakeCall', { bowler: bowlers[0], field: vm % 2 ? 'A' : 'P' });
        store.dispatch('BowlOver', {});
      } else if (st.stage === 'break') store.dispatch('StartChase', {});
      else if (st.stage === 'chase') store.dispatch('BowlOver', { intent: ['D', 'R', 'A'][st.inn2.over % 3] });
    }
    return JSON.stringify(store.get());
  };
  const a = run('abc'), b = run('abc');
  assert.equal(a, b);
  assert.notEqual(a, run('xyz'));
  assert.equal(JSON.parse(a).stage, 'done');
});
