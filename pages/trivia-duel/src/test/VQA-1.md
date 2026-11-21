# VQA-1 Candle Duel, initial visual pass (475x638, DPR 2)
Captures: src/test/vqa1/*.png (01 home, 02/02b home set + 14 W name, 03 settings, 04/04b duel q1, 05 revealed, 06/07 q2, 08/08b wager, 09 q7, 10 result, 11 home after, 12 portrait, 13 dev).
Viewed: home, duel q1, duel revealed, wager, result, settings (top), long-name home, portrait crop, ?dev=1 home. NOT viewed: timeout-expired state, rival "answered" chip mid-question, win/draw banners, settings below fold, DEV badge when ON (judged from CSS only), q2/q7 PNGs captured but only measured. Console errors: none.

## Defects (ranked)
1. HIGH, home: Duel button cut off. Screen scrollHeight 694 vs 638; #btn-play y596-660 (22px below viewport, 3.4%). Build line bottom 684. Scrolling works but also pushes gear off-screen (y -46 after scroll) and fresh users see only the top half of the button.
   A (recommended) Tighten home: shrink title block + rival card padding, drop warn line into rival card (needs ~56px).  B Pin Duel button as sticky footer, scroll the rest.  C Shrink topic tiles 72->56 and stepper row (saves 32px; still short by ~24).
2. HIGH, result: "Rematch" label overflows its 64px round seal (text ~150px wide, spills both sides of the circle, x15-170 over a 64px disc at x14-78); button orphaned left with empty row beside it. Wager "Go" seal is the same 64px orphan, left-aligned.
   A (recommended) Make Rematch and Go pill buttons (like #btn-play/#btn-next, width auto, 56px high) centred/full width.  B Keep round seal, put label under it in small text.  C Icon-only seal with aria-label.
3. HIGH, home contrast: rival name gold #d9a441 on parchment #efe2c2 = 1.75:1 (fails; 16px). "Your rival" / "Seal colour" ink at opacity .65, 13px, about 4:1 or less on parchment.
   A (recommended) Rival name in ink #2a1d10 (12.7:1) bold, gold only as underline/ornament; raise muted opacity to .8.  B Put name on a dark plaque strip with gold text (8.2:1 on stone).  C Darken gold to #7a5410 on parchment only.
4. MED, duel: layout shift on answer. Chips row appears and pushes question 162-136=26.. measured: question card + answers move down 25-26px (answer 1 y136 -> 162; q2 161 -> 186). Targets move under the finger just after tap, and chips line hides nothing when empty.
   A (recommended) Reserve the chip row height (visibility hidden) from the start; layout stays still.  B Overlay chips on the card's top edge, no reflow.  C Accept shift (cheapest).
5. MED, duel revealed: wrong answer (Reparo) text renders dull grey-pink on dark red, visibly lower contrast than right answer; right answer is muddy olive (#d8e08a->#a9bf4a) with dark text, reads as "dim" next to grey dim answers (opacity .4 + desaturate). Chosen-wrong vs right is distinguishable only by hue (colour-blind risk: red vs olive).
   A (recommended) Add icon/mark (check / cross) and brighter text on wrong; make dim answers lighter touch (opacity .55).  B Use gold glow + ring only on right, plain dark on wrong.  C Leave colours, add text label "Correct".
6. MED, DEV badge: fixed 22px at top 4 / right 4 (x449-471,y4-26) overlaps the 64px gear seal on home (x397-461,y10-74) when ON (CSS-derived; ON state not viewed). Also below the 56px target spec and pointer-events none so fine to tap through, but it hides part of the gear rim.
   A (recommended) Move badge to top-left or bottom-right corner.  B Offset left of gear (right: 70px) on home only.  C Keep, shrink to 16px.
7. MED, topbar/portrait: rival mini portrait in duel is ~35px (70px @2x); face features are 1-2px dots, reads as a face blob; no rival name on duel screen. Home portrait (72px) reads as a generic cartoon figure with no actor likeness: PASS. Player seal "Z" is fine.
   A (recommended) Enlarge duel mini portrait to 44px and add short rival name under/beside it.  B Keep size, simplify to larger eyes/hair silhouette.  C Leave.
8. MED, mode toggle state: selected Movie/Book differs from unselected by a gold ring only; both are dark brown with same text, easy to misread at a glance (02 vs 02b).
   A (recommended) Selected = parchment fill with ink text (like topic tiles); unselected = dark.  B Add check mark.  C Leave.
9. LOW, home swatches 44x44 (below the 56px target); stepper input 56x44 (value box), +/- are 43x56 (width 43 < 56). Chips and Next (90x56) pass; answers 447x56, topics 144x72 pass.
   A (recommended) Swatches 56px (fits 4 across, cost 12px vertical, pair with fix 1).  B Keep visual 44 and extend hit area to 56 with padding/pseudo-element.  C Leave.
10. LOW, wager/result: ~60% of screen empty below content (wager content ends y323, result y410 of 638); text lines left-aligned over wide dark space, wager title "Final question" and score lines have no card grouping. Feels unfinished versus home.
   A (recommended) Vertically centre content in a parchment card.  B Add rival portraits and a candle ornament.  C Leave (prototype).
11. LOW, settings: DEV tweak panel 1.8k px tall in a 638px screen (internal scroll), 30+ rows, camelCase keys, Back seal at the very bottom (y1800), unreachable without long scroll. Acceptable for dev, but Back should be reachable.
   A (recommended) Sticky Back at top/bottom.  B Collapse into groups.  C Leave.
12. LOW, home: 13px type for Lv/XP, Rival n/5, warn line, build id; below 14px minimum for a kids game. Warn line cream on stone is fine (11+:1).

## Passed
Duel q1 fits with no scroll (answers 447x56, text 17-19px, ink 12.7:1); timer bar clear; question fits one line; wager and result buttons not clipped; no console errors; no h-scroll; long name "WWWWWWWWWWWWWW" fits input.
