// report.js (REPORT maker, btb-lessons-1). Pure text helpers; imports core.js constants only.
import { BUILD, DEFAULTS, SCARS, mkConfig } from './core.js';

const m2 = (x) => (Math.round((+x || 0) * 100) / 100).toFixed(2);
const sg = (x) => (x >= 0 ? '+' : '-') + m2(Math.abs(x));
const pc = (x) => (Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%';

function same(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of ks) if (!same(a[k], b[k])) return false;
    return true;
  }
  return a === b;
}

function diffKeys(c) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (!same(c[k], DEFAULTS[k])) out[k] = c[k];
  return out;
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function protoCheck(profile, c) {
  c = c || mkConfig();
  const days = (profile.days || []).filter((d) => d.stall === profile.stall);
  const r = { status: 'WAIT', day1Rate: 0, medRate: 0, ratio: 0, reason: '' };
  if (days.length < 5) { r.reason = `need 5 days, have ${days.length}`; return r; }
  const d1 = days[0];
  r.day1Rate = d1.rate;
  r.medRate = median(days.slice(2, 5).map((d) => d.rate));
  r.ratio = d1.rate > 0 ? r.medRate / d1.rate : 0;
  const why = [];
  if (!c.sameMarkets) why.push('markets differ each day');
  if (d1.trades < c.protoMinTrades) why.push(`day 1 trades ${d1.trades} < ${c.protoMinTrades}`);
  if (d1.deliberate > 0) why.push(`day 1 had ${d1.deliberate} deliberate loss(es)`);
  if (d1.rate <= 0) why.push('day 1 profit not > 0');
  if (why.length) { r.status = 'VOID'; r.reason = why.join('; '); return r; }
  r.status = r.ratio >= c.protoTarget ? 'PASS' : 'MISS';
  r.reason = r.status === 'PASS' ? 'power grew profit' : 'ratio under target';
  return r;
}

export function dayLine(s, c) {
  c = c || mkConfig();
  const sc = [];
  for (const d of s.drops || []) {
    // admin default: cover added by a drop = net * lessonRate
    sc.push(`${SCARS[d.type]?.name ?? d.type}:+${m2(d.net * c.lessonRate)}`);
  }
  for (const g of s.grew || []) sc.push(`${SCARS[g.type]?.name ?? g.type}:+${m2(g.add)}`);
  const perks = (s.perks || []).length ? s.perks.join(',') : '-';
  const les = (s.lessons || []).length ? s.lessons.map((t) => SCARS[t]?.name ?? t).join(',') : '-';
  return `D${s.day} ${(s.goods || []).join('/')} start ${m2(s.startCash)} end ${m2(s.endCash)} profit ${sg(s.profit)} (${pc(s.rate)}) trades ${s.trades} losing ${s.losing} deliberate ${s.deliberate} paid ${m2(s.paid)} scars ${sc.length ? sc.join(',') : '-'} perks ${perks} lessons ${les}`;
}

export function report(profile, c) {
  c = c || mkConfig();
  const cash = profile.cash ?? c.startCash;
  const dev = diffKeys(c);
  const p = protoCheck(profile, c);
  const L = profile.ledger || { lossCash: 0, coverGranted: 0, paid: 0 };
  const ok = L.paid <= L.coverGranted + 1e-9 && L.coverGranted <= 0.5 * L.lossCash + 1e-9;
  const out = [];
  out.push(`Bad Trade Bazaar ${BUILD} | stall ${profile.stall} | day ${profile.day} | cash ${m2(cash)}`);
  out.push(c.sameMarkets ? `markets: same (seed ${c.run1Seed})` : 'markets: new each day');
  out.push(Object.keys(dev).length ? `config: DEV ${JSON.stringify(dev)}` : 'config: default');
  for (const s of profile.days || []) out.push(dayLine(s, c));
  out.push(`PROTO ${p.status} day1 ${pc(p.day1Rate)} med3-5 ${pc(p.medRate)} ratio ${pc(p.ratio)} target ${Math.round(c.protoTarget * 100)}% ${p.reason}`);
  out.push(`VOID rule: day 1 needs >= ${c.protoMinTrades} trades, 0 deliberate losses, profit > 0, same markets`);
  out.push(`cover: ${(profile.cover || []).map(m2).join(' ')}  ledger lost ${m2(L.lossCash)} granted ${m2(L.coverGranted)} paid ${m2(L.paid)}`);
  out.push(`INVARIANT ${ok ? 'ok' : 'BROKEN'} (paid <= granted <= 50% lost)`);
  return out.join('\n');
}
