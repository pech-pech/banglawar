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

import { uniqueTailLens } from '../js/ui/wheel-look.js';
// Every slice's candidate forms (longest first) for a ring of names: all forms of one slice must be unique across the ring, >= 3 letters before "..", ".." only when shortened.
function ringForms(names, val = ' +5%') {
  const lens = uniquePrefixLens(names), tails = uniqueTailLens(names, lens);
  return names.map((n, i) => shortNameForms(n + val, lens[i], tails[i]));
}
function checkRing(names) {
  const forms = ringForms(names), seen = new Map();
  forms.forEach((fs, i) => {
    const full = Array.from(names[i]).length;
    if (full > 3) assert.ok(fs.length > 0, 'has a form: ' + names[i]);
    for (const x of fs) {
      const head = x.split('..')[0].trim();
      assert.ok(Array.from(head).length >= 3, 'no lone initial: ' + x);
      assert.ok(x.includes('..'), 'shortened ends with ..: ' + x);
      assert.ok(/\+5%$/.test(x) || !/ \+5%/.test(x), x);
    }
    for (const x of fs.map((y) => y.replace(/ \+5%$/, ''))) { const o = seen.get(x); assert.ok(o === undefined || o === i || names[o] === names[i], 'duplicate form ' + x + ' for ' + names[o] + ' / ' + names[i]); }
    fs.forEach((x) => seen.set(x.replace(/ \+5%$/, ''), i));
    if (full > 3) assert.ok(fs.some((x) => / \+5%$/.test(x)), 'keeps a form with the value: ' + names[i]);
  });
}
test('shared-prefix names stay unique, readable and upright', () => {
  checkRing(['Maximilian', 'Maximiliano', 'Maxine', 'Zed', 'Bartholomew']);
  checkRing(['Maximilian', 'Maximiliano', 'Maximilianus', 'Maximilia']);
  checkRing(['Same', 'Same', 'Same']);
  const rn = ['Maximilian', 'Maximiliano', 'Maxine'], rl = uniquePrefixLens(rn), rt = uniqueTailLens(rn, rl);
  assert.ok(shortNameForms('Maximilian +5%', rl[0], rt[0]).includes('Maxim..n +5%'), 'prefix + .. + tail');
  assert.ok(shortNameForms('Maximiliano +5%', rl[1], rt[1]).includes('Maxim..o +5%'));
});
test('Pep rings of 12 and 13 slices with long names', () => {
  const base = ['Maximilian', 'Maximiliano', 'Maxine', 'Maximus', 'Maximillian', 'Bartholomew', 'Bartholomeus', 'Alexandrina', 'Alexandria', 'Christopher', 'Christophine', 'Zed', 'Wolfgangamadeus'];
  for (const n of [12, 13]) checkRing(base.slice(0, n));
});

import { sliceLabel, scoutNameCuts } from '../js/ui/wheel-look.js';
test('thin Finals slices keep their unit; Scout cuts use .. and the most letters', () => {
  assert.equal(sliceLabel({ w: 0.5, label: '20 Coins' }), '20c');
  assert.equal(sliceLabel({ w: 0.5, label: '15 Fans' }), '15f');
  assert.equal(sliceLabel({ w: 0.5, label: '10 TP' }), '10TP');
  assert.equal(sliceLabel({ w: 0.5, label: '+2' }), '+2');
  assert.deepEqual(scoutNameCuts('Penrose', 3).slice(0, 2), ['Penros..', 'Pentro..'.replace('Pentro', 'Penro')]);
  assert.equal(scoutNameCuts('Quaye', 3)[0], 'Quaye');
  assert.ok(scoutNameCuts('Quaye', 3).every((x) => x === 'Quaye' || /\.\.$/.test(x)));
  assert.ok(scoutNameCuts('Wolfe', 3).includes('Wolf..'));
});
