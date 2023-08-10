// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IMultisigBase Interface
 * @notice An interface defining the base operations for a multi-signature contract.
 */
interface IMultisigBase {
    error NotSigner();
    error AlreadyVoted();
    error InvalidSigners();
    error InvalidSignerThreshold();
    error DuplicateSigner(address account);

    /**********\
    |* Events *|
    \**********/

    event MultisigOperationExecuted(bytes32 indexed operationHash);

    event SignersRotated(address[] newAccounts, uint256 newThreshold);

    /***********\
    |* Getters *|
    \***********/

    /**
     * @notice Gets the current epoch.
     * @return uint The current epoch
     */
    function signerEpoch() external view returns (uint256);

    /**
     * @notice Gets the threshold of current signers.
     * @return uint The threshold number
     */
    function signerThreshold() external view returns (uint256);

    /**
     * @notice Gets the array of current signers.
     * @return array of signer addresses
     */
    function signerAccounts() external view returns (address[] memory);

    /**
     * @notice Getter to determine if an account is a signer
     * @return boolean indicating if the account is a signer
     */
    function isSigner(address account) external view returns (bool);

    /**
     * @notice Getter to determine if an account has voted on a topic
     * @return boolean indicating if the account has voted
     */
    function hasSignerVoted(address account, bytes32 topic) external view returns (bool);

    /**
     * @notice Get the number of votes for a topic
     * @return uint256 indicating the number of votes for a topic
     */
    function getSignerVotesCount(bytes32 topic) external view returns (uint256);

    /***********\
    |* Setters *|
    \***********/

    /**
     * @notice Update the signers and threshold for the multisig contract.
     * @param newAccounts The array of new signers
     * @param newThreshold The new threshold of signers required
     */
    function rotateSigners(address[] memory newAccounts, uint256 newThreshold) external;
}
