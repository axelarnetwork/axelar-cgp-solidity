# zkSync Era Compatibility Testing Report

## Overview

This document outlines our systematic investigation into compatibility issues between the Axelar Gateway contracts and zkSync Era. The investigation was prompted by failing tests in the Axelar Gateway test suite when running on zkSync Era, specifically the "should allow operators to deploy a new token" test.

## Initial Problem

### Original Issue

-   **Test**: `should allow operators to deploy a new token` in `test/AxelarGateway.js`
-   **Symptom**: Expected events (`TokenDeployed`, `Executed`) not being emitted
-   **Behavior**: Transaction appeared to succeed but silently failed without reverting
-   **Location**: `AxelarGateway.js#L702` - the `await expect(tx).to.emit(gateway, 'TokenDeployed')` assertion

### Initial Hypothesis

Based on colleague feedback, the issue was suspected to be a "silent failure" where `address(this).call()` in the `execute` function was returning `success = false` but not causing the transaction to revert.

## Investigation Methodology

### Phase 1: Initial Debugging

**Files**: `contracts/AxelarGateway.sol`, `test/debug-events.js`

**Approach**: Modified the `execute` function to capture `returnData` from `address(this).call()` and explicitly revert with it if `success` is false.

```solidity
// Original code
(bool success, ) = address(this).call(abi.encodeWithSelector(commandSelector, params[i], commandId));

// Modified code
(bool success, bytes memory returnData) = address(this).call(abi.encodeWithSelector(commandSelector, params[i], commandId));
if (success) {
    emit Executed(commandId);
} else {
    _setCommandExecuted(commandId, false);
    // Revert with the error data to expose the root cause
    assembly {
        let returndata_size := mload(returnData)
        revert(add(returnData, 0x20), returndata_size)
    }
}
```

**Result**: The test started passing after this modification, which was initially confusing.

**Logs**:

-   [test-original-hardhat.txt](logs/test-original-hardhat.txt) - Original test on Hardhat
-   [test-original-zksync.txt](logs/test-original-zksync.txt) - Original test on zkSync
-   [axelar-gateway-test.log](logs/axelar-gateway-test.log) - Original AxelarGateway test output
-   [rpc-compatibility-test.log](logs/rpc-compatibility-test.log) - RPC compatibility test output

### Phase 2: Debugging with Enhanced Logging

**Files**: `test/debug-events.js`

**Approach**: Created a dedicated debugging test with extensive logging to understand the execution flow.

**Key Findings**:

-   Initial threshold configuration issues (using Hardhat threshold on zkSync)
-   Signature validation working correctly after fixes
-   Events being emitted successfully on both networks

**Logs**:

-   [debug-original-behavior.log](logs/debug-original-behavior.log) - Initial debugging attempt
-   [debug-with-fix.log](logs/debug-with-fix.log) - Debugging with the explicit revert fix
-   [debug-enhanced.log](logs/debug-enhanced.log) - Enhanced debugging with more granular logging
-   [debug-detailed-analysis.log](logs/debug-detailed-analysis.log) - Detailed analysis of execution flow
-   [debug-actual-events.log](logs/debug-actual-events.log) - Analysis of actual events being emitted
-   [debug-detailed-events.log](logs/debug-detailed-events.log) - Detailed event analysis
-   [debug-corrected-events.log](logs/debug-corrected-events.log) - Corrected event analysis
-   [debug-deploy-token.log](logs/debug-deploy-token.log) - Deploy token debugging
-   [debug-deploy-token-original.log](logs/debug-deploy-token-original.log) - Original deploy token debugging
-   [debug-deploy-token-fixed.log](logs/debug-deploy-token-fixed.log) - Fixed deploy token debugging

### Phase 3: Isolated Component Testing

We systematically tested each component that could cause the silent failure:

#### 3.1 Basic Internal Call Test

**Files**: `contracts/test/TestInternalCall.sol`, `test/internal-call-test.js`

**Purpose**: Test basic `address(this).call()` behavior

**Findings**: ✅ Both Hardhat and zkSync report `success = true`

**Logs**:

-   [internal-call-hardhat-final.txt](logs/internal-call-hardhat-final.txt)
-   [internal-call-zksync-detailed.txt](logs/internal-call-zksync-detailed.txt)

#### 3.2 OnlySelf Modifier Test

**Files**: `contracts/test/TestOnlySelf.sol`, `test/onlyself-test.js`

**Purpose**: Test `onlySelf` modifier with internal calls

**Findings**: ✅ Both Hardhat and zkSync work correctly

**Logs**:

-   [onlyself-hardhat.txt](logs/onlyself-hardhat.txt)
-   [onlyself-zksync.txt](logs/onlyself-zksync.txt)

#### 3.3 Complex Parameter Decoding Test

**Files**: `contracts/test/TestDeployTokenCall.sol`, `test/deploytoken-call-test.js`

