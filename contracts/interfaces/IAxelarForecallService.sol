// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IAxelarGateway } from './IAxelarGateway.sol';

// This should be owned by the microservice that is paying for gas.
interface IAxelarForecallService {
    error NotOperator();
    error InvalidContractAddress();
    error AlreadyExecuted();
    error InvalidAddress();
    error TransferFailed();

    function call(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes calldata payload
    ) external;

    function callWithToken(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes calldata payload,
        string calldata tokenSymbolA,
        uint256 amount
    ) external;

    function withdraw(
        address payable receiver,
        address token,
        uint256 amount
    ) external;

    function gateway() external returns (IAxelarGateway);

    function forecallOperator() external returns (address);
}
