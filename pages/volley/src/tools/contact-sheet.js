// Contact sheet (GEN-SPEC 4.4, step 4). Node, no dependencies:  node src/tools/contact-sheet.js [out.html]
// Loads the game data the way src/test-stages.js does (rooms, stages, widen), adds the baked rows 11-20 when
// src/parts/data-stages-gen.js exists, and writes ONE self-contained HTML file with code-drawn SVG: one tile per stage row,
// each room at 9 columns and at 13 columns through the real V.Widen. Walls, door, cover, spikes and spawn slots; spawns
// coloured (and numbered) by machine id. Labels: room id, stage, kind, template, machine count, ME (threat).
var path = require('path'), fs = require('fs');
var SRC = path.join(__dirname, '..');
var OUT = process.argv[2] || '/mnt/project-files/games-proto/volley/v2/contact-sheet.html';
globalThis.V = globalThis.V || {};
require(path.join(SRC, 'parts/rooms.js'));
require(path.join(SRC, 'parts/stages.js'));
require(path.join(SRC, 'parts/widen.js'));
var V = globalThis.V, notes = [];
var genPath = path.join(SRC, 'parts/data-stages-gen.js');
if (fs.existsSync(genPath)) {
  try { require(genPath); } catch (e) { notes.push('data-stages-gen.js failed to load: ' + e.message); }
  V.STAGES = V.Data.stages; V.ROOMS = V.ROOMS || V.Data.rooms;
  for (var rk in V.Data.rooms) if (!V.ROOMS[rk]) V.ROOMS[rk] = V.Data.rooms[rk];
} else notes.push('data-stages-gen.js not present: built stages only');
var meta = null;
try { meta = JSON.parse(fs.readFileSync(path.join(SRC, 'bake-meta.json'), 'utf8')); } catch (e) { notes.push('bake-meta.json not read: template and ME labels come from the built rooms only'); }
var bakeHash = 'none';
try { bakeHash = fs.readFileSync(path.join(SRC, 'bake.hash'), 'utf8').trim() || 'none'; } catch (e) {}

// ---------- labels ----------
var WEIGHT = { 'E-01':0.7, 'E-02':1.0, 'E-03':1.0, 'E-04':1.3, 'E-05':1.3 };   // GEN-SPEC threat weights (built); E-06+ later; bosses are not weighted
var MACH = ['E-01', 'E-02', 'E-03', 'E-04', 'E-05'];
function metaFor(stage, roomId){   // tolerant: array, {stages|rooms: array|object}, or an object keyed by room id or stage number
  if (!meta) return null;
  var pools = [meta, meta.rooms, meta.stages, meta.ch1], i, k, p, hit;
  for (i = 0; i < pools.length; i++) {
    p = pools[i]; if (!p || typeof p !== 'object') continue;
    if (Array.isArray(p)) { for (k = 0; k < p.length; k++) if (p[k] && (p[k].room === roomId || p[k].roomId === roomId || (p[k].stage === stage && (!p[k].chapter || p[k].chapter === 1)))) return p[k]; }
    else { hit = p[roomId] || p[String(stage)] || p['c1s' + stage]; if (hit && typeof hit === 'object') return hit; }
  }
  return null;
}
function num(x){ return typeof x === 'number' && isFinite(x) ? x : null; }
function meOf(spawns, m){
  var me = 0, unk = false, boss = false;
  spawns.forEach(function(s){ if (WEIGHT[s.type] != null) me += WEIGHT[s.type]; else if (/^B-/.test(s.type)) boss = true; else unk = true; });
  var fromMeta = m && (num(m.me) != null ? m.me : num(m.ME) != null ? m.ME : num(m.meSpent) != null ? m.meSpent : num(m.ME_spent) != null ? m.ME_spent : null);
  if (fromMeta != null) return { v: fromMeta, txt: String(Math.round(fromMeta * 100) / 100), src: 'bake-meta' };
  if (boss && !me) return { v: null, txt: 'boss', src: 'none' };
  return { v: me, txt: (Math.round(me * 100) / 100) + (unk ? '+?' : ''), src: 'weights' };
}
function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function mix(spawns){
  var c = {}; spawns.forEach(function(s){ c[s.type] = (c[s.type] || 0) + 1; });
  return Object.keys(c).sort().map(function(k){ return k + '×' + c[k]; }).join(' ') || 'none';
}

