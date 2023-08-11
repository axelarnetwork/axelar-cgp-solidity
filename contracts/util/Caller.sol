// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { ContractAddress } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/ContractAddress.sol';
import { ICaller } from '../interfaces/ICaller.sol';

contract Caller is ICaller {
    using ContractAddress for address;

    /**
     * @dev Calls a target address with specified calldata and optionally sends value.
     */
    function _call(
        address target,
        bytes calldata callData,
        uint256 nativeValue
    ) internal {
        if (!target.isContract()) revert InvalidContract(target);

        if (nativeValue > address(this).balance) revert InsufficientBalance();

        (bool success, ) = target.call{ value: nativeValue }(callData);
        if (!success) {
            revert ExecutionFailed();
        }
    }
}
