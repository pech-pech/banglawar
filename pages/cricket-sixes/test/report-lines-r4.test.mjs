// Report round 4 lines: Coins reconciles, reserve WATCH needs real risk, coach line counts any job, wheel line legend + careful %.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reportParts } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';

const ENV = (save) => ({ build: 'r4', now: Date.UTC(2026, 10, 17, 12, 0), vp: 'screen 475x638', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 1, save });
const mrow = (i, c0, c1) => ({ id: 'm' + i, m: { n: 5 }, ov: [], res: 'won', coins0: c0, coins1: c1, fans0: 0, fans1: 0, eco: { gate: 100, win: 50, shop: 0, wage: 60, up: 40, arr: 0, net: c1 - c0 } });
const blankWin = () => ({ matches: [], nets: [], spins: [], weeks: [], buys: [], club: [], feel: [] });
/** Section lines (key E or C) of reportParts from a hand-made window; only those two sections read these lists. */
const sec = (key, win, save) => reportParts({ matches: [], seasons: [] }, { ...ENV(save), win: { ...blankWin(), ...win } }).secs.find((x) => x.key === key).h.join('\n');

test('R4 coins line reconciles with activities and finds', () => {
  const win = { matches: [mrow(1, 1000, 1200)], club: [{ k: 'act', coins: 60, cost: 100, fans: 5, find: { type: 'coins', coins: 40 } }, { k: 'act', coins: 50, fans: 2, find: null, dry: 1 }, { k: 'act', coins: 10, find: { type: 'coins' } }] };
  const s = sec('E', win);
  // old row (no cost): coins 60 is net of a 40 find -> gross 100; new row cost 100 gross.
  const old = sec('E', { matches: [mrow(1, 1000, 1200)], club: [{ k: 'act', coins: 60, find: { type: 'coins', coins: 40 } }] });
  assert.ok(old.includes('activities -100, finds +40'), old);
  assert.ok(s.includes('buys -0, activities -160, finds +40'), s);
  // 1000 + 150 - 100 - 160 + 40 + other = 1200 -> other 270
  assert.ok(s.includes('other 270'), s);
});

test('R4 reserve WATCH only with a warned buy and arrears or a missed payday', () => {
  const buys = [{ k: 'fac', item: 'stadium', price: 390, c0: 853, alt: 1, warn: 1 }, { k: 'sink', item: 'shop', price: 90, c0: 472, alt: 0, warn: 1 }];
  const base = { ...blankWin(), matches: [mrow(1, 1000, 1100)], buys };
  const calm = sec('E', base, { missed: 0 });
  assert.ok(!/WATCH/.test(calm), calm); // 2 warned buys alone: no flag
  const missed = sec('E', base, { missed: 1 });
  assert.ok(/WATCH/.test(missed), missed);
  const arr = sec('E', { ...base, matches: [{ ...mrow(1, 1000, 1100), eco: { ...mrow(1, 0, 0).eco, arr: 20 } }] }, { missed: 0 });
  assert.ok(/WATCH/.test(arr), arr);
  const noWarn = sec('E', { ...base, buys: buys.map((b) => ({ ...b, warn: 0 })) }, { missed: 2 });
  assert.ok(!/WATCH/.test(noWarn), noWarn);
});

test('R4 coach line counts any job and nets focus matched', () => {
  const W = [{ s: 1, wk: 1, cj: [0, 1, 0, 0], cidle: 0 }, { s: 1, wk: 2, cj: [0, 0, 1, 0], cidle: 0 }, { s: 1, wk: 3, cj: [0, 0, 0, 0], cidle: 0 }, { s: 1, wk: 4, cj: [1, 1, 0, 1], cidle: 0 }];
  const R = [{ s: 1, wk: 4, co: 1, cs: 7 }, { s: 1, wk: 3, co: 0, cs: 0 }, { s: 1, wk: 2, co: 1, cs: 0 }];
  const l = sec('C', { weeks: W, nets: R }, { coaches: [] });
  assert.ok(l.includes('any coach job 3 of 4 weeks'), l);
  assert.ok(l.includes('nets 1, match 2, study 1, scout 1'), l);
  assert.ok(l.includes('nets focus matched 1 of 2'), l);
});
