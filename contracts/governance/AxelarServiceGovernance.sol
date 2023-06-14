// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { AxelarGatewayGovernance } from './AxelarGatewayGovernance.sol';
import { MultisigBase } from '../auth/MultisigBase.sol';

contract AxelarServiceGovernance is MultisigBase, AxelarGatewayGovernance {
    constructor(
        address gatewayAddress,
        string memory governanceChain,
        string memory governanceAddress,
        uint256 minimumTimeDelay,
        address[] memory signers,
        uint256 threshold
    ) AxelarGatewayGovernance(gatewayAddress, governanceChain, governanceAddress, minimumTimeDelay) {
        _rotateSigners(signers, threshold);
    }

    function executeProposal(address targetContract, bytes calldata callData) external override onlySigners {
        _executeProposal(targetContract, callData);
    }
}
