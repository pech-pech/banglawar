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
var DRONE = '<circle cx="12" cy="12" r="3"/><path d="M12 9V4M12 20v-5M9 12H4M20 12h-5M6 6l3 3M18 18l-3-3M18 6l-3 3M6 18l3-3"/>';
var MODULE = '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM2 9h3M2 15h3M19 9h3M19 15h3"/>';
var LOCKED = [
  { id: 'exo', name: 'Exo-plating', item: 'Reactive Plate', price: 850, path: '<path d="M6 4l6 2 6-2 3 4-3 3v9H6v-9L3 8z"/>' },
  { id: 'modA', name: 'Module A', item: 'Aim Module', price: 1400, path: MODULE },
  { id: 'modB', name: 'Module B', item: 'Overload Cell', price: 1700, path: MODULE },
  { id: 'droneA', name: 'Drone A', item: 'Wing Drone', price: 1700, path: DRONE },
  { id: 'droneB', name: 'Drone B', item: 'Guard Drone', price: 1950, path: DRONE }
];
var PERK2 = { id: 'perk2', name: 'Rifle perk 2', item: 'Piercing Rounds', price: 2250, path: '<path d="M3 12h14M13 7l5 5-5 5M20 4v16"/>' };
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
  '.ta-rpip{position:absolute;left:5px;bottom:5px;display:flex;gap:2px}.ta-rpip i{width:7px;height:7px;background:var(--rc,var(--pv-ui-r1));border:1px solid var(--pv-ui-ink)}',
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
  '@media (prefers-reduced-motion:reduce){.ta-pulse{animation:none}}',
  '.ta-slot{min-height:72px;min-width:72px}',
  '.ta-slot.is-empty{opacity:.8}.ta-slot.is-empty.is-afford{opacity:1}',
  '.ta-slot.is-empty .ta-slot__p{color:var(--pv-ui-text-2);gap:4px}',
  '.ta-slot.is-afford .ta-slot__p{color:#ffe27a}','.ta-slot.is-afford .ta-lk{color:#ffe27a;stroke:#ffe27a}',
  '.ta-slot.is-afford{box-shadow:inset 0 0 0 1.5px rgba(255,226,122,.6)}',
  '.ta-slot .ta-lk{margin:0;color:var(--pv-ui-text-2);stroke:var(--pv-ui-text-2)}',
  '.ta-slot.is-gear .ta-slot__n{white-space:normal;text-align:center;line-height:1.05}',
  '.ta-slot.is-gear .pv-ico{font-size:20px}',
  '.ta-perkbtn{width:100%;min-height:56px;font:inherit;text-align:left;cursor:pointer;appearance:none;border:0}',
  '.ta-perk .ta-coin,.ta-perk .ta-lk,.ta-perk .ta-slot__p{flex:none}',
  '.ta-perkbtn .ta-slot__p{margin-left:auto;gap:4px;color:var(--pv-ui-text-2)}',
  '.ta-perkbtn.is-afford .ta-slot__p{color:#ffe27a}',
  '.ta-bscrim{z-index:45}',
  '.ta-bsheet{gap:10px;padding:8px 16px 16px}',
  '.ta-bsheet .ta-x{position:absolute;top:8px;right:8px;width:56px;height:56px;padding:0;min-height:56px}',
  '.ta-bsheet .ta-hd{min-height:72px}',
  '.ta-bsheet .ta-cell{background:var(--pv-ui-metal-800,#20262c);border-radius:8px;box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-600)}',
  '.ta-bsheet .ta-cell .pv-ico{font-size:40px;color:var(--pv-ui-text-2)}',
  '.ta-bsheet .ta-lkbadge{position:absolute;right:-4px;bottom:-4px;width:26px;height:26px;border-radius:50%;background:var(--pv-ui-metal-900);display:flex;align-items:center;justify-content:center}',
  '.ta-bsheet .ta-lkbadge .pv-ico{font-size:16px;stroke:currentColor;fill:none;stroke-width:2;color:#ffe27a}',
  '.ta-bsheet .pv-btn{min-height:64px}.ta-bsheet .ta-notnow{min-height:48px}',
  '.ta-buy{font-size:17px;letter-spacing:.08em;white-space:nowrap}',
  '.ta-buy.is-arming{opacity:.6}',
  '.ta-buy.is-short{background:var(--pv-ui-metal-700);color:var(--pv-ui-text);box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-500)}',
  '.ta-shake{animation:taShake .2s linear}',
  '@keyframes taShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}',
  '.ta-brk{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0 8px}',
  '.ta-brk svg{width:96px;height:96px;overflow:visible}',
  '.ta-brk .bl,.ta-brk .br,.ta-brk .bs,.ta-brk .bk{transform-box:fill-box;transform-origin:center}',
  '.ta-brk.go .bl{animation:taBl .4s ease-in forwards}.ta-brk.go .br{animation:taBr .4s ease-in forwards}.ta-brk.go .bk{animation:taBk .4s ease-out forwards}',
  '.ta-brk.go .bs{animation:taBs .4s ease-out forwards}',
  '@keyframes taBl{to{transform:translate(-14px,10px) rotate(-18deg);opacity:0}}@keyframes taBr{to{transform:translate(14px,10px) rotate(18deg);opacity:0}}',
  '@keyframes taBk{to{transform:translate(0,-22px) rotate(25deg);opacity:0}}',
  '@keyframes taBs{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(200deg);opacity:0}}',
  '.ta-newcard{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:4px 0}',
  '.ta-newcard .ta-title{font-size:20px}',
  '.ta-newcard .ta-cell{background:var(--pv-ui-metal-800,#20262c);border-radius:8px;box-shadow:inset 0 0 0 1.5px var(--pv-ui-r1,#8aa)}',
  '.ta-newcard .pv-ico{font-size:40px}',
  '@media (prefers-reduced-motion:reduce){.ta-shake,.ta-brk.go *{animation:none}}'
].join('\n');

