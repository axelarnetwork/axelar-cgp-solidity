#!/bin/sh

set -eu

echo "Flattening contracts..."

OUTPUT="./artifacts/flattened"
SOURCE="contracts"
EXCLUDE="contracts/test"

if [ ! -d "$SOURCE" ]; then
    echo "$SOURCE is not a valid folder"
    exit 1
fi

rm -rf "$OUTPUT"
mkdir -p "$OUTPUT"

# Get compiler version, expected format ".*version: 'x.y.z',"
version=$(grep 'version' ./hardhat.config.js | sed "s/ *version: '//" | sed "s/',$//g")

# Flatten files
find "$SOURCE" -name '*.sol' -print | while read -r file; do
    if echo "$file" | grep -q "$EXCLUDE"; then
        continue
    fi

    path="${file#${SOURCE}/}"
    mkdir -p "$OUTPUT"/"$(dirname "${path}")"

    # Flatten contract
    hardhat flatten "$file" > flat.sol

    # Remove hardhat comment at the top
    tail -n+3 flat.sol > "$OUTPUT/$path"

    # # Remove duplicate SPDX identifiers and pragmas that the explorers don't like
    # text=$(grep -vE "// SPDX.*" "$OUTPUT/$path" | grep -vE "pragma solidity .*")
    text=$(grep -vE "pragma solidity .*" "$OUTPUT/$path" | grep -vE "// Original license:.*")

    echo "// Source: $SOURCE/$path\n\n" > "$OUTPUT/$path"
    echo "pragma solidity $version;\n\n" >> "$OUTPUT/$path"
    printf "%s" "$text" >> "$OUTPUT/$path"

    # Prettify source (in particular, remove extra newlines)
    prettier --write "$OUTPUT/$path"
done

# Delete temp file
rm -f flat.sol

if [ -z "$(ls -A $OUTPUT)" ]; then
    echo "No contracts from source $SOURCE/ were found at $OUTPUT"
    exit 1
fi

echo "Flattened"
