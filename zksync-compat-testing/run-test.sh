#!/bin/bash

# Script to run zkSync compatibility tests and output logs to organized directory

if [ $# -eq 0 ]; then
    echo "Usage: $0 <test-file> [network]"
    echo "Example: $0 test/complex-memory-test.js zksync"
    echo "Example: $0 test/complex-memory-test.js hardhat"
    exit 1
fi

TEST_FILE=$1
NETWORK=${2:-zksync}  # Default to zkSync since that's our primary target
TEST_NAME=$(basename $TEST_FILE .js)

echo "Running $TEST_FILE on $NETWORK network..."
echo "Output will be saved to zksync-compat-testing/logs/${TEST_NAME}-${NETWORK}.txt"

npx hardhat test --network $NETWORK $TEST_FILE > zksync-compat-testing/logs/${TEST_NAME}-${NETWORK}.txt 2>&1

echo "Test completed. Check zksync-compat-testing/logs/${TEST_NAME}-${NETWORK}.txt for results." 