// ---------- SVG ----------
var TW = 9, TH = 15;
function cls(t){ var i = MACH.indexOf(t); return i >= 0 ? 'm' + (i + 1) : (/^B-/.test(t) ? 'mb' : 'mx'); }
function tag(t){ var i = MACH.indexOf(t); return i >= 0 ? String(i + 1) : (/^B-/.test(t) ? 'B' : '?'); }
// one grid -> svg fragment at x offset ox. grid: array of strings; fill: widen fill-cover list; spawns in tile coords.
function drawGrid(g, w, spawns, ox, fill, boss){
  var o = [], x, y, c, fillSet = {}, warn = 0;
  (fill || []).forEach(function(f){ for (var j = 0; j < f.h; j++) for (var i = 0; i < f.w; i++) fillSet[(f.x + i) + ',' + (f.y + j)] = 1; });
  o.push('<rect class="floor" x="' + ox + '" y="0" width="' + w + '" height="' + TH + '"/>');
  for (y = 0; y < TH; y++) for (x = 0; x < w; x++) {
    c = g[y][x]; var X = ox + x;
    if (c === '#') o.push('<rect class="' + (y === 0 ? 'wall' : (fillSet[x + ',' + y] ? 'cover fillc' : 'cover')) + '" x="' + X + '" y="' + y + '" width="1" height="1"/>');
    else if (c === 'D') o.push('<rect class="door" x="' + X + '" y="' + y + '" width="1" height="1"/>');
    else if (c === '^') o.push('<path class="spike" d="M' + (X + .08) + ' ' + (y + .92) + 'L' + (X + .3) + ' ' + (y + .15) + 'L' + (X + .5) + ' ' + (y + .92) + 'L' + (X + .7) + ' ' + (y + .15) + 'L' + (X + .92) + ' ' + (y + .92) + 'Z"/>');
    else if (c === 'C') o.push('<rect class="chest" x="' + (X + .15) + '" y="' + (y + .25) + '" width=".7" height=".5" rx=".08"/>');
    else if (c === 'P') o.push('<rect class="pad" x="' + (X + .12) + '" y="' + (y + .12) + '" width=".76" height=".76" rx=".38"/>');
    else if (c === 'S') o.push('<path class="start" d="M' + (X + .5) + ' ' + (y + .12) + 'L' + (X + .9) + ' ' + (y + .88) + 'L' + (X + .1) + ' ' + (y + .88) + 'Z"/>');
    else if (c === 'e') o.push('<circle class="slot" cx="' + (X + .5) + '" cy="' + (y + .5) + '" r=".22"/>');
  }
  o.push('<rect class="frame" x="' + ox + '" y="0" width="' + w + '" height="' + TH + '"/>');
  spawns.forEach(function(s){
    var gx = Math.floor(s.x), gy = Math.floor(s.y), bad = (g[gy] && (g[gy][gx] === '#' || g[gy][gx] === '^'));
    if (bad) warn++;
    var r = /^B-/.test(s.type) ? .8 : .42, cx = ox + s.x, cy = s.y;
    o.push('<g><title>' + esc(s.type + ' at ' + s.x + ',' + s.y + (s.t != null ? ' t=' + s.t + 's' : '') + (s.wave ? ' wave ' + s.wave : '') + (bad ? ' (on cover or spikes)' : '')) + '</title>' +
      '<circle class="sp ' + cls(s.type) + (bad ? ' bad' : '') + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' +
      '<text class="spt" x="' + cx + '" y="' + (cy + .24) + '">' + tag(s.type) + '</text></g>');
  });
  return { svg: o.join(''), warn: warn };
}
function stats(g, w){
  var cover = 0, spike = 0, floor = 0;
  for (var y = 1; y < TH; y++) for (var x = 0; x < w; x++) { var c = g[y][x]; if (c === '#') cover++; else if (c === '^') spike++; floor++; }
  return { cover: Math.round(100 * cover / floor), spike: Math.round(100 * spike / floor) };
}

