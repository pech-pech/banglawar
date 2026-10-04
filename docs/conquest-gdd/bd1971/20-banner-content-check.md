# 20 Banner pictogram content check (B2, W1a)

Date: 2026-10-04. Review only. Pictures seen: `round-16-banners/seedream-B2.jpeg` and `round-17-banners-in-world/seedream-W1a.jpeg` (both reference only, never shipped). Checked against 04 section 9 and rules 8 to 10, 05 section 8.3 rules 1 to 3, 14 sections 12 and 14, 15 section 1.3, and the scoring notes in 18 (B1, B2, W1). This is a reading of the rules, not a reviewer decision (the reviewer gate in 05 section 10 still applies).

## What both pictures show
- Four parchment cards with a teal band, hung from a rod, pointed (swallow-tail) bottom. W1a puts them over open tiles with a thin vertical beam.
- No people, no faces of people, no lettering or numbers, no flag, no emblem, no cross or crescent, no firearm in either picture.

## Verdict per icon
| Icon | Verdict | Rule and reason |
|---|---|---|
| Lantern (hurricane lamp) | PASS | Plain object. Not a person, weapon, flag or protected emblem (05 8.3 rules 1 to 3; 15 1.3). Caveat: a lantern may double as an election or party symbol in Bangladesh. UNVERIFIED, not researched. Reviewer to confirm (04 section 9 rule 8, no slogans or symbols that carry present-day politics). |
| Ox and cart | PASS WITH CONDITION (recommend change) | No rule bans animals. See the ox tension below. The ox has a front-facing face with eyes; 14 section 12 forbids "face" as an asset tag and 05 8.3 rule 2 is about people's faces, so the ox is a borderline reading, not a clear breach. |
| Bamboo fence | PASS | Bamboo is a named setting material (05 res.basic). The two X-shaped lashings are plain ties, not a cross symbol. Check that they stay small and read as lashings (05 8.3 rule 1 bars protected crosses). |
| Sickle and basket | PASS WITH CAUTION | Farm tool plus basket, which is rule-compatible (a harvest pair). Cautions: (a) the sickle blade is large, black and curved and could read as a blade weapon at small size (15 1.3 "no weapons at all"); (b) a sickle on its own is a farm tool, but a sickle beside a second tool is a known party symbol, so never pair it with a hammer or similar. Reviewer to confirm. |

## The "no animals" tension
- Source: 15 section 1.3 says every prompt ends with the same exclusion sentence (no people, faces, animals, flags, symbols, signs, writing, weapons). 18 notes the ox still drew in B2.
- That sentence is a prompt rule for concept work (neutral subjects: terrain, vegetation, materials). It is not an in-game depiction rule. Nothing in 04, 05 or 14 lists animals as forbidden art.
- But the tail also says "no symbols" and "no faces". A pictogram on a card is a symbol by definition, and the ox has a face. So the four icons already sit outside the letter of the tail. The tail was either ignored by the model or overridden by the reference picture (B2 and W1 used reference images). That is a prompt-check gap: `promptRules.ts` would not have passed this prompt had it contained "ox" next to the tail.
- Do the rules allow an ox pictogram? Not explicitly, not forbidden. They do not recommend a cart-only icon either. No rule text names an ox, bullock or cart.

## Recommendation
1. Prefer a cart-only icon (a plain two-wheel bullock cart with yoke pole, no animal). It removes the animal-and-face question and the contradiction with the exclusion tail, and it is simpler to read at the small size seen in W1a. Keep "bullock cart" as the object in the label.
2. If the ox stays, make a written exception in 15 section 1.3 (animals are allowed as object-style pictograms, with no eyes or face detail), and ask the reviewers to approve it. Do not rely on the model ignoring the tail.
3. Reword the tail for banner prompts to match what is actually wanted: "no people, no human faces, no flags, no insignia, no writing, no weapons" and add an explicit allowed list (lantern, cart, bamboo, sickle, basket). Then the check and the picture agree.
4. Rename the cards in docs and prompts to "unit markers" or "unit cards". 15 1.3 bars "banners", and 05 3.1 already uses "banner" for the faction pennant (shape: swallow-tailed with a white ring). A swallow-tailed hanging card with a coloured band is close to that faction pennant. Keep the teal band clearly different from the faction colours (f1 green, f2 blue-violet) and the pennant's white ring.
5. Reduce the sickle blade (shorter, thicker, less curved) or swap the sickle for a plain rice bundle or basket alone, if a reviewer finds it weapon-like.
6. Ask a Bangladeshi reviewer about the lantern and the sickle (party or election symbols), before any icon becomes final art. All four icons stay reference-only until then.

## Not checked
- Whether any icon matches a current party symbol (not researched).
- Whether the ox pictogram is acceptable to the community reviewers (not asked).
- Fit with the colour-vision and contrast rules of 05 section 1.3 (not tested; the pictures are not in the project palette).


## Decisions and proposed wording (2026-10-04, for the owner's approval; nothing below is applied to any rule file)

Owner decisions: keep the ox on the cart icon; call the cards "unit markers"; the founder marker shows a homestead (a small hut), replacing the spade (plan) and the sickle (earlier banner).

Proposed written exception for the theme pack content rules (draft): "A unit marker pictogram may show a draft animal (an ox) as a plain dark object-style silhouette without a face, eyes or expression, drawn as part of a cart. No other animal appears anywhere in the game pictures."

Proposed reworded exclusion tail for unit-marker prompts only (draft): "no people, no human faces, no flags, no symbols, no signs, no writing, no weapons." Today's required tail also says "no animals" and "no faces"; the prompt-check hook (tools/art/promptRules.ts) enforces the exact tail, so using the reworded tail needs an approved change to that rule and its tests, which is the owner's call. Until then the ox is requested with the standard tail and may not draw reliably.
