(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
if (typeof document === 'undefined') return;
/* Intel tab: Codex (E-01..E-05, B-01) and Settings (sound, haptics, renderer label, power slider, reset save).
   Reads/writes only through V.Meta. tb-in-* classes are local (injected below). */

var ICONS = {
  codex:'<rect x="4" y="3" width="16" height="18" rx="1"/><circle cx="11" cy="11" r="4"/><path d="M14 14l4 4"/>',
  sliders:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  sound:'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  haptic:'<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 8v8M20 8v8"/>',
  gpu:'<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 10h8M8 14h5"/>',
  power:'<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  trash:'<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>'
};
function ico(n, c){ return '<svg class="pv-ico '+(c||'')+'" viewBox="0 0 24 24" aria-hidden="true">'+ICONS[n]+'</svg>'; }
var COIN = '<svg class="tb-coin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="#e8b020" stroke="#0f1215" stroke-width="1.5"/><circle cx="8" cy="8" r="4" fill="none" stroke="rgba(120,70,0,.55)" stroke-width=".9"/></svg>';

/* names and role lines: D1 section 4 (our own wording) */
var CODEX = [
  { id:'E-01', name:'Chaser drone',  role:'Halts, flashes yellow, then lunges. Sidestep it.' },
  { id:'E-02', name:'Gun drone',     role:'Strafes and fires one aimed round after a red line.' },
  { id:'E-03', name:'Spread turret', role:'Fixed. Fires a 3-round fan. Stand between the lines.' },
  { id:'E-04', name:'Mortar walker', role:'Lobs shells at your spot. Leave the ground ring.' },
  { id:'E-05', name:'Charger bot',   role:'Kneels, then dashes down a red lane. Sidestep it.', boss:true },
  { id:'B-01', name:'Volley Tower',  role:'Static boss. Scatter barrages and bomb shells.', boss:true }
];

var CSS = '\
.tb-in{position:relative;height:100%;display:flex;flex-direction:column;color:var(--pv-ui-text);font:400 14px/1.35 var(--pv-ui-font);box-sizing:border-box;user-select:none;-webkit-tap-highlight-color:transparent}\
.tb-in *,.tb-in *::before,.tb-in *::after{box-sizing:border-box}\
.tb-in .body{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;padding:4px 12px var(--tb-bottom,98px);display:flex;flex-direction:column;gap:10px}\
.tb-in .body::-webkit-scrollbar{display:none}\
.tb-seg{display:grid;grid-template-columns:1fr 1fr;height:62px;background:var(--pv-ui-ink);border:1.5px solid var(--pv-ui-metal-500);border-radius:6px;padding:3px;gap:3px;flex:none}\
.tb-seg button{appearance:none;border:0;background:none;display:flex;align-items:center;justify-content:center;font:800 13px/1 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.16em;color:var(--pv-ui-text-2);border-radius:3px;cursor:pointer}\
.tb-seg button.on{background:linear-gradient(var(--pv-ui-cyan-hi),var(--pv-ui-cyan));color:var(--pv-ui-cyan-ink);box-shadow:inset 0 -3px 0 rgba(0,60,70,.35)}\
.tb-hd{display:flex;align-items:center;min-height:56px;margin:0 0 0 -12px;flex:none}\
.tb-hd button{appearance:none;width:56px;height:56px;flex:none;background:none;border:0;color:var(--pv-ui-text);font-size:26px;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}\
.tb-hd h2{margin:0;flex:1;font:800 22px/1.1 var(--pv-ui-font-stencil);letter-spacing:.06em;text-transform:uppercase;color:var(--pv-ui-sand)}\
.tb-hd .c{font:800 14px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-cyan);letter-spacing:.06em;padding-right:12px}\
.tb-row.tb-hub{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:8px;text-align:left}\
.tb-hub .t{display:flex;align-items:center;gap:10px}.tb-hub .t b{font:800 14px/1 var(--pv-ui-font-stencil);letter-spacing:.1em;text-transform:uppercase}\
.tb-hub .t .pv-ico{font-size:26px;color:var(--pv-ui-sand)}.tb-hub .n{margin-left:auto;font:800 16px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-cyan)}\
.tb-latest{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}\
.tb-latest .tb-cx{min-height:0;padding:6px 6px 8px;align-items:stretch}.tb-latest .ms{height:56px}.tb-latest canvas{width:48px;height:48px}.tb-latest .nm{font-size:11px;text-align:center}\
.tb-prog{display:flex;flex-direction:column;gap:5px}\
.tb-prog .r{display:flex;justify-content:space-between;align-items:baseline}\
.tb-prog .pv-bar{height:12px}\
.tb-lbl{font:800 12px/1 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.2em;color:var(--pv-ui-cyan)}\
.tb-cnt{font:800 14px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-text);letter-spacing:.06em}\
.tb-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}\
.tb-cx{position:relative;display:flex;flex-direction:column;gap:6px;padding:6px 6px 8px;min-height:176px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-800));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),inset 0 -2px 0 rgba(0,0,0,.35),0 2px 0 rgba(0,0,0,.55)}\
.tb-cx .ms{position:relative;width:100%;height:84px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#c9b98f,#8b7a55 90%);border-radius:4px;box-shadow:inset 0 0 0 1.5px var(--pv-ui-ink)}\
.tb-cx canvas{width:72px;height:72px;display:block}\
.tb-cx .id{position:absolute;top:4px;left:4px;font:800 11px/1 var(--pv-ui-font-stencil);letter-spacing:.1em;color:#2a2012;background:rgba(236,220,178,.85);padding:2px 4px;border-radius:2px}\
.tb-cx .nm{font:800 12px/1.1 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.06em;padding:0 2px}\
.tb-cx .ro{font-size:11px;line-height:1.25;color:var(--pv-ui-text-2);padding:0 2px}\
.tb-cx.boss{grid-column:1 / -1;min-height:0;flex-direction:row;align-items:center;gap:10px}\
.tb-cx.boss .ms{width:110px;height:96px;flex:none}.tb-cx.boss canvas{width:88px;height:88px}\
.tb-cx.boss .tx{display:flex;flex-direction:column;gap:6px;min-width:0}\
.tb-cx.lk .ms{background:var(--pv-ui-ink);color:var(--pv-ui-metal-500);font-size:26px}\
.tb-cx.lk .nm{color:var(--pv-ui-text-3);letter-spacing:.12em}\
.tb-cx.lk .id{background:var(--pv-ui-metal-700);color:var(--pv-ui-text-3)}\
.tb-sec{display:flex;align-items:center;gap:8px;min-height:24px}\
.tb-sec::before{content:"";width:6px;height:12px;background:var(--pv-ui-cyan);box-shadow:0 0 0 1.5px var(--pv-ui-ink)}\
.tb-sec span{font:800 12px/1 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.2em;color:var(--pv-ui-sand);white-space:nowrap}\
.tb-sec::after{content:"";flex:1;height:2px;background:repeating-linear-gradient(90deg,var(--pv-ui-metal-500) 0 6px,transparent 6px 9px)}\
.tb-row{display:flex;align-items:center;gap:12px;min-height:56px;width:100%;padding:6px 12px;text-align:left;font:inherit;color:inherit;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-800));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),inset 0 -2px 0 rgba(0,0,0,.35)}\
.tb-row .pv-ico{font-size:22px;color:var(--pv-ui-sand)}\
.tb-row .l{flex:1;min-width:0;font-weight:700;font-size:14px}\
.tb-row .l small{display:block;font-weight:400;font-size:11px;color:var(--pv-ui-text-2)}\
.tb-row .v{font:800 12px/1.2 var(--pv-ui-font-stencil);color:var(--pv-ui-text-2);letter-spacing:.06em;text-align:right}\
button.tb-row{appearance:none;cursor:pointer}\
.tb-sw{width:52px;height:30px;border-radius:4px;background:var(--pv-ui-ink);border:1.5px solid var(--pv-ui-metal-500);position:relative;flex:none}\
.tb-sw::after{content:"";position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:2px;background:var(--pv-ui-metal-500)}\
[aria-checked=true] .tb-sw{border-color:var(--pv-ui-cyan-lo);background:#0b2a30}\
[aria-checked=true] .tb-sw::after{left:24px;background:var(--pv-ui-cyan);box-shadow:0 0 8px var(--pv-ui-cyan)}\
.tb-pw{display:flex;flex-direction:column;gap:6px;padding:8px 12px 10px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-800));border:1.5px solid var(--pv-ui-ink);border-radius:6px}\
.tb-pw .h{display:flex;align-items:center;gap:12px}\
.tb-pw .l{flex:1;font-weight:700}.tb-pw .l small{display:block;font-weight:400;font-size:11px;color:var(--pv-ui-text-2)}\
.tb-pw input[type=range]{width:100%;height:40px;margin:0;accent-color:var(--pv-ui-cyan);background:transparent}\
.tb-danger{color:var(--pv-ui-red)}.tb-danger .pv-ico{color:var(--pv-ui-red)}\
.tb-scrim{position:absolute;inset:0;z-index:50;display:flex;align-items:flex-end;background:rgba(5,7,9,.78)}\
.tb-sheet{width:100%;margin-bottom:var(--tb-bottom,98px);padding:16px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-900));border:2.5px solid var(--pv-ui-ink);border-radius:10px 10px 0 0;box-shadow:0 0 0 1.5px var(--pv-ui-metal-500)}\
.tb-sheet h3{margin:0;font:800 17px/1.2 var(--pv-ui-font-stencil);letter-spacing:.1em;text-transform:uppercase;color:var(--pv-ui-sand)}\
.tb-sheet p{margin:0;font-size:13px;color:var(--pv-ui-text-2)}\
.tb-sheet .acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}\
.tb-sheet .pv-btn{min-height:56px}';

function injectCss(){
  if (document.getElementById('tb-in-css')) return;
  var s = document.createElement('style'); s.id = 'tb-in-css'; s.textContent = CSS; document.head.appendChild(s);
}
var stub = null;
function M(){
  if (V.Meta) return V.Meta;
  if (!stub) stub = { state:{ credits:0, cond:{hp:0,atk:0,rate:0}, settings:{sound:true,haptics:true}, codex:{seen:{}}, runs:[], best:0 },
    save:function(){}, onChange:function(){}, power:1 };
  return stub;
}
function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
function seen(id){ var c = M().state && M().state.codex; return !!(c && c.seen && c.seen[id]); }

/* ---- icons: simple shapes from the in-game silhouettes, drawn on a canvas (no V.Scene dependency) ---- */
var INK = '#0f1215', METAL = '#3a424a', DARK = '#242a31', RED = '#ff3b30';
function drawIcon(cv, id){
  var dpr = Math.min(2, G.devicePixelRatio || 1), S = 72;
  cv.width = S * dpr; cv.height = S * dpr;
  var c = cv.getContext('2d'); c.scale(dpr, dpr); c.translate(S/2 + 2, S/2 + 3);
  function shape(fn, fill){ c.beginPath(); fn(); c.fillStyle = fill; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke(); }
  function circ(x, y, r, fill){ shape(function(){ c.arc(x, y, r, 0, 7); }, fill); }
  function eye(x, y, r){ circ(x, y, r, RED); }
  function poly(pts, fill){ shape(function(){ pts.forEach(function(p, i){ i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.closePath(); }, fill); }
  c.globalAlpha = 0.28; c.fillStyle = '#3c2d1e';          // hard low-sun shadow, offset
  c.globalAlpha = 1;
  if (id === 'E-01') {
    c.beginPath(); c.arc(0, 0, 24, 0, 7); c.lineWidth = 3; c.strokeStyle = '#1a1f24'; c.stroke();
    circ(0, 0, 15, METAL); eye(0, 0, 6);
    [[-17,-17],[17,-17],[-17,17],[17,17]].forEach(function(p){ circ(p[0], p[1], 5, DARK); });
  } else if (id === 'E-02') {
    [[-20,-20],[20,-20],[-20,20],[20,20]].forEach(function(p){ c.beginPath(); c.moveTo(0,0); c.lineTo(p[0], p[1]); c.lineWidth = 4; c.strokeStyle = INK; c.stroke(); circ(p[0], p[1], 10, '#4a535d'); });
    poly([[-9,-9],[9,-9],[9,9],[-9,9]], METAL); eye(0, 0, 4); poly([[-2,6],[2,6],[2,18],[-2,18]], DARK);
  } else if (id === 'E-03') {
    var h = []; for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3 + Math.PI / 6; h.push([Math.cos(a) * 26, Math.sin(a) * 26]); }
    poly([[-14,-34],[-8,-24],[0,-26],[8,-24],[14,-34],[0,-30]], DARK);
    poly(h, METAL); circ(0, 0, 11, DARK); eye(0, 0, 5);
  } else if (id === 'E-04') {
    [[-22,-16],[22,-16],[-24,16],[24,16]].forEach(function(p){ c.beginPath(); c.moveTo(0,0); c.lineTo(p[0], p[1]); c.lineWidth = 5; c.strokeStyle = INK; c.stroke(); circ(p[0], p[1], 6, '#4a535d'); });
    poly([[-14,12],[14,12],[10,-12],[-10,-12]], METAL); poly([[-3,-26],[3,-26],[3,-8],[-3,-8]], DARK); eye(0, 3, 4);
  } else if (id === 'E-05') {
    poly([[-18,-8],[0,-30],[18,-8],[18,26],[-18,26]], METAL);
    poly([[-9,-12],[0,-24],[9,-12]], '#8a925c'); eye(0, 4, 5);
    [-22, 18].forEach(function(x){ poly([[x,-6],[x+4,-6],[x+4,26],[x,26]], DARK); });
  } else {
    [0,1,2,3,4,5,6,7].forEach(function(i){ var a = i * Math.PI / 4; c.beginPath(); c.moveTo(0,0); c.lineTo(Math.cos(a) * 32, Math.sin(a) * 32); c.lineWidth = 6; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3; c.strokeStyle = '#4a535d'; c.stroke(); });
    var o = []; for (var j = 0; j < 8; j++) { var b = j * Math.PI / 4 + Math.PI / 8; o.push([Math.cos(b) * 24, Math.sin(b) * 24]); }
    poly(o, METAL); circ(0, 0, 13, DARK); eye(0, 0, 6);
  }
}

var T = V.Tabs = V.Tabs || {};
var busy = false, root, body, view = 'hub', sheet = null, mounted = false, subscribed = false;

function header(name, right){
  var h = el('div', 'tb-hd');
  var b = el('button', '', '<svg class="pv-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'); b.type = 'button'; b.setAttribute('aria-label', 'Back'); b.setAttribute('data-back', '1');
  b.addEventListener('click', function(){ view = 'hub'; render(); });
  h.appendChild(b); h.appendChild(el('h2', '', name));
  if (right) h.appendChild(el('span', 'c', right));
  return h;
}
function fileRow(icon, label, sub, v){
  var b = el('button', 'tb-row', ico(icon) + '<span class="l">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><svg class="pv-ico" viewBox="0 0 24 24" aria-hidden="true" style="color:var(--pv-ui-text-3)"><path d="M9 5l7 7-7 7"/></svg>');
  b.type = 'button'; b.setAttribute('data-view', v);
  b.addEventListener('click', function(){ view = v; render(); });
  return b;
}
function renderHub(){
  var n = CODEX.filter(function(e){ return seen(e.id); }).length, tot = CODEX.length;
  body.appendChild(el('div', 'tb-prog', '<div class="r"><span class="tb-lbl">Intel gathered</span><span class="tb-cnt">' + Math.round(n / tot * 100) + '%</span></div>' +
    '<div class="pv-bar"><div class="pv-bar__fill" style="--v:' + Math.round(n / tot * 100) + '%"></div></div>'));
  var hb = el('div', 'tb-row tb-hub', '<div class="t">' + ico('lock').replace(ICONS.lock, ICONS.codex) + '<b>Machines</b><span class="n">' + n + ' / ' + tot + '</span></div><div class="pv-bar"><div class="pv-bar__fill" style="--v:' + Math.round(n / tot * 100) + '%"></div></div>');
  hb.style.minHeight = '84px';
  body.appendChild(hb);
  var late = CODEX.filter(function(e){ return seen(e.id); }).slice(-3).reverse();
  if (late.length) {
    body.appendChild(el('div', 'tb-sec', '<span>Latest intel</span>'));
    var g = el('div', 'tb-latest');
    late.forEach(function(e){
      var c = el('div', 'tb-cx'), ms = el('div', 'ms'), cv = document.createElement('canvas');
      ms.appendChild(cv); drawIcon(cv, e.id); ms.appendChild(el('span', 'id', e.id));
      c.appendChild(ms); c.appendChild(el('div', 'nm', e.name)); g.appendChild(c);
    });
    body.appendChild(g);
  }
  body.appendChild(el('div', 'tb-sec', '<span>Files</span>'));
  var f = el('div', 'tb-grid'); f.style.gridTemplateColumns = '1fr'; f.style.gap = '6px';
  f.appendChild(fileRow('codex', 'Codex', n + ' of ' + tot + ' contacts filed', 'codex'));
  f.appendChild(fileRow('sliders', 'Settings', 'Sound, haptics, debug', 'settings'));
  body.appendChild(f);
}
function renderCodex(){
  var n = CODEX.filter(function(e){ return seen(e.id); }).length, tot = CODEX.length;
  body.appendChild(header('Codex', n + ' / ' + tot));
  var g = el('div', 'tb-grid');
  CODEX.forEach(function(e){
    var k = seen(e.id);
    var card = el('div', 'tb-cx' + (e.boss ? ' boss' : '') + (k ? '' : ' lk'));
    card.setAttribute('data-id', e.id);
    var ms = el('div', 'ms');
    if (k) { var cv = document.createElement('canvas'); ms.appendChild(cv); drawIcon(cv, e.id); }
    else ms.innerHTML = ico('lock');
    ms.appendChild(el('span', 'id', e.id));
    var tx = el('div', 'tx');
    tx.appendChild(el('div', 'nm', k ? e.name : 'Unknown contact'));
    tx.appendChild(el('div', 'ro', k ? e.role : 'Meet it in a run to file a report.'));
    if (e.boss) { card.appendChild(ms); card.appendChild(tx); }
    else { card.appendChild(ms); card.appendChild(tx.childNodes[0]); card.appendChild(tx.childNodes[0]); }
    g.appendChild(card);
  });
  body.appendChild(g);
}

function toggleRow(icon, label, sub, key){
  var m = M(), on = !!(m.state.settings && m.state.settings[key]);
  var b = el('button', 'tb-row', ico(icon) + '<span class="l">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="tb-sw"></span>');
  b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on); b.setAttribute('data-set', key);
  b.addEventListener('click', function(){
    var s = m.state.settings = m.state.settings || {};
    s[key] = !s[key];
    if (V.TUNE) { if (key === 'sound' && 'SOUND' in V.TUNE) V.TUNE.SOUND = s[key]; if (key === 'haptics' && 'HAPTICS' in V.TUNE) V.TUNE.HAPTICS = s[key]; }
    if (m.save) m.save();
    render();
  });
  return b;
}

function renderSettings(){
  var m = M();
  body.appendChild(header('Settings'));
  body.appendChild(el('div', 'tb-sec', '<span>Audio &amp; feel</span>'));
  var st = el('div', 'tb-grid'); st.style.gridTemplateColumns = '1fr'; st.style.gap = '6px';
  st.appendChild(toggleRow('sound', 'Sound', '', 'sound'));
  st.appendChild(toggleRow('haptic', 'Haptics', '', 'haptics'));
  body.appendChild(st);
  body.appendChild(el('div', 'tb-sec', '<span>System</span>'));
  var sys = el('div', 'tb-grid'); sys.style.gridTemplateColumns = '1fr'; sys.style.gap = '6px';
  var rn = (G.__pv && G.__pv.renderer) || 'Not started';
  sys.appendChild(el('div', 'tb-row', ico('gpu') + '<span class="l">Renderer</span><span class="v" id="tb-renderer">' + rn + '</span>'));
  var pw = (typeof m.power === 'number') ? m.power : 1;
  var box = el('div', 'tb-pw', '<div class="h">' + ico('power', '') + '<span class="l">Debug power<small>Scales Conditioning bonuses, 0 to 1</small></span><span class="v tb-cnt" id="tb-pwv">' + pw.toFixed(2) + '</span></div>');
  var r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.05; r.value = pw; r.setAttribute('aria-label', 'Debug power');
  r.addEventListener('input', function(){
    var v = Math.max(0, Math.min(1, parseFloat(r.value) || 0));
    busy = true; try { if (m.setPower) m.setPower(v); else m.power = v; } finally { busy = false; }
    box.querySelector('#tb-pwv').textContent = v.toFixed(2);
  });
  box.appendChild(r);
  sys.appendChild(box);
  var rs = el('button', 'tb-row tb-danger', ico('trash') + '<span class="l">Reset save</span>');
  rs.type = 'button'; rs.setAttribute('data-reset', '1');
  rs.addEventListener('click', confirmReset);
  sys.appendChild(rs);
  body.appendChild(sys);
}

function confirmReset(){
  closeSheet();
  var s = el('div', 'tb-scrim'); s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', 'Reset save');
  s.innerHTML = '<div class="tb-sheet"><h3>Reset save?</h3><p>This wipes credits, Conditioning, the run log and the codex on this device. It cannot be undone.</p>' +
    '<div class="acts"><button type="button" class="pv-btn pv-btn--ghost" data-cancel>Cancel</button><button type="button" class="pv-btn pv-btn--danger" data-confirm>Reset</button></div></div>';
  s.querySelector('[data-cancel]').addEventListener('click', closeSheet);
  s.querySelector('[data-confirm]').addEventListener('click', function(){
    var m = M(); closeSheet();
    if (m.reset) m.reset();
    else { try { localStorage.removeItem('volley.save.v1'); } catch (e) {} try { location.reload(); } catch (e2) {} }
  });
  root.appendChild(s); sheet = s;
}
function closeSheet(){ if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet); sheet = null; }

function render(){
  if (!root) return;
  var keep = body.scrollTop;
  body.innerHTML = '';
  if (view === 'codex') renderCodex(); else if (view === 'settings') renderSettings(); else renderHub();
  body.scrollTop = keep;
}

T.intel = {
  id: 'intel', title: 'Intel', icon: 'intel',
  mount: function(host){
    injectCss();
    root = el('div', 'tb-in');
    body = el('div', 'body'); root.appendChild(body);
    host.innerHTML = ''; host.appendChild(root);
    mounted = true;
    if (!subscribed && M().onChange) { M().onChange(function(){ if (mounted && !sheet && !busy) render(); }); subscribed = true; }
    render();
  },
  show: function(){ view = 'hub'; render(); },
  hide: function(){ closeSheet(); }
};
})();
