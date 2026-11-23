# Build changes: sq-season-1 (season, Cup Final, shootout, more pulls)
Date 2026-11-23. Base main 48c26a2 (sq-ui-1). M's GO 18:09 UTC "GO, build as shown". Live after merge: https://pech-pech.github.io/banglawar/squad-duel/ (build id sq-season-1 on start screen; reopen the app twice so the service worker swaps).

## Coverage table (re-run against the running build)
| # | Must-have (M's words) | IN this build |
|---|---|---|
| 1 | Football manager genre | Season hub, 8-club league table + fixtures tab, home and away, 7 clubs with scout lines + hint chip, Easy / Normal / Hard (Tweak > Season), squad up to 20, pick 5 + 2, Captain |
| 2 | Stadium scene turn based matches | 7 league matches + Cup Final in the night stadium, mode label home / away / neutral, club-side Roar when away, shootout in the Cup Final only (rule F + 2, rule R), 5 new club styles. Duel core as played in slice 1 |
| 3 | Progression system and skill tree | Level 3 and 4 (stat old -> new shown), Stars, tree tier 3 (Second Look, Press Master, Captain), tiers 4-5 shown locked, autosave + Continue (mid-match resume), next season (+1 club stats a season, max 12) |
| 4 | Gacha hero collector | Pulls all season (Coins only), 8 new players (pool 13, grid 20), Epic and Legend pity bars, pity picks unowned, dupes to Star pips, last 5 pulls |
NOT IN (as on the GO card): audio, training, stamina, stadium conditions, match events, promotion, tree tiers 4-5, banners, album pages, club star men, extra time, tuned season 2, card-rest rule, faster grid fill, desktop layout, second save slot.
Content counts: 7 clubs (5 new), 8 new players, 3 tier-3 nodes, 11 screens/states (U1-U11). No under-delivery.

## What changed (files)
New: js/season.js, js/shootout.js, ui/season.js, ui/shootout.js, css/season.css, css/shootout.css, tests/squad-duel/bot-season.js, tests/squad-duel/e2e-season.js.
Changed: js/data.js, js/progress.js (save v2), js/gacha.js, js/engine.js (home side, Roar mirror, neutral, new fx hooks, once per half, skipExtra), js/fx-nodes.js, js/fx-players.js (8 Signatures, Wing Switch fix), js/app.js (season router, cup -> shootout, resume by input replay, ?jump=), ui/match.js, ui/match-acts.js, ui/match-cards.js, ui/manager.js, ui/meta-a.js, ui/meta-b.js, ui/tweak.js (Season / Clubs / Pulls groups, search, collapse, +/-), index.html, sw.js, tests.

## Tests
- e2e.js (updated for the hub flow) 0 FAIL; e2e-season.js 0 FAIL (206 checks, 344x882 + 475x638, full season, cup, shootout, resume, same-seed replay).
- bot.js (slice gates): d6, chip (20000 duels, worst 0.54 pt), cap +3, replay PASS. Content rows change as expected.
- bot-season.js: 32 HIT, 27 MISS, 23 INFO. Full table docs/squad-duel/sq-season-1/BOT-SEASON.md.
- Visual QA 344x882: 7 blockers found, all fixed (docs/squad-duel/sq-season-1/qa/).

## Balance misses (reported as misses, not tuned: M's call)
- Hard ladder skilled win % MD1-7: 54.9 / 57.6 / 54.4 / 59.6 / 58.6 / 61.9 / 52.5 v 60 / 52 / 52 / 50 / 48 / 46 / 42 (late clubs too easy).
- Season 1 top 2: 67.2% (band 45-60). Cup Final when reached: 72.3% (band 40-55). Shootout order gap +1.4 (band 3).
- New Signatures mostly weak: only Orlo's move hits +2..+12. Twin Run now optional: -1.3 / +0.2. Whole players overshoot: Maelis +37.5, Ruvo +24.8, Orlo +21.3 v Reading.
- Rotherham: no row with attack <= 8 and DEF <= 12 lands MD5 near 48 with 0-0 under 20%. Left at 10 / 9 / 10 (MD5 61.0).
- NORMAL is the default and is NOT tuned: +14.2 win points over Hard, Easy +26.4 (bot, no band). M's first season sets where Normal should sit.
- Season 2: top 2 79.7%, Cup within two seasons 72.0% (no band yet).

## Admin defaults (say if wrong)
- Second Look: shows the club's real stance this turn after your pick, then you may re-pick once (the UI already let you change before confirm).
- Twin Run: second shot is optional ("Skip shot" button).
- Saves from the 2-match slice do not carry over (new save key).
- Shootout: a reload mid-shootout restarts it from kick 1 (same coin).
- Club team strength for other results: SEASON-SPEC 3 TS column (draws 24.6% v 27 target).
- Captain picks from the 5 pitch players.

## Lessons applied
CHECKLIST 0 (M's words verbatim in coverage), 4 (PR + Pages + PWA, seeded RNG, Copy report), 5 (Fold cover, 1 size QA), 6 (admin defaults labelled), 9-10 (bots report bands, no self-tuning of M's targets), 11 (one QA pass before M sees it), 14 (build -> e2e -> report from final run), 15 (save never downgrades), 18 (lead plans and merges only).

COST: about 130 agent minutes (16 makers + integrator + bot + QA + 2 fixers), no credits. Guess was 400 (300-600).
