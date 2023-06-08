// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IOperators } from '../interfaces/IOperators.sol';
import { Ownable } from '../Ownable.sol';

contract Operators is Ownable, IOperators {
    mapping(address => bool) public operators;

    constructor() Ownable() {}

    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator();
        _;
    }

    function isOperator(address account) external view returns (bool) {
        return operators[account];
    }

    function addOperator(address operator) external onlyOwner {
        if (operator == address(0)) revert InvalidOperator();
        if (operators[operator]) revert OperatorAlreadyAdded();

        operators[operator] = true;

        emit OperatorAdded(operator);
    }

    function removeOperator(address operator) external onlyOwner {
        if (operator == address(0)) revert InvalidOperator();
        if (!operators[operator]) revert OperatorAlreadyRemoved();

        operators[operator] = false;

        emit OperatorRemoved(operator);
    }

    function execute(address target, bytes calldata callData) external onlyOperator returns (bytes memory) {
        (bool success, bytes memory data) = target.call(callData);
        if (!success) {
            revert ExecutionFailed();
        }

        return data;
    }
}
