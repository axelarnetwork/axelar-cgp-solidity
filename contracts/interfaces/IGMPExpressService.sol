// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IExpressProxyFactory } from './IExpressProxyFactory.sol';

// This should be owned by the microservice that is paying for gas.
interface IGMPExpressService is IExpressProxyFactory {
    error InvalidOperator();
    error InvalidContractAddress();
    error InvalidTokenSymbol();
    error NotOperator();

    function expressOperator() external returns (address);

    function callWithToken(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        address contractAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) external;

    function withdraw(
        address payable receiver,
        address token,
        uint256 amount
    ) external;
}
