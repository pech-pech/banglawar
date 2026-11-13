import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render as squad } from '../js/ui/squad-view.js';
import { render as hub } from '../js/ui/hub-view.js';
import { payCard } from '../js/ui/result-view.js';
import { playerHtml } from '../js/ui/player-sheet.js';
import { abilityCell } from '../js/ui/dom.js';
import { abilityLine, benchSlots, rawCell, shownCell, SQUAD_FULL } from '../js/ui/letters-ui.js';
import { letterOfShown, STEPS } from '../js/core/letters.js';
import { GLOSSARY } from '../js/data/glossary.js';

const fake = () => ({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, contains: () => false });
const text = (h) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const P = (id, bat, bowl, order, grade = 'C') => ({ id, name: 'P' + id, role: 'Opener', type: 'Fast', bat, bowl, ability: Math.round((bat + bowl) / 2), grade, pips: 1, peak: false, max: false, order });
const players = [P('a', 150, 60, 0), P('b', 70, 85, 1), P('c', 55, 75, 2), P('d', 120, 50, 3), P('e', 65, 65, 4), P('f', 60, 70, 5), P('g', 45, 38, null), P('h', 33, 52, null)];

test('squad: bat, bowl and ability are letters with a bar, never digits', () => {
  const el = fake(); squad(el, { players, count: 6, valid: true, reason: '' }, () => {});
  const cells = el.innerHTML.split('sq-nbox').slice(1).join('sq-nbox');
  assert.ok(!/<b[^>]*>\s*\d+\s*<\/b>/.test(cells.replace(/sq-ord[^<]*<[^>]*>/g, '')), 'no digit-only <b> in a rating box');
  assert.ok(!/batting \d|bowling \d|ability \d/i.test(el.innerHTML), 'aria has no rating digits');
  assert.match(el.innerHTML, new RegExp('lt-box lt-' + letterOfShown(150).charAt(0)));
});

test('squad: bench slots are soft labels with a fit tick, Confirm stays on', () => {
  const el = fake(); squad(el, { players, count: 6, valid: true, reason: '' }, () => {});
  assert.match(el.innerHTML, /Bench batter/); assert.match(el.innerHTML, /Bench bowler/);
  assert.match(el.innerHTML, /sq-fit/);
  assert.ok(!/data-confirm[^>]*disabled/.test(el.innerHTML));
  const full = fake(); squad(full, { players, count: 6, valid: true, reason: '', squadFull: true, adding: true }, () => {});
  const idle = fake(); squad(idle, { players, count: 6, valid: true, reason: '', squadFull: true }, () => {});
  assert.ok(!idle.innerHTML.includes(SQUAD_FULL), 'the full line shows only in an add flow');
  assert.ok(full.innerHTML.includes(SQUAD_FULL));
});

test('benchSlots: batter is the better bat, bowler the better bowl, mismatch shows no tick', () => {
  const m = benchSlots([{ id: 1, bat: 40, bowl: 70 }, { id: 2, bat: 80, bowl: 30 }]);
  assert.deepEqual(m.get(2), { label: 'Bench batter', fit: true }); assert.deepEqual(m.get(1), { label: 'Bench bowler', fit: true });
  const w = benchSlots([{ id: 1, bat: 40, bowl: 70 }, { id: 2, bat: 30, bowl: 60 }]);
  assert.equal(w.get(1).label, 'Bench batter'); assert.equal(w.get(1).fit, false);
});

test('player sheet prints letters, no 20-200 or 1-99 numbers', () => {
  const h = playerHtml({ id: 'x', name: 'X', age: 17, role: 'opener', type: 'fast', grade: 'B', pips: 1, ability: { overall: 133 }, ratings: [{ key: 'batPower', val: 77 }, { key: 'batSkill', val: 41 }, { key: 'bowlSpeed', val: 23 }, { key: 'bowlSkill', val: 58 }], node: { cost: 30 } });
  for (const n of ['133', '77', '41', '23', '58']) assert.ok(!text(h).includes(' ' + n + ' ') && !h.includes('>' + n + '<'), n);
  assert.ok(!h.includes('/200'));
  assert.match(h, /lt-bar/);
});

