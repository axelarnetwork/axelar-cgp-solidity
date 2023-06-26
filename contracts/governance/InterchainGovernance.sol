// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { TimeLock } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/utils/TimeLock.sol';
import { IInterchainGovernance } from '../interfaces/IInterchainGovernance.sol';

/**
 * @title Interchain Governance contract
 * @author Kiryl Yermakou
 * @notice This contract handles cross-chain governance actions. It includes functionality
 * to create, cancel, and execute governance proposals.
 */
contract InterchainGovernance is AxelarExecutable, TimeLock, IInterchainGovernance {
    enum GovernanceCommand {
        ScheduleTimeLockProposal,
        CancelTimeLockProposal
    }

    bytes32 public immutable governanceChainHash;
    bytes32 public immutable governanceAddressHash;

    /**
     * @dev Initializes the contract
     * @param gatewayAddress The address of the Axelar gateway contract
     * @param governanceChain_ The name of the governance chain
     * @param governanceAddress_ The address of the governance contract
     * @param minimumTimeDelay The minimum time delay for timelock operations
     */
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

    /**
     * @dev Executes a proposal
     * @param target The target address of the contract to call
     * @param callData The data containing the function and arguments for the contract to call
     */
    function executeProposal(address target, bytes calldata callData) external payable {
        bytes32 proposalHash = keccak256(abi.encodePacked(target, callData, msg.value));

        _executeTimeLock(proposalHash);

        (bool success, ) = target.call{ value: msg.value }(callData);

        if (!success) {
            revert ExecutionFailed();
        }

        emit ProposalExecuted(proposalHash);
    }

    /**
     * @dev Internal function to execute a proposal action
     * @param sourceChain The source chain of the proposal, must equal the governance chain
     * @param sourceAddress The source address of the proposal, must equal the governance address
     * @param payload The payload of the proposal
     */
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

    /**
     * @dev Internal function to process a governance command
     * @param commandId The id of the command, 0 for proposal creation and 1 for proposal cancellation
     * @param target The target address the proposal will call
     * @param callData The data the encodes the function and arguments to call on the target address
     * @param nativeValue The value of native token to be sent with the call to target address
     * @param eta The time after which the proposal can be executed
     */
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

    /**
     * @dev Overrides internal function of AxelarExecutable, will always revert with
     * custom error as this governance module does not support execute with token.
     */
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
