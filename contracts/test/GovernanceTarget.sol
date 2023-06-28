// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract GovernanceTarget {
    event TargetCalled();

    function callTarget() external payable {
        emit TargetCalled();
    }

    receive() external payable {}
}
