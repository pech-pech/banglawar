# Moonstep UI recheck (read-only, targeted)
Viewed 2x: title 475, over-none 475, over-moon 475, over-gold 344, pause 344, records-attempts 344, settings 475, medals 475, howto 344. Not viewed: other sizes of same screens, over-silver/bronze/natural, records-best, reset-confirm, title-firstrun.

FIXED: 1 (medal line only on Moon), 2 (no Replay FAIL), 6 (NEW BEST clear of Previous line), 9 (tagline vs gear gap OK; How to play still dashed but readable), 10 (n/a here), 11 (em dash; attempt rows no longer repeat "tide").
Pause "Retry" no longer wraps (8 part fixed).
NOT FIXED: 8 tap targets. Back/close/gear circles about 55 css px; Attempts/Best tabs about 50 css px. The "qa1" chip on results is about 44 css px (ok only if not interactive).

NEW:
N1 LOW. Moon results: the "Every medal earned" line sits about 8 px above the card border (475 size). Options: (a) add card bottom padding (recommended, trivial), (b) move the line under the card, (c) leave.
N2 LOW. Records header right icon (ring with two ticks) has no clear meaning. Options: (a) swap for the medals icon or add a label (recommended), (b) leave.
N3 LOW. Gold 344: tagline wraps leaving the orphan "you." Options: (a) text-wrap: balance (recommended), (b) shorten the copy.
N4 LOW. Results: large empty gap between the qa1 chip and the buttons. Options: (a) tighten the layout (recommended), (b) leave.
