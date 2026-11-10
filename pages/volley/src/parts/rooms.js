(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// D3 section 3 grids. '#' row 0 = wall, other '#' = cover (kind per room). Spawns: 3 fixed 'e' slots (centres).
V.ROOMS = {
  R01: { name: 'Open Yard', cover: 'pillar', grid: [
    '####D####',
    '.........',
    '.e.....e.',
    '.........',
    '....e....',
    '.........',
    '.e.....e.',
    '.........',
    '....e....',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '....S....'],
    spawns: [ {type:'E-01', x:1.5, y:2.5}, {type:'E-01', x:7.5, y:2.5}, {type:'E-01', x:4.5, y:8.5} ] },
  R02: { name: 'Twin Pillars', cover: 'pillar', grid: [
    '####D####',
    '.........',
    '.e.....e.',
    '.........',
    '..##.##..',
    '..##.##..',
    '....e....',
    '.........',
    '.e.....e.',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '....S....'],
    spawns: [ {type:'E-02', x:1.5, y:2.5}, {type:'E-02', x:7.5, y:2.5}, {type:'E-01', x:4.5, y:6.5} ] },
  R03: { name: 'Center Block', cover: 'block', grid: [
    '####D####',
    '.........',
    '.e.....e.',
    '.........',
    '.........',
    '...###...',
    '.e.###.e.',
    '...###...',
    '.........',
    '....e....',
    '.........',
    '.........',
    '.........',
    '.........',
    '....S....'],
    spawns: [ {type:'E-03', x:1.5, y:6.5}, {type:'E-02', x:7.5, y:2.5}, {type:'E-01', x:4.5, y:9.5} ] }
};
V.ROOM_ORDER = ['R01', 'R02', 'R03'];

// Cards: V.CARDS = V.MODS (parts/mods.js); sim.js holds the P0 6-card fallback.
})();
