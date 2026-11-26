// Usage: node tests/bots.mjs [seeds=50]
import { runBot, BOTS } from './plans.mjs';
const N = Number(process.argv[2]) || 50;
const pad = (s, n) => String(s).padEnd(n);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log([pad('bot', 8), pad('stage', 5), pad('win%', 6), pad('mean%', 7), pad('p10%', 6), pad('sec', 7), pad('ms/tick', 8), 'top cause'].join(' '));
for (const bot of Object.keys(BOTS)) for (const stage of [1, 2]) {
  const pcts = [], secs = []; let win = 0, ms = 0, ticks = 0; const causes = new Map(); let rej = 0;
  for (let seed = 1; seed <= N; seed++) {
    const r = runBot(bot, stage, seed);
    pcts.push(r.result.pct); secs.push(r.result.sec); if (r.result.win) win++;
    ms += r.ms; ticks += r.ticks; rej += r.rejected.length;
    const c = r.result.cause || ''; causes.set(c, (causes.get(c) || 0) + 1);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const top = [...causes.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log([pad(bot, 8), pad(stage, 5), pad((100 * win / N).toFixed(0), 6), pad(mean(pcts).toFixed(1), 7), pad(q(pcts, 0.1), 6),
    pad(mean(secs).toFixed(1), 7), pad((ms / Math.max(1, ticks)).toFixed(3), 8), `${top ? top[0] : ''} (x${top ? top[1] : 0})` + (rej ? ` [rejected actions: ${rej}]` : '')].join(' '));
}
