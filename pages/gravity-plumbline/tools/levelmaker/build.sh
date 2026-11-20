#!/bin/sh
# Build the self-contained level maker. Optional arg: output path.
exec node "$(dirname "$0")/build.js" "$@"
