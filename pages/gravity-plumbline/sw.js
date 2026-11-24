// PGS shared service worker (pgs-update-1). No fetch logic here: see ../_shared/CONTRACT-pwa-update.md
const BUILD = '__PGS_BUILD__';
importScripts('../_shared/sw-core.js?b=' + BUILD);
pgsServiceWorker({ game: 'gravity-plumbline', build: BUILD, precache: [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './assets/bg-landscape-1280x720.webp',
  './assets/bg-portrait-720x1280.webp',
  './assets/corbel.webp',
  './assets/crusher-head.webp',
  './assets/gate-aurora.webp',
  './assets/hero-hurt.webp',
  './assets/hero-idle-flame.webp',
  './assets/hero-idle.webp',
  './assets/hero-land.webp',
  './assets/hero-win-flame.webp',
  './assets/hero-win.webp',
  './assets/keyart-720x1280.webp',
  './assets/lantern.webp',
  './assets/ledge-crumble.webp',
  './assets/pip-empty.webp',
  './assets/pip-full.webp',
  './assets/platform-capL.webp',
  './assets/platform-capR.webp',
  './assets/platform-full.webp',
  './assets/platform-mid.webp',
  './assets/portal-moon.webp',
  './assets/spikes-row4.webp',
  './assets/stone-tile.webp'
], legacy: ['pl-beta-', 'pl-'] });
