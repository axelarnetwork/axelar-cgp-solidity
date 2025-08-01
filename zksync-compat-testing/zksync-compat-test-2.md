# zkSync Compatibility Testing - Phase 2

## Latest Update

**Note**: We are now opening `zksync-compat-test-3.md` to document our latest findings and solutions. This file will be merged with the main documentation later to avoid slow rewrites.

## Previous Progress

### Gas Estimation Issues Resolved

We successfully identified and resolved the gas estimation issues on zkSync:

1. **Added gasOptions configuration** to the deployments repo
2. **Confirmed gas usage patterns** - zkSync uses ~1.20x more gas than Ethereum-Sepolia
3. **Validated compatibility** - Operations work correctly with sufficient gas limits

### Configuration Change

Added to `axelar-contract-deployments/axelar-chains-config/info/testnet.json`:

```json
"zksync": {
  "gasOptions": {
    "gasLimit": 10000000
  }
}
```

### Misleading Fix Analysis

The initial contract modification (explicit revert) didn't actually fix the gas issue. It changed the failure mode from silent to explicit, which triggered retry logic in the test framework. The real fix was providing sufficient gas limits via configuration.

### zkSync Dual Gas Model

-   **EVM Gas**: Virtual, used for compatibility
-   **EraVM Ergs**: Native, 5:1 conversion ratio (EraVM ergs to EVM gas)
-   **estimateGas()**: Unreliable on zkSync due to "out-of-ergs" panics

---

_This document will be merged with the main compatibility testing documentation later._
