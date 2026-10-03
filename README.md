# banglawar

Design documents for a theme-agnostic, turn-based colony-economy and tactical-combat strategy game, with a
**Bangladesh Liberation War (1971)** theme played from the Bangladeshi side.

> **Status: DRAFT. Not for citation.** Every historical claim in these documents is provisional until it has been
> reviewed by a Bangladeshi historian and a native Bengali speaker. Many facts rest on secondary sources
> (some only on search summaries). Contested figures are shown as ranges with attribution. Several numbers are
> invented tunables, marked ASSUMED. No game code and no art exist yet.

## What is here

All documents are in [`docs/conquest-gdd/`](docs/conquest-gdd/):

| File | Content |
|---|---|
| `GDD.md` | Neutral, theme-agnostic game design document (rules, economy, combat, AI, UX, phases) |
| `01`-`03` | Rules extracted from the reference manual (economy, units and combat, map and UI) |
| `04-theme-architecture.md` | Ruleset, variant, theme-pack and settings layers |
| `05-critique.md` | Independent review of an earlier design draft |
| `13-unity-architecture-plan.md` | Unity 6 with an engine-free C# core: architecture, determinism, testing |
| `bd1971/` | The 1971 theme: research, role mapping, sensitivity comparison, theme pack, variant and hooks, map draft, fact-checks, errata, test plans, reviewer plan, visual pipeline spec, concept prompt pack, consistency checks |

Start with `GDD.md`, then `bd1971/16-final-consistency-check.md` for the current list of known defects and open decisions.

## Treatment of the human cost

The simulation holds no civilians. The human story is carried by sourced remembrance text and an encyclopedia.
Some of the guarantees behind this are text-level, not rule-level, and need historian review (see
`bd1971/04-sensitivity-comparison.md` and `bd1971/11-reviewer-plan.md`).

## Known state

- Spellings, sector areas, dates and several facts are unverified or contested; see `bd1971/07a-07c` and `09`.
- The visual direction is undecided; `bd1971/14` and `bd1971/15` are specs and prompt drafts only. Nothing has been generated.
- Placeholders remain in the scenario skeleton and map draft.
- Reference manual: the rules were extracted from a 1996 game manual. Mechanics and numbers are reproduced for design
  reference only; no original art, text or names are intended to be shipped.

## Code scaffolding (Phase 0, in progress)

- [`conquest/dotnet/`](conquest/dotnet/): engine-free C# core (`netstandard2.1`, C# 9) with an NUnit test project and coverlet coverage. A first smoke slice (integer `FloorDiv` and `Percent` helpers) is in place; run `dotnet test conquest/dotnet/Conquest.slnx`.
- [`conquest/unity/`](conquest/unity/): Unity 6000.6.3f1 project from the Universal 2D template. It contains a Noto Sans Bengali font (SIL Open Font License, text included) for the planned Bengali text-shaping test.
- No game logic, art or generated images are in this repository. Visual direction is undecided; see `docs/conquest-gdd/bd1971/17-visual-direction-scores.md`.

## Licence

Not yet chosen.
