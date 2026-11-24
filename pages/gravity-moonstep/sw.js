// PGS shared service worker (pgs-update-1). No fetch logic here: see ../_shared/CONTRACT-pwa-update.md
const BUILD = '__PGS_BUILD__';
importScripts('../_shared/sw-core.js?b=' + BUILD);
pgsServiceWorker({ game: 'gravity-moonstep', build: BUILD, precache: [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './src/audio.js',
  './src/engine.js',
  './src/gen.js',
  './src/fx.js',
  './src/draw.js',
  './src/ui.js',
  './src/ui.css',
  './src/game.js'
], legacy: ['moonstep-'] });
