// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IAxelarAuth {
    function validateProof(bytes32 messageHash, bytes calldata proof) external returns (bool currentOperators);

    function transferOperatorship(bytes calldata params) external;
}
