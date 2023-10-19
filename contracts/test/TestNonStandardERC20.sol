// SPDX-License-Identifier: MIT

// solhint-disable no-unused-vars

pragma solidity ^0.8.9;

import { MintableCappedERC20 } from '../MintableCappedERC20.sol';

contract TestNonStandardERC20 is MintableCappedERC20 {
    bool public shouldFailTransfer;

    error Invalid();

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 capacity
    ) MintableCappedERC20(name, symbol, decimals, capacity) {
        shouldFailTransfer = false;
    }

    function setFailTransfer(bool _shouldFailTransfer) public {
        shouldFailTransfer = _shouldFailTransfer;
    }

    function transfer(address, uint256) public view override returns (bool) {
        if (shouldFailTransfer) {
            return false;
        }
        revert Invalid();
    }
}
