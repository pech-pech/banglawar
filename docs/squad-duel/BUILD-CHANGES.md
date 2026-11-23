# Build changes: sq-slice-1 (Squad Duel first slice, CG-20261123-002)
Live (after merge): https://pech-pech.github.io/banglawar/squad-duel/

## What's in (all 4 must-haves, in the L2 Night broadcast look)
| # | Must-have (M's words) | In the build |
|---|---|---|
| 1 | Football manager genre | Manager: 5 on the pitch + 2 bench, Wall / Diamond / Spear, scout line per club, swap in the pulled player (NEW badge) |
| 2 | Stadium scene turn based matches | Night stadium SVG, 2 matches (Iron Grimsby, Restless Reading), two halves of 6 turns, deck hand of 3, odds chip before each pick, dice and cause line after, defending turns, Roar |
| 3 | Progression system and skill tree | XP bars, Opening day (Level 2 Trait for the 5 pitch players), Skill Points, 6-node tree in 3 tabs with the A2/D2 fork, respec, Level 3 and tiers 3-5 shown locked |
| 4 | Gacha hero collector | Starter pull (coins only), odds table, pity bar, card reveal with Signature move, Squad 8/12 grid, slice end with trophy track and Cup Final locked |
NOT IN (as on the GO card): season table and Cup Final play, shootout, audio, tree tiers 3-5, pull 2+, rising stat numbers, stamina, training, stadium conditions, album pages.
House: seeded RNG, Tweak menu (every rule number) + Save preset slots + preset code + Copy report (per turn: hand, card, action, odds, dice, result) + DEV badge, installable PWA, network-first SW, build id on start screen.

## Checks
- e2e (tests/squad-duel/e2e.js): full slice twice at 344x882 + 475x638 smoke; no page scroll, buttons >= 56 px, same seed = same report, no console errors. All pass.
- Visual QA (docs/squad-duel/VISUAL-QA.md): PASS, 0 blockers, 6 polish notes (P1-P6) left as options.
- Bot gates (docs/squad-duel/BOT-GATES.md): 28 PASS, 1 EXPECTED-FAIL (formation spread v Grimsby 3.7 < 5), 11 MISS (balance numbers, M's call). Engine matches the reference bot match5 exactly on 300 seeds.
- Fixed during build: A2 Keep the Thread kept Build was wiped on possession change (engine.js); scene.js negative rect on first draw.

## Proto question for M
Does picking the player each turn feel like a real choice? Bot says not yet: a bot that plays the role-owner card is as good as the skilled bot (gap +0.4 / +0.3 points), same as bot5. Copy report after a match lets you answer it.

COST: about 90 agent minutes (18 Sonnet 5.5 agents + Opus 5.5 lead), against a guess of 515 (range 233-515). Under 25% of budget: under-delivery alarm checked; coverage table re-run on the running build, all 4 must-haves IN, nothing cut.
Lessons applied: R1 M text first (must-haves word for word), R3 thin slice of every must-have in the picked look, R4 coverage table, R5 intent check on the running build, R10 under-budget alarm, 5 Fold cover 56 px, 9 named bots with 3000+ seeds, 13 reduced motion covers SVG, 14 build -> e2e -> report, 15 saves try/catch never downgrade, end screen stray-tap guard.
