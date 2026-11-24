/* Chart School main: render dispatch, boot. */
const BUILD = "cs-proto-1";
window.ACT = window.ACT || {};
var SCREENS = {desk:'renderDesk', reading:'renderReading', marked:'renderMarked', order:'renderOrder', evidence:'renderEvidence', summary:'renderSummary', journal:'renderJournal'};
ACT.back = function(){ go('desk'); }; /* admin default: back always returns to the desk; an open sheet stays open ("Continue sheet") */
ACT.settings = function(){ if(typeof openTweaks === 'function') openTweaks(); };
ACT.desk = ACT.desk || function(){ go('desk'); };
function applyLook(){
  try{
    var ts = Number(T.textSize) || 1;
    document.documentElement.style.setProperty('--ts', String(ts));
    document.documentElement.style.fontSize = (ts * 100) + '%';
    document.body.classList.toggle('hc', !!T.highContrast);
  }catch(e){}
}
function render(){
  applyLook();
  var scr = (typeof S !== 'undefined' && S && SCREENS[S.screen]) ? S.screen : 'desk';
  document.body.dataset.screen = scr;
  var main = $('main');
  try{
    window[SCREENS[scr]]();
  }catch(e){
    if(window.console) console.error(e);
    main.innerHTML = '<section class="card"><b>Something went wrong drawing this screen.</b><p class="dim">' + esc(e && e.message) + '</p></section>';
    bar([{act:'desk', label:'Desk', kind:'primary'}]);
  }
}
function sheetCount(){ return Array.isArray(SHEETS) ? SHEETS.length : (SHEETS && SHEETS.sheets ? SHEETS.sheets.length : 0); }
function savedValid(){
  try{
    var n = sheetCount();
    if(!S || !Array.isArray(S.order) || !S.order.length || !SCREENS[S.screen]) return false;
    if(!S.order.every(function(i){ return i >= 0 && i < n; })) return false;
    if(S.cur && !(S.cur.sheetIdx >= 0 && S.cur.sheetIdx < n && Array.isArray(S.cur.reads))) return false;
    if(!S.cur && S.screen !== 'desk' && S.screen !== 'journal') return false;
    return true;
  }catch(e){ return false; }
}
var _rz = 0;
window.addEventListener('resize', function(){ cancelAnimationFrame(_rz); _rz = requestAnimationFrame(render); });
loadSheets().then(function(){
  if(!savedValid()) newSession(T.seed);
  render();
}).catch(function(e){
  if(window.console) console.error(e);
  applyLook();
  $('main').innerHTML = '<section class="card"><b>The reading sheets could not be loaded.</b><p class="dim">Check the connection and reload the page. Build ' + esc(BUILD) + '.</p></section>';
});