**Purpose**: Test complex parameter encoding/decoding similar to `deployToken`

**Findings**: ✅ Both Hardhat and zkSync work correctly

**Logs**:

-   [deploytoken-hardhat.txt](logs/deploytoken-hardhat.txt)
-   [deploytoken-zksync.txt](logs/deploytoken-zksync.txt)

#### 3.4 Delegatecall Pattern Test

**Files**: `contracts/test/TestDeployTokenWithDelegatecall.sol`, `test/delegatecall-test.js`

**Purpose**: Test `delegatecall` pattern used in `deployToken`

**Findings**: ✅ Both Hardhat and zkSync report `success = true`

**Logs**:

-   [delegatecall-hardhat-v4.txt](logs/delegatecall-hardhat-v4.txt)
-   [delegatecall-zksync-v2.txt](logs/delegatecall-zksync-v2.txt)

#### 3.5 Complex Memory Patterns Test

**Files**: `contracts/test/TestComplexMemoryPatterns.sol`, `test/complex-memory-test.js`

**Purpose**: Test the most complex memory patterns that mimic AxelarGateway exactly

**Methodology**:

-   Complex parameter decoding (6 parameters including strings)
-   Multiple state changes via EternalStorage pattern
-   Delegatecall with return data
-   Multiple event emissions
-   Complex memory allocations

**Findings**: ✅ Both Hardhat and zkSync report `success = true`

**Logs**:

-   [complex-memory-hardhat.txt](logs/complex-memory-hardhat.txt)
-   [complex-memory-zksync.txt](logs/complex-memory-zksync.txt)

### Phase 4: Gas Estimation Investigation

**Files**: `contracts/test/TestGasEstimation.sol`, `test/gas-estimation-test.js`

**Purpose**: Systematically compare gas usage patterns between Hardhat and zkSync Era for various operation types, including AxelarGateway-like operations.

**Methodology**: Created a comprehensive test contract with various operation types:

-   Simple operations (minimal gas usage)
-   Complex operations (moderate gas usage)
-   Memory-intensive operations (high gas usage)
-   Storage-intensive operations (high gas usage)
-   AxelarGateway-like operations (with parameter decoding)
-   Gas estimation tests

**Test Parameters**: The AxelarGateway-like operation used parameters similar to the real AxelarGateway setup:

-   Name: "Test Token"
-   Symbol: "TEST"
-   Decimals: 18
-   Cap: 10000
-   Token Address: `0x0000000000000000000000000000000000000000`
-   Mint Limit: 1000

**Logs**:

-   [gas-estimation-test-hardhat.txt](logs/gas-estimation-test-hardhat.txt) - Gas estimation test on Hardhat
-   [gas-estimation-test-zksync.txt](logs/gas-estimation-test-zksync.txt) - Gas estimation test on zkSync

## Key Findings

### 1. zkSync Era Memory Allocation Differences

Based on zkSync documentation, we identified potential differences in memory allocation timing:

**EVM vs zkSync Era**:

-   **EVM**: Memory grows **before** the call based on `outsize`
-   **zkSync Era**: Memory growth happens **after** the call based on actual `returndatasize`

**Impact**: This could cause `address(this).call()` to report `success = false` on zkSync Era even when the function executes successfully.

### 2. All Isolated Tests Pass

Despite the memory allocation differences, **all our isolated tests work perfectly** on both networks:

-   ✅ Basic `address(this).call()`
-   ✅ Complex parameter encoding/decoding
-   ✅ `onlySelf` modifier
-   ✅ `delegatecall` pattern
-   ✅ EternalStorage state management
-   ✅ Multiple event emissions
-   ✅ Complex memory patterns

### 3. Critical Gas Usage Differences Discovered

The gas estimation investigation revealed significant differences between Hardhat and zkSync Era:

#### Operation Gas Usage Comparison

| Operation Type      | Hardhat Gas | zkSync Gas | Ratio (zkSync/Hardhat) |
| ------------------- | ----------- | ---------- | ---------------------- |
| Simple Operation    | 25,136      | 108,036    | 4.30x                  |
| Complex Operation   | 27,441      | 161,824    | 5.90x                  |
| Memory Intensive    | 284,796     | 6,496,326  | 22.82x                 |
| Storage Intensive   | 453,137     | 375,658    | 0.83x                  |
| AxelarGateway-like  | 73,316      | 173,884    | 2.37x                  |
| Gas Estimation Test | 51,265      | 752,258    | 14.67x                 |

#### Key Gas-Related Discoveries

1. **Memory Operations Are Extremely Expensive on zkSync**

    - Memory-intensive operations are **22.82x more expensive** on zkSync
    - This could be the root cause of the "silent failures" we observed earlier

2. **Gas Estimation Not Available on zkSync**

    - `estimateGas()` function doesn't work on zkSync
    - This could cause issues for applications that rely on gas estimation

