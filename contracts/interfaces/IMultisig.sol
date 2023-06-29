// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IMultisigBase } from './IMultisigBase.sol';

interface IMultisig is IMultisigBase {
    error ExecutionFailed();

    /**
     * @notice Executes a transaction
     * @param target The address of the contract targeted by the transaction
     * @param callData The call data to be sent to the target contract
     * @param nativeValue The amount of native tokens to be sent to the target contract
     */
    function execute(
        address target,
        bytes calldata callData,
        uint256 nativeValue
    ) external;
}
