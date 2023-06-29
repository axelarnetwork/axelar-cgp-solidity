// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { SafeNativeTransfer } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/SafeTransfer.sol';
import { IMultisig } from '../interfaces/IMultisig.sol';
import { MultisigBase } from '../auth/MultisigBase.sol';

contract AxelarMultisigMintLimiter is MultisigBase, IMultisig {
    using SafeNativeTransfer for address;

    constructor(address[] memory accounts, uint256 threshold) MultisigBase(accounts, threshold) {}

    function execute(
        address target,
        bytes calldata callData,
        uint256 nativeValue
    ) external payable onlySigners {
        (bool success, ) = target.call{ value: nativeValue }(callData);
        if (!success) {
            revert ExecutionFailed();
        }
    }

    receive() external payable {}
}
