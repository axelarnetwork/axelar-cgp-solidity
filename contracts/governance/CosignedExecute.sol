// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { ICosignedExecute } from '../interfaces/ICosignedExecute.sol';
import { CosignedBase } from '../auth/CosignedBase.sol';

contract CosignedExecute is CosignedBase, ICosignedExecute {
    constructor(address[] memory accounts, uint256 threshold) {
        _rotateCosigners(accounts, threshold);
    }

    function execute(address target, bytes calldata callData) external onlyCosigners {
        (bool success, ) = target.call(callData);
        if (!success) {
            revert ExecutionFailed();
        }
    }

    function rotateCosigners(address[] memory newAccounts, uint256 newThreshold) external onlyCosigners {
        _rotateCosigners(newAccounts, newThreshold);
    }
}
