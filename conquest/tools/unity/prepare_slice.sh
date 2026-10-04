#!/usr/bin/env bash
# Prepares the Unity map slice headlessly: syncs the engine-free sources, then runs the editor setup
# (copy data, view assets, Boot and Map scenes, build settings). No other Unity instance may have the project open.
#   conquest/tools/unity/prepare_slice.sh [path-to-Unity-binary]
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$(cd "$HERE/../../unity" && pwd)"
UNITY="${1:-${UNITY_BIN:-/Applications/Unity/Hub/Editor/6000.6.3f1/Unity.app/Contents/MacOS/Unity}}"
LOG="${TMPDIR:-/tmp}/conquest-unity-prepare.log"
"$HERE/sync_engine_sources.sh"
"$UNITY" -batchmode -nographics -quit -projectPath "$PROJECT" -logFile "$LOG" \
  -executeMethod Conquest.UnityView.Editor.SliceSetup.PrepareFromCommandLine
STATUS=$?
if grep -E "error CS[0-9]+|Slice setup failed" "$LOG"; then echo "prepare_slice: failed (log: $LOG)" >&2; exit 1; fi
echo "prepare_slice: exit $STATUS (log: $LOG)"
exit "$STATUS"
