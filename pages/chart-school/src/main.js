/* Chart School main: render dispatch, boot. */
const BUILD = "cs-v2-1";
window.ACT = window.ACT || {};
/* SCREEN_FN (not SCREENS: store.js owns the SCREENS list used by its validator) */
var SCREEN_FN = {desk:'renderDesk', reading:'renderReading', marked:'renderMarked', call:'renderCall', outcome:'renderOutcome', summary:'renderSummary', journal:'renderJournal', runend:'renderRunEnd'};
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
  var scr = (typeof S !== 'undefined' && S && SCREEN_FN[S.screen]) ? S.screen : 'desk';
  document.body.dataset.screen = scr;
  var main = $('main');
  try{
    window[SCREEN_FN[scr]]();
  }catch(e){
    if(window.console) console.error(e);
    main.innerHTML = '<section class="card"><b>Something went wrong drawing this screen.</b><p class="dim">' + esc(e && e.message) + '</p></section>';
    bar([{act:'desk', label:'Desk', kind:'primary'}]);
  }
}
/* store.js validates saved state at load (v1 state migrates to a new run) and fixAfterLoad() repairs order / open chart */
function needsNewRun(){
  try{ return !S || !S.run || !Array.isArray(S.order) || !S.order.length || (S.cur && !curSheet()); }catch(e){ return true; }
}
var _rz = 0;
window.addEventListener('resize', function(){ cancelAnimationFrame(_rz); _rz = requestAnimationFrame(render); });
loadSheets().then(function(){
  if(needsNewRun()) newRun(T.seed);
  render();
}).catch(function(e){
  if(window.console) console.error(e);
  applyLook();
  $('main').innerHTML = '<section class="card"><b>The reading sheets could not be loaded.</b><p class="dim">Check the connection and reload the page. Build ' + esc(BUILD) + '.</p></section>';
});
