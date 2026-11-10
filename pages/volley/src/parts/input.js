(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// One-thumb drag control: touch anywhere on the game screen, drag to move. No graphic at the thumb.
// Direction = finger offset from the touch-down point. Hysteresis: start moving past ENTER px, stop inside EXIT px.
var el = null, tune = null;
var pid = null, x0 = 0, y0 = 0, dx = 0, dy = 0, active = false, down = false;
var keys = {};
var log = [], LOG_MAX = 200, t0 = (G.performance ? performance.now() : 0);
var counts = { downs: 0, ups: 0, cancels: 0, moves: 0 };

function now(){ return Math.round((G.performance ? performance.now() : 0) - t0); }
function rec(k, x, y){ log.push([now(), k, Math.round(x || 0), Math.round(y || 0)]); if (log.length > LOG_MAX) log.shift(); }
function T(k, d){ return tune && typeof tune[k] === 'number' ? tune[k] : d; }

function ignoreTarget(t){ return t && t.closest && t.closest('button, .ov, #drawer, input, textarea'); }

function onDown(e){
  if (pid !== null) return;                 // one pointer only
  if (ignoreTarget(e.target)) return;
  pid = e.pointerId; down = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; active = false;
  try { el.setPointerCapture(pid); } catch (_) {}
  counts.downs++; rec('d', x0, y0);
  if (e.cancelable) e.preventDefault();
}
function onMove(e){
  if (e.pointerId !== pid) return;
  dx = e.clientX - x0; dy = e.clientY - y0;
  var d = Math.sqrt(dx * dx + dy * dy);
  if (!active && d > T('DEADZONE_ENTER', 14)) { active = true; rec('go', dx, dy); }
  else if (active && d < T('DEADZONE_EXIT', 8)) { active = false; rec('st', dx, dy); }
  counts.moves++;
}
function onUp(e){
  if (e.pointerId !== pid) return;
  rec(e.type === 'pointercancel' ? 'c' : 'u', dx, dy);
  if (e.type === 'pointercancel') counts.cancels++; else counts.ups++;
  release();
}
function release(){
  if (pid !== null) { try { el.releasePointerCapture(pid); } catch (_) {} }
  pid = null; down = false; active = false; dx = dy = 0;
}
function onKey(e){
  var k = e.key; var on = e.type === 'keydown';
  var m = { w: 'u', W: 'u', ArrowUp: 'u', s: 'd', S: 'd', ArrowDown: 'd', a: 'l', A: 'l', ArrowLeft: 'l', d: 'r', D: 'r', ArrowRight: 'r' }[k];
  if (!m) return;
  keys[m] = on;
  if (e.target && e.target.tagName === 'INPUT') return;
  e.preventDefault();
}

V.Input = {
  attach: function(target, tuneRef){
    el = target; tune = tuneRef || V.TUNE;
    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', function(e){ if (e.pointerId === pid) { rec('lost', dx, dy); release(); } });
    G.addEventListener('blur', function(){ release(); keys = {}; });
    G.addEventListener('keydown', onKey); G.addEventListener('keyup', onKey);
  },
  // World-space direction (screen and world share axes, y grows down). Length 0 = no move.
  read: function(){
    var kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), ky = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (kx || ky) { var kl = Math.sqrt(kx * kx + ky * ky); return { mx: kx / kl, my: ky / kl }; }
    if (!active) return { mx: 0, my: 0 };
    var l = Math.sqrt(dx * dx + dy * dy) || 1;
    return { mx: dx / l, my: dy / l };
  },
  release: function(){ if (pid !== null) rec('rel', dx, dy); release(); keys = {}; },
  get down(){ return down; },
  get active(){ return active; },
  get counts(){ return counts; },
  log: function(){ return log.slice(); },
  logText: function(){ return log.map(function(r){ return r.join(','); }).join(' '); }
};
})();
