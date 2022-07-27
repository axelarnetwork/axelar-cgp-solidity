// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

// WETH9 specific interface
interface IWETH9 {
    function deposit() external payable;

    function withdraw(uint256 amount) external;
}
