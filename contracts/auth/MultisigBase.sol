// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IMultisigBase } from '../interfaces/IMultisigBase.sol';

contract MultisigBase is IMultisigBase {
    struct Voting {
        uint256 voteCount;
        mapping(address => bool) hasVoted;
    }

    struct Signers {
        address[] accounts;
        uint256 threshold;
        mapping(address => bool) isSigner;
        // bytes32 is for vote topic hash
        mapping(bytes32 => Voting) voting;
    }

    uint256 public signerEpoch;
    mapping(uint256 => Signers) public signersPerEpoch;

    // NOTE: Given the early void return, this modifier should be used with care on functions that return data.
    modifier onlySigners() {
        uint256 epoch = signerEpoch;
        Signers storage signers = signersPerEpoch[epoch];

        if (!signers.isSigner[msg.sender]) revert NotSigner();

        bytes32 topic = keccak256(msg.data);
        Voting storage voting = signers.voting[topic];

        // Check that signer has not voted, then record that they have voted.
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

        emit MultisigOperationExecuted(topic);

        _;
    }

    /******************\
    |* Public Getters *|
    \******************/

    /// @dev Returns the signer threshold for a given `epoch`.
    function signerThreshold(uint256 epoch) external view override returns (uint256) {
        return signersPerEpoch[epoch].threshold;
    }

    /// @dev Returns the array of signers within a given `epoch`.
    function signerAccounts(uint256 epoch) external view override returns (address[] memory) {
        return signersPerEpoch[epoch].accounts;
    }

    /***********\
    |* Setters *|
    \***********/

    function rotateSigners(address[] memory newAccounts, uint256 newThreshold) external virtual onlySigners {
        _rotateSigners(newAccounts, newThreshold);
    }

    function _rotateSigners(address[] memory newAccounts, uint256 newThreshold) internal {
        uint256 length = newAccounts.length;

        if (newThreshold > length) revert InvalidSigners();

        if (newThreshold == 0) revert InvalidSignerThreshold();

        uint256 newEpoch = signerEpoch + 1;
        signerEpoch = newEpoch;
        Signers storage newSigners = signersPerEpoch[newEpoch];

        newSigners.accounts = newAccounts;
        newSigners.threshold = newThreshold;

        for (uint256 i; i < length; ++i) {
            address account = newAccounts[i];

            // Check that the account wasn't already set as a signer for this epoch.
            if (newSigners.isSigner[account]) revert DuplicateSigner(account);
            if (account == address(0)) revert InvalidSigners();

            newSigners.isSigner[account] = true;
        }

        emit SignersRotated(newAccounts, newThreshold);
    }
}
