# Mixer Mad parity oracle (JS side)
- `SIM-MAP.md` - map of the v7h drive sim for the C# porter (read first). `RECORDING-FORMAT.md` - trace schema.
- `record.js` - recorder / replayer (`--all`, `--one`, `--replay`). `export-data.js` - writes `oracle/geometry.json`, `oracle/levels.json`.
- `determinism-check.js` + `determinism-result.json` - 13 runs recorded twice + replayed, all bit-identical.
- `traces/` - 202 gz traces + `INDEX.json` (set A mixer 8 levels x 6 policies; set B 5 other vehicles x 8 x 3; C mixer skins 2-4; D daily; E load mode).
- `tools/` - probes (hypot test, geometry probe), logs. `oracle/` - untouched copy of mixer-mad-v7h.html.
Requires `require('playwright')` + chromium (not installed by this folder). Re-run: `node export-data.js && node record.js --all`.
