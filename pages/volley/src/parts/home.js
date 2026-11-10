(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// HOME SHELL (LIAISON-ASSETS). Owns: the status bar, the 5-tab bar, the tab router, the Deploy tab, and the show/hide handoff with the run.
//
// V.ASSETS (set by build.py in an inline script before the parts load): key -> webp data URI. Keys:
//   keyart (key-art-card 656x432 = 328x216 css), portrait (344x460, Operator panel), portrait-kneesup (344x454, results/rack), coin (64),
//   rifle (192, only at 48 css px and up), shield-cell (R-07, unused), operator (192 head, 40 px ok, never 96+), cog (192, 56 px and up; smaller is inline SVG). All final cut-outs from openart/final/ (tools/optimize-assets.py).
//   Aliases P-02 P-05 P-08 R-10 key-art-card are added by build.py. Held: shield cell, helmet, key-art-fold. Tabs fall back to a drawn shape if a key is missing.
// V.Tabs[id] = {id, title, mount(el), show(), hide()}  ids: armory | operator | deploy | upgrades | intel. Deploy is defined here.
// V.Home = {show(tab), hide(), go(id), pip(id, on), visible(), current}.  V.Run (main.js) = {setHome(on), start(), home}.
var $ = function(id){ return document.getElementById(id); };
V.Tabs = V.Tabs || {};
var ORDER = ['armory', 'operator', 'deploy', 'upgrades', 'intel'];
var TITLES = { armory: 'Armory', operator: 'Operator', deploy: 'Deploy', upgrades: 'Upgrades', intel: 'Intel' };
var GLYPH = { armory: 'rf', operator: 'op', deploy: 'dp', upgrades: 'up', intel: 'in' };   // kit symbols in the game.html sprite
var A = function(k){ return (V.ASSETS && V.ASSETS[k]) || ''; };
var Home = V.Home = { current: 'deploy' };
var root, body, bar, panes = {}, mounted = {}, tabBtns = {}, vis = true, crN, crIcon;

function fmt(n){ return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
var CH_LEN = 10;   // Chapter 1 stage count (P1 shows best / 10). QA-HOME 11: best is clamped to this.
function chLen(){ var st = V.Data && V.Data.stages, c = st && st.ch1; return (Array.isArray(c) && c.length > 0) ? c.length : CH_LEN; }   // V.Data from agent B's data-stages.js
function meta(){ return V.Meta && V.Meta.state; }

// ---- Deploy tab (S-10, minimal): Chapter 1 card with the key art, big DEPLOY, "Run starts at Stage 1" ----
V.Tabs.deploy = {
  id: 'deploy', title: 'Deploy',
  mount: function(el){
    el.innerHTML =
      '<div class="pv-chapter hm-card"><div class="pv-chapter__art"><img alt="" decoding="async"></div>' +
      '<div class="hm-info"><span class="pv-badge pv-badge--cyan">Ch 1</span><div class="pv-chapter__title">Outer Perimeter</div>' +
      '<div class="pv-small pv-num">10 stages</div></div></div>' +
      '<div class="pv-panel pv-panel--inset hm-best"><span class="pv-stencil pv-muted">Best stage</span><span class="pv-num hm-bestn">-</span></div>' +
      '<button class="pv-btn pv-btn--primary hm-deploy" id="btnDeploy">Deploy</button>' +
      '<div class="pv-stencil pv-muted hm-note">Run starts at Stage 1</div>';
    var img = el.querySelector('img'); if (A('keyart')) img.src = A('keyart'); else img.remove();
    el.querySelector('#btnDeploy').addEventListener('click', function(){ if (V.Run) V.Run.start(); Home.hide(); });
    this.el = el;
  },
  show: function(){
    var m = meta(), n = this.el.querySelector('.hm-bestn');
    var len = chLen(), best = Math.max(0, Math.min(len, (m && m.best) | 0));
    n.innerHTML = fmt(best) + '<span class="pv-muted"> / ' + len + '</span>';
  },
  hide: function(){}
};

// ---- chrome ----
function build(){
  root = $('home'); if (!root) return;
  root.innerHTML = '';
  var st = document.createElement('header'); st.className = 'pv-status';
  st.innerHTML = '<span class="pv-status__title" id="hmTitle">Deploy</span>' +
    '<span class="pv-chip pv-chip--credits" id="hmCr" aria-label="Credits"><span class="pv-coin pv-chip__icon" aria-hidden="true"></span><b id="hmCrN">0</b></span>';
  crN = st.querySelector('#hmCrN');
  root.appendChild(st);
  body = document.createElement('div'); body.id = 'hmBody'; root.appendChild(body);
  bar = document.createElement('nav'); bar.className = 'pv-tabbar'; bar.setAttribute('aria-label', 'Home tabs');
  ORDER.forEach(function(id){
    var p = document.createElement('div'); p.className = 'hm-pane'; p.id = 'pane-' + id; p.hidden = true; body.appendChild(p); panes[id] = p;
    var b = document.createElement('button'); b.className = 'pv-tab' + (id === 'deploy' ? ' pv-tab--center' : ''); b.dataset.tab = id;
    b.innerHTML = '<svg class="pv-ico pv-tab__icon"><use href="#' + GLYPH[id] + '"/></svg><span class="pv-tab__label">' + TITLES[id] + '</span><span class="pv-pip" hidden></span>';
    b.addEventListener('click', function(){ Home.go(id); });
    bar.appendChild(b); tabBtns[id] = b;
  });
  root.appendChild(bar);
  if (V.Meta && V.Meta.onChange) V.Meta.onChange(function(){ refreshCredits(); refreshPips(); });
}
function refreshCredits(){ var m = meta(); if (crN) crN.textContent = fmt(m ? m.credits : 0); }
// QA-HOME 8: a dot on a tab when a buy there is affordable (FIX B3: one dot, never a number, never on the selected tab).
// Armory = rifle upgrade (QA-HOME 8 recommended option); Upgrades = the next Conditioning buy (QA option 2).
var PIPS = { armory: ['rifle', 'rifle'], upgrades: ['cond', 'rand'] };
function refreshPips(){
  var M = V.Meta; if (!M || typeof M.canBuy !== 'function') return;
  for (var id in PIPS) { var on = false; try { on = !!M.canBuy(PIPS[id][0], PIPS[id][1]); } catch (e) {} Home.pip(id, on); }
}

Home.go = function(id){
  if (ORDER.indexOf(id) < 0) id = 'deploy';
  var prev = Home.current;
  if (prev !== id && mounted[prev] && V.Tabs[prev] && V.Tabs[prev].hide) V.Tabs[prev].hide();
  Home.current = id;
  ORDER.forEach(function(k){ panes[k].hidden = k !== id; tabBtns[k].classList.toggle('is-selected', k === id); });
  if (!mounted[id]) {
    mounted[id] = true; var t = V.Tabs[id], el = panes[id];
    if (t && t.mount) { try { t.mount(el); } catch (e) { console.warn('volley: tab ' + id + ' mount failed', e); el.textContent = TITLES[id]; } }
    else { el.innerHTML = '<div class="pv-panel hm-soon"><span class="pv-stencil pv-muted">' + TITLES[id] + ' arrives with the next build</span></div>'; }
  }
  var t2 = V.Tabs[id]; if (t2 && t2.show) { try { t2.show(); } catch (e) { console.warn('volley: tab ' + id + ' show failed', e); } }
  var pip = tabBtns[id].querySelector('.pv-pip'); if (pip) pip.hidden = true;   // pips never sit on the selected tab
  $('hmTitle').textContent = TITLES[id]; refreshCredits(); refreshPips();
};
Home.refreshPips = refreshPips;
Home.fmt = fmt;   // home-side number formatter (thousands separators); the sim never formats
Home.pip = function(id, on){ var p = tabBtns[id] && tabBtns[id].querySelector('.pv-pip'); if (p) p.hidden = !on || id === Home.current; };
Home.visible = function(){ return vis; };
Home.show = function(tab){
  vis = true; if (root) root.classList.add('on');
  if (V.Run) V.Run.setHome(true);
  Home.go(tab || 'deploy'); if (V.UI) V.UI.syncOverlay();
};
Home.hide = function(){
  vis = false; if (root) root.classList.remove('on');
  if (V.Run) V.Run.setHome(false);
  if (V.UI) V.UI.syncOverlay();
};


function init(){
  build();
  // F0 save rules: tell the player once when progress was reset or cannot be kept.
  setTimeout(function(){ var M = V.Meta, U = V.UI; if (!M || !U || !U.toast) return;
    if (M.storageOk === false) U.toast(M.BLOCKED_LINE, 3200); else if (M.resetSignal) U.toast(M.RESET_LINE, 3200); }, 400);
  var p = $('resPortrait'); if (p) { if (A('portrait-kneesup') || A('portrait')) p.src = A('portrait-kneesup') || A('portrait'); else p.style.display = 'none'; }
  if (/[?&]home=0/.test(G.location.search)) { vis = false; root.classList.remove('on'); Home.current = 'deploy'; go0(); }
  else Home.show('deploy');
}
function go0(){ /* mount nothing until first shown */ }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
