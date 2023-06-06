// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { ICosignedBase } from './ICosignedBase.sol';

interface ICosignedExecute is ICosignedBase {
    error ExecutionFailed();

    function execute(address target, bytes calldata callData) external;

    function rotateCosigners(address[] memory newAccounts, uint256 newThreshold) external;
}
