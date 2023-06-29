// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IMultisigBase } from './IMultisigBase.sol';

interface IMultisig is IMultisigBase {
    error ExecutionFailed();

    function execute(
        address target,
        bytes calldata callData,
        uint256 nativeValue
    ) external payable;
}
