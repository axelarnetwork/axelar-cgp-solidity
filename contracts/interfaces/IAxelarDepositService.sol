// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import './IUpgradable.sol';

// This should be owned by the microservice that is paying for gas.
interface IAxelarDepositService is IUpgradable {
    error InvalidAddress();
    error InvalidSymbol();
    error NothingDeposited();
    error ApproveFailed();
    error WrapFailed();
    error UnwrapFailed();
    error TokenTransferFailed();

    function sendNative(string calldata destinationChain, string calldata destinationAddress) external payable;

    function depositAddressForTransferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external view returns (address);

    function depositAddressForTransferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external view returns (address);

    function depositAddressForWithdrawNative(
        bytes32 salt,
        address refundAddress,
        address recipient
    ) external view returns (address);

    function transferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external;

    function refundFromTransferToken(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol,
        address[] calldata refundTokens
    ) external;

    function transferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external;

    function refundFromTransferNative(
        bytes32 salt,
        address refundAddress,
        string calldata destinationChain,
        string calldata destinationAddress,
        address[] calldata refundTokens
    ) external;

    function withdrawNative(
        bytes32 salt,
        address refundAddress,
        address payable recipient
    ) external;

    function refundFromWithdrawNative(
        bytes32 salt,
        address refundAddress,
        address payable recipient,
        address[] calldata refundTokens
    ) external;

    function gateway() external returns (address);

    function wrappedSymbol() external returns (string memory);

    function wrappedToken() external returns (address);
}
