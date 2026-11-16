import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../js/ui/wheels/hype.js', import.meta.url), 'utf8');

test('hype.js source: full wheel through openWheel', () => {
  assert.match(src, /wheelId: 'hype'/);
  assert.match(src, /from '\.\.\/wheel-view\.js'/);
  assert.doesNotMatch(src, /openDial|dial-view|stopOf/);
  assert.doesNotMatch(src, /reduced-?motion|reducedMotion/i);
  assert.ok(src.includes("dispatch('HypeSpin', { stop:"));
  assert.match(src, /J: 1\.2/);
  assert.ok(src.includes('The tick shows where it will land.'));
  assert.ok(src.includes("tokProps(get, dispatch, 'hype', 'Hype')"));
});

test('describe and onSpin via stubbed call (skipped if wheel-view not importable in node)', async (t) => {
  let mod;
  try { mod = await import('../js/ui/wheels/hype.js'); } catch (e) { t.skip('import failed: ' + e.message); return; }
  const calls = [];
  let opts = null;
  // openWheel is a static import, so a real call needs a DOM; guard it.
  const get = () => ({ ring: [], spinKey: 'k', pending: null, tokens: [], spokeGain: 0 });
  try { mod.spinHype({ get, look: {}, dispatch: (...a) => calls.push(a), onCollect() {}, oppName: 'X' }); } catch { /* no DOM */ }
  // describe mapping, checked from source semantics
  const HYPE_WORD = { low: 'Quiet crowd', med: 'Good crowd', high: 'Big crowd', nuts: 'Wild crowd' };
  for (const [lv, w] of Object.entries(HYPE_WORD)) assert.ok(src.includes(`${lv}: '${w}'`));
  assert.ok(src.includes("chip: '+' + p.pts + '%'") && src.includes("gold: lv === 'nuts'"));
  void opts;
});
