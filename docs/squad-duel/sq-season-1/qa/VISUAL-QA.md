# Visual QA: Squad Duel sq-season-1, Fold cover 344x882 @2x, blockers only

One pass, one size. Served pages/ over python http.server, Playwright chromium, seed=7, fast=1. Shots and `audit.json` (per-screen measurements) are in this folder.

Viewed in full at 2x: start, hub, table, fixtures, matchday result (post-match and matchday-results, real flow), manager (plain + with Captain row), card detail, cup intro, match turn (home, away, cup/neutral), shootout (after kick 1, finished), season end (cup won, no final), pull, pull reveal, tree with tier-3 nodes. Compared against the U3, U7 and U9 lock PNGs: layouts are close, no far deviations.
Measured on every screen: console errors (none), page scroll (none, doc height 882), horizontal overflow (none), buttons under 56px tall (none; all enabled buttons measure 56 or more), text under 12px (none).
NOT done: other sizes, tap behaviour, a mid-shootout state at kicks 2-4 (the 3-click run finished the shootout), real play-through of home/away/cup matches past turn 1, the Captain row with a captain chosen.

## Blockers (7)

| # | Screen | Element | What is wrong | Measured | Fix option A (recommended) | Fix option B |
|---|---|---|---|---|---|---|
| 1 | Manager, with tier-3 Captain node (S3) owned | `#btn-kickoff` over `#form-spear` (and `#form-diamond`) | Sticky Kick off button covers the Spear formation card; Diamond is cut by 1px. Spear cannot be tapped and the screen does not scroll. Shot `06-manager-s3.png`, `06c-manager-scrolled.png` | kickoff top 818px; spear 824-880px; no scroll container (doc 882) | Make the manager body scroll with bottom padding equal to the button height | Compact the Captain row (one line, 2-row chips) or move formations above the pitch so all three fit |
| 2 | Pull (coins below cost) | `#btn-pull` text "Need 100 · you have 0" | Disabled button text is dark-on-dim-teal and hard to read; it carries the only reason the pull is blocked. Shot `15-pull.png` | about 3.4:1 (pixel sample); button opacity .45 | Keep button full strength, grey fill, light text 4.5:1 or more | Leave disabled look but move the "need 100" line to plain text above the button |
| 3 | Match turn, away (Bolton) | `.seg.w-dribble` in club-picks bar | "DRIBBLE 25%" runs into "THRU 25%"; the text is cut by its segment. Shot `09-match-md2-away.png` | content 96px in 82px segment | Abbreviate labels to "DRB 25%" or hide the word when the segment is under 90px | Make the bar two rows (label row, bar row) |
| 4 | Match turn, cup final | hand card star pill (Pip "Dribble 66%") | Pill text pokes past the card border on the right. Shot `09-match-cup.png` | text ends about 338px, card edge about 335px | Shorten to "Drb 66%" with the star | Reduce pill padding and font to fit 3 digits plus star |
| 5 | Match turn, cup final | scorebug `.sb-team.sb-home` / `.sb-away` | Team names truncated to "PREST…" and "BOLT…" when the CUP FINAL chip is shown. Shot `09-match-cup.png` | 62px content in 58px, 53 in 50 | Drop the team names to 3-letter codes (PRE, BOL) when the chip shows | Move the CUP FINAL tag to the second row under the ribbon |
| 6 | Shootout (kick 1 and later, finished) | duel panel name `b` ("MIREL…"); kicker card `.rl` ("Winger keep…") | Kicker name ellipsised in the YOU column; the card rule line "keeper reads" is cut and its inner `u` runs past the viewport. Shots `10-shootout-start.png`, `11-shootout-mid.png` | name 84px in 82px; `.rl` 117px in 83px; `u` right edge 357px (viewport 344) | Allow the name to shrink (font-size clamp) and wrap the rule line onto two lines | Show only a "READ" tag on the card; full wording in the duel panel |
| 7 | Tree, tier-3 area (also T1-T3 nodes) | `.nd-text` | Node rule text cut mid-sentence by a 2-line clamp ("…no blur) for…", "…after you chose a card and an action…"). Full text only after selecting the node. Shot `16c-tree-t3.png` | content 42px and 98px in 28px | Allow 3 lines in the node row | Keep the clamp but add a "tap for more" cue (lowest severity) |

## Not blockers, logged for the lessons file
- `?jump=mdres` shows only "No matchday to show yet." because the jump code nulls `lastMd` (app.js, `table`/`mdres` branch). The real flow (`05c-mdres-real.png`) is fine. Tooling only.
- Season end, no-final state: "Finished 1th" (ordinal bug; shot `14-end-nofinal.png`). Also a 1st-place team getting "No final" comes from my forced `season.done` state, so probably not real.
- Tree locked nodes: description text about 4.0:1 at 60% opacity (locked, readable but under 4.5:1).
- Pull reveal modal has about 200px of dead space inside the card (`15b-pull-reveal.png`). Pull top bar lacks the "S1 MD4" chip the U9 lock shows.

## Self-review
Went well: one pass, all required screens reached, pixel and DOM checks agree. Slowed me: mdres jump is empty (had to build a real flow); the 3-click shootout skipped the true mid state; the contrast helper misread gradients so I sampled pixels instead.
Improvements: (1) Add a `?jump=` state for shootout mid and for Captain-owned manager (benefit: no manual state patching). (2) Make jump=mdres keep `lastMd` (benefit: real screen reachable). (3) Add a shared audit script to the repo (benefit: repeatable blocker check).

## Status
Done. Next: main session asks the user the fixes per blocker. Blockers: none for running. Feedback: fix #1 first, it hides a game choice.
