// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IGovernance {
    error NotGovernance();
    error InvalidGovernance();

    event GovernanceTransferred(address indexed previousGovernance, address indexed newGovernance);

    function governance() external view returns (address);

    function transferGovernance(address newGovernance) external;
}
