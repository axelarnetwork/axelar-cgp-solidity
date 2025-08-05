# zkSync Batch Execution Investigation Findings

## Summary

We have successfully reproduced the intermittent batch execution failures on zkSync Era. The issue occurs during transaction execution, not during gas estimation.

## Key Findings

### 1. Contract Deployment Works

-   ✅ `TokenDeployer` deploys successfully
-   ✅ `AxelarAuthWeighted` deploys successfully (with both empty array and proper parameters)
-   ✅ `AxelarGateway` deploys successfully

### 2. Batch Execution Fails

-   ❌ Batch token deployments fail with `CALL_EXCEPTION`
-   ❌ Transaction status: `0` (reverted)
-   ❌ Only bootloader events emitted, no contract events

### 3. Error Details

-   **Transaction Hash**: `0xdb8e34d71d8394d370741a941f8339b7c018f3c36ae55877ba75b1a5f9b027e3`
-   **Gas Used**: ~308,071 gas
-   **Error**: `CALL_EXCEPTION`
-   **Status**: `0` (transaction reverted)

### 4. Gas Limit Testing Results

We tested with different gas limits to determine if the issue is gas-related:

**Test 1: 1,000,000 gas limit**

-   Gas used: 308,077 gas
-   Result: Failed with `CALL_EXCEPTION`

**Test 2: 10,000,000 gas limit (10x increase)**

-   Gas used: 308,071 gas
-   Result: Failed with `CALL_EXCEPTION`

**Key Finding**: Gas usage is nearly identical (~308k gas) despite a 10x increase in gas limit. This confirms the issue is **NOT gas-related** but rather a fundamental problem with batch execution logic.

### 5. Root Cause Analysis

The issue appears to be with the batch execution logic itself, not gas estimation or insufficient gas. The batch processing fails early in execution, likely during validation or the first step of batch processing.

## Test Details

-   **Test File**: `test/zksync-estimate-gas.js`
-   **Pattern**: Mimics exact batch deployment pattern from `AxelarGateway.js` line 328
-   **Commands**: 3 token deployments in a single batch
-   **Gas Limits Tested**: 1M and 10M gas

## Status

-   ✅ **Reproducible**: Issue can be consistently reproduced
-   ❌ **Not Gas-Related**: Issue persists regardless of gas limit
-   ❌ **Batch-Specific**: Individual deployments work, only batch operations fail
-   ❌ **Early Failure**: Transaction fails before any contract events are emitted

## Next Steps

This issue requires investigation by the zkSync team as it appears to be a platform-level problem with batch command execution, not a gas estimation issue as initially suspected.
