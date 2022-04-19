// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IERC20 } from '../interfaces/IERC20.sol';

contract ChainBTokenSwapper {
    address tokenX;
    address tokenY;

    constructor(address tokenX_, address tokenY_) {
        tokenX = tokenX_;
        tokenY = tokenY_;
    }

    function swap(
        address tokenAddress,
        address toTokenAddress,
        uint256 amount,
        address recipient
    ) external returns (uint256 convertedAmount) {
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);

        if (tokenAddress == tokenX) {
            require(toTokenAddress == tokenY, 'WRONG TOKEN PAIR');
            convertedAmount = amount * 2;
        } else {
            require(tokenAddress == tokenY && toTokenAddress == tokenX, 'WRONG TOKEN PAIR');
            convertedAmount = amount / 2;
        }

        IERC20(toTokenAddress).transfer(recipient, convertedAmount);
    }
}
