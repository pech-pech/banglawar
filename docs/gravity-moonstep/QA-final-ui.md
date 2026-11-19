# Moonstep UI final recheck (read-only)
Viewed 2x: title 344+475, howto 344, pause 344, settings 475, reset-confirm 475, over-moon 475, over-gold 344, records-attempts 475, records-best 344, medals 344, design title.png. Not viewed: other size of each, over-silver/bronze/none/natural, title-firstrun, records-attempts-direct.
FIXED: tap targets (back/gear/tabs ~60 css), Moon line padding (~19 css), records icon now labelled "Medals", gold tagline orphan.
NOT FIXED: results gap (chip to buttons ~45 css at 475; 344 leaves ~half the screen empty below buttons).
NEW:
N1 MED title 344: gear overlaps tagline "MOONLIGHT" and the tagline/title sit ~15 css right of centre (design is centred, no overlap; 475 is fine). Options: (a) pad header symmetrically / put gear in its own row (recommended, quick), (b) shrink tagline tracking, (c) leave.
N2 LOW title: "no climb yet" text is left-aligned in its chip. (a) centre text (recommended, quick), (b) leave.
N3 LOW best-by-seed 344: "DAILY 19-…" truncated, sub-line wraps to 3 lines. (a) show "Daily 19 Nov" short label, single-line sub (recommended, quick), (b) wider column.
N4 LOW results gap: (a) tighten spacing / pin buttons under card (recommended, quick), (b) leave.
QA inspector: initial pass, user-directed (11 states, 11 close-ups viewed)
