// r9 fix pass (UI-MD): M6 shared hype words, m1 button label, m2 auto text, m5 wheel wait look, m9 meter, m10 flat chips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import * as sel from '../js/store/selectors.js';
import { newGame } from './_season-bot.mjs';
import { HYPE, matchdayHtml, FIXTURE_VM } from '../js/ui/matchday-view.js';
import { autoMatchdayRowHtml } from '../js/ui/matchday-settings.js';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const six = (s) => s.clubs[0].squad.slice(0, 6).map((p) => p.id);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('M6: Match day screen, odds table and Plan chip use the same word for every hype level', () => withFlags({ matchday: true }, () => {
  for (const seed of ['fx1', 'fx2', 'fx3', 'fx4', 'fx5', 'fx6']) {
    const st = newGame(seed); st.dispatch('OpenSquad'); st.dispatch('SetSix', { ids: six(st.get()) });
    const vm = sel.matchdayVM(st.get()), chip = sel.chipsVM(st.get()).find((c) => c.key === 'hype');
    assert.ok(vm && chip);
    assert.equal(vm.hype.word, HYPE[vm.hype.level].word, 'VM word = view word');
    assert.ok(chip.text.startsWith(vm.hype.word + ' +'), chip.text + ' vs ' + vm.hype.word);
    vm.odds.forEach((o) => assert.equal(o.word, HYPE[o.level].word));
  }
}));

test('m1: the go button says what it does', () => withFlags({ matchday: true }, () => {
  const st = newGame('fx-go'); st.dispatch('OpenSquad'); st.dispatch('SetSix', { ids: six(st.get()) });
  const vm = sel.matchdayVM(st.get());
  assert.equal(vm.next, 'Next: Plan'); // from Squad, Go opens Plan
  assert.match(matchdayHtml({ ...vm }, {}), />Next: Plan</);
  assert.match(matchdayHtml({ ...FIXTURE_VM, next: 'Start match' }, {}), />Start match</);
  const s = st.get(), hub = { ...s, stage: 'matchday', fixture: { ...s.fixture, mdThen: 'start' } };
  assert.equal(sel.matchdayVM(hub).next, 'Start match'); // from the hub, Go starts the match
}));

test('m2: auto match day text names the first 3 match days', () => {
  assert.match(autoMatchdayRowHtml(false), /after your first 3 match days/);
});

test('m9: hype meter is 4 steps in one row, level marked by fill and the word Today', () => {
  const h = matchdayHtml(FIXTURE_VM, { hype: true });
  assert.equal((h.match(/class="md-step[ "]/g) || []).length, 4);
  assert.equal((h.match(/md-step is-on/g) || []).length, 2); // med = steps 1-2 filled
  assert.equal((h.match(/>Today</g) || []).length, 1);
  for (const w of ['Quiet', 'Good', 'Big', 'Wild']) assert.match(h, new RegExp('>' + w + '<'));
  assert.match(read('css/matchday.css'), /\.md-steps \{ display: flex/);
});

test('m10: chips are flat notes, not button frames; caption gets air', () => {
  const css = read('css/matchday.css');
  const chip = css.split('\n').find((l) => l.startsWith('.md-chip {'));
  assert.ok(chip && !/border:/.test(chip) && !/background:/.test(chip), chip);
  assert.match(css, /\.md-roar ~ \.colL \.sb-cap/);
});

test('m5: wheel STOP shows a waiting look (aria-disabled, class, words), and clears it', () => {
  const js = read('js/ui/wheel-view.js'), css = read('css/training2.css');
  assert.match(js, /waitLook\('Wait\.\.\.'/); assert.match(js, /waitLook\('Slowing\.\.\.'/);
  assert.match(js, /aria-disabled', 'true'/); assert.match(js, /classList\.remove\('is-wait', 'is-disabled'\); go\.textContent = 'STOP'/);
  assert.match(css, /\.wh-go\.is-wait/);
  assert.doesNotMatch(css.split('\n').filter((l) => l.includes('.wh-go.is-wait')).join(''), /animation/);
});
