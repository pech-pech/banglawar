#!/usr/bin/env bash
# Copies the engine-free dotnet sources (Core, Content, Presentation, Bootstrap) into the Unity package so the editor compiles
# them with the asmdefs written here. The dotnet projects stay the single source of truth; the copies are generated
# and git-ignored (conquest/unity/.gitignore). Re-run after any change in conquest/dotnet/Conquest.{Core,Content,Presentation}.
#
#   conquest/tools/unity/sync_engine_sources.sh
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
DOTNET="$(cd "$HERE/../../dotnet" && pwd)"
RUNTIME="$(cd "$HERE/../../unity/Packages/com.conquest.engine/Runtime" && pwd)"

copy() { # name
  local name="$1"
  mkdir -p "$RUNTIME/$name"
  rsync -a --delete --include='*/' --include='*.cs' --exclude='*' --exclude='obj/' --exclude='bin/' \
    --exclude='*.asmdef' --exclude='*.asmdef.meta' --exclude='csc.rsp' --exclude='csc.rsp.meta' \
    "$DOTNET/Conquest.$name/" "$RUNTIME/$name/"
}

asmdef() { # name, references-json
  cat > "$RUNTIME/$1/Conquest.$1.asmdef" <<JSON
{
    "name": "Conquest.$1",
    "rootNamespace": "Conquest.$1",
    "references": $2,
    "includePlatforms": [],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "overrideReferences": false,
    "precompiledReferences": [],
    "autoReferenced": true,
    "defineConstraints": [],
    "versionDefines": [],
    "noEngineReferences": true
}
JSON
  # the dotnet projects compile with <Nullable>enable</Nullable>; match it so string? is not a warning
  printf -- '-nullable:enable\n' > "$RUNTIME/$1/csc.rsp"
}

copy Core
copy Content
copy Presentation
copy Bootstrap
asmdef Core '[]'
asmdef Content '[]'
asmdef Presentation '["Conquest.Core"]'
asmdef Bootstrap '["Conquest.Core", "Conquest.Content"]'
echo "synced Core, Content, Presentation into $RUNTIME"
