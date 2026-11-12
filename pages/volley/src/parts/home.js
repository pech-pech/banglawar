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
function chLen(){ if (V.chapterLen) return V.chapterLen(1); var st = V.Data && V.Data.stages, c = st && st.ch1; return (Array.isArray(c) && c.length > 0) ? c.length : CH_LEN; }   // V.chapterLen (meta.js) honours ?chlen   // V.Data from agent B's data-stages.js
function meta(){ return V.Meta && V.Meta.state; }

// ---- Deploy roll (picks 25-27; 02 T16, 05 3.10) ----
// The roll lives in V.Mods.Deploy (mods.js, pure). This part owns the screen, the one paid reroll, the save key and the hand-off to the run.
// Save: its own key 'volley.deploy.v1' (seed, reroll used, started) so volley.save.v2 and its fuzz test are untouched; every storage call is guarded.
// The roll and the reroll state are saved the moment they happen (05 3.10 Rules), so Back, a reload or a new Deploy tap shows the same boost.
var DKEY = 'volley.deploy.v1', GUARD_MS = 350, REVEAL_MS = 1500;   // 350 = 05 3.10 START guard; 1500 = "about 1.5 s" (guess in the spec)
var KIND_GLYPH = { combat: '✦', earning: '¢', head: '»' };   // text glyphs, U+FE0E appended where drawn (code-drawn per 06 K4)
var dep = { st: null, el: null, armAt: 0, revealing: false, timer: 0, confirmT: 0, press: 0, shake: 0 };
function DP(){ return V.Mods && V.Mods.Deploy; }
function nowMs(){ return (G.performance && performance.now) ? performance.now() : Date.now(); }
function lsGet(){ try { return G.localStorage ? G.localStorage.getItem(DKEY) : null; } catch (e) { return null; } }
function lsSet(t){ try { if (G.localStorage) G.localStorage.setItem(DKEY, t); } catch (e) {} }
function depSave(){ if (dep.st && DP()) lsSet(DP().encode(dep.st)); }
function newSeed(){ var m = meta(); return ((Date.now() >>> 0) ^ Math.imul(((m && m.runSeq) | 0) + 1, 0x9E3779B1)) >>> 0; }
// Settle the last deploy: a run that began after the roll and reached stage 3 or later spends it; earlier keeps roll and reroll state.
function depSettle(){
  var D = DP(); if (!D || !dep.st || !dep.st.started) return;
  var m = meta(), runs = (m && m.runs) || [], stage = 0, since = dep.st.startT || 0;
  for (var i = 0; i < runs.length; i++) if (runs[i].t >= since) { stage = runs[i].stage | 0; break; }
  var keep = D.afterRun(dep.st, stage);
  if (!keep) dep.st = null; else dep.st.startT = 0;
  depSave();
}
function depLoad(){
  var D = DP(); if (!D) return null;
  if (!dep.st) { var raw = lsGet(); dep.st = raw ? D.decode(raw) : null; }
  depSettle();
  if (!dep.st) { dep.st = D.make(newSeed()); dep.fresh = true; depSave(); }
  return dep.st;
}
function creditsNow(){ var m = meta(); return m ? m.credits | 0 : 0; }
function costNow(){ var D = DP(); return D ? D.rerollCost(1) : 20; }   // chapter 1; Roll Discount (T-08) is not built, so no halving yet
// V.Meta.spend(n, label) is requested from agent P; until it exists the shell takes the Credits from the public state and saves.
function spend(n){
  var M = V.Meta; if (!M || !M.state) return false;
  if (M.spend) return !!M.spend(n, 'Deploy reroll');
  if (M.state.credits < n) return false;
  M.state.credits -= n; if (M.save) M.save();
  return true;
}
function pipsText(n){ var o = ''; for (var i = 0; i < 3; i++) o += i < n ? '●' : '○'; return o; }
var DEP_CSS = '' +
  '.hm-roll{flex:none;padding:8px 10px;display:flex;flex-direction:column;gap:6px;margin-top:8px;border-radius:var(--pv-ui-r-md,10px)}' +
  '.hm-roll .hr-top{display:flex;justify-content:space-between;align-items:center;font-size:12px;letter-spacing:.08em;min-height:16px}' +
  '.hm-roll .hr-pips{font-size:14px;letter-spacing:2px;color:var(--pv-ui-sand,#e8d9a8)}' +
  '#pane-deploy .pv-stencil,#pane-deploy .pv-badge{font-size:12px}' +      // no text under 12 px (the base kit uses 11) +
  '.hm-roll .hr-row{display:flex;align-items:center;gap:10px;min-height:56px}' +
  '.hm-roll .hr-gl{flex:none;width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:700 22px system-ui,sans-serif;background:#11262a;border:1px solid #2a6a74;color:var(--pv-ui-cyan,#4fd8e6)}' +
  '.hm-roll .hr-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}' +
  '.hm-roll .hr-kind{font-size:12px;color:var(--pv-ui-text-2,#a9b2b8);text-transform:uppercase;letter-spacing:.06em}' +
  '.hm-roll .hr-name{font-size:16px;line-height:1.15}' +
  '.hm-roll .hr-eff{font-size:13px;line-height:1.2;color:var(--pv-ui-sand,#e8d9a8)}' +
  '.hm-roll .hr-rr{flex:none;width:112px;min-width:112px;height:56px;min-height:56px;padding:4px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font:800 13px/1.1 var(--pv-ui-font-stencil);letter-spacing:.08em;text-transform:uppercase;white-space:normal;text-align:center}' +
  '.hm-roll .hr-rr .rr-cost{display:inline-flex;align-items:center;gap:4px;color:var(--pv-cost,#f4c21a);font-variant-numeric:tabular-nums;letter-spacing:.04em}' +
  '.hm-roll .hr-rr .rr-cost .pv-coin{width:16px;height:16px}' +
  '.hm-roll .hr-rr.is-off{background:transparent;border:1px dashed #5b6166;box-shadow:none;color:#8a9399;cursor:default;opacity:1}' +
  '.hm-roll .hr-rr.is-off .rr-cost{color:#8a9399}' +
  '.hm-roll .hr-rr.is-short .rr-cost{color:var(--pv-cost,#f4c21a)}' +
  // Fixed heights so a reroll never changes the card (D13): name one line, effect two lines, pips one line.
  '.hm-roll{align-self:start;font-family:var(--pv-ui-font-stencil)}' +
  '.hm-roll .hr-top{height:18px}.hm-roll .hr-top,.hm-roll .hr-pips{white-space:nowrap}' +
  '.hm-roll .hr-tx{min-height:56px}.hm-roll .hr-name,.hm-roll .hr-eff,.hm-roll .hr-kind,.hm-roll .hr-line{font-family:var(--pv-ui-font-stencil)}' +
  '.hm-roll .hr-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.06em}' +
  '.hm-roll .hr-eff{height:2.4em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
  '.hm-roll .hr-line{font-size:12px;line-height:1.25;height:1.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--pv-ui-text-2,#a9b2b8)}' +
  '.hm-roll.t1{border-color:#4fd8e6}.hm-roll.t2{border-color:#ffd25a;box-shadow:0 0 10px rgba(255,210,90,.35)}' +
  '.hm-roll.shake{animation:hrShake .3s}@keyframes hrShake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}' +
  '.hm-roll.rolling .hr-name,.hm-roll.rolling .hr-eff{opacity:.7}' +
  '@media (prefers-reduced-motion:reduce){.hm-roll.shake{animation:none}}' +
  // The roll block takes about 150 px of the column: the art gives it back (the base rule reserves 191 px for the rest).
  '#pane-deploy>*{--art-h:max(96px,min(calc(var(--col-w) * .94),calc(100cqh - 191px - 150px - var(--dep-h))))}' +
  '#pane-deploy>.hm-roll{margin-left:auto;margin-right:auto}' +
  // Short screens (475x590 and the like): the one-line note goes and the art may shrink to a strip, so DEPLOY stays above the tab bar.
  '.h-short .hm-roll .hr-line{display:none}' +
  '.h-short .hm-roll{min-height:0}' +
  '.h-short #pane-deploy>*{--art-h:max(0px,min(calc(var(--col-w) * .94),calc(100cqh - 191px - 126px - var(--dep-h))))}';
