# 15 - Visual concept prompt pack: `bd1971` ("1971: The Liberation War")

Status: **PLAN ONLY. Nothing in this file has been generated and no credit has been spent.** Written 2026-10-03 for the
owner's review. Every generation waits for the spend gate (model, cost, balance and cap stated, the owner's yes in chat)
and for the owner's own unlock of the art lock. The assistant never unlocks, never generates on its own word, and never uses
the `openart` CLI to generate.

Read before writing: 05 section 8 (asset plan, glyphs, art rules 1 to 7), 04 section 9 (content rules) and section 10
(review items), 08 sections 0, 1.1 and 7 (terrain roles, scale, what the map must not imply), 02 sections 1 and 4
(geography, sensitive-treatment guidance), 11 section 2 (reviewer roster), GDD section 14.3 (isometric rendering), and the
project's art rules (`docs/PROMPTING.md`, `docs/ART_BIBLE.md`, `docs/ASSETS.md`, `tools/art/promptRules.ts`). The visual
pipeline spec (14) did not exist yet when this was written; section 6 lists what it must agree with.

Facts read from OpenArt on 2026-10-03 (read-only calls: account, cost, model forms; nothing generated):

| Item | Value |
|---|---|
| Plan | Plus (an allowed plan in `docs/ASSETS.md`: plus, pro or wonder) |
| Balance | 4,829 credits |
| Seedream 4.5, text to image, 2K, imageCount 1 | **15 credits list** per job, quoted for 4:3, 16:9 and 1:1 (3:4 not quoted separately; assumed the same, confirm at the gate). Charged about **14** on MCP jobs (`chargedCredits(15)`, the Plus discount the playbook observed) |
| Kling 3 Omni, text to image, 2k, 16:9, single | 10 list, about 9 charged |
| Nano Banana 2, text to image, 2K, 16:9 | 30 list, about 27 charged |
| Seed | **Neither the Seedream 4.5 nor the Kling 3 Omni form has a seed field.** Seed policy: record "not exposed by model"; reproducibility comes from the saved prompt, settings and picture, not a seed |

---

## 1. Purpose, guardrails, and what OpenArt may be used for here

### 1.1 Purpose
Fix the **visual direction** before any production art: pick one of four distinct looks by seeing each applied to the same
neutral subjects (terrain, water, sky, materials, UI surfaces, palette), then turn the winner into a Blender style guide
(palette, shading, outline, camera) and an asset spec. Concept images are **reference only**: they are never shipped, never
traced into final art, and never added to `public/assets` or any game manifest. Production art comes from the automated
Blender sprite pipeline (the likely route; spec 14).

### 1.2 What OpenArt MAY be used for (neutral subjects only)
Terrain, vegetation, water, sky and light, generic building materials and massing, boats as silhouette and hull-proportion
studies, UI panel and button surfaces with no text, colour palettes and swatches, and the overall style. Every prompt in this
pack is one of those.

### 1.3 What OpenArt must NOT be used for (binding, whatever the art method; 05 section 8.3 rules 1 to 4, 04 section 9)
- People of any kind: no figures, faces, crowds, soldiers, civilians, refugees, silhouettes of people; no clothing or dress.
- Flags, banners, insignia, seals, emblems, badges, the red cross, crescent or crystal; slogans; any lettering, numbers or
  text (all text in the game is set by the engine, in reviewed wording).
- Weapons (no close-ups, no weapons at all in concept work), vehicles of war, uniforms, explosions, fire, smoke from damage,
  ruins, destroyed villages, graves, memorials, killing fields or any atrocity site.
- Maps of real borders as art, real place depictions presented as fact, photographs or photo-real imitations of real events.
- Named real people, real buildings or landmarks (bridges, cantonments, the university, museums).
- Any name of a game, studio, artist or character, and "in the style of" or "inspired by" (`names` rule).

Every prompt therefore ends with the same exclusion sentence (no people, faces, animals, flags, symbols, signs, writing,
weapons) in addition to the project's required exclusions.

### 1.4 Culture-specific subjects go to reviewers first
Anything that depicts culture-specific architecture, boats or dress is decided by the owner's reviewers before it becomes
final art. In this pack the two such subjects (S6 utility structures and S7 boats) are **shape studies only**, held back from
the first round, generated only for the chosen direction, and flagged for the R1 historian (with R3, the museum or memorial
reader, for tone) before they inform any final asset. Dress is not a subject at all.

### 1.5 Two honest limits of the current tooling
1. **The prompt rules were written for the platformer's pixel sprites.** `promptProblems` demands the `#00FF00` green
   background sentence and the exclusions "no gradient, no glow, no anti-aliasing, no dithering, no text", and refuses any hex
   colour outside the platformer's 12-colour palette. The pre-send hook applies them to every MCP generate call. So every
   prompt here is (a) composed as an **isolated object on flat green** (a floating diorama slab, a card, a set of separate
   pieces), which suits an isometric game anyway, (b) written in **flat-colour styles** that do not need gradients, and (c)
   names its colours **in words only**. The cost of this: a soft watercolour or ink-wash direction cannot be tested honestly
   (it needs gradients), so it was left out (section 2.5), and green landscapes on a green background may confuse the model's
   edges (concepts are not keyed out, so this matters little). The clean fix is a separate "concept" profile in
   `promptRules.ts` (its own background and palette rules, with tests); that is a code change the owner decides (Q4).
2. **The checks cannot judge the picture.** Look-alikes, hidden lettering, a stray figure or flag in a landscape, or
   anything that reads as a real place or event are judged by eye (section 5) and, for flagged subjects, by reviewers.

---

## 2. Four visual-direction candidates

All four share the GDD's fixed facts: isometric view, zoom 0.25 to 2.0, a 128x128-tile hand-made map, 8 terrain roles
(`t.deep`, `t.still`, `t.river`, `t.open`, `t.wood_a`, `t.wood_b`, `t.rough`, `t.peak`), owner colours `f1` deep green and `f2`
blue-violet (05 section 3.1, PROVISIONAL), and the rule that both sides get the same art quality. Palettes are proposals
(12 to 16 colours each) built on the PROVISIONAL `theme.json` palette; contrast numbers are in section 2.6.

### 2.1 Candidate A: Cut paper
**Rationale.** Every shape is a piece of matte coloured paper with a thin hard offset beneath it. It reads as hand-made and
quiet, carries no photographic suggestion at all (important for a real war within living memory), and the layered offset
gives an isometric map depth without lighting effects.
- **From Blender:** good. Extruded flat planes stacked in a few layers, an emission or constant-ramp toon material per
  colour, one sun lamp for a hard offset shadow (or a duplicated, offset, darkened layer, which is cheaper and fully
  deterministic). No textures needed; an optional paper-fibre overlay is a post step (must stay 2 px or coarser).
- **Readability at small size:** good for terrain (big flat areas); units need an outline or a light rim to separate from
  terrain (see 2.6).
