(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// P1 chapter 1, stages 1-10 hand-authored (D3 2.1 rows 1-10 with DESIGN 9 overrides).
// Grid legend as D3: '#' cover/wall, '.' floor, 'S' Operator spawn, 'D' door, 'e' spawn slot (floor),
// '^' spikes (walkable, damage on touch), 'C' chest spot, 'B' boss spot, 'P' supply pad. All non-'#' are floor.
// Spawns: tile centres, t = seconds after room start. No spawns in rows 11-14 (safe zone).
V.ROOMS = V.ROOMS || {};

V.ROOMS.SD = { name: 'Supply Drop', cover: 'block', grid: [
  '####D####',
  '.........',
  '..#...#..',
  '.........',
  '..P...P..',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '....S....'],
  spawns: [] };

// CA1 Cache: D3 spike lines widened to 2-tile gaps (DESIGN 9). Chest replaces crate K.
V.ROOMS.CA1 = { name: 'Cache', cover: 'block', grid: [
  '####D####',
  '.........',
  '....C....',
  '^^^^..^^^',
  '..e...e..',
  '.........',
  '^..^^^..^',
  '.........',
  '.........',
  '^^^..^^^^',
  '.........',
  '.........',
  '.........',
  '.........',
  '....S....'],
  spawns: [ {type:'E-01', x:2.5, y:4.5}, {type:'E-01', x:6.5, y:4.5} ] };

V.ROOMS.BA1 = { name: 'Boss Arena', cover: 'pillar', grid: [
  '####D####',
  '.........',
  '.........',
  '....B....',
  '.........',
  '.#.....#.',
  '.........',
  '.........',
  '.........',
  '.#.....#.',
  '.........',
  '.........',
  '.........',
  '.........',
  '....S....'],
  spawns: [ {type:'B-01', x:4.5, y:3.5} ] };

function sp(type, x, y, t){ return { type:type, x:x, y:y, t:t || 0 }; }

V.STAGES = { ch1: [
  { stage:1, kind:'combat', room:'R01', note:'Intro E-01: one chaser first, two flank 1 s later',
    spawns:[ sp('E-01',4.5,4.5,0), sp('E-01',1.5,2.5,1.0), sp('E-01',7.5,2.5,1.0) ] },
  { stage:2, kind:'combat', room:'R02', note:'Build: 4 chasers in two pairs, pillars pre-exposure',
    spawns:[ sp('E-01',1.5,2.5,0), sp('E-01',7.5,2.5,0), sp('E-01',1.5,8.5,2.0), sp('E-01',7.5,8.5,2.0) ] },
  { stage:3, kind:'combat', room:'R01', note:'Intro E-02: one gun drone with one chaser, second gun drone at 3 s',
    spawns:[ sp('E-02',4.5,3.5,0), sp('E-01',7.5,6.5,0), sp('E-02',1.5,2.5,3.0) ] },
  { stage:4, kind:'combat', room:'R02', note:'Intro E-03 (eased to 3 enemies): turret alone below the pillars, company at 2.5 s',
    spawns:[ sp('E-03',4.5,6.5,0), sp('E-02',1.5,2.5,2.5), sp('E-01',7.5,2.5,2.5) ] },
  { stage:5, kind:'supply', room:'SD', note:'Supply Drop: pick a minor mod or repair 40%', spawns:[] },
  { stage:6, kind:'combat', room:'R03', note:'Intro E-04 (template swapped to R03): mortar alone, visible from S; company at 2.5 s',
    spawns:[ sp('E-04',1.5,3.5,0), sp('E-01',7.5,2.5,2.5), sp('E-02',7.5,6.5,2.5) ] },
  { stage:7, kind:'combat', room:'R02', note:'Intro E-05: charger alone in the centre, chasers at 3 s',
    spawns:[ sp('E-05',4.5,6.5,0), sp('E-01',1.5,2.5,3.0), sp('E-01',7.5,2.5,3.0) ] },
  { stage:8, kind:'combat', room:'R02', note:'Spike (template swapped to known R02, N=5): turret+drones, chargers at 4 s and 6 s',
    spawns:[ sp('E-03',4.5,6.5,0), sp('E-01',1.5,2.5,0), sp('E-02',7.5,2.5,0), sp('E-05',1.5,8.5,4.0), sp('E-05',7.5,8.5,6.0) ] },
  { stage:9, kind:'cache', room:'CA1', note:'Cache: spikes taught with 2 chasers; chest after clear',
    spawns:[ sp('E-01',2.5,4.5,0), sp('E-01',6.5,4.5,0) ] },
  { stage:10, kind:'boss', room:'BA1', note:'Boss B-01 Volley Tower (M pick, overrides D3 B-03)',
    spawns:[ sp('B-01',4.5,3.5,0) ] }
] };
})();
