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

    function owners() external view returns (address[] memory);

    function operators() external view returns (address[] memory);
}
