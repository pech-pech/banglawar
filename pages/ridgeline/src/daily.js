// Daily dune helpers. Pure: the clock is injected, no Date.now, no Math.random.
import { hashSeed } from './rng.js';

export const KEYS = {};

export function pad2(n) { return String(n).padStart(2, '0'); }

// Local calendar date 'YYYY-MM-DD' for an injected clock value (ms since epoch).
// offsetMin = minutes behind UTC (Date#getTimezoneOffset convention). Default: the
// runtime's local offset at that instant. Tests pass an explicit offset.
export function dailyDate(nowMs, offsetMin) {
  const off = Number.isFinite(offsetMin) ? offsetMin : new Date(nowMs).getTimezoneOffset();
  const d = new Date(nowMs - off * 60000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// Stable seed string: same date + rulesVersion -> same string, any hull, any try.
export function dailySeed(dateStr, rulesVersion = 1) {
  return `daily:${dateStr}:r${rulesVersion}`;
}

// Integer run seed (FNV-1a) fed to the course generator.
export function dailySeedInt(dateStr, rulesVersion = 1) {
  return hashSeed(dailySeed(dateStr, rulesVersion));
}

// Milliseconds until the next local midnight (for a rollover timer).
export function msToMidnight(nowMs, offsetMin) {
  const off = Number.isFinite(offsetMin) ? offsetMin : new Date(nowMs).getTimezoneOffset();
  const local = nowMs - off * 60000;
  const day = 86400000;
  return day - (((local % day) + day) % day);
}

function cap(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) : ''; }

// Plain copy text, no URL:
// Ridgeline Daily 2026-11-21 / 4182 m  Kite  zone 3 lap 0 / Flow 5 | clean 14/19 | caught by night
export function dailyCopyText(r) {
  const cause = r.cause === 'night' ? 'caught by night' : r.cause === 'rock' ? 'rock' : String(r.cause || 'run over');
  return [
    `Ridgeline Daily ${r.date}`,
    `${Math.floor(r.dist || 0)} m  ${cap(r.hull)}  zone ${r.zone | 0} lap ${r.lap | 0}`,
    `Flow ${r.flow | 0} | clean ${r.clean | 0}/${r.landings | 0} | ${cause}`,
  ].join('\n');
}
