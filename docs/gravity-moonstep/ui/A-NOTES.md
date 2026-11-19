# Group A notes: title/menu, how-to-play, install hint
Screens (344x882, dpr2 PNGs): title, howto, install, title-install-chip (title with inline dismissible hint).
Shared: paper grain + vignette, SVG-filter wobble on all borders (.btn::before 2px ink, ::after 1px inner ring = double border), tide strip (ink, 30-38px) at bottom, focus-visible = silver halo. Halo pulse only under prefers-reduced-motion: no-preference.
Tokens as CSS vars in :root (--paper, --ink, --moon, --ochre, --verm, --tap:56px). Medal name/bands are plain text ("Silver", "1,284 m"); swap for variables.

## Title (title.html)
- Header: eyebrow "a climb by moonlight" (11px caps), "Moonstep" 54px Georgia 700, dotted rule.
- Best chip 44px tall: medal seal (II), "best 1,284 m · Silver" (sans tabular nums 19px). Empty state: "no climb yet".
- Art: moon with dotted influence rings, charged pearl, dotted arc, small moon.
- Menu in lower third (top 550): seed row (label, 56px text input, 56x56 dice = new seed), Climb primary 68px, Daily seed + Records (60px, subtext date / "last 20"), How to play ghost 56px.
- Footer in tide: "v0.1 · ?seed= shares a climb".
- States: default, pressed (1px down), focus (silver halo), seed input focus (add same halo), Daily done: subtext "done · 612 m".
## How to play (howto.html)
- Back 56x56, title, subtitle "step from moon to moon, ahead of the tide".
- 3 step cards (min 112px): 1 Hold ("Press and hold. A gold ring charges as the pearl gathers power."), 2 Aim ("Drag to bend the dotted arc. The silver ring marks where you would land."), 3 Release ("Let go to launch. Catch the next moon's pull and keep climbing.").
- Rule cards: Flick (ochre dashed) "Quick flick reverses your orbit direction."; Drag down (vermilion dashed) "Drag back below your thumb to cancel the shot."
- "Got it" primary 68px in lower third; tide footer "hold · aim · release".
## Install hint (install.html, title-install-chip.html)
- Sheet (386px, bottom 14px, 12px side margins) over 55% ink scrim: app icon 64px, "Keep Moonstep", "on your home screen. Plays offline, opens full screen.", iOS line "Tap Share, then Add to Home Screen.", Android line "Android or desktop: use the button below.", Install primary 68px (calls beforeinstallprompt), "Not now" ghost 56px.
- Platform logic: show only the matching line; iOS hides Install button (keep Not now -> "Got it"). Hide when already standalone.
- Chip variant: dashed ochre-free silver-tint row 56px above the menu, "Add Moonstep to your home screen", 56x56 close button; tapping the row opens the sheet.
