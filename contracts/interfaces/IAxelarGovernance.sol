// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import '@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarExecutable.sol';

interface IAxelarGovernance is IAxelarExecutable {
    error NotGovernance();
    error InvalidCommand();
    error InvalidTargetContract();
    error InvalidCallData();
    error ExecutionFailed();
    error TokenNotSupported();

    event ProposalScheduled(bytes32 indexed proposalHash, address indexed targetContract, bytes callData, uint256 eta);
    event ProposalCancelled(bytes32 indexed proposalHash);
    event ProposalExecuted(bytes32 indexed proposalHash);

    function executeProposal(address targetContract, bytes calldata callData) external;
}
