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

    function isOperator(address _operator) external view returns (bool) {
        return operators[_operator];
    }

    function addOperator(address _newOperator) external onlyOwner {
        if (_newOperator == address(0)) revert InvalidOperator();
        if (operators[_newOperator]) revert OperatorAlreadyAdded();

        operators[_newOperator] = true;

        emit OperatorAdded(_newOperator);
    }

    function removeOperator(address _oldOperator) external onlyOwner {
        if (_oldOperator == address(0)) revert InvalidOperator();
        if (!operators[_oldOperator]) revert OperatorAlreadyRemoved();

        operators[_oldOperator] = false;

        emit OperatorRemoved(_oldOperator);
    }

    function execute(address target, bytes calldata callData) external onlyOperator {
        (bool success, ) = target.call(callData);
        if (!success) {
            revert ExecutionFailed();
        }
    }
}
