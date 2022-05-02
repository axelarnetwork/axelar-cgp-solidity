#!/bin/bash

set -e

rm -rf out flattened

flattener=./node_modules/.bin/poa-solidity-flattener

if [ ! -f "$flattener" ]; then
    echo "Could not find flattening tool $flattener"
    echo "Install via npm i @poanet/solidity-flattener"
    exit 1
fi

# Flatten files
for file in $(find src -name '*.sol' -print); do
    "$flattener" "$file" > /dev/null
    path="${file#src/}"
    mkdir -p out/"$(dirname "${path%.sol}")"
    mv out/"$(basename "${path%.sol}")_flat.sol" out/"${path}"
done

mv out flattened