function depPaint(){
  var D = DP(), el = dep.el; if (!el || !D || !dep.st) return;
  var box = el.querySelector('.hm-roll'), st = dep.st, info = D.info(st.boost), rr = box.querySelector('.hr-rr');
  box.className = 'pv-panel pv-panel--inset hm-roll t' + (info.pips - 1) + (dep.revealing ? ' rolling' : '');
  box.querySelector('.hr-kind').textContent = info.kindName;
  box.querySelector('.hr-name').textContent = info.name;
  box.querySelector('.hr-eff').textContent = info.text;
  box.querySelector('.hr-gl').textContent = (KIND_GLYPH[info.kind] || '?') + '︎';
  var pe = box.querySelector('.hr-pips'); pe.textContent = pipsText(info.pips) + ' ' + info.tierName; pe.setAttribute('aria-label', info.tierName + ', level ' + info.pips + ' of 3');
  var cost = costNow(), cr = creditsNow(), label, off = false;
  var COIN = '<span class="pv-coin" aria-hidden="true"></span>', costHtml = '<span class="rr-cost">' + COIN + '<b>' + cost + '</b></span>', short = false, dead = false;
  if (st.used) { label = '<span>Used</span>'; off = true; dead = true; }
  else if (dep.revealing) { label = '<span>Rolling</span>'; off = true; dead = true; }
  else if (dep.confirmT && nowMs() < dep.confirmT) label = '<span>Replace ' + info.tierName + '?</span><span>Tap again</span>';
  else if (cr < cost) { label = '<span>Reroll</span><span class="rr-cost">' + COIN + '<b>' + cost + '</b></span>'; off = true; short = true; rr.setAttribute('aria-label', 'Reroll, need ' + (cost - cr) + ' more Credits'); }
  else label = '<span>Reroll</span>' + costHtml;
  if (!short) rr.setAttribute('aria-label', st.used ? 'Reroll used' : (dep.revealing ? 'Rolling' : 'Reroll for ' + cost + ' Credits'));
  var hl = box.querySelector('.hr-line'); if (hl) hl.textContent = st.used ? 'Reroll used for this deploy.' : (short ? 'Need more Credits to reroll.' : 'A reroll may roll lower.');   // N3: the hint line is always there
  rr.innerHTML = label; rr.disabled = false; rr.classList.toggle('is-dim', off); rr.classList.toggle('is-off', dead); rr.classList.toggle('is-short', short); rr.setAttribute('aria-disabled', off ? 'true' : 'false');
  rr.style.opacity = (off && !dead) ? '.6' : '';
  var go = el.querySelector('#btnDeploy'); if (go) { var armed = nowMs() >= dep.armAt && !dep.revealing; go.classList.toggle('is-waiting', !armed); go.style.opacity = armed ? '' : '.6'; }
}
// Scanner sweep (N7, not a wheel): the name cycles for about 1.5 s and settles on the roll; a tap on the card skips to the result.
function depReveal(){
  var D = DP(); if (!D) return;
  clearInterval(dep.timer);
  if (V.reducedMotion) { dep.revealing = false; dep.armAt = nowMs() + GUARD_MS; depPaint(); return; }
  dep.revealing = true; dep.armAt = nowMs() + REVEAL_MS + GUARD_MS;
  var open = D.open(), k = 0, t0 = nowMs(), box = dep.el.querySelector('.hm-roll');
  depPaint();
  dep.timer = setInterval(function(){
    if (nowMs() - t0 >= REVEAL_MS) return depLand();
    var b = open[(k++) % open.length]; box.querySelector('.hr-name').textContent = b.name; box.querySelector('.hr-eff').textContent = 'Rolling...';
  }, 90);
  setTimeout(function(){ depPaint(); }, REVEAL_MS + GUARD_MS + 20);
}
function depLand(){ clearInterval(dep.timer); if (!dep.revealing) return; dep.revealing = false; dep.armAt = nowMs() + GUARD_MS; depPaint(); setTimeout(depPaint, GUARD_MS + 20); }
function depReroll(){
  var D = DP(), st = dep.st; if (!D || !st || dep.revealing || st.used) return;
  var cost = costNow(), info = D.info(st.boost);
  if (creditsNow() < cost) { var b = dep.el.querySelector('.hm-roll'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }   // a tap shakes
  if (info.pips === 3 && !(dep.confirmT && nowMs() < dep.confirmT)) { dep.confirmT = nowMs() + 3000; depPaint(); setTimeout(depPaint, 3050); return; }   // Elite asks first (T16)
  dep.confirmT = 0;
  if (!spend(cost)) { depPaint(); return; }
  D.reroll(st); depSave(); depReveal();
  if (V.Audio && V.Audio.play) { try { V.Audio.play('reroll'); } catch (e) {} }
}
function depStart(pressT){
  var D = DP();
  if (dep.revealing || pressT < dep.armAt) return;   // armed only after the reveal plus 350 ms, and only for a press that began after (05 3.10)
  if (D && dep.st) { dep.st.started = true; dep.st.startT = Date.now(); depSave(); }
  if (V.Run) V.Run.start();
  var pv = G.__pv, S = pv && pv.S;
  if (D && S && dep.st) D.attach(S, dep.st.boost);   // the sim reads S.deploy on its first step (G-REPORT sim snippets)
  Home.hide();
  if (V.UI && V.UI.toast && D && dep.st) { var i = D.info(dep.st.boost); V.UI.toast(i.name + ': ' + i.text, 2000); }
}
Home.deploy = { forget: function(){ dep.st = null; clearInterval(dep.timer); dep.revealing = false; },   // P's M.reset calls this so Reset save clears the live roll
  state: function(){ return dep.st; }, paint: function(){ depLoad(); depPaint(); } };
// Press time of the last pointer-down on a Deploy control (a click with no press, such as a keyboard or test click, counts as now).
function pressOf(e){ return (e && e.detail === 0) ? nowMs() : (dep.press || nowMs()); }

// ---- Deploy tab: Chapter 1 card with the key art, best stage, the Deploy roll, big DEPLOY ----
V.Tabs.deploy = {
  id: 'deploy', title: 'Deploy',
  mount: function(el){
    var sty = document.createElement('style'); sty.id = 'pvDeployCss'; sty.textContent = DEP_CSS; document.head.appendChild(sty);
    el.innerHTML =
      '<div class="pv-chapter hm-card"><div class="pv-chapter__art"><img alt="" decoding="async"></div>' +
      '<div class="hm-info"><span class="pv-badge pv-badge--cyan">Ch 1</span><div class="pv-chapter__title">Outer Perimeter</div>' +
      '<div class="pv-small pv-num hm-len">10 stages</div></div></div>' +
      '<div class="pv-panel pv-panel--inset hm-best"><span class="pv-stencil pv-muted">Best stage</span><span class="pv-num hm-bestn">-</span></div>' +
      '<div class="pv-panel pv-panel--inset hm-roll" aria-live="polite"><div class="hr-top"><span class="pv-stencil pv-muted">Deploy roll</span><span class="hr-pips"></span></div>' +
      '<div class="hr-row"><span class="hr-gl" aria-hidden="true"></span><div class="hr-tx"><span class="hr-kind"></span><b class="hr-name"></b><span class="hr-eff"></span></div>' +
      '<button class="pv-btn pv-btn--secondary hr-rr" type="button"></button></div>' +
      '<div class="hr-line">Every roll is a boost. A reroll may roll lower.</div></div>' +
      '<button class="pv-btn pv-btn--primary hm-deploy" id="btnDeploy">Deploy</button>' +
      '<div class="pv-stencil pv-muted hm-note">Run starts at Stage 1</div>';
    var img = el.querySelector('img'); if (A('keyart')) img.src = A('keyart'); else img.remove();
    this.el = el; dep.el = el;
    el.addEventListener('pointerdown', function(e){ dep.press = nowMs(); }, true);
    el.querySelector('#btnDeploy').addEventListener('click', function(e){ depStart(pressOf(e)); });
    el.querySelector('.hr-rr').addEventListener('click', function(e){ e._hrRr = true; depReroll(); });   // flag the event: the label is re-rendered, so e.target is detached by the time the row handler runs
    el.querySelector('.hm-roll .hr-row').addEventListener('click', function(e){ if (dep.revealing && !e._hrRr && !e.target.closest('.hr-rr')) depLand(); });   // tap the card: skip to the result
  },
  show: function(){
    var m = meta(), n = this.el.querySelector('.hm-bestn');
    var len = chLen(), best = Math.max(0, Math.min(len, (m && m.best) | 0));
    n.innerHTML = fmt(best) + '<span class="pv-muted"> / ' + len + '</span>';
    var hl = this.el.querySelector('.hm-len'); if (hl) hl.textContent = len + ' stages';
    dep.el = this.el; dep.fresh = false; dep.confirmT = 0;
    if (!DP()) { var bx = this.el.querySelector('.hm-roll'); if (bx) bx.style.display = 'none'; return; }
    depLoad(); dep.armAt = nowMs() + GUARD_MS;
    if (dep.fresh) depReveal(); else { dep.revealing = false; clearInterval(dep.timer); depPaint(); setTimeout(depPaint, GUARD_MS + 20); }
  },
  hide: function(){ clearInterval(dep.timer); dep.revealing = false; }
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
// Tab dots (step 8): one dot, never a number, never on the selected tab.
// Upgrades = rolls left this visit AND any non-capped item affordable at the Basic tier (V.Meta.quote).
// Armory = a locked slot is affordable (V.Meta.slotWhy === ''). Both fall back to the old canBuy rule until the step 8 meta API exists.
function upgradesDot(M){
  if (typeof M.items === 'function' && typeof M.quote === 'function') {
    if (typeof M.visitLeft === 'function' && !(M.visitLeft() > 0)) return false;
    var it = M.items() || [];
    for (var i = 0; i < it.length; i++) { if (it[i].capped) continue; var q = M.quote(it[i].kind, it[i].id, 'basic', {}); if (q && q.why === '') return true; }
    return false;
  }
  return !!M.canBuy('cond', 'rand');
}
function armoryDot(M){
  if (M.SLOTS && typeof M.slotWhy === 'function') { for (var i = 0; i < M.SLOTS.length; i++) if (M.slotWhy(M.SLOTS[i].id) === '') return true; return false; }
  return !!M.canBuy('rifle', 'rifle');
}
function refreshPips(){
  var M = V.Meta; if (!M || typeof M.canBuy !== 'function') return;
  var on = { armory: false, upgrades: false };
  try { on.armory = armoryDot(M); } catch (e) {}
  try { on.upgrades = upgradesDot(M); } catch (e) {}
  for (var id in on) Home.pip(id, on[id]);
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
