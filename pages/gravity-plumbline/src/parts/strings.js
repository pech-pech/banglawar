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
      dailySub: 'Same rooms for all today', notPlayed: 'Not played yet', best: 'Best', play: 'Play', back: 'Back'
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
    nudge: { msg: 'Tough room. Want a guide line here?', show: 'Show the line', no: 'No thanks' },
    death: { spikes: 'Spikes', crusher: 'Crusher', crystal: 'Crystal fell', edge: 'Edge', slow: 'Too slow' },
    clear: { title: 'Room clear', newBest: 'New best!', next: 'Next', time: 'Time', best: 'Best' },
    complete: { title: 'Climb done', gold: 'Gold', silver: 'Silver', bronze: 'Bronze', none: 'No medal yet',
      bronzeHint: 'Bronze. Beat it?', total: (s) => 'Total ' + s, again: 'Again', menu: 'Menu', newBest: 'New best!' },
    settings: { title: 'Settings', back: 'Back', music: 'Music', sounds: 'Sounds', mute: 'Mute all', vibration: 'Vibration',
      hand: (left) => 'Hand: ' + (left ? 'Left' : 'Right'), motion: 'Less motion', textSize: 'Text size',
      quality: 'Picture', qualityOpts: ['Auto', 'High', 'Low'],
      reset: 'Reset my bests', eraseQ: 'Erase all bests?', keep: 'Keep', erase: 'Erase', tweak: 'Tweak (for testing)' },
    problem: { text: 'Display problem. Tap to restart' },
    tweak: { title: 'Tweak', back: 'Back to Settings' }
  };
  // dev strings: Tweak screen only (technical words allowed here)
  const dev = { artFallback: 'ART: fallback', badge: 'DEV', notSaved: 'not saved',
    resetAll: 'Reset all', copyReport: 'Copy report', savePreset: 'Save preset', copyCode: 'Copy code', pasteCode: 'Paste code',
    presets: 'Presets', del: 'Delete', copied: 'Copied', copyFailed: 'Copy failed: text shown', codeBad: 'Code not valid',
    codeApplied: 'Code applied', saved: 'Preset saved', full: 'Presets full (12)', loaded: 'Preset loaded', deleted: 'Preset deleted',
    sideNames: ['Right', 'Left', 'Centre'], mirror: 'Left-hand mirror', handNames: ['Off', 'On'], namePrompt: 'Preset name', pastePrompt: 'Paste a preset code', ok: 'OK', cancel: 'Cancel', close: 'Close', resetDone: 'All tweaks reset', blankName: 'Give the preset a name', storageProblem: 'Could not save (storage problem)' };
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
