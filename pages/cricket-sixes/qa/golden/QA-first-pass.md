# QA first pass: Golden Over (Captain's Over) visuals

Run 2026-11-18. Inspector did not build it. Code not edited.
Viewed: 475x638 ready, mid, summary, pick, cal, after (full size) plus 2x crops of circle row (ready, summary), summary float, ready float; 344x882 ready (full size only; cal/pick files exist but not viewed). NOT viewed: 624x912, 704x783, 704x823, 816x568 (no files at time of check), 344x882 close-ups, reference stills proto-r3-344/475 (not compared pixel by pixel), animation moments.

## Verdicts
- 475x638: FAIL (1 high, 3 medium)
- 344x882: FAIL (partial; same empty-bar defect as 475x638 in ready state)
- 624x912, 704x783, 704x823, 816x568: NOT CHECKED (no screenshots)

## Defects (475x638 unless stated)
1. HIGH. Ready state, empty floating dark bar. 475x638-ready.png, bar across the field at y 174-194 (x 19-456, about 437x20 px), also in 344x882-ready (y 250-270). Empty translucent box with no text, sitting over the fielder row and the pitch. It reads as a bug. Options: (a) hide the float when it has no text [recommended, tiny]; (b) put "Get ready" in it; (c) keep it but only for result words.
2. MEDIUM. Floating summary text size. 475x638-summary.png, line "Taps 4 of 12. Runs 18, wickets 1, wheel average 7.6": measured 11 px ascender-to-descender, which is a roughly 12 px font, under the 14 px minimum. Title "Captain's Over" is 17 px tall and fine. Options: (a) raise to 14 px and wrap to two lines [recommended]; (b) 14 px with shorter wording; (c) keep and accept below spec.
3. MEDIUM. Summary box (x 19-456, y 104-190) covers two fielders (one at left, one at right, both dimmed) and the pitch centre. Options: (a) shrink the box to fit the text width [recommended]; (b) move it to the empty strip at top; (c) make it more transparent.
4. MEDIUM. Calibration screen (475x638-cal) is a plain dark UI, not S1 pixel look or house colours. Text "Tap the pad on the beat. 1 of 10" measures 10 px tall (about 11-12 px font) and "TAP" is 9 px cap height, both under 14 px. Options: (a) restyle in the cream/green palette with 14 px+ text [recommended]; (b) only raise text sizes; (c) leave as a utility screen.
5. LOW. Recalibrate button in field top-right measures about 103x53 px (inner bright area, measured from pixels, edges approximate), under the 56 px target height, and it covers the bowler's right side of the field. Options: (a) pad to 56 px min height [recommended]; (b) move below the circles; (c) leave.
6. LOW. Ball 5 ("6") circle shows a teal fill with an inner gold ring inside the dark border, in addition to the outer gold ring (475x638-summary, 2x crop). Other circles do not. It looks like a doubled ring and is inconsistent. Options: (a) remove inner gold on the six [recommended]; (b) keep as a six marker, decided by M; (c) use the same style for all.
7. LOW. Dashed blue focus outline is visible around the "Next over" button (summary) and the X button (after panel). Cosmetic, probably keyboard focus left on. Options: (a) :focus-visible only [recommended]; (b) leave.
8. INFO. Circle sizes: 48 px inner, about 52 px with dark border, about 56 px with gold ring. Result circles are not tap targets, so spec is met. Six circles only, ring on the current ball (dashed ring on ball 1 in ready), no reserved text row: spec met. Gold second ring present on all six after the over: spec met. Tap pad 115 px tall (y 515-630) and full width: meets 56 px.
9. INFO. Mid state (475x638-mid) shows no floating per-ball grade word and no visible ball in the frame. Cannot tell whether the result float fires at another moment. Needs a capture 100-600 ms after a tap. Not verified.
10. INFO. Figures look consistent in scale and S1 crisp. The "after" over panel (475x638-after) uses a different (stadium) art than the pitch view; that is the existing over panel, not part of this check.

## Lessons for the log (main session to add as QA-xxx)
- Floating text containers must be hidden when empty.
- Any in-game text must be 14 px min, including the calibration screen and summary line; measure glyph height, not CSS.
- Match ring style across all six circles.

## Self-review
Went well: measured pixels before claiming sizes. Slowed: only 475x638 (and a few 344x882) files existed; the other four viewports could not be checked and no animation moments were captured. Improvements: (1) Wait-for-all-viewports gate: block the report until all listed sizes exist. (2) Ask the screenshot tool to capture 3 moments per ball. (3) Provide DOM font-size dump alongside shots so text size is exact.

## Status
Done: first pass on 475x638, partial 344x882. Next: re-run on the four missing viewports and mid-ball captures. Blockers: no screenshots for 624x912, 704x783, 704x823, 816x568. No question needs asking first; each defect lists options.

QA inspector: initial pass, M-directed (6 states, 6 close-ups viewed)
