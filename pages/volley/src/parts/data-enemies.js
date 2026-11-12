(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// V.Data.enemies: base rows for every machine and boss, keyed by design ID (F0 #7, 08 section 1). Plain data only.
// F1 (S): every enemy number now lives here. ai-p0.js, ai-p1.js and boss.js hold NO base literal: they read base = this row and
// their behaviour parameters from row.ai (angles in degrees, seconds, tiles, tiles/s). test-data.js fails on drift or a leftover literal.
// Fields: hp, contact (touch dmg), dmg (attack dmg), speed (tiles/s), r (body radius, tiles), size, xp, tell (BASE s), cd (s); flags flyer/static/boss/immune; ai (behaviour params).
// R31 tells: tell and every ai tell/lock/windup time is a BASE time. The sim multiplies by TELL_MULT (0.85, tune.js), so the player sees
//   effective = base x 0.85. Base = effective / 0.85 rounded to 3 places. Effective targets (section 03): E-01 0.8, E-02 0.6, E-03 0.7,
//   E-04 ring 1.0 (windup 0.35 base kept: a squat, not the damage tell, GUESS), E-05 0.8 (lane locks the last 0.2 effective), B-01 A 1.0 / B 0.6 / C 0.8.
// R29: enemy damage = dmg x ENEMY_DMG_MULT x (1 + DMG_SLOPE x (stage - 1)); DMG_SLOPE 0.0118 (tune.js).
var D = V.Data = V.Data || {};
D.enemies = {
  'E-01': {hp:300,contact:35,dmg:35,speed:2.4,r:0.35,size:'small',xp:4,tell:0.941,cd:2,flyer:true,
    ai:{range:2.5,lungeSpeed:6,lungeDist:3}},
  'E-02': {hp:450,contact:40,dmg:55,speed:1,r:0.4,size:'medium',xp:8,tell:0.706,cd:2.2,
    ai:{lockLast:0.235,shotSpeed:6,range:10,prefer:3.2,lead:0.8}},
  'E-03': {hp:600,contact:40,dmg:45,speed:0,r:0.5,size:'medium',xp:8,tell:0.824,cd:2.8,static:true,
    ai:{shotSpeed:7,spreadDeg:13,fanN:2,range:14,lead:0.8}},
  'E-04': {hp:500,contact:40,dmg:95,speed:1.2,r:0.45,size:'medium',xp:8,tell:1.176,cd:3,
    ai:{range:8.5,prefer:5,windup:0.35,ringR:1}},
  'E-05': {hp:650,contact:60,dmg:130,speed:1.6,r:0.5,size:'medium',xp:8,tell:0.941,cd:2.5,
    ai:{range:7,lockLast:0.235,dashSpeed:9,dashDist:8,stun:1}},
  'B-01': {hp:11000,contact:80,dmg:95,speed:0,r:1,size:'large',xp:0,tell:1.176,cd:1.4,static:true,boss:true,immune:{instakill:true,freeze:true,knockback:true},
    ai:{shotSpeed:7.8,scatterDmg:85,cd2:1,tellA:1.176,tellB:0.706,tellC:0.941,
      A:{lines1:5,step1Deg:30,perLine:6,gap:0.2,lines2Deg:[-24,24,-36,36,-48,48],extra2Deg:60},
      B:{n1:24,n2:32,dur:1.5,arcDeg:220},
      C:{fanDeg:20,lineN:5,lineGap:0.12,lineDelay:0.3}}}
};
// S7 (SIM, volley-v2-5): the step-7 rows (E-06, E-06h, E-07, E-08, B-03, B-03V, B-02, B-04) live in their AI parts ("if absent",
// CONTRACT-STEP7), and the owner's row wins. test-data.js (K3) checks them there. SIM's first-pass staged table was removed:
// its numbers differed from the owners' rows (B-04 hp 12,293 would scale twice through boss init). Boss HP note: sim spawn
// HP = row hp x 0.82 x (1 + 0.036 (s - 1)); the boss parts apply the section 4 0.72 / 0.82 ratio in init.
})();
