# Visual QA, Starfall beta (commit 4141957)

Shots folder: /home/user/banglawar/pages/gravity-plumbline/src/review/shots-beta/

## Best 4 shots for the owner
1. flow-menu-475x638.png (key art, hero face clear of Play)
2. skin-475x638-2-crusher.png (walls, spikes, brass crusher, lanterns, gate, ice)
3. flow-play-816x568.png (dusk look in play)
4. flow-shaftComplete-344x882.png (medal overlay, clean scrim)

## Defects
Counts: blocker 0, major 3, minor 6.

| id | screen + size | what | sev | fix options |
|---|---|---|---|---|
| V1 | roomClear 344x882, 475x638, 816x568 | Scrim looks weaker than pause/shaftComplete. Spikes, moon goal, lantern, bricks and ledge still read clearly behind the card (344: whole spike pillar and goal visible). Pause is near-opaque. Breaks the "85% scrim, nothing leaks" ask. | major | (a) Use the same 85% scrim class as pause for roomClear (recommended); (b) hide the stage layer while the overlay is open; (c) keep the lighter scrim on purpose and say so |
| V2 | roomClear 475x638 | Card is not centered on screen. It sits over the left stage column, edge to edge (x 30-540 of 950) while pause and shaftComplete are centered. 344 and 816 are centered. | major | (a) Center the card on the viewport as the other overlays do (recommended); (b) keep it anchored to the stage but add a deliberate offset rule for all overlays |
| V3 | menu 816x568 | Hard-edged horizontal stripes (stacked translucent bands) behind the title and buttons, visible across the right half from about y 285 to 995. Looks like debug rectangles or a seam. | major | (a) Replace with one soft gradient panel or none (recommended); (b) feather the band edges with a mask; (c) drop the panel and rely on the darker art |
| V4 | pause 344x882, 475x638 | Faint hero ghost (344, right) and spike or goal ghosts (left) show through the scrim. Very dim, but they are visible. | minor | (a) Raise scrim to a full 85-90% over the stage (recommended); (b) hide hero and hazards while paused |
| V5 | shaftComplete 475x638 and 816x568 | Small bits show through: a lantern stub at the left edge (475) and a goal ring at lower right (816). | minor | Same fix as V1/V4 (recommended); or ignore |
| V6 | settings 475x638, 816x568 | The list is cut off. Picture, Reset my bests and Tweak are below the fold (816 loses Picture too). No scroll hint, so it looks truncated. flow-settingsScrolled shows it scrolls. | minor | (a) Add a fade or arrow at the bottom edge (recommended); (b) two-column grid at wide sizes; (c) tighter row height |
| V7 | settings 344x882 | "Tweak (for testing)" row is visible to the child. Debug-looking. | minor | (a) Hide behind a long-press or dev flag (recommended); (b) keep for the beta only and remove at release |
| V8 | skin 475x638 crusher (also 344, 816) | Thin white sticker outline around the brass crusher block, plus the wall-mounted crusher bracket cuts through the left spike strip. Reads a bit cut-out against the painted walls. | minor | (a) Tint the outline to dark brass (recommended); (b) drop it; (c) keep it to match the hero sticker look |
| V9 | roomClear all sizes | Big empty gap between "Best -" and Next. "Best -" looks like a missing value. | minor | (a) Show "First clear!" when there is no best (recommended); (b) tighten the card height |

## Looks right
- Menu key art at all 3 sizes: the hero face and smile clear the Play button; the logo does not clip; Play is clearly the primary button.
- Hero close crop (skin idle 475): on-model against hero-5 (yellow body, navy tips, confident smile, teal flame). Not babyish.
- Moonstone walls: brick tile, brass top edge, no stretching or visible seams at 344, 475, 816.
- Spike crystals: pointed and coral, and they read as danger at a glance. The only coral in play is hazards, the crusher band, and the "Spikes" label on the death screen. Pause, retry and pad use navy, gold and teal.
- Brass crusher with a single coral band matches the target. The crumble ledge is not distinguishable in skin-*-3-crumble (see not viewed).
- Hanging lanterns and the dusk glass dome match scene-1-dusk well.
- Pad and HUD do not show through pause, roomClear or shaftComplete at the sizes viewed.
- Touch targets look about 56-60 css px or more (pad, pause, restart, Back, Skip, menu buttons). Settings segment chips (R/L, 1.0/1.15/1.3) look about 40 px tall, which is the smallest in the build but acceptable.
- Medal overlay is clean: text not clipped, 12 px or larger, good contrast. The tutorial hint bar is readable.
- No empty or broken screens in the ones viewed. The shaftPick list is fine, but the lower half is empty at 344.

## Not viewed
- At 2x: only the crusher, hero idle and menu band crops. No other close-ups.
- 816x568 for tutorial, death, shaftPick, confirmReset, pauseConfirm, tweak, tweakOpen, settingsScrolled, shaftCompleteTuned, firstOpen, playDev, playLeft.
- 344 and 475 viewed: menu, play, pause, roomClear, shaftComplete, settings, tutorial (344 only), death (475 only), shaftPick (344 only). Not viewed: firstOpen, confirmReset, pauseConfirm, playDev, playLeft, tweak, tweakOpen, settingsScrolled, shaftCompleteTuned at any size.
- Skin shots viewed: 475 crusher, crumble and gate; 344 crusher; 816 crumble; 475 hero-flip. Not viewed: the other skin-*, hero-fall, hero-idle (except the crop), debug, reduced-lab.
- Not viewed: ui-*, vfx-*, s1-pad-*, assets-* shots and elements-sheet.png. Animation and runtime behavior were not tested.
- Crumble ledge: I could not tell it apart from a normal ledge in skin-3-crumble, so I could not judge it.
