// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IMultisigBase } from './IMultisigBase.sol';

interface IMultisigExecute is IMultisigBase {
    error ExecutionFailed();

    function execute(address target, bytes calldata callData) external;
}
