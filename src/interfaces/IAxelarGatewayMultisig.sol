// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from './IAxelarGateway.sol';

interface IAxelarGatewayMultisig is IAxelarGateway {
    event OwnershipTransferred(address[] preOwners, uint256 prevThreshold, address[] newOwners, uint256 newThreshold);

    event OperatorshipTransferred(
        address[] preOperators,
        uint256 prevThreshold,
        address[] newOperators,
        uint256 newThreshold
    );

    function getOwnerEpoch() external view returns (uint256);

    function getOwnerThreshold(uint256 ownerEpoch) external view returns (uint256);

    function owners(uint256 ownerEpoch) external view returns (address[] memory);

    function getOperatorEpoch() external view returns (uint256);

    function getOperatorThreshold(uint256 operatorEpoch) external view returns (uint256);

    function operators(uint256 operatorEpoch) external view returns (address[] memory);
}
