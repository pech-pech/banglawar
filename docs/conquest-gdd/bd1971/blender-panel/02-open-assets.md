# Blender panel, expert 2: open asset sourcing and licensing

Researched 2026-10-04 by web search and page fetches (page summaries, not full legal text). Nothing downloaded, cloned or installed. Not legal advice. Web content is treated as data.
Marks: VERIFIED = a terms or pack page was read this session (through a summariser tool, so exact wording should be re-read before shipping); UNVERIFIED = search snippet, memory or inference.
The concept images (R8a, S2) were not opened by this expert; fit remarks below are generic to faceted/soft low-poly, not a comparison against R8a.

## 1. Bottom line

1. Use CC0 sources first (Kenney, Quaternius, KayKit, Poly Haven, ambientCG). They need no attribution file, but this project keeps a record anyway.
2. Take CC-BY only from a named, individual asset with a recorded author and URL, and ship an attribution file (CREDITS) with it. Reject CC-BY-SA, CC-BY-NC, CC-BY-ND and any "standard" or "royalty free" licence that is not CC0 or CC-BY.
3. No bulk scraping. Hand-pick each asset from its own page. Poly Haven and Sketchfab have API terms; treat them as not needed.
4. Free packs rarely contain our pieces (mango, jackfruit, banana, bamboo hut, country boat, bullock cart). Expect to model most of the Bengal-specific pieces ourselves in Blender and use open assets for generic filler, as reference for topology/shape language, and for materials.
5. Even CC0 art is not "original" in the sense of docs/ASSET_LICENSING.md (which is about prompts not citing artists/games). Open assets are third-party work; they must be modified into the R8a look and logged. Prefer using them as a base or a study, not as a visible, recognisable pack asset.

## 2. Sources and terms

