# Memento Compatibility Testing

## Notes

-   tested on Memento testnet, following their implementation of an EVM interpreter
-   changes to tests based on findings from ZkSync compat test:
    -   due to intermittent failures, token deployments in before hooks are performed individually rather than as batch
    -   expected events are not assumed to be at index 0

## Test Results

### Axelar Gateway Tests

-   **69 passing, 3 failing** tests
-   See test output: [`logs/AxelarGateway-20250814-140027.log`](logs/AxelarGateway-20250814-140027.log)

### RPC Compatibility Tests

-   **27 passing, 0 failing** tests
-   See test output: [`logs/RpcCompatibility-20250814-135911.log`](logs/RpcCompatibility-20250814-135911.log)

## Test Failures

-   Gateway: burn token tests fail due to unsupported `selfdestruct`, which is expected given what we know from previos ZkSync compat testing

## Gas estimate accuracy

Similar to ZkSync, `eth_estimateGas` overestimates gas on Memento.

-   See test output: [`logs/gas-estimation-memento-20250814-144555.log`](logs/gas-estimation-memento-20250814-144555.log)
