(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Room templates now live in parts/data-stages.js (V.Data.rooms, F0 #7). This part keeps the old names the game reads.
// Node tests and bot.js load parts by name without the data part, so pull it in there (no require in the browser build).
if (!(V.Data && V.Data.rooms) && typeof require === 'function' && typeof module !== 'undefined') require('./data-stages.js');
V.ROOMS = V.Data.rooms;
V.ROOM_ORDER = V.Data.roomOrder;

// Cards: V.CARDS = V.MODS (parts/mods.js); sim.js holds the P0 6-card fallback.
})();
