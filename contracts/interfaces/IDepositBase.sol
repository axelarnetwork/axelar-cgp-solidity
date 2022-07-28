// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IDepositBase {
    error InvalidAddress();
    error InvalidSymbol();
    error NothingDeposited();
    error ApproveFailed();
    error WrapFailed();
    error UnwrapFailed();
    error TokenTransferFailed();

    function gateway() external returns (address);

    function wrappedSymbol() external returns (string memory);

    function wrappedToken() external returns (address);

    function refundToken() external returns (address);
}
