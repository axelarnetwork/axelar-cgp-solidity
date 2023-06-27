// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IMultisigBase } from './IMultisigBase.sol';

/**
 * @title IMultisigExecute Interface
 * @notice This interface extends IMultisigBase by adding an execute function for multisignature transactions.
 */
interface IMultisigExecute is IMultisigBase {
    error InsufficientValue();
    error ExecutionFailed();

    /**
     * @notice Executes a function on an external contract.
     * @param target The address of the contract to call
     * @param callData The call data to be sent
     * @param nativeValue The native token value to be sent (e.g., ETH)
     */
    function execute(
        address target,
        bytes calldata callData,
        uint256 nativeValue
    ) external payable;
}
