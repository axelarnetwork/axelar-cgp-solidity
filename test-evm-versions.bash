#!/usr/bin/env bash

declare -a versions=(
                    "istanbul"
                    "berlin"
                    "london"
                    )

for version in "${versions[@]}"
do
  echo "Building and testing for EVM version: $version"
  EVM_VERSION=$version npm run build || {
    echo "Error: build failed for EVM version: $version"
    exit 1
  }
  EVM_VERSION=$version npm t -- --no-compile || {
   echo "Error: tests failed for EVM version: $version"
   exit 1
  }
done
