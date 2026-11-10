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

// P0 card pool (D2 IDs and values). max = copies allowed per run.
V.CARDS = [
  { id:'SK-01', key:'front', max:1, name:'Twin Barrel',     desc:'+1 forward round. All rounds deal x0.75.' },
  { id:'SK-02', key:'multi', max:3, name:'Double Volley',   desc:'Fire the volley again 0.12 s later. Damage x0.9, rate x0.85.' },
  { id:'SK-09', key:'atk',   max:0, name:'Power Cell',      desc:'Attack +30%.' },
  { id:'SK-11', key:'rate',  max:0, name:'Fire Control',    desc:'Attack speed +25%.' },
  { id:'SK-03', key:'diag',  max:3, name:'Diagonal Rounds', desc:'+1 pair of rounds at an angle.' },
  { id:'SK-06', key:'rico',  max:1, name:'Arc Ricochet',    desc:'Rounds jump to another machine, up to 3 times (x0.7 each).' }
];
})();
