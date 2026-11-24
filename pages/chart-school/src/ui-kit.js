/* Chart School ui-kit: helpers, header, bottom bar, marks, delegated clicks. Plain script, no modules. */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
window.ACT = window.ACT || {};
var ICON_BACK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
var ICON_GEAR='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>';
function header(title, sub, opts){
  opts = opts || {};
  var dev = '', build = (typeof BUILD !== 'undefined') ? BUILD : '';
  try{ if(typeof tweaked === 'function' && tweaked()) dev = '<span class="dev">DEV ' + esc((typeof S !== 'undefined' && S && S.seed) || (typeof T !== 'undefined' && T && T.seed) || '') + '</span> '; }catch(e){}
  var h = '<div class="top"><span>Chart School · Reading desk</span><span class="num">' + dev + esc(build) + ' <span data-pgs-build></span></span></div><div class="hd">';
  if(!opts.root) h += '<button class="ib" data-act="back" aria-label="Back">' + ICON_BACK + '</button>';
  h += '<div class="ttl">' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  if(opts.pill) h += opts.pill;
  if(opts.gear) h += '<button class="ib" data-act="settings" aria-label="Settings">' + ICON_GEAR + '</button>';
  return h + '</div>';
}
function bar(buttons){
  var el = $('bar'); if(!el) return;
  el.innerHTML = (buttons || []).map(function(b){
    return '<button class="btn ' + (b.kind === 'primary' ? 'primary' : 'out') + '" data-act="' + esc(b.act) + '"' + (b.disabled ? ' disabled' : '') + '>' + esc(b.label) + '</button>';
  }).join('');
}
/* marks: right = circle + tick, wrong = rounded square + X, open = dashed circle, skipped = dash; text label under each (VQA 2, 6) */
function markSvg(kind){
  if(kind === 'right') return '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="rgba(61,139,253,.2)" stroke="var(--x)" stroke-width="2"/><path d="M8 14.5l4 4 8-9" fill="none" stroke="var(--x)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if(kind === 'wrong') return '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" rx="5" fill="rgba(245,159,58,.2)" stroke="var(--o)" stroke-width="2"/><path d="M9 9L19 19M19 9L9 19" stroke="var(--o)" stroke-width="2.4" stroke-linecap="round"/></svg>';
  if(kind === 'skip') return '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M7 14h14" stroke="var(--dim)" stroke-width="2.4" stroke-linecap="round"/></svg>';
  return '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11.5" fill="none" stroke="var(--dim)" stroke-width="2" stroke-dasharray="4 3"/></svg>';
}
function marks(reads){
  var nm = (typeof CSE !== 'undefined' && CSE.NAMES) || {};
  return '<div class="dots">' + (reads || []).map(function(r){
    var k = r.skipped ? 'skip' : r.ok === true ? 'right' : r.ok === false ? 'wrong' : 'open';
    var lab = {right:'Right', wrong:'Marked', skip:'Skipped', open:'Open'}[k];
    return '<div class="d ' + (k === 'wrong' ? 'w' : '') + '">' + markSvg(k) + '<i>' + lab + '</i><span>' + esc(nm[r.type] || r.type || '') + '</span></div>';
  }).join('') + '</div>';
}
function closeModal(){ var m = $('modal'); if(m) m.classList.remove('on'); }
document.addEventListener('click', function(ev){
  var t = ev.target; if(!t || !t.closest) return;
  var el = t.closest('[data-act],[data-opt]'); if(!el || el.disabled) return;
  try{
    if(el.dataset.act != null){ var f = window.ACT[el.dataset.act]; if(typeof f === 'function') f(el); }
    else if(el.dataset.opt != null && typeof window.ACT.opt === 'function') window.ACT.opt(el.dataset.opt, el);
  }catch(e){ if(window.console) console.error(e); }
});
