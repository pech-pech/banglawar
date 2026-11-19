# Audio provenance (Starfall beta, slice S7, route A: rendered in code)

No audio files ship. Every sound is synthesised by WebAudio at runtime from the note strings in `src/parts/music-data.js` (own simple arrangements). All pieces were written from memory, score not opened: IMSLP blocked in the build sandbox. Nothing was downloaded. Confidence = my honest 0..1 estimate that the melody is the real tune in the right key and rhythm. Placeholder pieces (Clair de lune, Aquarium, Sugar Plum) were removed by lead ruling; no shipped piece is named as something it is not.

| file | piece | composer | death year | source (score to check against) | licence | date checked | confidence |
|---|---|---|---|---|---|---|---|
| src/parts/music-data.js#canon | Canon in D: bass D A B F# G D G A, melody F#5 E5 D5 C#5 B4 A4 B4 C#5 (menu, settings) | Pachelbel | 1706 | IMSLP, "Canon and Gigue in D" (not opened) | Composition public domain; arrangement own | 2026-11-19 | 0.90 (first melody line only; the faster later lines are not included) |
| src/parts/music-data.js#gymno | Gymnopedie No.1 (tutorial), 12 bars, melody per lead spec | Satie | 1925 | IMSLP, "3 Gymnopedies" (not opened) | Composition public domain (pre-1926); arrangement own | 2026-11-19 | 0.70 (G/D maj7 left hand 0.9; melody notes and the tied F#4 ending are from the lead's spec, below 0.85, ear check needed) |
| src/parts/music-data.js#morning | Morning Mood, Peer Gynt Suite No.1 (tier 1), E major 6/8 | Grieg | 1907 | IMSLP, "Peer Gynt Suite No.1, Op.46" (not opened) | Composition public domain; arrangement own | 2026-11-19 | 0.80 (bars 1-2 motif 0.9, bars 3-4 per lead spec 0.7) |
| src/parts/music-data.js#elise | Fur Elise, A section (tier 2) | Beethoven | 1827 | IMSLP, "Bagatelle in A minor, WoO 59" (not opened) | Composition public domain; arrangement own | 2026-11-19 | 0.90 |
| src/parts/music-data.js#mountain | In the Hall of the Mountain King, first phrase B C# D E F# D F# only, looped with tempo ramp 100 to 150 (tier 3) | Grieg | 1907 | IMSLP, "Peer Gynt, Op.23" (not opened) | Composition public domain; arrangement own | 2026-11-19 | 0.90 (later phrases dropped) |
| src/parts/music-data.js#ode | Ode to Joy, 8-bar theme (stings clear, complete) | Beethoven | 1827 | IMSLP, "Symphony No.9, Op.125" (not opened) | Composition public domain; arrangement own | 2026-11-19 | 0.97 |
| src/parts/music-data.js#twinkle | Ah vous dirai-je, Maman, K.265 theme (medal stings) | Mozart | 1791 | IMSLP, "12 Variations on Ah vous dirai-je, Maman, K.265" (not opened) | Composition public domain; arrangement own | 2026-11-19 | 0.97 |

Pieces below 0.85 (gymno 0.70, morning 0.80) are kept only because the lead specified their notes; flagged for an ear check.

## Render check (`node src/test/music-render.js`, `--roll` prints bar by bar)
Pitch names print with sharps. Seconds at nominal tempo, one pass.

| piece | key | meter (beat unit) | bars | melody notes | range | seconds | first 4 notes | expected | match |
|---|---|---|---|---|---|---|---|---|---|
| canon | D major | 4/4 (quarter) | 8 | 16 | A4-F#5 | 29.1 | F#5 E5 D5 C#5 | F# E D C# B A B C# | yes |
| gymno | D major | 3/4 (quarter) | 12 | 10 | F#4-A5 | 30.9 | F#5 A5 G5 F#5 | lead spec bars 5-12 | yes |
| morning | E major | 6/8 (eighth) | 8 | 44 | E4-C#5 | 17.1 | B4 G#4 F#4 E4 | lead spec | yes |
| mountain | B minor | 4/4 (quarter) | 8 | 56 | B3-F#4 | 15.6 | B3 C#4 D4 E4 | B C# D E F# D F# | yes |
| ode | D major | 4/4 (quarter) | 8 | 30 | D4-A4 | 17.8 | F#4 F#4 G4 A4 | C-major E E F G in D major | yes |
| twinkle | C major | 4/4 (quarter) | 12 | 42 | C5-A5 | 28.8 | C5 C5 G5 G5 | C C G G A A G | yes |
| elise | A minor | 6 sixteenths | 9 | 35 | C4-E5 | 9.3 | E5 D#5 E5 D#5 | E D# E D# E B D C A | yes |

## Stings
clear: Ode first 4 notes, 120 bpm, 2 s. complete: Ode 8 bars, 200 bpm with ritard, about 10 s. Medals (Twinkle lines): bronze 1 line, silver 2 lines (192 bpm), gold 3 lines (216 bpm, about 6.7 s), plumb = gold plus celesta sparkle run (about 7.3 s).

## Cannot verify without ears
Recognisability of every tune, loudness on the Fold cover speaker, clipping with many SFX. Listening page: `src/test/music-gallery.html`.
