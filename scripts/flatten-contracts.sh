#!/bin/bash

set -eu

echo "Flattening contracts..."

OUTPUT="./artifacts/flattened"

rm -rf "$OUTPUT"

# Flatten files
for file in $(find contracts -name '*.sol' -print); do
    path="${file#contracts/}"
    mkdir -p "$OUTPUT"/"$(dirname "${path}")"

    npm run flatten-contract "$file" > "$OUTPUT/$path"
done

echo "Flattened"
