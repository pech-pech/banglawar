const assert = require('assert');
const { verifyRoom, PL } = require('./verify.js');
const ids = ['t02', 't05', 't08'];
const live = PL.TEMPLATES.filter((t) => !t.tutorial && !t.retired);
const picks = ids.map((id) => live.find((t) => t.id === id)).filter(Boolean);
while (picks.length < 3) picks.push(live[picks.length * 3]);
let fails = 0;
const t = (name, fn) => { try { fn(); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + e.message); } };
for (const tpl of picks) {
  const room = tpl.make(PL.mulberry32(7919 + 13)); room.templateId = tpl.id;
  const r = verifyRoom(room, { tier: tpl.tier || 1 });
  console.log(`${tpl.id} tier${tpl.tier} solvable=${r.solvable} in=${r.inputs} minWin=${r.minWindowTicks} winOk=${r.windowOk} jitter=${r.jitterClear.toFixed(2)} feat=${r.features.length} ${r.ms}ms`);
  t(tpl.id, () => assert.strictEqual(r.solvable, true));
  const f = verifyRoom.fast(room, { tier: tpl.tier || 1 });
  console.log(`  fast: solvable=${f.solvable} jitter=${f.jitterClear.toFixed(2)} ${f.ms}ms`);
}
// impossible: exit sealed in a wall box
const base = picks[0].make(PL.mulberry32(1));
const e = base.exit;
base.walls = base.walls.concat([[e.x - 40, e.y - 40, 80, 12], [e.x - 40, e.y + 28, 80, 12], [e.x - 40, e.y - 40, 12, 80], [e.x + 28, e.y - 40, 12, 80]]);
base.templateId = 'sealed';
const s = verifyRoom(base, { tier: 1 });
console.log(`sealed solvable=${s.solvable} ${s.ms}ms`);
t('sealed', () => assert.strictEqual(s.solvable, false));
console.log(fails ? 'FAIL' : 'PASS');
process.exit(fails ? 1 : 0);
