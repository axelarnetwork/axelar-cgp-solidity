// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import { IAxelarGateway } from './IAxelarGateway.sol';
import { AxelarGatewayProxy } from './AxelarGatewayProxy.sol';
import { AxelarGatewaySinglesig } from './AxelarGatewaySinglesig.sol';

contract AxelarGatewayProxySinglesig is AxelarGatewayProxy {
    constructor(bytes memory params) {
        IAxelarGateway gateway = new AxelarGatewaySinglesig();

        setAddress(KEY_IMPLEMENTATION, address(gateway));

        (bool success, ) = address(gateway).delegatecall(abi.encodeWithSelector(IAxelarGateway.setup.selector, params));
        require(success, 'SETUP_FAILED');
    }
}
