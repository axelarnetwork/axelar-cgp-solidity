# ADI Compatibility Testing

## Notes

-   tested on ADI devnet, which only produces blocks when a tx is submitted
    -   for RPC tests, a parallel script was run to force block production
-   changes to tests based on findings from ZkSync compat test:
    -   due to intermittent failures, token deployments in before hooks are performed individually rather than as batch
    -   expected events are not assumed to be at index 0

## Test Results

### Axelar Gateway Tests

-   **69 passing, 3 failing** tests
-   See test output: [`logs/gateway-adi-20250805-132024.log`](logs/gateway-adi-20250805-132024.log)

### RPC Compatibility Tests

-   **26 passing, 1 failing** tests
-   See test output: [`logs/rpc-adi-20250805-144446.log`](logs/rpc-adi-20250805-144446.log)

## Test Failures

-   Gateway: burn token tests fail due to unsupported `selfdestruct` (known issue)
-   RPC: 'supports finalized tag' fails due to infrequent submission to L1. Explanation from ADI team:

```
for every batch proceeded by prover, transaction is sent to L1 by operator account - eth-sepolia.blockscout.com/address/0xDa999E35FA784Db258623D02535C781AF1554d20
also for every batch data, transaction is sent to L1 by blob operator - https://eth-sepolia.blockscout.com/address/0x918F6BE14FA0D61487F6999b1147519f5D0c6627?tab=txs
so for every batch in final we will send 2 transactions and the frequency depends on chain load. Batch could take different time to be proceeded depending on tx count, but standard time is from 2s to 10s depending on transaction count for blob operator.
Recent batches with 1 transaction count were posted every 5-10s. During the load testing we were creating batches every 2s with tx count up to 500 txs.
Prover verification transactions could take a lot more time, you could see that batches were sent about 14-12 hours ago but operator is still sending txs
```

## Gas estimate accuracy

Similar to ZkSync, `eth_estimateGas` overestimates gas on ADI, although it is more accurate than the ZkSync Era RPC.

-   See test output: [`log/gas-estimation-adi-20250806-100322.log`](logs/gas-estimation-adi-20250806-100322.log)
