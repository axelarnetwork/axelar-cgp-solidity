// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface ICosignedBase {
    error NotCosigner();
    error AlreadyVoted();
    error InvalidCosigners();
    error InvalidCosignerThreshold();
    error DuplicateCosigner(address account);

    /***********\
    |* Getters *|
    \***********/

    function cosignerEpoch() external view returns (uint256);

    function cosignerThreshold(uint256 epoch) external view returns (uint256);

    function cosignerAccounts(uint256 epoch) external view returns (address[] memory);
}