- **Accessibility / contrast:** flat fills make contrast exact and checkable; hue pairs need shape backup.
- **Palette:** Palette A (15 colours).
- **Dignity and tone:** strong; reads like a museum diorama or a book illustration, not a toy.
- **Strengths:** calm, distinctive, cheap to render, easy to keep consistent.
- **Risks:** can look childish if shapes get too round; the offset shadow doubles edges at small zoom (keep it 1 to 2 px at
  zoom 1.0 and drop it below 0.5).

### 2.2 Candidate B: Low-poly diorama
**Rationale.** Faceted 3D forms, one flat colour per facet, light from the top left. It is the most direct match for a Blender
pipeline: what the concept shows is what the renderer naturally makes.
- **From Blender:** best. Low-poly meshes, flat shading, a constant-step colour ramp (2 or 3 steps), orthographic camera at
  the isometric angle, one key light top left plus flat fill. Renders the same every time.
- **Readability at small size:** good when facet count is low (big facets); poor if facets are many (noise).
- **Accessibility / contrast:** facet steps give free light and shade values for each material; keep the step between the
  lit and shaded tone of a material under the step between materials, or terrain types blur together.
- **Palette:** Palette B (16 colours: each terrain material has a lit, base and shade tone).
- **Dignity and tone:** good if muted; risks a cheerful "toy world" feel if saturated or rounded (keep colours low-saturation).
- **Strengths:** pipeline fit, consistency across hundreds of sprites, easy variants.
- **Risks:** generic look (many games use it); toy-like tone; facet noise on vegetation.

### 2.3 Candidate C: Ink-line board
**Rationale.** Flat fills with one even dark outline round every shape, simple geometry, plenty of empty space: a hand-drawn
board-game look. Highest readability of the four, and it echoes the project's existing rule that gameplay objects carry an
ink outline.
- **From Blender:** good. Flat materials plus Line Art (Grease Pencil) or an inverted-hull outline; the outline width must be
  set per zoom bucket so it stays 1 to 2 px. Line Art is slower to bake; the inverted hull is fast but fails on thin planes.
- **Readability at small size:** best; the outline separates units from terrain whatever their colour.
- **Accessibility / contrast:** strongest; the outline carries shape for colour-vision differences.
- **Palette:** Palette C (14 colours).
- **Dignity and tone:** good; risks reading like a "map of the country" if the board edge is shaped like a real outline
  (never do that; 08 section 7 item 10).
- **Strengths:** clarity, accessibility, small file sizes.
- **Risks:** busy at zoom 0.25 (every tile outlined); outlines can make it look like a children's book; needs care with
  outline weight across zoom levels.

### 2.4 Candidate D: Quiet gouache poster
**Rationale.** Big simple shapes in opaque matte paint, at most three tones per material, low saturation. The most
atmospheric and "serious" of the four; suits menus, the remembrance and encyclopedia screens and battle backdrops.
- **From Blender:** medium. Toon ramp with 3 constant steps, low saturation; the painted feel needs a post texture
  (brush grain), which must be coarse (2 px or larger) to avoid shimmer, and the hard tone edges must not be softened.
- **Readability at small size:** medium; low saturation makes terrain types closer in value.
- **Accessibility / contrast:** weakest of the four as proposed: Palette D's `f1` fails both the 4.5:1 text bar and the 3:1
  object bar on paddy (section 2.6), so D would need a darker `f1` or a light unit rim.
- **Palette:** Palette D (14 colours).
- **Dignity and tone:** strongest; it reads as commemorative without being grim.
- **Strengths:** mood, gravity, very good for backdrops and screens.
- **Risks:** low contrast in play; harder to reproduce exactly in Blender; can drift toward propaganda-poster connotations if
  it gains bold diagonals or heroic compositions (keep it landscape-only and calm).

### 2.5 Considered and left out
**Ink and watercolour wash.** Dignified and well suited to remembrance screens, but its look depends on soft gradients,
which the current prompt rules forbid ("no gradient" is required), and it is the hardest to reproduce in an automated
Blender bake. Revisit only if the owner approves a concept profile (Q4) and wants it for screens rather than the map.
A mixed answer is possible: one direction for the map (A, B or C) and D's restraint for screens (section 5.4).

### 2.6 Palettes and contrast (computed, WCAG 2.2 relative luminance)
Bars from `docs/ART_BIBLE.md`: 4.5:1 for normal text, 3:1 for objects a player must see. Hex codes live **only** here, never
in a prompt (the `palette` rule refuses colours outside the platformer palette). The game's owner colours are the
PROVISIONAL `f1 #1f6f4a` and `f2 #44507f` from 05 section 3.1.

**Palette A** (15 colours): paper `#efe9d6`, paper_shade `#d8cfb4`, ink `#262321`, water_deep `#4a7388`, water_light `#a9c9c4`, water_still `#7fa6a0`, open `#a9c46a`, wood_a `#5f8f45`, wood_b `#3d6b4f`, rough `#b09a6a`, peak `#8a8272`, earth `#8b6b47`, thatch `#c8a865`, f1 `#1f6f4a`, f2 `#44507f`

| Pair | Ratio | Note |
|---|---|---|
| ink / paper | 12.86 | text and outline on paper (4.5:1 text bar), passes |
| paper / f1 | 5.04 | white-ish text on player colour (4.5:1), passes |
| paper / f2 | 6.41 | white-ish text on AI colour (4.5:1), passes |
| f1 / open | 3.15 | player unit on paddy (3:1 object bar), passes |
| f2 / open | 4 | AI unit on paddy (3:1), passes |
| f1 / wood_b | 1 | player unit on mangrove (3:1; expected weak), **fails** |
| f2 / water_deep | 1.52 | AI boat on deep water (3:1; expected weak), **fails** |
| ink / f1 | 2.55 | ink outline on player colour |
| ink / f2 | 2.01 | ink outline on AI colour |
| water_deep / open | 2.63 | river against paddy (terrain-to-terrain) |
| wood_a / open | 1.96 | grove against paddy |

**Palette B** (16 colours): paper `#efe9d6`, ink `#262321`, water_deep `#4a7388`, water_lit `#6b93a6`, water_still `#7fa6a0`, open_lit `#c2d88a`, open `#a9c46a`, open_shade `#86a04f`, wood_a `#5f8f45`, wood_b `#3d6b4f`, rough `#b09a6a`, peak `#8a8272`, earth `#8b6b47`, brick `#a65e3e`, f1 `#1f6f4a`, f2 `#44507f`

