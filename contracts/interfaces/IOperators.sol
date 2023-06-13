// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IOperators {
    error NotOperator();
    error InvalidOperator();
    error OperatorAlreadyAdded();
    error NotAnOperator();
    error ExecutionFailed();

    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    function isOperator(address account) external view returns (bool);

    function addOperator(address operator) external;

    function removeOperator(address operator) external;

    function execute(address target, bytes calldata callData) external returns (bytes memory);
}
