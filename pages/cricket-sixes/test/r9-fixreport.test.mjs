// r9 fix round (report part): B1 matchday start logs the match, M1 club events read by the text, M5 gear placement, m3 gear stages, m11 copy wording, m12 feel pk question.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { createStore } from '../js/store/store.js';
import { KEY } from '../js/report/log.js';
import { buildText, buildData, buildSummary } from '../js/report/report.js';
import { FLAG_DEFAULTS, BUILD } from '../js/report/build.js';
import { planFeel, QUESTIONS } from '../js/report/feel.js';
import { step } from './_season-bot.mjs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
function fakeDom() {
  const mk = () => ({ addEventListener() {}, removeEventListener() {}, querySelector: () => null });
  const win = { localStorage: mem(), innerWidth: 344, innerHeight: 780, devicePixelRatio: 2, addEventListener() {} };
  globalThis.window = win; globalThis.document = { ...mk(), hidden: false, body: {} }; globalThis.location = { search: '' };
  globalThis.MutationObserver = class { observe() {} };
  return win;
}
async function hooked(seed, el) {
  const win = fakeDom();
  const { attachReport } = await import('../js/report/hooks.js?' + Math.random());
  const store = createStore(null); store.dispatch('NewGame', { seed });
  const rep = attachReport(el || { querySelector: () => null }, store);
  const run = (cmd, p) => { const before = store.get(); store.dispatch(cmd, p); rep.dispatched(cmd, p, before, store.get()); };
  return { rep, store, run, proxy: { get: store.get, dispatch: run }, data: () => JSON.parse(win.localStorage.getItem(KEY)) };
}
const withFlags = async (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return await fn(); } finally { Object.assign(FLAGS, old); } };

test('B1: StartMatch -> matchday -> MatchdayGo -> BowlOver gives one record, and the feel strip plans a question for it', () => withFlags({ matchday: true }, async () => {
  const h = await hooked('fixrpt-1');
  h.run('StartMatch'); // the hub's own command; may go via the squad first
  let g = 0; while (h.store.get().stage !== 'matchday' && g++ < 20) { if (!step(h.proxy)) break; }
  assert.equal(h.store.get().stage, 'matchday');
  assert.equal(h.data().matches.length, 0);
  h.run('MatchdayGo'); assert.equal(h.store.get().stage, 'bowl');
  h.run('BowlOver');
  const ms = h.data().matches; assert.equal(ms.length, 1); assert.equal(ms[0].ov.length, 1);
  g = 0; while (h.store.get().stage !== 'done' && g++ < 4000 && step(h.proxy)); // finish the match
  assert.equal(h.store.get().stage, 'done');
  const d = h.data(), m = d.matches[d.matches.length - 1]; assert.equal(d.matches.length, 1); assert.ok(m.res);
  assert.ok(planFeel(m, d).length >= 1, 'feel strip has a question for the matchday match');
}));

const B = 'sixes-w1', ENV = { build: B, now: Date.UTC(2026, 10, 13, 18, 0), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 4 };
const mm = { id: 1, build: B, res: 'won', seed: 's', k: 'L', r: 1, us: 61, them: 58, m: { k: 'wk', n: 2 }, t0: 1000, t1: 61000, ov: [], gl: {}, why: 0, sk: 0, feel: {}, coins0: 100, coins1: 180, fans0: 10, fans1: 50, pay: { total: 90 }, eco: { gate: 120, win: 70, shop: 6, wage: 100, up: 16, net: 80, fans: 40, arr: 0 } };
const club = [
  { q: 1, b: B, s: 1, k: 'act', id: 'banner', coins: 85, fans: 30, find: { type: 'coach', id: 'c9' }, dry: 0 },
  { q: 2, b: B, s: 1, k: 'act', id: 'street', coins: 20, fans: 8, find: { type: 'coins', coins: 25 }, dry: 1 },
  { q: 3, b: B, s: 1, k: 'fp', what: 'gym' },
  { q: 4, b: B, s: 1, k: 'sign', who: { kind: 'coach', id: 'c9', wage: 0 } },
  { q: 5, b: B, s: 1, k: 'decl', who: { kind: 'player', id: 'p77', wage: 12 } },
];

