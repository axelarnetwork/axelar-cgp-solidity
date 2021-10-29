// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './IAxelarGateway.sol';
import { AxelarGatewayProxy } from './AxelarGatewayProxy.sol';
import { AxelarGatewayMultisig } from './AxelarGatewayMultisig.sol';

contract AxelarGatewayProxyMultisig is AxelarGatewayProxy {
    constructor(bytes memory params) {
        IAxelarGateway gateway = new AxelarGatewayMultisig();

        setAddress(KEY_IMPLEMENTATION, address(gateway));
        (bool success, ) =
            address(gateway).delegatecall(
                abi.encodeWithSelector(IAxelarGateway.setup.selector, params)
            );
        require(success, 'SETUP_FAILED');
    }
}
