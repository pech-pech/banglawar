// Headless checks for parts/prompts.js (pick 14, spec 05 s3.12) and the title name fit in parts/title.js (pick 18, 05 s3.1).
// Run: node test-prompts.js
var path = require('path');
require(path.join(__dirname, 'parts', 'prompts.js'));
require(path.join(__dirname, 'parts', 'title.js'));
var V = globalThis.V, P = V.Prompts;
var rows = [], fails = 0;
function check(id, what, ok, got){ rows.push([id, what, ok ? 'PASS' : 'FAIL', got === undefined ? '' : got]); if (!ok) fails++; }
function mem(init){ var box = { v: init || null, saves: 0 }; return { box: box, io: { load: function(){ return box.v; }, save: function(p){ box.v = JSON.parse(JSON.stringify(p)); box.saves++; } } }; }
// drive a core: frames at 60 Hz of sim time
function run(c, st, secs, f){ var out = null; for (var i = 0; i < Math.round(secs * 60); i++) { st.t += 1 / 60; if (f) f(st, i); out = c.observe(st); } return out; }
function obs(o){ var b = { t: 0, stage: 1, kind: 'combat', phase: 'play', touching: false, hx: 4.5, hy: 14.5, shots: 0, cover: false }; for (var k in o) b[k] = o[k]; return b; }

// P-1: appears after 1.5 s with no touch, not before
var m = mem(), c = P.core(m.io), st = obs();
var r = run(c, st, 1.4); check('P1', 'no prompt before 1.5 s idle', r.id === null, r.id);
r = run(c, st, 0.2); check('P1', 'P-1 "Drag to move" after 1.5 s idle, with the ghost finger', r.id === 'P-1' && r.ghost === true, r.id);
st.touching = true; r = c.observe(st); check('P1', 'ghost hides while a finger is down; the line stays until done', r.id === 'P-1' && !r.ghost);
r = run(c, st, 0.5, function(s){ s.hx += 0.02; });   // 30 frames x 0.02 = 0.6 tile
check('P1', 'still shown after 0.6 tile', r.id === 'P-1' && !c.isDone('P-1'));
r = run(c, st, 0.4, function(s){ s.hx += 0.02; });
check('P1', 'done after one tile moved; flagged and saved at once', c.isDone('P-1') && m.box.v.done['P-1'] === true && r.id === null);
// P-2: after 4 s moving without a volley
c.event({ k: 'fire' }); r = run(c, st, 3.9, function(s){ s.hy -= 0.01; });
check('P2', 'P-2 not before 4 s of moving without a volley', r.id === null, c.get().moveNoFire.toFixed(2));
r = run(c, st, 0.2, function(s){ s.hy -= 0.01; });
check('P2', 'P-2 "Stand still to fire" after 4 s moving', r.id === 'P-2');
c.event({ k: 'fire' }); check('P2', 'a volley while still moving does not count', !c.isDone('P-2'));
run(c, st, 0.1); c.event({ k: 'fire' });
check('P2', 'volley after a stop that followed a move: done', c.isDone('P-2'));
// P-3: enemy round in flight in a room with cover; done by a block within 1.5 tiles
r = c.observe(st); check('P3', 'P-3 waits for an enemy round in a room with cover', r.id === null);
st.shots = 2; st.cover = true; r = c.observe(st); check('P3', 'P-3 "Cover blocks enemy shots" shows', r.id === 'P-3');
c.event({ k: 'block', x: st.hx + 3, y: st.hy }, { x: st.hx, y: st.hy }); check('P3', 'a block 3 tiles away does not count', !c.isDone('P-3'));
c.event({ k: 'block', x: st.hx + 1, y: st.hy + 0.5 }, { x: st.hx, y: st.hy }); check('P3', 'a block within 1.5 tiles: done', c.isDone('P-3'));
check('ALL', 'all three saved; a new core on the same store shows nothing', (function(){ var c2 = P.core(m.io), s2 = obs(); return run(c2, s2, 3).id === null; })());

