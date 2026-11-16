// T8 maker P: wheel text helpers (boost chip words, short names). boostText is exported, so no rendering needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boostText, shortNameForms, uniquePrefixLens } from '../js/ui/wheel-look.js';

test('boostText: multiplier and plain units', () => {
  assert.equal(boostText('Hot Streak', 'x', 0.667), 'Hot Streak +0.667x');
  assert.equal(boostText('Booster', 'x', 1.5), 'Booster +1.5x');
  assert.equal(boostText('Booster', '+', 1), 'Booster +1');
  assert.equal(boostText('Booster', '×', '+2'), 'Booster +2x');
});

test('boostText: odd inputs never print false/undefined/NaN', () => {
  for (const plus of [undefined, null, '', 'x', '+'])
    for (const by of [undefined, null, '', 0.667, 1]) {
      const t = boostText('Booster', plus, by);
      assert.doesNotMatch(t, /false|undefined|NaN|null/, JSON.stringify([plus, by]) + ' -> ' + t);
    }
});

const PEP = ['Maximilian Oyelaran', 'Maximus Hargreaves', 'Bartholomew Singh', 'Bartholomeus Ng', 'Zed'];
test('shortNameForms: long names end with .., keep 3+ letters, never an initial', () => {
  for (const n of PEP) {
    const f = shortNameForms(n + ' +5%');
    if (n.length <= 3) { assert.deepEqual(f, []); continue; }
    assert.ok(f.length > 0, n);
    for (const x of f) { assert.match(x, /\.\./); assert.ok(Array.from(x.split('..')[0]).length >= 3, x); }
    assert.ok(f.every((x) => !/^\S\.\./.test(x)));
  }
  assert.ok(shortNameForms('Maximilian').every((x) => x.endsWith('..')));
});

test('uniquePrefixLens: unique per wheel, >= 3, terminates on identical names', () => {
  const names = PEP.map((n) => n.split(' ')[0]), lens = uniquePrefixLens(names);
  const forms = names.map((n, i) => Array.from(n).slice(0, lens[i]).join('').toLowerCase());
  for (const l of lens) assert.ok(l >= 3);
  assert.equal(new Set(forms.filter((_, i) => names[i].length > 3 || true)).size, names.length, 'prefixes differ: ' + forms);
  for (const n of names) assert.ok(shortNameForms(n, lens[names.indexOf(n)]).every((x) => Array.from(x.split('..')[0]).length >= lens[names.indexOf(n)]));
  assert.deepEqual(uniquePrefixLens(['Same', 'Same', 'Same']), [3, 3, 3]);
  assert.deepEqual(uniquePrefixLens([]), []);
  assert.deepEqual(uniquePrefixLens(['Ab', 'Ab']), [2, 2]);
});

// Known gap: a boolean plus prints "Booster false1" (app code, js/ui/wheel-look.js boostText). Marked todo until boostText coerces non-strings.
test('boostText: boolean plus never prints false/true', () => {
  for (const plus of [true, false]) assert.doesNotMatch(boostText('Booster', plus, 1), /false|true/);
});
