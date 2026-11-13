// r9 UI-CLUB: activities card + sheet, trial player card, free-pick screen + pending card, hub cards, stadium L1 wording, static rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activitiesCardHtml, renderActivities, doneLine } from '../js/ui/activities-view.js';
import { trialCardHtml, renderTrial } from '../js/ui/trial-card.js';
import { pendingCardHtml, renderFreePick, NOTE } from '../js/ui/freepick-view.js';
import { renderStadium } from '../js/ui/stadium-view.js';
import { newEconomy } from '../js/core/economy.js';
import { FLAGS } from '../js/data/flags.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const FILES = ['js/ui/activities-view.js', 'js/ui/trial-card.js', 'js/ui/freepick-view.js'];
function fakeRoot() {
  const r = { innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, contains: () => true, querySelector: () => null, closest: () => null };
  r.click = (attrs) => { const el = { disabled: false, hasAttribute: (k) => k in attrs, getAttribute: (k) => attrs[k] }; r.handlers.click({ target: { closest: () => el } }); };
  return r;
}
const opts = [
  { id: 'street', name: 'Street Game', blurb: 'Tennis-ball cricket outside the gate.', cost: 15, fans: 10, tiltPct: 2, findPct: 8, repeat: false, ok: true, why: '', warn: '' },
  { id: 'banner', name: 'Banner Night', blurb: 'Flags and drums.', cost: 85, fans: 44, tiltPct: 8, findPct: 26, repeat: true, ok: true, why: '', warn: 'Coins will be below the wage reserve.' },
];
const avm = { available: true, round: 3, picked: null, options: opts, rest: { id: 'rest', label: 'Rest week', free: true }, pity: { weeks: 2, of: 5 }, coins: 500 };

test('activities card: off = nothing; on = one button to the sheet; done shows what was gained', () => {
  assert.equal(activitiesCardHtml(null), '');
  assert.match(activitiesCardHtml(avm), /data-act="sheet:activities"/);
  assert.match(activitiesCardHtml(avm), /Resting is free/);
  const done = activitiesCardHtml({ ...avm, available: false, picked: { id: 'street', name: 'Street Game', fans: 10, find: { type: 'coins', coins: 14 } } });
  assert.match(done, /Street Game: \+10 Fans\. Found 14 Coins/);
  assert.equal(doneLine({ id: 'rest' }), 'Rest week. Nothing spent.');
});

test('activities sheet: options with cost, Fans, find odds; tap -> confirm; Yes dispatches PickActivity { id }', () => {
  const calls = [], r = fakeRoot();
  renderActivities(r, avm, (n, a) => calls.push([n, a]));
  assert.equal((r.innerHTML.match(/data-cl-pick=/g) || []).length, 3, '2 options + rest');
  for (const t of ['15 Coins', '+10 Fans', '8 in 100', 'Rest week', 'Free. No penalty', 'Same as last week: half the Fans, no find', 'within 3 more picked weeks']) assert.ok(r.innerHTML.includes(t), t);
  r.click({ 'data-cl-pick': 'street' });
  assert.match(r.innerHTML, /Street Game\?/);
  assert.match(r.innerHTML, /Coins after: 485/);
  r.click({ 'data-cl-back': '1' });
  assert.match(r.innerHTML, /cl-opts/);
  r.click({ 'data-cl-pick': 'street' });
  r.click({ 'data-cl-act': 'PickActivity', 'data-id': 'street' });
  assert.deepEqual(calls, [['PickActivity', { id: 'street' }]]);
});

test('activities sheet: warn is shown but never blocks; rest dispatches id rest; picked round shows done line only', () => {
  const calls = [], r = fakeRoot();
  renderActivities(r, avm, (n, a) => calls.push([n, a]));
  r.click({ 'data-cl-pick': 'banner' });
  assert.match(r.innerHTML, /below the wage reserve/);
  assert.doesNotMatch(r.innerHTML, /data-cl-act="PickActivity"[^>]*disabled/);
  r.click({ 'data-cl-back': '1' }); r.click({ 'data-cl-pick': 'rest' });
  r.click({ 'data-cl-act': 'PickActivity', 'data-id': 'rest' });
  assert.deepEqual(calls, [['PickActivity', { id: 'rest' }]]);
  const r2 = fakeRoot(); renderActivities(r2, { ...avm, available: false, picked: { id: 'rest' } }, () => {});
  assert.match(r2.innerHTML, /Rest week\. Nothing spent/);
  assert.doesNotMatch(r2.innerHTML, /data-cl-pick/);
});

