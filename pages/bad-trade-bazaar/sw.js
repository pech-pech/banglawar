// PGS shared service worker (pgs-update-1). No fetch logic here: see ../_shared/CONTRACT-pwa-update.md
const BUILD = '__PGS_BUILD__';
importScripts('../_shared/sw-core.js?b=' + BUILD);
pgsServiceWorker({ game: 'bad-trade-bazaar', build: BUILD, precache: ['./', './index.html', './style.css', './core.js', './ui.js', './ui-day.js', './day.css', './report.js', './house.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'], legacy: ['btb-'] });
