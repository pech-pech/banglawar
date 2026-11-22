QA inspector: initial pass, M-directed (39 states, 14 close-ups viewed)

Scope: 3 viewports (344x882, 624x912, 816x568) x 13 states (home with/without note, chart card-0 and card-1, order buy, order sell + rejection, week 1, week 10 final, review This period, review Journal, Settings). Captures at 2x in qa/vqa-ui2/. Scripted checks on every state: hscroll, console/page errors, NaN/undefined, tap targets under 48 px, off-viewport elements. Results: 0 console errors, 0 hscroll, 0 NaN/undefined, all primary/secondary bar buttons and order sheet buttons >= 48 px and inside viewport. Mint is only on primary buttons, OK checks, and chart/evidence "lift" text and MACD/equity lines (see note). Red never appears.
Not viewed at 2x close-up: Journal tab at 624/816, Settings at 624/816 (captured and scripted-checked only). Mockup PNGs were NOT pixel-compared side by side; the check was against the contract rules only.

## Blockers (4)

1. Chart P&F: "Sell ▼" signal label collides with "Target 97.0" label, text overprinted
   - File/selector: src/pfsvg.js, `#pf` signal triangle label vs target label (only when the target line sits just below the signal column)
   - Size: 344x882, ZGT (card-0), chart screen. Also near-touch at 624 (Sell ▼ / Target 97.0 within 1 row).
   - Crop: qa/vqa-ui2/B1-chart344-sell-target-overlap.png (full: 344x882-chart-card0.png)
   - Fix A (recommended): when the target label would overlap another label, move the target label to the left end of the dashed line (or right-align it above the axis). Cost: small collision rule in pfsvg.js.
   - Fix B: drop the in-chart "Sell/Buy" word, keep only the triangle. Cost: loses the text cue; colour+shape stays.

2. Period review equity chart: y-axis labels "9,000" and "8,800" overprint each other (floor label on top of the nearest axis tick)
   - File/selector: src/panes.js `eqChart` axis labels, review "Equity vs benchmark" card
   - Size: all three (344x882, 624x912, 816x568), This period tab
   - Crops: qa/vqa-ui2/B2-review344-axis-9000-8800.png, qa/vqa-ui2/B2-review816-axis-9000-8800.png
   - Fix A (recommended): skip any axis tick within ~1 label height of the floor value, so only the orange "9,000" shows. Cost: one condition.
   - Fix B: pick axis ticks so the floor lands on a tick (min = floor - step). Cost: slightly taller scale.

3. Review header subtitle is clipped at 344: "Weeks 1 to 10 · e..." (the words "end of period" are cut). Breaks "nothing clipped".
   - File/selector: `#top .sub` on `SCREENS.review` (src/review.js / base.css `.top .sub` ellipsis)
   - Size: 344x882 only (624 and 816 show the full "end of period")
   - Crop: qa/vqa-ui2/B3-review344-header-clipped.png
   - Fix A (recommended): shorten subtitle at narrow width ("Wk 1-10 · ended" or drop "end of period"). Cost: wording change.
   - Fix B: allow the sub to wrap to a second line under the title. Cost: header grows ~14 px at 344.

4. Tap target under 48 px: DEV badge button (`#devBadge`) is about 75x19 px on every screen. Rule says tap targets >= 48 px.
   - File/selector: `#devBadge` / `.top .dev` (src/pro.css line 29, src/base.css line 12)
   - Size: all viewports, all screens
   - Crop: qa/vqa-ui2/B4-devbadge-344.png
   - Fix A (recommended): keep the look but pad the hit area to 48 px high (invisible padding or ::after hit box). Cost: small CSS; no visual change.
   - Fix B: accept as a dev-only control and log an exception in the contract. Cost: leaves a documented rule break.

## Minor polish (count only): 6
(start-card icon is a bare dot square; empty band under the axis inside the 344 P&F card; toast overlaps the RSI card at 816 during order rejection; 816 P&F has large empty left grid; RSI "70/30" labels touch the value pill at 816; "lift" text and OK lines use mint outside primary/OK checks, borderline vs the mint rule.)

## Self-review
- Went well: scripted audit across all 39 states caught zero runtime/hscroll/NaN issues quickly; blockers found by viewing the 2x frames.
- Slowed: mockup PNGs not compared side by side to stay inside the blockers-only time box; Journal/Settings at 624/816 only scripted-checked.
- Improvements: (1) "Overlap detector": add a bounding-box overlap check for svg text elements to the audit script, benefit catches label collisions like 1 and 2 without eyeballing. (2) "Mockup diff": add an optional pixelmatch pass against the target PNGs, benefit surfaces layout drift. 

## Status
Done: one pass, 4 blockers. Next: user picks fix options; then targeted recheck of pfsvg label, eqChart axis, review header, dev badge. Blockers: none. Note for administrator: capture script is at /tmp/claude-0/-home-user/e3311518-e9dc-5fd9-85ab-0e1bad16701f/scratchpad/cap.js.