test('ability helpers: letters only', () => {
  assert.ok(!/\d/.test(text(abilityCell(110, false)))); assert.ok(!/\d/.test(text(abilityCell(110, true))));
  assert.ok(!/\d/.test(text(abilityLine(110).html))); assert.ok(!/\d/.test(text(shownCell(120).html) + text(rawCell(50).html)));
  assert.equal(abilityLine(20).letter, 'F-'); assert.equal(abilityLine(200).letter, 'S+');
  assert.equal(STEPS.length, 21);
});

test('pay card: base, win with note, stars with who, total; win line hidden on a loss', () => {
  const pay = { kind: 'league', base: 45, win: 14, winNote: 'rival a little stronger', stars: 5, starsTp: 20, total: 79, starList: [{ id: 'a', name: 'Ravi', why: '31 runs' }] };
  const h = payCard(pay), t = text(h);
  assert.match(t, /Squad base 45/); assert.match(t, /Win \(rival a little stronger\) \+14/); assert.match(t, /Stars x5/); assert.match(t, /\+20/); assert.match(t, /Total 79 TP/);
  assert.match(h, /data-pay-stars/); assert.match(t, /Ravi.*31 runs/);
  const loss = text(payCard({ ...pay, win: 0, winNote: '', stars: 0, starsTp: 0, total: 45, starList: [] }));
  assert.ok(!/Win/.test(loss)); assert.match(loss, /Total 45 TP/);
});

test('hub: letter pair and the one gentle squad-of-8 line', () => {
  const el = fake();
  hub(el, { season: { n: 1, league: 1 }, phaseWord: 'League', tp: 45, next: { oppName: 'Brackwell CC', tag: null }, gap: { ours: 'D', theirs: 'D+' }, notice: { kind: 'squad8', moved: 2 }, cta: { label: 'Start match' },
    six: players.slice(0, 6).map((p) => ({ id: p.id, name: p.name, grade: 'C' })), promo: { title: 't', total: 3, done: 0, rows: [] }, plan: { word: 'Suggested', ok: true } }, () => {});
  const t = text(el.innerHTML);
  assert.match(t, /Our six D/); assert.match(t, /Their six D\+/); assert.match(t, /The squad is now 8\. 2 players moved on\./);
});

test('glossary: ability is a letter, no 20 to 200 wording', () => {
  const g = GLOSSARY.find((x) => x.id === 'ability');
  assert.ok(!/20 to 200|number/.test(g.short + g.long));
  assert.ok(!GLOSSARY.some((x) => /\b(100-111|112-123|124-139|140-185)\b/.test(x.long)));
});

test('source: no view prints a raw rating (ability, bat, bowl, potential) outside letters-ui', () => {
  const files = ['bowl-view', 'chase-view', 'plan-view', 'six-sheet', 'squad-view', 'player-sheet', 'hub-view', 'runend-view', 'table-sheet', 'end-view', 'tree-sheet', 'result-view'];
  const bad = /esc\((p|b|x)\.(ability|potential)\)|\$\{(p|b)\.ability\}|esc\(p\.(bat|bowl)\)|esc\(a\.overall\)|esc\(r\.val\)|esc\(vm\.potential\)/;
  for (const f of files) {
    const src = readFileSync(new URL('../js/ui/' + f + '.js', import.meta.url), 'utf8');
    src.split('\n').forEach((ln, i) => { if (bad.test(ln)) assert.fail(f + ':' + (i + 1) + ' ' + ln.trim()); });
  }
});

test('QA: [hidden] lists stay hidden (display rule needs a [hidden] rule)', () => {
  const css = readFileSync(new URL('../css/letters.css', import.meta.url), 'utf8');
  assert.match(css, /\.pay-who\[hidden\]\s*\{\s*display:\s*none/);
  for (const m of css.matchAll(/(\.[\w-]+)\s*\{[^}]*display:\s*(?:grid|flex)/g)) {
    if (m[1] === '.pay-who') assert.match(css, /\.pay-who\[hidden\]/);
  }
});
test('QA: squad rows have a separate player-card button; header has no drills; bench tag on its own line', () => {
  const el = fake(); squad(el, { players, count: 6, valid: true, reason: '' }, () => {});
  assert.match(el.innerHTML, /data-act="sheet:player"/); assert.ok(!/Player · drills/.test(el.innerHTML));
  assert.match(el.innerHTML, /sq-benchline/);
});
