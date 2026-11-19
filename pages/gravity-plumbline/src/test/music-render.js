// node src/test/music-render.js [--roll]  - text piano-roll summary of every piece in music-data.js + expectation checks.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const g = { console, Math }; g.globalThis = g; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../parts/music-data.js'), 'utf8'), g);
const MD = g.PL.musicData;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
function seconds(p, beats) { // integrate tempo map
  const tempo = p.tempo || [[0, p.bpm]]; let s = 0;
  const at = (b) => { if (b <= tempo[0][0]) return tempo[0][1]; for (let k = 1; k < tempo.length; k++) if (b <= tempo[k][0]) return tempo[k - 1][1] + (tempo[k][1] - tempo[k - 1][1]) * (b - tempo[k - 1][0]) / (tempo[k][0] - tempo[k - 1][0]); return tempo[tempo.length - 1][1]; };
  for (let i = 0; i < beats * 8; i++) s += 60 / at((i + 0.5) / 8) / 8; return s;
}
const rows = [], roll = process.argv.includes('--roll');
for (const id of Object.keys(MD.pieces)) {
  const p = MD.pieces[id], tr = p.tracks, mel = MD.parse(tr[0].s, tr[0].o || 0);
  const len = MD.len(tr[0].s), bars = len / p.bar;
  for (const t of tr) assert.strictEqual(MD.len(t.s), len, id + ': all tracks same length');
  assert.ok(Number.isInteger(bars), id + ': whole bars, got ' + bars);
  const ms = mel.map((n) => n[2]), lo = Math.min(...ms), hi = Math.max(...ms);
  const first = mel.slice(0, 4).map((n) => nm(n[2])).join(' ');
  rows.push({ id, key: p.key, bar: p.bar, u: p.u, bars, notes: mel.length, range: nm(lo) + '-' + nm(hi), sec: seconds(p, len).toFixed(1), first, conf: p.conf });
  if (roll) {
    console.log('== ' + id + ' (' + p.key + ')');
    for (let b = 0; b < bars; b++) console.log(' bar ' + (b + 1) + ': ' + mel.filter((n) => n[0] >= b * p.bar && n[0] < (b + 1) * p.bar).map((n) => nm(n[2]) + '/' + n[1]).join(' '));
  }
}
console.log('id | key | bar(unit) | bars | melody notes | range | seconds | first 4 | conf');
for (const r of rows) console.log([r.id, r.key, r.bar + ' ' + r.u, r.bars, r.notes, r.range, r.sec, r.first, r.conf].join(' | '));
// expectations
const R = Object.fromEntries(rows.map((r) => [r.id, r]));
assert.strictEqual(R.ode.bars, 8); assert.strictEqual(R.ode.first, 'F#4 F#4 G4 A4', 'Ode: D major E E F G -> F# F# G A');
assert.strictEqual(R.ode.range, 'D4-A4'); assert.strictEqual(R.ode.notes, 30);
assert.strictEqual(R.twinkle.bars, 12); assert.strictEqual(R.twinkle.first, 'C5 C5 G5 G5');
assert.strictEqual(R.gymno.bars, 12); assert.strictEqual(R.gymno.bar, 3);
assert.strictEqual(R.canon.bars, 8); assert.strictEqual(R.canon.first, 'F#5 E5 D5 C#5'); assert.strictEqual(R.morning.bar, 6); assert.strictEqual(R.morning.first, 'B4 G#4 F#4 E4'); assert.strictEqual(R.mountain.first, 'B3 C#4 D4 E4'); assert.ok(!R.clair && !R.aquarium && !R.sugar, 'placeholders removed');
assert.strictEqual(R.elise.first, 'E5 D#5 E5 D#5');
for (const id in MD.pieces) assert.ok(MD.pieces[id].conf >= 0.7, id + ' conf'); for (const k of Object.keys(MD.moments)) assert.ok(MD.pieces[MD.moments[k]], 'moment ' + k + ' -> piece');
for (const k of Object.keys(MD.stings)) assert.ok(MD.pieces[MD.stings[k].ref], 'sting ' + k);
console.log('music-render OK');
