// PGS shared service worker (pgs-update-1). No fetch logic here: see ../_shared/CONTRACT-pwa-update.md
const BUILD = '__PGS_BUILD__';
importScripts('../_shared/sw-core.js?b=' + BUILD);
pgsServiceWorker({ game: 'windward-line', build: BUILD, precache: ['./', './index.html', './style.css', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './js/contract.js', './js/rng.js', './js/map.js', './js/fire.js', './js/people.js', './js/sim.js', './js/plan.js', './js/render.js', './js/ui.js', './js/main.js', './js/tweak.js', './js/testhook.js'], legacy: [] });
