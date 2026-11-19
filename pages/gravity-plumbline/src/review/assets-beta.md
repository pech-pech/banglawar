# assets slice (beta) - review

Built by `python3 src/tools/prep-assets.py [SRC] [--sheet]` (PIL + numpy only). Output: `assets/` (17 webp, 144.0 KB), 3 icons replaced.
Choices labelled "admin default".

## Fixes from VQA-beta-art
| id | fix | measured |
|---|---|---|
| D1 | mid edge cols equalised + wrap crossfade; cap join columns interpolated to the mid edge | edge diff mid|mid 17.4 -> 0.0, capL|mid 72.0 -> 0.0, mid|capR 41.8 -> 0.0 (single-column metric, alpha>200 rows). Brick pattern still repeats every 93 art px (admin default: no flipped alt tile) |
| D2/D7 | body-only hero (idle, land, hurt, win) from the PNG masters, 192 px max side; fall/dive not shipped, `drawHero(...,'fall'/'dive')` stretches idle in code | teal-fringe px: idle 0, land 4, hurt 12, win 0 |
| D3 | `PL.Assets.drawShadow` / `drawHero(..., {shadow:true})` soft ellipse | viewed on check sheet |
| D4 | `PL.Assets.glow` additive teal-white halo, override via `drawPortal(..., {glow})` | code only, not yet seen in game |
| D5 | ledge 160x21 -> 160x30 (1.35x y + icy teal underside) | 18.1 px tall at 100 px wide |
| D6 | grey ring and orange bump removed (not in the body mask); border rebuilt | viewed; small notch left at the hurt bump spot |
| D8 | assets/ holds only shipped files; masters, qa, sheets excluded | 144.0 KB (budget 800) |

Check sheets: `src/review/shots-beta/assets-hero-check.png` (192/48/28 on dusk blue and on moonstone with shadow), `assets-hero-fringe.png` (magenta fringe test).

## Hero border
Original flame-side border cannot be kept (flame cut away), so the white sticker border is rebuilt around the body mask: 4 px at 192 px, colour #eef0f4. Looks slightly thinner than the original sticker outline.

## Not verified
Draw helpers tested with a fake ctx only (call counts), not rendered in a browser. Ledge, tall-block platform, rotated spikes and crusher have not been viewed.
