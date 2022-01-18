// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IERC20 } from './interfaces/IERC20.sol';

contract Burner {
    constructor(address tokenAddress, bytes32) {
        IERC20(tokenAddress).transfer(msg.sender, IERC20(tokenAddress).balanceOf(address(this)));

        selfdestruct(payable(address(0)));
    }
}
