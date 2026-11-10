(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Field mods (D2, ch1 pool) + Supply Drop minors. Hook interface: CONTRACT-P1.md "Mods registry".
// Deterministic: randomness only via the rng passed in / api.rng(S).

var D = {
  FRONT_MUL: 0.75, MULTI_DMG: 0.90, MULTI_RATE: 0.85, GAP: 0.12,
  DIAG: [35, 55, 75], FRONT_SPACING: 0.3,
  RICO_N: 3, RICO_MUL: 0.70, RICO_RANGE: 4,
  PIERCE_MUL: 0.67,
  ATK: 0.30, ATK_MINOR: 0.15, RATE: 0.25, RATE_MINOR: 0.125,
  CRIT: 0.10, CRIT_DMG: 0.40, CRIT_MINOR: 0.05, CRIT_DMG_MINOR: 0.20,
  HP_UP: 0.20,
  BURN_PCT: 0.18, BURN_DT: 0.25, BURN_TICKS: 7,
  POISON_PCT: 0.35, POISON_DT: 1.0,
  SALVAGE: 0.015, SALVAGE_ROOM_CAP: 0.20,
  DODGE: 0.20, DODGE_CAP: 0.40,
  CORE: ['SK-01', 'SK-02', 'SK-03', 'SK-04', 'SK-05', 'SK-09', 'SK-11', 'SK-13', 'SK-15']
};
var RAD = Math.PI / 180;

function equipDmg(S){ return S.tune.HERO_ATK; }          // ATK_total at run start x weapon mult 1
function baseMaxHp(S){ return S.tune.HERO_HP; }          // Hero_BaseMaxHP (DESIGN 3 row 8)
function targetable(e){ return e.hp > 0 && e.st !== 'spawn' && !e.hidden; }
function fl(x){ return Math.max(1, Math.floor(x + 1e-6)); }   // floor, safe for 0.7^n float error
function fx(S, o){ if (S.fx) S.fx.push(o); return o; }
// sim formula: dmg = HERO_ATK x (1+atkAdd) x atkMul x primaryMul x pattern mul; rate = (1+rateAdd) x rateMul

function dmgEnemy(S, e, dmg, api, src){
  dmg = Math.max(1, Math.floor(dmg));
  if (api && api.damageEnemy) return api.damageEnemy(S, e, dmg, false, { dot:true, src:src });
  // fallback when the sim has no api.damageEnemy: no XP/kill bookkeeping (reported to SIM)
  e.hp -= dmg; e.flashT = Math.max(e.flashT || 0, 0.05);
  if (e.hp <= 0) { e.hp = 0; return true; }
  return false;
}

// ---- elements (D2 1c, 3d) ----
function applyBurn(S, e){
  if (e.hp <= 0) return;
  if (!(e.burnN > 0)) e.burnCd = D.BURN_DT;              // keep the running tick clock on refresh
  e.burnN = D.BURN_TICKS;
  e.burnDmg = Math.floor(D.BURN_PCT * equipDmg(S));        // re-snapshot
  e.burnT = (e.burnN - 1) * D.BURN_DT + e.burnCd;           // seconds left (renderer reads > 0)
}
function tickBurn(S, dt, api){
  for (var i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i];
    if (!(e.burnN > 0) || e.hp <= 0) continue;
    e.burnCd -= dt;
    while (e.burnCd <= 1e-9 && e.burnN > 0 && e.hp > 0) {
      e.burnN--; e.burnCd += D.BURN_DT;
      dmgEnemy(S, e, e.burnDmg, api, 'burn');
    }
    e.burnT = e.burnN > 0 ? (e.burnN - 1) * D.BURN_DT + e.burnCd : 0;
  }
}
function applyPoison(S, e){
  if (e.hp <= 0) return;
  var v = Math.floor(D.POISON_PCT * equipDmg(S));
  if (!(e.poisonT > 0)) { e.poisonCd = D.POISON_DT; e.poisonDmg = v; }
  else e.poisonDmg = Math.max(e.poisonDmg || 0, v);       // timer unchanged, value = higher
  e.poisonT = 1e6;                                          // lasts until death / room end
}
function tickPoison(S, dt, api){
  for (var i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i];
    if (!(e.poisonT > 0) || e.hp <= 0) continue;
    e.poisonCd -= dt;
    while (e.poisonCd <= 1e-9 && e.hp > 0) { e.poisonCd += D.POISON_DT; dmgEnemy(S, e, e.poisonDmg, api, 'poison'); }
  }
}

