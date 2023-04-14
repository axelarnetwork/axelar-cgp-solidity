// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { FinalProxy } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/upgradable/FinalProxy.sol';

contract GMPExpressServiceProxy is FinalProxy {
    constructor(
        address implementationAddress,
        address owner,
        bytes memory setupParams
    ) FinalProxy(implementationAddress, owner, setupParams) {}

    function contractId() internal pure override returns (bytes32) {
        return keccak256('axelar-gmp-express-service');
    }
}
