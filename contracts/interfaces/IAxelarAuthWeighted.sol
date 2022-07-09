// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IAxelarAuthMultisig } from './IAxelarAuthMultisig.sol';

interface IAxelarAuthWeighted is IAxelarAuthMultisig {
    error InvalidWeights();

    event WeightedOperatorshipTransferred(address[] newOperators, uint256[] newWeights, uint256 newThreshold);
}
