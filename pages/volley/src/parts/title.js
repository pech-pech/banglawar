(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// F1 TITLE SCREEN (pick 18; spec 05 s3.1; 06 row N3). The game's name lives in ONE place: GAME_NAME below.
//   Changing it renames the title screen, the boot overlay and the page title (this file sets both at load).
//   The other copies are outside this file and are listed in f1/A-REPORT.md (manifest name, game.html fallbacks).
// Look: G2 inked military field, drawn in code on a canvas (no paid art, no image files): sand apron, hard low-sun shadows,
//   ink outlines, painted range rings, cover blocks, the Operator top-down and three machines, one of them aiming.
// Layout on the 344 x 882 reference [spec]: name block y 120-240 (auto-fit 44 px on one line, down to 28, then two lines at a space),
//   "Tap to deploy" y 640-688 with a pulse, save-reset line y 720-760, version at the foot. Other sizes keep the same height ratios.
// The whole view is the target. The tap also starts sound (a browser allows sound only after a touch); the tap sound plays inside
//   resume().then (L-HB-1). Taps in the first 350 ms after the title appears are ignored (L-PV-9 spirit, guess).
// After the tap: first launch goes straight to stage 1 (pick 14); later launches go to Deploy. V.Title.onStart(first) overrides this.
// API: V.Title.show(opts) -> true if shown; hide(); visible; NAME; fit(name, maxW, measure) (pure, for tests). ?title=0 skips it.
var GAME_NAME = 'Project Volley';   // placeholder until M gives the name (pick 18)

V.GAME_NAME = GAME_NAME;
var FIT = { max: 44, min: 28, spacing: 0.06 };   // px [spec]; letter-spacing in em (guess, matches the kit's stencil labels)
var ARM_MS = 350;
var el = null, cv = null, vis = false, shownAt = 0, opts0 = null, raf = 0;

// Auto-fit: one line from 44 px down to 28; else two lines broken at the space nearest the middle, from 44 down to 28.
// measure(text, px) -> width in px without letter-spacing. Returns { size, lines }.
function fit(name, maxW, measure){
  var s, w;
  function width(t, px){ return measure(t, px) + Math.max(0, t.length - 1) * FIT.spacing * px; }
  for (s = FIT.max; s >= FIT.min; s--) if (width(name, s) <= maxW) return { size: s, lines: [name] };
  var sp = [], i; for (i = 0; i < name.length; i++) if (name[i] === ' ') sp.push(i);
  if (!sp.length) return { size: FIT.min, lines: [name] };
  var mid = name.length / 2, best = sp[0];
  sp.forEach(function(p){ if (Math.abs(p - mid) < Math.abs(best - mid)) best = p; });
  var L = [name.slice(0, best), name.slice(best + 1)];
  for (s = FIT.max; s >= FIT.min; s--) { w = Math.max(width(L[0], s), width(L[1], s)); if (w <= maxW) return { size: s, lines: L }; }
  return { size: FIT.min, lines: L };
}

var CSS = [
  '#pvTitle{position:fixed;inset:0;z-index:70;overflow:hidden;background:#c9b48a;color:#f2ead8;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;opacity:1;transition:opacity .25s ease-out}',
  '#pvTitle.out{opacity:0;pointer-events:none}',
  '#pvTitle canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
  '#pvTitle .pvt-col{position:absolute;inset:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}',
  '#pvTitle .pvt-name{position:absolute;left:16px;right:16px;top:20.4%;transform:translateY(-50%);text-align:center;margin:0;',
  ' font-family:var(--pv-ui-font-stencil,"Arial Narrow",sans-serif);font-weight:800;text-transform:uppercase;letter-spacing:.06em;line-height:1.02;color:#f2ead8;',
  ' text-shadow:-2px -2px 0 #0f1215,2px -2px 0 #0f1215,-2px 2px 0 #0f1215,2px 2px 0 #0f1215,0 -2px 0 #0f1215,0 2px 0 #0f1215,-2px 0 0 #0f1215,2px 0 0 #0f1215,4px 5px 0 rgba(15,18,21,.75)}',
  '#pvTitle .pvt-name span{display:block;white-space:nowrap}',
  '#pvTitle .pvt-bar{display:block;width:64px;height:6px;margin:12px auto 0;background:var(--pv-ui-cyan,#38e8ff);box-shadow:0 0 0 2px #0f1215,0 0 10px rgba(56,232,255,.5)}',
  '#pvTitle .pvt-tap{position:absolute;left:50%;top:75.3%;transform:translate(-50%,-50%);min-width:220px;min-height:56px;padding:0 22px;display:flex;align-items:center;justify-content:center;',
  ' font:800 17px/1 var(--pv-ui-font-stencil,sans-serif);letter-spacing:.2em;text-transform:uppercase;white-space:nowrap;color:var(--pv-ui-cyan-ink,#04181c);',
  ' background:linear-gradient(var(--pv-ui-cyan-hi,#7ff3ff),var(--pv-ui-cyan,#38e8ff) 45%,#18bfd6);box-shadow:inset 0 0 0 2px #0f1215,inset 0 3px 0 rgba(255,255,255,.55),0 3px 0 #0f1215;',
  ' clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px));animation:pvtPulse 1.6s ease-in-out infinite}',
  '@keyframes pvtPulse{0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)}50%{opacity:.78;transform:translate(-50%,-50%) scale(.97)}}',
  '#pvTitle .pvt-reset{position:absolute;left:16px;right:16px;top:83.9%;transform:translateY(-50%);text-align:center;font:700 13px/1.3 var(--pv-ui-font,system-ui,sans-serif);color:#e4dfd2}',
  '#pvTitle .pvt-reset:empty{display:none}',
  '#pvTitle .pvt-ver{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);text-align:center;font:600 12px/1 ui-monospace,Menlo,Consolas,monospace;color:#b6b0a2;pointer-events:none}',
  '@media (prefers-reduced-motion:reduce){#pvTitle .pvt-tap{animation:none}#pvTitle{transition:none}}'
].join('\n');

// ---- the picture: drawn once per size at device resolution (L-PV-15) ----
function lcg(seed){ var s = seed >>> 0; return function(){ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function draw(){
  if (!cv) return;
  var W = G.innerWidth, H = G.innerHeight, dpr = Math.min(2, G.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  var c = cv.getContext('2d'); if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  var s = Math.min(W / 9, H / 15) * 1.15, INK = '#0f1215', R = lcg(7);
  // ground: sand apron with low-sun grade
  var g = c.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, '#ead8ad'); g.addColorStop(0.55, '#d8c294'); g.addColorStop(1, '#b89c6a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (var i = 0; i < W * H / 900; i++) { c.fillStyle = R() < 0.5 ? 'rgba(120,92,52,.10)' : 'rgba(255,248,226,.12)'; c.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
  // paving grid
  var hx = W / 2, hy = H * 0.56;
  c.strokeStyle = 'rgba(70,52,28,.10)'; c.lineWidth = 1;
  for (var x = hx % s; x < W; x += s) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
  for (var y = hy % s; y < H; y += s) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  // painted range rings at 2, 4, 6 tiles
  c.setLineDash([s * 0.35, s * 0.22]); c.lineWidth = Math.max(2, s * 0.06); c.strokeStyle = 'rgba(255,250,236,.45)';
  [2, 4, 6].forEach(function(r){ c.beginPath(); c.arc(hx, hy, r * s, 0, Math.PI * 2); c.stroke(); });
  c.setLineDash([]);
  var sh = { x: s * 0.28, y: s * 0.34 };   // hard shadow offset, sun from the top left
  var clearY = H * 0.31;   // keep props out of the name band on short screens
  // D20: the "Tap to deploy" button band (CSS top 75.3%, 56 px tall, pulse 0.97, at least 220 wide). A prop that would touch it is lifted clear (never dropped), so short screens keep the button readable.
  var btnTop = H * 0.753 - 31, btnL = W / 2 - 126, btnR = W / 2 + 126;
  function block(x, y, w, h){
    if (x < btnR && x + w + sh.x > btnL && y + h + sh.y > btnTop && y < btnTop + 62) y = btnTop - 6 - h - sh.y;
    if (y < clearY) return;
    c.fillStyle = 'rgba(70,48,22,.38)'; c.fillRect(x + sh.x, y + sh.y, w, h);
    c.fillStyle = '#b39a6c'; c.fillRect(x, y, w, h);
    c.fillStyle = '#cfba8c'; c.fillRect(x + 3, y + 3, w - 6, h * 0.55);
    c.strokeStyle = INK; c.lineWidth = 2.5; c.strokeRect(x, y, w, h);
    c.strokeStyle = 'rgba(15,18,21,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + w * 0.5, y + 3); c.lineTo(x + w * 0.5, y + h - 3); c.stroke();
  }
  block(hx - 3.3 * s, hy - 1.2 * s, 1.1 * s, 1.1 * s);
  block(hx + 2.1 * s, hy + 0.6 * s, 1.1 * s, 2.0 * s);
  block(hx - 0.55 * s, hy - 4.6 * s, 1.1 * s, 1.1 * s);
  // machines (E-01 shape: metal disc, ink ring, red eye); the middle one draws its aimed tell line at the Operator
  function machine(x, y, r, aim){
    if (y - r < clearY) return;
    if (aim) { c.setLineDash([s * 0.2, s * 0.14]); c.strokeStyle = 'rgba(255,59,48,.85)'; c.lineWidth = Math.max(2, s * 0.06); c.beginPath(); c.moveTo(x, y); c.lineTo(hx, hy); c.stroke(); c.setLineDash([]); }
    c.fillStyle = 'rgba(70,48,22,.38)'; c.beginPath(); c.arc(x + sh.x * 0.7, y + sh.y * 0.7, r, 0, 7); c.fill();
    c.fillStyle = '#3a424a'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#242a31'; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(p){ c.beginPath(); c.arc(x + p[0] * r * 0.8, y + p[1] * r * 0.8, r * 0.28, 0, 7); c.fill(); c.stroke(); });
    c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(x, y, r * 0.36, 0, 7); c.fill(); c.lineWidth = 1.5; c.stroke();
  }
  machine(hx - 2.4 * s, hy - 3.4 * s, s * 0.38, false);
  machine(hx + 1.9 * s, hy - 2.7 * s, s * 0.42, true);
  machine(hx + 3.1 * s, hy - 5.3 * s, s * 0.34, false);
  // the Operator, top-down: shadow, pack, shoulders, helmet, cyan visor, rifle toward the aiming machine
  var a = Math.atan2(hy - 2.7 * s - hy, 1.9 * s);
  c.save(); c.translate(hx, hy); c.rotate(a + Math.PI / 2);
  c.fillStyle = 'rgba(70,48,22,.38)'; c.beginPath(); c.ellipse(sh.x * 0.6, sh.y * 0.6, s * 0.5, s * 0.42, 0, 0, 7); c.fill();
  c.strokeStyle = INK; c.lineWidth = 2.5;
  c.fillStyle = '#2b2f22'; c.fillRect(-s * 0.08, -s * 0.95, s * 0.16, s * 0.7); c.strokeRect(-s * 0.08, -s * 0.95, s * 0.16, s * 0.7);   // rifle
  c.fillStyle = '#3d4a28'; c.beginPath(); c.ellipse(0, 0, s * 0.46, s * 0.3, 0, 0, 7); c.fill(); c.stroke();                           // shoulders
  c.fillStyle = '#2f3320'; c.fillRect(-s * 0.22, s * 0.12, s * 0.44, s * 0.24); c.strokeRect(-s * 0.22, s * 0.12, s * 0.44, s * 0.24); // pack
  c.fillStyle = '#5a673a'; c.beginPath(); c.arc(0, -s * 0.04, s * 0.24, 0, 7); c.fill(); c.stroke();                                    // helmet
  c.fillStyle = '#4cf0ff'; c.beginPath(); c.ellipse(0, -s * 0.2, s * 0.15, s * 0.06, 0, 0, 7); c.fill(); c.lineWidth = 1.5; c.stroke(); // visor
  c.restore();
  // scrims so the name and the button read on any width
  var t = c.createLinearGradient(0, 0, 0, H * 0.42); t.addColorStop(0, 'rgba(11,14,17,.92)'); t.addColorStop(0.7, 'rgba(11,14,17,.55)'); t.addColorStop(1, 'rgba(11,14,17,0)');
  c.fillStyle = t; c.fillRect(0, 0, W, H * 0.42);
  var b = c.createLinearGradient(0, H * 0.62, 0, H); b.addColorStop(0, 'rgba(11,14,17,0)'); b.addColorStop(0.35, 'rgba(11,14,17,.7)'); b.addColorStop(1, 'rgba(11,14,17,.92)');
  c.fillStyle = b; c.fillRect(0, H * 0.62, W, H * 0.38);
  var v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}
function layoutName(){
  if (!el) return;
  var nm = el.querySelector('.pvt-name'), W = G.innerWidth, maxW = Math.min(W - 32, 480);   // 312 on the 344 reference [spec]
  var fam = (G.getComputedStyle ? G.getComputedStyle(nm).fontFamily : '') || 'sans-serif';
  var mc = document.createElement('canvas').getContext('2d');
  var r = fit(GAME_NAME.toUpperCase(), maxW, function(t, px){ if (!mc) return t.length * px * 0.6; mc.font = '800 ' + px + 'px ' + fam; return mc.measureText(t).width; });
  nm.style.fontSize = r.size + 'px';
  nm.innerHTML = r.lines.map(function(l){ return '<span>' + l.replace(/[&<>]/g, function(ch){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]; }) + '</span>'; }).join('') + '<i class="pvt-bar"></i>';
}
function onResize(){ if (!vis) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(function(){ draw(); layoutName(); }); }
function firstLaunch(){ var M = V.Meta, st = M && M.state; return !!st && !(st.runs && st.runs.length) && !(st.best > 0); }
function go(){
  if (!vis || performance.now() - shownAt < ARM_MS) return;
  var first = firstLaunch();
  if (V.Audio && V.Audio.whenRunning) V.Audio.whenRunning(function(){ V.Audio.play('title_tap'); });
  hide();
  var o = opts0 || {};
  if (typeof o.onStart === 'function') { o.onStart(first); return; }
  if (typeof V.Title.onStart === 'function') { V.Title.onStart(first); return; }
  if (first && V.Run && V.Run.start) { V.Run.start(); if (V.Home && V.Home.hide) V.Home.hide(); }   // pick 14: first launch plays stage 1 at once
  else if (V.Home && V.Home.show) V.Home.show('deploy');
}
function show(opts){
  if (typeof document === 'undefined') return false;
  if (G.location && /[?&]title=0(&|#|$)/.test(G.location.search || '')) return false;
  opts0 = opts || {};
  if (!document.getElementById('pv-title-css')) { var st = document.createElement('style'); st.id = 'pv-title-css'; st.textContent = CSS; document.head.appendChild(st); }
  if (!el) {
    el = document.createElement('div'); el.id = 'pvTitle'; el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', GAME_NAME + '. Tap to deploy');
    el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="pvt-col"><h1 class="pvt-name"></h1><div class="pvt-tap">Tap to deploy</div><div class="pvt-reset" role="note"></div><div class="pvt-ver"></div></div>';
    cv = el.querySelector('canvas');
    el.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); go(); });
    el.addEventListener('pointerdown', function(e){ e.stopPropagation(); });   // never steers the run under it
    el.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    G.addEventListener('resize', onResize);
  }
  var M = V.Meta, line = '';
  if (M && M.storageOk === false && M.BLOCKED_LINE) line = M.BLOCKED_LINE;
  else if (M && M.resetSignal && M.RESET_LINE) line = M.RESET_LINE;   // [spec] shown once after a wipe (R20); Home repeats it as a toast
  el.querySelector('.pvt-reset').textContent = line;
  el.querySelector('.pvt-ver').textContent = 'Build ' + ((V.UI && V.UI.BUILD) || '-');
  el.classList.remove('out'); (document.body || document.documentElement).appendChild(el);
  vis = true; shownAt = performance.now();
  draw(); layoutName();
  try { el.focus({ preventScroll: true }); } catch (e) {}
  return true;
}
function hide(){
  if (!el || !vis) return;
  vis = false; el.classList.add('out');
  var e0 = el; setTimeout(function(){ if (!vis && e0.parentNode) e0.parentNode.removeChild(e0); }, 280);
}
if (typeof document !== 'undefined') {
  var setNames = function(){ try { document.title = GAME_NAME; var b = document.querySelector('#ovBoot h2'); if (b) b.textContent = GAME_NAME; } catch (e) {} };
  setNames(); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setNames);
}
V.Title = {
  NAME: GAME_NAME,
  show: show, hide: hide, fit: fit, FIT: FIT,
  get visible(){ return vis; },
  onStart: null
};
})();
