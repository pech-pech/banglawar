# Ridgeline audio pack (2026-11-21)

Live listen page: https://pech-pech.github.io/banglawar/ridgeline-audio/ (after the PR merges). Code and files: `pages/ridgeline-audio/`.
Status: pack done and tested offline. NOT wired into the game (per M: the Opus build thread wires it).

## What is in it
- `audio.js` (16 KB): class `RidgelineAudio`. Procedural Web Audio SFX + ambience (0 KB samples) + BGM streaming with crossfade.
- `bgm/bgm-wanderlust.mp3` (1.46 MB, 146 s, run) and `bgm/bgm-pink-navy.mp3` (0.85 MB, 85 s, menu). Both CC0, normalised -20 LUFS. Total audio 2.3 MB, BGM streamed so not blocking start.
- `index.html` listen page: every cue, landings by grade, props by kind, gate chain climb, ambience sliders, volume + mute.
- `CREDITS.md`: sources and licences. No paid audio used, no spend.

## Wiring for the build thread
```js
import { RidgelineAudio } from './audio.js';
const au = new RidgelineAudio({ bgmBase: './audio/' });   // copy bgm/*.mp3 there
// first tap: au.unlock();   menu: au.bgm('menu');   run start: au.bgm('run');
// every frame: au.setState({ speed, grounded, airborne, airT, diving, tumbling, tumbleSpeed, boost })
// sim events: au.event('land', { grade, impact }) ... names exactly as CONTRACT.md
// Tweak rows: au.setLevels({ master, sfx, amb, bgm, muted })  (0..1, defaults .8/.9/.7/.5)
// end of run / pause: au.silenceLoops()
```
SW: add `./src/audio.js` (+ mp3s) to FILES; keep network-first. Impact must be normalised 0..1 by the sim (`impact`, `impulse`).

## Cue list (event -> cue)
| Contract event | Cue | Sound |
|---|---|---|
| launch{speed} | launch | rising air whoosh, power from speed |
| air{t} | (state) airT | wind bed grows with air time |
| dive_start / dive_end | diveStart / diveEnd | falling / rising air swish; wind +while diving |
| land{grade,impact} | land | clean = soft sand puff + chime; rough = thump; slam = deep thud + ducks BGM; wreck = crash |
| tumble_start{cause} | crash | thud, crack, debris ticks; BGM duck; tumble rumble loop on (setState tumbling) |
| tumble_rest | tumbleRest | settling thump + dust |
| prop_hit{kind,impulse} | propHit | post = tonk, flag = cloth rustle, cairn = stone clatter, boulder = heavy boom; scaled by impulse |
| graze{tier} | graze | outer = air tick, inner = ping, razor = glass zing |
| gate{centred} | gate / gateCentred | bell pair; pitch climbs a pentatonic with flow link (never sour); centred adds sparkle |
| miss | gateMiss | dull low thud |
| flow_up{level} / flow_drop | flowUp / flowDrop | two-note rise (higher per level) / falling blip |
| boost | boost | rising noise sweep + saw |
| finish | finish | major arpeggio |
| medal{tier} | medalBronze..Summit | 2/3/4/6 note fanfare, gold+ add shimmer; BGM ducks |
| UI | uiTap, uiToggle, countBeep, go | short soft tones |
Loops (always on after unlock, driven by `setState`): wind (speed, boost, air, dive), sand hiss (grounded only), hover hum (pitch by speed, off while tumbling), tumble rumble.

## Mix
Master -> compressor (-14 dB, 4:1). SFX peaks 0.05-0.37 full scale (no clipping, measured offline for all 31 variants). BGM bus 0.4 at default so SFX sit on top. Defaults: master .8, sfx .9, amb .7, bgm .5.

## Tested
All cues rendered in headless Chromium via OfflineAudioContext: every one non-silent, none above 0.37 peak, no console errors from the module. NOT tested: real-phone speakers/latency, iOS Safari autoplay, how BGM sounds under gameplay, loop seam of BGM (tracks fade out at end, so the loop breathes about 1.5 s; fine for serene mood). M should listen on the Fold.

## Open
- BGM: 2 tracks only. Third track (Telos Desert Area 6, CC0, 6 min, 16 kHz so dull) was skipped. Easy to add more CC0 tracks from OpenGameArt on request.
- Sound taste (bell pitch, wind level) is a guess: Tweak rows will let M tune.
- Sibling thread asked for events beyond today's game: all covered above.
