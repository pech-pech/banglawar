// PGS shared service worker (pgs-update-1). No fetch logic here: see ../_shared/CONTRACT-pwa-update.md
const BUILD = '__PGS_BUILD__';
importScripts('../_shared/sw-core.js?b=' + BUILD);
pgsServiceWorker({ game: 'witch-school', build: BUILD, precache: ['./', './index.html', './story.js', './core.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'], legacy: ['ws-proto-'] });
