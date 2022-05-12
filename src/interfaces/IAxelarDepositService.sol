// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import './IUpgradable.sol';

// This should be owned by the microservice that is paying for gas.
interface IAxelarDepositService is IUpgradable {
    error InvalidAddress();
    error InvalidSymbol();
    error NothingDeposited();
    error TransferFailed();

    function depositAddressForSendToken(
        bytes32 nonce,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external view returns (address);

    function depositAddressForSendNative(
        bytes32 nonce,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external view returns (address);

    function depositAddressForWithdrawNative(bytes32 nonce, address recipient) external view returns (address);

    function sendToken(
        bytes32 nonce,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external;

    function sendNative(
        bytes32 nonce,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external;

    function withdrawNative(bytes32 nonce, address payable recipient) external;
}
