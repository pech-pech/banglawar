(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// V.CatchUI (agent K): the Supply Drop payout sheet (S-64 reused, SPEC 6) and the Skip chip. DOM only; no timer, no auto-close, no flashing.
//   V.CatchUI.open(S, onTake)   onTake(padIds) is called ONCE per sheet; main.js passes pickSupply (V.Sim.pickSupply(S, ids) grants and opens the door).
//   V.CatchUI.close()           V.CatchUI.syncHud(S, view)  (called by V.CatchScene.draw every frame: Skip chip from the 4th play)
//   V.CatchUI.model(S, sel)     pure view-model of the sheet (tests): rows, picks left, labels, take enabled.
// Input guard: the sheet takes taps only after every finger has lifted and GUARD_MS (350, R13) have passed.
var GUARD_MS = 350;
var NAMES = { repair: 'Repair', credits: 'Credits', schematics: 'Schematics' };
// Drawn icons (inline SVG, 34x34 box, ink outline #0b0e11), after look/sd-look-lib-fix1.js. No text glyphs.
var INK = '#0b0e11';
var SVG = {
  repair: '<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><rect x="2" y="2" width="30" height="30" rx="6" fill="' + INK + '"/><rect x="3.6" y="3.6" width="26.8" height="26.8" rx="5" fill="#2fd37a"/><rect x="3.6" y="3.6" width="26.8" height="9" rx="5" fill="#7cffb0" opacity=".45"/><path d="M12.4 7.8h9.2v4.6h4.6v9.2h-4.6v4.6h-9.2v-4.6H7.8v-9.2h4.6z" fill="' + INK + '"/><path d="M13.8 9.4h6.4v5.4h5.4v4.4h-5.4v5.4h-6.4v-5.4H8.4v-4.4h5.4z" fill="#effff5"/></svg>',
  credits: '<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="' + INK + '"/><circle cx="17" cy="17" r="13.4" fill="#f0b73a"/><path d="M8 11a11 11 0 0 1 12-5.5" stroke="#ffe27a" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/><circle cx="17" cy="17" r="9.2" fill="none" stroke="#8a5a00" stroke-width="1.4"/><path d="M17 12l4.4 5-4.4 5-4.4-5z" fill="#8a5a00"/></svg>',
  schematics: '<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><path d="M4 2h18l8 7v23H4z" fill="' + INK + '"/><path d="M5.4 3.4h16.2l7 6.2v21H5.4z" fill="#232b36"/><g stroke="#4c8dff" stroke-width="1.1"><path d="M8 11.5h18M8 17.5h18M8 23.5h18"/><path d="M11 9v20M17 9v20M23 9v20"/></g><circle cx="10" cy="8" r="2.4" fill="#ffe27a"/></svg>',
  crate: '<svg viewBox="0 0 34 26" width="34" height="26" aria-hidden="true"><rect x="0" y="0" width="34" height="26" rx="3.5" fill="' + INK + '"/><rect x="1.5" y="1.5" width="31" height="23" rx="2.5" fill="#6f7648"/><rect x="1.5" y="1.5" width="31" height="5" fill="#8a925c"/><path d="M2 10h30M2 16h30" stroke="#4a5030" stroke-width="1.2"/><rect x="8" y="1.5" width="3.6" height="23" fill="#2f3320"/><rect x="22.4" y="1.5" width="3.6" height="23" fill="#2f3320"/><rect x="13" y="11" width="8" height="4.4" rx="1" fill="#d9d3b8"/></svg>',
  check: '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="' + INK + '"/><circle cx="16" cy="16" r="13.4" fill="#8fc25a"/><path d="M10 16.5l4.2 4.5 8.5-10" stroke="' + INK + '" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  empty: '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="' + INK + '" stroke-width="1"/><circle cx="16" cy="16" r="12.4" fill="none" stroke="#8c97a2" stroke-width="2.4"/></svg>',
  lock: '<svg viewBox="0 0 24 30" width="24" height="30" aria-hidden="true"><path d="M6 13V9a6 6 0 0 1 12 0v4" fill="none" stroke="#8c97a2" stroke-width="3"/><rect x="2" y="12" width="20" height="16" rx="3.5" fill="' + INK + '"/><rect x="3.4" y="13.4" width="17.2" height="13.2" rx="2.6" fill="#8c97a2"/><circle cx="12" cy="19" r="2.2" fill="' + INK + '"/><rect x="11.1" y="19.5" width="1.8" height="4" fill="' + INK + '"/></svg>'
};
function pipSvg(on){ return '<svg viewBox="0 0 16 14" width="16" height="14" aria-hidden="true"><rect x="0.5" y="0.5" width="15" height="12" rx="2" fill="' + (on ? '#e6a82e' : '#1b2026') + '" stroke="' + (on ? INK : '#5c6670') + '" stroke-width="1"/><rect x="7.2" y="1.5" width="1.6" height="10" fill="' + (on ? '#8a5a00' : '#3a424a') + '"/></svg>'; }
var el = null, chip = null, st = null;

function pct(x){ return Math.round(x * 100); }
// sel: array of taken pad ids. Pure; returns what the sheet shows.
function model(S, sel){
  var m = S && S.mini; if (!m || !m.pay) return { tier:0, tierName:'', caught:0, line:'', net_:'', hint:'', counter:'', status:'', picksLeft:0, rows:[], takeEnabled:false, minPx:12 };
  var pay = m.pay, all = pay.all, rows = [], taken = sel.slice(), left0 = Math.max(0, pay.picks - taken.length);
  m.pads.forEach(function(p){
    var r = { id:p.id, name:NAMES[p.id], icon:p.id, state:'open', amount:'', tappable:true };
    if (p.id === 'repair') r.amount = p.live ? '+' + p.pct + '% HP (' + p.heal + ')' : 'HP full';
    else if (p.id === 'credits') r.amount = '+' + p.amount;
    else r.amount = '+' + p.n;
    if (p.id === 'repair' && !p.live) { r.state = 'full'; r.tappable = false; }
    else if (taken.indexOf(p.id) >= 0) { r.state = 'taken'; r.tappable = !all; }
    else if (all) r.state = 'taken';
    r.locked = false;
    // SPEC 6 locked state: once the picks are used up, a pad that is not taken shows a padlock and "opens at Good" (Basic) or "opens at Great" (Good).
    // R50 governs the rule (picks 1/2/3/3, the player may swap), so a locked row is dimmed but still tappable: a tap swaps it in.
    if (r.state === 'open' && !all && left0 === 0) { r.locked = true; r.state = 'locked'; r.note = 'opens at ' + (m.tier === 0 ? 'Good' : 'Great'); }
    // N1 (QA2): "locked" above only means "picks used up", and a tap swaps it in (R50). The sheet therefore shows swapIn/cue ("Tap to swap in", empty ring), not a padlock.
    // The padlock + "opens at X" (tierLocked) is kept for a pad the tier truly cannot give; under R50 no pad is, so it is false today. r.locked/r.note stay for the model tests.
    r.swapIn = r.locked && r.tappable; r.tierLocked = false; r.cue = r.swapIn ? 'Tap to swap in' : (r.tierLocked ? r.note : '');
    rows.push(r);
  });
  var left = Math.max(0, pay.picks - taken.length);
  return { tier:m.tier, tierName:pay.name, caught:m.net, line:'You caught ' + m.net + '/20', net_:m.net + ' / 20', hint:(m.plays < 2 && m.tier < 3) ? 'Next tier at ' + [6, 13, 18, 20][m.tier] : '',
    counter:all ? '' : 'Picks left: ' + left, picksLeft:left,
    // D18: the sheet opens with the defaults already chosen, so it says so ("Picks: 2 of 2 chosen (tap to swap)") instead of "Picks left: 0". counter above is kept for the model/tests.
    status:all ? '' : 'Picks: ' + Math.min(taken.length, pay.picks) + ' of ' + pay.picks + ' chosen' + (left === 0 ? ' (tap to swap)' : ' (tap to choose)'), rows:rows, takeEnabled:true, minPx:12 };
}
function css(){
  if (G.document.getElementById('cuStyle')) return;
  var s = G.document.createElement('style'); s.id = 'cuStyle';
  s.textContent = '#cuSheet{position:absolute;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(11,14,17,.72);touch-action:manipulation}' +
    '#cuSheet .cu-p{width:100%;max-width:480px;max-height:100%;overflow-y:auto;background:linear-gradient(#2b323a,#1b2026);border-top:3px solid #d6bf8e;border-radius:18px 18px 0 0;color:#e4dfd2;font:14px system-ui,sans-serif;padding:12px 16px 16px;box-sizing:border-box;transform:translateY(100%);transition:transform .3s ease-out}' +
    '#cuSheet.on .cu-p{transform:none}#cuSheet .cu-h{display:flex;align-items:center;justify-content:space-between;margin:0 0 4px}#cuSheet h2{margin:0;font:800 17px system-ui,sans-serif!important;text-transform:none!important;letter-spacing:0!important;color:#e4dfd2!important}' +
    '#cuSheet .cu-t{display:flex;align-items:center;gap:10px;margin:2px 0 4px}#cuSheet .cu-t .tw{font:800 30px/1.1 system-ui,sans-serif!important;color:#ffe27a!important;text-transform:none!important;letter-spacing:0!important}' +
    '#cuSheet .cu-pips{display:flex;gap:5px}#cuSheet .cu-pips svg{display:block}' +
    '#cuSheet .cu-l{color:#c9d3db;font-weight:600}#cuSheet .cu-l b{color:#e4dfd2}#cuSheet .cu-c{margin-top:4px;color:#c9d3db;font-weight:600}#cuSheet .cu-c b{color:#ffe27a}' +
    '#cuSheet .cu-r{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;margin:6px 0;padding:0 12px 0 8px;box-sizing:border-box;background:#2b323a;border:2px solid #0b0e11;border-radius:11px;color:#e4dfd2;font:14px system-ui,sans-serif;text-align:left}' +
    '#cuSheet .cu-r[data-s=taken]{border-color:#8fc25a}#cuSheet .cu-r[data-s=full]{opacity:.5}#cuSheet .cu-r[data-s=swap]{background:#242b33;border-color:#3a424a}#cuSheet .cu-r[data-s=locked]{opacity:.8;background:#1b2026;border:2px dashed #3a424a;color:#8c97a2}#cuSheet .cu-r[data-s=locked] .ic svg{opacity:.4}' +
    '#cuSheet .cu-r .ic{flex:none;width:40px;height:40px;background:#14181c;border-radius:8px;display:flex;align-items:center;justify-content:center}' +
    '#cuSheet .cu-r .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}#cuSheet .cu-r .nm{font:800 17px system-ui,sans-serif}#cuSheet .cu-r .sb{font-weight:600;color:#c9d3db}#cuSheet .cu-r[data-s=locked] .sb{font-size:12px;font-weight:700;color:#a7b2bc}' +
    '#cuSheet .cu-r .ck{flex:none;width:30px;display:flex;align-items:center;justify-content:center}' +
    '#cuSheet .cu-take{width:100%;height:64px;margin-top:8px;background:linear-gradient(#ffe27a,#c28a0c);color:#0b0e11;border:2px solid #0b0e11;border-radius:15px;font:800 22px system-ui,sans-serif}#cuSheet .cu-take:disabled{opacity:.6}' +
    '#cuSkip{position:absolute;z-index:40;width:56px;height:56px;background:#242a31;color:#d9d3b8;border:2px solid #d6bf8e;font:14px system-ui,sans-serif;display:none}';
  G.document.head.appendChild(s);
}
function render(){
  if (!st || !el) return;
  var S = st.S, M = model(S, st.sel), h = '<div class="cu-p"><div class="cu-h"><h2>Supply Drop</h2><div class="cu-pips">';
  for (var i = 0; i < 4; i++) h += pipSvg(i <= M.tier);
  h += '</div></div><div class="cu-t">' + SVG.crate + '<span class="tw">' + M.tierName + '</span></div><div class="cu-l">You caught <b>' + M.net_ + '</b>' + (M.hint ? ' &middot; ' + M.hint : '') + '</div>';
  if (M.status) h += '<div id="cuLeft" class="cu-c">' + M.status.replace(/(\d+ of \d+ chosen)/, '<b>$1</b>') + '</div>';
  M.rows.forEach(function(r){
    var mark = r.state === 'taken' ? SVG.check : (r.tierLocked ? SVG.lock : (r.state === 'full' ? '' : SVG.empty)), ds = r.tierLocked ? 'locked' : (r.swapIn ? 'swap' : r.state);
    h += '<button type="button" class="cu-r" data-id="' + r.id + '" data-s="' + ds + '"' + (r.tappable ? '' : ' aria-disabled="true"') + ' aria-label="' + r.name + ' ' + r.amount + (r.cue ? ', ' + r.cue : '') + (r.state === 'taken' ? ', chosen' : '') + '">' +
      '<span class="ic">' + SVG[r.icon] + '</span><span class="tx"><span class="nm">' + r.name + '</span><span class="sb">' + (r.cue ? r.cue + ' &middot; ' + r.amount : r.amount) + '</span></span><span class="ck">' + mark + '</span></button>';
  });
  h += '<button type="button" class="cu-take">Take</button></div>';
  el.innerHTML = h;
}
function open(S, onTake){
  if (!G.document) return;
  css(); close();
  var m = S.mini; if (!m || !m.pay) return;
  st = { S:S, sel:m.picks.slice(), onTake:onTake, t0:G.performance.now(), done:false, armed:false };
  el = G.document.createElement('div'); el.id = 'cuSheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Supply Drop rewards');
  (G.document.getElementById('stage') || G.document.body).appendChild(el);
  render();
  G.requestAnimationFrame(function(){ if (el) el.classList.add('on'); });
  var down = 0;
  el.addEventListener('pointerdown', function(){ down++; st.lastDown = G.performance.now(); });
  el.addEventListener('pointerup', function(){ down = Math.max(0, down - 1); st.lastUp = G.performance.now(); });
  el.addEventListener('pointercancel', function(){ down = Math.max(0, down - 1); });
  el.addEventListener('click', function(e){
    if (!st || st.done) return;
    if (!st.S || !st.S.mini) { close(); return; }
    // guard (R13): 350 ms after the sheet opened AND after the last finger lift before it; a press that began before the guard is ignored
    var now = G.performance.now(); if (now - st.t0 < GUARD_MS || (st.lastDown != null && st.lastDown - st.t0 < GUARD_MS)) return;
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.classList.contains('cu-take')) { st.done = true; var sel = st.sel.slice(); var cb = st.onTake; close(); if (cb) cb(sel); return; }
    tap(b.getAttribute('data-id'));
  });
}
// toggle a pad. At Basic and Good a tap on an open pad with no picks left swaps out the oldest pick (sd:pad); Great and Perfect have no choice to make.
function tap(id){
  if (!st || !st.S || !st.S.mini || !st.S.mini.pay) { close(); return false; }
  var S = st.S, m = S.mini, M = model(S, st.sel), row = M.rows.filter(function(r){ return r.id === id; })[0];
  if (!row || !row.tappable || m.pay.all) return false;
  var i = st.sel.indexOf(id);
  if (i >= 0) st.sel.splice(i, 1);
  else { if (st.sel.length >= m.pay.picks) st.sel.shift(); st.sel.push(id); }
  S.events.push({ k:'sd:pad', id:id, picks:st.sel.slice() });
  if (el) render();
  return true;
}
function close(){ if (el && el.parentNode) el.parentNode.removeChild(el); el = null; st = null; }
function syncHud(S, view){
  if (!G.document) return;
  var m = S && S.mini, on = !!(m && m.canSkip && (m.phase === 'countin' || m.phase === 'play') && !m.taken);
  if (!chip && on) { css(); chip = G.document.createElement('button'); chip.id = 'cuSkip'; chip.type = 'button'; chip.textContent = 'Skip';
    chip.addEventListener('click', function(e){ e.stopPropagation(); if (G.__pv && G.__pv.S && V.Sim.skipCollect) V.Sim.skipCollect(G.__pv.S); });
    (G.document.getElementById('stage') || G.document.body).appendChild(chip); }
  if (!chip) return;
  chip.style.display = on ? 'block' : 'none';
  if (on && view) { chip.style.left = Math.round(view.ox + (view.C || 9) * view.s - 64) + 'px'; chip.style.top = Math.round(view.oy + 4) + 'px'; }
}
V.CatchUI = { open:open, close:close, syncHud:syncHud, model:model, tap:tap, GUARD_MS:GUARD_MS, _state:function(){ return st; } };
})();
