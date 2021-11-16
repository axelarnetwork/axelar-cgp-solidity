// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './IAxelarGateway.sol';

interface IAxelarGatewaySinglesig is IAxelarGateway {

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    event OperatorshipTransferred(address indexed previousOperator, address indexed newOperator);

    function owner() external view returns (address);

    function operator() external view returns (address);

    function deployToken(address signer, bytes memory params) external;

    function mintToken(address signer, bytes memory params) external;

    function burnToken(address signer, bytes memory params) external;

    function transferOwnership(address signer, bytes memory params) external;

    function transferOperatorship(address signer, bytes memory params) external;

}
