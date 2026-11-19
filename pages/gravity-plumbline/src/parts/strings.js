// strings.js: every player-facing string (review-ux s3). PL.Strings.player is what a child sees;
// PL.Strings.dev is for Tweak / dev chips only. Banned on player screens: tick, seed, charge, buffer, DEV.
const PL = (globalThis.PL = globalThis.PL || {});
(function () {
  'use strict';
  const player = {
    cover: { start: 'Tap to start' },
    menu: { title: 'Starfall', play: 'Play', practice: 'Practice', settings: 'Settings' },
    pick: {
      short: 'Short climb (5 rooms)', long: 'Long climb (7 rooms)', daily: 'Daily climb',
      dailySub: 'Same rooms for everyone today', notPlayed: 'Not played yet', best: 'Best', play: 'Play', back: 'Back'
    },
    tutorial: {
      t1a: 'Tap an arrow. That way is down.', t1b: 'You keep your speed.',
      t2a: '2 moves in the air.', t2b: 'Land to get them back.', t2zero: 'Out of moves. Land first.',
      t3a: 'Too slow for the gate? Dive.', t3b: 'Dive = a burst of speed.',
      skip: 'Skip tutorial'
    },
    hud: { room: (n, of) => 'Room ' + n + ' of ' + of, pause: 'Pause', retry: 'Retry', dive: 'Dive', moves: 'moves', oneMove: '1 move' },
    pause: { title: 'Paused', resume: 'Resume', retry: 'Retry room', settings: 'Settings', leave: 'Leave climb',
      confirm: 'Leave? Your best is kept.', stay: 'Stay', leaveYes: 'Leave' },
    death: { spikes: 'Spikes', crusher: 'Crusher', crystal: 'Crystal fell', edge: 'Edge', slow: 'Too slow' },
    clear: { title: 'Room clear', newBest: 'New best!', next: 'Next', time: 'Time', best: 'Best' },
    complete: { title: 'Climb done', gold: 'Gold', silver: 'Silver', bronze: 'Bronze', none: 'No medal yet',
      bronzeHint: 'Bronze. Beat it?', total: (s) => 'Total ' + s, again: 'Again', menu: 'Menu', newBest: 'New best!' },
    settings: { title: 'Settings', back: 'Back', music: 'Music', sounds: 'Sounds', mute: 'Mute all', vibration: 'Vibration',
      hand: (left) => 'Hand: ' + (left ? 'Left' : 'Right'), motion: 'Less motion', textSize: 'Text size',
      reset: 'Reset my bests', eraseQ: 'Erase all bests?', keep: 'Keep', erase: 'Erase', tweak: 'Tweak (for testing)' },
    tweak: { title: 'Tweak', back: 'Back to Settings' }
  };
  const dev = { artFallback: 'ART: fallback', badge: 'DEV', notSaved: 'not saved' };
  // flatten every static string (functions are called with sample args)
  function flat(o, out) {
    for (const k in o) {
      const v = o[k];
      if (typeof v === 'string') out.push(v);
      else if (typeof v === 'function') { out.push(String(v(3, 5)), String(v('3:41')), String(v(true)), String(v(false))); }
      else flat(v, out);
    }
    return out;
  }
  PL.Strings = { player, dev, allPlayer: () => flat(player, []) };
})();
