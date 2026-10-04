# 21 - Unit banner plan (proposal, nothing sent, nothing spent)

Status: PROPOSAL for the owner's decision. Written 2026-10-04. Inputs read as data: `05-theme-pack-spec.md` section 2.3 (unit roster, role ids, labels), `18-world-view-scores.md` (settled look W1a, banner round B2), and the colour-vision method in the art bible (`docs/ART_BIBLE.md`: WCAG 3:1 for objects, luminance-based pairs re-checked under protanopia, deuteranopia and tritanopia). No generation, credits, hooks or settings are touched by this file.

## 1. Settled look (from 18)

Small vertical parchment banner, teal band on top, one dark object pictogram on the parchment, floating above its tile on a thin vertical beam as long as the banner is tall. Forbidden: people, faces, weapons, flags, insignia, lettering. Ideally also no animals (the B2 ox still drew despite "no animals" in the exclusion tail, so ask for an object-style icon and check each result).

## 2. Unit classes and pictograms

The theme pack has exactly 8 unit roles. One pictogram per role, the same for both sides (so the side is told by the band, and the role by the picture). Names are the owner's P (player) label first; the A (opposing) label is in brackets.

| Role | Labels | Pictogram (object) | Why it reads | Check |
|---|---|---|---|---|
| `u.scout` | Guide team (Reconnaissance patrol) | storm lantern | local knowledge, finding the way; already shown in B1 | none |
| `u.founder` | Organising team (Garrison engineering detachment) | spade standing in a small mound | founding a base area | a spade is a tool, not a weapon; keep it upright and plain |
| `u.commander` | Sub-sector commander (Field commander) | brass compass | direction and command, no person or banner | no flag shape: draw round, no pennant |
| `u.line` | Freedom-fighter section (Infantry company) | bamboo gate post pair (B2 "bamboo fence, no lintel") | holding a line | no lintel, so it cannot read as a torii or a crest |
| `u.shock` | Raiding party (Armoured troop) | hourglass | speed and timing of an ambush; avoids a tank or blade for the A side too | none |
| `u.ranged` | Mortar section (Artillery battery) | stone mortar and pestle | pun on "mortar", a kitchen object, no barrel or cannon | draw bowl and stubby pestle, not a tube pointing up |
| `u.transport` | Country-boat flotilla (River gunboat) | low country-boat hull, side view, no mast gun | river movement (G14, T19) | boat is a vehicle, not an animal or weapon; no turret |
| `u.militia` | Base guard (Garrison reserve) | brass padlock | guarding a base area; avoids a shield (shield reads as a weapon set) | none |

Notes:
- Levels (L1 to L4, "Regular platoon" for `u.line` L3-4) keep the same pictogram; level is shown in the interface text, not by chevrons or stripes (those read as rank insignia). Optional later: a thicker parchment edge per level, owner to decide.
- The A side never gets a tank, gun or aircraft picture: the pictograms above are chosen so the same object serves both labels.
- Labels contain the word "Garrison reserve" etc. only in game text; no lettering is drawn on any banner.

## 3. Owner colour: second side as a band colour

| Side | Slot | Band colour (suggested) | Note |
|---|---|---|---|
| Player | `f1` | deep teal, about `#1F7078` (the settled teal) | as accepted in B1/B2/W1a |
| Opposing | `f2` | amber-ochre, about `#D8A020`, thin ink outline on the band | blue against yellow is the pair that stays apart under protanopia and deuteranopia (the confusion lines are red-green); tritanopia is the weaker case, so the two bands also differ strongly in lightness |

Rules, all to be measured before the colours are frozen (the values above are suggestions, not computed here):
1. Band against parchment must reach 3:1 in plain view and under all three colour-vision simulations (art-bible bar for objects). The amber is the risky one on a light parchment: darken it toward `#C98A12`, or add a 1 px ink outline, until it passes.
2. Teal against amber must differ in luminance by at least 3:1 in every simulation, so the pair also works in greyscale.
3. Colour is never the only cue (as in 05 section 2 note): the opposing band has a straight bottom edge with two small notches cut into it, the player band a straight one; no triangle, star, crescent, stripe set or anything that reads as an insignia. Owner to confirm the notch is acceptable under "no insignia".
4. Avoid red and green for the sides: that pair is the colour scheme of the national flag and is the classic colour-vision failure.
5. Amber is also close to a national colour of the neighbouring state: flag for the community reviewers in 05 section 10. Fallback band: slate-violet, about `#5B4B8A`.
6. The art bible's 12-colour-per-picture limit applies if these banners join the pixel game; for the 3D/Blender world (19) it is advisory.

