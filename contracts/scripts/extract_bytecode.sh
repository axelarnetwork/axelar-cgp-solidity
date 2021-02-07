#!/bin/sh
# usage:
# $ extract_bytecode.sh {contract build artifact name}
# e.g. extract_bytecode.sh AxelarGateway.json

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
contracts="${SCRIPT_DIR}/.."

if [ ! -d $contracts/build ];
then
  echo "Contracts have not been built"
  exit 1
fi

contract_fname=${1:-AxelarGateway.json}
key="bytecode"
bytecode=$(sed -n 's/^.*"bytecode": "\(.*\)".*$/\1/p' "$contracts/build/$contract_fname")
name="${contract_fname%.*}"
echo $bytecode > "$name.bytecode"