// ---- travel (D2 3c) ----
function ricoTarget(S, r){
  var best = null, bd = D.RICO_RANGE;
  for (var k = 0; k < S.enemies.length; k++) {
    var o = S.enemies[k];
    if (!targetable(o) || (r.hit && r.hit.indexOf(o.id) >= 0)) continue;
    var d = Math.hypot(o.x - r.x, o.y - r.y);
    if (d < bd) { bd = d; best = o; }                       // line of sight not required (D2 3c-1)
  }
  return best;
}

var M = [
  // ---------- 1a round pattern ----------
  { id:'SK-01', key:'front', name:'Twin barrel', desc:'+1 forward round. All rounds x0.75 damage.',
    max:1, pool:['F', 'BB'], weight:100, hooks:{
      stats:function(S, n, st){ st.primaryMul *= Math.pow(D.FRONT_MUL, n); },
      pattern:function(S, n, list){
        var nf = 1 + n, f = list[0];
        if (f) f.off = -(nf - 1) / 2 * D.FRONT_SPACING;
        for (var i = 1; i < nf; i++) list.push({ ang:0, off:(i - (nf - 1) / 2) * D.FRONT_SPACING, mul:1 });
      } } },
  { id:'SK-02', key:'multi', name:'Double volley', desc:'Fires the volley again 0.12 s later. Dmg x0.9, rate x0.85.',
    max:3, pool:['F', 'BB'], weight:80, echoes:true, hooks:{
      // the echo batches themselves are the sim's burstQ (n extra batches, D.GAP apart)
      stats:function(S, n, st){
        st.primaryMul *= Math.pow(D.MULTI_DMG, n);
        st.rateMul *= Math.pow(D.MULTI_RATE, n);
      } } },
  { id:'SK-03', key:'diag', name:'Diagonal rounds', desc:'+1 pair of rounds at 35, then 55, then 75 degrees.',
    max:3, pool:['F'], weight:80, hooks:{
      pattern:function(S, n, list){
        for (var i = 0; i < Math.min(3, n); i++) { var a = D.DIAG[i] * RAD; list.push({ ang:-a, off:0, mul:1 }, { ang:a, off:0, mul:1 }); }
      } } },
  { id:'SK-04', key:'side', name:'Flank rounds', desc:'+1 round left and right (90 degrees).',
    max:3, pool:['F'], weight:70, hooks:{
      pattern:function(S, n, list){
        for (var i = 0; i < n; i++) { var dl = i * D.GAP; list.push({ ang:-Math.PI / 2, off:0, mul:1, delay:dl }, { ang:Math.PI / 2, off:0, mul:1, delay:dl }); }
      } } },
  { id:'SK-05', key:'rear', name:'Rear guard', desc:'+1 round fired straight back.',
    max:3, pool:['F'], weight:60, hooks:{
      pattern:function(S, n, list){ for (var i = 0; i < n; i++) list.push({ ang:Math.PI, off:0, mul:1, delay:i * D.GAP }); } } },
  { id:'SK-06', key:'rico', name:'Ricochet rounds', desc:'Rounds jump to a 2nd machine, up to 3 times (x0.7 each).',
    max:1, pool:['F'], weight:70, hooks:{
      round:function(S, n, r){ r.rico = D.RICO_N; },
      onHit:function(S, n, e, r, api){
        if (r.keep || !(r.rico > 0)) return;
        var o = ricoTarget(S, r);
        if (!o) return;
        var ang = Math.atan2(o.y - r.y, o.x - r.x), sp = Math.hypot(r.vx, r.vy);
        fx(S, { k:'arc', x1:r.x, y1:r.y, x2:o.x, y2:o.y, x:r.x, y:r.y, src:'rico' });
        r.vx = Math.cos(ang) * sp; r.vy = Math.sin(ang) * sp;
        r.dmg = fl(r.dmg * D.RICO_MUL); r.rico--; r.bounces = (r.bounces || 0) + 1;
        r.keep = true;                                      // pierce not spent (D2 3c-1)
      } } },
  { id:'SK-07', key:'pierce', name:'AP rounds', desc:'Rounds pass through machines (x0.67 per hit).',
    max:1, pool:['F'], weight:70, hooks:{
      round:function(S, n, r){ r.pierce = true; },
      onHit:function(S, n, e, r, api){
        if (r.keep || !r.pierce) return;
        r.dmg = fl(r.dmg * D.PIERCE_MUL); r.pierced = (r.pierced || 0) + 1;
        r.keep = true;
      } } },

  // ---------- 1b stat mods ----------
  { id:'SK-09', key:'atk', name:'Power cell', desc:'Attack +30%.',
    max:0, pool:['F', 'BB'], weight:100, hooks:{ stats:function(S, n, st){ st.atkAdd += D.ATK * n; } } },
  { id:'SK-10', key:'atk2', name:'Spare cell', desc:'Attack +15%.',
    max:4, pool:['SD'], weight:0, hooks:{ stats:function(S, n, st){ st.atkAdd += D.ATK_MINOR * n; } } },
  { id:'SK-11', key:'rate', name:'Fire control', desc:'Attack speed +25%.',
    max:0, pool:['F', 'BB'], weight:100, hooks:{ stats:function(S, n, st){ st.rateAdd += D.RATE * n; } } },
  { id:'SK-12', key:'rate2', name:'Trigger tune', desc:'Attack speed +12.5%.',
    max:4, pool:['SD'], weight:0, hooks:{ stats:function(S, n, st){ st.rateAdd += D.RATE_MINOR * n; } } },
  { id:'SK-13', key:'crit', name:'Crit optics', desc:'Crit chance +10%, crit damage +40%.',
    max:0, pool:['F', 'BB'], weight:100, hooks:{
      stats:function(S, n, st){ st.critAdd += D.CRIT * n; st.critDmgAdd = (st.critDmgAdd || 0) + D.CRIT_DMG * n; } } },
  { id:'SK-14', key:'crit2', name:'Scope tune', desc:'Crit chance +5%, crit damage +20%.',
    max:4, pool:['SD'], weight:0, hooks:{
      stats:function(S, n, st){ st.critAdd += D.CRIT_MINOR * n; st.critDmgAdd = (st.critDmgAdd || 0) + D.CRIT_DMG_MINOR * n; } } },
  { id:'SK-15', key:'armor', name:'Armor plating', desc:'Max HP +20% (120) and heals 120.',
    max:4, pool:['F', 'SD'], weight:90, hooks:{
      stats:function(S, n, st){ st.hpMaxAdd += Math.round(D.HP_UP * baseMaxHp(S)) * n; },
      onPick:function(S, n){
        var h = S.hero, add = Math.round(D.HP_UP * baseMaxHp(S));
        var cap = Math.max(h.maxHp, baseMaxHp(S) + add * n);
        h.hp = Math.min(cap, h.hp + add);
        fx(S, { k:'heal', x:h.x, y:h.y, v:add });
      } } },

  // ---------- 1c elements ----------
  { id:'SK-16', key:'burn', name:'Incendiary rounds', desc:'Hits burn: 27 damage every 0.25 s for 2 s.',
    max:1, pool:['F'], weight:70, hooks:{
      round:function(S, n, r){ r.burn = true; },
      onHit:function(S, n, e, r){ if (r.burn) applyBurn(S, e); },
      tick:function(S, n, dt, api){ tickBurn(S, dt, api); } } },
  { id:'SK-17', key:'poison', name:'Corrosive rounds', desc:'Hits corrode: 52 damage every 1 s until it dies.',
    max:1, pool:['F'], weight:70, hooks:{
      round:function(S, n, r){ r.poison = true; },
      onHit:function(S, n, e, r){ if (r.poison) applyPoison(S, e); },
      tick:function(S, n, dt, api){ tickPoison(S, dt, api); } } },

  // ---------- 1e sustain / utility ----------
  { id:'SK-27', key:'salvage', name:'Salvage repair', desc:'Each kill heals 9 HP (up to 120 per room).',
    max:1, pool:['F'], weight:60, hooks:{
      onKill:function(S, n, e){
        var h = S.hero, ms = S.modState = S.modState || {};
        var room = S.stage + ':' + S.roomId;
        if (ms.salvRoom !== room) { ms.salvRoom = room; ms.salvHealed = 0; }
        var cap = Math.floor(D.SALVAGE_ROOM_CAP * baseMaxHp(S));
        var v = Math.min(Math.max(1, Math.floor(D.SALVAGE * baseMaxHp(S))), cap - ms.salvHealed, h.maxHp - h.hp);
        if (v <= 0 || h.hp <= 0) return;
        h.hp += v; ms.salvHealed += v;
        fx(S, { k:'heal', x:h.x, y:h.y, v:v });
      } } },
  { id:'SK-33', key:'dodge', name:'Evasion firmware', desc:'20% chance to dodge a hit.',
    max:2, pool:['F'], weight:60, hooks:{
      stats:function(S, n, st){ st.dodge = Math.min(D.DODGE_CAP, (st.dodge || 0) + D.DODGE * n); } } }
];
// copy numbers that depend on tune into desc at load (HERO_ATK/HERO_HP defaults)
(function(){
  var T = V.TUNE_DEFAULTS || { HERO_ATK:150, HERO_HP:600 };
  for (var i = 0; i < M.length; i++) {
    var m = M[i];
    if (m.id === 'SK-16') m.desc = 'Hits burn: ' + Math.floor(D.BURN_PCT * T.HERO_ATK) + ' damage every 0.25 s for 2 s.';
    if (m.id === 'SK-17') m.desc = 'Hits corrode: ' + Math.floor(D.POISON_PCT * T.HERO_ATK) + ' damage every 1 s until it dies.';
    if (m.id === 'SK-15') m.desc = 'Max HP +20% (' + Math.round(D.HP_UP * T.HERO_HP) + ') and heals the same.';
    if (m.id === 'SK-27') m.desc = 'Each kill heals ' + Math.floor(D.SALVAGE * T.HERO_HP) + ' HP (max ' + Math.floor(D.SALVAGE_ROOM_CAP * T.HERO_HP) + ' per room).';
    m.core = D.CORE.indexOf(m.id) >= 0;
  }
})();

