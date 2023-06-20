#!/bin/sh

set -eu

echo "Flattening contracts..."

OUTPUT="./artifacts/flattened"
SOURCE=contracts

if [ ! -d "$SOURCE" ]; then
    echo "$SOURCE is not a valid folder"
    exit 1
fi

rm -rf "$OUTPUT"
mkdir -p "$OUTPUT"

# Get compiler version, expected format ".*version: 'x.y.z',"
version=$(grep 'version' ./hardhat.config.js | sed "s/version: '//" | sed "s/',$//g")

# Flatten files
for file in $(find "$SOURCE" -name '*.sol' -print); do
    path="${file#${SOURCE}/}"
    mkdir -p "$OUTPUT"/"$(dirname "${path}")"

    # Flatten contract, and remove hardhat comment at the top
    hardhat flatten "$file" | tail -n +2 >"$OUTPUT/$path"

    # Remove duplicate SPDX identifiers and pragmas that the explorers don't like
    text=$(grep -vE "// SPDX.*" "$OUTPUT/$path" | grep -vE "pragma solidity .*")

    echo "// Source: $SOURCE/$path\n\n" >"$OUTPUT/$path"
    echo "// SPDX-License-Identifier: MIT\n\n" >>"$OUTPUT/$path"
    echo "pragma solidity $version;\n\n" >>"$OUTPUT/$path"
    printf "%s" "$text" >>"$OUTPUT/$path"

    # Prettify source (in particular, remove extra newlines)
    prettier --write "$OUTPUT/$path"
done

if [ -z "$(ls -A $OUTPUT)" ]; then
    echo "No contracts from source $SOURCE/ were found at $OUTPUT"
    exit 1
fi

echo "Flattened"
