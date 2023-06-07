// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IOperators {
    error NotOperator();
    error InvalidOperator();
    error OperatorAlreadyAdded();
    error OperatorAlreadyRemoved();
    error ExecutionFailed();

    event OperatorAdded(address indexed newOperator);
    event OperatorRemoved(address indexed oldOperator);

    function isOperator(address operator) external view returns (bool);

    function addOperator(address newOperator) external;

    function removeOperator(address oldOperator) external;

    function execute(address target, bytes calldata callData) external;
}
