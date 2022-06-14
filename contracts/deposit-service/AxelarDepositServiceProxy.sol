// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { Proxy } from '../util/Proxy.sol';
import { IUpgradable } from '../interfaces/IUpgradable.sol';

contract AxelarDepositServiceProxy is Proxy {
    function _checkImplementationAddress(address implementationAddress) internal view override {
        if (IUpgradable(implementationAddress).contractId() != keccak256('axelar-deposit-service')) revert InvalidImplementation();
    }

    receive() external payable override {}
}
