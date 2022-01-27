// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IERC20 } from './interfaces/IERC20.sol';

contract Absorber {
    constructor(address /* refundAddress */) {}

    function transferAndDestruct(address tokenAddress, address recipient) external {
        IERC20(tokenAddress).transfer(recipient, IERC20(tokenAddress).balanceOf(address(this)));

        selfdestruct(payable(address(0)));
    }
}
