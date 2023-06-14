// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { AxelarExecutable } from '@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol';
import { IAxelarGovernance } from '../interfaces/IAxelarGovernance.sol';
import { TimeLock } from '../util/TimeLock.sol';

contract AxelarGatewayGovernance is AxelarExecutable, TimeLock, IAxelarGovernance {
    enum Command {
        ScheduleProposal,
        CancelProposal
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

    function executeProposal(address targetContract, bytes calldata callData) external virtual {
        _executeProposal(targetContract, callData);
    }

    function _executeProposal(address targetContract, bytes calldata callData) internal {
        bytes32 proposalHash = keccak256(abi.encodePacked(targetContract, callData));

        _executeTimeLock(proposalHash);

        (bool success, ) = targetContract.call(callData);

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

        (Command command, address targetContract, bytes memory callData, uint256 eta) = abi.decode(
            payload,
            (Command, address, bytes, uint256)
        );

        if (targetContract == address(0)) revert InvalidTargetContract();
        if (callData.length == 0) revert InvalidCallData();

        bytes32 proposalHash = keccak256(abi.encodePacked(targetContract, callData));

        if (command == Command.ScheduleProposal) {
            _scheduleTimeLock(proposalHash, eta);

            emit ProposalScheduled(proposalHash, targetContract, callData, eta);
        } else if (command == Command.CancelProposal) {
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
