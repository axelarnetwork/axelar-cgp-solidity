// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IAdminMultisig {
    error NotAdmin();
    error AlreadyVoted();
    error InvalidAdmins();
    error InvalidAdminThreshold();
    error DuplicateAdmin(address admin);

    /***********\
    |* Getters *|
    \***********/

    function adminEpoch() external view returns (uint256);

    function adminThreshold(uint256 epoch) external view returns (uint256);

    function admins(uint256 epoch) external view returns (address[] memory);
}
