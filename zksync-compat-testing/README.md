# zkSync Compatibility Testing

This directory contains our systematic investigation into zkSync Era compatibility issues with the Axelar Gateway contracts.

## Directory Structure

```
zksync-compat-testing/
├── README.md                    # This file
├── zksync-compat-test.md       # Comprehensive investigation report
├── run-test.sh                 # Script to run tests and output logs
└── logs/                       # All test output logs
    ├── complex-memory-*.txt    # Complex memory patterns test results
    ├── delegatecall-*.txt      # Delegatecall pattern test results
    ├── deploytoken-*.txt       # Parameter decoding test results
    ├── internal-call-*.txt     # Basic internal call test results
    ├── onlyself-*.txt          # OnlySelf modifier test results
    ├── test-original-*.txt     # Original failing test results
    ├── debug-*.log             # Debugging session logs
    ├── axelar-gateway-test.log # Original AxelarGateway test output
    └── rpc-compatibility-test.log # RPC compatibility test output
```

## Quick Start

### Run a Test

```bash
# From the project root directory
./zksync-compat-testing/run-test.sh test/complex-memory-test.js hardhat
./zksync-compat-testing/run-test.sh test/complex-memory-test.js zksync
```

### View Results

```bash
# View logs
cat zksync-compat-testing/logs/complex-memory-hardhat.txt
cat zksync-compat-testing/logs/complex-memory-zksync.txt

# View debugging logs
cat zksync-compat-testing/logs/debug-detailed-analysis.log
cat zksync-compat-testing/logs/axelar-gateway-test.log
```

## Investigation Summary

We systematically tested various components that could cause silent failures on zkSync Era:

1. ✅ **Basic `address(this).call()`** - Works on both networks
2. ✅ **Complex parameter encoding/decoding** - Works on both networks
3. ✅ **`onlySelf` modifier** - Works on both networks
4. ✅ **`delegatecall` pattern** - Works on both networks
5. ✅ **EternalStorage state management** - Works on both networks
6. ✅ **Multiple event emissions** - Works on both networks
7. ✅ **Complex memory patterns** - Works on both networks

## Current Status

All isolated patterns work correctly on both Hardhat and zkSync Era. The issue must be with something **very specific** to the actual AxelarGateway implementation, most likely related to **gas estimation differences**.

## Next Steps

Focus on investigating gas estimation behavior and comparing gas usage patterns between Hardhat and zkSync Era for the actual AxelarGateway test scenarios.

See `zksync-compat-test.md` for detailed documentation of our investigation process and findings.
