(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// P1 chapter 1, stages 1-10. The rows (and the SD, CA1, BA1 rooms) now live in parts/data-stages.js (V.Data.stages, F0 #7).
// This part keeps the names the game reads: V.STAGES and the stage rooms on V.ROOMS.
if (!(V.Data && V.Data.stages) && typeof require === 'function' && typeof module !== 'undefined') require('./data-stages.js');
V.ROOMS = V.ROOMS || V.Data.rooms;
for (var k in V.Data.rooms) if (!V.ROOMS[k]) V.ROOMS[k] = V.Data.rooms[k];
V.STAGES = V.Data.stages;
})();