var rows = (V.STAGES && V.STAGES.ch1) || [], tiles = [], totalWarn = 0, kindsN = {};
rows.forEach(function(row){
  var roomId = row.room, def = V.ROOMS[roomId];
  if (!def) { notes.push('stage ' + row.stage + ': room ' + roomId + ' not found'); return; }
  var spawns = row.spawns || [], m = metaFor(row.stage, roomId), me = meOf(spawns, m);
  var tpl = m && (m.templateId || m.template) ? (m.templateId || m.template) + (m.shift != null ? ' shift ' + m.shift : '') + (m.swap ? ' swap' : '') : 'built ' + roomId + ' ' + def.name;
  var baked = /^c\d+s\d+v\d+$/.test(roomId);
  var w13 = V.Widen.room(def, 13), sp13 = V.Widen.spawns(spawns, 13, def);
  var a = drawGrid(def.grid, TW, spawns, 0, [], V.Widen.isBoss(def));
  var b = drawGrid(w13.grid, 13, sp13, TW + 1, w13.fill, w13.boss);
  var w15 = V.Widen.room(def, 15), sp15 = V.Widen.spawns(spawns, 15, def);   // Fold inner screen
  var c15 = drawGrid(w15.grid, 15, sp15, 0, w15.fill, w15.boss), st15 = stats(w15.grid, 15);
  var st9 = stats(def.grid, TW), st13 = stats(w13.grid, 13);
  totalWarn += a.warn + b.warn + c15.warn; kindsN[row.kind] = (kindsN[row.kind] || 0) + 1;
  tiles.push('<article class="tile' + (a.warn + b.warn + c15.warn ? ' hasWarn' : '') + '" id="s' + row.stage + '">' +
    '<header><h2><span class="st">S' + row.stage + '</span> <span class="rid">' + esc(roomId) + '</span></h2>' +
    '<span class="kind k-' + esc(row.kind) + '">' + esc(row.kind) + (baked ? '' : ' · built') + '</span></header>' +
    '<dl><div><dt>template</dt><dd>' + esc(tpl) + '</dd></div>' +
    '<div><dt>machines</dt><dd>' + spawns.length + ' <small>' + esc(mix(spawns)) + '</small></dd></div>' +
    '<div><dt>ME</dt><dd>' + esc(me.txt) + (me.src === 'weights' ? ' <small>(weights)</small>' : '') + '</dd></div>' +
    '<div><dt>cover / spikes</dt><dd>' + st9.cover + '% / ' + st9.spike + '% <small>at 9</small> · ' + st13.cover + '% / ' + st13.spike + '% <small>at 13</small> \u00b7 ' + st15.cover + '% / ' + st15.spike + '% <small>at 15</small></dd></div></dl>' +
    '<svg viewBox="0 -0.2 ' + (TW + 1 + 13) + ' ' + (TH + 0.4) + '" role="img" aria-label="Stage ' + row.stage + ' room ' + esc(roomId) + ' at 9 and 13 columns">' + a.svg + b.svg + '</svg>' +
    '<footer><span>9 columns</span><span>13 columns (V.Widen' + (w13.fill.length ? ', fill cover' : '') + ')</span></footer>' +
    '<svg class="r15" viewBox="0 -0.2 ' + (TW + 1 + 13) + ' ' + (TH + 0.4) + '" role="img" aria-label="Stage ' + row.stage + ' room ' + esc(roomId) + ' at 15 columns, Fold inner screen">' + c15.svg + '</svg>' +
    '<footer class="f15"><span>15 columns, Fold inner screen (V.Widen' + (w15.fill.length ? ', fill cover' : '') + ')</span></footer>' +
    (a.warn + b.warn + c15.warn ? '<p class="warn">Spawn on cover or spikes: ' + a.warn + ' at 9, ' + b.warn + ' at 13, ' + c15.warn + ' at 15.</p>' : '') +
    (row.note ? '<p class="note">' + esc(row.note) + '</p>' : '') + '</article>');
});