| Pair | Ratio | Note |
|---|---|---|
| ink / paper | 12.86 | text and outline on paper (4.5:1 text bar), passes |
| paper / f1 | 5.04 | white-ish text on player colour (4.5:1), passes |
| paper / f2 | 6.41 | white-ish text on AI colour (4.5:1), passes |
| f1 / open | 3.15 | player unit on paddy (3:1 object bar), passes |
| f2 / open | 4 | AI unit on paddy (3:1), passes |
| f1 / wood_b | 1 | player unit on mangrove (3:1; expected weak), **fails** |
| f2 / water_deep | 1.52 | AI boat on deep water (3:1; expected weak), **fails** |
| ink / f1 | 2.55 | ink outline on player colour |
| ink / f2 | 2.01 | ink outline on AI colour |
| water_deep / open | 2.63 | river against paddy (terrain-to-terrain) |
| wood_a / open | 1.96 | grove against paddy |

**Palette C** (14 colours): paper `#efe9d6`, ink `#262321`, water_deep `#4a7388`, water_line `#9fc3cf`, water_still `#7fa6a0`, open `#a9c46a`, wood_a `#5f8f45`, wood_b `#3d6b4f`, rough `#b09a6a`, peak `#8a8272`, sand `#d9c48f`, brick `#a65e3e`, f1 `#1f6f4a`, f2 `#44507f`

| Pair | Ratio | Note |
|---|---|---|
| ink / paper | 12.86 | text and outline on paper (4.5:1 text bar), passes |
| paper / f1 | 5.04 | white-ish text on player colour (4.5:1), passes |
| paper / f2 | 6.41 | white-ish text on AI colour (4.5:1), passes |
| f1 / open | 3.15 | player unit on paddy (3:1 object bar), passes |
| f2 / open | 4 | AI unit on paddy (3:1), passes |
| f1 / wood_b | 1 | player unit on mangrove (3:1; expected weak), **fails** |
| f2 / water_deep | 1.52 | AI boat on deep water (3:1; expected weak), **fails** |
| ink / f1 | 2.55 | ink outline on player colour |
| ink / f2 | 2.01 | ink outline on AI colour |
| water_deep / open | 2.63 | river against paddy (terrain-to-terrain) |
| wood_a / open | 1.96 | grove against paddy |

**Palette D** (14 colours): paper `#e6dcc3`, ink `#2b2622`, sky `#6f7d86`, cloud `#c9cdc9`, light `#c99a4e`, water `#4f6f78`, open `#9cb465`, wood_a `#56794a`, wood_b `#345a48`, rough `#a38c64`, peak `#7d7666`, brick `#9a5a40`, f1 `#1f6f4a`, f2 `#44507f`

| Pair | Ratio | Note |
|---|---|---|
| ink / paper | 10.97 | text and outline on paper (4.5:1 text bar), passes |
| paper / f1 | 4.49 | white-ish text on player colour (4.5:1), **fails** |
| paper / f2 | 5.7 | white-ish text on AI colour (4.5:1), passes |
| f1 / open | 2.66 | player unit on paddy (3:1 object bar), **fails** |
| f2 / open | 3.38 | AI unit on paddy (3:1), passes |
| f1 / wood_b | 1.27 | player unit on mangrove (3:1; expected weak), **fails** |
| ink / f1 | 2.45 | ink outline on player colour |
| ink / f2 | 1.92 | ink outline on AI colour |
| wood_a / open | 2.16 | grove against paddy |


**What the numbers say (all candidates):**
- `f1` deep green on mangrove (`wood_b`) is **1.0:1**, invisible: the player colour is the same value as dark forest. And the
  ink outline on `f1` and `f2` is only 2.0 to 2.6:1. So units cannot rely on an ink outline or on fill colour: they need a
  **light rim** (paper on `f1` is 5.0:1, on `f2` 6.4:1) or a light base disc, plus the banner shape (05 section 3.1) so colour
  is never the only signal. This is a palette decision for the owner (Q6), whichever direction wins.
- `f2` on deep water is 1.5:1: boats need the same light rim.
- Terrain-to-terrain pairs (grove on paddy 2.0, river on paddy 2.6) are deliberately below the object bar; terrain is told
  apart by shape and texture pattern as well as colour (needed anyway for colour-vision access; GDD section 16).
- Palette D needs a darker `f1` (or a lighter paper) to pass the text bar, and fails the unit-on-paddy bar.

---

## 3. Concept prompts per candidate

Common settings for every prompt (the only model whose form, cost and track record are all known here):

