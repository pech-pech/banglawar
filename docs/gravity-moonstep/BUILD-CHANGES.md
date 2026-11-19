# Build changes: Moonstep gravity prototype (concept D), PR #78
Live (after merge): https://pech-pech.github.io/banglawar/gravity-moonstep/ (installable PWA, cache moonstep-v2)
State: playable proto + feature slice in one build. Plain shapes, 0 art credits, 0 OpenArt spend.

## What is in
- Physics at fixed 1/120 s, seeded RNG, strongest-pull ownership (+35% extras, 1.15x hysteresis), rim run, hold-charge jump 200..380 px/s, chain window 0.08 s x1.10, landing/bounce, crumble, repel (solid), tide 22->60 px/s, lost-in-space 1.2 s.
- Generator with reachability check, kind ramps (crumble 35% @600 m, spin 35% @400 m, repel 15% @800 m).
- One-thumb controls, flick reverse, drag-down cancel, assist arc (toggle), pause menu (assist, sound, tide 0.75/1/1.25, seed, daily seed), medals Bronze/Silver/Gold/Moon, best per seed, last 20 attempts.
- Copy report: seed, height, jumps, best chain, cause, aimed-vs-landed, attempts, input log, frame p50/p95, "WebGPU output: NOT seen". Verify replay (same seed + log = same hash).
- Audio: Web Audio tones only. Views: S 344x882 (runner 38%), W 475x638 (scale 1.0, runner 45%).
## Tests (all re-run on final code)
- tests/unit.js 15/15, tests/e2e.js 39/39 (Fold 475x638 + 344x882; one flaky flick check seen once, passed on re-run), tests/bots.js (idle, naive, rote, skilled, human; 200 seeds ran at range 3.2r, 20 seeds at 4r).
- Visual QA: first pass 10 defects; recommended fixes applied (rings, HUD pill, overlay, ON/OFF text, spin/crumble/repel cues, landing marker). Not re-inspected after fixes.
## Admin defaults (my calls, M can flip)
1. Influence radius 3.2r -> 4r (3.2r made 70-84% of casual runs end "lost" near 40 m; 5r made skilled too easy). Gate for M: bands below.
2. Jump 200..380 px/s (review fix). Hysteresis kept in. Repel solid, never owner, bounce 0.35. Assist arc default ON.
3. Daily seed = 'D'+yyyymmdd. Replay is same-engine only (Math.sin/cos).
## Bot numbers at 4r, 20 seeds (200-seed run at 3.2r in BOT-REPORT history)
idle 8 m; naive ~91 m; rote 39 m; human median 366 m (Bronze 90%, Silver 45%, Gold 15%); skilled median 726 m (Silver 90%, Gold 35%, Moon 25%). Medal bands and tide pace are M's call: Moon looks reachable for a perfect bot, consider tide cap 70 or Moon 2000.
## Not proven
Nothing felt by hand. Aimed-vs-landed is ~99% for bots (they see exact predict), so skill-not-luck is untested with a human. Chain gains untested (bots rarely chain). WebGPU not used.
Lessons applied: checklist 1,4,5,7,9,10,11,13,14,15,18,19,21,23 (caveman, HTML+PR+PWA+seed+Copy report, Fold first, 5-min core then slice, bots with seeds, bands proposed not decided, one visual QA pass then recommended fixes, build->e2e->report, try/catch saves, tiers).
COST: no credit spend. About 1.3M sub-agent tokens across 16 helpers (4 Opus-class engine/lead work counted: engine maker only; rest Sonnet). Lead thread small.
