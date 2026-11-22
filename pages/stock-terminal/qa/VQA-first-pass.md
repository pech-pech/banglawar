# VQA first pass - stock-terminal (344x882 @2x)
Viewed: watch, chart ZGT + DYV (full + P&F crops), status, bar, ticket (BUY, qty 8), report wk1, review wk10, settings (audit only). Not viewed as image: bar/status crop files, report, settings shots. Console errors: none. Horizontal overflow: none (scrollWidth 344). All buttons >=56px tall. Shots: qa/shots/vqa-*.png

## HIGH
1. P&F trap legend illegible: bottom row shows "bt"/"BT" under columns (vqa-07-pf-text4.png), no key, ~14px dim. Fix A (src/pnf.js pfText): replace with "^"/"v" markers plus a one-line key in ui.js .ind1 ("^ bull trap, v bear trap"). Fix B (src/ui.js): drop row from pfText, list traps in the tick chip (trapChip already exists) only.
2. Equity vs benchmark chart distinguished by colour only (vqa-12-review-full.png): legend "─ equity ─ benchmark" two identical dashes, 12px, green vs grey. Fix A (src/ui.js review svg): make benchmark stroke-dasharray 4 3 and use matching dashed legend swatch. Fix B: direct-label line ends "EQ"/"BM" in the svg.

## MED
3. Text under 14px (rule: 12px only for .hd): measured 12px on .pane MACD values "M+1.54/S+3.12/H-1.57" (pane .v i/span), "Order ticket" and "held 0 sh" (.hd inner span), review legend "equity/benchmark" and legend dashes. Fix A (src/style.css): .pane .v{font-size:14px}, .hd span:not(.hd){font-size:14px}; legend font-size:14px. Fix B (src/ui.js): move "held 0 sh" out of .hd into its own 14px .dim span.
4. Clipped label: "MACD 12,26,9" scrollWidth 59 > 46px column (.pane .l; chart screens). Fix A (src/style.css): .pane{grid-template-columns:62px 1fr 62px}. Fix B (src/ui.js): label "MACD" only, with "12,26,9" on second line at 14px (wraps within 46px? no: use "12/26/9" ~ 42px).
5. Bottom bar labels touch the button edges: "ADVANCE WEEK" fills 105px button with padding 2px and letter-spacing -.02em (vqa-05, vqa-01). "RERUN WINDOW" same. Fix A (src/style.css .bar .btn): font-size:13px is NOT allowed, so instead set .bar{gap:4px} and padding 0 6px with flex:1 1 auto, widen the go button; Fix B (src/ui.js): shorten to "ADVANCE WK"/"RERUN" (or "NEXT WEEK"), keeping 14px.
6. Status bar uses 3 lines on 344px: "mandate +3.0" orphaned on line 3, "EXCESS" right-aligned apart from "BENCH" (vqa-04). Costs ~25px of sticky height on every screen. Fix A (src/ui.js status): drop "mandate +3.0" from s2 (already in review), keeping 2 lines. Fix B (src/style.css): .status .s2{flex-wrap:nowrap} and abbreviate to "BM +0.0% XS +0.0".

## LOW
7. P&F row labels inconsistent precision/spacing: 136,131,125 vs 98.9, 95.1, 91.4 (vqa-07); labels only on every other row so one-box steps (2%) are not obvious. Fix A (src/pnf.js lab): use toFixed(1) always when p<150 or whole numbers always. Fix B: add "1 box = 2%" to the existing footer (already shows "box 2%"; move it adjacent to the axis).
8. Grid alignment OK: monospace columns aligned, X blue / O orange, trend "+" grey dim, new column highlighted as inverted glyph. Latest-column highlight (.new) is white block, fine. No defect; note trend "+" at 14px grey on #151c24 is low contrast (approx 5:1, passes AA but faint). Optional: Fix A (src/style.css .tl) colour #a6b3c3.
9. Wording: "Build st-slice-1." dev string visible on watchlist footer (vqa-01). Fix A (src/ui.js): hide unless DEV flag. Fix B: keep, move into settings modal.
10. "Max drawdown +0.0%" positive sign on a loss metric; zero-state review reads "hit rate - (n=0)". Fix A (src/ui.js): show "0.0%" without sign for drawdown. Fix B: show "n/a" with a short reason.

## Checked OK
Up/down never by colour alone: +/- signs, X/O letters, BUY/SELL words, arrows with RS/MA. No game words found (Mandate/Excess/Benchmark/Result wording is broker-like; "Mandate not met" acceptable). Selected side/view buttons show tick + 2px border. Settings buttons 56px; CLOSE full width.

QA inspector: initial pass, user-directed (13 states, 7 close-ups viewed)
