# Group B notes: HUD, pause, settings (344x882, dpr2)
Files: hud, hud-warn, pause, settings, settings-reset (.html + .png). Pure HTML/CSS, inline SVG filter for wobbly edges and grain; no assets.
Shared parts: `.dbl` double ink border (2px wobble + 1px hairline 4px out), `.tog` toggle 64x36 (row is the 60-72px target), `.seg` 3-way segmented (56px), `.btn` 56px, `.btn.primary` 64px ink fill, `.focus` silver halo (shown on Resume / Keep my scores). Numbers system-ui sans, titles Georgia.

## HUD (hud, hud-warn)
- Pause button 56x56 circle, top-left (14,14). Copy report 56x56 circle, top-right. Both aria-labelled.
- Height pill 148x48 centred: "1,284 m" + medal seal (28px, roman numeral; I Bronze, II Silver, III Gold, moon glyph for Moon).
- Next medal line under pill: "next · Gold 800 m · +126 m" (medal name and threshold are variables) with a 140x6 ink progress bar and ochre tick at target.
- Chain meter (y122, left): "chain" + 5 beads (filled ochre = chain count) + "x3". Seed code (right): "seed MN-7K3Q", non-interactive.
- Tide chip above tide edge, 36px: normal "Tide rising 94 m" (paper, vermilion text); warn "Tide close 18 m" (tinted #f6e1d8, tide edge raised to y690, vermilion inset glow from bottom, chip pulses only inside prefers-reduced-motion:no-preference; static otherwise).
- Bottom 42% holds only tide ink, "hold · aim · release" hint (first runs only) and the dotted hold ring 90x68 at y798. No interactive UI there.
## Pause (pause)
Game dimmed (ink 62%), paper card inset 16px. Header "Paused" + "at 1,284 m · Silver". Rows: Assist arc toggle, Sound toggle (60px), Tide speed segmented 0.75 calm / 1 steady / 1.25 swift, Seed field (56px, text input, caret) + copy button 56, Daily seed button 56 ("Daily seed 19 Nov"). Lower third: Resume 64 primary (focused), Retry seed + Settings pair 56, "Quit to menu" quiet link 56.
## Settings (settings, settings-reset)
Back 56 top-left, title. Rows: Sound (on), Assist arc (on), Tide speed card (segmented), Reduce motion (off), Danger: "Reset best scores and history" outlined vermilion 56. Done 64 primary at bottom.
Reset confirm (settings-reset): dim + card "Wipe the ink?" copy "All best-by-seed scores and the last 20 attempts will be erased. Settings stay." Buttons: "Erase everything" (vermilion fill) / "Keep my scores" (primary, default focus).
States: toggle on/off, segment selected, focus halo, danger, confirm. Copy strings: Paused, Assist arc "dotted aim line", Sound "chimes and tide", Tide speed, Seed, Daily seed, Resume, Retry seed, Settings, Quit to menu, Reduce motion "no pulses, no ripples", Done.
