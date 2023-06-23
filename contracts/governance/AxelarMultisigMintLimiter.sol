// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { SafeNativeTransfer } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/SafeTransfer.sol';
import { IMultisigExecute } from '../interfaces/IMultisigExecute.sol';
import { MultisigBase } from '../auth/MultisigBase.sol';

contract AxelarMultisigMintLimiter is MultisigBase, IMultisigExecute {
    using SafeNativeTransfer for address;

    constructor(address[] memory accounts, uint256 threshold) {
        _rotateSigners(accounts, threshold);
    }

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
