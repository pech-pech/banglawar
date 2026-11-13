// r9 FIX-CLUB: free-pick copy, trial player/coach sheets, release path, activity card spans, week wording, result line, canvas labels, confirm line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderFreePick } from '../js/ui/freepick-view.js';
import { renderTrial } from '../js/ui/trial-card.js';
import { renderActivities, resultOf } from '../js/ui/activities-view.js';
import { trialVM } from '../js/store/selectors.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function fakeRoot() {
  const r = { innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, contains: () => true, querySelector: () => null, closest: () => null };
  r.click = (attrs) => { const el = { disabled: false, hasAttribute: (k) => k in attrs, getAttribute: (k) => attrs[k] }; r.handlers.click({ target: { closest: () => el } }); };
  return r;
}
const ids = ['stands', 'nets', 'academy', 'gym', 'shop', 'pitch', 'scout'];
const fvm = { pending: true, options: ids.map((id) => ({ id, name: id, effect: 'EFFECTTEXT (dev)', note: 'DEVNOTE', recommended: id === 'stands', owned: false })) };

test('M2 free pick: one plain line each, no dev words, no parenthetical, "No effect yet" once on the four idle ones', () => {
  const r = fakeRoot(); renderFreePick(r, fvm, () => {});
  assert.doesNotMatch(r.innerHTML, /EFFECTTEXT|DEVNOTE|sign screen|Does nothing|not in matches|\(more|\(More/i);
  assert.equal((r.innerHTML.match(/>No effect yet</g) || []).length, 4);
  for (const id of ['nets', 'pitch', 'academy', 'scout']) assert.match(r.innerHTML, new RegExp('data-cl-pick="' + id + '"[^>]*aria-label="[^"]*No effect yet'));
  assert.doesNotMatch(r.innerHTML.match(/data-cl-pick="stands".*?<\/button>/)[0], /No effect yet/);
});

const pl = { id: 'p9', name: 'Asha', role: 'Middle', type: 'Spin', batShown: 80, bowlShown: 60, ability: 70, grade: '?' };
const tvm = { kind: 'player', player: pl, coach: null, wage: 12, squadFull: false, canSign: true, why: '', release: [] };
test('M3 trial player: role + type icons, batting/bowling letters, "Grade hidden" instead of a bare ?', () => {
  const r = fakeRoot(); renderTrial(r, tvm, () => {});
  assert.match(r.innerHTML, /Middle order/); assert.match(r.innerHTML, /Spin bowler/);
  assert.equal((r.innerHTML.match(/lt-box/g) || []).length, 2);
  assert.match(r.innerHTML, /Grade hidden/);
  assert.doesNotMatch(r.innerHTML, /m0-flat--q|>\?</);
  const g = fakeRoot(); renderTrial(g, { ...tvm, player: { ...pl, grade: 'B' } }, () => {});
  assert.match(g.innerHTML, /Potential grade <b class="lt-in">B<\/b>/);
});

test('M3 full squad: clear text, release path (list -> confirm -> SellPlayer), Sign locked, Decline free', () => {
  const calls = [], r = fakeRoot();
  const full = { ...tvm, squadFull: true, canSign: false, why: 'Squad full: release one first', release: [{ id: 'b1', name: 'Kofi', role: 'Lower', type: 'Fast', shown: 50 }] };
  renderTrial(r, full, (n, a) => calls.push([n, a]));
  assert.match(r.innerHTML, /Squad full: release one first/);
  assert.match(r.innerHTML, /data-cl-relopen/);
  assert.match(r.innerHTML, /data-cl-act="SignTrial"[^>]*disabled/);
  r.click({ 'data-cl-relopen': '1' });
  assert.match(r.innerHTML, /data-cl-relpick="b1"/);
  r.click({ 'data-cl-relpick': 'b1' });
  assert.match(r.innerHTML, /Release Kofi\?/);
  assert.deepEqual(calls, [], 'nothing released before the confirm');
  r.click({ 'data-cl-sell': 'b1' });
  assert.deepEqual(calls, [['SellPlayer', { id: 'b1' }]]);
  const e = fakeRoot(); renderTrial(e, { ...full, release: [] }, () => {}); e.click({ 'data-cl-relopen': '1' });
  assert.match(e.innerHTML, /Nobody can be released/);
});

test('M4 trial coach: strong focuses shown with icons and words', () => {
  const r = fakeRoot(); renderTrial(r, { kind: 'coach', player: null, coach: { id: 'c', name: 'Mensah', step: 9, strong: ['bat'] }, wage: 0, canSign: true }, () => {});
  assert.match(r.innerHTML, /Strong in/); assert.match(r.innerHTML, /t2-fi/); assert.match(r.innerHTML, />Batting</);
});

test('trialVM carries what the sheets need (coach strong, player role/type/letters inputs, release list)', () => {
  const src = read('js/store/selectors.js');
  assert.match(src, /strong: Array\.isArray\(x\.strong\)/);
  assert.match(src, /batShown: shownBat\(x\)/);
  assert.match(src, /canSell\(s, p\.id\)/);
  assert.equal(trialVM({ econ: null }), null);
});

test('m6 activity option keeps each icon with its number (nowrap group); m7 week wording', () => {
  const r = fakeRoot();
  renderActivities(r, { available: true, coins: 99, options: [{ id: 'street', name: 'Street Game', cost: 15, fans: 10, findPct: 8, repeat: false, ok: true }], pity: { weeks: 1, of: 5 } }, () => {});
  assert.match(r.innerHTML, /<span class="cl-nb">[^]*?15 Coins<\/span><span class="cl-nb">[^]*?\+10 Fans<\/span>/);
  assert.match(r.innerHTML, /One each week/);
  const d = fakeRoot(); renderActivities(d, { available: false, picked: null }, () => {});
  assert.match(d.innerHTML, /Done for this week\. Next one next week\./);
  assert.doesNotMatch(read('js/ui/activities-view.js') + read('js/ui/hub-view.js'), /this round|next round|a round|each round/i);
});

test('m8 result line names the find before the sheet closes', () => {
  const vm = { picked: { id: 'banner', name: 'Banner Night', fans: 44, find: { type: 'player', id: 't1' } }, trial: { player: { name: 'Asha' } } };
  assert.equal(resultOf(vm).find, 'Found a trial player: Asha!');
  assert.equal(resultOf({ picked: { id: 'x', name: 'X', fans: 5, find: { type: 'coach' } }, trial: { coach: { name: 'Mensah' } } }).find, 'Found a trial coach: Mensah!');
  assert.equal(resultOf({ picked: { id: 'x', name: 'X', fans: 5, find: null } }).find, '');
  assert.equal(resultOf({ picked: null }), null);
  const r = fakeRoot(); r.__clResult = resultOf(vm); renderActivities(r, vm, () => {});
  assert.match(r.innerHTML, /Found a trial player: Asha!/); assert.match(r.innerHTML, /data-cl-close/); assert.match(r.innerHTML, /aria-live="polite"/);
});

test('m13 Sign / Decline write one aria-live line', () => {
  const els = {};
  globalThis.document = { getElementById: (i) => els[i] || null, createElement: () => ({ setAttribute() {}, remove() {}, parentNode: {} }), body: { appendChild(e) { els[e.id] = e; } } };
  try {
    const r = fakeRoot(); renderTrial(r, { kind: 'coach', player: null, coach: { id: 'c', name: 'Mensah', step: 9, strong: ['bat'] }, wage: 0, canSign: true }, () => {});
    r.click({ 'data-cl-act': 'SignTrial' });
    assert.equal(els['cl-confirm-line'].textContent, 'Mensah joined your coaches.');
    r.click({ 'data-cl-act': 'DeclineTrial' });
    assert.equal(els['cl-confirm-line'].textContent, 'You declined Mensah.');
  } finally { delete globalThis.document; }
});

test('m4 canvas label uses the real level (not built at 0)', () => {
  const src = read('js/ui/club-canvas.js');
  assert.doesNotMatch(src, /levels\[f\[0\]\] \|\| 1/);
  assert.match(src, /'not built'/);
  assert.match(read('js/ui/hub-view.js'), /levels: \(vm\.econ && vm\.econ\.fac\)/);
});
