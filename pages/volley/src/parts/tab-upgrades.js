(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
if (typeof document === 'undefined') return;
/* Upgrades tab: three Conditioning stats (hp, atk, rate), buy button, "Training complete" result sheet.
   Reads/writes only through V.Meta. Classes: pv-* from home.css, tb-up-* are local (injected below). */

var NS = 'http://www.w3.org/2000/svg';
var STATS = [
  { id:'hp',   name:'Reinforced Frame', what:'Max HP',       cap:10, icon:'frame' },
  { id:'atk',  name:'Power Cell',       what:'Attack',       cap:10, icon:'cell' },
  { id:'rate', name:'Servo Tuning',     what:'Attack speed', cap:10, icon:'servo' }
];
var ICONS = {
  frame:'<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M12 8v7M8.5 11.5h7"/>',
  cell:'<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M10 2v2M14 2v2M13 8l-3 5h4l-3 5"/>',
  servo:'<circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  arrow:'<path d="M3 12h8M13 6l8 6-8 6z"/>'
};
function ico(name, cls){ return '<svg class="pv-ico '+(cls||'')+'" viewBox="0 0 24 24" aria-hidden="true">'+ICONS[name]+'</svg>'; }
var COIN = '<svg class="tb-coin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="#e8b020" stroke="#0f1215" stroke-width="1.5"/><circle cx="8" cy="8" r="4" fill="none" stroke="rgba(120,70,0,.55)" stroke-width=".9"/></svg>';

var COG_OLD = '<svg class="tb-cog" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="5" fill="#2f363e" stroke="#0f1215" stroke-width="1.5"/><g transform="translate(20 20)"><g fill="#8f897b" stroke="#0f1215" stroke-width="1"><rect x="-2.5" y="-13" width="5" height="5" rx="1"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(60)"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(120)"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(180)"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(240)"/><rect x="-2.5" y="-13" width="5" height="5" rx="1" transform="rotate(300)"/></g><circle r="9" fill="#b6b0a2" stroke="#0f1215" stroke-width="1.5"/><circle r="3.6" fill="#2f363e"/><path d="M0 -6.5l3 3M0 -6.5l-3 3" stroke="#e4dfd2" stroke-width="1.4" fill="none" stroke-linecap="round" transform="translate(0 -0.5)"/></g></svg>';
var CSS = '\
.tb-up{position:relative;height:100%;display:flex;flex-direction:column;color:var(--pv-ui-text);font:400 14px/1.35 var(--pv-ui-font);box-sizing:border-box;user-select:none;-webkit-tap-highlight-color:transparent}\
.tb-up *,.tb-up *::before,.tb-up *::after{box-sizing:border-box}\
.tb-up .body{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;padding:12px 12px var(--tb-bottom,98px);display:flex;flex-direction:column;gap:8px}\
.tb-up .body::-webkit-scrollbar{display:none}\
.tb-up .rule{display:flex;align-items:baseline;gap:8px;margin:0;font-size:12px;color:var(--pv-ui-text-2)}\
.tb-up .rule .n{margin-left:auto;white-space:nowrap;font:800 12px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-text);letter-spacing:.04em}\
.tb-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}\
.tl{position:relative;min-height:132px;padding:10px 8px 8px;display:flex;flex-direction:column;align-items:flex-start;gap:4px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-800));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),inset 0 -2px 0 rgba(0,0,0,.35),0 2px 0 rgba(0,0,0,.55)}\
.tl.mx{border-color:var(--pv-ui-r5);box-shadow:inset 0 0 0 1px var(--pv-ui-r5),0 0 8px rgba(224,169,58,.35)}\
.tl.mx .pv-bar__fill{background:linear-gradient(#f3d27a,var(--pv-ui-r5))}\
.tb-ti{width:36px;height:36px;flex:none;display:flex;align-items:center;justify-content:center;font-size:24px;background:var(--pv-ui-ink);border-radius:4px;color:var(--pv-ui-cyan);box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-500);overflow:hidden}\
.tb-ti img{width:30px;height:30px;object-fit:contain}\
.tl .tn{font:800 11px/1.05 var(--pv-ui-font-stencil);text-transform:uppercase;letter-spacing:.05em;min-height:23px}\
.tl .tv{font:800 11px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-sand)}\
.tl .fx{font:800 11px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-text-2)}\
.tl .pv-bar{width:100%;height:10px;margin-top:auto}\
.tb-pn{padding:10px 12px;display:flex;align-items:center;gap:12px}.tb-pn .tx{flex:1;min-width:0}.tb-cog{flex:none;width:40px;height:40px}.tb-buy .tb-coin{width:18px;height:18px}.tb-pn .r{display:flex;align-items:center}.tb-pn .cr{margin-left:auto;font:800 20px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-sand);display:inline-flex;align-items:center;gap:6px}\
.tb-pn .sm{font-size:12px;color:var(--pv-ui-text-2);margin-top:6px}\
.tb-buy{justify-content:space-between;padding:0 20px;min-height:68px;width:100%}\
.tb-buy .cost{display:inline-flex;align-items:center;gap:6px;font:800 18px/1 var(--pv-ui-font-stencil);letter-spacing:.04em}\
.tb-buy.pv-btn--primary{min-height:68px;font-size:20px;letter-spacing:.18em}\
.tb-spacer{flex:1;min-height:0}\
.tb-res{position:absolute;inset:0;z-index:50;display:flex;align-items:flex-start;justify-content:center;background:rgba(5,7,9,.78);padding:70px 20px 0}\
.tb-res .card{width:100%;padding:16px 16px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-900));border:2.5px solid var(--pv-ui-ink);border-radius:10px;box-shadow:0 0 0 1.5px var(--pv-ui-cyan-lo),0 0 28px rgba(56,232,255,.35),0 4px 10px rgba(0,0,0,.6)}\
.tb-res .big{width:104px;height:104px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:radial-gradient(circle at 50% 35%,#0e4b57,var(--pv-ui-metal-900) 80%);border:2.5px solid var(--pv-ui-ink);border-radius:8px;box-shadow:inset 0 0 0 2px var(--pv-ui-cyan),0 0 22px rgba(56,232,255,.65),0 0 48px rgba(56,232,255,.25);color:var(--pv-ui-cyan)}\
.tb-res .big .pv-ico{font-size:46px}.tb-res .big img{width:56px;height:56px;object-fit:contain}\
.tb-res .big b{text-align:center;padding:0 6px;font:800 11px/1 var(--pv-ui-font-stencil);letter-spacing:.14em;color:var(--pv-ui-text);text-transform:uppercase}\
.tb-res .plus{font:800 28px/1 var(--pv-ui-font-stencil);letter-spacing:.14em;color:var(--pv-ui-cyan);text-shadow:0 0 12px rgba(56,232,255,.6)}\
.tb-res .ba{display:flex;align-items:center;gap:10px;width:100%;justify-content:center}\
.tb-res .bx{flex:1;text-align:center;padding:8px 4px;background:var(--pv-ui-ink);border-radius:4px;border:1px solid var(--pv-ui-metal-600)}\
.tb-res .bx small{display:block;font:700 11px/1 var(--pv-ui-font-stencil);letter-spacing:.12em;color:var(--pv-ui-text-3);text-transform:uppercase;margin-bottom:5px;white-space:nowrap}\
.tb-res .bx span{font:800 19px/1 var(--pv-ui-font-stencil);white-space:nowrap}\
.tb-res .bx.af span{color:var(--pv-ui-cyan)}\
.tb-res .ba>.pv-ico{color:var(--pv-ui-cyan);font-size:22px}\
.tb-res .pv-btn{width:100%;min-height:56px}\
.tb-note{font-size:12px;color:var(--pv-ui-text-2);text-align:center;min-height:16px;margin:0}\
.tb-note.is-warn{color:var(--pv-ui-text-3)}';

function injectCss(){
  if (document.getElementById('tb-up-css')) return;
  var s = document.createElement('style'); s.id = 'tb-up-css'; s.textContent = CSS; document.head.appendChild(s);
}

/* local stub, used only when V.Meta is missing */
var stub = null;
function M(){
  if (V.Meta) return V.Meta;
  if (!stub) stub = { state:{ credits:0, cond:{hp:0,atk:0,rate:0}, settings:{sound:true,haptics:true}, codex:{seen:{}}, runs:[], best:0 },
    cost:function(){ return {credits:100}; }, canBuy:function(){ return false; }, buyRandom:function(){ return false; },
    stats:function(){ return {hpAdd:0, atkMul:1, rateMul:1}; }, onChange:function(){}, power:1 };
  return stub;
}

function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
function pct(m){ return '+' + Math.round((m - 1) * 100) + '%'; }
function effectOf(id, st){
  st = st || {};
  if (id === 'hp') return '+' + fmt(st.hpAdd || 0) + ' HP';
  if (id === 'atk') return pct(st.atkMul || 1) + ' ATK';
  return pct(st.rateMul || 1) + ' SPEED';
}
function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function level(id){ var c = M().state && M().state.cond; return (c && c[id]) | 0; }
function capOf(s){ var m = M(); return (m.maxLevel && m.maxLevel('cond', s.id)) || s.cap; }
function iconBox(s, withAsset){
  return ico(s.icon);
}

var T = V.Tabs = V.Tabs || {};
var root = null, body = null, mounted = false, unsub = false, sheet = null;

function cap(){ var t = 0; STATS.forEach(function(s){ t += capOf(s); }); return t; }
function nextCost(){
  var m = M(), c = null;
  if (m.nextPrice) { var p = m.nextPrice('cond'); return p == null ? null : { credits: p }; }
  if (m.cost) c = m.cost('cond', 'rand');
  return c;
}
function render(){
  if (!root) return;
  var m = M(), st = m.state || {};
  var stats = m.stats ? m.stats() : {};
  var total = 0;
  body.innerHTML = '';
  STATS.forEach(function(s){ total += level(s.id); });
  var rule = el('p', 'rule');
  rule.innerHTML = 'Trains one random stat.<span class="n">' + total + ' / ' + cap() + ' bought</span>';
  body.appendChild(rule);
  var g = el('div', 'tb-grid3');
  STATS.forEach(function(s){
    var lv = level(s.id), cp = capOf(s), max = lv >= cp;
    var t = el('div', 'tl' + (max ? ' mx' : ''));
    t.id = 'tb-' + s.id;
    t.innerHTML = '<div class="tb-ti">' + iconBox(s, true) + '</div><div class="tn">' + s.name + '</div>' +
      '<div class="tv">' + (max ? 'MAX' : 'Lv ' + lv + ' / ' + cp) + '</div><div class="fx">' + effectOf(s.id, stats) + '</div>' +
      '<div class="pv-bar"><div class="pv-bar__fill" style="--v:' + Math.min(100, Math.round(lv / cp * 100)) + '%"></div></div>';
    g.appendChild(t);
  });
  body.appendChild(g);
  var c = nextCost(), all = !c;
  var pn = el('div', 'pv-panel tb-pn');
  pn.innerHTML = (V.TabsA ? V.TabsA.cog(40) : COG_OLD) + '<div class="tx"><div class="r"><span class="pv-stencil pv-muted">Next upgrade</span>' + (all ? '<span class="cr">ALL MAXED</span>' : '<span class="cr">' + fmt(c ? c.credits : 0) + ' CR</span>') + '</div>' +
    '<div class="sm">' + (all ? 'Every stat is at its cap.' : 'Upgrades one random stat that is not maxed.') + '</div></div>';
  body.appendChild(pn);
  body.appendChild(el('div', 'tb-spacer'));
  var can = !all && c && m.canBuy && m.canBuy('cond', 'rand');
  var btn = el('button', 'pv-btn tb-buy ' + (can ? 'pv-btn--primary' : ''));
  btn.type = 'button'; btn.setAttribute('data-buy', 'cond');
  if (all) btn.innerHTML = '<span class="lbl">Maxed</span>';
  else btn.innerHTML = '<span class="lbl">Upgrade</span><span class="cost">' + COIN + fmt(c ? c.credits : 0) + '</span>';
  if (!can) { btn.className += ' is-disabled'; btn.disabled = true; }
  btn.addEventListener('click', buy);
  body.appendChild(btn);
  // QA-HOME 12: same hint as the Armory (tab-armory.js upBtn / .ta-note): grey, never red.
  var short = (!all && c && !can) ? Math.max(0, (c.credits | 0) - (st.credits | 0)) : 0;
  body.appendChild(el('div', 'tb-note' + (short > 0 ? ' is-warn' : ''), short > 0 ? 'Need ' + fmt(short) + ' more credits' : '&nbsp;'));
}

function buy(){
  var m = M();
  if (!(m.canBuy && m.canBuy('cond', 'rand'))) return;
  var before = m.stats ? m.stats() : {}, lv = {};
  STATS.forEach(function(s){ lv[s.id] = level(s.id); });
  var id = m.buyRandom ? m.buyRandom('cond') : false;
  if (!id) return;
  var s = STATS.filter(function(x){ return x.id === id; })[0];
  if (!s) return;
  showSheet(s, before, m.stats ? m.stats() : {}, lv[id], level(id));
}

function showSheet(s, before, after, lb, la){
  closeSheet();
  var r = el('div', 'tb-res'); r.setAttribute('role', 'dialog'); r.setAttribute('aria-label', 'Training complete');
  r.innerHTML = '<div class="card"><div class="pv-stencil pv-muted">Training complete</div>' +
    '<div class="big">' + iconBox(s, false) + '<b>' + s.name + '</b></div>' +
    '<div class="plus">+1 LEVEL</div>' +
    '<div class="ba"><div class="bx"><small>Before &middot; Lv ' + lb + '</small><span>' + effectOf(s.id, before) + '</span></div>' + ico('arrow') +
    '<div class="bx af"><small>After &middot; Lv ' + la + '</small><span>' + effectOf(s.id, after) + '</span></div></div>' +
    '<button type="button" class="pv-btn pv-btn--primary" data-continue>Continue</button></div>';
  r.querySelector('[data-continue]').addEventListener('click', closeSheet);
  root.appendChild(r); sheet = r;
}
function closeSheet(){ if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet); sheet = null; }

T.upgrades = {
  id: 'upgrades', title: 'Upgrades', icon: 'upgrades',
  mount: function(host){
    injectCss();
    root = el('div', 'tb-up');
    body = el('div', 'body');
    root.appendChild(body);
    host.innerHTML = ''; host.appendChild(root);
    mounted = true;
    if (!unsub && M().onChange) { M().onChange(function(){ if (mounted) render(); }); unsub = true; }
    render();
  },
  show: function(){ if (root) render(); },
  hide: function(){ closeSheet(); }
};
})();
