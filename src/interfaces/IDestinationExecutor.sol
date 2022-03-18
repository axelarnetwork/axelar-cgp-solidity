// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IDestinationExecutor {
    function execute(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload
    ) external;

    function executeWithToken(
        bytes32 commandId,
        string memory sourceChain,
        string memory sourceAddress,
        bytes calldata payload,
        string memory tokenSymbol,
        uint256 amount
    ) external;
}
