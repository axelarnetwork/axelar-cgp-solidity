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
    error TokenSendFailed();

    function depositAddressForSendToken(
        bytes32 salt,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external view returns (address);

    function depositAddressForSendNative(
        bytes32 salt,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external view returns (address);

    function depositAddressForWithdrawNative(bytes32 salt, address recipient) external view returns (address);

    function sendToken(
        bytes32 salt,
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata tokenSymbol
    ) external;

    function sendNative(
        bytes32 salt,
        string calldata destinationChain,
        string calldata destinationAddress
    ) external;

    function withdrawNative(bytes32 salt, address payable recipient) external;
}