// Rifle ATK shown on the card. V.Meta.rifleStat(lvl) wins if META exposes it; otherwise the D4 table (Ranger Rifle 50 +8 per level).
function rifleAtk(lvl){ var M = meta(); if (typeof M.rifleStat === 'function') { var v = M.rifleStat(lvl); if (isFinite(v)) return v; } return 50 + 8 * (lvl - 1); }
function rifleCost(){ var M = meta(); try { return M.cost('rifle', 'rifle'); } catch (_) { return null; } }

// ---- buyable slots (contract CONTRACT-STEP8; local fallbacks until V.Meta.SLOTS exists) ----
function slotDefs(){
  var M = meta(), out = [], fb = {}; LOCKED.concat([PERK2]).forEach(function(d){ fb[d.id] = d; });
  var src = M.SLOTS && M.SLOTS.length ? M.SLOTS : null;
  var order = ['exo', 'modA', 'modB', 'droneA', 'droneB', 'perk2'];
  order.forEach(function(id){
    var d = fb[id], m = null;
    if (src) for (var i = 0; i < src.length; i++) if (src[i].id === id) m = src[i];
    out.push({ id: id, slot: (m && m.slot) || d.name, item: (m && m.item) || d.item, price: (m && +m.price) || d.price, path: d.path, fx: m && m.fx });
  });
  return out;
}
function slotDef(id){ var a = slotDefs(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
function gearLvl(id){ var M = meta(); try { return typeof M.gearLevel === 'function' ? (M.gearLevel(id) | 0) : 0; } catch (_) { return 0; } }
function slotWhy(id){ var M = meta(); try { if (typeof M.slotWhy === 'function') return M.slotWhy(id) || ''; } catch (_) {} return gearLvl(id) > 0 ? 'owned' : ((M.state && M.state.credits || 0) >= (slotDef(id).price) ? '' : 'credits'); }
function owned(id){ return gearLvl(id) > 0 || slotWhy(id) === 'owned'; }
function credits(){ var st = meta().state; return (st && st.credits) || 0; }
function priceTxt(n){ return n > 99999 ? Math.round(n / 1000) + 'K' : fmt(n); }
function snd(n){ var A = V.Audio; if (A && typeof A.play === 'function') { try { A.play(n); } catch (_) {} } }
function hap(ms){ if (V.haptic) { try { V.haptic(ms); } catch (_) {} } }
function upOpen(kind, id){ var U = V.UpSheet; if (U && typeof U.open === 'function') { try { U.open(kind, id); return true; } catch (_) {} } return false; }
// Buy-slot sheet state: null | { id, phase: 'ask' | 'break' | 'done', armAt, doneAt }
var bs = null, bTimer = 0, pulseId = '';

function ico(path, cls){ return '<svg class="pv-ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
var RPIP = '<span class="ta-rpip" title="Surplus" aria-label="Surplus rarity"><i></i></span>';
function rifleImg(){ return V.TabsA.rifle(64, ico(ICON_RIFLE)) || ico(ICON_RIFLE); }  // slots are 48-56 css px, so the generated rifle is allowed here
var OPFIG = '<g id="taSil"><ellipse cx="60" cy="30" rx="16" ry="18"/><rect x="53" y="44" width="14" height="14"/><path d="M40 60Q60 53 80 60L84 76L80 128L40 128L36 76Z"/><ellipse cx="38" cy="68" rx="10" ry="9"/><ellipse cx="82" cy="68" rx="10" ry="9"/><path d="M28 72L40 74L40 112L26 110Z"/><path d="M80 74L92 72L94 106L80 108Z"/><path d="M42 124L60 124L58 186L40 186L35 160Z"/><path d="M60 124L78 124L85 160L80 186L62 186Z"/><path d="M33 184L58 184L60 193L31 193Z"/><path d="M62 184L87 184L89 193L60 193Z"/><path d="M3 152L108 94L113 102L8 160Z"/></g>';

var el = null, root = null, unsub = null, shown = false, sheetOpen = false, lastLvl = -1, keyFn = null;

function view(){
  var M = meta(), st = M.state || STUB.state, lvl = Math.max(1, Math.min(RIFLE_MAX, (st.rifle && st.rifle.lvl) || 1));
  var c = rifleCost(), maxed = lvl >= RIFLE_MAX || !c, credits = st.credits || 0;
  var price = c ? c.credits : 0, bq = null; try { if (typeof M.quote === 'function') bq = M.quote('rifle', 'rifle', 'basic', {}); } catch (_) {} if (bq && bq.price > 0) price = bq.price;
  var can = !maxed && (typeof M.canBuy === 'function' ? !!M.canBuy('rifle', 'rifle') : credits >= price);
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
  return '<div class="ta-cost"><span class="ta-hint">' + (V.Meta && V.Meta.quote ? 'From' : 'Next upgrade') + '</span><span class="pv-chip pv-chip--credits' + (v.can ? '' : ' is-short') + '">' + coin(18) + fmt(v.price) + '</span></div>';
}
// P snippet 4 (pick 48): at most 2 buys per home visit. V.Meta.visitLeft() / whyNot() -> '' | 'max' | 'visit' | 'credits'.
function upBtn(v, cls){
  var us = !!(V.UpSheet && V.UpSheet.open); var label = v.maxed ? 'Max level' : us ? 'Upgrade' : 'Upgrade to Lv ' + (v.lvl + 1);
  if (us && !v.maxed) { v = Object.assign({}, v, { can: true }); }
  var note = v.maxed ? 'Rifle is at its top level.' : us ? '&nbsp;' : v.can ? '&nbsp;' : v.why === 'visit' ? 'Your buys for this visit are used. They come back after your next run.' : 'Need ' + fmt(v.short) + ' more credits';
  return (v.maxed ? '' : '<div class="ta-left">' + (us ? 'Rolls left' : 'Buys left this visit') + ': <b>' + v.left + '</b></div>') +
    '<button type="button" class="pv-btn pv-btn--primary pv-btn--block ta-up ' + (cls || '') + '" data-act="buy"' + (v.can ? '' : ' disabled') + '>' + label + '</button>' +
    '<div class="ta-note' + (!v.maxed && !v.can ? ' is-warn' : '') + '">' + note + '</div>';
}

function render(){
  if (!el) return;
  var v = view(), M = meta(), st = M.state || STUB.state;
  var slots = '<button type="button" class="pv-cell r1 ta-slot is-selected" data-act="open" aria-label="Ranger Rifle, level ' + v.lvl + ', open details">' + rifleImg() +
    '<span class="pv-lvl">Lv ' + v.lvl + '</span>' + RPIP + '<span class="ta-slot__n">Rifle</span></button>';
  for (var i = 0; i < LOCKED.length; i++) slots += slotCell(slotDef(LOCKED[i].id));
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
    '</div>' + (sheetOpen ? sheet(v) : '') + (bs ? buySheet() : '') + '</div>';
  el.innerHTML = html;
  root = el.firstChild;
  if (lastLvl >= 0 && v.lvl > lastLvl && !V.reducedMotion) { var cell = el.querySelector('.ta-cell'); if (cell) cell.classList.add('ta-pulse'); }
  lastLvl = v.lvl; pulseId = '';
}
function slotCell(d){
  if (owned(d.id)) {
    var lv = gearLvl(d.id) || 1;
    return '<button type="button" class="pv-cell r1 ta-slot is-gear' + (pulseId === d.id ? ' ta-pulse' : '') + '" data-act="gear" data-id="' + d.id + '" aria-label="' + esc(d.item) + ', level ' + lv + ', tap to upgrade">' + ico(d.path) +
      '<span class="pv-lvl">Lv ' + lv + '</span><span class="ta-slot__n">' + esc(d.item) + '</span></button>';
  }
  var aff = slotWhy(d.id) === '';
  return '<button type="button" class="pv-cell ta-slot is-empty' + (aff ? ' is-afford' : '') + '" data-act="slot" data-id="' + d.id + '" aria-label="' + esc(d.slot) + ', locked, ' + d.price + ' credits. Tap to buy">' + ico(d.path) +
    '<span class="ta-slot__n">' + esc(d.slot) + '</span><span class="ta-slot__p">' + ico(ICON_LOCK, 'ta-lk') + coin(14) + priceTxt(d.price) + '</span></button>';
}
function perk2Row(){
  var d = slotDef('perk2'), lv = gearLvl('perk2');
  if (owned('perk2')) return '<button type="button" class="ta-perk ta-perkbtn" data-act="gear" data-id="perk2"><b>Perk 2</b><span style="color:var(--pv-ui-text)">' + esc(d.item) + '</span><span class="pv-badge pv-badge--olive" style="flex:none">Lv ' + (lv || 1) + '</span></button>';
  return '<button type="button" class="ta-perk ta-perkbtn' + (slotWhy('perk2') === '' ? ' is-afford' : '') + '" data-act="slot" data-id="perk2" aria-label="Perk 2 locked, ' + d.price + ' credits. Tap to buy"><b>Perk 2</b><span>Locked</span><span class="ta-slot__p">' + ico(ICON_LOCK, 'ta-lk') + coin(14) + priceTxt(d.price) + '</span></button>';
}
var PADLOCK = '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>';
function breakSvg(){
  var sh = '', d = [[-30, -34], [30, -30], [-36, 8], [36, 12], [-14, 38], [16, 40]];
  for (var i = 0; i < 6; i++) sh += '<rect class="bs" x="46" y="50" width="6" height="6" fill="#ffe27a" style="--dx:' + d[i][0] + 'px;--dy:' + d[i][1] + 'px"/>';
  return '<svg viewBox="0 0 96 96" aria-hidden="true"><path class="bk" d="M30 46V32a18 18 0 0136 0v14" fill="none" stroke="#c9d1d8" stroke-width="7" stroke-linecap="round"/>' +
    '<path class="bl" d="M20 46h28v34H24a4 4 0 01-4-4z" fill="#ffe27a" stroke="#0f1215" stroke-width="2"/><path class="br" d="M48 46h28v30a4 4 0 01-4 4H48z" fill="#e0b73a" stroke="#0f1215" stroke-width="2"/>' + sh + '</svg>';
}
function buySheet(){
  var d = slotDef(bs.id); if (!d) return '';
  var cr = credits(), short = Math.max(0, d.price - cr), x = '<button type="button" class="pv-btn pv-btn--ghost ta-x" data-act="bclose" aria-label="Close"><svg class="pv-ico" viewBox="0 0 24 24" style="font-size:22px"><path d="M5 5l14 14M19 5L5 19"/></svg></button>';
  var head = '<div class="pv-scrim ta-scrim ta-bscrim" data-act="bclose" role="dialog" aria-modal="true" aria-label="' + (bs.phase === 'ask' ? 'Buy ' + esc(d.slot) : esc(d.item) + ' unlocked') + '"><div class="pv-sheet ta-sheet ta-bsheet" data-keep="1"><div class="pv-sheet__grab"></div>';
  if (bs.phase === 'break') return head + '<div class="ta-brk go" aria-live="polite">' + breakSvg() + '<span class="ta-hint">Unlocking</span></div></div></div>';
  if (bs.phase === 'done') return head + '<div class="ta-newcard" aria-live="polite"><span class="pv-cell r1 ta-cell">' + ico(d.path) + '</span><span class="ta-title">' + esc(d.item) + '</span>' +
      '<span class="pv-small"><span style="color:var(--pv-ui-r1);font-weight:700">Common</span> &middot; Lv 1 <span class="ta-rpip" style="position:static;display:inline-flex;margin-left:4px;vertical-align:middle"><i></i></span></span>' +
      '<span class="ta-note" style="margin-top:2px">Now in your upgrade list</span></div>' +
      '<button type="button" class="pv-btn pv-btn--primary pv-btn--block" data-act="bdone" data-keep="1">Done</button></div></div>';
  var armed = Date.now() >= bs.armAt;
  return head + x + '<div class="ta-hd"><span class="pv-cell ta-cell">' + ico(d.path) + '<span class="ta-lkbadge">' + ico(PADLOCK) + '</span></span><div class="pv-grow"><div class="pv-sheet__title" style="font-size:20px;letter-spacing:.08em">' + esc(d.slot) + '</div>' +
      '<div class="pv-small" style="margin-top:6px">Opens the ' + esc(d.item) + ' you can upgrade</div></div></div>' +
    '<button type="button" class="pv-btn pv-btn--primary pv-btn--block ta-buy' + (short ? ' is-short' : '') + (armed ? '' : ' is-arming') + '" data-act="bbuy" data-keep="1"' + (short ? ' aria-disabled="true"' : '') + '>' +
      (short ? 'Need ' + fmt(short) + ' more CR' : 'Buy for ' + fmt(d.price) + ' CR') + '</button>' +
    '<button type="button" class="pv-btn pv-btn--ghost pv-btn--block ta-notnow" data-act="bclose" data-keep="1">Not now</button></div></div>';
}
function openBuy(id){
  if (!slotDef(id) || owned(id)) return;
  bs = { id: id, phase: 'ask', armAt: Date.now() + 350 }; snd('tick'); render();
  setTimeout(function(){ if (bs && bs.phase === 'ask' && el) { var b = el.querySelector('.ta-buy'); if (b) b.classList.remove('is-arming'); } }, 360);
  var b = el && el.querySelector('.ta-buy'); if (b && b.focus) b.focus();
}
function closeBuy(){ if (!bs) return; if (bs.phase === 'break') return; if (bs.phase === 'done') pulseId = bs.id; bs = null; if (bTimer) { clearTimeout(bTimer); bTimer = 0; } render(); }
function doBuy(){
  if (!bs || bs.phase !== 'ask' || Date.now() < bs.armAt) return;
  var d = slotDef(bs.id), M = meta(), btn = el.querySelector('.ta-buy');
  if (credits() < d.price || typeof M.buySlot !== 'function') {
    snd('deny'); if (btn && !V.reducedMotion) { btn.classList.remove('ta-shake'); void btn.offsetWidth; btn.classList.add('ta-shake'); } return;
  }
  var id = bs.id; bs.phase = 'break';
  var r; try { r = M.buySlot(id); } catch (_) { r = false; }
  if (!r) { bs.phase = 'ask'; snd('deny'); render(); return; }
  snd('unlock'); hap(20); var fin = function(){ bTimer = 0; if (bs) { bs.phase = 'done'; bs.doneAt = Date.now() + 350; render(); } };
  render();
  if (V.reducedMotion) fin(); else bTimer = setTimeout(fin, 400);
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
    perk2Row() +
    costRow(v) + upBtn(v, 'ta-sheetbuy') +
  '</div></div>';
}

function onClick(e){
  var t = e.target; while (t && t !== el && !(t.getAttribute && t.getAttribute('data-act'))) t = t.parentNode;
  if (!t || t === el) return;
  var act = t.getAttribute('data-act');
  if (act === 'bclose') { if (t.classList.contains('ta-scrim') && e.target !== t) return; if (bs && bs.phase === 'done' && Date.now() < bs.doneAt) return; closeBuy(); return; }
  if (act === 'bdone') { if (bs && Date.now() < bs.doneAt) return; closeBuy(); return; }
  if (act === 'bbuy') { doBuy(); return; }
  if (act === 'slot') { openBuy(t.getAttribute('data-id')); return; }
  if (act === 'gear') { var gid = t.getAttribute('data-id'); if (sheetOpen) { sheetOpen = false; render(); } upOpen('gear', gid); return; }
  if (act === 'close') { if (t.classList.contains('ta-scrim') && e.target !== t) return; closeSheet(); }
  else if (act === 'operator') { if (V.Home && V.Home.go) V.Home.go('operator'); }
  else if (act === 'open') { sheetOpen = true; render(); var x = el.querySelector('.ta-x'); if (x) x.focus(); }
  else if (act === 'buy') { if (V.UpSheet && V.UpSheet.open) { sheetOpen = false; render(); upOpen('rifle', 'rifle'); return; } var M = meta(); if (M.buy('rifle', 'rifle')) buySound(); render(); }
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
    if (!keyFn) { keyFn = function(e){ if (shown && e.key === 'Escape') { if (bs) closeBuy(); else if (sheetOpen) closeSheet(); } }; document.addEventListener('keydown', keyFn); }
    var M = meta(); if (typeof M.onChange === 'function') unsub = M.onChange(function(){ if (shown) render(); else if (el) render(); });
    render();
  },
  show: function(){ shown = true; render(); var sc = el && el.querySelector('.ta-scroll'); if (sc) stagger('armory', sc.children); },
  hide: function(){ shown = false; sheetOpen = false; bs = null; if (bTimer) { clearTimeout(bTimer); bTimer = 0; } }
};
})();
