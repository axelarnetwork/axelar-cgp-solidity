// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { MintableCappedERC20 } from '../MintableCappedERC20.sol';
import { IWETH9 } from '../interfaces/IWETH9.sol';

contract TestWeth is MintableCappedERC20, IWETH9 {
    error Invalid();

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 capacity
    ) MintableCappedERC20(name, symbol, decimals, capacity) {}

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        if (balanceOf[msg.sender] < amount) revert Invalid();
        balanceOf[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }
}
