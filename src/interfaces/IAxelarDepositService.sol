// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import './IUpgradable.sol';

// This should be owned by the microservice that is paying for gas.
interface IAxelarDepositService is IUpgradable {
    error InvalidAddress();
    error NothingDeposited();
    error TransferFailed();

    function depositAddressForTokenSend(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata senderAddress,
        string calldata tokenSymbol
    ) external view returns (address);

    function depositAddressForNativeSend(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata senderAddress
    ) external view returns (address);

    function depositAddressForTokenUnwrap(address recipient, string calldata senderAddress)
        external
        view
        returns (address);

    function handleTokenSend(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata senderAddress,
        string calldata tokenSymbol,
        address tokenAddress
    ) external;

    function handleNativeSend(
        string calldata destinationChain,
        string calldata destinationAddress,
        string calldata senderAddress
    ) external;

    function handleTokenUnwrap(address payable recipient, string calldata senderAddress) external;
}