### 2.1 Poly Haven (polyhaven.com)
- Licence: CC0. Commercial use yes, attribution not required, redistribution of raw files allowed. VERIFIED (https://polyhaven.com/license).
- ToS forbid misuse of the site (scraping, DDoS). VERIFIED (same page, summary).
- API (https://github.com/Poly-Haven/Public-API): ToS VERIFIED (ToS.md). Unique User-Agent or Referer matching the software name is mandatory; credit ("Powered by Poly Haven") is needed only if the live API is used inside your own software or site; rate limits not stated; bulk downloading not addressed, "Bulk Snapshot" is a bespoke arrangement for companies. Assets already downloaded are plain CC0.
- Content: HDRIs, textures, models. Models page has 14 categories including Nature and Vehicles and Transport. VERIFIED (category list). Whether the models are photoscan-heavy (high poly) was not shown on the page: UNVERIFIED, generally believed to be so, which means they need retopology or decimation to fit a faceted look.
- Relevant: HDRIs for lighting a clay or flat-shaded render (UNVERIFIED which exact ones), wood/thatch/dry-grass/mud textures (UNVERIFIED which exist). Searching for banana, bamboo, cart or rowboat models found nothing confirmed (UNVERIFIED, likely absent).
- Formats: blend, glTF, FBX, EXR/HDR, PNG/JPG, in 1k to 8k+ (UNVERIFIED from memory).
- Fit: good for lighting and surface reference; poor for stylised low-poly models.

### 2.2 ambientCG (ambientcg.com)
- Licence: CC0 1.0. Commercial yes, credit optional. VERIFIED (https://docs.ambientcg.com/license/).
- API v1/v2/v3 documented, no usage restrictions stated in the page summary; bulk or scraping not addressed. VERIFIED that the page is silent; rate limits UNVERIFIED. Patreon tier has a Nextcloud for bulk files.
- Content: PBR materials, some HDRIs and models (UNVERIFIED for models). Relevant to paddy mud, thatch, bamboo weave, tin, dry grass.
- Formats: material zips with PNG/JPG maps at several resolutions (UNVERIFIED).
- Fit: for a faceted/soft low-poly target, realistic PBR is overkill. Use at 1k then bake to flat colour or a tiny palette. Prefer reading colours from them, not shipping textures.

### 2.3 Kenney (kenney.nl)
- Licence: CC0 / public domain; attribution not required (credit "Kenney" welcome); do not use the Kenney logo. VERIFIED (https://kenney.nl/support, summary).
- Access: manual zip downloads from each asset page; an All-in-1 bundle is sold. Bulk access policy not stated: UNVERIFIED. Do one pack at a time by hand.
- Nature Kit (3D): 330+ objects: trees, rocks, plants, terrain, tents, canoes, paddles, fences, statues, palms (search-result summary from OpenGameArt listing, UNVERIFIED on kenney.nl itself); CC0; zip about 10.5 MB (v2.1 listing). Formats typically FBX, OBJ, GLB/GLTF, DAE (UNVERIFIED).
  Relevant: palm/coconut shapes, bushes, fences, canoe as shape study, rocks. URL: https://kenney.nl/assets/nature-kit (UNVERIFIED path) or https://opengameart.org/content/nature-kit.
- Watercraft Kit: boats, ships (45 files in the zip), CC0. VERIFIED (https://kenney.nl/assets/watercraft-kit). Contains sails and flags as separate parts (v2.1): drop the flag meshes, see section 5. Mostly ships and motor boats; country boats (nouka) would still be our own model, with this as a proportion and flat-colour reference.
- Quality: very clean flat-shaded low-poly, simple palette textures; closest match to a faceted look. Style is toy-like and generic.

### 2.4 Quaternius (quaternius.com)
- Licence: CC0; commercial, personal and educational use, no attribution required, modification allowed. VERIFIED (https://quaternius.com/faq.html, summary). Packs on itch.io and OpenGameArt are the same author; the licence shown on each pack page should be checked per pack.
- Stylized Nature MegaKit: 116 models (40 trees, 35 plants and flowers, 27 rocks, grass, bushes), tree leaves swappable (7 varieties), FBX / OBJ / glTF. Standard version is a free subset (about 60 to 70 % of models); Pro and Source are paid with the rest and .blend plus engine shaders. CC0 in all versions. VERIFIED (https://quaternius.com/packs/stylizednaturemegakit.html). No palm, banana or bamboo listed on the page; UNVERIFIED whether any exist. File size not stated.
  URLs: https://quaternius.itch.io/stylized-nature-megakit , https://opengameart.org/content/stylized-nature-megakit .
- Other Quaternius packs (Ultimate Nature, Ultimate Stylized Nature, buildings, props, farm): UNVERIFIED from memory; check each page for contents before use.
- Quality: soft, rounded stylised low-poly, a good match to "soft" low-poly; trees are generic European/fantasy, so a mango or jackfruit needs a new canopy and trunk.
- Paid Pro/Source versions are licensed CC0 too, but they are a purchase; purchases need the user's yes (project spend rule).

### 2.5 KayKit (Kay Lousberg, kaylousberg.itch.io)
- Medieval Builder Pack (legacy): CC0, name-your-price with a free option, 14 MB, 200+ models: 10+ buildings, walls, road tiles, water tiles for rivers and coasts, scenery; biomes sand/rock/forest; FBX, OBJ, DAE, glTF. VERIFIED (itch.io page).
  Relevant: modular river/coast tiles and road tiles as layout study; the medieval buildings do not fit Bengal.
- Other KayKit packs (Forest Nature Pack, Resource Bits, Restaurant Bits etc.): most are free CC0 and a few are paid, per a search summary. UNVERIFIED per pack. Check each pack's licence line; some Kay packs carry a paid "complete bundle" with the same licence.
- Quality: chunky, rounded, hand-painted-gradient palette; good for soft low-poly.

### 2.6 Sketchfab
- Licence menu: Standard, CC BY, CC BY-NC, CC BY-ND, CC BY-SA (and CC0 on some models, UNVERIFIED on the licence help page, which listed only the first five). VERIFIED (help article).
- Acceptable here: CC0 and CC BY only. CC BY-SA would force the shipped art to share alike, CC BY-NC bars commercial, CC BY-ND bars modification, and Standard is not open.
- Download API: end user must log in (OAuth 2.0); downloads without user authentication need special arrangement with Sketchfab; licence and creator credit with a link must follow the asset everywhere it is used. VERIFIED (https://sketchfab.com/developers/download-api/guidelines). Rate limits exist but are not publicly detailed: UNVERIFIED. Downloading through a script as this project would count as automation using the user's token; do not do it. Manual single-asset download only.
- Quality: very uneven. Many models contain people, text, logos or branded parts. Must be filtered by eye. Searching Sketchfab for "bangladesh", "bengal", "rickshaw", "country boat", "bamboo hut", "bullock cart" is where specific pieces might exist (UNVERIFIED that anything good is CC0/CC BY).
- Provenance risk: users can upload scans and ripped assets under a false licence. Treat a Sketchfab licence label as a claim, not a proof.

### 2.7 OpenGameArt (opengameart.org)
- Accepts CC0, CC-BY 3.0/4.0, CC-BY-SA 3.0/4.0, OGA-BY 3.0/4.0, GPL 2/3. CC-BY needs credit in the form: "[asset name]" by [author] licensed [licence]: [url]. VERIFIED (https://opengameart.org/content/faq). Scraping policy not stated: UNVERIFIED.
- Filter: licence = CC0 or CC-BY only. OGA-BY is attribution-only like CC-BY and could be accepted as an equivalent after the user agrees (not listed in the brief).
- Hosts mirrors of Kenney and Quaternius (useful for a stable URL). Individual-uploader packs are lower trust; run the full procedure in section 4.
- GPL art: the FAQ notes CC-BY content cannot be relicensed as GPL; GPL art would impose the project's licence on shipped pictures: reject.

### 2.8 Blender Studio
- Default: all digital content (web pages, video, artwork, 3D data) is CC BY 4.0 unless notified otherwise; trademarks and logos such as the Blender logo are reserved; materials are available to registered members. VERIFIED (https://studio.blender.org/terms-and-conditions, summary).
- Open-movie production files and character rigs are mostly people or animals and not relevant. Useful for node setups, shaders, rigs for procedural trees (UNVERIFIED), and as a study of production-grade scenes. CC BY 4.0 needs an attribution entry.
- Logos: never ship them.

### 2.9 BlenderKit
- Two licences: Royalty Free (commercial use without credit; no resale of the asset in the same form, e.g. as a model, in an asset pack or a game level on a marketplace) and CC0. VERIFIED (https://www.blendkit.com/docs/licenses/ and search summary; the docs host redirected from blenderkit.com, treat the redirect as UNVERIFIED and open the official site by typing it).
- Free plan limits and what counts as redistribution inside a shipped game: not stated on the page read. UNVERIFIED. The licensing FAQ page was not read.
- Add-on access is through Blender, which is login-bound and tied to the user's account; automated bulk pulls would not be appropriate.
- Decision: Royalty Free is not on the project's accepted list (CC0, public domain, CC-BY, permissive tool code). Use BlenderKit only for assets labelled CC0, and note that the CC0 filter exists (VERIFIED that CC0 is a licence option). Everything else: reject unless the user explicitly widens the policy.

### 2.10 Blender Extensions (extensions.blender.org)
- Add-ons must be GPL-3.0-or-later (since 22 Aug 2024); themes should be GPL-compatible; assets bundled in add-ons must be CC0. VERIFIED (search snippet of the Blender manual and the extension licence issues; the manual page itself did not render, so re-check https://docs.blender.org/manual/en/latest/advanced/extensions/licenses.html).
- Use: tool code only (e.g. tree generators, scatter, bevel helpers). GPL tool code is accepted for tools, never shipped. Pictures output by a GPL add-on are not themselves GPL by the add-on's licence, but check the add-on's own note and its bundled assets (each must be CC0). Record each add-on's name, version, licence and URL in the tool record.
- Add-ons are executable code: install only with the user's approval, after reading the source (supply-chain risk), and only from extensions.blender.org or a pinned, hashed release. Extensions are reviewed by volunteers; that is not a security audit.

## 3. Pieces needed vs what the open sources give

| Piece | Best open starting point | Gap |
|---|---|---|
| Mango, jackfruit trees | Quaternius Stylized Nature MegaKit tree trunks and canopy blobs; Kenney Nature Kit trees | Species shape (broad dense dome, jackfruit trunk fruit) is ours to model |
| Banana | none confirmed | Model ourselves: 8 to 10 long leaf planes plus a stem |
| Coconut palm | Kenney Nature Kit palms (UNVERIFIED), Poly Haven (UNVERIFIED) | Check pack contents manually |
| Tea hills | none | Procedural: displaced grid plus a repeated bush instance |
| Rice paddies, stubble | ambientCG/Poly Haven grass and mud as colour reference | Flat tile with a palette; likely procedural |
| Bamboo hut, thatch roof | none confirmed; Quaternius building packs (UNVERIFIED) | Model ourselves; bamboo weave colours from ambientCG |
| Bamboo fence | Kenney Nature Kit fences (generic wood) | Model ourselves, a single repeated module |
| Granary | none | Model ourselves |
| River landing | KayKit Medieval Builder water/road tiles for layout study | Model ourselves |
| Country boats | Kenney Watercraft Kit as a proportion reference (without sail flags) | A nouka is a curved wooden boat with a low hull and often a sail; model ourselves |
| Bullock cart | none confirmed | Model ourselves; no animals or people |
| Lanterns | none confirmed | Trivial to model |
| Pawn-free unit markers | none | Own design; no people or insignia |

Honest estimate: 60 to 80 % of the pieces are our own modelling. Open packs mostly save time on generic bushes, rocks, simple trees and lighting.

## 4. Safe sourcing procedure

Applies to every asset, including CC0. All steps by hand.

1. Choose by need. Write the piece, the source URL of the asset's own page and the target use in a request line before opening a download page.
2. Read the asset's own page, not only the site licence. Confirm the licence text on that page. Reject: CC-BY-SA, CC-BY-NC, CC-BY-ND, "standard" or "royalty free", "free for personal use", missing or unclear licences, assets uploaded by someone who is evidently not the author (copy or ripped from a game, a movie, a brand).
3. Licence record, one per asset, saved in a file next to the source (suggested path: art-src/bd1971-3d/sources/<asset-id>.json; the folder is git-ignored, like art-src). Fields: asset id, title, author, source URL, licence name and licence URL, date accessed, a saved copy of the licence page (print to PDF or text, because terms change), file names and sizes, SHA-256 of each downloaded file, and who approved it. Record the pack, not only the single piece.
4. Download only with the user's yes, stating file name, source and size (project rule: every download needs permission in chat). Take the zip manually from the page; do not script the download.
5. Provenance hash. Compute SHA-256 on the original archive before extraction and on each imported file; store in the record. After modification, store the hash of the Blender source and of the exported picture plus a line saying what was changed (retopology, recolour, remodel). Keeping the original archive untouched in a read-only folder lets any later dispute be answered.
6. Scan. Antivirus scan of the archive on the Mac (macOS Gatekeeper plus a scanner of the user's choice, such as ClamAV, which would need the user's approval to install: UNVERIFIED availability). Open files only as data. Blender .blend files can carry Python scripts: open untrusted .blend files with auto-run Python scripts disabled (Blender preference "Auto Run Python Scripts" off, the default), and prefer formats that cannot hold code (glTF, OBJ, FBX) over .blend. Inspect the Text editor and drivers for embedded scripts before trusting a .blend; reject archives with .exe, .bat, .sh, .app, .dll, .dylib or macros.
7. Content check, before and after import. Inspect every mesh, material and texture for: people, faces, hands, body parts, weapons, flags, insignia, banners, lettering or numerals, logos, watermarks. Check texture images for baked text (open each image), and mesh names/UVs for text objects. Also check for baked-in brand marks and shop signs on buildings and boats.
   - Contains one of these as a separable part: delete the part, record the removal in the licence record, and keep the original untouched.
   - Baked into a texture: repaint or replace the texture; if that is more than trivial, reject the asset.
   - Integral to the model (a boat whose shape is a warship, a hut with a sign): reject.
   - Never ship an asset that depicts a person or a flag even in the background.
8. Modify before shipping. Reduce to the R8a palette; re-bake textures to palette or flat colours; trim vertex counts; rebuild normals for the faceted or soft look. A bare unmodified pack asset must not appear as a recognisable "stock" piece in shipped pictures.
9. Attribution file. For CC-BY and CC BY 4.0 items, add a line to a project CREDITS file in the form: "[asset name]" by [author] licensed [CC BY 4.0]: [URL], plus any "changes were made" note (CC-BY requires indicating changes). Keep CC0 items in the same file in a separate section as a courtesy and for the audit trail, with no legal obligation. Ship the file with the build (static host: a credits page or a text file under public/). Sketchfab-sourced CC-BY items need the creator's username and a link to the model page (VERIFIED from their guidelines).
10. Gate. A second pair of eyes (a sub-agent or the user) checks the record, hashes, content check and attribution before the asset is used in a pipeline job; the supervisor gate still covers any spend. Anything from a source with unclear terms goes to a "quarantine" list, not into the pipeline.
11. Re-verify: licences can change; re-read the licence page again before any store submission, as docs/ASSET_LICENSING.md already says about OpenArt terms.

Tool code (Blender add-ons, scripts): record name, author, licence (MIT or GPL accepted as tool code), URL, commit or version, SHA-256, and a line that it is not shipped. Read the source before installing. No network-calling add-ons.

## 5. Fit with the project's original-art rule

docs/ASSET_LICENSING.md (read) covers OpenArt output ownership, plan tiers and the rule that prompts must not name artists, games or characters (the project's art must be original); it has no section for third-party open assets. Suggested rules, to be agreed by the user before use:
- Open assets are inputs, not finished art. Every shipped picture is a render of our own scene, with our own palette and our own modelling; stock models are used as base meshes, scale references or study only.
- Add a section "Open 3D assets and materials" to docs/ASSET_LICENSING.md, plus a licence-record schema alongside the existing provenance rules (the manifest provenance requires prompt, model, seed, plan tier; a Blender-rendered picture needs different fields: source blend hash, asset records, tool versions). The code check `tests/assets.test.ts` currently expects the OpenArt shape, so the new provenance variant needs a code change (a user decision; no edits made here).
- CC0 means legal freedom, not originality. A visibly recognisable pack asset (for example a well-known Kenney tree) in a shipped picture weakens the claim that the art is original; modify or replace.
- CC-BY assets are permitted but cost an attribution line, and creator names will appear in the credits. Prefer CC0 to keep that file short.
- No AI-training or style claims should be made about the sources.
- Content rules (no people, faces, weapons, flags, insignia, lettering) are enforced at step 7 above and again on the final render (a picture-level check, existing tests/review for banners were out of scope here).

## 6. Access, rate and terms limits (summary)

| Source | API | Bulk | Notes |
|---|---|---|---|
| Poly Haven | yes, public API, unique User-Agent required, credit needed only if live API used in software (VERIFIED) | not addressed, bespoke arrangements for companies; scraping is misuse | Not needed; manual downloads suffice |
| ambientCG | yes, v1 to v3 (VERIFIED page mentions) | not addressed; Patreon Nextcloud | Rate limits UNVERIFIED |
| Kenney | none known | not stated | manual zips |
| Quaternius | none known | not stated | manual zips |
| KayKit | none | not stated | itch.io page |
| Sketchfab | Download API with OAuth end-user login (VERIFIED) | no unauthenticated automation without arrangement | Licence and credit must follow the asset |
| OpenGameArt | none known | not stated | UNVERIFIED |
| BlenderKit | add-on, account-bound | not stated | UNVERIFIED limits |
| Blender Extensions | download via Blender | not stated | tool code |

Project rule: no scraping; hand-pick; one request per asset, with the user's yes for each download.

## 7. Recommended next steps (for the user to decide)

1. Approve the CC0-first, hand-download policy and the licence record format (section 4).
2. Approve a short list of packs to inspect: Kenney Nature Kit and Watercraft Kit, Quaternius Stylized Nature MegaKit (Standard, free), KayKit Medieval Builder Pack. Each is a download that needs a separate yes with file name, source and size.
3. Decide whether OGA-BY and BlenderKit Royalty Free are acceptable (this brief says no).
4. Add the open-asset section to docs/ASSET_LICENSING.md and extend the provenance schema for Blender renders.
5. Plan to model the Bengal-specific pieces in Blender from scratch; use packs for filler.

## Source list
Poly Haven licence https://polyhaven.com/license ; Poly Haven API ToS https://github.com/Poly-Haven/Public-API/blob/master/ToS.md ; ambientCG https://docs.ambientcg.com/license/ ; Kenney https://kenney.nl/support , https://kenney.nl/assets/watercraft-kit ; Quaternius https://quaternius.com/faq.html , https://quaternius.com/packs/stylizednaturemegakit.html ; KayKit https://kaylousberg.itch.io/kaykit-medieval-builder-pack ; Sketchfab https://help.sketchfab.com/en/articles/16152220 , https://sketchfab.com/developers/download-api/guidelines ; OpenGameArt https://opengameart.org/content/faq ; Blender Studio https://studio.blender.org/terms-and-conditions ; BlenderKit https://www.blendkit.com/docs/licenses/ (redirect from blenderkit.com) ; Blender extension licences (search snippets on docs.blender.org and projects.blender.org).
