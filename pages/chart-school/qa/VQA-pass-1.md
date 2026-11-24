# VQA pass 1, Chart School cs-proto-1 (blockers only)
Viewed (344x882): desk, desk-after, reading-R1, marked-R1, marked-R4, order, evidence-w0, evidence-w9, summary, journal, rule, tweaks-changed. Viewed (475x638): summary, marked-R4. NOT viewed: other marked-R*, reading-R2..R7, evidence-w10, remaining 475 shots, no dsf 2 re-render, no console check, scroll-to-end of desk not tested (the 59% card is cut under the bar in the first viewport; #main has bar padding in style.css line 5, so likely reachable).
Checked OK: no forbidden words seen, no sideways overflow seen, one primary button per screen, blue X / orange O, RSI and MACD panes present.

## BLOCKERS (4)

1. Sheet summary rows overlap and clip. Shot: 344x882-summary.png (also summary-2). Row labels "Signal", "Trend line", "MACD" are overprinted by the orange "You: ... Engine reading: ..." text, and "Within 2 boxes above" runs off the right edge. 475x638-summary.png is fine, so it is 344 only.
   Fix (src/style.css line ~97, and the .mk row rule): `.mk .r` has `white-space:nowrap`. Change to `white-space:normal; text-align:right`, and make `.mk` `flex-wrap:wrap` (or stack: name on line 1, "You: ... Engine reading: ..." on line 2, full width, left-aligned) with `.mk .n{flex:0 0 auto}`. Optional: screens-a.js line 98, split into two spans "You: x" and "Engine reading: y".

2. Marked vertical-count chart: labels collide. Shot: 344x882-marked-R4.png (475x638-marked-R4.png same). "engine objective 416" and "your objective" overprint each other, "22 boxes" sits on top of the X columns, and the right-axis pills 416 / 174 / 171 are stacked touching (416 over 174). Hard to read which number is the answer.
   Fix: src/chart.js, the "line" overlay label drawing (overlays pushed at src/screens-b.js lines 200-201). Give labels a collision pass: sort by y, enforce at least 14px between labels, and push the later one down. Right-align line labels at the plot's left edge side, not over the columns. Put "22 boxes" beside the bracket with a dark background chip, or above its top. Apply the same minimum-gap rule to the axis price pills (416, 174, 171).

3. Objective drawn at the chart top with an axis that jumps. Shots: 344x882-evidence-w0.png, evidence-w9.png, marked-R4.png. The dashed objective line (416) is drawn right above the last price (171/155), but the axis goes 161 then straight to 416 with no labels in between. It looks like the objective is one box away when it is about 2.4x away (the value 416 is computed correctly; the picture misleads).
   Fix: src/chart.js. When an overlay line box is above the top visible row, do not draw it as a normal line. Draw an "objective 416 ▲ above chart" chip at the top edge plus a small axis-break mark ("~" between the last label and 416). The screens-b.js line 278 evidence call and line 200 marked call need no change.

4. Desk says "7 readings" but sheet 1 has 6. Shots: 344x882-desk.png ("7 readings", 7 dots, "Sheet 1 of 2") versus reading-R1 / marked-R1 ("Reading 1 of 6") and summary ("0 right of 6"). Sheet 2 has 7 (marked-R4 "4 of 7"). Misleading count, and the dots row does not match.
   Fix: src/screens-a.js line 56, the hard-coded `'7 readings'` text and the `dots` loop above it. Use the next sheet's reading count (sheet.reads.length, or whatever the code that builds `dots` already reads) for both.

## LATER (nits, not fixed now)
1. Desk 344: first-viewport 59% base-rate card is cut by the bar; add a bit more gap or shrink the accuracy rows (src/screens-a.js, src/style.css).
2. Dot-row label "Support / resistance" wraps to 3 lines ("resistanc / e") in 344 marked and journal; shorten to "Support" or allow a smaller font (src/ui-kit.js).
3. Orange "Marked" X for wrong sits next to the blue X glyphs; consider a neutral colour for marks (src/ui-kit.js).
4. Tweaks: "Columns shown" field is a plain text box, make it a stepper (src/tweak.js).
5. Paper order and rule screens have a lot of dead space below the card (src/style.css).

QA inspector: initial pass, M-directed (14 states, 0 dsf-2 close-ups; existing 1x shots viewed)
