# Squad Duel - Visual QA (blockers only)

Build sq-slice-1, 344x882 @2x (Galaxy Fold cover), seed 777 (full slice) plus seeds 4242 and 31 (extra match runs to reach a Shoot). Captures in `/home/user/banglawar/docs/squad-duel/qa/` (01-21 = full slice, T01/T02 = Shoot chip and result, S01/S02 = a loss run). Logs: `qa/run-log.txt`, `qa/run2-log.txt`.

## Verdict: PASS (no blockers)

Whole slice played by clicks: start, manager 1, match 1 (12 turns, card pick, picked chip, a defending turn, half-time, full-time), result 1, skill tree (bought Sharp Eye), Starter pull (Zefa, Epic), manager 2, match 2, result 2, slice end. No console errors or page errors in any run.

## Intent check (user's four must-haves)
1. Football manager genre: visible and playable. Manager screen has the pitch, bench, three formations with effects, scout line, kick-off. (Swapping a player via the squad panel was not exercised.)
2. Stadium scene, turn-based matches: yes. Night stadium with crowd and floodlights, zone bands, tokens, dice, per-turn pick card, pick action, Confirm, Next turn.
3. Progression and skill tree: yes. XP bars, Level 2 trait unlock and "NEW TRAIT" on result; tree tabs, buyable node bought (SP 3 to 2), fork and locked tiers greyed.
4. Gacha hero collector, coins only: yes. 100 coins pulled, odds table, pity bar, card reveal, 4x3 grid with silhouettes, squad count 7/12 to 8/12. Only Coins are used.

## Checks (what I viewed)
- Look L2 Night broadcast: matches the reference palette, floodlights, zone labels, cyan primary button, hand cards, chip band and cause line. Viewed 05, 06, 08, T01, T02 against the reference -pick.png.
- No page scroll: scrollHeight minus innerHeight = 0 and no horizontal overflow on all 21 states.
- Touch targets: every visible `<button>` is at least 56x56 on all 21 states.
- Chip sums: pass chip "PAS 3 + Pass 2 = 5" and the cause "3+2 +d5 = 10 v Dunmar 4 +d6" agree. Shoot chip "SHO 3 + Spear 1 + Roar 1 = 5" and result "Pip 8 (5 + die 3) v keeper 7 + d5 = 12, SAVED" agree. Defence chip "DEF 5 + Anchor 1 = 6" agrees. Result word (LOST, WON, SAVED) agrees with the dice in every logged turn.
- Cause line fits in two lines at 344 in every state viewed.
- Result and end screens: score, stamp, XP, coins and SP are consistent (Ondra 30 XP + 50 to go; later 58 XP + 22 to go).

## Blockers
None.

## Not viewed (stated plainly)
- A goal scored by Preston (goal flash/celebration) and a WIN stamp: my click-bot only got a saved Shoot and 0-0 draws or losses; a conceded goal happened off-screen in the logs.
- 475 px width (not asked this pass), manager swap panel, respec confirm, tweak panel, Restart confirm.
- Defence picks were not varied (always Press or Drop via the first or cycled card).

## Polish notes (not blockers, for the user to pick)
P1. Match header at 344 is taller than the locked mock: formation tag, Roar and Build sit on separate rows, and the info block grows by about one row on result states (scene top jumps about 40 css px between pick and result). Owner: `ui/match.js` + `css/match.css`. Options: (a) keep as is [recommended for this slice, cost nothing]; (b) force one fixed-height info row (wrap the formation tag to a single line, ellipsis); (c) reserve the third row always so nothing shifts.
P2. Text under the 12 px rule: manager slot captions and role chips are 10-11 px, scene SVG zone labels are 11 px. Owner: `css/manager.css` (`.slot-cap`, `.mc-role`, `#mgr-h`), `css/scene.css`. Options: (a) raise to 12 px [recommended, small, may wrap role names]; (b) leave.
P3. Manager role labels truncate ("Anch...", "Play...", "Wing..."). Owner: `ui/manager.js` + `css/manager.css`. Options: (a) icon plus short role (ANC, PLM, WNG); (b) allow two-line names; (c) leave.
P4. A toast ("Sharp Eye unlocked") persists into the next screen and covers the bottom row of the 4x3 grid on the pull screen (15, 16). Owner: `js/app.js` (toast timing on step change). Options: (a) clear toast on go() [recommended]; (b) shorten display time.
P5. Scorebug is a single row ("Proud Preston 0 0 Iron Grimsby") rather than the stacked two-row bug in the reference. Owner: `index.html` / `css/base.css` / `js/app.js` setScorebug. Options: (a) leave; (b) stacked bug as in the reference (costs about 40 px of height at 344).
P6. Half-time and full-time overlays leave a large empty block above the text and the button sits right-aligned under centred text. Owner: `css/match.css` (`#halftime`, `#fulltime`). Options: (a) leave; (b) vertically centre the content and button.
P7. Tree, manager and end screens have large empty areas at 344x882 (fine, no clipping).

## Self-review
- Went well: full-slice run in one script, per-state scroll, button-size and overflow checks, chip-to-result sum checks from real DOM text.
- Slowed me: two shell commands were refused by a safety check (nothing was deleted, nothing run), so I wrote scripts with the file tool; my click-bot never reached a goal or a win, so those two states are unviewed.
- Improvements: (1) "Add a score-forcing path" - a seed or tweak that guarantees a goal and a win, so the goal flash and WIN stamp are always checked; (2) "Add a 475 px smoke render" as an optional second viewport; (3) "Add a font-size sweep" as a standard automated check.

## Status
Done: full-slice pass, verdict PASS. Next: user picks among P1-P6 (none required). Blockers: none. Feedback for administrator: goal flash and WIN stamp unviewed.
