// PGS shared service worker (pgs-update-1). No fetch logic here: see ../_shared/CONTRACT-pwa-update.md
const BUILD = '__PGS_BUILD__';
importScripts('../_shared/sw-core.js?b=' + BUILD);
pgsServiceWorker({ game: 'trivia-duel', build: BUILD, precache: ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './art/emblem.webp', './art/player-0.webp', './art/player-1.webp', './art/player-2.webp', './art/player-3.webp', './art/rival-1.webp', './art/rival-2.webp', './art/rival-3.webp', './art/rival-4.webp', './art/rival-5.webp', './art/topic-spells.webp', './art/topic-creatures.webp', './art/topic-places.webp', './art/vs-bg.webp', './audio/bgm-beethoven5.mp3'], legacy: ['td-audio-'] });
