// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AxelarGateway } from '../AxelarGateway.sol';

contract TestAxelarGateway is AxelarGateway {
    string public name = 'Test Axelar Gateway'; // Dummy var for a different bytecode

    error Invalid();

    constructor(address authModule_, address tokenDeployer_) AxelarGateway(authModule_, tokenDeployer_) {
        if (KEY_IMPLEMENTATION != bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)) revert Invalid();
        if (KEY_GOVERNANCE != bytes32(uint256(keccak256('governance')) - 1)) revert Invalid();
        if (KEY_MINT_LIMITER != bytes32(uint256(keccak256('mint-limiter')) - 1)) revert Invalid();
    }
}
