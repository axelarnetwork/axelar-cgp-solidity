// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { SafeNativeTransfer } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/SafeTransfer.sol';
import { IMultisigExecute } from '../interfaces/IMultisigExecute.sol';
import { MultisigBase } from '../auth/MultisigBase.sol';

/**
 * @title AxelarMultisigMintLimiter Contract
 * @notice An extension of MultisigBase that can call functions on any contract.
 */
contract AxelarMultisigMintLimiter is MultisigBase, IMultisigExecute {
    using SafeNativeTransfer for address;

    /**
     * @notice Contract constructor
     * @dev Sets the initial list of signers and corresponding threshold.
     * @param accounts Address array of the signers
     * @param threshold Signature threshold required to validate a transaction
     */
    constructor(address[] memory accounts, uint256 threshold) {
        _rotateSigners(accounts, threshold);
    }

    /**
     * @notice Executes an external contract call.
     * @dev Calls a target address with specified calldata and optionally sends value.
     * This function is protected by the onlySigners modifier.
     * @param target The address of the contract to call
     * @param callData The data encoding the function and arguments to call
     * @param nativeValue The amount of native currency (e.g., ETH) to send along with the call
     */
    function execute(
        address target,
        bytes calldata callData,
        uint256 nativeValue
    ) external payable onlySigners {
        if (msg.value < nativeValue) revert InsufficientValue();

        (bool success, ) = target.call{ value: nativeValue }(callData);
        if (!success) {
            revert ExecutionFailed();
        }

        if (msg.value > nativeValue) {
            msg.sender.safeNativeTransfer(msg.value - nativeValue);
        }
    }
}