var legend = MACH.map(function(t, i){ return '<li><svg viewBox="-1 -1 2 2" width="22" height="22"><circle class="sp m' + (i + 1) + '" r=".9"/><text class="spt lg" y=".3">' + (i + 1) + '</text></svg> ' + t + ' <small>w ' + WEIGHT[t] + '</small></li>'; }).join('') +
  '<li><svg viewBox="-1 -1 2 2" width="22" height="22"><circle class="sp mb" r=".9"/><text class="spt lg" y=".3">B</text></svg> boss</li>';
var key = [
  ['<rect class="wall" width="1" height="1"/>', 'wall (row 0)'], ['<rect class="door" width="1" height="1"/>', 'door'], ['<rect class="cover" width="1" height="1"/>', 'cover'],
  ['<rect class="cover fillc" width="1" height="1"/>', 'widen fill cover'], ['<path class="spike" d="M.08 .92L.3 .15L.5 .92L.7 .15L.92 .92Z"/>', 'spikes'],
  ['<circle class="slot" cx=".5" cy=".5" r=".22"/>', 'spawn slot'], ['<path class="start" d="M.5 .12L.9 .88L.1 .88Z"/>', 'hero start'],
  ['<rect class="chest" x=".15" y=".25" width=".7" height=".5" rx=".08"/>', 'chest'], ['<rect class="pad" x=".12" y=".12" width=".76" height=".76" rx=".38"/>', 'supply pad']
].map(function(k){ return '<li><svg viewBox="0 0 1 1" width="20" height="20"><rect class="floor" width="1" height="1"/>' + k[0] + '</svg> ' + k[1] + '</li>'; }).join('');

var css = [
  ':root{color-scheme:light dark;--bg:#f4f5f7;--card:#fff;--fg:#1b1d21;--mut:#5a606b;--line:#d4d8df;--floor:#eceff3;--wall:#4a5160;--cover:#8d96a8;--fillc:#6f9a8f;--door:#2d6cdf;--spike:#c23a3a;--slot:#7a8190;--chest:#b8860b;--pad:#2a9d8f;--start:#1b1d21;--warn:#b3261e;--m1:#E69F00;--m2:#56B4E9;--m3:#CC79A7;--m4:#2FB67C;--m5:#A98BF0;--mb:#E5484D;--mx:#999}',
  '@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#101216;--card:#1a1d23;--fg:#e8eaee;--mut:#a3aab6;--line:#323843;--floor:#242932;--wall:#7b8497;--cover:#566074;--fillc:#4f7f74;--door:#5b9bff;--spike:#ff6b6b;--slot:#8f98a8;--chest:#e0b341;--pad:#3fc7b6;--start:#e8eaee;--warn:#ff8a80}}',
  ':root[data-theme=dark]{--bg:#101216;--card:#1a1d23;--fg:#e8eaee;--mut:#a3aab6;--line:#323843;--floor:#242932;--wall:#7b8497;--cover:#566074;--fillc:#4f7f74;--door:#5b9bff;--spike:#ff6b6b;--slot:#8f98a8;--chest:#e0b341;--pad:#3fc7b6;--start:#e8eaee;--warn:#ff8a80}',
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:10px;max-width:760px;margin:0 auto}',
  'h1{font-size:20px;margin:6px 0}h1 small{display:block;font-size:13px;font-weight:400;color:var(--mut)}',
  '.top{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0}.top p{margin:4px 0;font-size:14px}.top code{font-size:12px;word-break:break-all}',
  'ul.lg{list-style:none;display:flex;flex-wrap:wrap;gap:6px 14px;padding:0;margin:8px 0 0;font-size:14px}ul.lg li{display:flex;align-items:center;gap:5px}',
  'button{font:inherit;font-size:14px;min-height:40px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}',
  'nav{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}nav a{min-width:40px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);text-decoration:none;font-size:14px}',
  '.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;margin:12px 0;scroll-margin-top:8px}.tile.hasWarn{border-color:var(--warn)}',
  '.tile header{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.tile h2{font-size:18px;margin:0}.st{font-weight:700}.rid{font-family:ui-monospace,Menlo,Consolas,monospace}',
  '.kind{font-size:13px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:1px 10px;white-space:nowrap}',
  'dl{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin:6px 0 8px}dl div{min-width:0}dl div:nth-child(4){grid-column:1/-1}dt{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}dd{margin:0;font-size:15px;overflow-wrap:anywhere}dd small,.note,footer{color:var(--mut);font-size:13px}',
  '.tile>svg.r15{margin-top:8px}.f15 span{flex:none!important}.tile>svg{display:block;width:100%;height:auto}svg{flex:none}ul.lg li{white-space:nowrap}.floor{fill:var(--floor)}.frame{fill:none;stroke:var(--line);stroke-width:.06}.wall{fill:var(--wall)}.cover{fill:var(--cover);stroke:var(--card);stroke-width:.04}.fillc{fill:var(--fillc)}',
  '.door{fill:var(--door)}.spike{fill:var(--spike)}.slot{fill:none;stroke:var(--slot);stroke-width:.08}.chest{fill:var(--chest)}.pad{fill:none;stroke:var(--pad);stroke-width:.14}.start{fill:var(--start);opacity:.8}',
  '.sp{stroke:var(--fg);stroke-width:.07}.sp.bad{stroke:var(--warn);stroke-width:.2}.m1{fill:var(--m1)}.m2{fill:var(--m2)}.m3{fill:var(--m3)}.m4{fill:var(--m4)}.m5{fill:var(--m5)}.mb{fill:var(--mb)}.mx{fill:var(--mx)}',
  '.spt{font:700 .62px system-ui,sans-serif;text-anchor:middle;fill:#111;pointer-events:none}.spt.lg{font-size:1.1px}',
  'footer{display:flex;gap:6px;margin-top:4px}footer span:first-child{flex:9}footer span:last-child{flex:13}.warn{color:var(--warn);font-weight:600;margin:6px 0 0}.note{margin:6px 0 0}'
].join('\n');

