// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { Proxy } from '../util/Proxy.sol';
import { IUpgradable } from '../interfaces/IUpgradable.sol';

contract AxelarGasServiceProxy is Proxy {
    constructor(address implementationAddress, bytes memory params) Proxy(implementationAddress, params) {
        if (IUpgradable(implementationAddress).contractId() != keccak256('axelar-gas-service')) revert InvalidImplementation();
    }
}
