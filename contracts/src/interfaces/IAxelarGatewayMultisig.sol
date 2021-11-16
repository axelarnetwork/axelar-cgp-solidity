// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './IAxelarGateway.sol';

interface IAxelarGatewayMultisig is IAxelarGateway {

    event OwnershipTransferred(address[] preOwners, uint256 prevThreshold, address[] newOwners, uint256 newThreshold);

    event OperatorshipTransferred(address[] preOperators, uint256 prevThreshold, address[] newOperators, uint256 newThreshold);

    function owners() external view returns (address[] memory);

    function operators() external view returns (address[] memory);

    function deployToken(address[] memory signers, bytes memory params) external;

    function mintToken(address[] memory signers, bytes memory params) external;

    function burnToken(address[] memory signers, bytes memory params) external;

    function transferOwnership(address[] memory signers, bytes memory params) external;

    function transferOperatorship(address[] memory signers, bytes memory params) external;

}
