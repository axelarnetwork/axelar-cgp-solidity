// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Proxy } from '../../util/Proxy.sol';

contract TestProxy is Proxy {
    function contractId() internal pure override returns (bytes32) {
        return keccak256('test');
    }
}
