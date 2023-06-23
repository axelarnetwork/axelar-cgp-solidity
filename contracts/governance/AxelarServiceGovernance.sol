// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAxelarServiceGovernance } from '../interfaces/IAxelarServiceGovernance.sol';
import { InterchainGovernance } from './InterchainGovernance.sol';
import { MultisigBase } from '../auth/MultisigBase.sol';

contract AxelarServiceGovernance is InterchainGovernance, MultisigBase, IAxelarServiceGovernance {
    enum ServiceGovernanceCommand {
        ScheduleTimeLockProposal,
        CancelTimeLockProposal,
        ApproveMultisigProposal,
        CancelMultisigApproval
    }

    mapping(bytes32 => bool) public multisigApprovals;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        address gatewayAddress,
        string memory governanceChain,
        string memory governanceAddress,
        uint256 minimumTimeDelay,
        address[] memory signers,
        uint256 threshold
    ) InterchainGovernance(gatewayAddress, governanceChain, governanceAddress, minimumTimeDelay) {
        _rotateSigners(signers, threshold);
    }

    function executeMultisigProposal(address target, bytes calldata callData) external payable onlySigners {
        bytes32 proposalHash = keccak256(abi.encodePacked(target, callData, msg.value));

        if (!multisigApprovals[proposalHash]) revert NotApproved();

        multisigApprovals[proposalHash] = false;

        (bool success, ) = target.call{ value: msg.value }(callData);

        if (!success) {
            revert ExecutionFailed();
        }

        emit MultisigExecuted(proposalHash);
    }

    function _processCommand(
        uint256 commandId,
        address target,
        bytes memory callData,
        uint256 nativeValue,
        uint256 eta
    ) internal override {
        ServiceGovernanceCommand command = ServiceGovernanceCommand(commandId);
        bytes32 proposalHash = keccak256(abi.encodePacked(target, callData, nativeValue));

        if (command == ServiceGovernanceCommand.ScheduleTimeLockProposal) {
            eta = _scheduleTimeLock(proposalHash, eta);

            emit ProposalScheduled(proposalHash, target, callData, eta);
        } else if (command == ServiceGovernanceCommand.CancelTimeLockProposal) {
            _cancelTimeLock(proposalHash);

            emit ProposalCancelled(proposalHash);
        } else if (command == ServiceGovernanceCommand.ApproveMultisigProposal) {
            multisigApprovals[proposalHash] = true;

            emit MultisigApproved(proposalHash, target, callData);
        } else if (command == ServiceGovernanceCommand.CancelMultisigApproval) {
            multisigApprovals[proposalHash] = false;

            emit MultisigCancelled(proposalHash);
        } else {
            revert InvalidCommand();
        }
    }
}
