// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IUpgradable } from '../interfaces/IUpgradable.sol';
import './AxelarDepositService.sol';

contract DepositReceiver {
    constructor(bytes memory delegateData) {
        // Reading the implementation of the AxelarDepositService
        // and delegating the call back to it
        (bool success, ) = IUpgradable(msg.sender).implementation().delegatecall(delegateData);

        // if not success revert with the original revert data
        if (!success) {
            assembly {
                let ptr := mload(0x40)
                let size := returndatasize()
                returndatacopy(ptr, 0, size)
                revert(ptr, size)
            }
        }

        selfdestruct(payable(msg.sender));
    }

    receive() external payable {}
}
