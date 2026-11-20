# Starfall UI kit (slice S9a): PL.UI, PL.Screens, PL.Strings
All choices "admin default". Files: parts/strings.js, uikit.js, screens.js (load in that order, before ui.js; add to the list in inline.py), test/uikit.test.js, test/ui-demo.html, test/ui-shots.js. Shots: review/shots-beta/ui-*.png (52 PNG: 13 screens + left-hand + text 1.3 + scrolled settings, 3 viewports, DSF 2, plus ui-kit-sheet.png). Look: cream sticker buttons with ink label, brass edge, thin cream outer border, soft stacked shadow; plum game controls (keys, Retry, Pause) with cream glyphs; opaque plum cards; coral only on the death tag.

## API
- `PL.UI`: `T` (tokens, only place with hex), `C` (colours), `contrast(a,b)`, `lum`, `alpha(hex,a)`, `size/font/fontPx(name,w,scale)`, `text(ctx,str,x,y,{font,color,align,maxW})` (shrinks to 14 px then ellipsis), `wrap`, `rr`, `sticker`, `scrim`; components `(ctx, rect, state, t)`: `button` {label,kind plain|primary|danger,pressed,disabled,focus,sub}, `arrowKey` {dir,lit,pressed,dim,focus}, `diveKey` {pressed,cooldown 0..1,disabled,airCost}, `retryKey` {pressed,spin}, `pauseKey`, `pips` {n,max,pop,size}, `hudText` {text,glow}, `teachSlot` {lines,alpha}, `causeTag` {kind spikes|crusher|crystal|edge|slow,text,age ms,iconOnly}, `card` {anim}, `slider` {value,drag,disabled}, `toggle` {on}, `tab` {label,active}, `medal` {tier gold|silver|bronze|none,isNew,drop}, `toast` {text,kind,alpha}, `devBadge`, `artChip`.
- `PL.Screens`: `layout(w,h,leftHand,{scroll,tweakRows})` -> `{screenName:{rects,targets,containers,overlays}}` for firstOpen, play, tutorial, death, roomClear, menu, shaftPick, pause, confirm, shaftComplete, settings, tweak. `padRects(w,h,left)` is the single swap point for `PL.Input.layout`. `hit(layout,name,x,y)` -> target name | 'screen' | null. `rowParts(row,kind)` (label/control zones). `draw[name](ctx,w,h,vm,t)`, plus `draw.kit`.
- `PL.Strings.player` / `.dev` / `.allPlayer()`.

## View-model fields (all optional; common: leftHand, textScale, pressed:'<rect name>', focus, inset, devTuned, tweakOn, artFallback)
- play/tutorial/death/roomClear: room, rooms, time, newBest, moves, maxMoves, air (Dive costs a move), lit ('up'..), pop, cooldown, retrySpin, hero {x,y} (B pips under hero), toast {text,kind,alpha}, teach {lines,alpha}, showSkip, drawRoom(ctx,rect). death adds cause {kind,text,age,iconOnly,x,y}. roomClear adds best, isNewBest.
- menu: drawArt(ctx,rect). shaftPick: selected, best[3] ({time,tier}|null), dailyNote. pause: confirm (bool), anim. confirm: text,no,yes,danger.
- shaftComplete: tier, isNew, total, roomTimes[], tuned (shows "not saved"), drop. settings: values {music,sounds,mute,vibration,left,motion,textIdx}, scroll, drag. tweak: rows [{label,valueText,value}].

## Numbers (node src/test/uikit.test.js)
9288 checks, 0 fail: 144 screen layouts (3 viewports x right/left x 12 screens), 5788 rect-pair overlap checks, 772 target-size checks (all >= 56 px, none in the portrait home-swipe band), review-ux box spot checks, min contrast 4.74 (text.dim on dusk; all 21 token pairs >= 4.5), no "tick/seed/charge/buffer/DEV" in player strings, no hex outside tokens, min font 14.

## Known gaps
- Pad boxes and room/HUD rects are my arithmetic from review-ux (room B is 4-340 x 84-594, teach B 598-646, Skip placed beside the pad); swap `padRects` for PL.Input.layout when it lands. Room C (247-598) and HUD C column are my choice (not in the plan).
- Left-hand mirror shifts the pad box only (Left/Right arrows keep their meaning); everything else mirrors.
- Text 1.3 is checked visually (shots) not by an automatic clip test; labels shrink to 14 px then ellipsis. Reduced-motion static forms and animation timing curves are not driven here (state fields exist, caller animates). No haptics/sound. Not tested on a device; colour-blind filter check not run. Safe-area `inset` only offsets the DEV/ART chips. Draw functions assume the caller supplies the room, art and dusk backdrop.
- Settings "Hand", "Text size" are segmented controls drawn inside the row (hit zone = whole row; caller maps x to segment via rowParts).
