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

# Flatten files
for file in $(find "$SOURCE" -name '*.sol' -print); do
    path="${file#${SOURCE}/}"
    mkdir -p "$OUTPUT"/"$(dirname "${path}")"

    hardhat flatten "$file" > "$OUTPUT/$path"
done

if [ -z "$(ls -A $OUTPUT)" ]; then
    echo "No contracts from source $SOURCE/ were found at $OUTPUT"
    exit 1
fi

echo "Flattened"
