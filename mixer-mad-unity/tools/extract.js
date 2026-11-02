#!/usr/bin/env node
// Extracts level geometry + vehicle collision geometry + the tunable tables from a Mixer Mad HTML build.
// usage: node tools/extract.js [path/to/mixer-mad-vNN.html] [--out Sim/Data] [--tuning]
//   writes  <out>/levels.json   (level specs, level weather, yard specs)
//           <out>/vehicles.json (per-vehicle wheel/probe geometry, computed by running the HTML's own vehGeom)
//   --tuning: also refreshes the extracted tables (phys, parK, wxGrip, vinfo, globals) inside <out>/tuning.json,
//             leaving every hand-listed constant in that file untouched.
// Re-run on a newer HTML (v7i...) to pick up changed numbers. No dependencies beyond node.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? (args.splice(i, 1), true) : false; };
const opt = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const WRITE_TUNING = flag('--tuning');
const OUT = opt('--out', path.join(__dirname, '..', 'Sim', 'Data'));
const SRC = args[0] || '/mnt/project-files/games-proto/cement-mixer/mixer-mad-v7h.html';
const html = fs.readFileSync(SRC, 'utf8');

// ---- locate the game script (the one that declares PHYS) and the sprite manifest ----
const scripts = []; { const re = /<script>([\s\S]*?)<\/script>/g; let m; while ((m = re.exec(html))) scripts.push(m[1]); }
const game = scripts.find(s => /const PHYS\s*=/.test(s) && /function startLevel/.test(s));
if (!game) throw new Error('game script not found');
const spriteScript = scripts.find(s => /window\.MM_SPRITES_DATA\s*=/.test(s.slice(0, 200)));
if (!spriteScript) throw new Error('MM_SPRITES_DATA not found');
const SPR = JSON.parse(spriteScript.slice(spriteScript.indexOf('{'), spriteScript.lastIndexOf('}') + 1));
const SPRM = SPR.manifest.assets;

// ---- source grabbing with bracket matching (skips strings, line and block comments) ----
function skipStr(s, i) { const q = s[i]; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } return i; }
function matchEnd(s, i) { // i at an opening ( [ {; returns index of matching close
  const st = []; for (; i < s.length; i++) { const c = s[i];
    if (c === '"' || c === "'" || c === '`') { i = skipStr(s, i); continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 1; continue; }
    if (c === '(' || c === '[' || c === '{') st.push(c);
    else if (c === ')' || c === ']' || c === '}') { st.pop(); if (!st.length) return i; } }
  throw new Error('unbalanced'); }
function grabConst(name) { // returns the initializer expression text of `const NAME = ...;`
  const re = new RegExp('(?:const|let)\\s+' + name + '\\s*=\\s*'); const m = re.exec(game); if (!m) throw new Error('const ' + name + ' not found');
  let i = m.index + m[0].length; const start = i;
  while (i < game.length) { const c = game[i];
    if (c === '(' || c === '[' || c === '{') { i = matchEnd(game, i) + 1; continue; }
    if (c === "'" || c === '"') { i = skipStr(game, i) + 1; continue; }
    if (c === ';' || c === '\n') break; i++; }
  return game.slice(start, i); }
function grabFunc(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(game); if (!m) throw new Error('function ' + name + ' not found');
  const open = game.indexOf('{', game.indexOf(')', m.index)); return game.slice(m.index, matchEnd(game, open) + 1); }
const ev = (code, ctx) => vm.runInNewContext('(' + code + ')', ctx || {});

// ---- tables ----
const LEVELS = ev(grabConst('LEVELS')), LEVEL_WX = ev(grabConst('LEVEL_WX'));
const PHYS = ev(grabConst('PHYS')), PAR_K = ev(grabConst('PAR_K')), WXGRIP = ev(grabConst('WXGRIP'));
const LOCAL = ev(grabConst('LOCAL')), VSPR = ev(grabConst('VSPR')), VINFO_SRC = ev(grabConst('VINFO'));
const WHEEL_R = ev(grabConst('WHEEL_R'));
const HOLE_MAX = (/HOLE_MAX\s*=\s*([\d.]+)/.exec(game) || [])[1];
const gm = /const G\s*=\s*([^,;]+),\s*DT\s*=\s*([^,;]+),\s*ITER\s*=\s*([^,;]+);/.exec(game); if (!gm) throw new Error('G/DT/ITER not found');
const G = ev(gm[1]), DT = ev(gm[2]), ITER = ev(gm[3]);

