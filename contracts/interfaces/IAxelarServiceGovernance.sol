// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IInterchainGovernance } from './IInterchainGovernance.sol';
import { IMultisigBase } from './IMultisigBase.sol';

interface IAxelarServiceGovernance is IMultisigBase, IInterchainGovernance {
    error NotApproved();

    event MultisigApproved(bytes32 indexed proposalHash, address indexed targetContract, bytes callData);
    event MultisigCancelled(bytes32 indexed proposalHash);
    event MultisigExecuted(bytes32 indexed proposalHash);

    function executeMultisigProposal(address targetContract, bytes calldata callData) external payable;
}
