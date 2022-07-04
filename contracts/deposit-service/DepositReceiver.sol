// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IUpgradable } from '../interfaces/IUpgradable.sol';

contract DepositReceiver {
    constructor(bytes memory delegateData) {
        (bool success, ) = IUpgradable(msg.sender).implementation().delegatecall(delegateData);

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