// YARD: the spec arrays only (names/par/veh); the geometry builder is ported by hand in C# (Yard.cs)
const YARD = ev(grabConst('YARD')).map(y => ({ name: y.name, veh: y.veh, par: y.par, spec: y.spec }));
const yardLevelNote = 'YARD specs are data; buildYard/mkPlank/mkSeesaw/mkLift are code in Sim/Yard.cs';

// ---- vehicle geometry: run the HTML's own vehGeom() per vehicle (and per mixer skin) ----
const geoCtx = { SPRM, VSPR, LOCAL, WHEEL_R, geoCache: {}, combo3: { skin: 0 }, Math, Object };
vm.createContext(geoCtx);
vm.runInContext(grabFunc('vspr') + '\n' + grabFunc('vehGeom'), geoCtx);
function geomFor(v, skin) {
  geoCtx.combo3.skin = skin; geoCtx.geoCache = {}; // fresh each time
  const g = vm.runInContext('(function(v){ geoCache = {}; return vehGeom(v); })', geoCtx)(v);
  if (!g) return null;
  return { body: g.s.body, oy: g.oy, toy: g.toy, r4: g.r4, r5: g.r5, topY: g.topY,
    pts: g.pts, probes: g.probes.map(q => ({ lx: q.lx, ly: q.ly, top: !!q.top })) };
}
const vehicles = {};
for (const v of Object.keys(PHYS)) {
  if (v === 'mixer') vehicles[v] = [0, 1, 2, 3].map(s => geomFor(v, s));
  else vehicles[v] = [geomFor(v, 0)];
}
// "note" strings: UI text, kept out of the sim data on purpose

// Daily: weather list is the literal in dailySpec(); dino count = DINOS.length
const dm = /wx:(\[[^\]]*\])\[Math\.floor\(R\(\)\*(\d+)\)\]/.exec(game); if (!dm) throw new Error('dailySpec weather list not found');
const DAILY_WX = ev(dm[1]); if (DAILY_WX.length !== Number(dm[2])) throw new Error('daily weather count mismatch');
const DINO_COUNT = ev(grabConst('DINOS')).length;
const levels = {
  source: path.basename(SRC), note: yardLevelNote,
  levels: LEVELS, levelWeather: LEVEL_WX, yard: YARD,
  daily: { weather: DAILY_WX, dinoCount: DINO_COUNT },
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'levels.json'), JSON.stringify(levels));
fs.writeFileSync(path.join(OUT, 'vehicles.json'), JSON.stringify({ source: path.basename(SRC), local: LOCAL, wheelR: WHEEL_R, vehicles }));
console.log('levels:', LEVELS.length, 'yard:', YARD.length, 'vehicles:', Object.keys(vehicles).join(','));

if (WRITE_TUNING) {
  const tp = path.join(OUT, 'tuning.json'); const T = fs.existsSync(tp) ? JSON.parse(fs.readFileSync(tp, 'utf8')) : { consts: {} };
  const phys = {}; for (const [k, p] of Object.entries(PHYS)) { const o = Object.assign({}, p); delete o.note; phys[k] = o; }
  const vinfo = {}; for (const [k, p] of Object.entries(VINFO_SRC)) vinfo[k] = { world: p.world, crevice: !!p.crevice };
  Object.assign(T, { source: path.basename(SRC), g: G, dt: DT, iter: ITER, wheelR: WHEEL_R, holeMax: Number(HOLE_MAX), phys, parK: PAR_K, wxGrip: WXGRIP, vinfo });
  fs.writeFileSync(tp, JSON.stringify(T, null, 1)); console.log('tuning.json refreshed (extracted tables only)');
}
