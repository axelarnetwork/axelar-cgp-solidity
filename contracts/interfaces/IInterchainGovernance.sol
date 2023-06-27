// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarExecutable.sol';

/**
 * @title IInterchainGovernance Interface
 * @notice This interface extends IAxelarExecutable for interchain governance mechanisms.
 */
interface IInterchainGovernance is IAxelarExecutable {
    error NotGovernance();
    error InvalidCommand();
    error InvalidTarget();
    error InvalidCallData();
    error ExecutionFailed();
    error TokenNotSupported();

    event ProposalScheduled(bytes32 indexed proposalHash, address indexed targetContract, bytes callData, uint256 eta);
    event ProposalCancelled(bytes32 indexed proposalHash);
    event ProposalExecuted(bytes32 indexed proposalHash);

    /**
     * @notice Executes a governance proposal.
     * @param targetContract The address of the contract targeted by the proposal
     * @param callData The call data to be sent to the target contract
     */
    function executeProposal(address targetContract, bytes calldata callData) external payable;
}
