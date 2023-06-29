// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IMultisig } from '../interfaces/IMultisig.sol';
import { MultisigBase } from '../auth/MultisigBase.sol';

contract AxelarMultisigMintLimiter is MultisigBase, IMultisig {
    constructor(address[] memory accounts, uint256 threshold) MultisigBase(accounts, threshold) {}

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
    ) external onlySigners {
        (bool success, ) = target.call{ value: nativeValue }(callData);
        if (!success) {
            revert ExecutionFailed();
        }
    }

    /**
     * @notice Making contact able to receive native value
     */
    receive() external payable {}
}
