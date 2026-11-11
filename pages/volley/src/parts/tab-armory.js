(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Armory tab (TABS-A). DOM only, reads and writes through V.Meta, classes from home.css (ui-kit.css) plus a few scoped .ta-* rules injected here.
// Also exports V.TabsA (small helpers shared with tab-operator.js, which loads after this file).
var RIFLE_MAX = 10;
var NS = 'http://www.w3.org/2000/svg';

// ---- shared helpers (V.TabsA) ----------------------------------------------------------------
// Local stub, used only when V.Meta is missing (it is empty, neutral and cannot buy anything).
var STUB = { state: { credits: 0, rifle: { lvl: 1 }, cond: { hp: 0, atk: 0, rate: 0 }, runs: [], best: 0, codex: { seen: {} }, settings: {} },
  cost: function(){ return null; }, canBuy: function(){ return false; }, buy: function(){ return false; },
  stats: function(){ return { hpAdd: 0, atkMul: 1, rateMul: 1 }; }, onChange: function(){}, power: 1 };
function meta(){ return V.Meta || STUB; }
function fmt(n){ n = Math.floor(+n || 0); return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
// Asset lookup: first key that exists in V.ASSETS wins; '' when none (callers draw a plain shape instead).
function asset(keys){ var A = V.ASSETS || {}; for (var i = 0; i < keys.length; i++) if (A[keys[i]]) return A[keys[i]]; return ''; }
var KEYS = { rifle: ['P-05', 'rifle'], rack: ['portrait-kneesup', 'P-02', 'portrait'], portrait: ['P-02', 'portrait'], head: ['R-10', 'operator'], coin: ['P-08', 'coin'], cog: ['cog'] };
// ---- shared art helpers: ONE place for the size rules (design thread final) ----
// coin(px): under 32 css px the kit coin is drawn in code (gold #ffe27a to #c28a0c, 1.5px ink outline, one inner ring, no symbol; CSS class .pv-coin in home.css);
//           32 px and up uses the generated icon-coin-64.
function coin(px){
  px = px || 16;
  var u = px >= 32 ? asset(KEYS.coin) : '';
  if (u) return '<img class="ta-coin" src="' + u + '" width="' + px + '" height="' + px + '" alt="">';
  return '<span class="pv-coin ta-coin" style="width:' + px + 'px;height:' + px + 'px" aria-hidden="true"></span>';
}
// cog(px): under 56 css px an inline SVG (six teeth #56606a, shade #3a424b, 1.5px #0f1215 outline, #d9d3b8 up arrow); 56 px and up the generated webp.
function cog(px, cls){
  px = px || 40; cls = cls || '';
  var u = px >= 56 ? asset(KEYS.cog) : '';
  if (u) return '<img class="tb-cog ' + cls + '" src="' + u + '" width="' + px + '" height="' + px + '" alt="" draggable="false">';
  var t = ''; for (var i = 0; i < 6; i++) t += '<rect x="-3.5" y="-17.5" width="7" height="8" rx="1.5" transform="rotate(' + (i * 60) + ')"/>';
  return '<svg class="tb-cog ' + cls + '" viewBox="-20 -20 40 40" width="' + px + '" height="' + px + '" aria-hidden="true">' +
    '<g fill="#56606a" stroke="#0f1215" stroke-width="1.5" stroke-linejoin="round">' + t + '<circle r="12.5"/></g>' +
    '<path d="M8.8 -8.8A12.5 12.5 0 0 1 -8.8 8.8Z" fill="#3a424b"/><circle r="12.5" fill="none" stroke="#0f1215" stroke-width="1.5"/>' +
    '<path d="M0 -7L6 0H2.4V7H-2.4V0H-6Z" fill="#d9d3b8"/></svg>';
}
// rifle(px): the generated rifle only at 48 css px and up; below that the kit code glyph (callers pass their own glyph markup).
function rifle(px, glyph){
  var u = px >= 48 ? asset(KEYS.rifle) : '';
  return u ? '<img src="' + u + '" alt="" draggable="false">' : (glyph || '');
}
function pill(credits){ return '<span class="pv-chip pv-chip--credits ta-pill" aria-label="Credits">' + coin(18) + '<span class="ta-pill__n">' + fmt(credits) + '</span></span>'; }
function injectCss(id, css){
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  var s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s);
}
var BASE_CSS = [
  '.ta-root{position:relative;height:100%;display:flex;flex-direction:column;min-width:0;overflow:hidden;color:var(--pv-ui-text);font:400 14px/1.35 var(--pv-ui-font)}',
  '.ta-root *,.ta-root *::before,.ta-root *::after{box-sizing:border-box}',
  '.ta-scroll{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:12px 16px calc(var(--tb-bottom,28px) + 10px);display:flex;flex-direction:column;gap:12px;scrollbar-width:none;overscroll-behavior:contain}',
  '.ta-scroll::-webkit-scrollbar{display:none}',
  '.ta-pill{margin-left:auto;height:34px;padding:0 10px 0 8px;gap:6px;color:#ffe27a;font-size:14px}',
  '.ta-coin{display:block;flex:none;object-fit:contain}',
  '.ta-hint{font:700 12px/1 var(--pv-ui-font-stencil);letter-spacing:.16em;text-transform:uppercase;color:var(--pv-ui-text-2)}',
  '.ta-root .pv-btn{min-height:56px}'
].join('\n');
// AN-604 list stagger: items enter from +14 px, 40 ms apart, 220 ms each; at most 8 staggered (the rest come with the last);
// re-entering the same tab within 3 s skips it. Class .pv-in lives in home.css.
var lastIn = {};
function stagger(key, nodes){
  if (V.reducedMotion || !nodes) return;
  var t = Date.now(); if (lastIn[key] && t - lastIn[key] < 3000) { lastIn[key] = t; return; } lastIn[key] = t;
  for (var i = 0; i < nodes.length; i++) { var n = nodes[i]; n.classList.remove('pv-in'); n.style.animationDelay = Math.min(i, 7) * 40 + 'ms'; void n.offsetWidth; n.classList.add('pv-in'); }
}
V.TabsA = { stagger: stagger, meta: meta, fmt: fmt, esc: esc, asset: asset, KEYS: KEYS, coin: coin, cog: cog, rifle: rifle, pill: pill, injectCss: injectCss, BASE_CSS: BASE_CSS, STUB: STUB };

// ---- Armory ----------------------------------------------------------------------------------
var ICON_RIFLE = '<path d="M2 14h14l2-3h4v3h-3v2H9l-1 4H5l1-4H2z"/>';
var ICON_LOCK = '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>';
var LOCKED = [
  { name: 'Exo-plating', path: '<path d="M6 4l6 2 6-2 3 4-3 3v9H6v-9L3 8z"/>' },
  { name: 'Module A', path: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM2 9h3M2 15h3M19 9h3M19 15h3"/>' },
  { name: 'Module B', path: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM2 9h3M2 15h3M19 9h3M19 15h3"/>' },
  { name: 'Drone A', path: '<circle cx="12" cy="12" r="3"/><path d="M12 9V4M12 20v-5M9 12H4M20 12h-5M6 6l3 3M18 18l-3-3M18 6l-3 3M6 18l3-3"/>' },
  { name: 'Drone B', path: '<circle cx="12" cy="12" r="3"/><path d="M12 9V4M12 20v-5M9 12H4M20 12h-5M6 6l3 3M18 18l-3-3M18 6l-3 3M6 18l3-3"/>' }
];
var CSS = [
  '.ta-rack{display:flex;gap:12px;height:232px}',
  '.ta-rackpanel{flex:none;width:112px;padding:0;overflow:hidden;background:repeating-linear-gradient(90deg,transparent 0 14px,rgba(255,255,255,.04) 14px 16px),linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-900))}',
  '.ta-rackpanel svg{position:absolute;left:6px;top:14px;width:100px;height:166px}',
  '.ta-rackpanel{cursor:pointer}.ta-rackpanel img{position:absolute;left:4px;top:8px;width:104px;height:174px;object-fit:cover;object-position:50% 0;display:block;border:1.5px solid var(--pv-ui-ink);border-radius:4px;-webkit-mask-image:linear-gradient(#000 calc(100% - 40px),transparent);mask-image:linear-gradient(#000 calc(100% - 40px),transparent)}',
  '.ta-rackpanel .ta-hint{position:absolute;left:0;right:0;bottom:0;padding:8px 0 12px;text-align:center;letter-spacing:.1em;color:var(--pv-ui-text)}',
  '.ta-slots{flex:1;min-width:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,1fr);gap:8px}',
  '.ta-slot{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;padding:0 2px;color:var(--pv-ui-text);cursor:default;font:inherit}',
  '.ta-slot.pv-cell{width:auto;height:auto;font-size:26px}',
  'button.ta-slot{cursor:pointer;appearance:none}',
  '.ta-slot .pv-ico{font-size:26px}',
  '.ta-slot img{position:static;flex:1 1 0;min-height:0;width:100%;max-width:100%;object-fit:cover;object-position:50% 50%;border-radius:3px;display:block;pointer-events:none;margin:0}',
  '.ta-slot.r1{justify-content:flex-end;padding:6px 4px}',
  '.ta-rpip{position:absolute;left:5px;bottom:5px;display:flex;gap:2px}.ta-rpip i{width:5px;height:5px;background:var(--rc,var(--pv-ui-r1));border:1px solid var(--pv-ui-ink)}',
  '.ta-lk{width:12px;height:12px;font-size:12px!important;margin-right:3px;vertical-align:-1px;stroke:currentColor;fill:none;stroke-width:2}',
  '.ta-slot__n{font:800 12px/1 var(--pv-ui-font-stencil);letter-spacing:0;text-transform:uppercase;color:var(--pv-ui-text-2);white-space:nowrap}',
  '.ta-slot__p{display:flex;align-items:center;font:700 12px/1 var(--pv-ui-font-stencil);letter-spacing:.08em;color:var(--pv-ui-text-3);white-space:nowrap}',
  '.ta-slot.is-empty{opacity:.85}',
  '.ta-slot.is-empty .pv-ico{color:var(--pv-ui-metal-400)}',
  '.ta-slot .pv-lvl{font-size:12px;right:5px;bottom:auto;top:5px}',
  '.ta-card{display:flex;flex-direction:column;gap:12px;padding:12px}',
  '.ta-head{display:flex;gap:12px;align-items:center;width:100%;min-height:72px;padding:0;margin:0;text-align:left;color:inherit;font:inherit;background:none;border:0;cursor:pointer;appearance:none}',
  '.ta-head:active{filter:brightness(.85)}',
  '.ta-cell{width:72px;height:72px;flex:none;position:relative;display:flex;align-items:center;justify-content:center}',
  '.ta-cell img{width:64px;height:64px;object-fit:contain;display:block}',
  '.ta-cell .pv-ico{font-size:34px}',
  '.ta-title{font:800 18px/1.1 var(--pv-ui-font-stencil);letter-spacing:.08em;text-transform:uppercase;color:var(--pv-ui-sand)}',
  '.ta-sub{font-size:12px;color:var(--pv-ui-text-2);margin-top:4px}',
  '.ta-chev{margin-left:auto;flex:none;color:var(--pv-ui-text-3);font-size:18px}',
  '.ta-stat{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 12px}',
  '.ta-stat .pv-stat__name{flex:1}',
  '.ta-cost{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 10px;background:var(--pv-ui-metal-900);border-radius:6px;box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-600)}',
  '.ta-cost .pv-chip{margin-left:auto}',
  '.ta-cost .pv-chip.is-short{color:var(--pv-ui-text-2)}',
  '.ta-note{font-size:12px;color:var(--pv-ui-text-2);text-align:center;min-height:16px}',
  '.ta-note.is-warn{color:var(--pv-ui-text-2)}',
  '.ta-left{font:700 12px/1 var(--pv-ui-font-stencil);letter-spacing:.1em;text-transform:uppercase;color:var(--pv-ui-text-2);text-align:center}',
  '.ta-left b{color:var(--pv-ui-text);font-size:14px}',
  '.ta-up{width:100%;font-size:17px;letter-spacing:.1em;white-space:nowrap;padding:0 8px}',
  '.ta-pulse{animation:taPulse .5s ease-out}',
  '@keyframes taPulse{0%{box-shadow:0 0 0 0 rgba(56,232,255,.7)}100%{box-shadow:0 0 0 14px rgba(56,232,255,0)}}',
  '.ta-scrim{position:absolute;inset:0;z-index:40}',
  '.ta-sheet{max-height:100%;overflow-y:auto;scrollbar-width:none;gap:10px;padding:8px 16px 16px}',
  '.ta-sheet .ta-x{position:absolute;top:8px;right:8px;width:56px;height:56px;padding:0;min-height:56px}',
  '.ta-sheet .ta-hd{display:flex;gap:12px;align-items:center;min-height:80px;padding-right:56px}',
  '.ta-perk{display:flex;align-items:center;gap:10px;min-height:42px;padding:0 10px;background:var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-600);color:var(--pv-ui-text-3)}',
  '.ta-perk b{font:800 12px/1 var(--pv-ui-font-stencil);letter-spacing:.08em;text-transform:uppercase;color:var(--pv-ui-sand);width:52px;flex:none}',
  '.ta-perk span{flex:1;font-size:12px;line-height:1.2}',
  '@media (prefers-reduced-motion:reduce){.ta-pulse{animation:none}}'
].join('\n');

// Rifle ATK shown on the card. V.Meta.rifleStat(lvl) wins if META exposes it; otherwise the D4 table (Ranger Rifle 50 +8 per level).
function rifleAtk(lvl){ var M = meta(); if (typeof M.rifleStat === 'function') { var v = M.rifleStat(lvl); if (isFinite(v)) return v; } return 50 + 8 * (lvl - 1); }
function rifleCost(){ var M = meta(); try { return M.cost('rifle', 'rifle'); } catch (_) { return null; } }

function ico(path, cls){ return '<svg class="pv-ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
var RPIP = '<span class="ta-rpip" title="Surplus" aria-label="Surplus rarity"><i></i></span>';
function rifleImg(){ return V.TabsA.rifle(64, ico(ICON_RIFLE)) || ico(ICON_RIFLE); }  // slots are 48-56 css px, so the generated rifle is allowed here
var OPFIG = '<g id="taSil"><ellipse cx="60" cy="30" rx="16" ry="18"/><rect x="53" y="44" width="14" height="14"/><path d="M40 60Q60 53 80 60L84 76L80 128L40 128L36 76Z"/><ellipse cx="38" cy="68" rx="10" ry="9"/><ellipse cx="82" cy="68" rx="10" ry="9"/><path d="M28 72L40 74L40 112L26 110Z"/><path d="M80 74L92 72L94 106L80 108Z"/><path d="M42 124L60 124L58 186L40 186L35 160Z"/><path d="M60 124L78 124L85 160L80 186L62 186Z"/><path d="M33 184L58 184L60 193L31 193Z"/><path d="M62 184L87 184L89 193L60 193Z"/><path d="M3 152L108 94L113 102L8 160Z"/></g>';

var el = null, root = null, unsub = null, shown = false, sheetOpen = false, lastLvl = -1, keyFn = null;

function view(){
  var M = meta(), st = M.state || STUB.state, lvl = Math.max(1, Math.min(RIFLE_MAX, (st.rifle && st.rifle.lvl) || 1));
  var c = rifleCost(), maxed = lvl >= RIFLE_MAX || !c, credits = st.credits || 0;
  var price = c ? c.credits : 0, can = !maxed && (typeof M.canBuy === 'function' ? !!M.canBuy('rifle', 'rifle') : credits >= price);
  var left = typeof M.visitLeft === 'function' ? M.visitLeft() : 2, why = typeof M.whyNot === 'function' ? M.whyNot('rifle', 'rifle') : '';
  return { lvl: lvl, maxed: maxed, price: price, can: can, credits: credits, short: Math.max(0, price - credits), left: left, why: why,
    atk: rifleAtk(lvl), next: maxed ? rifleAtk(lvl) : rifleAtk(lvl + 1) };
}
function pips(lvl){ var s = ''; for (var i = 1; i <= RIFLE_MAX; i++) s += '<i class="' + (i <= lvl ? 'on' : '') + '"></i>'; return '<span class="ta-pips" aria-hidden="true">' + s + '</span>'; }
function statRow(v){
  return '<div class="pv-panel pv-panel--inset ta-stat">' + ico('<path d="M12 3l7 8h-4v10H9V11H5z"/>') + '<span class="pv-stat__name">Rifle ATK</span>' +
    '<span class="pv-stat__val">' + fmt(v.atk) + '</span>' + (v.maxed ? '<span class="pv-badge pv-badge--olive">Max</span>' :
    '<span class="pv-small">&rarr;</span><span class="pv-stat__val pv-cyan">' + fmt(v.next) + '</span><span class="pv-stat__delta">+' + fmt(v.next - v.atk) + '</span>') + '</div>';
}
function costRow(v){
  if (v.maxed) return '<div class="ta-cost"><span class="ta-hint">Cost</span><span class="pv-small" style="margin-left:auto">Fully upgraded</span></div>';
  return '<div class="ta-cost"><span class="ta-hint">Next upgrade</span><span class="pv-chip pv-chip--credits' + (v.can ? '' : ' is-short') + '">' + coin(18) + fmt(v.price) + '</span></div>';
}
// P snippet 4 (pick 48): at most 2 buys per home visit. V.Meta.visitLeft() / whyNot() -> '' | 'max' | 'visit' | 'credits'.
function upBtn(v, cls){
  var label = v.maxed ? 'Max level' : 'Upgrade to Lv ' + (v.lvl + 1);
  var note = v.maxed ? 'Rifle is at its top level.' : v.can ? '&nbsp;' : v.why === 'visit' ? 'Your buys for this visit are used. They come back after your next run.' : 'Need ' + fmt(v.short) + ' more credits';
  return (v.maxed ? '' : '<div class="ta-left">Buys left this visit: <b>' + v.left + '</b></div>') +
    '<button type="button" class="pv-btn pv-btn--primary pv-btn--block ta-up ' + (cls || '') + '" data-act="buy"' + (v.can ? '' : ' disabled') + '>' + label + '</button>' +
    '<div class="ta-note' + (!v.maxed && !v.can ? ' is-warn' : '') + '">' + note + '</div>';
}

function render(){
  if (!el) return;
  var v = view(), M = meta(), st = M.state || STUB.state;
  var slots = '<button type="button" class="pv-cell r1 ta-slot is-selected" data-act="open" aria-label="Ranger Rifle, level ' + v.lvl + ', open details">' + rifleImg() +
    '<span class="pv-lvl">Lv ' + v.lvl + '</span>' + RPIP + '<span class="ta-slot__n">Rifle</span></button>';
  for (var i = 0; i < LOCKED.length; i++) {
    slots += '<div class="pv-cell ta-slot is-empty" role="img" aria-label="' + LOCKED[i].name + ', locked">' + ico(LOCKED[i].path) +
      '<span class="ta-slot__n">' + LOCKED[i].name + '</span><span class="ta-slot__p">' + ico(ICON_LOCK, 'ta-lk') + 'LOCKED</span></div>';
  }
  var html = '<div class="ta-root">' +
        '<div class="ta-scroll">' +
      '<div class="ta-rack"><div class="pv-panel pv-rivets ta-rackpanel" data-act="operator">' + figure() +
        '<span class="ta-hint ta-cap">Loadout</span></div><div class="ta-slots">' + slots + '</div></div>' +
      '<section class="pv-panel ta-card" aria-label="Ranger Rifle">' +
        '<button type="button" class="ta-head" data-act="open"><span class="pv-cell r1 ta-cell">' + rifleImg() + RPIP + '</span>' +
          '<span class="pv-grow"><span class="ta-title">Ranger Rifle</span><span class="ta-sub" style="display:block">Surplus &middot; tap for details</span></span>' +
          '<svg class="pv-ico ta-chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>' +
        '<div class="pv-bar"><div class="pv-bar__fill" style="--v:' + (v.lvl / RIFLE_MAX * 100) + '%"></div><span class="pv-bar__text">LV ' + v.lvl + ' / ' + RIFLE_MAX + '</span></div>' +
        statRow(v) + costRow(v) + upBtn(v, 'ta-main') +
      '</section>' +
      '<p class="ta-note" style="margin:0">Credits are earned by clearing rooms.</p>' +
    '</div>' + (sheetOpen ? sheet(v) : '') + '</div>';
  el.innerHTML = html;
  root = el.firstChild;
  if (lastLvl >= 0 && v.lvl > lastLvl && !V.reducedMotion) { var cell = el.querySelector('.ta-cell'); if (cell) cell.classList.add('ta-pulse'); }
  lastLvl = v.lvl;
}
function figure(){
  var u = asset(KEYS.rack);
  if (u) return '<img src="' + u + '" alt="The Operator" draggable="false">';
  return '<svg viewBox="0 0 120 200" aria-hidden="true"><defs>' + OPFIG + '</defs><use href="#taSil" fill="#0f1215" stroke="#0f1215" stroke-width="3.5" stroke-linejoin="round"/><use href="#taSil" fill="#2f3320"/><path d="M47 25H73L71 35H49Z" fill="#4cf0ff"/></svg>';
}
function sheet(v){
  return '<div class="pv-scrim ta-scrim" data-act="close" role="dialog" aria-modal="true" aria-label="Ranger Rifle details"><div class="pv-sheet ta-sheet" data-keep="1">' +
    '<div class="pv-sheet__grab"></div>' +
    '<button type="button" class="pv-btn pv-btn--ghost ta-x" data-act="close" aria-label="Close"><svg class="pv-ico" viewBox="0 0 24 24" style="font-size:22px"><path d="M5 5l14 14M19 5L5 19"/></svg></button>' +
    '<div class="ta-hd"><span class="pv-cell r1 ta-cell">' + rifleImg() + RPIP + '</span><div class="pv-grow"><div class="pv-sheet__title" style="font-size:20px;letter-spacing:.08em">Ranger Rifle</div>' +
      '<div class="pv-small" style="margin-top:6px"><span style="color:var(--pv-ui-r1);font-weight:700">Surplus</span> <span class="pv-badge pv-badge--cyan" style="margin-left:4px">Equipped</span></div>' +
      '<div class="pv-small" style="margin-top:4px">Lv ' + v.lvl + ' / ' + RIFLE_MAX + '</div></div></div>' +
    statRow(v) +
    '<div class="ta-perk"><b>Perk 1</b><span style="color:var(--pv-ui-text)">Fast round, small hitbox</span><span class="pv-badge pv-badge--olive" style="flex:none">Active</span></div>' +
    '<div class="ta-perk"><b>Perk 2</b><span>Rifle perks</span><span class="pv-badge" style="flex:none">' + ico(ICON_LOCK, 'ta-lk') + 'Locked</span></div>' +
    costRow(v) + upBtn(v, 'ta-sheetbuy') +
  '</div></div>';
}

function onClick(e){
  var t = e.target; while (t && t !== el && !(t.getAttribute && t.getAttribute('data-act'))) t = t.parentNode;
  if (!t || t === el) return;
  var act = t.getAttribute('data-act');
  if (act === 'close') { if (t.classList.contains('ta-scrim') && e.target !== t) return; closeSheet(); }
  else if (act === 'operator') { if (V.Home && V.Home.go) V.Home.go('operator'); }
  else if (act === 'open') { sheetOpen = true; render(); var x = el.querySelector('.ta-x'); if (x) x.focus(); }
  else if (act === 'buy') { var M = meta(); if (M.buy('rifle', 'rifle')) buySound(); render(); }
}
function buySound(){ var A = V.Audio; if (A && typeof A.play === 'function') { try { A.play('buy'); } catch (_) {} } }   // S-504 buy cue (audio.js F1)
function closeSheet(){ if (!sheetOpen) return; sheetOpen = false; render(); }

V.Tabs = V.Tabs || {};
V.Tabs.armory = {
  id: 'armory', title: 'Armory',
  icon: '<path d="M2 14h14l2-3h4v3h-3v2H9l-1 4H5l1-4H2z"/>', // inner markup of a 24x24 svg, stroke icon
  mount: function(host){
    el = host; injectCss('ta-base-css', BASE_CSS); injectCss('ta-armory-css', CSS + '\n.ta-pips{display:none}');
    el.addEventListener('click', onClick);
    if (!keyFn) { keyFn = function(e){ if (shown && sheetOpen && (e.key === 'Escape')) closeSheet(); }; document.addEventListener('keydown', keyFn); }
    var M = meta(); if (typeof M.onChange === 'function') unsub = M.onChange(function(){ if (shown) render(); else if (el) render(); });
    render();
  },
  show: function(){ shown = true; render(); var sc = el && el.querySelector('.ta-scroll'); if (sc) stagger('armory', sc.children); },
  hide: function(){ shown = false; sheetOpen = false; }
};
})();
