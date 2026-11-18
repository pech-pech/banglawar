# QA recheck: Golden Over (2026-11-18)
tools/qa-shots-golden.mjs did not exist; used the helper's shots in /tmp/claude-0/go-shots/ (all 6 viewports present). Viewed full size: 475x638 ready/summary/cal, 344x882 summary, 624x912 ball-result, 704x783 summary, 704x823 mid-ball3, 816x568 summary. Measured glyph heights by pixel. Not viewed: the other states at 344/475 (mid, pick, after, resumed), pick/cal/over-panel at 624-816, no 2x crops this round, no animation moments.

## Fixed since first pass (verified)
- Empty dark bar in ready state: gone (475, 344).
- Summary text: 13 px glyph height with descenders (about 14 px font) at 475 and 704. Box now fits text and wraps; still overlaps one fielder at 344/475/816 (minor).
- Calibration screen now cream/green S1 palette (475).
- Gold ring on all six circles after the over: present on every viewport, "6" circle now single style.
- Floating result float on field at 624 (PERFECT / 2 RUNS), no reserved text row, current ball dashed ring (704x823).

## Remaining
1. LOW. "1 ms early" tick text in the ball-result float (624x912) measures 10 px glyph height, about 11-12 px font, under 14 px. Options: (a) raise to 14 px [recommended]; (b) drop the line; (c) accept.
2. LOW. Calibration helper line "Tap the pad on the beat. 1 of 10" and "Cancel" look about 12 px at 475 (not re-measured; eyeball). Options: (a) 14 px [recommended]; (b) measure first; (c) accept.
3. LOW. Summary box still sits over a fielder (dimmed, 344/475/816). Options: (a) move to the top strip; (b) accept [cheapest].
4. LOW. Dashed focus outline still shown on NEXT OVER (344, 475 summary). Options: (a) :focus-visible only [recommended]; (b) leave.
5. LOW. Recalibrate button size not re-measured (was about 53 px tall); looks unchanged in 475 ready. Options: (a) pad to 56 px; (b) accept.

## Verdicts
- 344x882: PASS (low items only)
- 475x638: PASS (low items only)
- 624x912: PASS (item 1)
- 704x783: PASS
- 704x823: PASS
- 816x568: PASS (item 3)
Caveat: PASS means no high/medium defects in the states viewed; coverage was partial as listed.

## Self-review
Went well: pixel measurements, all 6 viewports reached. Slowed: tool missing so I polled; naming of shots differs per viewport. Improvements: (1) fixed shot naming across viewports; (2) font-size DOM dump; (3) always capture 3 moments per ball.

## Status
Done. Blockers none. No choices needed now.

QA inspector: initial pass, M-directed (13 states, 0 close-ups viewed)
