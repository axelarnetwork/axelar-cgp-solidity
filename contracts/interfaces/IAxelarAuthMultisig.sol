// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IAxelarAuth } from './IAxelarAuth.sol';

interface IAxelarAuthMultisig is IAxelarAuth {
    event OperatorshipTransferred(address[] newOperators, uint256 newThreshold);

    function currentEpoch() external view returns (uint256);

    function hashForEpoch(uint256 epoch) external view returns (bytes32);

    function epochForHash(bytes32 hash) external view returns (uint256);
}