const tvm = { player: { id: 'p9', name: 'Asha', bat: 41, bowl: 30, ability: 5, grade: 'B', role: 'Batter', lines: ['Bats well, bowls a little'] }, wage: 12, squadFull: false, canSign: true, why: '' };
test('trial card: Home card + Sign / Decline dispatch; wage shown; full squad disables Sign with the reason', () => {
  assert.equal(trialCardHtml(null), '');
  assert.match(trialCardHtml(tvm), /Trial player: Asha/);
  const calls = [], r = fakeRoot();
  renderTrial(r, tvm, (n, a) => calls.push([n, a]));
  assert.match(r.innerHTML, /Wage: 12 Coins a match/);
  r.click({ 'data-cl-act': 'SignTrial' }); r.click({ 'data-cl-act': 'DeclineTrial' });
  assert.deepEqual(calls, [['SignTrial', {}], ['DeclineTrial', {}]]);
  const f = fakeRoot(); renderTrial(f, { ...tvm, squadFull: true, canSign: false, why: 'The squad is full (8 of 8).' }, () => {});
  assert.match(f.innerHTML, /data-cl-act="SignTrial"[^>]*disabled/);
  assert.match(f.innerHTML, /The squad is full \(8 of 8\)/);
  assert.doesNotMatch(f.innerHTML, /data-cl-act="DeclineTrial"[^>]*disabled/);
});

const ids = ['stands', 'nets', 'academy', 'gym', 'shop', 'pitch', 'scout'];
const fvm = { pending: true, done: false, options: ids.map((id) => ({ id, name: id, effect: '', recommended: id === 'stands', note: '', owned: false })) };
test('free pick: seven cards, honest labels, nothing hidden; pick then Take dispatches TakeFreePick { what }', () => {
  const calls = [], r = fakeRoot();
  renderFreePick(r, fvm, (n, a) => calls.push([n, a]));
  assert.equal((r.innerHTML.match(/role="radio"/g) || []).length, 7);
  assert.match(r.innerHTML, /Recommended: more Fans/);
  assert.equal((r.innerHTML.match(/>[^<]*Does nothing yet</g) || []).length, 3, 'academy, scout, pitch');
  assert.match(r.innerHTML, /Tap a facility first/);
  assert.match(r.innerHTML, /data-cl-act="TakeFreePick"[^>]*disabled/);
  r.click({ 'data-cl-pick': 'nets' });
  assert.match(r.innerHTML, /Take Nets free/);
  assert.match(r.innerHTML, /aria-checked="true"/);
  r.click({ 'data-cl-act': 'TakeFreePick' });
  assert.deepEqual(calls, [['TakeFreePick', { what: 'nets' }]]);
  assert.ok(NOTE.academy && NOTE.scout && NOTE.pitch);
});

test('free pick: owned facilities are shown and disabled (migrated saves); pending card only while pending', () => {
  const r = fakeRoot(); renderFreePick(r, { ...fvm, options: fvm.options.map((o) => ({ ...o, owned: o.id === 'stands' })) }, () => {});
  assert.match(r.innerHTML, /data-cl-pick="stands"[^>]*disabled/);
  assert.match(r.innerHTML, /You already have it/);
  assert.match(pendingCardHtml(fvm), /Free facility: pick one/);
  assert.equal(pendingCardHtml({ ...fvm, pending: false }), '');
  assert.equal(pendingCardHtml(null), '');
});

test('stadium view: an L0 facility says "Build level 1 for N Coins"; pending free pick adds a note; flag off unchanged', () => {
  const e = Object.assign(newEconomy(), { coins: 5000 });
  const s = { econ: e, season: { league: 1, n: 1 }, clubs: [{ squad: [], six: [] }] };
  const r = fakeRoot(); renderStadium(r, s, () => {});
  assert.doesNotMatch(r.innerHTML, /free level 1 is waiting/);
  FLAGS.freePick = true;
  try {
    const s2 = { econ: Object.assign(newEconomy(), { coins: 5000 }), season: { league: 1, n: 1 }, clubs: s.clubs };
    const r2 = fakeRoot(); renderStadium(r2, s2, () => {});
    assert.match(r2.innerHTML, /free level 1 is waiting/);
    assert.match(r2.innerHTML, /Build level 1 for/);
  } finally { FLAGS.freePick = false; }
});

test('static rules: no bare ico(, no localStorage/fetch, plain PascalCase commands, no hex colours, text >= 14px, taps >= 56px', () => {
  for (const f of FILES) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /[^o]\bico\(/, f + ' bare ico(');
    assert.doesNotMatch(src, /localStorage|fetch\(|Math\.random|Date\b/, f);
    for (const m of src.matchAll(/dispatch\('([^']+)'/g)) assert.match(m[1], /^[A-Z][A-Za-z]+$/, f + ' ' + m[1]);
  }
  const css = read('css/club9.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /animation|transition/);
  for (const m of css.matchAll(/font:[^;]*?(\d+)px\//g)) assert.ok(Number(m[1]) >= 14, 'font ' + m[0]);
  assert.match(read('index.html'), /css\/club9\.css/);
  assert.equal((read('index.html').match(/club9\.css/g) || []).length, 1);
});
