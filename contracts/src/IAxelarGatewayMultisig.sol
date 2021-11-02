// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './IAxelarGateway.sol';

interface IAxelarGatewayMultisig is IAxelarGateway {
    event OwnershipTransferred(address[] preOwners, uint8 prevThreshold, address[] newOwners, uint8 newThreshold);
    event OperatorshipTransferred(
        address[] preOperators,
        uint8 prevThreshold,
        address[] newOperators,
        uint8 newThreshold
    );

    function owners() external view returns (address[] memory);

    function operators() external view returns (address[] memory);
}
