// P8 economy screens: markup, confirm flow, dispatch names, and static look rules. No DOM library: root is a tiny fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newEconomy, finalsReward, startBuild } from '../js/core/economy.js';
import { renderClubMoney } from '../js/ui/club-money-view.js';
import { renderStadium, SLOTS } from '../js/ui/stadium-view.js';
import { renderSinks } from '../js/ui/sinks-sheet.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const FILES = ['js/ui/club-money-view.js', 'js/ui/stadium-view.js', 'js/ui/sinks-sheet.js'];

function fakeRoot() {
  const r = { innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, contains: () => true, querySelector: () => null };
  r.click = (attrs) => { const el = { disabled: false, hasAttribute: (k) => k in attrs, getAttribute: (k) => attrs[k] }; r.handlers.click({ target: { closest: () => el } }); };
  return r;
}
const mk = (patch) => { const e = Object.assign(newEconomy(), patch || {}); return { econ: e, season: { league: 1, n: 1 }, clubs: [{ squad: [], six: [] }] }; };

test('stadium view: seven fixed slots in the contract order, each a button with a level in words', () => {
  assert.deepEqual(SLOTS.map((x) => x.name), ['Stands', 'Gym', 'Shop', 'Nets', 'Pitch', 'Academy', 'Scout']);
  const r = fakeRoot(); renderStadium(r, mk(), () => {});
  assert.equal((r.innerHTML.match(/class="c-btn ec-slot/g) || []).length, 7);
  assert.match(r.innerHTML, /Level 1 of 5/);
  assert.match(r.innerHTML, /Not built/);
});

test('stadium view: tap a slot -> plain confirm; Yes dispatches StartBuild { what }; No returns', () => {
  const calls = []; const r = fakeRoot(); const s = mk({ coins: 5000 });
  renderStadium(r, s, (n, a) => calls.push([n, a]));
  r.click({ 'data-econ-pick': 'gym' });
  assert.match(r.innerHTML, /Build Gym level 1\?/);
  assert.match(r.innerHTML, /Coins after: 4,930/);
  r.click({ 'data-econ-back': '1' });
  assert.match(r.innerHTML, /ec-slots/);
  r.click({ 'data-econ-pick': 'gym' });
  r.click({ 'data-econ-act': 'StartBuild', 'data-what': 'gym' });
  assert.deepEqual(calls, [['StartBuild', { what: 'gym' }]]);
});

test('stadium view: a locked build says why in words and the Yes button is disabled', () => {
  const r = fakeRoot(); renderStadium(r, mk(), () => {});
  r.click({ 'data-econ-pick': 'pitch' });
  assert.match(r.innerHTML, /Needs Stadium 3/);
  assert.match(r.innerHTML, /data-econ-act="StartBuild"[^>]*disabled/);
});

test('stadium view: stadium build in progress shows matches left and uses the real core', () => {
  let s = mk({ coins: 5000, fans: 400 }); s = startBuild(s, 'stadium');
  assert.ok(s.econ.build, 'core started a stadium build');
  const r = fakeRoot(); renderStadium(r, s, () => {});
  assert.match(r.innerHTML, /match(es)? left/);
});

test('money view: Coins, Fans and Medals as digits, last match lines, Fans bars', () => {
  const s = mk({ coins: 1234, fans: 55, medals: 2 });
  s.econ.ledger.push({ k: 'match', gate: 300, winBonus: 70, shop: 6, wages: 200, upkeep: 4, net: 172, fans: 45 });
  const r = fakeRoot(); renderClubMoney(r, s, () => {});
  for (const t of ['1,234', 'Coins', 'Fans', 'Medals', 'Gate money', 'Player wages', 'Crowd', 'Club Legend']) assert.ok(r.innerHTML.includes(t), t);
  assert.doesNotMatch(r.innerHTML, /undefined|NaN|\[object/);
});

test('money view: arrears shows a plain warning', () => {
  const r = fakeRoot(); renderClubMoney(r, mk({ arrears: 80 }), () => {});
  assert.match(r.innerHTML, /Wages are behind by 80 Coins/);
});

test('sinks sheet: lists Medal shop, confirm names the cost and dispatches BuyMedal { id }', () => {
  const calls = []; const r = fakeRoot(); const s = finalsReward(mk(), 'champ');
  renderSinks(r, s, (n, a) => calls.push([n, a]));
  assert.match(r.innerHTML, /Medal shop/); assert.match(r.innerHTML, /Trophy Cabinet/);
  r.click({ 'data-econ-pick': 'medal:trophy_cabinet' });
  assert.match(r.innerHTML, /Buy Trophy Cabinet\?/); assert.match(r.innerHTML, /Cost: 1 Medal/);
  r.click({ 'data-econ-act': 'BuyMedal', 'data-id': 'trophy_cabinet' });
  assert.deepEqual(calls, [['BuyMedal', { id: 'trophy_cabinet' }]]);
});

test('sinks sheet: coin sinks dispatch BuySink; legacy dispatches BuyLegacy with no id; locked ones cannot be confirmed', () => {
  const calls = []; const r = fakeRoot(); const s = mk({ coins: 99999, stadium: 4 });
  renderSinks(r, s, (n, a) => calls.push([n, a]));
  r.click({ 'data-econ-pick': 'sink:hall_1' });
  assert.match(r.innerHTML, /Buy Hall of Fame wing 1\?/);
  r.click({ 'data-econ-act': 'BuySink', 'data-id': 'hall_1' });
  r.click({ 'data-econ-pick': 'legacy:' });
  assert.match(r.innerHTML, /all six/);
  assert.match(r.innerHTML, /data-econ-act="BuyLegacy"[^>]*disabled/);
  assert.deepEqual(calls, [['BuySink', { id: 'hall_1' }]]);
  const s2 = mk({ coins: 99999, stadium: 4, sinks: { hall_1: 1, hall_2: 1, hall_3: 1 } });
  const r2 = fakeRoot(); const c2 = []; renderSinks(r2, s2, (n, a) => c2.push([n, a]));
  r2.click({ 'data-econ-pick': 'legacy:' }); r2.click({ 'data-econ-act': 'BuyLegacy' });
  assert.deepEqual(c2, [['BuyLegacy', {}]]);
});

test('look rules: no bare ico( in the new views, no hex colours or small fonts in economy.css, reduced motion block, taps', () => {
  for (const f of FILES) assert.equal(/[^o]ico\(/.test(read(f).replace(/import[^\n]*\n/g, '')), false, f + ' uses bare ico(');
  const css = read('css/economy.css');
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, 'hex colour');
  for (const m of css.matchAll(/font(?:-size)?:[^;]*?(\d+)px/g)) assert.ok(Number(m[1]) >= 14 || /\/\d+px/.test(m[0]) , 'font under 14px: ' + m[0]);
  assert.match(css, /prefers-reduced-motion: reduce/);
  for (const sel of ['ec-slot', 'ec-item', 'ec-actions .c-btn']) assert.ok(new RegExp(sel.replace(' ', '[^}]*?') ).test(css));
  assert.doesNotMatch(css, /animation\s*:\s*(?!none)\S/);
});

test('QA fixes: dispatch names match the store, confirm title is focusable, plain words, real next league, top level panel, Legend shows built', () => {
  const cmds = read('js/store/commands.js');
  for (const n of ['StartBuild', 'BuySink', 'BuyMedal', 'BuyLegacy']) assert.ok(cmds.includes("case '" + n + "'"), n);
  const r = fakeRoot(); renderStadium(r, mk({ fans: 120 }), () => {});
  assert.match(r.innerHTML, /Needs 310 Fans, you have 120/);
  assert.match(r.innerHTML, /League 2 needs Stadium.2\./);
  assert.doesNotMatch(r.innerHTML, /blur|bonus \+/);
  r.click({ 'data-econ-pick': 'stadium' });
  assert.match(r.innerHTML, /<h3 class="ec-h" tabindex="-1">/);
  const top = mk({ fac: { stands: 5, gym: 5, shop: 5, nets: 5, pitch: 5, academy: 5, scout: 5 }, stadium: 5 });
  const r2 = fakeRoot(); renderStadium(r2, top, () => {}); r2.click({ 'data-econ-pick': 'gym' });
  assert.match(r2.innerHTML, /Gym: top level/); assert.match(r2.innerHTML, /Close/); assert.doesNotMatch(r2.innerHTML, /Nothing more to build/);
  const r3 = fakeRoot(); renderSinks(r3, mk({ stadium: 4, legacy: 3 }), () => {});
  assert.match(r3.innerHTML, /3 built so far/);
  assert.equal((r3.innerHTML.match(/ec-seg is-on/g) || []).length, 3);
});

test('sinks sheet: coach licence note uses a coach letter, no level digits', async () => {
  const { splitName } = await import('../js/ui/sinks-sheet.js');
  const n = splitName('Master Coach Licence (opens one tree top without the level-3 coach)').note;
  assert.match(n, /a B- coach/); assert.doesNotMatch(n, /level/);
});