test('M1: logged club events show in ECONOMY and COACHES (text, short and JSON); empty window stays none', () => {
  const data = { sessions: [], matches: [mm], club };
  const t = buildText(data, ENV);
  assert.match(t, /Activities 2: Coins spent 105, Fans \+38, finds 2 \(coins 1, player 0, coach 1\), dry picks 1\./);
  assert.match(t, /Free pick: gym\./);
  assert.match(t, /Trials: coach signed 1, declined 0; player signed 0, declined 1\./);
  assert.match(buildSummary(data, ENV), /2 activities/);
  const j = JSON.parse(buildData(data, ENV)); assert.deepEqual(j.E.act, [2, 105, 38, 2]); assert.deepEqual(j.C.trial, [1, 0, 0, 1]);
  assert.ok(t.length <= 2500);
  const only = buildText({ sessions: [], matches: [], club }, ENV);
  assert.match(only, /Activities 2/); assert.match(only, /Trials: coach signed 1/);
  assert.ok(!/Activities/.test(buildText({ sessions: [], matches: [mm] }, ENV)));
});

test('M1: a real PickActivity is logged and the report text then names it', () => withFlags({ activities: true }, async () => {
  const h = await hooked('fixrpt-2');
  let g = 0; while (h.store.get().stage !== 'hub' && g++ < 20) step(h.proxy);
  h.store.get().econ.coins = Math.max(h.store.get().econ.coins, 500);
  const before = h.store.get(); h.run('PickActivity', { id: 'street' });
  assert.notEqual(h.store.get(), before, 'activity accepted');
  const d = h.data(); assert.equal(d.club.length, 1); assert.equal(d.club[0].k, 'act');
  assert.match(buildText({ ...d, matches: [] }, { ...ENV, build: BUILD }), /Activities 1: Coins spent/); // live records carry the running BUILD; the report window keeps only that build
}));

test('M5 + m3: gear goes before .q when there is no .help-btn, appends otherwise, and freepick/matchday are gear stages', async () => {
  const kids = (list) => { const o = { children: list, insertBefore(n, ref) { const i = ref ? list.indexOf(ref) : -1; if (i < 0) list.push(n); else list.splice(i, 0, n); n.parentNode = o; }, appendChild(n) { list.push(n); n.parentNode = o; } }; return o; };
  const mkEl = (cls) => ({ cls, addEventListener() {}, setAttribute() {}, appendChild() {} });
  for (const [cls, expect] of [['q', 'before-q'], ['help-btn', 'before-help'], [null, 'last']]) {
    const win = fakeDom(); const list = []; const strip = kids(list);
    const mid = mkEl('mid'); mid.parentNode = strip; list.push(mid);
    const other = cls ? mkEl(cls) : null; if (other) { other.parentNode = strip; list.push(other); }
    strip.querySelector = (sel) => (sel.includes('.st-gear') ? list.find((x) => x.className === 'c-icon-btn st-gear') || null : sel === '.help-btn' ? (cls === 'help-btn' ? other : null) : sel === ':scope > .q' ? (cls === 'q' ? other : null) : null);
    globalThis.document.createElement = () => ({ className: '', style: {}, addEventListener() {}, setAttribute() {}, appendChild() {}, set textContent(v) {} });
    const el = { querySelector: (s) => (s === '.strip' ? strip : null) };
    const store = createStore(null); store.dispatch('NewGame', { seed: 'g' + expect });
    const { attachReport } = await import('../js/report/hooks.js?' + Math.random());
    const rep = attachReport(el, store);
    for (const stg of ['squad', 'freepick', 'matchday']) { list.length = 0; list.push(mid); if (other) list.push(other); rep.rendered({ ...store.get(), stage: stg }); }
    const gi = list.findIndex((x) => x.className && x.className.includes('st-gear'));
    assert.ok(gi >= 0, expect + ': gear inserted');
    if (expect === 'last') assert.equal(gi, list.length - 1); else assert.equal(gi, list.length - 2);
    assert.equal(list[0], mid, 'title element stays first');
  }
});

test('m11 + m12: copy wording and the picks question', async () => {
  assert.equal(QUESTIONS.pk.text, 'Did your picks matter this match?');
  const src = (await import('node:fs')).readFileSync(new URL('../js/report/settings.js', import.meta.url), 'utf8');
  assert.ok(src.includes('Copied the last report again.') && !src.includes("'Last report again'"));
  assert.ok(src.indexOf('st-status') < src.indexOf('data-st="full"'), 'status line is above the copy buttons');
});
