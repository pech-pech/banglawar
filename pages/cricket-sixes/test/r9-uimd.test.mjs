import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boostTotals, hypeWord, chipRowHtml, roarChipHtml, oddsHtml, matchdayHtml, FIXTURE_VM } from '../js/ui/matchday-view.js';
import { autoMatchdayRowHtml } from '../js/ui/matchday-settings.js';
import { roarChipHtml as opRoar } from '../js/ui/over-panel.js';

const vm = FIXTURE_VM;

test('boostTotals multiplies, shows only revealed parts', () => {
  assert.deepEqual(boostTotals(vm, { hype: false, toss: false, pep: false }), { teamPct: 0, pepPct: 0 });
  assert.equal(boostTotals(vm, { hype: true, toss: false, pep: false }).teamPct, 4);
  const all = boostTotals({ ...vm, hype: { ...vm.hype, perfPct: 10 } }, { hype: true, toss: true, pep: true });
  assert.equal(all.teamPct, 16);   // 1.10 x 1.05 = 1.155 -> 16 (rounded)
  assert.equal(all.pepPct, 21);    // x 1.05 = 1.21275 -> 21
});
test('lost toss adds nothing', () => {
  const t = boostTotals({ ...vm, toss: { won: false, boostPct: 5 } }, { hype: true, toss: true, pep: false });
  assert.equal(t.teamPct, 4);
});
test('hypeWord is plain and kind', () => {
  assert.match(hypeWord('low'), /Quiet crowd/);
  assert.doesNotMatch(Object.values({ a: hypeWord('low'), b: hypeWord('nuts') }).join(' '), /lose|lost|bad/i);
});
test('unrevealed screen has 56px taps, no results leaked, plain words', () => {
  const h = matchdayHtml(vm, { hype: false, toss: false, pep: false });
  assert.match(h, /data-md="hype"/); assert.match(h, /data-md="toss"/); assert.match(h, /data-md="pep"/);
  assert.match(h, /data-act="MatchdayGo"/); assert.match(h, /data-act="BackToSquad"/);
  assert.doesNotMatch(h, /Quiet crowd today|Good crowd/);
  assert.doesNotMatch(h, /<script|onclick/i);
});
test('revealed screen shows results as words and one pep player', () => {
  const h = matchdayHtml(vm, { hype: true, toss: true, pep: true });
  assert.match(h, /Good crowd/); assert.match(h, /\+4%/);
  assert.match(h, /You won the toss/); assert.match(h, /Rafi/); assert.match(h, /Crowd roar chance/);
  assert.equal((h.match(/md-six is-pep/g) || []).length, 1);
});
test('lost toss copy is kind', () => {
  const h = matchdayHtml({ ...vm, toss: { won: false, boostPct: 5 } }, { hype: true, toss: true, pep: false });
  assert.match(h, /Rival won the toss\. Nothing changes\./);
});
test('odds sheet sums to 100 and lists four words', () => {
  const h = oddsHtml(vm);
  assert.equal((h.match(/<tr/g) || []).length, 5);
  assert.equal(vm.odds.reduce((a, b) => a + b.pct, 0), 100);
});
test('chip row: words with icons, empty when nothing', () => {
  assert.equal(chipRowHtml(null), ''); assert.equal(chipRowHtml([]), '');
  const h = chipRowHtml([{ key: 'hype', text: 'Good crowd +4%', aria: 'Good crowd, plus 4 percent' }, { key: 'toss', text: 'Won the toss +5%' }]);
  assert.match(h, /Good crowd \+4%/); assert.match(h, /aria-label="Match day boosts"/); assert.match(h, /aria-label="Good crowd, plus 4 percent"/);
});
test('roar chip is words, gold, polite line', () => {
  const h = roarChipHtml(true);
  assert.match(h, /Crowd roar \+5%/); assert.match(h, /md-roar/);
  assert.equal(roarChipHtml(false), ''); assert.equal(roarChipHtml(null), '');
  assert.equal(opRoar(true), h);
  assert.match(roarChipHtml({ on: true, text: 'Crowd roar +5%', aria: 'Crowd roar, plus 5 percent' }), /aria-label="Crowd roar, plus 5 percent"/);
  assert.equal(roarChipHtml({ on: false }), '');
});
test('auto match day row is a 56px switch with words', () => {
  const on = autoMatchdayRowHtml(true), off = autoMatchdayRowHtml(false);
  assert.match(on, /role="switch"[^>]*aria-checked="true"/); assert.match(off, /aria-checked="false"/);
  assert.match(on, /Auto match day/); assert.match(on, />On</); assert.match(off, />Off</);
});
test('css: link once, taps >= 56, no hex, no animation without motion query', () => {
  const css = readFileSync(new URL('../css/matchday.css', import.meta.url), 'utf8');
  const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((idx.match(/css\/matchday\.css/g) || []).length, 1);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/);
  assert.match(css, /min-height: 56px/);
  const noMotion = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*$/m, '');
  assert.doesNotMatch(noMotion, /animation|transition/);
});
test('no bare ico( in new ui files', () => {
  for (const f of ['matchday-view.js', 'matchday-settings.js']) {
    const src = readFileSync(new URL('../js/ui/' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(src.replace(/icoDeco\(/g, ''), /\bico\(/);
  }
});
import { featuresRowHtml } from '../js/ui/matchday-settings.js';
test('features row: switch with words, plain copy', () => {
  const h = featuresRowHtml(true);
  assert.match(h, /New match-day and fan features/); assert.match(h, /role="switch"[^>]*aria-checked="true"/); assert.match(h, /data-md-features/);
  assert.match(featuresRowHtml(false), /aria-checked="false"[\s\S]*>Off</);
});
