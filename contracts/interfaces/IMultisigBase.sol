// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

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

    function signerEpoch() external view returns (uint256);

    function signerThreshold(uint256 epoch) external view returns (uint256);

    function signerAccounts(uint256 epoch) external view returns (address[] memory);

    /***********\
    |* Setters *|
    \***********/

    function rotateSigners(address[] memory newAccounts, uint256 newThreshold) external payable;
}
