// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './interfaces/IAxelarGateway.sol';

import { AxelarGatewayProxy } from './AxelarGatewayProxy.sol';
import { AxelarGatewayMultisig } from './AxelarGatewayMultisig.sol';

contract AxelarGatewayProxyMultisig is AxelarGatewayProxy {
    constructor(bytes memory params) {
        // AUDIT: constructor contains entire AxelarGatewayMultisig bytecode. Consider passing in an AxelarGatewayMultisig address.
        address gateway = address(new AxelarGatewayMultisig());

        _setAddress(KEY_IMPLEMENTATION, gateway);

        (bool success, ) = gateway.delegatecall(abi.encodeWithSelector(IAxelarGateway.setup.selector, params));
        require(success, 'SETUP_FAILED');
    }

    function setup(bytes calldata params) external {}
}
