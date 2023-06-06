// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { CosignedExecute } from './CosignedExecute.sol';

contract AxelarCosignedMintLimit is CosignedExecute {
    constructor(address[] memory accounts, uint256 threshold) CosignedExecute(accounts, threshold) {}
}
