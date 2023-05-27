// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import { IAdminMultisig } from '../interfaces/IAdminMultisig.sol';
import { EternalStorage } from '../EternalStorage.sol';

contract AdminMultisigBase is EternalStorage, IAdminMultisig {
    // AUDIT: slot names should be prefixed with some standard string
    bytes32 internal constant KEY_ADMIN_EPOCH = keccak256('admin-epoch');

    bytes32 internal constant PREFIX_ADMIN = keccak256('admin');
    bytes32 internal constant PREFIX_ADMIN_COUNT = keccak256('admin-count');
    bytes32 internal constant PREFIX_ADMIN_THRESHOLD = keccak256('admin-threshold');
    bytes32 internal constant PREFIX_ADMIN_VOTE_COUNTS = keccak256('admin-vote-counts');
    bytes32 internal constant PREFIX_ADMIN_VOTED = keccak256('admin-voted');
    bytes32 internal constant PREFIX_IS_ADMIN = keccak256('is-admin');

    // NOTE: Given the early void return, this modifier should be used with care on functions that return data.
    modifier onlyAdmins() {
        uint256 epoch = _adminEpoch();

        if (!_isAdmin(epoch, msg.sender)) revert NotAdmin();

        bytes32 topic = keccak256(msg.data);

        // Check that admin has not voted, then record that they have voted.
        if (_hasVoted(epoch, topic, msg.sender)) revert AlreadyVoted();

        _setHasVoted(epoch, topic, msg.sender, true);

        // Determine the new vote count and update it.
        uint256 adminVoteCount = _getVoteCount(epoch, topic) + uint256(1);
        _setVoteCount(epoch, topic, adminVoteCount);

        // Do not proceed with operation execution if insufficient votes.
        if (adminVoteCount < _getAdminThreshold(epoch)) return;

        _;

        // Clear vote count and voted booleans.
        _setVoteCount(epoch, topic, uint256(0));

        uint256 adminCount = _getAdminCount(epoch);

        for (uint256 i; i < adminCount; ++i) {
            _setHasVoted(epoch, topic, _getAdmin(epoch, i), false);
        }
    }

    /******************\
    |* Public Getters *|
    \******************/

    /// @dev Returns the current `adminEpoch`.
    function adminEpoch() external view override returns (uint256) {
        return _adminEpoch();
    }

    /// @dev Returns the admin threshold for a given `adminEpoch`.
    function adminThreshold(uint256 epoch) external view override returns (uint256) {
        return _getAdminThreshold(epoch);
    }

    /// @dev Returns the array of admins within a given `adminEpoch`.
    function admins(uint256 epoch) external view override returns (address[] memory results) {
        uint256 adminCount = _getAdminCount(epoch);
        results = new address[](adminCount);

        for (uint256 i; i < adminCount; ++i) {
            results[i] = _getAdmin(epoch, i);
        }
    }

    /********************\
    |* Pure Key Getters *|
    \********************/

    function _getAdminKey(uint256 epoch, uint256 index) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_ADMIN, epoch, index));
    }

    function _getAdminCountKey(uint256 epoch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_ADMIN_COUNT, epoch));
    }

    function _getAdminThresholdKey(uint256 epoch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_ADMIN_THRESHOLD, epoch));
    }

    function _getAdminVoteCountsKey(uint256 epoch, bytes32 topic) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_ADMIN_VOTE_COUNTS, epoch, topic));
    }

    function _getAdminVotedKey(
        uint256 epoch,
        bytes32 topic,
        address account
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_ADMIN_VOTED, epoch, topic, account));
    }

    function _getIsAdminKey(uint256 epoch, address account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX_IS_ADMIN, epoch, account));
    }

    /***********\
    |* Getters *|
    \***********/

    function _adminEpoch() internal view returns (uint256) {
        return getUint(KEY_ADMIN_EPOCH);
    }

    function _getAdmin(uint256 epoch, uint256 index) internal view returns (address) {
        return getAddress(_getAdminKey(epoch, index));
    }

    function _getAdminCount(uint256 epoch) internal view returns (uint256) {
        return getUint(_getAdminCountKey(epoch));
    }

    function _getAdminThreshold(uint256 epoch) internal view returns (uint256) {
        return getUint(_getAdminThresholdKey(epoch));
    }

    function _getVoteCount(uint256 epoch, bytes32 topic) internal view returns (uint256) {
        return getUint(_getAdminVoteCountsKey(epoch, topic));
    }

    function _hasVoted(
        uint256 epoch,
        bytes32 topic,
        address account
    ) internal view returns (bool) {
        return getBool(_getAdminVotedKey(epoch, topic, account));
    }

    function _isAdmin(uint256 epoch, address account) internal view returns (bool) {
        return getBool(_getIsAdminKey(epoch, account));
    }

    /***********\
    |* Setters *|
    \***********/

    function _setAdminEpoch(uint256 epoch) internal {
        _setUint(KEY_ADMIN_EPOCH, epoch);
    }

    function _setAdmin(
        uint256 epoch,
        uint256 index,
        address account
    ) internal {
        _setAddress(_getAdminKey(epoch, index), account);
    }

    function _setAdminCount(uint256 epoch, uint256 adminCount) internal {
        _setUint(_getAdminCountKey(epoch), adminCount);
    }

    function _setAdmins(
        uint256 epoch,
        address[] memory accounts,
        uint256 threshold
    ) internal {
        uint256 adminLength = accounts.length;

        if (adminLength < threshold) revert InvalidAdmins();

        if (threshold == uint256(0)) revert InvalidAdminThreshold();

        _setAdminThreshold(epoch, threshold);
        _setAdminCount(epoch, adminLength);

        for (uint256 i; i < adminLength; ++i) {
            address account = accounts[i];

            // Check that the account wasn't already set as an admin for this epoch.
            if (_isAdmin(epoch, account)) revert DuplicateAdmin(account);

            if (account == address(0)) revert InvalidAdmins();

            // Set this account as the i-th admin in this epoch (needed to we can clear topic votes in `onlyAdmin`).
            _setAdmin(epoch, i, account);
            _setIsAdmin(epoch, account, true);
        }
    }

    function _setAdminThreshold(uint256 epoch, uint256 threshold) internal {
        _setUint(_getAdminThresholdKey(epoch), threshold);
    }

    function _setVoteCount(
        uint256 epoch,
        bytes32 topic,
        uint256 voteCount
    ) internal {
        _setUint(_getAdminVoteCountsKey(epoch, topic), voteCount);
    }

    function _setHasVoted(
        uint256 epoch,
        bytes32 topic,
        address account,
        bool voted
    ) internal {
        _setBool(_getAdminVotedKey(epoch, topic, account), voted);
    }

    function _setIsAdmin(
        uint256 epoch,
        address account,
        bool isAdmin
    ) internal {
        _setBool(_getIsAdminKey(epoch, account), isAdmin);
    }
}
