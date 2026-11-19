# Build changes: Moonstep polish (feel, Ink look, full UI, balance)
Live (after merge): https://pech-pech.github.io/banglawar/gravity-moonstep/ (PWA cache moonstep-v7). Reopen app twice after merge.
## What changed
- Feel: new src/fx.js (hit pause 0.04-0.09 s on hard land/chain, shake, trail, particles, seeded, reduced-motion safe); audio.js layered tones (landing thump by impact, chain ladder, tide rumble, medal fanfares, near-miss tick); all wired in game.js.
- Look (M picked "Ink and Moonlight", 1 card): draw.js ported, cached paper/body textures, ink tide, landing ring, crumble countdown arc, view zoom x0.6.
- UI (M added scope): title, how-to, install hint, HUD, pause, settings (reset w/ confirm), results per medal, best-by-seed, attempts, medal sheet. src/ui.js + ui.css. Designs: docs/gravity-moonstep/ui/*.png.
- Balance (admin defaults): bands Bronze 150 / Silver 1000 / Gold 3800 / Moon 6000; tide cap 60->75, start +360; reach check now includes repels (soft-lock fix); layout variety (rest bodies, clusters, long hops, harder 1000-3000 m). Engine VERSION 2 (v1 replays do not verify). replay() cap 3600 s. Notes: docs/gravity-moonstep/BALANCE-NOTES.md.
## Numbers (200 seeds, final)
skilled median 2381 m: Silver 84%, Gold 21%, Moon 4%. human median 695 m: Bronze 93%, Silver 34%, Gold 1%. HUD next-medal reads bands from the engine at runtime.
## Tests (final code)
unit 19/19, e2e 111/111 (344x882 + 475x638), fx all pass, soak 3 min x 2 sizes: 0 errors, p95 16.8 ms, heap +0.7 MB, Copy report has "WebGPU output: NOT seen". Visual QA: 3 passes, 46 shots in docs/gravity-moonstep/qa/.
## Open (M's call)
1. Humans reach Silver at best by the human bot; lower Gold (human p90 1739 m) if Gold should be reachable.
2. Planets still ~1.5x ink reference size; landing ring shows only when arc lands; crumble has arc, no number.
3. Nothing felt by hand yet; install sheet untested on real device.
## Lessons applied: checklist 1,2,4,5,7,9,10,11,13,14,15,18,19,23 (caveman, Fold first, seeded RNG, Copy report, bots 200 seeds, bands proposed as admin default, QA passes with recommended fixes, tiers).
COST: no credit spend, 0 OpenArt. About 45 sub-agents (Sonnet makers/checkers/inspectors; 1 Opus for balance, ~160K tokens, 85 min); roughly 3M sub-agent tokens total. Lead thread small.
