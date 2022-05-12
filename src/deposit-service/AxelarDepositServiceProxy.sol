// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { Proxy } from '../util/Proxy.sol';

contract AxelarDepositServiceProxy is Proxy {
    constructor(address implementationAddress, bytes memory params) Proxy(implementationAddress, params) {}

    receive() external payable override {}
}
