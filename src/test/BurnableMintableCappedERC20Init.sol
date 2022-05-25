// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarGateway } from '../interfaces/IAxelarGateway.sol';
import { BurnableMintableCappedERC20 } from '../BurnableMintableCappedERC20.sol';

import { DepositHandler } from '../DepositHandler.sol';

contract BurnableMintableCappedERC20Init is BurnableMintableCappedERC20 {
    constructor(uint8 decimals, uint256 cap) BurnableMintableCappedERC20('', '', decimals, cap) {}

    function init(string memory name_, string memory symbol_) external {
        name = name_;
        symbol = symbol_;
    }
}