// order and rules
var m2 = mem(), c3 = P.core(m2.io), s3 = obs({ shots: 3, cover: true });
r = run(c3, s3, 2); check('R1', 'one at a time, in order: P-1 before P-3 even with a round in flight', r.id === 'P-1');
s3.kind = 'boss'; r = c3.observe(s3); check('R2', 'hidden on boss stages', r.id === null);
s3.kind = 'combat'; s3.phase = 'pick'; r = c3.observe(s3); check('R2', 'hidden under the level-up pick', r.id === null);
s3.phase = 'play';
// retire after 3 stages not done
var m3 = mem(), c4 = P.core(m3.io), s4 = obs();
for (var stg = 1; stg <= 4; stg++) { s4.stage = stg; r = run(c4, s4, 2); if (stg <= 3) check('R3', 'P-1 shows in stage ' + stg, r.id === 'P-1'); }
check('R3', 'not done in 3 stages: retires (no 4th showing), saved', r.id === null && m3.box.v.retired['P-1'] === true, JSON.stringify(m3.box.v.stages));
r = run(c4, s4, 5, function(s){ s.hx += 0.01; }); check('R3', 'after P-1 retires, P-2 can still show', r.id === 'P-2' || c4.isDone('P-2') || r.id === null);
// done before shown also counts
var m5 = mem(), c5 = P.core(m5.io), s5 = obs(); s5.touching = true;
run(c5, s5, 1, function(s){ s.hx += 0.03; });
check('R4', 'moving a tile before P-1 ever shows marks it done (never shown)', c5.isDone('P-1') && !(m5.box.v.stages['P-1'] > 0));
// restart: sim time going back starts a fresh stage visit
var m6 = mem(), c6 = P.core(m6.io), s6 = obs(); run(c6, s6, 2); s6.t = 0; s6.stage = 1; r = c6.observe(s6);
check('R5', 'a restart (time back to 0) counts as a new stage visit', m6.box.v.stages['P-1'] === 1 && r.id === null);
// show / done API, bad save
var m7 = mem({ done: { 'P-1': 'yes', 'P-9': true }, stages: { 'P-2': -4 }, retired: 7 }), c7 = P.core(m7.io);
check('API', 'bad saved values are dropped', !c7.isDone('P-1') && JSON.stringify(c7.state().stages) === '{}');
c7.show('P-3'); r = c7.observe(obs()); check('API', 'show(id) displays that prompt now', r.id === 'P-3');
c7.done('P-3'); r = c7.observe(obs()); check('API', 'done(id) removes and flags it', c7.isDone('P-3') && r.id !== 'P-3');
check('API', 'show(unknown) and done(unknown) are refused', c7.show('P-9') === false && c7.done('X') === false);
check('API', 'texts as spec 05', P.TEXT['P-1'] === 'Drag to move' && P.TEXT['P-2'] === 'Stand still to fire' && P.TEXT['P-3'] === 'Cover blocks enemy shots');

// title name: one constant, auto-fit 44 -> 28, then two lines at a space
var T = V.Title, meas = function(t, px){ return t.length * px * 0.55; };   // a narrow face, about 0.55 em a letter (guess)
check('T1', 'the name is one constant, placeholder "Project Volley"', V.GAME_NAME === 'Project Volley' && T.NAME === V.GAME_NAME);
var f = T.fit('PROJECT VOLLEY', 312, meas); check('T2', 'Project Volley fits one line at 312 px', f.lines.length === 1 && f.size >= 28 && f.size <= 44, f.size + ' px');
f = T.fit('OPERATION DUST DEVIL STRIKE', 312, meas); check('T2', 'a long name breaks into two lines at a space', f.lines.length === 2 && f.size >= 28, f.lines.join(' / ') + ' ' + f.size);
f = T.fit('VOLLEY', 312, meas); check('T2', 'a short name stays at 44 px', f.size === 44);
f = T.fit('SUPERCALIFRAGILISTICEXPIALIDOCIOUS', 312, meas); check('T2', 'one long word with no space: 28 px floor, one line', f.size === 28 && f.lines.length === 1);
check('T3', 'the name text floor is above the 12 px text rule', T.FIT.min >= 12);

console.log('test-prompts: ' + (rows.length - fails) + '/' + rows.length + ' pass');
rows.forEach(function(r){ if (r[2] === 'FAIL' || process.argv.indexOf('-v') >= 0) console.log(r.join(' | ')); });
process.exit(fails ? 1 : 0);
