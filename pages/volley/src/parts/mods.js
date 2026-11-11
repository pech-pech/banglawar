(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Field mods (D2, ch1 pool) + Supply Drop minors. Hook interface: CONTRACT-P1.md "Mods registry".
// Deterministic: randomness only via the rng passed in / api.rng(S).

var D = {
  FRONT_MUL: 0.75, MULTI_DMG: 0.90, MULTI_RATE: 0.85, GAP: 0.12,
  DIAG: [35, 55, 75], FRONT_SPACING: 0.3,
  RICO_N: 3, RICO_MUL: 0.70, RICO_RANGE: 4,
  PIERCE_MUL: 0.67, PIERCE_LV: [0.67, 0.75, 0.82],   // L2 / L3 values are guesses
  RICO_PER_LV: 1, BURN_LV: 0.5, POISON_LV: 0.5,       // stacking (pick 20): +1 jump, +50% DoT damage per level [guess]
  LEVEL_CAP: 3, EM_REPAIR: 0.25,                      // pick 20 cap; 03 'Emergency repair' = 25% max HP
  ATK: 0.30, ATK_MINOR: 0.15, RATE: 0.25, RATE_MINOR: 0.125,
  CRIT: 0.10, CRIT_DMG: 0.40, CRIT_MINOR: 0.05, CRIT_DMG_MINOR: 0.20,
  HP_UP: 0.20,
  BURN_PCT: 0.18, BURN_DT: 0.25, BURN_TICKS: 7,
  POISON_PCT: 0.35, POISON_DT: 1.0,
  SALVAGE: 0.015, SALVAGE_ROOM_CAP: 0.20,
  DODGE: 0.20, DODGE_LV: [0.20, 0.30, 0.40], DODGE_CAP: 0.40,   // L2 / L3 are guesses (was 0.2 per copy, cap 0.4, max 2); L3 = the sim's cap
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
function applyBurn(S, e, n){
  if (e.hp <= 0) return;
  if (!(e.burnN > 0)) e.burnCd = D.BURN_DT;              // keep the running tick clock on refresh
  e.burnN = D.BURN_TICKS;
  e.burnDmg = Math.floor(D.BURN_PCT * equipDmg(S) * (1 + D.BURN_LV * ((n || 1) - 1)));        // re-snapshot
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
function applyPoison(S, e, n){
  if (e.hp <= 0) return;
  var v = Math.floor(D.POISON_PCT * equipDmg(S) * (1 + D.POISON_LV * ((n || 1) - 1)));
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
  { id:'SK-01', key:'front', name:'Twin barrel', desc:'+1 forward round. All rounds x0.75 damage.', up:'One more forward round',
    max:3, pool:['F', 'BB'], weight:100, hooks:{
      stats:function(S, n, st){ st.primaryMul *= Math.pow(D.FRONT_MUL, n); },
      pattern:function(S, n, list){
        var nf = 1 + n, f = list[0];
        if (f) f.off = -(nf - 1) / 2 * D.FRONT_SPACING;
        for (var i = 1; i < nf; i++) list.push({ ang:0, off:(i - (nf - 1) / 2) * D.FRONT_SPACING, mul:1 });
      } } },
  { id:'SK-02', key:'multi', name:'Double volley', desc:'Fires the volley again 0.12 s later. Dmg x0.9, rate x0.85.', up:'One more echo volley',
    max:3, pool:['F', 'BB'], weight:80, echoes:true, hooks:{
      // the echo batches themselves are the sim's burstQ (n extra batches, D.GAP apart)
      stats:function(S, n, st){
        st.primaryMul *= Math.pow(D.MULTI_DMG, n);
        st.rateMul *= Math.pow(D.MULTI_RATE, n);
      } } },
  { id:'SK-03', key:'diag', name:'Diagonal rounds', desc:'+1 pair of rounds at 35, then 55, then 75 degrees.', up:'Another diagonal pair',
    max:3, pool:['F'], weight:80, hooks:{
      pattern:function(S, n, list){
        for (var i = 0; i < Math.min(3, n); i++) { var a = D.DIAG[i] * RAD; list.push({ ang:-a, off:0, mul:1 }, { ang:a, off:0, mul:1 }); }
      } } },
  { id:'SK-04', key:'side', name:'Flank rounds', desc:'+1 round left and right (90 degrees).', up:'Another flank pair',
    max:3, pool:['F'], weight:70, hooks:{
      pattern:function(S, n, list){
        for (var i = 0; i < n; i++) { var dl = i * D.GAP; list.push({ ang:-Math.PI / 2, off:0, mul:1, delay:dl }, { ang:Math.PI / 2, off:0, mul:1, delay:dl }); }
      } } },
  { id:'SK-05', key:'rear', name:'Rear guard', desc:'+1 round fired straight back.', up:'Another rear round',
    max:3, pool:['F'], weight:60, hooks:{
      pattern:function(S, n, list){ for (var i = 0; i < n; i++) list.push({ ang:Math.PI, off:0, mul:1, delay:i * D.GAP }); } } },
  { id:'SK-06', key:'rico', name:'Ricochet rounds', desc:'Rounds jump to a 2nd machine, up to 3 times (x0.7 each).', up:'Rounds jump 1 more time',
    max:3, pool:['F'], weight:70, hooks:{
      round:function(S, n, r){ r.rico = D.RICO_N + D.RICO_PER_LV * (Math.min(n, D.LEVEL_CAP) - 1); },
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
  { id:'SK-07', key:'pierce', name:'AP rounds', desc:'Rounds pass through machines (x0.67 per hit).', up:'Less damage lost per machine',
    max:3, pool:['F'], weight:70, hooks:{
      round:function(S, n, r){ r.pierce = true; },
      onHit:function(S, n, e, r, api){
        if (r.keep || !r.pierce) return;
        r.dmg = fl(r.dmg * D.PIERCE_LV[Math.min(n, D.LEVEL_CAP) - 1]); r.pierced = (r.pierced || 0) + 1;
        r.keep = true;
      } } },

  // ---------- 1b stat mods ----------
  { id:'SK-09', key:'atk', name:'Power cell', desc:'Attack +30%.', up:'Attack +30% more',
    max:3, pool:['F', 'BB'], weight:100, hooks:{ stats:function(S, n, st){ st.atkAdd += D.ATK * n; } } },
  { id:'SK-10', key:'atk2', name:'Spare cell', desc:'Attack +15%.', up:'Attack +15% more',
    max:4, pool:['SD'], weight:0, hooks:{ stats:function(S, n, st){ st.atkAdd += D.ATK_MINOR * n; } } },
  { id:'SK-11', key:'rate', name:'Fire control', desc:'Attack speed +25%.', up:'Attack speed +25% more',
    max:3, pool:['F', 'BB'], weight:100, hooks:{ stats:function(S, n, st){ st.rateAdd += D.RATE * n; } } },
  { id:'SK-12', key:'rate2', name:'Trigger tune', desc:'Attack speed +12.5%.', up:'Attack speed +12.5% more',
    max:4, pool:['SD'], weight:0, hooks:{ stats:function(S, n, st){ st.rateAdd += D.RATE_MINOR * n; } } },
  { id:'SK-13', key:'crit', name:'Crit optics', desc:'Crit chance +10%, crit damage +40%.', up:'More crit chance and damage',
    max:3, pool:['F', 'BB'], weight:100, hooks:{
      stats:function(S, n, st){ st.critAdd += D.CRIT * n; st.critDmgAdd = (st.critDmgAdd || 0) + D.CRIT_DMG * n; } } },
  { id:'SK-14', key:'crit2', name:'Scope tune', desc:'Crit chance +5%, crit damage +20%.', up:'More crit chance and damage',
    max:4, pool:['SD'], weight:0, hooks:{
      stats:function(S, n, st){ st.critAdd += D.CRIT_MINOR * n; st.critDmgAdd = (st.critDmgAdd || 0) + D.CRIT_DMG_MINOR * n; } } },
  { id:'SK-15', key:'armor', name:'Armor plating', desc:'Max HP +20% (120) and heals 120.', up:'More max HP, heals again',
    max:3, pool:['F', 'SD'], weight:90, hooks:{
      stats:function(S, n, st){ st.hpMaxAdd += Math.round(D.HP_UP * baseMaxHp(S)) * n; },
      onPick:function(S, n){
        var h = S.hero, add = Math.round(D.HP_UP * baseMaxHp(S));
        var cap = Math.max(h.maxHp, baseMaxHp(S) + add * n);
        h.hp = Math.min(cap, h.hp + add);
        fx(S, { k:'heal', x:h.x, y:h.y, v:add });
      } } },

  // ---------- 1c elements ----------
  { id:'SK-16', key:'burn', name:'Incendiary rounds', desc:'Hits burn: 27 damage every 0.25 s for 2 s.', up:'Burn hits 50% harder',
    max:3, pool:['F'], weight:70, hooks:{
      round:function(S, n, r){ r.burn = Math.min(n, D.LEVEL_CAP); },
      onHit:function(S, n, e, r){ if (r.burn) applyBurn(S, e, r.burn === true ? 1 : r.burn); },
      tick:function(S, n, dt, api){ tickBurn(S, dt, api); } } },
  { id:'SK-17', key:'poison', name:'Corrosive rounds', desc:'Hits corrode: 52 damage every 1 s until it dies.', up:'Corrosion hits 50% harder',
    max:3, pool:['F'], weight:70, hooks:{
      round:function(S, n, r){ r.poison = Math.min(n, D.LEVEL_CAP); },
      onHit:function(S, n, e, r){ if (r.poison) applyPoison(S, e, r.poison === true ? 1 : r.poison); },
      tick:function(S, n, dt, api){ tickPoison(S, dt, api); } } },

  // ---------- 1e sustain / utility ----------
  { id:'SK-27', key:'salvage', name:'Salvage repair', desc:'Each kill heals 9 HP (up to 120 per room).', up:'Heals more per kill',
    max:3, pool:['F'], weight:60, hooks:{
      onKill:function(S, n, e){
        var h = S.hero, ms = S.modState = S.modState || {};
        var room = S.stage + ':' + S.roomId;
        if (ms.salvRoom !== room) { ms.salvRoom = room; ms.salvHealed = 0; }
        var lv = Math.min(n, D.LEVEL_CAP), cap = Math.floor(D.SALVAGE_ROOM_CAP * baseMaxHp(S)) * lv;   // heal and room cap both scale with level [guess]
        var v = Math.min(Math.max(1, Math.floor(D.SALVAGE * baseMaxHp(S))) * lv, cap - ms.salvHealed, h.maxHp - h.hp);
        if (v <= 0 || h.hp <= 0) return;
        h.hp += v; ms.salvHealed += v;
        fx(S, { k:'heal', x:h.x, y:h.y, v:v });
      } } },
  { id:'SK-33', key:'dodge', name:'Evasion firmware', desc:'20% chance to dodge a hit.', up:'Higher dodge chance',
    max:3, pool:['F'], weight:60, hooks:{
      stats:function(S, n, st){ st.dodge = Math.min(D.DODGE_CAP, (st.dodge || 0) + D.DODGE_LV[Math.min(n, D.LEVEL_CAP) - 1]); } } },

  // ---------- 03 'Dry pool': fills offer slots when fewer than 3 legal cards remain (pool EM, never drawn by weight) ----------
  { id:'SK-RP', key:'repair', name:'Emergency repair', desc:'Heal 25% of max HP now.', up:'Heal 25% of max HP now.',
    max:0, pool:['EM'], weight:0, hooks:{
      onPick:function(S, n){
        var h = S.hero, v = Math.max(0, Math.min(h.maxHp - h.hp, Math.round(D.EM_REPAIR * h.maxHp)));
        h.hp += v; fx(S, { k:'heal', x:h.x, y:h.y, v:v });
      } } }
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
// opts.exclude: mod indices that may not appear (a reroll never repeats a card, 03 "Reroll").
// 'F' offers with fewer than k legal cards are padded with Emergency repair (03 "Dry pool"); opts.noRepair turns that off.
var REPAIR = -1; for (var ri = 0; ri < M.length; ri++) if (M[ri].id === 'SK-RP') REPAIR = ri;
function legalCount(S, pool, exclude){
  var n = 0; for (var i = 0; i < M.length; i++) if (inPool(M[i], pool) && !capped(S, M[i]) && !(exclude && exclude.indexOf(i) >= 0)) n++;
  return n;
}
function offer(S, pool, k, rng, opts){
  rng = rng || S.rng; pool = pool || 'F'; k = k || 3;
  var cand = [], i, out = [], ex = opts && opts.exclude;
  for (i = 0; i < M.length; i++) if (inPool(M[i], pool) && !capped(S, M[i]) && !(ex && ex.indexOf(i) >= 0)) cand.push(i);
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
  if (pool === 'F' && REPAIR >= 0 && !(opts && opts.noRepair)) while (out.length < k) out.push(REPAIR);
  return out;
}

// ---- level-up pick helpers (picks 19-21) ----
// Level the held mod reaches if card index ci is picked (1 = new).
function levelAfter(S, ci){ var m = M[ci]; return m ? count(S, m) + 1 : 1; }
function isRepair(ci){ return ci === REPAIR; }
// ---- offer reroll (pick 21): one banked per boss kill, held on S.rerolls (a plain number; sim snapshots copy it) ----
function rerolls(S){ return Math.max(0, (S && S.rerolls) | 0); }
function bankReroll(S){ S.rerolls = rerolls(S) + 1; if (S.fx) S.fx.push({ k:'reroll', v:S.rerolls }); return S.rerolls; }
// A reroll can change the offer only while a legal, not-currently-shown card exists.
function canReroll(S){
  if (!S || S.phase !== 'pick' || !S.cards || !rerolls(S)) return false;
  return legalCount(S, 'F', S.cards) > 0;
}
// Spend one banked reroll: a fresh set of the same size, no repeats of the shown cards. Returns true when the offer changed.
function reroll(S){
  if (!canReroll(S)) return false;
  var k = S.cards.length;
  S.cards = offer(S, 'F', k, S.rng, { exclude:S.cards.slice() });
  S.rerolls = rerolls(S) - 1;
  if (S.stats) S.stats.rerollsUsed = (S.stats.rerollsUsed | 0) + 1;
  if (S.events) S.events.push({ k:'reroll', left:S.rerolls });
  return true;
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

// ================= Deploy roll (picks 25-27; 02 T16, 05 3.10) =================
// One boost is rolled at Deploy (equal chance among the boosts OPEN in the slice), then a tier. Every outcome is a boost.
// One paid reroll per run replaces the whole result. Pure and deterministic: roll(seed, idx) uses V.Rng only. Storage is home.js's.
// Open in the slice: D2-D9 (stats, opening pick, shield, Credits). Closed until their systems exist: D1 families (F2), D10 Schematics,
// D11 gear, D12 keys (F3). So the slice rolls among 8 boosts [guess: the doc says 12 at full build].
var TIER = [ { id:'common', name:'Common', pips:1, w:0.60, bp:1 }, { id:'rare', name:'Rare', pips:2, w:0.30, bp:2 }, { id:'elite', name:'Elite', pips:3, w:0.10, bp:3.5 } ];
function pc(a){ return a.map(function(v){ return '+' + v + '%'; }); }
var BOOSTS = [
  { id:'D1',  kind:'combat', name:'Family focus',   open:false, vals:[1.5, 2, 3],      text:function(v){ return 'One family offered x' + v + ' as often'; } },
  { id:'D2',  kind:'combat', name:'Attack',         open:true,  vals:[5, 10, 17],      text:function(v){ return 'Attack +' + v + '% this run'; } },
  { id:'D3',  kind:'combat', name:'Attack speed',   open:true,  vals:[5, 10, 17],      text:function(v){ return 'Attack speed +' + v + '% this run'; } },
  { id:'D4',  kind:'combat', name:'Max HP',         open:true,  vals:[6, 12, 21],      text:function(v){ return 'Max HP +' + v + '% this run'; } },
  { id:'D5',  kind:'combat', name:'Armor',          open:true,  vals:[4, 8, 14],       text:function(v){ return 'Damage taken -' + v + '% this run'; } },
  { id:'D6',  kind:'combat', name:'Crit chance',    open:true,  vals:[4, 8, 14],       text:function(v){ return 'Crit chance +' + v + ' points'; } },
  { id:'D7',  kind:'head',   name:'Opening pick',   open:true,  vals:[1, 2, 3],        text:function(v){ return ['Head start: one upgrade pick as stage 1 begins', 'Head start: one pick, it enters at level 2', 'Head start: two picks, they enter at level 2'][v - 1]; } },
  { id:'D8',  kind:'head',   name:'Opening shield', open:true,  vals:[10, 20, 35],     text:function(v){ return 'Head start: a shield of ' + v + '% max HP, absorbs once'; } },
  { id:'D9',  kind:'earning',name:'Credits',        open:true,  vals:[10, 20, 35],     text:function(v){ return 'Credits +' + v + '% this run'; } },
  { id:'D10', kind:'earning',name:'Schematics',     open:false, vals:[1, 2, 4],        text:function(v){ return 'Schematics +' + v + ' at run end'; } },
  { id:'D11', kind:'earning',name:'Gear piece',     open:false, vals:[30, 60, 100],    text:function(v){ return 'Extra gear piece'; } },
  { id:'D12', kind:'earning',name:'Key progress',   open:false, vals:[0.1, 0.25, 0.5], text:function(v){ return 'Key progress +' + v; } }
];
var KIND_NAME = { combat:'Combat', earning:'Earning', head:'Head start' };
var REROLL_COST = [20, 25, 30];   // 02 T16 by chapter; Hard x1.5; T-08 halves
function boostById(id){ for (var i = 0; i < BOOSTS.length; i++) if (BOOSTS[i].id === id) return BOOSTS[i]; return null; }
function openBoosts(){ return BOOSTS.filter(function(b){ return b.open; }); }
function rollAt(seed, idx){
  var r = new V.Rng(((seed >>> 0) ^ Math.imul((idx | 0) + 1, 0x85EBCA6B)) >>> 0);
  r.next();                                                 // first output of mulberry32 on a near seed is weakly mixed: burn one
  var open = openBoosts(), b = open[Math.floor(r.next() * open.length)], x = r.next(), t = 0, acc = 0;
  for (var i = 0; i < TIER.length; i++) { acc += TIER[i].w; if (x < acc) { t = i; break; } t = i; }
  return { id:b.id, tier:t };
}
function make(seed){ seed = seed >>> 0; return { seed:seed, idx:0, used:false, started:false, boost:rollAt(seed, 0) }; }
function rerollCost(ch, opts){
  var c = REROLL_COST[Math.max(0, Math.min(2, ((ch || 1) | 0) - 1))];
  if (opts && opts.hard) c *= 1.5;
  if (opts && opts.discount) c *= 0.5;
  return Math.round(c);
}
// Replace the result once. Returns the new boost or null when the reroll was already used.
function rerollRoll(st){
  if (!st || st.used) return null;
  st.used = true; st.idx = 1; st.boost = rollAt(st.seed, 1); return st.boost;
}
function boostText(bo){ var b = boostById(bo.id), v = b.vals[bo.tier]; return b.text(v); }
function boostInfo(bo){ var b = boostById(bo.id), t = TIER[bo.tier]; return { id:b.id, kind:b.kind, kindName:KIND_NAME[b.kind], name:b.name, tier:t.id, tierName:t.name, pips:t.pips, text:boostText(bo) }; }
// Numbers the run reads. All zero for a missing boost.
function effects(bo){
  var e = { atk:0, rate:0, hp:0, dmgCut:0, crit:0, picks:0, pickLv2:0, shield:0, credits:0 };
  if (!bo) return e;
  var b = boostById(bo.id); if (!b) return e;
  var v = b.vals[bo.tier];
  switch (b.id) {
    case 'D2': e.atk = v / 100; break;
    case 'D3': e.rate = v / 100; break;
    case 'D4': e.hp = v / 100; break;
    case 'D5': e.dmgCut = v / 100; break;
    case 'D6': e.crit = v / 100; break;
    case 'D7': e.picks = v === 3 ? 2 : 1; e.pickLv2 = bo.tier >= 1 ? e.picks : 0; break;
    case 'D8': e.shield = v / 100; break;
    case 'D9': e.credits = v / 100; break;
  }
  return e;
}
// Sim hooks (one line each in sim.js, see G-REPORT): S.deploy = {id, tier} is set by the shell at run start.
function applyStats(S, st){
  if (!S || !S.deploy) return st;
  var e = effects(S.deploy), T = S.tune || V.TUNE || {};
  st.atkMul *= 1 + e.atk; st.rateMul *= 1 + e.rate;
  st.hpMaxAdd += Math.round(e.hp * (T.HERO_HP || 600));
  if (e.dmgCut) st.dmgTakenMul = Math.max(0.5, st.dmgTakenMul * (1 - e.dmgCut));     // shares the 50 percent cap (T16 D5)
  st.critAdd += e.crit;
  return st;
}
// Shell hand-off, before the first step of a run: S.deploy = the boost; S.st = null makes the sim's first step rebuild hero stats with it.
function attach(S, bo){ S.deploy = bo ? { id:bo.id, tier:bo.tier } : null; S.deployDone = false; S.deployShield = 0; S.st = null; return S; }
// Once at run start (after the first refreshStats). Idempotent per run.
function runStart(S){
  if (!S || !S.deploy || S.deployDone) return null;
  S.deployDone = true;
  var e = effects(S.deploy), mx = (S.hero && S.hero.maxHp) || (S.tune && S.tune.HERO_HP) || 600;
  S.deployShield = Math.round(e.shield * mx);
  S.freePicks = (S.freePicks | 0) + e.picks; S.deployL2 = e.pickLv2;
  if (S.hero) S.hero.hp = S.hero.maxHp;                      // D4 (and meta) max HP: the run starts full
  return e;
}
// After a free pick is applied: an opening pick of a rare or elite roll enters at level 2 (returns true when an extra level was due).
function pickBonus(S){ if (S && S.deployL2 > 0) { S.deployL2--; return true; } return false; }
// Shield soaks damage before HP. Returns the damage that still lands.
function absorb(S, dmg){
  if (!S || !(S.deployShield > 0) || !(dmg > 0)) return dmg;
  var a = Math.min(S.deployShield, dmg); S.deployShield -= a;
  if (S.fx) S.fx.push({ k:'shield', v:a });
  return dmg - a;
}
function creditMul(S){ return 1 + (S && S.deploy ? effects(S.deploy).credits : 0); }
// Storage helpers (plain JSON; home.js owns the key). decode() returns null for anything invalid.
function encode(st){ return JSON.stringify({ v:1, seed:st.seed >>> 0, used:!!st.used, started:!!st.started, startT:st.startT > 0 ? Math.floor(st.startT) : 0 }); }
function decode(txt){
  try {
    var o = JSON.parse(txt);
    if (!o || o.v !== 1 || typeof o.seed !== 'number' || o.seed < 0 || o.seed > 4294967295 || o.seed !== Math.floor(o.seed) || typeof o.used !== 'boolean') return null;
    var st = make(o.seed); if (o.used) rerollRoll(st); st.started = !!o.started; st.startT = (typeof o.startT === 'number' && o.startT > 0 && o.startT < 1e15) ? o.startT : 0; return st;
  } catch (e) { return null; }
}
// After a run ends: quitting before stage 3 keeps the roll and the reroll state (T16); otherwise the roll is spent (returns null).
function afterRun(st, stage){ if (st && st.started && (stage | 0) < 3) { st.started = false; return st; } return null; }

V.MODS = M;
V.CARDS = V.MODS;
V.Mods = { D:D, offer:offer, legalCount:legalCount, levelAfter:levelAfter, isRepair:isRepair, rerolls:rerolls, bankReroll:bankReroll, canReroll:canReroll, reroll:reroll,
  Deploy:{ TIER:TIER, BOOSTS:BOOSTS, make:make, roll:rollAt, reroll:rerollRoll, rerollCost:rerollCost, info:boostInfo, text:boostText, effects:effects, applyStats:applyStats, runStart:runStart, attach:attach,
    pickBonus:pickBonus, absorb:absorb, creditMul:creditMul, encode:encode, decode:decode, afterRun:afterRun, open:openBoosts },
  stats:stats, newStats:newStats, pattern:pattern, call:call, count:count, capped:capped,
  byId:function(id){ for (var i = 0; i < M.length; i++) if (M[i].id === id) return M[i]; return null; },
  indexOf:function(id){ for (var i = 0; i < M.length; i++) if (M[i].id === id) return i; return -1; } };
})();
