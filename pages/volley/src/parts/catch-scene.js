(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// V.CatchScene.draw(ctx, S, view): the Night Drop look (SPEC 7), all code-drawn on a Canvas 2D context. Agent K.
// K-fix (2026-11-11, Visual QA D1/D4/D7/D8/D9/D11/D12): the drawing is a PORT of the approved library
//   supply-drop-minigame/look/sd-look-lib-fix1.js (ICON set, chute, landing, onGround, hero, pip, hud), drawn in "library units"
//   (a crate is 34 units wide) and scaled by k = tile / 38 so one tile is about one library crate at 344 wide (the still is 344x882).
// V adds ONE line in scene.js: if (V.CatchScene && S.mini) V.CatchScene.draw(ctx, S, view)  (main.js drawCatch calls it on its own overlay canvas).
// Tokens: ground #0b0e11, panels #1b2026 / #242a31, ink #0f1215, stencil #d9d3b8, lamps #d6bf8e, gold #ffe27a..#c28a0c, clock bar #8fc25a.
var C = { bg:'#0b0e11', m8:'#1b2026', m7:'#242a31', ink:'#0f1215', sten:'#d9d3b8', sand:'#d6bf8e', gold:'#ffe27a', gold2:'#c28a0c', hero:'#38e8ff', ok:'#8fc25a', red:'#d8483c', pale:'#e4dfd2' };
var INK = '#0f1215', TAU = Math.PI * 2, ITEM_S = 1.15;                // ITEM_S: library D10 (items 15 percent larger)
var FONT = '"Arial Narrow","Roboto Condensed","DIN Condensed","Bahnschrift Condensed","Liberation Sans Narrow",ui-monospace,Menlo,Consolas,sans-serif';
var ctx = null;                                                       // set by draw(); the ported library code uses it directly

// ---------- ported library helpers (sd-look-lib-fix1.js) ----------
function rr(x, y, w, h, r){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function sphere(x, y, r, hi, lo){ var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, hi); g.addColorStop(1, lo); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function glow(x, y, r, col, a){ ctx.save(); ctx.globalCompositeOperation = 'lighter'; var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
function lin(x0, y0, x1, y1, a, b){ var g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function glint(x, y, s, a){ ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.fillStyle = '#fffbe6'; ctx.beginPath();
  for (var i = 0; i < 8; i++) { var r = i % 2 ? s * 0.22 : s, an = i * Math.PI / 4; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill(); ctx.restore(); }
function star(cx, cy, ro, ri, col){ ctx.fillStyle = col; ctx.beginPath(); for (var i = 0; i < 10; i++) { var r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
// collectables: flat two-step fills, ink outline, each draws centred at 0,0
var ICON = {
  ammoCrate: function(){ ctx.fillStyle = INK; rr(-17, -13, 34, 26, 3.5); ctx.fill(); ctx.fillStyle = '#6f7648'; rr(-15.5, -11.5, 31, 23, 2.5); ctx.fill(); ctx.fillStyle = '#8a925c'; ctx.fillRect(-15.5, -11.5, 31, 5);
    ctx.strokeStyle = '#4a5030'; ctx.lineWidth = 1.2; [-3, 3].forEach(function(y){ ctx.beginPath(); ctx.moveTo(-15, y); ctx.lineTo(15, y); ctx.stroke(); });
    ctx.fillStyle = '#2f3320'; ctx.fillRect(-9, -11.5, 3.6, 23); ctx.fillRect(5.4, -11.5, 3.6, 23);
    ctx.fillStyle = '#d9d3b8'; rr(-4, -2.2, 8, 4.4, 1); ctx.fill(); ctx.fillStyle = '#d6bf8e'; [-12.5, 12.5].forEach(function(x){ [-8.5, 8.5].forEach(function(y){ ctx.beginPath(); ctx.arc(x, y, 1, 0, TAU); ctx.fill(); }); }); },
  medkit: function(){ ctx.fillStyle = INK; rr(-17, -13, 34, 26, 3.5); ctx.fill(); ctx.fillStyle = lin(-15, -11, 15, 12, '#efe9d6', '#b6b0a2'); rr(-15.5, -11.5, 31, 23, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-15.5, -11.5, 31, 2.6); ctx.fillStyle = '#8f897b'; ctx.fillRect(-15.5, 9.5, 31, 2);
    ctx.fillStyle = INK; ctx.fillRect(-9.4, -4.6, 18.8, 9.2); ctx.fillRect(-4.6, -9.4, 9.2, 18.8);
    ctx.fillStyle = lin(0, -8, 0, 8, '#7cffb0', '#1fb868'); ctx.fillRect(-8, -3.2, 16, 6.4); ctx.fillRect(-3.2, -8, 6.4, 16); },
  goldCase: function(){ ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 4.8; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-5.5, -8); ctx.lineTo(-5.5, -14); ctx.lineTo(5.5, -14); ctx.lineTo(5.5, -8); ctx.stroke();
    ctx.strokeStyle = '#c28a0c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = INK; rr(-17, -11, 34, 25, 4.5); ctx.fill(); ctx.fillStyle = lin(-15, -10, 15, 12, '#ffe27a', '#c28a0c'); rr(-15.5, -9.5, 31, 22, 3.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,251,230,.65)'; ctx.fillRect(-14, -8.4, 28, 2.2);
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-15, -0.5); ctx.lineTo(15, -0.5); ctx.stroke();
    [-11, 6].forEach(function(x){ ctx.fillStyle = INK; ctx.fillRect(x - 0.8, -3.8, 6.6, 6.4); ctx.fillStyle = '#fff3c2'; ctx.fillRect(x + 0.2, -2.8, 4.6, 4.4); });
    star(0, 6.8, 4.4, 1.9, '#8a5a00'); ctx.restore(); },
  dud: function(){ ctx.save(); ctx.fillStyle = INK; rr(-11.5, -14, 23, 31, 6); ctx.fill();
    ctx.fillStyle = lin(-10, 0, 10, 0, '#c4ccd4', '#59636d'); rr(-10, -12.5, 20, 28, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-7.5, -10, 2.2, 22);
    ctx.fillStyle = '#2a2f35'; ctx.fillRect(-10, -6, 20, 4.6); ctx.fillRect(-10, 6.5, 20, 4.6);
    ctx.fillStyle = '#d9d3b8'; ctx.fillRect(-4, -0.6, 8, 2);
    ctx.fillStyle = '#1b2026'; ctx.beginPath(); ctx.moveTo(10, 12.5); ctx.lineTo(10, 6); ctx.lineTo(3, 12.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = INK; rr(-5.8, -19.5, 11.6, 7.6, 2.5); ctx.fill(); ctx.fillStyle = lin(-5, 0, 5, 0, '#59636d', '#2a2f35'); rr(-4.4, -18.3, 8.8, 5.4, 1.6); ctx.fill();
    ctx.strokeStyle = '#14181c'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-1, -12.5); ctx.lineTo(1.5, -8); ctx.lineTo(-0.5, -5.5); ctx.stroke();
    ctx.restore(); },
  rationLid: function(){ ctx.save();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
    ctx.fillStyle = lin(-11, -11, 11, 13, '#8a925c', '#4a5030'); ctx.beginPath(); ctx.arc(0, 0, 13.4, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 13.4, 0, TAU); ctx.clip();
    ctx.fillStyle = INK; ctx.fillRect(-9.4, -10.4, 18.8, 8.6); ctx.fillStyle = '#d9d3b8'; ctx.fillRect(-8.2, -9.2, 16.4, 6.2); ctx.fillStyle = '#4a5030'; ctx.fillRect(-6, -7.8, 12, 1.5); ctx.fillRect(-6, -5.2, 7, 1.3);
    ctx.fillStyle = INK; ctx.fillRect(-15, 2.2, 30, 8.4); ctx.fillStyle = '#d6bf8e'; ctx.fillRect(-15, 3.4, 30, 6); ctx.fillStyle = '#b89a60'; ctx.fillRect(-15, 7.6, 30, 1.8);
    ctx.restore();
    ctx.fillStyle = INK; rr(3, 0.6, 9, 11.8, 2); ctx.fill(); ctx.fillStyle = '#8892a0'; rr(4.4, 2, 6.2, 9, 1.2); ctx.fill(); ctx.fillStyle = '#d6bf8e'; ctx.fillRect(5.4, 4.6, 4.2, 3.8);
    ctx.restore(); },
  intel: function(){ ctx.save(); ctx.rotate(0.08); ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-13, -15); ctx.lineTo(7, -15); ctx.lineTo(13, -9); ctx.lineTo(13, 15); ctx.lineTo(-13, 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lin(-12, -14, 12, 14, '#2b3340', '#1b2026'); ctx.beginPath(); ctx.moveTo(-11.6, -13.6); ctx.lineTo(6.6, -13.6); ctx.lineTo(11.6, -8.6); ctx.lineTo(11.6, 13.6); ctx.lineTo(-11.6, 13.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4c8dff'; ctx.lineWidth = 1.1; [-5, 1, 7].forEach(function(v){ ctx.beginPath(); ctx.moveTo(-9, v + 3); ctx.lineTo(9, v + 3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(v / 1.2 + 1, -6); ctx.lineTo(v / 1.2 + 1, 12); ctx.stroke(); });
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(-4, -8, 2.4, 0, TAU); ctx.fill(); ctx.restore(); },
  coin: function(){ ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill(); sphere(0, 0, 13.4, '#ffe27a', '#c28a0c');
    ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, 9.6, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#8a5a00'; ctx.beginPath(); ctx.moveTo(0, -5.4); ctx.lineTo(5.4, 0); ctx.lineTo(0, 5.4); ctx.lineTo(-5.4, 0); ctx.closePath(); ctx.fill(); }
};
var EXT = { ammoCrate:34, medkit:34, goldCase:34, dud:34, rationLid:36, intel:30, coin:30 };
var KIND_ICON = { ammo:'ammoCrate', ration:'rationLid', gold:'goldCase' };
// draw an icon so its longest side is px css px, centred at x,y (also exported: V.CatchScene.icon, for the payout sheet)
function iconPx(kind, x, y, px){ ctx.save(); ctx.translate(x, y); var k = px / EXT[kind]; ctx.scale(k, k); ICON[kind](); ctx.restore(); }
function smoke(x, y, s, n){ var N = 24, L = [], R = [];
  for (var i = 0; i <= N; i++) { var t = i / N, cx = x + 8 * s + t * 26 * s + Math.sin(t * 6) * 4 * s, cy = y - 6 * s - t * 40 * s, w = (2.2 + t * 6.5) * s; L.push([cx - w, cy]); R.push([cx + w, cy]); }
  ctx.save(); ctx.beginPath(); L.forEach(function(p, i){ if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); for (i = N; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]); ctx.closePath();
  var g = ctx.createLinearGradient(0, y - 6 * s, 0, y - 46 * s); g.addColorStop(0, 'rgba(176,186,196,.95)'); g.addColorStop(1, 'rgba(150,160,170,.12)');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(15,18,21,.55)'; ctx.lineWidth = 1.1; ctx.stroke(); ctx.restore(); }
// parachute: canopy + strings above a crate centred at cx,cy
function chute(cx, cy, s, kind){ var hw = 26 * s, ch = 24 * s, by = cy - 14 * s - 30 * s;
  ctx.strokeStyle = 'rgba(15,18,21,.9)'; ctx.lineWidth = 2.4; ctx.beginPath();
  var bx = [-1, -0.34, 0.34, 1], ax = [-0.8, -0.27, 0.27, 0.8], i;
  for (i = 0; i < 4; i++) { ctx.moveTo(cx + bx[i] * hw, by); ctx.lineTo(cx + ax[i] * 11 * s, cy - 13 * s); } ctx.stroke();
  ctx.strokeStyle = '#d9d3b8'; ctx.lineWidth = 1; ctx.beginPath(); for (i = 0; i < 4; i++) { ctx.moveTo(cx + bx[i] * hw, by); ctx.lineTo(cx + ax[i] * 11 * s, cy - 13 * s); } ctx.stroke();
  ctx.save(); ctx.translate(cx, by);
  var path = function(){ ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.bezierCurveTo(-hw, -ch * 1.38, hw, -ch * 1.38, hw, 0);
    for (var j = 0; j < 3; j++) { var x1 = hw - (j + 1) * 2 * hw / 3, xm = hw - (j + 0.5) * 2 * hw / 3; ctx.quadraticCurveTo(xm, 5 * s, x1, 0); } ctx.closePath(); };
  var cols = kind === 'dud' ? ['#59636d', '#2c3239'] : kind === 'sand' ? ['#d6bf8e', '#e4dfd2'] : ['#8a925c', '#e4dfd2'];
  path(); ctx.fillStyle = INK; ctx.fill(); ctx.save(); path(); ctx.clip();
  for (i = 0; i < 3; i++) { ctx.fillStyle = cols[i % 2]; ctx.beginPath(); ctx.moveTo(-hw + i * 2 * hw / 3, 0); ctx.lineTo(-hw + (i + 1) * 2 * hw / 3, 0); ctx.lineTo(0, -ch * 1.1); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(-hw, -ch * 1.1, hw * 2, ch * 0.28);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-hw, -1, hw * 2, 5 * s);
  if (kind === 'dud') { ctx.fillStyle = '#0f1215'; ctx.beginPath(); ctx.moveTo(4 * s, -ch * 0.7); ctx.lineTo(10 * s, -ch * 0.5); ctx.lineTo(7 * s, -ch * 0.25); ctx.lineTo(12 * s, -ch * 0.1); ctx.lineTo(3 * s, -ch * 0.12); ctx.closePath(); ctx.fill(); }
  ctx.restore(); path(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.strokeStyle = 'rgba(15,18,21,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); [-0.34, 0.34].forEach(function(f){ ctx.moveTo(f * hw, 0); ctx.quadraticCurveTo(f * hw * 0.7, -ch * 0.9, 0, -ch * 1.06); }); ctx.stroke();
  ctx.restore(); }
// landing shadow: dark ellipse + dashed ring. Crates: gold ring. Dud: pale-grey ring with an X (shape cue, not colour)
function landing(x, y, s, dud, near){
  ctx.fillStyle = 'rgba(0,0,0,' + (0.4 + near * 0.25) + ')'; ctx.beginPath(); ctx.ellipse(x, y, (13 + near * 4) * s, (5.5 + near * 2) * s, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(15,18,21,.75)'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.ellipse(x, y, 20 * s, 8.4 * s, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.4; ctx.strokeStyle = dud ? 'rgba(201,211,219,.95)' : 'rgba(255,226,122,.9)'; ctx.beginPath(); ctx.ellipse(x, y, 20 * s, 8.4 * s, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  if (dud) { ctx.strokeStyle = 'rgba(201,211,219,.95)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 3 * s); ctx.lineTo(x + 6 * s, y + 3 * s); ctx.moveTo(x - 6 * s, y + 3 * s); ctx.lineTo(x + 6 * s, y - 3 * s); ctx.stroke(); } }
// item on the ground (landed, fading)
function onGround(kind, x, y, s, ph){
  var bob = Math.sin(ph) * 1.5, lift = 6;
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(x + lift * 0.9, y + 13 * s + lift * 0.6, 14 * s, 6.5 * s, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(15,18,21,.8)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(x, y + 12 * s, 19 * s, 8 * s, 0, 0, TAU); ctx.stroke(); ctx.strokeStyle = 'rgba(255,226,122,.75)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y + 12 * s, 19 * s, 8 * s, 0, 0, TAU); ctx.stroke();
  ctx.save(); ctx.translate(x, y + bob - lift * 0.5); ctx.scale(s, s); ICON[kind](); ctx.restore(); }
// the Operator (library hero: boots-down view aimed up, cyan ring, rifle)
function hero(x, y, ang, sc, noRifle){
  var rk = sc / 1.2;
  ctx.fillStyle = 'rgba(20,18,16,.32)'; ctx.beginPath(); ctx.ellipse(x + 9 * rk, y + 13 * rk, 20 * rk, 11 * rk, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(20,30,34,.6)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, y, 24 * rk, 0, TAU); ctx.stroke(); ctx.strokeStyle = 'rgba(60,230,255,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(x, y, 24 * rk, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = INK; rr(-14, -9, 11, 18, 3); ctx.fill(); ctx.fillStyle = '#8c7550'; rr(-13, -8, 9, 16, 2.5); ctx.fill(); ctx.fillStyle = '#a38a60'; ctx.fillRect(-12, -7, 2, 14);
  var g;
  if (!noRifle) { ctx.fillStyle = INK; rr(2, -3.6, 32, 7.2, 2); ctx.fill(); g = lin(0, -3, 0, 3, '#4a535d', '#1b2026'); ctx.fillStyle = g; rr(3, -2.6, 30, 5.2, 1.5); ctx.fill();
    ctx.fillStyle = '#38e8ff'; ctx.fillRect(10, -0.7, 15, 1.4); ctx.fillStyle = '#14181c'; ctx.fillRect(31, -4.2, 4, 8.4); }
  ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-1, -9); ctx.lineTo(12, -4); ctx.moveTo(-1, 9); ctx.lineTo(19, 2); ctx.stroke();
  ctx.strokeStyle = '#5a673a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-1, -9); ctx.lineTo(12, -4); ctx.moveTo(-1, 9); ctx.lineTo(19, 2); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(-1, 0, 10.5, 15.5, 0, 0, TAU); ctx.fill();
  g = lin(-8, -14, 8, 14, '#7c8c52', '#3d4a28'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-1, 0, 9.2, 14.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b69a68'; ctx.beginPath(); ctx.ellipse(-1, -11, 4.5, 3.8, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-1, 11, 4.5, 3.8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(2, 0, 7.6, 0, TAU); ctx.fill(); sphere(2, 0, 6.6, '#c4a874', '#7a6238');
  ctx.fillStyle = '#071c20'; ctx.beginPath(); ctx.ellipse(6.4, 0, 3.1, 4.8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#4cf0ff'; ctx.beginPath(); ctx.ellipse(6.6, 0, 2.2, 3.8, 0, 0, TAU); ctx.fill();
  ctx.restore(); glow(x + Math.cos(ang) * 6 * rk, y + Math.sin(ang) * 6 * rk, 22 * rk, 'rgba(40,230,255,A)', 0.5);
}
function pip(x, y, lit, sz){ ctx.fillStyle = INK; rr(x, y, sz, sz * 0.86, 2.2); ctx.fill();
  ctx.fillStyle = lit ? lin(x, y, x, y + sz, '#ffe27a', '#c28a0c') : '#1b2026'; rr(x + 1.4, y + 1.4, sz - 2.8, sz * 0.86 - 2.8, 1.4); ctx.fill();
  if (!lit) { ctx.strokeStyle = '#5c6670'; ctx.lineWidth = 1; rr(x + 1, y + 1, sz - 2, sz * 0.86 - 2, 1.6); ctx.stroke(); }
  ctx.fillStyle = lit ? '#8a5a00' : '#3a424a'; ctx.fillRect(x + sz * 0.5 - 0.8, y + 1.4, 1.6, sz * 0.86 - 2.8); }

// ---------- scene helpers ----------
var SX = 1, SIN = 0;   // N2: room x is drawn inset by 0.8 tile at each side (set per draw), so lane-edge items and the Operator are not cut by the screen edge
function px(view, x){ return view.ox + SIN + x * view.s * SX; }
function py(view, y){ return view.oy + y * view.s; }
// Stencil text with an ink outline (library txt()). Every call keeps the size literal and at least 12 px (test-catch greps for it).
function text(c, s, x, y, size, col, align, weight){
  c.font = (weight || 800) + ' ' + Math.max(12, size) + 'px ' + FONT; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.lineWidth = 4; c.strokeStyle = C.ink; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y);
}
function pill(x, y, w, h){ ctx.fillStyle = INK; rr(x, y, w, h, h / 2); ctx.fill(); ctx.fillStyle = C.m7; rr(x + 1.5, y + 1.5, w - 3, h - 3, h / 2 - 1.5); ctx.fill(); }
var POP_L = 0.5, pops = {}, popSeed = -1;
// age of a "+1" popup in game time (S.t, which also runs through the end beat); null-safe; popups are not drawn once the sheet is up (S.t stops there)
function popAge(S, m, o){
  if (m.phase === 'sheet' || S.phase !== 'collect') return 9;
  if (popSeed !== m.seed) { pops = {}; popSeed = m.seed; }
  if (pops[o.id] == null) pops[o.id] = S.t || 0;
  return (S.t || 0) - pops[o.id];
}
function leftHanded(){ try { var s = V.Meta && V.Meta.settings && V.Meta.settings(); return !!(s && (s.leftHanded || s.lefty)); } catch (e) { return false; } }

// D4: while the room runs, hide the fight HUD rows (stage chip, level, RR chip, XP bar, tuning gear, HP strip) and the stage toast, and make the HUD
// band transparent so the catch pills sit in the top bar. Pause stays. Done with one class on <body> that this file adds on every draw and drops
// 250 ms after the last one (main.js stops calling draw when the room is over), so no outside edit is needed.
var offT = 0, styled = false;
function hudMode(){
  var d = G.document; if (!d || !d.body) return;
  if (!styled) { styled = true; var st = d.createElement('style'); st.id = 'csStyle';
    st.textContent = 'body.cr-on #hud,body.cr-on #hudTop{background:transparent!important}body.cr-on #stageLbl,body.cr-on #lvl,body.cr-on #rrChip,body.cr-on #crChip,body.cr-on #xpWrap,body.cr-on #gear,body.cr-on #hpRow,body.cr-on #toast{display:none!important}body.cr-on #pauseBtn{margin-left:auto}';
    d.head.appendChild(st); }
  d.body.classList.add('cr-on'); clearTimeout(offT); offT = setTimeout(function(){ if (d.body) d.body.classList.remove('cr-on'); }, 250);
}

// ---------- simple shapes (the pre-port look, restored for D1 option 2) ----------
function simpleCrate(c, kind, x, y, s){
  var w = s * 0.8, h = w * 0.82;
  c.lineWidth = Math.max(2, s * 0.05); c.strokeStyle = C.ink;
  if (kind === 'ration') {
    c.fillStyle = '#9a8a5a'; c.beginPath(); c.ellipse(x, y + h * 0.08, w * 0.42, h * 0.46, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#c9b982'; c.beginPath(); c.ellipse(x, y - h * 0.22, w * 0.42, h * 0.2, 0, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.arc(x, y - h * 0.42, w * 0.18, 3.14, TAU); c.stroke();
  } else if (kind === 'gold') {
    var g = c.createLinearGradient(x, y - h / 2, x, y + h / 2); g.addColorStop(0, C.gold); g.addColorStop(1, C.gold2);
    c.fillStyle = g; c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeRect(x - w / 2, y - h / 2, w, h);
    c.fillStyle = C.ink; c.beginPath(); c.arc(x, y, w * 0.14, 0, TAU); c.fill();
  } else {
    c.fillStyle = '#7a8a5a'; c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeRect(x - w / 2, y - h / 2, w, h);
    c.fillStyle = '#566240'; c.fillRect(x - w / 2, y - h * 0.12, w, h * 0.24);
  }
}
function simpleChute(c, x, y, s){
  var top = y - s * 1.05, r = s * 0.5;
  c.strokeStyle = C.ink; c.lineWidth = 2;
  c.fillStyle = '#e9e4d2'; c.beginPath(); c.moveTo(x - r, top + r * 0.55); c.quadraticCurveTo(x, top - r * 0.5, x + r, top + r * 0.55); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#c9c3ad'; c.beginPath(); c.moveTo(x - r * 0.2, top + r * 0.55); c.quadraticCurveTo(x + r * 0.5, top - r * 0.3, x + r, top + r * 0.55); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(x - r, top + r * 0.55); c.lineTo(x, y - s * 0.3); c.moveTo(x + r, top + r * 0.55); c.lineTo(x, y - s * 0.3); c.stroke();
}
function simpleDud(c, x, y, s){
  var w = s * 0.55, h = s * 0.8;
  c.strokeStyle = C.red; c.lineWidth = 3; c.beginPath(); c.arc(x, y, s * 0.62, 0, TAU); c.stroke();
  c.fillStyle = '#2a2e33'; c.strokeStyle = C.ink; c.lineWidth = 2; c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeRect(x - w / 2, y - h / 2, w, h);
  c.fillStyle = C.red; c.fillRect(x - w / 2, y - h * 0.1, w, h * 0.18);
  c.fillStyle = 'rgba(120,120,120,.5)'; c.beginPath(); c.arc(x, y - h * 0.8, s * 0.14, 0, TAU); c.arc(x + s * 0.08, y - h * 1.1, s * 0.1, 0, TAU); c.fill();
}
function floor(S, view, X0, Y0, W, Wv, Hv, s, C0){
  var c = ctx, i;
  c.fillStyle = C.bg; c.fillRect(0, 0, Wv, Hv);
  // D1: the metal floor runs the FULL height (top of the screen to the bottom edge), not just the 15 room rows
  c.fillStyle = lin(0, 0, 0, Hv, '#222931', '#161b20'); c.fillRect(X0, 0, W, Hv);
  c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,.4)'; c.beginPath();
  for (i = 0; i <= C0; i++) { c.moveTo(X0 + i * s, 0); c.lineTo(X0 + i * s, Hv); }
  for (var y = Y0 % s - s; y < Hv + s; y += s) { c.moveTo(X0, y); c.lineTo(X0 + W, y); } c.stroke();
  c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.05)'; c.beginPath();
  for (i = 0; i <= C0; i++) { c.moveTo(X0 + i * s + 2, 0); c.lineTo(X0 + i * s + 2, Hv); }
  for (y = Y0 % s - s; y < Hv + s; y += s) { c.moveTo(X0, y + 2); c.lineTo(X0 + W, y + 2); } c.stroke();
  // speckle at the edges only (kept out of the crate paths)
  c.fillStyle = 'rgba(217,211,184,.07)';
  for (i = 0; i < 90; i++) { var r1 = ((i * 7919) % 97) / 97, r2 = ((i * 104729) % 89) / 89, sx = X0 + (r1 < 0.5 ? r1 * 2.4 * s : W - (1 - r1) * 2.4 * s); c.fillRect(sx, r2 * Hv, 2, 2); }
  // runway lights down both sides, full height
  for (var rr0 = 0; Y0 + (rr0 + 0.5) * s < Hv; rr0++) {
    var ly = Y0 + (rr0 + 0.5) * s; if (ly < 0) continue;
    [X0 + 0.25 * s, X0 + W - 0.25 * s].forEach(function(lx){ glow(lx, ly, s * 0.5, 'rgba(255,240,200,A)', 0.35); c.fillStyle = C.sand; c.beginPath(); c.arc(lx, ly, Math.max(2, s * 0.06), 0, TAU); c.fill(); });
  }
  // centre dashes below the landing line
  c.strokeStyle = 'rgba(217,211,184,.28)'; c.lineWidth = 2; c.setLineDash([s * 0.5, s * 0.4]); c.beginPath(); c.moveTo(X0 + W / 2, Y0 + 11.2 * s); c.lineTo(X0 + W / 2, Hv); c.stroke(); c.setLineDash([]);
  // searchlight beams from the top corners
  [[X0, 1], [X0 + W, -1]].forEach(function(b){
    var g = c.createLinearGradient(b[0], 0, b[0] + b[1] * W * 0.5, Y0 + 10 * s); g.addColorStop(0, 'rgba(255,240,200,.16)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(b[0], 0); c.lineTo(b[0] + b[1] * s * 2, 0); c.lineTo(b[0] + b[1] * W * 0.62, Y0 + 11 * s); c.lineTo(b[0] + b[1] * W * 0.3, Y0 + 11 * s); c.closePath(); c.fill();
  });
  // exit door (lit after Take)
  c.fillStyle = S.room && S.room.door && S.room.door.open ? C.gold : C.m7; c.fillRect(X0 + Math.floor(C0 / 2) * s, Y0, s, s * 0.35);
}

// D9: the ghost finger (m.ghost, visits 1 and 2): a finger sweeping side to side in the player's thumb corner (right; left when Left-handed is on).
// Gone at the first catch or at 4 s of play. Reduced motion: still finger with two arrows.
function ghostFinger(c, S, view, m, X0, Y0, W, s){
  var show = m.ghost && m.caught === 0 && (m.phase === 'countin' || (m.phase === 'play' && m.t < 4)); if (!show) return;
  var lh = leftHanded(), cx = lh ? X0 + 2 * s : X0 + W - 2 * s, rm = !!V.reducedMotion, span = 1.1 * s;
  var fade = m.phase === 'play' ? Math.min(1, Math.max(0, (4 - m.t) / 0.5)) : 1, y = Math.min(Y0 + 12.6 * s, (view.h || 9999) - s);
  var x = rm ? cx : cx + Math.sin((S.t || 0) * 2.6) * span;
  c.save(); c.globalAlpha = 0.9 * fade;
  c.strokeStyle = 'rgba(15,18,21,.7)'; c.lineWidth = 5; c.setLineDash([s * 0.2, s * 0.2]); c.beginPath(); c.moveTo(cx - span, y); c.lineTo(cx + span, y); c.stroke();
  c.strokeStyle = C.sand; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx - span, y); c.lineTo(cx + span, y); c.stroke(); c.setLineDash([]);
  [[cx - span - 4, -1], [cx + span + 4, 1]].forEach(function(a){ c.fillStyle = C.sand; c.strokeStyle = C.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(a[0], y); c.lineTo(a[0] - a[1] * 9, y - 7); c.lineTo(a[0] - a[1] * 9, y + 7); c.closePath(); c.stroke(); c.fill(); });
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.arc(x, y, s * 0.42, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; c.stroke();
  c.save(); c.translate(x, y); c.rotate(-0.32); var fw = s * 0.34, fh = s * 1.0;
  c.fillStyle = C.ink; c.beginPath(); c.roundRect(-fw / 2 - 2, 2, fw + 4, fh + 4, fw / 2 + 2); c.fill();
  c.fillStyle = '#e8c9a0'; c.beginPath(); c.roundRect(-fw / 2, 4, fw, fh, fw / 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-fw * 0.25, 8, fw * 0.14, fh * 0.55);
  c.restore(); c.restore();
}

function draw(c, S, view){
  var m = S && S.mini; if (!m || !c) return;
  ctx = c; hudMode();
  var s = view.s, C0 = m.cols, W = C0 * s, H = 15 * s, X0 = view.ox, Y0 = view.oy, t = S.t || 0, k = s / 38;
  var Wv = view.w || (X0 * 2 + W), Hv = view.h || (Y0 + H);
  SIN = 0.8 * s; SX = Math.max(0.5, (C0 - 1.6) / C0);
  // N1: items are scaled to the lane pitch so a trail (adjacent lanes, 0.3 s apart) never overlaps: canopy half 30 + crate half 20 units must fit in 0.9 of the pitch
  var pitch = ((V.Catch && V.Catch.laneX) ? V.Catch.laneX(1, C0) - V.Catch.laneX(0, C0) : (C0 - 1) / 8) * s * SX, ki = Math.min(k, 0.9 * pitch / 50);
  c.save();
  floor(S, view, X0, Y0, W, Wv, Hv, s, C0);
  labels(c, m, X0 + W / 2, view, s);   // N5: banner and hint sit UNDER the falling items
  // everything that falls is clipped to the room, so canopies slide in from under the top bar rather than over it
  c.save(); c.beginPath(); c.rect(X0, Y0, W, Hv - Y0); c.clip();
  var gy = py(view, 10.5) + 12 * ITEM_S * ki;
  // D1 quick version (M): simple shapes for the falling items (bare canopy arc, crate box, soft round shadow, red dud ring); the Operator and the full-height floor stay.
  // N1 is kept only as far as the simple items still need it: si shrinks them when the lane pitch is under about one tile.
  var si = s * Math.min(1, pitch / (0.95 * s));
  function air(kind, o, isDud){
    var x = px(view, o.x), y = py(view, o.y), sw = isDud ? 0 : Math.sin((t + o.ph) * 3) * (o.sway || 0) * s * 0.5, gyy = py(view, 10.5) + si * 0.25;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, gyy, si * 0.5, si * 0.19, 0, 0, TAU); c.fill();   // soft round shadow under the landing spot
    c.lineWidth = 2; c.strokeStyle = isDud ? C.red : C.gold; c.globalAlpha = 0.85; c.beginPath(); c.ellipse(x, gyy, si * 0.45, si * 0.16, 0, 0, TAU); c.stroke(); c.globalAlpha = 1;
    if (isDud) simpleDud(c, x, y, si); else { simpleChute(c, x + sw, y, si); simpleCrate(c, kind, x + sw, y, si); }
  }
  m.crates.forEach(function(o){
    if (o.st === 'air') air(o.kind, o, false);
    else if (o.st === 'caught' && popAge(S, m, o) < POP_L) {   // D12/N3: full alpha for the first 60 percent, fade at the end; timed on S.t; hidden at the sheet
      var f = popAge(S, m, o) / POP_L; c.globalAlpha = f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4; text(c, '+1', px(view, o.x), py(view, o.y) - f * s * 0.9, 24, C.gold); c.globalAlpha = 1;
    } else if (o.st === 'landed' && m.phase === 'play' && m.t - o.at < 0.4) {
      c.save(); c.globalAlpha = 1 - (m.t - o.at) / 0.4; simpleCrate(c, o.kind, px(view, o.x), py(view, 10.5), si); c.restore();
    }
  });
  m.duds.forEach(function(o){ if (o.st === 'air') air('dud', o, true); });
  // the Operator, with the slowed ring after a dud
  var hx = px(view, S.hero.x), hy = py(view, S.hero.y);
  c.save(); c.translate(hx, hy); c.scale(k, k); hero(0, 0, -Math.PI / 2, 1.32, true); c.restore();
  if (m.phase === 'play' && m.t < m.slowUntil) { c.strokeStyle = C.red; c.lineWidth = 3; c.beginPath(); c.arc(hx, hy, s * 0.7, 0, TAU); c.stroke(); }
  c.restore();
  ghostFinger(c, S, view, m, X0, Y0, W, s);
  c.restore();
  hud(c, S, view, Wv, s);
  if (V.CatchUI && V.CatchUI.syncHud) V.CatchUI.syncHud(S, view);
}

// One top bar (library hud(), D4): timer pill, crate counter pill, tier pips; the DOM pause button stays at the right. Drain bar under it.
// D7: the clock holds its END value (0:00, empty bar) in the end beat and behind the payout sheet. D8: the counter measures its text.
function hud(c, S, view, Wv, s){
  var m = S.mini, y0 = (view.insets && view.insets.top) || 0, X0 = view.ox, W = m.cols * s, mid = X0 + W / 2;
  var left = m.phase === 'countin' ? 10 : Math.max(0, 10 - m.t), n = Math.ceil(left - 1e-9);
  c.save();
  c.font = '800 19px ' + FONT; var tw = c.measureText('00 / 20').width || 58;        // width of the widest count, so the pill never jumps
  var cw = Math.ceil(8 + 28 + 6 + tw + 10), pw = 4 * 14 + 3 * 4 + 12, avail = Wv - 58;
  var compact = 8 + 88 + 8 + cw + 6 + pw > avail, tpw = compact ? 66 : 88, last3 = m.phase === 'play' && left <= 3 && left > 0;
  // timer pill
  pill(8, y0 + 6, tpw, 30);
  if (!compact) { c.strokeStyle = C.sand; c.lineWidth = 2; c.beginPath(); c.arc(27, y0 + 21, 7, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(27, y0 + 21); c.lineTo(27, y0 + 16.5); c.moveTo(27, y0 + 21); c.lineTo(30.4, y0 + 22.6); c.stroke(); c.fillStyle = C.sand; c.fillRect(25.4, y0 + 12, 3.2, 2); }
  text(c, '0:' + (n < 10 ? '0' : '') + n, compact ? 8 + tpw / 2 : 41, y0 + 22, last3 ? 21 + Math.round(2 * Math.sin(m.t * 6.283)) : 19, last3 ? '#ffb06a' : C.pale, compact ? 'center' : 'left');
  // count pill
  var cx = 8 + tpw + (compact ? 6 : 8); pill(cx, y0 + 4, cw, 34);
  iconPx('ammoCrate', cx + 8 + 14, y0 + 21, 28);
  text(c, m.net + ' / 20', cx + 8 + 28 + 6, y0 + 22, 19, C.pale, 'left');
  // tier pips: Basic lit at once; Good at 6, Great at 13, Perfect at 18, each with a tick
  var px0 = cx + cw + 6; pill(px0, y0 + 6, pw, 30);
  for (var i = 0; i < 4; i++) { var x = px0 + 6 + i * 18; pip(x, y0 + 11.5, m.tier >= i, 14); c.fillStyle = m.tier >= i ? C.sand : '#5c6670'; c.fillRect(x + 6, y0 + 27, 2, 3.4); }
  // drain bar (colour is never the only cue: the number and the bar length both move)
  var by = y0 + 49, f = left / 10; c.fillStyle = INK; rr(8, by, Wv - 16, 9, 4.5); c.fill(); c.fillStyle = '#14181c'; rr(9.5, by + 1.5, Wv - 19, 6, 3); c.fill();
  if (f > 0) { c.fillStyle = last3 ? '#e0a33a' : C.ok; rr(9.5, by + 1.5, (Wv - 19) * f, 6, 3); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(12, by + 2.3, Math.max(0, (Wv - 19) * f - 5), 1.6); }
  dots(c, m, mid, view, s);
  c.restore();
}
// banner (D11) and hint (N5: moved to the free row between the Operator and the thumb band, drawn before the items)
function labels(c, m, mid, view, s){
  c.save();
  if (m.phase === 'countin' || (m.phase === 'play' && m.t < 1.0)) { c.globalAlpha = m.phase === 'play' ? Math.max(0, 1 - m.t) : 1; try { c.letterSpacing = '3px'; } catch (e) {} text(c, 'SUPPLY DROP', mid, view.oy + 0.5 * s, 30, C.sten); try { c.letterSpacing = '0px'; } catch (e) {} c.globalAlpha = 1; }
  if (m.hint && (m.phase === 'countin' || (m.phase === 'play' && m.t < 4 && m.caught === 0))) text(c, 'Catch the crates.', mid, view.oy + 11.8 * s, 16, C.sand);
  c.restore();
}
function dots(c, m, mid, view, s){
  c.save();
  if (m.phase === 'countin') for (var d = 0; d < 3; d++) { c.fillStyle = m.dots > d ? C.gold : C.m7; c.beginPath(); c.arc(mid + (d - 1) * 28, view.oy + 7 * s, 9, 0, TAU); c.fill(); c.strokeStyle = C.sand; c.lineWidth = 2; c.stroke(); }
  if (m.phase === 'play' && m.goT > 0) text(c, 'GO', mid, view.oy + 7 * s, 44, C.gold);
  if (m.phase === 'end') text(c, m.early ? 'PERFECT' : 'TIME', mid, view.oy + 7 * s, 40, C.gold);
  c.restore();
}
V.CatchScene = { draw:draw, TOKENS:C, icon:function(c, kind, x, y, pxs){ ctx = c; if (EXT[kind]) iconPx(kind, x, y, pxs); } };
})();