// ---- helpers the sim may use ----
function count(S, m){ return (S.hero && S.hero.mods && S.hero.mods[m.key]) || 0; }
function capped(S, m){ return !!m.max && count(S, m) >= m.max; }
function inPool(m, pool){ return m.pool.indexOf(pool) >= 0; }
// Offer k distinct mods from pool ('F' weighted, 'SD' uniform), never a capped one.
// F offers follow D2 2a pity A: at least one core mod when any core is available.
function offer(S, pool, k, rng, opts){
  rng = rng || S.rng; pool = pool || 'F'; k = k || 3;
  var cand = [], i, out = [];
  for (i = 0; i < M.length; i++) if (inPool(M[i], pool) && !capped(S, M[i])) cand.push(i);
  function w(ix){ return pool === 'F' ? (M[ix].weight || 0) : 1; }
  function draw(list){
    var tot = 0, j; for (j = 0; j < list.length; j++) tot += w(list[j]);
    if (tot <= 0) return list.length ? 0 : -1;
    var x = rng.next() * tot;
    for (j = 0; j < list.length; j++) { x -= w(list[j]); if (x < 0) return j; }
    return list.length - 1;
  }
  while (out.length < k && cand.length) { var j = draw(cand); out.push(cand[j]); cand.splice(j, 1); }
  if (pool === 'F' && out.length && !(opts && opts.noPity)) {
    var hasCore = false; for (i = 0; i < out.length; i++) if (M[out[i]].core) hasCore = true;
    var cores = []; for (i = 0; i < cand.length; i++) if (M[cand[i]].core) cores.push(cand[i]);
    if (!hasCore && cores.length) {
      var lo = 0; for (i = 1; i < out.length; i++) if (w(out[i]) < w(out[lo])) lo = i;
      out[lo] = cores[draw(cores)];
    }
  }
  return out;
}
function newStats(){ return { atkAdd:0, atkMul:1, primaryMul:1, rateAdd:0, rateMul:1, critAdd:0, critDmgAdd:0, hpMaxAdd:0, dmgTakenMul:1, moveMul:1, dodge:0, volleys:1 }; }
// Derived stats from all held mods (reference for the sim; same init the hooks expect).
function stats(S){
  var st = newStats();
  for (var i = 0; i < M.length; i++) { var n = count(S, M[i]); if (n > 0 && M[i].hooks.stats) M[i].hooks.stats(S, n, st); }
  return st;
}
function pattern(S){
  var list = [{ ang:0, off:0, mul:1 }];
  for (var i = 0; i < M.length; i++) { var n = count(S, M[i]); if (n > 0 && M[i].hooks.pattern) M[i].hooks.pattern(S, n, list); }
  return list;
}
// Generic dispatcher: V.Mods.call(S, 'onHit', e, r, api) calls every held mod's hook with n prepended.
function call(S, name, a, b, c){
  for (var i = 0; i < M.length; i++) {
    var h = M[i].hooks[name]; if (!h) continue;
    var n = count(S, M[i]); if (n > 0) h(S, n, a, b, c);
  }
}

V.MODS = M;
V.CARDS = V.MODS;
V.Mods = { D:D, offer:offer, stats:stats, newStats:newStats, pattern:pattern, call:call, count:count, capped:capped,
  byId:function(id){ for (var i = 0; i < M.length; i++) if (M[i].id === id) return M[i]; return null; },
  indexOf:function(id){ for (var i = 0; i < M.length; i++) if (M[i].id === id) return i; return -1; } };
})();
