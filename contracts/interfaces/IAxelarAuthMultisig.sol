// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarAuthModule } from './IAxelarAuthModule.sol';

interface IAxelarAuthMultisig is IAxelarAuthModule {
    event OperatorshipTransferred(bytes32 indexed newOperatorsHash, address[] newOperators, uint256 newThreshold);

    function currentEpoch() external view returns (uint256);

    function hashForEpoch(uint256 epoch) external view returns (bytes32);

    function epochForHash(bytes32 hash) external view returns (uint256);
}
