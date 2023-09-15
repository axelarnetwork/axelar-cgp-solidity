// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract TestDepositHandler {
    event Called();

    function test() external returns (bool) {
        emit Called();
        return true;
    }

    function destroy(address receiver) external {
        selfdestruct(payable(receiver));
    }

    receive() external payable {}
}
