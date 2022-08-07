// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarDepositService } from '../interfaces/IAxelarDepositService.sol';

contract DepositReceiver {
    constructor(bytes memory delegateData, address refundAddress) {
        // Reading the implementation of the AxelarDepositService
        // and delegating the call back to it
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = IAxelarDepositService(msg.sender).receiverImplementation().delegatecall(delegateData);

        // if not success revert with the original revert data
        if (!success) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                let ptr := mload(0x40)
                let size := returndatasize()
                returndatacopy(ptr, 0, size)
                revert(ptr, size)
            }
        }

        if (refundAddress == address(0)) refundAddress = msg.sender;

        selfdestruct(payable(refundAddress));
    }

    // @dev This function is for receiving Ether from unwrapping WETH9
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
