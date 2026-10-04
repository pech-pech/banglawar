#!/usr/bin/env bash
# Run the whole asset pipeline: catalogue -> manifest -> atlases + sprite sheet -> determinism check.
#
#   conquest/tools/assets/run_pipeline.sh <pilot-out-dir> [snapped|graded] [--skip-determinism]
#
#   <pilot-out-dir>   the Blender pilot's output folder (art-src/bd1971-pilot/out; private, read-only)
#   output            conquest/unity/Assets/Art/Generated/   (git-ignored)
#
# Uses Blender's bundled Python (numpy + OpenImageIO). Override with PYTHON_BIN=... or BLENDER_PYTHON.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
PILOT="${1:?usage: run_pipeline.sh <pilot-out-dir> [snapped|graded] [--skip-determinism]}"
VARIANT="${2:-snapped}"
SKIP="${3:-}"
PY="${PYTHON_BIN:-/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13}"
CATALOGUE="${CATALOGUE:-$HERE/themes/bd1971/catalogue.json}"
OUT="${OUT_DIR:-$HERE/../../unity/Assets/Art/Generated}"
MANIFEST="$OUT/asset-manifest.json"
# Compact pages by default (about 8% fewer pixels in memory than power-of-two pages, same sprite pixels).
# Set PACK_ARGS="" for the original power-of-two shelf pages.
PACK_ARGS="${PACK_ARGS---packer maxrects --page-grain 256}"

mkdir -p "$OUT"
echo "== 1/3 manifest"
"$PY" "$HERE/build_manifest.py" --catalogue "$CATALOGUE" --root "pilot=$PILOT" --out "$MANIFEST" \
  --report "$OUT/manifest-report.json"
echo "== 2/3 atlases ($VARIANT)"
"$PY" "$HERE/pack_atlas.py" --manifest "$MANIFEST" --root "pilot=$PILOT" --out-dir "$OUT" --variant "$VARIANT" $PACK_ARGS
if [ "$SKIP" != "--skip-determinism" ]; then
  echo "== 3/3 determinism (two more runs, separate processes)"
  "$PY" "$HERE/check_determinism.py" --manifest "$MANIFEST" --root "pilot=$PILOT" --variant "$VARIANT" $PACK_ARGS
fi
echo "Done. In Unity: Conquest > Art > Import Sprite Sheet"
