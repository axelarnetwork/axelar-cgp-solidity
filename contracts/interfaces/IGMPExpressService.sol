// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IAxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarExecutable.sol';

// This should be owned by the microservice that is paying for gas.
interface IGMPExpressService is IAxelarExecutable {
    error InvalidGateway();
    error InvalidOperator();
    error InvalidContractAddress();
    error InvalidTokenSymbol();
    error NotExpressProxy();
    error NotOperator();
    error FailedDeploy();
    error EmptyBytecode();
    error WrongGasAmounts();
    error TransferFailed();

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

    function deployExpressProxy(
        bytes32 salt,
        address implementationAddress,
        address owner,
        bytes calldata setupParams
    ) external returns (address);

    function deployExpressExecutable(
        bytes32 salt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams
    ) external returns (address);

    function deployExpressExecutableOnChains(
        bytes32 salt,
        bytes memory implementationBytecode,
        address owner,
        bytes calldata setupParams,
        string[] calldata destinationChains,
        uint256[] calldata gasPayments,
        address gasRefundAddress
    ) external;

    function withdraw(
        address payable receiver,
        address token,
        uint256 amount
    ) external;
}