var js = "(function(){var r=document.documentElement,b=document.getElementById('th');b.onclick=function(){var d=r.getAttribute('data-theme');var dark=d?d==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.setAttribute('data-theme',dark?'light':'dark');};})();";
var nav = tiles.length ? rows.map(function(r){ return '<a href="#s' + r.stage + '">' + r.stage + '</a>'; }).join('') : '';
var kindTxt = Object.keys(kindsN).map(function(k){ return kindsN[k] + ' ' + k; }).join(', ');
var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Volley contact sheet</title><style>' + css + '</style></head><body>' +
  '<h1>Volley contact sheet<small>Chapter 1, ' + tiles.length + ' rooms (' + esc(kindTxt) + '). Each room at 9, 13 and 15 columns through V.Widen.</small></h1>' +
  '<div class="top"><p>Bake hash: <code>' + esc(bakeHash) + '</code></p><p>Colour and number = machine id. ME = threat; with no bake-meta it is summed from the built weights (E-01 0.7, E-02 1.0, E-03 1.0, E-04 1.3, E-05 1.3; reported, not gated). A red ring marks a spawn that lands on cover or spikes.' +
  (totalWarn ? ' <b class="warn">' + totalWarn + ' such spawn(s) in this sheet.</b>' : ' None in this sheet.') + '</p>' +
  (notes.length ? '<p>Notes: ' + notes.map(esc).join('; ') + '.</p>' : '') +
  '<ul class="lg">' + legend + '</ul><ul class="lg">' + key + '</ul><p><button id="th" type="button">Switch light or dark</button></p></div>' +
  '<nav aria-label="Jump to stage">' + nav + '</nav>' + tiles.join('\n') + '<script>' + js + '</script></body></html>\n';
fs.writeFileSync(OUT, html);
console.log('contact sheet: ' + tiles.length + ' rooms, ' + totalWarn + ' spawn(s) on cover or spikes, bake hash ' + bakeHash + ', ' + Buffer.byteLength(html) + ' bytes -> ' + OUT);
notes.forEach(function(n){ console.log('note: ' + n); });
