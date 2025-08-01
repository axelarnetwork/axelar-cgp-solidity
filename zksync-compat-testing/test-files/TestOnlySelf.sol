// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TestOnlySelf {
    event TestEvent(string message);

    modifier onlySelf() {
        if (msg.sender != address(this)) revert('NotSelf');
        _;
    }

    function testOnlySelf() external onlySelf {
        emit TestEvent('onlySelf function called successfully');
    }

    function callTestOnlySelf() external {
        // This mimics the pattern used in AxelarGateway
        (bool success, bytes memory data) = address(this).call(abi.encodeWithSelector(this.testOnlySelf.selector));

        if (success) {
            emit TestEvent('Internal call succeeded');
        } else {
            emit TestEvent('Internal call failed');
        }
    }
}
