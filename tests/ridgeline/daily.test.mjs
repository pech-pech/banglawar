import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySeed, dailySeedInt, dailyDate, msToMidnight, dailyCopyText } from '../../pages/ridgeline/src/daily.js';

const T = Date.UTC(2026, 10, 21, 12, 0, 0);

test('seed string and int are stable across the day and tries', () => {
  assert.equal(dailySeed('2026-11-21', 1), 'daily:2026-11-21:r1');
  const a = dailySeedInt('2026-11-21', 1);
  assert.equal(a, dailySeedInt(dailySeed && '2026-11-21', 1));
  assert.notEqual(a, dailySeedInt('2026-11-22', 1));
  assert.notEqual(a, dailySeedInt('2026-11-21', 2));
  assert.ok(Number.isInteger(a) && a >= 0);
});

test('same local date for every clock value within the day', () => {
  const off = 0;
  const start = Date.UTC(2026, 10, 21, 0, 0, 0);
  for (const h of [0, 1, 11, 23]) assert.equal(dailyDate(start + h * 3600e3 + 59e3, off), '2026-11-21');
  assert.equal(dailyDate(start + 86400e3 - 1, off), '2026-11-21');
});

test('midnight rollover local, with offsets', () => {
  const m = Date.UTC(2026, 10, 22, 0, 0, 0);
  assert.equal(dailyDate(m - 1, 0), '2026-11-21');
  assert.equal(dailyDate(m, 0), '2026-11-22');
  // UTC+6 (offset -360): 18:00 UTC is already next day
  assert.equal(dailyDate(Date.UTC(2026, 10, 21, 17, 59, 59), -360), '2026-11-21');
  assert.equal(dailyDate(Date.UTC(2026, 10, 21, 18, 0, 0), -360), '2026-11-22');
  // UTC-5 (offset 300)
  assert.equal(dailyDate(Date.UTC(2026, 10, 22, 4, 59, 59), 300), '2026-11-21');
  assert.equal(dailyDate(Date.UTC(2026, 10, 22, 5, 0, 0), 300), '2026-11-22');
  assert.equal(msToMidnight(m - 1000, 0), 1000);
  assert.equal(msToMidnight(m, 0), 86400000);
});

test('default offset uses runtime tz and yields a date string', () => {
  assert.match(dailyDate(T), /^\d{4}-\d{2}-\d{2}$/);
});

test('copy text matches spec, no URL', () => {
  const t = dailyCopyText({ date: '2026-11-21', dist: 4182.9, hull: 'kite', zone: 3, lap: 0, flow: 5, clean: 14, landings: 19, cause: 'night' });
  assert.equal(t, 'Ridgeline Daily 2026-11-21\n4182 m  Kite  zone 3 lap 0\nFlow 5 | clean 14/19 | caught by night');
  assert.ok(!/http/.test(t));
  assert.match(dailyCopyText({ date: 'x', dist: 1, hull: 'wren', cause: 'rock' }), /\| rock$/);
});
