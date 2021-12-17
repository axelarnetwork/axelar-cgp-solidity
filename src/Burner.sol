// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { BurnableMintableCappedERC20 } from './BurnableMintableCappedERC20.sol';

contract Burner {
    constructor(address tokenAddress, bytes32 salt) {
        BurnableMintableCappedERC20(tokenAddress).burn(salt);

        selfdestruct(payable(address(0)));
    }
}
