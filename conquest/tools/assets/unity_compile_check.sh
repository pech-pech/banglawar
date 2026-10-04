#!/usr/bin/env bash
# Compile-check the Unity project (importer, ArtCatalogAsset, engine-free package) in batch mode.
#
#   conquest/tools/assets/unity_compile_check.sh [path-to-Unity-binary]
#
# Opens the project headless, lets Unity compile every assembly, quits, and greps the log for C# errors.
# Exit 0: compiled with no "error CS". Exit 1: compile errors (printed). Exit 2: Unity not found / did not run.
# Needs: Unity 6000.6.3f1 (Hub install under /Applications/Unity/Hub/Editor), a licence the editor accepts,
# and NO other Unity instance open on conquest/unity (the project lock refuses a second one).
# Side effects: Unity creates .meta files next to new assets and refreshes Library/ (git-ignored). Review
# `git status` afterwards; commit the .meta files of the new scripts, not Library/.
# Related, no Unity needed: `dotnet test conquest/dotnet/Conquest.Tests` compiles the engine-free half
# (Conquest.Assets) with C# 9 / netstandard2.1, the same language level Unity uses.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$(cd "$HERE/../../unity" && pwd)"
UNITY="${1:-${UNITY_BIN:-/Applications/Unity/Hub/Editor/6000.6.3f1/Unity.app/Contents/MacOS/Unity}}"
LOG="${TMPDIR:-/tmp}/conquest-unity-compile.log"

if [ ! -x "$UNITY" ]; then
  echo "unity_compile_check: Unity binary not found at $UNITY (pass the path as argument 1 or set UNITY_BIN)" >&2
  exit 2
fi
rm -f "$LOG"
"$UNITY" -batchmode -nographics -quit -projectPath "$PROJECT" -logFile "$LOG"
STATUS=$?
if [ ! -s "$LOG" ]; then
  echo "unity_compile_check: Unity wrote no log (exit $STATUS)" >&2
  exit 2
fi
if grep -E "error CS[0-9]+" "$LOG"; then
  echo "unity_compile_check: compile errors above (full log: $LOG)" >&2
  exit 1
fi
if [ "$STATUS" -ne 0 ]; then
  echo "unity_compile_check: Unity exited $STATUS without C# errors; see $LOG (licence or lock problem?)" >&2
  exit 2
fi
echo "unity_compile_check: no C# compile errors (log: $LOG)"
exit 0
