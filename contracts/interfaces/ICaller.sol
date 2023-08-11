// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ICaller {
    error InvalidContract(address target);
    error InsufficientBalance();
    error ExecutionFailed();
}
