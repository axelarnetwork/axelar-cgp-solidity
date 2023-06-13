// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

contract TestOperators {
    uint256 public num;

    event NumAdded(uint256 num);

    function setNum(uint256 _num) external returns (bool) {
        num = _num;

        emit NumAdded(_num);

        return true;
    }
}
