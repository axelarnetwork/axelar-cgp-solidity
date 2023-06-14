// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IMultisigExecute } from '../interfaces/IMultisigExecute.sol';
import { MultisigBase } from '../auth/MultisigBase.sol';

contract AxelarMultisigMintLimiter is MultisigBase, IMultisigExecute {
    constructor(address[] memory accounts, uint256 threshold) {
        _rotateSigners(accounts, threshold);
    }

    function execute(address target, bytes calldata callData) external onlySigners {
        (bool success, ) = target.call(callData);
        if (!success) {
            revert ExecutionFailed();
        }
    }
}
