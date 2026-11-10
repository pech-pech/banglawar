(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Operator tab (TABS-A). DOM only; reads V.Meta (state, stats, onChange). Needs V.TabsA from tab-armory.js (loads first per HOME-CONTRACT).
var T = V.TabsA;
if (!T) { try { console.warn('tab-operator: V.TabsA missing (tab-armory.js must load first)'); } catch (_) {} return; }
var fmt = T.fmt, esc = T.esc, asset = T.asset, KEYS = T.KEYS, meta = T.meta;

var CSS = [
  '.to-top{display:flex;gap:12px;min-height:250px}',
  '.to-por{flex:none;width:152px;height:250px;padding:0;overflow:hidden;background:#e8cf9a}',
  '.to-por img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%;display:block}',
  '.to-por .ta-hint{position:absolute;left:0;right:0;top:8px;text-align:center;color:#3a2f18;letter-spacing:.12em}',
  '.to-hl{flex:1;min-width:0;display:flex;flex-direction:column}',
  '.to-nm{font:800 14px/1 var(--pv-ui-font-stencil);letter-spacing:.12em;text-transform:uppercase;color:var(--pv-ui-sand);margin-top:2px}',
  '.to-r{display:flex;align-items:center;gap:8px;height:42px;border-bottom:1px dashed var(--pv-ui-metal-600);font-size:12px;color:var(--pv-ui-text-2)}',
  '.to-r .pv-ico{color:var(--pv-ui-sand);font-size:16px}',
  '.to-r b{margin-left:auto;font:800 17px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-text);white-space:nowrap}',
  '.to-hl .ta-hint{margin:14px 0 2px}',
  '.to-tbl{padding:0 8px}',
  '.to-tbl .h,.to-tbl .row{display:grid;grid-template-columns:96px minmax(0,1fr) 78px;align-items:center;min-height:32px;padding:0 4px;gap:4px}',
  '.to-tbl .h{min-height:26px;padding-top:4px}',
  '.to-tbl .h span:last-child,.to-tbl .row b{text-align:right}',
  '.to-tbl .row{border-bottom:1px dashed var(--pv-ui-metal-600);font-size:12px;color:var(--pv-ui-text-2)}',
  '.to-tbl .row:last-child{border:0}',
  '.to-tbl .row i{font:700 12px/1 var(--pv-ui-font-stencil);font-style:normal;color:var(--pv-ui-text-3);white-space:nowrap}',
  '.to-tbl .row i em{font-style:normal;color:var(--pv-ui-cyan)}',
  '.to-tbl .row b{font:800 13px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-text);white-space:nowrap}',
  '.to-rec{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
  '.to-rec .c{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;min-height:84px;padding:6px 2px;background:var(--pv-ui-metal-900);border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:inset 0 2px 4px rgba(0,0,0,.6)}',
  '.to-rec .c b{font:800 22px/1 var(--pv-ui-font-stencil);color:var(--pv-ui-text)}',
  '.to-log{display:flex;flex-direction:column;gap:6px}',
  '.to-run{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 10px;background:linear-gradient(var(--pv-ui-metal-700),var(--pv-ui-metal-800));border:1.5px solid var(--pv-ui-ink);border-radius:6px;box-shadow:var(--pv-ui-bevel)}',
  '.to-run .pv-badge{width:48px;justify-content:center;flex:none;height:22px}',
  '.to-run .to-down{background:var(--pv-ui-metal-600);color:var(--pv-ui-text-2);box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-500)}',
  '.to-run .m{flex:1;min-width:0}',
  '.to-run .m b{display:block;font:800 14px/1.1 var(--pv-ui-font-stencil);letter-spacing:.06em;text-transform:uppercase;color:var(--pv-ui-text)}',
  '.to-run .m span{display:block;font-size:12px;color:var(--pv-ui-text-2);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.to-run .e{flex:none;display:flex;align-items:center;gap:5px;font:800 14px/1 var(--pv-ui-font-stencil);color:#ffe27a}',
  '.to-empty{padding:18px 12px;text-align:center;color:var(--pv-ui-text-2);font-size:12px;background:var(--pv-ui-metal-900);border-radius:6px;box-shadow:inset 0 0 0 1.5px var(--pv-ui-metal-600)}'
].join('\n');

function tune(k, d){ var t = V.TUNE; return (t && typeof t[k] === 'number') ? t[k] : d; }
function r1(n){ return (Math.round(n * 10) / 10).toString(); }
function pct(n){ return r1(n * 100) + '%'; }
function dur(s){ s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(t){
  if (!isFinite(t) || !t) return '';
  var d = new Date(t); if (isNaN(d.getTime())) return '';
  return MON[d.getMonth()] + ' ' + d.getDate() + ' ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}
function ico(path){ return '<svg class="pv-ico" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
var I_HP = '<path d="M6 4l6 2 6-2 3 4-3 3v9H6v-9L3 8z"/>', I_ATK = '<path d="M2 14h14l2-3h4v3h-3v2H9l-1 4H5l1-4H2z"/>', I_RATE = '<path d="M3 12h8M13 6l8 6-8 6z"/>';

function figure(){
  var u = asset(KEYS.portrait);
  if (u) return '<img src="' + u + '" alt="The Operator, portrait" draggable="false">';
  return '<svg viewBox="0 0 120 200" style="position:absolute;left:16px;top:26px;width:120px;height:200px" aria-hidden="true"><path d="M60 12a16 18 0 110 36 16 18 0 010-36zM40 60Q60 53 80 60L84 76L80 128L40 128L36 76ZM42 124h36l5 62H37z" fill="#2f3320" stroke="#0f1215" stroke-width="2"/><path d="M47 25H73L71 35H49Z" fill="#4cf0ff"/></svg>';
}

// Totals: hp = base + hpAdd, atk = base * atkMul, interval = base / rateMul (rateMul > 1 = faster). Bonus column shows the Meta difference.
function totals(){
  var M = meta(), hp0 = tune('HERO_HP', 600), atk0 = tune('HERO_ATK', 150), iv0 = tune('FIRE_INTERVAL', 0.8), x;
  var base = { hp0: hp0, atk0: atk0, iv0: iv0, crit: tune('CRIT_CHANCE', 0.05), critM: tune('CRIT_MULT', 2), spd: tune('MOVE_SPEED', 4.5) };
  if (typeof M.totals === 'function') { x = M.totals(); base.hp = Math.round(x.maxHp); base.atk = Math.round(x.atk); base.iv = x.interval; base.rate = 1 / x.interval; return base; }
  var s = (M.stats && M.stats()) || {}, rm = isFinite(s.rateMul) && s.rateMul > 0 ? +s.rateMul : 1;
  base.hp = Math.round(hp0 + (+s.hpAdd || 0)); base.atk = Math.round(atk0 * (isFinite(s.atkMul) && s.atkMul > 0 ? +s.atkMul : 1)); base.iv = iv0 / rm; base.rate = rm / iv0; return base;
}

var el = null, shown = false;
function render(){
  if (!el) return;
  var M = meta(), st = M.state || T.STUB.state, t = totals();
  var headU = asset(KEYS.head), runs = (st.runs || []).slice(-10).reverse(), all = st.runs || [], wins = 0, i;
  for (i = 0; i < all.length; i++) if (all[i] && all[i].win) wins++;
  var best = st.best || 0, bestMax = 10;
  var hpB = t.hp - t.hp0, atkB = t.atk - t.atk0, ivB = t.iv0 - t.iv;
  function bonus(n, unit){ return n ? ' <em>+' + fmt(n) + (unit || '') + '</em>' : ''; }
  var rows = '<div class="row"><span>Max HP</span><i>' + fmt(t.hp0) + bonus(hpB) + '</i><b>' + fmt(t.hp) + '</b></div>' +
    '<div class="row"><span>ATK</span><i>' + fmt(t.atk0) + bonus(atkB) + '</i><b>' + fmt(t.atk) + '</b></div>' +
    '<div class="row"><span>Fire interval</span><i>' + t.iv0.toFixed(2) + ' s' + (ivB > 0.004 ? ' <em>-' + ivB.toFixed(2) + '</em>' : '') + '</i><b>' + t.iv.toFixed(2) + ' s</b></div>' +
    '<div class="row"><span>Crit % / dmg</span><i>' + pct(t.crit) + ' &middot; ' + pct(t.critM) + '</i><b>' + pct(t.crit) + ' / ' + pct(t.critM) + '</b></div>' +
    '<div class="row"><span>Move speed</span><i>' + r1(t.spd) + '</i><b>' + r1(t.spd) + '</b></div>';
  var log = '';
  if (!runs.length) log = '<div class="to-empty">' + (headU ? '<img src="' + headU + '" width="64" height="64" alt="" style="display:block;margin:0 auto 8px;object-fit:contain">' : '') + '<div style="font-size:14px">No deployments yet.</div></div>';
  for (i = 0; i < runs.length; i++) {
    var r = runs[i] || {}, w = !!r.win;
    log += '<div class="to-run"><span class="pv-badge ' + (w ? 'pv-badge--olive' : 'to-down') + '">' + (w ? 'Win' : 'Down') + '</span>' +
      '<div class="m"><b>Stage ' + fmt(r.stage || 0) + '</b><span>' + [dur(r.dur), fmt(r.kills || 0) + ' kills'].filter(Boolean).join(' &middot; ') + '</span></div>' +
      '<span class="e">+' + fmt(r.credits || 0) + T.coin(16) + '</span></div>';
  }
  el.innerHTML = '<div class="ta-root">' +
        '<div class="ta-scroll">' +
      '<div class="to-top"><div class="pv-panel pv-rivets to-por">' + figure() + '</div>' +
        '<div class="to-hl"><div class="to-nm">The Operator</div><span class="ta-hint">Total stats</span>' +
          '<div class="to-r">' + ico(I_HP) + 'HP<b>' + fmt(t.hp) + '</b></div><div class="to-r">' + ico(I_ATK) + 'ATK<b>' + fmt(t.atk) + '</b></div>' +
          '<div class="to-r">' + ico(I_RATE) + 'Rate<b>' + (Math.round(t.rate * 100) / 100) + ' /s</b></div></div></div>' +
      '<div class="pv-panel pv-rivets to-tbl"><div class="h ta-hint"><span>Stat</span><span>Base <span style="color:var(--pv-ui-cyan)">+Bonus</span></span><span>Total</span></div>' + rows + '</div>' +
      '<div class="to-rec"><div class="c"><span class="ta-hint">Best stage</span><b>' + fmt(best) + '</b></div>' +
        '<div class="c"><span class="ta-hint">Runs</span><b>' + fmt(all.length) + '</b></div><div class="c"><span class="ta-hint">Wins</span><b>' + fmt(wins) + '</b></div></div>' +
      '<div class="pv-section">' + (headU ? '<img src="' + headU + '" width="40" height="40" alt="" style="object-fit:contain;order:-1">' : '') + '<span class="pv-section__label">Run log</span><span class="pv-section__aside">last ' + Math.max(runs.length, 0) + ' of 10</span></div>' +
      '<div class="to-log">' + log + '</div>' +
    '</div></div>';
}

V.Tabs = V.Tabs || {};
V.Tabs.operator = {
  id: 'operator', title: 'Operator',
  icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 4-8 8-8s8 3 8 8z"/>', // inner markup of a 24x24 stroke svg
  mount: function(host){
    el = host; T.injectCss('ta-base-css', T.BASE_CSS); T.injectCss('ta-operator-css', CSS);
    var M = meta(); if (typeof M.onChange === 'function') M.onChange(function(){ render(); });
    render();
  },
  show: function(){ shown = true; render(); },
  hide: function(){ shown = false; }
};
})();
