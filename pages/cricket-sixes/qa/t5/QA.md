# QA t5: Coach weekly UI (independent check)

Checked against SPEC.md sections 8 and 10. All 11 shots viewed at full resolution, with 2x crops of the strip, picker, away card and step-up card. Contrast was measured from screenshot pixels (WCAG relative luminance, dominant colours per region).

## Verdict: FAIL (4 defects, 2 minor)

## What passes
- Job chips: 70.9x56 at 344 wide and 114.6x56 on Fold. Words are whole at 14px ("Study", "Match", "Scout", "On course"). Text contrast is 10.7 (Study), 7.5 (Match), 6.5 (Scout) and 9.5 (On course).
- Picker sheet (02): Study tape and Scout rows can be picked (62px high, label contrast 10.7 and 12.7). Nets and Match are greyed and dashed, with reasons "Not the nets coach" and "Another coach is Match coach". Close is 300x56. Tapping Scout updated the chip (03).
- XP bar: no digits. Fills match `floor(xp/need*10)`: 01 shows 1, 2 and 0 segments (step 10 needs 200 and has 40 XP, so 2 is right). 08 shows 9 of 10 (99/102). 07 (away) shows 0.
- Away coach (07): the card is greyed with "Back next week" and the chip reads "On course" with a flag icon.
- Layouts: with 3, 2 and 1 coaches, each coach gets its own column with chip and bar, and empty slots show "Sign a coach". No horizontal overflow in any shot (scrollW equals clientW).
- Fold 475x638 with 3 coaches: the strip runs from y82 to y272. RUN NETS runs from y572 to y628, fully visible with no scroll and not clipped.
- Every measured font is 14px or larger. No Clinic button, sheet, wheel or home dot appears in any shot. The new elements do not overlap existing UI.
- Step-up card (09/10): "Coach Mehta is now E-" is right (step 3 F+ to step 4 E-). The text is 18px with contrast 12.7. OK is 272x56. The card appeared on its own after EndWeek.

## Defects

### D1 (major): you cannot see the XP bar track
Measured: an empty segment `rgba(255,255,255,.18)` on the cream background (243,235,211) gives **1.03:1**. A filled segment #f5c542 on cream gives **1.36:1**. Graphical objects need at least 3:1 (WCAG 1.4.11). In 07 the away coach's bar is effectively invisible. In 01 the three bars read as one dotted line across all columns, because the gap between columns (about 5px) is close to the 2px gap between segments.
Options:
1. Give empty segments a dark tint, for example `rgba(42,34,56,.25)` with a 1px #2a2238 outline. Darken the filled colour to about #b8860b, or keep #f5c542 and add a 1px #2a2238 border.
2. Put the bar inside a dark pill track (#2a2238 background, 2px padding) so gold and empty segments both show against it.
3. Also widen the gap between coach columns, or align each bar to its chip with a 4px inset, so each bar clearly belongs to one coach.

### D2 (major): greyed picker rows are below 4.5:1
Measured: the label and reason text (130,126,133) on (240,237,219) gives **3.38:1**. The reason ("Not the nets coach") is information the player needs, so it should meet 4.5.
Options:
1. Darken the locked text to about #5f5a66 (around 6:1) and keep the dashed border and lighter fill to show "locked".
2. Keep the label grey but print the reason line in the normal ink (#2a2238) with a lock icon.
3. Mark rows as locked with a lock icon and the dashed border, and use normal ink for all text.

### D3 (medium): the step-up OK button is an unstyled browser button
In 10, OK uses the Chrome default style: background #efefef, a 1px grey rounded border, and pure #000 text. Every other button in the game has the pixel style with a green or dark 2px border. Contrast is fine (18:1), but it looks broken next to the X button and the picker's Close button.
Options:
1. Give `.cw-stepup-ok` the same class or style as the picker's `.cw-close` (cream fill, 2px #2a2238 border, ink text).
2. Use the game's primary green button style, since OK is the only action on the card.
3. Remove the card's OK and let the sheet's X and a full-width Close button dismiss it. This also fixes D6.

### D4 (medium): with zero coaches the strip never says "No coach" (SPEC section 10)
In 06 there are three "Empty slot / Sign a coach" boxes. Section 10 says "Zero coaches: strip shows 'No coach'".
Options:
1. When `coaches.length === 0`, replace the three slots with one full-width card: "No coach" above "Sign a coach".
2. Keep the slots and add a "No coach" heading above them.
3. If the empty-slot design is meant to stay, change spec section 10 to match. That is a spec change, not a build change.

### D5 (minor): focus tags clipped on portrait cards at 344 wide
In 01, 04, 07 and 08, the focus-tag icons to the right of the grade box are cut at the card edge: only a 2-4px sliver shows (Mehta, Merrick, and half of Okonkwo's). At 475 (shot 11) they show in full. This is likely the existing card and not new in t5, but section 8 lists focus tags as part of the card.
Options:
1. At narrow widths, wrap the tags onto a second line under the portrait.
2. Show at most one tag icon at 344 and drop the rest, with no partial icons.
3. Hide tags below a 90px card width and show them in the picker sheet header instead.

### D6 (minor): copy and close buttons in the sheets
- The picker effect lines repeat the row label and use the internal word "EndWeek" ("Study tape: +12 XP at EndWeek"). Suggested: "+12 XP at week end" and "+8 XP and 1 scout name".
- Both sheets have a top-right X as well as Close/OK. Section 8 asks for "one big close button".
Options:
1. Change the copy as above and drop the X on these two sheets.
2. Keep the X (it comes from the shared sheet component) and change the copy only.
3. Give the effect text its own `effect` field in the job data, without the label prefix, so the copy can be tuned.

## Not visual (for the build owner)
- Fixture coach 0 had `job:'nets'` but shows Study, and no shot ever shows a Nets chip. The section 10 case "Only coach is the nets coach: he is Nets" is not covered by any shot. In 05 the only coach is shown as Match.
- 09 and 10 are byte-identical, which is fine because the card appeared on its own.