## 4. Size classes

The banner is a floating marker, so its size should show weight without becoming larger than the tile. Heights as a fraction of the tile width (aspect about 2 tall to 1 wide, 20 percent shorter than the first B1 sketches, as B2 settled):

| Class | Height | Roles | Reason |
|---|---|---|---|
| S small | 0.9 tile | `u.scout`, `u.founder` | light units, many on the map |
| M medium | 1.1 tiles | `u.line`, `u.militia`, `u.shock`, `u.ranged`, `u.transport` | main force |
| L large | 1.3 tiles | `u.commander` | one per sub-sector, must be found first |

The beam length equals the banner height (settled in W1a). The picture is drawn once at class M and scaled by the game: S and L differ only by the scale factor and a pictogram-to-band ratio, so they need no extra generation.

## 5. Generation plan (credits and cap)

Cost basis: 15 credits per image (Seedream 4.5, as every round in 18). Balance recorded in 18: 4,059 after R5c, minus later rounds; re-read it (`openart account`, read-only) before sending.

Why 2 base sheets, not 16 images: 8 roles x 2 sides = 16 banners, but the banners differ by pictogram and band colour only. One sheet of four banners per call, same band colour per sheet.

| Step | What | Images | Credits |
|---|---|---|---|
| A1 | Teal sheet 1: scout, founder, commander, line (four banners, one sheet) | 1 | 15 |
| A2 | Teal sheet 2: shock, ranged, transport, militia | 1 | 15 |
| B | Amber side: recolour the band by script from A1/A2 (flat colour, mask on the band) | 0 | 0 |
| C | Check each pictogram (object, not person, weapon or animal), band colour pair under the three simulations | 0 | 0 |
| D | Retry allowance, one retry per sheet that fails the content rules | up to 2 | up to 30 |
| E | Fallback if scripted recolour fails to look right: two amber sheets by image-to-image from A1/A2 | up to 2 | up to 30 |

Totals: planned 2 images = **30 credits**. With retries and the fallback, at most 6 images = 90 credits.
**Proposed cap: 90 credits for the whole banner round** (6 images); stop and ask the owner if a seventh would be needed.

Procedure and constraints (project rules, repeated so the executor does not guess):
- Via the CLI, one sheet of four banners per call, text-to-image for A1/A2 (the reference photo could not be attached before; B2's winning prompt, 1,044 characters, is the base, with the new pictogram list).
- Use the word "lines", not "rows", in prompts (the hook's sheet rule trips on "rows", per R7 lesson in 18). Keep the required exclusion tail ("no people, no faces, no weapons, no flags, no insignia, no lettering, no animals") and add "object-style icons".
- Before every call run `promptProblems` and quote `chargedCredits`; after every call log the draft, prompt, settings, credits and result in the private ledger and run the audit (these live in the other project's art workflow; here at least log in 18 as W1a/B2 were).
- Do not send until the owner says yes in chat and the art lock is open: only the owner unlocks. This plan does not unlock anything.
- Placement on the world (the later step 2) is a separate round, one thing changed per edit (lesson S3/S4 in 18); it is not costed here.

## 6. Open questions for the owner
1. Accept the 8 pictograms above, or swap any (the commander compass and the shock hourglass are the least obvious).
2. Amber or slate-violet for the opposing band, after the contrast measurement.
3. Notches under the opposing band: allowed, or colour only plus the pictogram?
4. Cap of 90 credits (planned 30).


## Owner update (2026-10-04)
The founder marker is a homestead icon (a small hut), not the spade. The ox and cart stays (draft exception in 20-banner-content-check.md). The cards are called unit markers.
