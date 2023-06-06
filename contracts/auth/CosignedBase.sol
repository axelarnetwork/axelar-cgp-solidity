// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { ICosignedBase } from '../interfaces/ICosignedBase.sol';
import { EternalStorage } from '../EternalStorage.sol';

contract CosignedBase is ICosignedBase {
    struct Voting {
        uint256 voteCount;
        mapping(address => bool) hasVoted;
    }

    struct Cosigners {
        address[] accounts;
        uint256 threshold;
        mapping(address => bool) isCosigner;
        // bytes32 is for vote topic hash
        mapping(bytes32 => Voting) voting;
    }

    uint256 public cosignerEpoch;
    mapping(uint256 => Cosigners) public cosigners;

    // NOTE: Given the early void return, this modifier should be used with care on functions that return data.
    modifier onlyCosigners() {
        uint256 epoch = cosignerEpoch;
        Cosigners storage signers = cosigners[epoch];

        if (!signers.isCosigner[msg.sender]) revert NotCosigner();

        bytes32 topic = keccak256(msg.data);
        Voting storage voting = signers.voting[topic];

        // Check that cosigner has not voted, then record that they have voted.
        if (voting.hasVoted[msg.sender]) revert AlreadyVoted();

        voting.hasVoted[msg.sender] = true;

        // Determine the new vote count.
        uint256 voteCount = voting.voteCount + 1;

        // Do not proceed with operation execution if insufficient votes.
        if (voteCount < signers.threshold) {
            // Save updated vote count.
            voting.voteCount = voteCount;
            return;
        } else {
            // Clear vote count and voted booleans.
            voting.voteCount = 0;

            uint256 count = signers.accounts.length;

            for (uint256 i; i < count; ++i) {
                voting.hasVoted[signers.accounts[i]] = false;
            }
        }

        _;
    }

    /******************\
    |* Public Getters *|
    \******************/

    /// @dev Returns the cosigner threshold for a given `epoch`.
    function cosignerThreshold(uint256 epoch) external view override returns (uint256) {
        return cosigners[epoch].threshold;
    }

    /// @dev Returns the array of cosigners within a given `epoch`.
    function cosignerAccounts(uint256 epoch) external view override returns (address[] memory) {
        return cosigners[epoch].accounts;
    }

    /***********\
    |* Setters *|
    \***********/

    function _rotateCosigners(address[] memory newAccounts, uint256 newThreshold) internal {
        uint256 length = newAccounts.length;

        if (newThreshold > length) revert InvalidCosigners();

        if (newThreshold == 0) revert InvalidCosignerThreshold();

        uint256 newEpoch = cosignerEpoch + 1;
        cosignerEpoch = newEpoch;
        Cosigners storage newSigners = cosigners[newEpoch];

        newSigners.accounts = newAccounts;
        newSigners.threshold = newThreshold;

        for (uint256 i; i < length; ++i) {
            address account = newAccounts[i];

            // Check that the account wasn't already set as a cosigner for this epoch.
            if (newSigners.isCosigner[account]) revert DuplicateCosigner(account);
            if (account == address(0)) revert InvalidCosigners();

            newSigners.isCosigner[account] = true;
        }
    }
}
