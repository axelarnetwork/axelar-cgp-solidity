#!/usr/bin/env bash

configsPath="test/evm-versions"

declare -a versions=(
                    "istanbul"
                    "berlin"
                    )

for version in "${versions[@]}"
do
  rm -rf build
  waffle compile "$configsPath/waffle-$version.json"
  mocha
done