3. **AxelarGateway-like Operations Are 2.37x More Expensive**

    - Complex parameter decoding (like in `deployToken`) is significantly more costly
    - This could explain why the original AxelarGateway tests were failing

4. **Storage Operations Are Surprisingly Efficient on zkSync**

    - Storage-intensive operations are actually cheaper on zkSync (0.83x ratio)
    - This is good news for EternalStorage operations

5. **Base Transaction Costs Are Higher on zkSync**
    - Even simple operations are 4.30x more expensive
    - This suggests higher base costs for transaction processing on zkSync

### 4. The Mystery Deepens

Since all isolated patterns work correctly, the issue must be with something **very specific** to the actual AxelarGateway contract that we haven't isolated yet.

## Current Status

### What We've Eliminated

The issue is **NOT** with:

-   ❌ Basic `address(this).call()`
-   ❌ Complex parameter encoding/decoding
-   ❌ `onlySelf` modifier
-   ❌ `delegatecall` pattern
-   ❌ EternalStorage state management
-   ❌ Multiple event emissions
-   ❌ Complex memory patterns

### Remaining Suspects

The issue must be with:

1. **Gas Estimation Differences**

    - zkSync Era's gas estimation behavior
    - Specific gas requirements for full AxelarGateway execution
    - **CONFIRMED**: Memory operations are 22.82x more expensive on zkSync
    - **CONFIRMED**: AxelarGateway-like operations are 2.37x more expensive

2. **Command Execution Context**

    - Specific execution flow in the `execute` function
    - Command validation and processing
    - Command execution tracking

3. **External Dependencies**

    - Specific `auth` module interaction
    - Specific `tokenDeployer` contract
    - Complex validation logic

4. **Transaction Context**
    - Specific way the AxelarGateway test is called
    - Specific parameters and context

## Implications for AxelarGateway

### Potential Issues:

1. **Memory-Intensive Operations**: If AxelarGateway operations involve significant memory allocation (string operations, large data structures), they will be much more expensive on zkSync.

2. **Gas Estimation**: The inability to use `estimateGas()` on zkSync could cause issues for applications that need to estimate gas costs before submitting transactions.

3. **Parameter Decoding**: The AxelarGateway-like test shows that complex parameter decoding (similar to `deployToken`) is 2.37x more expensive, which could impact the actual AxelarGateway operations.

### Positive Aspects:

1. **Storage Operations**: If AxelarGateway relies heavily on storage operations (like EternalStorage), these will be more efficient on zkSync.

2. **Consistent Behavior**: All operations complete successfully on both networks, indicating compatibility.

## Files Created During Investigation

### Test Contracts

-   `contracts/test/TestInternalCall.sol` - Basic internal call test
-   `contracts/test/TestOnlySelf.sol` - OnlySelf modifier test
-   `contracts/test/TestDeployTokenCall.sol` - Complex parameter test
-   `contracts/test/TestDeployTokenWithDelegatecall.sol` - Delegatecall test
-   `contracts/test/TestComplexMemoryPatterns.sol` - Complex memory patterns test
-   `contracts/test/TestGasEstimation.sol` - Gas estimation test contract

### Test Files

-   `test/internal-call-test.js` - Internal call test suite
-   `test/onlyself-test.js` - OnlySelf test suite
-   `test/deploytoken-call-test.js` - Parameter decoding test suite
-   `test/delegatecall-test.js` - Delegatecall test suite
-   `test/complex-memory-test.js` - Complex memory patterns test suite
-   `test/gas-estimation-test.js` - Gas estimation test suite

### Debug Files

-   `test/debug-events.js` - Original debugging test
-   `contracts/test/TestTokenDeployer.sol` - Mock token deployer

## Next Steps

### Immediate Investigation: Gas Estimation

Given that all isolated patterns work correctly, the most likely remaining culprit is **gas estimation differences**. zkSync Era might:

1. **Estimate gas differently** for the full AxelarGateway execution
2. **Have different gas requirements** for complex state changes
3. **Fail silently** when gas estimation is incorrect

### Proposed Investigation

1. **Compare gas usage** between Hardhat and zkSync for the same operations
2. **Test with explicit gas limits** to see if that affects the behavior
3. **Investigate gas estimation** in the actual AxelarGateway test context

### Recommendations

1. **Optimize Memory Usage**: Review AxelarGateway operations for memory-intensive patterns and optimize where possible.

2. **Gas Limit Strategy**: Since gas estimation is not available on zkSync, implement alternative strategies for gas limit determination.

3. **Monitor Storage vs Memory**: Balance between storage and memory operations based on their relative costs on zkSync.

4. **Testing Strategy**: Continue testing actual AxelarGateway operations on zkSync to identify specific bottlenecks.

---

## Note: File Management Change

**To avoid long rewrite times, we are switching to a new file `zksync-compat-test-2.md` for ongoing updates. This master file will be updated later when we merge the changes back.**
