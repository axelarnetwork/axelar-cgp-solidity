// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title BrickedAxelarGateway
 * @notice Stub implementation used to permanently brick an `AxelarGateway` proxy.
 * @dev After a successful `AxelarGateway.upgrade(...)` that points the proxy at
 * this implementation, every subsequent external call on the proxy reverts with
 * `Bricked()`. Only `contractId()` and `setup(bytes)` are functional and they
 * exist solely to satisfy the original gateway's upgrade-time validation:
 *
 *   1. `AxelarGateway.upgrade` reads `IContractIdentifier(newImpl).contractId()`
 *      and reverts with `InvalidImplementation()` unless it matches
 *      `keccak256("axelar-gateway")`.
 *   2. After swapping the implementation pointer, the gateway `delegatecall`s
 *      `setup(setupParams)` on the new implementation when `setupParams.length != 0`.
 *      A reverting `setup` causes `SetupFailed()`.
 *
 * Once upgraded, the proxy is permanently dead: no `callContract`, no
 * `execute`, no `governance`, no further `upgrade` (the bricked impl has no
 * upgrade function). The brick is irreversible by design.
 */
contract BrickedAxelarGateway {
    error Bricked();

    /**
     * @notice Returns the contract identifier that the original `AxelarGateway`
     * checks against during `upgrade(...)`. Must equal `keccak256("axelar-gateway")`
     * for the upgrade tx to land.
     */
    function contractId() external pure returns (bytes32) {
        return keccak256('axelar-gateway');
    }

    /**
     * @notice No-op `setup` so the upgrade tx does not revert during the
     * post-implementation-swap `delegatecall(setup, setupParams)` step.
     */
    function setup(
        bytes calldata /* setupParams */
    ) external pure {}

    // solhint-disable-next-line payable-fallback
    fallback() external {
        revert Bricked();
    }
}
