// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { TimeLock } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/TimeLock.sol';
import { IInterchainGovernance } from '../interfaces/IInterchainGovernance.sol';

contract InterchainGovernance is AxelarExecutable, TimeLock, IInterchainGovernance {
    enum GovernanceCommand {
        ScheduleTimeLockProposal,
        CancelTimeLockProposal
    }

    bytes32 public immutable governanceChainHash;
    bytes32 public immutable governanceAddressHash;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        address gatewayAddress,
        string memory governanceChain_,
        string memory governanceAddress_,
        uint256 minimumTimeDelay
    ) AxelarExecutable(gatewayAddress) TimeLock(minimumTimeDelay) {
        governanceChainHash = keccak256(bytes(governanceChain_));
        governanceAddressHash = keccak256(bytes(governanceAddress_));
    }

    function executeProposal(address target, bytes calldata callData) external payable {
        bytes32 proposalHash = keccak256(abi.encodePacked(target, callData, msg.value));

        _executeTimeLock(proposalHash);

        (bool success, ) = target.call{ value: msg.value }(callData);

        if (!success) {
            revert ExecutionFailed();
        }

        emit ProposalExecuted(proposalHash);
    }

    function _execute(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) internal override {
        if (keccak256(bytes(sourceChain)) != governanceChainHash || keccak256(bytes(sourceAddress)) != governanceAddressHash)
            revert NotGovernance();

        (uint256 command, address target, bytes memory callData, uint256 nativeValue, uint256 eta) = abi.decode(
            payload,
            (uint256, address, bytes, uint256, uint256)
        );

        if (target == address(0)) revert InvalidTarget();
        if (callData.length == 0) revert InvalidCallData();

        _processCommand(command, target, callData, nativeValue, eta);
    }

    function _processCommand(
        uint256 commandId,
        address target,
        bytes memory callData,
        uint256 nativeValue,
        uint256 eta
    ) internal virtual {
        GovernanceCommand command = GovernanceCommand(commandId);
        bytes32 proposalHash = keccak256(abi.encodePacked(target, callData, nativeValue));

        if (command == GovernanceCommand.ScheduleTimeLockProposal) {
            eta = _scheduleTimeLock(proposalHash, eta);

            emit ProposalScheduled(proposalHash, target, callData, eta);
        } else if (command == GovernanceCommand.CancelTimeLockProposal) {
            _cancelTimeLock(proposalHash);

            emit ProposalCancelled(proposalHash);
        } else {
            revert InvalidCommand();
        }
    }

    function _executeWithToken(
        string calldata, /* sourceChain */
        string calldata, /* sourceAddress */
        bytes calldata, /* payload */
        string calldata, /* tokenSymbol */
        uint256 /* amount */
    ) internal pure override {
        revert TokenNotSupported();
    }
}