| Setting | Value | Why |
|---|---|---|
| Model | `byte-plus-seedream-4-5` (Seedream 4.5) | In `MODEL_LIMITS`; kept layout and identity best in the playbook's drafts |
| Mode | text2image, no references | No anchors exist yet for this game; the `reference` rule then forbids "attached picture" |
| Resolution | 2K | Smallest Seedream 4.5 offers |
| Aspect | per prompt (16:9, 4:3 or 3:4; all in the model's list) | |
| imageCount | 1 | `count` rule: one picture per job, so cost and result stay paired |
| autoEnhancePrompt | false | `enhance` rule: the checked text is the text sent |
| Cost | 15 list, about 14 charged, per job | Quoted 2026-10-03 |
| Variants | 1 job per prompt in its round; more only in round 2 (section 4) | "Variants" means separate jobs, never imageCount above 1 |
| Seed | not exposed by model; record that in the ledger | Form read 2026-10-03 |
| Negative constraints | written into the prompt (there is no negative field): the shared exclusion sentence (no people, faces, animals, flags, symbols, signs, writing, weapons) plus the required "no floor, no gradient, no glow, no anti-aliasing, no dithering, no text", plus per-subject exclusions (no buildings, no boats, no roads, and so on) | `exclusions` rule |
| Alternative model | Kling 3 Omni (2k, 10 list, about 9 charged) is cheaper and in `MODEL_LIMITS`, but has no track record here; use only as an owner-approved probe (Q3) | |

Each prompt = the candidate's style sentence + the subject sentence + (for a set of separate pieces) the sheet sentence + the
candidate's colour sentence + the shared exclusion and background sentence. The exact text to send for each id is in
section 7.2. Prompt ids are `VC-<candidate>-<subject>`. Subjects S1 to S5, S8 and S9 (seven per candidate, all neutral) make
the round 1 set; S6 and S7 (flagged shape studies) are round 2 only, for the chosen direction.

### 3.A Candidate A: Cut paper

Shared style sentence: "A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour."

Shared colour sentence (words only, no hex codes, so the `palette` rule cannot be broken): "Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon."

| Id | Subject | Round | Intent | Aspect | Variants | Review flag |
|---|---|---|---|---|---|---|
| VC-A-S1 | Delta plain slab | 1 | Wide landscape study: how paddy, two river widths, groves and still water read together, and how the cut edge of a map chunk looks. | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-A-S2 | Empty river landing | 1 | A river landing (ghat) as an empty place: water edge, steps, posts, reeds. Tests water and bank materials. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-A-S3 | Hill and forest edge | 1 | Where flat land meets low forested hills (the rough and peak roles); tests how relief and dense forest read. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-A-S4 | Monsoon sky and light | 1 | Sky and light study for the season mood (backdrops, menu, turn-change light); flat stepped bands instead of gradients. | 3:4 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-A-S5 | Isometric terrain tile set | 1 | The eight terrain roles as isometric tiles: the single most important test for readability at 32 px and for the Blender bake. | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-A-S6 | Utility structure shape study | 2 | Massing and roof-shape study only (how a building volume reads on an isometric tile). Not a design for any final building. | 4:3 | round 2 only, and only if this candidate wins: 2 jobs (imageCount 1 each) | R1 historian (and R3 museum reader) before any use as reference: culture-specific building forms. |
| VC-A-S7 | Boat silhouette shape study | 2 | Silhouette and hull-proportion study only (how a boat unit reads at small size on water). Not a design for any final boat. | 16:9 | round 2 only, and only if this candidate wins: 2 jobs (imageCount 1 each) | R1 historian (and R2 for any boat-type names used later) before any use: culture-specific boat forms. |
| VC-A-S8 | Blank interface pieces | 1 | UI panel, bar, button and slot surfaces in the style, with no text or icons, to judge legibility of text that will be laid on top later. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-A-S9 | Palette and mood strip | 1 | The palette the style wants, as flat chips, plus one material shown from lit to shadow (the shading ramp for Blender). | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |


### 3.B Candidate B: Low-poly diorama

Shared style sentence: "A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest."

Shared colour sentence (words only, no hex codes, so the `palette` rule cannot be broken): "Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon."

| Id | Subject | Round | Intent | Aspect | Variants | Review flag |
|---|---|---|---|---|---|---|
| VC-B-S1 | Delta plain slab | 1 | Wide landscape study: how paddy, two river widths, groves and still water read together, and how the cut edge of a map chunk looks. | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-B-S2 | Empty river landing | 1 | A river landing (ghat) as an empty place: water edge, steps, posts, reeds. Tests water and bank materials. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-B-S3 | Hill and forest edge | 1 | Where flat land meets low forested hills (the rough and peak roles); tests how relief and dense forest read. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-B-S4 | Monsoon sky and light | 1 | Sky and light study for the season mood (backdrops, menu, turn-change light); flat stepped bands instead of gradients. | 3:4 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-B-S5 | Isometric terrain tile set | 1 | The eight terrain roles as isometric tiles: the single most important test for readability at 32 px and for the Blender bake. | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-B-S6 | Utility structure shape study | 2 | Massing and roof-shape study only (how a building volume reads on an isometric tile). Not a design for any final building. | 4:3 | round 2 only, and only if this candidate wins: 2 jobs (imageCount 1 each) | R1 historian (and R3 museum reader) before any use as reference: culture-specific building forms. |
| VC-B-S7 | Boat silhouette shape study | 2 | Silhouette and hull-proportion study only (how a boat unit reads at small size on water). Not a design for any final boat. | 16:9 | round 2 only, and only if this candidate wins: 2 jobs (imageCount 1 each) | R1 historian (and R2 for any boat-type names used later) before any use: culture-specific boat forms. |
| VC-B-S8 | Blank interface pieces | 1 | UI panel, bar, button and slot surfaces in the style, with no text or icons, to judge legibility of text that will be laid on top later. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-B-S9 | Palette and mood strip | 1 | The palette the style wants, as flat chips, plus one material shown from lit to shadow (the shading ramp for Blender). | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |


### 3.C Candidate C: Ink-line board

Shared style sentence: "A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space."

Shared colour sentence (words only, no hex codes, so the `palette` rule cannot be broken): "Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon."

| Id | Subject | Round | Intent | Aspect | Variants | Review flag |
|---|---|---|---|---|---|---|
| VC-C-S1 | Delta plain slab | 1 | Wide landscape study: how paddy, two river widths, groves and still water read together, and how the cut edge of a map chunk looks. | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-C-S2 | Empty river landing | 1 | A river landing (ghat) as an empty place: water edge, steps, posts, reeds. Tests water and bank materials. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-C-S3 | Hill and forest edge | 1 | Where flat land meets low forested hills (the rough and peak roles); tests how relief and dense forest read. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-C-S4 | Monsoon sky and light | 1 | Sky and light study for the season mood (backdrops, menu, turn-change light); flat stepped bands instead of gradients. | 3:4 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-C-S5 | Isometric terrain tile set | 1 | The eight terrain roles as isometric tiles: the single most important test for readability at 32 px and for the Blender bake. | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-C-S6 | Utility structure shape study | 2 | Massing and roof-shape study only (how a building volume reads on an isometric tile). Not a design for any final building. | 4:3 | round 2 only, and only if this candidate wins: 2 jobs (imageCount 1 each) | R1 historian (and R3 museum reader) before any use as reference: culture-specific building forms. |
| VC-C-S7 | Boat silhouette shape study | 2 | Silhouette and hull-proportion study only (how a boat unit reads at small size on water). Not a design for any final boat. | 16:9 | round 2 only, and only if this candidate wins: 2 jobs (imageCount 1 each) | R1 historian (and R2 for any boat-type names used later) before any use: culture-specific boat forms. |
| VC-C-S8 | Blank interface pieces | 1 | UI panel, bar, button and slot surfaces in the style, with no text or icons, to judge legibility of text that will be laid on top later. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-C-S9 | Palette and mood strip | 1 | The palette the style wants, as flat chips, plus one material shown from lit to shadow (the shading ramp for Blender). | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |


### 3.D Candidate D: Quiet gouache poster

Shared style sentence: "A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood."

Shared colour sentence (words only, no hex codes, so the `palette` rule cannot be broken): "Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright."

| Id | Subject | Round | Intent | Aspect | Variants | Review flag |
|---|---|---|---|---|---|---|
| VC-D-S1 | Delta plain slab | 1 | Wide landscape study: how paddy, two river widths, groves and still water read together, and how the cut edge of a map chunk looks. | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-D-S2 | Empty river landing | 1 | A river landing (ghat) as an empty place: water edge, steps, posts, reeds. Tests water and bank materials. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-D-S3 | Hill and forest edge | 1 | Where flat land meets low forested hills (the rough and peak roles); tests how relief and dense forest read. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-D-S4 | Monsoon sky and light | 1 | Sky and light study for the season mood (backdrops, menu, turn-change light); flat stepped bands instead of gradients. | 3:4 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-D-S5 | Isometric terrain tile set | 1 | The eight terrain roles as isometric tiles: the single most important test for readability at 32 px and for the Blender bake. | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-D-S6 | Utility structure shape study | 2 | Massing and roof-shape study only (how a building volume reads on an isometric tile). Not a design for any final building. | 4:3 | round 2 only, and only if this candidate wins: 2 jobs (imageCount 1 each) | R1 historian (and R3 museum reader) before any use as reference: culture-specific building forms. |
| VC-D-S7 | Boat silhouette shape study | 2 | Silhouette and hull-proportion study only (how a boat unit reads at small size on water). Not a design for any final boat. | 16:9 | round 2 only, and only if this candidate wins: 2 jobs (imageCount 1 each) | R1 historian (and R2 for any boat-type names used later) before any use: culture-specific boat forms. |
| VC-D-S8 | Blank interface pieces | 1 | UI panel, bar, button and slot surfaces in the style, with no text or icons, to judge legibility of text that will be laid on top later. | 4:3 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |
| VC-D-S9 | Palette and mood strip | 1 | The palette the style wants, as flat chips, plus one material shown from lit to shadow (the shading ramp for Blender). | 16:9 | 1 job in round 1 (imageCount 1); 2 more in round 2 if this candidate wins | none |


---

## 4. Batch plans

Prices assume Seedream 4.5, text to image, 2K, imageCount 1: **15 list, about 14 charged per job.** The cap is stated at list
price so a pricing surprise cannot exceed it. Balance read 2026-10-03: **4,829**.

### 4.1 Round 1: direction pick (cheapest useful round)
One image per candidate per neutral subject: 4 candidates x 7 subjects (S1, S2, S3, S4, S5, S8, S9) = **28 jobs**.

| | Credits |
|---|---|
| List (28 x 15) | 420 |
| Expected charge (28 x 14) | 392 |
| Proposed cap for round 1 | **420** |
| Balance after (worst case) | 4,409 |

Order (so that a stop at any point still leaves a fair comparison): the terrain tile set first for all four (VC-A-S5,
VC-B-S5, VC-C-S5, VC-D-S5), then S1, S9, S8, S4, S2, S3 in that order, each across A to D. If the owner wants to stop after the
first 8 jobs (S5 and S1 for all four: 120 list, 112 charged), that alone answers most of the readability question.

Cheaper alternative (only with the owner's yes for a probe): the same 28 on Kling 3 Omni at 2k = 280 list, about 252 charged;
untested in this project, so a weaker comparison.

### 4.2 Round 2: follow-up for the chosen direction
After scoring (section 5) and the owner's pick:

| Jobs | What | List |
|---|---|---|
| 18 | Winner: all 9 subjects x 2 new jobs (S6 and S7 for the first time, as flagged shape studies) with wording tightened from round 1 lessons | 270 |
| 2 | Runner-up: S1 and S5 once more, to confirm the pick | 30 |
| 4 | Reserve rerolls for prompt failures (a stray figure, text, a frame) | 60 |
| **24** | **Total** | **360 list (about 336 charged)** |

Proposed cap for round 2: **360**. Combined cap for both rounds: **780 list**. Balance after both (worst case): 4,049.
Round 2 prompts are rewritten from round 1 lessons, so they go through the gate again (new text, new check, new yes).

### 4.3 What each spend needs (per `CLAUDE.md`)
For each batch: state the model, the cost per job and in total, the current balance and the batch cap; wait for the owner's
clear yes in chat; the owner unlocks (`touch` of the unlock file, valid 20 minutes, renewed by the owner only); the
assistant generates through **MCP only** (never the CLI); the pre-send prompt hook runs `promptProblems` on every call. A
blocked call means stop and tell the owner, never a workaround.

---

## 5. Evaluation rubric

### 5.1 Criteria (each scored 1 to 5; weight in brackets)
1. **Readability at 32 px (x3).** Downscale each picture so one terrain tile or one structure is about 32 px across (both
   nearest-neighbour and area filter), view at 1x on a phone and a desktop. Can all 8 terrain roles be named? Does a
   structure read as a structure and a boat as a boat? Greyscale copy: still distinguishable?
2. **Palette fit and contrast (x2).** Sample the picture's dominant colours, map them to the candidate palette, and check the
   section 2.6 pairs; does the style leave room for a light unit rim and for engine text on panels (S8)?
3. **Dignity and tone (x3).** Calm, respectful, non-sensational, not toy-like, not heroic or propagandistic, no photographic
   look. Would it sit well beside the remembrance screen?
4. **Feasibility in Blender (x2).** Can the look be reproduced by the automated pipeline with flat or stepped materials, one
   light setup, and an outline method, without hand painting?
5. **Consistency across subjects (x2).** Do S1 to S9 of one candidate look like one game?
6. **Accessibility (x2).** Run the sampled colours through the protanopia, deuteranopia and tritanopia matrices already in
   `src/render/colorVision.ts`; do terrain roles and owner colours stay apart by value and shape?
7. **Risk of unintended depiction (pass/fail gate, not scored).** Any person, face, figure-like shape, flag, insignia,
   symbol, letter-like mark, weapon-like shape, ruin, grave, or something that reads as a real identifiable place or event:
   the picture fails and is not shown to anyone outside the review. A candidate with two or more gate failures in round 1 is
   rewritten before it can win.

### 5.2 Scoring sheet template (one per candidate; copy into the private run log)

| Criterion | Weight | S1 | S2 | S3 | S4 | S5 | S8 | S9 | Mean | Weighted |
|---|---|---|---|---|---|---|---|---|---|---|
| Readability at 32 px | 3 | | | | | | | | | |
| Palette fit and contrast | 2 | | | | | | | | | |
| Dignity and tone | 3 | | | | | | | | | |
| Feasibility in Blender | 2 | | | | | | | | | |
| Consistency | 2 | | | | | | | | | |
| Accessibility | 2 | | | | | | | | | |
| Depiction gate (pass/fail) | gate | | | | | | | | | |
| **Total (max 70)** | | | | | | | | | | |

Plus one free-text line per picture: what failed, what to change in the wording.

### 5.3 Who reviews
- **Owner:** scores all criteria and picks the direction (through the question window). Final say on style.
- **Supervisor sign-off:** the batch sign-off (`npm run check` and gates) when the pack leads to repo changes.
- **R1 historian and R3 museum or memorial reader (11 section 2):** see S6 and S7 shape studies and the winning direction's
  overall tone **before** any of it informs final art; R3 is asked specifically "what may a picture show" (11 section 2).
- **R2 linguist:** only if a later asset gets a Bengali name (boat types, building names); concept images carry no text.
- **R5 opposing-side reader:** not needed for neutral concepts; needed later for any AI-side structures (equal quality rule).

### 5.4 Choosing
Highest weighted total wins unless it fails the depiction gate or scores below 3 on dignity. A split decision (map in one
direction, menus and remembrance screens in D's restraint) is allowed if both share the palette.

---

## 6. After each generation (repo rules) and how the winner feeds production

### 6.1 Per job, in this order (`docs/PROMPTING.md` "After every generation")
0. Before sending: `promptProblems` on the exact prompt and settings (the pre-send hook does it too) and quote the cost with
   `chargedCredits`.
1. Save the raw picture and the exact parameters in the private, git-ignored `art-src/` (suggested
   `art-src/bd1971-concepts/round-<n>/<id>.png` and `<id>.json`). Never in `public/assets`, never committed.
2. Append one line per job to `art-src/ledger.jsonl` (id, date, route MCP, model and settings, exact prompt, credits, whether
   the rules were run before sending, a note "bd1971 concept, reference only"). **The same ledger as the platformer**: the
   audit reads the whole OpenArt account, so a job missing from it fails the audit.
3. Run `npm run art:audit`.
4. Judge it (numbers first, then eyes; section 5) and add one dated entry to "What we learned" in `docs/PROMPTING.md` (no job
   ids). If a lesson changes what should be asked, change the shared wording (and, if the owner approves a concept profile,
   `promptRules.ts` and its tests).
5. `npm test` stays green.

### 6.2 From the winning concept to the Blender style guide (inputs for spec 14)
- **Palette:** fix the final 12 to 24 colours from the winner's S9 strip and section 2.6, as one shared material library in
  Blender (one material per palette colour, constant emission or a 2 to 3 step constant ramp). Re-run the contrast pairs.
- **Shading:** the number of tone steps per material (A: flat plus offset; B: 3 facet steps; C: flat; D: 3 painted steps),
  the light direction (top left, matching the platformer's convention), and whether shadows are cast or faked by offset.
- **Outline:** method (none, offset layer, inverted hull, or Line Art), width in pixels per zoom bucket, colour (ink or a
  darker tone of the fill), and the unit light rim (section 2.6).
- **Camera and scale:** orthographic, isometric angle and tile footprint as spec 14 defines them; render size per zoom
  bucket (GDD 14.3: zoom 0.25 to 2.0, chunks of 16x16 tiles).
- **Minimum feature size:** carry the art bible's rule (anything the player must read is 2 px or more at zoom 1.0; no 1 px
  stripes or dither) into the bake settings.
- **Asset spec:** per role in 05 section 8.1 and 8.2 (terrain variants `tile.t.open.v1..v3`, building levels, unit states),
  with the content limits of 05 section 8.3 copied verbatim. The concept pictures are named in the spec as references with
  their ledger ids; no concept pixel enters a shipped picture.
- **Provenance:** the shipped sprites are "made by script/Blender" with their own provenance; the concepts are recorded only
  in the ledger, not in the game manifest.

---

## 7. Prompt-check status

### 7.1 Status table
Every prompt was assembled by a scratch script from the parts in section 3, and the project's real `promptProblems` (from
`tools/art/promptRules.ts`, run read-only by the agent on 2026-10-03, no network, nothing sent) returned **0 problems for all
36** with the settings listed. That is not the send-time check: the prompt must be re-checked on the exact text and settings
when it is sent (the pre-send hook does it on every MCP generate call). `buildPrompt` was **not** used, on purpose: it inserts
the platformer's pixel-art style sentence and its four orange hex colours, which are wrong for this game.

Hand-verified for every row: `length` (all under 2000; several are 1200 to 1290, a little over the playbook's 1200 habit),
`names` (no game, studio, artist or character; no "in the style of"; also checked against the `NAMED_WORKS` list, which bans
words such as the name of a toy brick brand, so none is used), `palette` (no hex code except `#00FF00`), `background` (the exact
plain-solid-green sentence), `exclusions` (all five required phrases), `sheet` (prompts with several pieces carry the full
sheet sentence; the others avoid the trigger words grid, column, row and frames), `reference` (text to image, no attached
picture), `enhance` (off), `count` (1), `model` (in `MODEL_LIMITS`), `resolution` (2K), `aspect` (in the model's list).

| Id | Chars | Checks hand-verified | promptProblems (agent scratch run, 2026-10-03) | Settings |
|---|---|---|---|---|
| VC-A-S1 | 1139 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-A-S2 | 1057 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-A-S3 | 1013 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-A-S4 | 1096 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 3:4, imageCount 1, autoEnhancePrompt false, no references |
| VC-A-S5 | 1277 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-A-S6 | 1244 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-A-S7 | 1261 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-A-S8 | 1271 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-A-S9 | 1073 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S1 | 1131 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S2 | 1049 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S3 | 1005 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S4 | 1088 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 3:4, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S5 | 1269 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S6 | 1236 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S7 | 1253 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S8 | 1263 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-B-S9 | 1065 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S1 | 1145 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S2 | 1063 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S3 | 1019 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S4 | 1102 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 3:4, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S5 | 1283 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S6 | 1250 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S7 | 1267 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S8 | 1277 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-C-S9 | 1079 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S1 | 1121 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S2 | 1039 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S3 | 995 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S4 | 1078 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 3:4, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S5 | 1259 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S6 | 1226 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S7 | 1243 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S8 | 1253 | length, names, palette, background, exclusions, sheet (sentence present), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 4:3, imageCount 1, autoEnhancePrompt false, no references |
| VC-D-S9 | 1055 | length, names, palette, background, exclusions, sheet (no trigger word), reference, enhance, count, model, resolution, aspect | 0 problems; UNRUN at send time (re-run before sending; the pre-send hook also runs it) | byte-plus-seedream-4-5, text2image, 2K, 16:9, imageCount 1, autoEnhancePrompt false, no references |

### 7.2 Exact text to send, by id
**VC-A-S1** (16:9)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: one wide slab of flat low land cut out like a floating diorama block, seen from above at an isometric angle: paddy fields split into irregular plots by thin raised earth bunds, two winding rivers of different widths crossing it, a few small rounded clumps of village trees and bamboo, one still pond. The cut sides of the slab show plain earth layers. No buildings, no boats, no roads. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-A-S2** (4:3)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: one small floating diorama block of a river bank: a gently sloping earth bank with a few broad plain earth steps going down into calm water, two plain wooden mooring posts, reeds at the edge, one tree leaning over the water. The place is empty and quiet. No boats, no buildings, no objects lying around. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-A-S3** (4:3)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: one floating diorama block where flat paddy land meets the first low rounded forested hills: a band of dense broadleaf forest, a few tall straight trees, a small stream coming out of the hills, the land rising in soft steps. No buildings, no paths, no fences. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-A-S4** (3:4)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: one upright card with rounded corners showing a monsoon sky over a flat horizon: heavy layered rain clouds in three flat stepped tones, a band of late afternoon light breaking under the clouds, a thin flat line of distant tree tops along the horizon, slanted rain drawn as a few long clean strokes. The sky is built from flat bands of colour. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-A-S5** (16:9)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: a set of eight separate isometric diamond-shaped terrain tiles, all the same size, spaced evenly with wide empty space between them: paddy field, village grove with bamboo, mangrove with roots in shallow water, low rounded hills, higher rocky hills, still wetland with reeds, a small river channel, deep open water. Each tile is a thin flat block with a plain earth side. Tiles only, no buildings, no boats. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-A-S6** (4:3, FLAGGED for review)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: two separate shape studies of plain generic single-storey utility buildings seen from an isometric angle, with wide empty space between them: a small shed of woven bamboo walls on a low raised earth plinth with a plain steep thatch roof and broad overhang, and a plain brick storehouse with a low pitched roof of plain sheets. Simple volumes, no decoration, doorways closed. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-A-S7** (16:9, FLAGGED for review)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: three separate side-view shape studies of small generic wooden river boats, spaced evenly with wide empty space between them: a long narrow open hull with a low curved bow, a wider cargo hull with a plain curved woven canopy over the middle, and a small flat raft-like hull. Simple solid shapes in a few flat tones, plain hulls with no markings, empty with nobody aboard, resting on nothing. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-A-S8** (4:3)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: a set of six separate blank interface pieces for a strategy game menu, spaced evenly with wide empty space between them: one large rectangular panel, one long narrow title bar, two rounded buttons (one raised, one pressed), one small square icon slot, one thin plain horizontal bar. The surfaces show the material feel of the style but stay blank, with no icons, no letters, no numbers and no symbols. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-A-S9** (16:9)

```text
A flat cut-paper illustration: every shape is a separate piece of matte coloured paper with crisp clean edges, stacked in a few layers, each layer lifted by a thin hard-edged darker offset under it. Every area is one flat colour. Subject: one long horizontal strip of fourteen flat square colour chips side by side with small even gaps, ordered from water blues through greens to earth browns, then off-white and near-black, and under it one shorter strip of five chips showing the same paddy green from fully lit to deep shade. Each chip is one flat colour. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, near-black ink. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S1** (16:9)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: one wide slab of flat low land cut out like a floating diorama block, seen from above at an isometric angle: paddy fields split into irregular plots by thin raised earth bunds, two winding rivers of different widths crossing it, a few small rounded clumps of village trees and bamboo, one still pond. The cut sides of the slab show plain earth layers. No buildings, no boats, no roads. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S2** (4:3)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: one small floating diorama block of a river bank: a gently sloping earth bank with a few broad plain earth steps going down into calm water, two plain wooden mooring posts, reeds at the edge, one tree leaning over the water. The place is empty and quiet. No boats, no buildings, no objects lying around. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S3** (4:3)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: one floating diorama block where flat paddy land meets the first low rounded forested hills: a band of dense broadleaf forest, a few tall straight trees, a small stream coming out of the hills, the land rising in soft steps. No buildings, no paths, no fences. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S4** (3:4)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: one upright card with rounded corners showing a monsoon sky over a flat horizon: heavy layered rain clouds in three flat stepped tones, a band of late afternoon light breaking under the clouds, a thin flat line of distant tree tops along the horizon, slanted rain drawn as a few long clean strokes. The sky is built from flat bands of colour. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S5** (16:9)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: a set of eight separate isometric diamond-shaped terrain tiles, all the same size, spaced evenly with wide empty space between them: paddy field, village grove with bamboo, mangrove with roots in shallow water, low rounded hills, higher rocky hills, still wetland with reeds, a small river channel, deep open water. Each tile is a thin flat block with a plain earth side. Tiles only, no buildings, no boats. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S6** (4:3, FLAGGED for review)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: two separate shape studies of plain generic single-storey utility buildings seen from an isometric angle, with wide empty space between them: a small shed of woven bamboo walls on a low raised earth plinth with a plain steep thatch roof and broad overhang, and a plain brick storehouse with a low pitched roof of plain sheets. Simple volumes, no decoration, doorways closed. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S7** (16:9, FLAGGED for review)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: three separate side-view shape studies of small generic wooden river boats, spaced evenly with wide empty space between them: a long narrow open hull with a low curved bow, a wider cargo hull with a plain curved woven canopy over the middle, and a small flat raft-like hull. Simple solid shapes in a few flat tones, plain hulls with no markings, empty with nobody aboard, resting on nothing. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S8** (4:3)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: a set of six separate blank interface pieces for a strategy game menu, spaced evenly with wide empty space between them: one large rectangular panel, one long narrow title bar, two rounded buttons (one raised, one pressed), one small square icon slot, one thin plain horizontal bar. The surfaces show the material feel of the style but stay blank, with no icons, no letters, no numbers and no symbols. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-B-S9** (16:9)

```text
A low-poly 3D diorama render seen from a high isometric three-quarter view: simple chunky faceted shapes, every facet one flat matte colour with hard edges, light from the top left so top faces are lightest and right faces darkest. Subject: one long horizontal strip of fourteen flat square colour chips side by side with small even gaps, ordered from water blues through greens to earth browns, then off-white and near-black, and under it one shorter strip of five chips showing the same paddy green from fully lit to deep shade. Each chip is one flat colour. Colours: soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, warm off-white, near-black. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S1** (16:9)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: one wide slab of flat low land cut out like a floating diorama block, seen from above at an isometric angle: paddy fields split into irregular plots by thin raised earth bunds, two winding rivers of different widths crossing it, a few small rounded clumps of village trees and bamboo, one still pond. The cut sides of the slab show plain earth layers. No buildings, no boats, no roads. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S2** (4:3)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: one small floating diorama block of a river bank: a gently sloping earth bank with a few broad plain earth steps going down into calm water, two plain wooden mooring posts, reeds at the edge, one tree leaning over the water. The place is empty and quiet. No boats, no buildings, no objects lying around. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S3** (4:3)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: one floating diorama block where flat paddy land meets the first low rounded forested hills: a band of dense broadleaf forest, a few tall straight trees, a small stream coming out of the hills, the land rising in soft steps. No buildings, no paths, no fences. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S4** (3:4)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: one upright card with rounded corners showing a monsoon sky over a flat horizon: heavy layered rain clouds in three flat stepped tones, a band of late afternoon light breaking under the clouds, a thin flat line of distant tree tops along the horizon, slanted rain drawn as a few long clean strokes. The sky is built from flat bands of colour. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S5** (16:9)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: a set of eight separate isometric diamond-shaped terrain tiles, all the same size, spaced evenly with wide empty space between them: paddy field, village grove with bamboo, mangrove with roots in shallow water, low rounded hills, higher rocky hills, still wetland with reeds, a small river channel, deep open water. Each tile is a thin flat block with a plain earth side. Tiles only, no buildings, no boats. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S6** (4:3, FLAGGED for review)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: two separate shape studies of plain generic single-storey utility buildings seen from an isometric angle, with wide empty space between them: a small shed of woven bamboo walls on a low raised earth plinth with a plain steep thatch roof and broad overhang, and a plain brick storehouse with a low pitched roof of plain sheets. Simple volumes, no decoration, doorways closed. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S7** (16:9, FLAGGED for review)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: three separate side-view shape studies of small generic wooden river boats, spaced evenly with wide empty space between them: a long narrow open hull with a low curved bow, a wider cargo hull with a plain curved woven canopy over the middle, and a small flat raft-like hull. Simple solid shapes in a few flat tones, plain hulls with no markings, empty with nobody aboard, resting on nothing. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S8** (4:3)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: a set of six separate blank interface pieces for a strategy game menu, spaced evenly with wide empty space between them: one large rectangular panel, one long narrow title bar, two rounded buttons (one raised, one pressed), one small square icon slot, one thin plain horizontal bar. The surfaces show the material feel of the style but stay blank, with no icons, no letters, no numbers and no symbols. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-C-S9** (16:9)

```text
A clean flat vector illustration like a hand-drawn game board, seen from a high isometric view: flat colour fills with one even dark ink outline round every shape, simple geometric forms, generous empty space. Subject: one long horizontal strip of fourteen flat square colour chips side by side with small even gaps, ordered from water blues through greens to earth browns, then off-white and near-black, and under it one shorter strip of five chips showing the same paddy green from fully lit to deep shade. Each chip is one flat colour. Colours: warm off-white paper, soft paddy green, deep grove green, dark mangrove green, muted river blue-grey, pale still-water teal, warm sandy earth, grey-brown hill stone, and one near-black ink for every outline. Muted and natural, nothing neon. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S1** (16:9)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: one wide slab of flat low land cut out like a floating diorama block, seen from above at an isometric angle: paddy fields split into irregular plots by thin raised earth bunds, two winding rivers of different widths crossing it, a few small rounded clumps of village trees and bamboo, one still pond. The cut sides of the slab show plain earth layers. No buildings, no boats, no roads. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S2** (4:3)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: one small floating diorama block of a river bank: a gently sloping earth bank with a few broad plain earth steps going down into calm water, two plain wooden mooring posts, reeds at the edge, one tree leaning over the water. The place is empty and quiet. No boats, no buildings, no objects lying around. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S3** (4:3)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: one floating diorama block where flat paddy land meets the first low rounded forested hills: a band of dense broadleaf forest, a few tall straight trees, a small stream coming out of the hills, the land rising in soft steps. No buildings, no paths, no fences. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S4** (3:4)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: one upright card with rounded corners showing a monsoon sky over a flat horizon: heavy layered rain clouds in three flat stepped tones, a band of late afternoon light breaking under the clouds, a thin flat line of distant tree tops along the horizon, slanted rain drawn as a few long clean strokes. The sky is built from flat bands of colour. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S5** (16:9)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: a set of eight separate isometric diamond-shaped terrain tiles, all the same size, spaced evenly with wide empty space between them: paddy field, village grove with bamboo, mangrove with roots in shallow water, low rounded hills, higher rocky hills, still wetland with reeds, a small river channel, deep open water. Each tile is a thin flat block with a plain earth side. Tiles only, no buildings, no boats. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S6** (4:3, FLAGGED for review)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: two separate shape studies of plain generic single-storey utility buildings seen from an isometric angle, with wide empty space between them: a small shed of woven bamboo walls on a low raised earth plinth with a plain steep thatch roof and broad overhang, and a plain brick storehouse with a low pitched roof of plain sheets. Simple volumes, no decoration, doorways closed. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S7** (16:9, FLAGGED for review)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: three separate side-view shape studies of small generic wooden river boats, spaced evenly with wide empty space between them: a long narrow open hull with a low curved bow, a wider cargo hull with a plain curved woven canopy over the middle, and a small flat raft-like hull. Simple solid shapes in a few flat tones, plain hulls with no markings, empty with nobody aboard, resting on nothing. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S8** (4:3)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: a set of six separate blank interface pieces for a strategy game menu, spaced evenly with wide empty space between them: one large rectangular panel, one long narrow title bar, two rounded buttons (one raised, one pressed), one small square icon slot, one thin plain horizontal bar. The surfaces show the material feel of the style but stay blank, with no icons, no letters, no numbers and no symbols. All of it is one single picture with no panels, no frames, no dividers and no borders, and every piece faces right. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```

**VC-D-S9** (16:9)

```text
A muted flat poster illustration painted in opaque matte paint: big simple shapes, each shape filled with one flat colour, at most three tones per material, hard clean edges between tones, a calm and quiet mood. Subject: one long horizontal strip of fourteen flat square colour chips side by side with small even gaps, ordered from water blues through greens to earth browns, then off-white and near-black, and under it one shorter strip of five chips showing the same paddy green from fully lit to deep shade. Each chip is one flat colour. Colours: dusty paddy green, grey-green grove, deep blue-green mangrove, slate river blue, soft clay earth, warm ochre light, pale cloud grey, cool slate sky, warm off-white, dark brown-black. Low saturation, nothing bright. Nothing else in the picture: no people, no faces, no animals, no flags, no symbols, no signs, no writing, no weapons. The background is one plain solid bright green (#00FF00), completely flat, with nothing else on it: no floor, no gradient, no glow, no anti-aliasing, no dithering, no text.
```


---

## 8. Open questions and approvals needed

| # | Question or approval | Who | Default if unanswered |
|---|---|---|---|
| Q1 | **Spend gate, round 1:** Seedream 4.5, 28 jobs, 15 list (about 14 charged) each, 420 list in all, balance 4,829, cap 420. Yes or no? | Owner, in chat | No spend |
| Q2 | **Unlock:** the owner touches the unlock file for each 20-minute window; the assistant never does | Owner | Locked |
| Q3 | Allow a Kling 3 Omni probe (cheaper, untested) instead of or beside Seedream 4.5? | Owner | Seedream 4.5 only |
| Q4 | Add a separate "concept" profile to `promptRules.ts` (own background and palette rules, tests first), so concept prompts need not pretend to be sprites on green and a wash direction can be tested? A code change with a supervisor sign-off | Owner | Keep current rules; prompts as written here |
| Q5 | **Plan tier:** Plus is confirmed on the account and is an allowed plan for commercial use; concepts are reference only. Confirm that is enough for this game too | Owner | Plus |
| Q6 | Unit visibility: adopt a light rim (or base disc) for units and boats, given `f1` on mangrove is 1.0:1 and the ink outline on owner colours is 2.0 to 2.6:1? Or change `f1` (05 section 3.1, also a reviewer item)? | Owner, then R1/R2 for the colour meaning | Light rim proposed |
| Q7 | Round 2 cap (360 list) and whether S6/S7 shape studies may be generated before the reviewers are recruited (they stay private until reviewed) | Owner | Generate, keep private, show reviewers before any use |
| Q8 | One direction for everything, or the map in one direction and screens in D's restraint? | Owner | Decide after round 1 |
| Q9 | Budget ceiling for this game's concept work overall (the platformer's 400-credit v1 cap does not cover it) | Owner | 780 list for both rounds |
| Q10 | Align with spec 14 when it lands (camera angle, tile footprint, outline method); re-check sections 2 and 6.2 against it | Main session | Re-read 14 before round 2 |

Nothing in this pack has been sent to OpenArt, and no file other than this one was written in the repository.
