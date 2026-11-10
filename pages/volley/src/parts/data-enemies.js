(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// V.Data.enemies: base rows for every machine and boss, keyed by design ID (F0 #7, 08 section 1). Plain data only.
// Values copied verbatim from the base literals in ai-p0.js (E-01..E-03), ai-p1.js (E-04, E-05) and boss.js (B-01).
// sim.js binds V.AI[id].base to these rows at load (the table wins); test-data.js fails if a behaviour literal drifts from its row.
// Fields: hp, contact (touch dmg), dmg (attack dmg), speed (tiles/s), r (body radius, tiles), size, xp, tell (s), cd (s); flags flyer/static/boss/immune.
var D = V.Data = V.Data || {};
D.enemies = {
  'E-01': {hp:300,contact:35,dmg:35,speed:2.4,r:0.35,size:'small',xp:4,tell:0.5,cd:2,flyer:true},
  'E-02': {hp:450,contact:40,dmg:55,speed:1,r:0.4,size:'medium',xp:8,tell:0.6,cd:2.2},
  'E-03': {hp:600,contact:40,dmg:45,speed:0,r:0.5,size:'medium',xp:8,tell:0.7,cd:2.8,static:true},
  'E-04': {hp:500,contact:40,dmg:95,speed:1.2,r:0.45,size:'medium',xp:8,tell:1,cd:3},
  'E-05': {hp:650,contact:60,dmg:130,speed:1.6,r:0.5,size:'medium',xp:8,tell:0.8,cd:2.5},
  'B-01': {hp:11000,contact:80,dmg:95,speed:0,r:1,size:'large',xp:0,tell:1,cd:1.4,static:true,boss:true,immune:{instakill:true,freeze:true,knockback:true}}
};
})();
