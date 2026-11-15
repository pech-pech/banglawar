import test from 'node:test';
import assert from 'node:assert/strict';
import { addFinds, clearBadge, badgeCount, badgeText, badgeAria } from '../js/ui/book-badge.js';
import { bookBtnHtml } from '../js/ui/over-panel.js';

// T7: 0 -> no badge; a find -> "1"; open the Book -> none; 10 finds -> "9+".
test('T7 badge: 0, 1, cleared, 9+', () => {
  clearBadge();
  assert.equal(badgeCount(), 0); assert.equal(badgeText(), ''); assert.equal(badgeAria(), '');
  addFinds(1);
  assert.equal(badgeText(), '1'); assert.equal(badgeAria(), '1 new in Book');
  clearBadge(); // the Book was opened
  assert.equal(badgeText(), '');
  addFinds(3); addFinds(6); addFinds(1);
  assert.equal(badgeCount(), 10); assert.equal(badgeText(), '9+');
  addFinds(0); addFinds(-2); addFinds('x');
  assert.equal(badgeCount(), 10);
  clearBadge();
});
test('badgeText is pure for any n', () => {
  assert.equal(badgeText(0), ''); assert.equal(badgeText(9), '9'); assert.equal(badgeText(10), '9+'); assert.equal(badgeText(99), '9+');
});
test('Open Book button: badge only with finds, number plus words', () => {
  assert.doesNotMatch(bookBtnHtml(0), /op-badge/);
  const one = bookBtnHtml(1);
  assert.match(one, /class="op-badge" aria-hidden="true">1</);
  assert.match(one, /class="ss-sr"> 1 new in Book/);
  assert.match(bookBtnHtml(12), />9\+</);
});
test('hub Book plate: badge unhidden with count, aria says how many new', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../js/ui/hub-view.js', import.meta.url), 'utf8'));
  assert.match(src, /badge: badgeCount\(\)/);
  assert.match(src, /badgeAria\(plate\.badge\)/);
});
test('app wiring: finds add, gift adds 1, opening the Book clears', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../js/ui/app.js', import.meta.url), 'utf8'));
  assert.match(src, /addFinds\(found\.length\)/);
  assert.match(src, /addFinds\(1\)/);
  assert.match(src, /name === 'book'\) \{[^}]*clearBadge\(\)/);
});
