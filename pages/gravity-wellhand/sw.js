// PGS shared service worker (pgs-update-1). No fetch logic here: see ../_shared/CONTRACT-pwa-update.md
const BUILD = '__PGS_BUILD__';
importScripts('../_shared/sw-core.js?b=' + BUILD);
pgsServiceWorker({ game: 'gravity-wellhand', build: BUILD, precache: [
  './',
  './index.html',
  './sim.js',
  './render.js',
  './tests.js',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
], legacy: ['wellhand-offline', 'wellhand-'] });
